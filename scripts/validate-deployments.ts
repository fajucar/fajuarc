#!/usr/bin/env npx tsx
/**
 * Valida deployments.arc-testnet.json (endereços hex, decimals, estrutura).
 * Uso: npm run validate:deployments
 */
import * as fs from 'fs'
import * as path from 'path'

const HEX = /^0x[0-9a-fA-F]{40}$/

function checkAddress(obj: unknown, key: string): void {
  const v = (obj as Record<string, unknown>)[key]
  if (typeof v !== 'string') {
    console.error(`Erro: "${key}" deve ser string. Recebido: ${typeof v}`)
    process.exit(1)
  }
  const s = v.trim()
  if (s.length !== 42) {
    console.error(`Erro: "${key}" deve ter 42 caracteres (0x + 40 hex). Recebido: ${s.length}. Valor: "${s}"`)
    process.exit(1)
  }
  if (!HEX.test(s)) {
    console.error(`Erro: "${key}" inválido (apenas 0-9, a-f). Valor: "${s}"`)
    process.exit(1)
  }
}

const filePath = path.join(process.cwd(), 'src', 'config', 'deployments.arc-testnet.json')
const raw = fs.readFileSync(filePath, 'utf-8')
let data: unknown
try {
  data = JSON.parse(raw)
} catch (e) {
  console.error('Erro: JSON inválido em', filePath, e)
  process.exit(1)
}

const d = data as Record<string, unknown>
if (typeof d.chainId !== 'number' || d.chainId <= 0) {
  console.error('Erro: chainId deve ser número > 0. Valor:', d.chainId)
  process.exit(1)
}

checkAddress(d, 'factory')
checkAddress(d, 'router')

const tokens = d.tokens as Record<string, { address?: string; decimals?: number }> | undefined
if (!tokens || typeof tokens !== 'object') {
  console.error('Erro: "tokens" ausente ou inválido')
  process.exit(1)
}

for (const key of ['USDC', 'EURC']) {
  const t = tokens[key]
  if (!t || typeof t !== 'object') {
    console.error(`Erro: tokens.${key} ausente ou inválido`)
    process.exit(1)
  }
  if (typeof t.address !== 'string') {
    console.error(`Erro: tokens.${key}.address deve ser string. Valor:`, t.address)
    process.exit(1)
  }
  const s = t.address.trim()
  if (s.length !== 42 || !HEX.test(s)) {
    console.error(`Erro: tokens.${key}.address inválido (0x + 40 hex). Valor: "${s}"`)
    process.exit(1)
  }
  if (!Number.isInteger(t.decimals) || (t.decimals as number) < 0 || (t.decimals as number) > 18) {
    console.error(`Erro: tokens.${key}.decimals deve ser inteiro 0-18. Valor:`, t.decimals)
    process.exit(1)
  }
}

console.log('OK:', filePath)
console.log('  chainId:', d.chainId)
console.log('  factory:', (d.factory as string).slice(0, 10) + '...')
console.log('  router:', (d.router as string).slice(0, 10) + '...')
console.log('  tokens.USDC:', (tokens.USDC.address as string).slice(0, 10) + '...', `decimals: ${tokens.USDC.decimals}`)
console.log('  tokens.EURC:', (tokens.EURC.address as string).slice(0, 10) + '...', `decimals: ${tokens.EURC.decimals}`)
