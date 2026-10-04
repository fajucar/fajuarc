/**
 * One-off helper: prints the automation wallet's address and on-chain
 * USDC balance. Reuses the exact same on-chain helpers the scheduler
 * uses (server/onchain.mjs) so the number matches what the scheduler sees.
 */
import { getAutomationSignerAddress } from '../signer-viem.mjs'
import { getUsdcBalance, getUsdcDecimals } from '../onchain.mjs'
import { formatUnits } from 'viem'

const address = getAutomationSignerAddress()
const decimals = await getUsdcDecimals()
const raw = await getUsdcBalance(address)

console.log('Automation wallet:', address)
console.log('USDC balance:', formatUnits(raw, decimals), `USDC (raw: ${raw}, decimals: ${decimals})`)
