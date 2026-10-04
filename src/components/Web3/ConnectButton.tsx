import { useState, useEffect } from 'react'
import { useConnection, useDisconnect, useEnsName, useEnsAvatar, useChainId, useSwitchChain } from 'wagmi'
import { Wallet, LogOut, Copy, ExternalLink, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePrivy, useCreateWallet, useWallets } from '@privy-io/react-auth'
import { useWalletModal } from '@/contexts/WalletModalContext'
import { CONSTANTS } from '@/config/constants'
import { formatAddress } from '@/lib/formatters'
import { arcMainnet } from '@/config/chains'
import { clearWagmiStorage } from '@/lib/wagmiStorage'
import { useArcWallet } from '@/hooks/useArcWallet'
import toast from 'react-hot-toast'

function getExpectedChainId(): number {
  try {
    const chainIdEnv = import.meta.env.VITE_CHAIN_ID
    if (chainIdEnv && typeof chainIdEnv === 'string') {
      const parsed = Number(chainIdEnv)
      if (!isNaN(parsed) && parsed > 0) return parsed
    }
  } catch { /* noop */ }
  return arcMainnet.id
}

const EXPECTED_CHAIN_ID = getExpectedChainId()

export function ConnectButton() {
  const { openModal } = useWalletModal()
  const [showDropdown, setShowDropdown] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isSwitchingChain, setIsSwitchingChain] = useState(false)
  // privyTimedOut removido — causava o bug de double-click (ver isPrivyReady abaixo)
  const [isCreatingWallet, setIsCreatingWallet] = useState(false)
  const [walletSetupTimedOut, setWalletSetupTimedOut] = useState(false)
  const [walletError, setWalletError] = useState<string | null>(null)
  const [displayAddress, setDisplayAddress] = useState<`0x${string}` | undefined>(undefined)
  const { address: wagmiAddress, isConnected: wagmiConnected } = useConnection()
  const chainId = useChainId()
  const { mutateAsync: switchChainAsync } = useSwitchChain()
  const { mutateAsync: disconnectAsync } = useDisconnect()
  const { data: ensName } = useEnsName({ address: wagmiAddress })
  const { data: ensAvatar } = useEnsAvatar({
    name: ensName && typeof ensName === 'string' ? ensName : undefined,
  })

  const { logout: privyLogout, ready: privyReady, authenticated: privyAuthenticated, user: privyUser } = usePrivy()
  const { createWallet } = useCreateWallet()
  const { address, isConnected, socialLabel, socialAvatar, pendingGoogleWallet } = useArcWallet()
  const { wallets: privyWallets } = useWallets()

  // Privy embedded em background — não bloqueia header se sessão backend já existe
  useEffect(() => {
    if (!pendingGoogleWallet || address) {
      setWalletSetupTimedOut(false)
      setWalletError(null)
      return
    }
    const t = setTimeout(() => setWalletSetupTimedOut(true), 20000)
    return () => clearTimeout(t)
  }, [pendingGoogleWallet, address])

  // FIX double-click: NÃO usar privyTimedOut aqui.
  // O timeout de 1s habilitava o botão "Sign in" antes de privyReady=true,
  // então o modal abria com os botões sociais ainda em "Carregando..." (disabled).
  // O usuário clicava no botão social → bloqueado. Clicava de novo quando habilitava → funcionava.
  // Solução: esperar o privyReady real antes de habilitar o botão externo.
  // privyAuthenticated cobre o caso de volta de OAuth (usuário já logado).
  const isPrivyReady = privyReady || privyAuthenticated

  // Derive effective values — picks up Privy wallet as soon as it's created,
  // even before wagmi syncs or useArcWallet resolves the address.
  const effectiveAddress = address ?? displayAddress
  const effectiveIsConnected = isConnected || (privyAuthenticated && !!displayAddress)

  const isWrongNetwork = wagmiConnected && chainId !== EXPECTED_CHAIN_ID

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    if (!showDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-wallet-dropdown]')) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showDropdown])

  // Track Privy wallet address directly so header updates immediately after login,
  // without waiting for wagmi to sync the embedded wallet connection.
  useEffect(() => {
    if (privyAuthenticated && privyWallets.length > 0) {
      // Prefer the Privy embedded wallet over wallets[0] (order is not guaranteed)
      const embedded = privyWallets.find(
        (w) => w.walletClientType === 'privy' || w.walletClientType === 'privy-v2' || w.connectorType === 'embedded'
      ) ?? privyWallets[0]
      if (embedded?.address) setDisplayAddress(embedded.address as `0x${string}`)
    } else if (!privyAuthenticated) {
      setDisplayAddress(undefined)
    }
  }, [privyAuthenticated, privyWallets.length])

  const handleSwitchChain = async () => {
    if (isSwitchingChain) return
    setIsSwitchingChain(true)
    try {
      await switchChainAsync({ chainId: EXPECTED_CHAIN_ID })
      toast.success('Switched to Arc Mainnet')
    } catch (error: any) {
      if (error?.code === 4902) toast.error('Arc Mainnet not added. Please add it manually in MetaMask.')
      else if (error?.code === 4001) toast.error('Network switch rejected')
      else toast.error('Failed to switch network')
    } finally {
      setIsSwitchingChain(false)
    }
  }

  const copyAddress = async () => {
    if (!effectiveAddress) return
    try {
      await navigator.clipboard.writeText(effectiveAddress)
      setCopied(true)
      toast.success('Address copied!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy address')
    }
  }

  const openExplorer = () => {
    if (!effectiveAddress) return
    window.open(`${CONSTANTS.LINKS.explorer}/address/${effectiveAddress}`, '_blank')
  }

  const handleCreateWallet = async () => {
    if (isCreatingWallet) return
    setIsCreatingWallet(true)
    setWalletError(null)
    try {
      await createWallet()
      setWalletSetupTimedOut(false)
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      console.error('[Privy] createWallet failed:', msg)
      if (!msg.toLowerCase().includes('already')) {
        // "Connector not connected" = Privy tentou usar wagmi sem conector — recarregar resolve
        const displayMsg = /connector.*not.*connected|not.*connected/i.test(msg)
          ? 'Error creating wallet. Reload the page and try again.'
          : msg
        setWalletError(displayMsg)
        toast.error(displayMsg)
      }
    } finally {
      setIsCreatingWallet(false)
    }
  }

  const handleDisconnect = async () => {
    setShowDropdown(false)
    clearWagmiStorage()
    try {
      if (privyAuthenticated) await privyLogout()
      if (wagmiConnected) await disconnectAsync()
    } catch { /* noop */ }
    toast.success('Disconnected')
    window.location.reload()
  }

  // ── Não conectado ────────────────────────────────────────────────────────
  if (!effectiveIsConnected) {
    // Detect OAuth callback — Privy is processing the redirect, don't show Sign in
    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={openModal}
        disabled={!isPrivyReady}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 font-semibold text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {!isPrivyReady
          ? <Loader2 className="h-5 w-5 animate-spin" />
          : <Wallet className="h-5 w-5" />}
        {!isPrivyReady ? 'Loading...' : 'Sign in'}
      </motion.button>
    )
  }

  if (effectiveIsConnected && pendingGoogleWallet && !effectiveAddress) {
    if (walletSetupTimedOut) {
      return (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-slate-800/60 px-3 py-2 backdrop-blur-xl"
        >
          <span className="text-xs text-red-400 max-w-[160px] truncate">
            {walletError ?? 'Error creating wallet'}
          </span>
          <button
            onClick={() => /reload/i.test(walletError ?? '') ? window.location.reload() : handleCreateWallet()}
            disabled={isCreatingWallet}
            className="text-xs text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors shrink-0"
          >
            {isCreatingWallet ? '…' : /reload/i.test(walletError ?? '') ? 'Reload' : 'Try again'}
          </button>
          <button
            onClick={privyLogout}
            className="text-xs text-slate-500 hover:text-red-400 underline underline-offset-2 transition-colors shrink-0"
          >
            Sign out
          </button>
        </motion.div>
      )
    }
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 rounded-xl border border-purple-500/30 bg-slate-800/60 px-4 py-2.5 backdrop-blur-xl"
      >
        <Loader2 className="h-4 w-4 animate-spin text-purple-400 shrink-0" />
        <span className="text-sm text-slate-300">
          {isCreatingWallet ? 'Creating wallet…' : 'Setting up wallet…'}
        </span>
        {!isCreatingWallet && (
          <button
            onClick={handleCreateWallet}
            className="ml-1 text-xs text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors"
          >
            Retry
          </button>
        )}
      </motion.div>
    )
  }

  // ── Rede errada ──────────────────────────────────────────────────────────
  if (isWrongNetwork) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-xl border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 backdrop-blur-xl"
      >
        <AlertTriangle className="h-5 w-5 text-yellow-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-400">Wrong Network</p>
          <p className="text-xs text-yellow-300/80">Switch to Arc Mainnet</p>
        </div>
        <button
          onClick={handleSwitchChain}
          disabled={isSwitchingChain}
          className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-400 disabled:opacity-50 transition-all"
        >
          {isSwitchingChain ? 'Switching...' : 'Switch'}
        </button>
      </motion.div>
    )
  }

  // ── Conectado ────────────────────────────────────────────────────────────

  type SocialKind = 'google' | 'discord' | 'twitter' | 'telegram' | 'wallet'

  const getSocialKind = (): SocialKind => {
    const accounts = privyUser?.linkedAccounts ?? []
    if (accounts.find(a => a.type === 'google_oauth'))  return 'google'
    if (accounts.find(a => a.type === 'discord_oauth')) return 'discord'
    if (accounts.find(a => a.type === 'twitter_oauth')) return 'twitter'
    if (accounts.find(a => a.type === 'telegram'))      return 'telegram'
    return 'wallet'
  }

  const getDisplayName = (): string => {
    // user.google / user.twitter / user.discord são os campos tipados do Privy v3
    // (confirmado nas tipagens: Google tem `name: string|null` e `email: string`)
    if (privyUser?.google?.name)  return privyUser.google.name
    if (privyUser?.google?.email) return privyUser.google.email.split('@')[0]

    if (privyUser?.twitter?.name)     return privyUser.twitter.name
    if (privyUser?.twitter?.username) return `@${privyUser.twitter.username}`

    if (privyUser?.discord?.username) return privyUser.discord.username.split('#')[0]
    if (privyUser?.discord?.email)    return privyUser.discord.email.split('@')[0]

    const accounts = privyUser?.linkedAccounts ?? []
    const discord = accounts.find(a => a.type === 'discord_oauth') as { username?: string; email?: string } | undefined
    if (discord) return (discord.username ?? discord.email ?? 'Discord').split('#')[0]

    const twitter = accounts.find(a => a.type === 'twitter_oauth') as { username?: string } | undefined
    if (twitter?.username) return `@${twitter.username}`
    if (twitter) return 'Twitter'

    const telegram = accounts.find(a => a.type === 'telegram') as { firstName?: string; first_name?: string } | undefined
    if (telegram) return telegram.firstName ?? telegram.first_name ?? 'Telegram'

    const wallet = privyWallets[0]
    if (wallet?.address) return formatAddress(wallet.address as `0x${string}`)
    if (effectiveAddress) return formatAddress(effectiveAddress)
    return 'Connected'
  }

  // Prioridade: identidade social do Privy > ENS > endereço.
  // NÃO usar authMethod aqui — o adapter @privy-io/wagmi sincroniza a
  // embedded wallet para wagmi, tornando wagmiConnected=true e authMethod='wallet'
  // mesmo em logins sociais, o que causava exibição do endereço em vez do nome.
  const hasSocialAccount = !!(
    privyUser?.google ||
    privyUser?.twitter ||
    privyUser?.discord ||
    privyUser?.linkedAccounts?.find(
      (a) => ['google_oauth', 'twitter_oauth', 'discord_oauth', 'telegram'].includes(a.type)
    )
  )

  const displayName =
    hasSocialAccount
      ? getDisplayName()
      : (ensName && typeof ensName === 'string' ? ensName : null) ??
        (effectiveAddress ? formatAddress(effectiveAddress) : 'Connected')

  const socialKind = getSocialKind()

  const showPrivySetupHint = pendingGoogleWallet

  const avatarUrl = socialAvatar ?? (ensAvatar ? String(ensAvatar) : null)

  const SocialIcon = ({ kind, size }: { kind: SocialKind; size: number }) => {
    if (kind === 'google') return (
      <div
        className="rounded-full bg-white flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 18 18" style={{ width: size * 0.6, height: size * 0.6 }}>
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
          <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/>
        </svg>
      </div>
    )
    if (kind === 'discord') return (
      <div
        className="rounded-full flex items-center justify-center shrink-0"
        style={{ width: size, height: size, background: '#5865F2' }}
      >
        <svg viewBox="0 0 24 24" fill="white" style={{ width: size * 0.6, height: size * 0.6 }}>
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
      </div>
    )
    if (kind === 'twitter') return (
      <div
        className="rounded-full flex items-center justify-center shrink-0"
        style={{ width: size, height: size, background: '#000' }}
      >
        <svg viewBox="0 0 24 24" fill="white" style={{ width: size * 0.55, height: size * 0.55 }}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      </div>
    )
    if (kind === 'telegram') return (
      <div
        className="rounded-full flex items-center justify-center shrink-0"
        style={{ width: size, height: size, background: '#229ED9' }}
      >
        <svg viewBox="0 0 24 24" fill="white" style={{ width: size * 0.6, height: size * 0.6 }}>
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      </div>
    )
    // wallet fallback
    return (
      <div
        className="h-6 w-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div className="relative" data-wallet-dropdown>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-3 rounded-full border border-amber-500/30 bg-slate-800/60 px-4 py-2.5 backdrop-blur-xl hover:bg-slate-800/80 transition-all duration-300"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Avatar" className="h-6 w-6 rounded-full object-cover" />
        ) : hasSocialAccount ? (
          <SocialIcon kind={socialKind} size={24} />
        ) : (
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shrink-0" />
        )}
        <span className="font-medium max-w-[120px] truncate">{displayName}</span>
        {showPrivySetupHint && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400 shrink-0" aria-hidden />
        )}
      </motion.button>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 mt-2 w-64 rounded-xl border border-amber-500/25 bg-slate-900 p-2 shadow-2xl z-50"
          >
            <div className="border-b border-slate-700 p-3 mb-2 space-y-2">
              {hasSocialAccount && (
                <div className="flex items-center gap-2">
                  {avatarUrl && <img src={avatarUrl} alt="Avatar" className="h-8 w-8 rounded-full object-cover" />}
                  <div>
                    <p className="text-[10px] text-purple-400 font-medium uppercase tracking-wide">Social login</p>
                    <p className="text-sm font-semibold text-white">{socialLabel ?? displayName}</p>
                  </div>
                </div>
              )}
              <div className="rounded-lg bg-slate-800/80 border border-slate-700/60 p-2.5">
                <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wide">
                  {hasSocialAccount ? '⚡ EVM wallet' : 'Wallet address'}
                </p>
                <p className="font-mono text-xs text-amber-300 break-all">{effectiveAddress}</p>
              </div>
            </div>

            <button onClick={copyAddress} className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-800 transition-colors text-left">
              {copied ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              <span className="text-sm">Copy Address</span>
            </button>

            <button onClick={openExplorer} className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-800 transition-colors text-left">
              <ExternalLink className="h-4 w-4" />
              <span className="text-sm">View on Explorer</span>
            </button>

            <div className="border-t border-slate-700 mt-2 pt-2">
              <button onClick={handleDisconnect} className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors text-left">
                <LogOut className="h-4 w-4" />
                <span className="text-sm">Disconnect</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
