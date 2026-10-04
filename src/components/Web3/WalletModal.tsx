import { useMemo, useState, useEffect } from 'react'
import { usePrivy, useConnectWallet, type WalletListEntry } from '@privy-io/react-auth'
import { ExternalLink, Wallet as WalletIcon, Loader2 } from 'lucide-react'
import { isMobileDevice } from '@/utils/device'
import { WALLETCONNECT_PROJECT_ID } from '@/config/wagmi'
import { useArcWallet } from '@/hooks/useArcWallet'
import { SocialLoginSection } from './SocialLoginSection'

interface WalletModalProps {
  isOpen: boolean
  onClose: () => void
}

type InjectedProvider = {
  isMetaMask?: boolean
  isRabby?: boolean
  isCoinbaseWallet?: boolean
  isOkxWallet?: boolean
}

function getInjectedProviders(): InjectedProvider[] {
  const eth: any = (window as any).ethereum
  if (!eth) return []

  // Alguns navegadores expõem vários providers em ethereum.providers
  const providers: any[] = Array.isArray(eth.providers) ? eth.providers : [eth]
  return providers.filter(Boolean)
}

function isInstalled(check: (p: InjectedProvider) => boolean): boolean {
  const providers = getInjectedProviders()
  return providers.some((p) => {
    try {
      return check(p)
    } catch {
      return false
    }
  })
}

interface WalletOption {
  id: string
  name: string
  recommended: boolean
  /** Which Privy-known wallet to jump straight to (skips Privy's own picker
   *  screen). 'detected_wallets' lets Privy figure out the actual injected
   *  provider itself — used for wallets Privy has no explicit id for. */
  privyWalletId: WalletListEntry
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { authenticated } = usePrivy()
  const { connectWalletConnect } = useArcWallet()
  const mobile = isMobileDevice()
  const [connectError, setConnectError] = useState<string | null>(null)
  const [connectingWc, setConnectingWc] = useState(false)

  // Desktop external-wallet connections (MetaMask, Rabby, Coinbase, OKX) go
  // through Privy's own connect-wallet modal — never through wagmi's
  // `useConnect`/`useConnectors` directly. @privy-io/wagmi's createConfig
  // (src/config/wagmi.ts) strips any connector whose `.type` isn't `'mock'`
  // out of the live wagmi config, so the `injected()`/`walletConnect()`
  // connectors declared there NEVER register live — clicking a wallet through
  // wagmi's useConnect() always failed with "Wallet connector not available
  // or not initialized". Privy's connectWallet() works here on desktop: on
  // success it syncs the wallet into wagmi itself (see useSyncPrivyWallets in
  // @privy-io/wagmi, which calls wagmi's reconnect() after a successful Privy
  // wallet connection) — so useArcWallet() picks it up same as before.
  //
  // Mobile is different: Privy's connect UI itself runs inside a cross-origin
  // iframe (auth.privy.io per the CSP frame-src). An iframe can't reliably
  // trigger the OS-level "open this wallet app" hand-off on mobile, so
  // picking e.g. MetaMask there just hangs on "Connecting to MetaMask..."
  // forever. For mobile we bypass Privy entirely and drive
  // `@walletconnect/ethereum-provider` directly at the page's top level (see
  // connectWalletConnect() in useArcWallet.ts) — its QR/deep-link modal
  // (@reown/appkit) can actually redirect into the wallet app and back, same
  // as most dApps did before Privy was introduced.
  const { connectWallet } = useConnectWallet({
    onSuccess: () => onClose(),
    onError: (error) => {
      console.error('[WalletModal] Privy connectWallet error:', error)
      setConnectError('Wallet connection failed or was cancelled. You can try again or use social login.')
    },
  })

  const handleMobileExternalConnect = async () => {
    setConnectError(null)
    setConnectingWc(true)
    try {
      await connectWalletConnect()
      onClose()
    } catch (err: any) {
      setConnectError(err?.message || 'Wallet connection failed or was cancelled. You can try again or use social login.')
    } finally {
      setConnectingWc(false)
    }
  }

  useEffect(() => {
    if (authenticated && isOpen) {
      onClose()
    }
  }, [authenticated, isOpen, onClose])

  // Recalcula quando o modal abre (garante detecção atualizada)
  const wallets = useMemo<WalletOption[]>(() => {
    if (mobile) return []

    const hasMetaMask = isInstalled((p) => Boolean(p?.isMetaMask))
    const hasRabby = isInstalled((p) => Boolean(p?.isRabby))
    const hasCoinbase = isInstalled((p) => Boolean(p?.isCoinbaseWallet))
    const hasOkx = isInstalled((p) => Boolean(p?.isOkxWallet))

    const list: WalletOption[] = []

    if (hasMetaMask) {
      list.push({ id: 'metamask', name: 'MetaMask', recommended: true, privyWalletId: 'metamask' })
    }
    if (hasRabby) {
      list.push({ id: 'rabby', name: 'Rabby Wallet', recommended: false, privyWalletId: 'detected_wallets' })
    }
    if (hasCoinbase) {
      list.push({ id: 'coinbase', name: 'Coinbase Wallet', recommended: false, privyWalletId: 'coinbase_wallet' })
    }
    if (hasOkx) {
      list.push({ id: 'okx', name: 'OKX Wallet', recommended: false, privyWalletId: 'okx_wallet' })
    }

    // An injected provider is present but didn't match any known flag above
    // (some extensions don't set isMetaMask/isRabby/etc.) — let Privy detect it.
    if (list.length === 0 && getInjectedProviders().length > 0) {
      list.push({ id: 'injected', name: 'Browser Wallet', recommended: true, privyWalletId: 'detected_wallets' })
    }

    if (WALLETCONNECT_PROJECT_ID) {
      list.push({ id: 'walletconnect', name: 'WalletConnect', recommended: list.length === 0, privyWalletId: 'wallet_connect' })
    }

    return list
  }, [mobile])

  if (!isOpen) return null

  const handleConnect = (wallet: WalletOption) => {
    setConnectError(null)
    connectWallet({ preSelectedWalletId: wallet.privyWalletId })
  }

  return (
    // Overlay (clique fora fecha)
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      {/* Painel: full-screen no mobile, centralizado no desktop */}
      <div
        className={`
          ${mobile
            ? 'fixed inset-0 m-0 rounded-none'
            : 'absolute right-6 top-16 w-full max-w-md rounded-xl'
          }
          bg-slate-900 text-white shadow-xl border border-slate-700
          flex flex-col
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold">Connect Wallet</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-300 hover:text-white transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content - scrollable */}
        <div className={`flex-1 overflow-y-auto ${mobile ? 'p-4' : 'p-4'}`}>
          {/* ── Social Login ──────────────────────────────── */}
          <SocialLoginSection onSuccess={onClose} />

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-slate-700/70" />
            <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">or wallet</span>
            <div className="flex-1 h-px bg-slate-700/70" />
          </div>

          {/* Mobile: WalletConnect, driven directly (not through Privy's iframe — see
              comment above). Opens a QR/deep-link modal that hands off to the wallet
              app itself and returns here once the user approves. */}
          {mobile && (
            <button
              type="button"
              onClick={handleMobileExternalConnect}
              disabled={connectingWc}
              className="mb-4 w-full flex items-center gap-3 p-4 rounded-xl bg-[#f6851b]/15 border-2 border-[#f6851b]/40 hover:bg-[#f6851b]/25 disabled:opacity-70 disabled:cursor-not-allowed transition-colors text-left"
            >
              <div className="shrink-0 w-10 h-10 rounded-full bg-[#f6851b]/30 flex items-center justify-center">
                {connectingWc
                  ? <Loader2 className="h-5 w-5 text-[#f6851b] animate-spin" />
                  : <ExternalLink className="h-5 w-5 text-[#f6851b]" />}
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-white">{connectingWc ? 'Connecting…' : 'Connect external wallet'}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {connectingWc ? 'Approve in your wallet app, then come back here.' : 'MetaMask, and 300+ wallets via WalletConnect.'}
                </p>
              </div>
              {!connectingWc && <span className="text-[#f6851b] shrink-0">→</span>}
            </button>
          )}

          {!mobile && (
            <div className="space-y-3">
              {wallets.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p className="font-semibold text-slate-300 mb-2">No Wallets Available</p>
                  <p className="text-sm mt-2">
                    Please install a wallet extension like MetaMask, or use social login above.
                  </p>
                </div>
              ) : (
                wallets.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handleConnect(w)}
                    className={[
                      'w-full rounded-lg border px-4 py-3 text-left transition',
                      'border-slate-700 hover:border-slate-500 hover:bg-slate-800 active:scale-[0.98]',
                      w.recommended ? 'border-cyan-500/50 bg-cyan-500/5' : '',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <WalletIcon className="h-4 w-4 text-slate-400" />
                          <span className="font-medium">{w.name}</span>
                          {w.recommended && (
                            <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                              Recommended
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-slate-400">
                          {w.id === 'walletconnect' ? 'Connect via QR code or deep link' : 'Installed'}
                        </span>
                      </div>

                      <span className="text-slate-400">↗</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Error message */}
          {connectError && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-red-400">{connectError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`border-t border-slate-700 ${mobile ? 'p-4' : 'p-4'}`}>
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
