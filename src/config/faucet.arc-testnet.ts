/**
 * MultiTokenFaucet config — Arc Testnet
 * Faucet: 0xeb625A5022057c7E0CAA1Aa7900cD0A44bc3FD81
 */

import { ARC_TESTNET } from './arcTestnet'

export const FAUCET_ADDRESS = '0xb6e4c250394Bb0f9b577991C7f4aCF9f6E652017' as `0x${string}`

export const FAUCET_ABI = [
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [],
  },
  {
    name: 'remaining',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'addToken',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'claimAmount', type: 'uint256' },
      { name: 'cooldownSeconds', type: 'uint256' },
    ],
    outputs: [],
  },
  { name: 'TokenNotEnabled', type: 'error', inputs: [] },
  { name: 'CooldownActive', type: 'error', inputs: [{ name: 'remaining', type: 'uint256' }] },
  { name: 'InsufficientFaucetBalance', type: 'error', inputs: [] },
] as const

export const FAUCET_TOKENS = [
  { symbol: 'FAJU', address: ARC_TESTNET.addresses.faju, decimals: 18, claimAmount: '10' },
  { symbol: 'ARCX', address: ARC_TESTNET.addresses.arcx, decimals: 18, claimAmount: '10' },
] as const

export const ARC_TESTNET_CHAIN_ID = ARC_TESTNET.chainId
