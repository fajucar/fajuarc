/**
 * V3 Positions Page — Lista posições NFT (concentrated liquidity)
 * Visual: glassmorphism futurista — lógica e dados 100% intactos.
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useChainId } from 'wagmi'
import { motion } from 'framer-motion'
import { RefreshCw, Wallet, AlertCircle, ExternalLink, Settings2, Coins } from 'lucide-react'
import { useV3Positions, type V3PositionInfo } from './hooks/useV3Positions'
import { getV3ConfigError, getV3Addresses } from './config'
import { AddV3LiquidityCard } from './AddV3LiquidityCard'
import { PoolCardSkeleton } from '@/components/ui/Skeleton'
import { formatTokenAmount } from '@/lib/format'
import { ARCDEX } from '@/config/arcDex'
import { useArcWallet } from '@/hooks/useArcWallet'
import { glassCard, innerCell, TokenPairIcons } from '@/components/PositionCardShared'
import { makeToken, tickPriceLabel, fullRangeTicks } from './lib/sdk'
import type { CSSProperties } from 'react'

function alertGlass(r: number, g: number, b: number): CSSProperties {
  return {
    background:
      `linear-gradient(rgba(15,8,32,0.92), rgba(15,8,32,0.92)) padding-box,` +
      `linear-gradient(135deg, rgba(${r},${g},${b},0.45), rgba(${r},${g},${b},0.55)) border-box`,
    border: '1px solid transparent',
    borderRadius: 14,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    padding: '14px 18px',
  }
}

// ── RangeBar ──────────────────────────────────────────────────────────────────
function RangeBar({
  tickLower, tickUpper, currentTick, inRange,
}: {
  tickLower: number; tickUpper: number; currentTick: number; inRange: boolean
}) {
  const rangeSize = tickUpper - tickLower
  const clamped = Math.max(tickLower, Math.min(tickUpper, currentTick))
  const pct = rangeSize > 0 ? ((clamped - tickLower) / rangeSize) * 100 : 50
  const color = inRange ? '#2dd4a0' : '#f59e0b'

  return (
    // Extra paddingTop reserves space for the diamond floating above the track
    <div style={{ position: 'relative', paddingTop: 20 }}>
      {/* Gradient track: red at ends, green in the active centre */}
      <div
        style={{
          height: 8, borderRadius: 9999, overflow: 'visible', position: 'relative',
          background:
            'linear-gradient(90deg,' +
            'rgba(239,68,68,0.75) 0%,' +
            'rgba(45,212,160,0.85) 46%,' +
            'rgba(45,212,160,0.85) 54%,' +
            'rgba(239,68,68,0.75) 100%)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5), 0 0 8px rgba(45,212,160,0.1)',
        }}
        title={`Current price: tick ${currentTick} (range ${tickLower}..${tickUpper})`}
      >
        {/* Marker: centred at pct%, diamond + vertical line */}
        <div style={{
          position: 'absolute',
          left: `${pct}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          {/* Vertical neon line — extends 13 px above and below track centre */}
          <div style={{
            position: 'absolute',
            left: -1, top: -13,
            width: 2, height: 26,
            background: `linear-gradient(to bottom, ${color}ee, ${color}10)`,
            boxShadow: `0 0 6px ${color}90`,
            borderRadius: 2,
          }} />
          {/* Pulsing diamond at top of the line */}
          <motion.div
            animate={{
              boxShadow: [
                `0 0 3px 1px ${color}50`,
                `0 0 10px 3px ${color}99`,
                `0 0 3px 1px ${color}50`,
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              left: -4, top: -22,
              width: 8, height: 8,
              background: color,
              transform: 'rotate(45deg)',
              borderRadius: 2,
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── PositionCard ──────────────────────────────────────────────────────────────
function PositionCard({ pos, positionManager }: { pos: V3PositionInfo; positionManager: string }) {
  const chainId = useChainId()
  const hasFees = pos.tokensOwed0 > 0n || pos.tokensOwed1 > 0n
  const sym0 = pos.symbol0
  const sym1 = pos.symbol1

  const priceLabels = useMemo(() => {
    try {
      const token0 = makeToken(chainId ?? 0, pos.token0, pos.decimals0, sym0)
      const token1 = makeToken(chainId ?? 0, pos.token1, pos.decimals1, sym1)
      // Full-range positions have astronomically small/large boundary prices — show 0/∞ like
      // Uniswap's own UI instead of a 40-digit number.
      const fullRange = fullRangeTicks(pos.fee)
      const isFullRange = fullRange.tickLower === pos.tickLower && fullRange.tickUpper === pos.tickUpper
      return {
        min: isFullRange ? '0' : tickPriceLabel(token0, token1, Math.min(pos.tickLower, pos.tickUpper)),
        current: tickPriceLabel(token0, token1, pos.currentTick),
        max: isFullRange ? '∞' : tickPriceLabel(token0, token1, Math.max(pos.tickLower, pos.tickUpper)),
      }
    } catch {
      return { min: '—', current: '—', max: '—' }
    }
  }, [chainId, pos.token0, pos.token1, pos.decimals0, pos.decimals1, sym0, sym1, pos.tickLower, pos.tickUpper, pos.currentTick, pos.fee])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, boxShadow: '0 4px 40px rgba(78,163,255,0.07)' }}
      whileHover={{ y: -3, boxShadow: '0 10px 50px rgba(78,163,255,0.18), 0 0 0 1px rgba(78,163,255,0.28)' }}
      transition={{ duration: 0.2 }}
      style={glassCard}
    >

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        {/* Left: token icons + pair name + badges */}
        <div className="flex items-center gap-3">
          {/* Overlapping token circles */}
          <TokenPairIcons sym0={sym0} sym1={sym1} />

          <div>
            <h3 style={{ color: '#f0f4ff', fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px', margin: '0 0 6px' }}>
              {pos.pairLabel}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {/* v3 fee badge */}
              <span style={{
                padding: '2px 9px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: 'rgba(78,163,255,0.1)',
                border: '1px solid rgba(78,163,255,0.32)',
                color: '#4ea3ff',
              }}>
                v3 · {pos.feeLabel}
              </span>

              {/* In-range / Out-of-range status */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                {pos.inRange ? (
                  <>
                    <motion.span
                      animate={{ boxShadow: ['0 0 0 0 rgba(45,212,160,0)', '0 0 0 5px rgba(45,212,160,0.28)', '0 0 0 0 rgba(45,212,160,0)'] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      style={{ width: 8, height: 8, borderRadius: '50%', background: '#2dd4a0', display: 'inline-block', flexShrink: 0 }}
                    />
                    <span style={{ color: '#2dd4a0' }}>In range</span>
                  </>
                ) : (
                  <>
                    <motion.span
                      animate={{ boxShadow: ['0 0 0 0 rgba(245,158,11,0)', '0 0 0 5px rgba(245,158,11,0.28)', '0 0 0 0 rgba(245,158,11,0)'] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', flexShrink: 0 }}
                    />
                    <span style={{ color: '#f59e0b' }}>Out of range</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex flex-wrap gap-2 shrink-0">
          {/* Gerenciar — orange→amber gradient with glow */}
          <Link
            to={`/pools/v3/positions/${pos.tokenId}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700,
              background: 'linear-gradient(135deg, #f97316, #f59e0b)',
              color: '#fff',
              boxShadow: '0 0 16px rgba(249,115,22,0.35)',
              textDecoration: 'none',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 4px 22px rgba(249,115,22,0.5)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 0 16px rgba(249,115,22,0.35)'
            }}
          >
            <Settings2 size={14} />
            Manage
          </Link>

          {/* Coletar taxas — glass se disponível, disabled se não */}
          {hasFees ? (
            <Link
              to={`/pools/v3/positions/${pos.tokenId}#collect`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                background: 'rgba(45,212,160,0.08)',
                border: '1px solid rgba(45,212,160,0.42)',
                color: '#2dd4a0',
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(45,212,160,0.16)'
                e.currentTarget.style.boxShadow = '0 0 14px rgba(45,212,160,0.28)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(45,212,160,0.08)'
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <Coins size={14} />
              Collect fees
            </Link>
          ) : (
            <span
              title="No fees yet. Fees accrue when others trade within your range."
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                background: 'rgba(100,116,139,0.07)',
                border: '1px solid rgba(100,116,139,0.18)',
                color: '#475569',
                cursor: 'not-allowed',
              }}
            >
              <Coins size={14} />
              Collect fees
            </span>
          )}
        </div>
      </div>

      {/* ── Range bar ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          color: '#475569', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 10,
        }}>
          Price Range
        </div>
        <RangeBar
          tickLower={pos.tickLower}
          tickUpper={pos.tickUpper}
          currentTick={pos.currentTick}
          inRange={pos.inRange}
        />
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 12, fontSize: 11, fontFamily: 'ui-monospace,monospace',
        }}>
          <span style={{ color: '#475569' }}>Min {priceLabels.min} {sym1}</span>
          <span style={{ color: pos.inRange ? '#2dd4a0' : '#f59e0b', fontWeight: 700 }}>
            Current {priceLabels.current} {sym1}
          </span>
          <span style={{ color: '#475569' }}>Max {priceLabels.max} {sym1}</span>
        </div>
      </div>

      {/* ── Data grid — 4 inner glass cells ────────────────────────────── */}
      <div style={{ borderTop: '1px solid rgba(78,163,255,0.1)', paddingTop: 16 }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div style={innerCell}>
            <div style={{ color: '#475569', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>
              {pos.symbol0}
            </div>
            <div style={{ color: '#f0f4ff', fontSize: 15, fontWeight: 700 }}>
              {formatTokenAmount(pos.amount0, pos.decimals0)}
            </div>
          </div>

          <div style={innerCell}>
            <div style={{ color: '#475569', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>
              {pos.symbol1}
            </div>
            <div style={{ color: '#f0f4ff', fontSize: 15, fontWeight: 700 }}>
              {formatTokenAmount(pos.amount1, pos.decimals1)}
            </div>
          </div>

          <div style={innerCell}>
            <div style={{ color: '#475569', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>
              Token ID
            </div>
            <div style={{ color: '#f0f4ff', fontSize: 15, fontWeight: 700 }}>
              #{pos.tokenId.toString()}
            </div>
          </div>

          <div style={innerCell}>
            <div style={{ color: '#475569', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>
              Range (ticks)
            </div>
            <div style={{ color: '#64748b', fontSize: 11, fontFamily: 'ui-monospace,monospace', fontWeight: 500 }}>
              [{pos.tickLower} .. {pos.tickUpper}]
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer: raw liquidity + ArcScan link ───────────────────────── */}
      <div style={{
        borderTop: '1px solid rgba(78,163,255,0.07)',
        paddingTop: 12, marginTop: 14,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        justifyContent: 'space-between', gap: 8,
      }}>
        <span
          style={{ color: '#2d3a4a', fontSize: 11, fontFamily: 'ui-monospace,monospace' }}
          title="Raw contract liquidity, for verification on the explorer"
        >
          Liquidity (raw): {pos.liquidity.toString()}
        </span>
        <a
          href={`${ARCDEX.explorer}/address/${positionManager}?a=${pos.tokenId.toString()}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: '#4ea3ff', textDecoration: 'none',
            transition: 'color 0.2s, text-shadow 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#93c5fd'
            e.currentTarget.style.textShadow = '0 0 8px rgba(78,163,255,0.55)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#4ea3ff'
            e.currentTarget.style.textShadow = 'none'
          }}
        >
          View on ArcScan
          <ExternalLink size={12} />
        </a>
      </div>

      {/* ── Fees pending ───────────────────────────────────────────────── */}
      {hasFees && (
        <div style={{
          borderTop: '1px solid rgba(45,212,160,0.18)',
          paddingTop: 10, marginTop: 10,
          fontSize: 12, color: '#2dd4a0',
        }}>
          Pending fees:{' '}
          {formatTokenAmount(pos.tokensOwed0, pos.decimals0)} /{' '}
          {formatTokenAmount(pos.tokensOwed1, pos.decimals1)} (token0/token1)
        </div>
      )}
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
const POSITION_MANAGER = '0xC61608f54EEFf2b229e3a4858236e47f2701a80f'

export function V3PositionsPage() {
  const chainId = useChainId()
  const addrs = getV3Addresses(chainId ?? 0)
  const positionManager = addrs?.v3PositionManager ?? POSITION_MANAGER
  const { address, isConnected } = useArcWallet()
  const isWrongChain = chainId != null && chainId !== ARCDEX.chainId
  const configError = getV3ConfigError(chainId ?? 0)
  const { positions, loading, error, refetch } = useV3Positions(
    !!address && isConnected && !isWrongChain && !configError
  )

  // ── Error states ─────────────────────────────────────────────────────────
  if (isWrongChain) {
    return (
      <div style={{ ...alertGlass(245, 158, 11), color: '#fbbf24', fontSize: 14 }}>
        Connect to <strong>Arc Testnet</strong> to view your V3 positions.
      </div>
    )
  }

  if (configError) {
    return (
      <div style={{ ...alertGlass(239, 68, 68), color: '#f87171', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertCircle size={18} style={{ flexShrink: 0 }} />
        {configError} V3 actions disabled.
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div style={{ ...glassCard, textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <motion.div
            animate={{
              boxShadow: [
                '0 0 0 0 rgba(78,163,255,0)',
                '0 0 0 14px rgba(78,163,255,0.14)',
                '0 0 0 0 rgba(78,163,255,0)',
              ],
            }}
            transition={{ duration: 2.5, repeat: Infinity }}
            style={{
              padding: 16, borderRadius: '50%',
              background: 'rgba(78,163,255,0.1)',
              border: '1px solid rgba(78,163,255,0.28)',
              color: '#4ea3ff',
              display: 'inline-flex',
            }}
          >
            <Wallet size={32} />
          </motion.div>
        </div>
        <h2 style={{ color: '#f0f4ff', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          Connect your wallet
        </h2>
        <p style={{ color: '#475569', fontSize: 14 }}>
          Connect to view and manage your V3 NFT positions.
        </p>
      </div>
    )
  }

  // ── Main view ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700 }}>Your V3 Positions</h2>
        <div className="flex items-center gap-2">
          <AddV3LiquidityCard onMintSuccess={refetch} />
          <button
            onClick={refetch}
            disabled={loading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600,
              background: 'rgba(78,163,255,0.07)',
              border: '1px solid rgba(78,163,255,0.2)',
              color: loading ? 'rgba(78,163,255,0.4)' : '#4ea3ff',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = 'rgba(78,163,255,0.14)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(78,163,255,0.07)' }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Runtime error */}
      {error && (
        <div style={{
          ...alertGlass(239, 68, 68),
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <AlertCircle size={18} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
          <span style={{ color: '#fca5a5', fontSize: 14 }}>{error}</span>
        </div>
      )}

      {/* Skeletons */}
      {loading && (
        <div className="space-y-4">
          {[1, 2].map((i) => <PoolCardSkeleton key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && positions.length === 0 && !error && (
        <div style={{ ...glassCard, textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ color: '#64748b', marginBottom: 14, fontSize: 15 }}>
            You don't have any V3 positions yet.
          </p>
          <p style={{ color: '#374151', fontSize: 13, marginBottom: 24 }}>
            Add liquidity to a V3 pool to create an NFT position.
          </p>
          <AddV3LiquidityCard onMintSuccess={refetch} />
          <div style={{ marginTop: 16 }}>
            <a
              href={`${ARCDEX.explorer}/address/${positionManager}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 13, color: '#4ea3ff', textDecoration: 'none',
              }}
            >
              View Position Manager on explorer
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      )}

      {/* Position cards */}
      {!loading && positions.length > 0 && (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {positions.map((pos) => (
            <PositionCard
              key={pos.tokenId.toString()}
              pos={pos}
              positionManager={positionManager}
            />
          ))}
        </motion.div>
      )}
    </div>
  )
}
