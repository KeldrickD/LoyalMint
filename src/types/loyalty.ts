export interface PointsTransaction {
    type: 'MINT' | 'REDEEM' | 'TRANSFER' | 'EXPIRE';
    amount: number;
    timestamp: number;
    signature: string;
    description?: string;
    recipientAddress?: string;
}

export interface PointsBlock {
    amount: number;
    expirationDate: number;
    mintDate: number;
}

export interface RewardOption {
    id: string;
    name: string;
    pointsCost: number;
    description: string;
    icon: string;
}

export const TIERS = {
    BRONZE: { min: 0, max: 99, multiplier: 1, color: '#CD7F32' },
    SILVER: { min: 100, max: 499, multiplier: 1.2, color: '#C0C0C0' },
    GOLD: { min: 500, max: 999, multiplier: 1.5, color: '#FFD700' },
    PLATINUM: { min: 1000, multiplier: 2, color: '#E5E4E2' }
} as const;

export const REWARDS: RewardOption[] = [
    { 
        id: 'discount10', 
        name: '10% Discount', 
        pointsCost: 100, 
        description: 'Get 10% off your next purchase',
        icon: '🏷️'
    },
    { 
        id: 'freeItem', 
        name: 'Free Item', 
        pointsCost: 200, 
        description: 'Redeem for a free item',
        icon: '🎁'
    },
    { 
        id: 'vipStatus', 
        name: 'VIP Status', 
        pointsCost: 1000, 
        description: 'Unlock VIP benefits for 30 days',
        icon: '👑'
    }
];

export type TierKey = keyof typeof TIERS; 