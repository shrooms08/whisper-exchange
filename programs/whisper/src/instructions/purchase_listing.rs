use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::error::ErrorCode;
use crate::state::{Agent, Listing, ListingStatus, Purchase};

#[derive(Accounts)]
pub struct PurchaseListing<'info> {
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
        init,
        payer = authority,
        space = 8 + Purchase::INIT_SPACE,
        seeds = [b"purchase", listing.key().as_ref()],
        bump,
    )]
    pub purchase: Account<'info, Purchase>,

    #[account(
        seeds = [b"agent", authority.key().as_ref()],
        bump = buyer_agent.bump,
        has_one = authority,
    )]
    pub buyer_agent: Account<'info, Agent>,

    /// Supplier Agent (read) — used to resolve the supplier's wallet.
    #[account(
        constraint = supplier_agent.key() == listing.supplier @ ErrorCode::NotSupplier,
    )]
    pub supplier_agent: Account<'info, Agent>,

    /// Supplier wallet — receives lamports. Must match supplier_agent.authority.
    #[account(
        mut,
        constraint = supplier_authority.key() == supplier_agent.authority @ ErrorCode::UnauthorizedSupplier,
    )]
    pub supplier_authority: SystemAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<PurchaseListing>) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        clock.slot <= ctx.accounts.listing.ttl_slot,
        ErrorCode::ListingExpired
    );

    let price = ctx.accounts.listing.price_lamports;

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.supplier_authority.to_account_info(),
            },
        ),
        price,
    )?;

    let purchase = &mut ctx.accounts.purchase;
    purchase.listing = ctx.accounts.listing.key();
    purchase.buyer = ctx.accounts.buyer_agent.key();
    purchase.price_paid_lamports = price;
    purchase.buyer_payload_cid = String::new();
    purchase.purchased_at_slot = clock.slot;
    purchase.delivered = false;
    purchase.bump = ctx.bumps.purchase;

    let listing = &mut ctx.accounts.listing;
    listing.status = ListingStatus::Sold;
    listing.buyer = Some(ctx.accounts.buyer_agent.key());
    listing.purchase_slot = Some(clock.slot);

    Ok(())
}
