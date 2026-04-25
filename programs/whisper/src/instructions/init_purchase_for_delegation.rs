// Step 1 of the two-instruction private-purchase prologue. Buyer-signed.
// Standard Anchor `init` for the Purchase PDA. Pre-flight checks the Listing
// is still Active + not expired so we don't waste rent on a stale listing.
//
// Buyer client batches this with delegate_for_purchase in a single tx via
// Transaction.add(initIx).add(delegateIx).

use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Agent, Listing, ListingStatus, Purchase};

#[derive(Accounts)]
#[instruction(listing_id: u64)]
pub struct InitPurchaseForDelegation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"agent", authority.key().as_ref()],
        bump = buyer_agent.bump,
        has_one = authority,
    )]
    pub buyer_agent: Account<'info, Agent>,

    #[account(
        seeds = [
            b"listing",
            listing_supplier.key().as_ref(),
            &listing_id.to_le_bytes(),
        ],
        bump = listing.bump,
        constraint = listing.status == ListingStatus::Active @ ErrorCode::ListingNotActive,
    )]
    pub listing: Account<'info, Listing>,

    /// Read-only ref used to derive listing seeds. listing.supplier == listing_supplier.key().
    pub listing_supplier: Account<'info, Agent>,

    #[account(
        init,
        payer = authority,
        space = 8 + Purchase::INIT_SPACE,
        seeds = [b"purchase", listing.key().as_ref()],
        bump,
    )]
    pub purchase: Account<'info, Purchase>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitPurchaseForDelegation>, _listing_id: u64) -> Result<()> {
    require!(
        Clock::get()?.slot <= ctx.accounts.listing.ttl_slot,
        ErrorCode::ListingExpired
    );

    let purchase = &mut ctx.accounts.purchase;
    purchase.listing = ctx.accounts.listing.key();
    purchase.buyer = ctx.accounts.buyer_agent.key();
    purchase.price_paid_lamports = 0;
    purchase.buyer_payload_cid = String::new();
    purchase.purchased_at_slot = 0;
    purchase.delivered = false;
    purchase.settled = false;
    purchase.bump = ctx.bumps.purchase;

    Ok(())
}
