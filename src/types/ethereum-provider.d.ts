/**
 * Wallet provider with optional detection flags (MetaMask, Rabby, Trust, Brave, etc.).
 * These properties exist at runtime on injected providers but are not in the base EIP1193Provider type.
 * Use this type for type assertions when accessing provider flags - e.g. (window.ethereum as EthereumProviderWithFlags)
 */
export interface EthereumProviderWithFlags {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
  /** Multiple providers (EIP-6963) - MetaMask, Rabby, etc. can coexist */
  providers?: EthereumProviderWithFlags[]
  isMetaMask?: boolean
  isRabby?: boolean
  isTrust?: boolean
  isBraveWallet?: boolean
  isCoinbaseWallet?: boolean
  isOkxWallet?: boolean
}
