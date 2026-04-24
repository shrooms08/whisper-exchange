use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::state::Agent;

#[derive(Accounts)]
#[instruction(handle: String, pubkey_x25519: [u8; 32])]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Agent::INIT_SPACE,
        seeds = [b"agent", authority.key().as_ref()],
        bump,
    )]
    pub agent: Account<'info, Agent>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterAgent>,
    handle: String,
    pubkey_x25519: [u8; 32],
) -> Result<()> {
    require!(handle.len() <= 32, ErrorCode::HandleTooLong);

    let agent = &mut ctx.accounts.agent;
    agent.authority = ctx.accounts.authority.key();
    agent.handle = handle;
    agent.pubkey_x25519 = pubkey_x25519;
    agent.reputation_num = 0;
    agent.reputation_den = 0;
    agent.listings_created = 0;
    agent.created_at = Clock::get()?.unix_timestamp;
    agent.bump = ctx.bumps.agent;

    Ok(())
}
