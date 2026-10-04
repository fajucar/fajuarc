import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { TokenSelectModal, type TokenSelectItem } from './TokenSelectModal'

interface TokenSelectButtonProps {
  tokens: readonly TokenSelectItem[]
  selected: TokenSelectItem | null
  onSelect: (token: TokenSelectItem) => void
  excludedAddress?: `0x${string}`
  accountAddress?: `0x${string}`
  showBalance?: boolean
  placeholder?: string
  className?: string
}

export function TokenSelectButton({
  tokens,
  selected,
  onSelect,
  excludedAddress,
  accountAddress,
  showBalance = true,
  placeholder = 'Select',
  className = '',
}: TokenSelectButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-600/50 hover:border-cyan-500/40 focus:outline-none focus:border-cyan-500/50 transition-colors min-w-[120px] ${className}`}
      >
        {selected ? (
          <>
            {selected.logo && <span className="text-base leading-none">{selected.logo}</span>}
            <span className="font-medium text-white">{selected.symbol}</span>
          </>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-auto" />
      </button>
      <TokenSelectModal
        isOpen={open}
        onClose={() => setOpen(false)}
        tokens={tokens}
        onSelect={onSelect}
        excludedAddress={excludedAddress}
        selectedAddress={selected?.address}
        accountAddress={accountAddress}
        showBalance={showBalance}
        title="Select token"
      />
    </>
  )
}
