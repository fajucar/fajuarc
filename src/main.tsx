import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WagmiProvider } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { HelmetProvider } from 'react-helmet-async'
import { PrivyProvider } from '@privy-io/react-auth'
import { config } from './config/wagmi'
import { PRIVY_APP_ID, privyConfig } from './config/privy'
import { WalletModalProvider } from './contexts/WalletModalContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import App from './App'
import { PrivyEmbeddedWalletBootstrapper } from './components/Web3/PrivyEmbeddedWalletBootstrapper'
import { OAuthCallbackHandler } from './components/Web3/OAuthCallbackHandler'
import './i18n/config'
import './styles/tokens.css'
import './styles/glass.css'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
})

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderErrorUI(message: string, detail?: string) {
  const root = document.getElementById('root')
  if (!root) return
  const safeMsg = escapeHtml(message)
  const safeDetail = detail ? escapeHtml(detail) : ''
  root.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-center; background: #020617; color: #f8fafc; font-family: system-ui; padding: 1.5rem;">
      <div style="text-align: center; max-width: 28rem;">
        <h1 style="font-size: 1.25rem; margin-bottom: 0.75rem; color: #f1f5f9;">Something went wrong</h1>
        <p style="color: #94a3b8; font-size: 0.875rem; margin-bottom: 1rem;">${safeMsg}</p>
        ${safeDetail ? `<pre style="text-align: left; background: #0f172a; padding: 1rem; border-radius: 0.5rem; font-size: 0.75rem; color: #cbd5e1; overflow: auto;">${safeDetail}</pre>` : ''}
        <button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #06b6d4; color: #0f172a; border: none; border-radius: 0.5rem; font-weight: 600; cursor: pointer;">Reload page</button>
      </div>
    </div>
  `
}

// Prevent "Cannot set property ethereum" conflicts between MetaMask/Rabby and Privy.
// If window.ethereum is already defined as non-writable/non-configurable by an extension,
// redefine it as configurable so subsequent providers don't throw.
try {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'ethereum')
  if (descriptor && (!descriptor.configurable || !descriptor.writable)) {
    Object.defineProperty(window, 'ethereum', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: (window as any).ethereum,
    })
  }
} catch {
  // Property truly cannot be redefined — extensions will coexist as-is
}

// Safe root element access - never throws
const rootElement = document.getElementById('root')
if (!rootElement) {
  document.body.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-center; background: #020617; color: #f8fafc; font-family: system-ui;">
      <div style="text-align: center; padding: 2rem;">
        <h1 style="font-size: 1.5rem; margin-bottom: 1rem;">Critical error</h1>
        <p style="color: #94a3b8;">Root element not found. Please ensure the HTML contains &lt;div id="root"&gt;&lt;/div&gt;</p>
      </div>
    </div>
  `
} else {
  try {
    // PRIVY_APP_ID is now hardcoded in privy.ts — env var is ignored
    const privyAppId = PRIVY_APP_ID

    createRoot(rootElement).render(
      <StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
        <BrowserRouter>
          <HelmetProvider>
            <ErrorBoundary>
              <PrivyProvider appId={privyAppId} config={privyConfig}>
                <QueryClientProvider client={queryClient}>
                  <WagmiProvider config={config}>
                    <WalletModalProvider>
                      <OAuthCallbackHandler />
                      <PrivyEmbeddedWalletBootstrapper />
                      <App />
                      <Toaster
                        position="top-right"
                        toastOptions={{
                          className: '',
                          style: {
                            background: '#0f172a',
                            color: '#fff',
                            border: '1px solid rgba(34, 211, 238, 0.25)',
                          },
                          success: {
                            iconTheme: {
                              primary: '#22d3ee',
                              secondary: '#0f172a',
                            },
                          },
                          error: {
                            iconTheme: {
                              primary: '#ef4444',
                              secondary: '#0f172a',
                            },
                          },
                        }}
                      />
                    </WalletModalProvider>
                  </WagmiProvider>
                </QueryClientProvider>
              </PrivyProvider>
            </ErrorBoundary>
          </HelmetProvider>
        </BrowserRouter>
        </ThemeProvider>
      </ErrorBoundary>
      </StrictMode>
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const detail = err instanceof Error ? err.stack : undefined
    renderErrorUI('The app failed to start.', message + (detail ? `\n\n${detail}` : ''))
    console.error('App bootstrap error:', err)
  }
}
