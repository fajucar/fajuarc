import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Minus, ExternalLink, ChevronDown, BarChart3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts'
import { formatMoney, formatUSD } from '@/lib/format'
import { useTokenPrices, toUSD } from '@/lib/tokenPrices'
import type { PoolMarketInfo } from '@/hooks/usePools'

const TOKEN_COLORS: Record<string, string> = {
  USDC:   '#10B981', // emerald-500
  EURC:   '#3B82F6', // blue-500
  FAJU:   '#F97316', // orange-500
  ARCX:   '#A855F7', // purple-500
  QCAD:   '#06B6D4', // cyan-500
  USYC:   '#14B8A6', // teal-500
  cirBTC: '#F7931A', // bitcoin orange
}

const TOKEN_LETTER: Record<string, string> = {
  USDC: 'U', EURC: 'E', FAJU: 'F', ARCX: 'A', QCAD: 'Q', USYC: 'Y', cirBTC: '₿',
}

interface ProfessionalPoolCardProps {
  pool: PoolMarketInfo
  onAddLiquidity: () => void
  /** Opens the withdraw/manage flow; the modal itself explains when the wallet has no LP here. */
  onWithdraw: () => void
  explorerBase: string
  explorerName: string
}

export function ProfessionalPoolCard({
  pool,
  onAddLiquidity,
  onWithdraw,
  explorerBase,
  explorerName,
}: ProfessionalPoolCardProps) {
  const { t } = useTranslation()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const prices = useTokenPrices()

  const reserve0 = parseFloat(pool.reserve0Formatted)
  const reserve1 = parseFloat(pool.reserve1Formatted)
  const reserve0USD = toUSD(reserve0, pool.token0.symbol, prices)
  const reserve1USD = toUSD(reserve1, pool.token1.symbol, prices)
  const tvlUSD = reserve0USD + reserve1USD

  // Chart data usa valores em USD para distribuição correta entre tokens de decimals diferentes
  const totalUSD = tvlUSD || 1
  const chartData = [
    {
      name: pool.token0.symbol,
      value: reserve0USD,
      percentage: ((reserve0USD / totalUSD) * 100).toFixed(1),
      color: TOKEN_COLORS[pool.token0.symbol] || '#6B7280',
    },
    {
      name: pool.token1.symbol,
      value: reserve1USD,
      percentage: ((reserve1USD / totalUSD) * 100).toFixed(1),
      color: TOKEN_COLORS[pool.token1.symbol] || '#6B7280',
    },
  ]

  const token0Color = TOKEN_COLORS[pool.token0.symbol] || '#6B7280'
  const token1Color = TOKEN_COLORS[pool.token1.symbol] || '#6B7280'
  const token0Letter = TOKEN_LETTER[pool.token0.symbol] ?? pool.token0.symbol[0]
  const token1Letter = TOKEN_LETTER[pool.token1.symbol] ?? pool.token1.symbol[0]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ duration: 0.2 }}
      className="glass-card p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex -space-x-2 shrink-0">
            <div
              className="w-10 h-10 rounded-full border-2 border-slate-900 flex items-center justify-center text-sm font-bold text-white z-10"
              style={{ backgroundColor: token0Color }}
            >
              {token0Letter}
            </div>
            <div
              className="w-10 h-10 rounded-full border-2 border-slate-900 flex items-center justify-center text-sm font-bold text-white"
              style={{ backgroundColor: token1Color }}
            >
              {token1Letter}
            </div>
          </div>

          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white truncate">{pool.pairName}</h3>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-600/60 text-slate-300 border border-slate-500/40">
                {pool.feeTier}
              </span>
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Active
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onWithdraw}
            className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl text-sm font-medium border border-slate-600/60 bg-transparent text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 transition-colors"
          >
            <Minus className="h-4 w-4" />
            {t('pools.withdraw')}
          </button>
          <button
            onClick={onAddLiquidity}
            className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div>
          <div className="text-xs text-slate-400 mb-1">TVL</div>
          <div className="text-sm font-semibold text-white">
            {formatUSD(tvlUSD)}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-400 mb-1">Volume 24h</div>
          <div className="text-sm font-semibold text-slate-500">--</div>
        </div>

        <div>
          <div className="text-xs text-slate-400 mb-1">APR</div>
          <div className="text-sm font-semibold text-slate-500">--</div>
        </div>

        <div>
          <div className="text-xs text-slate-400 mb-1">Fees 24h</div>
          <div className="text-sm font-semibold text-slate-500">--</div>
        </div>
      </div>

      {/* Mini Chart */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="h-4 w-4 text-slate-400" />
          <span className="text-xs text-slate-400">Liquidity Distribution</span>
        </div>
        <div className="h-16">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>{pool.token0.symbol}: {chartData[0]?.percentage}%</span>
          <span>{pool.token1.symbol}: {chartData[1]?.percentage}%</span>
        </div>
      </div>

      {/* Expandable Details */}
      <button
        onClick={() => setDetailsOpen(!detailsOpen)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium border border-slate-600/50 bg-slate-800/40 text-slate-200 hover:bg-slate-700/40 transition-colors"
      >
        <span>Details</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
      </button>

      {detailsOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-4 pt-4 border-t border-slate-700/50 space-y-2 text-xs text-slate-400"
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-slate-500">Pair Address:</span>
              <div className="font-mono text-cyan-400 break-all">
                {pool.pairAddress.slice(0, 10)}...{pool.pairAddress.slice(-8)}
              </div>
            </div>
            <div>
              <span className="text-slate-500">Supply Total (LP):</span>
              <div className="text-slate-200">
                {formatMoney(pool.totalSupplyFormatted, 4)} LP
              </div>
            </div>
          </div>

          <div>
            <span className="text-slate-500">Reserves:</span>
            <div className="text-slate-200 space-y-0.5 mt-0.5">
              <div>
                {formatMoney(pool.reserve0Formatted, 4)} {pool.token0.symbol}
                <span className="text-slate-400 ml-1">({formatUSD(reserve0USD)})</span>
              </div>
              <div>
                {formatMoney(pool.reserve1Formatted, 4)} {pool.token1.symbol}
                <span className="text-slate-400 ml-1">({formatUSD(reserve1USD)})</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500">TVL Total:</span>
            <span className="text-white font-semibold">{formatUSD(tvlUSD)}</span>
          </div>

          <a
            href={`${explorerBase}/address/${pool.pairAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 pt-2 transition-colors"
          >
            View on {explorerName}
            <ExternalLink className="h-3 w-3" />
          </a>
        </motion.div>
      )}
    </motion.div>
  )
}
