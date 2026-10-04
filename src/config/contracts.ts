import { getAddress } from 'viem';

// Contract addresses - Update these after deployment
if (import.meta.env.DEV) {
  console.log('🔍 [contracts.ts] Environment Variables:');
  console.log('  VITE_FAJUCAR_COLLECTION_ADDRESS:', import.meta.env.VITE_FAJUCAR_COLLECTION_ADDRESS ?? 'UNDEFINED');
}

/**
 * Read and normalize an address from env. Removes quotes/whitespace, lowercases,
 * validates 0x + 42 chars, then applies getAddress (checksum). Never call getAddress
 * on raw env strings (spaces/quotes/mixed-case).
 */
function parseEnvAddress(envKey: string): `0x${string}` | '' {
  const raw = (import.meta.env[envKey] ?? '').toString();
  const rawTrim = raw.trim().replaceAll('"', '').replaceAll("'", '');
  const normalize = rawTrim.toLowerCase();
  if (!normalize.startsWith('0x') || normalize.length !== 42) return '';
  try {
    return getAddress(normalize) as `0x${string}`;
  } catch {
    return '';
  }
}

export const GIFT_CARD_MINTER_ADDRESS = parseEnvAddress('VITE_GIFT_CARD_MINTER_ADDRESS');

/**
 * Safe getter for Fajucar collection address. Never throws.
 * Returns empty string when VITE_FAJUCAR_COLLECTION_ADDRESS is undefined, empty, or invalid.
 */
function getFajucarCollectionAddressSafe(): `0x${string}` | '' {
  try {
    const raw = import.meta.env.VITE_FAJUCAR_COLLECTION_ADDRESS;
    if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) return '';
    return parseEnvAddress('VITE_FAJUCAR_COLLECTION_ADDRESS');
  } catch {
    return '';
  }
}

export const FAJUCAR_COLLECTION_ADDRESS = getFajucarCollectionAddressSafe();
export const MOCK_USDC_ADDRESS = parseEnvAddress('VITE_MOCK_USDC_ADDRESS');

export const CONTRACT_ADDRESSES = {
  MOCK_USDC: MOCK_USDC_ADDRESS,
  GIFT_CARD_MINTER: GIFT_CARD_MINTER_ADDRESS,
};

// Debug: Log parsed addresses (dev only)
if (import.meta.env.DEV) {
  console.log('📋 [contracts.ts] Parsed Addresses:');
  console.log('  FAJUCAR_COLLECTION_ADDRESS:', FAJUCAR_COLLECTION_ADDRESS || '(empty)');
  console.log('  GIFT_CARD_MINTER_ADDRESS:', GIFT_CARD_MINTER_ADDRESS || '(empty)');
  console.log('  CONTRACT_ADDRESSES:', CONTRACT_ADDRESSES);
}

// Arc Testnet configuration
// Source: https://docs.arc.network/arc/references/connect-to-arc
export const ARC_TESTNET = {
  chainId: 5042002, // Official Chain ID from Arc docs
  chainName: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC', // Arc uses USDC as native gas token (not ETH!)
    symbol: 'USDC',
    decimals: 6, // Arc uses USDC as native gas token — 6 decimals (same as ERC-20 USDC, not 18)
  },
  rpcUrls: [
    'https://rpc.testnet.arc.network', // Primary RPC from official docs
    'https://rpc.blockdaemon.testnet.arc.network', // Alternative 1
    'https://rpc.drpc.testnet.arc.network', // Alternative 2
    'https://rpc.quicknode.testnet.arc.network', // Alternative 3
  ],
  blockExplorerUrls: ['https://testnet.arcscan.app'], // Official explorer
};

// Arc Mainnet configuration
// Source: https://docs.arc.io/arc/references/connect-to-arc
export const ARC_MAINNET = {
  chainId: 5042,
  chainName: 'Arc Mainnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18, // Confirmado via eth_getBalance no RPC: balance nativo usa 18 decimals,
                  // diferente do ERC-20 USDC (6 decimals). Não mexer no ARC_TESTNET.
  },
  rpcUrls: [
    'https://rpc.mainnet.arc.io',
  ],
  blockExplorerUrls: ['https://explorer.arc.io'],
};

// Localhost configuration for local testing
export const LOCALHOST_NETWORK = {
  chainId: 31337,
  chainName: 'Hardhat Local',
  nativeCurrency: {
    name: 'ETH',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['http://127.0.0.1:8545'],
  blockExplorerUrls: [],
};
