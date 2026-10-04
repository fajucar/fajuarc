/**
 * Wallet Provider Selection
 * Handles multiple wallet extensions (MetaMask, Rabby, etc.)
 * Uses EthereumProviderWithFlags for type-safe access to provider flags.
 */

import type { EthereumProviderWithFlags } from '@/types/ethereum-provider'

/** Alias for EthereumProviderWithFlags */
export type EthereumProvider = EthereumProviderWithFlags

/**
 * Pick the best available wallet provider
 * Priority: MetaMask > Rabby > First available
 */
export function pickProvider(): EthereumProviderWithFlags | null {
  if (typeof window === 'undefined' || !window.ethereum) {
    return null;
  }

  const eth = window.ethereum as EthereumProviderWithFlags

  // If multiple providers exist (EIP-6963)
  if (eth.providers && Array.isArray(eth.providers)) {
    const providers = eth.providers;

    // Prefer MetaMask
    const metaMask = providers.find((p) => !!p.isMetaMask);
    if (metaMask) {
      console.log('[Provider] ✅ Selected MetaMask');
      return metaMask;
    }

    // Then Rabby
    const rabby = providers.find((p) => !!p.isRabby);
    if (rabby) {
      console.log('[Provider] ✅ Selected Rabby');
      return rabby;
    }

    // Fallback to first provider
    console.log('[Provider] ✅ Selected first available provider');
    return providers[0];
  }

  // Single provider
  console.log('[Provider] ✅ Using single provider');
  return eth;
}

/**
 * Get all available providers
 */
export function getAllProviders(): EthereumProviderWithFlags[] {
  if (typeof window === 'undefined' || !window.ethereum) {
    return [];
  }

  const eth = window.ethereum as EthereumProviderWithFlags;

  if (eth.providers && Array.isArray(eth.providers)) {
    return eth.providers;
  }

  return [eth];
}

/**
 * Get provider name
 */
export function getProviderName(provider: EthereumProviderWithFlags): string {
  if (provider.isMetaMask) return 'MetaMask';
  if (provider.isRabby) return 'Rabby';
  if (provider.isCoinbaseWallet) return 'Coinbase Wallet';
  if (provider.isBraveWallet) return 'Brave Wallet';
  return 'Ethereum Wallet';
}

