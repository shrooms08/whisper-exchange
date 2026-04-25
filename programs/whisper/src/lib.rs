pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H");

#[ephemeral]
#[program]
pub mod whisper {
    use super::*;

    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        handle: String,
        pubkey_x25519: [u8; 32],
    ) -> Result<()> {
        instructions::register_agent::handler(ctx, handle, pubkey_x25519)
    }

    pub fn create_listing(
        ctx: Context<CreateListing>,
        listing_id: u64,
        category: Category,
        price_lamports: u64,
        payload_commitment: [u8; 32],
        supplier_payload_cid: String,
        ttl_slot: u64,
    ) -> Result<()> {
        instructions::create_listing::handler(
            ctx,
            listing_id,
            category,
            price_lamports,
            payload_commitment,
            supplier_payload_cid,
            ttl_slot,
        )
    }

    pub fn purchase_listing(ctx: Context<PurchaseListing>) -> Result<()> {
        instructions::purchase_listing::handler(ctx)
    }

    pub fn deliver_payload(
        ctx: Context<DeliverPayload>,
        buyer_payload_cid: String,
    ) -> Result<()> {
        instructions::deliver_payload::handler(ctx, buyer_payload_cid)
    }

    pub fn submit_rating(ctx: Context<SubmitRating>, verdict: Verdict) -> Result<()> {
        instructions::submit_rating::handler(ctx, verdict)
    }

    pub fn delegate_test(ctx: Context<DelegateTest>) -> Result<()> {
        instructions::delegate_test::handler(ctx)
    }

    pub fn commit_and_undelegate_test(ctx: Context<CommitAndUndelegateTest>) -> Result<()> {
        instructions::commit_and_undelegate_test::handler(ctx)
    }

    pub fn delegate_test_with_transfer(
        ctx: Context<DelegateTestWithTransfer>,
        lamports: u64,
    ) -> Result<()> {
        instructions::delegate_test_with_transfer::handler(ctx, lamports)
    }
}
