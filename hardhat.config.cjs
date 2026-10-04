require('@nomicfoundation/hardhat-ethers')
require('dotenv').config()

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY
const ARC_RPC_URL = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.network'
const ARC_MAINNET_RPC_URL = process.env.ARC_MAINNET_RPC_URL ?? 'https://rpc.mainnet.arc.io'

module.exports = {
  solidity: {
    compilers: [
      { version: '0.5.16', settings: { optimizer: { enabled: true, runs: 999999 } } },
      { version: '0.6.6', settings: { optimizer: { enabled: true, runs: 999999 } } },
      { version: '0.8.20', settings: { optimizer: { enabled: false } } },
    ],
    // Vários arquivos do v2-core/v2-periphery usam pragma permissivo
    // (`>=0.5.0`/`>=0.6.0`), e o hardhat escolhe o compilador mais novo
    // compatível. Sem os overrides abaixo, esses arquivos passariam a
    // compilar com 0.8.20 em vez de 0.5.16/0.6.6 e quebrariam (sintaxe
    // removida desde 0.8, ex. address(uint(...)) em UniswapV2Library.sol).
    overrides: {
      'contracts/v2-core/interfaces/IUniswapV2Pair.sol': { version: '0.5.16', settings: { optimizer: { enabled: true, runs: 999999 } } },
      'contracts/v2-core/interfaces/IUniswapV2Factory.sol': { version: '0.5.16', settings: { optimizer: { enabled: true, runs: 999999 } } },
      'contracts/v2-core/interfaces/IUniswapV2Callee.sol': { version: '0.5.16', settings: { optimizer: { enabled: true, runs: 999999 } } },
      'contracts/v2-core/interfaces/IUniswapV2ERC20.sol': { version: '0.5.16', settings: { optimizer: { enabled: true, runs: 999999 } } },
      'contracts/v2-core/interfaces/IERC20.sol': { version: '0.5.16', settings: { optimizer: { enabled: true, runs: 999999 } } },
      'contracts/v2-periphery/libraries/UniswapV2Library.sol': { version: '0.6.6', settings: { optimizer: { enabled: true, runs: 999999 } } },
      'contracts/v2-periphery/libraries/TransferHelper.sol': { version: '0.6.6', settings: { optimizer: { enabled: true, runs: 999999 } } },
      'contracts/v2-periphery/libraries/SafeMath.sol': { version: '0.6.6', settings: { optimizer: { enabled: true, runs: 999999 } } },
      'contracts/v2-periphery/interfaces/IWETH.sol': { version: '0.6.6', settings: { optimizer: { enabled: true, runs: 999999 } } },
      'contracts/v2-periphery/interfaces/IERC20.sol': { version: '0.6.6', settings: { optimizer: { enabled: true, runs: 999999 } } },
    },
  },
  networks: {
    arcTestnet: {
      url: ARC_RPC_URL,
      chainId: 5042002,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    // RPC e chainId confirmados em docs.arc.io/arc/references/connect-to-arc
    arcMainnet: {
      url: ARC_MAINNET_RPC_URL,
      chainId: 5042,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
}
