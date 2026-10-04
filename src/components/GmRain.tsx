import { useEffect, useState } from 'react'

interface GmRainProps {
  show: boolean
  onDone: () => void
  durationMs?: number
  count?: number
}

const EMOJI_TYPES = ['🎉', '🎊', '✨']

export function GmRain({ show, onDone, durationMs = 3000, count = 48 }: GmRainProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (show) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        onDone()
      }, durationMs + 500)
      return () => clearTimeout(timer)
    }
  }, [show, onDone, durationMs])

  if (!show || !visible) return null

  const emojis = Array.from({ length: count }, (_, i) => {
    const delay = Math.random() * 250
    const animationDuration = Math.max(600, durationMs - delay)
    return {
      emoji: EMOJI_TYPES[i % EMOJI_TYPES.length],
      delay,
      animationDuration,
      left: `${(i * 100) / count}%`,
    }
  })

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-none overflow-hidden">
      {emojis.map((item, i) => (
        <div
          key={i}
          className="absolute text-4xl"
          style={{
            left: item.left,
            top: '-50px',
            animation: `rain-${i} ${item.animationDuration}ms linear forwards`,
            animationDelay: `${item.delay}ms`,
          }}
        >
          <style>{`
            @keyframes rain-${i} {
              0% {
                transform: translateY(0);
                opacity: 1;
              }
              25% {
                transform: translateY(25vh);
                opacity: 1;
              }
              50% {
                transform: translateY(50vh);
                opacity: 1;
              }
              75% {
                transform: translateY(75vh);
                opacity: 1;
              }
              95% {
                transform: translateY(95vh);
                opacity: 1;
              }
              100% {
                transform: translateY(130vh);
                opacity: 0;
              }
            }
          `}</style>
          {item.emoji}
        </div>
      ))}
    </div>
  )
}
