/**
 * Deploy FajuFarm via Hardhat
 * Usage: npx hardhat run scripts/deploy-fajufarm-hardhat.cjs --network arcTestnet --config hardhat.config.cjs
 */
require('dotenv').config();
const hre = require('hardhat');

const FAJU_BY_NETWORK = {
  arcTestnet: '0x0e8147CdB023474f440636051AA26f7DCaf2aEa7',
  // FAJU ainda não existe na mainnet — deployar antes com deploy-tokens.cjs
  // e setar FAJU_MAINNET_ADDRESS no .env.
  arcMainnet: process.env.FAJU_MAINNET_ADDRESS ?? '',
};
const REWARD_PER_SECOND = hre.ethers.parseEther('1');
const START_TIME = Math.floor(Date.now() / 1000);
const END_TIME = START_TIME + 30 * 86400;

async function main() {
  const FAJU = FAJU_BY_NETWORK[hre.network.name];
  if (!FAJU) {
    console.error(`❌ Sem endereço FAJU configurado para a rede "${hre.network.name}".`);
    process.exit(1);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying with:', deployer.address);

  const FajuFarm = await hre.ethers.getContractFactory('FajuFarm');
  const farm = await FajuFarm.deploy(FAJU, REWARD_PER_SECOND, START_TIME, END_TIME);
  await farm.waitForDeployment();
  const address = await farm.getAddress();

  console.log('FajuFarm deployed:', address);
  console.log('VITE_FAJU_FARM_ADDRESS=' + address);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
