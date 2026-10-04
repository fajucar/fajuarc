import type { PrivyClientConfig } from '@privy-io/react-auth'
import { arcMainnet, arcTestnet } from '@/config/chains'

export const PRIVY_APP_ID = 'cmp0dlx5n026d0djsdyf4b3p3'

export { arcTestnet, arcMainnet }

/**
 * FajuARC — Estratégia de autenticação (TAREFA 3):
 *
 * UMA conta Privy = UMA embedded wallet, compartilhada por TODAS as redes.
 *
 * Fluxo correto:
 *   1. Usuário faz login com UMA rede social → Privy cria a embedded wallet.
 *   2. Outras redes são VINCULADAS via linkGoogle/linkDiscord/linkTwitter
 *      (usePrivy) — nunca como logins separados.
 *   3. createOnLogin: 'users-without-wallets' garante que um segundo login
 *      na mesma conta não cria uma nova wallet.
 *
 * Se cada rede criou uma conta Privy separada (user.id diferente — ver log
 * do PrivyEmbeddedWalletBootstrapper), o Privy NÃO funde retroativamente.
 * Estratégia testnet: manter a conta que tem os saldos e relinkar as redes.
 */
export const privyConfig: PrivyClientConfig = {
  loginMethods: ['google', 'twitter', 'discord', 'telegram', 'wallet'],

  defaultChain: arcMainnet,
  supportedChains: [arcMainnet, arcTestnet],

  embeddedWallets: {
    ethereum: {
      // 'all-users' garante que TODO usuário tenha uma embedded wallet — pré-
      // requisito para adicionar um session signer (agendamentos assinados
      // pelo backend). Antes era 'users-without-wallets'; a mudança é segura:
      // quem já tem wallet não ganha outra (Privy não duplica), e quem não
      // tinha passa a ter uma na hora do login.
      createOnLogin: 'all-users',
    },
  },

  walletConnectCloudProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,

  appearance: {
    theme: 'dark' as const,
    accentColor: '#00d4ff',
    logo: undefined,
    landingHeader: 'FajuARC',
    loginMessage: 'Entre para continuar',
    // Exibe social logins antes das wallets caso o modal padrão do Privy seja aberto.
    // O modal customizado (WalletModal + SocialLoginSection) é o caminho principal —
    // o Privy não oferece prop para forçar componente externo no lugar do modal padrão.
    showWalletLoginFirst: false,
    walletList: [
      'metamask',        // desktop + mobile deep link
      'rainbow',         // desktop + mobile
      'okx_wallet',      // desktop + mobile (tem in-app browser)
      'wallet_connect',  // fallback: 100+ carteiras via WalletConnect
    ],
  },
}
