import { Zap, Clock, DollarSign, Activity } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatCard } from './StatCard'
import { useArcStats } from '@/hooks/useArcStats'
import { useBlockNumber } from '@/hooks/useBlockNumber'
import { CONSTANTS } from '@/config/constants'

export function NetworkStats() {
  const { t } = useTranslation()
  const { data: stats, isLoading } = useArcStats()
  const { data: blockNumber } = useBlockNumber()

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-6xl mx-auto">
        {[...Array(4)].map((_, i) => (
          <div 
            key={i}
            className="h-16 rounded-lg bg-slate-800/50 animate-pulse"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 max-w-6xl mx-auto">
      <StatCard
        label={t('stats.tps')}
        value={stats?.tps || 0}
        icon={Zap}
        trend="up"
        link={`${CONSTANTS.LINKS.explorer}`}
        tooltip={t('stats.tpsTooltip')}
      />

      <StatCard
        label={t('stats.finality')}
        value={stats?.finality || 0}
        suffix="s"
        icon={Clock}
        decimals={2}
        trend="neutral"
        tooltip={t('stats.finalityTooltip')}
      />

      <StatCard
        label={t('stats.gasPrice')}
        value={stats?.gasPrice || '0.00'}
        suffix=""
        icon={DollarSign}
        decimals={4}
        trend="neutral"
        link={`${CONSTANTS.LINKS.explorer}`}
        tooltip={t('stats.gasPriceTooltip')}
      />

      <StatCard
        label={t('stats.latestBlock')}
        value={Number(blockNumber || 0)}
        icon={Activity}
        trend="up"
        link={`${CONSTANTS.LINKS.explorer}/block/${blockNumber}`}
        tooltip={t('stats.latestBlockTooltip')}
      />
    </div>
  )
}

