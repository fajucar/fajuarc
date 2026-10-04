/**
 * Direct EOA signer for scheduled payments (viem), used as the
 * AUTOMATION_SIGNER=viem fallback while Circle's own indexing gap on
 * ARC-TESTNET is unresolved (see server/scripts/diagnose-circle.mjs —
 * Circle's getWalletTokenBalance returns empty tokenBalances even with
 * includeAll: true, despite a confirmed on-chain balance).
 *
 * IMPORTANT — this is a single shared automation wallet, not one per user
 * like the Circle path. Every scheduled payment executed via this signer
 * is sent FROM the address derived from the automation key, regardless
 * of which Circle-managed wallet is recorded on the payment (payment.walletAddress
 * still tracks "who owns this schedule" for listing/cancelling — it does not
 * mean that address holds the funds when AUTOMATION_SIGNER=viem). Fund the
 * ONE address logged at boot, not each user's individual Circle wallet.
 *
 * SECURITY: the key is read from AUTOMATION_PRIVATE_KEY_MAINNET or
 * AUTOMATION_PRIVATE_KEY_TESTNET (per ARC_NETWORK, see network.mjs) — use a
 * dedicated EOA per network. On mainnet this key controls real funds: keep
 * only what scheduled payments need in it. The raw key is never logged, not
 * even partially, anywhere in this file.
 */

import { createWalletClient, http, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getPublicClient, getUsdcDecimals, arcChain, RPC_URL } from './onchain.mjs'
import { getNetworkEnv, networkEnvName } from './network.mjs'
import { USDC } from './tokens.mjs'

const KEY_VAR = networkEnvName('AUTOMATION_PRIVATE_KEY')

function normalizePrivateKey(raw) {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  const withPrefix = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`
  // 0x + 64 hex chars = 32-byte private key. Reject anything else with a
  // clear message rather than letting viem throw an opaque internal error.
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) return undefined // undefined = "present but malformed", distinct from null = "absent"
  return withPrefix
}

export function isAutomationSignerConfigured() {
  // normalizePrivateKey returns: null (absent) | undefined (malformed) | string (valid)
  return typeof normalizePrivateKey(getNetworkEnv('AUTOMATION_PRIVATE_KEY')) === 'string'
}

/** Human-readable reason the signer isn't ready, or null if it is. Never includes the key itself. */
export function automationSignerStatus() {
  const raw = getNetworkEnv('AUTOMATION_PRIVATE_KEY')
  if (!raw) return `${KEY_VAR} is empty in .env`
  const normalized = normalizePrivateKey(raw)
  if (normalized === undefined) return `${KEY_VAR} is set but not a valid 32-byte hex private key (expected 0x + 64 hex chars)`
  return null
}

let _account = null
function getAccount() {
  if (_account) return _account
  const key = normalizePrivateKey(getNetworkEnv('AUTOMATION_PRIVATE_KEY'))
  if (!key) {
    throw new Error(`Automation signer (viem) not configured: ${automationSignerStatus()}`)
  }
  _account = privateKeyToAccount(key)
  return _account
}

/** The automation EOA's public address — safe to log, this is not secret. */
export function getAutomationSignerAddress() {
  return getAccount().address
}

let _walletClient = null
function getWalletClient() {
  if (!_walletClient) {
    _walletClient = createWalletClient({
      account:   getAccount(),
      chain:     arcChain,
      transport: http(RPC_URL),
    })
  }
  return _walletClient
}

const USDC_TRANSFER_ABI = [
  {
    name:            'transfer',
    type:            'function',
    stateMutability: 'nonpayable',
    inputs:          [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs:         [{ name: '', type: 'bool' }],
  },
]

/**
 * Send USDC from the automation EOA to `toAddress`.
 * @param {string} toAddress   - recipient 0x address
 * @param {string} amountHuman - human-readable amount, e.g. "1.5"
 * @returns {Promise<{ txHash: string, status: 'success' | 'reverted' }>}
 */
export async function sendUsdc(toAddress, amountHuman) {
  const decimals  = await getUsdcDecimals() // server/onchain.mjs — on-chain source of truth, never hardcoded
  const amountWei = parseUnits(amountHuman, decimals)

  const walletClient = getWalletClient()
  const txHash = await walletClient.writeContract({
    address:      USDC.address,
    abi:          USDC_TRANSFER_ABI,
    functionName: 'transfer',
    args:         [toAddress, amountWei],
  })

  const receipt = await getPublicClient().waitForTransactionReceipt({ hash: txHash })
  return { txHash, status: receipt.status }
}
