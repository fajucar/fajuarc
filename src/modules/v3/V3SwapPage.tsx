/**
 * V3 Swap Page — Swap concentrado via SwapRouter (exactInputSingle)
 * Pool: USDC / EURC (fee 500)
 */

import { useState, useEffect, useCallback } from 'react'
import { usePublicClient, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { usePersistedPrivyWalletAddress } from '@/hooks/usePersistedPrivyWalletAddress'
import { parseUnits, formatUnits } from 'viem'
import { ArrowDownUp, Loader2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { getV3Addresses, getV3ConfigError } from '@/modules/v3/config'
import { TokenSelectButton } from '@/components/TokenSelect'
import { ensureAllowance } from '@/lib/allowance'
import { formatNumber, formatMoney } from '@/lib/format'
import { useChainId } from 'wagmi'
import { ARCDEX } from '@/config/arcDex'
import { ARC_TESTNET_TOKENS } from '@/constants/tokens'

import SwapRouterAbi from '@/abis/v3/SwapRouter.json'

const FEE_500 = 500
const SLIPPAGE_DEFAULT = 1
const ARC_TESTNET_CHAIN_ID = ARCDEX.chainId
const ARCX_ADDRESS = ARC_TESTNET_TOKENS.find((token) => token.symbol === 'ARCX')!.address

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

function safeParseUnits(value: string, decimals: number): bigint | null {
  try {
    const t = (value ?? '').trim()
    if (!t) return null
    const n = parseFloat(t)
    if (isNaN(n) || n < 0) return null
    return parseUnits(t, decimals)
  } catch {
    return null
  }
}

type TokenInfo = { address: `0x${string}`; symbol: string; decimals: number }

function getBalanceToken(token: TokenInfo) {
  if (token.symbol.toUpperCase() === 'ARCX') {
    return { ...token, address: ARCX_ADDRESS, decimals: 18 }
  }
  return token
}

export function V3SwapPage() {
  const chainId = useChainId()
  const { authenticated, ready: privyReady, login } = usePrivy()
  const address = usePersistedPrivyWalletAddress()
  const isConnected = authenticated
  const publicClient = usePublicClient()
  const { writeContractAsync: _arcWrite, isPending } = useArcWriteContract()
  const [writeHash, setWriteHash] = useState<`0x${string}` | undefined>()
  const writeContractAsync = async (params: any) => { const h = await _arcWrite(params); setWriteHash(h); return h }
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: writeHash, query: { enabled: !!writeHash } })
  const { switchChain } = useSwitchChain()

  const addrs = getV3Addresses(chainId ?? 0)
  const configError = getV3ConfigError(chainId ?? 0)
  const isWrongChain = chainId != null && chainId !== ARC_TESTNET_CHAIN_ID

  const tokens = ARC_TESTNET_TOKENS

  const [tokenFrom, setTokenFrom] = useState<(TokenInfo & { name?: string; logo?: string }) | null>(tokens[0] ?? null)
  const [tokenTo, setTokenTo] = useState<(TokenInfo & { name?: string; logo?: string }) | null>(tokens[1] ?? null)
  const [amountFrom, setAmountFrom] = useState('')
  const [amountTo, setAmountTo] = useState('')
  const [slippage, setSlippage] = useState(SLIPPAGE_DEFAULT)
  const [balanceFrom, setBalanceFrom] = useState<bigint>(0n)
  const [balanceTo, setBalanceTo] = useState<bigint>(0n)
  const [isQuoting, setIsQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  const routerAddress = addrs?.v3SwapRouter

  // Swap tokens
  const switchTokens = useCallback(() => {
    if (!tokenFrom || !tokenTo) return
    setTokenFrom(tokenTo)
    setTokenTo(tokenFrom)
    setAmountFrom(amountTo)
    setAmountTo(amountFrom)
  }, [tokenFrom, tokenTo, amountFrom, amountTo])

  // Fix tokenFrom/tokenTo when tokens load
  useEffect(() => {
    if (tokens.length >= 2 && (!tokenFrom || !tokenTo)) {
      setTokenFrom(tokens[0])
      setTokenTo(tokens[1])
    }
  }, [tokens, tokenFrom, tokenTo])

  // Balance
  useEffect(() => {
    if (!address || !publicClient || !tokenFrom) {
      setBalanceFrom(0n)
      return
    }
    const balanceToken = getBalanceToken(tokenFrom)
    console.log('Reading balance for:', address)
    publicClient
      .readContract({
        address: balanceToken.address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      })
      .then((balance) => {
        if (balanceToken.symbol.toUpperCase() === 'ARCX') {
          console.log('ARCX balance fetch:', {
            contractAddress: ARCX_ADDRESS,
            walletAddress: address,
            result: balance,
          })
        }
        setBalanceFrom(balance)
      })
      .catch((err) => {
        if (balanceToken.symbol.toUpperCase() === 'ARCX') {
          console.log('ARCX balance fetch failed:', {
            contractAddress: ARCX_ADDRESS,
            walletAddress: address,
            error: err,
          })
        }
        setBalanceFrom(0n)
      })
  }, [address, publicClient, tokenFrom])

  // Balance To
  useEffect(() => {
    if (!address || !publicClient || !tokenTo) {
      setBalanceTo(0n)
      return
    }
    const balanceToken = getBalanceToken(tokenTo)
    console.log('Reading balance for:', address)
    publicClient
      .readContract({
        address: balanceToken.address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      })
      .then((balance) => {
        if (balanceToken.symbol.toUpperCase() === 'ARCX') {
          console.log('ARCX balance fetch:', {
            contractAddress: ARCX_ADDRESS,
            walletAddress: address,
            result: balance,
          })
        }
        setBalanceTo(balance)
      })
      .catch((err) => {
        if (balanceToken.symbol.toUpperCase() === 'ARCX') {
          console.log('ARCX balance fetch failed:', {
            contractAddress: ARCX_ADDRESS,
            walletAddress: address,
            error: err,
          })
        }
        setBalanceTo(0n)
      })
  }, [address, publicClient, tokenTo])

  // Quote via simulate (exactInputSingle returns amountOut)
  useEffect(() => {
    if (!publicClient || !routerAddress || !tokenFrom || !tokenTo || !addrs || !address) return
    const amountIn = safeParseUnits(amountFrom, tokenFrom.decimals)
    if (!amountIn || amountIn <= 0n) {
      setAmountTo('')
      setQuoteError(null)
      return
    }
    setIsQuoting(true)
    setQuoteError(null)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
    publicClient
      .simulateContract({
        address: routerAddress,
        abi: SwapRouterAbi as never,
        functionName: 'exactInputSingle',
        args: [
          {
            tokenIn: tokenFrom.address,
            tokenOut: tokenTo.address,
            fee: FEE_500,
            recipient: address ?? '0x0000000000000000000000000000000000000000',
            deadline,
            amountIn,
            amountOutMinimum: 0n,
            sqrtPriceLimitX96: 0n,
          },
        ],
        account: address ?? '0x0000000000000000000000000000000000000000',
      })
      .then(({ result }) => {
        const out = result as bigint
        const formatted = formatUnits(out, tokenTo.decimals)
        setAmountTo(formatNumber(parseFloat(formatted), 6))
      })
      .catch((err) => {
        const msg = (err as { message?: string })?.message ?? 'Quote failed'
        setQuoteError(msg)
        setAmountTo('')
      })
      .finally(() => setIsQuoting(false))
  }, [amountFrom, tokenFrom, tokenTo, publicClient, routerAddress, address, addrs])

  const amountInRaw = safeParseUnits(amountFrom, tokenFrom?.decimals ?? 6)
  const amountOutRaw = safeParseUnits(amountTo, tokenTo?.decimals ?? 6)
  const amountOutMin =
    amountOutRaw != null && amountOutRaw > 0n
      ? (amountOutRaw * BigInt(100 - slippage)) / 100n
      : 0n

  const handleSwap = async () => {
    if (!address || !tokenFrom || !tokenTo || !routerAddress || !publicClient) {
      toast.error('Connect wallet and select tokens.')
      return
    }
    if (isWrongChain && switchChain) {
      try {
        await switchChain({ chainId: ARC_TESTNET_CHAIN_ID })
        return
      } catch {
        toast.error('Switch to Arc Testnet manually.')
        return
      }
    }
    if (!amountInRaw || amountInRaw <= 0n) {
      toast.error('Enter a valid amount.')
      return
    }
    if (balanceFrom < amountInRaw) {
      toast.error('Insufficient balance.')
      return
    }

    const writeOpts = (opts: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: unknown[] }) =>
      writeContractAsync({ address: opts.address, abi: opts.abi, functionName: opts.functionName, args: opts.args })

    try {
      await ensureAllowance(publicClient, writeOpts, tokenFrom.address, address, routerAddress, amountInRaw)
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'Approval failed')
      return
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
    try {
      toast.loading('Swapping...')
      await writeContractAsync({
        address: routerAddress,
        abi: SwapRouterAbi as never,
        functionName: 'exactInputSingle',
        args: [
          {
            tokenIn: tokenFrom.address,
            tokenOut: tokenTo.address,
            fee: FEE_500,
            recipient: address,
            deadline,
            amountIn: amountInRaw,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0n,
          },
        ],
      })
      toast.success('Swap submitted. Confirm in wallet.')
    } catch (e: unknown) {
      toast.dismiss()
      const msg = (e as { message?: string })?.message ?? 'Swap failed'
      toast.error(msg)
    }
  }

  useEffect(() => {
    if (isSuccess && writeHash) {
      toast.success('Swap confirmed!')
    }
  }, [isSuccess, writeHash])

  if (configError) {
    return (
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm flex items-center gap-2">
        <AlertCircle className="h-5 w-5 shrink-0" />
        {configError}
      </div>
    )
  }

  if (isWrongChain) {
    return (
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">
        Connect to Arc Testnet to use V3 Swap.
      </div>
    )
  }

  if (!addrs) {
    return (
      <div className="p-4 rounded-xl border border-slate-700/50 text-slate-400 text-sm">
        V3 config not available for this network.
      </div>
    )
  }

  const isLoading = isPending || isConfirming
  const canSwap =
    isConnected &&
    !!address &&
    !!tokenFrom &&
    !!tokenTo &&
    !!amountInRaw &&
    amountInRaw > 0n &&
    !!amountTo &&
    parseFloat(amountTo) > 0 &&
    balanceFrom >= amountInRaw &&
    !quoteError

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5 shadow-lg">
      <h3 className="text-base font-semibold text-white mb-4">V3 Swap (Pro)</h3>

      <div className="space-y-3">
        <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
          <div className="text-xs text-slate-500 mb-2">From</div>
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amountFrom}
              onChange={(e) => setAmountFrom(e.target.value)}
              className="bg-transparent text-lg font-medium text-white w-full min-w-0 focus:outline-none"
            />
            <TokenSelectButton
              selected={tokenFrom ? { address: tokenFrom.address, symbol: tokenFrom.symbol, name: tokenFrom.name ?? tokenFrom.symbol, decimals: tokenFrom.decimals, logo: tokenFrom.logo } : null}
              tokens={tokens}
              onSelect={(t) => setTokenFrom(t)}
              excludedAddress={tokenTo?.address}
              accountAddress={address}
            />
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Balance: {formatMoney(formatUnits(balanceFrom, tokenFrom ? getBalanceToken(tokenFrom).decimals : 6), 4)}
          </div>
        </div>

        <button
          type="button"
          onClick={switchTokens}
          disabled={!tokenFrom || !tokenTo}
          className="flex items-center justify-center w-10 h-10 rounded-full border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-300 mx-auto transition-colors disabled:opacity-50"
        >
          <ArrowDownUp className="h-4 w-4" />
        </button>

        <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
          <div className="text-xs text-slate-500 mb-2">To</div>
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amountTo}
              readOnly
              className="bg-transparent text-lg font-medium text-slate-300 w-full min-w-0"
            />
            <TokenSelectButton
              selected={tokenTo ? { address: tokenTo.address, symbol: tokenTo.symbol, name: tokenTo.name ?? tokenTo.symbol, decimals: tokenTo.decimals, logo: tokenTo.logo } : null}
              tokens={tokens}
              onSelect={(t) => setTokenTo(t)}
              excludedAddress={tokenFrom?.address}
              accountAddress={address}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="text-xs text-slate-500">
              Balance: {formatMoney(formatUnits(balanceTo, tokenTo ? getBalanceToken(tokenTo).decimals : 6), 4)}
            </div>
            {isQuoting && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Calculating...
              </div>
            )}
          </div>
          {quoteError && <div className="text-xs text-amber-400 mt-1">{quoteError}</div>}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Slippage</span>
          <div className="flex gap-1">
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlippage(s)}
                className={`px-2 py-1 rounded ${slippage === s ? 'bg-cyan-500/30 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {s}%
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={!isConnected ? () => { if (privyReady) login() } : handleSwap}
          disabled={(!isConnected && !privyReady) || (isConnected && (!canSwap || isLoading))}
          className="w-full py-3 rounded-xl font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Confirming...
            </>
          ) : !isConnected ? (
            'Log in'
          ) : !amountFrom || parseFloat(amountFrom) <= 0 ? (
            'Enter amount'
          ) : quoteError ? (
            'Unable to quote'
          ) : (
            'Swap'
          )}
        </button>
      </div>
    </div>
  )
}
