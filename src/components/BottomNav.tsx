import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Bot, ArrowLeftRight, Waves } from 'lucide-react'

const navItems = [
  { label: 'Home', icon: Home, path: '/' },
  { label: 'Agentes', icon: Bot, path: '/agents' },
  { label: 'Swap', icon: ArrowLeftRight, path: '/swap' },
  { label: 'Pools', icon: Waves, path: '/pools' },
]

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {navItems.map(item => {
          const isActive = location.pathname === item.path
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`bottom-nav-item${isActive ? ' active' : ''}`}
            >
              <item.icon className="nav-icon" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
