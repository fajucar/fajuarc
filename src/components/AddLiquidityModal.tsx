import { useState, useEffect, useCallback, CSSProperties } from 'react'
import { getTokenBalance } from '@/lib/balances'
import { formatMoney } from '@/lib/format'
import { WrongNetworkNotice } from '@/components/Web3/WrongNetworkNotice'

interface Token {
  symbol: string
  address: string
  decimals?: number
}

interface AddLiquidityModalProps {
  isOpen: boolean
  onClose: () => void
  tokenA: Token
  tokenB: Token
  /** tokenB por 1 tokenA (usado quando não é um par BTC) */
  fallbackRatio?: number
  loading?: boolean
  /** Endereço da carteira — necessário para leitura de saldos */
  account?: string
  onConfirm?: (amountA: string, amountB: string) => void
}

function formatRatio(r: number): string {
  if (r <= 0) return '0'
  if (r >= 1000) return Math.round(r).toLocaleString('pt-BR')
  if (r >= 0.0001) return r.toLocaleString('pt-BR', { maximumFractionDigits: 8 })
  return r.toFixed(10).replace(/\.?0+$/, '')
}

export default function AddLiquidityModal({
  isOpen,
  onClose,
  tokenA,
  tokenB,
  fallbackRatio = 1,
  loading = false,
  account,
  onConfirm,
}: AddLiquidityModalProps) {
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  const [ratio, setRatio] = useState(fallbackRatio)
  const [loadingPrice, setLoadingPrice] = useState(false)

  // Saldos on-chain
  const [balanceA, setBalanceA] = useState<string | null>(null)
  const [balanceB, setBalanceB] = useState<string | null>(null)
  const [loadingBalances, setLoadingBalances] = useState(false)

  const isBtcPair = /btc/i.test(tokenA.symbol) || /btc/i.test(tokenB.symbol)
  const btcIsTokenA = /btc/i.test(tokenA.symbol)

  const fmtA = Math.min(tokenA.decimals ?? 6, 8)
  const fmtB = Math.min(tokenB.decimals ?? 6, 8)

  // ── Preço ─────────────────────────────────────────────────────────────────
  const fetchBtcPrice = useCallback(async () => {
    try {
      setLoadingPrice(true)
      const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')
      const data = await res.json()
      const price = parseFloat(data.price)
      if (!isNaN(price) && price > 0) {
        setRatio(btcIsTokenA ? price : 1 / price)
      }
    } catch {
      setRatio(btcIsTokenA ? 107000 : 1 / 107000)
    } finally {
      setLoadingPrice(false)
    }
  }, [btcIsTokenA])

  useEffect(() => {
    if (!isOpen) return
    if (isBtcPair) fetchBtcPrice()
    else setRatio(fallbackRatio)
  }, [isOpen, isBtcPair, fetchBtcPrice, fallbackRatio])

  // ── Saldos on-chain ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !account) return
    let cancelled = false
    setLoadingBalances(true)
    Promise.all([
      getTokenBalance(account, { address: tokenA.address, decimals: tokenA.decimals ?? 6 }),
      getTokenBalance(account, { address: tokenB.address, decimals: tokenB.decimals ?? 6 }),
    ])
      .then(([bA, bB]) => {
        if (!cancelled) { setBalanceA(bA); setBalanceB(bB) }
      })
      .finally(() => { if (!cancelled) setLoadingBalances(false) })
    return () => { cancelled = true }
  }, [isOpen, account, tokenA.address, tokenB.address])

  // ── Reset ao fechar ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setAmountA('')
      setAmountB('')
      setBalanceA(null)
      setBalanceB(null)
    }
  }, [isOpen])

  // ── Inputs ────────────────────────────────────────────────────────────────
  const handleAmountA = (v: string) => {
    const val = v.replace(/,/g, '.')
    setAmountA(val)
    const n = parseFloat(val)
    if (val === '' || isNaN(n) || n <= 0) { setAmountB(''); return }
    if (ratio > 0) setAmountB((n * ratio).toFixed(fmtB))
  }

  const handleAmountB = (v: string) => {
    const val = v.replace(/,/g, '.')
    setAmountB(val)
    const n = parseFloat(val)
    if (val === '' || isNaN(n) || n <= 0) { setAmountA(''); return }
    if (ratio > 0) setAmountA((n / ratio).toFixed(fmtA))
  }

  if (!isOpen) return null

  // ── Validação de saldo ────────────────────────────────────────────────────
  const isOverA =
    balanceA !== null &&
    amountA !== '' &&
    parseFloat(amountA) > parseFloat(balanceA)

  const isOverB =
    balanceB !== null &&
    amountB !== '' &&
    parseFloat(amountB) > parseFloat(balanceB)

  const canConfirm =
    !!amountA && !!amountB &&
    parseFloat(amountA) > 0 && parseFloat(amountB) > 0 &&
    !loading && !isOverA && !isOverB

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={headerStyle}>
          <span style={titleStyle}>Add Liquidity</span>
          <button style={closeBtnStyle} onClick={onClose}>✕</button>
        </div>

        <WrongNetworkNotice className="mb-3" />

        {/* Token A */}
        <div style={isOverA ? inputGroupErrorStyle : inputGroupStyle}>
          {/* Label + saldo + MAX */}
          <div style={balanceRowStyle}>
            <span style={labelStyle}>{tokenA.symbol}</span>
            {account && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={balanceLabelStyle}>
                  {loadingBalances
                    ? 'Balance: ...'
                    : balanceA !== null
                    ? `Balance: ${formatMoney(balanceA, 4)}`
                    : ''}
                </span>
                {balanceA !== null && parseFloat(balanceA) > 0 && (
                  <button
                    style={maxBtnStyle}
                    onClick={() => handleAmountA(balanceA)}
                  >
                    MAX
                  </button>
                )}
              </div>
            )}
          </div>
          <input
            style={inputStyle}
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amountA}
            onChange={(e) => handleAmountA(e.target.value)}
            autoComplete="off"
          />
          {isOverA && <span style={errorTextStyle}>Insufficient balance</span>}
        </div>

        <div style={plusStyle}>+</div>

        {/* Token B */}
        <div style={isOverB ? inputGroupErrorStyle : inputGroupStyle}>
          <div style={balanceRowStyle}>
            <span style={labelStyle}>{tokenB.symbol}</span>
            {account && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={balanceLabelStyle}>
                  {loadingBalances
                    ? 'Balance: ...'
                    : balanceB !== null
                    ? `Balance: ${formatMoney(balanceB, 4)}`
                    : ''}
                </span>
                {balanceB !== null && parseFloat(balanceB) > 0 && (
                  <button
                    style={maxBtnStyle}
                    onClick={() => handleAmountB(balanceB)}
                  >
                    MAX
                  </button>
                )}
              </div>
            )}
          </div>
          <input
            style={inputStyle}
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amountB}
            onChange={(e) => handleAmountB(e.target.value)}
            autoComplete="off"
          />
          {isOverB && <span style={errorTextStyle}>Insufficient balance</span>}
        </div>

        {/* Preço */}
        <div style={priceBoxStyle}>
          {loadingPrice
            ? 'Fetching price...'
            : `1 ${tokenA.symbol} ≈ ${formatRatio(ratio)} ${tokenB.symbol}`}
        </div>

        <button
          style={{
            ...confirmBtnStyle,
            opacity: canConfirm ? 1 : 0.5,
            cursor: canConfirm ? 'pointer' : 'not-allowed',
          }}
          disabled={!canConfirm}
          onClick={() => canConfirm && onConfirm?.(amountA, amountB)}
        >
          {loading ? 'Processing...' : 'Add Liquidity'}
        </button>
      </div>
    </div>
  )
}

/* ── Estilos inline — layout garantido, inputs nunca escapam do modal ── */
const overlayStyle: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: 16,
}
const modalStyle: CSSProperties = {
  width: '100%', maxWidth: 420, background: '#0b1220',
  border: '1px solid rgba(56,189,248,0.30)', borderRadius: 20, padding: 20,
  boxShadow: '0 0 40px rgba(56,189,248,0.20)', display: 'flex',
  flexDirection: 'column', gap: 12, boxSizing: 'border-box',
  maxHeight: '90vh', overflowY: 'auto',
}
const headerStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const titleStyle: CSSProperties = { color: '#e2e8f0', fontSize: 18, fontWeight: 600 }
const closeBtnStyle: CSSProperties = {
  background: 'none', border: 'none', color: '#94a3b8',
  fontSize: 18, cursor: 'pointer', padding: 4,
}
const inputGroupStyle: CSSProperties = {
  background: '#111c30', border: '1px solid rgba(148,163,184,0.15)',
  borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column',
  gap: 8, boxSizing: 'border-box',
}
const inputGroupErrorStyle: CSSProperties = {
  ...inputGroupStyle,
  border: '1px solid rgba(239,68,68,0.65)',
}
const balanceRowStyle: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
}
const labelStyle: CSSProperties = { color: '#38bdf8', fontSize: 13, fontWeight: 600 }
const balanceLabelStyle: CSSProperties = { color: '#64748b', fontSize: 12 }
const maxBtnStyle: CSSProperties = {
  background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.35)',
  borderRadius: 6, color: '#38bdf8', fontSize: 11, fontWeight: 700,
  cursor: 'pointer', padding: '2px 7px', lineHeight: '18px',
}
const inputStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'transparent',
  border: 'none', outline: 'none', color: '#fff', fontSize: 24, fontWeight: 600,
  MozAppearance: 'textfield',
} as CSSProperties
const errorTextStyle: CSSProperties = {
  color: '#f87171', fontSize: 12, marginTop: -4,
}
const plusStyle: CSSProperties = { textAlign: 'center', color: '#64748b', fontSize: 18 }
const priceBoxStyle: CSSProperties = {
  color: '#94a3b8', fontSize: 13, textAlign: 'center',
  padding: '8px 12px', background: 'rgba(148,163,184,0.06)',
  borderRadius: 10, border: '1px solid rgba(148,163,184,0.10)',
}
const confirmBtnStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '14px',
  background: 'linear-gradient(90deg,#0ea5e9,#38bdf8)', border: 'none',
  borderRadius: 14, color: '#0b1220', fontSize: 16, fontWeight: 700,
  transition: 'opacity 0.15s',
}
