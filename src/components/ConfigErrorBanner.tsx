import { configErrors } from '@/config/arcMainnet'

export function ConfigErrorBanner() {
  if (!configErrors.length) return null

  return (
    <div
      className="bg-amber-500/20 border-b border-amber-500/40 px-4 py-3 text-amber-200"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="font-semibold text-amber-100 mb-1">Config error</div>
        <ul className="text-sm space-y-1 list-disc list-inside mb-2">
          {configErrors.map((msg, i) => (
            <li key={i} className="font-mono text-xs break-all">
              {msg}
            </li>
          ))}
        </ul>
        <div className="text-xs text-amber-300/90">
          Check your .env and redeploy env vars on hosting (Vercel) if applicable.
        </div>
      </div>
    </div>
  )
}
