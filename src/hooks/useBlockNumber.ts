import { useBlockNumber as useWagmiBlockNumber } from 'wagmi'
import { CONSTANTS } from '@/config/constants'

export function useBlockNumber() {
  return useWagmiBlockNumber({
    watch: true,
    cacheTime: CONSTANTS.BLOCK_UPDATE_INTERVAL,
  })
}

