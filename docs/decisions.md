# Architectural Decisions Log

Running log of architectural decisions made during Whisper Exchange development. Timestamped, terse. If a decision reverses a prior one, append — don't edit.

---

## 2026-04-24 — MagicBlock ER delegation is client-side only for v1

- `purchase_listing` is the only instruction that runs on the ephemeral rollup.
- No struct-level macro or extra delegation-record account in the Anchor program for v1.
- Delegation of `listing` + `purchase` accounts to the ER, and the commit-back to base layer, are driven by the MagicBlock ER SDK at the TypeScript client layer.
- Rationale: keeps the on-chain `#[derive(Accounts)]` identical on base layer and ER, so the same program binary handles both. Revisit if MagicBlock's SDK requires program-side changes when we integrate.
- If ER integration slips past Hour 30 (Saturday night), fall back to running `purchase_listing` on base layer — privacy is lost but flow still works (CLAUDE.md "escape hatch").

## 2026-04-25 — Reverses 2026-04-24: program needs ER macros after all (Anchor 0.32.1 downgrade)

- Adding `ephemeral-rollups-sdk` to anchor-lang 1.0.0 hard-fails at the SDK lib-compilation level (borsh + AccountInfo::realloc + Pubkey type mismatches).
- **Downgraded program to anchor-lang 0.32.1**, added `ephemeral-rollups-sdk = "0.11.2"` (`features = ["anchor"]`), wrapped `pub mod whisper` in `#[ephemeral]`. E2E green-from-fresh on the redeployed program — see commit `4052149`.
- Rationale: keeping anchor 1.0 means losing the ER SDK's macros entirely (would have to reimplement delegate/commit CPIs by hand). Downgrade is the lower-risk path with 24h on the clock.

## 2026-04-25 — SOL transfer must happen on base layer post-commit, NOT inside the ER tx

- Two empirical tests rule out the ER one-tx pattern for SOL movements:
  - `scripts/test-sol-on-er.ts` — naked `system_program::transfer` between two non-delegated wallets, sent to ER endpoint while a delegated PDA exists. Result: ER rejected with `TransactionError::InvalidAccountForFee` (sig `4QcV2QvP…qLhPT`).
  - `scripts/test-sol-on-er-bundled.ts` — bundled-CPI: an Anchor instruction `delegate_test_with_transfer` that mutates a delegated PDA AND does the SOL transfer in one tx, sent to the ER. Result: same `InvalidAccountForFee` (sig `5Ks2snHq…HyZ1a`).
- Diagnosis: the ER's fee model rejects fee-payers whose account is not "warmed" in the ER's local state. The buyer wallet in our purchase flow is a regular base-layer wallet; the ER won't process its txs.
- **Decision: two-tx flow for `purchase_listing_private`:**
  1. **`purchase_listing_private` runs on the ER.** Mutates delegated `Listing` + `Purchase` PDAs only. **No SOL transfer inside this instruction.** Fee is somehow handled by the ER (TBD whether buyer needs to pre-deposit, or ER absorbs as gasless — confirm during integration).
  2. **`settle_purchase` runs on base layer post-commit.** Does the actual `system_program::transfer(buyer → supplier_authority, price_lamports)`. Buyer agent calls this after the commit-back signature confirms.
- Privacy story: buyer-listing linkage is hidden during the ER phase. The price + supplier wallet appear on base only at settle time, decoupled in time from the listing-status flip. Less ideal than fully-private one-tx, but real privacy improvement over the current public flow.
- If `settle_purchase` reveals more than acceptable, fall back to MagicBlock Private Payments API (USDC). Out of scope for v1 demo.
