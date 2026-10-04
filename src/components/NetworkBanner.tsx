import React from 'react';
import { AlertTriangle, Globe } from 'lucide-react';
import { switchToArcNetwork } from '../lib/wallet';
import { ARC_MAINNET } from '../config/chain';

interface NetworkBannerProps {
  currentChainId: number | null;
  onSwitch?: () => void;
}

export const NetworkBanner: React.FC<NetworkBannerProps> = ({ currentChainId, onSwitch }) => {
  const isWrongNetwork = currentChainId !== ARC_MAINNET.chainIdDec;

  if (!isWrongNetwork) {
    return null;
  }

  const handleSwitch = async () => {
    try {
      await switchToArcNetwork();
      if (onSwitch) {
        onSwitch();
      }
    } catch (error: any) {
      console.error('[NetworkBanner] Error switching network:', error);
      alert(`Failed to switch network: ${error.message}`);
    }
  };

  return (
    <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
        <div>
          <h4 className="text-amber-300 font-bold text-sm">Wrong Network</h4>
          <p className="text-amber-200/80 text-xs">
            Please switch to {ARC_MAINNET.chainName} (Chain ID: {ARC_MAINNET.chainIdDec})
          </p>
        </div>
      </div>
      <button
        onClick={handleSwitch}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-sm transition-colors border border-amber-500/30"
      >
        <Globe className="w-4 h-4" />
        Switch/Add Arc
      </button>
    </div>
  );
};

