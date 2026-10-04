/**
 * ArcDEX config — derivado de arcMainnet.ts (fonte única de verdade).
 * Swap: approve → Router. Add Liquidity: approve → Router (PoolsPage) ou
 * liquidityHelper (MyPoolsPage — ver nota em arcMainnet.ts, não deployado ainda).
 */

import { ARC_MAINNET, ARC_MAINNET_PAIRS_TO_DISCOVER } from './arcMainnet'

export const ARCDEX = {
  chainId: ARC_MAINNET.chainId,
  factory: ARC_MAINNET.addresses.factory,
  router: ARC_MAINNET.addresses.router,
  pair: ARC_MAINNET.addresses.pair,
  liquidityHelper: ARC_MAINNET.addresses.liquidityHelper,
  usdc: ARC_MAINNET.addresses.usdc,
  eurc: ARC_MAINNET.addresses.eurc,
  faju: ARC_MAINNET.addresses.faju,
  arcx: ARC_MAINNET.addresses.arcx,
  decimals: {
    USDC: ARC_MAINNET.tokens.USDC.decimals,
    EURC: ARC_MAINNET.tokens.EURC.decimals,
    FAJU: ARC_MAINNET.tokens.FAJU.decimals,
    ARCX: ARC_MAINNET.tokens.ARCX.decimals,
  },
  explorer: ARC_MAINNET.explorer,
  explorerName: ARC_MAINNET.explorerName,
  tokens: ARC_MAINNET.tokens,
  pairsToDiscover: ARC_MAINNET_PAIRS_TO_DISCOVER,
} as const
