/**
 * Clear wagmi/WalletConnect persistence to fix "Connector already connected" state
 */
export function clearWagmiStorage(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith('wagmi') || k.startsWith('wc2') || k.startsWith('walletconnect'))) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    // ignore
  }
}
