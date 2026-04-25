// Step 4 (final) of the private-purchase flow. Buyer-signed. Runs on base
// layer post-commit. Transfers the listing price from buyer.authority to
// supplier.authority via system_program::transfer, then flips
// Purchase.settled = true. Idempotent because of the !purchase.settled
// constraint — a buyer who fails this tx (e.g. underfunded) can retry.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::error::ErrorCode;
use crate::state::{Agent, Listing, ListingStatus, Purchase};

#[derive(Accounts)]
pub struct SettlePurchase<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,                  // buyer

    #[account(
        seeds = [b"agent", authority.key().as_ref()],
        bump = buyer_agent.bump,
        has_one = authority,
    )]
    pub buyer_agent: Account<'info, Agent>,

    #[account(
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
        mut,
        seeds = [b"purchase", listing.key().as_ref()],
        bump = purchase.bump,
        constraint = purchase.buyer == buyer_agent.key() @ ErrorCode::NotBuyer,
        constraint = purchase.price_paid_lamports == listing.price_lamports @ ErrorCode::PriceMismatch,
        constraint = !purchase.settled @ ErrorCode::AlreadySettled,
    )]
    pub purchase: Account<'info, Purchase>,

    /// Supplier's Agent (read) — used to resolve supplier_authority.
    #[account(
        constraint = supplier_agent.key() == listing.supplier @ ErrorCode::NotSupplier,
    )]
    pub supplier_agent: Account<'info, Agent>,

    /// Supplier's wallet — receives lamports.
    #[account(
        mut,
        constraint = supplier_authority.key() == supplier_agent.authority @ ErrorCode::UnauthorizedSupplier,
    )]
    pub supplier_authority: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SettlePurchase>) -> Result<()> {
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

    ctx.accounts.purchase.settled = true;

    Ok(())
}
