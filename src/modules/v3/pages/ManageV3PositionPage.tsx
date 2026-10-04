/**
 * ManageV3PositionPage — Icarus-style layout
 * Collect fees, Add/Remove liquidity, range selector
 *
 * Layout: 2-column fixed-height on lg+, single-column scroll on mobile.
 * Header height assumed ~3.5rem (56px) — adjust calc() if your header differs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt } from 'wagmi'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { parseUnits, formatUnits, encodeFunctionData, type Abi } from 'viem'
import { toast } from 'react-hot-toast'
import { ArrowLeft, Loader2, Coins, Plus, Minus, AlertCircle, ExternalLink } from 'lucide-react'
import { getV3Addresses, getV3ConfigError } from '../config'
import {
  makeToken,
  buildPool,
  fullRangeTicks as sdkFullRangeTicks,
  tickSpacingFor,
  positionAmounts,
  partialLiquidity,
  tickPriceLabel,
} from '../lib/sdk'
import { getArcTokenInfo } from '../lib/tokenInfo'
import { RangeChart } from '../components/RangeChart'
import { RemoveV3LiquidityModal } from '../components/RemoveV3LiquidityModal'
import { AddV3LiquidityModal } from '../components/AddV3LiquidityModal'
import { ensureAllowance } from '@/lib/allowance'
import { formatCurrencyAmount } from '@/lib/format'
import { ARCDEX } from '@/config/arcDex'

const MAX_UINT128 = 340282366920938463463374607431768211455n

import NonfungiblePositionManagerAbi from '@/abis/v3/NonfungiblePositionManager.json'
import UniswapV3PoolAbi from '@/abis/v3/UniswapV3Pool.json'
import UniswapV3FactoryAbi from '@/abis/v3/UniswapV3Factory.json'

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
] as const

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

type TxState = 'idle' | 'loading' | 'pending' | 'success' | 'error'

// ── Shared compact card style ──────────────────────────────────────────────
const CARD = 'rounded-2xl border border-slate-700/50 bg-slate-800/30 p-4'

export function ManageV3PositionPage() {
  const { tokenId } = useParams<{ tokenId: string }>()
  const { hash: locationHash } = useLocation()
  const chainId = useChainId()
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync: _arcWrite, isPending } = useArcWriteContract()
  const [writeHash, setWriteHash] = useState<`0x${string}` | undefined>()
  const writeContractAsync = async (params: any) => { const h = await _arcWrite(params); setWriteHash(h); return h }
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: writeHash, query: { enabled: !!writeHash } })

  const addrs = useMemo(() => getV3Addresses(chainId ?? 0), [chainId])
  const configError = getV3ConfigError(chainId ?? 0)
  const isWrongChain = chainId != null && chainId !== ARCDEX.chainId

  const [pos, setPos] = useState<{
    token0: `0x${string}`
    token1: `0x${string}`
    fee: number
    tickLower: number
    tickUpper: number
    liquidity: bigint
    tokensOwed0: bigint
    tokensOwed1: bigint
  } | null>(null)
  const [currentTick, setCurrentTick] = useState<number>(0)
  const [sqrtPriceX96, setSqrtPriceX96] = useState<bigint | null>(null)
  const [poolLiquidity, setPoolLiquidity] = useState<bigint>(0n)
  const [balance0, setBalance0] = useState<string>('')
  const [balance1, setBalance1] = useState<string>('')
  const [rangeMode, setRangeMode] = useState<'full' | 'manual'>('full')
  const [manualTickLower, setManualTickLower] = useState('')
  const [manualTickUpper, setManualTickUpper] = useState('')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [removeModalOpen, setRemoveModalOpen] = useState(false)
  const [txState, setTxState] = useState<TxState>('idle')

  const tid = useMemo(() => (tokenId ? BigInt(tokenId) : 0n), [tokenId])
  const inRange = pos ? currentTick >= pos.tickLower && currentTick <= pos.tickUpper : false
  // Whether the position's own range (not the increase-range selector below) is below/above the
  // pool's current price — determines which side of "Add liquidity" can accept a deposit.
  const positionPriceBelowRange = pos ? currentTick < pos.tickLower : false
  const positionPriceAboveRange = pos ? currentTick > pos.tickUpper : false

  const info0 = pos ? getArcTokenInfo(pos.token0) : null
  const info1 = pos ? getArcTokenInfo(pos.token1) : null
  const sym0 = info0?.symbol ?? '—'
  const sym1 = info1?.symbol ?? '—'
  const decimals0 = info0?.decimals ?? 18
  const decimals1 = info1?.decimals ?? 18

  const loadPosition = useCallback(async () => {
    if (!publicClient || !addrs || tid === 0n) return
    try {
      const rawPosition = await publicClient.readContract({
        address: addrs.v3PositionManager,
        abi: NonfungiblePositionManagerAbi as unknown[],
        functionName: 'positions',
        args: [tid],
      })
      const raw = rawPosition as readonly [unknown, unknown, `0x${string}`, `0x${string}`, number, number, number, bigint, unknown, unknown, bigint, bigint]
      const position = {
        token0: raw[2],
        token1: raw[3],
        fee: raw[4],
        tickLower: raw[5],
        tickUpper: raw[6],
        liquidity: raw[7],
        tokensOwed0: raw[10],
        tokensOwed1: raw[11],
      }
      setPos(position)
      setManualTickLower(String(position.tickLower))
      setManualTickUpper(String(position.tickUpper))

      // Resolve the position's actual pool — must not assume a fixed USDC/EURC pool, since
      // positions can exist on any pair the factory has deployed.
      const poolAddr = (await publicClient.readContract({
        address: addrs.v3Factory,
        abi: UniswapV3FactoryAbi as never[],
        functionName: 'getPool',
        args: [position.token0, position.token1, position.fee],
      })) as `0x${string}`
      if (poolAddr && poolAddr.toLowerCase() !== ZERO_ADDRESS) {
        const [slot0, liq] = await Promise.all([
          publicClient.readContract({
            address: poolAddr,
            abi: UniswapV3PoolAbi as unknown[],
            functionName: 'slot0',
          }) as Promise<[bigint, number, number, number, number, number, boolean]>,
          publicClient.readContract({
            address: poolAddr,
            abi: UniswapV3PoolAbi as unknown[],
            functionName: 'liquidity',
          }) as Promise<bigint>,
        ])
        setSqrtPriceX96(slot0[0])
        setCurrentTick(slot0[1])
        setPoolLiquidity(liq)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load position')
      setPos(null)
    }
  }, [publicClient, addrs, tid])

  useEffect(() => { loadPosition() }, [loadPosition])

  useEffect(() => {
    if (locationHash === '#collect') {
      document.getElementById('collect')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [locationHash, pos])

  useEffect(() => {
    if (!address || !publicClient || !pos) return
    let cancelled = false
    Promise.all([
      publicClient.readContract({ address: pos.token0, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
      publicClient.readContract({ address: pos.token1, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
    ]).then(([b0, b1]) => {
      if (!cancelled) { setBalance0(formatUnits(b0, decimals0)); setBalance1(formatUnits(b1, decimals1)) }
    }).catch(() => { if (!cancelled) { setBalance0(''); setBalance1('') } })
    return () => { cancelled = true }
  }, [address, publicClient, pos?.token0, pos?.token1, decimals0, decimals1])

  useEffect(() => {
    if (isSuccess) { setTxState('success'); toast.success('Transaction confirmed'); loadPosition() }
  }, [isSuccess, loadPosition])

  const collectFees = async () => {
    if (!address) { toast.error('Connect your wallet first.'); return }
    if (!addrs || tid === 0n) { toast.error('Network not ready. Reload the page.'); return }
    setTxState('loading')
    try {
      toast.loading('Collecting fees...', { id: 'collect' })
      const h = await writeContractAsync({
        address: addrs.v3PositionManager,
        abi: NonfungiblePositionManagerAbi as unknown[],
        functionName: 'collect',
        args: [{ tokenId: tid, recipient: address, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }],
      })
      setTxState('pending')
      await publicClient!.waitForTransactionReceipt({ hash: h })
      toast.dismiss('collect'); toast.success('Fees collected')
    } catch (e) {
      setTxState('error'); toast.dismiss('collect')
      toast.error(e instanceof Error ? e.message : 'Failed to collect')
    }
  }

  // Takes amounts as arguments (from the modal) instead of reading page-level state — every exit
  // path shows a toast, matching the same defensive pattern as removeLiquidity below.
  const addLiquidity = async (amount0: string, amount1: string) => {
    if (!address) { toast.error('Connect your wallet first.'); return }
    if (!publicClient || !addrs) { toast.error('Network not ready. Reload the page.'); return }
    if (tid === 0n || !pos) { toast.error('Position not loaded yet.'); return }
    const a0 = amount0 ? parseUnits(amount0, decimals0) : 0n
    const a1 = amount1 ? parseUnits(amount1, decimals1) : 0n
    if (a0 === 0n && a1 === 0n) { toast.error('Enter amounts'); return }
    setTxState('loading')
    const writeOpts = (opts: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: unknown[] }) =>
      writeContractAsync({ address: opts.address, abi: opts.abi, functionName: opts.functionName, args: opts.args })
    try {
      if (a0 > 0n) { toast.loading(`Approving ${sym0}...`, { id: 'ap0' }); await ensureAllowance(publicClient, writeOpts, pos.token0, address, addrs.v3PositionManager, a0); toast.dismiss('ap0') }
      if (a1 > 0n) { toast.loading(`Approving ${sym1}...`, { id: 'ap1' }); await ensureAllowance(publicClient, writeOpts, pos.token1, address, addrs.v3PositionManager, a1); toast.dismiss('ap1') }
      toast.loading('Adding liquidity...', { id: 'inc' })
      const h = await writeContractAsync({
        address: addrs.v3PositionManager,
        abi: NonfungiblePositionManagerAbi as unknown[],
        functionName: 'increaseLiquidity',
        args: [{ tokenId: tid, amount0Desired: a0, amount1Desired: a1, amount0Min: 0n, amount1Min: 0n, deadline: BigInt(Math.floor(Date.now() / 1000) + 3600) }],
      })
      setTxState('pending')
      await publicClient.waitForTransactionReceipt({ hash: h })
      toast.dismiss('inc'); toast.success('Liquidity added'); setAddModalOpen(false)
    } catch (e) {
      setTxState('error'); toast.dismiss()
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  // Remove liquidity — decreaseLiquidity + collect bundled into ONE atomic transaction via
  // NonfungiblePositionManager.multicall(), instead of two sequential txs. That atomicity (not
  // amount0Min/amount1Min, which were already 0) is what made "Remove" unreliable: if the second
  // tx (collect) was ever rejected, missed, or failed to estimate gas, liquidity had already been
  // burned with no tokens collected and no way to retry from the UI.
  //
  // amount0Min/amount1Min are hardcoded to 0 rather than derived from
  // NonfungiblePositionManager.removeCallParameters()'s slippageTolerance: for a position that's
  // already 100% single-sided (out of range), that function's slippage math only reaches a
  // literal zero once the tolerance happens to push the counterfactual price across the range
  // boundary — which depends on how far out of range the price already is, so no fixed
  // percentage reliably gives "free slippage" for every position. Hardcoding 0n is exact.
  //
  // Takes `percent` as an argument (from the modal) instead of reading page-level state — every
  // exit path shows a toast, so a guard condition failing can never look like the button "did
  // nothing".
  const removeLiquidity = async (percent: number) => {
    if (!address) { toast.error('Connect your wallet first.'); return }
    if (!publicClient || !addrs) { toast.error('Network not ready. Reload the page.'); return }
    if (tid === 0n || !pos) { toast.error('Position not loaded yet.'); return }
    if (pos.liquidity === 0n) { toast.error('This position has no liquidity left to remove.'); return }
    setTxState('loading')
    try {
      const liquidityToRemove = partialLiquidity(pos.liquidity, percent)
      if (liquidityToRemove <= 0n) { toast.error('Computed liquidity to remove is zero.'); setTxState('idle'); return }
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
      const decreaseData = encodeFunctionData({
        abi: NonfungiblePositionManagerAbi as Abi,
        functionName: 'decreaseLiquidity',
        args: [{ tokenId: tid, liquidity: liquidityToRemove, amount0Min: 0n, amount1Min: 0n, deadline }],
      })
      const collectData = encodeFunctionData({
        abi: NonfungiblePositionManagerAbi as Abi,
        functionName: 'collect',
        args: [{ tokenId: tid, recipient: address, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }],
      })
      toast.loading('Removing liquidity...', { id: 'rm' })
      const h = await writeContractAsync({
        address: addrs.v3PositionManager,
        abi: NonfungiblePositionManagerAbi as unknown[],
        functionName: 'multicall',
        args: [[decreaseData, collectData]],
      })
      setTxState('pending')
      await publicClient.waitForTransactionReceipt({ hash: h })
      toast.dismiss('rm'); toast.success('Liquidity removed'); setRemoveModalOpen(false)
    } catch (e) {
      setTxState('error'); toast.dismiss('rm')
      toast.error(e instanceof Error ? e.message : 'Failed to remove liquidity')
    }
  }

  const sdkToken0 = useMemo(() => {
    if (!pos) return null
    try { return makeToken(chainId ?? 0, pos.token0, decimals0, sym0) } catch { return null }
  }, [chainId, pos, decimals0, sym0])
  const sdkToken1 = useMemo(() => {
    if (!pos) return null
    try { return makeToken(chainId ?? 0, pos.token1, decimals1, sym1) } catch { return null }
  }, [chainId, pos, decimals1, sym1])

  const pool = useMemo(() => {
    if (!pos || !sdkToken0 || !sdkToken1 || sqrtPriceX96 == null || sqrtPriceX96 <= 0n) return null
    try {
      return buildPool(sdkToken0, sdkToken1, pos.fee, sqrtPriceX96, poolLiquidity, currentTick)
    } catch { return null }
  }, [pos, sdkToken0, sdkToken1, sqrtPriceX96, poolLiquidity, currentTick])

  const tickLower = rangeMode === 'full' && pos ? sdkFullRangeTicks(pos.fee).tickLower : parseInt(manualTickLower, 10)
  const tickUpper = rangeMode === 'full' && pos ? sdkFullRangeTicks(pos.fee).tickUpper : parseInt(manualTickUpper, 10)
  const rangeValid = !isNaN(tickLower) && !isNaN(tickUpper) && tickLower < tickUpper
  const sp = pos ? tickSpacingFor(pos.fee) : 10
  const manualAligned = rangeMode === 'manual' ? (tickLower % sp === 0 && tickUpper % sp === 0) : true

  const busy = txState === 'loading' || txState === 'pending' || isPending || isConfirming

  // ── Error / loading states ─────────────────────────────────────────────────
  if (isWrongChain || configError) {
    return (
      <div className="py-6 px-4 max-w-3xl mx-auto">
        <Link to="/pools?tab=v3" className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Pools
        </Link>
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
          <AlertCircle className="h-5 w-5 inline-block mr-2" />
          {configError ?? 'Connect to Arc Testnet'}
        </div>
      </div>
    )
  }

  if (!pos && tid > 0n) {
    return (
      <div className="py-6 px-4 max-w-3xl mx-auto">
        <Link to="/pools?tab=v3" className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="p-8 text-center rounded-2xl border border-slate-700/50 bg-slate-800/20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading position #{tokenId}...</p>
        </div>
      </div>
    )
  }

  if (!pos) {
    return (
      <div className="py-6 px-4 max-w-3xl mx-auto">
        <Link to="/pools?tab=v3" className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="p-8 text-center rounded-2xl border border-slate-700/50 bg-slate-800/20">
          <p className="text-slate-400 text-sm">Position not found</p>
        </div>
      </div>
    )
  }

  const { amount0Exact: posAmount0Exact, amount1Exact: posAmount1Exact } = pool
    ? positionAmounts(pool, pos.tickLower, pos.tickUpper, pos.liquidity)
    : { amount0Exact: '0', amount1Exact: '0' }

  // A position minted with the full tick range has astronomically small/large boundary prices
  // (1.0001^±887272) — show 0/∞ like Uniswap's own UI instead of a 40-digit number.
  const posIsFullRange = sdkFullRangeTicks(pos.fee).tickLower === pos.tickLower && sdkFullRangeTicks(pos.fee).tickUpper === pos.tickUpper
  const priceLowLabel = posIsFullRange ? '0' : sdkToken0 && sdkToken1 ? tickPriceLabel(sdkToken0, sdkToken1, Math.min(pos.tickLower, pos.tickUpper)) : '0'
  const priceHighLabel = posIsFullRange ? '∞' : sdkToken0 && sdkToken1 ? tickPriceLabel(sdkToken0, sdkToken1, Math.max(pos.tickLower, pos.tickUpper)) : '0'
  const curPriceLabel = pool ? pool.token0Price.toSignificant(6) : (sdkToken0 && sdkToken1 ? tickPriceLabel(sdkToken0, sdkToken1, currentTick) : '0')

  // ── Main layout ────────────────────────────────────────────────────────────
  // Desktop (lg+): fixed-height 2-column layout, each column scrolls independently.
  // Mobile:        single column, page scrolls normally.
  return (
    <div className="
      px-3 lg:px-4 max-w-5xl mx-auto
      pt-2 pb-4
      lg:h-[calc(100vh-3.5rem)] lg:flex lg:flex-col lg:overflow-hidden
    ">
      {/* Back link — shrinks to minimum on desktop so grid gets all remaining space */}
      <Link
        to="/pools?tab=v3"
        className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 mb-2 lg:shrink-0"
      >
        <ArrowLeft className="h-4 w-4" /> Back to V3 Positions
      </Link>

      {/* 2-column grid — on desktop takes all remaining height */}
      <div className="
        grid grid-cols-1 lg:grid-cols-[58fr_42fr] gap-3
        lg:flex-1 lg:min-h-0 lg:overflow-hidden
      ">

        {/* ── LEFT column: Manage · Select range · Amount ── */}
        <div className="space-y-3 lg:overflow-y-auto lg:min-h-0 lg:pr-1 pb-2">

          {/* Manage position ───────────────────────────────────────── */}
          <div id="collect" className={`${CARD} scroll-mt-4`}>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-base font-semibold text-white">Manage position</h2>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium ${inRange ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${inRange ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {inRange ? 'In range' : 'Out of range'}
              </span>
            </div>

            <p className="text-slate-400 text-xs mb-0.5">Position #{tokenId}</p>
            <p className="text-slate-300 text-xs font-medium mb-2.5">
              {priceLowLabel} ⇌ {priceHighLabel} {sym1}
            </p>

            {/* APR / Staked / Deposited — 3 columns, compact */}
            <div className="grid grid-cols-3 gap-2 mb-2.5">
              <div>
                <span className="text-slate-500 text-xs block">APR</span>
                <span className="text-slate-200 text-xs font-medium">0.00%</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs block">Staked</span>
                <span className="text-slate-200 text-xs font-medium">$—</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs block">Deposited</span>
                <span className="text-slate-200 text-xs font-medium">
                  {formatCurrencyAmount(posAmount0Exact, sym0)} {sym0}
                  {' + '}
                  {formatCurrencyAmount(posAmount1Exact, sym1)} {sym1}
                </span>
              </div>
            </div>

            {(pos.tokensOwed0 > 0n || pos.tokensOwed1 > 0n) && (
              <p className="text-xs text-amber-400 mb-2">
                Rewards: {formatCurrencyAmount(formatUnits(pos.tokensOwed0, decimals0), sym0)} {sym0}
                {' / '}
                {formatCurrencyAmount(formatUnits(pos.tokensOwed1, decimals1), sym1)} {sym1}
              </p>
            )}

            {/* Action buttons — compact height */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={collectFees}
                disabled={busy || (pos.tokensOwed0 === 0n && pos.tokensOwed1 === 0n)}
                title={pos.tokensOwed0 === 0n && pos.tokensOwed1 === 0n ? 'No fees to collect yet.' : undefined}
                className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />}
                Claim reward
              </button>
              <button
                onClick={() => setAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-xl text-xs font-medium border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-amber-500/20 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add Liquidity
              </button>
              {pos.liquidity > 0n && (
                <button
                  onClick={() => setRemoveModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-xl text-xs font-medium border border-slate-600 bg-slate-800/60 text-slate-200 hover:bg-slate-700/60 transition-colors"
                >
                  <Minus className="h-3.5 w-3.5" /> Remove Liquidity
                </button>
              )}
            </div>
          </div>

          {/* Select range ──────────────────────────────────────────── */}
          <div className={CARD}>
            <h3 className="text-xs font-semibold text-white mb-1.5">Select range</h3>
            <p className="text-xs text-slate-400 mb-2.5">
              Current price: {curPriceLabel} {sym1} per {sym0}
            </p>

            {!inRange && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs mb-2.5">
                <span className="shrink-0">⚠</span>
                <span>Your range does not include the active tick. Single-sided position.</span>
              </div>
            )}

            <div className="flex gap-2 mb-2.5">
              <button
                onClick={() => setRangeMode('full')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors ${rangeMode === 'full' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800/60 text-slate-400 border border-slate-600'}`}
              >
                Full range
              </button>
              <button
                onClick={() => setRangeMode('manual')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors ${rangeMode === 'manual' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800/60 text-slate-400 border border-slate-600'}`}
              >
                Manual
              </button>
            </div>

            {rangeMode === 'manual' && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">Min price · Tick</label>
                  <input
                    type="text" inputMode="numeric"
                    value={manualTickLower}
                    onChange={(e) => setManualTickLower(e.target.value)}
                    className="w-full bg-slate-900/60 border border-slate-600 rounded-xl px-3 py-2 text-white text-xs"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">Max price · Tick</label>
                  <input
                    type="text" inputMode="numeric"
                    value={manualTickUpper}
                    onChange={(e) => setManualTickUpper(e.target.value)}
                    className="w-full bg-slate-900/60 border border-slate-600 rounded-xl px-3 py-2 text-white text-xs"
                  />
                </div>
              </div>
            )}
            {rangeMode === 'manual' && (!rangeValid || !manualAligned) && (
              <p className="text-xs text-amber-400 mt-1.5">
                {!rangeValid ? 'Min < Max' : `Ticks must be multiples of ${sp}`}
              </p>
            )}
          </div>

        </div>

        {/* ── RIGHT column: Visualize range · Statistics ── */}
        <div className="space-y-3 lg:overflow-y-auto lg:min-h-0 lg:pr-1 pb-2">

          {/* Visualize range ───────────────────────────────────────── */}
          <div className={CARD}>
            <RangeChart
              tickLower={pos.tickLower}
              tickUpper={pos.tickUpper}
              currentTick={currentTick}
              symbol0={sym0}
              symbol1={sym1}
              inRange={inRange}
              label="Visualize range"
              minPriceLabel={priceLowLabel}
              maxPriceLabel={priceHighLabel}
              currentPriceLabel={curPriceLabel}
            />
          </div>

          {/* Statistics ─────────────────────────────────────────────── */}
          <div className={CARD}>
            <h3 className="text-xs font-semibold text-white mb-2">Statistics</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">TVL</span>
                <span className="text-slate-200">—</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">24h Volume</span>
                <span className="text-slate-200">—</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{sym0}</span>
                <span className="text-slate-200 font-medium">{formatCurrencyAmount(posAmount0Exact, sym0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{sym1}</span>
                <span className="text-slate-200 font-medium">{formatCurrencyAmount(posAmount1Exact, sym1)}</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-700/50">
                <span className="text-slate-400">Fees ({sym0})</span>
                <span className="text-slate-200">{formatCurrencyAmount(formatUnits(pos.tokensOwed0, decimals0), sym0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fees ({sym1})</span>
                <span className="text-slate-200">{formatCurrencyAmount(formatUnits(pos.tokensOwed1, decimals1), sym1)}</span>
              </div>
              <div className="pt-1">
                <a
                  href={`${ARCDEX.explorer}/address/${addrs?.v3PositionManager ?? '0xC61608f54EEFf2b229e3a4858236e47f2701a80f'}?a=${tid.toString()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  View on ArcScan <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </div>

      </div>

      <AddV3LiquidityModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        pool={pool}
        tickLower={pos.tickLower}
        tickUpper={pos.tickUpper}
        decimals0={decimals0}
        decimals1={decimals1}
        sym0={sym0}
        sym1={sym1}
        balance0={balance0}
        balance1={balance1}
        positionPriceBelowRange={positionPriceBelowRange}
        positionPriceAboveRange={positionPriceAboveRange}
        busy={busy}
        onConfirm={addLiquidity}
      />

      <RemoveV3LiquidityModal
        isOpen={removeModalOpen}
        onClose={() => setRemoveModalOpen(false)}
        pool={pool}
        tickLower={pos.tickLower}
        tickUpper={pos.tickUpper}
        liquidity={pos.liquidity}
        sym0={sym0}
        sym1={sym1}
        busy={busy}
        onConfirm={removeLiquidity}
      />
    </div>
  )
}
