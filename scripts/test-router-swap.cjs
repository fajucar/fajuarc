const hre = require('hardhat')

const ROUTER_ADDRESS = '0x277628683690c31932C2de5119a736cdfC90ac8A'
const USDC = '0x3600000000000000000000000000000000000000'
const FAJU = '0x3d77fAb8568f9c50C034311AA22088Cd045a30A0'
const SWAP_AMOUNT_IN = 100000n // 0.1 USDC (6 decimals)

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
]

const ROUTER_ABI = [
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
]

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  console.log('Signer:', deployer.address)

  const usdc = new hre.ethers.Contract(USDC, ERC20_ABI, deployer)
  const faju = new hre.ethers.Contract(FAJU, ERC20_ABI, deployer)
  const router = new hre.ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, deployer)

  const fajuBefore = await faju.balanceOf(deployer.address)
  console.log('FAJU balance before:', fajuBefore.toString())

  console.log('\n--- Approving 0.1 USDC to router ---')
  try {
    const approveTx = await usdc.approve(ROUTER_ADDRESS, SWAP_AMOUNT_IN)
    console.log('Approve tx hash:', approveTx.hash)
    const approveReceipt = await approveTx.wait()
    console.log('Approve status:', approveReceipt.status === 1 ? 'SUCCESS' : 'REVERTED')
  } catch (err) {
    console.log('Approve FAILED')
    console.log('Full error:', err)
    process.exitCode = 1
    return
  }

  const allowance = await usdc.allowance(deployer.address, ROUTER_ADDRESS)
  console.log('Allowance after approve:', allowance.toString())

  console.log('\n--- Swapping 0.1 USDC -> FAJU ---')
  const deadline = Math.floor(Date.now() / 1000) + 1200 // 20 min

  try {
    const swapTx = await router.swapExactTokensForTokens(
      SWAP_AMOUNT_IN,
      0n, // amountOutMin = 0, TEST ONLY, never in production
      [USDC, FAJU],
      deployer.address,
      deadline,
    )
    console.log('Swap tx hash:', swapTx.hash)
    const swapReceipt = await swapTx.wait()
    console.log('Swap status:', swapReceipt.status === 1 ? 'SUCCESS' : 'REVERTED')

    const fajuAfter = await faju.balanceOf(deployer.address)
    console.log('\nFAJU balance before:', fajuBefore.toString())
    console.log('FAJU balance after: ', fajuAfter.toString())
    console.log('FAJU received:      ', (fajuAfter - fajuBefore).toString())
  } catch (err) {
    console.log('Swap FAILED / REVERTED')
    console.log('Full error object:')
    console.log(err)
    if (err.reason) console.log('\nRevert reason:', err.reason)
    if (err.data) console.log('Error data:', err.data)
    if (err.shortMessage) console.log('Short message:', err.shortMessage)

    const fajuAfter = await faju.balanceOf(deployer.address)
    console.log('\nFAJU balance before:', fajuBefore.toString())
    console.log('FAJU balance after: ', fajuAfter.toString())
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exitCode = 1
})
