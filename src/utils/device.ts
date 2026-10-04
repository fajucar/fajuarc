/** Mobile detection: touch-primary pointer OR mobile user-agent string. */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

/**
 * True when the page is already running inside a wallet's own in-app browser
 * (MetaMask, Trust Wallet, Rainbow, etc.) on mobile — i.e. `window.ethereum`
 * is injected AND we're on a touch/mobile device. In this case the wallet's
 * own provider is already available; there's no need to deep-link out to an
 * app (that's how the app ends up trying to relaunch itself).
 */
export function isInjectedWalletBrowser(): boolean {
  if (typeof window === 'undefined') return false
  return isMobileDevice() && typeof (window as any).ethereum !== 'undefined'
}
