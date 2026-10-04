import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot, Zap, ExternalLink,
  CheckCircle2, Loader2,
  QrCode, Copy, Send, Link2,
  Sparkles,
} from 'lucide-react'
import QRCode from 'react-qr-code'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { usePrivy } from '@privy-io/react-auth'
import { useArcWallet } from '@/hooks/useArcWallet'
import { authFetch } from '@/lib/api'
import { PersonalizarModal } from '@/components/Agents/AgentPanel'
import { loadProfile, saveProfile, defaultAgentName, type AgentLocalProfile, PERSONALITY_OPTIONS } from '@/components/Agents/agentConstants'
import { AgentChat } from '@/components/Agents/AgentChat'

// ── Tab 1: FajuPay ───────────────────────────────────────────────────────────

const LOCAL_PAYMENT_METHODS = [
  { id: 'pix',  flag: '🇧🇷', name: 'Pix',  region: 'Brazil',         badge: 'Under construction' },
  { id: 'sepa', flag: '🌍', name: 'SEPA', region: 'Europe',         badge: 'Coming soon'   },
  { id: 'ach',  flag: '🇺🇸', name: 'ACH',  region: 'United States', badge: 'Coming soon'   },
] as const

// Try the real logo first, then a couple of CDN fallbacks, before giving up and
// drawing a stand-in icon (two arrows in a blue circle, matching Transak's mark).
const TRANSAK_LOGO_SOURCES = [
  'https://assets.transak.com/images/logo/transak-logo.png',
  'https://transak.com/favicon.ico',
  'https://assets.transak.com/images/logo/transak-logo-light.png',
]

function FajuPay() {
  const { t } = useTranslation()
  const { address, isConnected } = useArcWallet()
  const [mode, setMode] = useState<'receive' | 'send'>('receive')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [txId, setTxId] = useState<string | null>(null)
  const [hoveredCard, setHoveredCard] = useState<'usdc' | 'pix' | null>(null)
  const [transakLogoIdx, setTransakLogoIdx] = useState(0)

  const paymentLink = address && amount
    ? `${window.location.origin}/pay?to=${address}&amount=${amount}`
    : address
    ? `${window.location.origin}/pay?to=${address}`
    : ''

  const qrValue = (() => {
    if (!address) return ''
    const amountValue = parseFloat(amount)
    if (!amount || isNaN(amountValue) || amountValue <= 0) return `ethereum:${address}@5042`
    const valueInWei = Math.round(amountValue * 1_000_000)
    return `ethereum:0x3600000000000000000000000000000000000000@5042/transfer?address=${address}&uint256=${valueInWei}`
  })()

  const copyAddress = () => {
    if (!address) return
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Address copied!')
  }

  const copyLink = () => {
    if (!paymentLink) return
    navigator.clipboard.writeText(paymentLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
    toast.success('Link copied!')
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <QrCode className="h-7 w-7 text-amber-400" />
        </div>
        <p className="text-sm font-semibold text-white">{t('fajuPay.connectWallet')}</p>
        <p className="text-xs text-slate-400 max-w-[200px]">
          {t('fajuPay.connectToUse')}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* ── Card 1: USDC (Receive/Send/QR) — unchanged functionality ── */}
      <motion.div
        whileHover={{ scale: 1.03, y: -4 }}
        onMouseEnter={() => setHoveredCard('usdc')}
        onMouseLeave={() => setHoveredCard(null)}
        style={{ position: 'relative', zIndex: hoveredCard === 'usdc' ? 10 : 1 }}
        className="glass-inner p-4 space-y-4"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-bold text-white">FajuPay</h3>
            <p className="text-xs text-slate-400 mt-0.5">{t('fajuPay.subtitle')}</p>
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-800/60 p-1">
            <button
              type="button"
              onClick={() => setMode('receive')}
              className={`px-3 py-2.5 min-h-[40px] rounded text-xs font-semibold transition-all ${mode === 'receive' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {t('fajuPay.receive')}
            </button>
            <button
              type="button"
              onClick={() => setMode('send')}
              className={`px-3 py-2.5 min-h-[40px] rounded text-xs font-semibold transition-all ${mode === 'send' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {t('fajuPay.send')}
            </button>
          </div>
        </div>

        {mode === 'receive' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="number"
                placeholder={t('fajuPay.amountPlaceholder')}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="input-glass flex-1 w-full min-w-0 px-3 py-3 text-base sm:text-sm [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
              />
              <span className="flex items-center px-3 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-slate-400 font-semibold">USDC</span>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="bg-white p-3 rounded-xl shadow-lg w-full max-w-[200px] mx-auto flex items-center justify-center">
                <QRCode value={qrValue} size={160} style={{ width: '100%', height: 'auto', maxWidth: '160px' }} />
              </div>
              <div className="w-full rounded-lg bg-slate-800/60 border border-slate-700 px-3 py-2 flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono flex-1 truncate">{address}</span>
                <button type="button" onClick={copyAddress} className="shrink-0">
                  {copied
                    ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                    : <Copy className="h-4 w-4 text-slate-400 hover:text-white transition-colors" />}
                </button>
              </div>
            </div>

            {paymentLink && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                <p className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> {t('fajuPay.paymentLink')}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono flex-1 truncate">{paymentLink}</span>
                  <button type="button" onClick={copyLink} className="shrink-0">
                    {linkCopied
                      ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                      : <Copy className="h-4 w-4 text-amber-400 hover:text-amber-300 transition-colors" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'send' && (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Recipient address (0x...)"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              className="input-glass w-full min-w-0 px-3 py-3 text-base sm:text-sm font-mono"
            />
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="input-glass flex-1 w-full min-w-0 px-3 py-3 text-base sm:text-sm [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
              />
              <span className="flex items-center px-3 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-slate-400 font-semibold">USDC</span>
            </div>
            <button
              type="button"
              disabled={!recipient || !amount || sending}
              onClick={async () => {
                if (!address) return
                setSending(true)
                setTxId(null)
                try {
                  const res = await authFetch('/api/send-usdc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fromAddress: address, toAddress: recipient, amountUsdc: amount }),
                  })
                  const data = await res.json()
                  if (!res.ok) throw new Error(data.error ?? 'Failed to send')
                  const id = data.txHash ?? data.transactionId
                  setTxId(id)
                  toast.success(`Sent! ${id?.slice(0, 10)}...`)
                  setRecipient('')
                  setAmount('')
                } catch (err: any) {
                  toast.error(err.message)
                } finally {
                  setSending(false)
                }
              }}
              className="btn-gradient w-full flex items-center justify-center gap-2 py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Sending...' : 'Send USDC'}
            </button>

            {txId && (
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2 text-center">
                <p className="text-xs text-green-400">✅ Transaction sent</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{txId}</p>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* ── Card 2: Local Payments — placeholder, coming soon ── */}
      <motion.div
        whileHover={{ scale: 1.03, y: -4 }}
        onMouseEnter={() => setHoveredCard('pix')}
        onMouseLeave={() => setHoveredCard(null)}
        style={{ position: 'relative', zIndex: hoveredCard === 'pix' ? 10 : 1 }}
        className="glass-inner p-4 space-y-4"
      >
        <div>
          <h3 className="text-lg font-bold" style={{ color: '#32BCAD' }}>Local Payments</h3>
          <p className="text-xs text-slate-400 mt-0.5">Deposit using your local payment method</p>
        </div>

        <div className="space-y-2">
          {LOCAL_PAYMENT_METHODS.map(m => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{m.flag}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{m.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{m.region}</p>
                </div>
              </div>
              <span
                className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  m.id === 'pix'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    : 'border-slate-600/50 bg-slate-700/30 text-slate-400'
                }`}
              >
                {m.badge}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-1 text-center pt-1">
          <a
            href="https://transak.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity"
          >
            {transakLogoIdx < TRANSAK_LOGO_SOURCES.length ? (
              <img
                src={TRANSAK_LOGO_SOURCES[transakLogoIdx]}
                alt="Transak"
                className="h-5 object-contain"
                onError={() => setTransakLogoIdx(i => i + 1)}
              />
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="24" height="24" className="shrink-0">
                  <circle cx="12" cy="12" r="12" fill="#0F80FF" />
                  <path d="M8 14 L8 8 L5 11 M8 8 L11 11" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M16 10 L16 16 L13 13 M16 16 L19 13" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs font-bold tracking-wide" style={{ color: '#0F80FF' }}>Transak</span>
              </>
            )}
          </a>
          <p className="text-[10px] text-slate-500">
            Powered by Transak — official Arc Network partner
          </p>
          <p className="text-[10px] text-slate-600">🚧 Integration in progress</p>
        </div>
      </motion.div>
    </div>
  )
}

// ── Tab 2: Meu Agente ────────────────────────────────────────────────────────

const SOCIAL_DEFS = [
  { id: 'google_oauth',  label: 'Google',     dot: '#4285F4' },
  { id: 'discord_oauth', label: 'Discord',    dot: '#5865F2' },
  { id: 'twitter_oauth', label: 'Twitter/X',  dot: '#000'    },
  { id: 'telegram',      label: 'Telegram',   dot: '#229ED9' },
] as const

function MeuAgenteTab() {
  const { address, isConnected } = useArcWallet()
  const { user } = usePrivy()

  const [profile, setProfile] = useState<AgentLocalProfile>({
    name: 'My Agent', personality: 'explorer', imageUrl: '',
  })
  const [modalOpen, setModalOpen]       = useState(false)
  const [isConfigured, setIsConfigured] = useState(false)
  const [addrCopied, setAddrCopied] = useState(false)

  // Load profile from localStorage
  useEffect(() => {
    if (!address) return
    const saved = loadProfile(address)
    setIsConfigured(saved !== null)
    setProfile(saved ?? { name: defaultAgentName(address), personality: 'explorer', imageUrl: '' })
  }, [address])

  const handleSave = (updated: AgentLocalProfile) => {
    setProfile(updated)
    if (address) saveProfile(address, updated)
    setIsConfigured(true)
    setModalOpen(false)
  }

  const copyWithdrawal = () => {
    if (!profile.withdrawalAddress) return
    navigator.clipboard.writeText(profile.withdrawalAddress)
    setAddrCopied(true)
    setTimeout(() => setAddrCopied(false), 2000)
  }

  const personalityOpt = PERSONALITY_OPTIONS.find(p => p.id === profile.personality) ?? PERSONALITY_OPTIONS[0]
  const linkedAccounts = (user?.linkedAccounts ?? []) as Array<{ type: string }>

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
          <Bot className="h-7 w-7 text-purple-400" />
        </div>
        <p className="text-sm font-semibold text-white">Connect your wallet</p>
        <p className="text-xs text-slate-400 max-w-[200px]">Log in to see your agent</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2 overflow-visible" style={{ height: 'clamp(480px, 80vh, 640px)' }}>

        {/* ── Section 1: Agent Profile ── */}
        <div className="shrink-0 rounded-xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/80 to-[#0a0a1a]/80 p-2.5 space-y-1.5">

          {/* Avatar + name + personality + button */}
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border-2 border-cyan-500/40 bg-slate-800">
              {profile.imageUrl
                ? <img src={profile.imageUrl} alt={profile.name} className="w-full h-full object-cover" />
                : <Bot className="h-4 w-4 text-cyan-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{profile.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-0 text-[9px] font-semibold text-purple-300">
                  {personalityOpt.emoji} {personalityOpt.label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-semibold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-all"
            >
              {isConfigured ? '✏️' : <Sparkles className="h-3 w-3" />}
              {isConfigured ? 'Edit' : 'Customize'}
            </button>
          </div>

          {/* Withdrawal wallet */}
          {profile.withdrawalAddress && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[8px] text-slate-500 uppercase tracking-widest">Withdrawal wallet</p>
                <p className="text-[11px] font-mono text-amber-300 truncate">
                  {profile.withdrawalAddress.slice(0, 8)}…{profile.withdrawalAddress.slice(-6)}
                </p>
              </div>
              <button type="button" onClick={copyWithdrawal}
                className="shrink-0 p-1 rounded-lg hover:bg-slate-700/50 transition-colors">
                {addrCopied
                  ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  : <Copy className="h-3 w-3 text-slate-400" />}
              </button>
            </div>
          )}

          {/* Connected networks */}
          <div>
            <p className="text-[8px] text-slate-500 uppercase tracking-widest mb-1">Linked accounts</p>
            <div className="flex flex-wrap gap-1">
              {SOCIAL_DEFS.map(s => {
                const isLinked = linkedAccounts.some(a => a.type === s.id)
                return (
                  <div key={s.id} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-medium transition-colors ${
                    isLinked
                      ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-300'
                      : 'border-slate-700/50 bg-slate-800/40 text-slate-500'
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.dot }} />
                    {s.label}
                    {isLinked && <CheckCircle2 className="h-2 w-2 text-emerald-400" />}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {modalOpen && (
          <PersonalizarModal profile={profile} onSave={handleSave} onClose={() => setModalOpen(false)} />
        )}
      </AnimatePresence>
    </>
  )
}

// ── Tab 3: Automations ────────────────────────────────────────────────────────

// AutomacoesTab receives personality + address from parent via props
interface AutomacoesTabProps {
  personality: AgentLocalProfile['personality']
  walletAddress?: string
}

function AutomacoesTab({ personality, walletAddress }: AutomacoesTabProps) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-bold text-white">Chat</h3>
        <p className="text-xs text-slate-400 mt-0.5">Chat with your agent and execute on-chain actions</p>
      </div>
      <AgentChat personality={personality} walletAddress={walletAddress} />
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

type StackTab = 'fajupay' | 'agente' | 'automacoes'

export function CircleAgentStack() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<StackTab>('fajupay')

  // Read personality + address so AutomacoesTab (AgentChat) gets the right context
  const { address } = useArcWallet()
  const [profile, setProfile] = useState<AgentLocalProfile>({
    name: 'My Agent', personality: 'explorer', imageUrl: '',
  })
  useEffect(() => {
    if (!address) return
    const saved = loadProfile(address)
    setProfile(saved ?? { name: defaultAgentName(address), personality: 'explorer', imageUrl: '' })
  }, [address])

  const tabs: Array<{ id: StackTab; label: string; icon: typeof QrCode }> = [
    { id: 'fajupay',    label: 'FajuPay',    icon: QrCode  },
    { id: 'agente',     label: t('agentTabs.myAgent'), icon: Bot     },
    { id: 'automacoes', label: 'Chat',        icon: Zap     },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-5 space-y-5"
    >
      {/* Header */}
      <div className="flex items-center gap-3 pb-1 border-b border-slate-800 flex-wrap">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 shrink-0">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white truncate">FajuARC Agent</h2>
          <p className="text-[11px] text-slate-400 truncate">Your smart agent on Arc</p>
        </div>
        <a
          href="https://agents.circle.com"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-cyan-400 transition-colors shrink-0"
        >
          <span className="hidden sm:inline">agents.circle.com</span> <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-800/60 p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 min-h-[44px] text-xs font-semibold transition-all ${
              tab === id
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {tab === 'fajupay'    && <FajuPay />}
          {tab === 'agente'     && <MeuAgenteTab />}
          {tab === 'automacoes' && (
            <AutomacoesTab
              personality={profile.personality}
              walletAddress={address}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
