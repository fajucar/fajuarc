import type { CSSProperties } from 'react'

export const TOKEN_BG: Record<string, string> = {
  USDC:   'rgba(78,163,255,0.22)',
  EURC:   'rgba(99,102,241,0.22)',
  FAJU:   'rgba(249,115,22,0.22)',
  ARCX:   'rgba(177,76,255,0.22)',
  QCAD:   'rgba(34,211,238,0.22)',
  cirBTC: 'rgba(247,147,26,0.22)',
}

export const TOKEN_COLOR: Record<string, string> = {
  USDC:   '#4ea3ff',
  EURC:   '#818cf8',
  FAJU:   '#f97316',
  ARCX:   '#b14cff',
  QCAD:   '#22d3ee',
  cirBTC: '#f7931a',
}

export const glassCard: CSSProperties = {
  background: 'var(--glass-fill)',
  border: '1px solid var(--glass-border)',
  borderRadius: 'var(--radius-lg)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--card-shadow)',
  padding: 20,
}

export const innerCell: CSSProperties = {
  background: 'var(--glass-fill-strong)',
  border: '1px solid var(--glass-border)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
}

export const cellLabel: CSSProperties = {
  color: 'var(--text-muted)', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7,
}

export const cellValue: CSSProperties = {
  color: 'var(--text-primary)', fontSize: 15, fontWeight: 700,
}

export function TokenPairIcons({ sym0, sym1 }: { sym0: string; sym1: string }) {
  const col0 = TOKEN_COLOR[sym0] ?? '#4ea3ff'
  const col1 = TOKEN_COLOR[sym1] ?? '#b14cff'
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        background: TOKEN_BG[sym0] ?? 'rgba(78,163,255,0.2)',
        border: `2px solid ${col0}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 800, color: col0,
        zIndex: 2, position: 'relative',
        boxShadow: `0 0 10px ${col0}35`,
      }}>
        {sym0[0]}
      </div>
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        background: TOKEN_BG[sym1] ?? 'rgba(177,76,255,0.2)',
        border: `2px solid ${col1}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 800, color: col1,
        marginLeft: -10, zIndex: 1, position: 'relative',
        boxShadow: `0 0 10px ${col1}35`,
      }}>
        {sym1[0]}
      </div>
    </div>
  )
}
