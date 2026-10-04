import { useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Link2, Loader2, Copy, ExternalLink } from 'lucide-react'
import { usePrivy } from '@privy-io/react-auth'
import toast from 'react-hot-toast'
import { useArcWallet } from '@/hooks/useArcWallet'
import { formatAddress } from '@/lib/formatters'
import { fadeInUp } from '@/lib/motion'
import { CONSTANTS } from '@/config/constants'

// ── SVG icons ─────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0">
      <svg viewBox="0 0 18 18" className="w-3.5 h-3.5">
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
        <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/>
      </svg>
    </div>
  )
}

function DiscordIcon() {
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: '#5865F2' }}>
      <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
    </div>
  )
}

function TwitterIcon() {
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: '#000' }}>
      <svg viewBox="0 0 24 24" fill="white" className="w-3 h-3">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    </div>
  )
}

function TelegramIcon() {
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: '#229ED9' }}>
      <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type LinkedAccount = { type: string; email?: string; username?: string; firstName?: string; first_name?: string }

type SocialDef = {
  type: string
  label: string
  Icon: () => JSX.Element
  linkFn: () => void | Promise<void>
  getDisplayName: (account: LinkedAccount) => string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LinkedAccountsSection() {
  const {
    user,
    authenticated,
    linkGoogle,
    linkDiscord,
    linkTwitter,
    linkTelegram,
  } = usePrivy()
  const { address, authMethod } = useArcWallet()
  const [linking, setLinking] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!authenticated || authMethod !== 'social') return null

  const linkedAccounts = (user?.linkedAccounts ?? []) as LinkedAccount[]

  const socials: SocialDef[] = [
    {
      type: 'google_oauth',
      label: 'Google',
      Icon: GoogleIcon,
      linkFn: linkGoogle,
      getDisplayName: (a) => a.email ?? 'Google',
    },
    {
      type: 'discord_oauth',
      label: 'Discord',
      Icon: DiscordIcon,
      linkFn: linkDiscord,
      getDisplayName: (a) => (a.username ?? a.email ?? 'Discord').split('#')[0],
    },
    {
      type: 'twitter_oauth',
      label: 'Twitter / X',
      Icon: TwitterIcon,
      linkFn: linkTwitter,
      getDisplayName: (a) => a.username ? `@${a.username}` : 'Twitter',
    },
    {
      type: 'telegram',
      label: 'Telegram',
      Icon: TelegramIcon,
      linkFn: linkTelegram,
      getDisplayName: (a) => a.firstName ?? a.first_name ?? a.username ?? 'Telegram',
    },
  ]

  const handleLink = async (social: SocialDef) => {
    if (linking) return
    setLinking(social.type)
    try {
      await Promise.resolve(social.linkFn())
      toast.success(`${social.label} linked successfully!`)
    } catch (err: any) {
      const msg = String(err?.message ?? err)
      if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('dismiss')) {
        toast.error(`Error linking ${social.label}`)
      }
    } finally {
      setLinking(null)
    }
  }

  const copyAddress = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('Address copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const openExplorer = () => {
    if (!address) return
    window.open(`${CONSTANTS.LINKS.explorer}/address/${address}`, '_blank')
  }

  return (
    <motion.div
      {...fadeInUp}
      transition={{ ...fadeInUp.transition, delay: 0.12 }}
      className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-slate-900/80 to-[#0a0a1a]/90 p-5 shadow-xl shadow-purple-500/5"
    >
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
        My Accounts
      </h3>

      <div className="space-y-2.5 mb-4">
        {socials.map((social) => {
          const account = linkedAccounts.find(a => a.type === social.type)
          const isLinking = linking === social.type

          return (
            <div
              key={social.type}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 border transition-colors ${
                account
                  ? 'border-emerald-500/25 bg-emerald-500/5'
                  : 'border-slate-700/50 bg-slate-900/40'
              }`}
            >
              <social.Icon />
              <span className="text-sm font-medium text-slate-300 min-w-[72px]">
                {social.label}
              </span>
              {account ? (
                <span className="flex items-center gap-1.5 text-sm text-emerald-400 font-semibold flex-1 min-w-0 truncate">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {social.getDisplayName(account)}
                </span>
              ) : (
                <button
                  onClick={() => handleLink(social)}
                  disabled={!!linking}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-300 hover:bg-purple-500/20 disabled:opacity-50 transition-all"
                >
                  {isLinking
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Linking…</>
                    : <><Link2 className="h-3 w-3" /> Link</>}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Shared wallet */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
          Shared wallet
        </p>
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-sm text-amber-300">
            {address ? formatAddress(address) : '—'}
          </p>
          {address && (
            <div className="flex items-center gap-1">
              <button
                onClick={copyAddress}
                title="Copy address"
                className="rounded-lg p-1.5 text-slate-500 hover:text-amber-300 hover:bg-slate-800 transition-colors"
              >
                {copied
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={openExplorer}
                title="View on Explorer"
                className="rounded-lg p-1.5 text-slate-500 hover:text-amber-300 hover:bg-slate-800 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
        <p className="mt-1.5 text-[10px] text-slate-600 leading-relaxed">
          All linked accounts automatically share this wallet.
        </p>
      </div>
    </motion.div>
  )
}
