import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageSectionProps {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
}

export function PageSection({ title, subtitle, children, className }: PageSectionProps) {
  return (
    <section className={cn('mb-8', className)}>
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-theme mb-2">{title}</h2>
        {subtitle && <p className="text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}
