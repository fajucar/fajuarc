import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { CircleAgentStack } from '@/components/Agents/CircleAgentStack'
import { SocialPaymentIllustration } from './SocialPaymentIllustration'
import { ExternalLink } from 'lucide-react'
import { CONSTANTS } from '@/config/constants'

const QUICK_LINKS = [
  { href: CONSTANTS.LINKS.docs, label: 'Docs' },
  { href: CONSTANTS.LINKS.explorer, label: 'Explorer' },
  { href: CONSTANTS.LINKS.github, label: 'GitHub' },
] as const


export function Hero() {
  const { t } = useTranslation()
  return (
    <div className="relative overflow-hidden">

      {/* Background */}
      <div className="absolute inset-0 z-0 pointer-events-none select-none">
        <div className="absolute inset-0 bg-transparent" />
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: 'radial-gradient(circle, #334155 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-cyan-500/8 blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] rounded-full bg-blue-600/6 blur-[140px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-purple-600/5 blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-6 lg:px-12 xl:px-20 pt-8 pb-20">

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.8fr] gap-10 lg:gap-20 lg:items-start">

          {/* Left */}
          <div className="relative z-20 flex flex-col gap-5 text-center">

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex justify-center"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/8 px-4 py-1.5 backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                </span>
                <span className="text-xs font-medium text-cyan-300 tracking-wide">{t('hero.live')}</span>
              </div>
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="font-display text-5xl md:text-6xl xl:text-7xl font-extrabold leading-[1.05] tracking-tight"
            >
              <span className="text-white">{t('hero.titleLine1')}</span>
              <br />
              <span className="bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-400 bg-clip-text text-transparent"
                style={{ WebkitBackgroundClip: 'text' }}>
                {t('hero.titleLine2')}
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-slate-300 text-lg md:text-xl italic leading-relaxed max-w-md mx-auto"
            >
              {t('hero.subtitle')}
            </motion.p>

            {/* Bottom section — illustration + links pushed to bottom */}
            <div className="flex flex-col gap-4 items-center">

            {/* Social payment illustration */}
            <SocialPaymentIllustration />

            {/* Quick links — same pill style */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.45 }}
              className="relative z-20 flex flex-wrap gap-2 justify-center w-full"
            >
              {QUICK_LINKS.map(({ href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-300 font-medium hover:border-cyan-500/40 hover:text-white transition-all"
                >
                  <ExternalLink className="h-3 w-3 text-cyan-400" />
                  {label}
                </a>
              ))}
            </motion.div>
            </div>
          </div>

          {/* Right */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative z-10 w-full"
          >
            <CircleAgentStack />
          </motion.div>
        </div>

        {/* Bottom divider */}
        <div className="mt-12 flex items-center gap-4">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent" />
          <span className="text-[11px] text-slate-600 font-medium tracking-widest uppercase">
            {t('hero.poweredBy')}
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent" />
        </div>
      </div>
    </div>
  )
}
