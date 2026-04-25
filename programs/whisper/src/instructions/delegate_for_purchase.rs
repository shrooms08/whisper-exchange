// Step 2 of the two-instruction private-purchase prologue. Buyer-signed.
// Both Listing and Purchase exist on-chain by this point (Listing from
// supplier's create_listing; Purchase from init_purchase_for_delegation in
// the same tx). This instruction does only the two delegate_<field> CPIs
// that transfer ownership of both PDAs to the delegation program for the
// duration of the ER session.

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::state::Agent;

#[delegate]
#[derive(Accounts)]
#[instruction(listing_id: u64)]
pub struct DelegateForPurchase<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"agent", authority.key().as_ref()],
        bump = buyer_agent.bump,
        has_one = authority,
    )]
    pub buyer_agent: Account<'info, Agent>,

    /// CHECK: existing Listing PDA. The `del` constraint transfers ownership.
    #[account(
        mut, del,
        seeds = [
            b"listing",
            listing_supplier.key().as_ref(),
            &listing_id.to_le_bytes(),
        ],
        bump,
    )]
    pub listing: AccountInfo<'info>,

    pub listing_supplier: Account<'info, Agent>,

    /// CHECK: existing Purchase PDA from the prior ix. del transfers ownership.
    #[account(
        mut, del,
        seeds = [b"purchase", listing.key().as_ref()],
        bump,
    )]
    pub purchase: AccountInfo<'info>,
}

pub fn handler(ctx: Context<DelegateForPurchase>, listing_id: u64) -> Result<()> {
    let listing_key = ctx.accounts.listing.key();

    ctx.accounts.delegate_listing(
        &ctx.accounts.authority,
        &[
            b"listing",
            ctx.accounts.listing_supplier.key().as_ref(),
            &listing_id.to_le_bytes(),
        ],
        DelegateConfig {
            commit_frequency_ms: 30_000,
            validator: None,
        },
    )?;

    ctx.accounts.delegate_purchase(
        &ctx.accounts.authority,
        &[b"purchase", listing_key.as_ref()],
        DelegateConfig {
            commit_frequency_ms: 30_000,
            validator: None,
        },
    )?;

    Ok(())
}
