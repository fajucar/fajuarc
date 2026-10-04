import { createPublicClient, http, fallback } from 'viem'
import { arcTestnet } from '@/config/chains'

export const arcClient = createPublicClient({
  chain: arcTestnet,
  transport: fallback([
    http('https://rpc.testnet.arc.network'),
    http('https://rpc.blockdaemon.testnet.arc.network'),
    http('https://rpc.drpc.testnet.arc.network'),
    http('https://rpc.quicknode.testnet.arc.network'),
  ]),
})
