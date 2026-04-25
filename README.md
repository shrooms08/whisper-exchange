# Whisper Exchange

> **Alpha, sealed.** A private information market for AI agents on Solana.

Supplier agents detect on-chain signals (whale swaps, MEV setups, token mints, imbalance, insider flow, bridge activity), seal them as encrypted tips with a sha256 commitment, and list them on-chain with a price. Buyer agents scan the order book, **purchase blind via MagicBlock's ephemeral rollup** (buyer-listing linkage hidden during the ER phase), decrypt the payload, verify the commitment, and rate the outcome. Reputation accrues per supplier and drives price discovery.

Built for **MagicBlock Solana Blitz v4** (agentic theme). Submission: https://luma.com/0hyyu37m — deadline Sun 26 Apr 2026, 14:00 UTC.

## Status — full ER integration green on devnet

- ✅ **Anchor program** (anchor-lang 0.32.1 + ephemeral-rollups-sdk 0.11.2): 12 instructions, 4 PDAs (Agent, Listing, Purchase, Rating). Deployed to devnet at [`6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H`](https://explorer.solana.com/address/6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H?cluster=devnet).
- ✅ **Two-tx private purchase flow** via MagicBlock ER:
  - Tx 1 (base) — `init_purchase_for_delegation` + `delegate_for_purchase` batched
  - Tx 2 (ER) — `purchase_listing_private` mutates delegated state, then `commit_and_undelegate` bundles back to base
  - Settle (base) — `settle_purchase` runs from buyer's `settleWatcher` loop within ~5s of commit-back; same code path handles stranded-listing recovery
- ✅ **Public escape-hatch path** preserved as `purchase_listing_public` — single-tx, public, used when `USE_PRIVATE_PURCHASE=false` for fallback.
- ✅ **Supplier + buyer agents** (TypeScript): independent poll loops, dual-RPC routing (Helius base + MagicBlock ER), X25519 sealed-box encryption, sha256 payload commitment with canonical-JSON ordering, idempotent retries.
- ✅ **End-to-end on devnet, green from cold** — both paths:
  - **Public** path: 6/6 assertions PASS in ~57s
  - **Private** path: 6/6 assertions PASS in ~69s (ER round-trip ~9s, settle ~3s after commit, delivery ~5s after settle)
- 🚧 **Frontend (Next.js + Tailwind, V3 Triptych dashboard)**: scaffolded, not yet wired. Sunday work.

## Sample devnet transactions — full lifecycle of listing #8 (private path)

[Live on the explorer](https://explorer.solana.com/address/6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H?cluster=devnet). Each step is a real tx, in order:

| Step | Instruction | Cluster | Tx |
|---|---|---|---|
| 1 | `create_listing` | base | [`2QUikuWG…hnKXmw`](https://explorer.solana.com/tx/2QUikuWGPqFrg32Jb6X1DytxLTnpWHWrq3TxGKS62HyB8rcgP3F4kXu7fRLLga1TuEPk7VbA6dTh5jSRgfhnKXmw?cluster=devnet) |
| 2 | `init_purchase_for_delegation` + `delegate_for_purchase` (batched) | base | [`4nEu9Ykb…HhJ9m9`](https://explorer.solana.com/tx/4nEu9YkbcbW8EZZXQwGTWCV3vNxDGfqgGEpLXzovdgxYfntTfjYgFuifmhGyahjbjyJsZtQ3TKaVbADMEJHhJ9m9?cluster=devnet) |
| 3 | `purchase_listing_private` + `commit_and_undelegate` | **ER** | [`5KUyqPJ2…ksUDAfV`](https://explorer.solana.com/tx/5KUyqPJ2UP6reXQfcbvAuPTviBtVjHg2RCGqxzbLByqP6ATKxpgk2c6V4sLdjTvF72sxAgFwWUydEMb6gksUDAfV?cluster=devnet) |
| 4 | `settle_purchase` (from `settleWatcher`) | base | [`2GQ5zoMu…KFmBa`](https://explorer.solana.com/tx/2GQ5zoMu47RSBn5EorHQiBdLx2H8hc9qRnxVQA3RpddXGETK4Dh5sqVDsDYj6qqq7U5D9HqkFKHuJcLXqn4KFmBa?cluster=devnet) |
| 5 | `deliver_payload` | base | [`aaEmTsWt…iBYR`](https://explorer.solana.com/tx/aaEmTsWtbcTokjcPfVw7puuwDkxQA2bBMdE2LfJotg2gzt4nCLP8nHWATZJcN6hu1KTde4L5aqFad6NKrd7iBYR?cluster=devnet) |
| 6 | `submit_rating` | base | [`2RyjvyQd…ces9J`](https://explorer.solana.com/tx/2RyjvyQd5LpgR7gGHSFesTnTUaJdNxqzvMNhAT9gxwxQCxaJkGh8dhwZLtm8QiVGdSnuxvQJskzeyQfS8P6ces9J?cluster=devnet) |

Listing PDA: [`8ZRbB3Quiu…tmmCuz`](https://explorer.solana.com/address/8ZRbB3QuiuuebQdnGPXRRGpFpQ1wrzNQnx3i31tmmCuz?cluster=devnet) · Purchase PDA: [`3bbqqyzFwwY…wgVi`](https://explorer.solana.com/address/3bbqqyzFwwYgNyhVG314yZmRQBVnFukFVikbWxNEwgVi?cluster=devnet) · Rating PDA: [`3YWcLcuf2t…K3Sr`](https://explorer.solana.com/address/3YWcLcuf2tnZfM8HhvVH9WgrbCK1Gw5n1PHaXUnnK3Sr?cluster=devnet)

Wall-clock from `create_listing` to `submit_rating` for this run: **~52 seconds**.

## How privacy works (the demo's claim)

In the public escape-hatch path (`purchase_listing_public`), the buyer's wallet, the listing they bought, and the price all appear on a single base-layer tx — anyone watching can correlate.

In the private path:
1. Buyer batches `init_purchase_for_delegation` + `delegate_for_purchase` on base. Listing + Purchase ownership transfers to MagicBlock's delegation program. **No buyer-listing linkage observable yet** — the Purchase PDA is empty.
2. Buyer sends `purchase_listing_private` on the ER. The ER mutates delegated state (status=Sold, price recorded, buyer recorded on Purchase). **This activity is invisible to base-layer observers** — only the ER validator sees it.
3. ER bundles `commit_and_undelegate` back to base. Listing/Purchase return to whisper's ownership with the new state.
4. Settle happens later (~5s) on base. The 2.4 SOL transfer to supplier appears at this point — decoupled in time from the listing-status flip.

What an outside observer sees on base layer: a Listing flip from Active to Sold, a separate later transfer of 2.4 SOL. The connection between buyer wallet and which listing is broken by the ER detour. Full privacy would require the Private Payments API (USDC) — out of scope for v1; documented in [decisions.md](docs/decisions.md).

## Stack

- **On-chain**: Anchor 0.32.1 + ephemeral-rollups-sdk 0.11.2 / Rust on Solana devnet
- **Privacy layer**: MagicBlock Ephemeral Rollup (devnet) — base-layer escape hatch via `purchase_listing_public`
- **Signal source**: scripted mock feed (v1) → Helius webhook adapter (stretch)
- **RPC**: Helius devnet (base) + `https://devnet.magicblock.app/` (ER). Two AnchorProvider instances per agent.
- **Agents**: Node + TypeScript (`tsx`), `@coral-xyz/anchor` 0.31, `@solana/web3.js`, `@magicblock-labs/ephemeral-rollups-sdk`
- **Encryption**: X25519 ECDH + HKDF-SHA256 + ChaCha20-Poly1305 (Node `crypto` + `@noble/curves` + `@noble/hashes`)
- **Frontend**: Next.js 16 App Router + Tailwind 4 (scaffolded)

## Layout

```
whisper-exchange/
├── programs/whisper/                      # Anchor program (Rust)
│   └── src/instructions/
│       ├── register_agent.rs
│       ├── create_listing.rs
│       ├── purchase_listing_public.rs     # single-tx public escape hatch
│       ├── init_purchase_for_delegation.rs # tx1a of private flow
│       ├── delegate_for_purchase.rs        # tx1b of private flow
│       ├── purchase_listing_private.rs     # tx2 (ER) — uses #[commit] macro
│       ├── settle_purchase.rs              # base-layer settle (settleWatcher)
│       ├── deliver_payload.rs
│       ├── submit_rating.rs
│       └── delegate_test*.rs               # ER-SDK macro smoke tests
├── agents/
│   ├── supplier.ts                # signal loop + delivery loop
│   ├── buyer.ts                   # scan + delivery + rating + settleWatcher
│   ├── purchase-via-er.ts         # 2-tx ER purchase helper
│   ├── anchor-helpers.ts          # fetchAllSafe + camelCase normalization
│   ├── crypto.ts                  # X25519 sealed-box + sha256 commitment
│   ├── signals.ts                 # mock feed + Helius adapter stub
│   └── tests/commitment.test.ts
├── app/                           # Next.js dashboard (V3 Triptych)
├── design-reference/              # Locked Claude Design export
├── docs/
│   ├── anchor-schema.md           # account spec (LOCKED)
│   ├── flows.md                   # sequence flows (LOCKED)
│   ├── accounts-proposal.md       # Accounts struct proposal (approved)
│   ├── magicblock-integration.md  # two-tx ER flow spec
│   ├── sunday-plan.md             # demo + recording + submission script
│   └── decisions.md               # architectural decisions log
├── scripts/
│   ├── setup-devnet.sh            # generate + fund agent wallets
│   ├── deploy-devnet.sh           # build + sync + deploy
│   ├── run-e2e.sh                 # wrapper for e2e-test.ts
│   ├── e2e-test.ts                # cold-start end-to-end test
│   ├── test-sol-on-er.ts          # naked SOL-on-ER probe (informative)
│   └── test-sol-on-er-bundled.ts  # bundled-CPI SOL-on-ER probe (informative)
└── output/                        # logs, generated artifacts (gitignored)
```

## Quickstart (devnet)

Requires `solana-cli`, `anchor-cli` 0.32.1 (`avm use 0.32.1`), `node` 18+, and a Helius API key from https://dashboard.helius.dev/.

```bash
# 1. install agent deps
(cd agents && npm install)

# 2. configure
echo 'HELIUS_API_KEY=<your-uuid>' > agents/.env
echo 'ER_RPC=https://devnet.magicblock.app/' >> agents/.env
echo 'USE_PRIVATE_PURCHASE=true' >> agents/.env   # set false for public escape hatch

# 3. fund agent wallets (uses CLI airdrop with default-wallet transfer fallback)
bash scripts/setup-devnet.sh

# 4. deploy program
bash scripts/deploy-devnet.sh

# 5. run end-to-end (private path by default per .env above)
bash scripts/run-e2e.sh
```

Expect green pass in ~70s: 1 listing created, 1 purchase via ER, settle, deliver, rating, supplier reputation +1.

## Documentation

- [docs/anchor-schema.md](docs/anchor-schema.md) — locked account schema (PDAs, fields, sizes, error codes)
- [docs/flows.md](docs/flows.md) — locked sequence flows (signal → listing, purchase + delivery, outcome resolution + rating)
- [docs/accounts-proposal.md](docs/accounts-proposal.md) — `#[derive(Accounts)]` blocks for the 5 original instructions
- [docs/magicblock-integration.md](docs/magicblock-integration.md) — two-tx ER flow spec + Q&A on architecture decisions
- [docs/decisions.md](docs/decisions.md) — architectural decisions log (anchor downgrade, SOL-on-ER ruling, TTL bump, camelCase coder fix, etc.)
- [docs/sunday-plan.md](docs/sunday-plan.md) — demo recording + submission checklist
- [CLAUDE.md](CLAUDE.md) — hackathon scope, non-negotiables, hour-30 escape hatch
