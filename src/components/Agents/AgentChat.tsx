/**
 * AgentChat — conversational AI chat with on-chain execution.
 *
 * Message flow:
 *  1. User types → POST /api/agent/chat with full Anthropic message history
 *  2a. type='text'   → append assistant text, enable input
 *  2b. type='intent' → show ConfirmationCard, disable input
 *  3a. Confirm       → run real on-chain hook, append tool_result to history
 *  3b. Cancel        → append tool_result with is_error:true, ask Claude to acknowledge
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, Bot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePublicClient } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { parseUnits, formatUnits } from 'viem'
import { useArcWallet } from '@/hooks/useArcWallet'
import { useScheduledPaymentSigner } from '@/hooks/useScheduledPaymentSigner'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { ARC_MAINNET_TOKENS } from '@/config/tokens.arc-mainnet'
import { ARCDEX } from '@/config/arcDex'
import { notifyTxExecuted } from '@/lib/notify'
import { authFetch, openAuthedEventSource } from '@/lib/api'
import { ensureAllowance } from '@/lib/allowance'
import { applySlippage } from '@/lib/dex/swapUtils'
import { useTokenPriceData } from '@/lib/tokenPrices'
import { ConfirmationCard } from './ConfirmationCard'
import type { Personality } from './agentConstants'

// ── Anthropic message types (minimal subset) ──────────────────────────────────
type TextBlock       = { type: 'text';     text: string }
type ToolUseBlock    = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
type ToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
type ContentBlock    = TextBlock | ToolUseBlock | ToolResultBlock

type ApiMessage = {
  role:    'user' | 'assistant'
  content: string | ContentBlock[]
}

// ── User's IANA timezone (e.g. "America/Sao_Paulo", "Asia/Tokyo") ────────────
// Detected once from the browser and sent with every chat request so the
// backend can interpret relative/local times ("tomorrow at 3pm") correctly
// for whoever is testing, instead of assuming any specific timezone.
const USER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

// ── Extract the user's email from Privy's user object, if any ────────────────
// Sent alongside privyUserId (the Privy DID) so the backend can resolve the
// Circle automation wallet by email — the identity that's actually stable
// across login methods. The Privy DID isn't: the same person can get a
// different one per social network unless the accounts were explicitly
// linked, which is exactly how one tester ended up with two separate Circle
// wallets (one funded, one not) for the same physical account.
function getPrivyEmail(user: ReturnType<typeof usePrivy>['user']): string | undefined {
  const googleAccount = user?.linkedAccounts?.find((a) => a.type === 'google_oauth') as { email?: string } | undefined
  return (
    user?.google?.email ??
    googleAccount?.email ??
    (user as { email?: { address?: string } } | null)?.email?.address
  )
}

// ── Transaction type icons/colors (labels come from i18n via agentChat.txTypes.*) ─
const TX_TYPE_INFO: Record<TxHistoryItem['type'], { icon: string; color: string }> = {
  send:    { icon: '↑', color: '#F97316' },
  receive: { icon: '↓', color: '#10B981' },
  swap:    { icon: '⇄', color: '#3B82F6' },
  mint:    { icon: '✦', color: '#A855F7' },
  other:   { icon: '•', color: '#6B7280' },
}

// ── Token accent colors ───────────────────────────────────────────────────────
const TOKEN_COLORS: Record<string, string> = {
  USDC:   '#10B981',
  EURC:   '#3B82F6',
  FAJU:   '#F97316',
  ARCX:   '#A855F7',
  QCAD:   '#06B6D4',
  USYC:   '#14B8A6',
  cirBTC: '#F7931A',
}

// ── Display message (simple) ──────────────────────────────────────────────────
type BalanceItem = { symbol: string; amount: string }
type TxHistoryItem = {
  type: 'send' | 'receive' | 'swap' | 'mint' | 'other'
  token: string
  amount: string
  hash: string
  hashShort: string
  time: string
}

type DisplayMessage =
  | { kind: 'user';     text: string }
  | { kind: 'agent';    text: string }
  | { kind: 'intent';   tool: string; params: Record<string, unknown>; label: string; toolUseId: string; settled?: boolean }
  | { kind: 'result';     text: string; isError: boolean }
  | { kind: 'tx-success'; text: string; txHash: string }
  | { kind: 'balances';   items: BalanceItem[] }
  | { kind: 'tx-history'; items: TxHistoryItem[]; lang?: string }

// ── Explorer URL ─────────────────────────────────────────────────────────────
const EXPLORER_TX = (hash: string) => `${ARCDEX.explorer}/tx/${hash}`

// ── USDC transfer ABI (used directly so we get the txHash back) ───────────────
const USDC_TRANSFER_ABI = [
  {
    name:            'transfer',
    type:            'function',
    stateMutability: 'nonpayable',
    inputs:          [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs:         [{ name: '', type: 'bool' }],
  },
] as const

// ── Faucet ABI (claim) ────────────────────────────────────────────────────────
const FAUCET_ABI = [
  {
    name:            'claim',
    type:            'function',
    stateMutability: 'nonpayable',
    inputs:          [{ name: 'token', type: 'address' }],
    outputs:         [],
  },
] as const

// ── ERC-20 balanceOf ──────────────────────────────────────────────────────────
const ERC20_ABI = [
  {
    name:            'balanceOf',
    type:            'function',
    stateMutability: 'view',
    inputs:          [{ name: 'account', type: 'address' }],
    outputs:         [{ name: '', type: 'uint256' }],
  },
] as const

// ── Router ABI (swap) — ARCDEX.router is a Uniswap V2 Router02 ────────────────
const SWAP_ROUTER_ABI = [
  {
    name:            'getAmountsOut',
    type:            'function',
    stateMutability: 'view',
    inputs:  [{ name: 'amountIn', type: 'uint256' }, { name: 'path', type: 'address[]' }],
    outputs: [{ name: 'amounts',  type: 'uint256[]' }],
  },
  {
    name:            'swapExactTokensForTokens',
    type:            'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn',     type: 'uint256'   },
      { name: 'amountOutMin', type: 'uint256'   },
      { name: 'path',         type: 'address[]' },
      { name: 'to',           type: 'address'   },
      { name: 'deadline',     type: 'uint256'   },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const

// ── Contract addresses ────────────────────────────────────────────────────────
const CONTRACTS = {
  FAUCET: '0xb6e4c250394Bb0f9b577991C7f4aCF9f6E652017' as `0x${string}`,
}

// ── Helper: find token by symbol ──────────────────────────────────────────────
function token(sym: string) {
  return ARC_MAINNET_TOKENS.find(t => t.symbol.toLowerCase() === sym.toLowerCase())
}

// ── Build the global toast payload for a confirmed chat-triggered action ─────
const TOOL_NOTIFICATION_TITLE: Record<string, string> = {
  sendUSDC: 'USDC sent',
  swap:     'Swap executed',
  faucet:   'Faucet claim executed',
}

function buildNotification(tool: string, params: Record<string, unknown>, txHash: string) {
  switch (tool) {
    case 'sendUSDC':
      return { title: TOOL_NOTIFICATION_TITLE.sendUSDC, amount: params.amount as string, token: 'USDC', recipient: params.to as string, txHash }
    case 'swap':
      return { title: TOOL_NOTIFICATION_TITLE.swap, amount: params.amount as string, token: params.tokenIn as string, txHash }
    default:
      return { title: TOOL_NOTIFICATION_TITLE[tool] ?? 'Transaction executed', txHash }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

interface AgentChatProps {
  personality: Personality
  walletAddress?: string
}

export function AgentChat({ personality, walletAddress }: AgentChatProps) {
  const { t, i18n } = useTranslation()
  const { address } = useArcWallet()
  const { writeContractAsync }        = useArcWriteContract()
  const publicClient                  = usePublicClient({ chainId: ARCDEX.chainId }) // pinned to Arc
  const { prices: tokenPrices }       = useTokenPriceData()
  // The backend only accepts a Privy access token, which exists only for an
  // authenticated Privy session — a wallet merely connected via connectWallet
  // has none. Gate on `authenticated`, not useArcWallet's isConnected (which
  // is also true for connect-only wallets).
  const { user: privyUser, ready: privyReady, authenticated, login } = usePrivy()
  const { grantSigner }               = useScheduledPaymentSigner()

  const [displayMessages,   setDisplayMessages]   = useState<DisplayMessage[]>([])
  const [apiMessages,       setApiMessages]       = useState<ApiMessage[]>([])
  const [input,             setInput]             = useState('')
  const [loading,           setLoading]           = useState(false)
  const [withdrawalAddress, setWithdrawalAddress] = useState<string | undefined>(undefined)

  // Fetch the user's saved withdrawal address on mount
  const effectiveAddr = address ?? walletAddress
  useEffect(() => {
    if (!authenticated || !effectiveAddr) return
    authFetch(`/api/wallet/withdrawal-address/${effectiveAddr}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.withdrawalAddress) setWithdrawalAddress(data.withdrawalAddress) })
      .catch(() => {})
  }, [authenticated, effectiveAddr])

  // Track pending intent so only one can be active at a time
  const pendingIntentRef = useRef<{
    tool:      string
    params:    Record<string, unknown>
    toolUseId: string
    assistantContent: ContentBlock[]
  } | null>(null)

  const hasPendingIntent = pendingIntentRef.current !== null
  const bottomRef     = useRef<HTMLDivElement>(null)
  const messagesBoxRef = useRef<HTMLDivElement>(null)

  // Scroll the messages *container* to the bottom — never the page.
  // scrollIntoView() would scroll the entire page when the list is empty (no
  // overflow → browser scrolls the page to bring the element into view).
  useEffect(() => {
    if (messagesBoxRef.current) {
      messagesBoxRef.current.scrollTop = messagesBoxRef.current.scrollHeight
    }
  }, [displayMessages])

  // ── Append helpers ────────────────────────────────────────────────────────
  const pushDisplay = useCallback((msg: DisplayMessage) =>
    setDisplayMessages(prev => [...prev, msg]), [])

  // Surface scheduled-payment outcomes directly in the chat, not just as a
  // global toast — the scheduler (server/scheduler.mjs) executes on a cron
  // with no button click to react to, so this is how the conversation
  // itself learns about it while the chat panel is open. Own SSE
  // connection (separate from the global toast one in useTransactionNotifications)
  // so this can inject into this component's own message list.
  // Only with a Privy session: without a token openAuthedEventSource would
  // keep retrying every 5s for as long as the tab is open.
  useEffect(() => {
    if (!authenticated || !effectiveAddr) return
    return openAuthedEventSource('/api/notifications/stream', { address: effectiveAddr }, (event) => {
      let payload: {
        type: 'payment-pending' | 'payment-executed' | 'payment-failed'
        recipient: string
        amount: string
        token: string
        txHash?: string
        error?: string
      }
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }

      const shortRecipient = payload.recipient
        ? `${payload.recipient.slice(0, 6)}...${payload.recipient.slice(-4)}`
        : payload.recipient

      if (payload.type === 'payment-executed' && payload.txHash) {
        pushDisplay({
          kind:   'tx-success',
          text:   t('agentChat.scheduledPaymentExecuted', { amount: payload.amount, token: payload.token, address: shortRecipient }),
          txHash: payload.txHash,
        })
      } else if (payload.type === 'payment-failed') {
        pushDisplay({
          kind:    'result',
          text:    t('agentChat.scheduledPaymentFailed', { amount: payload.amount, token: payload.token, address: shortRecipient, error: payload.error }),
          isError: true,
        })
      }
    })
  }, [authenticated, effectiveAddr, pushDisplay, t])

  // ── Execute on-chain action after confirmation ────────────────────────────
  const executeAction = useCallback(async (
    tool:   string,
    params: Record<string, unknown>,
  ): Promise<{ text: string; txHash?: string }> => {
    const addr = address ?? walletAddress

    switch (tool) {
      case 'getBalance': {
        if (!publicClient || !addr) return { text: t('agentChat.walletNotConnected') }
        const sym = params.token as string | undefined
        const targets = sym ? [sym] : ['USDC', 'EURC', 'FAJU', 'ARCX', 'QCAD', 'cirBTC']
        const lines: string[] = []
        for (const s of targets) {
          const t = token(s)
          if (!t) continue
          try {
            const raw = await publicClient.readContract({
              address: t.address, abi: ERC20_ABI,
              functionName: 'balanceOf', args: [addr as `0x${string}`],
            }) as bigint
            lines.push(`${s}: ${parseFloat(formatUnits(raw, t.decimals)).toFixed(4)}`)
          } catch { lines.push(`${s}: error reading`) }
        }
        return { text: lines.join('\n') }
      }

      case 'sendUSDC': {
        const to     = params.to     as string
        const amount = params.amount as string
        // Token is now optional (defaults to USDC). A "send" is ALWAYS a plain
        // ERC-20 transfer of the requested token — never a swap.
        const symbol    = ((params.token as string) || 'USDC').toUpperCase()
        const sendToken = token(symbol)
        if (!sendToken) throw new Error(t('agentChat.tokenNotFound', `Token ${symbol} não encontrado.`))
        // Use writeContractAsync (not sendUsdc) so we get the txHash back
        const txHash = await writeContractAsync({
          address:      sendToken.address,
          abi:          USDC_TRANSFER_ABI, // standard ERC-20 transfer(address,uint256)
          functionName: 'transfer',
          args:         [to as `0x${string}`, parseUnits(amount, sendToken.decimals)],
        })
        return {
          text:   `${amount} ${symbol} enviados para ${to.slice(0, 6)}…${to.slice(-4)}! 🚀`,
          txHash,
        }
      }

      case 'swap': {
        if (!addr || !publicClient) throw new Error(t('agentChat.walletNotConnected'))
        const tIn   = token(params.tokenIn  as string)
        const tOut  = token(params.tokenOut as string)
        if (!tIn || !tOut) throw new Error(t('agentChat.tokenNotFound'))
        const amtIn = parseUnits(params.amount as string, tIn.decimals)

        // Quote the direct pair first, then a hop through USDC (every mainnet pool pairs
        // with USDC). The quote sets amountOutMin, so the swap reverts instead of filling
        // at a sandwiched price.
        const usdc = token('USDC')!.address
        const candidatePaths: `0x${string}`[][] = [[tIn.address, tOut.address]]
        if (tIn.address !== usdc && tOut.address !== usdc) candidatePaths.push([tIn.address, usdc, tOut.address])
        let path: `0x${string}`[] | null = null
        let amountOut = 0n
        for (const candidate of candidatePaths) {
          try {
            const amounts = await publicClient.readContract({
              address: ARCDEX.router, abi: SWAP_ROUTER_ABI, functionName: 'getAmountsOut', args: [amtIn, candidate],
            }) as readonly bigint[]
            const out = amounts[amounts.length - 1]
            if (out > 0n) { path = candidate; amountOut = out; break }
          } catch { /* no pair / no liquidity on this path — try the next one */ }
        }
        if (!path) throw new Error(t('agentChat.swapNoRoute', { tokenIn: tIn.symbol, tokenOut: tOut.symbol }))

        await ensureAllowance(
          publicClient,
          (o) => writeContractAsync({ address: o.address, abi: o.abi, functionName: o.functionName, args: o.args }),
          tIn.address, addr as `0x${string}`, ARCDEX.router, amtIn,
        )
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
        const txHash = await writeContractAsync({
          address:      ARCDEX.router,
          abi:          SWAP_ROUTER_ABI,
          functionName: 'swapExactTokensForTokens',
          args:         [amtIn, applySlippage(amountOut), path, addr as `0x${string}`, deadline],
        })
        return {
          text:   t('agentChat.swapSuccess', { amount: params.amount, tokenIn: params.tokenIn, tokenOut: params.tokenOut }),
          txHash,
        }
      }

      case 'faucet': {
        const faucetToken = token(params.token as string)
        if (!faucetToken) throw new Error(t('agentChat.faucetTokenNotSupported'))
        const txHash = await writeContractAsync({
          address:      CONTRACTS.FAUCET,
          abi:          FAUCET_ABI,
          functionName: 'claim',
          args:         [faucetToken.address],
        })
        return {
          text:   t('agentChat.faucetSuccess', { token: params.token }),
          txHash,
        }
      }

      case 'addLiquidity':
        return { text: t('agentChat.addLiquidityRedirect') }

      default:
        return { text: t('agentChat.actionNotRecognized', { tool }) }
    }
  }, [address, walletAddress, publicClient, writeContractAsync, t])

  // ── Send message to backend ───────────────────────────────────────────────
  const sendMessage = useCallback(async (newApiMessages: ApiMessage[]) => {
    setLoading(true)
    try {
      const effectiveWallet = address ?? walletAddress
      const agentConfig = JSON.parse(localStorage.getItem(`agent_${effectiveWallet}`) || '{}')
      const agentName   = agentConfig.name || 'Agente FajuARC'
      const effectiveEmail = getPrivyEmail(privyUser)

      // Identity (user id/email) is taken server-side from the access token
      // authFetch attaches; privyUserId/privyEmail below are ignored there.
      const resp = await authFetch('/api/agent/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages:          newApiMessages,
          personality,
          walletAddress:     effectiveWallet,
          withdrawalAddress: withdrawalAddress ?? undefined,
          agentName,
          privyUserId:       privyUser?.id,
          privyEmail:        effectiveEmail,
          timezone:          USER_TIMEZONE,
        }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: t('agentChat.unknownError') }))
        pushDisplay({ kind: 'agent', text: t('agentChat.errorPrefix', { error: err.error }) })
        return
      }
      const data = await resp.json()

      if (data.type === 'intent') {
        // Store pending intent — won't go into apiMessages until resolved
        pendingIntentRef.current = {
          tool:             data.tool,
          params:           data.params,
          toolUseId:        data.toolUseId,
          assistantContent: data.assistantContent,
        }
        // Append assistant message (with tool_use block) to api history
        setApiMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.assistantContent },
        ])
        pushDisplay({
          kind:      'intent',
          tool:      data.tool,
          params:    data.params,
          label:     data.label,
          toolUseId: data.toolUseId,
        })
      } else if (data.type === 'tx-history') {
        // Read-only tool resolved server-side — show agent reply + tx card
        setApiMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.message },
        ])
        pushDisplay({ kind: 'agent', text: data.message })
        if (Array.isArray(data.items) && data.items.length > 0) {
          pushDisplay({ kind: 'tx-history', items: data.items, lang: data.lang })
        }
      } else {
        // Plain text reply
        setApiMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.message },
        ])
        pushDisplay({ kind: 'agent', text: data.message })

        // Scheduled payment via the user's own wallet: the backend asks us to
        // obtain one-time consent so it can sign future payments headlessly.
        // Fire the Privy consent popup; safe to call even if already granted.
        if (data.needsSessionSigner && data.sessionSignerAddress) {
          try {
            console.log('[SessionSigner] requesting consent for', data.sessionSignerAddress)
            await grantSigner(data.sessionSignerAddress as string)
            console.log('[SessionSigner] consent granted OK')
            pushDisplay({ kind: 'agent', text: t('agentChat.sessionSignerGranted', 'Pronto! Autorização concedida — seus pagamentos agendados serão enviados automaticamente da sua carteira. 🔐') })
          } catch (err) {
            console.error('[SessionSigner] grant failed:', err)
            const detail = err instanceof Error ? err.message : String(err)
            pushDisplay({ kind: 'agent', text: `A autorização não foi concluída (${detail}). O pagamento ficará agendado, mas você precisará autorizar para que ele seja enviado automaticamente.` })
          }
        }
      }
    } catch (err) {
      pushDisplay({ kind: 'agent', text: t('agentChat.connectionError') })
    } finally {
      setLoading(false)
    }
  }, [personality, address, walletAddress, privyUser, pushDisplay, t])

  // ── Handle user submit ────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading || hasPendingIntent) return
    setInput('')
    pushDisplay({ kind: 'user', text })
    const newMsg: ApiMessage = { role: 'user', content: text }
    const updated = [...apiMessages, newMsg]
    setApiMessages(updated)
    await sendMessage(updated)
  }, [input, loading, hasPendingIntent, apiMessages, pushDisplay, sendMessage])

  // ── Handle confirm / cancel ───────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    const pending = pendingIntentRef.current
    if (!pending) return
    pendingIntentRef.current = null

    // Mark the display card as settled
    setDisplayMessages(prev => prev.map(m =>
      m.kind === 'intent' && m.toolUseId === pending.toolUseId
        ? { ...m, settled: true }
        : m
    ))

    setLoading(true)
    let resultText = ''
    let txHash: string | undefined
    let isError    = false
    try {
      const result = await executeAction(pending.tool, pending.params)
      resultText = result.text
      txHash     = result.txHash
    } catch (err: unknown) {
      resultText = err instanceof Error ? err.message : String(err)
      isError    = true
    }

    // getBalance → styled balance card
    if (!isError && pending.tool === 'getBalance') {
      const items: BalanceItem[] = resultText
        .split('\n')
        .map(line => { const [sym, amt] = line.split(': '); return { symbol: (sym ?? '').trim(), amount: (amt ?? '').trim() } })
        .filter(({ symbol, amount }) => symbol && amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0)
      pushDisplay({ kind: 'balances', items })
    // on-chain tx with hash → success card with explorer link
    } else if (!isError && txHash) {
      pushDisplay({ kind: 'tx-success', text: resultText, txHash })
      notifyTxExecuted(buildNotification(pending.tool, pending.params, txHash))
    } else {
      pushDisplay({ kind: 'result', text: resultText, isError })
    }

    // Append tool_result to api history then ask Claude to continue
    const toolResult: ApiMessage = {
      role:    'user',
      content: [{
        type:        'tool_result',
        tool_use_id: pending.toolUseId,
        content:     resultText,
        is_error:    isError || undefined,
      }],
    }
    const updated = [...apiMessages, toolResult]
    setApiMessages(updated)

    // getBalance is already fully resolved client-side by the balance card
    // above — skip the follow-up request. Sending it lets the model decide
    // to call getBalance again (tool_choice is 'auto'), which re-opens a
    // confirmation card and loops the balance card indefinitely.
    if (pending.tool === 'getBalance') {
      setLoading(false)
    } else {
      await sendMessage(updated)
    }
  }, [apiMessages, executeAction, pushDisplay, sendMessage])

  const handleCancel = useCallback(() => {
    const pending = pendingIntentRef.current
    if (!pending) return
    pendingIntentRef.current = null

    // Settle the card visually
    setDisplayMessages(prev => prev.map(m =>
      m.kind === 'intent' && m.toolUseId === pending.toolUseId
        ? { ...m, settled: true }
        : m
    ))

    // Record the cancelled tool_result so conversation history stays valid
    // (OpenAI format requires a tool message for every tool_use).
    // Do NOT call sendMessage — triggering the LLM after cancel causes it to
    // recall or re-attempt the action despite the user's explicit rejection.
    const toolResult: ApiMessage = {
      role:    'user',
      content: [{
        type:        'tool_result',
        tool_use_id: pending.toolUseId,
        content:     t('agentChat.userCancelled'),
        is_error:    true,
      }],
    }
    setApiMessages(prev => [...prev, toolResult])
  }, [t])

  // ── Render ────────────────────────────────────────────────────────────────
  const isBlocked = loading || hasPendingIntent

  return (
    <div className="flex flex-col h-[420px]">
      {/* Message list — overflow scoped to this container, not the page */}
      <div ref={messagesBoxRef} className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2">
        {displayMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center">
              <Bot className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{t('agentChat.emptyTitle')}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('agentChat.emptySubtitle')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              {(t('agentChat.suggestions', { returnObjects: true }) as string[]).map(s => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-[11px] rounded-lg border border-slate-700/60 bg-slate-800/40 px-2.5 py-1 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {displayMessages.map((msg, i) => {
          if (msg.kind === 'user') return (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] sm:max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-cyan-500 to-blue-600 px-3.5 py-2.5 text-sm text-white shadow-md shadow-cyan-500/15 break-words">
                {msg.text}
              </div>
            </div>
          )

          if (msg.kind === 'agent') return (
            <div key={i} className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-800/60 border border-slate-700/50 px-3.5 py-2.5 text-sm text-slate-200 whitespace-pre-wrap break-words">
                {msg.text}
              </div>
            </div>
          )

          if (msg.kind === 'intent') return (
            <div key={i} className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <div className="flex-1 max-w-[90%]">
                {msg.settled ? (
                  <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 px-3.5 py-2.5 text-xs text-slate-500 italic">
                    {msg.label}
                  </div>
                ) : (
                  <ConfirmationCard
                    tool={msg.tool}
                    params={msg.params}
                    label={msg.label}
                    disabled={loading}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                  />
                )}
              </div>
            </div>
          )

          if (msg.kind === 'balances') return (
            <div key={i} className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-slate-700/50 bg-slate-800/60 px-3.5 py-3 w-full min-w-0 sm:min-w-[200px] sm:w-auto max-w-full overflow-x-auto">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2.5">{t('agentChat.balancesTitle')}</p>
                <div className="space-y-2">
                  {msg.items.map(({ symbol, amount }) => {
                    const num      = parseFloat(amount)
                    const decimals = symbol === 'cirBTC' ? 8 : 2
                    // Shared price module: no price for tokens whose pool is empty or too shallow.
                    const price    = tokenPrices[symbol]
                    const usd      = price != null ? num * price : null
                    const fmtUsd   = usd != null
                      ? usd < 0.01
                        ? '<$0.01'
                        : '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : null
                    return (
                      <div key={symbol} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: TOKEN_COLORS[symbol] ?? '#6B7280' }}
                          />
                          <span className="text-xs font-semibold text-slate-300 w-14">{symbol}</span>
                        </div>
                        <span className="text-xs font-mono text-white flex-1 text-right">
                          {num.toFixed(decimals)}
                        </span>
                        {fmtUsd ? (
                          <span className="text-xs font-mono text-right shrink-0" style={{ color: '#22c55e', minWidth: '4rem' }}>
                            {fmtUsd}
                          </span>
                        ) : (
                          <span className="text-[10px] text-right shrink-0 text-slate-500" style={{ minWidth: '4rem' }}>
                            No market price
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )

          if (msg.kind === 'tx-history') return (
            <div key={i} className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-slate-700/50 bg-slate-800/60 px-3.5 py-3 w-full min-w-0 sm:min-w-[220px] sm:w-auto max-w-full overflow-x-auto">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2.5">{t('agentChat.txHistoryTitle')}</p>
                <div className="space-y-2">
                  {msg.items.map((tx, idx) => {
                    const info = TX_TYPE_INFO[tx.type] ?? TX_TYPE_INFO.other
                    const label = t(`agentChat.txTypes.${tx.type}`, { lng: msg.lang ?? i18n.language })
                    return (
                      <div key={idx} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0"
                            style={{ backgroundColor: `${info.color}22`, color: info.color }}
                          >
                            {info.icon}
                          </span>
                          <span className="text-xs font-semibold text-slate-300">{label}</span>
                        </div>
                        <span className="text-xs font-mono text-white flex-1 text-right truncate">
                          {tx.amount} {tx.token}
                        </span>
                        <div className="flex flex-col items-end shrink-0">
                          <a
                            href={EXPLORER_TX(tx.hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
                          >
                            {tx.hashShort}
                          </a>
                          <span className="text-[10px] text-slate-500">{tx.time}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )

          if (msg.kind === 'tx-success') return (
            <div key={i} className="flex justify-center">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3.5 py-2.5 space-y-1.5 max-w-[90%]">
                <p className="text-xs text-emerald-400">✅ {msg.text}</p>
                <a
                  href={EXPLORER_TX(msg.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  🔍 {t('agentChat.viewTxOnArcScan')}
                </a>
              </div>
            </div>
          )

          if (msg.kind === 'result') return (
            <div key={i} className="flex justify-center">
              <div className={`text-xs rounded-lg border px-3 py-1.5 ${
                msg.isError
                  ? 'border-red-500/30 bg-red-500/10 text-red-400'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              }`}>
                {msg.isError ? '✗' : '✓'} {msg.text}
              </div>
            </div>
          )

          return null
        })}

        {loading && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="h-3.5 w-3.5 text-cyan-400" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-slate-800/60 border border-slate-700/50 px-3.5 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar — replaced by a sign-in prompt until there's a Privy session */}
      {!privyReady ? (
        <div className="flex items-center justify-center gap-2 pt-3 border-t border-slate-700/50 h-14 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : !authenticated ? (
        <div className="flex items-center gap-3 pt-3 border-t border-slate-700/50">
          <p className="flex-1 min-w-0 text-sm text-slate-300">Sign in to chat with your agent</p>
          <button
            type="button"
            onClick={() => login()}
            className="h-11 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-sm font-semibold text-white hover:opacity-90 transition-all shadow-md shadow-cyan-500/20 shrink-0"
          >
            Sign in
          </button>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-3 border-t border-slate-700/50">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={isBlocked ? t('agentChat.placeholderWaiting') : t('agentChat.placeholderInput')}
          disabled={isBlocked}
          className="flex-1 w-full min-w-0 rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-3 text-base sm:text-sm text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none disabled:opacity-50 transition-colors"
        />
        <button
          type="submit"
          disabled={isBlocked || !input.trim()}
          className="w-11 h-11 flex items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:opacity-90 disabled:opacity-40 transition-all shadow-md shadow-cyan-500/20 shrink-0"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      )}
    </div>
  )
}
