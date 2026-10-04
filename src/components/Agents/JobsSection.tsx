import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Briefcase, Plus, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, ExternalLink, AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { usePublicClient } from 'wagmi'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { parseUnits, formatUnits, toHex, type Address } from 'viem'
import toast from 'react-hot-toast'
import { useArcWallet } from '@/hooks/useArcWallet'
import { agenticCommerceAbi } from '@/abis/agenticCommerceAbi'

// ── Constants ────────────────────────────────────────────────────────────────

const AGENTIC_COMMERCE = '0x0747EEf0706327138c69792bF28Cd525089e4583' as Address
const USDC_ADDRESS     = '0x3600000000000000000000000000000000000000' as Address
const USDC_DECIMALS    = 6
const EXPLORER_URL     = 'https://testnet.arcscan.app'

const ZERO_BYTES   = '0x' as `0x${string}`
const ZERO_BYTES32 = `0x${'00'.repeat(32)}` as `0x${string}`

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// ── Types ────────────────────────────────────────────────────────────────────

type JobStatus = 0 | 1 | 2 | 3 // Open | Funded | Submitted | Completed

type Job = {
  id: bigint
  client: Address
  provider: Address
  evaluator: Address
  budget: bigint
  expiredAt: bigint
  status: JobStatus
  description: string
  deliverable: `0x${string}`
}

const STATUS_LABELS: Record<JobStatus, string> = {
  0: 'Open',
  1: 'Funded',
  2: 'Delivered',
  3: 'Completed',
}

const STATUS_CLASSES: Record<JobStatus, string> = {
  0: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  1: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  2: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
  3: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function txLink(hash: string) {
  return `${EXPLORER_URL}/tx/${hash}`
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={txLink(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-xs"
    >
      View tx <ExternalLink className="h-3 w-3" />
    </a>
  )
}

// ── Create Job Form ──────────────────────────────────────────────────────────

function CreateJobForm({ onCreated }: { onCreated: () => void }) {
  const { address } = useArcWallet()
  const { writeContractAsync } = useArcWriteContract()
  const publicClient = usePublicClient()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    description: '',
    budget: '',
    provider: '',
    expiryHours: '1',
  })
  const [lastTx, setLastTx] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!address || !publicClient) { toast.error('Connect your wallet'); return }
    if (!form.description.trim()) { toast.error('Enter a description'); return }
    if (!form.provider || !form.provider.startsWith('0x')) { toast.error('Invalid provider address'); return }
    if (!form.budget || parseFloat(form.budget) <= 0) { toast.error('Enter a valid budget'); return }

    setLoading(true)
    const toastId = toast.loading('Creating job...')
    try {
      const expiredAt = BigInt(Math.floor(Date.now() / 1000) + parseInt(form.expiryHours) * 3600)
      const budgetAmount = parseUnits(form.budget, USDC_DECIMALS)

      // 1. createJob
      const hash = await writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: agenticCommerceAbi,
        functionName: 'createJob',
        args: [
          form.provider as Address,
          address,           // evaluator = client
          expiredAt,
          form.description.trim(),
          ZERO_BYTES,
        ],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setLastTx(hash)

      // 2. Get latest jobId from events (crude: assume last created)
      const receipt = await publicClient.getTransactionReceipt({ hash })
      const jobIdHex = receipt.logs[0]?.topics[1]
      const jobId = jobIdHex ? BigInt(jobIdHex) : null

      // 3. setBudget if jobId found
      if (jobId !== null && budgetAmount > 0n) {
        const budgetHash = await writeContractAsync({
          address: AGENTIC_COMMERCE,
          abi: agenticCommerceAbi,
          functionName: 'setBudget',
          args: [jobId, budgetAmount, ZERO_BYTES],
        })
        await publicClient.waitForTransactionReceipt({ hash: budgetHash })
      }

      toast.success('Job created successfully!', { id: toastId })
      setForm({ description: '', budget: '', provider: '', expiryHours: '1' })
      setOpen(false)
      onCreated()
    } catch (err: any) {
      const msg = err?.shortMessage ?? err?.message ?? 'Error creating job'
      toast.error(msg.slice(0, 100), { id: toastId })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-cyan-400" />
          Create New Job
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-slate-700/50 pt-3">
              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                  Job Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe the work to be performed..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none resize-none"
                />
              </div>

              {/* Provider */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                  Provider Address (Agent)
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={form.provider}
                  onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none font-mono"
                />
              </div>

              {/* Budget + Expiry */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                    Budget (USDC)
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={form.budget}
                      onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
                    />
                    <span className="flex items-center px-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-400 font-bold">USDC</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                    Expiration
                  </label>
                  <select
                    value={form.expiryHours}
                    onChange={(e) => setForm((f) => ({ ...f, expiryHours: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-cyan-500/50 focus:outline-none"
                  >
                    <option value="1">1 hour</option>
                    <option value="6">6 hours</option>
                    <option value="24">24 hours</option>
                    <option value="72">3 days</option>
                    <option value="168">7 days</option>
                  </select>
                </div>
              </div>

              {lastTx && (
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Job created! <TxLink hash={lastTx} />
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {loading ? 'Creating...' : 'Create Job'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({ job, userAddress, onRefresh }: { job: Job; userAddress: Address; onRefresh: () => void }) {
  const { writeContractAsync } = useArcWriteContract()
  const publicClient = usePublicClient()
  const [loading, setLoading] = useState<string | null>(null)
  const [deliverable, setDeliverable] = useState('')
  const [lastTx, setLastTx] = useState<string | null>(null)

  const isClient   = job.client.toLowerCase()   === userAddress.toLowerCase()
  const isProvider = job.provider.toLowerCase()  === userAddress.toLowerCase()

  const act = async (label: string, fn: () => Promise<`0x${string}`>) => {
    if (!publicClient) return
    setLoading(label)
    const toastId = toast.loading(`${label}...`)
    try {
      const hash = await fn()
      await publicClient.waitForTransactionReceipt({ hash })
      setLastTx(hash)
      toast.success(`${label} completed!`, { id: toastId })
      onRefresh()
    } catch (err: any) {
      toast.error((err?.shortMessage ?? err?.message ?? 'Error').slice(0, 100), { id: toastId })
    } finally {
      setLoading(null)
    }
  }

  const handleFund = () =>
    act('Funding', async () => {
      // 1. approve USDC
      await writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [AGENTIC_COMMERCE, job.budget],
      })
      // 2. fund
      return writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: agenticCommerceAbi,
        functionName: 'fund',
        args: [job.id, ZERO_BYTES],
      })
    })

  const handleSubmit = () => {
    if (!deliverable.trim()) { toast.error('Enter the deliverable hash/link'); return }
    // Convert string to bytes32
    const delivHex = toHex(deliverable.trim().slice(0, 32).padEnd(32, '\0')) as `0x${string}`
    act('Delivering', () =>
      writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: agenticCommerceAbi,
        functionName: 'submit',
        args: [job.id, delivHex, ZERO_BYTES],
      })
    )
  }

  const handleComplete = () =>
    act('Approving', () =>
      writeContractAsync({
        address: AGENTIC_COMMERCE,
        abi: agenticCommerceAbi,
        functionName: 'complete',
        args: [job.id, 'Work approved by client', ZERO_BYTES],
      })
    )

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-slate-500">Job #{job.id.toString()}</span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASSES[job.status]}`}>
              {STATUS_LABELS[job.status]}
            </span>
            {isClient   && <span className="rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] text-cyan-400">Client</span>}
            {isProvider && <span className="rounded-full bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[10px] text-purple-400">Provider</span>}
          </div>
          <p className="text-sm text-white font-medium leading-5 line-clamp-2">{job.description}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-base font-bold text-white">{formatUnits(job.budget, USDC_DECIMALS)}</div>
          <div className="text-[10px] text-slate-500">USDC</div>
        </div>
      </div>

      {/* Addresses */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-lg bg-slate-800/60 px-2 py-1.5">
          <div className="text-slate-500 mb-0.5">Provider</div>
          <div className="font-mono text-slate-300 truncate">{job.provider.slice(0, 10)}...{job.provider.slice(-6)}</div>
        </div>
        <div className="rounded-lg bg-slate-800/60 px-2 py-1.5">
          <div className="text-slate-500 mb-0.5">Expires on</div>
          <div className="text-slate-300">
            {job.expiredAt > 0n
              ? new Date(Number(job.expiredAt) * 1000).toLocaleDateString('en-US')
              : '—'}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {/* Client: fund when Open */}
        {isClient && job.status === 0 && (
          <button
            onClick={handleFund}
            disabled={!!loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-500/20 border border-amber-500/30 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 transition-all"
          >
            {loading === 'Funding' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {loading === 'Funding' ? 'Funding...' : '💰 Fund Escrow'}
          </button>
        )}

        {/* Client: complete when Submitted */}
        {isClient && job.status === 2 && (
          <button
            onClick={handleComplete}
            disabled={!!loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 transition-all"
          >
            {loading === 'Approving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {loading === 'Approving' ? 'Approving...' : '✅ Approve Delivery'}
          </button>
        )}

        {/* Provider: submit when Funded */}
        {isProvider && job.status === 1 && (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Deliverable hash or link..."
              value={deliverable}
              onChange={(e) => setDeliverable(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-purple-500/50 focus:outline-none"
            />
            <button
              onClick={handleSubmit}
              disabled={!!loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-purple-500/20 border border-purple-500/30 py-2 text-xs font-bold text-purple-300 hover:bg-purple-500/30 disabled:opacity-50 transition-all"
            >
              {loading === 'Delivering' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {loading === 'Delivering' ? 'Delivering...' : '📦 Deliver Work'}
            </button>
          </div>
        )}

        {/* Completed deliverable */}
        {job.status === 3 && job.deliverable !== ZERO_BYTES32 && (
          <div className="text-[10px] text-slate-500 font-mono break-all">
            Deliverable: {job.deliverable}
          </div>
        )}

        {lastTx && <TxLink hash={lastTx} />}
      </div>
    </div>
  )
}

// ── Jobs List ─────────────────────────────────────────────────────────────────

function JobsList({ userAddress, refreshKey }: { userAddress: Address; refreshKey: number }) {
  const publicClient = usePublicClient()
  const [jobs, setJobs]       = useState<Job[]>([])
  const [loading, setLoading] = useState(false)
  const [jobIdInput, setJobIdInput] = useState('')
  const [refreshCount, setRefreshCount] = useState(0)

  const refresh = useCallback(() => setRefreshCount((c) => c + 1), [])

  // Load jobs by scanning events — simple approach: fetch last 50 JobCreated events
  useEffect(() => {
    if (!publicClient || !userAddress) return
    setLoading(true)

    const fetchJobs = async () => {
      try {
        const logs = await publicClient.getLogs({
          address: AGENTIC_COMMERCE,
          event: agenticCommerceAbi.find((e) => e.name === 'JobCreated' && e.type === 'event') as any,
          fromBlock: 'earliest',
          toBlock: 'latest',
        })

        const relevantLogs = (logs as any[]).filter((log) => {
          const client   = log.args?.client?.toLowerCase()
          const provider = log.args?.provider?.toLowerCase()
          const me = userAddress.toLowerCase()
          return client === me || provider === me
        })

        const fetched: Job[] = []
        for (const log of relevantLogs) {
          const jobId = log.args?.jobId as bigint
          if (jobId === undefined) continue
          try {
            const data = await publicClient.readContract({
              address: AGENTIC_COMMERCE,
              abi: agenticCommerceAbi,
              functionName: 'getJob',
              args: [jobId],
            }) as any
            fetched.push({
              id: jobId,
              client:      data.client,
              provider:    data.provider,
              evaluator:   data.evaluator,
              budget:      data.budget,
              expiredAt:   data.expiredAt,
              status:      data.status as JobStatus,
              description: data.description,
              deliverable: data.deliverable,
            })
          } catch { /* skip */ }
        }
        setJobs(fetched.reverse())
      } catch {
        // getLogs might fail on some RPCs — fail silently
        setJobs([])
      } finally {
        setLoading(false)
      }
    }

    fetchJobs()
  }, [publicClient, userAddress, refreshKey, refreshCount])

  // Manual lookup by ID
  const handleLookup = async () => {
    if (!publicClient || !jobIdInput) return
    setLoading(true)
    try {
      const jobId = BigInt(jobIdInput)
      const data = await publicClient.readContract({
        address: AGENTIC_COMMERCE,
        abi: agenticCommerceAbi,
        functionName: 'getJob',
        args: [jobId],
      }) as any
      const job: Job = {
        id: jobId,
        client:      data.client,
        provider:    data.provider,
        evaluator:   data.evaluator,
        budget:      data.budget,
        expiredAt:   data.expiredAt,
        status:      data.status as JobStatus,
        description: data.description,
        deliverable: data.deliverable,
      }
      setJobs((prev) => {
        const exists = prev.find((j) => j.id === jobId)
        if (exists) return prev.map((j) => j.id === jobId ? job : j)
        return [job, ...prev]
      })
      setJobIdInput('')
    } catch {
      toast.error('Job not found')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Manual lookup */}
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Search by Job ID..."
          value={jobIdInput}
          onChange={(e) => setJobIdInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleLookup() }}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
        />
        <button
          onClick={handleLookup}
          disabled={loading || !jobIdInput}
          className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 disabled:opacity-50 transition-all"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {loading && jobs.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading jobs...
        </div>
      )}

      {!loading && jobs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <Briefcase className="h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-400">No jobs found</p>
          <p className="text-xs text-slate-600">Create a job or search by ID above</p>
        </div>
      )}

      {jobs.map((job) => (
        <JobCard key={job.id.toString()} job={job} userAddress={userAddress} onRefresh={refresh} />
      ))}
    </div>
  )
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function JobsSection() {
  const { address, isConnected } = useArcWallet()
  const [refreshKey, setRefreshKey] = useState(0)
  const [collapsed, setCollapsed] = useState(false)

  if (!isConnected || !address) {
    return (
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-5 text-center space-y-2">
        <Briefcase className="h-8 w-8 text-slate-600 mx-auto" />
        <p className="text-sm font-semibold text-white">Jobs (ERC-8183)</p>
        <p className="text-xs text-slate-400">Connect your wallet to manage jobs</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-cyan-500/15 bg-slate-900/50 overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-500/20">
            <Briefcase className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-white">Jobs</div>
            <div className="text-[10px] text-slate-500">ERC-8183 · AgenticCommerce</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-400">
            Testnet
          </span>
          {collapsed
            ? <ChevronDown className="h-4 w-4 text-slate-400" />
            : <ChevronUp className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4 border-t border-slate-800/60 pt-4">
              {/* Info banner */}
              <div className="flex items-start gap-2 rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2.5">
                <AlertCircle className="h-3.5 w-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  Jobs let you create on-chain agreements with USDC escrow.
                  Contract: <a href={`${EXPLORER_URL}/address/${AGENTIC_COMMERCE}`} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 font-mono">{AGENTIC_COMMERCE.slice(0, 10)}...</a>
                </div>
              </div>

              <CreateJobForm onCreated={() => setRefreshKey((k) => k + 1)} />

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
                  My Jobs
                </h4>
                <JobsList userAddress={address} refreshKey={refreshKey} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
