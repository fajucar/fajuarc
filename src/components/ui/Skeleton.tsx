/**
 * Skeleton loading — Web3 UX (FASE 3)
 * Para dados que vêm da blockchain.
 */

import { cn } from '@/lib/utils'

type Props = {
  className?: string
  variant?: 'text' | 'block' | 'circle'
}

export function Skeleton({ className, variant = 'block' }: Props) {
  return (
    <div
      className={cn(
        'animate-pulse bg-white/10 rounded',
        variant === 'text' && 'h-4',
        variant === 'circle' && 'rounded-full aspect-square',
        className
      )}
      aria-hidden
    />
  )
}

export function FarmingSkeleton() {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5" variant="circle" />
        <Skeleton className="h-5 w-24" variant="text" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i}>
            <Skeleton className="h-3 w-16 mb-1" variant="text" />
            <Skeleton className="h-5 w-20" variant="text" />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20 rounded-xl" />
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-16 rounded-xl" />
      </div>
    </div>
  )
}

export function PoolCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5 space-y-4">
      <div className="flex justify-between">
        <Skeleton className="h-6 w-32" variant="text" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-9 w-20 rounded-xl" />
        </div>
      </div>
      <div className="pt-4 border-t border-slate-700/50">
        <Skeleton className="h-3 w-12 mb-2" variant="text" />
        <Skeleton className="h-5 w-40" variant="text" />
      </div>
    </div>
  )
}
