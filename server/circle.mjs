/**
 * Circle Developer Controlled Wallets helper
 * Handles contract execution + transaction polling for Google login users
 */

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
import { randomUUID } from 'node:crypto'
import { findUserById, setWallet, createWalletIfAbsent } from './walletsDb.mjs'
import { getCircleCredentials, CIRCLE_BLOCKCHAIN, ARC_NETWORK } from './network.mjs'

// ── Lazy Circle client — created on first use ─────────────────────────────────
// Credentials come from network.mjs, which picks the *_MAINNET / *_TESTNET
// set for ARC_NETWORK and rejects a key whose prefix doesn't match.
let _circleClient = null

export function getCircleClient() {
  if (_circleClient) return _circleClient

  const { apiKey, entitySecret } = getCircleCredentials()

  console.log(`[Circle] Initializing client (${ARC_NETWORK}), key prefix:`, apiKey.split(':')[0])

  _circleClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
  return _circleClient
}

/**
 * Get (or lazily create) a Circle Developer Controlled Wallet for a stable
 * user identity — a Privy user id (e.g. "did:privy:..." or "google:...")
 * or any other stable key, NOT an on-chain address. Circle generates its
 * own address; you can't retroactively attach Circle custody to an
 * already-existing externally-signed address (e.g. a Privy embedded
 * wallet).
 *
 * Moved here (from index.mjs) so any server module — the /api/wallet/*
 * routes, the payment scheduler's lazy-provisioning path in agent.mjs —
 * can reuse it without duplicating the createWallets() call.
 */
export async function getOrCreateWallet(userId, email = '') {
  const existing = await findUserById(userId)
  if (existing) {
    const { userId: _key, ...entry } = existing
    if (email && !entry.email) { entry.email = email; await setWallet(userId, entry) }
    return entry
  }

  const { walletSetId } = getCircleCredentials()

  console.log('[Circle] Creating wallet for', userId.slice(0, 12) + '...')
  const response = await getCircleClient().createWallets({
    idempotencyKey: randomUUID(),
    blockchains:    [CIRCLE_BLOCKCHAIN],
    count:          1,
    walletSetId,
  })

  const wallet = response.data?.wallets?.[0]
  if (!wallet?.address) throw new Error('Circle did not return an address')

  const entry = {
    address:   wallet.address,
    walletId:  wallet.id,
    email:     email || undefined,
    createdAt: new Date().toISOString(),
  }

  // Atomic: if a concurrent request already stored a wallet for this userId,
  // keep that one (the wallet created here is left unused in Circle) so the
  // user never ends up mapped to two different Circle wallets.
  if (!(await createWalletIfAbsent(userId, entry))) {
    console.warn('[Circle] Concurrent wallet creation for', userId.slice(0, 12) + '...', '— keeping the stored one, discarding', wallet.address)
    const { userId: _key, ...stored } = await findUserById(userId)
    return stored
  }

  console.log('[Circle] ✅ Wallet created:', wallet.address)
  return entry
}

/**
 * Read a wallet's USDC balance (as a Number) from Circle.
 * Returns null if the balance can't be determined (network/API error) so
 * callers can degrade gracefully instead of blocking. Never throws.
 *
 * Additive helper used by the schedule-time funding check in agent.mjs —
 * does not touch the scheduler's execution path.
 */
export async function getWalletUsdcBalance(walletId) {
  if (!walletId) return null
  try {
    const res = await getCircleClient().listWalletBalance({ id: walletId })
    const balances = res?.data?.tokenBalances ?? []
    const usdc = balances.find(b => {
      const sym = (b?.token?.symbol ?? '').toUpperCase()
      return sym === 'USDC' || sym === 'USD'
    })
    if (!usdc) return 0
    const amount = Number(usdc.amount)
    return Number.isFinite(amount) ? amount : null
  } catch (err) {
    console.warn('[Circle] getWalletUsdcBalance error:', err?.message ?? err)
    return null
  }
}

// Keep backward-compat export (resolves lazily)
export const circleClient = new Proxy({}, {
  get(_t, prop) {
    const client = getCircleClient()
    const value = client[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const TERMINAL_STATES  = new Set(['COMPLETE', 'CONFIRMED', 'FAILED', 'CANCELLED', 'DENIED'])
const SUCCESS_STATES   = new Set(['COMPLETE', 'CONFIRMED'])
const MAX_POLL_SECONDS = 120
const POLL_INTERVAL_MS = 3000

/**
 * Poll a Circle transaction until it reaches a terminal state.
 * Returns the on-chain txHash on success.
 */
export async function waitForTransaction(transactionId) {
  const maxTries = Math.ceil((MAX_POLL_SECONDS * 1000) / POLL_INTERVAL_MS)

  for (let i = 0; i < maxTries; i++) {
    await sleep(POLL_INTERVAL_MS)

    let tx
    try {
      const res = await circleClient.getTransaction({ id: transactionId })
      tx = res.data?.transaction
    } catch (pollErr) {
      console.warn(`[Circle] poll error (attempt ${i + 1}):`, pollErr.message)
      continue
    }

    const state = tx?.state ?? tx?.status
    console.log(`[Circle] tx ${transactionId} state: ${state}`)

    if (SUCCESS_STATES.has(state)) {
      const hash = tx.txHash ?? tx.transactionHash
      if (!hash) throw new Error(`Circle: tx COMPLETE but txHash missing. Response: ${JSON.stringify(tx)}`)
      return hash
    }

    if (TERMINAL_STATES.has(state)) {
      throw new Error(`Circle: transaction ${state}. Details: ${JSON.stringify(tx)}`)
    }
  }

  throw new Error(`Circle: transaction ${transactionId} timed out after ${MAX_POLL_SECONDS}s`)
}

/**
 * Execute a smart contract function via Circle developer-controlled wallet.
 * Handles the createContractExecutionTransaction + polling.
 *
 * @param {object} opts
 * @param {string} opts.walletId          – Circle wallet ID (not address)
 * @param {string} opts.contractAddress   – On-chain contract address
 * @param {string} opts.functionSignature – e.g. "claim(address)"
 * @param {string[]} opts.parameters      – ABI-encoded parameter values as strings
 * @returns {Promise<string>}             – on-chain txHash
 */
export async function executeContractCall({ walletId, contractAddress, functionSignature, parameters = [] }) {
  // ── Debug: verify walletId is Circle internal ID (not 0x address) ──────────
  console.log(`[Circle] executeContractCall`)
  console.log(`  walletId:  ${walletId}`)
  console.log(`  walletId is address? ${String(walletId).startsWith('0x')} (should be FALSE — must be Circle internal ID)`)
  console.log(`  contract:  ${contractAddress}`)
  console.log(`  fn:        ${functionSignature}`)
  console.log(`  params:    ${JSON.stringify(parameters)}`)

  if (!walletId || String(walletId).startsWith('0x')) {
    throw new Error(
      `walletId inválido: "${walletId}". Deve ser o ID interno do Circle (ex: "abc123-..."), não o endereço 0x. ` +
      `Verifique se o walletId está sendo salvo corretamente no banco.`
    )
  }

  let response
  try {
    // ── Exact debug logging as requested ─────────────────────────────────────
    console.log('walletId:', walletId)

    try {
      const balance = await circleClient.getWalletTokenBalance({ id: walletId })
      console.log('Wallet balance:', JSON.stringify(balance.data, null, 2))
    } catch (balErr) {
      console.log('Wallet balance fetch error:', balErr.message)
    }

    console.log('Contract:', contractAddress)
    console.log('Function:', functionSignature)
    console.log('Parameters:', JSON.stringify(parameters))
    // ─────────────────────────────────────────────────────────────────────────

    // fee field is REQUIRED — SDK reads fee.config internally and throws
    // "Cannot read properties of undefined (reading 'config')" when omitted.
    response = await circleClient.createContractExecutionTransaction({
      idempotencyKey:       randomUUID(),
      walletId,
      blockchain:           CIRCLE_BLOCKCHAIN,
      contractAddress,
      abiFunctionSignature: functionSignature,
      abiParameters:        parameters.map(String),
      fee: {
        type:   'level',
        config: { feeLevel: 'LOW' },
      },
    })
  } catch (err) {
    const msg = err?.response?.data?.message ?? err?.message ?? String(err)
    console.error('[Circle] createContractExecutionTransaction failed:', msg)
    // Log full response for debugging
    if (err?.response?.data) {
      console.error('[Circle] full error response:', JSON.stringify(err.response.data))
    }
    throw new Error(`Circle API error: ${msg}`)
  }

  console.log('[Circle] createContractExecution response:', JSON.stringify(response?.data ?? response))

  // Circle returns either a transactionId or the tx object directly
  const transactionId =
    response?.data?.transaction?.id ??
    response?.data?.id ??
    response?.data?.transactionId

  if (!transactionId) {
    throw new Error(`Circle did not return a transactionId. Response: ${JSON.stringify(response?.data)}`)
  }

  console.log(`[Circle] polling tx ${transactionId}...`)
  return waitForTransaction(transactionId)
}
