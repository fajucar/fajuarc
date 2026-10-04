import { useAccount, useSwitchChain } from 'wagmi'
import { AlertTriangle } from 'lucide-react'
import { arcMainnet } from '@/config/chains'
import toast from 'react-hot-toast'

export function NetworkSwitcher() {
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()

  if (!chain || chain.id === arcMainnet.id) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50">
      <div className="rounded-xl border border-yellow-500/50 bg-yellow-500/10 backdrop-blur-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-200 mb-1">
              Wrong Network
            </h3>
            <p className="text-sm text-yellow-200/80 mb-3">
              Please switch to Arc Mainnet to use this app
            </p>
            <button
              onClick={() => {
                switchChain({ chainId: arcMainnet.id })
                toast.success('Switching to Arc Mainnet...')
              }}
              className="w-full rounded-lg bg-yellow-500 px-4 py-2 font-semibold text-black hover:bg-yellow-400 transition-colors"
            >
              Switch to Arc Mainnet
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
