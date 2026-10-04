/**
 * Shared Arc Testnet token list.
 * V2 and V3 swap selectors must import this same list.
 */
export const ARC_TESTNET_TOKENS = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x3600000000000000000000000000000000000000' as `0x${string}`,
    decimals: 6,
    flag: '🇺🇸',
    logo: '🇺🇸',
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as `0x${string}`,
    decimals: 6,
    flag: '🇪🇺',
    logo: '🇪🇺',
  },
  {
    symbol: 'QCAD',
    name: 'Canadian Dollar',
    address: '0x23d7CFFd0876f3ABb6B074287ba2aeefBc83825d' as `0x${string}`,
    decimals: 6,
    flag: '🇨🇦',
    logo: '🇨🇦',
  },
  {
    symbol: 'USYC',
    name: 'US Yield Coin',
    address: '0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C' as `0x${string}`,
    decimals: 6,
    flag: '📈',
    logo: '📈',
  },
  {
    symbol: 'FAJU',
    name: 'Faju Token',
    address: '0x0e8147CdB023474f440636051AA26f7DCaf2aEa7' as `0x${string}`,
    decimals: 18,
    flag: '⚡',
    logo: '⚡',
  },
  {
    symbol: 'ARCX',
    name: 'ArcX Token',
    address: '0xA99F353665F89784f0442FB666ea775b6C1af87d' as `0x${string}`,
    decimals: 18,
    flag: '🔵',
    logo: '🔵',
  },
  {
    symbol: 'cirBTC',
    name: 'Circle BTC',
    address: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF' as `0x${string}`,
    decimals: 8,
    flag: '🟠',
    logo: '🟠',
  },
  {
    symbol: 'LINK',
    name: 'ChainLink Token',
    address: '0x3F1f176e347235858DD6Db905DDBA09Eaf25478a' as `0x${string}`,
    decimals: 18,
    flag: '🔗',
    logo: '🔗',
  },
] as const

export type ArcTestnetToken = (typeof ARC_TESTNET_TOKENS)[number]

/**
 * Shared Arc Mainnet token list. Only tokens actually deployed on mainnet
 * (chainId 5042) — QCAD/USYC/LINK are testnet-only and intentionally omitted.
 */
export const ARC_MAINNET_TOKENS = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x3600000000000000000000000000000000000000' as `0x${string}`,
    decimals: 6,
    flag: '🇺🇸',
    logo: '🇺🇸',
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    address: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1' as `0x${string}`,
    decimals: 6,
    flag: '🇪🇺',
    logo: '🇪🇺',
  },
  {
    symbol: 'FAJU',
    name: 'Faju Token',
    address: '0x3d77fAb8568f9c50C034311AA22088Cd045a30A0' as `0x${string}`,
    decimals: 18,
    flag: '⚡',
    logo: '⚡',
  },
  {
    symbol: 'ARCX',
    name: 'ArcX Token',
    address: '0x7F6E8965e03D4DC7e93ABa24bcA569E142BdD8dF' as `0x${string}`,
    decimals: 18,
    flag: '🔵',
    logo: '🔵',
  },
  {
    symbol: 'cirBTC',
    name: 'Circle BTC',
    address: '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0' as `0x${string}`,
    decimals: 8, // confirmed via decimals() call on-chain, mainnet
    flag: '🟠',
    logo: '🟠',
  },
] as const

export type ArcMainnetToken = (typeof ARC_MAINNET_TOKENS)[number]
