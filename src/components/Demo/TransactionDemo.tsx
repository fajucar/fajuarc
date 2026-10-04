import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, isAddress } from 'viem'
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { CONSTANTS } from '@/config/constants'
import { useGasPrice } from '@/hooks/useGasPrice'

// ABI mínimo do USDC (apenas transfer)
const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export function TransactionDemo() {
  const { isConnected } = useAccount()
  const { data: gasPrice } = useGasPrice()
  
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  
  const { writeContract, data: hash, error, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const handleSend = async () => {
    if (!isAddress(recipient)) {
      toast.error('Invalid recipient address')
      return
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Invalid amount')
      return
    }

    if (!CONSTANTS.USDC_ADDRESS || CONSTANTS.USDC_ADDRESS === '0x0000000000000000000000000000000000000000') {
      toast.error('USDC contract address not configured')
      return
    }

    try {
      writeContract({
        address: CONSTANTS.USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, parseUnits(amount, 6)],
      })
      toast.success('Transaction sent!')
    } catch (err: any) {
      toast.error(err.message || 'Transaction failed')
    }
  }

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Connect your wallet to try the demo</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      <div className="rounded-2xl border border-cyan-500/25 bg-slate-900/50 backdrop-blur-xl p-4">
        <h3 className="text-lg font-bold mb-3">Send USDC</h3>

        {/* Form */}
        <div className="space-y-2">
          {/* Recipient */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Recipient Address
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Amount (USDC)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
            />
          </div>

          {/* Gas Estimate */}
          <div className="rounded-lg bg-slate-800/50 p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-400">Estimated Gas</span>
              <span className="font-mono text-sm">{gasPrice?.formatted || '...'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Finality Time</span>
              <span className="font-mono text-sm text-cyan-400">{'< 1 second'}</span>
            </div>
          </div>

          {/* Comparison */}
          <div className="rounded-lg border border-yellow-500/25 bg-yellow-500/5 p-4">
            <p className="text-xs text-yellow-200/80">
              💡 <strong>Comparison:</strong> On Ethereum, this would take 12-15 minutes 
              and cost ~$5-20 in ETH (volatile). On Arc: instant + predictable USDC fees.
            </p>
          </div>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={isPending || isConfirming || !recipient || !amount}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 font-semibold text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isPending || isConfirming ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {isPending ? 'Confirm in wallet...' : 'Confirming...'}
              </>
            ) : isSuccess ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                Transaction Confirmed!
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                Send Transaction
              </>
            )}
          </button>

          {/* Status Messages */}
          {error && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-3 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error.message}</p>
            </div>
          )}

          {hash && (
            <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-3">
              <p className="text-sm text-cyan-400 mb-1">Transaction Hash:</p>
              <a
                href={`${CONSTANTS.LINKS.explorer}/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-cyan-300 hover:underline break-all"
              >
                {hash}
              </a>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

