import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CONSTANTS } from '@/config/constants'

const footerLinks = [
  { label: 'Docs', href: CONSTANTS.LINKS.docs },
  { label: 'Arc Explorer', href: CONSTANTS.LINKS.explorer },
  { label: 'GitHub', href: CONSTANTS.LINKS.github },
]

export function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="border-t border-slate-800/60 bg-[#0b1220]/50 py-8 mt-auto">
      <div className="mx-auto max-w-7xl px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="font-semibold text-white">FajuARC</span>
          <span>{t('footer.copyright')}</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline text-cyan-400/80">{t('footer.runningOn')}</span>
        </div>
        <div className="flex items-center gap-6">
          {footerLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-cyan-400 transition-colors duration-300"
            >
              {link.label}
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
