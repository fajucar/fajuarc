/**
 * MotionButton — microinterações (FASE 3)
 * whileHover, whileTap, transição 150–200ms.
 */

import { motion, type HTMLMotionProps } from 'framer-motion'
import { forwardRef } from 'react'
import { buttonTap } from '@/lib/motion'
import { cn } from '@/lib/utils'

type Props = HTMLMotionProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
}

const variants = {
  primary: 'bg-amber-500 hover:bg-amber-600 text-white font-semibold',
  secondary: 'border border-slate-600 text-slate-300 hover:bg-slate-700/60 font-medium',
  ghost: 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
  danger: 'border border-red-500/40 text-red-400 hover:bg-red-500/10 font-medium',
}

export const MotionButton = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = 'primary', disabled, children, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        {...buttonTap}
        disabled={disabled}
        className={cn(
          'px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50 disabled:pointer-events-none',
          variants[variant],
          className
        )}
        whileHover={disabled ? undefined : buttonTap.whileHover}
        whileTap={disabled ? undefined : buttonTap.whileTap}
        {...props}
      >
        {children}
      </motion.button>
    )
  }
)

MotionButton.displayName = 'MotionButton'
