/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FAJUCAR_COLLECTION_ADDRESS?: string
  readonly VITE_RPC_URL?: string
  readonly VITE_CHAIN_ID?: string
  readonly VITE_MOCK_USDC_ADDRESS?: string
  readonly VITE_GIFT_CARD_MINTER_ADDRESS?: string
  readonly VITE_ARC_COLLECTION_ADDRESS?: string
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string
  readonly VITE_DEX_ROUTER_ADDRESS?: string
  readonly VITE_DEX_FACTORY_ADDRESS?: string
  readonly VITE_DEX_PAIR_ADDRESS?: string
  readonly VITE_FAJU_FARM_ADDRESS?: string
  readonly VITE_V3_FACTORY?: string
  readonly VITE_V3_SWAP_ROUTER?: string
  readonly VITE_V3_POSITION_MANAGER?: string
  readonly VITE_V3_QUOTER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
  readonly hot?: {
    accept(): void
    accept(cb: (mod: any) => void): void
    accept(dep: string, cb: (mod: any) => void): void
    accept(deps: string[], cb: (mods: any[]) => void): void
    dispose(cb: (data: any) => void): void
    decline(): void
    invalidate(): void
    on(event: string, cb: (...args: any[]) => void): void
    off(event: string, cb: (...args: any[]) => void): void
    send(event: string, data?: any): void
  }
}
















