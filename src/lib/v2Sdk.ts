/**
 * V2 SDK wrapper — @uniswap/v2-sdk Pair for reserve/price math instead of
 * hand-rolled float division. Arc Testnet's DEX (ArcDEX) is a Uniswap V2 fork
 * with its own Factory/Router, so we always resolve pair addresses on-chain via
 * factory.getPair() — Pair.getAddress()'s CREATE2 derivation assumes the real
 * Uniswap factory init code hash and would not match ArcDEX's deployment.
 */
import { Token, CurrencyAmount } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'

export function makeV2Token(
  chainId: number,
  address: string,
  decimals: number,
  symbol?: string,
  name?: string
): Token {
  return new Token(chainId, address, decimals, symbol, name, true)
}

/** Builds a Pair purely from known reserves — does not depend on Pair.getAddress(). */
export function buildPair(token0: Token, token1: Token, reserve0: bigint, reserve1: bigint): Pair {
  return new Pair(
    CurrencyAmount.fromRawAmount(token0, reserve0.toString()),
    CurrencyAmount.fromRawAmount(token1, reserve1.toString())
  )
}

/** Decimal-exact reserve strings (no float precision loss), in the pair's own token0/token1 order. */
export function pairReservesExact(pair: Pair): { reserve0: string; reserve1: string } {
  return { reserve0: pair.reserve0.toExact(), reserve1: pair.reserve1.toExact() }
}
