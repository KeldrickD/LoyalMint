import { BN } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';

export interface LoyaltyAccount {
    points: BN;
    owner: PublicKey;
} 