import * as anchor from '@project-serum/anchor';
import {PublicKey} from '@solana/web3.js';

export const GLOBAL_AUTHORITY_SEED = "global-authority";

export const STAKING_PROGRAM_ID = new PublicKey("HukSceTP6dd1oc3C4uKNwakKQowrdQBgK3EJBPmN9Rus");
export const BSK_TOKEN_MINT = new PublicKey("8EoML7gaBJsgJtepm25wq3GuUCqLYHBoqd3HP1JxtyBx");
export const BSK_TOKEN_DECIMAL = 1_000_000_000;   // BSK Token Decimal

export const NORMAL_REWARD_AMOUNT = 57870;   // 5 $BSK
export const OBSIDIAN_REWARD_AMOUNT = 92593;   // 8 $BSK
export const ICE_REWARD_AMOUNT = 115741;   // 10 $BSK
export const UNIQUE_REWARD_AMOUNT = 173611;   // 15 $BSK

export const EPOCH = 1;
export const LOCKING_PERIOD = 60;
export const USER_POOL_SIZE = 5656;     // 8 + 5648

export interface GlobalPool {
    // 8 + 40
    superAdmin: PublicKey,          // 32
    totalStakedCount: anchor.BN,    // 8
}

export interface StakedData {
    mint: PublicKey,        // 32
    stakedTime: anchor.BN, // 8
    claimedTime: anchor.BN, // 8
    rarity: anchor.BN,      // 8
}

export interface UserPool {
    // 8 + 5656
    owner: PublicKey,               // 32
    lastClaimedTime: anchor.BN,     // 8
    stakedCount: anchor.BN,         // 8
    staking: StakedData[],          // 48 * 100
}