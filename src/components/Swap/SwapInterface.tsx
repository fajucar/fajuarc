import { useState, useEffect } from 'react'
import { usePublicClient, useWaitForTransactionReceipt, useSwitchChain, useReadContract, useChainId, useConnection } from 'wagmi'
import { useArcWallet } from '@/hooks/useArcWallet'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { NetworkSwitchModal } from './NetworkSwitchModal'
import { LinkFaucetBanner } from './LinkFaucetBanner'
import { parseUnits, formatUnits, maxUint256, decodeErrorResult, encodeFunctionData } from 'viem'
import { ArrowDownUp, Loader2, AlertCircle, CheckCircle2, Settings } from 'lucide-react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { notifyTxExecuted } from '@/lib/notify'
import { ARCDEX } from '@/config/arcDex'
import { ARC_MAINNET_TOKENS } from '@/constants/tokens'
import { TokenSelectButton } from '@/components/TokenSelect'
import { CONSTANTS } from '@/config/constants'
import { EURC_ALTERNATIVE, ZERO_ADDRESS } from '@/config/tokens'
import { ensureAllowance } from '@/lib/allowance'
import { assertAddress } from '@/lib/assertAddress'
import { formatNumber, formatMoney } from '@/lib/format'
import { buildSwapPath, quoteSwap, simulateSwap, DEFAULT_SLIPPAGE_PERCENT } from '@/lib/dex/swapUtils'

export type SwapDebugData = {
  chainId: number | null
  routerAddress: string
  factoryAddress: string
  routerFactoryOnChain: string | null
  tokenIn: string | null
  tokenOut: string | null
  pairAddress: string | null
  reserve0: string
  reserve1: string
  token0: string | null
  token1: string | null
  balanceUser: string
  allowanceUser: string
  amountIn: string | null
  amountOut: string | null
  amountOutMin: string | null
  blockTimestamp: string | null
  deadlineClient: string
  warning: string | null
}

/** Valores RAW (bigint como string) realmente enviados ao Router no último swap */
type LastSentSwapArgs = {
  amountInRaw: string
  amountOutMinRaw: string
  path: string[]
  to: string
  deadline: string
} | null

const EXPECTED_CHAIN_ID = CONSTANTS.ARC_MAINNET_CHAIN_ID
const SLIPPAGE_DEFAULT = DEFAULT_SLIPPAGE_PERCENT // shared with liquidity add/remove minimums
// USDC é o token nativo de gas da Arc Testnet (precompile). Routers patchados suportam swap com ele.
const USDC_NATIVE_ADDRESS = '0x3600000000000000000000000000000000000000'
const DEX_ROUTER_ADDRESS = ARCDEX.router
const CONFIG_FACTORY = ARCDEX.factory
const AGENTS_SWAP_PREFILL_KEY = 'fajuarc:agents:swap-prefill'
const PAIR_SWAP_SELECTOR = '022c0d9f'

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

// ERC20 ABI mínimo (balanceOf, approve, transfer, allowance, decimals)
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
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
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const

// ABI mínima do Router para ler factory()
const ROUTER_FACTORY_ABI = [
  {
    name: 'factory',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

// ArcDEX Router ABI (fork customizado do Uniswap V2 para Arc Network)
// Compatível com USDC como gas token (Arc Testnet)
// Ver: docs/ArcDEX_Simple.sol
const ARCDEX_ROUTER_ABI = [
  {
    name: 'factory',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'supportsPrecompileTokens',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'pairFor',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
    ],
    outputs: [{ name: 'pair', type: 'address' }],
  },
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  // Erro padrão Solidity require(msg) = Error(string), selector 0x08c379a0
  {
    name: 'Error',
    type: 'error',
    inputs: [{ name: 'message', type: 'string' }],
  },
  // Panic(uint256) para reverts de assert/overflow
  {
    name: 'Panic',
    type: 'error',
    inputs: [{ name: 'code', type: 'uint256' }],
  },
] as const

// ABI só com erros para decodificação (evita conflito de nomes)
const ROUTER_ERROR_ABI = [
  { name: 'Error', type: 'error', inputs: [{ name: 'message', type: 'string' }] },
  { name: 'Panic', type: 'error', inputs: [{ name: 'code', type: 'uint256' }] },
] as const

// Helper para extrair mensagem real do erro
function extractRevertReason(error: any): string {
  // Tentar usar o método walk() do viem para obter causa raiz
  if (error?.walk) {
    try {
      const rootCause = error.walk()
      if (rootCause && rootCause !== error) {
        const rootMsg = extractRevertReason(rootCause)
        if (rootMsg && rootMsg !== 'Unknown error' && rootMsg.length > 3) {
          return rootMsg
        }
      }
    } catch {
      // Ignorar erro ao usar walk()
    }
  }

  // Tentar decodificar erro usando decodeErrorResult
  if (error?.data && typeof error.data === 'string' && error.data.startsWith('0x')) {
    try {
      const decoded = decodeErrorResult({
        abi: ARCDEX_ROUTER_ABI,
        data: error.data as `0x${string}`,
      })
      if (decoded.args && decoded.args.length > 0) {
        return String(decoded.args[0])
      }
      if (decoded.errorName) {
        return decoded.errorName
      }
    } catch {
      // Se não conseguir decodificar, continuar com outras opções
    }
  }

  // Tentar extrair mensagem de diferentes propriedades do erro (prioridade: shortMessage > message > cause)
  let errorMsg = 
    error?.shortMessage ||
    error?.message ||
    error?.cause?.message ||
    error?.cause?.shortMessage ||
    error?.reason ||
    error?.data?.message ||
    error?.details ||
    error?.toString() ||
    'Unknown error'

  // Converter para string se necessário
  errorMsg = String(errorMsg)
  
  // Se a mensagem é apenas "reverted" sem detalhes, tentar obter mais informações
  if (errorMsg.toLowerCase().includes('reverted') && errorMsg.length < 50) {
    // Tentar obter informações do cause ou walk
    if (error?.cause) {
      const causeMsg = String(error.cause?.message || error.cause?.shortMessage || '')
      if (causeMsg && causeMsg.length > errorMsg.length) {
        errorMsg = causeMsg
      }
    }
  }

  // Tentar extrair mensagem específica do Router (ArcDEX: ...)
  const arcDexMatch = errorMsg.match(/ArcDEX:\s*([^\n"']+)/i)
  if (arcDexMatch) {
    return arcDexMatch[1].trim()
  }

  // Tentar extrair mensagem de revert genérico com diferentes padrões
  const revertPatterns = [
    /revert(?:ed)?(?:\s+with\s+reason\s+string)?\s*["']?([^"'\n]+)["']?/i,
    /execution\s+reverted(?:\s+with\s+reason)?\s*["']?([^"'\n]+)["']?/i,
    /reason:\s*["']?([^"'\n]+)["']?/i,
    /message:\s*["']?([^"'\n]+)["']?/i,
  ]

  for (const pattern of revertPatterns) {
    const match = errorMsg.match(pattern)
    if (match && match[1]) {
      const extracted = match[1].trim()
      if (extracted && extracted !== 'revert' && extracted !== 'reverted') {
        return extracted
      }
    }
  }

  // Se contém "reverted" mas não conseguiu extrair mensagem específica
  if (errorMsg.toLowerCase().includes('reverted') && !errorMsg.toLowerCase().includes('ArcDEX')) {
    // Tentar pegar a última parte da mensagem após "reverted"
    const parts = errorMsg.split(/reverted/i)
    if (parts.length > 1) {
      const afterRevert = parts[parts.length - 1].trim()
      if (afterRevert) {
        // Limpar aspas e espaços extras
        const cleaned = afterRevert.replace(/^["']+|["']+$/g, '').trim()
        if (cleaned && cleaned.length > 2) {
          return cleaned
        }
      }
    }
  }

  // Se a mensagem contém informações úteis mas não foi extraída, retornar ela mesma
  if (errorMsg && errorMsg.length > 5 && errorMsg !== 'Unknown error') {
    // Remover partes comuns que não são úteis
    const cleaned = errorMsg
      .replace(/^Error:\s*/i, '')
      .replace(/^The contract function .+ reverted\.?$/i, '')
      .trim()
    
    if (cleaned && cleaned.length > 2) {
      return cleaned
    }
  }

  // Fallback final: retornar mensagem original se tiver conteúdo útil
  return errorMsg && errorMsg.length > 2 ? errorMsg : 'Unknown simulation error'
}

// Factory ABI mínimo (getPair)
const FACTORY_ABI = [
  {
    name: 'getPair',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
    ],
    outputs: [{ name: 'pair', type: 'address' }],
  },
] as const

// Pair ABI mínimo (getReserves retorna 2 valores no Arc Testnet)
const PAIR_ABI = [
  {
    name: 'getReserves',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_reserve0', type: 'uint112' },
      { name: '_reserve1', type: 'uint112' },
    ],
  },
  {
    name: 'token0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'token1',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

interface Token {
  address: `0x${string}`
  symbol: string
  decimals: number
}

const TOKENS: Token[] = ARC_MAINNET_TOKENS.map((t) => ({
  address: t.address,
  symbol: t.symbol,
  decimals: t.decimals,
}))
const SWAP_TOKEN_OPTIONS = ARC_MAINNET_TOKENS
const SWAP_TOKENS: Token[] = TOKENS
const DEFAULT_TOKEN_FROM = SWAP_TOKENS.find((token) => token.symbol === 'FAJU') ?? SWAP_TOKENS[0]!
const DEFAULT_TOKEN_TO = SWAP_TOKENS.find((token) => token.symbol === 'EURC') ?? SWAP_TOKENS[1] ?? null

export function SwapInterface() {
  const { address, isConnected } = useArcWallet()
  // Pinned to Arc so quotes, balances and receipts never follow a wallet on another network.
  const publicClient = usePublicClient({ chainId: EXPECTED_CHAIN_ID })
  const { switchChain } = useSwitchChain()
  // useChainId() only reports chains the app is configured for, so a wallet on an
  // unknown network (e.g. Ink Sepolia) looked "correct". Use the live connection chain.
  const configChainId = useChainId()
  const connection = useConnection()
  const chainId = connection.status === 'connected' ? connection.chainId : configChainId
  const isWrongChain = chainId != null && chainId !== EXPECTED_CHAIN_ID

  // Log na inicialização: Router oficial e Factory em uso (arcTestnet.ts → arcDex.ts)
  useEffect(() => {
    console.log('[ArcDEX] Router oficial em uso:', DEX_ROUTER_ADDRESS ?? '(não definido)')
    console.log('[ArcDEX] Factory:', CONFIG_FACTORY)
  }, [])

  // Abrir modal de troca de rede quando detectar rede incorreta
  useEffect(() => {
    if (isWrongChain && isConnected) {
      setShowNetworkModal(true)
    }
  }, [isWrongChain, isConnected])

  const [tokenFrom, setTokenFrom] = useState<Token>(DEFAULT_TOKEN_FROM)
  const [tokenTo, setTokenTo] = useState<Token | null>(DEFAULT_TOKEN_TO)
  const [amountFrom, setAmountFrom] = useState('')
  const [amountTo, setAmountTo] = useState('')
  const [slippage, setSlippage] = useState(SLIPPAGE_DEFAULT)
  const [balanceFrom, setBalanceFrom] = useState<bigint>(0n)
  const [balanceTo, setBalanceTo] = useState<bigint>(0n)
  const [lastWriteType, setLastWriteType] = useState<'approve' | 'swap' | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [lastSwapTxHash, setLastSwapTxHash] = useState<string | null>(null)
  const [debugData, setDebugData] = useState<SwapDebugData | null>(null)
  const [lastSimError, setLastSimError] = useState<string | null>(null)
  const [, setLastSimErrorDetail] = useState<string | null>(null)
  const [, setLastSentSwapArgs] = useState<LastSentSwapArgs>(null)
  const [, setLastSwapDebug] = useState<{
    chainId: number
    router: string
    path: string[]
    amountIn: string
    amountOut: string
    minOut: string
    deadline: string
    allowance: string
    reserve0: string
    reserve1: string
  } | null>(null)
  /** true = Router novo (TransferHelper), false = Router antigo (swap vai reverter), null = ainda não verificou */
  const [routerSupportsPrecompile, setRouterSupportsPrecompile] = useState<boolean | null>(null)
  const [showNetworkModal, setShowNetworkModal] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { writeContractAsync: _arcWrite, isPending } = useArcWriteContract()
  const [writeHash, setWriteHash] = useState<`0x${string}` | undefined>()
  const writeContract = async (params: any) => {
    const h = await _arcWrite(params)
    setWriteHash(h)
    return h
  }
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: writeHash, query: { enabled: !!writeHash } })

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(AGENTS_SWAP_PREFILL_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as {
        tokenInAddress?: string
        tokenOutAddress?: string
        amountIn?: string
      }

      const nextTokenFrom = SWAP_TOKENS.find((token) => token.address.toLowerCase() === parsed.tokenInAddress?.toLowerCase())
      const nextTokenTo = SWAP_TOKENS.find((token) => token.address.toLowerCase() === parsed.tokenOutAddress?.toLowerCase())

      if (nextTokenFrom) setTokenFrom(nextTokenFrom)
      if (nextTokenTo) setTokenTo(nextTokenTo)
      if (typeof parsed.amountIn === 'string') setAmountFrom(parsed.amountIn)

      window.sessionStorage.removeItem(AGENTS_SWAP_PREFILL_KEY)
    } catch {
      // Ignore malformed storage values.
    }
  }, [])

  // Allowance USDC → Router (para seção "Test Approve USDC" e exibição em tempo real)
  // Allowance do token From para o Router (reactivo; refetch após approve)
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: tokenFrom.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && DEX_ROUTER_ADDRESS ? [address, DEX_ROUTER_ADDRESS] : undefined,
  })

  // Precisa de approve se amountIn > 0 e allowance < amountIn (6 decimais para USDC/EURC)
  const amountInForApproval = safeParseUnits(amountFrom, tokenFrom.decimals)
  const needsApproval = Boolean(
    amountInForApproval != null &&
    amountInForApproval > 0n &&
    DEX_ROUTER_ADDRESS &&
    address &&
    (currentAllowance === undefined ? true : currentAllowance < amountInForApproval)
  )

  // Carregar balance do token origem
  useEffect(() => {
    if (!address || !publicClient || !tokenFrom) return

    const loadBalance = async () => {
      try {
        const balance = (await publicClient.readContract({
          address: tokenFrom.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        })) as bigint

        setBalanceFrom(balance)
      } catch (err) {
        console.error('Error loading balance:', err)
        setBalanceFrom(0n)
      }
    }

    loadBalance()
  }, [address, publicClient, tokenFrom])

  // Carregar balance do token destino
  useEffect(() => {
    if (!address || !publicClient || !tokenTo) {
      setBalanceTo(0n)
      return
    }

    const loadBalance = async () => {
      try {
        const balance = (await publicClient.readContract({
          address: tokenTo.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        })) as bigint

        setBalanceTo(balance)
      } catch {
        setBalanceTo(0n)
      }
    }

    loadBalance()
  }, [address, publicClient, tokenTo])

  // Verificar se o Router suporta precompile tokens. Só na rede esperada (EXPECTED_CHAIN_ID).
  // 1) Se supportsPrecompileTokens() existe e retorna true → OK
  // 2) Se retorna false → Router antigo
  // 3) Se a função não existe (ex.: Router oficial SingleHop) → fallback: getAmountsOut(1, [USDC,EURC])
  //    Se getAmountsOut funciona → Router operacional (permite swap)
  //    Se falha → null (não bloqueia; o swap mostrará o erro real)
  useEffect(() => {
    if (!publicClient || !DEX_ROUTER_ADDRESS || chainId !== EXPECTED_CHAIN_ID) {
      setRouterSupportsPrecompile(null)
      return
    }
    let cancelled = false
    const check = async () => {
      try {
        const supports = (await publicClient.readContract({
          address: DEX_ROUTER_ADDRESS,
          abi: ARCDEX_ROUTER_ABI,
          functionName: 'supportsPrecompileTokens',
        })) as boolean
        if (!cancelled) setRouterSupportsPrecompile(supports === true)
        return
      } catch {
        // supportsPrecompileTokens não existe ou reverteu → fallback
      }
      // Fallback: Router oficial pode não ter supportsPrecompileTokens. Testar getAmountsOut.
      try {
        const path = [ARCDEX.usdc, ARCDEX.eurc] as readonly [`0x${string}`, `0x${string}`]
        const amounts = (await publicClient.readContract({
          address: DEX_ROUTER_ADDRESS,
          abi: ARCDEX_ROUTER_ABI,
          functionName: 'getAmountsOut',
          args: [1n, path],
        })) as bigint[]
        if (!cancelled && amounts?.length >= 2 && amounts[amounts.length - 1] !== undefined) {
          setRouterSupportsPrecompile(true)
        } else {
          if (!cancelled) setRouterSupportsPrecompile(null)
        }
      } catch {
        if (!cancelled) setRouterSupportsPrecompile(null)
      }
    }
    check()
    return () => { cancelled = true }
  }, [publicClient, DEX_ROUTER_ADDRESS, chainId])

  // Debug Panel: buscar router, factory, pair, reserves, balance, allowance, block, deadline
  useEffect(() => {
    if (!publicClient || !tokenFrom || !tokenTo) {
      setDebugData(null)
      return
    }
    let cancelled = false
    const run = async () => {
        const empty: SwapDebugData = {
          chainId: chainId ?? null,
          routerAddress: DEX_ROUTER_ADDRESS || '—',
          factoryAddress: CONFIG_FACTORY,
          routerFactoryOnChain: null,
          tokenIn: tokenFrom?.address ?? null,
          tokenOut: tokenTo?.address ?? null,
          pairAddress: null,
          reserve0: '0',
          reserve1: '0',
          token0: null,
          token1: null,
          balanceUser: '0',
          allowanceUser: '0',
          amountIn: null,
          amountOut: null,
          amountOutMin: null,
          blockTimestamp: null,
          deadlineClient: String(BigInt(Math.floor(Date.now() / 1000)) + 1200n),
          warning: null,
        }
      try {
        if (!DEX_ROUTER_ADDRESS) {
          if (!cancelled) setDebugData(empty)
          return
        }
        const [routerFactory, pairAddr, block] = await Promise.all([
          publicClient.readContract({
            address: DEX_ROUTER_ADDRESS,
            abi: ARCDEX_ROUTER_ABI,
            functionName: 'factory',
          }).then((r) => String(r)).catch(() => null),
          publicClient.readContract({
            address: CONFIG_FACTORY,
            abi: FACTORY_ABI,
            functionName: 'getPair',
            args: [tokenFrom.address, tokenTo.address],
          }).then((r) => (r && r !== '0x0000000000000000000000000000000000000000' ? String(r) : null)).catch(() => null),
          publicClient.getBlock({ blockTag: 'latest' }).catch(() => null),
        ])
        if (cancelled) return
        let reserve0 = '0', reserve1 = '0', token0Addr: string | null = null, token1Addr: string | null = null
        let warning: string | null = null
        if (pairAddr) {
          try {
            const [reserves, t0, t1] = await Promise.all([
              publicClient.readContract({
                address: pairAddr as `0x${string}`,
                abi: PAIR_ABI,
                functionName: 'getReserves',
              }) as Promise<[bigint, bigint]>,
              publicClient.readContract({
                address: pairAddr as `0x${string}`,
                abi: PAIR_ABI,
                functionName: 'token0',
              }) as Promise<`0x${string}`>,
              publicClient.readContract({
                address: pairAddr as `0x${string}`,
                abi: PAIR_ABI,
                functionName: 'token1',
              }) as Promise<`0x${string}`>,
            ])
            reserve0 = reserves[0].toString()
            reserve1 = reserves[1].toString()
            token0Addr = String(t0)
            token1Addr = String(t1)
            if (reserves[0] === 0n || reserves[1] === 0n) {
              warning = 'Pool has no liquidity'
            }
          } catch {
            warning = 'No liquidity or pair does not exist (error reading reserves).'
          }
        } else {
          warning = 'No liquidity or pair does not exist (pair = address(0)).'
        }
        let balanceUser = '0', allowanceUser = '0'
        if (address) {
          try {
            const [bal, allow] = await Promise.all([
              publicClient.readContract({
                address: tokenFrom.address,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [address],
              }) as Promise<bigint>,
              publicClient.readContract({
                address: tokenFrom.address,
                abi: ERC20_ABI,
                functionName: 'allowance',
                args: [address, DEX_ROUTER_ADDRESS],
              }) as Promise<bigint>,
            ])
            balanceUser = bal.toString()
            allowanceUser = allow.toString()
          } catch { /* keep 0 */ }
        }
        const deadlineClient = String(BigInt(Math.floor(Date.now() / 1000)) + 1200n)
        
        // Calcular amountIn, amountOut, amountOutMin se houver amountFrom
        let amountInStr: string | null = null
        let amountOutStr: string | null = null
        let amountOutMinStr: string | null = null
        if (amountFrom && parseFloat(amountFrom) > 0 && tokenFrom && tokenTo) {
          const amountInRaw = safeParseUnits(amountFrom, tokenFrom.decimals)
          if (amountInRaw && amountInRaw > 0n) {
            amountInStr = amountInRaw.toString()
            try {
              const amounts = (await publicClient.readContract({
                address: DEX_ROUTER_ADDRESS,
                abi: ARCDEX_ROUTER_ABI,
                functionName: 'getAmountsOut',
                args: [amountInRaw, [tokenFrom.address, tokenTo.address]],
              })) as bigint[]
              if (amounts && amounts.length > 0) {
                amountOutStr = amounts[amounts.length - 1].toString()
                const slippageBps = BigInt(Math.round(slippage * 100))
                amountOutMinStr = ((amounts[amounts.length - 1] * (10000n - slippageBps)) / 10000n).toString()
              }
            } catch {
              // Ignorar erro de getAmountsOut
            }
          }
        }
        
        if (!cancelled) {
          setDebugData({
            chainId: chainId ?? null,
            routerAddress: DEX_ROUTER_ADDRESS,
            factoryAddress: CONFIG_FACTORY,
            routerFactoryOnChain: routerFactory,
            tokenIn: tokenFrom?.address ?? null,
            tokenOut: tokenTo?.address ?? null,
            pairAddress: pairAddr,
            reserve0,
            reserve1,
            token0: token0Addr,
            token1: token1Addr,
            balanceUser,
            allowanceUser,
            amountIn: amountInStr,
            amountOut: amountOutStr,
            amountOutMin: amountOutMinStr,
            blockTimestamp: block ? String(block.timestamp) : null,
            deadlineClient,
            warning,
          })
        }
      } catch (e) {
        if (!cancelled) setDebugData(null)
      }
    }
    run()
    return () => { cancelled = true }
  }, [publicClient, address, tokenFrom, tokenTo, amountFrom, slippage, chainId])

  // Calcular amountOut quando amountFrom muda (preview). Só na rede esperada.
  useEffect(() => {
    if (!tokenTo) {
      setAmountTo('')
      return
    }

    const amountIn = safeParseUnits(amountFrom, tokenFrom.decimals)
    if (amountIn == null || amountIn <= 0n || !tokenFrom || !publicClient) {
      setAmountTo('')
      return
    }

    // Só calcular cotação quando conectado na rede esperada
    if (chainId != null && chainId !== EXPECTED_CHAIN_ID) {
      setAmountTo('—')
      return
    }

    const timeoutId = setTimeout(() => {
      const calculateAmountOut = async () => {
        setIsCalculating(true)
        try {
          const ZERO_PREVIEW = '0x0000000000000000000000000000000000000000' as `0x${string}`
          let pairAddress = (await publicClient.readContract({
            address: ARCDEX.factory,
            abi: FACTORY_ABI,
            functionName: 'getPair',
            args: [tokenFrom.address, tokenTo.address],
          })) as `0x${string}`
          if (!pairAddress || pairAddress === ZERO_PREVIEW) {
            if (tokenTo.symbol === 'EURC') {
              pairAddress = (await publicClient.readContract({
                address: ARCDEX.factory,
                abi: FACTORY_ABI,
                functionName: 'getPair',
                args: [tokenFrom.address, EURC_ALTERNATIVE],
              })) as `0x${string}`
            }
          }
          if (!pairAddress || pairAddress === ZERO_PREVIEW) {
            setAmountTo('—')
            console.warn('[Preview] No route: pair not found', { tokenIn: tokenFrom.symbol, tokenOut: tokenTo.symbol, router: DEX_ROUTER_ADDRESS })
            setIsCalculating(false)
            return
          }
          const path = buildSwapPath(tokenFrom.address, tokenTo.address)

          // 1) Try getAmountsOut on Router first
          if (DEX_ROUTER_ADDRESS) {
            try {
              const amounts = (await publicClient.readContract({
                address: DEX_ROUTER_ADDRESS,
                abi: ARCDEX_ROUTER_ABI,
                functionName: 'getAmountsOut',
                args: [amountIn, path],
              })) as bigint[]
              const amountOut = amounts?.[amounts.length - 1]
              if (amountOut != null && amountOut > 0n) {
                const formatted = formatUnits(amountOut, tokenTo.decimals)
                setAmountTo(formatNumber(parseFloat(formatted), 3))
                setIsCalculating(false)
                return
              }
            } catch (getAmountsErr: unknown) {
              const errMsg = (getAmountsErr as { shortMessage?: string; message?: string })?.shortMessage || (getAmountsErr as { message?: string })?.message
              console.warn('[Preview] getAmountsOut failed — no route or insufficient liquidity', {
                tokenIn: tokenFrom.symbol,
                tokenOut: tokenTo.symbol,
                amountIn: amountIn.toString(),
                router: DEX_ROUTER_ADDRESS,
                error: errMsg,
              })
              setAmountTo('—')
              setIsCalculating(false)
              return
            }
          }

          // 2) Fallback: reserves formula
          const [reserves, token0Addr] = await Promise.all([
            publicClient.readContract({
              address: pairAddress,
              abi: PAIR_ABI,
              functionName: 'getReserves',
            }) as Promise<[bigint, bigint]>,
            publicClient.readContract({
              address: pairAddress,
              abi: PAIR_ABI,
              functionName: 'token0',
            }) as Promise<`0x${string}`>,
          ])

          const [reserve0, reserve1] = reserves
          if (reserve0 === 0n || reserve1 === 0n) {
            setAmountTo('—')
            console.warn('[Preview] No route / insufficient liquidity', { reserve0: reserve0.toString(), reserve1: reserve1.toString() })
            setIsCalculating(false)
            return
          }

          const fromIsToken0Local = tokenFrom.address.toLowerCase() === String(token0Addr).toLowerCase()
          const reserveIn = fromIsToken0Local ? reserve0 : reserve1
          const reserveOut = fromIsToken0Local ? reserve1 : reserve0
          const amountInWithFee = amountIn * 997n
          const numerator = amountInWithFee * reserveOut
          const denominator = reserveIn * 1000n + amountInWithFee
          const amountOut = numerator / denominator
          const formatted = formatUnits(amountOut, tokenTo.decimals)
          setAmountTo(formatNumber(parseFloat(formatted), 3))
        } catch (err: unknown) {
          const errMsg = (err as { shortMessage?: string; message?: string })?.shortMessage || (err as { message?: string })?.message
          console.error('[Preview] Quote error', { tokenIn: tokenFrom.symbol, tokenOut: tokenTo.symbol, amount: amountFrom, router: DEX_ROUTER_ADDRESS, error: errMsg })
          setAmountTo('—')
        } finally {
          setIsCalculating(false)
        }
      }

      calculateAmountOut()
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [amountFrom, tokenFrom, tokenTo, publicClient, chainId])

  const handleApprove = async () => {
    if (!isConnected || !address) {
      toast.error('Connect wallet first.')
      return
    }
    if (isWrongChain && switchChain) {
      try {
        toast.loading('Switching to Arc Mainnet...')
        await switchChain({ chainId: EXPECTED_CHAIN_ID })
        toast.dismiss()
        toast.success('Network changed. Click "Approve" again to approve.')
        return
      } catch (e) {
        toast.dismiss()
        toast.error('Switch manually to Arc Mainnet in MetaMask and try again.')
        return
      }
    }
    if (!tokenFrom) {
      toast.error('Select the From token.')
      return
    }
    // Router sempre existe (vem do JSON)

    setLastWriteType('approve')
    const toastId = toast.loading('Opening wallet to sign approval...')
    try {
      await writeContract({
        address: tokenFrom.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [DEX_ROUTER_ADDRESS, 340282366920938463463374607431768211455n],
      })
      toast.dismiss(toastId)
      toast.loading('Waiting for approval confirmation...', { id: 'approve-pending' })
    } catch (err: any) {
      toast.dismiss(toastId)
      setLastWriteType(null)
      const errorMsg = err?.message || err?.shortMessage || ''
      if (errorMsg.includes('rejected') || errorMsg.includes('denied') || errorMsg.includes('User denied')) {
        toast.error('Approval cancelled in wallet.')
      } else {
        toast.error(errorMsg || 'Approval failed. Try again.')
      }
    }
  }

  const handleSwap = async () => {
    console.log('handleSwap called', {
      address,
      tokenFrom: tokenFrom?.symbol,
      tokenTo: tokenTo?.symbol,
      amountFrom,
      amountTo,
      router: DEX_ROUTER_ADDRESS,
      needsApproval,
      isLoading,
      isWrongChain,
    })

    // Validações básicas
    if (routerSupportsPrecompile === false &&
        (tokenFrom.address.toLowerCase() === USDC_NATIVE_ADDRESS ||
        tokenTo?.address.toLowerCase() === USDC_NATIVE_ADDRESS)) {
      toast.error('USDC is not compatible with swap on this Router. Use FAJU ↔ EURC, FAJU ↔ ARCX or EURC ↔ ARCX.')
      return
    }
    if (!isConnected || !address) {
      toast.error('Connect wallet first.')
      return
    }
    if (isWrongChain && switchChain) {
      try {
        toast.loading('Switching to Arc Mainnet...')
        await switchChain({ chainId: EXPECTED_CHAIN_ID })
        toast.dismiss()
        toast.success('Network changed. Click Swap again (wallet will open to approve the token).')
        return
      } catch (e) {
        toast.dismiss()
        toast.error('Switch manually to Arc Mainnet in MetaMask and try again.')
        return
      }
    }
    if (!tokenFrom || !tokenTo) {
      toast.error('Select From and To tokens.')
      return
    }
    if (!amountFrom || parseFloat(amountFrom) <= 0) {
      toast.error('Enter a valid amount.')
      return
    }
    if (!amountTo || parseFloat(amountTo) <= 0) {
      toast.error('Waiting for output amount calculation...')
      return
    }

    // amountIn em RAW (bigint): parseUnits com decimais reais do token (USDC=6, EURC=6). NUNCA parseEther/18.
    const amountIn = safeParseUnits(amountFrom, tokenFrom.decimals)
    if (amountIn == null || amountIn <= 0n) {
      toast.error('Invalid amount.')
      return
    }

    if (!publicClient) {
      toast.error('Error: publicClient not available.')
      return
    }

    // Approve para o Router (spender = router). Reutiliza ensureAllowance.
    if (needsApproval && DEX_ROUTER_ADDRESS) {
      setLastWriteType('approve')
      const approveToast = toast.loading(`Approving ${tokenFrom.symbol} for Router...`)
      try {
        await ensureAllowance(
          publicClient,
          (opts) => writeContract({ address: opts.address, abi: opts.abi, functionName: opts.functionName, args: opts.args }),
          tokenFrom.address,
          address,
          DEX_ROUTER_ADDRESS,
          amountIn
        )
        await refetchAllowance()
        toast.dismiss(approveToast)
        toast.success('Token approved. Executing swap...')
      } catch (approveErr: any) {
        toast.dismiss(approveToast)
        const msg = approveErr?.shortMessage ?? approveErr?.message ?? 'Approval failed.'
        if (msg.includes('rejected') || msg.includes('denied')) {
          toast.error('Approval cancelled in wallet.')
        } else {
          toast.error(msg)
        }
        return
      }
    }

    // Validate addresses before use (defense against corrupted config/env)
    const routerCheck = assertAddress('router', DEX_ROUTER_ADDRESS)
    if (!routerCheck.ok) {
      toast.error(routerCheck.value)
      return
    }
    const factoryCheck = assertAddress('factory', CONFIG_FACTORY)
    if (!factoryCheck.ok) {
      toast.error(factoryCheck.value)
      return
    }
    if (
      DEX_ROUTER_ADDRESS.toLowerCase() === ZERO_ADDRESS.toLowerCase() ||
      CONFIG_FACTORY.toLowerCase() === ZERO_ADDRESS.toLowerCase()
    ) {
      toast.error(
        `Router or Factory not configured. Router: ${DEX_ROUTER_ADDRESS} (len ${DEX_ROUTER_ADDRESS.length}) | Factory: ${CONFIG_FACTORY} (len ${CONFIG_FACTORY.length}). Check .env and src/config/arcTestnet.ts`
      )
      return
    }

    // Swap flow — endereços em uso (router, factory, pair via factory.getPair)
    console.log('[Swap] Router address:', DEX_ROUTER_ADDRESS)
    console.log('[Swap] Factory address:', CONFIG_FACTORY)

    // Verificar mismatch Router/Factory: ler router.factory() e logar
    try {
      if (DEX_ROUTER_ADDRESS) {
        const ROUTER_FACTORY = (await publicClient.readContract({
          address: DEX_ROUTER_ADDRESS,
          abi: ROUTER_FACTORY_ABI,
          functionName: 'factory',
        })) as `0x${string}`
        console.log('[Swap] Router.factory() on-chain:', ROUTER_FACTORY)
      }
    } catch (factoryErr) {
      console.warn('Erro ao ler router.factory():', factoryErr)
    }

    const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`

    // 1) Resolver par com liquidez (tentar EURC alternativo se getPair retornar zero)
    toast.loading('Checking liquidity...', { id: 'swap-pending' })
    let pairAddress: `0x${string}`
    let path: `0x${string}`[]
    let reserveIn: bigint
    let reserveOut: bigint
    let reservesForDebug = { reserve0: '0', reserve1: '0' }

    try {
      // Sempre obter pair via factory.getPair — sem fallback para endereço hardcoded
      pairAddress = (await publicClient.readContract({
        address: ARCDEX.factory,
        abi: FACTORY_ABI,
        functionName: 'getPair',
        args: [tokenFrom.address, tokenTo.address],
      })) as `0x${string}`
      if (!pairAddress || pairAddress === ZERO) {
        if (tokenTo.symbol === 'EURC') {
          pairAddress = (await publicClient.readContract({
            address: ARCDEX.factory,
            abi: FACTORY_ABI,
            functionName: 'getPair',
            args: [tokenFrom.address, EURC_ALTERNATIVE],
          })) as `0x${string}`
        }
      }

      console.log('[Swap] Pair returned by factory:', pairAddress)

      if (!pairAddress || pairAddress === ZERO) {
        toast.dismiss('swap-pending')
        toast.error('Pair not found. Create the pair in Factory or go to Pools to add liquidity.')
        return
      }

      const pairCode = await publicClient.getCode({ address: pairAddress })
      if (!pairCode?.toLowerCase().includes(PAIR_SWAP_SELECTOR)) {
        toast.dismiss('swap-pending')
        const msg = `This pool ${tokenFrom.symbol}/${tokenTo.symbol} has liquidity, but the Pair contract does not implement swap(). Recreate the pair with the full ArcDEXPair.`
        setLastSimError(msg)
        toast.error(msg, { duration: 12000 })
        return
      }

      const [reserves, token0Addr, token1Addr] = await Promise.all([
        publicClient.readContract({
          address: pairAddress,
          abi: PAIR_ABI,
          functionName: 'getReserves',
        }) as Promise<[bigint, bigint]>,
        publicClient.readContract({
          address: pairAddress,
          abi: PAIR_ABI,
          functionName: 'token0',
        }) as Promise<`0x${string}`>,
        publicClient.readContract({
          address: pairAddress,
          abi: PAIR_ABI,
          functionName: 'token1',
        }) as Promise<`0x${string}`>,
      ])

      if (reserves[0] === 0n || reserves[1] === 0n) {
        toast.dismiss('swap-pending')
        toast.error('Pool with no liquidity — add liquidity first in the Pools tab.')
        return
      }

      const fromIsToken0 = tokenFrom.address.toLowerCase() === token0Addr.toLowerCase()
      reserveIn = fromIsToken0 ? reserves[0] : reserves[1]
      reserveOut = fromIsToken0 ? reserves[1] : reserves[0]
      reservesForDebug = { reserve0: reserves[0].toString(), reserve1: reserves[1].toString() }
      // Path: Address[] real, nunca string — buildSwapPath garante tipo correto
      path = [...buildSwapPath(tokenFrom.address, tokenTo.address)]
      console.log('[Swap] path do par:', { 
        path, 
        pairAddress, 
        token0: token0Addr,
        token1: token1Addr,
        tokenFrom: tokenFrom.address,
        tokenTo: tokenTo.address,
        fromIsToken0,
        reserve0: reserves[0].toString(), 
        reserve1: reserves[1].toString() 
      })

      // Verificar Router on-chain: factory() (verificação crítica)
      let routerFactory: `0x${string}`
      let routerHasTransferHelper: boolean | null = null
      try {
        routerFactory = (await publicClient.readContract({
          address: DEX_ROUTER_ADDRESS,
          abi: ARCDEX_ROUTER_ABI,
          functionName: 'factory',
        })) as `0x${string}`
        
        // Verificar se Router tem TransferHelper (opcional - não bloqueia se não existir)
        // Se a função não existir, assumimos que o Router pode estar correto (confiamos no JSON config)
        try {
          const supports = (await publicClient.readContract({
            address: DEX_ROUTER_ADDRESS,
            abi: ARCDEX_ROUTER_ABI,
            functionName: 'supportsPrecompileTokens',
          })) as boolean
          routerHasTransferHelper = supports === true
          console.log('[Swap] Router supportsPrecompileTokens():', routerHasTransferHelper)
        } catch (supportsErr: any) {
          // Função não existe ou erro ao chamar - não bloquear, apenas logar
          console.warn('[Swap] supportsPrecompileTokens() não disponível ou erro:', supportsErr?.message || supportsErr)
          routerHasTransferHelper = null // null = não verificado (não sabemos)
        }
      } catch (e: any) {
        toast.dismiss('swap-pending')
        const errMsg = e?.shortMessage || e?.message || String(e)
        console.error('[Swap] Erro ao ler router.factory():', e)
        toast.error('Invalid Router or wrong network: ' + (errMsg.slice(0, 80) || 'check src/config/arcTestnet.ts'))
        return
      }
      
      if (routerFactory.toLowerCase() !== CONFIG_FACTORY.toLowerCase()) {
        toast.dismiss('swap-pending')
        toast.error('Router uses different Factory. Expected: ' + CONFIG_FACTORY.slice(0, 10) + '... Current: ' + String(routerFactory).slice(0, 10) + '...')
        return
      }
      
      // Se routerHasTransferHelper === false (explicitamente false, não null), avisar mas não bloquear
      // O Router está correto no JSON config, então confiamos nele
      if (routerHasTransferHelper === false) {
        console.warn('[Swap] Router pode não ter TransferHelper, mas está correto no config. Continuando...')
      }
      
      console.log('[Swap] Router verificado:', {
        address: DEX_ROUTER_ADDRESS,
        factory: routerFactory,
        hasTransferHelper: routerHasTransferHelper === null ? 'não verificado' : routerHasTransferHelper,
      })

      // pairFor no Router pode reverter em algumas implementações; como router.factory() já bate com a config, seguimos para getAmountsOut/swap
      try {
        const routerPair = (await publicClient.readContract({
          address: DEX_ROUTER_ADDRESS,
          abi: ARCDEX_ROUTER_ABI,
          functionName: 'pairFor',
          args: [path[0], path[1]],
        })) as `0x${string}`
        if (routerPair.toLowerCase() !== pairAddress.toLowerCase()) {
          console.warn('[Swap] Router.pairFor difere do par da Factory; continuando mesmo assim.', { routerPair, pairAddress })
        }
      } catch (_) {
        // pairFor reverteu (ex.: Router exige par existente); não bloquear — getAmountsOut/swap validarão
        console.warn('[Swap] router.pairFor reverteu; seguindo com path da Factory.')
      }
    } catch (pairErr: any) {
      toast.dismiss('swap-pending')
      const msg = pairErr?.shortMessage || pairErr?.message || String(pairErr)
      console.error('[Swap] Erro ao verificar par/reservas:', pairErr)
      const userMsg = msg.length > 100 ? msg.slice(0, 100) + '...' : msg
      toast.error(userMsg || 'Failed to read pair or reserves. Check Factory and network.')
      return
    }

    // Quote via getAmountsOut (1% slippage default). Fallback para fórmula com reservas se Router falhar.
    let amountOut: bigint
    let amountOutMin: bigint
    try {
      const quote = await quoteSwap(
        publicClient,
        DEX_ROUTER_ADDRESS,
        amountIn,
        [path[0], path[1]],
        slippage
      )
      amountOut = quote.amountOut
      amountOutMin = quote.amountOutMin
      console.log('[Swap] quoteSwap:', { amountOut: amountOut.toString(), amountOutMin: amountOutMin.toString(), slippagePercent: slippage })
    } catch (quoteErr: any) {
      console.warn('[Swap] quoteSwap/getAmountsOut reverteu; usando cotação pelas reservas.', quoteErr)
      const amountInWithFee = amountIn * 997n
      const numerator = amountInWithFee * reserveOut
      const denominator = reserveIn * 1000n + amountInWithFee
      amountOut = numerator / denominator
      if (amountOut === 0n) {
        toast.dismiss('swap-pending')
        toast.error('Could not calculate output amount. Try a smaller amount.')
        return
      }
      // 1% slippage: amountOut * 99 / 100
      amountOutMin = (amountOut * 99n) / 100n
      console.log('[Swap] fallback formula:', { amountOut: amountOut.toString(), amountOutMin: amountOutMin.toString() })
    }

    try {

      // deadline = 20 min a partir do timestamp do bloco (mais confiável que Date.now em testnets com skew)
      let blockTimestamp: bigint
      try {
        const block = await publicClient.getBlock({ blockTag: 'latest' })
        blockTimestamp = block.timestamp
      } catch {
        blockTimestamp = BigInt(Math.floor(Date.now() / 1000))
      }
      const deadline = blockTimestamp + 1200n

      console.log('Preparando swap:', {
        deadline: deadline.toString(),
        blockTimestamp: blockTimestamp.toString(),
        amountIn: amountIn.toString(),
        amountOutMin: amountOutMin.toString(),
        path,
      })

      // Router.factory() já foi verificado (igual à config). Se pairFor retornar 0 mas a Factory tem o par, pode ser bug de view/RPC — seguimos para simulação e ela valida.
      let routerPair: `0x${string}` | null = null
      try {
        routerPair = (await publicClient.readContract({
          address: DEX_ROUTER_ADDRESS,
          abi: ARCDEX_ROUTER_ABI,
          functionName: 'pairFor',
          args: [path[0], path[1]],
        })) as `0x${string}`
      } catch (e) {
        console.warn('[Swap] router.pairFor reverteu:', e)
      }
      if (routerPair && routerPair !== ZERO && routerPair.toLowerCase() !== pairAddress.toLowerCase()) {
        toast.dismiss('swap-pending')
        const msg = 'Router sees a different pair than the Factory. The swap will revert. Redeploy the Router with Factory ' + CONFIG_FACTORY.slice(0, 10) + '... (docs/DEX_DEPLOYMENT.md).'
        setLastSimError(msg)
        setLastSimErrorDetail(`Router.pairFor = ${routerPair} | Factory.getPair par = ${pairAddress}`)
        toast.error(msg, { duration: 15000 })
        return
      }
      if (!routerPair || routerPair === ZERO) {
        console.warn('[Swap] router.pairFor retornou 0; router.factory() já bate com config e a Factory tem o par. Seguindo para simulação — ela validará se o swap é possível.')
      }

      // Simular ANTES de enviar: capturar revert reason e exibir no toast / Debug Panel
      setLastSimError(null)
      setLastSimErrorDetail(null)
      toast.loading('Simulating transaction...', { id: 'swap-pending' })
      
      // Verificar allowance antes da simulação
      let currentAllowanceCheck: bigint | null = null
      try {
        currentAllowanceCheck = (await publicClient.readContract({
          address: tokenFrom.address,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, DEX_ROUTER_ADDRESS],
        })) as bigint
        console.log('[Swap] Allowance verificado:', {
          allowance: currentAllowanceCheck.toString(),
          amountIn: amountIn.toString(),
          suficiente: currentAllowanceCheck >= amountIn,
        })
        if (currentAllowanceCheck < amountIn) {
          toast.dismiss('swap-pending')
          toast.error(`Insufficient allowance. Allowance: ${formatUnits(currentAllowanceCheck, tokenFrom.decimals)} ${tokenFrom.symbol}, required: ${amountFrom} ${tokenFrom.symbol}. Click "Approve ${tokenFrom.symbol}" first.`)
          return
        }
      } catch (allowanceErr: any) {
        console.warn('[Swap] Erro ao verificar allowance:', allowanceErr)
        toast.dismiss('swap-pending')
        toast.error('Error verifying approval. Try again.')
        return
      }
      
      // Log/Debug: chainId, router, path, amountIn, amountOut, minOut, deadline, allowance, reserves
      const debugPayload = {
        chainId: chainId ?? 0,
        router: DEX_ROUTER_ADDRESS,
        path: path.map((p) => String(p)),
        amountIn: amountIn.toString(),
        amountOut: amountOut.toString(),
        minOut: amountOutMin.toString(),
        deadline: deadline.toString(),
        allowance: currentAllowanceCheck?.toString() ?? 'N/A',
        reserve0: reservesForDebug.reserve0,
        reserve1: reservesForDebug.reserve1,
      }
      setLastSwapDebug({
        chainId: debugPayload.chainId,
        router: debugPayload.router,
        path: debugPayload.path,
        amountIn: debugPayload.amountIn,
        amountOut: debugPayload.amountOut,
        minOut: debugPayload.minOut,
        deadline: debugPayload.deadline,
        allowance: debugPayload.allowance,
        reserve0: debugPayload.reserve0,
        reserve1: debugPayload.reserve1,
      })
      console.log('[Swap] === DEBUG (quote/simulate) ===', debugPayload)
      
      let canProceedDespiteSimError = false
      try {
        await simulateSwap(
          publicClient,
          DEX_ROUTER_ADDRESS,
          address,
          amountIn,
          amountOutMin,
          [path[0], path[1]],
          deadline
        )
        console.log('[Swap] Simulação passou!')
      } catch (simErr: any) {
        toast.dismiss('swap-pending')

        // Erro completo: objeto inteiro para diagnóstico (F12)
        console.error('[Swap] === ERRO COMPLETO simulateContract ===')
        console.error('Objeto erro:', simErr)
        try {
          console.error('Erro JSON (keys):', Object.keys(simErr || {}))
          console.error('message:', simErr?.message)
          console.error('shortMessage:', simErr?.shortMessage)
          console.error('name:', simErr?.name)
          console.error('data:', simErr?.data)
          console.error('details:', simErr?.details)
        } catch { /* ignore */ }

        if (simErr?.cause) {
          console.error('ERRO simulateContract — cause:', simErr.cause)
          try {
            console.error('cause.data:', (simErr.cause as any)?.data)
            console.error('cause.message:', (simErr.cause as any)?.message)
          } catch { /* ignore */ }
        }

        // Detalhe bruto para mostrar na tela (não depende do F12)
        let errDetail = [
          simErr?.shortMessage || simErr?.message,
          simErr?.details ? `Detalhes: ${simErr.details}` : '',
          (simErr?.data || simErr?.cause?.data) ? `Data: ${String(simErr?.data || simErr?.cause?.data).slice(0, 66)}...` : '',
        ].filter(Boolean).join(' | ')

        // Tentar obter causa raiz usando walk() do viem
        let rootCause = simErr
        if (simErr?.walk) {
          try {
            rootCause = simErr.walk()
            const walkMsg = rootCause?.shortMessage || rootCause?.message
            if (walkMsg) errDetail = errDetail ? `${errDetail} | Causa: ${walkMsg}` : `Causa: ${walkMsg}`
          } catch {
            // Ignorar se walk() falhar
          }
        }
        console.error('Causa raiz (swap):', rootCause?.shortMessage || rootCause?.message || errDetail, rootCause)

        // Coletar data de erro da cadeia (Arc RPC pode aninhar em cause.cause, error.data, etc.)
        const getRevertData = (e: any): string | undefined => {
          if (!e) return undefined
          const sources = [
            e?.data,
            e?.cause?.data,
            (e?.cause as any)?.cause?.data,
            (e?.cause as any)?.error?.data,
            e?.error?.data,
            (e?.cause as any)?.value?.data,
            (e?.cause as any)?.response?.error?.data,
          ]
          for (const d of sources) {
            if (d && typeof d === 'string' && d.startsWith('0x') && d.length >= 10) return d
          }
          const msg = String(e?.message ?? e?.shortMessage ?? e?.cause?.message ?? '')
          const hexMatch = msg.match(/0x[a-fA-F0-9]{8,}/)
          if (hexMatch) return hexMatch[0]
          return undefined
        }
        let errorData = getRevertData(simErr) ?? getRevertData(rootCause) ?? getRevertData((rootCause as any)?.cause) ?? getRevertData((simErr?.cause as any)?.cause)
        // Fallback: se não temos payload, fazer eth_call explícito para capturar o revert data (alguns RPCs não devolvem no simulateContract)
        if (!errorData && publicClient && address && DEX_ROUTER_ADDRESS) {
          try {
            const calldata = encodeFunctionData({
              abi: ARCDEX_ROUTER_ABI,
              functionName: 'swapExactTokensForTokens',
              args: [amountIn, amountOutMin, path, address, deadline],
            })
            await publicClient.call({
              to: DEX_ROUTER_ADDRESS,
              data: calldata,
              account: address,
            })
          } catch (callErr: any) {
            const callData = getRevertData(callErr) ?? (callErr?.data ?? callErr?.cause?.data ?? (callErr?.cause as any)?.data)
            if (callData && typeof callData === 'string' && callData.startsWith('0x')) {
              errorData = callData
              console.log('[Swap] Revert data obtido via eth_call:', callData.slice(0, 74) + '...')
            }
          }
        }
        if (!errorData) {
          console.warn('[Swap] Revert sem data (simulação). Objeto de erro:', { simErrData: simErr?.data, causeData: simErr?.cause?.data, rootData: (rootCause as any)?.data })
          console.warn('[Swap] Estrutura completa do erro (para debug):', JSON.stringify({
            name: simErr?.name,
            message: simErr?.message,
            causeKeys: simErr?.cause ? Object.keys(simErr.cause) : [],
          }, null, 2))
        } else {
          console.log('[Swap] Raw revert data (hex):', errorData.slice(0, 10) + '...' + errorData.slice(-20))
        }
        let decodedError: string | null = null
        if (errorData && typeof errorData === 'string' && errorData.startsWith('0x')) {
          try {
            const decoded = decodeErrorResult({
              abi: ROUTER_ERROR_ABI,
              data: errorData as `0x${string}`,
            })
            if (decoded.errorName === 'Error' && decoded.args?.[0]) {
              decodedError = String(decoded.args[0])
            } else if (decoded.errorName === 'Panic' && decoded.args?.[0] !== undefined) {
              const code = Number(decoded.args[0])
              const panicMsg: Record<number, string> = {
                0x11: 'Overflow/underflow',
                0x12: 'Division by zero',
                0x21: 'Assert failed',
                0x31: 'Conversion overflow/underflow',
                0x32: 'Invalid enum conversion',
                0x41: 'Memory access out of bounds',
                0x51: 'Empty array',
              }
              decodedError = panicMsg[code] || `Panic(${code})`
            } else {
              decodedError = decoded.errorName || ((decoded as { args?: unknown[] }).args?.[0] ? String((decoded as { args?: unknown[] }).args![0]) : null)
            }
            console.error('[Swap] === REVERT REASON (contrato) ===', decodedError)
          } catch {
            // Ignorar se decodificação falhar
          }
        }
        // Detalhe técnico: incluir erro decodificado para o usuário ver na caixa vermelha
        const detailWithDecoded = decodedError
          ? `${decodedError}${errDetail ? ` | ${errDetail}` : ''}`
          : errDetail
        setLastSimErrorDetail(detailWithDecoded || null)

        // Mensagem para toast (prioridade: decodificado > causa raiz > erro original)
        let toastMsg = decodedError ||
                       rootCause?.shortMessage ||
                       rootCause?.message ||
                       simErr?.shortMessage ||
                       simErr?.message ||
                       'Simulation error'

        // Mensagens específicas por tipo de revert do contrato
        if (decodedError && /ArcDEX:\s*TRANSFER_FROM_FAILED|TRANSFER_FROM_FAILED|TRANSFER_FAILED/i.test(decodedError)) {
          toastMsg = 'Router on-chain without TransferHelper (old bytecode). Redeploy with docs/ArcDEXRouter_Remix.sol and update router in arcTestnet.ts.'
        } else if (decodedError && /ArcDEX:\s*PAIR_NOT_EXIST|PAIR_NOT_EXIST/i.test(decodedError)) {
          toastMsg = 'Pair not found in Factory. Router uses Factory.getPair(). Check if the pair exists in Pools.'
        } else if (decodedError && /ArcDEX:\s*INSUFFICIENT_OUTPUT_AMOUNT/i.test(decodedError)) {
          toastMsg = 'Slippage: minimum output not reached. Increase slippage tolerance or reduce amount and try again.'
        } else if (decodedError && /ArcDEX:\s*EXPIRED/i.test(decodedError)) {
          toastMsg = 'Deadline expired. Click Swap again.'
        }

        if (simErr?.details) {
          toastMsg += ` | Detalhes: ${simErr.details}`
        }
        const causeMsg = rootCause?.message || simErr?.cause?.message
        if (causeMsg && causeMsg !== toastMsg && !toastMsg.includes(causeMsg)) {
          toastMsg += ` | Causa: ${causeMsg}`
        }

        // Se ainda for apenas "reverted" genérico (e não decodificamos nada), diagnosticar sem assumir transferFrom
        if (toastMsg.toLowerCase().includes('reverted') && !toastMsg.match(/ArcDEX:|EXPIRED|INSUFFICIENT|TRANSFER|INVALID|Panic|Router on-chain|Slippage|Deadline|Redeploy|PAIR_NOT/i)) {
          try {
            const recheckAllowance = (await publicClient.readContract({
              address: tokenFrom.address,
              abi: ERC20_ABI,
              functionName: 'allowance',
              args: [address, DEX_ROUTER_ADDRESS],
            })) as bigint
            if (recheckAllowance < amountIn) {
              toastMsg = `Approve the token for this Router (${DEX_ROUTER_ADDRESS.slice(0, 8)}...). Click "Approve ${tokenFrom.symbol}" and try Swap again.`
            } else {
              // Allowance OK mas revert genérico: não assumir transferFrom; sugerir slippage e reservas
              try {
                await publicClient.readContract({
                  address: DEX_ROUTER_ADDRESS,
                  abi: ARCDEX_ROUTER_ABI,
                  functionName: 'getAmountsOut',
                  args: [amountIn, path],
                })
                // Arc Testnet: simulação falha sem razão decodificável mas getAmountsOut passa →
                // Verifica price impact antes de prosseguir — se amountIn > 40% das reservas, a tx vai falhar
                const impactPct = reserveIn > 0n
                  ? Number((amountIn * 10000n) / reserveIn) / 100
                  : 100
                if (impactPct > 40) {
                  toastMsg = `Price impact too high (${impactPct.toFixed(0)}% of available liquidity). Reduce the amount or add liquidity in the Pools tab.`
                } else {
                  console.warn('[Swap] Simulação inconclusiva (Arc Testnet) — price impact OK, prosseguindo.')
                  toast.loading('Enviando swap...', { id: 'swap-pending' })
                  canProceedDespiteSimError = true
                }
                refetchAllowance()
              } catch (getAmountsErr: any) {
                let decodedRouterMsg = ''
                const errData = getAmountsErr?.data || getAmountsErr?.cause?.data
                if (errData && typeof errData === 'string' && errData.startsWith('0x')) {
                  try {
                    const dec = decodeErrorResult({
                      abi: ROUTER_ERROR_ABI,
                      data: errData as `0x${string}`,
                    })
                    if (dec.errorName === 'Error' && dec.args?.[0]) {
                      decodedRouterMsg = String(dec.args[0])
                    } else if (dec.errorName === 'Panic' && dec.args?.[0] !== undefined) {
                      decodedRouterMsg = `Panic(${dec.args[0]}). Possible overflow or pair with no liquidity.`
                    }
                  } catch { /* ignorar */ }
                }
                if (decodedRouterMsg) {
                  toastMsg = `Router: ${decodedRouterMsg}`
                } else if (toastMsg.toLowerCase().includes('reverted') || toastMsg.length < 20) {
                  toastMsg = `Simulation failed (swap reverted). See "Technical detail" in the red box below. Possible causes: pair with no liquidity, high slippage, or insufficient approval.`
                }
              }
            }
          } catch {
            toastMsg = 'Transaction reverted. See technical detail in the red box below or use Tenderly/Remix to debug on-chain.'
          }
        }
        
        if (!canProceedDespiteSimError) {
          setLastSimError(toastMsg)
          toast.error(toastMsg, { duration: 12000 })
          return
        }
      }

      // Simulação passou: chamar a carteira para executar o swap
      setLastWriteType('swap')
      setLastSentSwapArgs({
        amountInRaw: amountIn.toString(),
        amountOutMinRaw: amountOutMin.toString(),
        path: path as string[],
        to: address,
        deadline: deadline.toString(),
      })
      toast.loading('Opening wallet to confirm swap...', { id: 'swap-pending' })
      let txHash: `0x${string}`
      try {
        txHash = await writeContract({
          address: DEX_ROUTER_ADDRESS,
          abi: ARCDEX_ROUTER_ABI,
          functionName: 'swapExactTokensForTokens',
          args: [amountIn, amountOutMin, path, address, deadline],
        })
      } catch (writeErr: any) {
        toast.dismiss('swap-pending')
        setLastWriteType(null)
        // Log no console para F12
        console.error('ERRO writeContract (swap):', writeErr?.shortMessage || writeErr?.message, writeErr)
        if (writeErr?.cause) {
          console.error('ERRO writeContract — cause:', writeErr.cause)
        }

        // Tentar obter causa raiz usando walk() do viem
        let rootCause = writeErr
        if (writeErr?.walk) {
          try {
            rootCause = writeErr.walk()
            console.error('Causa raiz (write swap):', rootCause?.shortMessage || rootCause?.message, rootCause)
          } catch {
            // Ignorar se walk() falhar
          }
        }
        
        // Construir mensagem para toast usando informações do erro (prioridade: causa raiz > erro original)
        let toastMsg = rootCause?.shortMessage || 
                       rootCause?.message || 
                       writeErr?.shortMessage || 
                       writeErr?.message || 
                       'Error sending transaction'
        
        // Adicionar detalhes se disponíveis
        if (writeErr?.details) {
          toastMsg += ` | Detalhes: ${writeErr.details}`
        }
        if (rootCause?.message && rootCause.message !== toastMsg) {
          toastMsg += ` | Causa: ${rootCause.message}`
        } else if (writeErr?.cause?.message && writeErr.cause.message !== toastMsg) {
          toastMsg += ` | Causa: ${writeErr.cause.message}`
        }
        
        // Se ainda for apenas "reverted" genérico, simular de novo para obter o motivo exato do contrato
        let decodedDetail = rootCause?.shortMessage || rootCause?.message || writeErr?.shortMessage || writeErr?.message || ''
        if (publicClient && toastMsg.toLowerCase().includes('reverted') && !toastMsg.match(/ArcDEX:|EXPIRED|INSUFFICIENT|TRANSFER|INVALID|Panic/i)) {
          try {
            await publicClient.simulateContract({
              address: DEX_ROUTER_ADDRESS,
              abi: ARCDEX_ROUTER_ABI,
              functionName: 'swapExactTokensForTokens',
              args: [amountIn, amountOutMin, path, address, deadline],
              account: address ?? undefined,
            })
          } catch (simErr: any) {
            const errData = simErr?.data ?? simErr?.cause?.data
            if (errData && typeof errData === 'string' && errData.startsWith('0x')) {
              try {
                const decoded = decodeErrorResult({
                  abi: ROUTER_ERROR_ABI,
                  data: errData as `0x${string}`,
                })
                let decodedMsg = ''
                if (decoded.errorName === 'Error' && decoded.args?.[0]) {
                  decodedMsg = String(decoded.args[0])
                } else if (decoded.errorName === 'Panic' && decoded.args?.[0] !== undefined) {
                  decodedMsg = `Panic(${decoded.args[0]}) — overflow ou par sem liquidez`
                } else {
                  decodedMsg = decoded.errorName || ''
                }
                if (decodedMsg) {
                  decodedDetail = decodedMsg
                  toastMsg = decodedMsg
                  if (/ArcDEX:\s*TRANSFER_FAILED|TRANSFER_FAILED/i.test(decodedMsg)) {
                    toastMsg = 'transferFrom failed (token not transferred to pair). Approve the token for THIS Router and try again.'
                    refetchAllowance()
                  } else if (/INSUFFICIENT_OUTPUT_AMOUNT|INSUFFICIENT_OUTPUT/i.test(decodedMsg)) {
                    toastMsg = 'Slippage: minimum output not reached. Increase slippage tolerance and try again.'
                  } else if (/EXPIRED/i.test(decodedMsg)) {
                    toastMsg = 'Deadline expired. Click Swap again.'
                  }
                }
              } catch { /* ignorar decodificação */ }
            }
          }
        }

        // Se ainda genérico, adicionar dicas
        if (toastMsg.toLowerCase().includes('reverted') && !toastMsg.match(/ArcDEX:|EXPIRED|INSUFFICIENT|TRANSFER|INVALID|Panic|Slippage|Deadline|Aprove|approve/i)) {
          toastMsg = `Transaction reverted. ${toastMsg.length < 60 ? toastMsg + ' — Check: 1) Token approved for current Router? 2) Slippage 3) Pool liquidity.' : toastMsg}`
        }

        setLastSimError(toastMsg)
        setLastSimErrorDetail(decodedDetail || '')
        toast.error(toastMsg, { duration: 12000 })
        return
      }

      console.log('SWAP_TX_HASH', txHash)
      toast.dismiss('swap-pending')
      toast.loading(`Transaction sent. Waiting for confirmation...`, { id: 'swap-confirming' })
      
      // Aguardar confirmação
      if (publicClient) {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({ 
            hash: txHash,
            timeout: 120_000, // 2 minutos
          })
          
          console.log('SWAP_RECEIPT', receipt)
          toast.dismiss('swap-confirming')
          
          if (receipt.status === 'success') {
            setLastSwapTxHash(txHash)
            const explorerUrl = `${ARCDEX.explorer}/tx/${txHash}`
            toast.success(
              () => (
                <span>
                  Swap confirmed on-chain!{' '}
                  <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                    View on {ARCDEX.explorerName}
                  </a>
                </span>
              ),
              { duration: 8000 }
            )
            console.log('Swap tx no explorer:', explorerUrl)
            // Limpar campos após sucesso
            setAmountFrom('')
            setAmountTo('')
            // Recarregar balance
            if (address && tokenFrom) {
              try {
                const newBalance = await publicClient.readContract({
                  address: tokenFrom.address,
                  abi: ERC20_ABI,
                  functionName: 'balanceOf',
                  args: [address],
                })
                setBalanceFrom(newBalance as bigint)
              } catch (balanceErr) {
                console.error('Error reloading balance:', balanceErr)
              }
            }
          } else {
            // Transação foi revertida - tentar obter erro real via simulação
            console.error('SWAP_ERROR_RAW - Transaction reverted', receipt)
            let revertReason = 'Transaction reverted on-chain'
            
            try {
              // Simular novamente para capturar o erro real
              const retryBlock = await publicClient.getBlock({ blockTag: 'latest' })
              const retryDeadline = BigInt(Number(retryBlock.timestamp) + 20 * 60)
              await publicClient.simulateContract({
                address: DEX_ROUTER_ADDRESS!,
                abi: ARCDEX_ROUTER_ABI,
                functionName: 'swapExactTokensForTokens',
                args: [amountIn, amountOutMin, path, address, retryDeadline],
                account: address,
              })
            } catch (simErr: any) {
              // Capturar mensagem REAL do erro usando helper
              const errorMsg = extractRevertReason(simErr)
              if (errorMsg) {
                revertReason = errorMsg
              }
            }

            const explorerUrl = `${ARCDEX.explorer}/tx/${txHash}`
            setLastSimError(`Swap reverted on-chain: ${revertReason}`)
            setLastSimErrorDetail(`Tx hash: ${txHash}. See reason on Explorer: ${explorerUrl}`)
            toast.error(`Swap failed: ${revertReason}. View details on Explorer.`, { duration: 12000 })
          }
        } catch (waitErr: any) {
          toast.dismiss('swap-confirming')
          console.error('SWAP_ERROR_RAW - Error waiting for receipt', waitErr)
          const errorMsg = extractRevertReason(waitErr) || 'Unknown error waiting for confirmation'
          toast.error(`Error waiting for confirmation: ${errorMsg}`)
        }
      }
    } catch (err: any) {
      toast.dismiss('swap-pending')
      toast.dismiss('swap-confirming')
      
      // Log completo do erro no formato solicitado
      console.log('ERRO handleSwap (catch geral):', err, err?.shortMessage, err?.details, err?.cause, err?.message)
      
      // Construir mensagem para toast usando informações do erro
      let toastMsg = err?.shortMessage || err?.message || 'Swap error'
      
      // Adicionar detalhes se disponíveis
      if (err?.details) {
        toastMsg += ` | Detalhes: ${err.details}`
      }
      if (err?.cause?.message) {
        toastMsg += ` | Causa: ${err.cause.message}`
      }
      
      // Detectar cancelamento do usuário
      if (toastMsg.includes('User rejected') || toastMsg.includes('User denied') || toastMsg.includes('rejected') || toastMsg.includes('denied') || err?.code === 4001) {
        toast.error('Transaction cancelled by user.')
        return
      }
      
      // Não mostrar apenas "reverted" genérico
      if (toastMsg.toLowerCase().includes('reverted') && toastMsg.length < 50) {
        toastMsg = `Error: ${toastMsg}. Check console (F12) for full details.`
      }
      
      toast.error(toastMsg, { duration: 10000 })
    }
  }

  const handleAmountFromChange = (value: string) => {
    // Permitir apenas números, ponto decimal e vírgula (para formato brasileiro)
    const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.')
    // Permitir apenas um ponto decimal
    const parts = cleaned.split('.')
    if (parts.length > 2) return
    // Limitar casas decimais ao número de decimals do token
    if (parts[1] && parts[1].length > tokenFrom.decimals) return
    setAmountFrom(cleaned)
  }

  const handleMax = () => {
    if (balanceFrom > 0n) {
      setAmountFrom(formatUnits(balanceFrom, tokenFrom.decimals))
    }
  }

  const handleSwitchTokens = () => {
    if (tokenTo) {
      const temp = tokenFrom
      setTokenFrom(tokenTo)
      setTokenTo(temp)
      const tempAmount = amountFrom
      setAmountFrom(amountTo)
      setAmountTo(tempAmount)
    }
  }

  // Feedback ao confirmar approve ou swap
  useEffect(() => {
    if (!isSuccess) return
    const type = lastWriteType
    setLastWriteType(null)
    toast.dismiss('approve-pending')

    if (type === 'approve') {
      refetchAllowance()
      toast.success('✅ Approval confirmed! Now click "2. Swap".')
    } else if (type === 'swap') {
      toast.success('✅ Swap executed successfully!')
      if (writeHash && tokenFrom && tokenTo) {
        notifyTxExecuted({
          title:  'Swap executed',
          amount: amountFrom,
          token:  `${tokenFrom.symbol} → ${tokenTo.symbol}`,
          txHash: writeHash,
        })
      }
      setAmountFrom('')
      setAmountTo('')
      if (address && publicClient && tokenFrom) {
        publicClient.readContract({
          address: tokenFrom.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }).then((balance) => {
          setBalanceFrom(balance as bigint)
        }).catch(console.error)
      }
    } else {
      toast.success('Transaction confirmed!')
      setAmountFrom('')
      setAmountTo('')
      if (address && publicClient && tokenFrom) {
        publicClient.readContract({
          address: tokenFrom.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }).then((balance) => {
          setBalanceFrom(balance as bigint)
        }).catch(console.error)
      }
    }
  }, [isSuccess, lastWriteType, refetchAllowance, address, publicClient, tokenFrom])

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-slate-500 mx-auto mb-4" />
        <p className="text-slate-400">Please connect your wallet to swap tokens</p>
      </div>
    )
  }

  const isLoading = isPending || isConfirming
  const minReceived = amountTo && tokenTo && parseFloat(amountTo) > 0
    ? (parseFloat(amountTo) * (1 - slippage / 100)).toFixed(6)
    : null
  // Botão Swap habilitado quando: rede correta, valores válidos, não está carregando
  const poolSemLiquidez = !!(debugData?.warning && /liquidity|pair.*not.*exist|exist.*pair/i.test(debugData.warning))

  // Price impact calculado via AMM formula (k = x*y) para evitar erro de arredondamento do amountTo display
  const priceImpact = (() => {
    if (!debugData?.reserve0 || !debugData?.reserve1 || !amountFrom || !tokenTo) return null
    try {
      const fromIsT0 = debugData.token0?.toLowerCase() === tokenFrom.address.toLowerCase()
      const resInRaw  = BigInt(fromIsT0 ? debugData.reserve0 : debugData.reserve1)
      const resOutRaw = BigInt(fromIsT0 ? debugData.reserve1 : debugData.reserve0)
      if (resInRaw === 0n || resOutRaw === 0n) return null
      const aIn = parseUnits(amountFrom.replace(',', '.'), tokenFrom.decimals)
      if (aIn <= 0n) return null
      // AMM amountOut com fee 0.3%
      const aInWithFee = aIn * 997n
      const actualOut = (aInWithFee * resOutRaw) / (resInRaw * 1000n + aInWithFee)
      // Fair price (sem impact): proporcional às reservas
      const fairOut = (aIn * resOutRaw) / resInRaw
      if (fairOut === 0n) return null
      return Math.max(0, Number((fairOut - actualOut) * 10000n / fairOut) / 100)
    } catch { return null }
  })()
  const excessivePriceImpact = priceImpact !== null && priceImpact > 50
  // USDC só é bloqueado quando o Router configurado confirma que não suporta tokens precompile.
  const usdcInvolved = tokenFrom.address.toLowerCase() === USDC_NATIVE_ADDRESS ||
                       (tokenTo?.address.toLowerCase() === USDC_NATIVE_ADDRESS)
  const usdcBlockedByRouter = usdcInvolved && routerSupportsPrecompile === false

  const canSwap = !isWrongChain && !poolSemLiquidez && !excessivePriceImpact && !usdcBlockedByRouter && amountFrom && amountTo && parseFloat(amountFrom) > 0 && parseFloat(amountTo) > 0 && !isLoading

  const showLinkFaucet = Boolean(address) && (
    (tokenFrom.symbol === 'LINK' && balanceFrom < 1_000_000_000_000_000_000n) ||
    (tokenTo?.symbol === 'LINK' && balanceTo < 1_000_000_000_000_000_000n)
  )
  const isApproveLoading = (isPending || isConfirming) && lastWriteType === 'approve'
  const isSwapLoading = (isPending || isConfirming) && lastWriteType === 'swap'

  return (
    <div className="space-y-4">
      {/* Rede errada: aviso + modal de troca/adicionar rede */}
      {isWrongChain && (
        <>
          <NetworkSwitchModal
            isOpen={showNetworkModal}
            onClose={() => setShowNetworkModal(false)}
          />
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-xs text-red-200/90">
              <span className="font-medium">Wrong network.</span>
              {' '}Connect to <strong>Arc Mainnet</strong> (Chain ID 5042) to use Swap.
            </div>
            <button
              type="button"
              onClick={() => setShowNetworkModal(true)}
              className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
            >
              Switch network
            </button>
          </div>
        </>
      )}

      {/* Pool sem liquidez: bloquear swap */}
      {!isWrongChain && poolSemLiquidez && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90">
            <span className="font-medium">Pool with no liquidity.</span>
            {' '}Add liquidity in the Pools tab and try again.
          </div>
        </div>
      )}

      {/* Router antigo: swap vai reverter — bloquear uso até atualizar config */}
      {!isWrongChain && routerSupportsPrecompile === false && usdcInvolved && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/15 p-4 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-200 text-sm">Router on legacy version</p>
              <p className="text-xs text-amber-200/90 mt-1">
                The contract at the configured address returned <code className="bg-slate-800 px-1 rounded">supportsPrecompileTokens() = false</code>. Swap with USDC (precompile) may revert.
              </p>
              <p className="text-xs text-slate-300 mt-1 font-mono break-all">
                Router in use: <span className="text-cyan-300">{DEX_ROUTER_ADDRESS}</span>
              </p>
              <p className="text-xs text-amber-200/90 mt-2">
                If this is the address you deployed with <code className="bg-slate-800 px-1 rounded">docs/ArcDEXRouter_Remix.sol</code>, check in Remix (&quot;Read&quot; tab) or on the block explorer: the contract at this address must have <code className="bg-slate-800 px-1 rounded">supportsPrecompileTokens()</code> and return <strong>true</strong>. If it does not exist or returns false, the deploy used the old contract version — do a new deploy with the complete Remix file.
              </p>
              <p className="text-xs text-amber-200/90 mt-2 font-medium">What to do:</p>
              <ol className="text-xs text-amber-200/90 list-decimal list-inside mt-1 space-y-1">
                <li>Deploy Router with <code className="bg-slate-800 px-1 rounded">docs/ArcDEXRouter_Remix.sol</code> in Remix (Factory: <code className="bg-slate-800 px-1 rounded">{CONFIG_FACTORY}</code>).</li>
                <li>Update <code className="bg-slate-800 px-1 rounded">src/config/arcTestnet.ts</code> → <code className="bg-slate-800 px-1 rounded">addresses.router</code> with the new contract address.</li>
                <li>Reload the page and approve USDC for the new Router; then try the swap.</li>
              </ol>
              <p className="text-xs text-slate-400 mt-2">Details: <code className="bg-slate-800 px-1 rounded">docs/O_QUE_ESTAVA_FALTANDO_SWAP.md</code></p>
            </div>
          </div>
        </div>
      )}

      {/* Swap Card */}
      <div className="rounded-3xl border border-slate-700/40 bg-slate-800/20 p-5 shadow-lg shadow-black/20">
        <div className="flex items-center justify-end mb-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((o) => !o)}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
            {settingsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSettingsOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 top-full mt-1 z-50 w-[calc(100vw-2rem)] max-w-[240px] min-w-[200px] rounded-xl border border-slate-600/60 bg-slate-900/95 backdrop-blur-xl p-4 shadow-xl">
                  <div className="text-xs text-slate-400 mb-2">Slippage tolerance</div>
                  <div className="flex items-center gap-2 mb-2">
                    {[1, 2, 5, 10].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setSlippage(v)}
                        className={`rounded-lg px-2 py-1.5 min-h-[36px] text-xs font-medium transition-colors ${slippage === v ? 'bg-cyan-500 text-black' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                      >
                        {v}%
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={slippage}
                      onChange={(e) => setSlippage(Math.min(10, Math.max(0, parseFloat(e.target.value) || 0)))}
                      min="0"
                      max="10"
                      step="0.1"
                      className="w-20 bg-slate-800/60 border border-slate-600/60 rounded-lg px-3 py-2 text-base sm:text-sm text-white text-right focus:outline-none focus:border-cyan-500/50 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                    />
                    <span className="text-slate-400 text-sm">% (max 10%)</span>
                  </div>
                  {minReceived != null && tokenTo && (
                    <div className="text-xs text-cyan-400/90 mt-2 font-mono">Minimum received: {minReceived} {tokenTo.symbol}</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Token From */}
        <div className="rounded-2xl border border-slate-700/40 bg-slate-800/30 p-4 mb-2">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-slate-400">From</label>
            <button onClick={handleMax} className="text-xs text-cyan-400/90 hover:text-cyan-300 transition-colors">
              Balance: {formatMoney(formatUnits(balanceFrom, tokenFrom.decimals), 4)}
            </button>
          </div>
          <div className="flex items-center gap-4">
            <TokenSelectButton
              tokens={[...SWAP_TOKEN_OPTIONS]}
              selected={tokenFrom ? { address: tokenFrom.address, symbol: tokenFrom.symbol, name: ARC_MAINNET_TOKENS.find((t) => t.address === tokenFrom.address)?.name ?? tokenFrom.symbol, decimals: tokenFrom.decimals } : null}
              onSelect={(t) => setTokenFrom({ address: t.address, symbol: t.symbol, decimals: t.decimals })}
              excludedAddress={tokenTo?.address}
              accountAddress={address}
              showBalance
              className="shrink-0"
            />
            <input
              type="text"
              inputMode="decimal"
              value={amountFrom}
              onChange={(e) => handleAmountFromChange(e.target.value)}
              placeholder="0.0"
              className="flex-1 min-w-0 bg-transparent border-none text-right text-2xl font-semibold text-white placeholder-slate-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>

        {/* Switch Button */}
        <div className="flex justify-center -my-1">
          <motion.button
            onClick={handleSwitchTokens}
            disabled={!tokenTo}
            whileTap={{ rotate: 180 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="rounded-full bg-slate-800/80 border border-slate-600/50 p-3 hover:bg-slate-700/80 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.12)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 z-10 relative"
          >
            <ArrowDownUp className="h-5 w-5 text-cyan-400" />
          </motion.button>
        </div>

        {/* Token To */}
        <div className="rounded-2xl border border-slate-700/40 bg-slate-800/30 p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-slate-400">To</label>
            {tokenTo && (
              <span className="text-xs text-cyan-400/90">
                Balance: {formatMoney(formatUnits(balanceTo, tokenTo.decimals), 4)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <TokenSelectButton
              tokens={[...SWAP_TOKEN_OPTIONS]}
              selected={tokenTo ? { address: tokenTo.address, symbol: tokenTo.symbol, name: ARC_MAINNET_TOKENS.find((t) => t.address === tokenTo.address)?.name ?? tokenTo.symbol, decimals: tokenTo.decimals } : null}
              onSelect={(t) => setTokenTo({ address: t.address, symbol: t.symbol, decimals: t.decimals })}
              excludedAddress={tokenFrom.address}
              accountAddress={address}
              showBalance
              placeholder="Select"
              className="shrink-0"
            />
            <div className="flex-1 min-w-0 text-right">
              {isCalculating ? (
                <Loader2 className="h-6 w-6 text-slate-500 animate-spin inline-block" />
              ) : (
                <input
                  type="text"
                  value={amountTo}
                  readOnly
                  placeholder="0.0"
                  className="w-full bg-transparent border-none text-right text-2xl font-semibold text-white placeholder-slate-500 focus:outline-none"
                />
              )}
            </div>
          </div>
        </div>

      <LinkFaucetBanner show={showLinkFaucet} address={address} />

      {/* Liquidez disponível */}
      {tokenTo && debugData?.pairAddress && debugData.pairAddress !== '0x0000000000000000000000000000000000000000' && (
        (() => {
          const fromIsToken0 = debugData.token0?.toLowerCase() === tokenFrom.address.toLowerCase()
          const r0 = BigInt(debugData.reserve0 || '0')
          const r1 = BigInt(debugData.reserve1 || '0')
          const reserveFrom = fromIsToken0 ? r0 : r1
          const reserveTo   = fromIsToken0 ? r1 : r0
          const noLiquidity = r0 === 0n || r1 === 0n
          const fmtFrom = formatMoney(parseFloat(formatUnits(reserveFrom, tokenFrom.decimals)), 4)
          const fmtTo   = formatMoney(parseFloat(formatUnits(reserveTo,   tokenTo.decimals)),   4)
          return (
            <div className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${noLiquidity ? 'border border-red-500/30 bg-red-500/10 text-red-300' : 'border border-slate-700/40 bg-slate-800/20 text-slate-400'}`}>
              <span className="shrink-0">{noLiquidity ? '⚠️' : '💧'}</span>
              {noLiquidity
                ? <span>No liquidity for this pair. Add liquidity in the <strong className="text-white">Pools</strong> tab first.</span>
                : <>
                    <span>Liquidity: <strong className="text-slate-200">{fmtFrom} {tokenFrom.symbol}</strong> / <strong className="text-slate-200">{fmtTo} {tokenTo.symbol}</strong></span>
                    {priceImpact !== null && priceImpact > 2 && (
                      <span className={`ml-2 font-semibold ${priceImpact > 50 ? 'text-red-400' : priceImpact > 15 ? 'text-orange-400' : 'text-yellow-400'}`}>
                        · Impact: {priceImpact.toFixed(1)}%{priceImpact > 50 ? ' — reduce the amount' : priceImpact > 15 ? ' (high)' : ''}
                      </span>
                    )}
                  </>
              }
            </div>
          )
        })()
      )}

      {/* Aviso USDC envolvido no swap */}
      {usdcBlockedByRouter && (
        <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-orange-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-orange-200/90 space-y-1">
            <p className="font-medium text-orange-200">USDC is not compatible with swap on this Router</p>
            <p>USDC is the native gas token of Arc Network (precompile). The current Router does not support swaps involving USDC — neither as input nor as output.</p>
            <p>💡 <strong>Pairs that work:</strong> <strong>FAJU ↔ EURC</strong>, <strong>FAJU ↔ ARCX</strong>, <strong>EURC ↔ ARCX</strong>.</p>
          </div>
        </div>
      )}

      {/* Swap Button */}
      {isWrongChain ? (
        <motion.button
          type="button"
          onClick={() => setShowNetworkModal(true)}
          className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white py-4 px-6 font-semibold text-lg hover:shadow-[0_0_24px_rgba(34,211,238,0.3)] transition-all duration-300"
        >
          Connect to Arc Mainnet
        </motion.button>
      ) : (
        <motion.button
          type="button"
          onClick={handleSwap}
          disabled={!canSwap || isLoading}
          className={`w-full rounded-2xl py-4 px-6 font-semibold text-lg flex items-center justify-center gap-2 transition-all duration-300
            ${!canSwap || isLoading
              ? 'bg-slate-700/60 text-slate-500 cursor-not-allowed opacity-60'
              : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-[0_0_24px_rgba(34,211,238,0.35)] hover:from-cyan-400 hover:to-blue-400'
            }`}
          title={routerSupportsPrecompile === false ? 'Update Router in config' : !canSwap ? 'Enter amount' : needsApproval ? 'Approve and swap' : 'Swap'}
        >
          {(isSwapLoading || isApproveLoading) ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{isPending ? 'Waiting for signature...' : isApproveLoading ? 'Confirming approval...' : 'Executing swap...'}</span>
            </>
          ) : (
            <span>{needsApproval ? `Approve and Swap (${tokenFrom.symbol})` : 'Swap'}</span>
          )}
        </motion.button>
      )}
      </div>

      {!needsApproval && amountFrom && parseFloat(amountFrom) > 0 && currentAllowance !== undefined && currentAllowance >= (amountInForApproval ?? 0n) && (
        <div className="text-xs text-emerald-400/90 flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
          Token approved. Click Swap to exchange.
        </div>
      )}

      {/* Swap error — não mostrar se pool sem liquidez (já tem aviso próprio) */}
      {lastSimError && !poolSemLiquidez && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
          <div className="flex items-center gap-2 text-red-400 font-medium mb-1">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            Swap failed
          </div>
          <div className="text-red-200/90 break-words text-xs">{lastSimError}</div>
          {lastSimError && /Aprove o token|Clique em.*Approve|allowance.*Router|approve para este Router/i.test(lastSimError) && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={!address || !DEX_ROUTER_ADDRESS || !tokenFrom || isLoading}
              className="mt-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2"
            >
              Approve {tokenFrom?.symbol ?? 'token'}
            </button>
          )}
        </div>
      )}

      {/* Last transaction — minimal line */}
      {lastSwapTxHash && (
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span>Last swap:</span>
          <a
            href={`${ARCDEX.explorer}/tx/${lastSwapTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            {lastSwapTxHash.slice(0, 10)}...{lastSwapTxHash.slice(-8)}
          </a>
        </div>
      )}

      {/* Success Indicator */}
      {isSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-green-400 text-sm"
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>Transaction confirmed.</span>
        </motion.div>
      )}
    </div>
  )
}
