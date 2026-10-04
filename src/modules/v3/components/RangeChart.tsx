/**
 * Range Chart — Visualização do range de preço (Select range / Visualize range)
 * Mostra preço atual, range selecionado e liquidez
 */

import { useMemo } from 'react'

/** Preço em token1/token0 a partir do tick (1.0001^tick) */
export function priceAtTick(tick: number): number {
  return Math.pow(1.0001, tick)
}

interface RangeChartProps {
  tickLower: number
  tickUpper: number
  currentTick: number
  symbol0: string
  symbol1: string
  inRange?: boolean
  label?: string
  /** Decimal-adjusted price labels (from the Uniswap SDK's tickToPrice). Falls back to raw 1.0001^tick if omitted. */
  minPriceLabel?: string
  maxPriceLabel?: string
  currentPriceLabel?: string
}

export function RangeChart({
  tickLower, tickUpper, currentTick, symbol0, symbol1, inRange = true, label = 'Selected Range',
  minPriceLabel, maxPriceLabel, currentPriceLabel,
}: RangeChartProps) {
  const { pctLower, pctUpper, pctCurrent, minPrice, maxPrice, currentPrice } = useMemo(() => {
    const tickMin = Math.min(tickLower, tickUpper, currentTick) - 1
    const tickMax = Math.max(tickLower, tickUpper, currentTick) + 1
    const span = tickMax - tickMin || 1
    const pctLower = ((Math.min(tickLower, tickUpper) - tickMin) / span) * 100
    const pctUpper = ((Math.max(tickLower, tickUpper) - tickMin) / span) * 100
    const pctCurrent = ((currentTick - tickMin) / span) * 100
    return {
      pctLower,
      pctUpper,
      pctCurrent,
      minPrice: minPriceLabel ?? priceAtTick(Math.min(tickLower, tickUpper)).toFixed(4),
      maxPrice: maxPriceLabel ?? priceAtTick(Math.max(tickLower, tickUpper)).toFixed(4),
      currentPrice: currentPriceLabel ?? priceAtTick(currentTick).toFixed(4),
    }
  }, [tickLower, tickUpper, currentTick, minPriceLabel, maxPriceLabel, currentPriceLabel])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{label}</h3>
        <span className="text-xs text-slate-500">
          Current: {currentPrice} {symbol1}/{symbol0}
        </span>
      </div>
      <div className="relative h-12 bg-slate-900/80 rounded-lg border border-slate-600/50 overflow-hidden">
        {/* Liquidity distribution placeholder (gradient) */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-800/40 via-slate-700/30 to-slate-800/40" />
        {/* Selected range */}
        <div
          className={`absolute top-0 bottom-0 border-x-2 ${inRange ? 'bg-cyan-500/25 border-cyan-500/60' : 'bg-amber-500/20 border-amber-500/50'}`}
          style={{ left: `${pctLower}%`, right: `${100 - pctUpper}%` }}
        />
        {/* Current price marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-1 h-8 -ml-px rounded-full bg-white/90 shadow-lg z-10"
          style={{ left: `${Math.max(0, Math.min(100, pctCurrent))}%` }}
          title={`Current tick: ${currentTick}`}
        />
      </div>
      <div className="flex justify-between text-xs">
        <div className="text-slate-400">
          <span className="font-medium text-slate-300">Min</span> {minPrice} {symbol1}
        </div>
        <div className={`font-medium ${inRange ? 'text-emerald-400' : 'text-amber-400'}`}>
          Current: {currentPrice} {symbol1}
        </div>
        <div className="text-slate-400">
          <span className="font-medium text-slate-300">Max</span> {maxPrice} {symbol1}
        </div>
      </div>
      {!inRange && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>
            Your range does not include the current price. This is a single-sided position and will earn 0% APR until the price moves into your range.
          </span>
        </div>
      )}
    </div>
  )
}
