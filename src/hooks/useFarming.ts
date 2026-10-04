/**
 * useFarming — data for LP staking (FajuFarm)
 */

import { useState, useEffect, useCallback } from 'react'
import { usePublicClient } from 'wagmi'
import { formatUnits } from 'viem'
import { FAJU_FARM_ADDRESS, getPoolId, isFarmingEnabled } from '@/config/farming'
import FajuFarmAbi from '@/abis/FajuFarm.json'

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
] as const

export type FarmingData = {
  lpBalance: string
  lpBalanceFormatted: string
  stakedAmount: string
  stakedFormatted: string
  pendingRewards: string
  pendingFormatted: string
  rewardPerSecond: string
  poolLpTotal: string
  aprEstimate: string | null
}

export function useFarming(
  pairAddress: string,
  lpDecimals: number,
  address: string | undefined,
  enabled: boolean
): { data: FarmingData | null; loading: boolean; refetch: () => void } {
  const publicClient = usePublicClient()
  const [data, setData] = useState<FarmingData | null>(null)
  const [loading, setLoading] = useState(true)

  const pid = getPoolId(pairAddress)
  const canFetch = isFarmingEnabled && pid !== null && publicClient && address && enabled

  const fetchData = useCallback(async () => {
    if (!canFetch || !publicClient || !address) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [userInfo, pending, rewardPerSec, lpBalance, poolLpTotal] = await Promise.all([
        publicClient.readContract({
          address: FAJU_FARM_ADDRESS,
          abi: FajuFarmAbi as readonly unknown[],
          functionName: 'userInfo',
          args: [BigInt(pid!), address as `0x${string}`],
        }) as Promise<readonly [bigint, bigint]>,
        publicClient.readContract({
          address: FAJU_FARM_ADDRESS,
          abi: FajuFarmAbi as readonly unknown[],
          functionName: 'pendingRewards',
          args: [BigInt(pid!), address as `0x${string}`],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: FAJU_FARM_ADDRESS,
          abi: FajuFarmAbi as readonly unknown[],
          functionName: 'rewardPerSecond',
        }) as Promise<bigint>,
        publicClient.readContract({
          address: pairAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        }) as Promise<bigint>,
        (async () => {
          const poolInfo = await publicClient.readContract({
            address: FAJU_FARM_ADDRESS,
            abi: FajuFarmAbi as readonly unknown[],
            functionName: 'poolInfo',
            args: [BigInt(pid!)],
          }) as readonly [string, bigint, bigint, bigint]
          const lpToken = poolInfo[0]
          return publicClient.readContract({
            address: lpToken as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [FAJU_FARM_ADDRESS],
          }) as Promise<bigint>
        })(),
      ])

      const staked = userInfo[0]
      const pendingRewards = pending
      const stakedFormatted = formatUnits(staked, lpDecimals)
      const pendingFormatted = formatUnits(pendingRewards, 18) // FAJU 18 dec
      const lpBalanceFormatted = formatUnits(lpBalance, lpDecimals)

      let aprEstimate: string | null = null
      if (poolLpTotal > 0n && rewardPerSec > 0n) {
        const secondsPerYear = 365 * 24 * 60 * 60
        const rewardsPerYear = Number(rewardPerSec) * secondsPerYear / 1e18
        const tvl = Number(poolLpTotal) / Math.pow(10, lpDecimals)
        if (tvl > 0) {
          const rewardPrice = 1 // fallback: assume 1 USD per FAJU
          const apr = (rewardsPerYear * rewardPrice / tvl) * 100
          aprEstimate = apr.toFixed(1) + '% (approx)'
        }
      }

      setData({
        lpBalance: lpBalance.toString(),
        lpBalanceFormatted,
        stakedAmount: staked.toString(),
        stakedFormatted,
        pendingRewards: pendingRewards.toString(),
        pendingFormatted,
        rewardPerSecond: rewardPerSec.toString(),
        poolLpTotal: poolLpTotal.toString(),
        aprEstimate,
      })
    } catch (err) {
      console.warn('[useFarming]', err)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [canFetch, pid, pairAddress, address, publicClient, lpDecimals])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading: canFetch ? loading : false, refetch: fetchData }
}
