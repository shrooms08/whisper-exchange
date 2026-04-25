// Macro-compatibility smoke test for ephemeral-rollups-sdk under anchor-lang 0.32.1.
// Not wired into any agent flow. Delegates an existing Agent PDA so we exercise
// the #[delegate] macro + delegate_<field>() codegen path. Will be removed (or
// repurposed) once delegate_for_purchase lands.

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

#[delegate]
#[derive(Accounts)]
pub struct DelegateTest<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: target PDA for delegation macro test
    #[account(mut, del, seeds = [b"agent", authority.key().as_ref()], bump)]
    pub agent: AccountInfo<'info>,
}

pub fn handler(ctx: Context<DelegateTest>) -> Result<()> {
    ctx.accounts.delegate_agent(
        &ctx.accounts.authority,
        &[b"agent", ctx.accounts.authority.key().as_ref()],
        DelegateConfig {
            commit_frequency_ms: 30_000,
            validator: None,
        },
    )?;
    Ok(())
}
