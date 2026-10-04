import { ReactNode } from 'react'
import { useChainId, useAccount } from 'wagmi'
import { ARC_MAINNET } from '@/config/chain'
import { Header } from './Header'
import { Footer } from './Footer'
import { NetworkBanner } from '@/components/NetworkBanner'
import { NetworkSwitcher } from '@/components/Web3/NetworkSwitcher'
import { WalletModal } from '@/components/Web3/WalletModal'
import { useWalletModal } from '@/contexts/WalletModalContext'
import { BottomNav } from '@/components/BottomNav'
import { useTransactionNotifications } from '@/hooks/useTransactionNotifications'

interface LayoutProps {
  children: ReactNode
}

function LayoutContent({ children }: LayoutProps) {
  const { isOpen, closeModal } = useWalletModal()
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const isWrongNetwork = isConnected && chainId != null && chainId !== ARC_MAINNET.chainIdDec

  // Mounted once here (Layout wraps every route) so the SSE connection for
  // scheduled-payment notifications survives navigation instead of
  // reconnecting on every page change.
  useTransactionNotifications()

  return (
    <div className="min-h-screen flex flex-col text-white relative">
      <Header />
      {isWrongNetwork && (
        <div className="sticky top-[65px] z-40 px-4 py-2 max-w-6xl mx-auto w-full">
          <NetworkBanner currentChainId={chainId} />
        </div>
      )}
      <main className="main-content flex-1">{children}</main>
      <Footer />
      <BottomNav />
      <NetworkSwitcher />
      <WalletModal isOpen={isOpen} onClose={closeModal} />
    </div>
  )
}

export function Layout({ children }: LayoutProps) {
  return <LayoutContent>{children}</LayoutContent>
}

