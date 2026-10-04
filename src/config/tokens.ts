/**
 * Token Addresses - Arc Testnet
 *
 * Endereços oficiais:
 *
 * USDC (Arc): https://www.arc.network/blog/building-with-usdc-on-arc-one-token-two-interfaces
 *   - Na Arc, USDC é ao mesmo tempo o gas token nativo e um ERC-20.
 *   - O endereço 0x3600... é o contrato precompilado que expõe a interface ERC-20
 *     (balanceOf, transfer, approve) com 6 decimais.
 *
 * EURC (Circle): https://developers.circle.com/stablecoins/eurc-contract-addresses
 *   - Arc Testnet: use SEMPRE o endereço do token1 do par que tem liquidez (pair.token1() on-chain).
 *   - Par oficial USDC/EURC: 0x327f52e7cDfF1567F1708c2D045c7e2963e4889A → EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
 */

/** USDC na Arc Testnet - endereço oficial do precompile ERC-20 (documentação Arc) */
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as `0x${string}`

/** EURC na Arc Testnet - token1 do par oficial (pair 0x327f52...) */
export const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as `0x${string}`

/** EURC alternativo (outro deployment); usado para resolver par quando getPair com EURC_ADDRESS retorna zero */
export const EURC_ALTERNATIVE = '0x89858554a3bE2F577cD6383Cec089B5F319D72a' as `0x${string}`

/** QCAD na Arc Testnet - Canadian Dollar stablecoin (Stablecorp) */
export const QCAD_ADDRESS = '0x23d7CFFd0876f3ABb6B074287ba2aeefBc83825d' as `0x${string}`

/** USYC na Arc Testnet - Yield-bearing token (Circle/Hashnote) */
export const USYC_ADDRESS = '0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C' as `0x${string}`

/** Alias para compatibilidade: USDC = FIAT_TOKEN_PROXY_ADDRESS na Arc (é o precompile) */
export const FIAT_TOKEN_PROXY_ADDRESS = USDC_ADDRESS

/** cirBTC na Arc Testnet - Circle BTC testnet token (faucet: faucet.circle.com) */
export const CIRBTC_ADDRESS = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF' as `0x${string}`

/** Endereço zero (inválido para tokens) */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

/**
 * Verifica se o endereço é zero (inválido).
 * Nota: 0x3600... na Arc é USDC válido (precompile), não é tratado como inválido.
 */
export function isPlaceholderToken(address: `0x${string}`): boolean {
  return address.toLowerCase() === ZERO_ADDRESS.toLowerCase()
}
