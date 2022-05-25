use {
    crate::StakingError,
    anchor_lang::{
        prelude::{AccountInfo, ProgramError, ProgramResult, Pubkey},
        solana_program::{
            program_pack::{IsInitialized, Pack},
        },
    },
};

pub fn assert_owned_by(account: &AccountInfo, owner: &Pubkey) -> ProgramResult {
    if account.owner != owner {
        Err(ProgramError::from(StakingError::InvalidOwner))
    } else {
        Ok(())
    }
}
