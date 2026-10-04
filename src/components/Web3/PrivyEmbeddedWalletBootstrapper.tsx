import { useEffect, useRef } from 'react'
import { usePrivy, useWallets, useCreateWallet } from '@privy-io/react-auth'

/**
 * Automatically creates an embedded EVM wallet after social login
 * if the user doesn't have one yet.
 * Renders nothing — lives at the app root so it's always mounted.
 */
export function PrivyEmbeddedWalletBootstrapper() {
  const { authenticated, ready, user } = usePrivy()
  const { wallets } = useWallets()
  const { createWallet } = useCreateWallet()
  const creatingRef = useRef(false)
  // Só exibe o diagnóstico completo uma vez por sessão
  const diagDoneRef = useRef(false)

  useEffect(() => {
    if (!ready || !authenticated) return

    // ── TAREFA 1 — Diagnóstico de identidade Privy ──────────────────────────
    // Este log responde: "É UMA conta com várias wallets, ou VÁRIAS contas
    // Privy (uma por rede social)?"
    //
    // COMO INTERPRETAR:
    //   • user.id IGUAL em todos os logins sociais → mesma conta Privy ✅
    //     As redes podem ser linkadas com linkGoogle/linkDiscord/etc.
    //   • user.id DIFERENTE por rede social → CONTAS PRIVY SEPARADAS ❌
    //     O Privy NÃO funde contas retroativamente. Estratégia:
    //     manter a conta que tem os fundos e vincular as outras redes
    //     a ELA via linkGoogle/linkDiscord/etc.
    //     As contas separadas ficam abandonadas.
    //
    // CARTEIRA CORRETA (embedded, usada em toda a app):
    //   walletClientType === 'privy'  →  embeddedWallet.address
    //   NUNCA usar wallets[0] — a ordem não é garantida.
    // Só em dev: o log inclui user.id, e-mails e contas vinculadas.
    if (import.meta.env.DEV && !diagDoneRef.current) {
      diagDoneRef.current = true
      console.group('🔍 [FajuARC] Diagnóstico Privy — TAREFA 1')
      console.log('user.id :', user?.id ?? '(não disponível)')
      console.log('Wallets :', wallets.map((w) => ({
        address:          w.address,
        walletClientType: w.walletClientType,
        connectorType:    w.connectorType,
      })))
      const embedded = wallets.find(
        (w) => w.walletClientType === 'privy' ||
               w.walletClientType === 'privy-v2' ||
               w.connectorType   === 'embedded'
      )
      console.log('Embedded wallet (operacional) :', embedded?.address ?? '⚠️ NENHUMA')
      console.log('linkedAccounts :', (user?.linkedAccounts ?? []).map((a: any) => ({
        type:     a.type,
        address:  a.address,
        email:    a.email,
        username: a.username,
      })))
      console.groupEnd()
    }

    // Basic dev logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[PrivyBootstrapper] ready:', ready, 'authenticated:', authenticated)
      console.log('[PrivyBootstrapper] current origin:', window.location.origin)
      console.log('[PrivyBootstrapper] wallets count:', wallets.length)
    }

    // Already has an embedded wallet
    const hasEmbedded = wallets.some(
      (w) =>
        w.walletClientType === 'privy' ||
        w.walletClientType === 'privy-v2' ||
        w.connectorType === 'embedded'
    )
    if (hasEmbedded) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[PrivyBootstrapper] embedded wallet already exists')
      }
      return
    }

    // Prevent concurrent calls
    if (creatingRef.current) return
    creatingRef.current = true

    if (process.env.NODE_ENV === 'development') {
      console.log('[PrivyBootstrapper] creating embedded wallet...')
    }

    createWallet()
      .then(() => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[PrivyBootstrapper] ✅ embedded wallet created successfully')
        }
      })
      .catch((err) => {
        if (!String(err).toLowerCase().includes('already')) {
          console.error('[PrivyBootstrapper] ❌ createWallet error:', err)

          // Check for authorization errors specifically
          const errorStr = String(err)
          if (errorStr.includes('source has not been authorized') ||
              errorStr.includes('not been authorized yet')) {
            console.error('🚨 [PrivyBootstrapper] AUTHORIZATION ERROR DETECTED!')
            console.error('🔧 Fix: Add', window.location.origin, 'to Privy dashboard')
            console.error('📋 Steps:')
            console.error('1. Go to https://dashboard.privy.io')
            console.error('2. Select FajuARC app (cmp0dlx5n026d0djsdyf4b3p3)')
            console.error('3. Settings → Clients → Add origin:', window.location.origin)
          }
        }
      })
      .finally(() => {
        creatingRef.current = false
      })
  // wallets.length drives re-runs (new wallet created); createWallet excluded intentionally
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, wallets.length, user?.id])

  return null
}
