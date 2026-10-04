import { useState, useCallback, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useConfig } from 'wagmi'
import { ARC_CHAIN_ID, ensureWalletOnArc, WrongNetworkError } from '@/lib/arcNetwork'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, getAddress, parseUnits, type WalletClient, type EIP1193Provider } from 'viem'
import { arcMainnet } from '@/config/chains'
import { arcMainnet as privyArcMainnet } from '@/config/privy'
import { CONSTANTS } from '@/config/constants'
import { WALLETCONNECT_PROJECT_ID } from '@/config/wagmi'
import { usePersistedPrivyWalletAddress } from './usePersistedPrivyWalletAddress'

const CHAIN_ID_HEX = `0x${arcMainnet.id.toString(16)}`

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

async function ensureInjectedChain(eth: any): Promise<void> {
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] })
  } catch (err: any) {
    if (err?.code !== 4902) throw err
    await eth.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: CHAIN_ID_HEX,
        chainName: arcMainnet.name,
        nativeCurrency: arcMainnet.nativeCurrency,
        rpcUrls: [...arcMainnet.rpcUrls.default.http],
        blockExplorerUrls: [arcMainnet.blockExplorers.default.url],
      }],
    })
  }
}

const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export type AuthMethod = 'wallet' | 'social' | 'none'

export interface ArcWalletState {
  /** Endereço exibido (Privy embedded ou wagmi) */
  address: `0x${string}` | undefined
  /** Endereço Privy para assinar transações */
  signingAddress: `0x${string}` | undefined
  isConnected: boolean
  /** Mantido para compatibilidade — sempre false (auth é Privy-only) */
  hasBackendSession: boolean
  authMethod: AuthMethod
  isGoogleLogin: boolean
  pendingGoogleWallet: boolean
  hasEmbeddedWallet: boolean
  ready: boolean
  socialLabel: string | undefined
  socialAvatar: string | undefined
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  txHash: `0x${string}` | undefined
  error: Error | null
  getWalletClient: () => Promise<WalletClient | null>
  sendUsdc: (to: string, amountUsdc: string) => Promise<void>
  resetTx: () => void
  /**
   * Explicit, user-triggered fallback for when the page is already running
   * inside a wallet's own in-app browser (MetaMask, Trust, etc.) and going
   * through Privy's connect-wallet modal isn't reliable there (its iframe-based
   * auth can hang in restrictive in-app webviews). Talks to `window.ethereum`
   * directly. NEVER called automatically — only wire it to a button's onClick.
   * Times out on its own so it can never hang the UI forever.
   */
  connectInjected: () => Promise<void>
  /**
   * Explicit, user-triggered WalletConnect fallback — bypasses Privy's
   * connect-wallet modal entirely. Privy's modal runs inside a cross-origin
   * iframe (auth.privy.io); on mobile that iframe context can't reliably
   * trigger the OS-level deep link into a wallet app, so it hangs on
   * "Connecting...". This talks to `@walletconnect/ethereum-provider`
   * directly at the top level of the page — same tech, but the WalletConnect
   * modal it opens (via @reown/appkit) shows a real QR on desktop and a
   * proper "open in wallet app" deep link on mobile, exactly like most
   * dApps before Privy was introduced. NEVER called automatically.
   */
  connectWalletConnect: () => Promise<void>
}

/**
 * Identifica a embedded wallet do Privy (carteira operacional do agente).
 *
 * DESIGN: uma conta Privy = uma embedded wallet, sempre.
 * Outras redes sociais (Google, Discord, Twitter) devem ser VINCULADAS
 * via linkGoogle/linkDiscord/linkTwitter (usePrivy) — nunca como logins
 * separados, pois isso cria contas Privy distintas com wallets distintas.
 *
 * Se o diagnóstico (PrivyEmbeddedWalletBootstrapper) mostrar user.id
 * diferente por rede social, são CONTAS SEPARADAS — o Privy não as funde
 * retroativamente. Nesse caso, manter a conta que tem os fundos e
 * relinkar as redes nela.
 */
function isPrivyEmbeddedWallet(wallet: { walletClientType?: string; connectorType?: string }) {
  return (
    wallet.walletClientType === 'privy' ||
    wallet.walletClientType === 'privy-v2' ||
    wallet.connectorType === 'embedded'
  )
}

export function useArcWallet(): ArcWalletState {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount()
  const { writeContractAsync, isPending: wagmiPending, error: wagmiError, reset: wagmiReset } = useWriteContract()
  const wagmiConfig = useConfig()

  const { authenticated, user, ready } = usePrivy()
  const { wallets } = useWallets()
  const persistedPrivyAddress = usePersistedPrivyWalletAddress()

  const embeddedWallet = wallets.find(isPrivyEmbeddedWallet)
  const externalPrivyWallet = wallets.find((w) => !isPrivyEmbeddedWallet(w) && w.address)
  const signingPrivyWallet = externalPrivyWallet ?? embeddedWallet

  // @privy-io/wagmi's WagmiProvider syncs EVERY Privy wallet — including the embedded wallet
  // created for social/email logins — into wagmi as its own connector, then calls reconnect().
  // That means wagmiConnected can be true even when the user has no external wallet at all, and
  // (because reconnect() restores whichever connector wagmi's storage last marked "current")
  // it can end up pointing at a STALE connector from an earlier session — e.g. a real MetaMask
  // connection — instead of the embedded wallet's own provider. That mismatch is exactly what
  // pops a MetaMask prompt for a user who logged in via Google and never touched MetaMask.
  // Fix: only trust wagmi's connected address/connector when Privy itself reports a genuine
  // EXTERNAL wallet (one the user explicitly linked, not Privy-managed). Otherwise resolve the
  // address/signing method from Privy's own wallet list, which reflects the real session
  // regardless of wagmi's connector-reconciliation timing.
  const hasExternalWallet = !!externalPrivyWallet?.address
  const useWagmiForSigning = wagmiConnected && hasExternalWallet

  // Privy v3: user.google tem `email` e `name` (tipados), mas NÃO `picture`.
  // Google profile pictures não são expostos pela API do Privy v3.27.x.
  const googleAccount = user?.linkedAccounts?.find((a) => a.type === 'google_oauth') as
    | { email?: string; name?: string }
    | undefined

  // External-wallet fallback: only ever set by an explicit connectInjected()
  // or connectWalletConnect() call (see below) — never touched on mount,
  // never inferred from wagmi/Privy state. Both write into the same address/
  // pending/error state; `fallbackProviderRef` holds whichever raw EIP-1193
  // provider is actually behind it (window.ethereum, or the WalletConnect
  // EthereumProvider instance) so sendUsdc can sign through either uniformly.
  const [injectedAddress, setInjectedAddress] = useState<`0x${string}` | undefined>()
  const [injectedPending, setInjectedPending] = useState(false)
  const [injectedError, setInjectedError] = useState<Error | null>(null)
  const fallbackProviderRef = useRef<EIP1193Provider | null>(null)
  const hasFallbackConnection = !wagmiConnected && !authenticated && !!injectedAddress

  const signingAddress = useWagmiForSigning
    ? wagmiAddress
    : hasFallbackConnection
    ? injectedAddress
    : signingPrivyWallet?.address
    ? (signingPrivyWallet.address as `0x${string}`)
    : persistedPrivyAddress
    ? persistedPrivyAddress
    : undefined

  const address: `0x${string}` | undefined = useWagmiForSigning
    ? wagmiAddress
    : hasFallbackConnection
    ? injectedAddress
    : (embeddedWallet?.address as `0x${string}` | undefined) ??
      persistedPrivyAddress ??
      signingAddress ??
      (user?.wallet?.address as `0x${string}` | undefined)

  const isConnected = wagmiConnected || authenticated || hasFallbackConnection
  const hasEmbeddedWallet = !!embeddedWallet?.address
  const authMethod: AuthMethod = authenticated
    ? (hasExternalWallet ? 'wallet' : 'social')
    : (wagmiConnected || hasFallbackConnection ? 'wallet' : 'none')
  const pendingGoogleWallet = authenticated && !hasEmbeddedWallet && !wagmiConnected
  const isGoogleLogin = authMethod === 'social' && !!googleAccount

  const twitterAccount  = user?.linkedAccounts?.find((a) => a.type === 'twitter_oauth')
  const discordAccount  = user?.linkedAccounts?.find((a) => a.type === 'discord_oauth')
  const telegramAccount = user?.linkedAccounts?.find((a) => a.type === 'telegram')

  // user.google.name e user.google.email são os campos tipados corretos no Privy v3
  const socialLabel =
    authMethod === 'social'
      ? (user?.google?.name ??
          googleAccount?.email ??
          (user as { email?: { address?: string } })?.email?.address ??
          user?.twitter?.name ??
          ((twitterAccount as { username?: string })?.username
            ? `@${(twitterAccount as { username?: string }).username}`
            : undefined) ??
          ((telegramAccount as { username?: string })?.username
            ? `@${(telegramAccount as { username?: string }).username}`
            : undefined))
      : undefined

  const socialAvatar =
    authMethod === 'social'
      ? (// Google: Privy v3 não expõe foto — campos disponíveis são só email e name
         // Twitter / Discord / Telegram têm profilePictureUrl / avatarUrl / photoUrl
         (twitterAccount  as { profilePictureUrl?: string })?.profilePictureUrl ??
         (discordAccount  as { avatarUrl?: string })?.avatarUrl ??
         (telegramAccount as { photoUrl?: string })?.photoUrl ??
         undefined)
      : undefined

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [privyPending, setPrivyPending] = useState(false)
  const [privyError, setPrivyError] = useState<Error | null>(null)

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash, query: { enabled: !!txHash } })

  const isPending = hasFallbackConnection ? injectedPending : authMethod === 'wallet' ? wagmiPending : privyPending
  const error = hasFallbackConnection ? injectedError : authMethod === 'wallet' ? wagmiError : privyError

  const connectInjected = useCallback(async (): Promise<void> => {
    const eth = typeof window !== 'undefined' ? (window as any).ethereum : undefined
    if (!eth) throw new Error('No wallet provider found in this browser.')
    setInjectedPending(true)
    setInjectedError(null)
    try {
      const accounts = await withTimeout(
        eth.request({ method: 'eth_requestAccounts' }) as Promise<string[]>,
        15000,
        'Wallet did not respond in time. Try again or use another method.',
      )
      const raw = accounts?.[0]
      if (!raw) throw new Error('No account returned by the wallet.')
      fallbackProviderRef.current = eth
      setInjectedAddress(getAddress(raw) as `0x${string}`)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setInjectedError(e)
      throw e
    } finally {
      setInjectedPending(false)
    }
  }, [])

  const connectWalletConnect = useCallback(async (): Promise<void> => {
    if (!WALLETCONNECT_PROJECT_ID) {
      throw new Error('WalletConnect is not configured for this app.')
    }
    setInjectedPending(true)
    setInjectedError(null)
    try {
      const { EthereumProvider } = await import('@walletconnect/ethereum-provider')
      const provider = await EthereumProvider.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        optionalChains: [arcMainnet.id],
        rpcMap: { [arcMainnet.id]: arcMainnet.rpcUrls.default.http[0] },
        // Runs at the top level of our own page (not inside Privy's cross-origin
        // iframe), so its QR/deep-link modal (@reown/appkit) can actually trigger
        // the OS-level "open wallet app" hand-off on mobile, and return here after
        // the user approves — same flow most dApps used before Privy was added.
        showQrModal: true,
        metadata: {
          name: 'FajuARC',
          description: 'DeFi on Arc Mainnet - Swap, Pools',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://www.fajucar.xyz',
          icons: ['https://www.fajucar.xyz/favicon.ico'],
        },
      })
      await withTimeout(
        provider.connect({ optionalChains: [arcMainnet.id] }),
        120000,
        'Wallet connection timed out. Try again.',
      )
      const accounts = (await provider.enable()) as string[]
      const raw = accounts?.[0]
      if (!raw) throw new Error('No account returned by the wallet.')
      fallbackProviderRef.current = provider as unknown as EIP1193Provider
      setInjectedAddress(getAddress(raw) as `0x${string}`)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setInjectedError(e)
      throw e
    } finally {
      setInjectedPending(false)
    }
  }, [])

  const getWalletClient = useCallback(async (): Promise<WalletClient | null> => {
    const wallet = useWagmiForSigning ? null : signingPrivyWallet
    if (!wallet?.address) return null
    try {
      await wallet.switchChain(privyArcMainnet.id)
      const provider = await wallet.getEthereumProvider()
      return createWalletClient({
        account: wallet.address as `0x${string}`,
        chain: arcMainnet,
        transport: custom(provider),
      })
    } catch (err) {
      console.warn('[Privy] getWalletClient:', err)
      return null
    }
  }, [useWagmiForSigning, signingPrivyWallet])

  const signWithPrivy = async (
    fn: (client: WalletClient, account: `0x${string}`) => Promise<`0x${string}`>
  ) => {
    const wallet = signingPrivyWallet
    if (!wallet?.address) {
      throw new Error('Signing wallet not ready. Wait for the Privy wallet to finish setting up.')
    }
    setPrivyPending(true)
    setPrivyError(null)
    try {
      await wallet.switchChain(privyArcMainnet.id)
      const provider = await wallet.getEthereumProvider()
      const client = createWalletClient({
        account: wallet.address as `0x${string}`,
        chain: arcMainnet,
        transport: custom(provider),
      })
      const hash = await fn(client, wallet.address as `0x${string}`)
      setTxHash(hash)
      return hash
    } catch (err) {
      setPrivyError(err instanceof Error ? err : new Error(String(err)))
      throw err
    } finally {
      setPrivyPending(false)
    }
  }

  const sendUsdc = async (to: string, amountUsdc: string) => {
    if (!CONSTANTS.USDC_ADDRESS || CONSTANTS.USDC_ADDRESS === '0x0000000000000000000000000000000000000000') {
      throw new Error('USDC contract address not configured')
    }

    const amount = parseUnits(amountUsdc, 6)

    if (hasFallbackConnection && injectedAddress) {
      const provider = fallbackProviderRef.current
      if (!provider) throw new Error('No wallet connected')
      setInjectedPending(true)
      setInjectedError(null)
      try {
        try {
          await ensureInjectedChain(provider)
        } catch (err) {
          throw new WrongNetworkError(err) // refused or unsupported → "Switch your wallet to Arc Mainnet"
        }
        const client = createWalletClient({
          account: injectedAddress,
          chain: arcMainnet,
          transport: custom(provider),
        })
        const hash = await client.writeContract({
          address: CONSTANTS.USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'transfer',
          args: [to as `0x${string}`, amount],
          account: injectedAddress,
          chain: arcMainnet,
        })
        setTxHash(hash)
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        setInjectedError(e)
        throw e
      } finally {
        setInjectedPending(false)
      }
    } else if (authMethod === 'wallet' && wagmiAddress) {
      // External wallet may be on another network: switch to Arc or stop, and pin chainId.
      await ensureWalletOnArc(wagmiConfig)
      const hash = await writeContractAsync({
        address: CONSTANTS.USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [to as `0x${string}`, amount],
        chainId: ARC_CHAIN_ID,
      })
      setTxHash(hash)
    } else if (signingPrivyWallet) {
      await signWithPrivy((client, account) =>
        client.writeContract({
          address: CONSTANTS.USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'transfer',
          args: [to as `0x${string}`, amount],
          account,
          chain: arcMainnet,
        })
      )
    } else {
      throw new Error('No wallet connected')
    }
  }

  const resetTx = () => {
    setTxHash(undefined)
    setPrivyError(null)
    setInjectedError(null)
    if (authMethod === 'wallet') wagmiReset()
  }

  return {
    address,
    signingAddress,
    isConnected,
    hasBackendSession: false,
    authMethod,
    isGoogleLogin,
    pendingGoogleWallet,
    hasEmbeddedWallet,
    ready,
    socialLabel,
    socialAvatar,
    isPending,
    isConfirming,
    isSuccess,
    txHash,
    error: error ?? null,
    getWalletClient,
    sendUsdc,
    resetTx,
    connectInjected,
    connectWalletConnect,
  }
}
