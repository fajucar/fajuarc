import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { formatUnits } from 'viem'

// Gas típico de um transfer() ERC-20 do USDC — usado para estimar a taxa exibida.
const TYPICAL_TRANSFER_GAS = 65_000n

export function useGasPrice() {
  const publicClient = usePublicClient()

  return useQuery({
    queryKey: ['gasPrice'],
    queryFn: async () => {
      if (!publicClient) throw new Error('Client not ready')
      const price = await publicClient.getGasPrice()
      // gasPrice é denominado no USDC nativo (18 decimais), não no ERC-20 (6).
      const transferCost = formatUnits(price * TYPICAL_TRANSFER_GAS, 18)
      return {
        wei: price,
        usdc: transferCost,
        formatted: `~$${Number(transferCost).toFixed(4)}`,
      }
    },
    refetchInterval: 10000, // 10s
    enabled: !!publicClient,
  })
}

