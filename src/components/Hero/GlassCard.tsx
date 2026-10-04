import { motion } from 'framer-motion'

type StepCard = {
  title: string
  body: string
  align: "left" | "right"
  top: string
  left?: string
  right?: string
  delay?: number
}

export function GlassCard({ 
  title, 
  body, 
  align, 
  top, 
  left, 
  right,
  delay = 0 
}: StepCard) {
  const side = align === "left" ? "items-start text-left" : "items-end text-right"
  const pos = `${top} ${left ?? ""} ${right ?? ""}`

  return (
    <motion.div
      initial={{ opacity: 0, x: align === 'left' ? -50 : 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.6 }}
      whileHover={{ y: -8, scale: 1.02 }}
      className={[
        "absolute z-20 w-[320px] max-w-[80vw]",
        "rounded-2xl border border-cyan-500/25",
        "bg-slate-900/35 backdrop-blur-xl",
        "shadow-[0_0_0_1px_rgba(34,211,238,0.10),0_20px_80px_rgba(0,0,0,0.45)]",
        "p-4 md:p-5",
        "transition-transform duration-300",
        pos,
      ].join(" ")}
    >
      <div className={`flex flex-col gap-2 ${side}`}>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.65)] animate-pulse" />
          <h3 className="text-white font-semibold tracking-wide">{title}</h3>
        </div>
        <p className="text-sm leading-relaxed text-slate-200/85">{body}</p>
      </div>
    </motion.div>
  )
}

