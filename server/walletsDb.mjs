/**
 * Shared wallets-db helpers.
 * Extracted from index.mjs so other server modules (e.g. the payment
 * scheduler) can resolve a Circle walletId for a wallet address without
 * duplicating the read/write/lookup logic.
 *
 * Storage: one Upstash Redis Hash per network — key "fajuarc:<network>:wallets",
 * field = userId, value = JSON entry { address, walletId, email, ... }.
 * Circle walletIds only exist in the environment whose API key created them,
 * so a process on one network must never see the other network's records —
 * the network-prefixed key (see redisKey in network.mjs) guarantees that.
 *
 * All helpers are async (network I/O). Callers MUST await them: an
 * un-awaited Promise is truthy and would be mistaken for a found entry.
 */

import { getRedis, redisKey } from './network.mjs'

const WALLETS_KEY = redisKey('wallets')

function parseEntry(raw) {
  if (raw == null) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

/** Every wallet entry for the active network, as { userId: entry }. */
export async function getAllWallets() {
  const raw = (await getRedis().hgetall(WALLETS_KEY)) ?? {}
  // With automaticDeserialization off, the Upstash SDK returns HGETALL as the
  // raw Redis reply — a flat [field, value, field, value, ...] array — rather
  // than an object. Accept both shapes.
  const pairs = []
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) pairs.push([raw[i], raw[i + 1]])
  } else {
    pairs.push(...Object.entries(raw))
  }
  return Object.fromEntries(pairs.map(([userId, value]) => [userId, parseEntry(value)]))
}

/** Replace (or create) the entry stored under userId. */
export async function setWallet(userId, entry) {
  await getRedis().hset(WALLETS_KEY, { [userId]: JSON.stringify(entry) })
}

/**
 * Store `entry` under userId only if nothing is there yet (atomic HSETNX).
 * Returns true if it was written, false if an entry already existed.
 */
export async function createWalletIfAbsent(userId, entry) {
  const written = await getRedis().hsetnx(WALLETS_KEY, userId, JSON.stringify(entry))
  return written === 1
}

export async function findUserByAddress(address) {
  if (!address) return null
  const target = address.toLowerCase()
  const db = await getAllWallets()
  for (const [userId, entry] of Object.entries(db)) {
    if (entry.address?.toLowerCase() === target) return { userId, ...entry }
  }
  return null
}

/**
 * Look up a wallet entry by its stable owner key (Privy user id,
 * e.g. "did:privy:..." or "google:..." — the same key getOrCreateWallet
 * stores under), NOT by address. Used where the caller's on-chain address
 * doesn't (and structurally can't) have a Circle-managed entry of its own —
 * e.g. a Privy embedded wallet — but we still want to find/attach that
 * user's separate Circle automation wallet, if one already exists.
 */
export async function findUserById(userId) {
  if (!userId) return null
  const entry = parseEntry(await getRedis().hget(WALLETS_KEY, userId))
  return entry ? { userId, ...entry } : null
}

/**
 * Look up a wallet entry by the `.email` field stored on it —
 * NOT by key. This is the identity that's actually stable across login
 * methods: the same physical person can get a different Privy DID
 * depending on which social network they authenticated with (Privy does
 * not retroactively merge accounts), but their email doesn't change.
 * Prefer this over findUserById(privyUserId) wherever an email is
 * available — see resolveCircleOwner in agent.mjs.
 */
export async function findUserByEmail(email) {
  const normalized = (email ?? '').toLowerCase().trim()
  if (!normalized) return null
  const db = await getAllWallets()
  for (const [userId, entry] of Object.entries(db)) {
    if (entry.email?.toLowerCase() === normalized) return { userId, ...entry }
  }
  return null
}

export async function resolveWalletId(_req, fromAddress) {
  if (fromAddress) {
    const entry = await findUserByAddress(fromAddress)
    if (entry?.walletId) return entry.walletId
  }
  return null
}
