import { createPublicClient, http, type Address, getAddress, type PublicClient, formatUnits } from 'viem'
import { ARCDEX } from '@/config/arcDex'
import { USDC_ADDRESS, EURC_ALTERNATIVE } from '@/config/tokens'
import ArcDEXPairAbi from '@/abis/ArcDEXPair.min.json'
import { makeV2Token, buildPair, pairReservesExact } from '@/lib/v2Sdk'

// Factory ABI — only getPair (production Factory does not implement allPairsLength/allPairs)
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

const RPC_URL = 'https://rpc.mainnet.arc.io'

// Fallback client se não houver um passado
const fallbackClient = createPublicClient({
  transport: http(RPC_URL),
})

// ABI ERC20 padrão para buscar metadata (symbol, decimals, name)
const ERC20_METADATA_ABI = [
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

export interface TokenMetadata {
  address: Address
  symbol: string
  decimals: number
  name?: string
}

export interface PairState {
  pairAddress: Address
  token0: TokenMetadata
  token1: TokenMetadata
  reserve0: string // Raw (wei)
  reserve1: string // Raw (wei)
  reserve0Formatted: string // Human readable
  reserve1Formatted: string // Human readable
  timestamp: number
  totalSupply: string // Raw (wei)
  totalSupplyFormatted: string // Human readable
  lpDecimals: number // decimals do token LP (pair pode ser 18 ou, em pares antigos, 6/0)
}

export interface UserPoolPosition {
  pairAddress: Address
  token0: TokenMetadata
  token1: TokenMetadata
  lpBalance: string // Raw (wei)
  lpBalanceFormatted: string // Human readable
  token0Amount: string // Raw
  token0AmountFormatted: string // Human readable
  token1Amount: string // Raw
  token1AmountFormatted: string // Human readable
  totalSupply: string // Raw
  totalSupplyFormatted: string // Human readable
  reserve0: string // Raw
  reserve1: string // Raw
}

/**
 * Busca metadata de um token ERC20 com fallback seguro
 */
async function fetchTokenMetadata(
  tokenAddress: Address,
  publicClient: PublicClient
): Promise<TokenMetadata> {
  // Sanity check: token não pode ser zero address
  if (tokenAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Invalid token address: ${tokenAddress}. Pair may not be initialized.`)
  }

  // Na Arc, 0x3600... é o USDC oficial (precompile ERC-20); pode não expor symbol()/decimals() → usar fallback
  const isArcUsdcPrecompile = tokenAddress.toLowerCase() === USDC_ADDRESS.toLowerCase()
  const lower = tokenAddress.toLowerCase()
  const isFaju = lower === ARCDEX.faju.toLowerCase()
  const isArcx = lower === ARCDEX.arcx.toLowerCase()
  const isEurc = lower === ARCDEX.eurc.toLowerCase()

  let symbol: string
  let decimals: number
  let name: string | undefined

  try {
    // Tentar buscar symbol do contrato (precompile USDC na Arc pode falhar → fallback)
    try {
      symbol = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_METADATA_ABI,
        functionName: 'symbol',
      })) as string
    } catch (err) {
      if (isArcUsdcPrecompile) symbol = 'USDC'
      else if (isEurc) symbol = 'EURC'
      else if (isFaju) symbol = 'FAJU'
      else if (isArcx) symbol = 'ARCX'
      else symbol = `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`
      console.warn(`[arcDexRead] Failed to fetch symbol for ${tokenAddress}, using fallback:`, symbol)
    }

    // Tentar buscar decimals do contrato
    try {
      decimals = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_METADATA_ABI,
        functionName: 'decimals',
      })) as number
    } catch (err) {
      if (isArcUsdcPrecompile) decimals = 6
      else if (isEurc) decimals = ARCDEX.decimals.EURC
      else if (isFaju) decimals = ARCDEX.decimals.FAJU
      else if (isArcx) decimals = ARCDEX.decimals.ARCX
      else decimals = 18
      console.warn(`[arcDexRead] Failed to fetch decimals for ${tokenAddress}, using fallback:`, decimals)
    }

    // Tentar buscar name (opcional)
    try {
      name = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_METADATA_ABI,
        functionName: 'name',
      })) as string
    } catch (err) {
      // Ignorar erro de name, é opcional
      name = undefined
    }
  } catch (err: any) {
    throw new Error(`Failed to fetch token metadata for ${tokenAddress}: ${err.message}`)
  }

  return {
    address: tokenAddress,
    symbol,
    decimals,
    name,
  }
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

/**
 * Reads pair address from env (VITE_DEX_PAIR_ADDRESS) with trim. Returns null if empty/invalid.
 */
function getEnvPairAddress(): Address | null {
  const val = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_DEX_PAIR_ADDRESS
  const raw = String(val ?? '').trim()
  if (!raw || raw.length !== 42 || !raw.startsWith('0x')) return null
  return raw as Address
}

/**
 * Busca o endereço do Pair via Factory.getPair(tokenA, tokenB)
 */
export async function getPairAddress(
  tokenA: Address,
  tokenB: Address,
  client?: PublicClient
): Promise<Address | null> {
  const publicClient = client || fallbackClient

  try {
    const pairAddress = (await publicClient.readContract({
      address: ARCDEX.factory,
      abi: FACTORY_ABI,
      functionName: 'getPair',
      args: [tokenA, tokenB],
    })) as Address

    if (!pairAddress || pairAddress === ZERO_ADDRESS) return null
    return pairAddress
  } catch (error: any) {
    console.error('[arcDexRead] Error getting pair address:', error)
    return null
  }
}

/**
 * Busca o par USDC/EURC tentando EURC da config e depois EURC alternativo (para Pools/Swap consistentes)
 */
export async function getPairAddressUsdcEurc(client?: PublicClient): Promise<Address | null> {
  const publicClient = client || fallbackClient
  const pair = await getPairAddress(ARCDEX.usdc, ARCDEX.eurc, publicClient)
  if (pair) return pair
  return getPairAddress(ARCDEX.usdc, EURC_ALTERNATIVE, publicClient)
}

export async function readPairState(
  pairAddress?: Address,
  client?: PublicClient
): Promise<PairState> {
  const publicClient = client || fallbackClient
  
  let actualPairAddress: Address
  if (!pairAddress) {
    const foundPair = await getPairAddressUsdcEurc(publicClient)
    if (!foundPair) {
      throw new Error(
        `Pair does not exist. Create the pair in Factory: factory.createPair(${ARCDEX.usdc}, ${ARCDEX.eurc}) or add liquidity to existing pair.`
      )
    }
    actualPairAddress = foundPair
  } else {
    actualPairAddress = pairAddress
  }
  
  try {
    // SANITY CHECK: Log pair address
    console.log('[arcDexRead] Reading pair state from:', actualPairAddress)

    // Ler token0, token1, reserves, totalSupply e decimals do LP
    const [token0Raw, token1Raw, reservesResult, totalSupplyResult, lpDecimalsResult] = await Promise.all([
      publicClient.readContract({
        address: actualPairAddress,
        abi: ArcDEXPairAbi,
        functionName: 'token0',
      }),
      publicClient.readContract({
        address: actualPairAddress,
        abi: ArcDEXPairAbi,
        functionName: 'token1',
      }),
      publicClient.readContract({
        address: actualPairAddress,
        abi: ArcDEXPairAbi,
        functionName: 'getReserves',
      }),
      publicClient.readContract({
        address: actualPairAddress,
        abi: ArcDEXPairAbi,
        functionName: 'totalSupply',
      }),
      publicClient.readContract({
        address: actualPairAddress,
        abi: ArcDEXPairAbi,
        functionName: 'decimals',
      }).catch(() => null as number | null),
    ])

    // Normalizar e validar endereços
    let token0Address: Address
    let token1Address: Address
    
    try {
      const token0Str = String(token0Raw).toLowerCase()
      const token1Str = String(token1Raw).toLowerCase()
      
      // SANITY CHECK: Log valores brutos
      console.log('[arcDexRead] Raw token0 from contract:', token0Raw, 'as string:', token0Str)
      console.log('[arcDexRead] Raw token1 from contract:', token1Raw, 'as string:', token1Str)
      
      // Validar formato
      if (!token0Str.startsWith('0x') || token0Str.length !== 42) {
        throw new Error(`Invalid token0 format: ${token0Str}`)
      }
      if (!token1Str.startsWith('0x') || token1Str.length !== 42) {
        throw new Error(`Invalid token1 format: ${token1Str}`)
      }
      
      // Normalizar com getAddress
      token0Address = getAddress(token0Str as Address)
      token1Address = getAddress(token1Str as Address)
      
      // SANITY CHECK: Validar que não são zero address ou placeholder
      if (token0Address === '0x0000000000000000000000000000000000000000') {
        throw new Error('token0 is zero address - Pair may not be initialized')
      }
      if (token1Address === '0x0000000000000000000000000000000000000000') {
        throw new Error('token1 is zero address - Pair may not be initialized')
      }
      
      console.log('[arcDexRead] Normalized token0:', token0Address)
      console.log('[arcDexRead] Normalized token1:', token1Address)
    } catch (addrError: any) {
      throw new Error(`Failed to parse token addresses: ${addrError.message}. token0Raw: ${token0Raw}, token1Raw: ${token1Raw}`)
    }

    // Buscar metadata de AMBOS os tokens em paralelo
    const [token0Metadata, token1Metadata] = await Promise.all([
      fetchTokenMetadata(token0Address, publicClient),
      fetchTokenMetadata(token1Address, publicClient),
    ])

    // SANITY CHECK: Log metadata
    console.log('[arcDexRead] Token0 metadata:', {
      address: token0Metadata.address,
      symbol: token0Metadata.symbol,
      decimals: token0Metadata.decimals,
      name: token0Metadata.name,
    })
    console.log('[arcDexRead] Token1 metadata:', {
      address: token1Metadata.address,
      symbol: token1Metadata.symbol,
      decimals: token1Metadata.decimals,
      name: token1Metadata.name,
    })

    // Processar reserves (Pair Arc retorna 2 valores: reserve0, reserve1)
    const reserves = reservesResult as readonly [bigint, bigint] | readonly [bigint, bigint, number]
    const [reserve0Raw, reserve1Raw] = reserves
    const timestamp = reserves.length >= 3 ? (reserves as readonly [bigint, bigint, number])[2] : 0

    // SANITY CHECK: Log reserves raw
    console.log('[arcDexRead] Reserves raw:', {
      reserve0: reserve0Raw.toString(),
      reserve1: reserve1Raw.toString(),
      timestamp,
    })

    // Processar totalSupply e decimals do LP
    const totalSupplyRaw = totalSupplyResult as bigint
    let lpDecimals = typeof lpDecimalsResult === 'number' ? lpDecimalsResult : 18
    if (lpDecimalsResult == null || lpDecimalsResult === undefined) {
      const totalNum = Number(totalSupplyRaw)
      if (totalNum > 0 && totalNum < 1e12) lpDecimals = 0
      else if (totalNum >= 1e12 && totalNum < 1e18) lpDecimals = 6
      else lpDecimals = 18
    }

    // Formatar valores humanos — reserves via @uniswap/v2-sdk Pair (decimal-exact, sem perda de
    // precisão por float); totalSupply via formatUnits (mesma garantia, sem depender do Pair)
    const sdkToken0 = makeV2Token(ARCDEX.chainId, token0Metadata.address, token0Metadata.decimals, token0Metadata.symbol)
    const sdkToken1 = makeV2Token(ARCDEX.chainId, token1Metadata.address, token1Metadata.decimals, token1Metadata.symbol)
    const pair = buildPair(sdkToken0, sdkToken1, reserve0Raw, reserve1Raw)
    const { reserve0: reserve0Formatted, reserve1: reserve1Formatted } = pairReservesExact(pair)
    const totalSupplyFormatted = formatUnits(totalSupplyRaw, lpDecimals)

    console.log('[arcDexRead] LP decimals:', lpDecimals, 'totalSupplyFormatted:', totalSupplyFormatted)

    return {
      pairAddress: actualPairAddress,
      token0: token0Metadata,
      token1: token1Metadata,
      reserve0: reserve0Raw.toString(),
      reserve1: reserve1Raw.toString(),
      reserve0Formatted,
      reserve1Formatted,
      timestamp,
      totalSupply: totalSupplyRaw.toString(),
      totalSupplyFormatted,
      lpDecimals,
    }
  } catch (error: any) {
    const errorMessage = error?.message || error?.shortMessage || String(error)
    
    console.error('[arcDexRead] Error reading pair state:', error)
    
    if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
      throw new Error(`Pair contract not found at ${actualPairAddress}. Make sure the pair is deployed.`)
    }
    
    if (errorMessage.includes('placeholder') || errorMessage.includes('Invalid token')) {
      throw new Error(
        `Error reading token from Pair. Check that the Pair was created with correct addresses: ` +
        `USDC ${ARCDEX.usdc}, EURC ${ARCDEX.eurc}.`
      )
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      throw new Error(`Network error: Could not connect to ${RPC_URL}. Check your internet connection.`)
    }
    
    if (errorMessage.includes('revert') || errorMessage.includes('execution reverted')) {
      throw new Error(`Contract call reverted. The pair may not be initialized or may have insufficient liquidity.`)
    }
    
    throw new Error(`Failed to read pair state: ${errorMessage}`)
  }
}

// ABI para LP token balanceOf
const LP_TOKEN_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

/**
 * Busca todos os pairs conhecidos via factory.getPair (FAJU/USDC, ARCX/USDC, FAJU/EURC, ARCX/EURC)
 * e fallbacks (USDC/EURC, env, config).
 */
async function getKnownPairAddresses(publicClient: PublicClient): Promise<Address[]> {
  const addresses: Address[] = []
  const seen = new Set<string>()

  const addIfNew = (addr: Address | null) => {
    if (addr && addr !== ZERO_ADDRESS) {
      const key = addr.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        addresses.push(addr)
      }
    }
  }

  // Discover configured pairs (FAJU/USDC, ARCX/USDC, FAJU/EURC, ARCX/EURC)
  if (ARCDEX.pairsToDiscover) {
    for (const [tokenA, tokenB] of ARCDEX.pairsToDiscover) {
      try {
        const pairAddr = await getPairAddress(tokenA, tokenB, publicClient)
        addIfNew(pairAddr)
      } catch {
        continue
      }
    }
  }

  // Fallback: USDC/EURC
  try {
    const pairUsdcEurc = await getPairAddressUsdcEurc(publicClient)
    addIfNew(pairUsdcEurc)
  } catch {
    // ignore
  }

  const envPair = getEnvPairAddress()
  addIfNew(envPair)

  if (ARCDEX.pair && ARCDEX.pair !== ZERO_ADDRESS) {
    addIfNew(ARCDEX.pair)
  }

  return addresses
}

/**
 * Busca todos os pairs onde o usuário tem LP tokens.
 * Usa factory.getPair(USDC, EURC) em vez de allPairsLength (Factory pode não implementar).
 */
export async function getUserPools(
  userAddress: Address,
  client?: PublicClient
): Promise<UserPoolPosition[]> {
  const publicClient = client || fallbackClient

  try {
    const normalizedUserAddress = getAddress(userAddress)
    console.log(`[getUserPools] Normalized user address: ${normalizedUserAddress}`)

    const pairAddresses = await getKnownPairAddresses(publicClient)
    if (pairAddresses.length === 0) {
      console.log('[getUserPools] No pairs found (getPair returned zero, no env fallback)')
      return []
    }

    console.log(`[getUserPools] Checking ${pairAddresses.length} pair(s) for LP balance`)

    // Para cada pair, verificar se o usuário tem LP tokens
    const userPools: UserPoolPosition[] = []

    console.log(`[getUserPools] Checking LP balance for user: ${normalizedUserAddress}`)

    for (const pairAddress of pairAddresses) {
      try {
        console.log(`[getUserPools] Checking pair: ${pairAddress}`)
        
        // Verificar balanceOf LP token do usuário
        const lpBalance = (await publicClient.readContract({
          address: pairAddress,
          abi: LP_TOKEN_ABI,
          functionName: 'balanceOf',
          args: [normalizedUserAddress],
        })) as bigint

        console.log(`[getUserPools] LP balance for ${pairAddress}: ${lpBalance.toString()} (raw)`)

        // Se o usuário não tem LP tokens, pular
        if (lpBalance === 0n) {
          console.log(`[getUserPools] Skipping pair ${pairAddress} - user has 0 LP tokens`)
          continue
        }

        // Buscar estado completo do pair
        const pairState = await readPairState(pairAddress, publicClient)

        console.log(`[getUserPools] Pair state for ${pairAddress}:`, {
          totalSupply: pairState.totalSupply,
          reserve0: pairState.reserve0,
          reserve1: pairState.reserve1,
          token0: pairState.token0.symbol,
          token1: pairState.token1.symbol,
        })

        // Calcular quantidades de token0 e token1 que o usuário possui
        const totalSupplyBigInt = BigInt(pairState.totalSupply)
        const lpBalanceBigInt = lpBalance

        console.log(`[getUserPools] Calculations:`, {
          lpBalanceRaw: lpBalanceBigInt.toString(),
          totalSupplyRaw: totalSupplyBigInt.toString(),
        })

        // Proporção do usuário no pool
        const userShare = totalSupplyBigInt > 0n 
          ? Number(lpBalanceBigInt) / Number(totalSupplyBigInt)
          : 0

        console.log(`[getUserPools] User share: ${(userShare * 100).toFixed(4)}%`)

        // Calcular quantidades proporcionais
        const reserve0BigInt = BigInt(pairState.reserve0)
        const reserve1BigInt = BigInt(pairState.reserve1)

        const token0AmountRaw = totalSupplyBigInt > 0n 
          ? (reserve0BigInt * lpBalanceBigInt) / totalSupplyBigInt
          : 0n
        const token1AmountRaw = totalSupplyBigInt > 0n
          ? (reserve1BigInt * lpBalanceBigInt) / totalSupplyBigInt
          : 0n

        console.log(`[getUserPools] Token amounts (raw):`, {
          token0: token0AmountRaw.toString(),
          token1: token1AmountRaw.toString(),
        })

        // Formatar valores usando lpDecimals do pair (pode ser 18 ou 6 em pares antigos)
        const lpDecimals = pairState.lpDecimals ?? 18
        const lpBalanceFormatted = parseFloat(formatUnits(lpBalanceBigInt, lpDecimals)).toFixed(6)
        const token0AmountFormatted = parseFloat(formatUnits(token0AmountRaw, pairState.token0.decimals)).toFixed(6)
        const token1AmountFormatted = parseFloat(formatUnits(token1AmountRaw, pairState.token1.decimals)).toFixed(6)

        console.log(`[getUserPools] Formatted values:`, {
          lpBalance: lpBalanceFormatted,
          token0: token0AmountFormatted,
          token1: token1AmountFormatted,
        })

        userPools.push({
          pairAddress,
          token0: pairState.token0,
          token1: pairState.token1,
          lpBalance: lpBalanceBigInt.toString(),
          lpBalanceFormatted,
          token0Amount: token0AmountRaw.toString(),
          token0AmountFormatted,
          token1Amount: token1AmountRaw.toString(),
          token1AmountFormatted,
          totalSupply: pairState.totalSupply,
          totalSupplyFormatted: pairState.totalSupplyFormatted,
          reserve0: pairState.reserve0,
          reserve1: pairState.reserve1,
        })
      } catch (err: any) {
        console.warn(`[getUserPools] Error reading pair ${pairAddress}:`, err.message)
        // Continuar para o próximo pair
        continue
      }
    }

    console.log(`[getUserPools] Found ${userPools.length} pools with LP tokens for user`)
    return userPools
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[getUserPools] Error fetching user pools:', error)
    if (msg.includes('allPairsLength') || msg.includes('revert')) {
      throw new Error(
        'Factory does not support listing pairs. Check you are using the correct Factory (0x4b6F73...).'
      )
    }
    if (msg.includes('network') || msg.includes('connection')) {
      throw new Error('Network error. Check your connection and try again.')
    }
    throw new Error(`Failed to load pools: ${msg}`)
  }
}
