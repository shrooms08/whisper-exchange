# MagicBlock Ephemeral Rollup Integration — Two-Tx Spec (Final)

**Status:** PROPOSAL — awaiting your approval before any program-instruction code changes.
**Why:** make `purchase_listing` private. Today the buyer's identity, the listing they bought, and the price they paid are visible on base layer. Running the state-flip on the MagicBlock ER hides the buyer-listing linkage during the ER phase; price + supplier wallet appear on base only at settle time, decoupled from the listing-status flip.
**Source of truth:** `ephemeral-rollups-sdk = "0.11.2"` + `magicblock-engine-examples/anchor-counter/programs/public-counter` + the in-tree `delegate_test`, `commit_and_undelegate_test`, and `delegate_test_with_transfer` smoke tests (commits `4052149` + `0f912b2`).
**Hour-30 escape hatch:** `purchase_listing_public` (today's instruction, renamed) stays in the program as a one-tx fallback. Buyer agent picks via `USE_PRIVATE_PURCHASE` env var — default `false` during integration, flip `true` when green.

---

## Empirical findings that shape this spec

Two on-chain tests, both rejected with `TransactionError::InvalidAccountForFee`:

1. Naked transfer between two non-delegated wallets routed through the ER — sig `4QcV2QvP…qLhPT` (full report: [docs/decisions.md](decisions.md) "2026-04-25 — SOL transfer must happen on base layer post-commit").
2. Bundled-CPI: an Anchor instruction (`delegate_test_with_transfer`) that mutates a delegated PDA AND does a `system_program::transfer` CPI in the same tx — sig `5Ks2snHq…HyZ1a`. **Same error.**

**Conclusion:** the ER's fee model rejects fee-payers whose accounts are not "warmed" in ER state, regardless of whether the tx mutates a delegated PDA. We cannot move SOL inside an ER tx that's paid for by a regular base-layer wallet.

**Implication:** the integration is a **two-tx flow**:
1. ER tx mutates state only.
2. Base-layer tx moves SOL.

---

## What gets delegated

| Account | Delegated? | Why |
|---|---|---|
| `Agent` | **No** | Reputation + listings_created visibility across buyer/seller cycles requires base-layer presence. Read by other agents constantly. Delegating would freeze the rest of the marketplace during a single purchase. |
| `Listing` | **Yes**, briefly | Status flip Active → Sold + buyer/slot fields written on the ER. |
| `Purchase` | **Yes**, briefly | Inited on base inside `delegate_for_purchase`, then delegated; written on the ER. The buyer-listing linkage is what the ER hides. |
| `Rating` | No | Rated post-everything on base layer. Reputation transparency is a feature, not a bug. |

Delegation lifetime: ~3–8 seconds end-to-end (delegation propagation + one ER tx + commit).

---

## Schema change required

`Purchase` gains a new field:

```rust
#[account]
#[derive(InitSpace)]
pub struct Purchase {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub price_paid_lamports: u64,
    #[max_len(64)]
    pub buyer_payload_cid: String,
    pub purchased_at_slot: u64,
    pub delivered: bool,
    pub settled: bool,                     // NEW — set true by settle_purchase
    pub bump: u8,
}
```

- `purchase_listing_private` sets `settled = false` (initial value).
- `settle_purchase` flips `settled = true`.
- Supplier delivery watcher (today: `delivered == false`) now requires `delivered == false && settled == true` so the supplier never delivers a payload before the buyer actually paid.

**Migration cost:** the new size differs from existing on-chain Purchase accounts. Anchor will fail to deserialize the old accounts. **Confirmed 2026-04-25: skip migration.** Existing Purchases on devnet (from today's e2e runs) are already terminal-state (rated) and the buyer scan loop never reads them — they're orphaned with no observable impact. New e2e cycles produce Purchases at the new layout.

[docs/anchor-schema.md](anchor-schema.md) gets the same field added (single-line edit alongside the `delivered` row).

---

## Three new program instructions (split into two ixs for the init/delegate pair)

**Amendment 2026-04-25:** the init+delegate step is split into two instructions per your call. Buyer client batches both into a single base-layer tx via `Transaction.add(initIx).add(delegateIx)`. Atomicity is preserved at the tx level; the discriminator-handling risk in the manual-init path is avoided.

### (a1) `init_purchase_for_delegation` — base layer

Buyer-signed. Standard Anchor `init` for the Purchase PDA. Pre-flight checks the Listing is still Active + not expired so we don't waste rent on a stale listing.

```rust
#[derive(Accounts)]
#[instruction(listing_id: u64)]
pub struct InitPurchaseForDelegation<'info> {
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
            listing_supplier.key().as_ref(),
            &listing_id.to_le_bytes(),
        ],
        bump = listing.bump,
        constraint = listing.status == ListingStatus::Active @ ErrorCode::ListingNotActive,
    )]
    pub listing: Account<'info, Listing>,

    pub listing_supplier: Account<'info, Agent>,

    #[account(
        init,
        payer = authority,
        space = 8 + Purchase::INIT_SPACE,
        seeds = [b"purchase", listing.key().as_ref()],
        bump,
    )]
    pub purchase: Account<'info, Purchase>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitPurchaseForDelegation>, _listing_id: u64) -> Result<()> {
    require!(
        Clock::get()?.slot <= ctx.accounts.listing.ttl_slot,
        ErrorCode::ListingExpired
    );

    let purchase = &mut ctx.accounts.purchase;
    purchase.listing = ctx.accounts.listing.key();
    purchase.buyer = ctx.accounts.buyer_agent.key();
    purchase.price_paid_lamports = 0;
    purchase.buyer_payload_cid = String::new();
    purchase.purchased_at_slot = 0;
    purchase.delivered = false;
    purchase.settled = false;
    purchase.bump = ctx.bumps.purchase;
    Ok(())
}
```

### (a2) `delegate_for_purchase` — base layer

Buyer-signed. Both Listing and Purchase exist on-chain by this point (Listing was created by the supplier via `create_listing`; Purchase was just initialized by `init_purchase_for_delegation`). This instruction does only the two `delegate_<field>` CPIs.

```rust
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

#[delegate]
#[derive(Accounts)]
#[instruction(listing_id: u64)]
pub struct DelegateForPurchase<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,                  // buyer

    #[account(
        seeds = [b"agent", authority.key().as_ref()],
        bump = buyer_agent.bump,
        has_one = authority,
    )]
    pub buyer_agent: Account<'info, Agent>,

    /// CHECK: existing Listing PDA — `del` macro will transfer ownership.
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

    pub listing_supplier: Account<'info, Agent>,

    /// CHECK: existing Purchase PDA (created in the prior ix).
    #[account(
        mut, del,
        seeds = [b"purchase", listing.key().as_ref()],
        bump,
    )]
    pub purchase: AccountInfo<'info>,
}

pub fn handler(ctx: Context<DelegateForPurchase>, listing_id: u64) -> Result<()> {
    let listing_key = ctx.accounts.listing.key();
    let cfg = DelegateConfig {
        commit_frequency_ms: 30_000, // see Q2
        validator: None,
    };
    ctx.accounts.delegate_listing(
        &ctx.accounts.authority,
        &[
            b"listing",
            ctx.accounts.listing_supplier.key().as_ref(),
            &listing_id.to_le_bytes(),
        ],
        cfg,
    )?;
    ctx.accounts.delegate_purchase(
        &ctx.accounts.authority,
        &[b"purchase", listing_key.as_ref()],
        cfg,
    )?;
    Ok(())
}
```

Buyer client batches both:
```ts
const tx = new Transaction()
  .add(await programBase.methods.initPurchaseForDelegation(...).instruction())
  .add(await programBase.methods.delegateForPurchase(...).instruction());
await sendAndConfirm(tx);
```

---

### (b) `purchase_listing_private` — ephemeral rollup

Buyer-signed. Runs on the ER. Mutates delegated Listing + Purchase. **No SOL transfer.** Then commits and undelegates both back to base.

```rust
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};

#[commit]
#[derive(Accounts)]
pub struct PurchaseListingPrivate<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,                  // buyer

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
        bump = purchase.bump,
        constraint = purchase.listing == listing.key() @ ErrorCode::ListingNotActive,
        constraint = purchase.buyer == buyer_agent.key() @ ErrorCode::NotBuyer,
        constraint = !purchase.delivered @ ErrorCode::AlreadyDelivered,
        constraint = !purchase.settled @ ErrorCode::AlreadySettled,
    )]
    pub purchase: Account<'info, Purchase>,

    #[account(
        seeds = [b"agent", authority.key().as_ref()],
        bump = buyer_agent.bump,
        has_one = authority,
    )]
    pub buyer_agent: Account<'info, Agent>,
    // `#[commit]` macro injects: magic_context, magic_program.
}

pub fn handler(ctx: Context<PurchaseListingPrivate>) -> Result<()> {
    let clock = Clock::get()?;
    require!(clock.slot <= ctx.accounts.listing.ttl_slot, ErrorCode::ListingExpired);

    // Mutate Listing.
    let listing = &mut ctx.accounts.listing;
    listing.status = ListingStatus::Sold;
    listing.buyer = Some(ctx.accounts.buyer_agent.key());
    listing.purchase_slot = Some(clock.slot);

    // Mutate Purchase (placeholder fields → real values).
    let purchase = &mut ctx.accounts.purchase;
    purchase.price_paid_lamports = ctx.accounts.listing.price_lamports;
    purchase.purchased_at_slot = clock.slot;
    // delivered + settled remain false; buyer_payload_cid empty until deliver_payload.

    // Persist both before commit-back.
    ctx.accounts.listing.exit(&crate::ID)?;
    ctx.accounts.purchase.exit(&crate::ID)?;

    // Commit + undelegate both, single bundle.
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

**Note:** `purchase.listing == listing.key()` is implicit from the seed but explicit for clarity. The `AlreadySettled` error code is a new addition (see error-code list below).

---

### (c) `settle_purchase` — base layer, post-commit

Buyer-signed. Verifies the Purchase exists with matching buyer + price, then transfers SOL on base layer. Sets `settled = true`.

```rust
use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

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
        constraint = purchase.price_paid_lamports == listing.price_lamports @ ErrorCode::ListingNotActive,
        constraint = !purchase.settled @ ErrorCode::AlreadySettled,
    )]
    pub purchase: Account<'info, Purchase>,

    /// Supplier Agent (read) — used to resolve supplier_authority.
    #[account(
        constraint = supplier_agent.key() == listing.supplier @ ErrorCode::NotSupplier,
    )]
    pub supplier_agent: Account<'info, Agent>,

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
```

---

## Existing instruction changes

- **`purchase_listing` → renamed `purchase_listing_public`.** Body unchanged. Stays in the program as the escape-hatch fallback. Buyer agent picks via env var.
- **`deliver_payload`**: gain a new constraint `purchase.settled @ ErrorCode::NotSettled`. Supplier delivers only if buyer has paid. Today's `!purchase.delivered` check still applies.
- **`submit_rating`**: no change. `purchase.delivered` is the gate; rating implicitly requires settle (since deliver requires settle).
- **`create_listing`**, **`register_agent`**: no change.

---

## Error code additions

```rust
pub enum ErrorCode {
    // ... existing 12 ...
    AlreadySettled,    // settle_purchase called twice on same Purchase
    NotSettled,        // deliver_payload called before settle_purchase
}
```

---

## Cargo.toml — no further changes

Already on `anchor-lang = "0.32.1"` + `ephemeral-rollups-sdk = "0.11.2"` from commit `4052149`. The three test instructions stay in until E2E green; stripped in a final cleanup commit before demo build.

---

## Buyer agent flow changes

Today's [agents/buyer.ts](../agents/buyer.ts) has one Connection (Helius). New flow needs **two**, plus an env-driven branch.

```ts
// New env vars in agents/.env (copy to .env.example)
BASE_RPC=https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}
ER_RPC=https://devnet.magicblock.app/
USE_PRIVATE_PURCHASE=false   // flip to true once integration is green
```

Setup at startup:

```ts
const baseConnection = new Connection(BASE_RPC, 'confirmed');
const erConnection = new Connection(ER_RPC, 'confirmed');
const baseProvider = new AnchorProvider(baseConnection, wallet, { commitment: 'confirmed' });
const erProvider = new AnchorProvider(erConnection, wallet, { commitment: 'confirmed' });
const programBase = new Program(idl, baseProvider);
const programEr = new Program(idl, erProvider);
```

Routing per instruction:

| Step | Connection | Program | Notes |
|---|---|---|---|
| `listing.all()` (scan) | base | `programBase` | unchanged |
| `delegate_for_purchase` | base | `programBase` | new — sends to base |
| Wait for delegation propagation | poll `accountInfo.owner == DELEGATION_PROGRAM_ID` on base | n/a | sleep 3s minimum (per skill) |
| `purchase_listing_private` | ER | `programEr` (`skipPreflight: true`) | new |
| Wait for commit-back | `GetCommitmentSignature(erSig, erConnection)` | n/a | blocks until base sees committed state |
| `settle_purchase` | base | `programBase` | new — sends to base |
| `purchase.fetch()` (delivery watcher) | base | `programBase` | unchanged; settled now part of state |
| `submit_rating` | base | `programBase` | unchanged |

New buyer code path (replaces today's `purchase()` helper inside `scanOnce`):

```ts
async function purchaseViaEr(chain, listingPda, listing, supplierAgent, ...) {
  const sig1 = await programBase.methods
    .delegateForPurchase(new BN(listing.listingId))
    .accounts({ ... })
    .rpc({ commitment: 'confirmed' });

  await sleep(3_000); // delegation propagation

  const erSig = await programEr.methods
    .purchaseListingPrivate()
    .accounts({ ... })
    .rpc({ skipPreflight: true, commitment: 'confirmed' });

  await GetCommitmentSignature(erSig, erConnection); // wait for base commit-back

  const sig3 = await programBase.methods
    .settlePurchase()
    .accounts({ ... })
    .rpc({ commitment: 'confirmed' });

  return { delegateSig: sig1, erSig, settleSig: sig3 };
}
```

If `USE_PRIVATE_PURCHASE === 'false'`, the existing single-tx `purchaseListingPublic` path runs unchanged.

---

## Failure handling

| Failure point | Buyer state observable on base | Recovery |
|---|---|---|
| `delegate_for_purchase` fails | No state change. `listings_created` unchanged, no Purchase PDA. | Buyer retries on next scan cycle. Standard withRetry. |
| `purchase_listing_private` fails on ER | Listing + Purchase still owned by delegation program (post-delegate). Buyer's Purchase PDA exists but holds placeholder values (`price=0`, `settled=false`). | Validator's auto-undelegate kicks in after lifetime expires (~minutes). Listing returns to whisper, status still Active. **Hardening:** add `recover_stuck_purchase` ix that calls commit_and_undelegate manually — buyer agent invokes on startup if it sees orphaned Purchase + delegated Listing. Time-permitting. |
| `settle_purchase` fails (buyer underfunded) | Purchase exists with placeholder + status=Sold but `settled=false`. Listing.status=Sold (not reversible without a new ix). | **Idempotent retry:** `settled=false` is the gate. Buyer re-attempts `settle_purchase` on the next loop iteration. Once it lands, `settled=true`, supplier's delivery watcher unblocks. |
| Commit-back tx delayed | Base layer doesn't yet see the post-commit Listing/Purchase state. `settle_purchase` fails the price check. | `GetCommitmentSignature` polls until commit-back lands; buyer doesn't proceed to settle until then. |
| ER RPC unreachable | Tx times out. | Falls back to `purchase_listing_public` (escape hatch). Logs `ER_UNREACHABLE` + flips that listing to a "use public" set for the rest of the session. |

---

## Open questions for you (please answer; my recommendations inline)

### Q1: Should `delegate_for_purchase` also delegate the Agent accounts, or just Listing+Purchase?

**Recommendation: just Listing + Purchase.** Don't delegate Agent.

Reasoning:
- Agent state (reputation, listings_created, x25519 pubkey) is read by other agents constantly during scan + match. Delegating freezes that read path on base for the duration of the ER session.
- The ER work in `purchase_listing_private` only mutates Listing + Purchase. Agent is read-only during purchase.
- Trade-off would be: if Agent were delegated, supplier rep updates inside the ER could be batched. But submit_rating is base-layer anyway in our schema, so that doesn't apply.

### Q2: Commit interval — 30s default per anchor-counter, or shorter for our short ER session?

**Recommendation: 30s default.**

Reasoning:
- `commit_frequency_ms` controls the validator's *periodic* commit timer. We explicitly call `commit_and_undelegate` at the END of `purchase_listing_private`, so the periodic timer never fires during our session (which is ~3–8s wall-clock).
- A shorter interval (e.g. 5s) would only matter if we held delegation longer than the timer without an explicit commit. We don't.
- 30s is what every published example uses. Use the well-trodden value.

### Q3: For `recover_stuck_purchase`, do we need a separate program instruction or does the SDK expose a client-side undelegate primitive?

**Need a separate program instruction.**

Reasoning:
- `MagicIntentBundleBuilder.commit_and_undelegate(...)` is invoked via CPI from the OWNER program (whisper). The `#[commit]` macro on the Accounts struct is what links the CPI to the right authority.
- The TS SDK's `@magicblock-labs/ephemeral-rollups-sdk` exposes `DELEGATION_PROGRAM_ID` and `GetCommitmentSignature` but **no client-side "force undelegate without owner consent"** path. That would be a security hole — anyone could claw back any program's delegated state.
- So `recover_stuck_purchase` is its own #[commit] instruction in the program. Same shape as `commit_and_undelegate_test` (which already exists), parameterized for Listing + Purchase.

**Confirmed 2026-04-25: deferred.** Not in v1 instruction set. Sunday-morning nice-to-have only if time permits.

### Q4: TS client RPC switching — single AnchorProvider with two Connections, or two separate AnchorProvider instances?

**Recommendation: two separate `AnchorProvider` instances, two `Program` handles.**

Reasoning:
- AnchorProvider's `connection` field is set at construction; there's no clean way to swap it. The "single provider with two connections" path requires reaching into provider internals or rebuilding the provider per-call.
- Anchor-counter's TS tests + the magicblock skill's TypeScript-setup doc both use **two providers, two Programs**:
  ```ts
  const programBase = new Program(idl, baseProvider);
  const programEr = new Program(idl, erProvider);
  ```
- Both Programs share the same `idl` + `wallet` + `programId` — only the `connection` differs. Cheap to construct.
- Caller picks `programBase.methods.x()` vs `programEr.methods.x()` per instruction. Explicit and grep-able.

---

## Test plan (post-approval)

1. Add `settled: bool` to Purchase struct + wire all three new instructions. `anchor build` clean.
2. Solana program extend if binary grew past current allocation. `anchor deploy --provider.cluster devnet`.
3. Update [agents/buyer.ts](../agents/buyer.ts) for dual-connection + `USE_PRIVATE_PURCHASE` branch.
4. Update [scripts/e2e-test.ts](../scripts/e2e-test.ts) to add ER-specific assertions:
   - Listing was delegated mid-flight (poll with short window).
   - `Purchase.settled === true` after the run.
   - All three tx sigs captured (delegate, ER, settle).
5. Run `scripts/run-e2e.sh` from cold state with `USE_PRIVATE_PURCHASE=false` first → should match today's green pass.
6. Re-run with `USE_PRIVATE_PURCHASE=true` → the new path. All 6 existing assertions still pass + the new ER-specific ones.

---

## Implementation order (gated on your approval of this spec)

1. **Schema**: add `settled: bool` to Purchase. Update [anchor-schema.md](anchor-schema.md). One field, one error code addition (`AlreadySettled`, `NotSettled`).
2. **Existing rename**: `purchase_listing` → `purchase_listing_public`. Update lib.rs + buyer.ts call site.
3. **`delegate_for_purchase`**: new file, manual init + delegate × 2.
4. **`purchase_listing_private`**: new file, mutate + commit_and_undelegate.
5. **`settle_purchase`**: new file, transfer + settled=true.
6. **`deliver_payload`**: add `settled` constraint (one-line change).
7. `anchor build` + extend + deploy.
8. **`agents/buyer.ts`**: dual-connection, `USE_PRIVATE_PURCHASE` branch, `purchaseViaEr` helper.
9. **`scripts/e2e-test.ts`**: new assertions.
10. Run e2e cold-state.

Steps 1–2 are mechanical; 3–6 are the meaty new work; 7+ is verification.

**No code touched until you approve this spec.**
