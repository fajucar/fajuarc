/**
 * Arc explorer (Blockscout) API client — shared by the explorer proxy routes
 * (server/index.mjs) and the agent's getTransactionHistory tool (server/agent.mjs).
 *
 * Defaults to Arc Mainnet's explorer (explorer.arc.io). Set ARCSCAN_API in
 * .env to point at testnet (https://testnet.arcscan.app/api/v2) for local dev.
 *
 * explorer.arc.io's /api/v2/* routes sit behind Cloudflare and 403 any request
 * whose Referer/Origin don't match the explorer's own origin (confirmed by
 * testing directly — same-origin headers are sufficient, no browser UA or JS
 * challenge needed). testnet.arcscan.app doesn't enforce this, but sending the
 * headers there too is harmless, so they're always included.
 */

export const ARCSCAN_API = process.env.ARCSCAN_API ?? 'https://explorer.arc.io/api/v2'

const ARCSCAN_ORIGIN = new URL(ARCSCAN_API).origin

async function getJson(url) {
  const r = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Referer: `${ARCSCAN_ORIGIN}/`,
      Origin: ARCSCAN_ORIGIN,
    },
  })
  return r.json()
}

export function fetchAddressTransactions(address) {
  return getJson(`${ARCSCAN_API}/addresses/${address}/transactions`)
}

export function fetchTokenTransfers(address) {
  return getJson(`${ARCSCAN_API}/addresses/${address}/token-transfers`)
}

export function fetchAddressInfo(address) {
  return getJson(`${ARCSCAN_API}/addresses/${address}`)
}

// Dedicated counters endpoint — returns the REAL total transaction count for
// the address, unlike /transactions which is paginated at 50 items/page.
export function fetchAddressCounters(address) {
  return getJson(`${ARCSCAN_API}/addresses/${address}/counters`)
}
