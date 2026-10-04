import { useState, useEffect } from 'react'
import { isAddress, getAddress, formatUnits } from 'viem'
import {
  Send, Loader2, CheckCircle2, AlertCircle, Wallet,
  Copy, Check, QrCode, Twitter, MessageCircle, Share2,
  ArrowDownToLine, ArrowUpFromLine, ChevronDown,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'react-qr-code'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import { usePublicClient } from 'wagmi'
import { CONSTANTS } from '@/config/constants'
import { ARC_MAINNET_TOKENS } from '@/config/tokens.arc-mainnet'
import { useGasPrice } from '@/hooks/useGasPrice'
import { useArcWallet } from '@/hooks/useArcWallet'
import { useWalletModal } from '@/contexts/WalletModalContext'
import { isInjectedWalletBrowser } from '@/utils/device'
import { TokenSelectModal, type TokenSelectItem } from '@/components/TokenSelect/TokenSelectModal'
import { WrongNetworkNotice } from '@/components/Web3/WrongNetworkNotice'

type Tab = 'send' | 'receive'
type Token = (typeof ARC_MAINNET_TOKENS)[number]
const DEFAULT_TOKEN = ARC_MAINNET_TOKENS[0]

const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const TOKEN_SELECT_ITEMS: TokenSelectItem[] = ARC_MAINNET_TOKENS.map((t) => ({
  address: t.address,
  symbol: t.symbol,
  name: t.name,
  decimals: t.decimals,
}))

function findTokenBySymbol(symbol: string | null): Token {
  if (!symbol) return DEFAULT_TOKEN
  return ARC_MAINNET_TOKENS.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase()) ?? DEFAULT_TOKEN
}

function truncate(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatBalanceDisplay(value: string): string {
  const n = parseFloat(value || '0')
  if (Number.isNaN(n)) return '0.0000'
  return n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

function buildPaymentLink(address: string, amount: string, note: string, tokenSymbol?: string) {
  const base = window.location.origin + window.location.pathname
  const params = new URLSearchParams()
  params.set('to', address)
  if (amount) params.set('amount', amount)
  if (note) params.set('note', note)
  if (tokenSymbol) params.set('token', tokenSymbol)
  return `${base}?${params.toString()}`
}

function socialShareUrls(link: string, amount: string, note: string, symbol: string) {
  const noteText = note ? ` for "${note}"` : ''
  const amountText = amount ? `$${amount} ${symbol}` : `some ${symbol}`
  const text = `Send me ${amountText}${noteText} on Arc Network (instant + stable fees) 💸`
  return {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text + '\n' + link)}`,
  }
}

function txShareUrls(hash: string, amount: string, to: string, symbol: string) {
  const explorerLink = `${CONSTANTS.LINKS.explorer}/tx/${hash}`
  const text = `Just sent ${amount ? `$${amount} ${symbol}` : symbol} to ${truncate(to)} on Arc Network — instant finality, predictable fees! ⚡`
  return {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(explorerLink)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(explorerLink)}&text=${encodeURIComponent(text)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text + '\n' + explorerLink)}`,
  }
}

function TokenButton({ token, onClick }: { token: Token; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 border border-slate-700 bg-slate-800/60 rounded-xl px-3 py-2 hover:border-cyan-500/40 transition-all"
    >
      <span className="text-sm leading-none">{token.flag}</span>
      <span className="text-xs font-semibold text-cyan-400">{token.symbol}</span>
      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
    </button>
  )
}

function handleTokenPick(
  item: TokenSelectItem,
  setSelectedToken: (t: Token) => void,
) {
  const token = ARC_MAINNET_TOKENS.find((t) => t.address === item.address) ?? DEFAULT_TOKEN
  setSelectedToken(token)
  if (token.symbol !== 'USDC') {
    toast(`Direct send for ${token.symbol} coming soon — use Swap for now`, { icon: 'ℹ️' })
  }
}

// ──────────────────────────────────────────────────
// Connect chooser — shown only after the page has fully rendered, and only
// acts on explicit tap. Never called on mount / auto-triggered.
// ──────────────────────────────────────────────────
function ConnectChooser({ label }: { label: string }) {
  const { openModal } = useWalletModal()
  const { connectInjected } = useArcWallet()
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  // Computed at render time (CSR-only app, no SSR) — same pattern as
  // isMobileDevice() elsewhere in the codebase.
  const inWalletBrowser = isInjectedWalletBrowser()

  const handleConnectInjected = async () => {
    setConnecting(true)
    setConnectError(null)
    try {
      await connectInjected()
    } catch (err: any) {
      setConnectError(err?.message || 'Could not connect. Try again or use another method.')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="text-center py-8 space-y-3">
      <p className="text-slate-400 text-sm">{label}</p>
      <div className="space-y-2 max-w-xs mx-auto">
        {inWalletBrowser && (
          <button
            type="button"
            onClick={handleConnectInjected}
            disabled={connecting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {connecting ? 'Connecting…' : 'Connect this wallet'}
          </button>
        )}
        <button
          type="button"
          onClick={openModal}
          className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-slate-200 hover:border-cyan-500/40 hover:bg-slate-800/80 transition-all"
        >
          {inWalletBrowser ? 'Use social login instead' : 'Choose how to pay'}
        </button>
      </div>
      {connectError && (
        <p className="text-xs text-red-400 max-w-xs mx-auto">{connectError}</p>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────
// Send Tab
// ──────────────────────────────────────────────────
function SendTab({ initialRecipient }: { initialRecipient?: string }) {
  const [searchParams] = useSearchParams()
  const publicClient = usePublicClient({ chainId: CONSTANTS.ARC_MAINNET_CHAIN_ID }) // pinned to Arc, never the wallet's current network
  const { data: gasPrice } = useGasPrice()
  const {
    address, isConnected, isPending, isConfirming, isSuccess, txHash: hash, error, sendUsdc, resetTx,
  } = useArcWallet()

  const [recipient, setRecipient] = useState(initialRecipient ?? '')
  const [amount, setAmount] = useState(searchParams.get('amount') ?? '')
  const [note, setNote] = useState(searchParams.get('note') ?? '')
  const [selectedToken, setSelectedToken] = useState<Token>(() => findTokenBySymbol(searchParams.get('token')))
  const [tokenModalOpen, setTokenModalOpen] = useState(false)
  const [balance, setBalance] = useState('')

  useEffect(() => {
    if (!address || !publicClient) {
      setBalance('')
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const raw = (await publicClient.readContract({
          address: selectedToken.address,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [address],
        })) as bigint
        if (!cancelled) setBalance(formatUnits(raw, selectedToken.decimals))
      } catch {
        if (!cancelled) setBalance('0')
      }
    }
    load()
    return () => { cancelled = true }
  }, [address, publicClient, selectedToken])

  const handleSend = async () => {
    if (selectedToken.symbol !== 'USDC') {
      toast.error(`Direct send for ${selectedToken.symbol} coming soon — use Swap for now`)
      return
    }
    if (!isAddress(recipient)) {
      toast.error('Invalid recipient address')
      return
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Invalid amount')
      return
    }
    try {
      await sendUsdc(recipient, amount)
      toast.success('Transaction sent!')
    } catch (err: any) {
      if (!err?.message?.toLowerCase().includes('cancel')) {
        toast.error(err?.message || 'Transaction failed')
      }
    }
  }

  const handleReset = () => {
    resetTx()
    setRecipient('')
    setAmount('')
    setNote('')
    setSelectedToken(DEFAULT_TOKEN)
  }

  if (!isConnected) {
    return <ConnectChooser label="Choose how you'd like to pay" />
  }

  if (isSuccess && hash) {
    const shares = txShareUrls(hash, amount, recipient, selectedToken.symbol)
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="space-y-4"
      >
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="rounded-full bg-green-500/20 p-3">
            <CheckCircle2 className="h-8 w-8 text-green-400" />
          </div>
          <p className="font-bold text-green-400">Transaction confirmed!</p>
          <a
            href={`${CONSTANTS.LINKS.explorer}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-cyan-300 hover:underline break-all text-center"
          >
            {hash.slice(0, 18)}...{hash.slice(-10)}
          </a>
        </div>

        <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 space-y-2">
          <p className="text-xs text-slate-400 font-medium text-center mb-3">Share on social media</p>
          <div className="grid grid-cols-3 gap-2">
            <a
              href={shares.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-700/50 bg-slate-800/60 p-3 hover:border-cyan-500/40 hover:bg-slate-700/60 transition-all"
            >
              <Twitter className="h-5 w-5 text-sky-400" />
              <span className="text-xs text-slate-300">Twitter</span>
            </a>
            <a
              href={shares.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-700/50 bg-slate-800/60 p-3 hover:border-cyan-500/40 hover:bg-slate-700/60 transition-all"
            >
              <MessageCircle className="h-5 w-5 text-blue-400" />
              <span className="text-xs text-slate-300">Telegram</span>
            </a>
            <a
              href={shares.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-700/50 bg-slate-800/60 p-3 hover:border-cyan-500/40 hover:bg-slate-700/60 transition-all"
            >
              <Share2 className="h-5 w-5 text-green-400" />
              <span className="text-xs text-slate-300">WhatsApp</span>
            </a>
          </div>
        </div>

        <button
          onClick={handleReset}
          className="w-full rounded-xl border border-slate-700/60 bg-slate-800/40 py-3 text-sm text-slate-300 hover:bg-slate-700/60 transition-all"
        >
          New transaction
        </button>
      </motion.div>
    )
  }

  return (
    <div className="space-y-3">
      <WrongNetworkNotice />

      {/* Recipient */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Recipient</label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x... wallet address"
          className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
        />
      </div>

      {/* Amount */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Amount ({selectedToken.symbol})</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0"
            className="flex-1 min-w-0 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
          />
          <TokenButton token={selectedToken} onClick={() => setTokenModalOpen(true)} />
        </div>
        {address && (
          <p className="mt-1.5 text-xs text-slate-500">
            Balance: <span className="font-mono text-cyan-400/80">{formatBalanceDisplay(balance)} {selectedToken.symbol}</span>
          </p>
        )}
      </div>

      {/* Note */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Note <span className="text-slate-600">(optional)</span></label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. lunch, coffee, service..."
          className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
        />
      </div>

      {/* Gas Info */}
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 px-4 py-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-slate-500">Gas </span>
            <span className="text-slate-300 font-mono">{gasPrice?.formatted || '...'}</span>
          </div>
          <div className="w-px h-3 bg-slate-700" />
          <div>
            <span className="text-slate-500">Finality </span>
            <span className="text-cyan-400 font-semibold">&lt; 1s</span>
          </div>
        </div>
        <div className="text-yellow-400/70 text-[10px] hidden sm:block">⚡ Arc Mainnet</div>
      </div>

      {/* Send Button */}
      <button
        onClick={handleSend}
        disabled={isPending || isConfirming || !recipient || !amount || selectedToken.symbol !== 'USDC'}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3.5 font-semibold text-sm text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/35 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {isPending || isConfirming ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {isPending ? 'Confirm in wallet...' : 'Confirming...'}
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Send {selectedToken.symbol}
          </>
        )}
      </button>

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400 leading-relaxed">{error.message}</p>
        </div>
      )}

      <TokenSelectModal
        isOpen={tokenModalOpen}
        onClose={() => setTokenModalOpen(false)}
        tokens={TOKEN_SELECT_ITEMS}
        onSelect={(item) => handleTokenPick(item, setSelectedToken)}
        title="Select token to send"
      />
    </div>
  )
}

// ──────────────────────────────────────────────────
// Receive Tab
// ──────────────────────────────────────────────────
function ReceiveTab() {
  const { address, isConnected } = useArcWallet()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [selectedToken, setSelectedToken] = useState<Token>(DEFAULT_TOKEN)
  const [tokenModalOpen, setTokenModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)

  const paymentLink = address ? buildPaymentLink(address, amount, note, selectedToken.symbol) : ''
  const shares = address ? socialShareUrls(paymentLink, amount, note, selectedToken.symbol) : null

  const handleCopy = async () => {
    if (!paymentLink) return
    await navigator.clipboard.writeText(paymentLink)
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isConnected) {
    return <ConnectChooser label="Connect to generate your payment link" />
  }

  return (
    <div className="space-y-3">
      {/* Address display */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
        <p className="text-xs text-slate-500 mb-1">Your wallet</p>
        <p className="font-mono text-sm text-cyan-300 break-all">{address}</p>
      </div>

      {/* Amount (optional) */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Amount <span className="text-slate-600">(optional)</span></label>
        <div className="flex gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0"
            className="flex-1 min-w-0 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
          />
          <TokenButton token={selectedToken} onClick={() => setTokenModalOpen(true)} />
        </div>
      </div>

      {/* Note */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Note <span className="text-slate-600">(optional)</span></label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. lunch, coffee, service..."
          className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
        />
      </div>

      {/* Payment link */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-400 font-medium">Payment link ({selectedToken.symbol})</p>
          <button
            onClick={() => setShowQr(!showQr)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <QrCode className="h-3.5 w-3.5" />
            QR
          </button>
        </div>
        <p className="font-mono text-xs text-slate-300 break-all leading-relaxed line-clamp-2">{paymentLink}</p>

        <AnimatePresence>
          {showQr && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex justify-center">
                <div className="rounded-lg border border-slate-700/60 bg-white p-2">
                  <QRCode value={paymentLink} size={150} style={{ width: '100%', height: 'auto', maxWidth: '150px' }} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Copy button */}
      <button
        onClick={handleCopy}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/40 py-3 text-sm text-slate-300 hover:bg-slate-700/60 hover:border-cyan-500/30 transition-all"
      >
        {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied!' : 'Copy link'}
      </button>

      {/* Social share */}
      {shares && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 text-center">Share and request via</p>
          <div className="grid grid-cols-3 gap-2">
            <a
              href={shares.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-700/50 bg-slate-800/60 p-3 hover:border-sky-500/40 hover:bg-slate-700/60 transition-all group"
            >
              <Twitter className="h-5 w-5 text-sky-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs text-slate-300">Twitter</span>
            </a>
            <a
              href={shares.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-700/50 bg-slate-800/60 p-3 hover:border-blue-500/40 hover:bg-slate-700/60 transition-all group"
            >
              <MessageCircle className="h-5 w-5 text-blue-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs text-slate-300">Telegram</span>
            </a>
            <a
              href={shares.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-700/50 bg-slate-800/60 p-3 hover:border-green-500/40 hover:bg-slate-700/60 transition-all group"
            >
              <Share2 className="h-5 w-5 text-green-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs text-slate-300">WhatsApp</span>
            </a>
          </div>
        </div>
      )}

      <TokenSelectModal
        isOpen={tokenModalOpen}
        onClose={() => setTokenModalOpen(false)}
        tokens={TOKEN_SELECT_ITEMS}
        onSelect={(item) => setSelectedToken(ARC_MAINNET_TOKENS.find((t) => t.address === item.address) ?? DEFAULT_TOKEN)}
        title="Select token to receive"
      />
    </div>
  )
}

// ──────────────────────────────────────────────────
// Main PaymentCard
// ──────────────────────────────────────────────────
function InvalidPaymentLink() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      <div className="rounded-2xl border border-red-500/20 bg-slate-900/60 backdrop-blur-xl p-8 shadow-2xl text-center space-y-3">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="h-7 w-7 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-white">Invalid payment link</h2>
        <p className="text-sm text-slate-400 max-w-sm mx-auto">
          This link is missing a valid wallet address. Ask the sender for a new payment link.
        </p>
      </div>
    </motion.div>
  )
}

const ADDRESS_FORMAT_REGEX = /^0x[a-fA-F0-9]{40}$/

export function PaymentCard() {
  const [searchParams] = useSearchParams()
  const to = searchParams.get('to')
  const toMatchesFormat = !!to && ADDRESS_FORMAT_REGEX.test(to)

  let normalizedTo: string | null = null
  if (toMatchesFormat && to) {
    try {
      normalizedTo = getAddress(to)
    } catch {
      normalizedTo = to
    }
  }

  const [tab, setTab] = useState<Tab>('send')

  const incomingAmount = searchParams.get('amount')
  const incomingNote = searchParams.get('note')
  const incomingToken = findTokenBySymbol(searchParams.get('token'))

  if (!toMatchesFormat) {
    return <InvalidPaymentLink />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      <div className="rounded-2xl border border-cyan-500/20 bg-slate-900/60 backdrop-blur-xl p-5 shadow-2xl shadow-amber-500/5">
        {/* Payment request banner */}
        {to && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3"
          >
            <p className="text-xs text-yellow-300 font-medium">
              💰 Payment request received
              {incomingAmount && <span className="font-bold"> · ${incomingAmount} {incomingToken.symbol}</span>}
              {incomingNote && <span className="text-yellow-200/70"> · "{incomingNote}"</span>}
            </p>
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex rounded-xl bg-slate-800/60 p-1 mb-5 gap-1">
          <button
            onClick={() => setTab('send')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
              tab === 'send'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Send
          </button>
          <button
            onClick={() => setTab('receive')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
              tab === 'receive'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowDownToLine className="h-4 w-4" />
            Receive
          </button>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: tab === 'send' ? -10 : 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tab === 'send' ? 10 : -10 }}
            transition={{ duration: 0.15 }}
          >
            {tab === 'send' ? <SendTab initialRecipient={normalizedTo ?? undefined} /> : <ReceiveTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
