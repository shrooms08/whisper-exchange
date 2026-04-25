// Macro-compatibility smoke test companion to delegate_test. Commits and
// undelegates the test PDA (the Agent owned by `authority`). Used by
// scripts/test-sol-on-er.ts to round-trip a delegated PDA back to base layer.
// Not used by any agent flow yet.

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};

use crate::state::Agent;

#[commit]
#[derive(Accounts)]
pub struct CommitAndUndelegateTest<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"agent", authority.key().as_ref()],
        bump = agent.bump,
        has_one = authority,
    )]
    pub agent: Account<'info, Agent>,
}

pub fn handler(ctx: Context<CommitAndUndelegateTest>) -> Result<()> {
    ctx.accounts.agent.exit(&crate::ID)?;

    MagicIntentBundleBuilder::new(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.magic_context.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
    )
    .commit_and_undelegate(&[ctx.accounts.agent.to_account_info()])
    .build_and_invoke()?;

    Ok(())
}
