// Bundled-CPI smoke test for SOL-on-ER. Same call shape as our future
// purchase_listing_private: tx fee payer is a regular wallet, the tx mutates
// a delegated PDA, and a system_program::transfer CPI moves lamports between
// non-delegated wallets — all atomic, all in one Anchor instruction.
//
// Used by scripts/test-sol-on-er-bundled.ts. Not used by any agent flow.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::state::Agent;

#[derive(Accounts)]
pub struct DelegateTestWithTransfer<'info> {
    /// The delegated test PDA (delegated via delegate_test prior to this call).
    /// Marked mut so the tx is recognized as ER-routable.
    #[account(
        mut,
        seeds = [b"agent", authority.key().as_ref()],
        bump = agent.bump,
        has_one = authority,
    )]
    pub agent: Account<'info, Agent>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: receiver of the bundled SOL transfer. Regular SystemAccount.
    #[account(mut)]
    pub receiver: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DelegateTestWithTransfer>, lamports: u64) -> Result<()> {
    // (1) Mutate the delegated PDA — observable evidence the ER processed
    // the writable account in committed state.
    let agent = &mut ctx.accounts.agent;
    agent.listings_created = agent.listings_created.saturating_add(1);

    // (2) System-program CPI: transfer SOL from fee-payer authority to
    // receiver. Both are non-delegated SystemAccounts; this is the question
    // we are testing — does ER let it through when bundled with a delegated
    // PDA mutation?
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.receiver.to_account_info(),
            },
        ),
        lamports,
    )?;

    Ok(())
}
