import { parseAbiItem } from 'viem'

export const identityRegistryAbi = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'metadataURI', type: 'string' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenURI',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'string' }],
  },
] as const

export const identityRegistryTransferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
)
