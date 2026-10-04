import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'

export function AuthCallback() {
  const navigate = useNavigate()
  const { authenticated } = usePrivy()

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/', { replace: true })
    }, 2000)
    return () => clearTimeout(timer)
  }, [authenticated, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617]">
      <div className="text-center text-white">
        <div className="animate-spin h-8 w-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-slate-400">Finalizando login...</p>
      </div>
    </div>
  )
}
