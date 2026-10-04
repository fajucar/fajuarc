/**
 * balances.ts — leitura de saldo on-chain na Arc Testnet.
 *
 * USDC é o token nativo de gas da Arc Testnet (precompile 0x3600...), com DUAS interfaces:
 * - eth_getBalance() (viem getBalance()) — saldo nativo EVM, sempre em unidades raw de 18
 *   decimals, como em qualquer chain EVM (independente do que o token "representa").
 * - balanceOf() do precompile ERC-20 — expõe o MESMO saldo já escalado para 6 decimals
 *   (compatibilidade com USDC padrão).
 * Confirmado on-chain (2026-06-29): para o mesmo endereço, eth_getBalance() e balanceOf()
 * retornam valores que diferem por exatamente 10^12 e representam o mesmo saldo em USD.
 * getBalance() PRECISA usar formatUnits(raw, 18) — usar 6 aqui inflava o saldo em 10^12x.
 */

import { createPublicClient, http, formatUnits } from 'viem'
import { arcMainnet } from '@/config/chains'

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// Endereço do precompile USDC nativo na Arc Testnet
const USDC_NATIVE_ADDRESS = '0x3600000000000000000000000000000000000000'

// Client standalone para leitura de saldos — não precisa de carteira conectada
export const arcReadClient = createPublicClient({
  chain: arcMainnet,
  transport: http(),
})

export interface BalanceToken {
  address: string
  decimals: number
  /** Se true, força getBalance(). Detectado automaticamente pelo endereço USDC. */
  isNative?: boolean
}

/**
 * Lê o saldo de um token para uma conta na Arc Testnet.
 *
 * - USDC (precompile nativo): usa getBalance() — saldo EVM nativo, sempre raw 18 decimals
 * - ERC20: usa balanceOf() com token.decimals
 *
 * Retorna string human-readable. Retorna '0' em caso de erro.
 */
export async function getTokenBalance(
  account: string,
  token: BalanceToken,
): Promise<string> {
  try {
    const addr = account as `0x${string}`
    const isNative =
      token.isNative ||
      token.address.toLowerCase() === USDC_NATIVE_ADDRESS.toLowerCase()

    if (isNative) {
      // getBalance() (eth_getBalance) returns the raw native EVM balance, which is always
      // 18-decimal regardless of the token's "logical" decimals — confirmed on-chain by
      // comparing it against the precompile's balanceOf() (6 decimals) for the same address.
      const raw = await arcReadClient.getBalance({ address: addr })
      return formatUnits(raw, 18)
    }

    const raw = (await arcReadClient.readContract({
      address: token.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [addr],
    })) as bigint

    return formatUnits(raw, token.decimals)
  } catch {
    return '0'
  }
}
