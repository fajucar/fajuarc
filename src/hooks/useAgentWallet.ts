/**
 * useAgentWallet — fonte única de verdade para a embedded wallet do Privy.
 *
 * REGRA: uma conta Privy = uma embedded wallet (walletClientType === 'privy').
 * Identificar sempre pelo tipo, NUNCA por wallets[0] (a ordem não é garantida).
 *
 * Fluxo correto de autenticação:
 *   1. Usuário faz login com QUALQUER rede social → Privy cria a embedded wallet.
 *   2. Outras redes são VINCULADAS via linkGoogle/linkDiscord/linkTwitter
 *      (botões "Vincular" na UI do agente) — nunca como logins separados.
 *   3. createOnLogin: 'users-without-wallets' garante que redes adicionais
 *      não criam wallets duplicadas.
 *
 * Se cada rede social criou um user.id distinto (ver log do Bootstrapper),
 * são contas Privy separadas — não há fusão retroativa. Estratégia testnet:
 * manter a conta que tem os saldos e relinkar as demais redes nela.
 *
 * Este hook é o ponto de entrada para TODA a app:
 *   FajuPay · Swap · Pools · Mint · Agent · Faucet · Balances
 */

import { useWallets } from '@privy-io/react-auth'
import { usePrivy } from '@privy-io/react-auth'

export interface AgentWalletState {
  /** Endereço da embedded wallet Privy (undefined enquanto não disponível) */
  address: `0x${string}` | undefined
  /** Objeto wallet completo — necessário para getEthereumProvider(), switchChain() */
  wallet: ReturnType<typeof useWallets>['wallets'][number] | undefined
  /** true quando a embedded wallet já foi criada e está disponível */
  isReady: boolean
  /** true quando o Privy terminou de inicializar */
  ready: boolean
  /** true quando o usuário está autenticado */
  authenticated: boolean
}

/**
 * Retorna SEMPRE a embedded wallet do Privy.
 * Use este hook em vez de `useWallets()[0]` em qualquer componente.
 */
export function useAgentWallet(): AgentWalletState {
  const { wallets } = useWallets()
  const { authenticated, ready } = usePrivy()

  const wallet = wallets.find(
    (w) =>
      w.walletClientType === 'privy' ||
      w.walletClientType === 'privy-v2' ||
      w.connectorType === 'embedded'
  )

  return {
    address: wallet?.address as `0x${string}` | undefined,
    wallet,
    isReady: !!wallet?.address,
    ready,
    authenticated,
  }
}
