use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::state::{Agent, Listing, ListingStatus, Purchase};

#[derive(Accounts)]
pub struct DeliverPayload<'info> {
    #[account(
        mut,
        seeds = [b"purchase", listing.key().as_ref()],
        bump = purchase.bump,
        constraint = !purchase.delivered @ ErrorCode::AlreadyDelivered,
    )]
    pub purchase: Account<'info, Purchase>,

    #[account(
        seeds = [
            b"listing",
            listing.supplier.as_ref(),
            &listing.listing_id.to_le_bytes(),
        ],
        bump = listing.bump,
        constraint = listing.supplier == supplier_agent.key() @ ErrorCode::NotSupplier,
        constraint = listing.status == ListingStatus::Sold @ ErrorCode::ListingNotActive,
    )]
    pub listing: Account<'info, Listing>,

    #[account(
        seeds = [b"agent", authority.key().as_ref()],
        bump = supplier_agent.bump,
        has_one = authority,
    )]
    pub supplier_agent: Account<'info, Agent>,

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<DeliverPayload>, buyer_payload_cid: String) -> Result<()> {
    require!(buyer_payload_cid.len() <= 64, ErrorCode::CidTooLong);

    let purchase = &mut ctx.accounts.purchase;
    purchase.buyer_payload_cid = buyer_payload_cid;
    purchase.delivered = true;

    Ok(())
}
