import { Check, X, ArrowRightLeft, Coins, Droplets, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ConfirmationCardProps {
  tool:    string
  params:  Record<string, unknown>
  label:   string
  onConfirm: () => void
  onCancel:  () => void
  disabled?: boolean
}

// Tool → icon + accent colour
const TOOL_META: Record<string, { icon: React.ComponentType<{ className?: string }>; accent: string }> = {
  getBalance:   { icon: Wallet,          accent: 'border-cyan-500/40 bg-cyan-500/10'   },
  sendUSDC:     { icon: Coins,           accent: 'border-emerald-500/40 bg-emerald-500/10' },
  swap:         { icon: ArrowRightLeft,  accent: 'border-blue-500/40 bg-blue-500/10'   },
  addLiquidity: { icon: Droplets,        accent: 'border-purple-500/40 bg-purple-500/10' },
  faucet:       { icon: Droplets,        accent: 'border-teal-500/40 bg-teal-500/10'   },
}

// Render key params in a human-readable way
function ParamRow({ k, v }: { k: string; v: unknown }) {
  const { t } = useTranslation()
  const val = String(v)
  const display = val.startsWith('0x') && val.length === 42
    ? `${val.slice(0, 6)}…${val.slice(-4)}`
    : val
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-400">{t(`confirmation.params.${k}`, { defaultValue: k })}</span>
      <span className="font-mono text-slate-200">{display}</span>
    </div>
  )
}

export function ConfirmationCard({
  tool, params, label, onConfirm, onCancel, disabled,
}: ConfirmationCardProps) {
  const { t } = useTranslation()
  const meta = TOOL_META[tool] ?? TOOL_META.getBalance
  const Icon = meta.icon

  return (
    <div className={`rounded-xl border ${meta.accent} p-3.5 space-y-3`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-slate-800/80 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-slate-300" />
        </div>
        <p className="text-sm font-semibold text-white leading-snug">{label}</p>
      </div>

      {/* Params */}
      {Object.entries(params).length > 0 && (
        <div className="rounded-lg bg-slate-900/50 px-3 py-2 space-y-1">
          {Object.entries(params).map(([k, v]) => (
            <ParamRow key={k} k={k} v={v} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-600/60 bg-slate-800/50 py-2.5 min-h-[44px] text-xs font-semibold text-slate-300 hover:bg-slate-700/60 disabled:opacity-40 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          {t('confirmation.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 min-h-[44px] text-xs font-bold text-white hover:opacity-90 disabled:opacity-40 transition-all shadow-md shadow-cyan-500/20"
        >
          <Check className="h-3.5 w-3.5" />
          {t('confirmation.confirm')}
        </button>
      </div>
    </div>
  )
}
