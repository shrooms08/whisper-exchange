use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Agent, Listing, ListingStatus, Purchase, Rating, Verdict};

#[derive(Accounts)]
pub struct SubmitRating<'info> {
    #[account(
        seeds = [b"purchase", listing.key().as_ref()],
        bump = purchase.bump,
        constraint = purchase.delivered @ ErrorCode::NotDelivered,
        constraint = purchase.buyer == buyer_agent.key() @ ErrorCode::NotBuyer,
    )]
    pub purchase: Account<'info, Purchase>,

    #[account(
        mut,
        seeds = [
            b"listing",
            listing.supplier.as_ref(),
            &listing.listing_id.to_le_bytes(),
        ],
        bump = listing.bump,
        constraint = listing.status == ListingStatus::Sold @ ErrorCode::ListingNotActive,
    )]
    pub listing: Account<'info, Listing>,

    #[account(
        init,
        payer = authority,
        space = 8 + Rating::INIT_SPACE,
        seeds = [b"rating", purchase.key().as_ref()],
        bump,
    )]
    pub rating: Account<'info, Rating>,

    #[account(
        mut,
        constraint = supplier_agent.key() == listing.supplier @ ErrorCode::NotSupplier,
    )]
    pub supplier_agent: Account<'info, Agent>,

    #[account(
        seeds = [b"agent", authority.key().as_ref()],
        bump = buyer_agent.bump,
        has_one = authority,
    )]
    pub buyer_agent: Account<'info, Agent>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SubmitRating>, verdict: Verdict) -> Result<()> {
    let rating = &mut ctx.accounts.rating;
    rating.purchase = ctx.accounts.purchase.key();
    rating.rater = ctx.accounts.buyer_agent.key();
    rating.verdict = verdict;
    rating.rated_at = Clock::get()?.unix_timestamp;
    rating.weight = 1;
    rating.bump = ctx.bumps.rating;

    let supplier_agent = &mut ctx.accounts.supplier_agent;
    if matches!(verdict, Verdict::True) {
        supplier_agent.reputation_num = supplier_agent.reputation_num.saturating_add(1);
    }
    supplier_agent.reputation_den = supplier_agent.reputation_den.saturating_add(1);

    ctx.accounts.listing.status = ListingStatus::Rated;

    Ok(())
}
