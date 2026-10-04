const hre = require('hardhat')

const ROUTER_ADDRESS = '0x277628683690c31932C2de5119a736cdfC90ac8A'
const PAIR_ADDRESS = '0x80e9417c82FF016d395013D53b9B389E5796bA13'
const USDC = '0x3600000000000000000000000000000000000000'
const FAJU = '0x3d77fAb8568f9c50C034311AA22088Cd045a30A0'

const USDC_AMOUNT = 1000000n // 1 USDC (6 decimals)
const FAJU_AMOUNT = 1000n * 10n ** 18n // 1000 FAJU (18 decimals)

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
]

const ROUTER_ABI = [
  'function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)',
]

const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  console.log('Signer:', deployer.address)

  const usdc = new hre.ethers.Contract(USDC, ERC20_ABI, deployer)
  const faju = new hre.ethers.Contract(FAJU, ERC20_ABI, deployer)
  const router = new hre.ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, deployer)
  const pair = new hre.ethers.Contract(PAIR_ADDRESS, PAIR_ABI, deployer)

  console.log('\n--- Approving 1 USDC to router ---')
  const approveUsdcTx = await usdc.approve(ROUTER_ADDRESS, USDC_AMOUNT)
  console.log('Approve USDC tx hash:', approveUsdcTx.hash)
  const approveUsdcReceipt = await approveUsdcTx.wait()
  console.log('Approve USDC status:', approveUsdcReceipt.status === 1 ? 'SUCCESS' : 'REVERTED')

  console.log('\n--- Approving 1000 FAJU to router ---')
  const approveFajuTx = await faju.approve(ROUTER_ADDRESS, FAJU_AMOUNT)
  console.log('Approve FAJU tx hash:', approveFajuTx.hash)
  const approveFajuReceipt = await approveFajuTx.wait()
  console.log('Approve FAJU status:', approveFajuReceipt.status === 1 ? 'SUCCESS' : 'REVERTED')

  const usdcMin = (USDC_AMOUNT * 90n) / 100n
  const fajuMin = (FAJU_AMOUNT * 90n) / 100n
  const deadline = Math.floor(Date.now() / 1000) + 1200 // 20 min

  console.log('\n--- Adding liquidity USDC/FAJU ---')
  try {
    const addLiqTx = await router.addLiquidity(
      USDC,
      FAJU,
      USDC_AMOUNT,
      FAJU_AMOUNT,
      usdcMin,
      fajuMin,
      deployer.address,
      deadline,
    )
    console.log('addLiquidity tx hash:', addLiqTx.hash)
    const addLiqReceipt = await addLiqTx.wait()
    console.log('addLiquidity status:', addLiqReceipt.status === 1 ? 'SUCCESS' : 'REVERTED')

    const [reserve0, reserve1] = await pair.getReserves()
    const token0 = await pair.token0()
    const token1 = await pair.token1()
    console.log('\n--- Reserves after ---')
    console.log('token0:', token0, 'reserve0:', reserve0.toString())
    console.log('token1:', token1, 'reserve1:', reserve1.toString())
  } catch (err) {
    console.log('addLiquidity FAILED / REVERTED')
    console.log('Full error object:')
    console.log(err)
    if (err.reason) console.log('\nRevert reason:', err.reason)
    if (err.data) console.log('Error data:', err.data)
    if (err.shortMessage) console.log('Short message:', err.shortMessage)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exitCode = 1
})
