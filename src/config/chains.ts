import { Chain } from 'viem'

export const arcTestnet = {
  id: 5042002, // Arc Testnet chainId
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 6, // Arc uses USDC as native gas token — 6 decimals (same as ERC-20 USDC, not 18)
  },
  rpcUrls: {
    default: {
      http: [
        'https://rpc.testnet.arc.network',
        'https://rpc.blockdaemon.testnet.arc.network',
        'https://rpc.drpc.testnet.arc.network',
        'https://rpc.quicknode.testnet.arc.network',
      ],
      webSocket: [
        'wss://rpc.testnet.arc.network',
        'wss://rpc.drpc.testnet.arc.network',
        'wss://rpc.quicknode.testnet.arc.network',
      ],
    },
    public: {
      http: [
        'https://rpc.testnet.arc.network',
        'https://rpc.blockdaemon.testnet.arc.network',
        'https://rpc.drpc.testnet.arc.network',
        'https://rpc.quicknode.testnet.arc.network',
      ],
      webSocket: [
        'wss://rpc.testnet.arc.network',
        'wss://rpc.drpc.testnet.arc.network',
        'wss://rpc.quicknode.testnet.arc.network',
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app'
    },
  },
  testnet: true,
} as const satisfies Chain

// Confirmado em docs.arc.io/arc/references/connect-to-arc
export const arcMainnet = {
  id: 5042,
  name: 'Arc Mainnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18, // Confirmado via eth_getBalance no RPC (diferente do ARC_TESTNET)
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.mainnet.arc.io'],
    },
    public: {
      http: ['https://rpc.mainnet.arc.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arc Explorer',
      url: 'https://explorer.arc.io'
    },
  },
  testnet: false,
} as const satisfies Chain

