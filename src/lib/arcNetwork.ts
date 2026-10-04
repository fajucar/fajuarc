/**
 * Arc Mainnet guard for transactions signed by a wallet connected through wagmi
 * (MetaMask, Rabby, WalletConnect…). Such a wallet can sit on any network, and
 * wagmi sends a write to whatever chain the wallet is on — so without this check
 * an approve could land on, say, Ink Sepolia instead of Arc.
 *
 * Call ensureWalletOnArc() right before every signature. As a second line of
 * defence, also pass `chainId: ARC_CHAIN_ID` to the wagmi write: viem then asserts
 * the wallet's live chain and refuses to sign anywhere else.
 */

import type { Config } from 'wagmi'
import { getConnection, switchChain } from 'wagmi/actions'
import { arcMainnet } from '@/config/chains'
import i18n from '@/i18n/config'

export const ARC_CHAIN_ID = arcMainnet.id

/** The wallet isn't on Arc Mainnet and couldn't be switched (refused or unsupported). */
export class WrongNetworkError extends Error {
  readonly cause?: unknown

  constructor(cause?: unknown) {
    super(i18n.t('network.switchRequired'))
    this.name = 'WrongNetworkError'
    this.cause = cause
  }
}

/**
 * Makes sure the connected wallet is on Arc Mainnet, asking it to switch if not,
 * and re-reads the chain afterwards. Throws WrongNetworkError when the user
 * declines or the wallet can't switch — callers must stop the action then.
 */
export async function ensureWalletOnArc(config: Config): Promise<void> {
  const { status, chainId } = getConnection(config)
  if (status !== 'connected' || chainId === ARC_CHAIN_ID) return
  try {
    await switchChain(config, { chainId: ARC_CHAIN_ID })
  } catch (err) {
    throw new WrongNetworkError(err)
  }
  if (getConnection(config).chainId !== ARC_CHAIN_ID) throw new WrongNetworkError()
}
