export type Web3Status = 'disconnected' | 'connecting' | 'connected' | 'wrong_network';

export interface WalletState {
  address: string | null;
  status: Web3Status;
  chainId: number | null;
}





