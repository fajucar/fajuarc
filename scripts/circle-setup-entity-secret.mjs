/**
 * Circle Entity Secret Setup
 * Run once per network:
 *   ARC_NETWORK=mainnet node scripts/circle-setup-entity-secret.mjs
 *
 * This script:
 * 1. Reads CIRCLE_API_KEY_<NETWORK> from .env (network from ARC_NETWORK)
 * 2. Generates a random 32-byte Entity Secret
 * 3. Encrypts and registers it with Circle
 * 4. Appends CIRCLE_ENTITY_SECRET_<NETWORK> to .env
 */

import { randomBytes, publicEncrypt, constants } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARC_NETWORK, NETWORK, getNetworkEnv, networkEnvName } from '../server/network.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dir, '..')
const ENV_FILE = resolve(ROOT, '.env')

const API_KEY_VAR       = networkEnvName('CIRCLE_API_KEY')
const ENTITY_SECRET_VAR = networkEnvName('CIRCLE_ENTITY_SECRET')
const WALLET_SET_VAR    = networkEnvName('CIRCLE_WALLET_SET_ID')

if (!existsSync(ENV_FILE)) throw new Error('.env não encontrado em ' + ENV_FILE)

// ── 1. Ler API Key da rede ativa ──────────────────────────────────────────
const API_KEY = getNetworkEnv('CIRCLE_API_KEY')

if (!API_KEY) {
  console.error(`\n❌ ${API_KEY_VAR} não encontrado (ARC_NETWORK=${ARC_NETWORK}).`)
  process.exit(1)
}
if (!API_KEY.startsWith(NETWORK.circleKeyPrefix)) {
  console.error(`\n❌ ${API_KEY_VAR} não começa com "${NETWORK.circleKeyPrefix}" — chave do ambiente errado para ARC_NETWORK=${ARC_NETWORK}.`)
  process.exit(1)
}
console.log(`✅ API Key carregada (${ARC_NETWORK}): ${NETWORK.circleKeyPrefix}...`)

console.log('\n🔵 Circle Entity Secret Setup')
console.log('─'.repeat(45))

// ── 2. Verificar se já está configurado ───────────────────────────────────
const existingSecret = getNetworkEnv('CIRCLE_ENTITY_SECRET')
if (existingSecret && existingSecret.length === 64) {
  console.log(`\n⚠️  ${ENTITY_SECRET_VAR} já existe no .env.`)
  console.log('   Se quiser gerar um novo, remova a linha do .env e rode novamente.')
  process.exit(0)
}

// ── 3. Gerar Entity Secret (32 bytes aleatórios) ──────────────────────────
const entitySecret = randomBytes(32).toString('hex')
console.log('\n✅ Entity Secret gerado (guarda em lugar seguro):')
console.log('   ' + entitySecret)

// ── 4. Buscar chave pública do Circle ─────────────────────────────────────
console.log('\n📡 Buscando chave pública do Circle...')

const pkRes = await fetch('https://api.circle.com/v1/w3s/config/entity/publicKey', {
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
})

const pkData = await pkRes.json()

if (!pkRes.ok || !pkData.data?.publicKey) {
  console.error('\n❌ Erro ao buscar chave pública:', JSON.stringify(pkData, null, 2))
  console.error(`\n   Verifique se o ${API_KEY_VAR} no .env está correto.`)
  process.exit(1)
}

const publicKeyPem = pkData.data.publicKey
console.log('✅ Chave pública obtida.')

// ── 5. Encriptar Entity Secret com RSA-OAEP ───────────────────────────────
const entitySecretBuffer = Buffer.from(entitySecret, 'hex')
const encrypted = publicEncrypt(
  { key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
  entitySecretBuffer
)
const ciphertext = encrypted.toString('base64')

// ── 6. Registrar no Circle ────────────────────────────────────────────────
console.log('\n📡 Registrando no Circle...')

const regRes = await fetch('https://api.circle.com/v1/w3s/config/entity/secretCiphertext', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ entitySecretCiphertext: ciphertext }),
})

const regData = await regRes.json()

if (!regRes.ok) {
  // 409 = an Entity Secret is already registered for this API key's entity.
  // The secret generated above was NOT registered, so it must not be saved:
  // writing it to .env would make every Circle call fail.
  if (regRes.status === 409) {
    console.error('\n⚠️  Já existe um Entity Secret registrado no Circle para esta API key.')
    console.error('   O secret gerado acima NÃO foi registrado e NÃO foi salvo no .env. Descarte-o.')
    console.error(`   Use o secret original em ${ENTITY_SECRET_VAR}, ou resete-o no Circle Console com o arquivo de recuperação.`)
    process.exit(1)
  } else {
    console.error('\n❌ Erro ao registrar:', JSON.stringify(regData, null, 2))
    process.exit(1)
  }
} else {
  console.log('✅ Entity Secret registrado com sucesso!')
}

// ── 7. Salvar no .env ─────────────────────────────────────────────────────
let envContent = readFileSync(ENV_FILE, 'utf-8')

// Remove linha existente (vazia ou malformada) da rede ativa, se houver
envContent = envContent.replace(new RegExp(`^${ENTITY_SECRET_VAR}=.*$`, 'm'), '')

// Adiciona as variáveis Circle da rede ativa no final
const walletSetLine = new RegExp(`^${WALLET_SET_VAR}\\s*=`, 'm').test(envContent) ? '' : `${WALLET_SET_VAR}=\n`
const circleBlock = `
# Circle Developer Controlled Wallets (${ARC_NETWORK})
${ENTITY_SECRET_VAR}=${entitySecret}
${walletSetLine}`

envContent = envContent.trimEnd() + '\n' + circleBlock

writeFileSync(ENV_FILE, envContent, 'utf-8')

console.log(`\n✅ ${ENTITY_SECRET_VAR} salvo no .env`)
console.log('\n─'.repeat(45))
console.log('🎯 Próximo passo: criar o Wallet Set no Console Circle')
console.log('   Console → Wallets → Wallet Sets → Create')
console.log(`   Copie o ID e adicione no .env como ${WALLET_SET_VAR}=...`)
console.log('─'.repeat(45) + '\n')
