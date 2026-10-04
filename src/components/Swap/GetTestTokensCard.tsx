import { useState } from 'react'
import { useChainId } from 'wagmi'
import { motion } from 'framer-motion'
import { ExternalLink, Droplet, ChevronDown, ChevronUp } from 'lucide-react'
import { CONSTANTS } from '@/config/constants'
import { TestnetHelper } from './TestnetHelper'
import { FaucetPanel } from '@/components/Faucet'
import { BridgeUSDCtoArc } from '@/components/Bridge'
import { useArcWallet } from '@/hooks/useArcWallet'
import toast from 'react-hot-toast'

const LINK_FAUCET_URL = 'https://faucets.chain.link/arc-testnet'

export function GetTestTokensCard() {
  const [bridgeOpen, setBridgeOpen] = useState(false)
  const { address } = useArcWallet()
  const chainId = useChainId()

  const handleGetLink = async () => {
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

  // Arc Mainnet é a rede padrão do app — este card de "test tokens" só faz
  // sentido quando a wallet está de fato conectada na Arc Testnet.
  if (chainId !== CONSTANTS.ARC_TESTNET_CHAIN_ID) {
    return (
      <a
        href="https://bridge.usdc.com"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-3 text-xs text-slate-400 hover:text-slate-200 hover:border-cyan-500/40 transition-colors"
      >
        <Droplet className="h-3.5 w-3.5 shrink-0" />
        Get USDC via Circle Bridge
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    )
  }

  return (
    <div
      className={`flex flex-col rounded-2xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-4 transition-[max-height] duration-300 ${
        bridgeOpen
          ? 'overflow-visible'
          : 'md:max-h-[calc(100vh-140px)] md:overflow-auto'
      }`}
    >
      <h3 className="text-sm font-semibold text-slate-200 tracking-tight shrink-0">
        Get test tokens
      </h3>

      <section className="shrink-0">
        <TestnetHelper embedded />
      </section>

      <section className="space-y-2 shrink-0">
        <h4 className="text-xs font-medium text-slate-400">Faucet FAJU & ARCX</h4>
        <FaucetPanel variant="compact" />
      </section>

      <section className="shrink-0 space-y-2">
        <a
          href={CONSTANTS.LINKS.faucet}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-lg border border-slate-600/50 bg-slate-800/30 px-3 py-2 text-xs text-slate-300 hover:text-slate-100 hover:border-cyan-500/40 hover:bg-slate-800/50 transition-colors"
        >
          <Droplet className="h-3.5 w-3.5 shrink-0" />
          Get USDC / EURC
          <span className="text-slate-500">(Circle)</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-lg border border-orange-600/40 bg-orange-500/5 px-3 py-2 text-xs text-orange-300 hover:text-orange-200 hover:border-orange-500/60 hover:bg-orange-500/10 transition-colors"
        >
          <span className="shrink-0">🟠</span>
          Get cirBTC
          <span className="text-slate-500">(Circle Faucet)</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
        <button
          type="button"
          onClick={handleGetLink}
          className="flex items-center justify-center gap-2 w-full rounded-lg border border-blue-600/40 bg-blue-500/5 px-3 py-2 text-xs text-blue-300 hover:text-blue-200 hover:border-blue-500/60 hover:bg-blue-500/10 transition-colors"
        >
          <span className="shrink-0">🔗</span>
          Get LINK
          <span className="text-slate-500">(Chainlink Faucet)</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </button>
      </section>

      {/*
        glass-card ancestor has overflow:hidden which clips outward CSS box-shadows.
        Fix: use framer-motion inline styles (not Tailwind classes) so they can't be purged,
        and aim the shadow upward — into the 280px of panel interior above this section —
        which is well within the glass-card clip boundary and always fully visible.
      */}
      <section className="shrink-0" style={{ overflow: 'visible' }}>
        <motion.div
          animate={
            bridgeOpen
              ? {
                  y: -10,
                  scale: 1.04,
                  boxShadow: '0 -20px 50px rgba(34,211,238,0.55), 0 0 0 1px rgba(34,211,238,0.35)',
                  zIndex: 20,
                }
              : {
                  y: 0,
                  scale: 1,
                  boxShadow: '0 0 0 rgba(34,211,238,0)',
                  zIndex: 0,
                }
          }
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          style={{ position: 'relative', transformOrigin: 'bottom center', borderRadius: '0.5rem' }}
          className={`border ${
            bridgeOpen
              ? 'border-cyan-400/60 bg-slate-800/40 ring-1 ring-cyan-400/30'
              : 'border-slate-700/40 bg-slate-800/20 hover:border-cyan-400/60 hover:bg-slate-800/30'
          }`}
        >
          <button
            type="button"
            onClick={() => setBridgeOpen(!bridgeOpen)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-slate-200 hover:bg-slate-800/40 transition-colors rounded-lg"
          >
            {bridgeOpen ? (
                <span className="flex items-center gap-2">
                  Bridge USDC Sepolia → Arc
                  <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 leading-none">
                    🚧
                  </span>
                </span>
              ) : 'Open bridge'}
            {bridgeOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
          {bridgeOpen && (
            <div className="border-t border-cyan-400/20 p-3">
              <BridgeUSDCtoArc embedded />
            </div>
          )}
        </motion.div>
      </section>
    </div>
  )
}
