import { useState, useEffect, type ComponentType } from 'react'
import { Menu, X, ArrowLeftRight, Waves, Home, Wallet, Bot } from 'lucide-react'
import { NavLink, Link } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { useTranslation } from 'react-i18next'
import { ConnectButton } from '@/components/Web3/ConnectButton'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/contexts/ThemeContext'

const navItems = [
  { to: '/', icon: Home, labelKey: 'nav.home' },
  { to: '/agents', icon: Bot, labelKey: 'nav.agents' },
  { to: '/swap', icon: ArrowLeftRight, labelKey: 'nav.swap' },
  { to: '/pools', icon: Waves, labelKey: 'nav.pools' },
  { to: '/my-pools', icon: Wallet, labelKey: 'nav.myPools' },
] as const

const mobileNavBaseClass =
  'flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition-all duration-200 ease-out'

const mobileNavInactiveClass =
  'text-slate-300 hover:bg-slate-800/50 hover:text-white hover:shadow-sm hover:shadow-slate-950/30'

const mobileNavActiveClass =
  'border border-fuchsia-500/30 bg-gradient-to-r from-fuchsia-500/12 via-purple-500/10 to-blue-500/12 text-fuchsia-100 shadow-[0_0_18px_rgba(217,70,239,0.14)] backdrop-blur-sm hover:brightness-110'

function getNavItemClass(isActive: boolean, variant: 'desktop' | 'mobile') {
  if (variant === 'mobile') {
    return `${mobileNavBaseClass} ${isActive ? mobileNavActiveClass : mobileNavInactiveClass}`
  }

  return `navbar-tab${isActive ? ' active' : ''}`
}

function NavItem({ to, icon: Icon, label }: { to: string; icon: ComponentType<{ className?: string }>; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => getNavItemClass(isActive, 'desktop')}
    >
      <Icon className="h-4 w-4 shrink-0 inline-block mr-1.5 align-text-bottom" />
      <span>{label}</span>
    </NavLink>
  )
}

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { authenticated, user } = usePrivy()
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    if (authenticated && user) {
      const identity =
        user?.google?.email ||
        user?.discord?.email ||
        user?.twitter?.username ||
        (user?.linkedAccounts?.find((a: any) => a.type === 'google_oauth') as any)?.email ||
        (user?.linkedAccounts?.find((a: any) => a.type === 'discord_oauth') as any)?.email ||
        (user?.linkedAccounts?.find((a: any) => a.type === 'twitter_oauth') as any)?.username ||
        'Connected'
      console.log('[Header] User authenticated:', identity)
    }
  }, [authenticated, user])

  return (
    <header>
      <nav className="navbar-glass mx-auto max-w-7xl">
        {/* Logo / Brand */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-semibold text-sm">
            A
          </div>
          <span className="navbar-logo">FajuARC</span>
        </Link>

        {/* Desktop Nav */}
        <div className="navbar-tabs">
          {navItems.map((item) => (
            <NavItem key={item.to} to={item.to} icon={item.icon} label={t(item.labelKey)} />
          ))}
        </div>

        {/* Right: Network Badge + Theme Toggle + Wallet */}
        <div className="hidden md:flex items-center gap-3">
          <div className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-400 bg-slate-800/60 border border-slate-700/60">
            Arc Mainnet
          </div>
          <button type="button" className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark-purple' ? '⬛ Black' : '🟣 Purple'}
          </button>
          <div className="relative">
            <ConnectButton />
          </div>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden rounded-lg p-2 hover:bg-slate-800/60 transition-colors"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="border-t border-slate-800/60 bg-[#0b1220]/98 backdrop-blur-xl md:hidden"
          >
            <div className="px-4 py-4 space-y-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-400 bg-slate-800/60 border border-slate-700/60 w-fit">
                  Arc Mainnet
                </div>
                <button type="button" className="theme-toggle" onClick={toggleTheme}>
                  {theme === 'dark-purple' ? '⬛ Black' : '🟣 Purple'}
                </button>
              </div>
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => getNavItemClass(isActive, 'mobile')}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{t(item.labelKey)}</span>
                </NavLink>
              ))}
              <div className="pt-4 border-t border-slate-800">
                <ConnectButton />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
