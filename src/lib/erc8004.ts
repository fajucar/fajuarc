import type { Address, PublicClient } from 'viem'
import { ERC8004 } from '@/config/erc8004'
import { identityRegistryAbi, identityRegistryTransferEvent } from '@/abis/identityRegistryAbi'

/** getLogs return type is not always narrowed to include decoded `args`; we only read Transfer tokenId. */
type IdentityTransferLog = { args?: { tokenId?: bigint } }

export type RegisteredAgentIdentity = {
  agentId: string
  owner: Address
  metadataUri: string
}

export async function findLatestIdentityRegistryTokenIdForOwner(
  publicClient: PublicClient,
  owner: Address,
  fromBlock?: bigint
) {
  const logs = await publicClient.getLogs({
    address: ERC8004.identityRegistry,
    event: identityRegistryTransferEvent,
    args: { to: owner },
    fromBlock: fromBlock ?? 0n,
    toBlock: 'latest',
  })

  const latestLog = logs[logs.length - 1] as IdentityTransferLog | undefined
  const tokenId = latestLog?.args?.tokenId

  return tokenId ? tokenId.toString() : null
}

/**
 * All IdentityRegistry token IDs currently owned by `owner` (verifies ownerOf after Transfer logs).
 */
export async function findOwnedIdentityRegistryTokenIdsForOwner(
  publicClient: PublicClient,
  owner: Address
): Promise<string[]> {
  let logs: Awaited<ReturnType<PublicClient['getLogs']>>
  try {
    logs = await publicClient.getLogs({
      address: ERC8004.identityRegistry,
      event: identityRegistryTransferEvent,
      args: { to: owner },
      fromBlock: 0n,
      toBlock: 'latest',
    })
  } catch {
    const fallback = await findLatestIdentityRegistryTokenIdForOwner(publicClient, owner)
    if (!fallback) return []
    try {
      const o = await publicClient.readContract({
        address: ERC8004.identityRegistry,
        abi: identityRegistryAbi,
        functionName: 'ownerOf',
        args: [BigInt(fallback)],
      }) as Address
      return o.toLowerCase() === owner.toLowerCase() ? [fallback] : []
    } catch {
      return []
    }
  }

  const candidateIds = new Set<string>()
  for (const log of logs) {
    const tid = (log as IdentityTransferLog).args?.tokenId
    if (tid !== undefined) candidateIds.add(tid.toString())
  }

  const verified: string[] = []
  for (const idStr of candidateIds) {
    try {
      const o = (await publicClient.readContract({
        address: ERC8004.identityRegistry,
        abi: identityRegistryAbi,
        functionName: 'ownerOf',
        args: [BigInt(idStr)],
      })) as Address
      if (o.toLowerCase() === owner.toLowerCase()) verified.push(idStr)
    } catch {
      // invalid / burned
    }
  }

  verified.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0))
  return verified
}

export async function readRegisteredAgentIdentity(
  publicClient: PublicClient,
  agentId: string
): Promise<RegisteredAgentIdentity> {
  const tokenId = BigInt(agentId)

  const [owner, metadataUri] = await Promise.all([
    publicClient.readContract({
      address: ERC8004.identityRegistry,
      abi: identityRegistryAbi,
      functionName: 'ownerOf',
      args: [tokenId],
    }) as Promise<Address>,
    publicClient.readContract({
      address: ERC8004.identityRegistry,
      abi: identityRegistryAbi,
      functionName: 'tokenURI',
      args: [tokenId],
    }) as Promise<string>,
  ])

  return {
    agentId,
    owner,
    metadataUri,
  }
}
