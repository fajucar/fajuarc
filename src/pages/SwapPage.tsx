import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/Layout/AppShell'
import { SwapInterface } from '@/components/Swap/SwapInterface'
import { GetTestTokensCard } from '@/components/Swap/GetTestTokensCard'
import { BridgeTab } from '@/components/Bridge/BridgeTab'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { MOTION } from '@/lib/motion'

/** Compact error UI shown inside a tab when it crashes — does NOT take over the whole page */
function TabError({ tab }: { tab: string }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 flex flex-col items-center gap-3 text-center">
      <AlertTriangle className="h-8 w-8 text-red-400" />
      <div>
        <p className="text-sm font-semibold text-red-300">{t('swap.tabError', { tab })}</p>
        <p className="text-xs text-slate-400 mt-1">{t('swap.tabErrorHint')}</p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm text-white font-medium transition-colors"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {t('swap.reload')}
      </button>
    </div>
  )
}

export function SwapPage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'swap' | 'bridge'>('swap')

  return (
    <>
      <Helmet>
        <title>Swap - FajuARC</title>
        <meta name="description" content={t('swap.metaDescription')} />
      </Helmet>
      <AppShell
        title="Swap"
        subtitle={t('swap.subtitle')}
        titleClassName="text-xl md:text-2xl font-semibold tracking-tight"
        maxWidth="6xl"
        compact
      >
        <div className="mb-4 flex gap-2 flex-wrap">
          {([
            { id: 'swap',   label: `🔄 ${t('swap.tabSwap')}`    },
            { id: 'bridge', label: `🌉 ${t('swap.tabBridge')}`  },
          ] as const).map(({ id, label }) => (
            <motion.button
              key={id}
              onClick={() => setMode(id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: MOTION.duration.fast }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                mode === id
                  ? id === 'bridge'
                    ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/20'
                    : 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
            >
              {label}
            </motion.button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_440px] gap-4 md:gap-5 items-start">
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {mode === 'swap' && (
                <motion.div key="swap" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: MOTION.duration.normal }}>
                  <ErrorBoundary fallback={<TabError tab="Swap" />}>
                    <SwapInterface />
                  </ErrorBoundary>
                </motion.div>
              )}
              {mode === 'bridge' && (
                <motion.div key="bridge" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: MOTION.duration.normal }}>
                  <ErrorBoundary fallback={<TabError tab="Bridge" />}>
                    <BridgeTab />
                  </ErrorBoundary>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="md:sticky md:top-20">
            <ErrorBoundary fallback={<TabError tab="Test tokens" />}>
              <GetTestTokensCard />
            </ErrorBoundary>
          </div>
        </div>
      </AppShell>
    </>
  )
}

