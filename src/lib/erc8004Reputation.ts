import type { Address, PublicClient } from 'viem'
import { ERC8004 } from '@/config/erc8004'
import {
  reputationRegistryAbi,
  reputationRegistryFeedbackRevokedEvent,
  reputationRegistryNewFeedbackEvent,
} from '@/abis/reputationRegistryAbi'

export type AgentReputationEntry = {
  clientAddress: Address
  feedbackIndex: string
  value: bigint
  valueDecimals: number
  tag1: string
  tag2: string
  revoked: boolean
}

export type AgentReputationLatestActivity = {
  clientAddress: Address
  feedbackIndex: string
  value: bigint
  valueDecimals: number
  tag1: string
  tag2: string
  endpoint: string
  feedbackURI: string
  feedbackHash: `0x${string}`
}

export type AgentReputationSummary = {
  totalEntries: number
  activeEntries: number
  positiveCount: number
  negativeCount: number
  neutralCount: number
  summaryValue: bigint | null
  summaryValueDecimals: number | null
  latestActivity: AgentReputationLatestActivity | null
  entries: AgentReputationEntry[]
}

export const EMPTY_BYTES32 = `0x${'0'.repeat(64)}` as const
const MAX_FALLBACK_LOG_BLOCK_WINDOW = 25000n

async function getBoundedFeedbackLogs(
  publicClient: PublicClient,
  agentId: bigint
) {
  const latestBlock = await publicClient.getBlockNumber()
  const fromBlock =
    latestBlock > MAX_FALLBACK_LOG_BLOCK_WINDOW
      ? latestBlock - MAX_FALLBACK_LOG_BLOCK_WINDOW
      : 0n

  const [feedbackLogs, revokedLogs] = await Promise.all([
    publicClient.getLogs({
      address: ERC8004.reputationRegistry,
      event: reputationRegistryNewFeedbackEvent,
      args: { agentId },
      fromBlock,
      toBlock: 'latest',
    }),
    publicClient.getLogs({
      address: ERC8004.reputationRegistry,
      event: reputationRegistryFeedbackRevokedEvent,
      args: { agentId },
      fromBlock,
      toBlock: 'latest',
    }),
  ])

  return { feedbackLogs, revokedLogs }
}

export function formatReputationValue(value: bigint, decimals: number) {
  const isNegative = value < 0n
  const absolute = isNegative ? value * -1n : value

  if (decimals <= 0) {
    return `${isNegative ? '-' : ''}${absolute.toString()}`
  }

  const padded = absolute.toString().padStart(decimals + 1, '0')
  const integerPart = padded.slice(0, -decimals)
  const fractionalPart = padded.slice(-decimals).replace(/0+$/, '')

  return `${isNegative ? '-' : ''}${integerPart}${fractionalPart ? `.${fractionalPart}` : ''}`
}

function buildFeedbackUri(reason: string, tag1: string, value: string) {
  if (!reason.trim()) return ''

  const payload = {
    source: 'fajuarc-agents',
    tag1,
    value,
    reasoning: reason.trim(),
    createdAt: new Date().toISOString(),
  }

  return `data:application/json,${encodeURIComponent(JSON.stringify(payload))}`
}

export function createReputationWritePayload(input: {
  agentId: string
  value: string
  valueDecimals?: number
  tag1: string
  tag2?: string
  endpoint?: string
  reason?: string
}) {
  const normalizedValue = input.value.trim()
  if (!normalizedValue) {
    throw new Error('Reputation value is required.')
  }

  if (!/^-?\d+$/.test(normalizedValue)) {
    throw new Error('Reputation value must be an integer. Use valueDecimals for precision if needed.')
  }

  const valueDecimals = input.valueDecimals ?? 0
  if (valueDecimals < 0 || valueDecimals > 18) {
    throw new Error('valueDecimals must be between 0 and 18.')
  }

  return {
    agentId: BigInt(input.agentId),
    value: BigInt(normalizedValue),
    valueDecimals,
    tag1: input.tag1,
    tag2: input.tag2 ?? '',
    endpoint: input.endpoint ?? 'fajuarc://agents/reputation',
    feedbackURI: buildFeedbackUri(input.reason ?? '', input.tag1, normalizedValue),
    feedbackHash: EMPTY_BYTES32,
  }
}

export async function readAgentReputation(
  publicClient: PublicClient,
  agentId: string
): Promise<AgentReputationSummary> {
  const normalizedAgentId = BigInt(agentId)

  let entries: AgentReputationEntry[] = []

  try {
    const [clients, feedbackIndexes, values, valueDecimals, tag1s, tag2s, revokedStatuses] =
      await publicClient.readContract({
      address: ERC8004.reputationRegistry,
      abi: reputationRegistryAbi,
      functionName: 'readAllFeedback',
      args: [normalizedAgentId, [], '', '', true],
    })

    entries = clients.map((clientAddress, index) => ({
      clientAddress,
      feedbackIndex: feedbackIndexes[index]?.toString() ?? '0',
      value: values[index] ?? 0n,
      valueDecimals: Number(valueDecimals[index] ?? 0),
      tag1: tag1s[index] ?? '',
      tag2: tag2s[index] ?? '',
      revoked: Boolean(revokedStatuses[index]),
    }))
  } catch {
    entries = []
  }

  let feedbackLogs: Awaited<ReturnType<typeof publicClient.getLogs<typeof reputationRegistryNewFeedbackEvent>>> = []
  let revokedLogs: Awaited<ReturnType<typeof publicClient.getLogs<typeof reputationRegistryFeedbackRevokedEvent>>> = []

  try {
    const boundedLogs = await getBoundedFeedbackLogs(publicClient, normalizedAgentId)
    feedbackLogs = boundedLogs.feedbackLogs
    revokedLogs = boundedLogs.revokedLogs
  } catch {
    feedbackLogs = []
    revokedLogs = []
  }

  if (entries.length === 0 && feedbackLogs.length > 0) {
    const revokedKeys = new Set(
      revokedLogs.map((log) => `${log.args.clientAddress?.toLowerCase()}:${log.args.feedbackIndex?.toString()}`)
    )

    entries = feedbackLogs.map((log) => ({
      clientAddress: log.args.clientAddress as Address,
      feedbackIndex: log.args.feedbackIndex?.toString() ?? '0',
      value: log.args.value ?? 0n,
      valueDecimals: Number(log.args.valueDecimals ?? 0),
      tag1: log.args.tag1 ?? '',
      tag2: log.args.tag2 ?? '',
      revoked: revokedKeys.has(
        `${(log.args.clientAddress as Address).toLowerCase()}:${log.args.feedbackIndex?.toString() ?? '0'}`
      ),
    }))
  }

  const activeEntries = entries.filter((entry) => !entry.revoked)
  const uniqueClients = Array.from(new Set(activeEntries.map((entry) => entry.clientAddress.toLowerCase()))).map(
    (clientAddress) => clientAddress as Address
  )

  let summaryValue: bigint | null = null
  let summaryValueDecimals: number | null = null

  if (uniqueClients.length > 0) {
    try {
      const [count, nextSummaryValue, nextSummaryValueDecimals] = await publicClient.readContract({
        address: ERC8004.reputationRegistry,
        abi: reputationRegistryAbi,
        functionName: 'getSummary',
        args: [normalizedAgentId, uniqueClients, '', ''],
      })

      if (count > 0n) {
        summaryValue = nextSummaryValue
        summaryValueDecimals = Number(nextSummaryValueDecimals)
      }
    } catch {
      summaryValue = null
      summaryValueDecimals = null
    }
  }

  const latestLog = feedbackLogs[feedbackLogs.length - 1]
  const latestActivity = latestLog
    ? {
        clientAddress: latestLog.args.clientAddress as Address,
        feedbackIndex: latestLog.args.feedbackIndex?.toString() ?? '0',
        value: latestLog.args.value ?? 0n,
        valueDecimals: Number(latestLog.args.valueDecimals ?? 0),
        tag1: latestLog.args.tag1 ?? '',
        tag2: latestLog.args.tag2 ?? '',
        endpoint: latestLog.args.endpoint ?? '',
        feedbackURI: latestLog.args.feedbackURI ?? '',
        feedbackHash: (latestLog.args.feedbackHash ?? EMPTY_BYTES32) as `0x${string}`,
      }
    : null

  return {
    totalEntries: entries.length,
    activeEntries: activeEntries.length,
    positiveCount: activeEntries.filter((entry) => entry.value > 0n).length,
    negativeCount: activeEntries.filter((entry) => entry.value < 0n).length,
    neutralCount: activeEntries.filter((entry) => entry.value === 0n).length,
    summaryValue,
    summaryValueDecimals,
    latestActivity,
    entries,
  }
}
