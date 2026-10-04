import { useState, useEffect, useCallback } from 'react'
import { usePublicClient, useChainId } from 'wagmi'
import { useArcWallet } from '@/hooks/useArcWallet'
import { useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom } from 'viem'
import { Droplet, Loader2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { arcTestnet } from '@/config/chains'
import {
  FAUCET_ADDRESS,
  FAUCET_ABI,
  FAUCET_TOKENS,
  ARC_TESTNET_CHAIN_ID,
} from '@/config/faucet.arc-testnet'

function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return '00:00:00'
  const h = Math.floor(secondsLeft / 3600)
  const m = Math.floor((secondsLeft % 3600) / 60)
  const s = secondsLeft % 60
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0'),
  ].join(':')
}

export function FaucetClaim() {
  const { address, isConnected } = useArcWallet()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { wallets } = useWallets()

  const isWrongChain = chainId != null && chainId !== ARC_TESTNET_CHAIN_ID
  const [isClaiming, setIsClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  const [remainingByToken, setRemainingByToken] = useState<Record<string, number>>({})
  const [endsAtByToken, setEndsAtByToken] = useState<Record<string, number>>({})
  const [countdownByToken, setCountdownByToken] = useState<Record<string, string>>({})

  const fetchRemaining = useCallback(async () => {
    if (!address || !publicClient) {
      setRemainingByToken({})
      setEndsAtByToken({})
      return
    }
    const now = Date.now()
    const next: Record<string, number> = {}
    const endsAt: Record<string, number> = {}
    for (const t of FAUCET_TOKENS) {
      try {
        const rem = (await publicClient.readContract({
          address: FAUCET_ADDRESS,
          abi: FAUCET_ABI,
          functionName: 'remaining',
          args: [address, t.address],
        })) as bigint
        const sec = Number(rem)
        next[t.symbol] = sec
        endsAt[t.symbol] = sec > 0 ? now + sec * 1000 : 0
      } catch {
        next[t.symbol] = 0
        endsAt[t.symbol] = 0
      }
    }
    setRemainingByToken(next)
    setEndsAtByToken(endsAt)
  }, [address, publicClient])

  useEffect(() => {
    if (!isConnected || isWrongChain) {
      setRemainingByToken({})
      setEndsAtByToken({})
      setCountdownByToken({})
      return
    }
    fetchRemaining()
  }, [isConnected, isWrongChain, address, chainId, fetchRemaining])

  useEffect(() => {
    if (!Object.keys(endsAtByToken).length) return
    const tick = () => {
      const now = Date.now()
      const next: Record<string, string> = {}
      for (const t of FAUCET_TOKENS) {
        const end = endsAtByToken[t.symbol] ?? 0
        if (end <= 0) {
          next[t.symbol] = '00:00:00'
          continue
        }
        const secLeft = Math.max(0, Math.floor((end - now) / 1000))
        next[t.symbol] = formatCountdown(secLeft)
      }
      setCountdownByToken((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endsAtByToken])

  const handleClaim = async (tokenSymbol: string) => {
    if (!address) { toast.error('Connect your wallet'); return }
    if (isWrongChain) { toast.error('Connect to Arc Testnet'); return }

    const token = FAUCET_TOKENS.find((t) => t.symbol === tokenSymbol)
    if (!token) return

    const rem = remainingByToken[tokenSymbol] ?? 0
    if (rem > 0) { toast.error('Cooldown active. Wait for the countdown.'); return }

    // Guard: usar SEMPRE a embedded wallet do Privy (não wallets[0], que é order-dependent)
    const wallet =
      wallets.find((w) => w.walletClientType === 'privy' || w.walletClientType === 'privy-v2' || w.connectorType === 'embedded') ??
      wallets[0]
    if (!wallet) {
      console.error('No wallet found')
      toast.error('No wallet found')
      return
    }

    setIsClaiming(true)
    setClaimError(null)
    const toastId = toast.loading('Sending claim...')

    try {
      // Get provider with error handling
      const provider = await wallet.getEthereumProvider()

      // Guard: check provider exists
      if (!provider) {
        console.error('Provider is undefined')
        toast.error('Wallet provider not available', { id: toastId })
        setIsClaiming(false)
        return
      }

      // Switch to Arc Testnet first
      await wallet.switchChain(ARC_TESTNET_CHAIN_ID)

      const walletClient = createWalletClient({
        account: wallet.address as `0x${string}`,
        transport: custom(provider),
        chain: arcTestnet,
      })

      // Debug: log tokenConfig and balance before claiming
      if (publicClient) {
        try {
          const config = await publicClient.readContract({
            address: FAUCET_ADDRESS,
            abi: [...FAUCET_ABI, {
              name: 'tokenConfigs', type: 'function', stateMutability: 'view',
              inputs: [{ name: 'token', type: 'address' }],
              outputs: [
                { name: 'claimAmount', type: 'uint256' },
                { name: 'cooldown', type: 'uint256' },
                { name: 'enabled', type: 'bool' },
              ],
            }] as any,
            functionName: 'tokenConfigs',
            args: [token.address],
          })
          const bal = await publicClient.readContract({
            address: token.address,
            abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }] as any,
            functionName: 'balanceOf',
            args: [FAUCET_ADDRESS],
          })
          console.log('[Faucet] tokenConfig:', config)
          console.log('[Faucet] balanceOf faucet:', bal?.toString())
        } catch (e) {
          console.warn('[Faucet] debug read error:', e)
        }

        await publicClient.simulateContract({
          address: FAUCET_ADDRESS,
          abi: FAUCET_ABI,
          functionName: 'claim',
          args: [token.address],
          account: wallet.address as `0x${string}`,
        })
      }

      const tx = await walletClient.writeContract({
        address: FAUCET_ADDRESS,
        abi: FAUCET_ABI,
        functionName: 'claim',
        args: [token.address],
      })

      console.log('Claim tx:', tx)
      toast.success('Claim confirmed! ✅', { id: toastId })
      fetchRemaining()
    } catch (err: unknown) {
      console.error('Claim failed:', err)

      const raw = err as { shortMessage?: string; message?: string; cause?: { reason?: string; message?: string } }
      const msg =
        raw?.cause?.reason ||
        raw?.shortMessage ||
        raw?.cause?.message ||
        raw?.message ||
        'Claim failed'

      console.error('[Faucet] claim error:', msg, err)

      // Show error message to user instead of infinite spinner
      setClaimError(String(err))

      if (/rejected|denied/i.test(msg)) toast.error('Transaction cancelled', { id: toastId })
      else if (/cooldown|wait/i.test(msg)) toast.error('Cooldown still active', { id: toastId })
      else if (/empty|vazio|insufficient|balance/i.test(msg)) toast.error('Faucet has no balance', { id: toastId })
      else if (/not.*support|not.*register|invalid.*token/i.test(msg)) toast.error('Token not supported by the faucet', { id: toastId })
      else toast.error(msg.slice(0, 120), { id: toastId })
    } finally {
      // CRITICAL: Always stop the loading spinner
      setIsClaiming(false)
    }
  }

  const isLoading = isClaiming

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-slate-700/40 bg-slate-800/20 p-6 text-center">
        <Droplet className="h-12 w-12 text-slate-500 mx-auto mb-3" />
        <p className="text-slate-400">Connect your wallet to use the faucet</p>
      </div>
    )
  }

  if (isWrongChain) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-amber-200">Wrong network</p>
          <p className="text-sm text-amber-200/90 mt-1">
            Connect to <strong>Arc Testnet</strong> (Chain ID 5042002) to claim FAJU and ARCX.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {claimError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-200">Claim Error</p>
            <p className="text-sm text-red-200/90 mt-1">{claimError}</p>
            <button
              onClick={() => setClaimError(null)}
              className="text-xs text-red-300 hover:text-red-200 mt-2 underline"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {FAUCET_TOKENS.map((token) => {
        const rem = remainingByToken[token.symbol] ?? 0
        const canClaim = rem === 0
        const countdown = countdownByToken[token.symbol] ?? '00:00:00'

        return (
          <div
            key={token.symbol}
            className="rounded-2xl border border-slate-700/40 bg-slate-800/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <h3 className="font-semibold text-white">Claim {token.claimAmount} {token.symbol}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                24h cooldown between claims
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              {!canClaim && (
                <span className="text-sm text-slate-300 font-mono">
                  Next in {countdown}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleClaim(token.symbol)}
                disabled={!canClaim || isLoading}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-700 text-white transition-colors"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Droplet className="h-4 w-4" />
                )}
                Claim {token.claimAmount} {token.symbol}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
