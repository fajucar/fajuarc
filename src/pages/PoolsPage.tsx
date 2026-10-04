/*
  Pools Page — Market Overview (DEX architecture)
  - Shows ONLY available liquidity pairs (from Pair contract)
  - NO user LP balance, NO participation %, NO Remove Liquidity
  - Data: useAllPools() — reads reserves directly, no user position data
*/

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { V3PositionsPage } from '@/modules/v3/V3PositionsPage'
import { V3_ENABLED } from '@/modules/v3/config'
import { Helmet } from 'react-helmet-async'
import { RefreshCw, Plus, X } from 'lucide-react'
import { useChainId, usePublicClient, useWaitForTransactionReceipt } from 'wagmi'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { useArcWallet } from '@/hooks/useArcWallet'
import { parseUnits, formatUnits } from 'viem'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { PoolCardSkeleton } from '@/components/ui/Skeleton'
import { SegmentedTabs } from '@/components/SegmentedTabs'
import { useAllPools } from '@/hooks/usePools'
import { ensureAllowance } from '@/lib/allowance'
import { applySlippage } from '@/lib/dex/swapUtils'
import { getPairAddress, readPairState } from '@/lib/arcDexRead'
import { ARCDEX } from '@/config/arcDex'
import { ARC_MAINNET_TOKENS } from '@/config/tokens.arc-mainnet'
import { TokenSelectButton } from '@/components/TokenSelect'
import { toast } from 'react-hot-toast'
import { formatMoney } from '@/lib/format'
import { WalletBalancesCard } from '@/components/WalletBalancesCard'
import { TVLHeader } from '@/components/TVLHeader'
import { ProfessionalPoolCard } from '@/components/ProfessionalPoolCard'
import AddLiquidityModal from '@/components/AddLiquidityModal'
import { ManageLiquidityModal } from '@/components/Pools/ManageLiquidityModal'
import type { PoolMarketInfo } from '@/hooks/usePools'
import type { ArcMainnetToken } from '@/config/tokens.arc-mainnet'

const FACTORY_ABI = [
  { name: 'createPair', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tokenA', type: 'address' }, { name: 'tokenB', type: 'address' }], outputs: [{ name: 'pair', type: 'address' }] },
] as const

const ROUTER_ADD_LIQUIDITY_ABI = [
  {
    name: 'addLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'amountADesired', type: 'uint256' },
      { name: 'amountBDesired', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
    ],
  },
] as const

const ERC20_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
}

function poolFallbackRatio(pool: PoolMarketInfo): number {
  const r0 = parseFloat(pool.reserve0Formatted)
  const r1 = parseFloat(pool.reserve1Formatted)
  return r0 > 0 && r1 > 0 ? r1 / r0 : 1
}

export function PoolsPage() {
  const { t } = useTranslation()
  const chainId = useChainId()
  const { address, isConnected } = useArcWallet()
  // Pinned to Arc: balances, allowances and receipts must not follow a wallet on another network.
  const publicClient = usePublicClient({ chainId: ARCDEX.chainId })
  const { writeContractAsync: _arcWrite, isPending } = useArcWriteContract()
  const [writeHash, setWriteHash] = useState<`0x${string}` | undefined>()
  const writeContractAsync = async (params: any) => { const h = await _arcWrite(params); setWriteHash(h); return h }
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: writeHash, query: { enabled: !!writeHash } })
  const isWrongChain = chainId != null && chainId !== ARCDEX.chainId
  const { pools, loading, error, refetch } = useAllPools(isWrongChain)

  // Withdraw/manage modal — opens for any pool; the modal handles "no LP in this wallet".
  const [managePool, setManagePool] = useState<PoolMarketInfo | null>(null)
  const openWithdraw = (pool: PoolMarketInfo) => {
    if (!address) { toast.error(t('pools.connectWallet')); return }
    setManagePool(pool)
  }

  // Existing-pool add liquidity
  const [addModalPool, setAddModalPool] = useState<PoolMarketInfo | null>(null)

  // Generic add — step 1: token selection
  const [genericAddOpen, setGenericAddOpen] = useState(false)
  const [genericTokenA, setGenericTokenA] = useState<ArcMainnetToken | null>(null)
  const [genericTokenB, setGenericTokenB] = useState<ArcMainnetToken | null>(null)
  const [balanceA, setBalanceA] = useState<string | null>(null)
  const [balanceB, setBalanceB] = useState<string | null>(null)
  const [pairReserves, setPairReserves] = useState<{ r0: number; r1: number; token0Addr: string } | null>(null)
  const [pairStatus, setPairStatus] = useState<'idle' | 'loading' | 'new' | 'existing'>('idle')

  // Generic add — step 2: amount entry (AddLiquidityModal)
  const [addLiquidityOpen, setAddLiquidityOpen] = useState(false)
  const [genericFallbackRatio, setGenericFallbackRatio] = useState(1)

  const [addingLiquidity, setAddingLiquidity] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  // ?tab=v3 is ignored where no V3 DEX is deployed (Arc Mainnet).
  const tabFromUrl = (V3_ENABLED && searchParams.get('tab') === 'v3' ? 'v3' : 'v2') as 'v2' | 'v3'
  const [tab, setTab] = useState<'v2' | 'v3'>(tabFromUrl)
  useEffect(() => { setTab(tabFromUrl) }, [tabFromUrl])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAddLiquidity = async (pool: PoolMarketInfo, amountA: string, amountB: string) => {
    if (!address || !publicClient) { toast.error(t('pools.connectWallet')); return }
    setAddingLiquidity(true)
    const token0Addr = pool.token0.address
    const token1Addr = pool.token1.address
    const amount0Wei = parseUnits(amountA, pool.token0.decimals)
    const amount1Wei = parseUnits(amountB, pool.token1.decimals)
    const writeOpts = (opts: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: unknown[] }) =>
      writeContractAsync({ address: opts.address, abi: opts.abi, functionName: opts.functionName, args: opts.args })
    try {
      const [b0, b1] = await Promise.all([
        publicClient.readContract({ address: token0Addr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
        publicClient.readContract({ address: token1Addr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
      ])
      if (b0 < amount0Wei) throw new Error(t('pools.insufficientBalance', { symbol: pool.token0.symbol }))
      if (b1 < amount1Wei) throw new Error(t('pools.insufficientBalance', { symbol: pool.token1.symbol }))
      toast.loading(t('pools.approving', { symbol: pool.token0.symbol }), { id: 'a0' })
      await ensureAllowance(publicClient, writeOpts, token0Addr, address, ARCDEX.router, amount0Wei)
      toast.dismiss('a0')
      toast.loading(t('pools.approving', { symbol: pool.token1.symbol }), { id: 'a1' })
      await ensureAllowance(publicClient, writeOpts, token1Addr, address, ARCDEX.router, amount1Wei)
      toast.dismiss('a1')
      toast.loading(t('pools.addingLiquidity'), { id: 'add' })
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60)
      // Minimums = the quoted amounts (the modal derives the second amount from the pool
      // ratio) minus the swap slippage tolerance, so a sandwich that skews the ratio right
      // before this tx makes it revert instead of depositing at a manipulated price.
      const txHash = await writeContractAsync({
        address: ARCDEX.router,
        abi: ROUTER_ADD_LIQUIDITY_ABI,
        functionName: 'addLiquidity',
        args: [token0Addr, token1Addr, amount0Wei, amount1Wei, applySlippage(amount0Wei), applySlippage(amount1Wei), address, deadline],
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      toast.dismiss('add')
      toast.success(t('pools.liquidityAdded'))
      setAddModalPool(null)
    } catch (err: unknown) {
      toast.dismiss()
      toast.error(err instanceof Error ? err.message : t('pools.addLiquidityFailed'))
    } finally {
      setAddingLiquidity(false)
    }
  }

  const handleGenericAddLiquidity = async (amountA: string, amountB: string) => {
    if (!address || !publicClient || !genericTokenA || !genericTokenB) {
      toast.error(t('pools.selectTokensAndConnect')); return
    }
    if (genericTokenA.address.toLowerCase() === genericTokenB.address.toLowerCase()) {
      toast.error(t('pools.selectDifferentTokens')); return
    }
    setAddingLiquidity(true)
    // Sort by address to get token0/token1 (Uniswap V2 ordering)
    const [addrA, addrB] = [genericTokenA.address, genericTokenB.address].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    )
    const token0Addr = addrA as `0x${string}`
    const token1Addr = addrB as `0x${string}`
    const isA_token0 = genericTokenA.address.toLowerCase() === token0Addr.toLowerCase()
    const token0 = isA_token0 ? genericTokenA : genericTokenB
    const token1 = isA_token0 ? genericTokenB : genericTokenA
    // amountA is for genericTokenA, amountB is for genericTokenB — map correctly to token0/token1
    const amount0Wei = parseUnits(isA_token0 ? amountA : amountB, token0.decimals)
    const amount1Wei = parseUnits(isA_token0 ? amountB : amountA, token1.decimals)
    const writeOpts = (opts: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: unknown[] }) =>
      writeContractAsync({ address: opts.address, abi: opts.abi, functionName: opts.functionName, args: opts.args })
    try {
      let pairAddr = await getPairAddress(token0Addr, token1Addr, publicClient)
      const pairWillBeCreated = !pairAddr || pairAddr === '0x0000000000000000000000000000000000000000'
      if (pairWillBeCreated) {
        toast.loading(t('pools.creatingPair'), { id: 'create' })
        await writeContractAsync({ address: ARCDEX.factory, abi: FACTORY_ABI, functionName: 'createPair', args: [token0Addr, token1Addr] })
        toast.dismiss('create')
        pairAddr = await getPairAddress(token0Addr, token1Addr, publicClient)
        if (!pairAddr) throw new Error(t('pools.createPairFailed'))
        toast.success(t('pools.pairCreated'))
      }
      const [b0, b1] = await Promise.all([
        publicClient.readContract({ address: token0Addr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
        publicClient.readContract({ address: token1Addr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
      ])
      if (b0 < amount0Wei) throw new Error(t('pools.insufficientBalance', { symbol: token0.symbol }))
      if (b1 < amount1Wei) throw new Error(t('pools.insufficientBalance', { symbol: token1.symbol }))
      toast.loading(t('pools.approving', { symbol: token0.symbol }), { id: 'a0' })
      await ensureAllowance(publicClient, writeOpts, token0Addr, address, ARCDEX.router, amount0Wei)
      toast.dismiss('a0')
      toast.loading(t('pools.approving', { symbol: token1.symbol }), { id: 'a1' })
      await ensureAllowance(publicClient, writeOpts, token1Addr, address, ARCDEX.router, amount1Wei)
      toast.dismiss('a1')
      if (!pairAddr) throw new Error(t('pools.pairAddressNotFound'))
      toast.loading(t('pools.addingLiquidity'), { id: 'add' })
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60)
      await writeContractAsync({
        address: ARCDEX.router,
        abi: ROUTER_ADD_LIQUIDITY_ABI,
        functionName: 'addLiquidity',
        // Same slippage-based minimums as handleAddLiquidity (sandwich protection).
        args: [token0Addr, token1Addr, amount0Wei, amount1Wei, applySlippage(amount0Wei), applySlippage(amount1Wei), address, deadline],
      })
      toast.dismiss('add')
      toast.success(t('pools.liquidityAdded'))
      setAddLiquidityOpen(false)
      setGenericTokenA(null)
      setGenericTokenB(null)
      refetch()
    } catch (err: unknown) {
      toast.dismiss()
      toast.error(err instanceof Error ? err.message : t('pools.addLiquidityFailed'))
    } finally {
      setAddingLiquidity(false)
    }
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isSuccess) { refetch() }
  }, [isSuccess, refetch])

  // Detect whether the selected pair exists and load reserves
  useEffect(() => {
    if (!genericAddOpen || !publicClient || !genericTokenA || !genericTokenB || isWrongChain) {
      setPairReserves(null)
      setPairStatus('idle')
      return
    }
    setPairStatus('loading')
    const tokenA = genericTokenA
    const tokenB = genericTokenB
    const [a, b] = [tokenA.address, tokenB.address].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()))
    getPairAddress(a as `0x${string}`, b as `0x${string}`, publicClient).then(async (pairAddr) => {
      if (!pairAddr || pairAddr === '0x0000000000000000000000000000000000000000') {
        setPairReserves(null); setPairStatus('new'); return
      }
      try {
        const state = await readPairState(pairAddr, publicClient)
        const r0 = parseFloat(state.reserve0Formatted)
        const r1 = parseFloat(state.reserve1Formatted)
        if (r0 > 0 && r1 > 0) {
          setPairReserves({ r0, r1, token0Addr: state.token0.address.toLowerCase() })
          setPairStatus('existing')
        } else {
          setPairReserves(null); setPairStatus('new')
        }
      } catch {
        setPairReserves(null); setPairStatus('new')
      }
    })
  }, [genericAddOpen, publicClient, genericTokenA?.address, genericTokenB?.address, isWrongChain])

  // Load wallet balances for the token selection step
  useEffect(() => {
    if (!genericAddOpen || !address || !publicClient) { setBalanceA(null); setBalanceB(null); return }
    let cancelled = false
    const load = async () => {
      if (genericTokenA) {
        try {
          const b = (await publicClient.readContract({ address: genericTokenA.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })) as bigint
          if (!cancelled) setBalanceA(formatUnits(b, genericTokenA.decimals))
        } catch { if (!cancelled) setBalanceA(null) }
      } else { setBalanceA(null) }
      if (genericTokenB) {
        try {
          const b = (await publicClient.readContract({ address: genericTokenB.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })) as bigint
          if (!cancelled) setBalanceB(formatUnits(b, genericTokenB.decimals))
        } catch { if (!cancelled) setBalanceB(null) }
      } else { setBalanceB(null) }
    }
    load()
    return () => { cancelled = true }
  }, [genericAddOpen, address, publicClient, genericTokenA?.address, genericTokenA?.decimals, genericTokenB?.address, genericTokenB?.decimals])

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <>
      <Helmet>
        <title>Pools - FajuARC</title>
        <meta name="description" content="Explore liquidity pools on FajuARC" />
      </Helmet>

      <div className="py-8 px-4 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Pools</h1>

        {/* With V3 unavailable only "V2 Pools" would remain, so the selector is dropped. */}
        <div className={`flex flex-wrap items-center gap-3 mb-6 ${V3_ENABLED ? 'justify-between' : 'justify-end'}`}>
          {V3_ENABLED && (
            <SegmentedTabs
              tabs={[{ id: 'v2', label: 'V2 Pools' }, { id: 'v3', label: 'V3 Positions' }]}
              activeId={tab}
              onChange={(id) => {
                const nextTab = id as 'v2' | 'v3'
                setTab(nextTab)
                setSearchParams(nextTab === 'v2' ? {} : { tab: 'v3' })
              }}
            />
          )}
          <WalletBalancesCard />
        </div>

        {V3_ENABLED && tab === 'v3' && <V3PositionsPage />}

        {tab === 'v2' && isWrongChain && (
          <div className="mb-6 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">
            {t('pools.connectPrefix')} <strong>Arc Mainnet</strong> {t('pools.connectSuffix')}
          </div>
        )}

        {tab === 'v2' && !isWrongChain && (
          <div className="space-y-6">
            <TVLHeader pools={pools} loading={loading} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">{t('pools.liquidityPools')}</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setGenericTokenA(null); setGenericTokenB(null)
                    setPairReserves(null); setPairStatus('idle')
                    setGenericAddOpen(true)
                  }}
                  className="flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white transition-all shadow-lg shadow-amber-500/20"
                >
                  <Plus className="h-4 w-4" />
                  {t('pools.addLiquidity')}
                </button>
                <button
                  onClick={refetch}
                  disabled={loading}
                  className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  {t('pools.refresh')}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex items-start gap-2">
                <span className="text-sm text-red-200">{error}</span>
              </div>
            )}

            {loading && (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => <PoolCardSkeleton key={i} />)}
              </div>
            )}

            {!loading && pools.length === 0 && !error && (
              <div className="p-8 rounded-2xl border border-slate-700/50 bg-slate-800/20 text-center">
                <p className="text-slate-400">{t('pools.noPoolsAvailable')}</p>
                <p className="text-xs text-slate-500 mt-2">{t('pools.createFirstPool')}</p>
              </div>
            )}

            {!loading && pools.length > 0 && (
              <motion.div
                initial="hidden" animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
                className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              >
                {pools.map((pool) => (
                  <motion.div key={pool.pairAddress} variants={cardVariants}>
                    <ProfessionalPoolCard
                      pool={pool}
                      onAddLiquidity={() => setAddModalPool(pool)}
                      onWithdraw={() => openWithdraw(pool)}
                      explorerBase={ARCDEX.explorer}
                      explorerName={ARCDEX.explorerName}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        )}

        {/* ── Manage an existing LP position (remove / transfer) ─────────── */}
        {managePool && address && (
          <ManageLiquidityModal
            pool={managePool}
            account={address as `0x${string}`}
            onClose={() => setManagePool(null)}
            onSuccess={() => refetch()}
          />
        )}

        {/* ── Existing-pool Add Liquidity ──────────────────────────────── */}
        {addModalPool && (
          <AddLiquidityModal
            isOpen
            onClose={() => setAddModalPool(null)}
            account={address ?? undefined}
            tokenA={{ symbol: addModalPool.token0.symbol, address: addModalPool.token0.address, decimals: addModalPool.token0.decimals }}
            tokenB={{ symbol: addModalPool.token1.symbol, address: addModalPool.token1.address, decimals: addModalPool.token1.decimals }}
            fallbackRatio={poolFallbackRatio(addModalPool)}
            loading={addingLiquidity || isPending || isConfirming}
            onConfirm={(a, b) => handleAddLiquidity(addModalPool, a, b)}
          />
        )}

        {/* ── Generic Add: Step 1 — token selection ───────────────────── */}
        <AnimatePresence>
          {genericAddOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setGenericAddOpen(false)}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700/50 bg-slate-900 p-6 shadow-2xl"
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-semibold text-white">{t('pools.selectTokens')}</h3>
                  <button onClick={() => setGenericAddOpen(false)} className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
                    <X className="h-5 w-5 text-slate-400" />
                  </button>
                </div>

                {!isConnected ? (
                  <p className="text-slate-400 text-sm">{t('pools.connectToAddLiquidity')}</p>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs text-slate-400">Token A</label>
                        {genericTokenA && balanceA != null && (
                          <span className="text-xs text-cyan-400">{t('pools.balanceLabel', { value: formatMoney(balanceA, 4) })}</span>
                        )}
                      </div>
                      <TokenSelectButton
                        tokens={[...ARC_MAINNET_TOKENS]}
                        selected={genericTokenA}
                        onSelect={(token) => setGenericTokenA(token as ArcMainnetToken)}
                        excludedAddress={genericTokenB?.address}
                        showBalance
                        placeholder={t('pools.selectTokenA')}
                        className="w-full justify-between"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs text-slate-400">Token B</label>
                        {genericTokenB && balanceB != null && (
                          <span className="text-xs text-cyan-400">{t('pools.balanceLabel', { value: formatMoney(balanceB, 4) })}</span>
                        )}
                      </div>
                      <TokenSelectButton
                        tokens={[...ARC_MAINNET_TOKENS]}
                        selected={genericTokenB}
                        onSelect={(token) => setGenericTokenB(token as ArcMainnetToken)}
                        excludedAddress={genericTokenA?.address}
                        showBalance
                        placeholder={t('pools.selectTokenB')}
                        className="w-full justify-between"
                      />
                    </div>

                    {genericTokenA && genericTokenB && pairStatus !== 'idle' && (
                      <p className="text-xs px-1">
                        {pairStatus === 'loading' && <span className="text-slate-500">{t('pools.checkingPair')}</span>}
                        {pairStatus === 'new' && <span className="text-amber-400">{t('pools.newPair')}</span>}
                        {pairStatus === 'existing' && <span className="text-emerald-400">{t('pools.existingPair')}</span>}
                      </p>
                    )}

                    <button
                      disabled={!genericTokenA || !genericTokenB}
                      onClick={() => {
                        // Snapshot the fallback ratio before closing the selection modal
                        let ratio = 1
                        if (pairReserves && genericTokenA) {
                          const isA0 = genericTokenA.address.toLowerCase() === pairReserves.token0Addr
                          ratio = isA0 ? pairReserves.r1 / pairReserves.r0 : pairReserves.r0 / pairReserves.r1
                        }
                        setGenericFallbackRatio(ratio)
                        setGenericAddOpen(false)
                        setAddLiquidityOpen(true)
                      }}
                      className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {t('pools.continue')}
                    </button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Generic Add: Step 2 — amounts (AddLiquidityModal) ───────── */}
        {genericTokenA && genericTokenB && (
          <AddLiquidityModal
            isOpen={addLiquidityOpen}
            onClose={() => setAddLiquidityOpen(false)}
            account={address ?? undefined}
            tokenA={genericTokenA}
            tokenB={genericTokenB}
            fallbackRatio={genericFallbackRatio}
            loading={addingLiquidity || isPending || isConfirming}
            onConfirm={(a, b) => handleGenericAddLiquidity(a, b)}
          />
        )}
      </div>
    </>
  )
}
