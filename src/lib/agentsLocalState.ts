/**
 * Optional local persistence for Agents page: usage flags + lightweight UI snapshot.
 * On-chain agent identity is always re-fetched on load; this only smooths UX.
 */

const USAGE_PREFIX = 'fajuarc:agents:usage:'
const UI_PREFIX = 'fajuarc:agents:ui:'

export type AgentsUsageFlags = {
  /** User ran a successful Analyze Swap from Agents */
  swapAnalyzed?: boolean
  /** User ran Suggest Pool from Agents */
  poolSuggested?: boolean
  /** User sent swap prefill to /swap from here */
  swapPrefillSent?: boolean
}

export function getAgentsUsageKey(address: string) {
  return `${USAGE_PREFIX}${address.toLowerCase()}`
}

export function loadAgentsUsage(address: string | null | undefined): AgentsUsageFlags {
  if (!address || typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(getAgentsUsageKey(address))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as AgentsUsageFlags
    return typeof parsed === 'object' && parsed != null ? parsed : {}
  } catch {
    return {}
  }
}

export function saveAgentsUsage(address: string | null | undefined, patch: Partial<AgentsUsageFlags>) {
  if (!address || typeof window === 'undefined') return
  try {
    const prev = loadAgentsUsage(address)
    window.localStorage.setItem(getAgentsUsageKey(address), JSON.stringify({ ...prev, ...patch }))
  } catch {
    // ignore quota / private mode
  }
}

export type AgentsUiSnapshot = {
  activeMode: string | null
  tokenInAddress?: string
  tokenOutAddress?: string
  amountIn?: string
  swapAnalysis?: unknown
  resultNotice?: string | null
}

export function getAgentsUiKey(address: string) {
  return `${UI_PREFIX}${address.toLowerCase()}`
}

export function loadAgentsUiSnapshot(address: string | null | undefined): AgentsUiSnapshot | null {
  if (!address || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(getAgentsUiKey(address))
    if (!raw) return null
    const parsed = JSON.parse(raw) as AgentsUiSnapshot
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function saveAgentsUiSnapshot(address: string | null | undefined, snapshot: AgentsUiSnapshot) {
  if (!address || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getAgentsUiKey(address), JSON.stringify(snapshot))
  } catch {
    // ignore
  }
}

export function clearAgentsUiSnapshot(address: string | null | undefined) {
  if (!address || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(getAgentsUiKey(address))
  } catch {
    // ignore
  }
}
