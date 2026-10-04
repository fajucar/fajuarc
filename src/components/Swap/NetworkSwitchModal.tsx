import { useState } from 'react'
import { useSwitchChain, useWalletClient } from 'wagmi'
import { AlertCircle, X, Loader2 } from 'lucide-react'
import { arcTestnet, arcMainnet } from '@/config/chains'
import toast from 'react-hot-toast'

interface NetworkSwitchModalProps {
  isOpen: boolean
  onClose: () => void
}

// Arc Mainnet é a rede padrão do app.
const ARC_MAINNET_CHAIN_ID = arcMainnet.id

/** Parâmetros EIP-3085 para wallet_addEthereumChain (Arc Mainnet) */
const ARC_MAINNET_CHAIN_PARAMS = {
  chainId: `0x${ARC_MAINNET_CHAIN_ID.toString(16)}`,
  chainName: arcMainnet.name,
  nativeCurrency: arcMainnet.nativeCurrency,
  rpcUrls: arcMainnet.rpcUrls.default.http,
  blockExplorerUrls: arcMainnet.blockExplorers?.default?.url
    ? [arcMainnet.blockExplorers.default.url]
    : [],
}

// Arc Testnet fica disponível como opção secundária (desenvolvimento).
const ARC_TESTNET_CHAIN_ID = arcTestnet.id

/** Parâmetros EIP-3085 para wallet_addEthereumChain (Arc Testnet) */
const ARC_TESTNET_CHAIN_PARAMS = {
  chainId: `0x${ARC_TESTNET_CHAIN_ID.toString(16)}`,
  chainName: arcTestnet.name,
  nativeCurrency: arcTestnet.nativeCurrency,
  rpcUrls: arcTestnet.rpcUrls.default.http,
  blockExplorerUrls: arcTestnet.blockExplorers?.default?.url
    ? [arcTestnet.blockExplorers.default.url]
    : [],
}

export function NetworkSwitchModal({ isOpen, onClose }: NetworkSwitchModalProps) {
  const { switchChain, isPending: isSwitchPending } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const [isAddPending, setIsAddPending] = useState(false)
  const [showTestnetOption, setShowTestnetOption] = useState(false)

  const handleSwitchChain = async () => {
    try {
      await switchChain({ chainId: ARC_MAINNET_CHAIN_ID })
      toast.success('Switching to Arc Mainnet...')
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/user rejected|user denied/i.test(msg)) {
        toast.error('You rejected the network switch.')
      } else {
        toast.error('Could not switch network. Try adding the network.')
      }
    }
  }

  const handleAddChain = async () => {
    if (!walletClient) {
      toast.error('Connect a wallet first.')
      return
    }
    setIsAddPending(true)
    try {
      await walletClient.request({
        method: 'wallet_addEthereumChain',
        params: [ARC_MAINNET_CHAIN_PARAMS],
      })
      toast.success('Network added. Switching to Arc Mainnet...')
      // Alguns wallets trocam automaticamente; outros não — tenta switch
      await switchChain({ chainId: ARC_MAINNET_CHAIN_ID })
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/user rejected|user denied/i.test(msg)) {
        toast.error('You rejected adding the network.')
      } else {
        toast.error('Could not add the network.')
      }
    } finally {
      setIsAddPending(false)
    }
  }

  const handleSwitchTestnetChain = async () => {
    try {
      await switchChain({ chainId: ARC_TESTNET_CHAIN_ID })
      toast.success('Switching to Arc Testnet...')
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/user rejected|user denied/i.test(msg)) {
        toast.error('You rejected the network switch.')
      } else {
        toast.error('Could not switch network. Try adding the network.')
      }
    }
  }

  const handleAddTestnetChain = async () => {
    if (!walletClient) {
      toast.error('Connect a wallet first.')
      return
    }
    setIsAddPending(true)
    try {
      await walletClient.request({
        method: 'wallet_addEthereumChain',
        params: [ARC_TESTNET_CHAIN_PARAMS],
      })
      toast.success('Network added. Switching to Arc Testnet...')
      await switchChain({ chainId: ARC_TESTNET_CHAIN_ID })
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/user rejected|user denied/i.test(msg)) {
        toast.error('You rejected adding the network.')
      } else {
        toast.error('Could not add the network.')
      }
    } finally {
      setIsAddPending(false)
    }
  }

  if (!isOpen) return null

  const isLoading = isSwitchPending || isAddPending

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-xl border border-red-500/30 bg-slate-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="network-modal-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h2 id="network-modal-title" className="text-lg font-semibold text-white">
                Wrong network
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Connect to <strong className="text-cyan-400">Arc Mainnet</strong> (Chain ID 5042) to use Swap.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                If Arc Mainnet does not appear in your wallet, use &quot;Add network&quot;.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSwitchChain}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 w-full rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 transition-colors"
            >
              {isSwitchPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Switching...
                </>
              ) : (
                'Switch to Arc Mainnet'
              )}
            </button>
            <button
              type="button"
              onClick={handleAddChain}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 w-full rounded-lg border border-cyan-500/50 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-cyan-400 font-semibold py-3 px-4 transition-colors"
            >
              {isAddPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Arc Mainnet network'
              )}
            </button>
          </div>

          {!showTestnetOption ? (
            <button
              type="button"
              onClick={() => setShowTestnetOption(true)}
              className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors"
            >
              Use Arc Testnet instead (development)
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-800 pt-3">
              <p className="text-[11px] text-slate-500 mb-0.5">Arc Testnet (development)</p>
              <button
                type="button"
                onClick={handleSwitchTestnetChain}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 w-full rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 text-xs font-medium py-2 px-3 transition-colors"
              >
                {isSwitchPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Switch to Arc Testnet'}
              </button>
              <button
                type="button"
                onClick={handleAddTestnetChain}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 w-full rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-400 text-xs font-medium py-2 px-3 transition-colors"
              >
                {isAddPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add Arc Testnet network'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
