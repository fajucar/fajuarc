/**
 * V3 SDK wrapper — all tick/liquidity/price math goes through @uniswap/v3-sdk
 * (Pool + Position) instead of hand-rolled Q96 math. Arc Testnet isn't in
 * Uniswap's chain registry, but Token/Pool/Position only use chainId for
 * token-equality bookkeeping — no registry lookup happens, so this works
 * against any EVM chain.
 */
import { Token } from '@uniswap/sdk-core'
import {
  Pool,
  Position,
  FeeAmount,
  TICK_SPACINGS,
  TickMath,
  nearestUsableTick,
  tickToPrice,
} from '@uniswap/v3-sdk'

export { FeeAmount, TICK_SPACINGS }

export function makeToken(
  chainId: number,
  address: string,
  decimals: number,
  symbol?: string,
  name?: string
): Token {
  // bypassChecksum=true — Arc Testnet token addresses aren't guaranteed EIP-55 checksummed
  return new Token(chainId, address, decimals, symbol, name, true)
}

export function buildPool(
  token0: Token,
  token1: Token,
  fee: number,
  sqrtPriceX96: bigint,
  liquidity: bigint,
  tick: number
): Pool {
  return new Pool(token0, token1, fee as FeeAmount, sqrtPriceX96.toString(), liquidity.toString(), tick)
}

export function tickSpacingFor(fee: number): number {
  return TICK_SPACINGS[fee as FeeAmount] ?? 60
}

export function fullRangeTicks(fee: number): { tickLower: number; tickUpper: number } {
  const spacing = tickSpacingFor(fee)
  return {
    tickLower: nearestUsableTick(TickMath.MIN_TICK, spacing),
    tickUpper: nearestUsableTick(TickMath.MAX_TICK, spacing),
  }
}

/**
 * Closest usable tick for a decimal-adjusted price (token1 per token0 — same convention as
 * pool.token0Price / tickToPrice), typed by a user into a manual min/max price input. Plain log
 * math instead of routing the human-typed decimal through sdk-core's Price/Fraction, which would
 * hit the same JSBI dual-package hazard as partialLiquidity above. Clamped to the valid tick
 * range first so an extreme manual price can't throw inside nearestUsableTick.
 */
export function priceToUsableTick(
  price: number,
  decimals0: number,
  decimals1: number,
  tickSpacing: number
): number {
  const rawPrice = price * 10 ** (decimals1 - decimals0)
  const rawTick = Math.round(Math.log(rawPrice) / Math.log(1.0001))
  const minTick = nearestUsableTick(TickMath.MIN_TICK, tickSpacing)
  const maxTick = nearestUsableTick(TickMath.MAX_TICK, tickSpacing)
  const clamped = Math.min(Math.max(rawTick, TickMath.MIN_TICK), TickMath.MAX_TICK)
  return Math.min(Math.max(nearestUsableTick(clamped, tickSpacing), minTick), maxTick)
}

/** Real, decimal-adjusted token0/token1 amounts held by a position at the pool's current price. */
export function positionAmounts(
  pool: Pool,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint
): { amount0: bigint; amount1: bigint; amount0Exact: string; amount1Exact: string } {
  if (liquidity <= 0n) return { amount0: 0n, amount1: 0n, amount0Exact: '0', amount1Exact: '0' }
  const position = new Position({ pool, tickLower, tickUpper, liquidity: liquidity.toString() })
  return {
    amount0: BigInt(position.amount0.quotient.toString()),
    amount1: BigInt(position.amount1.quotient.toString()),
    amount0Exact: position.amount0.toExact(),
    amount1Exact: position.amount1.toExact(),
  }
}

/** Given a desired amount0, derive the paired amount1 for a position in [tickLower, tickUpper]. Handles single-sided ranges automatically. */
export function pairedAmountFromAmount0(
  pool: Pool,
  tickLower: number,
  tickUpper: number,
  amount0Raw: bigint
): { amount1: bigint; amount1Exact: string } {
  const position = Position.fromAmount0({ pool, tickLower, tickUpper, amount0: amount0Raw.toString(), useFullPrecision: true })
  return { amount1: BigInt(position.amount1.quotient.toString()), amount1Exact: position.amount1.toExact() }
}

/** Given a desired amount1, derive the paired amount0 for a position in [tickLower, tickUpper]. Handles single-sided ranges automatically. */
export function pairedAmountFromAmount1(
  pool: Pool,
  tickLower: number,
  tickUpper: number,
  amount1Raw: bigint
): { amount0: bigint; amount0Exact: string } {
  const position = Position.fromAmount1({ pool, tickLower, tickUpper, amount1: amount1Raw.toString() })
  return { amount0: BigInt(position.amount0.quotient.toString()), amount0Exact: position.amount0.toExact() }
}

/**
 * Liquidity to remove for a given percentage of a position. Plain BigInt math, deliberately NOT
 * routed through the SDK's Percent.multiply(): @uniswap/v3-sdk and @uniswap/sdk-core each bundle
 * their own separate copy of `jsbi` (a dual-package hazard — check with
 * `find node_modules -name jsbi`), so a JSBI value produced by v3-sdk's Position class fails
 * sdk-core's `instanceof JSBI` check inside Percent/Fraction and throws "Could not parse
 * fraction". Integer percentage-of-a-bigint needs no SDK help anyway.
 */
export function partialLiquidity(liquidity: bigint, percent: number): bigint {
  return (liquidity * BigInt(Math.round(percent))) / 100n
}

/** Pool mid price, decimal-adjusted for each token's real decimals(). */
export function poolPriceLabels(pool: Pool, sig = 6): { token1PerToken0: string; token0PerToken1: string } {
  return {
    token1PerToken0: pool.token0Price.toSignificant(sig),
    token0PerToken1: pool.token1Price.toSignificant(sig),
  }
}

/** Price (token1 per token0) at an arbitrary tick — decimal-adjusted, replaces raw 1.0001^tick display. */
export function tickPriceLabel(token0: Token, token1: Token, tick: number, sig = 6): string {
  try {
    return tickToPrice(token0, token1, tick).toSignificant(sig)
  } catch {
    return '0'
  }
}
