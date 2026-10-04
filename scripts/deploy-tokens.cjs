/**
 * Deploy FAJU e ARCX (MyCustomCoin) na Arc Mainnet.
 *
 * Uso:
 *   npx hardhat run scripts/deploy-tokens.cjs --network arcMainnet
 *
 * Depois: copiar os endereços impressos no final para FAJU/ARCX em
 * scripts/deploy-v2-dex.cjs (ou setar FAJU_MAINNET_ADDRESS / ARCX_MAINNET_ADDRESS
 * no .env, que é o que deploy-v2-dex.cjs já lê).
 */
const hre = require('hardhat')

const FAJU_MINT_AMOUNT = 1000000000000000000000000n // 1.000.000 FAJU (18 casas)
const ARCX_MINT_AMOUNT = 1010000000000000000000000n // 1.010.000 ARCX (18 casas)

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  console.log('Deployer:', deployer.address)
  console.log('Balance :', (await hre.ethers.provider.getBalance(deployer.address)).toString())

  const MyCustomCoin = await hre.ethers.getContractFactory('MyCustomCoin')

  console.log('\n--- Deploying FAJU ---')
  const faju = await MyCustomCoin.deploy('Faju Token', 'FAJU')
  await faju.waitForDeployment()
  const fajuAddress = await faju.getAddress()
  console.log('FAJU deployado em:', fajuAddress)

  console.log('Minting', FAJU_MINT_AMOUNT.toString(), 'FAJU para', deployer.address)
  const fajuMintTx = await faju.mint(deployer.address, FAJU_MINT_AMOUNT)
  await fajuMintTx.wait()

  console.log('\n--- Deploying ARCX ---')
  const arcx = await MyCustomCoin.deploy('ArcX Token', 'ARCX')
  await arcx.waitForDeployment()
  const arcxAddress = await arcx.getAddress()
  console.log('ARCX deployado em:', arcxAddress)

  console.log('Minting', ARCX_MINT_AMOUNT.toString(), 'ARCX para', deployer.address)
  const arcxMintTx = await arcx.mint(deployer.address, ARCX_MINT_AMOUNT)
  await arcxMintTx.wait()

  console.log('\n=== SUMMARY ===')
  console.log('FAJU deployado em:', fajuAddress)
  console.log('ARCX deployado em:', arcxAddress)
  console.log('\nAdicione ao .env:')
  console.log('FAJU_MAINNET_ADDRESS=' + fajuAddress)
  console.log('ARCX_MAINNET_ADDRESS=' + arcxAddress)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
