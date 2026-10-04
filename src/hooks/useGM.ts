import { useState, useCallback } from 'react';
import { ARC_TESTNET_CHAIN_ID } from '../constants';

// GM hex data: "GM" encoded as hex
const GM_HEX_DATA = '0x' + Array.from(new TextEncoder().encode('GM'))
  .map((b) => b.toString(16).padStart(2, '0'))
  .join(''); // 0x474d

// Normalize chainId for comparison
const normalizeChainId = (chainId: number | null | undefined | string): number | null => {
  if (chainId === null || chainId === undefined) return null;
  if (typeof chainId === 'string') {
    // Handle hex string like "0x4d0a02" or "0x200"
    if (chainId.startsWith('0x')) {
      return parseInt(chainId, 16);
    }
    return parseInt(chainId, 10);
  }
  return Number(chainId);
};

// Wait for transaction receipt with proper status checking
async function waitForReceipt(txHash: string, maxWaitMs = 60_000): Promise<any> {
  const start = Date.now();
  let attempts = 0;
  
  console.log('[GM] Waiting for receipt of tx:', txHash);
  
  while (Date.now() - start < maxWaitMs) {
    attempts++;
    try {
      const receipt = await window.ethereum?.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash as `0x${string}`],
      }) as { status?: string | number; blockNumber?: string; transactionHash?: string } | null | undefined;
      
      if (receipt) {
        console.log(`[GM] Receipt found (attempt ${attempts}):`, {
          status: receipt.status,
          blockNumber: receipt.blockNumber,
          transactionHash: receipt.transactionHash
        });
        
        // Check if transaction was successful (handle both hex and number formats)
        const status = receipt.status;
        const isSuccess = status === '0x1' || status === 1 || status === '0x01';
        
        if (isSuccess) {
          console.log('[GM] Transaction confirmed as successful!');
          return receipt;
        }
        
        // If receipt exists but failed, throw error
        if (status === '0x0' || status === 0 || status === '0x00') {
          throw new Error('Transaction failed on-chain (status: 0x0)');
        }
      }
      
      await new Promise((r) => setTimeout(r, 1500));
    } catch (error: any) {
      if (error?.message?.includes('failed on-chain')) {
        throw error;
      }
      if (attempts % 10 === 0) {
        console.log(`[GM] Still waiting for receipt... (attempt ${attempts})`);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  
  throw new Error(`Timeout waiting for transaction confirmation after ${maxWaitMs}ms`);
}

/**
 * UNIFIED GM HOOK - SINGLE SOURCE OF TRUTH
 * This hook handles ALL GM logic:
 * - Wallet connection check
 * Network switching
 * - On-chain transaction sending
 * - Transaction confirmation
 * 
 * Returns: { sendGMOnchain, isLoading, error, txHash, isConfirmed }
 */
export function useGM(
  walletAddress: string | null,
  walletChainId: number | null | undefined,
  connectWallet: () => Promise<void>,
  switchNetwork: () => Promise<void>
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const sendGMOnchain = useCallback(async (): Promise<{ txHash: string; receipt: any } | null> => {
    // CRITICAL: Reset state
    setError(null);
    setTxHash(null);
    setIsConfirmed(false);
    setIsLoading(true);

    try {
      console.log('[GM] ===== Starting unified GM flow =====');
      
      // Step 1: Check if wallet is available
      if (!window.ethereum) {
        const err = 'No EVM wallet detected. Install MetaMask or Rabby and try again.';
        setError(err);
        setIsLoading(false);
        throw new Error(err);
      }

      // Step 2: Ensure wallet is connected
      let currentAddress: string | null = walletAddress;
      if (!currentAddress) {
        console.log('[GM] Wallet not connected, attempting to connect...');
        await connectWallet();
        // Wait a moment for state to update
        await new Promise((r) => setTimeout(r, 1000));
        // Check again
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length === 0) {
          const err = 'Please connect your wallet first.';
          setError(err);
          setIsLoading(false);
          throw new Error(err);
        }
        currentAddress = accounts[0];
        console.log('[GM] Wallet connected:', currentAddress);
      }

      // Step 3: Ensure correct network (normalize chainId for comparison)
      let currentChainId: number | null = normalizeChainId(walletChainId);
      
      // Get fresh chainId directly from ethereum to be sure
      const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      currentChainId = normalizeChainId(chainIdHex);
      
      console.log('[GM] Current chainId:', currentChainId, 'Expected:', ARC_TESTNET_CHAIN_ID);
      
      if (currentChainId !== ARC_TESTNET_CHAIN_ID) {
        console.log('[GM] Wrong network detected. Attempting to switch...');
        await switchNetwork();
        // Wait for network switch (can take a few seconds)
        await new Promise((r) => setTimeout(r, 3000));
        // Re-check chainId
        const newChainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        const newChainId = normalizeChainId(newChainIdHex);
        console.log('[GM] Network after switch:', newChainId);
        
        if (newChainId !== ARC_TESTNET_CHAIN_ID) {
          const err = 'Please switch to Arc Testnet first. Click "Switch to Arc Testnet" in the wallet dropdown.';
          setError(err);
          setIsLoading(false);
          throw new Error(err);
        }
        currentChainId = newChainId;
      }

      if (!currentAddress) {
        const err = 'Wallet not connected. Please connect your wallet first.';
        setError(err);
        setIsLoading(false);
        throw new Error(err);
      }

      // Step 4: Send on-chain transaction
      // CRITICAL: NO SOCIAL ACTION BEFORE THIS POINT
      console.log('[GM] Sending on-chain transaction...');
      const txHashResult = (await (window.ethereum as { request: (args: unknown) => Promise<unknown> }).request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: currentAddress,
            to: currentAddress, // self tx; leaves a chain "GM" trace
            value: '0x0',
            data: GM_HEX_DATA,
          },
        ],
      })) as string;

      if (!txHashResult) {
        throw new Error('Transaction did not return a hash.');
      }

      setTxHash(txHashResult);
      console.log('[GM] ✅ Transaction sent, hash:', txHashResult);
      console.log('[GM] Waiting for confirmation...');

      // Step 5: Wait for confirmation
      const receipt = await waitForReceipt(txHashResult);
      console.log('[GM] ✅ Transaction confirmed! Receipt:', receipt);

      // Step 6: Verify receipt status
      if (!receipt) {
        throw new Error('No receipt received from transaction');
      }

      const receiptStatus = receipt.status;
      const isSuccess = receiptStatus === '0x1' || receiptStatus === 1 || receiptStatus === '0x01';
      
      if (!isSuccess) {
        console.error('[GM] Transaction failed on-chain. Status:', receiptStatus);
        throw new Error('Transaction failed on-chain');
      }

      // Step 7: Mark as confirmed
      setIsConfirmed(true);
      console.log('[GM] ✅✅✅ Transaction verified successful! Ready for celebration.');

      return {
        txHash: txHashResult,
        receipt: receipt
      };
    } catch (err: any) {
      console.error('[GM] ❌ Error in sendGMOnchain:', err);
      const msg =
        err?.message?.includes('User rejected') || err?.code === 4001
          ? 'Transaction rejected in wallet.'
          : err?.message || 'GM transaction failed.';
      setError(msg);
      setTxHash(null);
      setIsConfirmed(false);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, walletChainId, connectWallet, switchNetwork]);

  return {
    sendGMOnchain,
    isLoading,
    error,
    txHash,
    isConfirmed,
  };
}
