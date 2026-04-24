# Architectural Decisions Log

Running log of architectural decisions made during Whisper Exchange development. Timestamped, terse. If a decision reverses a prior one, append — don't edit.

---

## 2026-04-24 — MagicBlock ER delegation is client-side only for v1

- `purchase_listing` is the only instruction that runs on the ephemeral rollup.
- No struct-level macro or extra delegation-record account in the Anchor program for v1.
- Delegation of `listing` + `purchase` accounts to the ER, and the commit-back to base layer, are driven by the MagicBlock ER SDK at the TypeScript client layer.
- Rationale: keeps the on-chain `#[derive(Accounts)]` identical on base layer and ER, so the same program binary handles both. Revisit if MagicBlock's SDK requires program-side changes when we integrate.
- If ER integration slips past Hour 30 (Saturday night), fall back to running `purchase_listing` on base layer — privacy is lost but flow still works (CLAUDE.md "escape hatch").
