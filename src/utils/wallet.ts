import { BrowserProvider } from 'ethers';
import { ARC_TESTNET, LOCALHOST_NETWORK } from '../config/contracts';
import type { EthereumProviderWithFlags } from '../types/ethereum-provider';

export interface WalletState {
  address: string | null;
  provider: BrowserProvider | null;
  isConnected: boolean;
  chainId: number | null;
}

export interface WalletProvider {
  name: string;
  icon?: string;
  provider: EthereumProviderWithFlags;
  isMetaMask?: boolean;
}

function getEth(): EthereumProviderWithFlags | undefined {
  if (typeof window === 'undefined' || !window.ethereum) return undefined;
  return window.ethereum as EthereumProviderWithFlags;
}

/**
 * Detect all available wallet providers
 */
export function detectWalletProviders(): WalletProvider[] {
  const providers: WalletProvider[] = [];
  const eth = getEth();
  if (!eth) return providers;

  // Check if multiple providers are available (EIP-6963)
  if (eth.providers && Array.isArray(eth.providers)) {
    eth.providers.forEach((provider) => {
      const p = provider as EthereumProviderWithFlags;
      const name = p.isMetaMask
        ? 'MetaMask'
        : p.isCoinbaseWallet
        ? 'Coinbase Wallet'
        : p.isBraveWallet
        ? 'Brave Wallet'
        : p.isTrust
        ? 'Trust Wallet'
        : p.isRabby
        ? 'Rabby'
        : 'Unknown Wallet';

      providers.push({
        name,
        provider: p,
        isMetaMask: p.isMetaMask || false,
      });
    });
  } else {
    const name = eth.isMetaMask
      ? 'MetaMask'
      : eth.isCoinbaseWallet
      ? 'Coinbase Wallet'
      : eth.isBraveWallet
      ? 'Brave Wallet'
      : eth.isTrust
      ? 'Trust Wallet'
      : eth.isRabby
      ? 'Rabby'
      : 'Ethereum Wallet';

    providers.push({
      name,
      provider: eth,
      isMetaMask: eth.isMetaMask || false,
    });
  }

  // Sort: MetaMask first, then others
  providers.sort((a, b) => {
    if (a.isMetaMask) return -1;
    if (b.isMetaMask) return 1;
    return a.name.localeCompare(b.name);
  });

  return providers;
}

/**
 * Get a specific wallet provider by name, or the best available one
 */
function getWalletProvider(preferredName?: string): any | null {
  const providers = detectWalletProviders();
  
  if (providers.length === 0) {
    return null;
  }

  // If preferred name is specified, try to find it
  if (preferredName) {
    const preferred = providers.find(p => 
      p.name.toLowerCase() === preferredName.toLowerCase()
    );
    if (preferred) {
      console.log(`✅ Using preferred wallet: ${preferred.name}`);
      return preferred.provider;
    }
  }

  // Otherwise, prefer MetaMask, then first available
  const metamask = providers.find(p => p.isMetaMask);
  if (metamask) {
    console.log(`✅ Using MetaMask`);
    return metamask.provider;
  }

  console.log(`✅ Using ${providers[0].name}`);
  return providers[0].provider;
}

export async function connectWallet(preferredWalletName?: string): Promise<WalletState> {
  const ethereum = getWalletProvider(preferredWalletName);
  
  if (!ethereum) {
    const availableWallets = detectWalletProviders();
    if (availableWallets.length === 0) {
      throw new Error(
        'No Ethereum wallet found. Please install MetaMask or another Ethereum wallet extension.'
      );
    } else {
      throw new Error(
        `Could not connect to wallet. Available wallets: ${availableWallets.map(w => w.name).join(', ')}`
      );
    }
  }

  // TypeScript guard: ethereum is guaranteed to be non-null after the check above
  const providerEthereum = ethereum;

  try {
    // Request account access
    const accounts = await providerEthereum.request({
      method: 'eth_requestAccounts',
    });

    if (accounts.length === 0) {
      throw new Error('No accounts found. Please unlock your wallet.');
    }

    const provider = new BrowserProvider(providerEthereum as any);
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);
    
    // Check if connected to Arc Testnet or Localhost
    if (chainId !== ARC_TESTNET.chainId && chainId !== LOCALHOST_NETWORK.chainId) {
      // Try to switch to localhost first (for local testing), then Arc Testnet
      try {
        await switchToLocalhost(providerEthereum);
      } catch {
        await switchToArcTestnet(providerEthereum);
      }
    }

    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    return {
      address,
      provider,
      isConnected: true,
      chainId: Number(network.chainId),
    };
  } catch (error: any) {
    if (error.code === 4001) {
      throw new Error('User rejected the connection request.');
    }
    throw error;
  }
}

export async function switchToLocalhost(provider?: any): Promise<void> {
  const ethereum = provider || getWalletProvider();
  if (!ethereum) {
    throw new Error('No wallet provider available');
  }

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${LOCALHOST_NETWORK.chainId.toString(16)}` }],
    });
  } catch (switchError: any) {
    // Chain doesn't exist, add it
    if (switchError.code === 4902) {
      if (!ethereum) {
        throw new Error('MetaMask provider not available');
      }
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${LOCALHOST_NETWORK.chainId.toString(16)}`,
            chainName: LOCALHOST_NETWORK.chainName,
            nativeCurrency: LOCALHOST_NETWORK.nativeCurrency,
            rpcUrls: LOCALHOST_NETWORK.rpcUrls,
            blockExplorerUrls: LOCALHOST_NETWORK.blockExplorerUrls,
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

export async function switchToArcTestnet(provider?: any): Promise<void> {
  const ethereum = provider || getWalletProvider();
  if (!ethereum) {
    throw new Error('No wallet provider available');
  }

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${ARC_TESTNET.chainId.toString(16)}` }],
    });
  } catch (switchError: any) {
    // Chain doesn't exist, add it
    if (switchError.code === 4902) {
      if (!ethereum) {
        throw new Error('MetaMask provider not available');
      }
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${ARC_TESTNET.chainId.toString(16)}`,
            chainName: ARC_TESTNET.chainName,
            nativeCurrency: ARC_TESTNET.nativeCurrency,
            rpcUrls: ARC_TESTNET.rpcUrls,
            blockExplorerUrls: ARC_TESTNET.blockExplorerUrls,
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

export async function disconnectWallet(): Promise<void> {
  // MetaMask doesn't have a disconnect method, just clear local state
  return Promise.resolve();
}

export async function getWalletState(): Promise<WalletState> {
  const ethereum = getWalletProvider();
  
  if (!ethereum) {
    return {
      address: null,
      provider: null,
      isConnected: false,
      chainId: null,
    };
  }

  try {
    const provider = new BrowserProvider(ethereum);
    const accounts = await ethereum.request({ method: 'eth_accounts' });
    
    if (accounts.length === 0) {
      return {
        address: null,
        provider: null,
        isConnected: false,
        chainId: null,
      };
    }

    const network = await provider.getNetwork();
    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    return {
      address,
      provider,
      isConnected: true,
      chainId: Number(network.chainId),
    };
  } catch (error) {
    return {
      address: null,
      provider: null,
      isConnected: false,
      chainId: null,
    };
  }
}

// Window.ethereum type is declared in lib/provider.ts






