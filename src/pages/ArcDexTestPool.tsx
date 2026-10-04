/*
  ArcDEX Pool - Visualizar e adicionar liquidez
  - Mostra informações do Pair (token0, token1, reserves, totalSupply)
  - Permite adicionar liquidez ao pair existente
*/

import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { RefreshCw, AlertCircle, Plus, Loader2, ExternalLink } from 'lucide-react'
import { ARCDEX } from '@/config/arcDex'
import { readPairState, type PairState } from '@/lib/arcDexRead'
import { ensureAllowance } from '@/lib/allowance'
import { usePublicClient, useWaitForTransactionReceipt, useChainId } from 'wagmi'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { useArcWallet } from '@/hooks/useArcWallet'
import { parseUnits, formatUnits } from 'viem'
import { toast } from 'react-hot-toast'
import { formatMoney } from '@/lib/format'

// LiquidityHelper oficial: addLiquidity(pair, tokenA, tokenB, amountA, amountB)
const LIQUIDITY_HELPER_ABI = [
  {
    name: 'addLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pair', type: 'address' },
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
    ],
    outputs: [{ name: 'liquidity', type: 'uint256' }],
  },
] as const

// ABI mínimo para ERC20 (transfer, approve, balanceOf)
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// REMOVIDO: getTokenSymbol hardcoded - agora usamos metadata do contrato

export function ArcDexTestPool() {
  const { address, isConnected } = useArcWallet()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const isWrongChain = chainId != null && chainId !== ARCDEX.chainId
  const { writeContractAsync: _arcWrite } = useArcWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const writeContract = async (params: any) => { const h = await _arcWrite(params); setTxHash(h); return h }
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash, query: { enabled: !!txHash } })

  const [state, setState] = useState<PairState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Estados para adicionar liquidez
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')
  const [addingLiquidity, setAddingLiquidity] = useState(false)
  const [balances, setBalances] = useState<{ token0: bigint; token1: bigint } | null>(null)

  const loadPairState = async () => {
    setLoading(true)
    setError(null)
    try {
      if (!publicClient) {
        throw new Error('Public client not available')
      }
      // Par oficial USDC/EURC na Arc Mainnet
      const pairState = await readPairState(ARCDEX.pair, publicClient)
      setState(pairState)
      
      // Carregar balances se conectado
      if (isConnected && address && publicClient && pairState) {
        try {
          const [bal0, bal1] = await Promise.all([
            publicClient.readContract({
              address: pairState.token0.address,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [address],
            }) as Promise<bigint>,
            publicClient.readContract({
              address: pairState.token1.address,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [address],
            }) as Promise<bigint>,
          ])
          setBalances({ token0: bal0, token1: bal1 })
        } catch (err) {
          console.error('Error loading balances:', err)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load pair state')
      setState(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isWrongChain) return
    loadPairState()
  }, [isConnected, address, isWrongChain])

  const handleAddLiquidity = async () => {
    if (!state || !address || !publicClient || !isConnected) {
      toast.error('Connect your wallet first')
      return
    }
    if (ARCDEX.liquidityHelper === '0x0000000000000000000000000000000000000000') {
      toast.error('LiquidityHelper isn\'t deployed on Arc Mainnet yet.')
      return
    }

    if (!amount0 || !amount1 || parseFloat(amount0) <= 0 || parseFloat(amount1) <= 0) {
      toast.error('Enter valid amounts for both tokens')
      return
    }

    setAddingLiquidity(true)
    const pairAddress = state.pairAddress
    const token0Addr = state.token0.address
    const token1Addr = state.token1.address
    const decimals0 = state.token0.decimals
    const decimals1 = state.token1.decimals
    const amount0Wei = parseUnits(amount0, decimals0)
    const amount1Wei = parseUnits(amount1, decimals1)

    const writeOpts = (opts: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: unknown[] }) =>
      writeContract({ address: opts.address, abi: opts.abi, functionName: opts.functionName, args: opts.args })

    try {
      const [balance0, balance1] = await Promise.all([
        publicClient.readContract({
          address: token0Addr,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: token1Addr,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }) as Promise<bigint>,
      ])

      if (balance0 < amount0Wei) {
        throw new Error(`Insufficient ${state.token0.symbol} balance. Required: ${amount0}, Available: ${formatUnits(balance0, decimals0)}`)
      }
      if (balance1 < amount1Wei) {
        throw new Error(`Insufficient ${state.token1.symbol} balance. Required: ${amount1}, Available: ${formatUnits(balance1, decimals1)}`)
      }

      toast.loading(`Approving ${state.token0.symbol}...`, { id: 'approve0' })
      await ensureAllowance(publicClient, writeOpts, token0Addr, address, ARCDEX.liquidityHelper, amount0Wei)
      toast.dismiss('approve0')
      toast.loading(`Approving ${state.token1.symbol}...`, { id: 'approve1' })
      await ensureAllowance(publicClient, writeOpts, token1Addr, address, ARCDEX.liquidityHelper, amount1Wei)
      toast.dismiss('approve1')

      toast.loading('Adding liquidity...', { id: 'addLiq' })
      const hash = await writeContract({
        address: ARCDEX.liquidityHelper,
        abi: LIQUIDITY_HELPER_ABI,
        functionName: 'addLiquidity',
        args: [pairAddress, token0Addr, token1Addr, amount0Wei, amount1Wei],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      toast.dismiss('addLiq')
      const txUrl = `${ARCDEX.explorer}/tx/${hash}`
      toast.success(
        () => (
          <span>
            Liquidity added.{' '}
            <a href={txUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">
              View on {ARCDEX.explorerName}
            </a>
          </span>
        ),
        { duration: 8000 }
      )

      setAmount0('')
      setAmount1('')
      await loadPairState()
    } catch (err: any) {
      toast.dismiss()
      const reason = err?.shortMessage || err?.message || 'Error adding liquidity'
      toast.error(reason)
      console.error('Error adding liquidity:', err)
    } finally {
      setAddingLiquidity(false)
    }
  }

  return (
    <>
      <Helmet>
        <title>Pools - FajuARC</title>
        <meta name="description" content="View and manage liquidity pools on FajuARC" />
      </Helmet>

      <div className="py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-white">Pools</h1>
            <button
              onClick={loadPairState}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-cyan-500/40 bg-slate-800/60 text-cyan-300 hover:bg-slate-800/80 hover:border-cyan-500/50 hover:shadow-[0_0_12px_rgba(34,211,238,0.1)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {isWrongChain && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-sm">
              Connect to <strong>Arc Mainnet</strong> (Chain ID {ARCDEX.chainId}) to view and add liquidity.
            </div>
          )}

          {!isWrongChain && (
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 mb-6 shadow-[0_0_30px_rgba(34,211,238,0.04)] transition-all duration-300 hover:border-slate-600/60">
            {/* Pair Address + Pool ativa */}
            {state && (
              <div className="mb-6">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs text-slate-400">Official USDC/EURC pair</label>
                  {BigInt(state.reserve0) > 0n && BigInt(state.reserve1) > 0n && (
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">
                      Active Pool
                    </span>
                  )}
                </div>
                <div className="text-sm text-cyan-400 font-mono break-all mt-1">
                  {state.pairAddress}
                </div>
                <a
                  href={`${ARCDEX.explorer}/address/${state.pairAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-cyan-400 mt-1"
                >
                  View on {ARCDEX.explorerName}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {/* Token Addresses Info */}
            {state && (
              <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="text-xs text-slate-400 mb-2">Pair tokens (ERC20):</div>
                <div className="text-xs font-mono space-y-1">
                  <div>USDC: <span className="text-cyan-400">{ARCDEX.usdc}</span></div>
                  <div>EURC: <span className="text-cyan-400">{ARCDEX.eurc}</span></div>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex items-center gap-2 text-slate-400 mb-4">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Loading pair information...</span>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-red-400 mb-1">Error</div>
                    <div className="text-xs text-red-300">{error}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Pair State */}
            {state && !loading && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Token 0 (pair)</label>
                    <div className="text-sm text-white font-mono break-all">
                      <span className="text-cyan-400 font-semibold">{state.token0.symbol}</span>
                      {state.token0.name && (
                        <span className="text-slate-500 ml-2 text-xs">({state.token0.name})</span>
                      )}
                      <div className="text-xs text-slate-500 mt-1">{state.token0.address}</div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Token 1 (pair)</label>
                    <div className="text-sm text-white font-mono break-all">
                      <span className="text-cyan-400 font-semibold">{state.token1.symbol}</span>
                      {state.token1.name && (
                        <span className="text-slate-500 ml-2 text-xs">({state.token1.name})</span>
                      )}
                      <div className="text-xs text-slate-500 mt-1">{state.token1.address}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">
                      Reserve 0 ({state.token0.symbol})
                    </label>
                    <div className="text-lg text-cyan-400 font-mono">
                      {formatMoney(state.reserve0Formatted, 4)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Raw: {state.reserve0}</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">
                      Reserve 1 ({state.token1.symbol})
                    </label>
                    <div className="text-lg text-cyan-400 font-mono">
                      {formatMoney(state.reserve1Formatted, 4)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Raw: {state.reserve1}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Total Supply (LP)</label>
                    <div className="text-sm text-white font-mono">
                      {formatMoney(state.totalSupplyFormatted, 4)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Raw: {state.totalSupply}</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Last updated</label>
                    <div className="text-sm text-white">
                      {new Date(state.timestamp * 1000).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
          )}

          {/* Add Liquidity Section */}
          {isConnected && state && !isWrongChain && (
            <div className="bg-slate-900/60 backdrop-blur-xl border border-cyan-500/20 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add Liquidity
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">
                    Amount in {state.token0.symbol}
                    {balances && (
                      <span className="text-slate-500 ml-2">
                        (Balance: {formatMoney(formatUnits(balances.token0, state.token0.decimals), 4)})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={amount0}
                    onChange={(e) => setAmount0(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">
                    Amount in {state.token1.symbol}
                    {balances && (
                      <span className="text-slate-500 ml-2">
                        (Balance: {formatMoney(formatUnits(balances.token1, state.token1.decimals), 4)})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={amount1}
                    onChange={(e) => setAmount1(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  onClick={handleAddLiquidity}
                  disabled={addingLiquidity || isConfirming || !amount0 || !amount1}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {addingLiquidity || isConfirming ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-5 w-5" />
                      <span>Add Liquidity</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {!isConnected && !isWrongChain && (
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700 rounded-lg p-6 text-center text-slate-400">
              Connect your wallet to add liquidity
            </div>
          )}
        </div>
      </div>
    </>
  )
}
