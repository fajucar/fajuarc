import { ExternalLink, ArrowRightLeft } from 'lucide-react'
import { CONSTANTS } from '@/config/constants'

interface BridgeUSDCtoArcProps {
  /** When true, omit outer card and title (e.g. inside accordion) */
  embedded?: boolean
}

export function BridgeUSDCtoArc({ embedded }: BridgeUSDCtoArcProps = {}) {
  const content = (
    <>
      {!embedded && (
        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <ArrowRightLeft className="h-4 w-4" />
          Bridge USDC Sepolia → Arc
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
            🚧 Under Construction
          </span>
        </h4>
      )}

      {embedded && (
        <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-amber-400">
          🚧 Under Construction — temporarily unavailable.
        </p>
      )}

      <p className="mb-3 text-xs text-slate-400">
        Step 1: Swap ETH → USDC on Sepolia (e.g.{' '}
        <a
          href={CONSTANTS.LINKS.uniswapSepolia}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 hover:underline"
        >
          Uniswap Sepolia
        </a>
        ). Step 2: Bridge USDC to Arc below.
      </p>

      <div className="mb-3 flex gap-2">
        <input
          type="text"
          disabled
          placeholder="Amount (e.g. 10)"
          className="flex-1 rounded-lg border border-slate-700/40 bg-slate-800/20 px-3 py-2 text-sm placeholder:text-slate-600 text-slate-600 cursor-not-allowed opacity-50 select-none"
        />
        <button
          type="button"
          disabled
          className="flex items-center gap-2 rounded-lg bg-slate-700/40 px-4 py-2 text-sm font-medium text-slate-500 cursor-not-allowed opacity-50 select-none"
        >
          Bridge
        </button>
      </div>

      <a
        href={CONSTANTS.LINKS.bridgeUsdcToArc}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-cyan-400"
      >
        Bridge docs
        <ExternalLink className="h-3 w-3" />
      </a>
    </>
  )

  if (embedded) {
    return content
  }

  return (
    <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-4">
      {content}
    </div>
  )
}
