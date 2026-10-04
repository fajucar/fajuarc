/**
 * ArcDEX Swap Utils — quote, path validation, reserves, simulation.
 * Garante path como Address[] real, nunca string.
 */

import type { Address, PublicClient } from 'viem'

const ROUTER_ABI = [
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
] as const

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
] as const

/**
 * Default slippage tolerance (%) — shared by the swap UI and by the
 * minimum amounts of addLiquidity/removeLiquidity, so liquidity operations
 * get the same sandwich protection as swaps.
 */
export const DEFAULT_SLIPPAGE_PERCENT = 3

/** `amount` minus the slippage tolerance (clamped to 0.1%–5%). */
export function applySlippage(amount: bigint, slippagePercent: number = DEFAULT_SLIPPAGE_PERCENT): bigint {
  const slippageBps = BigInt(Math.min(500, Math.max(10, Math.round(slippagePercent * 100))))
  return (amount * (10000n - slippageBps)) / 10000n
}

export type SwapQuote = {
  amountOut: bigint
  amountOutMin: bigint
}

export type PairReserves = {
  reserve0: bigint
  reserve1: bigint
}

/**
 * Garante path como Address[] real. NUNCA passa string "[0x...,0x...]".
 */
export function buildSwapPath(tokenFrom: Address, tokenTo: Address): readonly [Address, Address] {
  const t0 = tokenFrom as Address
  const t1 = tokenTo as Address
  if (!t0 || !t1 || typeof t0 !== 'string' || typeof t1 !== 'string') {
    throw new Error('Invalid path: tokenFrom and tokenTo must be valid addresses')
  }
  if (!t0.startsWith('0x') || !t1.startsWith('0x')) {
    throw new Error('Invalid path: addresses must start with 0x')
  }
  return [t0, t1]
}

/**
 * Quote: getAmountsOut no Router. Retorna amountOut e amountOutMin (1% slippage por padrão).
 * Throws "No route / insufficient liquidity" se getAmountsOut falhar.
 */
export async function quoteSwap(
  publicClient: PublicClient,
  routerAddress: Address,
  amountIn: bigint,
  path: readonly [Address, Address],
  slippagePercent: number = 1
): Promise<SwapQuote> {
  try {
    const amounts = (await publicClient.readContract({
      address: routerAddress,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, path],
    })) as bigint[]

    const amountOut = amounts?.[amounts.length - 1]
    if (!amountOut || amountOut === 0n) {
      throw new Error('No route / insufficient liquidity')
    }

    return { amountOut, amountOutMin: applySlippage(amountOut, slippagePercent) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.toLowerCase().includes('route') && !msg.toLowerCase().includes('liquidity')) {
      console.warn('[quoteSwap] getAmountsOut failed', { routerAddress, amountIn: amountIn.toString(), path, error: msg })
    }
    throw new Error('No route / insufficient liquidity')
  }
}

/**
 * Lê reservas do Pair. Se ambas 0, lança erro "Pool sem liquidez".
 */
export async function getPairReserves(
  publicClient: PublicClient,
  pairAddress: Address
): Promise<PairReserves> {
  const [reserve0, reserve1] = (await publicClient.readContract({
    address: pairAddress,
    abi: PAIR_ABI,
    functionName: 'getReserves',
  })) as [bigint, bigint]

  if (reserve0 === 0n && reserve1 === 0n) {
    throw new Error('Pool has no liquidity')
  }

  return { reserve0, reserve1 }
}

/**
 * Simula swap antes de enviar tx. Se reverter, lança com mensagem decodificada.
 */
export async function simulateSwap(
  publicClient: PublicClient,
  routerAddress: Address,
  account: Address,
  amountIn: bigint,
  amountOutMin: bigint,
  path: readonly [Address, Address],
  deadline: bigint
): Promise<void> {
  await publicClient.simulateContract({
    address: routerAddress,
    abi: ROUTER_ABI,
    functionName: 'swapExactTokensForTokens',
    args: [amountIn, amountOutMin, [...path], account, deadline],
    account,
  })
}
