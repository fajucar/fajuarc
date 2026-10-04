/**
 * V3 config — endereços e validação para Arc Testnet
 */

import deployments from '@/config/deployments.v3.arc-testnet.json'
import { ARCDEX } from '@/config/arcDex'

export interface V3Addresses {
  v3Factory: `0x${string}`
  v3SwapRouter: `0x${string}`
  v3PositionManager: `0x${string}`
  v3Quoter: `0x${string}` | null
  weth9: `0x${string}`
  v3Pool_USDC_EURC_500: `0x${string}`
  tokens: {
    USDC: { address: `0x${string}`; decimals: number }
    EURC: { address: `0x${string}`; decimals: number }
  }
}

const required = [
  'v3Factory',
  'v3SwapRouter',
  'v3PositionManager',
  'weth9',
  'v3Pool_USDC_EURC_500',
  'tokens',
] as const

export function getV3Addresses(chainId: number): V3Addresses | null {
  if (chainId !== (deployments as { chainId?: number }).chainId) return null
  const d = deployments as Record<string, unknown>
  for (const key of required) {
    const v = d[key]
    if (v == null || (typeof v === 'string' && !v)) return null
    if (key === 'tokens') {
      const t = v as Record<string, { address?: string; decimals?: number }>
      if (!t?.USDC?.address || !t?.EURC?.address) return null
    }
  }
  const usdc = (d.tokens as Record<string, { address: string; decimals: number }>).USDC
  const eurc = (d.tokens as Record<string, { address: string; decimals: number }>).EURC
  return {
    v3Factory: d.v3Factory as `0x${string}`,
    v3SwapRouter: d.v3SwapRouter as `0x${string}`,
    v3PositionManager: d.v3PositionManager as `0x${string}`,
    v3Quoter: (d.v3Quoter as string) ? (d.v3Quoter as `0x${string}`) : null,
    weth9: d.weth9 as `0x${string}`,
    v3Pool_USDC_EURC_500: d.v3Pool_USDC_EURC_500 as `0x${string}`,
    tokens: {
      USDC: { address: usdc.address as `0x${string}`, decimals: usdc.decimals ?? 6 },
      EURC: { address: eurc.address as `0x${string}`, decimals: eurc.decimals ?? 6 },
    },
  }
}

/**
 * Whether a V3 DEX is deployed on the network the app runs on (ARCDEX.chainId).
 * V3 only exists on Arc Testnet (deployments.v3.arc-testnet.json), so on Arc
 * Mainnet every V3 tab, route and link is hidden; on testnet nothing changes.
 */
export const V3_ENABLED = getV3Addresses(ARCDEX.chainId) !== null

export function getV3ConfigError(chainId: number): string | null {
  if (chainId !== (deployments as { chainId?: number }).chainId) return null
  const d = deployments as Record<string, unknown>
  for (const key of required) {
    const v = d[key]
    if (v == null || (typeof v === 'string' && !v))
      return `V3 config missing: ${key}`
    if (key === 'tokens') {
      const t = v as Record<string, { address?: string }>
      if (!t?.USDC?.address) return 'V3 config missing: tokens.USDC.address'
      if (!t?.EURC?.address) return 'V3 config missing: tokens.EURC.address'
    }
  }
  return null
}
