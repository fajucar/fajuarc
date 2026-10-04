import { useState, useEffect, useRef, CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useAccount, usePublicClient } from 'wagmi'
import { formatUnits } from 'viem'
import { Wallet, Eye, EyeOff, X, ChevronDown } from 'lucide-react'
import { ARC_MAINNET_TOKENS } from '@/config/tokens.arc-mainnet'
import { formatMoney } from '@/lib/format'
import { useTokenPriceData } from '@/lib/tokenPrices'

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const TOKEN_COLORS: Record<string, string> = {
  USDC:   '#10B981', // green-500
  EURC:   '#3B82F6', // blue-500
  FAJU:   '#F97316', // orange-500
  ARCX:   '#A855F7', // purple-500
  QCAD:   '#06B6D4', // cyan-500
  USYC:   '#14B8A6', // teal-500
  cirBTC: '#F7931A', // bitcoin orange
}

const TOKEN_LETTERS: Record<string, string> = {
  USDC:   'U',
  EURC:   'E',
  FAJU:   'F',
  ARCX:   'A',
  QCAD:   'Q',
  USYC:   'Y',
  cirBTC: '₿',
}

const BALANCES_CHANGED_EVENT = 'fajuarc:balances-changed'

/** Ask every mounted WalletBalancesCard to reload (call after a confirmed transaction). */
export function notifyBalancesChanged() {
  window.dispatchEvent(new Event(BALANCES_CHANGED_EVENT))
}

// Tokens displayed in the wallet balances panel (symbol order preserved)
const WALLET_TOKENS = ['USDC', 'EURC', 'FAJU', 'ARCX', 'QCAD', 'cirBTC'] as const

interface TokenBalance {
  symbol: string
  decimals: number
  formattedBalance: string
  usdValue: number
  /** 'none' = no market price (e.g. pool without liquidity); 'low' = price from a thin pool */
  priceStatus: 'ok' | 'low' | 'none'
  color: string
  letter: string
}

// ── Inline styles for portal overlay (guarantees layout, no CSS leaks) ────────

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.70)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  padding: 16,
}

const modalStyle: CSSProperties = {
  width: '100%',
  maxWidth: 480,
  maxHeight: '90vh',
  overflowY: 'auto',
  background: '#0b1220',
  border: '1px solid rgba(56,189,248,0.25)',
  borderRadius: 20,
  padding: 0,
  boxShadow: '0 0 40px rgba(56,189,248,0.15)',
  position: 'relative',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WalletBalancesCard() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { prices, meta: priceMeta } = useTokenPriceData()

  const [balances, setBalances] = useState<TokenBalance[]>([])
  const [loading, setLoading] = useState(false)
  const [hideBalances, setHideBalances] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    const onChanged = () => setRefreshTick((n) => n + 1)
    window.addEventListener(BALANCES_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(BALANCES_CHANGED_EVENT, onChanged)
  }, [])

  useEffect(() => {
    if (!address || !publicClient || !isConnected) {
      setBalances([])
      return
    }

    setLoading(true)

    const loadBalances = async () => {
      try {
        const tokens = ARC_MAINNET_TOKENS.filter((t) =>
          (WALLET_TOKENS as readonly string[]).includes(t.symbol)
        )

        const results = await Promise.all(
          tokens.map(async (token) => {
            try {
              const raw = (await publicClient.readContract({
                address: token.address,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [address],
              })) as bigint

              // cirBTC has 8 decimals; others typically 6 or 18 — use token.decimals
              const formatted = formatUnits(raw, token.decimals)
              const numeric = parseFloat(formatted)
              const price = prices[token.symbol]
              const priceStatus: TokenBalance['priceStatus'] =
                price === undefined ? 'none' : priceMeta[token.symbol]?.lowLiquidity ? 'low' : 'ok'

              return {
                symbol: token.symbol,
                decimals: token.decimals,
                formattedBalance: formatted,
                usdValue: numeric * (price ?? 0),
                priceStatus,
                color: TOKEN_COLORS[token.symbol] ?? '#6B7280',
                letter: TOKEN_LETTERS[token.symbol] ?? token.symbol[0].toUpperCase(),
              } satisfies TokenBalance
            } catch {
              return {
                symbol: token.symbol,
                decimals: token.decimals,
                formattedBalance: '0',
                usdValue: 0,
                priceStatus: 'none',
                color: TOKEN_COLORS[token.symbol] ?? '#6B7280',
                letter: TOKEN_LETTERS[token.symbol] ?? token.symbol[0].toUpperCase(),
              } satisfies TokenBalance
            }
          })
        )

        // Preserve the desired display order
        const ordered = WALLET_TOKENS.map((sym) =>
          results.find((r) => r.symbol === sym)!
        ).filter(Boolean)

        setBalances(ordered)
      } catch (err) {
        console.error('[WalletBalancesCard] Error loading balances:', err)
      } finally {
        setLoading(false)
      }
    }

    loadBalances()
  }, [address, publicClient, isConnected, prices, priceMeta, refreshTick])

  const totalUsdValue = balances.reduce((sum, b) => sum + b.usdValue, 0)

  // Pulse glow runs 3 times on first mount, then stops — never loops forever
  const [pulseCount, setPulseCount] = useState(0)
  const pulseRef = useRef(0)
  useEffect(() => {
    if (!isConnected) return
    const id = setInterval(() => {
      pulseRef.current += 1
      setPulseCount(pulseRef.current)
      if (pulseRef.current >= 3) clearInterval(id)
    }, 900)
    return () => clearInterval(id)
  }, [isConnected])
  const isPulsing = pulseCount < 3

  if (!isConnected) return null

  // ── Trigger button ──────────────────────────────────────────────────────────
  const trigger = (
    <button
      onClick={() => setIsOpen(true)}
      role="button"
      aria-label="View wallet balances"
      title="View your wallet"
      style={{
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
        boxShadow: isPulsing
          ? '0 0 10px 2px rgba(56,189,248,0.45)'
          : undefined,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)'
        e.currentTarget.style.boxShadow = '0 0 14px 3px rgba(56,189,248,0.55)'
        e.currentTarget.style.borderColor = 'rgba(56,189,248,0.55)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = ''
        e.currentTarget.style.borderColor = ''
      }}
      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700/50 bg-slate-800/30 text-sm text-slate-300 select-none"
    >
      <Wallet className="h-4 w-4 text-cyan-400 shrink-0" />
      <span className="font-semibold text-white">
        {loading ? '…' : `$${formatMoney(totalUsdValue, 2)}`}
      </span>
      <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
    </button>
  )

  // ── Modal content (inner) ───────────────────────────────────────────────────
  const modalContent = (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-slate-400" />
          <h3 className="text-base font-semibold text-white">Wallet Balances</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setHideBalances(!hideBalances)}
            className="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
            title={hideBalances ? 'Show balances' : 'Hide balances'}
          >
            {hideBalances
              ? <EyeOff className="h-4 w-4 text-slate-400" />
              : <Eye className="h-4 w-4 text-slate-400" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {WALLET_TOKENS.map((s) => (
            <div key={s} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-700/50 rounded-full animate-pulse" />
                <div className="w-12 h-4 bg-slate-700/50 rounded animate-pulse" />
              </div>
              <div className="w-20 h-4 bg-slate-700/50 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Total Value */}
          <div className="pb-3 mb-1 border-b border-slate-700/50">
            <div className="text-xs text-slate-400 mb-0.5">Total Value</div>
            <div className="text-2xl font-bold text-white">
              {hideBalances ? '•••••' : `$${formatMoney(totalUsdValue, 2)}`}
            </div>
          </div>

          {/* Token rows */}
          {balances.map((b) => (
            <div key={b.symbol} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ backgroundColor: b.color }}
                >
                  {b.letter}
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{b.symbol}</div>
                  <div className="text-xs text-slate-400">
                    {hideBalances
                      ? '•••••'
                      : b.priceStatus === 'none'
                        ? 'No market price'
                        : `$${formatMoney(b.usdValue, 2)}`}
                  </div>
                  {!hideBalances && b.priceStatus === 'low' && (
                    <div className="text-[10px] text-amber-400" title="Price derived from a pool with very little liquidity — a single trade can move it a lot.">
                      ⚠ Low liquidity — price is indicative
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-white">
                  {hideBalances
                    ? '•••••'
                    // cirBTC: show up to 8 significant decimals; others 4
                    : formatMoney(b.formattedBalance, b.symbol === 'cirBTC' ? 8 : 4)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <>
      {trigger}

      {isOpen && createPortal(
        <div
          style={overlayStyle}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={modalStyle}
            onClick={(e) => e.stopPropagation()}
          >
            {modalContent}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
