/**
 * Global transaction notifications.
 *
 * Built on react-hot-toast, which is already mounted once at the app root
 * (see main.tsx's <Toaster />) — that's what makes these visible on top of
 * ANY screen, regardless of which tab/page triggered them. There is nothing
 * page-specific to mount; just call these functions from wherever a
 * transaction starts or finishes.
 */

import toast from 'react-hot-toast'
import { ExternalLink, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { ARCDEX } from '@/config/arcDex'

const explorerTx = (hash: string) => `${ARCDEX.explorer}/tx/${hash}`

function shortAddr(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr
}

/** "About to execute" — fired a moment before the backend scheduler runs a due payment. */
export function notifyPaymentPending(opts: { recipient: string; amount: string; token: string }) {
  toast.custom(
    (t) => (
      <div
        className={`glass-card flex items-center gap-3 px-4 py-3 max-w-sm border border-amber-500/30 bg-slate-900/95 transition-opacity ${
          t.visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <Clock className="h-5 w-5 text-amber-400 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-white">Scheduled payment running now</p>
          <p className="text-slate-400 text-xs mt-0.5">
            {opts.amount} {opts.token} → {shortAddr(opts.recipient)}
          </p>
        </div>
      </div>
    ),
    { duration: 5000 }
  )
}

/** "Executed" — for both scheduled and manual/immediate transactions (chat sendUSDC, swap, etc). */
export function notifyTxExecuted(opts: {
  title:      string
  amount?:    string
  token?:     string
  recipient?: string
  txHash:     string
}) {
  toast.custom(
    (t) => (
      <a
        href={explorerTx(opts.txHash)}
        target="_blank"
        rel="noopener noreferrer"
        className={`glass-card flex items-center gap-3 px-4 py-3 max-w-sm border border-emerald-500/30 bg-slate-900/95 hover:border-emerald-500/50 transition-all cursor-pointer ${
          t.visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => toast.dismiss(t.id)}
      >
        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
        <div className="text-sm min-w-0">
          <p className="font-semibold text-white">{opts.title}</p>
          {(opts.amount || opts.recipient) && (
            <p className="text-slate-400 text-xs mt-0.5 truncate">
              {opts.amount && opts.token ? `${opts.amount} ${opts.token}` : null}
              {opts.recipient ? ` → ${shortAddr(opts.recipient)}` : null}
            </p>
          )}
          <p className="flex items-center gap-1 text-cyan-400 text-[11px] mt-1">
            View on ArcScan <ExternalLink className="h-3 w-3" />
          </p>
        </div>
      </a>
    ),
    { duration: 7000 }
  )
}

/** "Failed" — a scheduled payment attempt failed on the backend. */
export function notifyPaymentFailed(opts: { recipient: string; amount: string; token: string; error: string }) {
  toast.custom(
    (t) => (
      <div
        className={`glass-card flex items-center gap-3 px-4 py-3 max-w-sm border border-red-500/30 bg-slate-900/95 transition-opacity ${
          t.visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <XCircle className="h-5 w-5 text-red-400 shrink-0" />
        <div className="text-sm min-w-0">
          <p className="font-semibold text-white">Scheduled payment failed</p>
          <p className="text-slate-400 text-xs mt-0.5 truncate">
            {opts.amount} {opts.token} → {shortAddr(opts.recipient)}
          </p>
          <p className="text-red-400 text-[11px] mt-1 truncate">{opts.error}</p>
        </div>
      </div>
    ),
    { duration: 9000 }
  )
}
