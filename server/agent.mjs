/**
 * FajuARC Agent Chat Route — POST /api/agent/chat
 *
 * Calls Claude (claude-haiku-4-5) with native tool use enabled. Haiku is
 * plenty for this use case (routing to one of a handful of tools from a
 * short instruction) at a fraction of Sonnet's cost. Conversation history
 * is capped and the system prompt/tools are prompt-cached to cut cost
 * further — see capHistory() and the system-blocks construction below.
 * Returns:
 *   { type: 'intent', tool, params, label, assistantContent } — tool chosen, needs confirm
 *   { type: 'text',   message }                              — plain reply
 */

import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { fetchTokenTransfers } from './arcscan.mjs'
import { findUserByAddress, findUserById, findUserByEmail } from './walletsDb.mjs'
import { getOrCreateWallet, getWalletUsdcBalance } from './circle.mjs'
import { createPayment, listPayments, cancelPayment } from './scheduledPayments.mjs'
import { ownsAddress, ownsCircleEntry, FORBIDDEN_WALLET } from './auth.mjs'

const router = Router()

const MODEL = 'claude-haiku-4-5'

// ── Lazy Anthropic client (initialised on first request) ──────────────────────
let _anthropic = null
function getClient(apiKey) {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey })
  return _anthropic
}

// ── Tools (Claude native tool-use format: name/description/input_schema) ──────
const TOOLS = [
  {
    name: 'getBalance',
    description: 'Check the user wallet balances on Arc Mainnet. Call with no token to see ALL balances, or specify a token symbol.',
    input_schema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          enum: ['USDC', 'EURC', 'FAJU', 'ARCX', 'cirBTC'],
          description: 'Optional: specific token to check. If not provided, returns all balances.',
        },
      },
      required: [],
    },
  },
  {
    name: 'sendUSDC',
    description: "Send a token from the user's embedded wallet to another address via a direct ERC-20 transfer. Supports USDC (default), EURC, FAJU, ARCX, cirBTC. This is a plain transfer — NEVER swap one token for another to fulfill a send request; if the user wants to send EURC, send EURC directly by passing token='EURC'.",
    input_schema: {
      type: 'object',
      properties: {
        to:     { type: 'string', description: 'Destination EVM address (0x...)' },
        amount: { type: 'string', description: 'Amount to send (e.g. "10.5")' },
        token:  {
          type: 'string',
          enum: ['USDC', 'EURC', 'FAJU', 'ARCX', 'cirBTC'],
          description: 'Token symbol to send. Defaults to USDC if omitted.',
        },
      },
      required: ['to', 'amount'],
    },
  },
  {
    name: 'schedulePayment',
    description: 'Schedule a USDC payment to be sent automatically in the future — either once at a specific date/time, or on a recurring basis (daily, weekly, or monthly). Use this INSTEAD OF sendUSDC whenever the user mentions a future date/time or a recurring interval (e.g. "on the 15th", "next Friday", "every week", "every month"). The backend needs a wallet it can sign for headlessly to execute this later — it will automatically set one up on first use if needed, separate from the user\'s regular wallet, and will tell the user to fund it.',
    input_schema: {
      type: 'object',
      properties: {
        to:     { type: 'string', description: 'Destination EVM address (0x...)' },
        amount: { type: 'string', description: 'Amount to send (e.g. "10.5")' },
        token:  { type: 'string', enum: ['USDC'], description: 'Token to send. Only USDC is supported for scheduled payments today. Defaults to USDC.' },
        scheduledFor: {
          type: 'string',
          description: 'ISO 8601 datetime for a ONE-TIME payment (e.g. "2026-07-15T09:00:00Z"). Omit this if using "recurrence" instead.',
        },
        recurrence: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly'],
          description: 'Recurrence pattern for a REPEATING payment. Omit this for a one-time payment (use "scheduledFor" instead).',
        },
        recurrenceDay: {
          type: 'string',
          description: 'Required for "weekly" (day of week, e.g. "Friday") and "monthly" (day of month 1-31, e.g. "15") recurrence. Not used for "daily" or one-time payments.',
        },
        recurrenceTime: {
          type: 'string',
          description: 'Time of day in 24h "HH:mm" format, UTC, for recurring payments (e.g. "09:00"). Defaults to 09:00 UTC if omitted. If the user gives a local time, convert it to UTC and mention that in your reply.',
        },
      },
      required: ['to', 'amount'],
    },
  },
  {
    name: 'listScheduledPayments',
    description: "List the user's scheduled and recurring payments, with their status (pending, executed, failed, cancelled).",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'cancelScheduledPayment',
    description: 'Cancel a previously scheduled payment by its ID. Use listScheduledPayments first if you need to find the ID.',
    input_schema: {
      type: 'object',
      properties: {
        paymentId: { type: 'string', description: 'The ID of the scheduled payment to cancel, as shown by listScheduledPayments.' },
      },
      required: ['paymentId'],
    },
  },
  {
    name: 'swap',
    description: 'Swap tokens on the FajuARC DEX (Uniswap V2 pools on Arc Mainnet).',
    input_schema: {
      type: 'object',
      properties: {
        tokenIn:  { type: 'string', description: 'Input token symbol (e.g. "USDC")' },
        tokenOut: { type: 'string', description: 'Output token symbol (e.g. "EURC")' },
        amount:   { type: 'string', description: 'Amount of tokenIn to swap' },
      },
      required: ['tokenIn', 'tokenOut', 'amount'],
    },
  },
  {
    name: 'addLiquidity',
    description: 'Add liquidity to a V2 pool on FajuARC.',
    input_schema: {
      type: 'object',
      properties: {
        tokenA:  { type: 'string', description: 'First token symbol' },
        tokenB:  { type: 'string', description: 'Second token symbol' },
        amountA: { type: 'string', description: 'Amount of tokenA to provide' },
        amountB: { type: 'string', description: 'Amount of tokenB to provide' },
      },
      required: ['tokenA', 'tokenB', 'amountA', 'amountB'],
    },
  },
  {
    name: 'faucet',
    description: 'Claim FAJU or ARCX test tokens from the on-chain faucet on Arc Testnet.',
    input_schema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          enum: ['FAJU', 'ARCX'],
          description: 'Which test token to claim',
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'getTransactionHistory',
    description: 'Busca as últimas transações on-chain da carteira do usuário na Arc Mainnet (envios, recebimentos, swaps, mints)',
    input_schema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Endereço da carteira (opcional, usa a carteira do usuário atual se não informado)',
        },
        limit: {
          type: 'number',
          description: 'Quantidade de transações a retornar (padrão 5)',
        },
      },
      required: [],
    },
  },
]

// ── Self-introduction instruction ─────────────────────────────────────────────
// Only introduce on the first message of the conversation, or if the user
// explicitly asks who the agent is — never repeat it on every reply.
function introInstruction(n, isFirstMessage) {
  return isFirstMessage
    ? `This is the first message of the conversation: introduce yourself by name and role (e.g. "Hi! I'm ${n}, your guide on Arc Mainnet") before answering.`
    : `This is NOT the first message of the conversation: do NOT introduce yourself or greet the user again. Only restate your name/role if the user explicitly asks who you are. Go straight to the point.`
}

// ── Language instruction ──────────────────────────────────────────────────────
// Mirror the user's language back to them instead of always answering in English.
function languageInstruction() {
  return `LANGUAGE: Always respond in the same language the user is writing in. If the user writes in Portuguese, respond in Portuguese. If in English, respond in English.`
}

// ── getBalance silent-tool instruction ────────────────────────────────────────
// The frontend renders a visual balance card from the tool result, so the
// agent must not also narrate the balances in text or they'd show up twice.
function balanceInstruction() {
  return `BALANCE TOOL: When you use the getBalance tool, do NOT include a text description of the balances in your response. The frontend will display the balance card automatically. Just use the tool silently.`
}

// ── Single tool-call instruction ──────────────────────────────────────────────
// Prevents the agent from re-invoking a tool it already called earlier in the
// same exchange (e.g. calling getBalance again after seeing its own tool
// result), which would render its visual card a second time.
function singleToolCallInstruction() {
  return `SINGLE TOOL CALL: Never call the same tool twice in a single response. If you have already used getBalance, do not use it again until the user sends a new message.`
}

// ── getBalance no-token-arg instruction ───────────────────────────────────────
// Steers the model away from sending an empty-string token, which previously
// caused "Failed to call a function" errors — pass no parameters at all instead.
function balanceNoArgsInstruction() {
  return `GET BALANCE: When user asks for balance without specifying a token, call getBalance with no parameters (empty object {}) to get all balances at once.`
}

// ── No tool-chaining instruction ──────────────────────────────────────────────
// Backstops singleToolCallInstruction() with a broader, explicit rule covering
// any tool (not just getBalance), to stop the model from chaining repeat calls.
function noToolChainingInstruction() {
  return `IMPORTANT: Never call any tool more than once per user message. If you need balance info, call getBalance ONCE and stop. Do not chain multiple tool calls.`
}

// ── Lightweight PT/EN language detector for the user's latest message ────────
// Used to localize server-formatted strings (transaction history, time-ago,
// confirmation labels) that are built outside the model's own reply.
function detectLang(text) {
  const s = (text || '').toLowerCase()
  if (!s.trim()) return 'pt'

  // Portuguese-specific diacritics are a strong signal on their own.
  if (/[áàâãéêíóôõúüç]/.test(s)) return 'pt'

  const ptWords = /\b(voc[eê]|qual|quero|enviar|envia|saldo|carteira|meu|minha|est[aá]|n[ãa]o|por favor|obrigad[oa]|ol[aá]|onde|quanto|quanta|como|para|pra|transa[cç][oõ]es|hist[oó]rico|mostre|mostra|troca|trocar|comprar|vender|recebi|recebido)\b/

  const enWords = /\b(the|what|how|send|balance|wallet|please|thanks|thank you|hello|hi|where|much|many|my|transactions|history|show|get|swap|trade|buy|sell|receive|received|mint|need|want|can you)\b/

  const ptHits = (s.match(ptWords) || []).length
  const enHits = (s.match(enWords) || []).length

  return enHits > ptHits ? 'en' : 'pt'
}

// ── System prompts per personality ────────────────────────────────────────────
// Each prompt is a function so agentName and conversation state are injected at request time.
const SYSTEM_PROMPTS = {
  explorer: (n, isFirstMessage) => `Your name is ${n}.
You are an Explorer agent for FajuARC — curious, adventurous, always looking for new opportunities on Arc Mainnet.
You love discovering new tokens and pools. Your tone is enthusiastic and encouraging.
You help users explore the DApp and try new things. Keep responses concise (2-3 sentences max for text replies).
Arc Mainnet chainId: 5042. Native gas token: USDC. Available tokens: USDC, EURC, FAJU, ARCX, cirBTC.
When the user asks you to perform an on-chain action, always use the appropriate tool rather than just describing it.
You can now look up the user's recent on-chain transaction history (sends, receives, swaps, mints) using the getTransactionHistory tool.
You can also schedule future or recurring USDC payments with schedulePayment, list them with listScheduledPayments, and cancel them with cancelScheduledPayment. Use schedulePayment instead of sendUSDC whenever the user mentions a future date/time or a recurring interval (e.g. "every Friday", "on the 15th", "next month").
${introInstruction(n, isFirstMessage)}
${languageInstruction()}
${balanceInstruction()}
${singleToolCallInstruction()}
${balanceNoArgsInstruction()}
${noToolChainingInstruction()}`,

  trader: (n, isFirstMessage) => `Your name is ${n}.
You are a Trader agent for FajuARC — dry, direct, data-focused. No fluff.
You give concise trading analysis and execute swaps efficiently. Prices, amounts, numbers — that's your language.
Keep text replies to 1-2 sentences. Be blunt but helpful.
Arc Mainnet chainId: 5042. Native gas token: USDC. Available tokens: USDC, EURC, FAJU, ARCX, cirBTC.
When the user asks you to perform an on-chain action, always use the appropriate tool rather than just describing it.
You can now look up the user's recent on-chain transaction history (sends, receives, swaps, mints) using the getTransactionHistory tool.
You can also schedule future or recurring USDC payments with schedulePayment, list them with listScheduledPayments, and cancel them with cancelScheduledPayment. Use schedulePayment instead of sendUSDC whenever the user mentions a future date/time or a recurring interval (e.g. "every Friday", "on the 15th", "next month").
${introInstruction(n, isFirstMessage)}
${languageInstruction()}
${balanceInstruction()}
${singleToolCallInstruction()}
${balanceNoArgsInstruction()}
${noToolChainingInstruction()}`,

  builder: (n, isFirstMessage) => `Your name is ${n}.
You are a Builder agent for FajuARC — technical, detailed, loves contracts and protocol mechanics.
You explain what's happening under the hood. You add liquidity and interact with smart contracts precisely.
Be informative but concise. Include relevant contract/tx details when helpful.
Arc Mainnet chainId: 5042. Native gas token: USDC.
When the user asks you to perform an on-chain action, always use the appropriate tool rather than just describing it.
You can now look up the user's recent on-chain transaction history (sends, receives, swaps, mints) using the getTransactionHistory tool.
You can also schedule future or recurring USDC payments with schedulePayment, list them with listScheduledPayments, and cancel them with cancelScheduledPayment. Use schedulePayment instead of sendUSDC whenever the user mentions a future date/time or a recurring interval (e.g. "every Friday", "on the 15th", "next month").
${introInstruction(n, isFirstMessage)}
${languageInstruction()}
${balanceInstruction()}
${singleToolCallInstruction()}
${balanceNoArgsInstruction()}
${noToolChainingInstruction()}`,

  social: (n, isFirstMessage) => `Your name is ${n}.
You are a Social agent for FajuARC — informal, community-focused, loves connecting people via payments.
Your vibe is friendly and casual. You make DeFi feel easy and fun.
Use emojis occasionally. Keep it light. Help users send USDC and participate in the community.
Arc Mainnet chainId: 5042. Native gas token: USDC.
When the user asks you to perform an on-chain action, always use the appropriate tool rather than just describing it.
You can now look up the user's recent on-chain transaction history (sends, receives, swaps, mints) using the getTransactionHistory tool.
You can also schedule future or recurring USDC payments with schedulePayment, list them with listScheduledPayments, and cancel them with cancelScheduledPayment. Use schedulePayment instead of sendUSDC whenever the user mentions a future date/time or a recurring interval (e.g. "every Friday", "on the 15th", "next month").
${introInstruction(n, isFirstMessage)}
${languageInstruction()}
${balanceInstruction()}
${singleToolCallInstruction()}
${balanceNoArgsInstruction()}
${noToolChainingInstruction()}`,
}

// ── Relative time helper (e.g. "há 2 horas" / "2 hours ago") ─────────────────
function timeAgo(timestamp, lang = 'pt') {
  const diffMs = Date.now() - new Date(timestamp).getTime()
  const mins   = Math.floor(diffMs / 60000)

  if (lang === 'en') {
    if (mins < 1)   return 'just now'
    if (mins < 60)  return `${mins} minute${mins === 1 ? '' : 's'} ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
    const days = Math.floor(hours / 24)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }

  if (mins < 1)   return 'agora mesmo'
  if (mins < 60)  return `há ${mins} minuto${mins === 1 ? '' : 's'}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours} hora${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `há ${days} dia${days === 1 ? '' : 's'}`
}

// ── Format ArcScan token-transfers into a chat-friendly transaction list ──────
function formatTransactionHistory(items, address, limit, lang = 'pt') {
  const addr = address.toLowerCase()

  // Detect swaps: same tx hash has both an outgoing and incoming leg for the user
  const byTx = new Map()
  for (const it of items) {
    const arr = byTx.get(it.transaction_hash) ?? []
    arr.push(it)
    byTx.set(it.transaction_hash, arr)
  }

  const formatted = items.slice(0, limit).map(it => {
    const from   = (it.from?.hash ?? '').toLowerCase()
    const to     = (it.to?.hash ?? '').toLowerCase()
    const symbol = it.token?.symbol ?? '???'
    const isNft  = it.token_type === 'ERC-721' || it.token_type === 'ERC-1155'
    const decimals = Number(it.token?.decimals ?? 0)
    const rawValue  = it.total?.value ?? '0'
    const amount = isNft ? '1' : (Number(rawValue) / 10 ** decimals).toString()

    const legs = byTx.get(it.transaction_hash) ?? []
    const hasOut = legs.some(l => (l.from?.hash ?? '').toLowerCase() === addr)
    const hasIn  = legs.some(l => (l.to?.hash ?? '').toLowerCase() === addr)

    let type
    if (from === '0x0000000000000000000000000000000000000000') {
      type = 'mint'
    } else if (hasOut && hasIn) {
      type = 'swap'
    } else if (to === addr) {
      type = 'receive'
    } else if (from === addr) {
      type = 'send'
    } else {
      type = 'other'
    }

    return {
      type,
      token:  symbol,
      amount,
      hash:   it.transaction_hash,
      hashShort: `${it.transaction_hash.slice(0, 6)}...${it.transaction_hash.slice(-4)}`,
      time:   timeAgo(it.timestamp, lang),
    }
  })

  const labelsByLang = {
    pt: { send: 'Enviou', receive: 'Recebeu', swap: 'Trocou', mint: 'Mintou', other: 'Movimentou' },
    en: { send: 'Sent',   receive: 'Received', swap: 'Swapped', mint: 'Minted', other: 'Moved' },
  }
  const labels = labelsByLang[lang] ?? labelsByLang.pt
  const noTxMessage = lang === 'en'
    ? 'No transactions found for this wallet.'
    : 'Nenhuma transação encontrada para essa carteira.'

  const summary = formatted.length === 0
    ? noTxMessage
    : formatted
        .map(t => `${labels[t.type] ?? labels.other} ${t.amount} ${t.token} (${t.hashShort}, ${t.time})`)
        .join('\n')

  return { items: formatted, summary }
}

// ── Human-readable labels for each tool call ─────────────────────────────────
function makeLabel(tool, params, lang = 'pt') {
  if (lang === 'en') {
    switch (tool) {
      case 'getBalance':
        return params.token ? `View ${params.token} balance` : 'View all balances'
      case 'sendUSDC':
        return `Send ${params.amount} ${params.token || 'USDC'} to ${params.to.slice(0, 6)}...${params.to.slice(-4)}`
      case 'swap':
        return `Swap ${params.amount} ${params.tokenIn} for ${params.tokenOut}`
      case 'addLiquidity':
        return `Add liquidity: ${params.amountA} ${params.tokenA} + ${params.amountB} ${params.tokenB}`
      case 'faucet':
        return `Claim tokens from faucet (${params.token})`
      default:
        return tool
    }
  }

  switch (tool) {
    case 'getBalance':
      return params.token ? `Ver saldo de ${params.token}` : 'Ver todos os saldos'
    case 'sendUSDC':
      return `Enviar ${params.amount} ${params.token || 'USDC'} para ${params.to.slice(0, 6)}...${params.to.slice(-4)}`
    case 'swap':
      return `Trocar ${params.amount} ${params.tokenIn} por ${params.tokenOut}`
    case 'addLiquidity':
      return `Adicionar liquidez: ${params.amountA} ${params.tokenA} + ${params.amountB} ${params.tokenB}`
    case 'faucet':
      return `Receber tokens do faucet (${params.token})`
    default:
      return tool
  }
}

// ── Sanitize frontend message history for Claude's Messages API ──────────────
// The frontend already speaks Claude's native message shape (tool_result
// blocks inside user messages, tool_use blocks inside assistant messages) —
// just drop empty entries so we never send a blank content block.
function sanitizeHistory(messages) {
  const history = []
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      if (msg.content.trim()) history.push({ role: msg.role, content: msg.content })
    } else if (Array.isArray(msg.content) && msg.content.length > 0) {
      history.push({ role: msg.role, content: msg.content })
    }
  }
  return history
}

// ── Cap conversation history sent to the API (cost control) ──────────────────
// Keeps only the last N messages — full history isn't needed for tool
// routing and every extra turn is billed as input tokens on every request.
// If the cut lands right after a tool_use (i.e. the first kept message is
// its tool_result), drop that orphaned tool_result too — the API requires
// every tool_result to be preceded by the tool_use it responds to, and that
// tool_use just got trimmed away.
const MAX_HISTORY_MESSAGES = 15
function capHistory(history, max = MAX_HISTORY_MESSAGES) {
  let capped = history.slice(-max)
  while (capped.length > 0 && Array.isArray(capped[0].content) && capped[0].content.some(b => b.type === 'tool_result')) {
    capped = capped.slice(1)
  }
  return capped
}

// ── Ask Claude to phrase a server-resolved tool result in character ──────────
// Shared by every tool that's resolved directly on the backend (no client
// confirmation step) — getTransactionHistory, schedulePayment,
// listScheduledPayments, cancelScheduledPayment.
async function followupReply(anthropic, systemBlocks, history, assistantContent, toolUseId, summary) {
  const followupMessages = [
    ...history,
    { role: 'assistant', content: assistantContent },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: summary }] },
  ]
  const followup = await anthropic.messages.create({
    model:      MODEL,
    system:     systemBlocks,
    messages:   followupMessages,
    max_tokens: 1024,
  })
  return followup.content.find(b => b.type === 'text')?.text ?? summary
}

// ── Format a UTC datetime for display in the requester's local timezone ──────
// Falls back to a plain UTC string when no timezone was sent, or when the
// sent value isn't a valid IANA zone (Intl throws on garbage input — a
// malformed browser value should degrade gracefully, not 500 the request).
function formatLocalDateTime(utcISOString, timezone) {
  const date = new Date(utcISOString)
  if (timezone) {
    try {
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
      return `${formatted} (your local time)`
    } catch {
      // invalid IANA string — fall through to UTC
    }
  }
  return `${date.toISOString()} UTC`
}

// ── Human-readable summary of a scheduled-payment record ─────────────────────
// Uses nextRun (always a concrete UTC instant, for one-time AND recurring
// payments alike) rather than the raw recurrenceTime string, so the
// displayed time is correctly converted to the requester's timezone instead
// of an unconverted "HH:mm UTC".
function describeSchedule(p, timezone) {
  const localTime = formatLocalDateTime(p.nextRun ?? p.scheduledFor, timezone)
  if (p.recurrence === 'weekly') return `every week on ${p.recurrenceDay}, next at ${localTime}`
  if (p.recurrence === 'monthly') return `on day ${p.recurrenceDay} of every month, next at ${localTime}`
  if (p.recurrence === 'daily') return `every day, next at ${localTime}`
  return `at ${localTime}`
}

function shortAddr(addr) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr
}

// ── Resolve the Circle-managed wallet that scheduled payments run against ────
// walletAddress here is whatever the frontend currently treats as "the"
// wallet (usually the Privy embedded wallet) — that address structurally
// can never be Circle-custodied. A user's actual Circle automation wallet
// (if any) is looked up in this order:
//   1. by address  — the most direct, unambiguous match, if walletAddress
//      already IS a known Circle wallet.
//   2. by email     — the most STABLE identity across login methods. Privy
//      assigns a different user id (privyUserId, a "did:privy:..." string)
//      depending on which social network the person authenticated with,
//      unless the accounts were explicitly linked — so the same physical
//      person can silently end up with two unrelated Circle wallets, one
//      per login method (this happened in practice during testing:
//      the funded wallet was keyed by an old "google:..." identity, not the
//      Privy DID). Email doesn't have that problem, so prefer it whenever
//      the frontend sent one.
//   3. by privyUserId — last resort, kept for backward compatibility with
//      wallets that only ever had a DID and no email on file.
// Never creates anything — see provisionAutomationWallet for that.
async function resolveCircleOwner(walletAddress, privyUserId, email) {
  const byAddress = await findUserByAddress(walletAddress)
  if (byAddress) return byAddress

  if (email) {
    const byEmail = await findUserByEmail(email)
    if (byEmail) {
      await warnIfFragmentedIdentity(privyUserId, byEmail)
      return byEmail
    }
  }

  return (await findUserById(privyUserId)) ?? null
}

// ── One-time-per-call diagnostic for the DID/email fragmentation scenario ────
// Doesn't touch wallets-db.json — just makes the split visible in logs so it
// can be investigated, per "log a warning but do not auto-delete."
async function warnIfFragmentedIdentity(privyUserId, emailEntry) {
  if (!privyUserId || !emailEntry) return
  const didEntry = await findUserById(privyUserId)
  if (didEntry && didEntry.userId !== emailEntry.userId) {
    console.warn(
      `[Agent] Fragmented Circle identity: Privy DID "${privyUserId}" resolves to wallet ${didEntry.address} ` +
      `(key "${didEntry.userId}"), but email-linked wallet ${emailEntry.address} (key "${emailEntry.userId}") ` +
      `is the one actually being used. Not auto-merging/deleting — new writes will keep preferring the email key.`
    )
  }
}

// ── Lazily create a dedicated Circle automation wallet for scheduling ────────
// Only called from schedulePayment, and only once resolveCircleOwner has
// already come up empty. Keyed by email when available (stable across login
// methods — see resolveCircleOwner above), falling back to privyUserId only
// when no email was sent. getOrCreateWallet is idempotent on whichever key
// is used, so repeated calls for the same identity reuse the same wallet.
async function provisionAutomationWallet(privyUserId, email) {
  const normalizedEmail = (email ?? '').toLowerCase().trim()
  const key = normalizedEmail ? `email:${normalizedEmail}` : privyUserId
  if (!key) return null
  return getOrCreateWallet(key, normalizedEmail)
}

// ── Route ─────────────────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no .env' })
  }

  const { messages = [], personality = 'explorer', walletAddress, withdrawalAddress, agentName, timezone } = req.body

  // Identity comes ONLY from the verified Privy access token (index.mjs mounts
  // this router behind requireAuth) — any privyUserId/privyEmail in the body
  // is ignored. The wallet the chat acts for must belong to that user.
  const privyUserId = req.auth.userId
  const privyEmail  = req.auth.primaryEmail
  if (walletAddress && !ownsAddress(req.auth, walletAddress) && !ownsCircleEntry(req.auth, await findUserByAddress(walletAddress))) {
    return res.status(403).json({ error: FORBIDDEN_WALLET })
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '"messages" array é obrigatório' })
  }

  const name           = (agentName || 'Agente FajuARC').trim()
  const isFirstMessage = messages.length === 1
  const promptFn       = SYSTEM_PROMPTS[personality] ?? SYSTEM_PROMPTS.explorer
  const basePrompt     = promptFn(name, isFirstMessage)
  const walletHint     = walletAddress ? `\nUser wallet: ${walletAddress}` : ''
  const withdrawalHint = withdrawalAddress
    ? `\nUser's withdrawal wallet: ${withdrawalAddress} — when the user mentions "carteira de saque", "minha carteira de saque", "saque" or "withdrawal wallet" as a destination, resolve it automatically to this address: ${withdrawalAddress}.`
    : ''

  // ── Prompt caching ───────────────────────────────────────────────────────
  // basePrompt/walletHint/withdrawalHint are byte-identical across every
  // request within the same conversation (same personality, agent name,
  // wallet) — cache_control on this block lets the API reuse that cached
  // prefix (which also covers TOOLS, since tools render before system)
  // instead of reprocessing it every turn. nowHint carries a live
  // timestamp, so it MUST stay out of the cached block, or the prefix would
  // change on every single request and never hit the cache.
  const cachedSystemText = basePrompt + walletHint + withdrawalHint
  // Needed for schedulePayment to compute relative dates/times correctly
  // ("in 90 seconds", "tomorrow", "next Friday") — without this Claude has
  // no way to know the current date and will guess a plausible-looking but
  // wrong one. Also carries the requester's IANA timezone (sent by the
  // frontend via Intl.DateTimeFormat().resolvedOptions().timeZone) so
  // relative/local times ("tomorrow at 3pm") are interpreted in the user's
  // actual timezone instead of Claude guessing one — never hardcode a
  // specific zone here.
  const now = new Date()
  let localNowHint = ''
  if (timezone) {
    try {
      const localNow = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(now)
      localNowHint = ` The user's local date/time right now is ${localNow} (timezone: ${timezone}).`
    } catch {
      // Malformed/unrecognized IANA string from the browser — degrade to UTC-only below.
    }
  }
  const nowHint = `\nCurrent date/time (UTC): ${now.toISOString()}.${localNowHint} When the user gives a relative or local time ("in 90 seconds", "tomorrow", "next Friday", "in 2 hours", "at 3pm"), interpret it in the user's local timezone given above (if provided — otherwise treat it as UTC), then convert to the equivalent absolute UTC datetime and pass that as scheduledFor (always UTC, ISO 8601 with a "Z" suffix). Never assume a specific timezone like America/Sao_Paulo unless that's the timezone stated above.`
  const systemBlocks = [
    { type: 'text', text: cachedSystemText, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: nowHint },
  ]
  const anthropic = getClient(apiKey)

  const lang = 'en'

  const history = capHistory(sanitizeHistory(messages))

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      system: systemBlocks,
      messages: history,
      tools: TOOLS,
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      max_tokens: 1024,
    })
    const u = response.usage
    console.log(`[Agent] usage — input:${u.input_tokens} cache_write:${u.cache_creation_input_tokens ?? 0} cache_read:${u.cache_read_input_tokens ?? 0} output:${u.output_tokens}`)

    const toolBlock = response.content.find(b => b.type === 'tool_use')

    // ── Tool call selected ────────────────────────────────────────────────────
    if (toolBlock) {
      const name = toolBlock.name
      const args = toolBlock.input ?? {}

      // ── Read-only tool: resolve server-side, no user confirmation needed ────
      if (name === 'getTransactionHistory') {
        const address = (args.address || walletAddress || '').trim()
        const limit   = args.limit || 5

        if (!address) {
          const message = lang === 'en'
            ? "I couldn't find your wallet address. Connect your wallet and try again."
            : 'Não encontrei o endereço da sua carteira. Conecte sua carteira e tente novamente.'
          return res.json({ type: 'text', message })
        }

        let summary
        let items
        try {
          const data = await fetchTokenTransfers(address)
          const formatted = formatTransactionHistory(data?.items ?? [], address, limit, lang)
          summary = formatted.summary
          items   = formatted.items
        } catch (err) {
          summary = lang === 'en'
            ? `Error fetching history: ${err.message}`
            : `Erro ao buscar histórico: ${err.message}`
          items   = []
        }

        const message = await followupReply(anthropic, systemBlocks, history, response.content, toolBlock.id, summary)

        return res.json({ type: 'tx-history', message, items, lang })
      }

      // ── Scheduled payments: resolved server-side, no client confirmation ────
      // (nothing is signed now — the payment fires later via the backend
      // scheduler, so there's no on-chain action for the user to approve here)
      if (name === 'schedulePayment') {
        const to     = (args.to ?? '').trim()
        const amount = (args.amount ?? '').toString().trim()
        const token  = args.token || 'USDC'

        let summary
        if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
          summary = 'That destination address doesn\'t look like a valid EVM address (0x...). Please provide a valid address.'
        } else if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
          summary = 'Please provide a valid amount greater than 0.'
        } else if (token !== 'USDC') {
          summary = 'Scheduled payments only support USDC today.'
        } else if (!args.scheduledFor && !args.recurrence) {
          summary = 'I need either a specific date/time or a recurrence (daily, weekly, monthly) to schedule this payment.'
        } else if (!walletAddress) {
          summary = "I couldn't find your wallet address. Connect your wallet and try again."
        } else if ((process.env.AUTOMATION_SIGNER || 'viem').trim().toLowerCase() === 'privy') {
          // ── Privy session-signer path ────────────────────────────────────
          // The scheduled payment is sent FROM the user's own Privy embedded
          // wallet (walletAddress) — no Circle/bot wallet involved. The user
          // must grant our key quorum as a session signer once; we flag that
          // to the frontend via needsSessionSigner so it can prompt consent.
          try {
            const payment = await createPayment({
              walletAddress:  walletAddress,   // owner/identity = user's wallet
              notifyAddress:  walletAddress,
              senderAddress:  walletAddress,   // funds source = user's wallet
              recipient:      to,
              amount,
              token,
              scheduledFor:   args.scheduledFor,
              recurrence:     args.recurrence,
              recurrenceDay:  args.recurrenceDay,
              recurrenceTime: args.recurrenceTime,
            })
            // IMPORTANT: instruct the model to preserve the exact scheduled
            // time verbatim — otherwise it tends to paraphrase it as "in 2
            // minutes" / "same time", dropping the concrete clock time the
            // user asked to see (e.g. "09:55").
            const exactWhen = describeSchedule(payment, timezone)
            const summaryText = `Scheduled: ${amount} USDC to ${shortAddr(to)}, ${exactWhen}. Payment ID: ${payment.id}. This will be sent from your own wallet at the scheduled time — you'll be asked to authorize automated payments once. When you reply, ALWAYS state the exact scheduled clock time verbatim ("${exactWhen}") — do not paraphrase it as a relative time like "in 2 minutes".`
            const message = await followupReply(anthropic, systemBlocks, history, response.content, toolBlock.id, summaryText)
            // needsSessionSigner tells the frontend to call addSessionSigners
            // (one-time consent popup) for this wallet.
            return res.json({
              type: 'text',
              message,
              needsSessionSigner: true,
              sessionSignerAddress: walletAddress,
            })
          } catch (err) {
            const message = await followupReply(anthropic, systemBlocks, history, response.content, toolBlock.id, `Couldn't schedule that payment: ${err.message}`)
            return res.json({ type: 'text', message })
          }
        } else {
          try {
            // The wallet the user is chatting from (usually a Privy embedded
            // wallet) can't itself be Circle-custodied — a scheduled payment
            // needs a wallet the backend can sign for headlessly. Reuse one
            // already on file for this identity if there is one; otherwise
            // provision a dedicated automation wallet on the spot, keyed by
            // the stable Privy user id (not the address).
            let owner = await resolveCircleOwner(walletAddress, privyUserId, privyEmail)
            let justProvisioned = false
            if (!owner?.walletId) {
              owner = await provisionAutomationWallet(privyUserId, privyEmail)
              justProvisioned = !!owner
            }

            if (!owner?.walletId) {
              summary = 'Scheduled payments need a wallet the backend can sign for automatically, and I couldn\'t set one up for this session (no linked account id). You can still send USDC immediately with sendUSDC.'
            } else {
              const payment = await createPayment({
                walletAddress:  owner.address,
                notifyAddress:  walletAddress,
                recipient:      to,
                amount,
                token,
                scheduledFor:   args.scheduledFor,
                recurrence:     args.recurrence,
                recurrenceDay:  args.recurrenceDay,
                recurrenceTime: args.recurrenceTime,
              })

              // Funding check (additive — does not block scheduling, since
              // funds can still arrive before the scheduled time). Reads the
              // automation wallet's current USDC balance so we can warn the
              // user up-front instead of letting the scheduler fail silently
              // later. getWalletUsdcBalance returns null on any API/network
              // hiccup, in which case we simply skip the warning.
              const usdcBalance = await getWalletUsdcBalance(owner.walletId)
              const underfunded = usdcBalance !== null && usdcBalance < Number(amount)
              const fundingNote = underfunded
                ? ` ⚠️ Heads up: your automation wallet at ${owner.address} currently holds only ${usdcBalance} USDC, which is less than the ${amount} USDC needed — please top it up before the scheduled time or the payment will fail.`
                : ''

              summary = justProvisioned
                ? `Scheduled: ${amount} USDC to ${shortAddr(to)}, ${describeSchedule(payment, timezone)}. Payment ID: ${payment.id}. IMPORTANT: this is your first scheduled payment, so I set up a dedicated automation wallet at ${owner.address} that the backend signs for automatically — make sure it holds at least ${amount} USDC before the scheduled time, or the payment will fail.${fundingNote}`
                : `Scheduled: ${amount} USDC to ${shortAddr(to)}, ${describeSchedule(payment, timezone)}. Payment ID: ${payment.id}. Runs from your automation wallet at ${owner.address} — make sure it's funded.${fundingNote}`
            }
          } catch (err) {
            summary = `Couldn't schedule that payment: ${err.message}`
          }
        }

        const message = await followupReply(anthropic, systemBlocks, history, response.content, toolBlock.id, summary)
        return res.json({ type: 'text', message })
      }

      if (name === 'listScheduledPayments') {
        let summary
        const owner = await resolveCircleOwner(walletAddress, privyUserId, privyEmail)
        if (!owner) {
          summary = 'No scheduled payments found (no automation wallet set up yet — use schedulePayment to create one).'
        } else {
          const payments = await listPayments(owner.address)
          // Show the automation wallet address + its current USDC balance so
          // the user knows exactly where to send funds. Balance read is
          // best-effort (null on API error) and never blocks the listing.
          const usdcBalance = await getWalletUsdcBalance(owner.walletId)
          const walletLine = usdcBalance !== null
            ? `Automation wallet: ${owner.address} (balance: ${usdcBalance} USDC)\n`
            : `Automation wallet: ${owner.address}\n`
          summary = payments.length === 0
            ? `${walletLine}No scheduled payments found.`
            : walletLine + payments.map(p =>
                `• [${p.status}] ${p.amount} ${p.token} to ${shortAddr(p.recipient)} — ${describeSchedule(p, timezone)}${p.txHash ? ` (last tx: ${p.txHash})` : ''} — id: ${p.id}`
              ).join('\n')
        }

        const message = await followupReply(anthropic, systemBlocks, history, response.content, toolBlock.id, summary)
        return res.json({ type: 'text', message })
      }

      if (name === 'cancelScheduledPayment') {
        let summary
        const owner = await resolveCircleOwner(walletAddress, privyUserId, privyEmail)
        if (!owner) {
          summary = "I couldn't find an automation wallet for this session, so there's nothing to cancel."
        } else {
          const paymentId = (args.paymentId ?? '').trim()
          const cancelled = paymentId ? await cancelPayment(paymentId, owner.address) : null
          if (!cancelled) {
            summary = `Couldn't find a scheduled payment with ID "${paymentId}" for this wallet.`
          } else if (cancelled.status !== 'cancelled') {
            summary = `That payment is already "${cancelled.status}" and can't be cancelled.`
          } else {
            summary = `Cancelled: ${cancelled.amount} ${cancelled.token} to ${shortAddr(cancelled.recipient)}.`
          }
        }

        const message = await followupReply(anthropic, systemBlocks, history, response.content, toolBlock.id, summary)
        return res.json({ type: 'text', message })
      }

      const toolUseId = toolBlock.id
      return res.json({
        type:             'intent',
        tool:             name,
        params:           args,
        toolUseId,
        label:            makeLabel(name, args, lang),
        assistantContent: [{ type: 'tool_use', id: toolUseId, name, input: args }],
      })
    }

    // ── Plain text reply ──────────────────────────────────────────────────────
    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    return res.json({ type: 'text', message: text })

  } catch (err) {
    console.error('[Agent] Anthropic error:', err.message)
    return res.status(500).json({ error: err.message ?? 'Erro ao chamar Anthropic' })
  }
})

export default router
