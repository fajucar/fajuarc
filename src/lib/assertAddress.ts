export const ADDR_RE = /^0x[a-fA-F0-9]{40}$/

/** Extracts a valid 0x+40hex address from a string (handles quotes, BOM, trailing chars). */
const EXTRACT_ADDR = /0x[a-fA-F0-9]{40}/

export type NormalizeResult =
  | { ok: true; value: `0x${string}` }
  | { ok: false; value: string }

/**
 * Validates and normalizes an Ethereum address. Never throws.
 * Extracts 0x+40hex even when value has quotes, BOM, or extra chars (env vars from Vercel etc).
 */
export function normalizeAddress(name: string, value?: unknown): NormalizeResult {
  if (value == null || typeof value !== 'string') {
    return {
      ok: false,
      value: `${name}: expected non-empty string, got ${value === null ? 'null' : value === undefined ? 'undefined' : typeof value}`,
    }
  }
  const raw = String(value)
    .replace(/\r/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
  const match = raw.match(EXTRACT_ADDR)
  if (match) {
    return { ok: true, value: match[0] as `0x${string}` }
  }
  return {
    ok: false,
    value: `${name}: no valid address (0x+40 hex) found. Got length ${raw.length}: "${raw}"`,
  }
}

/**
 * Same as normalizeAddress - returns result object, never throws.
 */
export function assertAddress(name: string, value?: unknown): NormalizeResult {
  return normalizeAddress(name, value)
}
