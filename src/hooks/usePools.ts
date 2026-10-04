/*
  DEX architecture hooks — separation of concerns:
  - useAllPools(): Market overview — pair data from contracts (no user wallet)
  - useUserPositions(address): User LP positions only (requires wallet)
*/

import { useState, useEffect, useCallback } from 'react'
import { usePublicClient } from 'wagmi'
import { readPairState, getUserPools, getPairAddress, type PairState, type UserPoolPosition } from '@/lib/arcDexRead'
import { ARCDEX } from '@/config/arcDex'
import type { Address } from 'viem'

/** Pool info for market overview (no user data) */
export interface PoolMarketInfo {
  pairAddress: Address
  token0: PairState['token0']
  token1: PairState['token1']
  pairName: string
  feeTier: string
  tvlDisplay: string
  reserve0Formatted: string
  reserve1Formatted: string
  totalSupplyFormatted: string
  apr: string
  volume: string
}

const FEE_TIER = '0.30%'

const ZERO = '0x0000000000000000000000000000000000000000' as Address

/** Returns list of available liquidity pairs (market data only, no user wallet) */
export function useAllPools(isWrongChain: boolean) {
  const publicClient = usePublicClient()
  const [pools, setPools] = useState<PoolMarketInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!publicClient || isWrongChain) {
      setPools([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const discovered: PoolMarketInfo[] = []
      for (const [tokenA, tokenB] of ARCDEX.pairsToDiscover) {
        try {
          const pairAddr = await getPairAddress(tokenA, tokenB, publicClient)
          if (!pairAddr || pairAddr === ZERO) continue
          const state = await readPairState(pairAddr, publicClient)
          const tvlDisplay = `${state.reserve0Formatted} ${state.token0.symbol} + ${state.reserve1Formatted} ${state.token1.symbol}`
          discovered.push({
            pairAddress: state.pairAddress,
            token0: state.token0,
            token1: state.token1,
            pairName: `${state.token0.symbol} / ${state.token1.symbol}`,
            feeTier: FEE_TIER,
            tvlDisplay,
            reserve0Formatted: state.reserve0Formatted,
            reserve1Formatted: state.reserve1Formatted,
            totalSupplyFormatted: state.totalSupplyFormatted,
            apr: '-',
            volume: '-',
          })
        } catch {
          continue
        }
      }
      // Fallback: if no pairs discovered, try USDC/EURC legacy
      if (discovered.length === 0) {
        try {
          const state = await readPairState(undefined, publicClient)
          const tvlDisplay = `${state.reserve0Formatted} ${state.token0.symbol} + ${state.reserve1Formatted} ${state.token1.symbol}`
          discovered.push({
            pairAddress: state.pairAddress,
            token0: state.token0,
            token1: state.token1,
            pairName: `${state.token0.symbol} / ${state.token1.symbol}`,
            feeTier: FEE_TIER,
            tvlDisplay,
            reserve0Formatted: state.reserve0Formatted,
            reserve1Formatted: state.reserve1Formatted,
            totalSupplyFormatted: state.totalSupplyFormatted,
            apr: '-',
            volume: '-',
          })
        } catch (fallbackErr: unknown) {
          setError(fallbackErr instanceof Error ? fallbackErr.message : 'Failed to load pools')
        }
      }
      setPools(discovered)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load pools')
      setPools([])
    } finally {
      setLoading(false)
    }
  }, [publicClient, isWrongChain])

  useEffect(() => {
    load()
  }, [load])

  return { pools, loading, error, refetch: load }
}

/** Returns user LP positions only (pools where user has LP balance > 0) */
export function useUserPositions(address: Address | undefined, isConnected: boolean, isWrongChain: boolean) {
  const publicClient = usePublicClient()
  const [positions, setPositions] = useState<UserPoolPosition[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!address || !publicClient || !isConnected || isWrongChain) {
      setPositions([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const userPools = await getUserPools(address, publicClient)
      setPositions(userPools)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load positions')
      setPositions([])
    } finally {
      setLoading(false)
    }
  }, [address, publicClient, isConnected, isWrongChain])

  useEffect(() => {
    load()
  }, [load])

  return { positions, loading, error, refetch: load }
}
