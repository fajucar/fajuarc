import { useLoginWithOAuth, useLoginWithTelegram, usePrivy } from '@privy-io/react-auth'
import { Loader2 } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'

type SocialProvider = 'twitter' | 'google' | 'discord' | 'telegram'

/**
 * Mapeia erros do Privy para mensagens amigáveis em português.
 * Cobre: unknown_auth_error, cancelamento, popup bloqueado, Telegram sem bot, timeout.
 */
function mapPrivyError(err: unknown): string {
  const e = err as { code?: string; type?: string; message?: string; shortMessage?: string }
  const code = (e?.code ?? e?.type ?? '').toLowerCase()
  const raw = (e?.shortMessage ?? e?.message ?? String(err))
  const rawLow = raw.toLowerCase()

  if (code === 'unknown_auth_error' || rawLow.includes('unknown_auth_error')) {
    return ''
  }
  if (code === 'user_exited_auth_flow' || /user.*exit|user.*cancel|user.*clos|user.*denied|rejected/i.test(raw)) {
    return 'Login cancelled. Try again.'
  }
  if (/popup.*block|block.*popup/i.test(raw)) {
    return 'Popup blocked by the browser. Allow popups for this site and try again.'
  }
  if (/telegram.*bot|bot.*not.*config|telegram.*not.*set|widget.*fail/i.test(raw)) {
    return 'Telegram requires additional configuration in the Privy dashboard. Use Google, Twitter or Discord.'
  }
  if (/network|timeout|timed.?out/i.test(raw)) {
    return 'Time out. Check your connection and try again.'
  }
  if (/not.*support|unsupport/i.test(raw)) {
    return 'Method not supported. Use another provider.'
  }
  return raw.length > 120 ? raw.slice(0, 120) + '…' : raw
}

const SOCIAL_PROVIDERS: Array<{
  id: SocialProvider
  label: string
  icon: React.ReactNode
  colorClass: string
}> = [
  {
    id: 'google',
    label: 'Google',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
    colorClass: 'hover:border-red-500/40 hover:bg-red-500/10',
  },
  {
    id: 'twitter',
    label: 'Twitter / X',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    colorClass: 'hover:border-sky-500/50 hover:bg-sky-500/10',
  },
  {
    id: 'discord' as const,
    label: 'Discord',
    icon: (
      <svg viewBox="0 0 127.14 96.36" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
        <path fill="#5865F2" d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"/>
      </svg>
    ),
    colorClass: 'hover:border-indigo-500/50 hover:bg-indigo-500/10',
  },
  {
    id: 'telegram' as const,
    label: 'Telegram',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current text-blue-400" aria-hidden="true">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
    colorClass: 'hover:border-blue-500/50 hover:bg-blue-500/10',
  },
]

interface SocialLoginSectionProps {
  onSuccess?: () => void
}

export function SocialLoginSection({ onSuccess }: SocialLoginSectionProps) {
  const [activeProvider, setActiveProvider] = useState<SocialProvider | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { ready: privyReady, authenticated } = usePrivy()

  // Safety timeout: reseta se o OAuth não redirecionar a tempo.
  // Telegram tem 30s (widget pode demorar); outros providers têm 15s.
  useEffect(() => {
    if (activeProvider === null) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      return
    }
    const isTelegram = activeProvider === 'telegram'
    const timeoutMs = isTelegram ? 30_000 : 15_000
    timeoutRef.current = setTimeout(() => {
      setActiveProvider(null)
      setError(
        isTelegram
          ? 'Telegram timed out. Check if the bot is configured in the Privy dashboard or use another method.'
          : 'Time out. Try again or use another login method.'
      )
    }, timeoutMs)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [activeProvider])

  const { initOAuth } = useLoginWithOAuth({
    onComplete: () => {
      setActiveProvider(null)
      setError(null)
      onSuccess?.()
    },
    onError: (err: unknown) => {
      setActiveProvider(null)
      const msg = mapPrivyError(err)
      if (msg) { setError(msg); toast.error(msg) }
    },
  })

  const { login: telegramLogin } = useLoginWithTelegram({
    onComplete: () => {
      setActiveProvider(null)
      setError(null)
      onSuccess?.()
    },
    onError: (err: unknown) => {
      setActiveProvider(null)
      const msg = mapPrivyError(err)
      if (msg) { setError(msg); toast.error(msg) }
    },
  })

  const handleSocialLogin = async (provider: SocialProvider) => {
    // Bug fix: guard prevents firing when Privy isn't ready yet (caused first-click failures)
    // and prevents re-login when the user is already authenticated.
    if (!privyReady || authenticated || activeProvider !== null) return

    setActiveProvider(provider)
    setError(null)

    if (provider === 'telegram') {
      try {
        await telegramLogin()
      } catch (err: unknown) {
        setActiveProvider(null)
        const msg = mapPrivyError(err)
        if (msg) { setError(msg); toast.error(msg) }
      }
      return
    }

    try {
      // Bug fix: await instead of void — errors are now properly caught.
      // Bug fix: removed the setTimeout retry that was calling initOAuth a
      // second time (caused duplicate OAuth flows → separate Privy accounts
      // → separate embedded wallets per social network).
      await initOAuth({ provider })
    } catch (err: unknown) {
      setActiveProvider(null)
      const msg = mapPrivyError(err)
      if (msg) { setError(msg); toast.error(msg) }
    }
  }

  // Bug fix: include !privyReady so buttons stay disabled during initialisation.
  const isAnyLoading = activeProvider !== null
  const isDisabled = isAnyLoading || !privyReady

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-widest text-center">
        Sign in with social
      </p>
      <div className="space-y-2">
        {SOCIAL_PROVIDERS.map((provider) => {
          const isLoading = activeProvider === provider.id
          const isComingSoon = provider.id === 'telegram'

          if (isComingSoon) {
            return (
              <button
                key={provider.id}
                type="button"
                disabled
                className="w-full flex items-center gap-3 rounded-xl border border-slate-700/40 bg-slate-800/30 px-4 py-3 text-left opacity-50 cursor-not-allowed"
              >
                <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                  {provider.icon}
                </span>
                <span className="text-sm font-medium text-slate-400 flex-1">
                  Continue with {provider.label}
                </span>
                <span className="shrink-0 rounded-full bg-cyan-500/20 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-semibold text-cyan-400 uppercase tracking-wide">
                  Coming soon
                </span>
              </button>
            )
          }

          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => handleSocialLogin(provider.id)}
              disabled={isDisabled}
              className={[
                'w-full flex items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-800/50 px-4 py-3',
                'text-left transition-colors duration-150',
                isDisabled
                  ? 'opacity-50 cursor-not-allowed'
                  : `cursor-pointer ${provider.colorClass}`,
              ].join(' ')}
            >
              <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                {isLoading
                  ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  : provider.icon}
              </span>
              <span className="text-sm font-medium text-slate-200">
                {!privyReady ? 'Loading...' : isLoading ? 'Connecting...' : `Continue with ${provider.label}`}
              </span>
            </button>
          )
        })}
      </div>
      {error && (
        <p className="text-[11px] text-red-400 text-center bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <p className="text-[11px] text-slate-500 text-center leading-relaxed px-2">
        An EVM wallet will be automatically created for you on Arc Network.
      </p>
    </div>
  )
}
