use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Agent, Category, Listing, ListingStatus};

#[derive(Accounts)]
#[instruction(listing_id: u64)]
pub struct CreateListing<'info> {
    #[account(
        mut,
        seeds = [b"agent", authority.key().as_ref()],
        bump = supplier_agent.bump,
        has_one = authority,
        constraint = supplier_agent.listings_created == listing_id @ ErrorCode::ListingIdMismatch,
    )]
    pub supplier_agent: Account<'info, Agent>,

    #[account(
        init,
        payer = authority,
        space = 8 + Listing::INIT_SPACE,
        seeds = [
            b"listing",
            supplier_agent.key().as_ref(),
            &listing_id.to_le_bytes(),
        ],
        bump,
    )]
    pub listing: Account<'info, Listing>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateListing>,
    listing_id: u64,
    category: Category,
    price_lamports: u64,
    payload_commitment: [u8; 32],
    supplier_payload_cid: String,
    ttl_slot: u64,
) -> Result<()> {
    require!(supplier_payload_cid.len() <= 64, ErrorCode::CidTooLong);

    let listing = &mut ctx.accounts.listing;
    listing.supplier = ctx.accounts.supplier_agent.key();
    listing.listing_id = listing_id;
    listing.category = category;
    listing.price_lamports = price_lamports;
    listing.payload_commitment = payload_commitment;
    listing.supplier_payload_cid = supplier_payload_cid;
    listing.ttl_slot = ttl_slot;
    listing.status = ListingStatus::Active;
    listing.buyer = None;
    listing.purchase_slot = None;
    listing.created_at = Clock::get()?.unix_timestamp;
    listing.bump = ctx.bumps.listing;

    let supplier_agent = &mut ctx.accounts.supplier_agent;
    supplier_agent.listings_created = supplier_agent
        .listings_created
        .checked_add(1)
        .ok_or(ErrorCode::ListingIdMismatch)?;

    Ok(())
}
