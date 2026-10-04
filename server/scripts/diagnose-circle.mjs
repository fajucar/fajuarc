/**
 * Circle vs. on-chain balance diagnostic.
 *
 * Answers one question: does Circle's own balance API actually not see the
 * Arc Testnet USDC precompile balance (an indexing gap — needs a Circle
 * Support ticket), or was `getWalletTokenBalance` just filtering it out by
 * default (fixable by passing `includeAll: true`)?
 *
 * Run:
 *   node server/scripts/diagnose-circle.mjs
 *
 * Requires ARC_NETWORK plus the matching CIRCLE_API_KEY_* /
 * CIRCLE_ENTITY_SECRET_* in .env (same as the rest of the backend — see
 * server/network.mjs).
 */

import { formatUnits } from 'viem'
import { CIRCLE_BLOCKCHAIN } from '../network.mjs'
import { getPublicClient, getUsdcDecimals } from '../onchain.mjs'
import { getCircleClient } from '../circle.mjs'
import { USDC } from '../tokens.mjs'

const TEST_ADDRESS = '0xFa09E25016e8Ab4325ceE2Da7513d8A8ffC65AAA'
const WALLET_IDS = [
  '05bf6b47-a96d-5aa5-b732-c6f7fa2926c2',
  '9b122946-dd7c-5ab7-8288-bc5b392f4c83',
]

function section(title) {
  console.log('\n' + '='.repeat(72))
  console.log(title)
  console.log('='.repeat(72))
}

async function main() {
  section('1. RPC direto na Arc Testnet (viem)')

  // ── 1a. decimals() ──────────────────────────────────────────────────────
  let decimals = null
  try {
    decimals = await getUsdcDecimals()
    console.log(`1a. decimals() do contrato ${USDC.address}:`)
    console.log(`    → ${decimals}`)
  } catch (err) {
    console.error(`1a. FALHOU ao ler decimals() de ${USDC.address}:`, err.message)
  }

  // ── 1b. balanceOf() ──────────────────────────────────────────────────────
  let onChainRawBalance = null
  try {
    const publicClient = getPublicClient()
    onChainRawBalance = await publicClient.readContract({
      address:      USDC.address,
      abi:          [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }],
      functionName: 'balanceOf',
      args:         [TEST_ADDRESS],
    })
    const formatted = decimals != null ? formatUnits(onChainRawBalance, decimals) : '(decimals desconhecido — veja 1a)'
    console.log(`1b. balanceOf(${TEST_ADDRESS}) no contrato ${USDC.address}:`)
    console.log(`    → raw: ${onChainRawBalance.toString()}`)
    console.log(`    → formatado (decimals=${decimals}): ${formatted}`)
  } catch (err) {
    console.error(`1b. FALHOU ao ler balanceOf(${TEST_ADDRESS}):`, err.message)
  }

  // ── 1c. getBalance nativo ────────────────────────────────────────────────
  try {
    const publicClient = getPublicClient()
    const nativeRaw = await publicClient.getBalance({ address: TEST_ADDRESS })
    console.log(`1c. getBalance nativo(${TEST_ADDRESS}):`)
    console.log(`    → raw: ${nativeRaw.toString()}`)
    console.log(`    → formatUnits(18): ${formatUnits(nativeRaw, 18)}`)
  } catch (err) {
    console.error(`1c. FALHOU ao ler getBalance nativo(${TEST_ADDRESS}):`, err.message)
  }

  section('2. Circle SDK — getWalletTokenBalance({ includeAll: true })')

  const circleResults = []
  for (const walletId of WALLET_IDS) {
    console.log(`\n--- wallet ${walletId} ---`)
    try {
      const client = getCircleClient()
      const res = await client.getWalletTokenBalance({ id: walletId, includeAll: true })
      console.log(JSON.stringify(res.data, null, 2))

      const balances = res?.data?.tokenBalances ?? []
      circleResults.push({ walletId, balances })

      if (balances.length > 0) {
        console.log(`  tokenIds encontrados (wallet ${walletId}):`)
        for (const b of balances) {
          console.log(`    - token.id=${b.token?.id}  symbol/name=${b.token?.symbol ?? b.token?.name ?? '?'}  amount=${b.amount}`)
        }
      } else {
        console.log(`  (nenhum tokenBalance retornado, mesmo com includeAll: true)`)
      }
    } catch (err) {
      console.error(`  ERRO ao consultar wallet ${walletId}:`, err.message)
      circleResults.push({ walletId, balances: [], error: err.message })
    }
  }

  section('VEREDITO')

  const onChainHasBalance = typeof onChainRawBalance === 'bigint' && onChainRawBalance > 0n
  const circleHasAnyBalance = circleResults.some(r => r.balances.length > 0)

  if (!onChainHasBalance) {
    console.log('⚠️  Não foi possível confirmar saldo on-chain > 0 (veja a seção 1b acima) — reveja')
    console.log('   os logs antes de tirar qualquer conclusão sobre a Circle.')
  } else if (onChainHasBalance && !circleHasAnyBalance) {
    console.log('❌ GAP DE INDEXAÇÃO — balanceOf on-chain é > 0, mas a Circle não retornou nada')
    console.log('   mesmo com includeAll: true em nenhuma das wallets testadas.')
    console.log('   → Ação: abrir ticket com o suporte da Circle, referenciando o token/precompile')
    console.log(`     ${USDC.address} na blockchain ${CIRCLE_BLOCKCHAIN}.`)
  } else {
    console.log('✅ ERA FILTRO — a Circle retornou saldo ao usar includeAll: true.')
    console.log('   → Ação: sempre passar includeAll: true nas chamadas a getWalletTokenBalance,')
    console.log('     e usar o(s) tokenId(s) logado(s) acima onde a API da Circle pedir um tokenId')
    console.log('     específico (em vez do endereço do contrato).')
  }

  if (typeof decimals === 'number') {
    console.log(`\nℹ️  decimals() do contrato USDC (${USDC.address}) = ${decimals}.`)
    if (decimals !== USDC.decimals) {
      console.log(`   ⚠️  ISSO DIVERGE do valor hardcoded em server/tokens.mjs (${USDC.decimals})!`)
      console.log(`   → Atualize server/tokens.mjs OU garanta que scheduledPayments/scheduler leiam`)
      console.log(`     decimals() on-chain (server/onchain.mjs) em vez do valor fixo.`)
    } else {
      console.log(`   Bate com o valor hardcoded em server/tokens.mjs (${USDC.decimals}) — ok, mas`)
      console.log(`   o scheduler agora lê on-chain de qualquer forma (não depende mais só disso).`)
    }
    console.log(`   Use parseUnits(amount, ${decimals}) — nunca hardcode 6 ou 18 sem checar aqui primeiro.`)
  }

  console.log('')
}

main().catch(err => {
  console.error('\nErro fatal no diagnóstico:', err)
  process.exit(1)
})
