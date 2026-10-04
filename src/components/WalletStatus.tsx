import React from 'react';
import { Wallet, CheckCircle, XCircle } from 'lucide-react';
import { WalletState } from '../lib/wallet';
import { ARC_TESTNET } from '../config/chain';

interface WalletStatusProps {
  wallet: WalletState;
}

export const WalletStatus: React.FC<WalletStatusProps> = ({ wallet }) => {
  const isCorrectNetwork = wallet.chainId === ARC_TESTNET.chainIdDec;

  if (!wallet.isConnected) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Wallet className="w-4 h-4" />
        <span className="text-sm">Not connected</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-mono text-white">
          {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {isCorrectNetwork ? (
          <>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-emerald-300">Arc Testnet</span>
          </>
        ) : (
          <>
            <XCircle className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-amber-300">Wrong Network</span>
          </>
        )}
      </div>
      {wallet.chainId && (
        <div className="text-xs text-slate-400">
          Chain ID: {wallet.chainId}
        </div>
      )}
    </div>
  );
};

