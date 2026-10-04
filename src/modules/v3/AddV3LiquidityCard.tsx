/**
 * Add V3 Liquidity — Modal no formato de referência
 * Seleção de tokens · Select range · Visualize range · Statistics
 */

import { useState, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { usePublicClient, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { useArcWallet } from '@/hooks/useArcWallet'
import { parseUnits, formatUnits } from 'viem'
import { Plus, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { getV3Addresses, getV3ConfigError } from './config'
import { ensureAllowance } from '@/lib/allowance'
import { formatMoney } from '@/lib/format'
import { useChainId } from 'wagmi'
import { ARCDEX } from '@/config/arcDex'
import { ARC_TESTNET_TOKENS } from '@/config/tokens.arc-testnet'
import { TokenSelectButton } from '@/components/TokenSelect'
import type { TokenSelectItem } from '@/components/TokenSelect'
import { RangeChart } from './components/RangeChart'
import {
  makeToken,
  buildPool,
  fullRangeTicks as sdkFullRangeTicks,
  priceToUsableTick,
  tickSpacingFor,
  pairedAmountFromAmount0,
  pairedAmountFromAmount1,
} from './lib/sdk'
import { clearV3PositionsCache } from './hooks/useV3Positions'

import NonfungiblePositionManagerAbi from '@/abis/v3/NonfungiblePositionManager.json'
import UniswapV3PoolAbi from '@/abis/v3/UniswapV3Pool.json'
import UniswapV3FactoryAbi from '@/abis/v3/UniswapV3Factory.json'

const FEE_500 = 500

const V3_TOKENS: TokenSelectItem[] = ARC_TESTNET_TOKENS.map((t) => ({
  address: t.address,
  symbol: t.symbol,
  name: t.name,
  decimals: t.decimals,
}))

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
] as const

function parseManualTick(priceStr: string, decimals0: number, decimals1: number, tickSpacing: number): number | null {
  const p = parseFloat(priceStr)
  if (isNaN(p) || p <= 0) return null
  try {
    return priceToUsableTick(p, decimals0, decimals1, tickSpacing)
  } catch {
    return null
  }
}

interface AddV3LiquidityCardProps {
  onMintSuccess?: () => void
}

export function AddV3LiquidityCard({ onMintSuccess }: AddV3LiquidityCardProps = {}) {
  const chainId = useChainId()
  const { address, isConnected } = useArcWallet()
  const publicClient = usePublicClient()
  const { writeContractAsync: _arcWrite, isPending } = useArcWriteContract()
  const [writeHash, setWriteHash] = useState<`0x${string}` | undefined>()
  const writeContractAsync = async (params: any) => { const h = await _arcWrite(params); setWriteHash(h); return h }
  const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash: writeHash, query: { enabled: !!writeHash } })
  const { switchChain } = useSwitchChain()

  const addrs = getV3Addresses(chainId ?? 0)
  const configError = getV3ConfigError(chainId ?? 0)
  const isWrongChain = chainId != null && chainId !== ARCDEX.chainId

  const [open, setOpen] = useState(false)
  // Drag-and-drop: modal position is an offset from its centered layout position, applied via
  // CSS transform. dragRef stores the in-progress drag's start coordinates (mouse + modal) plus
  // the modal's untransformed bounding box, needed to clamp the drag within the viewport.
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    startPosX: number
    startPosY: number
    baseLeft: number
    baseTop: number
    width: number
    height: number
  } | null>(null)
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')
  const [rangePreset, setRangePreset] = useState<'full' | 'manual'>('full')
  const [manualMinPrice, setManualMinPrice] = useState('')
  const [manualMaxPrice, setManualMaxPrice] = useState('')
  const [balance0, setBalance0] = useState<bigint>(0n)
  const [balance1, setBalance1] = useState<bigint>(0n)
  const [currentTick, setCurrentTick] = useState(0)
  const [sqrtPriceX96, setSqrtPriceX96] = useState<bigint>(0n)
  const [poolLiquidity, setPoolLiquidity] = useState<bigint>(0n)
  // Tracks which side the user last typed into (not which is currently focused) so the paired
  // amount keeps updating in real time when range/pool/token-pair changes after the field is blurred.
  const [lastEdited, setLastEdited] = useState<'0' | '1' | null>(null)

  const positionManager = addrs?.v3PositionManager
  const factoryAddress = addrs?.v3Factory

  const [tokenA, setTokenA] = useState<TokenSelectItem | null>(() => V3_TOKENS.find((t) => t.symbol === 'USDC') ?? V3_TOKENS[0])
  const [tokenB, setTokenB] = useState<TokenSelectItem | null>(() => V3_TOKENS.find((t) => t.symbol === 'EURC') ?? V3_TOKENS[1])
  const [poolAddress, setPoolAddress] = useState<`0x${string}` | null>(null)
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolError, setPoolError] = useState<string | null>(null)

  const sameToken = tokenA && tokenB && tokenA.address.toLowerCase() === tokenB.address.toLowerCase()
  const token0Addr =
    tokenA && tokenB && !sameToken
      ? (tokenA.address.toLowerCase() < tokenB.address.toLowerCase() ? tokenA.address : tokenB.address) as `0x${string}`
      : undefined
  const token1Addr =
    tokenA && tokenB && !sameToken
      ? (tokenA.address.toLowerCase() < tokenB.address.toLowerCase() ? tokenB.address : tokenA.address) as `0x${string}`
      : undefined

  const token0 = tokenA && tokenB && token0Addr ? (token0Addr.toLowerCase() === tokenA.address.toLowerCase() ? tokenA : tokenB) : null
  const token1 = tokenA && tokenB && token1Addr ? (token1Addr.toLowerCase() === tokenA.address.toLowerCase() ? tokenA : tokenB) : null
  const decimals0 = token0?.decimals ?? 6
  const decimals1 = token1?.decimals ?? 6
  const symbol0 = token0?.symbol ?? '—'
  const symbol1 = token1?.symbol ?? '—'

  const tickSpacing = tickSpacingFor(FEE_500)
  const manualTickLower = parseManualTick(manualMinPrice, decimals0, decimals1, tickSpacing)
  const manualTickUpper = parseManualTick(manualMaxPrice, decimals0, decimals1, tickSpacing)
  const { tickLower, tickUpper } =
    rangePreset === 'full'
      ? sdkFullRangeTicks(FEE_500)
      : {
          tickLower: manualTickLower ?? sdkFullRangeTicks(FEE_500).tickLower,
          tickUpper: manualTickUpper ?? sdkFullRangeTicks(FEE_500).tickUpper,
        }
  const tickLo = Math.min(tickLower, tickUpper)
  const tickHi = Math.max(tickLower, tickUpper)
  const inRange = currentTick >= tickLo && currentTick <= tickHi

  // Resolve pool when token pair changes
  useEffect(() => {
    if (!publicClient || !factoryAddress || !token0Addr || !token1Addr) {
      setPoolAddress(null)
      setPoolError(null)
      return
    }
    setPoolLoading(true)
    setPoolError(null)
    publicClient
      .readContract({
        address: factoryAddress,
        abi: UniswapV3FactoryAbi as never[],
        functionName: 'getPool',
        args: [token0Addr, token1Addr, FEE_500],
      })
      .then((addr) => {
        const a = addr as string
        if (a && a !== '0x0000000000000000000000000000000000000000') {
          setPoolAddress(a as `0x${string}`)
          setPoolError(null)
        } else {
          setPoolAddress(null)
          const s0 = V3_TOKENS.find((t) => t.address.toLowerCase() === token0Addr?.toLowerCase())?.symbol ?? '?'
          const s1 = V3_TOKENS.find((t) => t.address.toLowerCase() === token1Addr?.toLowerCase())?.symbol ?? '?'
          setPoolError(`V3 Pool for ${s0}/${s1} doesn't exist yet on Arc Testnet. For this pair, use V2 Pools.`)
        }
      })
      .catch(() => {
        setPoolAddress(null)
        setPoolError('Error checking the pool.')
      })
      .finally(() => setPoolLoading(false))
  }, [publicClient, factoryAddress, token0Addr, token1Addr])

  // Reset amounts and manual range inputs when token pair changes — a price typed for the
  // previous pair's scale is meaningless once token0/token1 (and their decimals) change.
  useEffect(() => {
    setAmount0('')
    setAmount1('')
    setLastEdited(null)
    setManualMinPrice('')
    setManualMaxPrice('')
  }, [token0Addr, token1Addr])

  // Recenter the modal and reset the range selector back to Full Range each time it's opened,
  // instead of reopening wherever it was last dragged to / left in Manual mode.
  useEffect(() => {
    if (open) {
      setRangePreset('full')
      setManualMinPrice('')
      setManualMaxPrice('')
    } else {
      setPos({ x: 0, y: 0 })
    }
  }, [open])

  // Drag-and-drop: listeners stay attached to the document for the whole modal lifetime and
  // no-op unless a drag is in progress (dragRef.current set by the header's onMouseDown below).
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const drag = dragRef.current
      if (!drag) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      const margin = 80 // px of the modal that must stay reachable on-screen
      const minX = margin - drag.baseLeft - drag.width
      const maxX = window.innerWidth - margin - drag.baseLeft
      const minY = margin - drag.baseTop - drag.height
      const maxY = window.innerHeight - margin - drag.baseTop
      setPos({
        x: Math.min(Math.max(drag.startPosX + dx, minX), maxX),
        y: Math.min(Math.max(drag.startPosY + dy, minY), maxY),
      })
    }
    function handleMouseUp() {
      dragRef.current = null
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleHeaderMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!modalRef.current) return
    const rect = modalRef.current.getBoundingClientRect()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
      // rect already includes the current translate(pos.x, pos.y) — subtract it to recover
      // the modal's untransformed ("base") position for clamping math.
      baseLeft: rect.left - pos.x,
      baseTop: rect.top - pos.y,
      width: rect.width,
      height: rect.height,
    }
  }

  useEffect(() => {
    if (!address || !publicClient || !token0Addr || !token1Addr) return
    Promise.all([
      publicClient.readContract({ address: token0Addr as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
      publicClient.readContract({ address: token1Addr as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
    ]).then(([b0, b1]) => {
      setBalance0(b0)
      setBalance1(b1)
    }).catch(() => {})
  }, [address, publicClient, token0Addr, token1Addr, open])

  useEffect(() => {
    if (!publicClient || !poolAddress) return
    Promise.all([
      publicClient.readContract({ address: poolAddress, abi: UniswapV3PoolAbi as never[], functionName: 'slot0' }) as Promise<[bigint, number, ...unknown[]]>,
      publicClient.readContract({ address: poolAddress, abi: UniswapV3PoolAbi as never[], functionName: 'liquidity' }) as Promise<bigint>,
    ]).then(([slot, liq]) => {
      setSqrtPriceX96(slot[0])
      setCurrentTick(slot[1])
      setPoolLiquidity(liq)
    }).catch(() => {})
  }, [publicClient, poolAddress, open])

  const amount0Raw = useMemo(() => {
    try {
      const v = (amount0 ?? '').trim()
      if (!v) return null
      const n = parseFloat(v)
      if (isNaN(n) || n < 0) return null
      return parseUnits(v, decimals0)
    } catch { return null }
  }, [amount0, decimals0])
  const amount1Raw = useMemo(() => {
    try {
      const v = (amount1 ?? '').trim()
      if (!v) return null
      const n = parseFloat(v)
      if (isNaN(n) || n < 0) return null
      return parseUnits(v, decimals1)
    } catch { return null }
  }, [amount1, decimals1])

  const priceBelowRange = currentTick < tickLo
  const priceAboveRange = currentTick > tickHi

  const sdkToken0 = useMemo(() => {
    if (!token0Addr) return null
    try { return makeToken(chainId ?? 0, token0Addr, decimals0, symbol0) } catch { return null }
  }, [chainId, token0Addr, decimals0, symbol0])
  const sdkToken1 = useMemo(() => {
    if (!token1Addr) return null
    try { return makeToken(chainId ?? 0, token1Addr, decimals1, symbol1) } catch { return null }
  }, [chainId, token1Addr, decimals1, symbol1])

  const pool = useMemo(() => {
    if (!sdkToken0 || !sdkToken1 || sqrtPriceX96 <= 0n) return null
    try {
      return buildPool(sdkToken0, sdkToken1, FEE_500, sqrtPriceX96, poolLiquidity, currentTick)
    } catch { return null }
  }, [sdkToken0, sdkToken1, sqrtPriceX96, poolLiquidity, currentTick])

  const currentPriceLabel = pool ? pool.token0Price.toSignificant(6) : ''
  // Full range spans the entire tick space — its boundary prices are astronomically small/large
  // (1.0001^±887272), so show 0/∞ like Uniswap's own UI instead of a 40-digit number. In Manual
  // mode, echo back exactly what the user typed (not the tick-snapped price) so the label always
  // matches their input.
  const minPriceParsed = parseFloat(manualMinPrice)
  const maxPriceParsed = parseFloat(manualMaxPrice)
  const minPriceLabel = rangePreset === 'full' ? '0' : !isNaN(minPriceParsed) ? minPriceParsed.toFixed(6) : '0'
  const maxPriceLabel = rangePreset === 'full' ? '∞' : !isNaN(maxPriceParsed) ? maxPriceParsed.toFixed(6) : '∞'

  const computedAmount1From0 = useMemo(() => {
    if (!amount0Raw || amount0Raw <= 0n || !pool) return null
    try {
      return pairedAmountFromAmount0(pool, tickLo, tickHi, amount0Raw).amount1Exact
    } catch { return null }
  }, [amount0Raw, pool, tickLo, tickHi])

  const computedAmount0From1 = useMemo(() => {
    if (!amount1Raw || amount1Raw <= 0n || !pool) return null
    try {
      return pairedAmountFromAmount1(pool, tickLo, tickHi, amount1Raw).amount0Exact
    } catch { return null }
  }, [amount1Raw, pool, tickLo, tickHi])

  function formatAmountDisplay(val: string, maxDecimals = 6): string {
    const num = parseFloat(val)
    if (isNaN(num) || num === 0) return '0'
    if (Math.abs(num) >= 1e9) return num.toLocaleString('en-US', { maximumFractionDigits: 0 })
    if (Math.abs(num) < 1e-12) return '0'
    const fixed = num.toFixed(maxDecimals)
    const trimmed = fixed.replace(/\.?0+$/, '')
    return trimmed
  }

  useEffect(() => {
    if (lastEdited !== '0') return
    if (computedAmount1From0 != null && amount0) {
      const formatted = formatAmountDisplay(computedAmount1From0)
      setAmount1((prev) => (prev !== formatted ? formatted : prev))
    } else if (!amount0) {
      setAmount1('')
    }
  }, [amount0, computedAmount1From0, lastEdited])

  useEffect(() => {
    if (lastEdited !== '1') return
    if (computedAmount0From1 != null && amount1) {
      const formatted = formatAmountDisplay(computedAmount0From1)
      setAmount0((prev) => (prev !== formatted ? formatted : prev))
    } else if (!amount1) {
      setAmount0('')
    }
  }, [amount1, computedAmount0From1, lastEdited])

  const handleMint = async () => {
    if (!address || !publicClient || !positionManager || !token0Addr || !token1Addr || !addrs) {
      toast.error('Connect your wallet and check the V3 configuration.')
      return
    }
    if (isWrongChain && switchChain) {
      try {
        await switchChain({ chainId: ARCDEX.chainId })
        return
      } catch {
        toast.error('Switch to Arc Testnet manually.')
        return
      }
    }
    if (!amount0Raw || !amount1Raw || amount0Raw <= 0n || amount1Raw <= 0n) {
      toast.error('Enter valid amounts for both tokens.')
      return
    }
    if (balance0 < amount0Raw || balance1 < amount1Raw) {
      toast.error('Insufficient balance.')
      return
    }

    const writeOpts = (opts: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: unknown[] }) =>
      writeContractAsync({ address: opts.address, abi: opts.abi, functionName: opts.functionName, args: opts.args })

    try {
      await ensureAllowance(publicClient, writeOpts, token0Addr as `0x${string}`, address, positionManager, amount0Raw)
      await ensureAllowance(publicClient, writeOpts, token1Addr as `0x${string}`, address, positionManager, amount1Raw)
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'Approval failed')
      return
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
    const params = {
      token0: token0Addr,
      token1: token1Addr,
      fee: FEE_500,
      tickLower,
      tickUpper,
      amount0Desired: amount0Raw,
      amount1Desired: amount1Raw,
      amount0Min: 0n,
      amount1Min: 0n,
      recipient: address,
      deadline,
    }

    const toastId = 'v3-mint'
    try {
      toast.loading('Confirm in your wallet...', { id: toastId })
      await writeContractAsync({
        address: positionManager,
        abi: NonfungiblePositionManagerAbi as never,
        functionName: 'mint',
        args: [params],
      })
      toast.loading('Confirming on the blockchain...', { id: toastId })
    } catch (e: unknown) {
      toast.dismiss(toastId)
      const msg = (e as { message?: string })?.message ?? 'Mint failed'
      const isRejected = /reject|denied|cancelado|cancelled/i.test(msg)
      toast.error(isRejected ? 'Transaction cancelled in wallet.' : msg)
    }
  }

  useEffect(() => {
    if (isSuccess && writeHash) {
      toast.dismiss('v3-mint')
      toast.success('Position created!')
      setAmount0('')
      setAmount1('')
      setOpen(false)
      clearV3PositionsCache()
      onMintSuccess?.()
    }
  }, [isSuccess, writeHash, onMintSuccess])

  useEffect(() => {
    if (isError && writeHash) {
      toast.dismiss('v3-mint')
      toast.error('Transaction failed on the blockchain. Check the details and try again.')
    }
  }, [isError, writeHash])

  if (configError || !addrs) return null

  const isLoading = isPending || isConfirming
  const hasValidPool = !!poolAddress && !poolError
  const canMint =
    isConnected &&
    !!address &&
    hasValidPool &&
    !!amount0Raw &&
    !!amount1Raw &&
    amount0Raw > 0n &&
    amount1Raw > 0n &&
    balance0 >= amount0Raw &&
    balance1 >= amount1Raw &&
    !isWrongChain

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
        style={{ background: 'linear-gradient(135deg,#4ea3ff,#b14cff)', boxShadow: '0 0 18px rgba(78,163,255,0.35)' }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(78,163,255,0.5)' }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 0 18px rgba(78,163,255,0.35)' }}
      >
        <Plus className="h-4 w-4" />
        Add V3 Liquidity
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 overflow-y-auto">
          <div
            ref={modalRef}
            className="w-full max-w-4xl rounded-2xl border border-slate-700/50 bg-slate-900 shadow-xl my-8"
            style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
          >
            <div
              className="flex items-center justify-between p-6 border-b border-slate-700/50"
              style={{ cursor: 'move' }}
              onMouseDown={handleHeaderMouseDown}
            >
              <h2 className="text-xl font-semibold text-white">Add V3 Liquidity</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <TokenSelectButton
                  tokens={V3_TOKENS}
                  selected={tokenA}
                  onSelect={setTokenA}
                  excludedAddress={tokenB?.address}
                  showBalance
                  placeholder="Token A"
                />
                <span className="text-slate-500">/</span>
                <TokenSelectButton
                  tokens={V3_TOKENS}
                  selected={tokenB}
                  onSelect={setTokenB}
                  excludedAddress={tokenA?.address}
                  showBalance
                  placeholder="Token B"
                />
                <span className="text-slate-500 text-sm">— 0.05% fee</span>
                {poolLoading && <span className="text-slate-400 text-sm">Checking pool...</span>}
                {poolError && <span className="text-amber-400 text-sm">{poolError}</span>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Coluna esquerda */}
                <div className="space-y-6">
                  {/* Select range */}
                  <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                    <h3 className="text-sm font-semibold text-white mb-3">Select range</h3>
                    <p className="text-xs text-slate-400 mb-4">
                      Current price: {currentPriceLabel || '—'} {symbol1} per {symbol0}
                    </p>
                    {priceBelowRange && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs mb-4">
                        <span>⚠</span>
                        <span>Current price is below range. Position will be 100% {symbol0} when created.</span>
                      </div>
                    )}
                    {priceAboveRange && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs mb-4">
                        <span>⚠</span>
                        <span>Current price is above range. Position will be 100% {symbol1} when created.</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRangePreset('full')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${rangePreset === 'full' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800/60 text-slate-400 border border-slate-600 hover:bg-slate-700/60'}`}
                      >
                        Full Range
                      </button>
                      <button
                        type="button"
                        onClick={() => setRangePreset('manual')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${rangePreset === 'manual' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800/60 text-slate-400 border border-slate-600 hover:bg-slate-700/60'}`}
                      >
                        Manual
                      </button>
                    </div>
                    {rangePreset === 'manual' && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-3">
                          <span className="text-xs text-slate-400">Min price</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.0"
                            value={manualMinPrice}
                            onChange={(e) => setManualMinPrice(e.target.value.replace(/,/g, '.'))}
                            className="w-full bg-transparent text-base font-semibold text-white focus:outline-none mt-1"
                          />
                        </div>
                        <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-3">
                          <span className="text-xs text-slate-400">Max price</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.0"
                            value={manualMaxPrice}
                            onChange={(e) => setManualMaxPrice(e.target.value.replace(/,/g, '.'))}
                            className="w-full bg-transparent text-base font-semibold text-white focus:outline-none mt-1"
                          />
                        </div>
                      </div>
                    )}
                    <div className="mt-3 flex gap-4 text-xs text-slate-500">
                      <span>Min: {minPriceLabel}</span>
                      <span>Max: {maxPriceLabel}</span>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Amount</h3>
                    <div className="space-y-4">
                      <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-slate-400">{symbol0}</span>
                          <span className="text-xs text-slate-500">Balance {formatMoney(formatUnits(balance0, decimals0), 4)}</span>
                        </div>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={amount0}
                          onChange={(e) => { setLastEdited('0'); setAmount0(e.target.value.replace(/,/g, '.')) }}
                          className="w-full bg-transparent text-xl font-semibold text-white focus:outline-none"
                        />
                      </div>
                      <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-slate-400">{symbol1}</span>
                          <span className="text-xs text-slate-500">Balance {formatMoney(formatUnits(balance1, decimals1), 4)}</span>
                        </div>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={amount1}
                          onChange={(e) => { setLastEdited('1'); setAmount1(e.target.value.replace(/,/g, '.')) }}
                          className="w-full bg-transparent text-xl font-semibold text-white focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleMint}
                        disabled={!canMint || isLoading}
                        className="w-full py-3.5 rounded-xl font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Creating position...
                          </>
                        ) : !isConnected ? (
                          'Connect wallet'
                        ) : (
                          'Create Position'
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Coluna direita */}
                <div className="space-y-6">
                  {/* Visualize range */}
                  <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                    <RangeChart
                      tickLower={tickLower}
                      tickUpper={tickUpper}
                      currentTick={currentTick}
                      symbol0={symbol0}
                      symbol1={symbol1}
                      inRange={inRange}
                      label="View range"
                      minPriceLabel={minPriceLabel}
                      maxPriceLabel={maxPriceLabel}
                      currentPriceLabel={currentPriceLabel || undefined}
                    />
                  </div>

                  {/* Statistics */}
                  <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Statistics</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">TVL</span>
                        <span className="text-slate-200">—</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">24h Volume</span>
                        <span className="text-slate-200">—</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Fee</span>
                        <span className="text-slate-200">0.05%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Pair</span>
                        <span className="text-slate-200">{symbol0}/{symbol1}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
