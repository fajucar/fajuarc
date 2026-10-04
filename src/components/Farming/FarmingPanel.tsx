/*
  FarmingPanel — Stake / Unstake / Claim UI for FajuFarm
  Animations: FASE 3 (microinterações) — skeleton, hover/tap, transição de formulário
*/

import { useState } from 'react'
import { Loader2, TrendingUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePublicClient, useWaitForTransactionReceipt } from 'wagmi'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { useArcWallet } from '@/hooks/useArcWallet'
import { parseUnits } from 'viem'
import { toast } from 'react-hot-toast'
import { useFarming } from '@/hooks/useFarming'
import { ensureAllowance } from '@/lib/allowance'
import { FAJU_FARM_ADDRESS, getPoolId, isFarmingEnabled } from '@/config/farming'
import FajuFarmAbi from '@/abis/FajuFarm.json'
import { formatMoney } from '@/lib/format'
import { FarmingSkeleton } from '@/components/ui/Skeleton'
import { MotionButton } from '@/components/ui/MotionButton'
import { TxStepper, type TxStep } from '@/components/ui/TxStepper'
import { fadeInUp, MOTION } from '@/lib/motion'

type Props = {
  pairAddress: string
  token0Symbol: string
  token1Symbol: string
  lpDecimals: number
  onSuccess?: () => void
}

export function FarmingPanel({ pairAddress, token0Symbol, token1Symbol, lpDecimals, onSuccess }: Props) {
  const { address } = useArcWallet()
  const publicClient = usePublicClient()
  const { writeContractAsync: _arcWrite, isPending } = useArcWriteContract()
  const [writeHash, setWriteHash] = useState<`0x${string}` | undefined>()
  const writeContractAsync = async (params: any) => { const h = await _arcWrite(params); setWriteHash(h); return h }
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: writeHash, query: { enabled: !!writeHash } })
  const [stakeAmount, setStakeAmount] = useState('')
  const [unstakeAmount, setUnstakeAmount] = useState('')
  const [action, setAction] = useState<'stake' | 'unstake' | 'claim' | null>(null)

  const pid = getPoolId(pairAddress)
  const { data: farming, loading, refetch } = useFarming(pairAddress, lpDecimals, address ?? undefined, true)

  if (!isFarmingEnabled || pid === null) {
    return null
  }

  if (loading && !farming) {
    return <FarmingSkeleton />
  }

  const handleStake = async () => {
    if (!address || !publicClient || !stakeAmount || parseFloat(stakeAmount) <= 0) return
    const amountWei = parseUnits(stakeAmount, lpDecimals)
    const writeOpts = (opts: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: unknown[] }) =>
      writeContractAsync({ address: opts.address, abi: opts.abi, functionName: opts.functionName, args: opts.args })
    try {
      await ensureAllowance(publicClient, writeOpts, pairAddress as `0x${string}`, address, FAJU_FARM_ADDRESS, amountWei)
      const txHash = await writeContractAsync({
        address: FAJU_FARM_ADDRESS,
        abi: FajuFarmAbi as readonly unknown[],
        functionName: 'deposit',
        args: [BigInt(pid!), amountWei],
      })
      await publicClient!.waitForTransactionReceipt({ hash: txHash })
      toast.success('LP staked')
      setStakeAmount('')
      setAction(null)
      refetch()
      onSuccess?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Stake failed')
    }
  }

  const handleUnstake = async () => {
    if (!address || !publicClient || !unstakeAmount || parseFloat(unstakeAmount) <= 0) return
    const amountWei = parseUnits(unstakeAmount, lpDecimals)
    try {
      const txHash = await writeContractAsync({
        address: FAJU_FARM_ADDRESS,
        abi: FajuFarmAbi as readonly unknown[],
        functionName: 'withdraw',
        args: [BigInt(pid!), amountWei],
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      toast.success('LP unstaked')
      setUnstakeAmount('')
      setAction(null)
      refetch()
      onSuccess?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unstake failed')
    }
  }

  const handleClaim = async () => {
    if (!address || !publicClient) return
    try {
      const txHash = await writeContractAsync({
        address: FAJU_FARM_ADDRESS,
        abi: FajuFarmAbi as readonly unknown[],
        functionName: 'harvest',
        args: [BigInt(pid!)],
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      toast.success('Rewards claimed')
      refetch()
      onSuccess?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Claim failed')
    }
  }

  const isLoading = isPending || isConfirming
  const txStep: TxStep = isSuccess ? 'success' : isConfirming ? 'pending' : isPending ? 'confirm' : 'approve'

  return (
    <motion.div
      {...fadeInUp}
      className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 space-y-4"
    >
      <div className="flex items-center gap-2 text-cyan-400">
        <TrendingUp className="h-5 w-5" />
        <span className="font-semibold">Farm {token0Symbol}/{token1Symbol}</span>
      </div>
      {(isLoading || isSuccess) && (
        <TxStepper currentStep={txStep} className="mb-3 py-2" />
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-slate-400">LP Balance</div>
          <div className="font-medium text-white">{formatMoney(farming?.lpBalanceFormatted ?? '0', 4)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Staked</div>
          <div className="font-medium text-white">{formatMoney(farming?.stakedFormatted ?? '0', 4)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Pending FAJU</div>
          <div className="font-medium text-cyan-400">{formatMoney(farming?.pendingFormatted ?? '0', 4)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">APR</div>
          <div className="font-medium text-slate-300">{farming?.aprEstimate ?? 'N/A'}</div>
        </div>
      </div>
      <AnimatePresence mode="wait">
        {!action ? (
          <motion.div
            key="actions"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION.duration.normal }}
            className="flex flex-wrap gap-2"
          >
            <MotionButton variant="primary" onClick={() => setAction('stake')}>
              Stake
            </MotionButton>
            <MotionButton
              variant="secondary"
              onClick={() => setAction('unstake')}
              disabled={!farming || parseFloat(farming.stakedFormatted) <= 0}
            >
              Unstake
            </MotionButton>
            <MotionButton
              variant="secondary"
              onClick={handleClaim}
              disabled={!farming || parseFloat(farming.pendingFormatted) <= 0 || isLoading}
              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Claim'}
            </MotionButton>
          </motion.div>
        ) : action === 'stake' ? (
          <motion.div
            key="stake"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: MOTION.duration.normal }}
            className="space-y-2"
          >
            <input
              type="number"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              placeholder="Amount to stake"
              className="w-full bg-slate-800/60 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-colors duration-200"
            />
            <button onClick={() => setStakeAmount(farming?.lpBalanceFormatted ?? '')} className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">Max</button>
            <div className="flex gap-2">
              <MotionButton variant="ghost" onClick={() => setAction(null)} className="px-3 py-2 rounded-lg text-slate-400">
                Cancel
              </MotionButton>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStake}
                disabled={isLoading || !stakeAmount || parseFloat(stakeAmount) <= 0}
                className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Stake'}
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="unstake"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: MOTION.duration.normal }}
            className="space-y-2"
          >
            <input
              type="number"
              value={unstakeAmount}
              onChange={(e) => setUnstakeAmount(e.target.value)}
              placeholder="Amount to unstake"
              className="w-full bg-slate-800/60 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-colors duration-200"
            />
            <button onClick={() => setUnstakeAmount(farming?.stakedFormatted ?? '')} className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">Max</button>
            <div className="flex gap-2">
              <MotionButton variant="ghost" onClick={() => setAction(null)} className="px-3 py-2 rounded-lg text-slate-400">
                Cancel
              </MotionButton>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleUnstake}
                disabled={isLoading || !unstakeAmount || parseFloat(unstakeAmount) <= 0}
                className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Unstake'}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
