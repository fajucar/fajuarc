/**
 * Privy session-signer for scheduled payments.
 *
 * Unlike signer-viem.mjs (a single shared bot EOA) and the Circle path (a
 * per-user Circle-managed wallet), THIS signer sends the scheduled payment
 * FROM THE USER'S OWN Privy embedded wallet. The user grants consent once,
 * in the browser, when they create their first schedule (frontend calls
 * addSigners with our key quorum). After that, the backend can sign
 * transactions from that wallet headlessly — even while the user is offline
 * — by authenticating API requests with our authorization key.
 *
 * Docs:
 *   - https://docs.privy.io/wallets/using-wallets/signers/quickstart
 *   - https://docs.privy.io/recipes/send-usdc
 *
 * SECURITY: PRIVY_AUTHORIZATION_KEY is the private key that lets the backend
 * act on delegated wallets. Treat it like any other secret — never log it,
 * keep it in .env only. A Privy policy (configured in the dashboard) should
 * scope what this key is allowed to do (e.g. USDC transfers under a cap).
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeFunctionData } from 'viem'
import { PrivyClient } from '@privy-io/node'
import { USDC } from './tokens.mjs'
import { getUsdcDecimals } from './onchain.mjs'
import { ARC_CHAIN_ID } from './network.mjs'

// ── Self-contained .env load (same pattern as circle.mjs / signer-viem.mjs) ──
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

// ── Config readiness ─────────────────────────────────────────────────────────
export function isPrivySignerConfigured() {
  return Boolean(getEnv('PRIVY_APP_ID') && getEnv('PRIVY_APP_SECRET') && getEnv('PRIVY_AUTHORIZATION_KEY'))
}

/** Human-readable reason the signer isn't ready, or null if it is. Never includes secrets. */
export function privySignerStatus() {
  if (!getEnv('PRIVY_APP_ID'))            return 'PRIVY_APP_ID is empty in .env'
  if (!getEnv('PRIVY_APP_SECRET'))        return 'PRIVY_APP_SECRET is empty in .env'
  if (!getEnv('PRIVY_AUTHORIZATION_KEY')) return 'PRIVY_AUTHORIZATION_KEY is empty in .env'
  return null
}

// ── Lazy Privy client ─────────────────────────────────────────────────────────
let _privy = null
function getPrivy() {
  if (_privy) return _privy
  const appId     = getEnv('PRIVY_APP_ID')
  const appSecret = getEnv('PRIVY_APP_SECRET')
  if (!appId || !appSecret) {
    throw new Error(`Privy signer not configured: ${privySignerStatus()}`)
  }
  _privy = new PrivyClient({ appId, appSecret })
  return _privy
}

/**
 * Send USDC FROM a user's Privy embedded wallet TO `toAddress`.
 *
 * @param {object} opts
 * @param {string} opts.fromAddress - the user's Privy wallet address (0x...)
 * @param {string} opts.toAddress   - recipient (0x...)
 * @param {string} opts.amountHuman - human amount, e.g. "5" or "1.5"
 * @returns {Promise<{ txHash: string }>}
 *
 * Requires the user to have previously added our key quorum as a signer on
 * this wallet (frontend addSigners). The authorization key authenticates the
 * request; Privy verifies it against the quorum's registered public key.
 */
// Resolve a Privy walletId from an on-chain address. The Node SDK's
// ethereumService.sendTransaction is keyed by walletId (Privy's internal id),
// not the 0x address, so we look it up first.
async function resolveWalletId(privy, address) {
  const res = await privy.walletsService._client.wallets.getWalletByAddress({ address })
  const id = res?.id ?? res?.data?.id
  if (!id) throw new Error(`Could not resolve Privy walletId for address ${address}: ${JSON.stringify(res)}`)
  return id
}

export async function sendUsdcFromUserWallet({ fromAddress, toAddress, amountHuman }) {
  const privy = getPrivy()
  const authorizationKey = getEnv('PRIVY_AUTHORIZATION_KEY')

  const decimals = await getUsdcDecimals()
  const value = BigInt(Math.round(Number(amountHuman) * 10 ** Number(decimals)))

  const data = encodeFunctionData({
    abi: [{
      name: 'transfer', type: 'function', stateMutability: 'nonpayable',
      inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
      outputs: [{ name: '', type: 'bool' }],
    }],
    functionName: 'transfer',
    args: [toAddress, value],
  })

  const walletId = await resolveWalletId(privy, fromAddress)

  // ethereumService.sendTransaction(walletId, input). The input carries the
  // unsigned tx under params.transaction (snake_case fields), plus the
  // authorization_context with our delegated-signing key. caip2 identifies
  // the chain (Arc Testnet).
  const result = await privy.walletsService.ethereumService.sendTransaction(walletId, {
    caip2: `eip155:${ARC_CHAIN_ID}`,
    params: {
      transaction: {
        to: USDC.address,
        data,
        value: '0x0',
        chain_id: ARC_CHAIN_ID,
      },
    },
    authorization_context: { authorization_private_keys: [authorizationKey] },
  })

  const txHash = result?.data?.hash ?? result?.hash ?? result?.transaction_hash
  if (!txHash) {
    throw new Error(`Privy sendTransaction returned no hash: ${JSON.stringify(result)}`)
  }
  return { txHash }
}
