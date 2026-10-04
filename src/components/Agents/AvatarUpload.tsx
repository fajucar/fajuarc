import { useState, useRef, useEffect } from 'react'
import type { ChangeEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot } from 'lucide-react'

interface AvatarUploadProps {
  currentAvatarUrl?: string
  onFileSelect: (file: File) => void
}

export function AvatarUpload({ currentAvatarUrl, onFileSelect }: AvatarUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl || null)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const activeObjectUrlRef = useRef<string | null>(null)

  const revokeExistingUrl = () => {
    if (activeObjectUrlRef.current) {
      URL.revokeObjectURL(activeObjectUrlRef.current)
      activeObjectUrlRef.current = null
    }
  }

  useEffect(() => {
    return () => { revokeExistingUrl() }
  }, [])

  // Sync external URL (ex: ao abrir o modal com avatar já salvo)
  useEffect(() => {
    if (currentAvatarUrl && !currentAvatarUrl.startsWith('blob:')) {
      setPreviewUrl(currentAvatarUrl)
    }
  }, [currentAvatarUrl])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const files = event.target.files
    if (!files || files.length === 0) return

    const file = files[0]

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid format. Select JPG, PNG or GIF.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum 5MB.')
      return
    }

    try {
      revokeExistingUrl()
      const newBlobUrl = URL.createObjectURL(file)
      activeObjectUrlRef.current = newBlobUrl
      setPreviewUrl(newBlobUrl)
      onFileSelect(file) // passa o File original para o pai salvar
    } catch (err) {
      console.error('[AvatarUpload] Erro ao processar arquivo:', err)
      setError('Error processing image. Check your browser permissions.')
    }
  }

  const triggerFileInput = () => fileInputRef.current?.click()

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Avatar */}
      <div
        onClick={triggerFileInput}
        className="relative w-24 h-24 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-cyan-500/40 bg-slate-800 cursor-pointer flex items-center justify-center group hover:border-cyan-400/70 transition-colors"
      >
        <AnimatePresence mode="wait">
          {previewUrl ? (
            <motion.img
              key={previewUrl}
              src={previewUrl}
              alt=""
              className="w-full h-full object-cover"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onError={() => {
                setError('Error loading preview.')
                setPreviewUrl(null)
              }}
            />
          ) : (
            <motion.div key="fallback" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Bot className="h-10 w-10 text-cyan-400" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Overlay hover */}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="text-white text-[11px] font-semibold">Change</span>
        </div>
      </div>

      {/* Input oculto */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg,image/png,image/gif"
        className="hidden"
      />

      <button
        type="button"
        onClick={triggerFileInput}
        className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-cyan-500/40 hover:text-cyan-300 transition-all"
      >
        Upload image
      </button>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-red-400 text-[11px] text-center max-w-[200px]"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
