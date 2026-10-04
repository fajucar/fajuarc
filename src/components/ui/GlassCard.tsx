import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GlassCardProps {
  children: ReactNode
  className?: string
  hover?: boolean
}

export function GlassCard({ children, className, hover = true }: GlassCardProps) {
  return (
    <div
      className={cn(
        'bg-panel border border-theme rounded-2xl p-6 shadow-theme transition-all duration-300',
        hover && 'hover:border-cyan-500/40 hover:shadow-theme-lg',
        className
      )}
    >
      {children}
    </div>
  )
}
