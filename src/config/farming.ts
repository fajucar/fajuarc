/**
 * FajuFarm configuration — LP staking rewards.
 * Requires VITE_FAJU_FARM_ADDRESS in .env after deploy.
 */

const env = typeof import.meta !== 'undefined' ? (import.meta as { env?: Record<string, string | undefined> }).env : undefined

export const FAJU_FARM_ADDRESS = (env?.VITE_FAJU_FARM_ADDRESS ?? '') as `0x${string}`

/** Maps pair (LP token) address to FajuFarm pool id (pid). Set after addPool on deploy. */
export const POOL_ID_BY_PAIR: Record<string, number> = {
  '0x8a674025863ae28F47dA98d95368586F07Be7142': 0, // USDC/EURC
  '0x33B62Df8cd0B37df83A30eDB12F0e3Ec3a8A7995': 1, // ARCX/EURC
}

export function getPoolId(pairAddress: string): number | null {
  const n = pairAddress.toLowerCase()
  for (const [addr, pid] of Object.entries(POOL_ID_BY_PAIR)) {
    if (addr.toLowerCase() === n) return pid
  }
  return null
}

export const isFarmingEnabled = Boolean(FAJU_FARM_ADDRESS && FAJU_FARM_ADDRESS.length === 42)
