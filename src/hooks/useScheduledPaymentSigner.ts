/**
 * useScheduledPaymentSigner — grants the FajuARC backend permission to send
 * scheduled payments FROM the user's own Privy embedded wallet.
 *
 * How it fits together:
 *   - The backend signs scheduled transfers headlessly with our Privy
 *     authorization key (PRIVY_AUTHORIZATION_KEY), but it can only do so once
 *     the user has added our key quorum as a session signer on their wallet.
 *   - That consent is a ONE-TIME action per wallet: addSessionSigners pops the
 *     Privy consent UI. After that, future schedules need no popup.
 *
 * The key quorum id is public (safe to ship to the client); it's the
 * PRIVY_KEY_QUORUM_ID configured on the backend. We read it from a Vite env
 * var so the two stay in sync via config rather than a hardcoded literal.
 */

import { useCallback, useState } from 'react'
import { useSessionSigners } from '@privy-io/react-auth'

// Public key quorum id — mirrors backend PRIVY_KEY_QUORUM_ID. Not a secret.
const KEY_QUORUM_ID = import.meta.env.VITE_PRIVY_KEY_QUORUM_ID as string | undefined

export function useScheduledPaymentSigner() {
  const { addSessionSigners } = useSessionSigners()
  const [granting, setGranting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  /**
   * Ask the user to authorize our backend as a session signer on their wallet.
   * Safe to call repeatedly — Privy no-ops if the signer is already present,
   * so callers don't need to track "already granted" state themselves.
   */
  const grantSigner = useCallback(async (walletAddress: string): Promise<boolean> => {
    if (!KEY_QUORUM_ID) {
      const e = new Error('VITE_PRIVY_KEY_QUORUM_ID is not configured')
      setError(e)
      throw e
    }
    if (!walletAddress) {
      const e = new Error('No wallet address to authorize')
      setError(e)
      throw e
    }

    setGranting(true)
    setError(null)
    try {
      await addSessionSigners({
        address: walletAddress,
        signers: [{ signerId: KEY_QUORUM_ID }],
      })
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // "Duplicate signer(s)" means our signer is ALREADY on this wallet —
      // consent was granted before. That's success, not failure: the backend
      // can already sign. Treat it as granted instead of surfacing an error.
      if (/duplicate signer/i.test(msg) || /already been added/i.test(msg)) {
        return true
      }
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    } finally {
      setGranting(false)
    }
  }, [addSessionSigners])

  return { grantSigner, granting, error, isConfigured: Boolean(KEY_QUORUM_ID) }
}
