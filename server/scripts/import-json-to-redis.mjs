/**
 * One-time import of the legacy JSON DB files into Upstash Redis, for the
 * network selected by ARC_NETWORK:
 *   server/wallets-db.<network>.json            → fajuarc:<network>:wallets
 *   server/scheduled-payments-db.<network>.json → fajuarc:<network>:scheduled-payments
 *
 * Idempotent and non-destructive: uses HSETNX, so records already in Redis
 * are never overwritten, and the JSON files are left untouched.
 *
 * Run: node server/scripts/import-json-to-redis.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARC_NETWORK, getRedis, redisKey } from '../network.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))

function readJson(name, fallback) {
  const file = resolve(__dir, '..', `${name}.${ARC_NETWORK}.json`)
  if (!existsSync(file)) {
    console.log(`  ${name}.${ARC_NETWORK}.json não encontrado — pulando.`)
    return fallback
  }
  return JSON.parse(readFileSync(file, 'utf-8'))
}

async function importHash(key, records) {
  let written = 0
  let skipped = 0
  for (const [field, value] of records) {
    const ok = await getRedis().hsetnx(key, field, JSON.stringify(value))
    ok === 1 ? written++ : skipped++
  }
  console.log(`  ${key}: ${written} importado(s), ${skipped} já existente(s)`)
}

console.log(`Importando JSON → Redis (ARC_NETWORK=${ARC_NETWORK})`)

const wallets = readJson('wallets-db', {})
await importHash(redisKey('wallets'), Object.entries(wallets))

const payments = readJson('scheduled-payments-db', [])
await importHash(redisKey('scheduled-payments'), payments.map(p => [p.id, p]))

console.log('Concluído. Os arquivos JSON não foram alterados.')
