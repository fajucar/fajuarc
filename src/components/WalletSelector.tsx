import { useState } from 'react';
import { detectWalletProviders, WalletProvider } from '../utils/wallet';

interface WalletSelectorProps {
  onSelect: (walletName: string) => void;
  onClose: () => void;
}

export function WalletSelector({ onSelect, onClose }: WalletSelectorProps) {
  const [providers] = useState<WalletProvider[]>(() => detectWalletProviders());

  if (providers.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h2 className="text-2xl font-bold mb-4">No Wallet Found</h2>
          <p className="text-gray-600 mb-4">
            Please install a wallet extension like MetaMask to continue.
          </p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4">Select Wallet</h2>
        <p className="text-gray-600 mb-4">
          Choose which wallet you want to connect:
        </p>
        <div className="space-y-2">
          {providers.map((wallet, index) => (
            <button
              key={index}
              onClick={() => {
                onSelect(wallet.name);
                onClose();
              }}
              className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-left flex items-center justify-between"
            >
              <div>
                <div className="font-medium text-gray-900">{wallet.name}</div>
                {wallet.isMetaMask && (
                  <div className="text-sm text-gray-500">Recommended</div>
                )}
              </div>
              {wallet.isMetaMask && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">✓</span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
