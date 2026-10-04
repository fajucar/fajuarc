/**
 * Payment scheduler — runs every minute, executes due scheduled payments.
 *
 * Signing is routed by AUTOMATION_SIGNER (.env):
 *   - 'viem'   (default) — a single dedicated EOA (server/signer-viem.mjs)
 *              signs directly. Added because Circle's own balance API has a
 *              confirmed indexing gap on ARC-TESTNET — see
 *              server/scripts/diagnose-circle.mjs (tokenBalances comes back
 *              empty, even with includeAll: true, despite a real on-chain
 *              balance) — which made the Circle path unusable for testing.
 *   - 'circle' — the original Circle Developer Controlled Wallet path
 *              (executeContractCall from circle.mjs), kept intact. Switch
 *              back to this once Circle confirms the gap is fixed.
 *
 * Either way, the pre-send on-chain balance check (via server/onchain.mjs)
 * runs first and checks whichever address will actually sign — for 'circle'
 * that's the per-user Circle-managed wallet (payment.walletAddress); for
 * 'viem' that's the ONE shared automation EOA, regardless of which user's
 * payment it is.
 */

import cron from 'node-cron'
import { parseUnits, formatUnits } from 'viem'
import { getDuePayments, markExecuted, markFailed } from './scheduledPayments.mjs'
import { resolveWalletId } from './walletsDb.mjs'
import { executeContractCall } from './circle.mjs'
import { broadcast } from './notifications.mjs'
import { USDC } from './tokens.mjs'
import { getUsdcDecimals, getNativeBalance, estimateUsdcTransferGasCost } from './onchain.mjs'
import { sendUsdc as sendUsdcViaViem, isAutomationSignerConfigured, automationSignerStatus, getAutomationSignerAddress } from './signer-viem.mjs'
import { sendUsdcFromUserWallet, isPrivySignerConfigured, privySignerStatus } from './signer-privy.mjs'
import { networkEnvName } from './network.mjs'

const AUTOMATION_SIGNER = (process.env.AUTOMATION_SIGNER || 'viem').trim().toLowerCase()

let running = false // guard against overlapping runs if a batch takes >1 minute

// ── Circle path (unchanged from before — just extracted into its own function) ─
async function executeViaCircle(payment, amountWei) {
  const walletId = await resolveWalletId(null, payment.walletAddress)
  if (!walletId) {
    throw new Error('No Circle-managed wallet on file for this address — scheduled payments require a Circle wallet.')
  }
  const txHash = await executeContractCall({
    walletId,
    contractAddress:   USDC.address,
    functionSignature: 'transfer(address,uint256)',
    parameters:        [payment.recipient, amountWei.toString()],
  })
  return { txHash, signer: 'circle' }
}

// ── viem path — single shared automation EOA ────────────────────────────────
async function executeViaViem(payment) {
  const { txHash, status } = await sendUsdcViaViem(payment.recipient, payment.amount)
  if (status !== 'success') {
    throw new Error(`viem transaction did not succeed (status: ${status}), tx ${txHash}`)
  }
  return { txHash, signer: 'viem' }
}

// ── Privy path — sends FROM the user's own embedded wallet (session signer) ──
// The funds and gas come from payment.senderAddress (the user's Privy wallet),
// not from any bot/automation wallet. Requires the user to have granted our
// key quorum as a session signer (frontend addSessionSigners).
async function executeViaPrivy(payment) {
  const fromAddress = payment.senderAddress || payment.notifyAddress
  if (!fromAddress) {
    throw new Error('Privy signer needs the user wallet address (payment.senderAddress) — none on record.')
  }
  const { txHash } = await sendUsdcFromUserWallet({
    fromAddress,
    toAddress:   payment.recipient,
    amountHuman: payment.amount,
  })
  return { txHash, signer: 'privy' }
}

/**
 * Which address will actually hold the funds and sign for this payment,
 * given the active AUTOMATION_SIGNER. NOT necessarily payment.walletAddress
 * — that's always the Circle-managed identity regardless of signer (see
 * module docstring).
 */
function resolveExecutionAddress(payment) {
  if (AUTOMATION_SIGNER === 'circle') return payment.walletAddress
  if (AUTOMATION_SIGNER === 'privy')  return payment.senderAddress || payment.notifyAddress
  return getAutomationSignerAddress() // viem — single shared EOA
}

async function executePayment(payment) {
  if (payment.token !== 'USDC') {
    throw new Error(`Scheduled payments only support USDC today (got "${payment.token}").`)
  }

  // Decimals read on-chain, never hardcoded — see server/onchain.mjs.
  const decimals  = await getUsdcDecimals()
  const amountWei = parseUnits(payment.amount, decimals)

  // Pre-send balance check via on-chain state (viem), not Circle's own
  // balance API — the diagnostic script proved Circle's indexer can't be
  // trusted for this token, so it's the wrong source of truth to gate on.
  //
  // CRITICAL (Arc-specific): USDC is the native gas token, so gas is debited
  // from the SAME balance being transferred. Checking only `balance >= amount`
  // ignores gas and the tx reverts with "transfer amount exceeds balance" even
  // though the amount alone "fits". We therefore check against the NATIVE
  // balance (18 decimals) and require it to cover value + estimated gas.
  const executionAddress = resolveExecutionAddress(payment)

  // ERC-20 view (6 decimals) → native units (18 decimals): same underlying
  // balance, different precision. 18 - 6 = 12 extra decimal places.
  const amountNative = amountWei * 10n ** BigInt(18 - decimals)

  const [nativeBalance, gasCost] = await Promise.all([
    getNativeBalance(executionAddress),
    estimateUsdcTransferGasCost({ from: executionAddress, to: payment.recipient, amountWei }),
  ])

  // If gas estimation failed (null), fall back to a small fixed reserve so we
  // still don't send with zero margin. 0.01 USDC in native 18-decimal wei.
  const gasReserve = gasCost ?? (10n ** 16n)
  const required   = amountNative + gasReserve

  if (nativeBalance < required) {
    const fmt = (v) => formatUnits(v, 18)
    console.error(
      `[Scheduler] Insufficient balance for payment ${payment.id} (signer: ${AUTOMATION_SIGNER}): ` +
      `wallet ${executionAddress} native balance ${fmt(nativeBalance)} USDC, ` +
      `needs ${fmt(required)} USDC (${payment.amount} value + ${fmt(gasReserve)} gas reserve).`
    )
    throw new Error(
      `Insufficient balance: wallet ${executionAddress} has ${fmt(nativeBalance)} USDC, ` +
      `needs ~${fmt(required)} USDC (${payment.amount} to send + ${fmt(gasReserve)} for gas). ` +
      `On Arc, gas is paid in USDC from the same balance, so keep a little extra for fees.`
    )
  }

  if (AUTOMATION_SIGNER === 'circle') return executeViaCircle(payment, amountWei)
  if (AUTOMATION_SIGNER === 'privy')  return executeViaPrivy(payment)
  return executeViaViem(payment)
}

// Payments whose tx was SENT but whose "executed" status could not be saved
// to Redis. They must never be sent again by this process, even though the
// store still says "pending" — otherwise a transient Redis error would
// double-pay with real funds. Cleared only by a restart, which is why every
// entry is logged as CRITICAL for manual reconciliation.
const sentButUnpersisted = new Set()

async function withRetries(fn, attempts = 3) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try { return await fn() } catch (err) {
      lastErr = err
      await new Promise(r => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw lastErr
}

async function runDuePayments() {
  if (running) return
  running = true
  try {
    let due
    try {
      due = (await getDuePayments()).filter(p => !sentButUnpersisted.has(p.id))
    } catch (err) {
      console.error('[Scheduler] ❌ Could not read due payments from storage — skipping this run:', err?.message ?? err)
      return
    }
    for (const payment of due) {
      // Broadcast to notifyAddress (the browsing-session/Privy address the
      // frontend actually subscribes with), not walletAddress (the Circle
      // automation wallet that signs the tx) — those are frequently
      // different addresses, and broadcasting under the wrong one means no
      // open browser tab is ever listening for it.
      const notifyAddress = payment.notifyAddress ?? payment.walletAddress
      broadcast(notifyAddress, {
        type:      'payment-pending',
        paymentId: payment.id,
        recipient: payment.recipient,
        amount:    payment.amount,
        token:     payment.token,
      })

      let result
      try {
        result = await executePayment(payment)
      } catch (err) {
        const message = err?.message ?? String(err)
        try {
          await withRetries(() => markFailed(payment.id, message))
        } catch (persistErr) {
          // Nothing was sent, so retrying next minute is safe — just log it.
          console.error(`[Scheduler] Could not save failure of payment ${payment.id}:`, persistErr?.message ?? persistErr)
        }
        console.error(`[Scheduler] ❌ Payment ${payment.id} failed:`, message)
        broadcast(notifyAddress, {
          type:      'payment-failed',
          paymentId: payment.id,
          recipient: payment.recipient,
          amount:    payment.amount,
          token:     payment.token,
          error:     message,
        })
        continue
      }

      // The tx is on-chain from here on. Persisting "executed" is kept OUT of
      // the try above so a storage error can never be treated as a send
      // failure (and retried as a second, real payment).
      const { txHash, signer } = result
      try {
        await withRetries(() => markExecuted(payment.id, txHash))
      } catch (persistErr) {
        sentButUnpersisted.add(payment.id)
        console.error(
          `[Scheduler] 🚨 CRITICAL: payment ${payment.id} was SENT (tx ${txHash}) but its status could not be saved: ` +
          `${persistErr?.message ?? persistErr}. It is blocked from re-sending in this process; reconcile its record manually.`
        )
      }
      console.log(`[Scheduler] ✅ payment ${payment.id} executed via ${signer}, tx ${txHash}`)
      broadcast(notifyAddress, {
        type:      'payment-executed',
        paymentId: payment.id,
        recipient: payment.recipient,
        amount:    payment.amount,
        token:     payment.token,
        txHash,
      })
    }
  } finally {
    running = false
  }
}

export function startPaymentScheduler() {
  if (AUTOMATION_SIGNER === 'viem' && !isAutomationSignerConfigured()) {
    console.error(
      `[Scheduler] ❌ AUTOMATION_SIGNER=viem but the automation signer isn't ready: ${automationSignerStatus()}. ` +
      `Set ${networkEnvName('AUTOMATION_PRIVATE_KEY')} in .env, or set AUTOMATION_SIGNER=circle. ` +
      `The payment scheduler was NOT started (the rest of the server is unaffected).`
    )
    return
  }

  if (AUTOMATION_SIGNER === 'privy' && !isPrivySignerConfigured()) {
    console.error(
      `[Scheduler] ❌ AUTOMATION_SIGNER=privy but the Privy signer isn't ready: ${privySignerStatus()}. ` +
      `Set PRIVY_APP_ID / PRIVY_APP_SECRET / PRIVY_AUTHORIZATION_KEY in .env, or switch AUTOMATION_SIGNER. ` +
      `The payment scheduler was NOT started (the rest of the server is unaffected).`
    )
    return
  }

  const signerLabel =
    AUTOMATION_SIGNER === 'circle' ? 'circle'
    : AUTOMATION_SIGNER === 'privy' ? 'privy (sends from each user\'s own wallet)'
    : `viem (automation address: ${getAutomationSignerAddress()})`

  cron.schedule('* * * * *', runDuePayments)
  console.log(`[Scheduler] Payment scheduler started (signer: ${signerLabel}) — checking every minute for due payments`)
}
