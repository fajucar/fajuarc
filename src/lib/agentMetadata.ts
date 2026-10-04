export type AgentMetadata = {
  name?: string
  description?: string
  image?: string
  agent_type?: string
  capabilities?: string[]
  version?: string
}

export const ARC_PILOT_NAME = 'ArcPilot'
export const ARC_PILOT_TAGLINE = 'Your onchain guide for swaps, pools, and reputation on Arc.'

export const ARC_PILOT_METADATA: AgentMetadata = {
  name: ARC_PILOT_NAME,
  description:
    'Your onchain guide for swaps, pools, and reputation on Arc. Designed to assist users with DeFi actions, onboarding, and intelligent interaction across the FajuARC ecosystem.',
  image: 'ipfs://REPLACE_WITH_IMAGE',
  agent_type: 'defi_assistant',
  capabilities: [
    'swap_guidance',
    'pool_discovery',
    'onboarding_support',
    'reputation_tracking',
  ],
  version: '1.1',
}

const AGENT_METADATA_OVERRIDES_STORAGE_KEY = 'fajuarc:agents:metadata-overrides'

export function createAgentMetadataUri(metadata: AgentMetadata) {
  return `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`
}

export const ARC_PILOT_METADATA_URI = createAgentMetadataUri(ARC_PILOT_METADATA)

function parseDataUri(uri: string) {
  const match = uri.match(/^data:(.*?),(.*)$/)
  if (!match) return null

  const [, meta, payload] = match
  const isBase64 = meta.includes(';base64')

  try {
    return isBase64
      ? atob(payload)
      : decodeURIComponent(payload)
  } catch {
    return null
  }
}

export function ipfsToHttp(uri: string) {
  const trimmed = uri.trim()

  if (trimmed.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${trimmed.replace('ipfs://', '')}`
  }

  return trimmed
}

export function getAgentMetadataViewUrl(uri: string) {
  if (!uri) return null
  return uri.startsWith('ipfs://') ? ipfsToHttp(uri) : uri
}

export function resolveAgentImageUrl(image?: string | null, metadataOrigin?: string) {
  const value = image?.trim()
  if (!value || value.includes('REPLACE_WITH_IMAGE')) return null
  if (value.startsWith('data:')) return value
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  if (value.startsWith('ipfs://')) return ipfsToHttp(value)
  if (value.startsWith('/')) {
    const origin = typeof window !== 'undefined' ? window.location.origin : metadataOrigin || ''
    return origin ? `${origin}${value}` : value
  }

  return value
}

function readMetadataOverridesStorage() {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(AGENT_METADATA_OVERRIDES_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, AgentMetadata>) : {}
  } catch {
    return {}
  }
}

export function loadAgentMetadataOverride(agentId: string) {
  return readMetadataOverridesStorage()[agentId] ?? null
}

export function saveAgentMetadataOverride(agentId: string, metadata: AgentMetadata) {
  if (typeof window === 'undefined') return

  const current = readMetadataOverridesStorage()

  try {
    window.localStorage.setItem(
      AGENT_METADATA_OVERRIDES_STORAGE_KEY,
      JSON.stringify({
        ...current,
        [agentId]: metadata,
      })
    )
  } catch {
    // Ignore local storage failures and keep in-memory state.
  }
}

export function normalizeAgentMetadata(metadata: AgentMetadata | null | undefined): AgentMetadata {
  if (!metadata) {
    return ARC_PILOT_METADATA
  }

  const normalizedName =
    metadata.name?.trim().toLowerCase() === 'fajuarc assistant'
      ? ARC_PILOT_NAME
      : metadata.name?.trim() || ARC_PILOT_NAME

  const normalizedDescription =
    metadata.description?.trim() ||
    ARC_PILOT_TAGLINE

  const normalizedImage =
    metadata.image?.trim() && !metadata.image.includes('REPLACE_WITH_IMAGE')
      ? metadata.image.trim()
      : undefined

  return {
    ...ARC_PILOT_METADATA,
    ...metadata,
    name: normalizedName,
    description: normalizedDescription,
    image: normalizedImage,
  }
}

export async function fetchAgentMetadata(uri: string): Promise<AgentMetadata | null> {
  if (!uri) return null

  try {
    if (uri.startsWith('data:')) {
      const content = parseDataUri(uri)
      return content ? normalizeAgentMetadata(JSON.parse(content) as AgentMetadata) : null
    }

    const response = await fetch(ipfsToHttp(uri))
    if (!response.ok) return null

    const metadata = (await response.json()) as AgentMetadata
    return normalizeAgentMetadata(metadata)
  } catch {
    return null
  }
}
