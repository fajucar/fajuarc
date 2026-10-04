import { useState, useEffect, useCallback } from 'react'
import { usePublicClient, useChainId } from 'wagmi'
import { useArcWallet } from '@/hooks/useArcWallet'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { Droplet, Loader2, AlertCircle, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
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

function formatWalletShort(addr: string): string {
  if (addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export type FaucetPanelVariant = 'compact' | 'normal'

interface FaucetPanelProps {
  variant?: FaucetPanelVariant
}

const COOLDOWN_MS = 24 * 60 * 60 * 1000

function claimKey(symbol: string, address: string) {
  return `claim_${symbol.toLowerCase()}_${address.toLowerCase()}`
}

function saveClaimTimestamp(symbol: string, address: string) {
  try { localStorage.setItem(claimKey(symbol, address), String(Date.now())) } catch { /* noop */ }
}

function loadClaimTimestamp(symbol: string, address: string): number | null {
  try {
    const raw = localStorage.getItem(claimKey(symbol, address))
    return raw ? parseInt(raw, 10) : null
  } catch { return null }
}

function CircleGoogleFaucet({ address, variant }: { address: string; variant: FaucetPanelVariant }) {
  const [copied, setCopied] = useState(false)
  const isCompact = variant === 'compact'

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      toast.success('Address copied!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  return (
    <div className={`space-y-3 ${isCompact ? '' : 'space-y-4'}`}>
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3">
        <p className="text-xs text-slate-400 mb-1">Your wallet:</p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-mono text-white font-medium">
            {formatWalletShort(address)}
          </p>
          <button
            type="button"
            onClick={copyAddress}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-600/60 bg-slate-700/40 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700/70 transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            Copy
          </button>
        </div>
      </div>

      <div className={`grid gap-2 ${isCompact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 transition-colors"
        >
          🌐 Circle Faucet - 20 USDC
        </a>
        <a
          href="https://thirdweb.com/arc-testnet"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2.5 text-sm font-semibold text-white hover:border-cyan-500/30 hover:bg-slate-800/60 transition-colors"
        >
          ⚡ Thirdweb Bridge
        </a>
      </div>

      <p className="text-[11px] text-slate-500 text-center leading-relaxed">
        Paste your address into the faucet to receive test tokens
      </p>
    </div>
  )
}

export function FaucetPanel({ variant = 'normal' }: FaucetPanelProps) {
  const { address, isConnected, authMethod, pendingGoogleWallet, hasEmbeddedWallet } = useArcWallet()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useArcWriteContract()

  const [claimingToken, setClaimingToken] = useState<string | null>(null)
  const [remainingByToken, setRemainingByToken] = useState<Record<string, number>>({})
  const [endsAtByToken, setEndsAtByToken] = useState<Record<string, number>>({})
  const [countdownByToken, setCountdownByToken] = useState<Record<string, string>>({})

  const isPrivyUser = authMethod === 'social' && hasEmbeddedWallet && !pendingGoogleWallet
  const isCircleWallet = pendingGoogleWallet
  const isWrongChain = !isPrivyUser && !isCircleWallet && chainId != null && chainId !== ARC_TESTNET_CHAIN_ID

  useEffect(() => {
    if (!address) return
    const restoredRemaining: Record<string, number> = {}
    const restoredEndsAt: Record<string, number> = {}
    for (const t of FAUCET_TOKENS) {
      const ts = loadClaimTimestamp(t.symbol, address)
      if (ts) {
        const endTime = ts + COOLDOWN_MS
        const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000))
        if (remaining > 0) {
          restoredRemaining[t.symbol] = remaining
          restoredEndsAt[t.symbol] = endTime
        }
      }
    }
    if (Object.keys(restoredRemaining).length > 0) {
      setRemainingByToken(prev => ({ ...prev, ...restoredRemaining }))
      setEndsAtByToken(prev => ({ ...prev, ...restoredEndsAt }))
    }
  }, [address])

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
    if (!isConnected || isWrongChain || isCircleWallet) {
      if (!isCircleWallet) {
        setRemainingByToken({})
        setEndsAtByToken({})
        setCountdownByToken({})
      }
      return
    }
    fetchRemaining()
  }, [isConnected, isWrongChain, isCircleWallet, address, chainId, fetchRemaining])

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
    if (!address) {
      toast.error('Connect your wallet')
      return
    }
    if (isWrongChain) {
      toast.error('Connect to Arc Testnet')
      return
    }
    const token = FAUCET_TOKENS.find((t) => t.symbol === tokenSymbol)
    if (!token) return
    const rem = remainingByToken[tokenSymbol] ?? 0
    if (rem > 0) {
      toast.error('Cooldown active. Wait for the countdown.')
      return
    }
    setClaimingToken(tokenSymbol)
    const toastId = toast.loading('Sending claim...')
    try {
      await writeContractAsync({
        address: FAUCET_ADDRESS,
        abi: FAUCET_ABI as any,
        functionName: 'claim',
        args: [token.address],
      })
      saveClaimTimestamp(tokenSymbol, address)
      const endTime = Date.now() + COOLDOWN_MS
      setRemainingByToken(prev => ({ ...prev, [tokenSymbol]: Math.floor(COOLDOWN_MS / 1000) }))
      setEndsAtByToken(prev => ({ ...prev, [tokenSymbol]: endTime }))
      toast.success('Claim confirmed! ✅', { id: toastId })
      fetchRemaining()
    } catch (err: unknown) {
      const msg =
        (err as { shortMessage?: string; message?: string })?.shortMessage ||
        (err as { message?: string })?.message ||
        'Claim failed'
      if (/rejected|denied|user denied/i.test(msg)) {
        toast.error('Transaction cancelled', { id: toastId })
      } else if (/cooldown|wait/i.test(msg)) {
        toast.error('Cooldown still active', { id: toastId })
      } else if (/empty|vazio|insufficient/i.test(msg)) {
        toast.error('Faucet is empty', { id: toastId })
      } else {
        toast.error(msg.slice(0, 100), { id: toastId })
      }
    } finally {
      setClaimingToken(null)
    }
  }

  const isAnyClaiming = isPending

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-4 text-center">
        <Droplet className="h-10 w-10 text-slate-500 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">Connect your wallet to use the faucet</p>
      </div>
    )
  }

  if (isWrongChain) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-amber-200 text-sm">Wrong network</p>
          <p className="text-xs text-amber-200/90 mt-0.5">
            Connect to Arc Testnet to claim FAJU and ARCX.
          </p>
        </div>
      </div>
    )
  }

  if (isCircleWallet && address) {
    return <CircleGoogleFaucet address={address} variant={variant} />
  }

  const isCompact = variant === 'compact'

  return (
    <div className={isCompact ? 'space-y-2' : 'space-y-4'}>
      {FAUCET_TOKENS.map((token) => {
        const rem = remainingByToken[token.symbol] ?? 0
        const canClaim = rem === 0
        const countdown = countdownByToken[token.symbol] ?? '00:00:00'
        const isThisClaiming = isAnyClaiming && claimingToken === token.symbol

        return (
          <div
            key={token.symbol}
            className={`rounded-lg border border-slate-700/40 bg-slate-800/20 flex flex-col gap-2 ${
              isCompact ? 'p-2.5' : 'p-4'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className={`font-semibold text-white shrink-0 ${isCompact ? 'text-xs' : ''}`}>
                Claim {token.claimAmount} {token.symbol}
              </h3>
              {!canClaim && (
                <span className="text-[11px] text-slate-400 shrink-0 whitespace-nowrap">
                  Cooldown · <span className="font-mono text-slate-300">{countdown}</span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleClaim(token.symbol)}
              disabled={!canClaim || isAnyClaiming}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-700 text-white transition-colors ${
                isCompact ? 'px-3 py-2 min-h-[40px] text-xs' : 'px-4 py-2.5 min-h-[44px]'
              }`}
            >
              {isThisClaiming ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : !canClaim ? (
                <span className="text-xs">✓ Claimed</span>
              ) : (
                <Droplet className="h-4 w-4 shrink-0" />
              )}
              {!canClaim ? `${token.symbol} on cooldown` : `Claim ${token.claimAmount} ${token.symbol}`}
            </button>
          </div>
        )
      })}
    </div>
  )
}
