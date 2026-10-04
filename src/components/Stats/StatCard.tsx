import { motion } from 'framer-motion'
import { LucideIcon, ExternalLink } from 'lucide-react'
import CountUp from 'react-countup'
import { useTranslation } from 'react-i18next'

interface StatCardProps {
  label: string
  value: number | string
  suffix?: string
  icon: LucideIcon
  trend?: 'up' | 'down' | 'neutral'
  decimals?: number
  link?: string
  tooltip?: string
}

export function StatCard({ 
  label, 
  value, 
  suffix = '', 
  icon: Icon,
  trend = 'neutral',
  decimals = 0,
  link,
  tooltip
}: StatCardProps) {
  const { t } = useTranslation()
  const trendColors = {
    up: 'text-green-400',
    down: 'text-red-400',
    neutral: 'text-cyan-400',
  }

  const numericValue = typeof value === 'string' ? parseFloat(value) : value
  const isValidNumber = !isNaN(numericValue) && isFinite(numericValue)

  const CardContent = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, scale: 1.01 }}
      className="group relative overflow-hidden rounded-lg border border-cyan-500/15 bg-slate-900/25 p-2.5 backdrop-blur-xl transition-all"
    >
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-slate-400">{label}</span>
          <div className="flex items-center gap-1">
            <Icon className={`h-3.5 w-3.5 ${trendColors[trend]}`} />
            {link && (
              <ExternalLink className="h-3 w-3 text-slate-500 group-hover:text-cyan-400 transition-colors" />
            )}
          </div>
        </div>

        <div className="flex items-baseline gap-1">
          <span className="text-lg font-semibold">
            {isValidNumber ? (
              <CountUp 
                end={numericValue} 
                decimals={decimals}
                separator=","
                duration={1.5}
              />
            ) : (
              value
            )}
          </span>
          {suffix && (
            <span className="text-xs text-slate-400">{suffix}</span>
          )}
        </div>

        {tooltip && (
          <p className="mt-0.5 text-[9px] text-slate-500 leading-tight">{tooltip}</p>
        )}
      </div>
    </motion.div>
  )

  if (link) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        title={tooltip || t('stats.viewOnExplorer', { label })}
      >
        {CardContent}
      </a>
    )
  }

  return CardContent
}

