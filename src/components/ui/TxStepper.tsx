/**
 * TxStepper — FASE 3 microinteração
 * Exibe progresso: Approve → Confirm → Pending → Success
 */

import { motion } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'
import { MOTION } from '@/lib/motion'

export type TxStep = 'approve' | 'confirm' | 'pending' | 'success' | 'error'

const STEPS: { key: TxStep; label: string }[] = [
  { key: 'approve', label: 'Approve' },
  { key: 'confirm', label: 'Confirm' },
  { key: 'pending', label: 'Pending' },
  { key: 'success', label: 'Success' },
]

const stepOrder: TxStep[] = ['approve', 'confirm', 'pending', 'success']

function stepIndex(step: TxStep): number {
  const i = stepOrder.indexOf(step)
  return i >= 0 ? i : 0
}

type Props = {
  currentStep: TxStep
  className?: string
}

export function TxStepper({ currentStep, className = '' }: Props) {
  const current = stepIndex(currentStep)
  const isError = currentStep === 'error'

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {STEPS.map((s, i) => {
        const idx = stepIndex(s.key)
        const isDone = idx < current || currentStep === 'success'
        const isActive = idx === current && !isError
        const isErrored = isError && idx === current

        return (
          <div key={s.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 min-w-0">
              <motion.div
                initial={false}
                animate={{
                  scale: isActive ? 1.05 : 1,
                  backgroundColor: isDone
                    ? 'rgba(34, 211, 238, 0.3)'
                    : isErrored
                      ? 'rgba(239, 68, 68, 0.3)'
                      : isActive
                        ? 'rgba(34, 211, 238, 0.15)'
                        : 'rgba(51, 65, 85, 0.5)',
                  borderColor: isDone
                    ? 'rgb(34, 211, 238)'
                    : isErrored
                      ? 'rgb(239, 68, 68)'
                      : isActive
                        ? 'rgb(34, 211, 238)'
                        : 'rgb(71, 85, 105)',
                }}
                transition={{ duration: MOTION.duration.normal }}
                className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0"
              >
                {isDone && currentStep !== 'success' ? (
                  <Check className="h-4 w-4 text-cyan-400" />
                ) : isDone && currentStep === 'success' ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  >
                    <Check className="h-4 w-4 text-emerald-400" />
                  </motion.div>
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                ) : (
                  <span className="text-xs text-slate-500">{i + 1}</span>
                )}
              </motion.div>
              <span
                className={`text-[10px] truncate max-w-full px-0.5 text-center ${
                  isActive || isDone ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-0.5 rounded transition-colors duration-200 ${
                  idx < current ? 'bg-cyan-500/50' : 'bg-slate-600/50'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
