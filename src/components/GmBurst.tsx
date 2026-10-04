import { useEffect, useState } from 'react'

interface GmBurstProps {
  show: boolean
  origin: { x: number; y: number } | null
  onDone: () => void
  durationMs?: number
}

const EMOJI_TYPES = ['🎉', '🎊', '✨', '🫎']
const EMOJIS = Array.from({ length: 42 }, (_, i) => EMOJI_TYPES[i % EMOJI_TYPES.length])

export function GmBurst({ show, origin, onDone, durationMs = 1200 }: GmBurstProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (show && origin) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        onDone()
      }, durationMs)
      return () => clearTimeout(timer)
    }
  }, [show, origin, onDone, durationMs])

  if (!show || !origin || !visible) return null

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-none">
      {EMOJIS.map((emoji, i) => {
        const angle = (i * 360) / EMOJIS.length
        const radius = 200
        const finalX = origin.x + Math.cos((angle * Math.PI) / 180) * radius
        const finalY = origin.y + Math.sin((angle * Math.PI) / 180) * radius

        return (
          <div
            key={i}
            className="absolute text-4xl"
            style={{
              left: `${origin.x}px`,
              top: `${origin.y}px`,
              transform: 'translate(-50%, -50%)',
              animation: `burst-${i} ${durationMs}ms ease-out forwards`,
            }}
          >
            <style>{`
              @keyframes burst-${i} {
                0% {
                  transform: translate(-50%, -50%) scale(0) rotate(0deg);
                  opacity: 1;
                }
                50% {
                  opacity: 1;
                }
                100% {
                  transform: translate(${finalX - origin.x}px, ${finalY - origin.y}px) translate(-50%, -50%) scale(1.5) rotate(${angle + 360}deg);
                  opacity: 0;
                }
              }
            `}</style>
            {emoji}
          </div>
        )
      })}
    </div>
  )
}
