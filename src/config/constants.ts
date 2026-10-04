import { USDC_ADDRESS, EURC_ADDRESS } from './tokens'

export const CONSTANTS = {
  // Network
  ARC_TESTNET_CHAIN_ID: 5042002,
  ARC_MAINNET_CHAIN_ID: 5042,
  
  // Contracts - Arc Testnet (oficiais: Arc docs + Circle docs)
  USDC_ADDRESS,
  EURC_ADDRESS,
  
  // API
  STATS_UPDATE_INTERVAL: 5000, // 5s
  BLOCK_UPDATE_INTERVAL: 3000, // 3s
  
  // UI
  ANIMATION_DURATION: 300,
  TOAST_DURATION: 5000,
  
  // Links
  LINKS: {
    docs: 'https://docs.arc.network',
    github: 'https://github.com/circle/arc',
    discord: 'https://discord.gg/arc',
    twitter: 'https://twitter.com/arcnetwork',
    explorer: 'https://explorer.arc.io',
    // Primary faucet (backward compatibility)
    faucet: 'https://faucet.circle.com/',
    // Cross-chain: ETH Sepolia → USDC Sepolia → USDC Arc
    uniswapSepolia: 'https://app.uniswap.org/swap?chain=sepolia',
    bridgeUsdcToArc: 'https://docs.arc.network/arc/tutorials/bridge-usdc-to-arc',
  },
} as const

export const WALLET_ICONS = {
  metamask: '/wallets/metamask.svg',
  coinbase: '/wallets/coinbase.svg',
  walletconnect: '/wallets/walletconnect.svg',
  rabby: '/wallets/rabby.svg',
  rainbow: '/wallets/rainbow.svg',
} as const

