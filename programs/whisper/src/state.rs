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

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub supplier: Pubkey,
    pub listing_id: u64,
    pub category: Category,
    pub price_lamports: u64,
    pub payload_commitment: [u8; 32],
    #[max_len(64)]
    pub supplier_payload_cid: String,
    pub ttl_slot: u64,
    pub status: ListingStatus,
    pub buyer: Option<Pubkey>,
    pub purchase_slot: Option<u64>,
    pub created_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Category {
    Whale,
    Mev,
    Mint,
    Imbal,
    Insdr,
    Bridge,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ListingStatus {
    Active,
    Sold,
    Expired,
    Rated,
}

#[account]
#[derive(InitSpace)]
pub struct Purchase {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub price_paid_lamports: u64,
    #[max_len(64)]
    pub buyer_payload_cid: String,
    pub purchased_at_slot: u64,
    pub delivered: bool,
    pub settled: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Rating {
    pub purchase: Pubkey,
    pub rater: Pubkey,
    pub verdict: Verdict,
    pub rated_at: i64,
    pub weight: u8,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Verdict {
    True,
    False,
    Partial,
}
