/**
 * AgentPanel + PersonalizarModal
 *
 * TAREFA 1: Config `createOnLogin: 'users-without-wallets'` já está correta em
 *           privy.ts. Redes adicionais devem ser VINCULADAS via linkGoogle/linkDiscord
 *           etc. (não como logins separados). Este modal exibe os botões de vínculo.
 *
 * TAREFA 2: Campo "Carteira de saque (EVM)" + botão Sacar (com confirmação).
 *
 * TAREFA 3: Modal 2 colunas (desktop ≥640px) / 1 coluna (mobile <640px).
 *           Esquerda: avatar + AI + nome + carteira de saque.
 *           Direita: personalidade + redes vinculadas.
 *           Salvar full-width.
 */

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useDragControls } from 'framer-motion'
import {
  Sparkles, X, Check, Loader2, Link2, AlertCircle,
  Send, CheckCircle2, Bot, Wallet, Copy,
} from 'lucide-react'
import { usePrivy } from '@privy-io/react-auth'
import { isAddress } from 'viem'
import { useArcWallet } from '@/hooks/useArcWallet'
import { fadeInUp } from '@/lib/motion'
import { authFetch } from '@/lib/api'
import { AvatarUpload } from './AvatarUpload'
import { LinkedAccountsSection } from './LinkedAccountsSection'
import {
  loadProfile,
  saveProfile,
  defaultAgentName,
  PERSONALITY_OPTIONS,
  resizeImageToDataUrl,
  CAPABILITIES,
  type AgentLocalProfile,
} from './agentConstants'
import toast from 'react-hot-toast'

// ── Social icons (compact, 20×20) ─────────────────────────────────────────────

function SmGoogle() {
  return (
    <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
      <svg viewBox="0 0 18 18" className="w-3 h-3">
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
        <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/>
      </svg>
    </div>
  )
}

function SmDiscord() {
  return (
    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#5865F2' }}>
      <svg viewBox="0 0 24 24" fill="white" className="w-3 h-3">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
    </div>
  )
}

function SmTwitter() {
  return (
    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#000' }}>
      <svg viewBox="0 0 24 24" fill="white" className="w-2.5 h-2.5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    </div>
  )
}

function SmTelegram() {
  return (
    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#229ED9' }}>
      <svg viewBox="0 0 24 24" fill="white" className="w-3 h-3">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
    </div>
  )
}

// ── Social account type ────────────────────────────────────────────────────────

type LinkedAccount = { type: string; email?: string; username?: string; firstName?: string; first_name?: string }

// ── WithdrawalSection ─────────────────────────────────────────────────────────

interface WithdrawalSectionProps {
  address?: `0x${string}`
  withdrawalAddress: string
  setWithdrawalAddress: (v: string) => void
  sendUsdc: (to: string, amountUsdc: string) => Promise<void>
}

function WithdrawalSection({
  withdrawalAddress,
  setWithdrawalAddress,
  sendUsdc,
}: WithdrawalSectionProps) {
  const { user, linkWallet } = usePrivy()
  const [manualMode, setManualMode] = useState(false)
  const [linking, setLinking] = useState(false)
  const [amount, setAmount] = useState('')
  const [confirmStep, setConfirmStep] = useState(false)
  const [sending, setSending] = useState(false)

  // External (non-embedded) wallets verified via Privy's linkWallet flow
  const externalWallets = ((user?.linkedAccounts ?? []) as any[]).filter(
    (a) =>
      a.type === 'wallet' &&
      a.walletClientType !== 'privy' &&
      a.connectorType !== 'embedded'
  )

  // Is the current withdrawal address one that Privy verified?
  const isVerified =
    withdrawalAddress.length > 0 &&
    externalWallets.some(
      (w) => w.address?.toLowerCase() === withdrawalAddress.toLowerCase()
    )

  // After linkWallet() succeeds, Privy updates user.linkedAccounts.
  // We watch the count and auto-populate the newest verified wallet.
  const prevCountRef = useRef(externalWallets.length)
  const walletsRef = useRef(externalWallets)
  walletsRef.current = externalWallets
  useEffect(() => {
    if (walletsRef.current.length > prevCountRef.current) {
      const newest = walletsRef.current[walletsRef.current.length - 1]
      if (newest?.address) {
        setWithdrawalAddress(newest.address)
        setManualMode(false)
      }
    }
    prevCountRef.current = walletsRef.current.length
  }, [externalWallets.length, setWithdrawalAddress])

  // Manual-mode: address is set but not in Privy's verified list
  const showManual = manualMode || (withdrawalAddress.length > 0 && !isVerified)
  const manualAddrValid = showManual && isAddress(withdrawalAddress)
  const manualAddrError = showManual && withdrawalAddress.length > 0 && !isAddress(withdrawalAddress)
  const hasValidDest = isVerified || manualAddrValid

  const truncate = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  const handleLinkWallet = async () => {
    setLinking(true)
    try {
      await (linkWallet as () => Promise<void>)()
    } catch (err: any) {
      const msg = String(err?.message ?? err)
      if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('dismiss')) {
        toast.error('Error connecting wallet')
      }
    } finally {
      setLinking(false)
    }
  }

  const handleSend = async () => {
    if (!hasValidDest || !amount || parseFloat(amount) <= 0) return
    setSending(true)
    try {
      await sendUsdc(withdrawalAddress, amount)
      toast.success(`${amount} USDC sent successfully!`)
      setAmount('')
      setConfirmStep(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error withdrawing')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
        <Wallet className="h-3.5 w-3.5" />
        Withdrawal Wallet
      </label>

      {/* ── STATE: wallet verified via Privy ── */}
      {isVerified && !showManual ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-3 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono font-semibold text-white">{truncate(withdrawalAddress)}</p>
            <p className="text-[10px] text-emerald-400/80 mt-0.5">Verified via Privy</p>
          </div>
          <button
            onClick={() => { setWithdrawalAddress(''); setManualMode(false) }}
            className="text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            Change
          </button>
        </div>
      ) : showManual ? (
        /* ── STATE: manual mode (fallback) ── */
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Paste address manually</span>
            <button
              onClick={() => { setManualMode(false); setWithdrawalAddress('') }}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              ← Back
            </button>
          </div>
          <input
            type="text"
            placeholder="0x..."
            value={withdrawalAddress}
            onChange={(e) => setWithdrawalAddress(e.target.value.trim())}
            className={`w-full rounded-lg border bg-slate-800/60 px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none transition-colors ${
              manualAddrError
                ? 'border-red-500/50 focus:border-red-500'
                : manualAddrValid
                ? 'border-slate-500/50 focus:border-slate-400'
                : 'border-slate-700 focus:border-cyan-500/50'
            }`}
          />
          {manualAddrError && (
            <p className="flex items-center gap-1 text-[11px] text-red-400">
              <AlertCircle className="h-3 w-3 shrink-0" />
              Invalid format — 0x + 40 hex
            </p>
          )}
          {manualAddrValid && (
            <p className="flex items-center gap-1 text-[11px] text-slate-500">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              Valid address (not verified)
            </p>
          )}
        </div>
      ) : (
        /* ── STATE: no wallet — show connect button ── */
        <div className="space-y-2">
          <button
            onClick={handleLinkWallet}
            disabled={linking}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2.5 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50 transition-all"
          >
            {linking ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Connecting...</>
            ) : (
              <><Wallet className="h-4 w-4" /> Connect withdrawal wallet</>
            )}
          </button>
          <button
            type="button"
            onClick={() => setManualMode(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/20 transition-all"
          >
            <Copy className="h-4 w-4" />
            Paste address manually
          </button>
        </div>
      )}

      {/* ── Amount + Withdraw button (appears when destination is set) ── */}
      {hasValidDest && (
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            inputMode="decimal"
            placeholder="USDC amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/,/g, '.'))}
            className="flex-1 min-w-0 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-base sm:text-sm text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
          />
          <button
            onClick={() => setConfirmStep(true)}
            disabled={!amount || parseFloat(amount) <= 0}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 min-h-[44px] text-xs font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 transition-all shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            Withdraw
          </button>
        </div>
      )}

      {/* ── Confirmation dialog ── */}
      <AnimatePresence>
        {confirmStep && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.78)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmStep(false) }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 12 }}
              className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-[#0d0d1e] p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-bold text-white mb-2">Confirm withdrawal</h3>
              <p className="text-xs text-slate-400 mb-2">
                Sending{' '}
                <span className="text-white font-semibold">{amount} USDC</span> to:
              </p>
              <div className="rounded-lg bg-slate-800/70 px-3 py-2 mb-3 break-all font-mono text-xs text-amber-300">
                {withdrawalAddress}
              </div>
              {isVerified && (
                <p className="flex items-center gap-1 text-[11px] text-emerald-400 mb-3">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  Wallet verified via Privy
                </p>
              )}
              <p className="flex items-start gap-1.5 text-[11px] text-red-400 mb-4">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Irreversible action. Double-check the address.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmStep(false)}
                  className="flex-1 rounded-xl border border-slate-600 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500/20 border border-red-500/40 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : '✓ Confirm'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── SocialLinksInModal ────────────────────────────────────────────────────────
// Mostra redes vinculadas + botões "Vincular" dentro do modal.
// TAREFA 1: as redes são sempre VINCULADAS (linkGoogle/linkDiscord/etc.), nunca
// criando uma nova conta/wallet separada.

function SocialLinksInModal() {
  const {
    user,
    authenticated,
    linkGoogle,
    linkDiscord,
    linkTwitter,
    linkTelegram,
  } = usePrivy()
  const [linkingId, setLinkingId] = useState<string | null>(null)

  if (!authenticated) return null

  const accounts = (user?.linkedAccounts ?? []) as LinkedAccount[]

  const socials = [
    {
      id: 'google_oauth',
      label: 'Google',
      Icon: SmGoogle,
      linkFn: linkGoogle,
      getName: (a: LinkedAccount) => a.email ?? 'Google',
    },
    {
      id: 'discord_oauth',
      label: 'Discord',
      Icon: SmDiscord,
      linkFn: linkDiscord,
      getName: (a: LinkedAccount) => (a.username ?? 'Discord').split('#')[0],
    },
    {
      id: 'twitter_oauth',
      label: 'Twitter',
      Icon: SmTwitter,
      linkFn: linkTwitter,
      getName: (a: LinkedAccount) => a.username ? `@${a.username}` : 'Twitter',
    },
    {
      id: 'telegram',
      label: 'Telegram',
      Icon: SmTelegram,
      linkFn: linkTelegram,
      getName: (a: LinkedAccount) => a.firstName ?? a.first_name ?? a.username ?? 'Telegram',
    },
  ]

  const handleLink = async (id: string, fn: () => void | Promise<void>) => {
    if (linkingId) return
    setLinkingId(id)
    try {
      await Promise.resolve(fn())
      toast.success('Account linked!')
    } catch (err: any) {
      const msg = String(err?.message ?? err)
      if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('dismiss')) {
        toast.error('Error linking account')
      }
    } finally {
      setLinkingId(null)
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">
        Linked Accounts
      </label>

      <div className="space-y-1.5">
        {socials.map(({ id, label, Icon, linkFn, getName }) => {
          const account = accounts.find((a) => a.type === id)
          const isLinking = linkingId === id
          return (
            <div
              key={id}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs transition-colors ${
                account
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : 'border-slate-700/40 bg-slate-900/30'
              }`}
            >
              <Icon />
              <span className="font-medium text-slate-300 w-14 shrink-0">{label}</span>
              {account ? (
                <span className="flex items-center gap-1 text-emerald-400 font-semibold flex-1 truncate">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  {getName(account)}
                </span>
              ) : (
                <button
                  onClick={() => handleLink(id, linkFn)}
                  disabled={!!linkingId}
                  className="ml-auto flex items-center gap-1 rounded-lg border border-purple-500/40 bg-purple-500/10 px-2.5 py-1 text-[11px] font-semibold text-purple-300 hover:bg-purple-500/20 disabled:opacity-50 transition-all"
                >
                  {isLinking
                    ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Linking…</>
                    : <><Link2 className="h-2.5 w-2.5" /> Link</>}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-slate-600 leading-relaxed">
        Linking ≠ new login. All accounts share the same embedded wallet.
      </p>
    </div>
  )
}

// ── PersonalizarModal ─────────────────────────────────────────────────────────
// 2 colunas no desktop (sm+), 1 coluna no mobile.

type ModalProps = {
  profile: AgentLocalProfile
  onSave: (p: AgentLocalProfile) => void
  onClose: () => void
}

export function PersonalizarModal({ profile, onSave, onClose }: ModalProps) {
  const [draft, setDraft] = useState<AgentLocalProfile>({ ...profile })
  const [withdrawalAddress, setWithdrawalAddress] = useState(profile.withdrawalAddress ?? '')
  const [saving, setSaving] = useState(false)
  const selectedFileRef = useRef<File | null>(null)

  const { sendUsdc, address } = useArcWallet()
  const dragControls = useDragControls()

  const handleFileSelect = (file: File) => {
    selectedFileRef.current = file
    setDraft((d) => ({ ...d, imageUrl: '__pending__' }))
  }

  const handleSave = async () => {
    setSaving(true)
    let imageUrl = draft.imageUrl

    if (selectedFileRef.current) {
      try {
        // Resize to max 200×200 px before converting to base64 so the result
        // stays well within localStorage quota (~5 KB vs. potentially 1+ MB raw).
        imageUrl = await resizeImageToDataUrl(selectedFileRef.current, 200, 0.82)
      } catch {
        imageUrl = profile.imageUrl
      }
      selectedFileRef.current = null
    }
    if (imageUrl === '__pending__') imageUrl = profile.imageUrl

    // Salvar endereço de saque no backend (silencioso se falhar)
    if (address && withdrawalAddress && isAddress(withdrawalAddress)) {
      authFetch('/api/wallet/withdrawal-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, withdrawalAddress }),
      }).catch(() => {})
    }

    setSaving(false)
    onSave({ ...draft, imageUrl, withdrawalAddress: withdrawalAddress || undefined })
  }


  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0.12}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.9 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          margin: 'auto',
        }}
        className="rounded-2xl border border-cyan-500/25 bg-[#0d0d1e]/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden select-none"
      >
        {/* Drag handle */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="flex flex-col items-center pt-3 pb-2 cursor-grab active:cursor-grabbing bg-[#0f0f1f] border-b border-slate-800/60"
        >
          <div className="w-10 h-1 rounded-full bg-slate-600 mb-2" />
          <div className="flex items-center justify-between w-full px-5">
            <h2 className="text-base font-bold text-white">Customize Agent</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div
          className="overflow-y-auto p-4 sm:p-5"
          style={{ maxHeight: 'calc(92vh - 64px)' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* 2-column grid (desktop) / 1-column (mobile) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">

            {/* ── LEFT COLUMN ── */}
            <div className="space-y-4">

              {/* Avatar */}
              <div className="flex justify-center">
                <AvatarUpload
                  currentAvatarUrl={draft.imageUrl === '__pending__' ? undefined : draft.imageUrl}
                  onFileSelect={handleFileSelect}
                />
              </div>

              {/* Agent name */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Agent name
                </label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-base sm:text-sm text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>

              {/* Withdrawal wallet */}
              <WithdrawalSection
                address={address}
                withdrawalAddress={withdrawalAddress}
                setWithdrawalAddress={setWithdrawalAddress}
                sendUsdc={sendUsdc}
              />
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="space-y-4">

              {/* Personality */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Personality
                </label>
                <div className="space-y-2">
                  {PERSONALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setDraft((d) => ({ ...d, personality: opt.id }))}
                      className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                        draft.personality === opt.id
                          ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-100'
                          : 'border-slate-700/60 bg-slate-900/50 text-slate-300 hover:border-slate-600/80'
                      }`}
                    >
                      <span className="text-xl leading-none flex-shrink-0">{opt.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold leading-5">{opt.label}</div>
                        <div className="text-[10px] text-slate-400 leading-4 mt-0.5 truncate">
                          {opt.desc}
                        </div>
                      </div>
                      {draft.personality === opt.id && (
                        <Check className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Linked accounts */}
              <SocialLinksInModal />
            </div>
          </div>

          {/* Save — full width, spans both columns */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 transition-all shadow-lg shadow-cyan-500/20"
          >
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
              : <><Check className="h-4 w-4" /> Save</>}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  )
}

// ── AgentPanel ────────────────────────────────────────────────────────────────

export function AgentPanel() {
  const { address, isConnected } = useArcWallet()
  const [modalOpen, setModalOpen] = useState(false)
  const [profile, setProfile] = useState<AgentLocalProfile>({
    name: 'My Agent',
    personality: 'explorer',
    imageUrl: '',
  })

  useEffect(() => {
    if (!address) return
    const saved = loadProfile(address)
    setProfile(saved ?? { name: defaultAgentName(address), personality: 'explorer', imageUrl: '' })
  }, [address])

  const handleSave = (updated: AgentLocalProfile) => {
    setProfile(updated)
    if (address) saveProfile(address, updated)
    setModalOpen(false)
  }

  const personalityOpt = PERSONALITY_OPTIONS.find((p) => p.id === profile.personality) ?? PERSONALITY_OPTIONS[0]

  return (
    <>
      <div className="space-y-4">
        <motion.div
          {...fadeInUp}
          className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/80 to-[#0a0a1a]/90 p-5 shadow-xl shadow-cyan-500/5"
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-20 h-20 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border-2 border-cyan-500/40 bg-slate-800">
              {profile.imageUrl
                ? <img
                    src={profile.imageUrl}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                    onError={() => setProfile((p) => ({ ...p, imageUrl: '' }))}
                  />
                : <Bot className="h-10 w-10 text-cyan-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white truncate">{profile.name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-0.5 text-xs font-semibold text-purple-300">
                  {personalityOpt.emoji} {personalityOpt.label}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
                </span>
              </div>
              {!isConnected && (
                <p className="mt-1.5 text-xs text-slate-500">Connect your wallet to save the profile</p>
              )}
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="flex-shrink-0 flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400/50 transition-all"
            >
              <Sparkles className="h-4 w-4" /> Customize agent
            </button>
          </div>
        </motion.div>

        <LinkedAccountsSection />

        <motion.div {...fadeInUp} transition={{ ...fadeInUp.transition, delay: 0.06 }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Capabilities</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CAPABILITIES.map((cap) => (
              <div
                key={cap.title}
                className={`rounded-xl border p-3.5 space-y-2 transition-colors ${
                  cap.active
                    ? 'border-cyan-500/30 bg-cyan-500/5'
                    : 'border-slate-700/50 bg-slate-900/40'
                }`}
              >
                <span className="text-2xl leading-none">{cap.emoji}</span>
                <div>
                  <div className="text-sm font-bold text-white">{cap.title}</div>
                  <div className="text-[11px] text-slate-400 leading-4 mt-0.5">{cap.desc}</div>
                </div>
                {cap.active
                  ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">✅ Active</span>
                  : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">🔜 Coming soon</span>}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {modalOpen && (
          <PersonalizarModal profile={profile} onSave={handleSave} onClose={() => setModalOpen(false)} />
        )}
      </AnimatePresence>
    </>
  )
}
