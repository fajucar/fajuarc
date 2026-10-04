import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🚨 ErrorBoundary caught an error:', error)
    console.error('Error details:', errorInfo)
    
    this.setState({
      error,
      errorInfo,
    })
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const errorMessage = this.state.error?.message || 'Unknown error'
      const errorStack = this.state.error?.stack || ''
      const componentStack = this.state.errorInfo?.componentStack || ''

      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-slate-900/60 backdrop-blur-xl border border-red-500/20 rounded-3xl p-8 shadow-[0_8px_32px_rgba(239,68,68,0.1)]">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">
                  App crashed
                </h1>
                <p className="text-slate-400 text-sm">
                  An unexpected error occurred. See details below.
                </p>
              </div>
            </div>

            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 mb-6">
              <h2 className="text-sm font-semibold text-red-400 mb-2">
                Error message:
              </h2>
              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">
                {errorMessage}
              </pre>
            </div>

            {errorStack && (
              <details className="mb-6">
                <summary className="text-sm font-semibold text-slate-400 cursor-pointer hover:text-slate-300 mb-2">
                  Stack trace (click to expand)
                </summary>
                <pre className="text-xs text-slate-500 font-mono whitespace-pre-wrap break-words bg-slate-950/50 border border-slate-800 rounded p-4 mt-2 max-h-64 overflow-y-auto">
                  {errorStack}
                </pre>
              </details>
            )}

            {componentStack && (
              <details className="mb-6">
                <summary className="text-sm font-semibold text-slate-400 cursor-pointer hover:text-slate-300 mb-2">
                  Component stack (click to expand)
                </summary>
                <pre className="text-xs text-slate-500 font-mono whitespace-pre-wrap break-words bg-slate-950/50 border border-slate-800 rounded p-4 mt-2 max-h-64 overflow-y-auto">
                  {componentStack}
                </pre>
              </details>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  // Try again = reload page (no router dependency)
                  window.location.reload()
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-semibold transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
              <button
                onClick={() => {
                  // Go Home = navigate to root (no router dependency)
                  window.location.href = '/'
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors"
              >
                <Home className="w-4 h-4" />
                Go Home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
