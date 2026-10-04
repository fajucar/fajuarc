/**
 * Request authentication + ownership checks.
 *
 * Every route that reads or moves a user's funds/data must know WHO is
 * calling, from a credential the caller cannot forge — never from the
 * request body. The frontend sends the Privy access token
 * (Authorization: Bearer <token>); we verify its signature against the
 * app's JWKS with @privy-io/node, take the user id from the verified token,
 * and load that user's linked accounts (emails, Google subject, wallet
 * addresses) from the Privy API. Ownership decisions use only that.
 *
 * Routes then check that the wallet they are about to act on belongs to the
 * authenticated user:
 *   - ownsAddress(identity, addr)      — one of the user's own linked wallets
 *   - ownsCircleEntry(identity, entry) — a Circle wallet stored under one of
 *     the user's identity keys (Privy DID, email:<verified email>,
 *     google:<verified Google subject>) or tagged with a verified email.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrivyClient } from '@privy-io/node'

// ── Self-contained .env load (same pattern as circle.mjs / signer-*.mjs) ─────
const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = resolve(__dir, '..')

function loadEnvFile() {
  const file = resolve(ROOT, '.env')
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf-8').split('\n')
      .map(l => l.match(/^([^#=\s]+)\s*=\s*(.*)$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.trim()])
  )
}

const _envFile = loadEnvFile()
const getEnv = (key) => (process.env[key] || _envFile[key] || '').trim()

export class AuthError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// ── Privy client (verification + user lookup) ────────────────────────────────
let _privy = null
function getPrivy() {
  if (_privy) return _privy
  const appId     = getEnv('PRIVY_APP_ID')
  const appSecret = getEnv('PRIVY_APP_SECRET')
  if (!appId || !appSecret) throw new Error('PRIVY_APP_ID / PRIVY_APP_SECRET missing — cannot authenticate requests')
  _privy = new PrivyClient({ appId, appSecret })
  return _privy
}

/** Fails fast at startup if the Privy credentials needed for auth are missing. */
export function assertAuthConfigured() {
  getPrivy()
}

// Pluggable backend so the adversarial tests can exercise the ownership rules
// without a live Privy login. Only reachable with NODE_ENV=test.
let backend = {
  verify:  async (token) => (await getPrivy().utils().auth().verifyAccessToken(token)).user_id,
  getUser: async (userId) => getPrivy().users()._get(userId),
}
export function __setAuthBackendForTests(override) {
  if (process.env.NODE_ENV !== 'test') throw new Error('__setAuthBackendForTests is only available with NODE_ENV=test')
  backend = { ...backend, ...override }
  identityCache.clear()
}

// ── Identity (linked accounts), cached briefly to spare the Privy API ────────
const IDENTITY_TTL_MS = 60_000
const identityCache = new Map()

function buildIdentity(user) {
  const emails = new Set()
  const googleSubjects = new Set()
  const addresses = new Set()
  for (const acc of user?.linked_accounts ?? []) {
    if (acc.type === 'email' && acc.address) emails.add(acc.address.toLowerCase())
    if (acc.type === 'google_oauth') {
      if (acc.email) emails.add(acc.email.toLowerCase())
      if (acc.subject) googleSubjects.add(String(acc.subject))
    }
    if ((acc.type === 'wallet' && acc.chain_type === 'ethereum') || acc.type === 'smart_wallet') {
      if (acc.address) addresses.add(acc.address.toLowerCase())
    }
  }
  // Primary email: the email login account first, then Google's.
  const emailAcc  = user?.linked_accounts?.find(a => a.type === 'email')
  const googleAcc = user?.linked_accounts?.find(a => a.type === 'google_oauth')
  const primaryEmail = (emailAcc?.address ?? googleAcc?.email ?? '').toLowerCase() || null
  return { userId: user.id, primaryEmail, emails, googleSubjects, addresses }
}

async function getIdentity(userId) {
  const cached = identityCache.get(userId)
  if (cached && cached.expires > Date.now()) return cached.identity
  const user = await backend.getUser(userId)
  if (!user?.id || user.id !== userId) throw new AuthError(401, 'Unauthorized: user not found')
  const identity = buildIdentity(user)
  identityCache.set(userId, { identity, expires: Date.now() + IDENTITY_TTL_MS })
  return identity
}

function extractToken(req, { allowQueryToken }) {
  const header = req.headers?.authorization ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (match) return match[1].trim()
  // EventSource cannot set headers, so the SSE route alone accepts ?access_token=.
  if (allowQueryToken && typeof req.query?.access_token === 'string') return req.query.access_token
  return null
}

/** Verifies the request's Privy access token and returns the caller's identity. */
export async function authenticate(req, { allowQueryToken = false } = {}) {
  const token = extractToken(req, { allowQueryToken })
  if (!token) throw new AuthError(401, 'Unauthorized: missing access token')
  let userId
  try {
    userId = await backend.verify(token)
  } catch {
    throw new AuthError(401, 'Unauthorized: invalid or expired access token')
  }
  if (!userId) throw new AuthError(401, 'Unauthorized: invalid access token')
  return getIdentity(userId)
}

/** Express middleware: rejects with 401 unless the request carries a valid Privy access token. */
export function requireAuth({ allowQueryToken = false } = {}) {
  return async (req, res, next) => {
    try {
      req.auth = await authenticate(req, { allowQueryToken })
      next()
    } catch (err) {
      const status = err instanceof AuthError ? err.status : 401
      res.status(status).json({ error: err instanceof AuthError ? err.message : 'Unauthorized' })
    }
  }
}

// ── Ownership ────────────────────────────────────────────────────────────────
/** True if `address` is one of the authenticated user's own linked wallets. */
export function ownsAddress(identity, address) {
  return !!address && identity.addresses.has(String(address).toLowerCase())
}

/** Identity keys a Circle wallet of this user may be stored under (see getOrCreateWallet). */
export function identityKeys(identity) {
  return [
    identity.userId,
    ...[...identity.emails].map(e => `email:${e}`),
    ...[...identity.googleSubjects].map(s => `google:${s}`),
  ]
}

/** True if a walletsDb entry ({ userId, ...entry }) belongs to the authenticated user. */
export function ownsCircleEntry(identity, entry) {
  if (!entry) return false
  if (identityKeys(identity).includes(entry.userId)) return true
  return !!entry.email && identity.emails.has(entry.email.toLowerCase())
}

export const FORBIDDEN_WALLET = 'Forbidden: wallet does not belong to the authenticated user'
