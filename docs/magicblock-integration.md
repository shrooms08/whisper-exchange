# MagicBlock Ephemeral Rollup Integration — Proposal

**Status:** PROPOSAL — awaiting your approval before any code changes.
**Why:** make `purchase_listing` private. Today the buyer's identity, the listing they bought, and the price they paid are all visible on the base layer. Running purchase on the MagicBlock ER hides these for the duration of the rollup phase; only the final committed state lands on base layer.
**Source of truth:** `ephemeral-rollups-sdk` 0.11.2 + `magicblock-engine-examples` (`anchor-counter/programs/public-counter`). MagicBlock skill at `~/.claude/skills/magicblock/`.
**Hour-30 escape hatch:** if any of this slips, fall back to the base-layer `purchase_listing` we already have. No change to the demo flow except the privacy claim.

---

## Critical compatibility flag — read first

The Anchor program currently uses **`anchor-lang = "1.0.0"`** (anchor-cli 1.0).

`ephemeral-rollups-sdk = "0.11.2"` declares `anchor-lang = ">=0.28.0"` — open upper bound, so Cargo will resolve it, **but every published example uses `anchor-lang = "0.32.1"`** ([anchor-counter Cargo.toml](https://github.com/magicblock-labs/magicblock-engine-examples/blob/main/anchor-counter/programs/public-counter/Cargo.toml#L21-L23)). There is no published example or test that combines anchor-lang 1.0 with the ER SDK.

**Risk:** the SDK's proc-macros (`#[ephemeral]`, `#[delegate]`, `#[commit]`) emit code that uses anchor-lang internals. Macro expansions written against 0.32 may or may not compile against 1.0.

**Decision needed (option 1 vs 2):**
1. **Try anchor-lang 1.0 first.** Cheap to test (`cargo build`). If macros expand cleanly we're done; if they don't, fall back to option 2.
2. **Downgrade Whisper to anchor-lang 0.32.1.** Known-good combination, matches every published ER example. Costs us a re-derive of program ID, possible Anchor IDL spec drift (1.0 emits the new 0.1.0 IDL spec, 0.32 emits the legacy 0.1.0 spec — close but not identical), and `anchor build` compatibility checks.

My recommendation: **option 1**, with option 2 as documented fallback. We have 24h to ship; spending 30min on a build attempt is worth the chance of avoiding a downgrade.

---

## What gets delegated

Per your direction: **`Listing` and `Purchase` only**. Agent and Rating stay base-layer.

| Account | Delegated? | Why |
|---|---|---|
| `Agent` | No | Long-lived; reputation updates need cross-purchase visibility on base. |
| `Listing` | **Yes** (briefly) | Status flip Active → Sold + buyer/slot fields, all written during ER phase. |
| `Purchase` | **Yes** (briefly) | Initialized on the ER so the PDA lookup never appears on base until commit. |
| `Rating` | No | Rated post-undelegation on base layer (preserves reputation transparency). |

**Lifetime:** delegation lasts from `delegate_for_purchase` through `commit_and_undelegate_purchase`. Expected window: **~5–10 seconds** end-to-end. The MagicBlock validator auto-undelegates after a hard upper bound (currently enforced server-side, not client-configurable in `DelegateConfig` 0.11.2 — see "Lifetime" below).

---

## Three new instructions

### (a) `delegate_for_purchase` — base layer

Buyer-signed. Delegates the Listing PDA so subsequent operations on it route to the ER. The Purchase PDA does not exist yet — it gets initialized on the ER inside `purchase_on_er`.

```rust
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

#[delegate]
#[derive(Accounts)]
pub struct DelegateForPurchase<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,                 // buyer

    /// The Listing PDA being delegated to the ER. Must be in Active status
    /// and not yet expired — checked in the handler before the CPI.
    /// CHECK: validated by `del` constraint + handler-side status/ttl check.
    #[account(
        mut, del,
        seeds = [
            b"listing",
            listing_supplier.key().as_ref(),
            &listing_id.to_le_bytes(),
        ],
        bump,
    )]
    pub listing: AccountInfo<'info>,

    /// Read-only reference to the supplier Agent — used to resolve listing seeds.
    /// (Listing's `supplier` field is the supplier Agent PDA.)
    pub listing_supplier: Account<'info, Agent>,
}

pub fn handler(ctx: Context<DelegateForPurchase>, listing_id: u64) -> Result<()> {
    // Pre-flight: re-verify status + ttl before locking the account into the ER.
    // (Reading via UncheckedAccount → manual deserialize since `Listing` is now AccountInfo.)
    // ... handler body proposed in instruction-bodies pass; pasted here for reference only.

    ctx.accounts.delegate_listing(
        &ctx.accounts.authority,
        &[
            b"listing",
            ctx.accounts.listing_supplier.key().as_ref(),
            &listing_id.to_le_bytes(),
        ],
        DelegateConfig {
            commit_frequency_ms: 30_000, // 30s — matches anchor-counter convention
            validator: None,             // let MagicBlock router pick
        },
    )?;
    Ok(())
}
```

**Open questions:**
- Should `delegate_for_purchase` ALSO accept the Purchase PDA up-front and pre-init it on base, or do we rely on ephemeral-account creation inside `purchase_on_er`? Anchor-counter precedent is "init on base, delegate, mutate on ER" — so I lean toward: **add a second account `purchase` here, init it on base with `delegated=false` placeholder, then delegate it too**. Costs 1 extra account in this struct + a second `delegate_*` call. Confirm.

### (b) `purchase_on_er` — ephemeral rollup

Same logic as today's `purchase_listing` (transfer SOL, write Purchase fields, flip Listing.status), but executed on the ER. **Same `#[derive(Accounts)]` as our existing `PurchaseListing` modulo the Purchase init path** (init-on-ER vs init-on-base + delegate).

```rust
#[derive(Accounts)]
pub struct PurchaseOnEr<'info> {
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
        mut,
        seeds = [b"purchase", listing.key().as_ref()],
        bump,
        // If we pre-init'd in (a), this is `mut` only.
        // If we use ephemeral-account init on ER, swap to `init, payer = authority, space = 8 + Purchase::INIT_SPACE`.
    )]
    pub purchase: Account<'info, Purchase>,

    #[account(
        seeds = [b"agent", authority.key().as_ref()],
        bump = buyer_agent.bump,
        has_one = authority,
    )]
    pub buyer_agent: Account<'info, Agent>,

    #[account(constraint = supplier_agent.key() == listing.supplier @ ErrorCode::NotSupplier)]
    pub supplier_agent: Account<'info, Agent>,

    #[account(
        mut,
        constraint = supplier_authority.key() == supplier_agent.authority @ ErrorCode::UnauthorizedSupplier,
    )]
    pub supplier_authority: SystemAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
```

The handler body is identical to today's `purchase_listing::handler` — same lamport CPI, same field writes. We can either rename `purchase_listing` → `purchase_on_er` (drop the base-layer version) or keep both and let the client pick. **Recommend rename**: a single instruction with a single semantics is clearer; "base layer fallback" then means "skip the delegate step and run `purchase_on_er` against base RPC" — same instruction, different cluster.

**SOL transfer on the ER — open question.** The ER lets `system_program::transfer` work on delegated SystemAccounts inside the ER state. The buyer's `authority` and `supplier_authority` are NOT delegated — they're regular wallets. Lamport flow during the ER phase happens in committed state at `commit_and_undelegate_purchase` time, not live during ER. **This needs a hands-on test** — possible we need to drop the live transfer and settle the price via Private Payments API instead (USDC, not SOL). Flag for confirmation; if it doesn't work, the doc gets updated and we commit via Private Payments.

### (c) `commit_and_undelegate_purchase` — ephemeral rollup

Buyer-signed. Commits Listing + Purchase state back to base layer and releases delegation.

```rust
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;

#[commit]
#[derive(Accounts)]
pub struct CommitAndUndelegatePurchase<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,                  // buyer; pays the commit fee

    #[account(mut)]
    pub listing: Account<'info, Listing>,

    #[account(mut)]
    pub purchase: Account<'info, Purchase>,
    // `#[commit]` macro injects: magic_context, magic_program.
}

pub fn handler(ctx: Context<CommitAndUndelegatePurchase>) -> Result<()> {
    ctx.accounts.listing.exit(&crate::ID)?;
    ctx.accounts.purchase.exit(&crate::ID)?;

    MagicIntentBundleBuilder::new(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.magic_context.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
    )
    .commit_and_undelegate(&[
        ctx.accounts.listing.to_account_info(),
        ctx.accounts.purchase.to_account_info(),
    ])
    .build_and_invoke()?;
    Ok(())
}
```

After this, the buyer's TS client calls `GetCommitmentSignature(erTxSig, erConnection)` to wait for the commit to confirm on base layer; only then is it safe to call `deliver_payload` (supplier needs the committed Purchase visible on base).

---

## Cargo.toml additions

```toml
# programs/whisper/Cargo.toml
[dependencies]
anchor-lang = "1.0.0"   # already present
ephemeral-rollups-sdk = { version = "0.11.2", features = ["anchor"] }
```

If we hit anchor 1.0 ↔ SDK macro incompatibility, the fallback is to add `anchor-lang = "0.32.1"` (downgrade) and re-run `anchor keys sync`.

---

## TS dependency additions

```json
// agents/package.json
{
  "dependencies": {
    "@magicblock-labs/ephemeral-rollups-sdk": "^0.11.2"
  }
}
```

This gives buyer.ts access to `DELEGATION_PROGRAM_ID`, `GetCommitmentSignature`, and the magic program/context constants for building the commit transaction.

---

## Buyer agent flow changes (`agents/buyer.ts`)

Today the buyer has a single Anchor `Connection` to Helius. New flow needs **two**:

```ts
const baseConnection = new Connection(BASE_RPC, 'confirmed');
const erConnection = new Connection(ER_RPC, 'confirmed');

const baseProvider = new AnchorProvider(baseConnection, wallet, { commitment: 'confirmed' });
const erProvider   = new AnchorProvider(erConnection,   wallet, { commitment: 'confirmed' });

const programBase = new Program(idl, baseProvider);
const programEr   = new Program(idl, erProvider);
```

Routing per instruction:

| Step | Connection | Program handle |
|---|---|---|
| Scan `program.account.listing.all()` | base | `programBase` |
| `delegate_for_purchase` | base | `programBase` |
| Wait for delegation to propagate | poll `accountInfo.owner == DELEGATION_PROGRAM_ID` on **base** | n/a |
| `purchase_on_er` | ER | `programEr` (use `skipPreflight: true`) |
| `commit_and_undelegate_purchase` | ER | `programEr` (use `skipPreflight: true`) |
| Wait for commit | `GetCommitmentSignature(erSig, erConnection)` → polls base | n/a |
| Subsequent `purchase.fetch()` for delivery watcher | base | `programBase` |
| `submit_rating` | base | `programBase` |

State propagation gotchas (from the magicblock skill):
- After `delegate_for_purchase` lands on base, **sleep 3s** before sending the ER tx. Account ownership change needs to propagate to the ER router.
- `purchase_on_er` and `commit_and_undelegate_purchase` MUST set `skipPreflight: true` — ER has its own preflight semantics, the standard Solana preflight rejects delegated accounts.
- `GetCommitmentSignature` blocks until the ER's commit-back transaction confirms on base layer. Do NOT call `deliver_payload`-watching code until this returns.

Buyer's existing `purchase()` function gets replaced with a new `purchaseViaEr()` that walks: delegate → wait → purchase_on_er → commit_and_undelegate → wait. Idempotency model is unchanged (`state.purchasedListings` set keyed by listing PDA).

---

## `.env` changes

Add to `agents/.env.example`:

```bash
# Base layer (existing — Helius keeps the gPA-friendly RPC).
BASE_RPC=https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}

# MagicBlock ephemeral rollup endpoint (devnet).
ER_RPC=https://devnet.magicblock.app/
ER_WS=wss://devnet.magicblock.app/
```

`HELIUS_API_KEY` keeps doing what it does. Supplier.ts doesn't change — it never touches the ER (delivery + create_listing are base-layer).

---

## Delegation lifetime config

Per your spec, target was **60s max lifetime** and **30s commit interval**. Reality check from `ephemeral-rollups-sdk` 0.11.2 source ([rust/sdk/src/cpi.rs:27](https://github.com/magicblock-labs/ephemeral-rollups-sdk/blob/main/rust/sdk/src/cpi.rs)):

```rust
pub struct DelegateConfig {
    pub commit_frequency_ms: u32,
    pub validator: Option<Pubkey>,
}
```

There is **no `time_until_undelegation_ms` / max-lifetime field** in the current SDK — it was present in older 0.6.x docs but was removed. The hard lifetime is enforced by the validator/router server-side; client-supplied `DelegateConfig` only controls `commit_frequency_ms` and which validator to pin. So:

- `commit_frequency_ms: 30_000` ✓ — matches your spec, matches anchor-counter precedent.
- "60s max lifetime" — not a config knob we can set. If the validator's default lifetime exceeds 60s, our purchase happens well within bounds (~5–10s). If it's shorter, we're already conservative. Either way: out of our control and not a concern for the demo.

---

## Failure mode handling

### Failure: `delegate_for_purchase` succeeds, `purchase_on_er` fails

The Listing is now owned by the delegation program but no Purchase exists. Two recovery paths:

1. **Validator auto-undelegates after lifetime expires** (default ~minutes). Listing returns to our program's ownership; status is still Active. Buyer's scanner picks it up on next iteration and tries again.
2. **Buyer can call `commit_and_undelegate_purchase`** with a no-op committed state. But the Purchase account doesn't exist, so the macro's account list is shorter. Need a separate `undelegate_only_listing` instruction — adds complexity.

**Recommendation: rely on (1).** Buyer agent treats a stuck delegation as "skip this listing for ~lifetime seconds, retry next cycle". Cleanest for v1. Code-wise: `state.purchasedListings.add(listingKey)` stays set, but we age out entries older than 90s so the next cycle can re-attempt.

### Failure: `purchase_on_er` succeeds, `commit_and_undelegate_purchase` fails

Worse — Purchase now exists on the ER but base layer doesn't see it. Buyer holds the ER's record but supplier can't deliver (delivery loop polls base). Recovery: retry `commit_and_undelegate_purchase` until it confirms. If the buyer's process dies, the validator's lifetime expiry will eventually auto-commit-and-undelegate, so the ER state lands on base anyway.

Buyer agent: wrap `commit_and_undelegate_purchase` in withRetry (3 attempts, 2s backoff). After that, log COMMIT_FAILED and let auto-undelegation handle it.

### Failure: validator down / ER RPC unreachable

Buyer detects via timeout on `purchase_on_er`. Aborts the cycle, logs ER_UNREACHABLE, falls back to base-layer `purchase_listing` — **same code path the supplier ships today**. This is the hour-30 escape hatch from CLAUDE.md.

---

## Test plan (post-approval)

1. `anchor build` against the proposed program changes — first pass with anchor-lang 1.0; if macros fail, downgrade to 0.32.1 and report.
2. `anchor deploy --provider.cluster devnet` (re-uses existing program ID from `anchor keys sync`).
3. Update `scripts/e2e-test.ts` to add 2 new assertions:
   - Listing was delegated mid-flight (`accountInfo.owner == DELEGATION_PROGRAM_ID` for a window before commit).
   - Listing.status ends as `Rated` AND the listing's lamport history shows no buyer-pubkey trace (privacy proof — best-effort, base-layer only sees the committed final state).
4. Run e2e from cold state. Expected: same green pass we have today + privacy added.

---

## Open questions for you (please answer before I start implementation)

1. **Anchor version**: try anchor-lang 1.0 first (recommended) vs preemptive downgrade to 0.32.1?
2. **Purchase init path**: pre-init Purchase on base inside `delegate_for_purchase` (cleanest, matches anchor-counter pattern) vs init on ER via ephemeral-accounts?
3. **Rename or keep both**: rename `purchase_listing` → `purchase_on_er` (single semantics, ER-or-base routing decided by client) vs keep both as separate instructions?
4. **SOL transfer on ER**: live `system_program::transfer` inside `purchase_on_er` (works if SystemAccounts are well-handled in ER; needs hands-on confirm) vs switch the price flow to USDC via Private Payments API for true privacy?
5. **TTL constant on Listing**: today supplier sets `ttl_slot = current_slot + 60`. Once Listing is delegated, does ttl still tick? Validator slot vs base slot — confirm we don't need to extend the constant.
6. **Failure recovery: stuck listings**: age out `state.purchasedListings` entries older than 90s (recommended) vs stricter "never retry until confirmed undelegated"?

---

## Next step (gated)

Once you green-light this doc, the implementation order is:

1. Bump `programs/whisper/Cargo.toml` deps; first `anchor build` to confirm macro compatibility.
2. Add `delegate_for_purchase`, `purchase_on_er`, `commit_and_undelegate_purchase` instruction files.
3. Update `agents/buyer.ts` for dual-connection routing.
4. Add ER assertions to `scripts/e2e-test.ts`.
5. Re-run `scripts/run-e2e.sh` from cold state. Report.

**No code touched until you approve this proposal.**
