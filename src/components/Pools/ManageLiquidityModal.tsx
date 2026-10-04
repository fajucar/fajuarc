/**
 * ManageLiquidityModal — view a V2 LP position, remove liquidity, or transfer LP tokens.
 *
 * On Arc Mainnet the ArcDEX Router and Pair are UniswapV2Router02 / UniswapV2Pair
 * (deployed bytecode verified identical to contracts/v2-*). The relevant calls:
 *   Router.removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline)
 *     → pulls `liquidity` LP from the caller with transferFrom, so the Router needs an
 *       LP allowance; the pair then pays liquidity × balance ÷ totalSupply of each token to `to`.
 *   Pair.transfer(to, amount) → plain ERC-20 transfer of the LP token (18 decimals).
 *
 * Every amount is a raw bigint; decimals are read from the contracts (USDC's ERC-20
 * view on Arc is 6). Each write is simulated before the wallet is asked to sign, so a
 * revert (slippage, expired deadline) shows up here instead of costing gas.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePublicClient } from 'wagmi'
import { getAddress, isAddress, parseAbi, parseUnits, type Address, type Hash } from 'viem'
import { X, ExternalLink, Loader2, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useArcWriteContract } from '@/hooks/useArcWriteContract'
import { ARCDEX } from '@/config/arcDex'
import { formatTokenAmount } from '@/lib/format'
import { notifyBalancesChanged } from '@/components/WalletBalancesCard'
import { WrongNetworkNotice } from '@/components/Web3/WrongNetworkNotice'
import { ARC_CHAIN_ID, WrongNetworkError } from '@/lib/arcNetwork'
import type { PoolMarketInfo } from '@/hooks/usePools'

const PAIR_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function getReserves() view returns (uint112, uint112, uint32)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function allowance(address, address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
  'function transfer(address, uint256) returns (bool)',
])
const ERC20_DECIMALS_ABI = parseAbi(['function decimals() view returns (uint8)'])
const ROUTER_ABI = parseAbi([
  'function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)',
])

const BPS = 10_000n
const DEFAULT_SLIPPAGE = '0.5'
const DEADLINE_SECONDS = 20n * 60n
const PERCENT_PRESETS = ['25', '50', '75', '100'] as const
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

type TokenInfo = { address: Address; symbol: string; decimals: number }

type Position = {
  token0: TokenInfo
  token1: TokenInfo
  lpDecimals: number
  lpBalance: bigint
  totalSupply: bigint
  reserve0: bigint
  reserve1: bigint
}

type Status =
  | { kind: 'idle' }
  | { kind: 'approving' }
  | { kind: 'signing' }
  | { kind: 'confirming'; hash: Hash }
  | { kind: 'success'; hash: Hash; message: string }
  | { kind: 'error'; message: string }

type Tab = 'remove' | 'transfer'

/** "12.5" → 1250n basis points of 100%; null when not a valid 0 < p ≤ 100 with ≤ 2 decimals. */
function percentToBps(input: string): bigint | null {
  const v = input.trim()
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(v)) return null
  const bps = parseUnits(v, 2)
  return bps > 0n && bps <= BPS ? bps : null
}

/** Slippage "0.5" → 50n bps; allowed 0.01%–50%. */
function slippageToBps(input: string): bigint | null {
  const v = input.trim()
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(v)) return null
  const bps = parseUnits(v, 2)
  return bps >= 1n && bps <= 5_000n ? bps : null
}

function friendlyError(err: unknown): string {
  if (err instanceof WrongNetworkError) return err.message
  const msg = err instanceof Error ? ((err as { shortMessage?: string }).shortMessage ?? err.message) : String(err)
  if (/chain mismatch|does not match the target chain|ChainMismatch/i.test(msg)) return new WrongNetworkError().message
  if (/user rejected|user denied|rejected the request|user cancel/i.test(msg)) return 'You cancelled the request in your wallet. Nothing was sent.'
  if (/INSUFFICIENT_A_AMOUNT|INSUFFICIENT_B_AMOUNT/.test(msg)) return 'The pool price moved more than your slippage tolerance. Nothing was removed — review the amounts or raise the slippage slightly.'
  if (/EXPIRED/.test(msg)) return 'The 20-minute deadline passed before the transaction was mined. Nothing was removed — try again.'
  if (/INSUFFICIENT_LIQUIDITY_BURNED/.test(msg)) return 'That amount of LP is too small to withdraw anything. Choose a larger percentage.'
  if (/insufficient funds|exceeds balance/i.test(msg)) return 'Not enough USDC in your wallet to pay the network fee.'
  if (/TRANSFER_FROM_FAILED|ds-math-sub-underflow/i.test(msg)) return 'The LP amount is higher than your balance or allowance. Refresh and try again.'
  return msg.length > 220 ? msg.slice(0, 220) + '…' : msg
}

interface ManageLiquidityModalProps {
  pool: PoolMarketInfo
  account: Address
  onClose: () => void
  /** Called after any confirmed transaction so the page can refresh pools and balances. */
  onSuccess: () => void
}

export function ManageLiquidityModal({ pool, account, onClose, onSuccess }: ManageLiquidityModalProps) {
  const { t } = useTranslation()
  // Pinned to Arc: reads, simulations and receipts must never follow a wallet on another network.
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const { writeContractAsync } = useArcWriteContract()
  const pair = pool.pairAddress as Address
  const router = ARCDEX.router as Address

  const [position, setPosition] = useState<Position | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('remove')
  const [percent, setPercent] = useState('25')
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE)
  const [sendElsewhere, setSendElsewhere] = useState(false)
  const [recipientInput, setRecipientInput] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [addressChecked, setAddressChecked] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  // ── Read the position straight from the contracts ────────────────────────────
  const loadPosition = useCallback(async () => {
    if (!publicClient) return
    setLoadError(null)
    try {
      const [lpBalance, totalSupply, lpDecimals, reserves, t0, t1] = await Promise.all([
        publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'balanceOf', args: [account] }),
        publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'totalSupply' }),
        publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'decimals' }),
        publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'getReserves' }),
        publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token0' }),
        publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token1' }),
      ])
      const [d0, d1] = await Promise.all([
        publicClient.readContract({ address: t0, abi: ERC20_DECIMALS_ABI, functionName: 'decimals' }),
        publicClient.readContract({ address: t1, abi: ERC20_DECIMALS_ABI, functionName: 'decimals' }),
      ])
      const symbolOf = (addr: Address) =>
        [pool.token0, pool.token1].find((t) => t.address.toLowerCase() === addr.toLowerCase())?.symbol ?? `${addr.slice(0, 6)}…`
      setPosition({
        token0: { address: t0, symbol: symbolOf(t0), decimals: Number(d0) },
        token1: { address: t1, symbol: symbolOf(t1), decimals: Number(d1) },
        lpDecimals: Number(lpDecimals),
        lpBalance,
        totalSupply,
        reserve0: reserves[0],
        reserve1: reserves[1],
      })
    } catch (err) {
      setLoadError(friendlyError(err))
    }
  }, [publicClient, pair, account, pool.token0, pool.token1])

  useEffect(() => { loadPosition() }, [loadPosition])

  // ── Derived amounts (all bigint) ──────────────────────────────────────────────
  const pctBps = percentToBps(percent)
  const slipBps = slippageToBps(slippage)

  const liquidity = useMemo(() => {
    if (!position || pctBps === null) return 0n
    return pctBps === BPS ? position.lpBalance : (position.lpBalance * pctBps) / BPS
  }, [position, pctBps])

  const share = position && position.totalSupply > 0n
    ? (position.lpBalance * 1_000_000n) / position.totalSupply // percent with 4 decimals
    : 0n
  const expectedFor = (lp: bigint, reserve: bigint) =>
    position && position.totalSupply > 0n ? (lp * reserve) / position.totalSupply : 0n
  const expected0 = expectedFor(liquidity, position?.reserve0 ?? 0n)
  const expected1 = expectedFor(liquidity, position?.reserve1 ?? 0n)
  const min0 = slipBps === null ? 0n : (expected0 * (BPS - slipBps)) / BPS
  const min1 = slipBps === null ? 0n : (expected1 * (BPS - slipBps)) / BPS

  // ── Recipient ─────────────────────────────────────────────────────────────────
  const recipientCheck = useMemo((): { address?: Address; error?: string } => {
    const needsInput = tab === 'transfer' || sendElsewhere
    if (!needsInput) return { address: account }
    const raw = recipientInput.trim()
    if (!raw) return { error: 'Enter the destination address.' }
    if (!isAddress(raw, { strict: false })) return { error: 'This is not a valid address (0x followed by 40 hex characters).' }
    const addr = getAddress(raw)
    const blocked: Record<string, string> = {
      [ZERO_ADDRESS]: 'the zero address',
      [pair.toLowerCase()]: 'this pool contract (anyone could then withdraw those tokens)',
      [router.toLowerCase()]: 'the DEX router contract',
      ...(position ? { [position.token0.address.toLowerCase()]: `the ${position.token0.symbol} token contract`, [position.token1.address.toLowerCase()]: `the ${position.token1.symbol} token contract` } : {}),
    }
    const hit = blocked[addr.toLowerCase()]
    if (hit) return { error: `Sending to ${hit} would lose the funds. Use a wallet address.` }
    if (tab === 'transfer' && addr.toLowerCase() === account.toLowerCase()) return { error: 'That is your own connected wallet.' }
    return { address: addr }
  }, [tab, sendElsewhere, recipientInput, account, pair, router, position])

  const recipient = recipientCheck.address
  const recipientIsSelf = !!recipient && recipient.toLowerCase() === account.toLowerCase()

  const busy = status.kind === 'approving' || status.kind === 'signing' || status.kind === 'confirming'
  // The Withdraw button opens this modal for every pool; with no LP here, show why and lock the controls.
  const noLiquidity = !!position && position.lpBalance === 0n
  const locked = busy || noLiquidity
  const canReview =
    !!position && !noLiquidity && liquidity > 0n && !!recipient && !busy &&
    (tab === 'transfer' || (slipBps !== null && expected0 > 0n && expected1 > 0n))

  // Any change to the inputs drops a pending review, so what was confirmed is what gets signed.
  useEffect(() => { setReviewing(false); setAddressChecked(false) }, [tab, percent, slippage, sendElsewhere, recipientInput])

  // ── Transactions ──────────────────────────────────────────────────────────────
  const finishTx = async (hash: Hash, message: string) => {
    setStatus({ kind: 'confirming', hash })
    const receipt = await publicClient!.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error('The transaction was mined but reverted. Nothing changed.')
    setStatus({ kind: 'success', hash, message })
    setReviewing(false)
    await loadPosition()
    onSuccess()
    notifyBalancesChanged()
  }

  const runRemove = async () => {
    if (!publicClient || !position || !recipient || liquidity === 0n) return
    try {
      // 1. Allowance: approve exactly what this removal needs, never unlimited.
      const allowance = await publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'allowance', args: [account, router] })
      if (allowance < liquidity) {
        setStatus({ kind: 'approving' })
        const approveHash = await writeContractAsync({ address: pair, abi: PAIR_ABI, functionName: 'approve', args: [router, liquidity] })
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
        if (approveReceipt.status !== 'success') throw new Error('The LP approval reverted. Nothing was removed.')
      }

      // 2. Deadline from chain time, then simulate before asking for a signature.
      const block = await publicClient.getBlock()
      const deadline = block.timestamp + DEADLINE_SECONDS
      const args = [position.token0.address, position.token1.address, liquidity, min0, min1, recipient, deadline] as const
      await publicClient.simulateContract({ address: router, abi: ROUTER_ABI, functionName: 'removeLiquidity', args, account })

      // 3. Sign and confirm.
      setStatus({ kind: 'signing' })
      const hash = await writeContractAsync({ address: router, abi: ROUTER_ABI, functionName: 'removeLiquidity', args: [...args] })
      await finishTx(hash, `Removed ${percent}% of your liquidity. Tokens were sent to ${recipientIsSelf ? 'your wallet' : recipient}.`)
    } catch (err) {
      setStatus({ kind: 'error', message: friendlyError(err) })
    }
  }

  const runTransfer = async () => {
    if (!publicClient || !position || !recipient || liquidity === 0n) return
    try {
      await publicClient.simulateContract({ address: pair, abi: PAIR_ABI, functionName: 'transfer', args: [recipient, liquidity], account })
      setStatus({ kind: 'signing' })
      const hash = await writeContractAsync({ address: pair, abi: PAIR_ABI, functionName: 'transfer', args: [recipient, liquidity] })
      await finishTx(hash, `Transferred ${formatTokenAmount(liquidity, position.lpDecimals, 12)} LP to ${recipient}.`)
    } catch (err) {
      setStatus({ kind: 'error', message: friendlyError(err) })
    }
  }

  // ── Rendering helpers ─────────────────────────────────────────────────────────
  const amt = (raw: bigint, t: TokenInfo) => `${formatTokenAmount(raw, t.decimals, 6)} ${t.symbol}`
  // LP supplies here are tiny (e.g. 0.0000316 LP for the whole USDC/FAJU pool), so show 12 decimals.
  const lp = (raw: bigint) => `${formatTokenAmount(raw, position?.lpDecimals ?? 18, 12)} LP`
  const txLink = (hash: Hash) => (
    <a href={`${ARCDEX.explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
      View on {ARCDEX.explorerName} <ExternalLink className="h-3 w-3" />
    </a>
  )

  const input = 'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none'

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4" onClick={busy ? undefined : onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-200 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Manage ${pool.pairName} liquidity`}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Manage {pool.pairName}</h2>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-slate-700/50 disabled:opacity-40" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <WrongNetworkNotice />

        {loadError && <p className="text-sm text-red-400">Couldn't read your position: {loadError}</p>}
        {!position && !loadError && <p className="text-sm text-slate-400">Reading your position…</p>}

        {position && (
          <>
            {/* Position */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-400">Your LP balance</div>
                <div className="font-semibold text-white tabular-nums">{lp(position.lpBalance)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Pool share</div>
                <div className="font-semibold text-white tabular-nums">{formatTokenAmount(share, 4, 4)}%</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-slate-400">If you withdrew everything now</div>
                <div className="font-semibold text-white tabular-nums">
                  {amt(expectedFor(position.lpBalance, position.reserve0), position.token0)} + {amt(expectedFor(position.lpBalance, position.reserve1), position.token1)}
                </div>
              </div>
            </div>

            {noLiquidity && (
              <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm" role="status">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div className="space-y-1">
                  <div className="font-semibold text-amber-200">{t('pools.noLiquidityTitle')}</div>
                  <div className="font-mono text-xs text-slate-300">
                    {t('pools.noLiquidityWallet', { address: `${account.slice(0, 6)}…${account.slice(-4)}` })}
                  </div>
                  <div className="text-xs text-slate-300">{t('pools.noLiquidityHint')}</div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-800/60 p-1 text-sm">
              {(['remove', 'transfer'] as const).map((tabId) => (
                <button
                  key={tabId}
                  onClick={() => setTab(tabId)}
                  disabled={locked}
                  className={`rounded-lg px-3 py-1.5 font-medium disabled:opacity-50 ${tab === tabId ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {tabId === 'remove' ? 'Remove liquidity' : 'Transfer LP tokens'}
                </button>
              ))}
            </div>

            {!reviewing && (
              <div className="space-y-4">
                {/* Amount */}
                <div className="space-y-2">
                  <label htmlFor="manage-percent" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Amount (% of your position)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PERCENT_PRESETS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPercent(p)}
                        disabled={locked}
                        className={`rounded-lg border px-3 py-1.5 text-sm ${percent === p ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                      >
                        {p === '100' ? 'Max' : `${p}%`}
                      </button>
                    ))}
                    <div className="flex items-center gap-1">
                      <input
                        id="manage-percent"
                        inputMode="decimal"
                        value={percent}
                        onChange={(e) => setPercent(e.target.value.replace(',', '.'))}
                        disabled={locked}
                        className={`${input} w-24`}
                        aria-invalid={pctBps === null}
                      />
                      <span className="text-sm text-slate-400">%</span>
                    </div>
                  </div>
                  {pctBps === null && <p className="text-xs text-red-400">Enter a percentage between 0.01 and 100.</p>}
                  <p className="text-xs text-slate-400 tabular-nums">= {lp(liquidity)}</p>
                </div>

                {tab === 'remove' && (
                  <>
                    {/* Preview */}
                    <div className="rounded-xl border border-slate-700/60 p-3 text-sm space-y-1 tabular-nums">
                      <div className="text-xs text-slate-400">You will receive (estimate)</div>
                      <div className="text-white">{amt(expected0, position.token0)}</div>
                      <div className="text-white">{amt(expected1, position.token1)}</div>
                      <div className="pt-1 text-xs text-slate-400">
                        Minimum after {slippage || '?'}% slippage: {amt(min0, position.token0)} · {amt(min1, position.token1)}
                      </div>
                      {liquidity > 0n && (expected0 === 0n || expected1 === 0n) && (
                        <p className="text-xs text-amber-400">This amount is too small to withdraw anything. Choose a larger percentage.</p>
                      )}
                    </div>

                    {/* Slippage */}
                    <div className="space-y-1">
                      <label htmlFor="manage-slippage" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Slippage tolerance (%)
                      </label>
                      <input
                        id="manage-slippage"
                        inputMode="decimal"
                        value={slippage}
                        onChange={(e) => setSlippage(e.target.value.replace(',', '.'))}
                        disabled={locked}
                        className={`${input} w-28`}
                        aria-invalid={slipBps === null}
                      />
                      {slipBps === null && <p className="text-xs text-red-400">Enter a value between 0.01 and 50.</p>}
                      {slipBps !== null && slipBps > 500n && <p className="text-xs text-amber-400">Above 5% you may receive noticeably less than the estimate.</p>}
                      <p className="text-xs text-slate-500">Deadline: 20 minutes after you sign.</p>
                    </div>

                    {/* Recipient */}
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={sendElsewhere} onChange={(e) => setSendElsewhere(e.target.checked)} disabled={locked} />
                      Send the tokens to another address
                    </label>
                  </>
                )}

                {(tab === 'transfer' || sendElsewhere) && (
                  <div className="space-y-1">
                    <label htmlFor="manage-recipient" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {tab === 'transfer' ? 'Send LP tokens to' : 'Send withdrawn tokens to'}
                    </label>
                    <input
                      id="manage-recipient"
                      value={recipientInput}
                      onChange={(e) => setRecipientInput(e.target.value)}
                      placeholder="0x…"
                      spellCheck={false}
                      disabled={locked}
                      className={`${input} font-mono`}
                    />
                    {recipientInput && recipientCheck.error && <p className="text-xs text-red-400">{recipientCheck.error}</p>}
                  </div>
                )}

                <button
                  onClick={() => setReviewing(true)}
                  disabled={!canReview}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {tab === 'remove' ? 'Review removal' : 'Review transfer'}
                </button>
              </div>
            )}

            {/* Review — the exact values that will be signed */}
            {reviewing && recipient && (
              <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
                <div className="font-semibold text-white">{tab === 'remove' ? 'Confirm removal' : 'Confirm LP transfer'}</div>
                <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 tabular-nums">
                  <dt className="text-slate-400">LP amount</dt><dd className="text-white">{lp(liquidity)} ({percent}%)</dd>
                  {tab === 'remove' && (
                    <>
                      <dt className="text-slate-400">Minimum</dt><dd className="text-white">{amt(min0, position.token0)}</dd>
                      <dt /><dd className="text-white">{amt(min1, position.token1)}</dd>
                      <dt className="text-slate-400">Slippage</dt><dd className="text-white">{slippage}% · deadline 20 min</dd>
                    </>
                  )}
                </dl>
                <div>
                  <div className="text-xs text-slate-400">{tab === 'remove' ? 'Tokens will be sent to' : 'LP tokens will be sent to'}{recipientIsSelf ? ' (your connected wallet)' : ''}</div>
                  <div className="mt-1 break-all rounded-lg bg-slate-950 p-2 font-mono text-xs text-white select-all">{recipient}</div>
                </div>
                {!recipientIsSelf && (
                  <label className="flex items-start gap-2 text-xs text-amber-200">
                    <input type="checkbox" checked={addressChecked} onChange={(e) => setAddressChecked(e.target.checked)} className="mt-0.5" />
                    I checked every character of this address. Transfers can't be reversed.
                  </label>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setReviewing(false)} disabled={busy} className="flex-1 rounded-lg border border-slate-600 px-3 py-2 disabled:opacity-40">
                    Back
                  </button>
                  <button
                    onClick={tab === 'remove' ? runRemove : runTransfer}
                    disabled={busy || (!recipientIsSelf && !addressChecked)}
                    className="flex-1 rounded-lg bg-amber-500 px-3 py-2 font-semibold text-slate-900 disabled:opacity-40"
                  >
                    Confirm and sign
                  </button>
                </div>
              </div>
            )}

            {/* Status */}
            {status.kind !== 'idle' && (
              <div className={`rounded-xl p-3 text-sm ${status.kind === 'error' ? 'bg-red-950/40 text-red-300' : status.kind === 'success' ? 'bg-emerald-950/40 text-emerald-300' : 'bg-slate-800/60 text-slate-200'}`} role="status">
                {status.kind === 'approving' && <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Step 1 of 2 — approve the LP amount in your wallet…</span>}
                {status.kind === 'signing' && <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Waiting for your signature…</span>}
                {status.kind === 'confirming' && <span className="inline-flex flex-wrap items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Arc… {txLink(status.hash)}</span>}
                {status.kind === 'success' && <div className="space-y-1"><div>{status.message}</div>{txLink(status.hash)}</div>}
                {status.kind === 'error' && <div>{status.message}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
