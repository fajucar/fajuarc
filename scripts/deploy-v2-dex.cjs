const hre = require('hardhat')

const NETWORKS = {
  arcTestnet: {
    weth9: '0x392016cA446b46df8122D41C9968bb927E5c93b6',
    tokens: {
      USDC: '0x3600000000000000000000000000000000000000',
      EURC: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
      FAJU: '0x0e8147CdB023474f440636051AA26f7DCaf2aEa7',
      ARCX: '0xA99F353665F89784f0442FB666ea775b6C1af87d',
      cirBTC: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF',
    },
  },
  // Endereços confirmados em docs.arc.io/arc/references/contract-addresses
  arcMainnet: {
    weth9: '0x128cC466B61f542da60c70e3aA11c10e19B84EDB',
    tokens: {
      USDC: '0x3600000000000000000000000000000000000000',
      EURC: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',
      FAJU: '0x3d77fAb8568f9c50C034311AA22088Cd045a30A0', // deployado agora
      ARCX: '0x7F6E8965e03D4DC7e93ABa24bcA569E142BdD8dF', // deployado agora
      cirBTC: '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0',
    },
  },
}

const PAIRS_TO_CREATE = [
  ['USDC', 'EURC'],
  ['USDC', 'FAJU'],
  ['USDC', 'ARCX'],
  ['USDC', 'cirBTC'],
  ['FAJU', 'ARCX'],
]

async function main() {
  const network = NETWORKS[hre.network.name]
  if (!network) {
    throw new Error(`Sem configuração de tokens para a rede "${hre.network.name}". Adicione em NETWORKS.`)
  }
  const WETH9 = network.weth9
  const TOKENS = network.tokens

  const [deployer] = await hre.ethers.getSigners()
  console.log('Deployer:', deployer.address)
  console.log('Balance :', (await hre.ethers.provider.getBalance(deployer.address)).toString())

  console.log('\n--- Deploying UniswapV2Factory ---')
  const Factory = await hre.ethers.getContractFactory('contracts/v2-core/UniswapV2Factory.sol:UniswapV2Factory')
  const factory = await Factory.deploy(deployer.address)
  await factory.waitForDeployment()
  const factoryAddress = await factory.getAddress()
  console.log('UniswapV2Factory deployed at:', factoryAddress)

  console.log('\n--- Deploying UniswapV2Router02 ---')
  const Router = await hre.ethers.getContractFactory('contracts/v2-periphery/UniswapV2Router02.sol:UniswapV2Router02')
  const router = await Router.deploy(factoryAddress, WETH9)
  await router.waitForDeployment()
  const routerAddress = await router.getAddress()
  console.log('UniswapV2Router02 deployed at:', routerAddress)

  console.log('\n--- Creating pairs ---')
  const pairAddresses = {}
  for (const [symA, symB] of PAIRS_TO_CREATE) {
    const tokenA = TOKENS[symA]
    const tokenB = TOKENS[symB]
    if (!tokenA || !tokenB) {
      console.log(`Skipping ${symA}/${symB}: address missing (${!tokenA ? symA : symB} not deployed yet)`)
      continue
    }
    const tx = await factory.createPair(tokenA, tokenB)
    const receipt = await tx.wait()
    const pairAddress = await factory.getPair(tokenA, tokenB)
    pairAddresses[`${symA}/${symB}`] = pairAddress
    console.log(`${symA}/${symB} pair created at:`, pairAddress, ' (tx:', receipt.hash, ')')
  }

  console.log('\n=== SUMMARY ===')
  console.log('Factory:', factoryAddress)
  console.log('Router :', routerAddress)
  console.log('WETH9  :', WETH9)
  for (const [label, addr] of Object.entries(pairAddresses)) {
    console.log(`Pair ${label}:`, addr)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
