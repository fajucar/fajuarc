/**
 * Motion config — Web3 UX/UI Enhancement (FASE 3 & 4)
 * Duração: 150–300ms. Easing: ease-out entrada, ease-in saída.
 */

export const MOTION = {
  duration: {
    fast: 0.15,
    normal: 0.2,
    slow: 0.25,
  },
  ease: {
    out: [0, 0, 0.2, 1] as const,
    in: [0.4, 0, 1, 1] as const,
    inOut: [0.4, 0, 0.2, 1] as const,
  },
  spring: {
    gentle: { stiffness: 300, damping: 25 },
    snappy: { stiffness: 400, damping: 30 },
  },
} as const

export const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: MOTION.duration.normal, ease: MOTION.ease.out },
} as const

export const scaleIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: { duration: MOTION.duration.normal, ease: MOTION.ease.out },
} as const

export const buttonTap = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: { duration: MOTION.duration.fast },
} as const
