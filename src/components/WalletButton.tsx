import { useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { WalletSelector } from './WalletSelector';
import toast from 'react-hot-toast';

export function WalletButton() {
  const { address, isConnected, connect, disconnect, availableWallets } = useWallet();
  const [showSelector, setShowSelector] = useState(false);

  const handleConnect = async (walletName?: string) => {
    try {
      await connect(walletName);
      toast.success('Wallet connected successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to connect wallet');
    }
  };

  const handleConnectClick = () => {
    // If multiple wallets available, show selector
    if (availableWallets.length > 1) {
      setShowSelector(true);
    } else if (availableWallets.length === 1) {
      // Single wallet, connect directly
      handleConnect(availableWallets[0].name);
    } else {
      toast.error('No wallet found. Please install MetaMask or another wallet extension.');
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    toast.success('Wallet disconnected');
  };

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-4">
        <div className="px-4 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium">
          {address.slice(0, 6)}...{address.slice(-4)}
        </div>
        <button
          onClick={handleDisconnect}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={handleConnectClick}
        className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
      >
        Connect Wallet
      </button>
      {showSelector && (
        <WalletSelector
          onSelect={(walletName) => handleConnect(walletName)}
          onClose={() => setShowSelector(false)}
        />
      )}
    </>
  );
}









