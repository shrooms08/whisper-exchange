# Accounts Proposal — `#[derive(Accounts)]` for all 5 instructions

**Status:** PROPOSAL — awaiting your approval before any instruction bodies are written.
**Source of truth:** [`docs/anchor-schema.md`](./anchor-schema.md) (LOCKED). This proposal references those PDA seeds and fields verbatim — if anything here drifts from the schema, the schema wins.
**Program:** `whisper`
**Anchor version:** 1.0.0

---

## Notation and conventions

- All PDAs use `bump` stored in the account struct.
- `space = 8 (discriminator) + account body`. Numbers below are rounded up to give headroom for the `String` max lengths (4-byte length prefix + max bytes).
- `has_one = authority` enforces that the `authority` field on the data account matches the signer.
- `InitSpace` attribute is used on data structs (to be added when bodies land) so `space = 8 + Agent::INIT_SPACE`. For this proposal I've inlined numeric sizes to keep the review concrete.
- A single `authority: Signer<'info>` is used across instructions — the buyer/supplier role is determined by which Agent account is passed in.

---

## 1. `register_agent`

**Args:** `handle: String`, `pubkey_x25519: [u8; 32]`

```rust
#[derive(Accounts)]
#[instruction(handle: String, pubkey_x25519: [u8; 32])]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 4 + 32 + 32 + 8 + 8 + 8 + 8 + 1, // 141 + disc = 150
        seeds = [b"agent", authority.key().as_ref()],
        bump,
    )]
    pub agent: Account<'info, Agent>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
```

**Notes / open questions:**
- `handle` max length enforced in the body (`require!(handle.len() <= 32, ErrorCode::HandleTooLong)`), not at the struct level. Flag if you'd rather cap it via a fixed `[u8; 32]` instead of `String`.
- One Agent per authority is enforced by the PDA seed (a second call collides).

---

## 2. `create_listing`

**Args:** `listing_id: u64`, `category: u8`, `price_lamports: u64`, `payload_commitment: [u8; 32]`, `supplier_payload_cid: String`, `ttl_slot: u64`

```rust
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
        space = 8 + 32 + 8 + 1 + 8 + 32 + 4 + 64 + 8 + 1 + (1 + 32) + (1 + 8) + 8 + 1, // ~210
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
```

**Notes / open questions:**
- **Counter-in-seeds concern (flagged in plan):** I'm passing `listing_id` as an ix arg and asserting it equals `supplier_agent.listings_created` *before* incrementing. The body then increments the counter. Alternative: derive the seed from `(supplier_agent.listings_created - 1).to_le_bytes()` *after* incrementing, but that makes the seed non-obvious to clients. Recommend the asserted-arg approach. **Confirm?**
- Schema uses `supplier: Pubkey` on the Listing — this is the **Agent PDA key**, not the authority wallet. I've renamed the account here to `supplier_agent` to make that explicit. `listing.supplier = supplier_agent.key()` in the body.
- `payload_commitment` is fixed 32 bytes (no String overhead).
- Price enum-to-lamports mapping lives in the agent client (`agents/signals.ts`), not on-chain — the program just stores whatever price is passed.

---

## 3. `purchase_listing`

**Args:** (none — all info pulled from accounts)

```rust
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
        constraint = listing.status == ListingStatus::Active as u8 @ ErrorCode::ListingNotActive,
        constraint = Clock::get()?.slot <= listing.ttl_slot @ ErrorCode::ListingExpired,
    )]
    pub listing: Account<'info, Listing>,

    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 8 + 4 + 64 + 8 + 1 + 1, // ~160
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

    /// The supplier's Agent account (read) — used to look up `supplier_agent.authority`
    /// so we can transfer lamports to the right wallet.
    #[account(
        constraint = supplier_agent.key() == listing.supplier @ ErrorCode::SupplierMismatch,
    )]
    pub supplier_agent: Account<'info, Agent>,

    /// The supplier's wallet (receives lamports). Must match supplier_agent.authority.
    #[account(
        mut,
        constraint = supplier_authority.key() == supplier_agent.authority @ ErrorCode::SupplierAuthorityMismatch,
    )]
    pub supplier_authority: SystemAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
```

**Notes / open questions:**
- Lamport transfer uses a System-program CPI in the body (`system_program::transfer`) from `authority` → `supplier_authority`. No PDA signing needed since the buyer is paying.
- **MagicBlock ER delegation:** the struct itself doesn't change — delegation wraps `listing` + `purchase` accounts at the client/SDK layer. If MagicBlock's ER SDK requires its own macro or an additional account (e.g. a delegation record), that's a later follow-up, not part of v1's Anchor struct. **Flag if you know otherwise.**
- Buyer pays **from `authority`**, not from the Agent PDA. Schema supports either interpretation — this is the simpler one. Confirm.

---

## 4. `deliver_payload`

**Args:** `buyer_payload_cid: String`

```rust
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
```

**Notes / open questions:**
- `purchase.buyer_payload_cid` is set in the body from the ix arg. Schema caps it at 64 chars; body enforces `require!(buyer_payload_cid.len() <= 64, ...)`.
- Purchase account was sized with `4 + 64` for the CID in step 3 — fits.
- No `system_program` needed (no account init, no lamport transfer).

---

## 5. `submit_rating`

**Args:** `verdict: u8`

```rust
#[derive(Accounts)]
pub struct SubmitRating<'info> {
    #[account(
        mut,
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
        constraint = listing.status == ListingStatus::Sold as u8 @ ErrorCode::ListingNotActive,
    )]
    pub listing: Account<'info, Listing>,

    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 1 + 8 + 1 + 1, // ~85
        seeds = [b"rating", purchase.key().as_ref()],
        bump,
    )]
    pub rating: Account<'info, Rating>,

    #[account(
        mut,
        constraint = supplier_agent.key() == listing.supplier @ ErrorCode::SupplierMismatch,
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
```

**Notes / open questions:**
- Rating PDA uniqueness (`[b"rating", purchase.key()]`) automatically blocks double-rating — no explicit `AlreadyRated` check needed, init will fail.
- Body sets `listing.status = Rated`, writes `rating`, updates `supplier_agent.reputation_num/den` per the schema's math.
- **Purchase commitment verification** (Flow 2 step 7: buyer verifies `sha256(plaintext) == listing.payload_commitment`) happens off-chain in the buyer agent. The program **cannot** re-verify this — it has no access to the plaintext. The rating verdict is the on-chain expression of that check. Flag if you want an explicit `payload_verified` flag on Rating.

---

## Error codes to add (beyond schema's reserved set)

The schema reserved `AlreadyRegistered`, `ListingExpired`, `ListingNotActive`, `NotBuyer`, `NotSupplier`, `AlreadyDelivered`, `AlreadyRated`. This proposal adds:

- `ListingIdMismatch` — passed `listing_id` != `supplier_agent.listings_created`
- `SupplierMismatch` — supplier_agent key doesn't match listing.supplier
- `SupplierAuthorityMismatch` — supplier_authority wallet doesn't match supplier_agent.authority
- `HandleTooLong` — handle > 32 chars
- `CidTooLong` — CID > 64 chars
- `NotDelivered` — rating attempted before deliver_payload

Flag any you'd rather rename or fold into the schema's set.

---

## Open questions summary (please answer inline in a review pass)

1. **Counter-in-seeds:** OK with `listing_id` passed as ix arg + asserted equal to `supplier_agent.listings_created`?
2. **Buyer payment source:** buyer pays from `authority` wallet (not from Agent PDA). OK?
3. **MagicBlock delegation:** assume ER delegation is client-side only, no struct-level macro needed. OK for v1 — revisit when integrating the ER SDK?
4. **Payload verification:** off-chain only (buyer agent checks sha256 before submitting rating). OK, or want an on-chain `payload_verified` flag?
5. **Error-code additions** (list above): any renames or removals?
6. **Handle field type:** `String` (max 32) per schema, or switch to fixed `[u8; 32]` for simpler sizing?

---

## Next step (gated)

Once you green-light this doc, the implementation order is:

1. Rewrite `programs/whisper/src/state.rs` — define `Agent`, `Listing`, `Purchase`, `Rating` structs + enums (`ListingStatus`, `Category`, `Verdict`) with `#[account]` + `InitSpace`.
2. Rewrite `programs/whisper/src/error.rs` — full error enum.
3. Replace `programs/whisper/src/instructions/initialize.rs` with five files: `register_agent.rs`, `create_listing.rs`, `purchase_listing.rs`, `deliver_payload.rs`, `submit_rating.rs`. Each exports its `Accounts` struct (verbatim from this doc) + handler.
4. Update `programs/whisper/src/instructions.rs` and `lib.rs` to wire the new instructions.
5. Replace `programs/whisper/tests/test_initialize.rs` with per-instruction LiteSVM tests.

**I will not start step 1 above until you approve this proposal.**
