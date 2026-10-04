import { CONTRACT_ADDRESSES, ARC_TESTNET } from '../config/contracts';

// Arc Testnet configuration
export const ARC_TESTNET_CHAIN_ID = ARC_TESTNET.chainId;
// CRITICAL: Chain ID 5042002 in hex is 0x4CEF52 (NOT 0x200 which is 512)
export const ARC_TESTNET_HEX_ID = `0x${ARC_TESTNET.chainId.toString(16)}`;

// Verify hex calculation
if (parseInt(ARC_TESTNET_HEX_ID, 16) !== ARC_TESTNET_CHAIN_ID) {
  console.error('[CONFIG] ❌ Chain ID hex calculation error!', {
    decimal: ARC_TESTNET_CHAIN_ID,
    hex: ARC_TESTNET_HEX_ID,
    parsed: parseInt(ARC_TESTNET_HEX_ID, 16)
  });
}

export const NETWORK_CONFIG = {
  chainId: ARC_TESTNET_HEX_ID, // Should be 0x4CEF52 for Chain ID 5042002
  chainName: ARC_TESTNET.chainName,
  nativeCurrency: ARC_TESTNET.nativeCurrency,
  // Use the first RPC URL (alternative that works) - wallets expect a single URL or array
  // Try blockdaemon first, then fallback to others
  rpcUrls: ARC_TESTNET.rpcUrls.length > 0 ? [ARC_TESTNET.rpcUrls[0]] : ARC_TESTNET.rpcUrls,
  blockExplorerUrls: ARC_TESTNET.blockExplorerUrls,
};

export { CONTRACT_ADDRESSES };





