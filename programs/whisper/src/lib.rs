pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H");

#[program]
pub mod whisper {
    use super::*;

    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        handle: String,
        pubkey_x25519: [u8; 32],
    ) -> Result<()> {
        instructions::register_agent::handler(ctx, handle, pubkey_x25519)
    }
}
