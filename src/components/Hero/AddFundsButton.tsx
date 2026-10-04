import { Plus } from 'lucide-react'

// Flip to true once Circle's Onramp Kit integration is live — this is the
// single switch that enables the button and hides the "Soon" badge.
export const ONRAMP_READY = false

function openOnramp() {
  // TODO: open the Circle Onramp Kit widget, passing the user's embedded
  // wallet address so funds land directly in their FajuARC wallet.
}

export function AddFundsButton() {
  return (
    <div className="flex flex-col items-center mt-[20px] mb-3">
      <button
        type="button"
        disabled={!ONRAMP_READY}
        onClick={ONRAMP_READY ? openOnramp : undefined}
        className="relative inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-400 px-[30px] py-[14px] text-[16px] font-bold text-[#0b0f1a] shadow-[0_0_20px_rgba(34,211,238,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_32px_rgba(34,211,238,0.55)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[0_0_20px_rgba(34,211,238,0.35)]"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0b0f1a]/15">
          <Plus className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
        Add funds
        {!ONRAMP_READY && (
          <span className="rounded-full bg-[#0b0f1a] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
            Soon
          </span>
        )}
      </button>
      <span className="mt-2 text-[13px] text-white/55">Buy USDC straight into your wallet</span>
    </div>
  )
}
