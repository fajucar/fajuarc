/**
 * V3 types — Position (NFT), Pool (feeTier), ticks, range
 * Placeholder for concentrated liquidity implementation.
 */

export type FeeTier = 500 | 3000 | 10000 // 0.05%, 0.3%, 1%

export interface V3Pool {
  address: string
  token0: string
  token1: string
  fee: FeeTier
  sqrtPriceX96: string
  tick: number
}

export interface V3Position {
  tokenId: string
  pool: V3Pool
  tickLower: number
  tickUpper: number
  liquidity: string
  amount0: string
  amount1: string
}
