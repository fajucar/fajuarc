/**
 * Persistent warning shown while the connected wallet is on a network other than
 * Arc Mainnet, with a button to switch. Reads the wallet's live connection chain
 * (not the app's configured chain), so it also catches networks the app doesn't
 * know, like Ink Sepolia. Renders nothing when the wallet is on Arc or disconnected.
 */

import { useState } from 'react'
import { useConfig, useConnection } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { ARC_CHAIN_ID, ensureWalletOnArc } from '@/lib/arcNetwork'

export function WrongNetworkNotice({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const config = useConfig()
  const { status, chainId } = useConnection()
  const [switching, setSwitching] = useState(false)
  const [failed, setFailed] = useState(false)

  if (status !== 'connected' || chainId === ARC_CHAIN_ID) return null

  const onSwitch = async () => {
    setSwitching(true)
    setFailed(false)
    try {
      await ensureWalletOnArc(config)
    } catch {
      setFailed(true)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className={`flex gap-3 rounded-xl border border-red-500/50 bg-red-950/40 p-3 text-sm ${className}`} role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
      <div className="space-y-2">
        <p className="text-red-200">{t('network.wrongNetwork', { chainId: chainId ?? '?' })}</p>
        <button
          type="button"
          onClick={onSwitch}
          disabled={switching}
          className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-50"
        >
          {switching ? t('network.switching') : t('network.switchButton')}
        </button>
        {failed && <p className="text-xs text-red-300">{t('network.switchRequired')}</p>}
      </div>
    </div>
  )
}
