/*
  My Pools Page — User Positions (DEX architecture)
  - Shows ONLY pools where user has LP balance > 0
  - Uses useUserPositions(address) — NO general pool list
  - LP balance, deposited amounts, participation %, Remove Liquidity, Manage
*/

import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { RefreshCw, AlertCircle, Trash2, Loader2, Wallet, X, ExternalLink, Plus, ChevronDown, Settings2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { PoolCardSkeleton } from '@/components/ui/Skeleton'
import { glassCard, innerCell, cellLabel, cellValue, TokenPairIcons } from '@/components/PositionCardShared'
import { SegmentedTabs } from '@/components/SegmentedTabs'
import { usePublicClient, useWaitForTransactionReceipt, useChainId } from 'wagmi'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { useArcWallet } from '@/hooks/useArcWallet'
import { parseUnits, formatUnits } from 'viem'
import { toast } from 'react-hot-toast'
import { useUserPositions } from '@/hooks/usePools'
import { ensureAllowance } from '@/lib/allowance'
import { applySlippage } from '@/lib/dex/swapUtils'
import { ARCDEX } from '@/config/arcDex'
import { formatMoney, formatPercent } from '@/lib/format'
import { getPairAddress, type UserPoolPosition } from '@/lib/arcDexRead'
import { FarmingPanel } from '@/components/Farming/FarmingPanel'
import { isFarmingEnabled, getPoolId } from '@/config/farming'
import { V3PositionsPage } from '@/modules/v3/V3PositionsPage'
import { V3_ENABLED } from '@/modules/v3/config'

const ERC20_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const

const ROUTER_REMOVE_LIQUIDITY_ABI = [
  {
    name: 'removeLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
    ],
  },
] as const

const LIQUIDITY_HELPER_ABI = [
  { name: 'addLiquidity', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'pair', type: 'address' }, { name: 'tokenA', type: 'address' }, { name: 'tokenB', type: 'address' }, { name: 'amountA', type: 'uint256' }, { name: 'amountB', type: 'uint256' }], outputs: [{ name: 'liquidity', type: 'uint256' }] },
] as const

function PositionCard({
  pool,
  onManage,
  explorerBase,
  explorerName,
}: {
  pool: UserPoolPosition
  onManage: () => void
  explorerBase: string
  explorerName: string
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const isActive = BigInt(pool.lpBalance) > 0n
  const sharePct = BigInt(pool.totalSupply) > 0n
    ? formatPercent((Number(pool.lpBalance) / Number(pool.totalSupply)) * 100, 2)
    : '-'
  const sym0 = pool.token0.symbol
  const sym1 = pool.token1.symbol

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, boxShadow: '0 4px 40px rgba(78,163,255,0.07)' }}
      whileHover={{ y: -3, boxShadow: '0 10px 50px rgba(78,163,255,0.18), 0 0 0 1px rgba(78,163,255,0.28)' }}
      transition={{ duration: 0.2 }}
      style={glassCard}
    >
      {/* Header: pair icons, badges, actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <TokenPairIcons sym0={sym0} sym1={sym1} />
          <div>
            <h3 style={{ color: '#f0f4ff', fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px', margin: '0 0 6px' }}>
              {sym0} / {sym1}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span style={{
                padding: '2px 9px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: 'rgba(78,163,255,0.1)',
                border: '1px solid rgba(78,163,255,0.32)',
                color: '#4ea3ff',
              }}>
                v2 · 0.30%
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                {isActive ? (
                  <>
                    <motion.span
                      animate={{ boxShadow: ['0 0 0 0 rgba(45,212,160,0)', '0 0 0 5px rgba(45,212,160,0.28)', '0 0 0 0 rgba(45,212,160,0)'] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      style={{ width: 8, height: 8, borderRadius: '50%', background: '#2dd4a0', display: 'inline-block', flexShrink: 0 }}
                    />
                    <span style={{ color: '#2dd4a0' }}>Active</span>
                  </>
                ) : (
                  <>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#475569', display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ color: '#475569' }}>Inactive</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={onManage}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700,
              background: 'linear-gradient(135deg, #f97316, #f59e0b)',
              color: '#fff', border: 'none', cursor: 'pointer',
              boxShadow: '0 0 16px rgba(249,115,22,0.35)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 4px 22px rgba(249,115,22,0.5)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 0 16px rgba(249,115,22,0.35)'
            }}
          >
            <Settings2 size={14} />
            Manage
          </button>

          <a
            href={`${explorerBase}/address/${pool.pairAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600,
              background: 'rgba(78,163,255,0.08)',
              border: '1px solid rgba(78,163,255,0.32)',
              color: '#4ea3ff',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(78,163,255,0.16)'
              e.currentTarget.style.boxShadow = '0 0 14px rgba(78,163,255,0.28)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(78,163,255,0.08)'
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <ExternalLink size={14} />
            View on explorer
          </a>
        </div>
      </div>

      {/* Data grid — pooled amounts + pool share */}
      <div style={{ borderTop: '1px solid rgba(78,163,255,0.1)', paddingTop: 16 }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div style={innerCell}>
            <div style={cellLabel}>Pooled {sym0}</div>
            <div style={cellValue}>{formatMoney(pool.token0AmountFormatted, 4)}</div>
          </div>
          <div style={innerCell}>
            <div style={cellLabel}>Pooled {sym1}</div>
            <div style={cellValue}>{formatMoney(pool.token1AmountFormatted, 4)}</div>
          </div>
          <div style={innerCell}>
            <div style={cellLabel}>Your pool share</div>
            <div style={cellValue}>{sharePct}</div>
          </div>
        </div>
      </div>

      {/* Footer: Details expandable */}
      <div style={{ borderTop: '1px solid rgba(78,163,255,0.07)', paddingTop: 12, marginTop: 14 }}>
        <button
          onClick={() => setDetailsOpen((o) => !o)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: '#475569', background: 'none', border: 'none',
            padding: 0, cursor: 'pointer', transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#93c5fd' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#475569' }}
        >
          Details
          <ChevronDown size={13} style={{ transform: detailsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
        {detailsOpen && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, fontFamily: 'ui-monospace,monospace', color: '#475569' }}>
            <div>
              Pair:{' '}
              <a href={`${explorerBase}/address/${pool.pairAddress}`} target="_blank" rel="noopener noreferrer" style={{ color: '#4ea3ff', textDecoration: 'none' }}>
                {pool.pairAddress}
              </a>
            </div>
            <div>LP balance: {formatMoney(pool.lpBalanceFormatted, 4)} LP <span style={{ color: '#334155' }}>(raw: {pool.lpBalance})</span></div>
            <div>Total LP supply: {formatMoney(pool.totalSupplyFormatted, 4)} LP <span style={{ color: '#334155' }}>(raw: {pool.totalSupply})</span></div>
            <div>
              Token0:{' '}
              <a href={`${explorerBase}/address/${pool.token0.address}`} target="_blank" rel="noopener noreferrer" style={{ color: '#4ea3ff', textDecoration: 'none' }}>{pool.token0.address}</a>
            </div>
            <div>
              Token1:{' '}
              <a href={`${explorerBase}/address/${pool.token1.address}`} target="_blank" rel="noopener noreferrer" style={{ color: '#4ea3ff', textDecoration: 'none' }}>{pool.token1.address}</a>
            </div>
            <a
              href={`${explorerBase}/address/${pool.pairAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#4ea3ff', textDecoration: 'none', paddingTop: 4 }}
            >
              View on {explorerName}
              <ExternalLink size={11} />
            </a>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export function MyPoolsPage() {
  const { t } = useTranslation()
  const { address, isConnected } = useArcWallet()
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId: ARCDEX.chainId }) // pinned to Arc, never the wallet's current network
  const { writeContractAsync: _arcWrite, isPending } = useArcWriteContract()
  const [writeHash, setWriteHash] = useState<`0x${string}` | undefined>()
  const writeContractAsync = async (params: any) => { const h = await _arcWrite(params); setWriteHash(h); return h }
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: writeHash, query: { enabled: !!writeHash } })
  const isWrongChain = chainId != null && chainId !== ARCDEX.chainId
  const { positions, loading, error, refetch } = useUserPositions(address, isConnected, isWrongChain)

  const [activeTab, setActiveTab] = useState<'v2' | 'v3'>('v2')
  const [managePool, setManagePool] = useState<typeof positions[0] | null>(null)
  const [manageAction, setManageAction] = useState<'add' | 'remove' | null>(null)
  const [removingLiquidity, setRemovingLiquidity] = useState<`0x${string}` | null>(null)
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')
  const [addingLiquidity, setAddingLiquidity] = useState(false)
  const [removePercent, setRemovePercent] = useState(100)

  // Wallet balances of the managed pair's tokens — shown next to the "Add liquidity" inputs
  const [walletBalance0, setWalletBalance0] = useState<string | null>(null)
  const [walletBalance1, setWalletBalance1] = useState<string | null>(null)
  const [loadingWalletBalances, setLoadingWalletBalances] = useState(false)

  useEffect(() => {
    if (isSuccess) {
      toast.success('Transaction confirmed')
      refetch()
    }
  }, [isSuccess, refetch])

  useEffect(() => {
    if (!managePool || !address || !publicClient) {
      setWalletBalance0(null)
      setWalletBalance1(null)
      return
    }
    let cancelled = false
    setLoadingWalletBalances(true)
    Promise.all([
      publicClient.readContract({ address: managePool.token0.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
      publicClient.readContract({ address: managePool.token1.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
    ])
      .then(([b0, b1]) => {
        if (cancelled) return
        setWalletBalance0(formatUnits(b0, managePool.token0.decimals))
        setWalletBalance1(formatUnits(b1, managePool.token1.decimals))
      })
      .catch(() => {
        if (cancelled) return
        setWalletBalance0(null)
        setWalletBalance1(null)
      })
      .finally(() => { if (!cancelled) setLoadingWalletBalances(false) })
    return () => { cancelled = true }
  }, [managePool, address, publicClient])

  const handleAddLiquidity = async (pool: typeof positions[0]) => {
    if (!address || !publicClient) {
      toast.error('Connect your wallet')
      return
    }
    if (ARCDEX.liquidityHelper === '0x0000000000000000000000000000000000000000') {
      toast.error('Adding to an existing position isn\'t available on Arc Mainnet yet. Use the Pools page to add liquidity instead.')
      return
    }
    if (!amount0 || !amount1 || parseFloat(amount0) <= 0 || parseFloat(amount1) <= 0) {
      toast.error('Enter valid amounts for both tokens')
      return
    }
    setAddingLiquidity(true)
    const token0Addr = pool.token0.address
    const token1Addr = pool.token1.address
    const amount0Wei = parseUnits(amount0, pool.token0.decimals)
    const amount1Wei = parseUnits(amount1, pool.token1.decimals)
    const writeOpts = (opts: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: unknown[] }) =>
      writeContractAsync({ address: opts.address, abi: opts.abi, functionName: opts.functionName, args: opts.args })
    try {
      const [b0, b1] = await Promise.all([
        publicClient.readContract({ address: token0Addr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
        publicClient.readContract({ address: token1Addr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
      ])
      if (b0 < amount0Wei) throw new Error(`Insufficient balance of ${pool.token0.symbol}`)
      if (b1 < amount1Wei) throw new Error(`Insufficient balance of ${pool.token1.symbol}`)
      toast.loading(`Approving ${pool.token0.symbol}...`, { id: 'a0' })
      await ensureAllowance(publicClient, writeOpts, token0Addr, address, ARCDEX.liquidityHelper, amount0Wei)
      toast.dismiss('a0')
      toast.loading(`Approving ${pool.token1.symbol}...`, { id: 'a1' })
      await ensureAllowance(publicClient, writeOpts, token1Addr, address, ARCDEX.liquidityHelper, amount1Wei)
      toast.dismiss('a1')
      toast.loading('Adding liquidity...', { id: 'add' })
      const txHash = await writeContractAsync({
        address: ARCDEX.liquidityHelper,
        abi: LIQUIDITY_HELPER_ABI,
        functionName: 'addLiquidity',
        args: [pool.pairAddress, token0Addr, token1Addr, amount0Wei, amount1Wei],
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      toast.dismiss('add')
      toast.success('Liquidity added')
      setAmount0('')
      setAmount1('')
      setManagePool(null)
      setManageAction(null)
    } catch (err: unknown) {
      toast.dismiss()
      toast.error(err instanceof Error ? err.message : 'Failed to add liquidity')
    } finally {
      setAddingLiquidity(false)
    }
  }

  const handleRemoveLiquidity = async (pool: typeof positions[0], percent: number) => {
    setManageAction(null)
    if (!address || !publicClient) {
      toast.error('Connect your wallet')
      return
    }
    setRemovingLiquidity(pool.pairAddress)
    try {
      // Confirm the pair address via factory.getPair(tokenA, tokenB) before approving/operating on it —
      // a stale or mismatched pair address is what causes the LP token's allowance()/approve() to revert.
      const tokenA = pool.token0.address
      const tokenB = pool.token1.address
      const factoryPair = await getPairAddress(tokenA, tokenB, publicClient)
      if (!factoryPair || factoryPair.toLowerCase() !== pool.pairAddress.toLowerCase()) {
        throw new Error(`Pair address mismatch: factory.getPair returned ${factoryPair ?? 'zero address'}, expected ${pool.pairAddress}`)
      }

      // 1) Read the user's current LP balance directly from the pair contract
      const lpBalance = (await publicClient.readContract({
        address: pool.pairAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      })) as bigint
      if (lpBalance === 0n) throw new Error('No LP balance to remove')

      // The user picks 1-100% of their position — compute the exact liquidity to remove in
      // BigInt (no float precision loss). This SAME value is used for the approve and removeLiquidity.
      const pct = BigInt(Math.min(100, Math.max(1, Math.round(percent))))
      const liquidity = (lpBalance * pct) / 100n
      if (liquidity === 0n) throw new Error('Removal amount too small')

      // Expected payout of Pair.burn: liquidity × pair balance ÷ LP totalSupply, per token.
      // Minus the slippage tolerance, these become amountAMin/amountBMin — a sandwich that
      // skews the reserves right before this tx then makes it revert instead of paying less.
      const [pairBalA, pairBalB, lpSupply] = await Promise.all([
        publicClient.readContract({ address: tokenA, abi: ERC20_ABI, functionName: 'balanceOf', args: [pool.pairAddress] }) as Promise<bigint>,
        publicClient.readContract({ address: tokenB, abi: ERC20_ABI, functionName: 'balanceOf', args: [pool.pairAddress] }) as Promise<bigint>,
        publicClient.readContract({ address: pool.pairAddress, abi: ERC20_ABI, functionName: 'totalSupply' }) as Promise<bigint>,
      ])
      if (lpSupply === 0n) throw new Error('Pool has no liquidity')
      const amountAMin = applySlippage((liquidity * pairBalA) / lpSupply)
      const amountBMin = applySlippage((liquidity * pairBalB) / lpSupply)

      // 2) Approve the LP token for the Router with the EXACT liquidity amount (not maxUint256).
      // Router.removeLiquidity pulls LP via transferFrom on the pair contract — the allowance must
      // cover exactly `liquidity`, and the approve must be confirmed on-chain before we proceed.
      toast.loading('Approving LP tokens...', { id: 'ap' })
      const approveHash = await writeContractAsync({
        address: pool.pairAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ARCDEX.router, liquidity],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      toast.dismiss('ap')

      // DIAG: confirm the allowance was actually persisted by the pair contract before calling removeLiquidity
      const allowanceCheck = await publicClient.readContract({
        address: pool.pairAddress,
        abi: [{ name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
        functionName: 'allowance',
        args: [address, ARCDEX.router],
      })
      console.log('[DIAG] allowance pós-approve:', allowanceCheck, 'lpBalance:', lpBalance, 'liquidity:', liquidity)

      // 3) Call Router.removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline)
      toast.loading('Removing liquidity...', { id: 'rm' })
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60)
      const rmHash = await writeContractAsync({
        address: ARCDEX.router,
        abi: ROUTER_REMOVE_LIQUIDITY_ABI,
        functionName: 'removeLiquidity',
        args: [tokenA, tokenB, liquidity, amountAMin, amountBMin, address, deadline],
      })
      await publicClient.waitForTransactionReceipt({ hash: rmHash })
      toast.dismiss('rm')
      toast.success('Liquidity removed')
      setManagePool(null)
      refetch()
    } catch (err: unknown) {
      toast.dismiss()
      toast.error(err instanceof Error ? err.message : 'Error removing liquidity')
    } finally {
      setRemovingLiquidity(null)
    }
  }

  if (!isConnected) {
    return (
      <>
        <Helmet><title>My positions - FajuARC</title></Helmet>
        <div className="py-12 px-4 max-w-3xl mx-auto text-center">
          <Wallet className="h-12 w-12 text-slate-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white mb-2">Connect your wallet</h1>
          <p className="text-slate-400">Connect to view and manage your liquidity positions.</p>
        </div>
      </>
    )
  }

  return (
    <>
      <Helmet>
        <title>My positions - FajuARC</title>
        <meta name="description" content="Your liquidity positions on FajuARC" />
      </Helmet>

      <div className="py-8 px-4 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-4">My positions</h1>
        {/* No V3 DEX on this network (Arc Mainnet): show V2 directly, without a one-tab selector. */}
        {V3_ENABLED && (
          <SegmentedTabs
            tabs={[
              { id: 'v2', label: 'V2 Positions' },
              { id: 'v3', label: 'V3 Positions' },
            ]}
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as 'v2' | 'v3')}
            className="mb-6"
          />
        )}

        {isWrongChain && (
          <div className="mb-6 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">
            Connect to <strong>Arc Mainnet</strong> to manage your positions.
          </div>
        )}

        {!isWrongChain && V3_ENABLED && activeTab === 'v3' && <V3PositionsPage />}

        {!isWrongChain && activeTab === 'v2' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Your LP positions</h2>
              <button
                onClick={refetch}
                disabled={loading}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {error && (
              <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <span className="text-sm text-red-200">{error}</span>
              </div>
            )}

            {loading && (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <PoolCardSkeleton key={i} />
                ))}
              </div>
            )}

            {!loading && positions.length === 0 && (
              <div className="p-8 rounded-2xl border border-slate-700/50 bg-slate-800/20 text-center">
                <p className="text-slate-400 mb-4">You have no positions yet. Add liquidity in Pools.</p>
                <a href="/pools" className="text-cyan-400 hover:text-cyan-300 text-sm font-medium">
                  Pools →
                </a>
              </div>
            )}

            {!loading && positions.length > 0 && (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.05 } },
                }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {positions.map((pool) => (
                  <PositionCard
                    key={pool.pairAddress}
                    pool={pool}
                    onManage={() => { setManagePool(pool); setManageAction(null); setAmount0(''); setAmount1(''); setRemovePercent(100) }}
                    explorerBase={ARCDEX.explorer}
                    explorerName={ARCDEX.explorerName}
                  />
                ))}
              </motion.div>
            )}
          </div>
        )}

        {/* Manage modal (Add / Remove) */}
        <AnimatePresence>
          {managePool && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setManagePool(null)}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700/50 bg-slate-900/95 backdrop-blur-xl p-6 shadow-2xl"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Manage {managePool.token0.symbol} / {managePool.token1.symbol}</h3>
                  <button onClick={() => setManagePool(null)} className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
                    <X className="h-5 w-5 text-slate-400" />
                  </button>
                </div>
                {!manageAction ? (
                  <div className="space-y-3">
                    {managePool && isFarmingEnabled && getPoolId(managePool.pairAddress) !== null && (
                      <FarmingPanel
                        pairAddress={managePool.pairAddress}
                        token0Symbol={managePool.token0.symbol}
                        token1Symbol={managePool.token1.symbol}
                        lpDecimals={18}
                        onSuccess={refetch}
                      />
                    )}
                    <button
                      onClick={() => setManageAction('add')}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-600 bg-slate-800/60 text-white font-medium hover:bg-slate-700/60 transition-colors"
                    >
                      <Plus className="h-5 w-5" />
                      Add liquidity
                    </button>
                    <button
                      onClick={() => setManageAction('remove')}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 font-medium hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 className="h-5 w-5" />
                      Remove liquidity
                    </button>
                  </div>
                ) : manageAction === 'add' ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-slate-400">{managePool.token0.symbol}</label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">
                            {loadingWalletBalances
                              ? 'Balance: ...'
                              : walletBalance0 != null
                              ? `Balance: ${formatMoney(walletBalance0, 4)}`
                              : ''}
                          </span>
                          {walletBalance0 != null && parseFloat(walletBalance0) > 0 && (
                            <button
                              type="button"
                              onClick={() => setAmount0(walletBalance0)}
                              className="px-1.5 py-0.5 rounded-md text-[11px] font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/35 hover:bg-cyan-500/25 transition-colors"
                            >
                              Max
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="number"
                        value={amount0}
                        onChange={(e) => setAmount0(e.target.value)}
                        placeholder="0.0"
                        className="w-full bg-slate-800/60 border border-slate-600 rounded-xl px-4 py-3 text-base sm:text-sm text-white focus:outline-none focus:border-cyan-500/50 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-slate-400">{managePool.token1.symbol}</label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">
                            {loadingWalletBalances
                              ? 'Balance: ...'
                              : walletBalance1 != null
                              ? `Balance: ${formatMoney(walletBalance1, 4)}`
                              : ''}
                          </span>
                          {walletBalance1 != null && parseFloat(walletBalance1) > 0 && (
                            <button
                              type="button"
                              onClick={() => setAmount1(walletBalance1)}
                              className="px-1.5 py-0.5 rounded-md text-[11px] font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/35 hover:bg-cyan-500/25 transition-colors"
                            >
                              Max
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="number"
                        value={amount1}
                        onChange={(e) => setAmount1(e.target.value)}
                        placeholder="0.0"
                        className="w-full bg-slate-800/60 border border-slate-600 rounded-xl px-4 py-3 text-base sm:text-sm text-white focus:outline-none focus:border-cyan-500/50 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setManageAction(null)} className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 font-medium hover:bg-slate-800 transition-colors">{t('myPools.back')}</button>
                      <button
                        onClick={() => managePool && handleAddLiquidity(managePool)}
                        disabled={addingLiquidity || isPending || isConfirming || !amount0 || !amount1}
                        className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {addingLiquidity || isPending || isConfirming ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Add'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-slate-400">Amount to remove</label>
                        <span className="text-sm font-semibold text-white">{removePercent}%</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={100}
                        step={1}
                        value={removePercent}
                        onChange={(e) => setRemovePercent(Number(e.target.value))}
                        className="w-full accent-red-500"
                      />
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>1%</span>
                        <span>100%</span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 space-y-1.5">
                      <p className="text-xs text-slate-400">You will receive</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">{managePool.token0.symbol}</span>
                        <span className="text-white font-medium">
                          {formatMoney((parseFloat(managePool.token0AmountFormatted) || 0) * (removePercent / 100), 4)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">{managePool.token1.symbol}</span>
                        <span className="text-white font-medium">
                          {formatMoney((parseFloat(managePool.token1AmountFormatted) || 0) * (removePercent / 100), 4)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setManageAction(null)} className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 font-medium hover:bg-slate-800 transition-colors">{t('myPools.back')}</button>
                      <button
                        onClick={() => managePool && handleRemoveLiquidity(managePool, removePercent)}
                        disabled={removingLiquidity === managePool.pairAddress || isPending || isConfirming}
                        className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {removingLiquidity === managePool.pairAddress || isPending || isConfirming ? <Loader2 className="h-5 w-5 animate-spin" /> : `Remove ${removePercent}%`}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
