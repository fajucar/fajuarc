/**
 * Circle Wallet Set Setup
 * Run once per network:
 *   ARC_NETWORK=mainnet node scripts/create-wallet-set.mjs [--force]
 *
 * This script:
 * 1. Reads CIRCLE_API_KEY_<NETWORK> and CIRCLE_ENTITY_SECRET_<NETWORK>
 *    (network from ARC_NETWORK; no fallback to the unsuffixed names)
 * 2. Checks the API key prefix matches the network before calling Circle
 * 3. Refuses to run if CIRCLE_WALLET_SET_ID_<NETWORK> is already set,
 *    unless --force is passed
 * 4. Creates the Wallet Set and writes CIRCLE_WALLET_SET_ID_<NETWORK> to .env
 *
 * Never prints the API key or the Entity Secret.
 */

import { publicEncrypt, constants, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// network.mjs aborts on load unless ARC_NETWORK is exactly "mainnet" or "testnet".
import { ARC_NETWORK, NETWORK, getNetworkEnv, networkEnvName } from '../server/network.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dir, '..')
const ENV_FILE = resolve(ROOT, '.env')

const FORCE  = process.argv.includes('--force')
const SUFFIX = `_${NETWORK.envSuffix}`

const API_KEY_VAR       = networkEnvName('CIRCLE_API_KEY')
const ENTITY_SECRET_VAR = networkEnvName('CIRCLE_ENTITY_SECRET')
const WALLET_SET_VAR    = networkEnvName('CIRCLE_WALLET_SET_ID')

if (!existsSync(ENV_FILE)) throw new Error('.env não encontrado em ' + ENV_FILE)

console.log('\n🔵 Circle Wallet Set Setup')
console.log('─'.repeat(45))
console.log(`   Rede:   ${ARC_NETWORK}`)
console.log(`   Sufixo: ${SUFFIX}`)

// ── 1. Ler credenciais da rede ativa ──────────────────────────────────────
const API_KEY    = getNetworkEnv('CIRCLE_API_KEY')
const ENTITY_SEC = getNetworkEnv('CIRCLE_ENTITY_SECRET')

if (!API_KEY) {
  console.error(`\n❌ ${API_KEY_VAR} não encontrado (ARC_NETWORK=${ARC_NETWORK}).`)
  process.exit(1)
}
if (!ENTITY_SEC) {
  console.error(`\n❌ ${ENTITY_SECRET_VAR} não encontrado (ARC_NETWORK=${ARC_NETWORK}).`)
  process.exit(1)
}

// ── 2. Checar prefixo da API key antes de qualquer chamada ────────────────
if (!API_KEY.startsWith(NETWORK.circleKeyPrefix)) {
  console.error(`\n❌ ${API_KEY_VAR} não começa com "${NETWORK.circleKeyPrefix}" — chave do ambiente errado para ARC_NETWORK=${ARC_NETWORK}.`)
  console.error('   Nenhuma chamada foi feita à Circle.')
  process.exit(1)
}

// ── 3. Não criar um segundo Wallet Set por engano ─────────────────────────
const existingWalletSet = getNetworkEnv('CIRCLE_WALLET_SET_ID')
if (existingWalletSet && !FORCE) {
  console.error(`\n⚠️  ${WALLET_SET_VAR} já está definido: ${existingWalletSet}`)
  console.error('   Nenhum Wallet Set foi criado.')
  console.error('   Para criar outro e sobrescrever a variável, rode novamente com --force.')
  process.exit(1)
}
if (existingWalletSet && FORCE) {
  console.log(`\n⚠️  --force: ${WALLET_SET_VAR} (${existingWalletSet}) será sobrescrito.`)
}

// ── 4. Buscar chave pública do Circle ─────────────────────────────────────
console.log('\n📡 Buscando chave pública do Circle...')
const pkRes = await fetch('https://api.circle.com/v1/w3s/config/entity/publicKey', {
  headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
})
const pkData = await pkRes.json()

if (!pkRes.ok || !pkData.data?.publicKey) {
  console.error('\n❌ Erro ao buscar chave pública:', JSON.stringify(pkData, null, 2))
  console.error(`\n   Verifique se o ${API_KEY_VAR} no .env está correto.`)
  process.exit(1)
}

// ── 5. Encriptar Entity Secret com RSA-OAEP ───────────────────────────────
const entitySecretCiphertext = publicEncrypt(
  { key: pkData.data.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
  Buffer.from(ENTITY_SEC, 'hex')
).toString('base64')

// ── 6. Criar Wallet Set ───────────────────────────────────────────────────
console.log('📡 Criando Wallet Set...')
const res = await fetch('https://api.circle.com/v1/w3s/developer/walletSets', {
  method: 'POST',
  headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    idempotencyKey: randomUUID(),
    entitySecretCiphertext,
    name: `FajuARC Wallets (${ARC_NETWORK})`,
  }),
})
const data = await res.json()

if (!res.ok) {
  console.error('\n❌ Erro ao criar Wallet Set:', JSON.stringify(data, null, 2))
  process.exit(1)
}

const walletSetId = data.data?.walletSet?.id
if (!walletSetId) {
  console.error('\n❌ Resposta da Circle sem ID de Wallet Set:', JSON.stringify(data, null, 2))
  process.exit(1)
}
console.log(`✅ Wallet Set criado (${ARC_NETWORK}). ID: ${walletSetId}`)

// ── 7. Salvar no .env ─────────────────────────────────────────────────────
let envContent = readFileSync(ENV_FILE, 'utf-8')

// Remove linha existente (vazia, antiga ou sobrescrita via --force) da rede ativa
envContent = envContent.replace(new RegExp(`^${WALLET_SET_VAR}=.*$`, 'm'), '')

envContent = envContent.trimEnd() + '\n' + `${WALLET_SET_VAR}=${walletSetId}\n`

writeFileSync(ENV_FILE, envContent, 'utf-8')

console.log(`\n✅ ${WALLET_SET_VAR} salvo no .env`)
console.log('─'.repeat(45) + '\n')
