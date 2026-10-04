/**
 * Scheduled payments storage — one Upstash Redis Hash per network, key
 * "fajuarc:<network>:scheduled-payments", field = payment id, value = JSON
 * record (same pattern as walletsDb.mjs). Each write touches only its own
 * payment, never the whole collection. All exports are async.
 *
 * A payment record unifies one-time and recurring schedules behind a single
 * `nextRun` timestamp: the scheduler just asks "which pending payments have
 * nextRun <= now" — it doesn't need separate code paths for "due date" vs
 * "due recurrence".
 *
 *   {
 *     id, walletAddress, recipient, amount, token,
 *     scheduledFor,      // ISO string | null — set for one-time payments
 *     recurrence,        // 'daily'|'weekly'|'monthly' | null
 *     recurrenceDay,     // weekday name (weekly) or day-of-month (monthly) | null
 *     recurrenceTime,    // 'HH:mm' | null
 *     nextRun,           // ISO string — when the scheduler should fire next
 *     status,            // 'pending' | 'executed' | 'failed' | 'cancelled'
 *     txHash,            // last successful tx hash | null
 *     lastError,         // last failure message | null
 *     history,           // [{ executedAt, txHash? , error? }, ...] — recurring run log
 *     createdAt, executedAt,
 *   }
 */

import { randomUUID } from 'node:crypto'
import { getRedis, redisKey } from './network.mjs'

// Network-namespaced key (see walletsDb.mjs). A schedule created on testnet
// must never be picked up by a mainnet scheduler: with the Privy signer the
// sender is the user's embedded wallet, whose address is the same on every
// EVM chain — it would move real funds.
const PAYMENTS_KEY = redisKey('scheduled-payments')

const parse = (raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw)

async function readAll() {
  const values = (await getRedis().hvals(PAYMENTS_KEY)) ?? []
  return values.map(parse)
}

async function readOne(id) {
  const raw = await getRedis().hget(PAYMENTS_KEY, id)
  return raw == null ? null : parse(raw)
}

async function save(payment) {
  await getRedis().hset(PAYMENTS_KEY, { [payment.id]: JSON.stringify(payment) })
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function parseWeekday(day) {
  if (day == null) return null
  const s = String(day).trim().toLowerCase()
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    return n >= 0 && n <= 6 ? n : null
  }
  const idx = WEEKDAYS.findIndex(w => w === s || w.startsWith(s.slice(0, 3)))
  return idx === -1 ? null : idx
}

function parseTimeOfDay(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time ?? '').trim())
  if (!m) return { hours: 9, minutes: 0 } // default 09:00
  const hours = Math.min(23, Math.max(0, Number(m[1])))
  const minutes = Math.min(59, Math.max(0, Number(m[2])))
  return { hours, minutes }
}

// ISO 8601 datetime that ends in an explicit offset ("Z" or ±hh:mm). Without
// one, `new Date()` would read it in the server process's own timezone.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/i

/**
 * Validates a one-time `scheduledFor` before a payment is proposed or
 * created. Returns null when valid, otherwise a user-facing English message.
 * A past date must never get through: the scheduler would pick it up as due
 * and send it immediately.
 */
export function validateScheduledFor(scheduledFor, now = new Date()) {
  const value = typeof scheduledFor === 'string' ? scheduledFor.trim() : ''
  if (!ISO_WITH_OFFSET.test(value)) {
    return `The scheduled date/time "${scheduledFor ?? ''}" must be an ISO 8601 datetime with an explicit timezone offset, ending in "Z" (UTC) or like "-03:00".`
  }
  const when = new Date(value)
  if (Number.isNaN(when.getTime())) {
    return `The scheduled date/time "${value}" is not a valid date.`
  }
  if (when <= now) {
    return `The scheduled date/time ${when.toISOString()} is in the past (it is now ${now.toISOString()}). Please choose a future date and time.`
  }
  const maxDate = new Date(now)
  maxDate.setUTCFullYear(maxDate.getUTCFullYear() + 1)
  if (when > maxDate) {
    return `The scheduled date/time ${when.toISOString()} is more than 1 year from now (it is now ${now.toISOString()}). Scheduled payments can be at most 1 year ahead.`
  }
  return null
}

/**
 * Compute the next fire time (ISO string) strictly after `fromDate`.
 * One-time payments just use `scheduledFor` as-is (only called once, at creation).
 *
 * All arithmetic below uses the UTC-suffixed Date methods deliberately —
 * recurrenceTime/recurrenceDay are interpreted as UTC (matching the "Z"
 * suffix already used for scheduledFor). Using local-time methods here would
 * make "every day at 09:00" fire at a different real-world instant depending
 * on the server process's OS timezone, which is not something we control or
 * want this feature's correctness to depend on.
 */
export function computeNextRun({ scheduledFor, recurrence, recurrenceDay, recurrenceTime }, fromDate = new Date()) {
  if (!recurrence) {
    const d = new Date(scheduledFor)
    if (Number.isNaN(d.getTime())) throw new Error('Invalid scheduledFor datetime')
    return d.toISOString()
  }

  const { hours, minutes } = parseTimeOfDay(recurrenceTime)
  const next = new Date(fromDate)
  next.setUTCSeconds(0, 0)
  next.setUTCHours(hours, minutes, 0, 0)

  if (recurrence === 'daily') {
    if (next <= fromDate) next.setUTCDate(next.getUTCDate() + 1)
    return next.toISOString()
  }

  if (recurrence === 'weekly') {
    const targetDow = parseWeekday(recurrenceDay)
    if (targetDow === null) throw new Error('recurrenceDay is required and must be a weekday for weekly recurrence')
    while (next.getUTCDay() !== targetDow || next <= fromDate) {
      next.setUTCDate(next.getUTCDate() + 1)
    }
    return next.toISOString()
  }

  if (recurrence === 'monthly') {
    const dom = Number(recurrenceDay)
    if (!Number.isInteger(dom) || dom < 1 || dom > 31) {
      throw new Error('recurrenceDay is required and must be a day of month (1-31) for monthly recurrence')
    }
    next.setUTCDate(1)
    const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    const clampedDay = Math.min(dom, daysInMonth(next.getUTCFullYear(), next.getUTCMonth()))
    next.setUTCDate(clampedDay)
    if (next <= fromDate) {
      next.setUTCMonth(next.getUTCMonth() + 1, 1)
      const clamped = Math.min(dom, daysInMonth(next.getUTCFullYear(), next.getUTCMonth()))
      next.setUTCDate(clamped)
    }
    return next.toISOString()
  }

  throw new Error(`Unknown recurrence: ${recurrence}`)
}

export async function listPayments(walletAddress) {
  const addr = (walletAddress ?? '').toLowerCase()
  return (await readAll())
    .filter(p => p.walletAddress === addr)
    .sort((a, b) => new Date(a.nextRun ?? a.scheduledFor) - new Date(b.nextRun ?? b.scheduledFor))
}

export async function createPayment({ walletAddress, notifyAddress, senderAddress, recipient, amount, token, scheduledFor, recurrence, recurrenceDay, recurrenceTime }) {
  // Re-checked here, not only at proposal time: a date that was valid when
  // proposed can be in the past by the time the user confirms.
  if (!recurrence) {
    const invalid = validateScheduledFor(scheduledFor)
    if (invalid) throw new Error(invalid)
  }
  const nextRun = computeNextRun({ scheduledFor, recurrence, recurrenceDay, recurrenceTime })
  const payment = {
    id:             randomUUID(),
    // walletAddress is the Circle-managed automation wallet the scheduler
    // signs with (resolveWalletId looks this up) — it can be a different
    // address than the one the browser session is actually using (see
    // resolveCircleOwner in agent.mjs). notifyAddress is that browsing-
    // session address, kept separately so the scheduler can tell the SSE
    // stream who to notify — broadcasting under walletAddress would target
    // an address no open browser tab is ever subscribed to.
    walletAddress:  (walletAddress ?? '').toLowerCase(),
    notifyAddress:  (notifyAddress ?? walletAddress ?? '').toLowerCase(),
    // senderAddress is the user's own Privy embedded wallet — the funds
    // source when AUTOMATION_SIGNER=privy. Falls back to notifyAddress (the
    // browsing-session address, which for Privy users IS their wallet).
    senderAddress:  (senderAddress ?? notifyAddress ?? '').toLowerCase(),
    recipient,
    amount:         String(amount),
    token:          token || 'USDC',
    scheduledFor:   scheduledFor ?? null,
    recurrence:     recurrence ?? null,
    recurrenceDay:  recurrenceDay ?? null,
    recurrenceTime: recurrenceTime ?? null,
    nextRun,
    status:         'pending',
    txHash:         null,
    lastError:      null,
    history:        [],
    createdAt:      new Date().toISOString(),
    executedAt:     null,
  }
  await save(payment)
  return payment
}

export async function cancelPayment(id, walletAddress) {
  if (!id) return null
  const addr = (walletAddress ?? '').toLowerCase()
  const payment = await readOne(id)
  if (!payment || payment.walletAddress !== addr) return null
  if (payment.status !== 'pending') return payment // already terminal — nothing to cancel
  payment.status = 'cancelled'
  await save(payment)
  return payment
}

export async function getDuePayments() {
  const now = new Date()
  return (await readAll()).filter(p => p.status === 'pending' && p.nextRun && new Date(p.nextRun) <= now)
}

export async function markExecuted(id, txHash) {
  const payment = await readOne(id)
  if (!payment) return null
  const executedAt = new Date().toISOString()
  payment.txHash = txHash
  payment.lastError = null
  payment.executedAt = executedAt
  payment.history.push({ executedAt, txHash })

  if (payment.recurrence) {
    // Recurring: stays pending, schedule the next occurrence.
    payment.nextRun = computeNextRun(payment, new Date())
  } else {
    payment.status = 'executed'
  }
  await save(payment)
  return payment
}

export async function markFailed(id, error) {
  const payment = await readOne(id)
  if (!payment) return null
  const executedAt = new Date().toISOString()
  payment.lastError = error
  payment.history.push({ executedAt, error })

  if (payment.recurrence) {
    // Recurring: keep retrying on the normal cadence instead of dying forever.
    payment.nextRun = computeNextRun(payment, new Date())
  } else {
    payment.status = 'failed'
  }
  await save(payment)
  return payment
}
