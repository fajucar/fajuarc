/**
 * OAuthCallbackHandler — finaliza automaticamente o fluxo OAuth após redirect.
 *
 * PROBLEMA RAIZ do double-click:
 * O `useLoginWithOAuth` PRECISA estar montado na página que recebe o redirect
 * do OAuth (ex: ?privy_oauth_state=... na URL). Como estava só dentro do
 * WalletModal (fechado no retorno), o Privy não completava o fluxo sozinho —
 * exigindo que o usuário abrisse o modal novamente (o "segundo clique").
 *
 * SOLUÇÃO: montar este componente na raiz do app (em main.tsx), SEMPRE presente.
 * O hook auto-detecta privy_oauth_state na URL e chama onComplete sem nenhuma
 * ação adicional do usuário → login completa no primeiro clique.
 */

import { useEffect, useRef } from 'react'
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth'

export function OAuthCallbackHandler() {
  const { ready, authenticated } = usePrivy()
  const loggedRef = useRef(false)

  // Este hook detecta privy_oauth_state/privy_oauth_code na URL e finaliza
  // o fluxo OAuth automaticamente ao montar. onComplete dispara sem clique.
  useLoginWithOAuth({
    onComplete: () => {
      console.log('[OAuthCallback] ✅ Fluxo OAuth completo — autenticado')
      // Limpa os params da URL sem recarregar a página
      const url = new URL(window.location.href)
      url.searchParams.delete('privy_oauth_state')
      url.searchParams.delete('privy_oauth_code')
      window.history.replaceState({}, '', url.toString())
    },
    onError: (err: unknown) => {
      console.error('[OAuthCallback] ❌ Erro no retorno OAuth:', err)
    },
  })

  // Log diagnóstico: confirma se o retorno foi detectado e qual é o estado
  useEffect(() => {
    if (loggedRef.current) return
    const url = new URL(window.location.href)
    const hasOAuth =
      url.searchParams.has('privy_oauth_state') ||
      url.searchParams.has('privy_oauth_code')

    if (hasOAuth) {
      loggedRef.current = true
      console.group('[OAuthCallback] 🔄 Retorno OAuth detectado na URL')
      console.log('privy_oauth_state:', url.searchParams.get('privy_oauth_state')?.slice(0, 20) + '…')
      console.log('Privy ready:', ready, '| authenticated:', authenticated)
      console.log('→ hook montado na raiz: fluxo será completado automaticamente')
      console.groupEnd()
    }
  }, [ready, authenticated])

  return null
}
