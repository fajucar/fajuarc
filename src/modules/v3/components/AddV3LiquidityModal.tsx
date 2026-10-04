/**
 * Add V3 Liquidity (increase) — modal styled like RemoveV3LiquidityModal,
 * instead of the inline always-visible "Amount" card.
 *
 * Pairing uses the POSITION's own fixed [tickLower, tickUpper] — not a
 * separate range selector — since increaseLiquidity() can only add to a
 * position's existing range; it can't move it.
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Plus } from 'lucide-react'
import type { Pool } from '@uniswap/v3-sdk'
import { parseUnits } from 'viem'
import { pairedAmountFromAmount0, pairedAmountFromAmount1 } from '../lib/sdk'
import { formatCurrencyAmount } from '@/lib/format'

interface AddV3LiquidityModalProps {
  isOpen: boolean
  onClose: () => void
  pool: Pool | null
  tickLower: number
  tickUpper: number
  decimals0: number
  decimals1: number
  sym0: string
  sym1: string
  balance0: string
  balance1: string
  positionPriceBelowRange: boolean
  positionPriceAboveRange: boolean
  busy: boolean
  onConfirm: (amount0: string, amount1: string) => void
}

export function AddV3LiquidityModal({
  isOpen,
  onClose,
  pool,
  tickLower,
  tickUpper,
  decimals0,
  decimals1,
  sym0,
  sym1,
  balance0,
  balance1,
  positionPriceBelowRange,
  positionPriceAboveRange,
  busy,
  onConfirm,
}: AddV3LiquidityModalProps) {
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')

  // Reset inputs each time the modal opens, instead of remembering the last session's amounts
  useEffect(() => {
    if (isOpen) { setAmount0(''); setAmount1('') }
  }, [isOpen])

  const tickLo = Math.min(tickLower, tickUpper)
  const tickHi = Math.max(tickLower, tickUpper)

  const computeAmount1From0 = (a0: string): string => {
    if (!pool) return ''
    const v = parseFloat(a0)
    if (isNaN(v) || v <= 0) return ''
    try {
      const raw = parseUnits(a0, decimals0)
      return pairedAmountFromAmount0(pool, tickLo, tickHi, raw).amount1Exact
    } catch { return '' }
  }
  const computeAmount0From1 = (a1: string): string => {
    if (!pool) return ''
    const v = parseFloat(a1)
    if (isNaN(v) || v <= 0) return ''
    try {
      const raw = parseUnits(a1, decimals1)
      return pairedAmountFromAmount1(pool, tickLo, tickHi, raw).amount0Exact
    } catch { return '' }
  }

  const rateLabel = pool ? pool.token0Price.toFixed(4) : null

  const canConfirm =
    !busy &&
    ((!!amount0 && parseFloat(amount0) > 0) || (!!amount1 && parseFloat(amount1) > 0))

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700/50 bg-slate-900/95 backdrop-blur-xl p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add Liquidity — {sym0} / {sym1}</h3>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              {positionPriceBelowRange && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                  <span className="shrink-0">⚠</span>
                  <span>Price is below range. Only {sym0} can be added.</span>
                </div>
              )}
              {positionPriceAboveRange && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                  <span className="shrink-0">⚠</span>
                  <span>Price is above range. Only {sym1} can be added.</span>
                </div>
              )}

              {/* Token 0 input */}
              <div className={`rounded-xl bg-slate-900/60 border border-slate-700/50 px-3 py-2.5 ${positionPriceAboveRange ? 'opacity-40' : ''}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-slate-400">{sym0}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">Balance {formatCurrencyAmount(balance0 || '0', sym0)}</span>
                    {!positionPriceAboveRange && parseFloat(balance0 || '0') > 0 && (
                      <button
                        type="button"
                        onClick={() => { setAmount0(balance0); setAmount1(computeAmount1From0(balance0)) }}
                        className="px-1.5 py-0.5 rounded-md text-[11px] font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/35 hover:bg-cyan-500/25 transition-colors"
                      >
                        MAX
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount0}
                  disabled={positionPriceAboveRange}
                  onChange={(e) => {
                    const v = e.target.value.replace(/,/g, '.')
                    setAmount0(v)
                    setAmount1(v ? computeAmount1From0(v) : '')
                  }}
                  placeholder="0"
                  className="w-full bg-transparent text-xl font-semibold text-white focus:outline-none disabled:cursor-not-allowed"
                />
              </div>

              {/* Token 1 input */}
              <div className={`rounded-xl bg-slate-900/60 border border-slate-700/50 px-3 py-2.5 ${positionPriceBelowRange ? 'opacity-40' : ''}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-slate-400">{sym1}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">Balance {formatCurrencyAmount(balance1 || '0', sym1)}</span>
                    {!positionPriceBelowRange && parseFloat(balance1 || '0') > 0 && (
                      <button
                        type="button"
                        onClick={() => { setAmount1(balance1); setAmount0(computeAmount0From1(balance1)) }}
                        className="px-1.5 py-0.5 rounded-md text-[11px] font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/35 hover:bg-cyan-500/25 transition-colors"
                      >
                        MAX
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount1}
                  disabled={positionPriceBelowRange}
                  onChange={(e) => {
                    const v = e.target.value.replace(/,/g, '.')
                    setAmount1(v)
                    setAmount0(v ? computeAmount0From1(v) : '')
                  }}
                  placeholder="0"
                  className="w-full bg-transparent text-xl font-semibold text-white focus:outline-none disabled:cursor-not-allowed"
                />
              </div>

              {rateLabel && !positionPriceBelowRange && !positionPriceAboveRange && (
                <div className="text-xs text-slate-400 text-center py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/50">
                  1 {sym0} ≈ {rateLabel} {sym1}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 font-medium hover:bg-slate-800 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => onConfirm(amount0, amount1)}
                  disabled={!canConfirm}
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add Liquidity
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
