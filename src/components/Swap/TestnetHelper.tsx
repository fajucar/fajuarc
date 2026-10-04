import { useState } from 'react'
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { ARC_TESTNET_TOKENS } from '@/config/tokens.arc-testnet'

const TESTNET_TOKENS = ARC_TESTNET_TOKENS.map((t) => ({ symbol: t.symbol, address: t.address }))

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(`Copied ${label}`)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-colors"
      title={`Copy ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

interface TestnetHelperProps {
  embedded?: boolean
}

export function TestnetHelper({ embedded }: TestnetHelperProps = {}) {
  const [stablecoinsOpen, setStablecoinsOpen] = useState(false)

  const mainTokens = TESTNET_TOKENS.slice(0, 2)
  const stablecoinTokens = TESTNET_TOKENS.slice(2)

  const content = (
    <>
      {!embedded && <h3 className="text-sm font-semibold text-slate-300 mb-3">Token addresses</h3>}
      <div className="space-y-1.5 text-xs">
        {mainTokens.map(({ symbol, address: addr }) => (
          <div key={symbol} className="flex items-center gap-2 font-mono">
            <span className="text-slate-300 shrink-0 w-10">{symbol}:</span>
            <span className="min-w-0 truncate text-slate-400" title={addr}>{addr}</span>
            <CopyButton text={addr} label={symbol} />
          </div>
        ))}
        <div>
          <button
            type="button"
            onClick={() => setStablecoinsOpen(!stablecoinsOpen)}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-xs py-0.5 transition-colors"
          >
            {stablecoinsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Show stablecoin addresses
          </button>
          {stablecoinsOpen && (
            <div className="mt-1.5 space-y-1.5 pl-0">
              {stablecoinTokens.map(({ symbol, address: addr }) => (
                <div key={symbol} className="flex items-center gap-2 font-mono">
                  <span className="text-slate-300 shrink-0 w-10">{symbol}:</span>
                  <span className="min-w-0 truncate text-slate-400" title={addr}>{addr}</span>
                  <CopyButton text={addr} label={symbol} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )

  if (embedded) {
    return <div className="space-y-3">{content}</div>
  }

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-slate-800/20 p-4">
      {content}
    </div>
  )
}
