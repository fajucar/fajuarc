import type { Address, Hash, PublicClient } from 'viem'
import { maxUint256 } from 'viem'

const ERC20_ABI = [
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
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export type WriteContractFn = (args: {
  address: Address
  abi: readonly unknown[]
  functionName: string
  args: unknown[]
}) => Promise<Hash>

/**
 * Garante que o spender tem allowance >= amount para o token.
 * Se allowance insuficiente, chama approve(spender, maxUint256) e aguarda confirmação.
 */
export async function ensureAllowance(
  publicClient: PublicClient,
  writeContractAsync: WriteContractFn,
  token: Address,
  owner: Address,
  spender: Address,
  amount: bigint
): Promise<void> {
  const current = (await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  })) as bigint
  if (current >= amount) return
  const hash = await writeContractAsync({
    address: token,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender, 340282366920938463463374607431768211455n],
  })
  await publicClient.waitForTransactionReceipt({ hash })
}
