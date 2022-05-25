import * as anchor from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
    PublicKey,
    Connection,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    Transaction,
} from '@solana/web3.js';
import {
    STAKING_PROGRAM_ID,
    GLOBAL_AUTHORITY_SEED,
    GlobalPool,
    BSK_TOKEN_MINT,
    USER_POOL_SIZE,
    UserPool,
} from './types';
import {
    getAssociatedTokenAccount,
    getATokenAccountsNeedCreate,
    getNFTTokenAccount,
    getOwnerOfNFT,
    getMetadata,
    METAPLEX,
    isExistAccount,
} from './utils';

/** Get all registered NFTs info for max stake amount calculation */
export const getAllStakedNFTs = async (connection: Connection, rpcUrl: string | undefined) => {
    let solConnection = connection;

    if (rpcUrl) {
        solConnection = new anchor.web3.Connection(rpcUrl, "confirmed");
    }

    let poolAccounts = await solConnection.getProgramAccounts(
      STAKING_PROGRAM_ID,
      {
        filters: [
          {
            dataSize: USER_POOL_SIZE,
          },
        ]
      }
    );
    
    console.log(`Encounter ${poolAccounts.length} NFT Data Accounts`);
    
    let result: UserPool[] = [];

    try {
        for (let idx = 0; idx < poolAccounts.length; idx++) {
            let data = poolAccounts[idx].account.data;
            const owner = new PublicKey(data.slice(8, 40));

            let buf = data.slice(40, 48).reverse();
            const lastClaimedTime = new anchor.BN(buf);

            buf = data.slice(48, 56).reverse();
            const stakedCount = new anchor.BN(buf);

            let staking = [];
            for (let i = 0; i < stakedCount.toNumber(); i++) {
                const mint = new PublicKey(data.slice(i*56 + 56, i*56 + 88));

                buf = data.slice(i*56 + 88, i*56 + 96).reverse();
                const stakedTime = new anchor.BN(buf);
                buf = data.slice(i*56 + 96, i*56 + 104).reverse();
                const claimedTime = new anchor.BN(buf);
                buf = data.slice(i*56 + 104, i*56 + 112).reverse();
                const rarity = new anchor.BN(buf);

                staking.push({
                    mint,
                    stakedTime,
                    claimedTime,
                    rarity,
                })
            }

            result.push({
                owner,
                lastClaimedTime,
                stakedCount,
                staking,
            });
        }
    } catch (e) {
        console.log(e);
        return {};
    }

    return {
        count: result.length,
        data: result.map((info: UserPool) => {
            return {
                owner: info.owner.toBase58(),
                lastClaimedTime: info.lastClaimedTime.toNumber(),
                stakedCount: info.stakedCount.toNumber(),
                staking: info.staking.map((info) => {
                    return {
                        mint: info.mint.toBase58(),
                        stakedTime: info.stakedTime.toNumber(),
                        claimedTime: info.claimedTime.toNumber(),
                        rarity: info.rarity.toNumber(),
                    }
                }),
            }
        })
    }
};

export const getGlobalState = async (
    program: anchor.Program,
): Promise<GlobalPool | null> => {
    const [globalAuthority, _] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        STAKING_PROGRAM_ID
    );
    try {
        let globalState = await program.account.globalPool.fetch(globalAuthority);
        return globalState as unknown as GlobalPool;
    } catch {
        return null;
    }
}

export const getUserPoolState = async (
    userAddress: PublicKey,
    program: anchor.Program,
): Promise<UserPool | null> => {
    let userPoolKey = await anchor.web3.PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        STAKING_PROGRAM_ID,
    );
    try {
        let userPoolState = await program.account.userPool.fetch(userPoolKey);
        return userPoolState as unknown as UserPool;
    } catch {
        return null;
    }
}

export const createInitializeTx = async (
    userAddress: PublicKey,
    program: anchor.Program,
) => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        STAKING_PROGRAM_ID,
    );
    const rewardVault = await getAssociatedTokenAccount(globalAuthority, BSK_TOKEN_MINT);
    
    let tx = new Transaction();
    console.log('==>initializing program', rewardVault.toBase58());

    tx.add(program.instruction.initialize(
        bump, {
        accounts: {
            admin: userAddress,
            globalAuthority,
            rewardVault,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
        },
        instructions: [],
        signers: [],
    }));

    return tx;
}

export const createInitUserPoolTx = async (
    userAddress: PublicKey,
    program: anchor.Program,
    connection: Connection,
) => {
    let userPoolKey = await anchor.web3.PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        STAKING_PROGRAM_ID,
    );
    console.log(USER_POOL_SIZE);
    let ix = SystemProgram.createAccountWithSeed({
        fromPubkey: userAddress,
        basePubkey: userAddress,
        seed: "user-pool",
        newAccountPubkey: userPoolKey,
        lamports : await connection.getMinimumBalanceForRentExemption(USER_POOL_SIZE),
        space: USER_POOL_SIZE,
        programId: STAKING_PROGRAM_ID,
    });
      
    let tx = new Transaction();
    console.log('==>initializing user PDA', userPoolKey.toBase58());
    tx.add(ix);
    tx.add(program.instruction.initializeUserPool(
        {
            accounts: {
                userPool: userPoolKey,
                owner: userAddress
            },
            instructions: [
            ],
            signers: []
        }
    ));

    return tx;
}

export const createStakeNftTx = async (
    mint: PublicKey,
    userAddress: PublicKey,
    program: anchor.Program,
    connection: Connection,
    rarity: number,
) => {
    if (rarity < 0 || rarity > 3) {
        throw 'Invalid NFT Rarity';
    }

    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        STAKING_PROGRAM_ID,
    );

    let userPoolKey = await anchor.web3.PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        STAKING_PROGRAM_ID,
    );

    let userTokenAccount = await getAssociatedTokenAccount(userAddress, mint);
    if (!await isExistAccount(userTokenAccount, connection)) {
        let accountOfNFT = await getNFTTokenAccount(mint, connection);
        if (userTokenAccount.toBase58() != accountOfNFT.toBase58()) {
            let nftOwner = await getOwnerOfNFT(mint, connection);
            if (nftOwner.toBase58() == userAddress.toBase58()) userTokenAccount = accountOfNFT;
            else if (nftOwner.toBase58() !== globalAuthority.toBase58()) {
                throw 'Error: Nft is not owned by user';
            }
        }
    }
    console.log("NFT = ", mint.toBase58(), userTokenAccount.toBase58());

    let { instructions, destinationAccounts } = await getATokenAccountsNeedCreate(
        connection,
        userAddress,
        globalAuthority,
        [mint]
    );

    console.log("Dest NFT Account = ", destinationAccounts[0].toBase58())

    const metadata = await getMetadata(mint);
    console.log("Metadata=", metadata.toBase58());

    let tx = new Transaction();

    if (instructions.length > 0) instructions.map((ix) => tx.add(ix));
    console.log('==>listing', mint.toBase58(), rarity);

    tx.add(program.instruction.stakeNftToPool(
        bump, new anchor.BN(rarity), {
        accounts: {
            owner: userAddress,
            globalAuthority,
            userPool: userPoolKey,
            userNftTokenAccount: userTokenAccount,
            destNftTokenAccount: destinationAccounts[0],
            nftMint: mint,
            mintMetadata: metadata,
            tokenProgram: TOKEN_PROGRAM_ID,
            tokenMetadataProgram: METAPLEX,
        },
        instructions: [],
        signers: [],
    }));

    return tx;
}

export const createWithdrawNftTx = async (
    mint: PublicKey,
    userAddress: PublicKey,
    program: anchor.Program,
    connection: Connection,
) => {
    let ret = await getATokenAccountsNeedCreate(
        connection,
        userAddress,
        userAddress,
        [mint]
    );
    let userTokenAccount = ret.destinationAccounts[0];
    console.log("User NFT = ", mint.toBase58(), userTokenAccount.toBase58());

    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        STAKING_PROGRAM_ID
    );
    let rewardVault = await getAssociatedTokenAccount(globalAuthority, BSK_TOKEN_MINT);

    let userPoolKey = await anchor.web3.PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        STAKING_PROGRAM_ID,
    );

    let { destinationAccounts } = await getATokenAccountsNeedCreate(
        connection,
        userAddress,
        globalAuthority,
        [mint]
    );
    console.log("Dest NFT Account = ", destinationAccounts[0].toBase58());
    
    let ret1 = await getATokenAccountsNeedCreate(
        connection,
        userAddress,
        userAddress,
        [BSK_TOKEN_MINT]
    );

    let tx = new Transaction();

    if (ret.instructions.length > 0) ret.instructions.map((ix) => tx.add(ix));
    if (ret1.instructions.length > 0) ret1.instructions.map((ix) => tx.add(ix));
    console.log('==> withdrawing', mint.toBase58());
    tx.add(program.instruction.withdrawNftFromPool(
        bump, {
        accounts: {
            owner: userAddress,
            globalAuthority,
            userPool: userPoolKey,
            userNftTokenAccount: userTokenAccount,
            destNftTokenAccount: destinationAccounts[0],
            rewardVault,
            userRewardAccount: ret1.destinationAccounts[0],
            nftMint: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
        },
        instructions: [],
        signers: [],
    }));

    return tx;
}

export const createClaimTx = async (
    userAddress: PublicKey,
    program: anchor.Program,
    connection: Connection,
    mint?: PublicKey,
) => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        STAKING_PROGRAM_ID
    );
    let rewardVault = await getAssociatedTokenAccount(globalAuthority, BSK_TOKEN_MINT);

    let userPoolKey = await anchor.web3.PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        STAKING_PROGRAM_ID,
    );
    
    let ret = await getATokenAccountsNeedCreate(
        connection,
        userAddress,
        userAddress,
        [BSK_TOKEN_MINT]
    );

    let tx = new Transaction();

    if (ret.instructions.length > 0) ret.instructions.map((ix) => tx.add(ix));
    tx.add(program.instruction.claimReward(
        bump, mint ?? null, {
        accounts: {
            owner: userAddress,
            globalAuthority,
            userPool: userPoolKey,
            rewardVault,
            userRewardAccount: ret.destinationAccounts[0],
            tokenProgram: TOKEN_PROGRAM_ID,
        },
        instructions: [],
        signers: [],
    }));

    return tx;
}