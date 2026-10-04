import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface AppShellProps {
  title?: string
  subtitle?: string
  /** Override title style (e.g. smaller, modern font) */
  titleClassName?: string
  children: ReactNode
  className?: string
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '6xl' | '7xl' | '8xl' | 'full'
  /** Reduced padding for compact layouts (e.g. Swap page) */
  compact?: boolean
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  '8xl': 'max-w-[96rem]',
  full: 'max-w-full',
}

export function AppShell({
  title,
  subtitle,
  titleClassName,
  children,
  className,
  maxWidth = '6xl',
  compact = false,
}: AppShellProps) {
  return (
    <main className={cn('mx-auto w-full px-3 py-6 sm:px-4 xl:px-5 2xl:px-6', maxWidthClasses[maxWidth])}>
      <div className={cn(
        'glass-card',
        compact ? 'p-3.5 sm:p-4 xl:p-5' : 'p-6 md:p-8'
      )}>
        {title && (
          <div className={cn(compact ? 'mb-4' : 'mb-6')}>
            <h1 className={cn(
              'text-white mb-2',
              titleClassName ?? 'text-4xl md:text-5xl font-bold'
            )}>
              {title}
            </h1>
            {subtitle && (
              <p className={cn(
                'text-slate-400 max-w-2xl',
                titleClassName ? 'text-sm' : 'text-lg'
              )}>
                {subtitle}
              </p>
            )}
          </div>
        )}
        <div className={className}>
          {children}
        </div>
      </div>
    </main>
  )
}
