import { ARC_TESTNET_TOKENS } from '@/constants/tokens'

export interface ArcTokenInfo {
  symbol: string
  decimals: number
}

/** Symbol/decimals for a known Arc Testnet token address; falls back to a short address label + 18 decimals. */
export function getArcTokenInfo(address: string): ArcTokenInfo {
  const a = address.toLowerCase()
  const found = ARC_TESTNET_TOKENS.find((t) => t.address.toLowerCase() === a)
  return found ? { symbol: found.symbol, decimals: found.decimals } : { symbol: `${address.slice(0, 6)}…`, decimals: 18 }
}
