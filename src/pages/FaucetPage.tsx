import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/Layout/AppShell'
import { FaucetPanel } from '@/components/Faucet'

export function FaucetPage() {
  const { t } = useTranslation()
  return (
    <>
      <Helmet>
        <title>Faucet - FajuARC</title>
        <meta name="description" content={t('faucet.metaDescription')} />
      </Helmet>
      <AppShell
        title="Faucet"
        subtitle={t('faucet.subtitle')}
        titleClassName="text-xl md:text-2xl font-semibold tracking-tight"
        maxWidth="2xl"
      >
        <div className="mb-4">
          <Link to="/swap" className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors">
            {t('faucet.backToSwap')}
          </Link>
        </div>
        <FaucetPanel variant="normal" />
      </AppShell>
    </>
  )
}
