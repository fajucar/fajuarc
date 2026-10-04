/**
 * useArcWriteContract — MetaMask (wagmi) ou Privy embedded (assinatura no browser)
 */

import { useState } from 'react'
import { useWriteContract, usePublicClient, useConfig } from 'wagmi'
import { ARC_CHAIN_ID, ensureWalletOnArc } from '@/lib/arcNetwork'
import { useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, type Abi, type PublicClient } from 'viem'
import { arcMainnet } from '@/config/chains'
import { arcMainnet as privyArcMainnet } from '@/config/privy'
import { useArcWallet } from './useArcWallet'

type WriteContractParams = {
  address: `0x${string}`
  abi: Abi | readonly unknown[]
  functionName: string
  args?: readonly unknown[]
  value?: bigint
}

function isPrivyEmbeddedWallet(wallet: { walletClientType?: string; connectorType?: string }) {
  return (
    wallet.walletClientType === 'privy' ||
    wallet.walletClientType === 'privy-v2' ||
    wallet.connectorType === 'embedded'
  )
}

// Arc Testnet: eth_estimateGas can return 0 or error on certain calls.
// Always pre-estimate with +20% buffer; fall back to 300k if it fails.
async function estimateGasWithFallback(
  publicClient: PublicClient,
  params: WriteContractParams,
  account: `0x${string}`
): Promise<bigint> {
  try {
    const est = await publicClient.estimateContractGas({
      address: params.address,
      abi: params.abi as Abi,
      functionName: params.functionName,
      args: params.args ?? [],
      account,
      value: params.value,
    })
    return (est * BigInt(120)) / BigInt(100)
  } catch {
    return BigInt(300_000)
  }
}

export function useArcWriteContract() {
  const { authMethod, signingAddress, getWalletClient, hasEmbeddedWallet } = useArcWallet()
  const { wallets } = useWallets()
  const wagmiConfig = useConfig()
  // Always Arc: without an explicit chainId this follows the wallet's current
  // network, so gas would be estimated on the wrong chain.
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })

  const { writeContractAsync: wagmiWriteAsync, isPending: wagmiPending } = useWriteContract()

  const [socialPending, setSocialPending] = useState(false)
  const [socialError, setSocialError] = useState<Error | null>(null)

  const isPending = authMethod === 'wallet' ? wagmiPending : socialPending
  const error = authMethod === 'wallet' ? null : socialError

  const writeContractAsync = async (params: WriteContractParams): Promise<`0x${string}`> => {
    // ── MetaMask / injected wallet ────────────────────────────────────────────
    if (authMethod === 'wallet') {
      // The wallet may be on another network: switch to Arc first (or stop with
      // "Switch your wallet to Arc Mainnet"), and pin chainId so viem refuses to
      // sign on any other chain even if the wallet changes network meanwhile.
      await ensureWalletOnArc(wagmiConfig)
      const from = signingAddress
      if (from && publicClient) {
        const gas = await estimateGasWithFallback(publicClient, params, from)
        return wagmiWriteAsync({ ...params, gas, chainId: ARC_CHAIN_ID } as any)
      }
      return wagmiWriteAsync({ ...params, chainId: ARC_CHAIN_ID } as any)
    }

    // ── Privy embedded / social wallet ────────────────────────────────────────
    const from = signingAddress
    if (!from) {
      throw new Error(
        hasEmbeddedWallet
          ? 'Signing wallet unavailable.'
          : 'Wait for the Privy wallet to be created to sign transactions.'
      )
    }

    const privyWallet = wallets.find(isPrivyEmbeddedWallet) ?? wallets.find((w) => w.address)

    if (privyWallet) {
      setSocialPending(true)
      setSocialError(null)
      try {
        await privyWallet.switchChain(privyArcMainnet.id)
        const provider = await privyWallet.getEthereumProvider()
        const walletClient = createWalletClient({
          account: from,
          chain: arcMainnet,
          transport: custom(provider),
        })
        const gas = publicClient
          ? await estimateGasWithFallback(publicClient, params, from)
          : BigInt(300_000)
        const hash = await walletClient.writeContract({
          address: params.address,
          abi: params.abi as Abi,
          functionName: params.functionName,
          args: params.args ?? [],
          value: params.value,
          gas,
          account: from,
          chain: arcMainnet,
        })
        if (publicClient) await publicClient.waitForTransactionReceipt({ hash })
        return hash
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        setSocialError(e)
        throw e
      } finally {
        setSocialPending(false)
      }
    }

    const client = await getWalletClient()
    if (!client) {
      throw new Error('Privy wallet not ready. Log in and wait a few seconds.')
    }

    setSocialPending(true)
    setSocialError(null)
    try {
      const gas = publicClient
        ? await estimateGasWithFallback(publicClient, params, from)
        : BigInt(300_000)
      const hash = await client.writeContract({
        address: params.address,
        abi: params.abi as Abi,
        functionName: params.functionName,
        args: params.args ?? [],
        value: params.value,
        gas,
        account: from,
        chain: arcMainnet,
      })
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash })
      return hash
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setSocialError(e)
      throw e
    } finally {
      setSocialPending(false)
    }
  }

  return { writeContractAsync, isPending, error }
}
