/**
 * Shared Arc RPC helpers (viem) — the source of truth for USDC
 * decimals and balances, since Circle's own indexer has been shown to
 * disagree with on-chain state for this token (see
 * server/scripts/diagnose-circle.mjs). Used by the scheduler's pre-send
 * balance check and by the diagnostic script, so neither hardcodes decimals
 * or duplicates the RPC client setup.
 */

import { createPublicClient, http } from 'viem'
import { USDC } from './tokens.mjs'
import { arcChain, ARC_RPC_URL } from './network.mjs'

// Chain + RPC come from network.mjs (selected by ARC_NETWORK). Re-exported so
// other modules that need their own viem client on this chain (e.g.
// signer-viem.mjs, which needs a WalletClient, not just this PublicClient)
// reuse the exact same chain definition instead of re-declaring their own.
export { arcChain }
export const RPC_URL = ARC_RPC_URL

const ERC20_ABI = [
  { name: 'decimals',  type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
]

let _publicClient = null
export function getPublicClient() {
  if (!_publicClient) _publicClient = createPublicClient({ chain: arcChain, transport: http(RPC_URL) })
  return _publicClient
}

// decimals() never changes for a deployed contract — safe to cache for the
// life of the process instead of round-tripping the RPC on every call.
let _cachedUsdcDecimals = null
export async function getUsdcDecimals() {
  if (_cachedUsdcDecimals != null) return _cachedUsdcDecimals
  _cachedUsdcDecimals = await getPublicClient().readContract({
    address:      USDC.address,
    abi:          ERC20_ABI,
    functionName: 'decimals',
  })
  return _cachedUsdcDecimals
}

export async function getUsdcBalance(address) {
  return getPublicClient().readContract({
    address:      USDC.address,
    abi:          ERC20_ABI,
    functionName: 'balanceOf',
    args:         [address],
  })
}

// Native USDC balance (18 decimals). On Arc, USDC is the native gas token,
// so gas is debited from THIS balance — not from the 6-decimal ERC-20 view.
// The ERC-20 balanceOf above and this native balance are two views (6 vs 18
// decimals) of the same underlying balance; a "can I afford value + gas"
// check must be done here, in native 18-decimal units, or gas gets ignored.
export async function getNativeBalance(address) {
  return getPublicClient().getBalance({ address })
}

const USDC_TRANSFER_ABI = [
  {
    name: 'transfer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
]

/**
 * Estimate the gas cost (in native 18-decimal wei) of a USDC ERC-20 transfer
 * FROM `from` TO `to` of `amountWei` (6-decimal raw amount). Returns the cost
 * with a safety multiplier applied, so the caller can require
 * balance >= amountNative + gasCost without the tx reverting for gas it
 * couldn't cover — the exact failure mode we hit on Arc, where value and gas
 * share one balance. Returns null if estimation fails (caller decides).
 */
export async function estimateUsdcTransferGasCost({ from, to, amountWei }) {
  try {
    const client = getPublicClient()
    const [gas, gasPrice] = await Promise.all([
      client.estimateContractGas({
        address:      USDC.address,
        abi:          USDC_TRANSFER_ABI,
        functionName: 'transfer',
        args:         [to, amountWei],
        account:      from,
      }),
      client.getGasPrice(),
    ])
    // 50% headroom over the point estimate — gas price on Arc can drift
    // between the estimate and inclusion, and a slightly-too-high reserve
    // only defers a tiny amount, while too-low reverts the whole payment.
    return (gas * gasPrice * 15n) / 10n
  } catch (err) {
    console.warn('[onchain] estimateUsdcTransferGasCost failed:', err?.message ?? err)
    return null
  }
}
