require('dotenv').config()
const { ethers } = require('ethers')

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY
  if (!pk) {
    console.error('DEPLOYER_PRIVATE_KEY não está definida no .env')
    process.exit(1)
  }

  const wallet = new ethers.Wallet(pk)
  console.log('Endereço derivado da chave:', wallet.address)

  const rpcUrl = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io'
  const provider = new ethers.JsonRpcProvider(rpcUrl)

  const balanceWei = await provider.getBalance(wallet.address)
  const balanceUsdc = ethers.formatUnits(balanceWei, 6)
  console.log('Saldo nativo (USDC):', balanceUsdc)

  const network = await provider.getNetwork()
  console.log('Chain ID conectado:', network.chainId.toString())
}

main().catch((err) => {
  console.error('Erro:', err.message)
  process.exit(1)
})
