/**
 * Network selection — the single source of truth for which Arc network the
 * backend talks to (RPC, chainId, Circle blockchain code, Circle credentials,
 * and which Redis database/key namespace is used).
 *
 * ARC_NETWORK is REQUIRED ('mainnet' | 'testnet') and has no default: the
 * network must be an explicit decision, never an accident of a missing var.
 *
 * Every per-environment secret is read ONLY from its suffixed name
 * (CIRCLE_API_KEY_MAINNET / CIRCLE_API_KEY_TESTNET, etc.). There is no
 * fallback to the unsuffixed legacy names and no fallback across networks —
 * a missing mainnet var fails loudly instead of silently using a test key.
 *
 * The Circle API key is also checked against its environment prefix
 * (LIVE_API_KEY: for mainnet, TEST_API_KEY: for testnet), so a value pasted
 * into the wrong variable is caught at startup.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Redis } from '@upstash/redis'

// ── Self-contained .env load (same pattern as circle.mjs / signer-*.mjs) ─────
const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = resolve(__dir, '..')

function loadEnvFile() {
  const file = resolve(ROOT, '.env')
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf-8').split('\n')
      .map(l => l.match(/^([^#=\s]+)\s*=\s*(.*)$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.trim()])
  )
}

const _envFile = loadEnvFile()
const getEnv = (key) => (process.env[key] || _envFile[key] || '').trim()

// ── Network definitions ───────────────────────────────────────────────────────
const NETWORKS = {
  mainnet: {
    chainId:          5042,
    chainName:        'Arc Mainnet',
    rpcUrl:           'https://rpc.mainnet.arc.io',
    circleBlockchain: 'ARC',
    circleKeyPrefix:  'LIVE_API_KEY:',
    envSuffix:        'MAINNET',
  },
  testnet: {
    chainId:          5042002,
    chainName:        'Arc Testnet',
    rpcUrl:           'https://rpc.testnet.arc.network',
    circleBlockchain: 'ARC-TESTNET',
    circleKeyPrefix:  'TEST_API_KEY:',
    envSuffix:        'TESTNET',
  },
}

const rawNetwork = getEnv('ARC_NETWORK').toLowerCase()
if (!NETWORKS[rawNetwork]) {
  throw new Error(
    `ARC_NETWORK must be set to "mainnet" or "testnet" (got ${rawNetwork ? `"${rawNetwork}"` : 'nothing'}). ` +
    'Refusing to start without an explicit network.'
  )
}

export const ARC_NETWORK       = rawNetwork
export const NETWORK           = NETWORKS[rawNetwork]
export const ARC_CHAIN_ID      = NETWORK.chainId
export const ARC_RPC_URL       = NETWORK.rpcUrl
export const CIRCLE_BLOCKCHAIN = NETWORK.circleBlockchain

/** viem chain definition for the active network. Native USDC uses 18 decimals. */
export const arcChain = {
  id:             NETWORK.chainId,
  name:           NETWORK.chainName,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls:        { default: { http: [NETWORK.rpcUrl] } },
}

/** Reads `${base}_MAINNET` or `${base}_TESTNET` for the active network — never the bare name. */
export function getNetworkEnv(base) {
  return getEnv(`${base}_${NETWORK.envSuffix}`)
}

/** Name of the suffixed variable for the active network (for error messages). */
export function networkEnvName(base) {
  return `${base}_${NETWORK.envSuffix}`
}

/**
 * Circle credentials for the active network, validated. Throws if any are
 * missing or if the API key's environment prefix doesn't match ARC_NETWORK.
 * Error messages name the variables but never include their values.
 */
export function getCircleCredentials() {
  const apiKey       = getNetworkEnv('CIRCLE_API_KEY')
  const entitySecret = getNetworkEnv('CIRCLE_ENTITY_SECRET')
  const walletSetId  = getNetworkEnv('CIRCLE_WALLET_SET_ID')

  const missing = [
    !apiKey       && networkEnvName('CIRCLE_API_KEY'),
    !entitySecret && networkEnvName('CIRCLE_ENTITY_SECRET'),
    !walletSetId  && networkEnvName('CIRCLE_WALLET_SET_ID'),
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(`Circle env vars missing for ARC_NETWORK=${ARC_NETWORK}: ${missing.join(', ')}`)
  }

  if (!apiKey.startsWith(NETWORK.circleKeyPrefix)) {
    throw new Error(
      `${networkEnvName('CIRCLE_API_KEY')} does not start with "${NETWORK.circleKeyPrefix}" — ` +
      `ARC_NETWORK=${ARC_NETWORK} requires a ${ARC_NETWORK === 'mainnet' ? 'LIVE' : 'TEST'} Circle key. ` +
      'Refusing to mix test and production credentials.'
    )
  }

  return { apiKey, entitySecret, walletSetId }
}

// ── Upstash Redis (persistent storage — Render Free has no persistent disk) ──
let _redis = null

/**
 * Redis client for the active network, from UPSTASH_REDIS_REST_URL_<NET> /
 * UPSTASH_REDIS_REST_TOKEN_<NET> (no fallback across networks). Both networks
 * may point at the same database: every key is also prefixed by network (see
 * redisKey), so their data never overlaps.
 *
 * automaticDeserialization is off: values are stored as JSON strings and
 * parsed explicitly by the callers, so what goes in is exactly what comes out.
 */
export function getRedis() {
  if (_redis) return _redis
  const url   = getNetworkEnv('UPSTASH_REDIS_REST_URL')
  const token = getNetworkEnv('UPSTASH_REDIS_REST_TOKEN')
  const missing = [
    !url   && networkEnvName('UPSTASH_REDIS_REST_URL'),
    !token && networkEnvName('UPSTASH_REDIS_REST_TOKEN'),
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(`Upstash Redis env vars missing for ARC_NETWORK=${ARC_NETWORK}: ${missing.join(', ')}`)
  }
  _redis = new Redis({ url, token, automaticDeserialization: false })
  return _redis
}

/** Network-namespaced Redis key, e.g. redisKey('wallets') → "fajuarc:mainnet:wallets" */
export function redisKey(name) {
  return `fajuarc:${ARC_NETWORK}:${name}`
}
