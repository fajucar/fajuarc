/**
 * Cria (e inicializa) os 5 pools V3 que faltam na Arc Testnet.
 * Chama NonfungiblePositionManager.createAndInitializePoolIfNecessary
 * para cada par com sqrtPriceX96 = 1:1 preço humano ajustado por decimais.
 *
 * Uso:
 *   npx hardhat run scripts/create-v3-pools.cjs --network arcTestnet
 */
const hre = require('hardhat')

// ─── Endereços implantados ────────────────────────────────────────────────────
const NPM_ADDRESS     = '0xC61608f54EEFf2b229e3a4858236e47f2701a80f' // NonfungiblePositionManager
const FACTORY_ADDRESS = '0xBA83F76eada22488aD91Ded08AdC3082303D0354' // V3Factory

// ─── Tokens (canonical lowercase para comparação) ────────────────────────────
const USDC   = '0x3600000000000000000000000000000000000000'
const EURC   = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const FAJU   = '0x0e8147CdB023474f440636051AA26f7DCaf2aEa7'
const ARCX   = '0xA99F353665F89784f0442FB666ea775b6C1af87d'
const CIRBTC = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF'

// ─── ABIs mínimas ─────────────────────────────────────────────────────────────
const NPM_ABI = [
  'function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) external payable returns (address pool)',
]

const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
]

// ─── Pares a criar ─────────────────────────────────────────────────────────────
// token0 DEVE ser < token1 (endereço). sqrtPriceX96 = sqrt(10^(dec1-dec0)) × 2^96 para 1:1.
// Calculado com BigInt exato; sanity check confirmado (preço humano = 1.0).
const PAIRS = [
  {
    name: 'FAJU/ARCX',
    token0: FAJU,   // 0x0e... (18 dec)
    token1: ARCX,   // 0xa9... (18 dec)
    sqrtPriceX96: 79228162514264337593543950336n,           // 2^96   (diff=0)
  },
  {
    name: 'USDC/ARCX',
    token0: USDC,   // 0x36... (6 dec)
    token1: ARCX,   // 0xa9... (18 dec)
    sqrtPriceX96: 79228162514264337593543950336000000n,     // 2^96 × 10^6  (diff=+12)
  },
  {
    name: 'USDC/cirBTC',
    token0: USDC,   // 0x36... (6 dec)
    token1: CIRBTC, // 0xf0... (8 dec)
    sqrtPriceX96: 792281625142643375935439503360n,           // 2^96 × 10    (diff=+2)
  },
  {
    name: 'EURC/cirBTC',
    token0: EURC,   // 0x89... (6 dec)
    token1: CIRBTC, // 0xf0... (8 dec)
    sqrtPriceX96: 792281625142643375935439503360n,           // 2^96 × 10    (diff=+2)
  },
  {
    name: 'FAJU/cirBTC',
    token0: FAJU,   // 0x0e... (18 dec)
    token1: CIRBTC, // 0xf0... (8 dec)
    sqrtPriceX96: 792281625142643375935439n,                 // floor(2^96/10^5) (diff=-10)
  },
]

// ─── Verificação de ordem canônica em runtime ─────────────────────────────────
function assertCanonicalOrder(pair) {
  if (pair.token0.toLowerCase() >= pair.token1.toLowerCase()) {
    throw new Error(`${pair.name}: token0 NÃO é menor que token1 — verifique os endereços`)
  }
}

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  if (!deployer) {
    console.error('ERRO: Nenhuma conta configurada. Verifique DEPLOYER_PRIVATE_KEY no .env')
    process.exit(1)
  }
  console.log('Deployer:', deployer.address)

  const balance = await hre.ethers.provider.getBalance(deployer.address)
  console.log('Saldo:', hre.ethers.formatEther(balance), 'ARC')
  console.log('NonfungiblePositionManager:', NPM_ADDRESS)
  console.log('V3Factory:', FACTORY_ADDRESS)
  console.log('─'.repeat(60))

  const npm     = new hre.ethers.Contract(NPM_ADDRESS,     NPM_ABI,     deployer)
  const factory = new hre.ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, deployer)

  const results = {}

  for (const pair of PAIRS) {
    console.log(`\n[${pair.name}]`)

    // Verificação de segurança
    assertCanonicalOrder(pair)

    // Checar se pool já existe
    const existingPool = await factory.getPool(pair.token0, pair.token1, 500)
    if (existingPool !== '0x0000000000000000000000000000000000000000') {
      console.log(`  ⚠  Pool já existe: ${existingPool} — pulando`)
      results[pair.name] = existingPool
      continue
    }

    console.log(`  token0: ${pair.token0}`)
    console.log(`  token1: ${pair.token1}`)
    console.log(`  sqrtPriceX96: ${pair.sqrtPriceX96.toString()}`)
    console.log(`  Enviando transação...`)

    let tx, receipt
    try {
      tx = await npm.createAndInitializePoolIfNecessary(
        pair.token0,
        pair.token1,
        500,
        pair.sqrtPriceX96,
      )
      console.log(`  TX hash: ${tx.hash}`)
      receipt = await tx.wait()
    } catch (err) {
      console.error(`\n❌ FALHOU em ${pair.name}`)
      console.error('  Erro:', err.message ?? err)
      if (err.data) console.error('  Revert data:', err.data)
      console.error('\nParando — não continuaremos para os próximos pares.')
      process.exit(1)
    }

    // Buscar endereço do pool criado
    const poolAddr = await factory.getPool(pair.token0, pair.token1, 500)
    if (poolAddr === '0x0000000000000000000000000000000000000000') {
      console.error(`  ❌ Pool NÃO encontrado após tx para ${pair.name}`)
      process.exit(1)
    }

    console.log(`  ✓ Sucesso (block ${receipt.blockNumber})`)
    console.log(`  Pool criado: ${poolAddr}`)
    results[pair.name] = poolAddr
  }

  console.log('\n' + '═'.repeat(60))
  console.log('RESUMO:')
  for (const [name, addr] of Object.entries(results)) {
    console.log(`  ${name.padEnd(15)} → ${addr}`)
  }

  // Serializar para facilitar cópia ao deployments.json
  console.log('\n[JSON para deployments.v3.arc-testnet.json]')
  const keys = {
    'FAJU/ARCX':    'v3Pool_FAJU_ARCX_500',
    'USDC/ARCX':    'v3Pool_USDC_ARCX_500',
    'USDC/cirBTC':  'v3Pool_USDC_CIRBTC_500',
    'EURC/cirBTC':  'v3Pool_EURC_CIRBTC_500',
    'FAJU/cirBTC':  'v3Pool_FAJU_CIRBTC_500',
  }
  const jsonPatch = {}
  for (const [name, addr] of Object.entries(results)) {
    jsonPatch[keys[name]] = addr
  }
  console.log(JSON.stringify(jsonPatch, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
