import { LoyalMint } from './loyalmint';
import { Program } from '@project-serum/anchor';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';

export type LoyalMintProgram = Program<LoyalMint>;

export interface WalletContextState {
    wallet: any | null;
    publicKey: PublicKey | null;
    signTransaction: (transaction: Transaction) => Promise<Transaction>;
    signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
    signMessage: (message: Uint8Array) => Promise<Uint8Array>;
    sendTransaction: (transaction: Transaction, connection: Connection) => Promise<string>;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    connecting: boolean;
} 