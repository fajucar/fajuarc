export type Personality = 'explorer' | 'trader' | 'builder' | 'social'

export type AgentLocalProfile = {
  name: string
  personality: Personality
  imageUrl: string
  /** Endereço EVM externo (MetaMask/Rabby) para saques da embedded wallet */
  withdrawalAddress?: string
}

export const PERSONALITY_OPTIONS: Array<{
  id: Personality
  emoji: string
  label: string
  desc: string
}> = [
  { id: 'explorer', emoji: '🗺️', label: 'Explorer', desc: 'Discovers new tokens and opportunities' },
  { id: 'trader',   emoji: '📈', label: 'Trader',   desc: 'Focused on swaps and price alerts' },
  { id: 'builder',  emoji: '🏗️', label: 'Builder',  desc: 'Interacts with contracts' },
  { id: 'social',   emoji: '🌐', label: 'Social',   desc: 'Sends payments via social handles' },
]

export const CAPABILITIES = [
  { emoji: '💸', title: 'FajuPay',        desc: 'Send USDC via social handle',     active: true  },
  { emoji: '📊', title: 'Portfolio',       desc: 'Balance and positions summary',   active: false },
  { emoji: '🔔', title: 'Alerts',          desc: 'Notifications when you receive USDC', active: false },
  { emoji: '🔄', title: 'Auto Swap',       desc: 'Execute swaps on a price condition', active: false },
  { emoji: '🌉', title: 'Bridge',          desc: 'Move USDC between chains',        active: false },
]

export function loadProfile(address: string): AgentLocalProfile | null {
  try {
    const raw = localStorage.getItem(`agent_${address}`)
    return raw ? (JSON.parse(raw) as AgentLocalProfile) : null
  } catch {
    return null
  }
}

export function saveProfile(address: string, profile: AgentLocalProfile) {
  try {
    localStorage.setItem(`agent_${address}`, JSON.stringify(profile))
  } catch {
    try {
      localStorage.setItem(`agent_${address}`, JSON.stringify({ ...profile, imageUrl: '' }))
    } catch { /* ignore */ }
  }
}

export function defaultAgentName(address: string) {
  return `Agent #${address.slice(-4).toUpperCase()}`
}

export function resizeImageToDataUrl(file: File, maxSize = 300, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Error reading file'))
    reader.onload = (readerEvent) => {
      const dataUrl = readerEvent.target?.result as string
      if (!dataUrl) { reject(new Error('Empty file')); return }

      const img = new Image()
      // Se a imagem não carregar no canvas, usa o data URL direto
      img.onerror = () => resolve(dataUrl)
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
          canvas.width = Math.max(1, Math.round(img.width * scale))
          canvas.height = Math.max(1, Math.round(img.height * scale))
          const ctx = canvas.getContext('2d')
          if (!ctx) { resolve(dataUrl); return }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch {
          resolve(dataUrl) // fallback: retorna original sem redimensionar
        }
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}
