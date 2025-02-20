import React, { FC, useCallback, useEffect, useState, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
    PublicKey, 
    LAMPORTS_PER_SOL,
    Transaction,
    SystemProgram,
    sendAndConfirmTransaction 
} from '@solana/web3.js';
import { AnchorProvider, BN, Program } from '@project-serum/anchor';
import { LoyaltyAccount } from './types';
import { LoyalMint } from './idl/loyalmint';
import { LoyalMintProgram } from './idl/types';
import idl from './idl/loyalmint.json';
import { 
    PointsTransaction, 
    PointsBlock, 
    TIERS, 
    REWARDS,
    TierKey 
} from './types/loyalty';

const PROGRAM_ID = new PublicKey('BwGW3VSbnjRyVKhoPKSjQm1igdEtamJvFxzZvSHatT2A');
const MINT_FEE = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL fee

interface LoyaltyAccountData extends LoyaltyAccount {
    points: BN;
    mint: PublicKey;
}

const Dashboard: FC = () => {
    const { connection } = useConnection();
    const { publicKey, connected, signTransaction } = useWallet();
    const [balance, setBalance] = useState<number>(0);
    const [points, setPoints] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [transactions, setTransactions] = useState<PointsTransaction[]>([]);
    const [pointsBlocks, setPointsBlocks] = useState<PointsBlock[]>([]);
    const [transferAmount, setTransferAmount] = useState<number>(0);
    const [recipientAddress, setRecipientAddress] = useState<string>('');

    const currentTier = useMemo((): TierKey => {
        if (points >= TIERS.PLATINUM.min) return 'PLATINUM';
        if (points >= TIERS.GOLD.min) return 'GOLD';
        if (points >= TIERS.SILVER.min) return 'SILVER';
        return 'BRONZE';
    }, [points]);

    const expiringPoints = useMemo(() => {
        const thirtyDaysFromNow = Date.now() + (30 * 24 * 60 * 60 * 1000);
        return pointsBlocks
            .filter(block => block.expirationDate < thirtyDaysFromNow)
            .reduce((total, block) => total + block.amount, 0);
    }, [pointsBlocks]);

    const addTransaction = useCallback((
        type: PointsTransaction['type'],
        amount: number,
        signature: string,
        description?: string,
        recipientAddress?: string
    ) => {
        setTransactions(prev => [{
            type,
            amount,
            timestamp: Date.now(),
            signature,
            description,
            recipientAddress
        }, ...prev]);
    }, []);

    const addPointsBlock = useCallback((amount: number) => {
        const expirationDate = Date.now() + (90 * 24 * 60 * 60 * 1000); // 90 days
        setPointsBlocks(prev => [...prev, {
            amount,
            mintDate: Date.now(),
            expirationDate
        }]);
    }, []);

    const getProgram = useCallback((): LoyalMintProgram | null => {
        if (!publicKey) return null;

        const provider = new AnchorProvider(
            connection,
            publicKey as any,
            { commitment: 'processed' }
        );

        return new Program(
            idl as any,
            PROGRAM_ID,
            provider
        ) as LoyalMintProgram;
    }, [connection, publicKey]);

    const fetchPoints = useCallback(async () => {
        if (!publicKey) return;

        try {
            const program = getProgram();
            if (!program) return;

            const [loyaltyAccount] = await PublicKey.findProgramAddress(
                [Buffer.from("loyalty"), publicKey.toBuffer()],
                PROGRAM_ID
            );

            const account = await program.account.loyaltyAccount.fetch(loyaltyAccount) as LoyaltyAccountData;
            setPoints(account.points.toNumber());
        } catch (err) {
            console.error('Error fetching points:', err);
            setError('Failed to fetch points balance');
        }
    }, [publicKey, getProgram]);

    useEffect(() => {
        if (!connection || !publicKey) return;

        const getBalance = async () => {
            try {
                const balance = await connection.getBalance(publicKey);
                setBalance(balance / LAMPORTS_PER_SOL);
            } catch (err) {
                console.error('Error fetching balance:', err);
            }
        };

        getBalance();
        const interval = setInterval(getBalance, 1000);
        return () => clearInterval(interval);
    }, [connection, publicKey]);

    useEffect(() => {
        fetchPoints();
    }, [fetchPoints]);

    const handleMintPoints = useCallback(async () => {
        if (!publicKey || !signTransaction) {
            alert('Please connect your wallet first!');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const program = getProgram() as Program<LoyalMint>;
            if (!program) throw new Error('Program not initialized');

            const [loyaltyAccount] = await PublicKey.findProgramAddress(
                [Buffer.from("loyalty"), publicKey.toBuffer()],
                PROGRAM_ID
            );

            const transaction = new Transaction();
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: PROGRAM_ID,
                    lamports: MINT_FEE,
                })
            );

            const mintInstruction = await program.methods
                .mintPoints()
                .accounts({
                    user: publicKey,
                    loyaltyAccount,
                })
                .instruction();

            transaction.add(mintInstruction);

            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            const signedTx = await signTransaction(transaction);
            const signature = await sendAndConfirmTransaction(
                connection,
                signedTx,
                [],
                {
                    commitment: 'confirmed',
                    maxRetries: 5
                }
            );

            // Add points block with expiration
            const pointsEarned = 10 * TIERS[currentTier].multiplier; // Apply tier multiplier
            addPointsBlock(pointsEarned);

            // Add transaction to history
            addTransaction(
                'MINT',
                pointsEarned,
                signature,
                `Minted ${pointsEarned} points with ${TIERS[currentTier].multiplier}x multiplier`
            );

            await fetchPoints();
            alert(`Points minted successfully!\nPoints earned: ${pointsEarned}\nFee paid: ${MINT_FEE / LAMPORTS_PER_SOL} SOL\nTransaction: ${signature}`);
        } catch (err: any) {
            console.error('Error:', err);
            setError(err.message);
            alert(`Transaction failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, [publicKey, getProgram, fetchPoints, connection, signTransaction, currentTier, addPointsBlock, addTransaction]);

    const handleRedeemPoints = useCallback(async () => {
        if (!publicKey || points < 10) {
            alert('Insufficient points! Need at least 10 points to redeem.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const program = getProgram();
            if (!program) throw new Error('Program not initialized');

            const [loyaltyAccount] = await PublicKey.findProgramAddress(
                [Buffer.from("loyalty"), publicKey.toBuffer()],
                PROGRAM_ID
            );

            await program.methods
                .redeemPoints(new BN(10))
                .accounts({
                    user: publicKey,
                    loyaltyAccount,
                })
                .rpc();

            await fetchPoints();
            alert('Points redeemed successfully!');
        } catch (err: any) {
            console.error('Error:', err);
            setError(err.message);
            alert(`Redemption failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, [publicKey, getProgram, fetchPoints, points]);

    const handleRedeemReward = useCallback(async (reward: typeof REWARDS[0]) => {
        if (!publicKey || points < reward.pointsCost) {
            alert('Insufficient points for this reward');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const program = getProgram();
            if (!program) throw new Error('Program not initialized');

            const [loyaltyAccount] = await PublicKey.findProgramAddress(
                [Buffer.from("loyalty"), publicKey.toBuffer()],
                PROGRAM_ID
            );

            await program.methods
                .redeemPoints(new BN(reward.pointsCost))
                .accounts({
                    user: publicKey,
                    loyaltyAccount,
                })
                .rpc();

            addTransaction(
                'REDEEM',
                reward.pointsCost,
                'reward-redemption',
                `Redeemed ${reward.name} (${reward.pointsCost} points)`
            );

            await fetchPoints();
            alert(`Successfully redeemed ${reward.name}!`);
        } catch (err: any) {
            console.error('Error:', err);
            setError(err.message);
            alert(`Redemption failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, [publicKey, points, getProgram, addTransaction, fetchPoints]);

    const ExpirationNotice: FC = () => {
        if (expiringPoints <= 0) return null;

        return (
            <div style={{
                marginTop: '20px',
                padding: '15px',
                background: '#FFF3CD',
                borderRadius: '8px',
                color: '#856404',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.9em'
            }}>
                <span style={{ fontSize: '20px' }}>⚠️</span>
                <div>
                    <strong>{expiringPoints} points will expire in the next 30 days.</strong>
                    <p style={{ margin: '5px 0 0 0', fontSize: '0.9em' }}>
                        Use them before they expire!
                    </p>
                </div>
            </div>
        );
    };

    const TransactionHistory: FC = () => {
        return (
            <div style={{
                marginTop: '20px',
                background: '#2a2f3e',
                borderRadius: '8px',
                overflow: 'hidden'
            }}>
                <h3 style={{ padding: '15px', borderBottom: '1px solid #3a3f4e' }}>
                    Transaction History
                </h3>
                <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                    {transactions.length === 0 ? (
                        <p style={{ padding: '15px', color: '#888' }}>No transactions yet</p>
                    ) : (
                        transactions.map((tx, index) => (
                            <div key={index} style={{
                                padding: '15px',
                                borderBottom: '1px solid #3a3f4e',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <span style={{
                                        color: tx.type === 'MINT' ? '#4CAF50' : 
                                               tx.type === 'REDEEM' ? '#2196F3' : 
                                               tx.type === 'TRANSFER' ? '#FFC107' : '#FF5722'
                                    }}>
                                        {tx.type}
                                    </span>
                                    <p style={{ margin: '5px 0', color: '#888' }}>
                                        {new Date(tx.timestamp).toLocaleString()}
                                    </p>
                                    {tx.description && (
                                        <p style={{ margin: '5px 0', fontSize: '0.9em' }}>
                                            {tx.description}
                                        </p>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontWeight: 'bold' }}>
                                        {tx.type === 'MINT' ? '+' : '-'}{tx.amount} points
                                    </p>
                                    <a 
                                        href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: '#888', fontSize: '0.8em' }}
                                    >
                                        View transaction ↗
                                    </a>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    const TierDisplay: FC = () => {
        return (
            <div style={{
                marginTop: '20px',
                background: '#2a2f3e',
                borderRadius: '8px',
                padding: '15px'
            }}>
                <h3 style={{ marginBottom: '15px' }}>Your Tier Status</h3>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '10px'
                }}>
                    {(Object.entries(TIERS) as [TierKey, typeof TIERS[TierKey]][]).map(([tier, details]) => (
                        <div key={tier} style={{
                            flex: 1,
                            padding: '15px',
                            background: currentTier === tier ? `${details.color}22` : '#1a1f2e',
                            borderRadius: '8px',
                            border: currentTier === tier ? `2px solid ${details.color}` : '2px solid transparent',
                            textAlign: 'center'
                        }}>
                            <h4 style={{ color: details.color }}>{tier}</h4>
                            <p style={{ fontSize: '0.9em', color: '#888' }}>
                                {details.min}+ points
                            </p>
                            <p style={{ fontSize: '0.8em', marginTop: '5px' }}>
                                {details.multiplier}x multiplier
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const RewardsDisplay: FC = () => {
        const handleRewardSelect = async (reward: typeof REWARDS[0]) => {
            if (points < reward.pointsCost) {
                alert(`Insufficient points. Need ${reward.pointsCost} points.`);
                return;
            }
            await handleRedeemReward(reward);
        };

        return (
            <div style={{
                marginTop: '20px',
                background: '#2a2f3e',
                borderRadius: '8px',
                padding: '15px'
            }}>
                <h3 style={{ marginBottom: '15px' }}>Available Rewards</h3>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '15px'
                }}>
                    {REWARDS.map(reward => (
                        <div key={reward.id} style={{
                            padding: '15px',
                            background: '#1a1f2e',
                            borderRadius: '8px',
                            border: points >= reward.pointsCost ? '2px solid #4CAF50' : '2px solid #666'
                        }}>
                            <div style={{ fontSize: '24px', marginBottom: '10px' }}>
                                {reward.icon}
                            </div>
                            <h4>{reward.name}</h4>
                            <p style={{ fontSize: '0.9em', color: '#888', margin: '5px 0' }}>
                                {reward.description}
                            </p>
                            <p style={{ 
                                color: points >= reward.pointsCost ? '#4CAF50' : '#666',
                                marginBottom: '10px'
                            }}>
                                {reward.pointsCost} points
                            </p>
                            <button
                                onClick={() => handleRewardSelect(reward)}
                                disabled={points < reward.pointsCost || loading}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: points >= reward.pointsCost ? '#4CAF50' : '#1e2330',
                                    color: points >= reward.pointsCost ? 'white' : '#666',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: points >= reward.pointsCost ? 'pointer' : 'not-allowed'
                                }}
                            >
                                {points >= reward.pointsCost ? 'Redeem Reward' : 'Insufficient Points'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const PointsBreakdown: FC = () => {
        const activePoints = pointsBlocks.reduce((total, block) => 
            block.expirationDate > Date.now() ? total + block.amount : total, 0
        );

        return (
            <div style={{
                marginTop: '15px',
                padding: '15px',
                background: '#2a2f3e',
                borderRadius: '8px',
                fontSize: '0.9em'
            }}>
                <h4 style={{ marginBottom: '10px' }}>Points Breakdown</h4>
                <div style={{ display: 'grid', gap: '8px' }}>
                    <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        padding: '8px',
                        background: '#1a1f2e',
                        borderRadius: '4px'
                    }}>
                        <span>Active Points:</span>
                        <span style={{ color: '#4CAF50' }}>{activePoints}</span>
                    </div>
                    <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        padding: '8px',
                        background: '#1a1f2e',
                        borderRadius: '4px'
                    }}>
                        <span>Expiring Soon:</span>
                        <span style={{ color: '#FFC107' }}>{expiringPoints}</span>
                    </div>
                    <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        padding: '8px',
                        background: '#1a1f2e',
                        borderRadius: '4px'
                    }}>
                        <span>Current Multiplier:</span>
                        <span style={{ color: TIERS[currentTier].color }}>
                            {TIERS[currentTier].multiplier}x
                        </span>
                    </div>
                </div>
            </div>
        );
    };

    const PointsManagement: FC = () => {
        const [activeTab, setActiveTab] = useState<'redeem' | 'transfer'>('redeem');

        const handleTransfer = async () => {
            if (!transferAmount || !recipientAddress) {
                alert('Please enter amount and recipient address');
                return;
            }

            if (transferAmount > points) {
                alert('Insufficient points balance');
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const recipientPubkey = new PublicKey(recipientAddress);
                const program = getProgram();
                if (!program || !publicKey) throw new Error('Program not initialized');

                const [senderLoyaltyAccount] = await PublicKey.findProgramAddress(
                    [Buffer.from("loyalty"), publicKey.toBuffer()],
                    PROGRAM_ID
                );

                const [recipientLoyaltyAccount] = await PublicKey.findProgramAddress(
                    [Buffer.from("loyalty"), recipientPubkey.toBuffer()],
                    PROGRAM_ID
                );

                const signature = await program.methods
                    .transferPoints(new BN(transferAmount))
                    .accounts({
                        from: publicKey,
                        to: recipientPubkey,
                        fromLoyaltyAccount: senderLoyaltyAccount,
                        toLoyaltyAccount: recipientLoyaltyAccount,
                    })
                    .rpc();

                addTransaction(
                    'TRANSFER',
                    transferAmount,
                    signature,
                    `Transferred to ${recipientAddress.slice(0, 4)}...${recipientAddress.slice(-4)}`,
                    recipientAddress
                );

                await fetchPoints();
                setTransferAmount(0);
                setRecipientAddress('');
                alert('Points transferred successfully!');
            } catch (err: any) {
                console.error('Error:', err);
                setError(err.message);
                alert(`Transfer failed: ${err.message}`);
            } finally {
                setLoading(false);
            }
        };

        return (
            <div style={{
                marginTop: '20px',
                background: '#2a2f3e',
                borderRadius: '8px',
                padding: '15px'
            }}>
                <div style={{
                    display: 'flex',
                    gap: '10px',
                    marginBottom: '20px'
                }}>
                    <button
                        onClick={() => setActiveTab('redeem')}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: activeTab === 'redeem' ? '#4CAF50' : '#1a1f2e',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        🎁 Redeem Points
                    </button>
                    <button
                        onClick={() => setActiveTab('transfer')}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: activeTab === 'transfer' ? '#2196F3' : '#1a1f2e',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        ↗️ Transfer Points
                    </button>
                </div>

                {activeTab === 'redeem' ? (
                    <div>
                        <h3 style={{ marginBottom: '15px' }}>Redeem Your Points</h3>
                        <div style={{ marginBottom: '20px' }}>
                            <button 
                                onClick={handleRedeemPoints}
                                disabled={loading || points < 10}
                                style={{
                                    width: '100%',
                                    padding: '15px',
                                    fontSize: '16px',
                                    backgroundColor: points >= 10 ? '#4CAF50' : '#1e2330',
                                    color: points >= 10 ? 'white' : '#666',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: points >= 10 && !loading ? 'pointer' : 'not-allowed',
                                    marginBottom: '10px'
                                }}
                            >
                                {points >= 10 ? '🎁 Quick Redeem 10 Points' : '🔒 Need 10 Points'}
                            </button>
                            <p style={{ fontSize: '0.9em', color: '#888', textAlign: 'center' }}>
                                Or choose from available rewards below
                            </p>
                        </div>
                        <RewardsDisplay />
                    </div>
                ) : (
                    <div>
                        <h3 style={{ marginBottom: '15px' }}>Transfer Points</h3>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <input
                                type="number"
                                value={transferAmount}
                                onChange={(e) => setTransferAmount(Number(e.target.value))}
                                placeholder="Amount"
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    background: '#1a1f2e',
                                    border: '1px solid #3a3f4e',
                                    borderRadius: '4px',
                                    color: 'white'
                                }}
                            />
                            <input
                                type="text"
                                value={recipientAddress}
                                onChange={(e) => setRecipientAddress(e.target.value)}
                                placeholder="Recipient Address"
                                style={{
                                    flex: 2,
                                    padding: '10px',
                                    background: '#1a1f2e',
                                    border: '1px solid #3a3f4e',
                                    borderRadius: '4px',
                                    color: 'white'
                                }}
                            />
                        </div>
                        <button
                            onClick={handleTransfer}
                            disabled={loading || !transferAmount || !recipientAddress}
                            style={{
                                width: '100%',
                                padding: '10px',
                                background: (!loading && transferAmount && recipientAddress) ? '#2196F3' : '#1e2330',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                opacity: loading ? 0.7 : 1
                            }}
                        >
                            {loading ? 'Processing...' : '↗️ Transfer Points'}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    if (!connected) {
        return (
            <div style={{
                textAlign: 'center',
                padding: '20px',
                background: '#1a1f2e',
                borderRadius: '8px',
                margin: '20px'
            }}>
                <h2>Please connect your wallet</h2>
            </div>
        );
    }

    return (
        <div style={{
            padding: '20px',
            background: '#1a1f2e',
            borderRadius: '8px',
            margin: '20px',
            color: 'white'
        }}>
            <h2>Wallet Info</h2>
            <div style={{
                background: '#2a2f3e',
                padding: '15px',
                borderRadius: '8px',
                marginTop: '10px'
            }}>
                <p>Address: <span style={{color: '#4CAF50'}}>{publicKey?.toBase58()}</span></p>
                <p>Balance: <span style={{color: '#4CAF50'}}>{balance.toFixed(4)} SOL</span></p>
            </div>
            <TierDisplay />
            <ExpirationNotice />
            <div className="points-container" style={{ 
                padding: '30px',
                backgroundColor: '#1a1f2e',
                borderRadius: '12px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                marginTop: '20px'
            }}>
                <h3 className="points-balance" style={{
                    fontSize: '32px',
                    marginBottom: '25px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}>
                    <span>Points Balance:</span>
                    <span style={{ 
                        color: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        padding: '5px 15px',
                        borderRadius: '20px'
                    }}>{points}</span>
                </h3>
                <p style={{ 
                    color: '#888', 
                    marginBottom: '25px',
                    padding: '10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '6px'
                }}>
                    Minting Fee: {MINT_FEE / LAMPORTS_PER_SOL} SOL
                </p>
                {error && (
                    <div className="error-message" style={{ 
                        color: '#ff6b6b',
                        padding: '15px',
                        backgroundColor: 'rgba(255, 107, 107, 0.1)',
                        borderRadius: '8px',
                        marginBottom: '25px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        <span style={{ fontSize: '20px' }}>⚠️</span>
                        {error}
                    </div>
                )}
                <button 
                    onClick={handleMintPoints}
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: '15px',
                        fontSize: '16px',
                        backgroundColor: loading ? '#45a049' : '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        marginBottom: '20px'
                    }}
                >
                    {loading ? '🔄 Processing...' : '💰 Mint Points (0.01 SOL)'}
                </button>
                <PointsBreakdown />
            </div>
            <PointsManagement />
            <TransactionHistory />
        </div>
    );
};

export default Dashboard;
