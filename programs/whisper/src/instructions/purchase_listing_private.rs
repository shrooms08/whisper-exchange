// Step 3 of the private-purchase flow. Buyer-signed. Runs on the MagicBlock
// ephemeral rollup. Mutates the delegated Listing (status=Sold, buyer recorded)
// and the delegated Purchase (price + slot). NO SOL transfer — empirical
// testing (scripts/test-sol-on-er-bundled.ts → InvalidAccountForFee) showed
// the ER won't accept fee payment from a regular base-layer wallet, so the
// SOL leg is moved to settle_purchase on base.
//
// At the end of the handler, both Listing and Purchase are committed and
// undelegated back to base layer in one bundle.

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};

use crate::error::ErrorCode;
use crate::state::{Agent, Listing, ListingStatus, Purchase};

#[commit]
#[derive(Accounts)]
pub struct PurchaseListingPrivate<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"listing",
            listing.supplier.as_ref(),
            &listing.listing_id.to_le_bytes(),
        ],
        bump = listing.bump,
        constraint = listing.status == ListingStatus::Active @ ErrorCode::ListingNotActive,
    )]
    pub listing: Account<'info, Listing>,

    #[account(
        mut,
        seeds = [b"purchase", listing.key().as_ref()],
        bump = purchase.bump,
        constraint = purchase.listing == listing.key() @ ErrorCode::PurchaseListingMismatch,
        constraint = purchase.buyer == buyer_agent.key() @ ErrorCode::NotBuyer,
        constraint = !purchase.delivered @ ErrorCode::AlreadyDelivered,
        constraint = !purchase.settled @ ErrorCode::AlreadySettled,
    )]
    pub purchase: Account<'info, Purchase>,

    #[account(
        seeds = [b"agent", authority.key().as_ref()],
        bump = buyer_agent.bump,
        has_one = authority,
    )]
    pub buyer_agent: Account<'info, Agent>,
    // `#[commit]` macro injects: magic_context, magic_program.
}

pub fn handler(ctx: Context<PurchaseListingPrivate>) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        clock.slot <= ctx.accounts.listing.ttl_slot,
        ErrorCode::ListingExpired
    );

    // Mutate Listing: flip to Sold + record buyer + slot.
    let buyer_agent_key = ctx.accounts.buyer_agent.key();
    let listing = &mut ctx.accounts.listing;
    listing.status = ListingStatus::Sold;
    listing.buyer = Some(buyer_agent_key);
    listing.purchase_slot = Some(clock.slot);

    // Promote Purchase placeholder to real values.
    let price = ctx.accounts.listing.price_lamports;
    let purchase = &mut ctx.accounts.purchase;
    purchase.price_paid_lamports = price;
    purchase.purchased_at_slot = clock.slot;
    // delivered, settled, buyer_payload_cid stay at their placeholder values.

    // Persist before commit-back.
    ctx.accounts.listing.exit(&crate::ID)?;
    ctx.accounts.purchase.exit(&crate::ID)?;

    // Commit + undelegate both in one bundle.
    MagicIntentBundleBuilder::new(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.magic_context.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
    )
    .commit_and_undelegate(&[
        ctx.accounts.listing.to_account_info(),
        ctx.accounts.purchase.to_account_info(),
    ])
    .build_and_invoke()?;

    Ok(())
}
