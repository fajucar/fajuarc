import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'

export function BridgeTab() {
  const handleOpenOfficialBridge = () => {
    window.open('https://testnet.bridge.arc.network', '_blank', 'noopener,noreferrer')
    toast('Opening Arc Bridge...', {
      icon: '🌉',
      duration: 3000,
    })
  }

  return (
    <div className="max-w-md mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-8 text-center space-y-6"
      >
        {/* Icon */}
        <div className="text-6xl">🌉</div>

        {/* Title */}
        <div>
          <h3 className="text-xl font-semibold text-white mb-2">Bridge coming soon</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            We're integrating the official Arc bridge. In the meantime, use the official bridge:
          </p>
        </div>

        {/* Button */}
        <motion.button
          onClick={handleOpenOfficialBridge}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 px-6 text-sm font-bold bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white hover:opacity-90 transition-all shadow-lg shadow-purple-500/20"
        >
          <span>Open Arc Bridge</span>
          <ExternalLink className="h-4 w-4" />
        </motion.button>

        {/* Additional info */}
        <div className="text-xs text-slate-500 pt-2 border-t border-slate-700/50">
          Bridge USDC between Arc Testnet and Ethereum Sepolia
        </div>
      </motion.div>
    </div>
  )
}