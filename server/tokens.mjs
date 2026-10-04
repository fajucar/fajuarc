/**
 * Shared token metadata for server-side transfers.
 * USDC address/decimals must match src/config/tokens.ts (USDC_ADDRESS) and
 * src/config/chains.ts (decimals: 6 — Arc uses USDC as native gas token,
 * 6 decimals, same as ERC-20 USDC, not 18).
 */
export const USDC = {
  address:  '0x3600000000000000000000000000000000000000',
  decimals: 6,
}
