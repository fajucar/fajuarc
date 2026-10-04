/**
 * Remove V3 Liquidity — modal styled like the V2 "Manage" remove flow
 * (slider + quick percentages + "You will receive" + Back/Remove buttons),
 * instead of the inline always-visible card.
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Minus } from 'lucide-react'
import type { Pool } from '@uniswap/v3-sdk'
import { partialLiquidity, positionAmounts } from '../lib/sdk'
import { formatCurrencyAmount } from '@/lib/format'

interface RemoveV3LiquidityModalProps {
  isOpen: boolean
  onClose: () => void
  pool: Pool | null
  tickLower: number
  tickUpper: number
  liquidity: bigint
  sym0: string
  sym1: string
  busy: boolean
  onConfirm: (percent: number) => void
}

export function RemoveV3LiquidityModal({
  isOpen,
  onClose,
  pool,
  tickLower,
  tickUpper,
  liquidity,
  sym0,
  sym1,
  busy,
  onConfirm,
}: RemoveV3LiquidityModalProps) {
  const [removePercent, setRemovePercent] = useState(100)

  // Reset to 100% each time the modal opens, instead of remembering the last session's pick
  useEffect(() => {
    if (isOpen) setRemovePercent(100)
  }, [isOpen])

  const liquidityToRemove = partialLiquidity(liquidity, removePercent)
  const { amount0Exact, amount1Exact } = pool
    ? positionAmounts(pool, tickLower, tickUpper, liquidityToRemove)
    : { amount0Exact: '0', amount1Exact: '0' }

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
              <h3 className="text-lg font-semibold text-white">Remove Liquidity — {sym0} / {sym1}</h3>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-400">Amount to remove</label>
                  <span className="text-sm font-semibold text-white">{removePercent}%</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={removePercent}
                  onChange={(e) => setRemovePercent(Number(e.target.value))}
                  className="w-full accent-red-500"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>1%</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {([25, 50, 75, 100] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setRemovePercent(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${removePercent === p ? 'bg-red-500/30 text-red-400 border-2 border-red-500/60' : 'bg-slate-800/60 text-slate-400 border border-slate-600 hover:bg-slate-700/60'}`}
                  >
                    {p}%
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 space-y-1.5">
                <p className="text-xs text-slate-400">You will receive</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">{sym0}</span>
                  <span className="text-white font-medium">{formatCurrencyAmount(amount0Exact, sym0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">{sym1}</span>
                  <span className="text-white font-medium">{formatCurrencyAmount(amount1Exact, sym1)}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 font-medium hover:bg-slate-800 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => onConfirm(removePercent)}
                  disabled={busy || liquidityToRemove <= 0n}
                  className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Minus className="h-4 w-4" />}
                  {busy ? 'Removing...' : `Remove ${removePercent}%`}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
