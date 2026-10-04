import { formatUnits } from 'viem'

export function formatNumber(
  value: number | string,
  decimals: number = 3
): string {
  if (!value) return "0.000"

  const num = typeof value === "string" ? Number(value) : value

  if (isNaN(num)) return "0.000"

  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatMoney(value: number | string, decimals = 4): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num) || num === 0) return '0'

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(num)
}

/**
 * Token quantity display: raw wei -> grouped decimal string, max 4 decimals, no compact
 * notation (no K/M/B/T), no "$" prefix. Use formatUSD() for USD-denominated values instead.
 */
export function formatTokenAmount(raw: bigint, decimals: number, maxDecimals = 4): string {
  const exact = formatUnits(raw, decimals)
  return formatMoney(exact, maxDecimals)
}

/** Stablecoin symbol -> its fiat prefix. Add new fiat-pegged tokens here, not at call sites. */
const FIAT_PREFIX: Record<string, string> = {
  USDC: '$',
  EURC: '€',
}

/**
 * Token amount formatted with its fiat prefix when the symbol is a known stablecoin (USDC -> $,
 * EURC -> €); a plain number for everything else (FAJU, ARCX, QCAD, ...). Always shows exactly 4
 * decimals (no trimming, unlike formatMoney) — for "you will receive"/deposited/fee displays
 * where a stable decimal width matters more than compactness.
 */
export function formatCurrencyAmount(value: number | string, symbol: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  const safe = isNaN(num) ? 0 : num
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(safe)
  return `${FIAT_PREFIX[symbol] ?? ''}${formatted}`
}

export function formatUSD(value: number, decimals = 2): string {
  if (!isFinite(value) || value < 0) return '$0.00'
  return '$' + formatNumber(value, decimals)
}

export function formatPercent(
  value: number | string,
  decimals: number = 2
): string {
  if (!value) return "0.00%"

  const num = typeof value === "string" ? Number(value) : value

  if (isNaN(num)) return "0.00%"

  return `${num.toFixed(decimals)}%`
}
