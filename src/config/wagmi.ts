import { createConfig } from '@privy-io/wagmi'
import { http, fallback } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { isMobileDevice } from '@/utils/device'
import { arcMainnet, arcTestnet } from './chains'

const isDev = (import.meta.env as { MODE?: string }).MODE === 'development'

// === Injected wallets (MetaMask, Rabby, Rainbow, Coinbase Extension, etc)
const injectedConnector = injected({
  shimDisconnect: true,
})

// === WalletConnect v2
// Circuit breaker: check if WalletConnect was disabled due to runtime errors
const isWalletConnectDisabled = typeof window !== 'undefined' &&
  localStorage.getItem('WALLETCONNECT_DISABLED') === '1'

// ProjectId from env (Vite exposes VITE_* at build time)
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
const hasValidProjectId =
  walletConnectProjectId &&
  typeof walletConnectProjectId === 'string' &&
  walletConnectProjectId.trim().length > 0 &&
  !isWalletConnectDisabled

// Dev-only: log projectId status (never in production)
if (isDev) {
  if (hasValidProjectId) {
    console.debug('[wagmi] WalletConnect projectId configured')
  } else if (isWalletConnectDisabled) {
    console.warn('⚠️ [wagmi] WalletConnect disabled by circuit breaker. Clear localStorage key WALLETCONNECT_DISABLED to re-enable.')
  } else {
    console.warn('⚠️ [wagmi] VITE_WALLETCONNECT_PROJECT_ID is empty. WalletConnect will not work. Add it in .env and Vercel env vars.')
    console.warn('⚠️ [wagmi] Get a free project ID at https://cloud.walletconnect.com')
  }
}

// Mobile: heurística compartilhada com WalletModal.tsx (src/utils/device.ts)
const isMobile = isMobileDevice()

// WalletConnect v2 connector (wagmi/connectors uses @walletconnect/ethereum-provider v2)
const walletConnectConnector = hasValidProjectId
  ? walletConnect({
      projectId: walletConnectProjectId.trim(),
      showQrModal: !isMobile, // Desktop: QR modal; Mobile: deep link (wallet list)
      metadata: {
        name: 'FajuARC',
        description: 'DeFi on Arc Mainnet - Swap, Pools',
        url: 'https://www.fajucar.xyz',
        icons: ['https://www.fajucar.xyz/favicon.ico'],
      },
    })
  : null

// Export helper to check if WalletConnect is disabled
export const isWalletConnectDisabledFlag = isWalletConnectDisabled

// Export projectId as string | undefined (NOT empty string)
export const WALLETCONNECT_PROJECT_ID: string | undefined = hasValidProjectId 
  ? walletConnectProjectId.trim() 
  : undefined

const hasInjectedWallet = typeof window !== 'undefined' && typeof window.ethereum !== 'undefined'

// Priorizar WalletConnect no mobile (mesmo se window.ethereum existir)
// No desktop, priorizar injected (MetaMask) se disponível
const connectors = isMobile
  ? [
      // Mobile: WalletConnect primeiro (sempre, mesmo se window.ethereum existir)
      ...(walletConnectConnector ? [walletConnectConnector] : []),
      injectedConnector,
    ]
  : hasInjectedWallet
    ? [
        // Desktop com MetaMask: injected primeiro
        injectedConnector,
        ...(walletConnectConnector ? [walletConnectConnector] : []),
      ]
    : [
        // Desktop sem injected: WalletConnect primeiro
        ...(walletConnectConnector ? [walletConnectConnector] : []),
        injectedConnector,
      ]

export const config = createConfig({
  // Arc Mainnet é a rede padrão do app; Arc Testnet continua disponível como
  // opção secundária (desenvolvimento) — ver NetworkSwitchModal.tsx.
  chains: [arcMainnet, arcTestnet],
  connectors,
  transports: {
    [arcMainnet.id]: fallback(
      arcMainnet.rpcUrls.default.http.map((url) => http(url))
    ),
    [arcTestnet.id]: fallback(
      arcTestnet.rpcUrls.default.http.map((url) => http(url))
    ),
  },
  ssr: false,
})
