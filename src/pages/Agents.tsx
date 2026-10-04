import { useState, useEffect, useCallback, CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Helmet } from 'react-helmet-async'
import { AppShell } from '@/components/Layout/AppShell'
import { usePrivy } from '@privy-io/react-auth'
import { useArcWallet } from '@/hooks/useArcWallet'
import {
  loadProfile,
  defaultAgentName,
  PERSONALITY_OPTIONS,
} from '@/components/Agents/agentConstants'
import { formatUnits } from 'viem'
import {
  Bot, Copy, CheckCircle2, ExternalLink,
  Search, Loader2, Shield, Zap, X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'

// ── Constants ────────────────────────────────────────────────────────────────
const USDC_CONTRACT = '0x3600000000000000000000000000000000000000'.toLowerCase()
const EXPLORER_BASE = 'https://testnet.arcscan.app'           // correct ArcScan domain
const API_BASE      = `${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/explorer`     // proxied through backend

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(ts: string): string {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function fmtDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

function walletAge(ts: string): string {
  const days   = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000)
  const months = Math.floor(days / 30)
  const years  = Math.floor(days / 365)
  if (years > 0)  return `${years} year${years > 1 ? 's' : ''}`
  if (months > 0) return `${months} month${months > 1 ? 's' : ''}`
  return `${days} day${days !== 1 ? 's' : ''}`
}

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ── Types ────────────────────────────────────────────────────────────────────
interface ArcTx {
  hash:      string
  timestamp: string
  from?:     { hash: string }
  to?:       { hash: string } | null
  value?:    string
  token_transfers?: Array<{
    total?: { value: string }
    token?: { symbol: string; decimals: number }
  }>
}

interface ArcTokenTransfer {
  from?:  { hash: string }
  to?:    { hash: string }
  token?: { address_hash: string; decimals: string }
  total?: { value: string }
}

interface PassportStats {
  txCount:      number
  usdcVolume:   number
  daysActive:   number
  score:        number
  firstTxDate:  string | null
  recentTxs:    ArcTx[]
}

interface ModalData {
  txCount:         number
  sentCount:       number
  receivedCount:   number
  uniqueContracts: number
  uniqueTokens:    number
  daysActive:      number
  score:           number   // capped at 1000: txs×2 + uniqueContracts×20 + ageInDays×1
  firstTxDate:     string | null
  lastTxDate:      string | null
}

// ── Score helpers ─────────────────────────────────────────────────────────────
function passportLabel(score: number): string {
  if (score >= 850) return 'OG'
  if (score >= 600) return 'Experienced'
  if (score >= 300) return 'Active'
  return 'Beginner'
}

function passportColor(score: number): string {
  if (score >= 850) return '#22d3ee'   // cyan
  if (score >= 600) return '#a78bfa'   // violet
  if (score >= 300) return '#34d399'   // emerald
  return '#94a3b8'                      // slate
}

function scoreTier(score: number): { label: string; color: string; glow: string } {
  if (score >= 1000) return { label: '💎 Diamond', color: 'text-cyan-300',   glow: 'border-cyan-500/40 bg-cyan-500/10'   }
  if (score >= 500)  return { label: '🥇 Gold',    color: 'text-amber-300',  glow: 'border-amber-500/40 bg-amber-500/10'  }
  if (score >= 100)  return { label: '🥈 Silver',  color: 'text-slate-300',  glow: 'border-slate-500/40 bg-slate-500/10'  }
  return               { label: '🥉 Bronze',  color: 'text-orange-300', glow: 'border-orange-500/40 bg-orange-500/10' }
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

// Real total tx count via ArcScan's dedicated /counters endpoint — the
// /transactions endpoint is paginated at 50 items/page, so counting `items`
// undercounts any wallet with more than one page of history.
async function fetchTxCount(address: string): Promise<number | null> {
  const url = `${API_BASE}/address/${address}/counters`
  console.log('[Passport] fetch', url)
  try {
    const res = await fetch(url)
    if (!res.ok) { console.error('[Passport] counters HTTP', res.status, await res.text()); return null }
    const data = await res.json()
    const n = Number(data.transactions_count)
    return Number.isFinite(n) ? n : null
  } catch (err) {
    console.error('[Passport] counters fetch failed for', url, err)
    return null
  }
}

async function fetchUsdcVolume(address: string): Promise<number> {
  const url = `${API_BASE}/address/${address}/token-transfers`
  console.log('[Passport] fetch', url)
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    console.error('[Passport] token-transfers fetch failed for', url, err)
    return 0
  }
  if (!res.ok) { console.error('[Passport] token-transfers HTTP', res.status, await res.text()); return 0 }
  const data = await res.json()
  const transfers: ArcTokenTransfer[] = data.items ?? []

  let usdcVolume = 0
  for (const tt of transfers) {
    if (tt.token?.address_hash?.toLowerCase() !== USDC_CONTRACT) continue
    if (!tt.total?.value) continue
    try { usdcVolume += parseFloat(formatUnits(BigInt(tt.total.value), 6)) } catch { /* skip */ }
  }
  return usdcVolume
}

async function fetchPassport(address: string): Promise<PassportStats> {
  const url = `${API_BASE}/address/${address}`
  console.log('[Passport] fetch', url)
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    console.error('[Passport] fetch failed for', url, err)
    throw err
  }
  if (!res.ok) { console.error('[Passport] HTTP', res.status, await res.text()); throw new Error(`HTTP ${res.status}`) }
  const data = await res.json()
  const txs: ArcTx[] = data.items ?? []

  const [usdcVolume, realTxCount] = await Promise.all([
    fetchUsdcVolume(address),
    fetchTxCount(address),
  ])

  const firstTxDate = txs.length > 0 ? txs[txs.length - 1].timestamp : null
  const daysActive  = firstTxDate
    ? Math.max(1, Math.floor((Date.now() - new Date(firstTxDate).getTime()) / 86_400_000))
    : 0
  // Fall back to the capped page length only if the counters endpoint failed.
  const txCount = realTxCount ?? txs.length
  const score   = Math.round(txCount * 10 + usdcVolume * 0.1 + daysActive * 5)
  return { txCount, usdcVolume, daysActive, score, firstTxDate, recentTxs: txs.slice(0, 10) }
}

async function fetchModalData(address: string): Promise<ModalData> {
  const url = `${API_BASE}/address/${address}`
  console.log('[ModalData] fetch', url)
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    console.error('[ModalData] fetch failed for', url, err)
    throw err
  }
  if (!res.ok) { console.error('[ModalData] HTTP', res.status, await res.text()); throw new Error(`HTTP ${res.status}`) }
  const data = await res.json()
  const txs: ArcTx[] = data.items ?? []
  const addr = address.toLowerCase()

  let sentCount = 0, receivedCount = 0
  const contracts = new Set<string>()
  const tokens    = new Set<string>()

  for (const tx of txs) {
    const from = tx.from?.hash?.toLowerCase() ?? ''
    const to   = tx.to?.hash?.toLowerCase()
    if (from === addr) sentCount++; else receivedCount++
    if (to) contracts.add(to)
    for (const tt of tx.token_transfers ?? [])
      if (tt.token?.symbol) tokens.add(tt.token.symbol)
  }

  const firstTxDate = txs.length > 0 ? txs[txs.length - 1].timestamp : null
  const lastTxDate  = txs.length > 0 ? txs[0].timestamp : null
  const daysActive  = firstTxDate
    ? Math.max(1, Math.floor((Date.now() - new Date(firstTxDate).getTime()) / 86_400_000))
    : 0

  // Fall back to the capped page length only if the counters endpoint failed.
  const realTxCount     = await fetchTxCount(address)
  const txCount         = realTxCount ?? txs.length
  const uniqueContracts = contracts.size
  const uniqueTokens    = tokens.size
  const raw   = txCount * 2 + uniqueContracts * 20 + daysActive * 1
  const score = Math.min(1000, Math.round(raw))

  return { txCount, sentCount, receivedCount, uniqueContracts, uniqueTokens, daysActive, score, firstTxDate, lastTxDate }
}

// ── Circular score ring (SVG) ────────────────────────────────────────────────
function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r      = size * 0.4
  const circum = 2 * Math.PI * r
  const pct    = Math.min(1, score / 1000)
  const color  = passportColor(score)
  const label  = passportLabel(score)
  const cx     = size / 2

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* track */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth={10} />
        {/* progress */}
        <motion.circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circum}
          initial={{ strokeDashoffset: circum }}
          animate={{ strokeDashoffset: circum * (1 - pct) }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
        />
      </svg>
      <div style={{ marginTop: -size * 0.62, textAlign: 'center', pointerEvents: 'none' }}>
        <div className="text-2xl font-extrabold text-white leading-none">{score}</div>
        <div className="text-[10px] font-semibold mt-0.5" style={{ color }}>{label}</div>
      </div>
    </div>
  )
}

// ── Passport Modal ────────────────────────────────────────────────────────────
interface PassportModalProps {
  address:    string
  ownAddress: string | undefined
  onClose:    () => void
}

function PassportModal({ address, ownAddress, onClose }: PassportModalProps) {
  const { t } = useTranslation()
  const isOwn = ownAddress?.toLowerCase() === address.toLowerCase()

  // Load agent profile if own wallet
  const savedProfile = isOwn ? loadProfile(address) : null
  const agentName    = savedProfile?.name ?? (isOwn ? defaultAgentName(address) : t('passport.anonymousWallet'))
  const agentImage   = savedProfile?.imageUrl ?? ''
  const personalityOpt = PERSONALITY_OPTIONS.find(p => p.id === (savedProfile?.personality ?? 'explorer'))
    ?? PERSONALITY_OPTIONS[0]

  const [data,    setData]    = useState<ModalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [copied,  setCopied]  = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = (silent = false) => {
      if (!silent) { setLoading(true); setError(null); setData(null) }
      fetchModalData(address)
        .then(d => { if (!cancelled) { setData(d); if (!silent) setError(null) } })
        .catch(e => { if (!cancelled && !silent) setError(e instanceof Error ? e.message : t('passport.error')) })
        .finally(() => { if (!cancelled && !silent) setLoading(false) })
    }

    load()
    const interval = setInterval(() => load(true), 15_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [address])

  const copyAddr = () => {
    navigator.clipboard.writeText(address)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const overlayStyle: CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
    background: 'rgba(0,0,0,0.72)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
  }

  const sentPct     = data && data.txCount > 0 ? (data.sentCount / data.txCount) * 100 : 0
  const receivedPct = 100 - sentPct

  return createPortal(
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 16 }}
        animate={{ opacity: 1, scale: 1,    y: 0 }}
        exit={{ opacity: 0, scale: 0.93,    y: 16 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'linear-gradient(160deg, #0d0b1e 0%, #100e22 100%)',
          border: '1px solid rgba(139,92,246,0.28)',
          borderRadius: 20,
          boxShadow: '0 0 60px rgba(139,92,246,0.22), 0 20px 60px rgba(0,0,0,0.6)',
          maxHeight: '90vh',
          overflowY: 'auto',
          paddingBottom: '20px',
        }}
      >
        {/* Drag indicator */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full border-2 border-purple-500/40 bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
              {agentImage
                ? <img src={agentImage} alt={agentName} className="w-full h-full object-cover" />
                : <Bot className="h-6 w-6 text-purple-400" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-tight truncate">{agentName}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {isOwn && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[9px] font-semibold text-purple-300">
                    {personalityOpt.emoji} {personalityOpt.label}
                  </span>
                )}
                <button type="button" onClick={copyAddr}
                  className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-white transition-colors">
                  {truncate(address)}
                  {copied
                    ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-800/70 text-slate-400 hover:text-white transition-colors shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
              <p className="text-sm text-slate-400">{t('passport.loadingIdentity')}</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/8 p-4 text-sm text-red-400 text-center">
              {error}
            </div>
          ) : data ? (
            <>
              {/* ── Score ring ─────────────────────────────────────── */}
              <div className="flex flex-col items-center py-2">
                <ScoreRing score={data.score} size={130} />
                <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest">{t('passport.scoreMax')}</p>
              </div>

              {/* ── Stats 2×3 grid ─────────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { label: t('passport.transactions'),    value: data.txCount.toString() },
                  { label: t('passport.uniqueContracts'), value: data.uniqueContracts.toString() },
                  { label: t('passport.activeTokens'),    value: data.uniqueTokens.toString() },
                  { label: t('passport.walletAge'),       value: data.firstTxDate ? walletAge(data.firstTxDate) : '—' },
                  { label: t('passport.firstActivity'),   value: data.firstTxDate ? fmtDate(data.firstTxDate) : '—' },
                  { label: t('passport.lastActivity'),    value: data.lastTxDate  ? fmtDate(data.lastTxDate)  : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-slate-700/40 bg-slate-900/60 p-3 text-center">
                    <div className="text-sm font-bold text-white truncate">{value}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5 leading-tight">{label}</div>
                  </div>
                ))}
              </div>

              {/* ── Activity bar ───────────────────────────────────── */}
              {data.txCount > 0 && (
                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
                    <span>{t('passport.sentCount', { count: data.sentCount })}</span>
                    <span>{t('passport.receivedCount', { count: data.receivedCount })}</span>
                  </div>
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-800/60">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${sentPct}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                      className="bg-gradient-to-r from-red-500 to-rose-400 h-full"
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${receivedPct}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full"
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[9px] text-slate-600">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500 inline-block"/>{t('passport.sent')}</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block"/>{t('passport.received')}</span>
                  </div>
                </div>
              )}

              {/* ── Footer ─────────────────────────────────────────── */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                <a
                  href={`${EXPLORER_BASE}/address/${address}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('passport.viewOnExplorer')}
                </a>
                <button type="button" onClick={onClose}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                  {t('passport.close')}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </motion.div>
    </div>,
    document.body
  )
}

// ════════════════════════════════════════════════════════════════════════════
export function Agents() {
  const { t } = useTranslation()
  const { address, isConnected } = useArcWallet()
  usePrivy()

  // ── Agent profile ─────────────────────────────────────────────────────────
  const [profile, setProfile] = useState({ name: t('passport.defaultAgentName'), personality: 'explorer', imageUrl: '' })
  useEffect(() => {
    if (!address) return
    const saved = loadProfile(address)
    setProfile(saved ?? { name: defaultAgentName(address), personality: 'explorer', imageUrl: '' })
  }, [address])
  const personalityOpt = PERSONALITY_OPTIONS.find(p => p.id === profile.personality) ?? PERSONALITY_OPTIONS[0]

  // ── Wallet identity ───────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('')
  const [activeAddr,  setActiveAddr]  = useState<string>('')
  const [copied,      setCopied]      = useState(false)
  const [modalAddr,   setModalAddr]   = useState<string | null>(null)

  useEffect(() => { if (address) setActiveAddr(address) }, [address])

  const copyAddr = () => {
    if (!activeAddr) return
    navigator.clipboard.writeText(activeAddr)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  // ── Page passport data ────────────────────────────────────────────────────
  const [stats,      setStats]      = useState<PassportStats | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // `silent` skips the loading/blank-state flicker — used for background polling
  // so the count updates in place as the agent sends new transactions.
  const loadPassport = useCallback(async (addr: string, silent = false) => {
    if (!addr) return
    if (!silent) { setLoading(true); setFetchError(null); setStats(null) }
    try {
      const next = await fetchPassport(addr)
      setStats(next)
      setFetchError(null)
    } catch (e) {
      if (!silent) setFetchError(e instanceof Error ? e.message : t('passport.errorLoadingData'))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!activeAddr) return
    loadPassport(activeAddr)
    const interval = setInterval(() => loadPassport(activeAddr, true), 15_000)
    return () => clearInterval(interval)
  }, [activeAddr, loadPassport])

  const tier = stats ? scoreTier(stats.score) : null

  return (
    <>
      <Helmet>
        <title>{t('passport.metaTitle')}</title>
        <meta name="description" content={t('passport.metaDescription')} />
      </Helmet>

      <AppShell
        title={t('passport.title')}
        subtitle={t('passport.subtitle')}
        titleClassName="text-xl md:text-2xl font-semibold tracking-tight"
        maxWidth="2xl"
        compact
      >
        <div className="space-y-6">

          {/* ── Agent Header ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/80 to-[#0a0a1a]/90 p-5 shadow-xl shadow-cyan-500/5"
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border-2 border-cyan-500/40 bg-slate-800">
                {profile.imageUrl
                  ? <img src={profile.imageUrl} alt={profile.name} className="w-full h-full object-cover" />
                  : <Bot className="h-9 w-9 text-cyan-400" />}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{profile.name}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-0.5 text-xs font-semibold text-purple-300">
                    {personalityOpt.emoji} {personalityOpt.label}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> {t('passport.active')}
                  </span>
                  {tier && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold ${tier.glow} ${tier.color}`}>
                      {tier.label}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Section 1: Wallet Identity ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5"
          >
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
              {t('passport.walletIdentity')}
            </h3>

            {isConnected && address ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 mb-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">{t('passport.yourWallet')}</p>
                  <p className="font-mono text-sm text-white font-semibold break-all">{truncate(address)}</p>
                  {stats?.firstTxDate && (
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {t('passport.activeSince', { date: fmtDate(stats.firstTxDate), days: stats.daysActive })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={copyAddr}
                    className="p-2 rounded-lg hover:bg-slate-700/60 transition-colors">
                    {copied
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      : <Copy className="h-4 w-4 text-slate-400 hover:text-white" />}
                  </button>
                  <button type="button"
                    onClick={() => setModalAddr(address)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-all">
                    {t('passport.viewMyWallet')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 px-4 py-3 mb-4 text-xs text-slate-500 text-center">
                {t('passport.connectToViewIdentity')}
              </div>
            )}

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder={t('passport.searchPlaceholder')}
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value.trim())}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && searchInput) {
                      setActiveAddr(searchInput)
                      setModalAddr(searchInput)
                    }
                  }}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/60 text-base sm:text-sm text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none font-mono"
                />
              </div>
              <button type="button"
                disabled={!searchInput}
                onClick={() => { if (searchInput) { setActiveAddr(searchInput); setModalAddr(searchInput) } }}
                className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-600 bg-slate-800/60 text-sm font-semibold text-slate-200 hover:bg-slate-700/60 disabled:opacity-40 transition-all shrink-0">
                {t('passport.search')}
              </button>
            </div>
          </motion.div>

          {/* ── Section 2: Web3 Passport Score ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-4 w-4 text-slate-400" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                {t('passport.title')}
              </h3>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-6 justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                <span className="text-sm text-slate-400">{t('passport.calculatingScore')}</span>
              </div>
            ) : fetchError ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">{fetchError}</div>
            ) : stats ? (
              <div className="space-y-4">
                <div className="flex items-center gap-5">
                  <div className="text-center">
                    <div className={`text-4xl font-extrabold ${tier?.color ?? 'text-white'}`}>{stats.score}</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">Score</div>
                  </div>
                  <div className="flex-1">
                    <div className="h-3 rounded-full bg-slate-700/60 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (stats.score / 2000) * 100)}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]"
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-600 mt-1">
                      <span>0</span><span>Bronze 100</span><span>Silver 500</span><span>Gold 1k</span><span>💎 2k</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { icon: '📊', label: t('passport.transactions'), value: stats.txCount.toString() },
                    { icon: '💵', label: t('passport.usdcVol'),       value: `$${stats.usdcVolume.toFixed(2)}` },
                    { icon: '📅', label: t('passport.activeDays'),    value: stats.daysActive.toString() },
                  ].map(({ icon, label, value }) => (
                    <div key={label} className="rounded-xl border border-slate-700/40 bg-slate-900/50 p-3 text-center">
                      <div className="text-xl mb-1">{icon}</div>
                      <div className="text-base font-bold text-white">{value}</div>
                      <div className="text-[10px] text-slate-500 font-medium mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 py-6 justify-center">
                <Zap className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-500">{t('passport.enterOrConnect')}</span>
              </div>
            )}
          </motion.div>

          {/* ── Section 3: Recent Activity ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5"
          >
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
              {t('passport.recentActivity')}
            </h3>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3 animate-pulse h-14" />
                ))}
              </div>
            ) : fetchError ? null : !stats || stats.recentTxs.length === 0 ? (
              <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 p-6 text-center text-xs text-slate-500">
                {t('passport.noTransactionsFound')}
              </div>
            ) : (
              <div className="space-y-1.5">
                {stats.recentTxs.map(tx => {
                  const isSent      = tx.from?.hash?.toLowerCase() === activeAddr.toLowerCase()
                  const isContract  = !tx.to
                  const kind        = isContract ? t('passport.contract') : isSent ? t('passport.sent') : t('passport.received')
                  const kindColor   = isContract ? 'text-blue-400' : isSent ? 'text-red-400' : 'text-emerald-400'
                  const counterpart = isSent ? tx.to?.hash : tx.from?.hash
                  const tt          = tx.token_transfers?.[0]
                  const amount      = tt
                    ? `${parseFloat(formatUnits(BigInt(tt.total?.value ?? '0'), tt.token?.decimals ?? 6)).toFixed(4)} ${tt.token?.symbol ?? ''}`
                    : tx.value && tx.value !== '0'
                    ? `${parseFloat(formatUnits(BigInt(tx.value), 18)).toFixed(2)} USDC`
                    : null
                  return (
                    <div key={tx.hash} className="rounded-xl border border-slate-700/40 bg-slate-900/40 px-3.5 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold ${kindColor}`}>{kind}</span>
                          {amount && <span className="text-xs text-white font-mono">{amount}</span>}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                          {counterpart ? truncate(counterpart) : '—'} · {timeAgo(tx.timestamp)}
                        </p>
                      </div>
                      <a href={`${EXPLORER_BASE}/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors">
                        <ExternalLink className="h-3.5 w-3.5 text-slate-500 hover:text-cyan-400 transition-colors" />
                      </a>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>

        </div>
      </AppShell>

      {/* ── Passport Modal ── */}
      <AnimatePresence>
        {modalAddr && (
          <PassportModal
            address={modalAddr}
            ownAddress={address}
            onClose={() => setModalAddr(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
