import { useState, useMemo, useEffect } from 'react'
import { X, Search, Copy, Check } from 'lucide-react'
import { usePublicClient } from 'wagmi'
import { useArcWallet } from '@/hooks/useArcWallet'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { formatUnits } from 'viem'
import { formatMoney } from '@/lib/format'

const ERC20_BALANCE_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

export interface TokenSelectItem {
  address: `0x${string}`
  symbol: string
  name: string
  decimals: number
  logo?: string
}

interface TokenSelectModalProps {
  isOpen: boolean
  onClose: () => void
  tokens: readonly TokenSelectItem[]
  onSelect: (token: TokenSelectItem) => void
  excludedAddress?: `0x${string}`
  selectedAddress?: `0x${string}`
  accountAddress?: `0x${string}`
  showBalance?: boolean
  title?: string
}

export function TokenSelectModal({
  isOpen,
  onClose,
  tokens,
  onSelect,
  excludedAddress,
  selectedAddress,
  accountAddress,
  showBalance = true,
  title = 'Select token',
}: TokenSelectModalProps) {
  const [search, setSearch] = useState('')
  const [balances, setBalances] = useState<Record<string, string>>({})
  const { address: arcAddress } = useArcWallet()
  const address = accountAddress ?? arcAddress
  const publicClient = usePublicClient()

  const filtered = useMemo(() => {
    if (!search.trim()) return tokens
    const q = search.trim().toLowerCase()
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q)
    )
  }, [tokens, search])

  const displayTokens = excludedAddress
    ? filtered.filter((t) => t.address.toLowerCase() !== excludedAddress.toLowerCase())
    : filtered

  useEffect(() => {
    if (!isOpen || !address || !publicClient || !showBalance) return
    let cancelled = false
    const load = async () => {
      const next: Record<string, string> = {}
      for (const t of tokens) {
        if (cancelled) return
        try {
          const b = (await publicClient.readContract({
            address: t.address,
            abi: ERC20_BALANCE_ABI,
            functionName: 'balanceOf',
            args: [address],
          })) as bigint
          next[t.address] = formatUnits(b, t.decimals)
        } catch {
          next[t.address] = '0'
        }
      }
      if (!cancelled) setBalances(next)
    }
    load()
    return () => { cancelled = true }
  }, [isOpen, address, publicClient, tokens, showBalance])

  const handleCopy = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr)
      toast.success('Copied')
    } catch {
      toast.error('Failed to copy')
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700/50 bg-slate-900/95 backdrop-blur-xl shadow-2xl"
        >
          <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800/60 text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search token..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 text-base sm:text-sm"
              />
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {displayTokens.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">No tokens found</div>
              ) : (
                displayTokens.map((token) => (
                  <TokenRow
                    key={token.address}
                    token={token}
                    selected={selectedAddress?.toLowerCase() === token.address.toLowerCase()}
                    balance={showBalance ? balances[token.address] : undefined}
                    onSelect={() => {
                      onSelect(token)
                      onClose()
                    }}
                    onCopy={handleCopy}
                  />
                ))
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function TokenRow({
  token,
  selected,
  balance,
  onSelect,
  onCopy,
}: {
  token: TokenSelectItem
  selected?: boolean
  balance?: string
  onSelect: () => void
  onCopy: (addr: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    onCopy(token.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const truncate = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors group ${
        selected
          ? 'border-cyan-400/70 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]'
          : 'border-slate-700/50 bg-slate-800/55 hover:border-cyan-500/40 hover:bg-slate-700/45'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950/50 text-lg">
          {token.logo ?? token.symbol.slice(0, 1)}
        </span>
        <div className="flex flex-col items-start min-w-0">
          <span className="font-medium text-white">{token.symbol}</span>
          <span className="text-xs text-slate-400 truncate max-w-[150px] sm:max-w-[190px]">{token.name}</span>
          <span className="text-[11px] font-mono text-slate-500" title={token.address}>
            {truncate(token.address)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {balance !== undefined && (
          <span className="hidden sm:inline text-xs text-slate-400 font-mono">
            {formatMoney(balance || '0', 4)}
          </span>
        )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleCopy() }}
            className="p-1 rounded hover:bg-slate-600/50 text-slate-500 hover:text-slate-200 transition-colors"
            title="Copy address"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
      </div>
    </button>
  )
}
