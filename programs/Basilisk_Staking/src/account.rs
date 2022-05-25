use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::*;

#[account]
#[derive(Default)]
pub struct GlobalPool {
    // 8 + 40
    pub super_admin: Pubkey,        // 32
    pub total_staked_count: u64,    // 8
}

/// User PDA Layout
#[zero_copy]
#[derive(Default, PartialEq)]
#[repr(packed)]
pub struct StakedData {
    pub mint: Pubkey,       // 32
    pub staked_time: i64,   // 8
    pub claimed_time: i64,  // 8
    pub rarity: u64,        // 8
}

#[account(zero_copy)]
pub struct UserPool {
    // 8 + 5648
    pub owner: Pubkey,                              // 32
    pub last_claimed_time: i64,                     // 8
    pub staked_count: u64,                          // 8
    pub staking: [StakedData; STAKE_MAX_COUNT],     // 56 * 100
}

impl Default for UserPool {
    #[inline]
    fn default() -> UserPool {
        UserPool {
            owner: Pubkey::default(),
            last_claimed_time: 0,
            staked_count: 0,
            staking: [
                StakedData {
                    ..Default::default()
                }; STAKE_MAX_COUNT
            ],
        }
    }
}

impl UserPool {
    pub fn add_nft(
        &mut self,
        nft_pubkey: Pubkey,
        rarity: u64,
        now: i64,
    ) {
        let idx = self.staked_count as usize;
        self.staking[idx].mint = nft_pubkey;
        self.staking[idx].staked_time = now;
        self.staking[idx].claimed_time = now;
        self.staking[idx].rarity = rarity;
        self.staked_count += 1;
    }
    
    pub fn remove_nft(
        &mut self,
        nft_pubkey: Pubkey,
        now: i64,
    ) -> Result<u64> {
        let mut withdrawn: u8 = 0;
        let mut index: usize = 0;
        // Find NFT in pool
        for i in 0..self.staked_count {
            let idx = i as usize;
            if self.staking[idx].mint.eq(&nft_pubkey) {
                require!(self.staking[idx].staked_time + LOCKING_PERIOD < now, StakingError::InvalidWithdrawTime);
                index = idx;
                withdrawn = 1;
                break;
            }
        }
        require!(withdrawn == 1, StakingError::InvalidNFTAddress);
        let mut reward_amount: u64 = NORMAL_REWARD_AMOUNT;
        let mut last_reward_time: i64 = self.last_claimed_time;

        if last_reward_time < self.staking[index].claimed_time {
            last_reward_time = self.staking[index].claimed_time;
        }
        if self.staking[index].rarity == 1 {
            reward_amount = OBSIDIAN_REWARD_AMOUNT;
        } else if self.staking[index].rarity == 2 {
            reward_amount = ICE_REWARD_AMOUNT;
        } else if self.staking[index].rarity == 3 {
            reward_amount = UNIQUE_REWARD_AMOUNT;
        }
        let reward = (((now - last_reward_time) / EPOCH) as u64) * reward_amount as u64;

        // Remove NFT from pool
        let last_idx: usize = (self.staked_count - 1) as usize;
        if index != last_idx {
            self.staking[index] = self.staking[last_idx];
        }
        self.staked_count -= 1;
        Ok(reward)
    }
    
    pub fn claim_nft_reward(
        &mut self,
        nft_pubkey: Pubkey,
        now: i64,
    ) -> Result<u64> {
        let mut found: u8 = 0;
        let mut index: usize = 0;
        // Find NFT in pool
        for i in 0..self.staked_count {
            let idx = i as usize;
            if self.staking[idx].mint.eq(&nft_pubkey) {
                index = idx;
                found = 1;
                break;
            }
        }
        require!(found == 1, StakingError::InvalidNFTAddress);
        let mut reward_amount: u64 = NORMAL_REWARD_AMOUNT;
        let mut last_reward_time: i64 = self.last_claimed_time;

        if last_reward_time < self.staking[index].claimed_time {
            last_reward_time = self.staking[index].claimed_time;
        }
        if self.staking[index].rarity == 1 {
            reward_amount = OBSIDIAN_REWARD_AMOUNT;
        } else if self.staking[index].rarity == 2 {
            reward_amount = ICE_REWARD_AMOUNT;
        } else if self.staking[index].rarity == 3 {
            reward_amount = UNIQUE_REWARD_AMOUNT;
        }
        let reward = (((now - last_reward_time) / EPOCH) as u64) * reward_amount as u64;
        
        self.staking[index].claimed_time = now;

        Ok(reward)
    }

    pub fn claim_reward(
        &mut self,
        now: i64,
    ) -> Result<u64> {
        let mut total_reward: u64 = 0;
        for i in 0..self.staked_count {
            let index = i as usize;
 
            let mut last_reward_time = self.last_claimed_time;
            if last_reward_time < self.staking[index].claimed_time {
                last_reward_time = self.staking[index].claimed_time;
            }

            let mut reward_amount: u64 = NORMAL_REWARD_AMOUNT;
            if self.staking[index].rarity == 1 {
                reward_amount = OBSIDIAN_REWARD_AMOUNT;
            } else if self.staking[index].rarity == 2 {
                reward_amount = ICE_REWARD_AMOUNT;
            } else if self.staking[index].rarity == 3 {
                reward_amount = UNIQUE_REWARD_AMOUNT;
            }

            let reward = (((now - last_reward_time) / EPOCH) as u64) * reward_amount as u64;

            total_reward += reward;
        }
        self.last_claimed_time = now;

        Ok(total_reward)
    }
}