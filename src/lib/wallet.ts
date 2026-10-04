/**
 * Wallet Connection and Management
 * Uses pickProvider() to handle multiple wallet extensions
 */

import { pickProvider } from './provider';
import { ensureArcNetwork, normalizeChainId, ARC_TESTNET } from '../config/chain';
import { BrowserProvider } from 'ethers';

export interface WalletState {
  address: string | null;
  chainId: number | null;
  isConnected: boolean;
  provider: BrowserProvider | null;
}

/**
 * Connect wallet and ensure Arc Testnet
 */
export async function connectWallet(): Promise<WalletState> {
  const provider = pickProvider();
  
  if (!provider) {
    throw new Error('No wallet detected. Please install MetaMask or Rabby.');
  }

  try {
    // Request accounts
    const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
    
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found. Please unlock your wallet.');
    }

    // Ensure Arc Testnet
    await ensureArcNetwork(provider);

    // Get network info
    const ethersProvider = new BrowserProvider(provider);
    const network = await ethersProvider.getNetwork();
    const chainId = normalizeChainId(network.chainId);
    const signer = await ethersProvider.getSigner();
    const address = await signer.getAddress();

    console.log('[Wallet] ✅ Connected:', {
      address,
      chainId,
      expected: ARC_TESTNET.chainIdDec,
      isCorrect: chainId === ARC_TESTNET.chainIdDec,
    });

    return {
      address,
      chainId,
      isConnected: true,
      provider: ethersProvider,
    };
  } catch (error: any) {
    if (error.code === 4001) {
      throw new Error('Connection rejected. Please approve the connection in your wallet.');
    }
    throw error;
  }
}

/**
 * Get current wallet state
 */
export async function getWalletState(): Promise<WalletState> {
  const provider = pickProvider();
  
  if (!provider) {
    return {
      address: null,
      chainId: null,
      isConnected: false,
      provider: null,
    };
  }

  try {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
    
    if (!accounts || accounts.length === 0) {
      return {
        address: null,
        chainId: null,
        isConnected: false,
        provider: null,
      };
    }

    const ethersProvider = new BrowserProvider(provider);
    const network = await ethersProvider.getNetwork();
    const chainId = normalizeChainId(network.chainId);
    const signer = await ethersProvider.getSigner();
    const address = await signer.getAddress();

    return {
      address,
      chainId,
      isConnected: true,
      provider: ethersProvider,
    };
  } catch (error) {
    console.error('[Wallet] Error getting state:', error);
    return {
      address: null,
      chainId: null,
      isConnected: false,
      provider: null,
    };
  }
}

/**
 * Switch to Arc Testnet
 */
export async function switchToArcNetwork(): Promise<void> {
  const provider = pickProvider();
  if (!provider) {
    throw new Error('No wallet detected.');
  }
  await ensureArcNetwork(provider);
}

/**
 * Disconnect wallet (clears local state)
 */
export function disconnectWallet(): void {
  // MetaMask/Rabby don't have disconnect method
  // Just clear local state
  console.log('[Wallet] Disconnected (local state cleared)');
}

