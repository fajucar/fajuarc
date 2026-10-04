/**
 * SegmentedTabs — Tabs reutilizáveis (Pools, My Pools)
 * Container translúcido, borda suave, blur. Ativo cyan/teal, inativo dark com hover.
 * Acessível: role="tablist", role="tab", aria-selected.
 */

import { cn } from '@/lib/utils'

export type TabItem = { id: string; label: string }

type Props = {
  tabs: TabItem[]
  activeId: string
  onChange: (id: string) => void
  className?: string
}

export function SegmentedTabs({ tabs, activeId, onChange, className }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Section tabs"
      className={cn(
        'inline-flex p-1 rounded-xl border border-slate-700/50 bg-slate-800/20 backdrop-blur-sm',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                : 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
