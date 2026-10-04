import 'dotenv/config'

/**
 * FajuARC Backend
 * - Circle Developer Controlled Wallets (wallet signing)
 * Auth: every route that touches a user's wallet or data requires a verified
 *       Privy access token (see auth.mjs); identity never comes from the body.
 * Port: 3002
 */

import express from 'express'
import { parseUnits } from 'viem'
import cors from 'cors'
import agentRouter from './agent.mjs'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { executeContractCall, getCircleClient, getOrCreateWallet } from './circle.mjs'
import { ARC_NETWORK, ARC_CHAIN_ID, ARC_RPC_URL, CIRCLE_BLOCKCHAIN, getCircleCredentials } from './network.mjs'
import { fetchAddressTransactions, fetchTokenTransfers, fetchAddressInfo, fetchAddressCounters } from './arcscan.mjs'
import { findUserByAddress, findUserByEmail, setWallet } from './walletsDb.mjs'
import { getRedis } from './network.mjs'
import { requireAuth, assertAuthConfigured, ownsAddress, ownsCircleEntry, FORBIDDEN_WALLET } from './auth.mjs'
import { startPaymentScheduler } from './scheduler.mjs'
import { notificationBus } from './notifications.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = resolve(__dir, '..')

// ── Env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  const file = resolve(ROOT, '.env')
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf-8').split('\n')
      .map(l => l.match(/^([^#=\s]+)\s*=\s*(.*)$/))
      .filter(Boolean).map(m => [m[1], m[2].trim()])
  )
}

const env = loadEnv()
const get = (key) => (process.env[key] || env[key] || '').trim()

const FRONTEND_URL = get('FRONTEND_URL') || 'http://localhost:3000'

// ── Auth (fail fast) ──────────────────────────────────────────────────────────
try {
  assertAuthConfigured()
} catch (err) {
  console.error('❌', err.message)
  process.exit(1)
}

// ── Circle credentials (fail fast) ────────────────────────────────────────────
// network.mjs already refused to load without a valid ARC_NETWORK; here we
// also refuse to start if the *_MAINNET / *_TESTNET Circle vars are missing
// or the API key's prefix doesn't match the network.
let CIRCLE_WALLET_SET_ID
try {
  CIRCLE_WALLET_SET_ID = getCircleCredentials().walletSetId
} catch (err) {
  console.error('❌', err.message)
  process.exit(1)
}

// ── Circle client ─────────────────────────────────────────────────────────────
const circle = getCircleClient()

// ── Storage (Upstash Redis, fail fast) ────────────────────────────────────────
// Wallets and scheduled payments live in Redis (walletsDb.mjs /
// scheduledPayments.mjs) because Render Free has no persistent disk. Refuse
// to start if the store is unreachable rather than failing on first request.
try {
  await getRedis().ping()
} catch (err) {
  console.error('❌ Upstash Redis indisponível:', err.message)
  process.exit(1)
}

// getOrCreateWallet now lives in circle.mjs (imported above) so agent.mjs's
// scheduled-payment auto-provisioning can reuse it without duplicating the
// createWallets() call.

// ── Express ───────────────────────────────────────────────────────────────────
const app = express()

app.use(cors({ origin: FRONTEND_URL, credentials: true }))
app.use(express.json())

// ── Rotas ─────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }))

/**
 * The Circle wallet stored for `address`, but only if it belongs to the
 * authenticated user (req.auth). Returns null for "not found" and "not yours"
 * alike, so callers answer 403 without revealing which wallets exist.
 */
async function ownedCircleWallet(req, address) {
  if (!address) return null
  const entry = await findUserByAddress(address)
  return entry && ownsCircleEntry(req.auth, entry) ? entry : null
}

// Carteira Circle — lookup por email (do próprio usuário) ou address (própria)
app.get('/api/wallet/info', requireAuth(), async (req, res) => {
  try {
    const email = (req.query.email ?? '').toString().trim().toLowerCase()
    if (email) {
      if (!req.auth.emails.has(email)) return res.status(403).json({ error: 'Forbidden: email does not belong to the authenticated user' })
      let entry = await findUserByEmail(email)
      if (!entry) {
        const userId = 'email:' + email
        entry = { userId, ...(await getOrCreateWallet(userId, email)) }
      }
      return res.json({ walletId: entry.walletId, walletAddress: entry.address, email })
    }

    const address = (req.query.address ?? '').toString().trim()
    if (address) {
      const entry = await ownedCircleWallet(req, address)
      if (!entry) return res.status(403).json({ error: FORBIDDEN_WALLET })
      return res.json({ walletId: entry.walletId, walletAddress: entry.address })
    }

    return res.status(400).json({ error: 'email ou address obrigatório' })
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Erro ao buscar carteira' })
  }
})

// ── Arc RPC helper (network selected by ARC_NETWORK, see network.mjs) ─────────
const ARC_RPC = ARC_RPC_URL

// Legacy contract call route (backward compat)
app.post('/api/contract-call', requireAuth(), async (req, res) => {
  const { fromAddress, contractAddress, abiFunctionSignature, abiParameters = [] } = req.body
  if (!fromAddress || !contractAddress || !abiFunctionSignature) {
    return res.status(400).json({ error: 'fromAddress, contractAddress e abiFunctionSignature são obrigatórios' })
  }
  try {
    const walletId = (await ownedCircleWallet(req, fromAddress))?.walletId
    if (!walletId) return res.status(403).json({ error: FORBIDDEN_WALLET })
    const txHash = await executeContractCall({ walletId, contractAddress, functionSignature: abiFunctionSignature, parameters: abiParameters })
    return res.json({ success: true, txHash })
  } catch (err) {
    console.error('[contract-call] Erro:', err?.response?.data?.message ?? err?.message)
    return res.status(500).json({ error: err?.response?.data?.message ?? err?.message ?? String(err) })
  }
})

// Enviar USDC via Circle Developer Controlled Wallet
app.post('/api/send-usdc', requireAuth(), async (req, res) => {
  const { fromAddress, toAddress, amountUsdc } = req.body
  if (!fromAddress || !toAddress || !amountUsdc) {
    return res.status(400).json({ error: 'fromAddress, toAddress e amountUsdc são obrigatórios' })
  }
  try {
    const userEntry = await ownedCircleWallet(req, fromAddress)
    if (!userEntry?.walletId) return res.status(403).json({ error: FORBIDDEN_WALLET })

    // Transferência nativa: USDC nativo usa 18 decimais. parseUnits evita perda de precisão de float.
    const valueWei = parseUnits(String(amountUsdc), 18)

    const [nonceRes, gasPriceRes] = await Promise.all([
      fetch(ARC_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [fromAddress, 'latest'], id: 1 }) }),
      fetch(ARC_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 2 }) }),
    ])
    const nonce = parseInt((await nonceRes.json()).result, 16)
    const gasPrice = (await gasPriceRes.json()).result

    console.log('[Circle] Assinando transação:', fromAddress, '→', toAddress, amountUsdc, 'USDC')

    const signRes = await circle.signTransaction({
      walletId: userEntry.walletId,
      blockchain: CIRCLE_BLOCKCHAIN,
      transaction: JSON.stringify({
        to: toAddress,
        nonce: '0x' + nonce.toString(16),
        value: '0x' + valueWei.toString(16),
        gasLimit: '0x5208',
        gasPrice,
        chainId: ARC_CHAIN_ID,
      }),
    })

    const signature = signRes.data?.signature
    if (!signature) throw new Error('Circle não retornou assinatura: ' + JSON.stringify(signRes.data))

    const sendData = await (await fetch(ARC_RPC, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [signature], id: 3 }),
    })).json()

    if (sendData.error) throw new Error(sendData.error.message)
    console.log('[Arc] ✅ Transação enviada:', sendData.result)
    return res.json({ success: true, txHash: sendData.result })
  } catch (err) {
    console.error('[Circle] ❌ Erro ao enviar:', err?.message ?? err)
    return res.status(500).json({ error: err?.message ?? 'Erro ao enviar' })
  }
})

// Cria ou recupera a wallet Circle do usuário autenticado (userId vem do token)
app.post('/api/wallet/get-or-create', requireAuth(), async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.auth.userId)
    return res.json({ address: wallet.address, walletId: wallet.walletId })
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Erro interno' })
  }
})

app.get('/api/wallet/balance', requireAuth(), async (req, res) => {
  const address = req.query.address
  if (!address) return res.status(400).json({ error: 'Endereço não encontrado' })
  try {
    const walletId = (await ownedCircleWallet(req, address))?.walletId
    if (!walletId) return res.status(403).json({ error: FORBIDDEN_WALLET })
    const result = await getCircleClient().getWalletTokenBalance({ id: walletId })
    return res.json({ balances: result?.data?.tokenBalances ?? [] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/wallet/execute', requireAuth(), async (req, res) => {
  const { fromAddress, contractAddress, functionSignature, parameters = [] } = req.body
  if (!contractAddress || !functionSignature) {
    return res.status(400).json({ error: 'contractAddress e functionSignature obrigatórios' })
  }
  try {
    const walletId = (await ownedCircleWallet(req, fromAddress))?.walletId
    if (!walletId) return res.status(403).json({ error: FORBIDDEN_WALLET })
    const txHash = await executeContractCall({ walletId, contractAddress, functionSignature, parameters })
    return res.json({ success: true, txHash })
  } catch (err) {
    console.error('[Execute] error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── Withdrawal address (EVM external wallet for payouts) ─────────────────────
// A withdrawal address can be read/set for the user's own linked wallet or
// for a Circle wallet that belongs to them — never for someone else's.
function canManageWithdrawal(identity, address, entry) {
  return ownsAddress(identity, address) || ownsCircleEntry(identity, entry)
}

app.get('/api/wallet/withdrawal-address/:address', requireAuth(), async (req, res) => {
  const { address } = req.params
  if (!address) return res.status(400).json({ error: 'address obrigatório' })
  try {
    const user = await findUserByAddress(address)
    if (!canManageWithdrawal(req.auth, address, user)) return res.status(403).json({ error: FORBIDDEN_WALLET })
    return res.json({ withdrawalAddress: user?.withdrawalAddress ?? null })
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Erro ao buscar endereço de saque' })
  }
})

app.post('/api/wallet/withdrawal-address', requireAuth(), async (req, res) => {
  const { walletAddress, withdrawalAddress } = req.body
  if (!walletAddress || !withdrawalAddress) {
    return res.status(400).json({ error: 'walletAddress e withdrawalAddress obrigatórios' })
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(withdrawalAddress)) {
    return res.status(400).json({ error: 'Endereço EVM inválido' })
  }
  try {
    const found = await findUserByAddress(walletAddress)
    if (!canManageWithdrawal(req.auth, walletAddress, found)) return res.status(403).json({ error: FORBIDDEN_WALLET })
    if (!found) {
      // Cria entrada mínima se não existir ainda
      const key = `ext_${walletAddress.toLowerCase()}`
      await setWallet(key, { address: walletAddress.toLowerCase(), withdrawalAddress })
    } else {
      const { userId, ...entry } = found
      await setWallet(userId, { ...entry, withdrawalAddress })
    }
    console.log(`[Withdrawal] Endereço salvo: ${walletAddress.slice(0, 10)}... → ${withdrawalAddress}`)
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Erro ao salvar endereço de saque' })
  }
})

// ── Arc Testnet Explorer proxy (via ArcScan, see server/arcscan.mjs) ──────────

app.get('/api/explorer/address/:address', async (req, res) => {
  console.log('[Explorer] GET transactions for', req.params.address)
  try {
    const data = await fetchAddressTransactions(req.params.address)
    console.log('[Explorer] OK – items:', data?.items?.length ?? 'N/A')
    res.json(data)
  } catch(err) {
    console.error('[Explorer] FAIL:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/explorer/address/:address/token-transfers', async (req, res) => {
  console.log('[Explorer] GET token-transfers for', req.params.address)
  try {
    const data = await fetchTokenTransfers(req.params.address)
    console.log('[Explorer] token-transfers OK – items:', data?.items?.length ?? 'N/A')
    res.json(data)
  } catch(err) {
    console.error('[Explorer] token-transfers FAIL:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/explorer/address/:address/info', async (req, res) => {
  console.log('[Explorer] GET info for', req.params.address)
  try {
    const data = await fetchAddressInfo(req.params.address)
    console.log('[Explorer] info OK')
    res.json(data)
  } catch(err) {
    console.error('[Explorer] info FAIL:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/explorer/address/:address/counters', async (req, res) => {
  console.log('[Explorer] GET counters for', req.params.address)
  try {
    const data = await fetchAddressCounters(req.params.address)
    console.log('[Explorer] counters OK – transactions_count:', data?.transactions_count)
    res.json(data)
  } catch(err) {
    console.error('[Explorer] counters FAIL:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Agent chat (LLM + tool_use — model configured in agent.mjs) ──────────────
// Authenticated: agent.mjs takes the user's identity from req.auth.
app.use('/api/agent', requireAuth(), agentRouter)

// ── Global transaction notifications (SSE) ────────────────────────────────────
// Scheduled payments execute on the backend with no button click to react
// to — this stream is how the frontend learns about them (and their
// outcome) in near real time, regardless of which screen the user is on.
// EventSource can't send headers, so this route alone takes ?access_token=.
// The address must be one of the caller's own wallets — an empty or foreign
// address would otherwise receive other users' payment notifications.
app.get('/api/notifications/stream', requireAuth({ allowQueryToken: true }), (req, res) => {
  const address = (req.query.address ?? '').toString().toLowerCase()
  if (!ownsAddress(req.auth, address)) return res.status(403).json({ error: FORBIDDEN_WALLET })

  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(': connected\n\n')

  const onNotification = (payload) => {
    if (address && payload.walletAddress && payload.walletAddress !== address) return
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }
  notificationBus.on('notification', onNotification)

  // Keep intermediary proxies from closing an idle connection.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    notificationBus.off('notification', onNotification)
  })
})

const PORT = process.env.PORT || 3002
app.listen(PORT, () => {
  console.log(`\n🟢 FajuARC Backend em http://localhost:${PORT}`)
  console.log(`   Network: ${ARC_NETWORK} (chainId ${ARC_CHAIN_ID}, Circle ${CIRCLE_BLOCKCHAIN})`)
  console.log('   Auth: Privy (frontend-only)')
  console.log('   Circle Wallet Set:', CIRCLE_WALLET_SET_ID)
  console.log(`   Explorer proxy: GET /api/explorer/address/:address`)

  startPaymentScheduler()

  // Startup test: verify the explorer API (configured in arcscan.mjs) is reachable
  // (queries the USDC system contract, which exists on every Arc network)
  fetchAddressTransactions('0x3600000000000000000000000000000000000000')
    .then(d => console.log('   ✅ ArcScan API OK – items:', d?.items?.length ?? JSON.stringify(d).slice(0, 80)))
    .catch(e => console.error('   ❌ ArcScan API FAIL:', e.message))
})
