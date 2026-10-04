import { getAddress } from 'viem'
import { ARC_PILOT_METADATA_URI } from '@/lib/agentMetadata'

export const ERC8004 = {
  identityRegistry: getAddress('0x8004A818BFB912233c491871b3d84c89A494BD9e'),
  reputationRegistry: getAddress('0x8004B663056A597Dffe9eCcC1965A193B7388713'),
  validationRegistry: getAddress('0x8004Cb1BF31DAf7788923b405b754f57acEB4272'),
  defaultMetadataUri: ARC_PILOT_METADATA_URI,
} as const
