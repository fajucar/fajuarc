import { motion } from 'framer-motion'
import { DollarSign } from 'lucide-react'
import { formatUSD } from '@/lib/format'
import { useTokenPrices, toUSD } from '@/lib/tokenPrices'
import type { PoolMarketInfo } from '@/hooks/usePools'

interface TVLHeaderProps {
  pools: PoolMarketInfo[]
  loading?: boolean
}

export function TVLHeader({ pools, loading }: TVLHeaderProps) {
  const prices = useTokenPrices()

  const totalUSD = pools.reduce((sum, pool) => {
    const r0 = parseFloat(pool.reserve0Formatted)
    const r1 = parseFloat(pool.reserve1Formatted)
    return sum + toUSD(r0, pool.token0.symbol, prices) + toUSD(r1, pool.token1.symbol, prices)
  }, 0)

  const activePoolsCount = pools.length

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-700/50 bg-gradient-to-r from-slate-800/40 to-slate-900/40 p-6 mb-6"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="w-32 h-4 bg-slate-700/50 rounded animate-pulse" />
            <div className="w-20 h-6 bg-slate-700/50 rounded animate-pulse" />
          </div>
          <div className="space-y-2 text-right">
            <div className="w-24 h-4 bg-slate-700/50 rounded animate-pulse" />
            <div className="w-16 h-6 bg-slate-700/50 rounded animate-pulse" />
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-700/50 bg-gradient-to-r from-slate-800/40 to-slate-900/40 p-6 mb-6"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Total Liquidity</h2>
          </div>
          <div className="text-3xl font-bold text-white">
            {formatUSD(totalUSD)}
          </div>
          <div className="text-sm text-slate-400">
            {activePoolsCount} active pool{activePoolsCount !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="text-right space-y-2">
          <div className="text-xs text-slate-400">Volume 24h</div>
          <div className="text-sm font-medium text-slate-500">--</div>
          <div className="pt-2 border-t border-slate-700/30 space-y-1">
            <div className="text-xs text-slate-400">Fees 24h</div>
            <div className="text-sm font-medium text-slate-500">--</div>
          </div>
        </div>
      </div>

      {/* Barras de distribuição por pool (largura proporcional ao TVL em USD) */}
      <div className="mt-4 pt-4 border-t border-slate-700/30">
        <div className="flex items-center gap-1">
          {pools.slice(0, 8).map((pool) => {
            const poolUSD =
              toUSD(parseFloat(pool.reserve0Formatted), pool.token0.symbol, prices) +
              toUSD(parseFloat(pool.reserve1Formatted), pool.token1.symbol, prices)
            const width = totalUSD > 0 ? Math.max((poolUSD / totalUSD) * 100, 1.5) : 2
            return (
              <div
                key={pool.pairAddress}
                className="h-1 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                style={{ width: `${width}%` }}
                title={`${pool.pairName}: ${formatUSD(poolUSD)}`}
              />
            )
          })}
        </div>
        <div className="text-xs text-slate-500 mt-2">Distribution per pool (in USD)</div>
      </div>
    </motion.div>
  )
}
