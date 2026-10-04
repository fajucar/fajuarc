import { useState, useEffect, useRef } from 'react'
import { useAccount, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { Zap, Loader2, CheckCircle2 } from 'lucide-react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { arcTestnet } from '@/config/chains'
import { CONSTANTS } from '@/config/constants'
import { GmRain } from '@/components/GmRain'

// USDC ERC-20 ABI - only transfer function needed
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

export function GMButton() {
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const [isProcessing, setIsProcessing] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const [rainOn, setRainOn] = useState(false)
  
  const { writeContractAsync: _arcWrite, isPending, error } = useArcWriteContract()
  const [writeHash, setWriteHash] = useState<`0x${string}` | undefined>()
  const writeContractAsync = async (params: any) => { const h = await _arcWrite(params); setWriteHash(h); return h }
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: writeHash,
    query: { enabled: !!writeHash },
  })

  // Show success feedback when transaction is confirmed
  useEffect(() => {
    if (isSuccess && writeHash) {
      setIsProcessing(false)
      toast.success('GM confirmed', {
        duration: 4000,
      })
      console.log('[GMButton] ✅ Transaction confirmed! Hash:', writeHash)
      setRainOn(true)
    }
  }, [isSuccess, writeHash])

  // Handle errors
  useEffect(() => {
    if (error) {
      setIsProcessing(false)
      const errorMessage = error.message || 'Unknown error'
      
      if (errorMessage.includes('User rejected') || errorMessage.includes('denied') || errorMessage.includes('rejected')) {
        toast.error('GM cancelled', {
          duration: 3000,
          icon: '❌',
        })
      } else {
        toast.error('GM failed', {
          duration: 3000,
          icon: '❌',
        })
        console.error('[GMButton] Transaction error:', error)
      }
    }
  }, [error])

  const handleGM = async () => {
    try {
      // Check if wallet is connected
      if (!isConnected) {
        toast.error('Please connect your wallet first', {
          duration: 3000,
        })
        return
      }

      // Check if address is valid
      if (!address) {
        toast.error('Wallet address not found', {
          duration: 3000,
        })
        return
      }

      // Validate address is not zero address
      if (address === '0x0000000000000000000000000000000000000000' || address.toLowerCase() === '0x0000000000000000000000000000000000000000') {
        toast.error('Invalid wallet address', {
          duration: 3000,
        })
        return
      }

      // Check if USDC contract address is configured
      if (!CONSTANTS.USDC_ADDRESS || CONSTANTS.USDC_ADDRESS === '0x0000000000000000000000000000000000000000') {
        toast.error('USDC contract address not configured', {
          duration: 3000,
        })
        console.error('[GMButton] USDC_ADDRESS not configured')
        return
      }

      // Check if on correct network
      if (chain?.id !== arcTestnet.id) {
        toast.error('Please switch to Arc Testnet', {
          duration: 3000,
        })
        try {
          await switchChain({ chainId: arcTestnet.id })
        } catch (err) {
          console.error('[GMButton] Failed to switch chain:', err)
        }
        return
      }

      setIsProcessing(true)

      // Send GM as USDC ERC-20 transfer: transfer(address to, uint256 amount)
      // to = own address, amount = 0 (zero USDC transfer to self)
      // This works correctly with Arc's USDC-native gas model
      await writeContractAsync({
        address: CONSTANTS.USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [address, BigInt(0)], // Transfer 0 USDC to self
      })

      console.log('[GMButton] ✅ Transaction sent! Waiting for confirmation...')
    } catch (err: any) {
      setIsProcessing(false)
      console.error('[GMButton] Error in handleGM:', err)
      
      const errorMessage = err?.message || err?.shortMessage || 'Failed to send GM'
      if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('User rejected')) {
        toast.error('GM cancelled', {
          duration: 3000,
          icon: '❌',
        })
      } else {
        toast.error('GM failed', {
          duration: 3000,
          icon: '❌',
        })
      }
    }
  }

  const isLoading = isPending || isConfirming || isProcessing

  return (
    <>
      <motion.button
        ref={btnRef}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleGM}
        disabled={isLoading || !isConnected}
        className="relative flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 font-bold text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{isPending ? 'Confirm in wallet...' : 'Confirming...'}</span>
          </>
        ) : isSuccess ? (
          <>
            <CheckCircle2 className="h-5 w-5" />
            <span>GM Sent!</span>
          </>
        ) : (
          <>
            <Zap className="h-5 w-5" />
            <span>Send GM</span>
          </>
        )}
      </motion.button>
      <GmRain
        show={rainOn}
        onDone={() => setRainOn(false)}
        durationMs={3000}
        count={48}
      />
    </>
  )
}
