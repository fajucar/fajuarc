import { ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'

const LINK_FAUCET_URL = 'https://faucets.chain.link/arc-testnet'

interface LinkFaucetBannerProps {
  show: boolean
  address?: string
}

export function LinkFaucetBanner({ show, address }: LinkFaucetBannerProps) {
  if (!show) return null

  const handleClick = async () => {
    if (address) {
      try {
        await navigator.clipboard.writeText(address)
        toast.success('Address copied! 📋')
      } catch {
        toast.error('Could not copy address')
      }
    }
    window.open(LINK_FAUCET_URL, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 flex items-start gap-3">
      <span className="text-base leading-none mt-0.5 shrink-0">🔗</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-200">No LINK to test with?</p>
        <p className="text-xs text-blue-200/70 mt-0.5">
          Paste your address in the faucet and get free LINK to use on the network.
        </p>
        <button
          type="button"
          onClick={handleClick}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          Get LINK for free
        </button>
      </div>
    </div>
  )
}
