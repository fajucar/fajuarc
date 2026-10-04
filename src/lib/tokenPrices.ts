/**
 * tokenPrices — preços em USD por símbolo de token. Somente para EXIBIÇÃO.
 *
 * Fixos:    USDC=1, USYC=1, QCAD=0.73
 * Externos (a cada 60s, com fallback):
 *   EURC   → frankfurter.app (ECB, sem chave)
 *   cirBTC → Binance ticker BTCUSDT
 * Pool (a cada 60s): FAJU e ARCX não têm mercado externo — o preço vem da
 *   reserva do par com USDC na ArcDEX. Reserva de USDC abaixo de
 *   MIN_PRICING_LIQUIDITY_USDC (ou pool vazio) → sem preço: o símbolo fica
 *   ausente de `prices`, a UI mostra "No market price" e toUSD() conta 0, então
 *   o token não entra em Total Value/TVL. Com um pool quase vazio a razão entre
 *   as reservas é arbitrária (ex.: 0,05 USDC / 0,0013 FAJU ⇒ US$ 39/FAJU).
 *   Entre esse mínimo e LOW_LIQUIDITY_USDC o preço é mostrado com
 *   `lowLiquidity: true`. Nunca usar como oráculo para decisão financeira.
 */

import { useState, useEffect } from 'react'
import { formatUnits, parseAbi } from 'viem'
import { arcReadClient } from '@/lib/balances'
import { ARCDEX } from '@/config/arcDex'
import { ARC_MAINNET_TOKENS } from '@/config/tokens.arc-mainnet'

export type TokenPrices = Record<string, number>

export type PriceMeta = {
  source: 'fixed' | 'external' | 'pool'
  /** Pool-derived price backed by less than LOW_LIQUIDITY_USDC of USDC. */
  lowLiquidity?: boolean
}

export type TokenPriceData = {
  prices: TokenPrices
  meta: Record<string, PriceMeta>
}

/** USDC reserve below which no price is derived at all ("No market price"). */
export const MIN_PRICING_LIQUIDITY_USDC = 10

/** USDC reserve below which a pool-derived price is flagged as low-liquidity. */
export const LOW_LIQUIDITY_USDC = 1_000

/** Tokens without an external market — priced from their USDC pool on ArcDEX. */
const POOL_PRICED_SYMBOLS = ['FAJU', 'ARCX'] as const

const DEFAULTS: TokenPrices = {
  USDC:   1,
  USYC:   1,
  QCAD:   0.73,
  EURC:   1.08,    // fallback
  cirBTC: 107000,  // fallback
}

const DEFAULT_META: Record<string, PriceMeta> = {
  USDC:   { source: 'fixed' },
  USYC:   { source: 'fixed' },
  QCAD:   { source: 'fixed' },
  EURC:   { source: 'external' },
  cirBTC: { source: 'external' },
}

const CACHE_TTL = 60_000

// Cache no nível do módulo — compartilhado entre todas as instâncias do hook.
const _cache: TokenPriceData & { ts: number } = {
  prices: { ...DEFAULTS },
  meta: { ...DEFAULT_META },
  ts: 0,
}

const FACTORY_ABI = parseAbi(['function getPair(address, address) view returns (address)'])
const PAIR_ABI = parseAbi([
  'function getReserves() view returns (uint112, uint112, uint32)',
  'function token0() view returns (address)',
])
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/** USD price of `symbol` from its USDC pool, or null when the pool is empty or too shallow to price. */
async function fetchPoolPrice(symbol: string): Promise<{ price: number; lowLiquidity: boolean } | null> {
  const usdc  = ARC_MAINNET_TOKENS.find((t) => t.symbol === 'USDC')!
  const token = ARC_MAINNET_TOKENS.find((t) => t.symbol === symbol)
  if (!token) return null

  const pair = await arcReadClient.readContract({
    address: ARCDEX.factory, abi: FACTORY_ABI, functionName: 'getPair', args: [usdc.address, token.address],
  })
  if (pair === ZERO_ADDRESS) return null

  const [[reserve0, reserve1], token0] = await Promise.all([
    arcReadClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'getReserves' }),
    arcReadClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token0' }),
  ])
  const [usdcReserve, tokenReserve] =
    token0.toLowerCase() === usdc.address.toLowerCase() ? [reserve0, reserve1] : [reserve1, reserve0]
  if (usdcReserve === 0n || tokenReserve === 0n) return null

  // Raw reserves → human units with each token's own decimals (USDC 6, FAJU/ARCX 18).
  const usdcAmount  = Number(formatUnits(usdcReserve, usdc.decimals))
  const tokenAmount = Number(formatUnits(tokenReserve, token.decimals))
  if (usdcAmount < MIN_PRICING_LIQUIDITY_USDC) return null
  return { price: usdcAmount / tokenAmount, lowLiquidity: usdcAmount < LOW_LIQUIDITY_USDC }
}

async function _refreshPrices(): Promise<TokenPriceData> {
  const prices: TokenPrices = { ...DEFAULTS }
  const meta: Record<string, PriceMeta> = { ...DEFAULT_META }

  await Promise.allSettled([
    // EUR/USD — frankfurter.app (dados do BCE, CORS ok, sem API key)
    fetch('https://api.frankfurter.app/latest?from=EUR&to=USD')
      .then((r) => r.json())
      .then((data) => {
        const rate = data?.rates?.USD
        if (typeof rate === 'number' && rate > 0) prices.EURC = rate
      }),

    // BTC/USDT — Binance ticker público
    fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')
      .then((r) => r.json())
      .then((data) => {
        const p = parseFloat(data?.price)
        if (!isNaN(p) && p > 0) prices.cirBTC = p
      }),

    // FAJU/ARCX — reserva do pool. Em erro de RPC mantém o último preço conhecido
    // em vez de sumir com ele; pool sem liquidez remove o preço de vez.
    ...POOL_PRICED_SYMBOLS.map((symbol) =>
      fetchPoolPrice(symbol)
        .then((result) => {
          if (!result) return
          prices[symbol] = result.price
          meta[symbol] = { source: 'pool', lowLiquidity: result.lowLiquidity }
        })
        .catch(() => {
          if (_cache.prices[symbol] !== undefined) {
            prices[symbol] = _cache.prices[symbol]
            meta[symbol] = _cache.meta[symbol]
          }
        }),
    ),
  ])

  return { prices, meta }
}

/** Preços USD por símbolo + origem/baixa liquidez de cada um. Atualiza a cada 60s. */
export function useTokenPriceData(): TokenPriceData {
  const [data, setData] = useState<TokenPriceData>({ prices: _cache.prices, meta: _cache.meta })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      // Cache ainda válido → usa o que tem
      if (Date.now() - _cache.ts < CACHE_TTL) {
        if (!cancelled) setData({ prices: { ..._cache.prices }, meta: { ..._cache.meta } })
        return
      }
      try {
        const fetched = await _refreshPrices()
        if (!cancelled) {
          _cache.prices = fetched.prices
          _cache.meta = fetched.meta
          _cache.ts = Date.now()
          setData({ prices: { ...fetched.prices }, meta: { ...fetched.meta } })
        }
      } catch {
        // Fallback: mantém os valores do cache (já inicializados com DEFAULTS)
        if (!cancelled) setData({ prices: { ..._cache.prices }, meta: { ..._cache.meta } })
      }
    }

    load()
    const interval = setInterval(load, CACHE_TTL)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return data
}

/** Hook que retorna preços USD por símbolo (tokens sem preço de mercado ficam ausentes). */
export function useTokenPrices(): TokenPrices {
  return useTokenPriceData().prices
}

/** Converte uma quantidade de token para USD. Retorna 0 se o preço não for conhecido. */
export function toUSD(amount: number, symbol: string, prices: TokenPrices): number {
  return amount * (prices[symbol] ?? 0)
}
