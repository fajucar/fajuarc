import { normalizeAddress } from '@/lib/assertAddress'
import { ARC_TESTNET_TOKENS } from './tokens.arc-testnet'

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
 * Arc Testnet (chainId 5042002) — endereços oficiais on-chain (produção).
 * Token addresses from tokens.arc-testnet (single source). Factory/Router from env or hardcoded.
 *
 * CORE CONTRACTS (Arc Testnet) — UniswapV2 canônico, redeploy 2026-06-07
 * Factory: 0xDBB1b3D63864600877802614B047b38592B2453c
 * Router:  0xe3E5d1E48d9FC9D860E15cd51f39DD94c321d274
 * LiquidityHelper: 0x8bbC202A110771cc5c05ec53F29eCA23622452F6 (deprecated — não usado pelo Router V2)
 */
const env = typeof import.meta !== 'undefined' ? (import.meta as { env?: Record<string, string | undefined> }).env : undefined
const FACTORY = mustAddr('factory', env?.VITE_DEX_FACTORY_ADDRESS ?? '0xDBB1b3D63864600877802614B047b38592B2453c')
const ROUTER = mustAddr('router', env?.VITE_DEX_ROUTER_ADDRESS ?? '0xe3E5d1E48d9FC9D860E15cd51f39DD94c321d274')
const LIQUIDITY_HELPER = mustAddr('liquidityHelper', '0x8bbC202A110771cc5c05ec53F29eCA23622452F6')
const USDC_ADDR = ARC_TESTNET_TOKENS.find((t) => t.symbol === 'USDC')!.address
const EURC_ADDR = ARC_TESTNET_TOKENS.find((t) => t.symbol === 'EURC')!.address
const FAJU_ADDR = ARC_TESTNET_TOKENS.find((t) => t.symbol === 'FAJU')!.address
const ARCX_ADDR = ARC_TESTNET_TOKENS.find((t) => t.symbol === 'ARCX')!.address
const CIRBTC_ADDR = ARC_TESTNET_TOKENS.find((t) => t.symbol === 'cirBTC')!.address

/** Pair address discovered via factory.getPair; use discovery in useAllPools */
const PAIR_PLACEHOLDER = ZERO_ADDR

export const ARC_TESTNET = {
  chainId: 5042002,
  chainIdHex: '0x4CEF52' as const,
  rpc: 'https://rpc.testnet.arc.network',
  rpcUrls: [
    'https://rpc.testnet.arc.network',
    'https://rpc.blockdaemon.testnet.arc.network',
    'https://rpc.drpc.testnet.arc.network',
    'https://rpc.quicknode.testnet.arc.network',
  ],
  explorer: 'https://testnet.arcscan.app',
  explorerName: 'ArcScan',

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

  tokens: Object.fromEntries(ARC_TESTNET_TOKENS.map((t) => [t.symbol, { address: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals }])) as {
    USDC: { address: `0x${string}`; symbol: string; name: string; decimals: number }
    EURC: { address: `0x${string}`; symbol: string; name: string; decimals: number }
    FAJU: { address: `0x${string}`; symbol: string; name: string; decimals: number }
    ARCX: { address: `0x${string}`; symbol: string; name: string; decimals: number }
  },
} as const

/**
 * Token pairs to discover via factory.getPair — espelha os pares criados no
 * redeploy 2026-06-07 (scripts/deploy-v2-dex.cjs / deployments.arc-testnet.json#pairs)
 * mais pares criados posteriormente (ex.: FAJU/EURC).
 */
export const ARC_PAIRS_TO_DISCOVER = [
  [USDC_ADDR, EURC_ADDR],
  [USDC_ADDR, FAJU_ADDR],
  [USDC_ADDR, ARCX_ADDR],
  [USDC_ADDR, CIRBTC_ADDR],
  [FAJU_ADDR, ARCX_ADDR],
  [FAJU_ADDR, EURC_ADDR],
] as const

export type ArcTestnetAddresses = typeof ARC_TESTNET.addresses
export type ArcTestnetTokens = typeof ARC_TESTNET.tokens
