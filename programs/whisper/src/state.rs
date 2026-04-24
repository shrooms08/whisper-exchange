use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Agent {
    pub authority: Pubkey,
    #[max_len(32)]
    pub handle: String,
    pub pubkey_x25519: [u8; 32],
    pub reputation_num: u64,
    pub reputation_den: u64,
    pub listings_created: u64,
    pub created_at: i64,
    pub bump: u8,
}
