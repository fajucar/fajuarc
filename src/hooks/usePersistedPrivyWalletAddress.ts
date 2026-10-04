import { useEffect, useMemo, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'

const STORAGE_KEY = 'fajuarc:privy-wallet-address'

type PrivyWalletLike = {
  address?: string
  walletClientType?: string | null
  connectorType?: string | null
}

function isAddress(value: string | null | undefined): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value ?? '')
}

function isEmbeddedWallet(wallet: PrivyWalletLike) {
  return (
    wallet.walletClientType === 'privy' ||
    wallet.walletClientType === 'privy-v2' ||
    wallet.connectorType === 'embedded'
  )
}


function readStoredAddress() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isAddress(stored) ? stored : undefined
  } catch {
    return undefined
  }
}

/**
 * Retorna o endereço correto da embedded wallet Privy.
 *
 * NUNCA usar wallets[0] diretamente: a ordem do array não é garantida
 * e pode retornar uma carteira externa (MetaMask/Rabby) em vez da embedded.
 *
 * Prioridade:
 *  1. Embedded wallet do Privy (walletClientType === 'privy')
 *  2. Qualquer outra carteira com endereço válido (fallback)
 */
export function getPrivyWalletAddress(wallets: PrivyWalletLike[]) {
  const embedded = wallets.find(isEmbeddedWallet)
  if (isAddress(embedded?.address)) return embedded!.address as `0x${string}`
  const any = wallets.find((w) => isAddress(w.address))
  return any?.address as `0x${string}` | undefined
}

export function usePersistedPrivyWalletAddress() {
  const { authenticated, ready } = usePrivy()
  const { wallets } = useWallets()
  const [persistedAddress, setPersistedAddress] = useState<`0x${string}` | undefined>(readStoredAddress)

  const liveAddress = useMemo(() => getPrivyWalletAddress(wallets), [wallets])

  useEffect(() => {
    if (liveAddress) {
      setPersistedAddress(liveAddress)
      try {
        window.localStorage.setItem(STORAGE_KEY, liveAddress)
      } catch {
        // localStorage can be unavailable in restricted browser modes.
      }
      return
    }

    if (ready && !authenticated) {
      setPersistedAddress(undefined)
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Ignore storage cleanup failures.
      }
    }
  }, [authenticated, liveAddress, ready])

  return liveAddress ?? (authenticated ? persistedAddress : undefined)
}
