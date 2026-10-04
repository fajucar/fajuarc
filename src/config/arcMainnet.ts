import { normalizeAddress } from '@/lib/assertAddress'
import { ARC_MAINNET_TOKENS } from './tokens.arc-mainnet'

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`

/** Accumulated config validation errors (non-fatal; app renders with placeholder addresses) */
export const configErrors: string[] = []

function mustAddr(label: string, v?: string): `0x${string}` {
  const r = normalizeAddress(label, v)
  if (r.ok) return r.value
  configErrors.push(`[${label}] ${r.value}`)
  return ZERO_ADDR
}

/**
 * Arc Mainnet (chainId 5042) — endereços oficiais on-chain (produção).
 * Token addresses from tokens.arc-mainnet (single source). Factory/Router hardcoded
 * (deployed + validated via real swaps on mainnet, 2026-09-22).
 *
 * CORE CONTRACTS (Arc Mainnet)
 * Factory: 0xA1cc4B2bE8CCC493413ffA20C5c00d3BC14a2501
 * Router:  0x277628683690c31932C2de5119a736cdfC90ac8A (standard UniswapV2Router02 —
 *          validated to handle the USDC precompile correctly in both directions,
 *          see scripts/test-router-swap.cjs / test-router-swap-reverse.cjs)
 * LiquidityHelper: NOT YET DEPLOYED on mainnet. MyPoolsPage's "add to existing
 *          position" flow depends on this custom contract (different ABI from
 *          the Router's own addLiquidity) — guarded at the call site until one
 *          exists. PoolsPage's add-liquidity flow uses the Router directly and
 *          is unaffected.
 */
const FACTORY = mustAddr('factory', '0xA1cc4B2bE8CCC493413ffA20C5c00d3BC14a2501')
const ROUTER = mustAddr('router', '0x277628683690c31932C2de5119a736cdfC90ac8A')
// Not deployed yet — intentionally left as ZERO_ADDR, guarded at each call site
// (MyPoolsPage, ArcDexTestPool). Deliberately NOT routed through mustAddr(): that
// would push it into the global `configErrors` list and trip ConfigErrorBanner
// on every page, which would misleadingly read as "your .env is broken" for a
// gap that's already known and handled gracefully.
const LIQUIDITY_HELPER = ZERO_ADDR
const USDC_ADDR = ARC_MAINNET_TOKENS.find((t) => t.symbol === 'USDC')!.address
const EURC_ADDR = ARC_MAINNET_TOKENS.find((t) => t.symbol === 'EURC')!.address
const FAJU_ADDR = ARC_MAINNET_TOKENS.find((t) => t.symbol === 'FAJU')!.address
const ARCX_ADDR = ARC_MAINNET_TOKENS.find((t) => t.symbol === 'ARCX')!.address
const CIRBTC_ADDR = ARC_MAINNET_TOKENS.find((t) => t.symbol === 'cirBTC')!.address

/** Pair address discovered via factory.getPair; use discovery in useAllPools */
const PAIR_PLACEHOLDER = ZERO_ADDR

export const ARC_MAINNET = {
  chainId: 5042,
  chainIdHex: '0x13B2' as const,
  rpc: 'https://rpc.mainnet.arc.io',
  rpcUrls: [
    'https://rpc.mainnet.arc.io',
  ],
  explorer: 'https://explorer.arc.io',
  explorerName: 'Arc Explorer',

  addresses: {
    factory: FACTORY,
    router: ROUTER,
    pair: PAIR_PLACEHOLDER,
    liquidityHelper: LIQUIDITY_HELPER,
    usdc: USDC_ADDR,
    eurc: EURC_ADDR,
    faju: FAJU_ADDR,
    arcx: ARCX_ADDR,
  },

  tokens: Object.fromEntries(ARC_MAINNET_TOKENS.map((t) => [t.symbol, { address: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals }])) as {
    USDC: { address: `0x${string}`; symbol: string; name: string; decimals: number }
    EURC: { address: `0x${string}`; symbol: string; name: string; decimals: number }
    FAJU: { address: `0x${string}`; symbol: string; name: string; decimals: number }
    ARCX: { address: `0x${string}`; symbol: string; name: string; decimals: number }
  },
} as const

/**
 * Token pairs to discover via factory.getPair — os 5 pares criados em
 * scripts/deploy-v2-dex.cjs na mainnet (ver PAIRS_TO_CREATE nesse script).
 */
export const ARC_MAINNET_PAIRS_TO_DISCOVER = [
  [USDC_ADDR, EURC_ADDR],
  [USDC_ADDR, FAJU_ADDR],
  [USDC_ADDR, ARCX_ADDR],
  [USDC_ADDR, CIRBTC_ADDR],
  [FAJU_ADDR, ARCX_ADDR],
] as const

export type ArcMainnetAddresses = typeof ARC_MAINNET.addresses
export type ArcMainnetTokens = typeof ARC_MAINNET.tokens
