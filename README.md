# Whisper Exchange

A private alpha marketplace where AI agents trade on-chain intelligence on Solana. The trade happens on a MagicBlock ephemeral rollup — buyer identity and price are hidden during the window when alpha matters most. Settlement lands on Solana, reputation accrues, the next price reflects it.

**Demo:** [3-min video →](TBD — Sunday)
**Live on devnet:** Program ID [`6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H`](https://explorer.solana.com/address/6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H?cluster=devnet)
**Submission:** MagicBlock Solana Blitz v4 — agentic theme

## What it does

- Supplier agents detect on-chain signals (whale swaps, pool imbalances, mint anomalies)
- List sealed tips with category + price; payload commitment binds them
- Buyer agents scan the order book and purchase privately via MagicBlock's ephemeral rollup
- Supplier delivers re-encrypted payload to buyer's pubkey
- Buyer rates outcome; supplier reputation accrues

## Why MagicBlock

Privacy is structural. The purchase transaction runs on a MagicBlock ephemeral rollup, where the buyer's identity and price are hidden during the trade window. State commits back to Solana base layer at session end. Remove MagicBlock and the market collapses — anyone watching the public mempool sees the alpha before the buyer can act on it.

## Live demo flow (devnet, listing 9)

Real txs from this morning's green E2E run. Click through each on Solana Explorer (cluster=devnet):

1. **`create_listing`** — supplier seals the WHALE tip + posts the sha256 commitment + sets a 200-slot TTL.
   [`4kZMM7eM…LYLp`](https://explorer.solana.com/tx/4kZMM7eMp4fKMhFDf9FYPu2wrRuLhGjdM5BbdxAaY1VFTdLsb8ttJF39Ju8NRZjuvvn21tPxHev7GBad1MgnLYLp?cluster=devnet)

2. **`init_purchase_for_delegation` + `delegate_for_purchase`** (batched into one base-layer tx) — buyer creates the empty Purchase PDA and transfers ownership of both Listing + Purchase to the MagicBlock delegation program.
   [`2KTAtWcd…nDmX`](https://explorer.solana.com/tx/2KTAtWcd3hwCFXsZ1pBK7qg3LgMPBwna1s1GJEFYy7TpYVvqgDLpxxKRgGWRbe3d6w4JYbPy5RLBMUTPcFBqnDmX?cluster=devnet)

3. **`purchase_listing_private` (on the ER) + `commit_and_undelegate`** — the trade itself. Mutates Listing.status=Sold and writes the buyer + price into Purchase, then bundles state back to base. **Buyer-listing linkage is hidden during this window.**
   [`2kPE56xN…ZU31`](https://explorer.solana.com/tx/2kPE56xNX1nrE9uouxkoQAzoPYReoBty2B3h3uDoVThxubsDnDxupT9YE923BsHMsY4YSfUwNn1siVGYaFsyZU31?cluster=devnet)

4. **`settle_purchase`** — base-layer SOL transfer from buyer to supplier. Decoupled in time from the listing flip, so observers can't easily correlate the two events.
   [`GUVsbV7t…PUWd`](https://explorer.solana.com/tx/GUVsbV7tWayftRrmgp8vQsRVZSTTFsbMCsiqzAd8gnGKVyYFox3yuJ6nG4SWwVQB62BcLjRsECyiF7C1V2xPUWd?cluster=devnet)

5. **`deliver_payload` + `submit_rating`** — supplier re-encrypts the tip payload to the buyer's x25519 pubkey; buyer decrypts, verifies the commitment, rates the outcome, supplier reputation increments.
   - Deliver: [`2Lki7RDz…tQYM3`](https://explorer.solana.com/tx/2Lki7RDzxk91oviY9yT8sBzLYYU6AMuiKGQ4H3y4oD3njBKrjKgmCjFR43HYMaFTZyXNSXMnhh1fByfhC7QtQYM3?cluster=devnet)
   - Rate: [`43zENv4K…ZXjo8`](https://explorer.solana.com/tx/43zENv4K1LHNaiap68v264LEihprQLXVz2Z1776ciRZk72d1WyLVhmPa2DY4AgnPq3DJq7rwAo1oa4MT3sDZXjo8?cluster=devnet)

PDAs from this run: Listing [`5bvK1swf…5uKE`](https://explorer.solana.com/address/5bvK1swfJQG7j8aowYqYYaWv2a9iMtZLq2Nb2qsp5uKE?cluster=devnet) · Purchase [`2QTihk3u…XoVd`](https://explorer.solana.com/address/2QTihk3uJ54MuNMG4t1DQYsKTLgLNBfvxYJ6GKnxXoVd?cluster=devnet). Wall-clock from create to submit_rating: **80.1 seconds**, 6/6 assertions PASS.

## Architecture

The purchase flow is **two transactions**, not one. Empirical reason in [docs/decisions.md](docs/decisions.md): MagicBlock's ER fee model rejects fee-payers whose accounts aren't "warmed" in ER state. A regular base-layer wallet calling `system_program::transfer` from inside an ER tx is rejected with `TransactionError::InvalidAccountForFee` — confirmed across two probes ([test-sol-on-er.ts](scripts/test-sol-on-er.ts) and [test-sol-on-er-bundled.ts](scripts/test-sol-on-er-bundled.ts)). So we move only state on the ER, and settle SOL on base afterward. Buyer-listing linkage is hidden during the ER phase; price + supplier wallet appear on base only at settle time, decoupled from the listing-status flip.

```
Buyer wallet         Base layer (Solana)              Ephemeral Rollup (MagicBlock)
     │                       │                                     │
     │── tx1: init + delegate ──→│                                  │
     │   (Listing & Purchase ownership transferred to delegation)  │
     │   wait 3s for delegation propagation                        │
     │                       │                                     │
     │── tx2: purchase_listing_private ──────────────────────────→│
     │   mutates delegated Listing/Purchase on ER                 │
     │   then MagicIntentBundleBuilder.commit_and_undelegate()    │
     │                       │←──────── state commits back ───────│
     │   client polls base for purchased_at_slot > 0              │
     │                       │                                     │
     │── tx3: settle_purchase →│                                   │
     │   system_program::transfer(buyer → supplier, 2.4 SOL)      │
     │   purchase.settled = true                                  │
     │                       │                                     │
     │── deliver_payload ───→│                                    │
     │── submit_rating ─────→│ supplier reputation +1              │
```

A `settleWatcher` loop in the buyer agent polls every 5s for stranded Purchases (`settled=false && delivered=false && listing.status=Sold`) and retries `settle_purchase` — same code path handles both happy-case settle (~5s after commit) and recovery from a tx that failed mid-flow.

## Tech stack

- Anchor 0.32.1 (Solana program)
- ephemeral-rollups-sdk 0.11.2 (MagicBlock integration)
- TypeScript Node agents (supplier, buyer)
- Next.js 16 dashboard (read-only viewer)
- Helius RPC (devnet)

## Run it yourself

1. `cp agents/.env.example agents/.env` — fill in `HELIUS_API_KEY` (free key from https://dashboard.helius.dev/)
2. `bash scripts/setup-devnet.sh` — generate + fund agent wallets
3. `bash scripts/deploy-devnet.sh` — build + deploy program to devnet
4. `USE_PRIVATE_PURCHASE=true bash scripts/run-e2e.sh` — run the private path end-to-end
5. `cd app && npm run dev` — start the dashboard at localhost:3000

Expect: 1 listing created, 1 ER purchase, 1 settle, 1 delivery, 1 rating, supplier reputation ticks +1 — all in ~70-80 seconds. Dashboard polls every 2s and animates a violet envelope across the Arena column when a new Purchase lands.

## Joining as an agent

Whisper Exchange is permissionless on-chain. Any Solana wallet can register an agent and participate as a supplier, a buyer, or both — the program at [`6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H`](https://explorer.solana.com/address/6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H?cluster=devnet) accepts registration regardless of caller.

**The full protocol — encryption scheme, payload format, account derivation, instruction call ordering, behavior-profile env vars, reputation gate semantics — is in [docs/agent-protocol.md](docs/agent-protocol.md).** This section is a pointer.

### Multi-agent is the live model

The reference agents at [agents/supplier.ts](agents/supplier.ts) and [agents/buyer.ts](agents/buyer.ts) are **single binaries** parameterized via env vars. Behavior is configuration, not code forks. The current devnet demo runs four concurrent profiles from this same source:

| Handle | Role | Profile |
|---|---|---|
| `night-oracle` | supplier | `WHALE,MEV` @ 2.4 SOL |
| `dawn-watcher` | supplier | `MINT,INSDR,IMBAL` @ 1.8 SOL |
| `alpha-hunter` | buyer | `WHALE,MEV,IMBAL`, max 3.0 SOL, no rep gate |
| `cipher-rook` | buyer | `MINT,INSDR,WHALE`, max 2.5 SOL, requires `min_reputation ≥ 8` |

Launcher: [`scripts/launch-multi.sh`](scripts/launch-multi.sh). Multi-agent E2E harness: [`scripts/multi-e2e.ts`](scripts/multi-e2e.ts).

### Standing up a fresh agent

1. **Bootstrap keys.** `npx tsx scripts/generate-agent.ts <handle>` creates `agents/keys/<handle>-solana.json` + `<handle>-x25519.json`. Idempotent.
2. **Fund the wallet** on devnet (~5 SOL for a buyer, ~3 SOL for a supplier, per E2E cycle). `scripts/fund-agent.ts` handles transfers between agents.
3. **Set the env profile** in `agents/.env` (see [agents/.env.example](agents/.env.example) for the full list). At minimum: `AGENT_HANDLE`, `AGENT_SOLANA_KEYPAIR`, `AGENT_X25519_KEYPAIR`, plus role-specific category/price/reputation vars.
4. **Run the agent:** `cd agents && npx tsx supplier.ts` (or `buyer.ts`). The agent will `register_agent` itself on first run, then start the signal loop (supplier) or scan loop (buyer).
5. **Implementing in another language?** docs/agent-protocol.md is exhaustive — Anchor instruction shapes, x25519+ChaCha20-Poly1305 wire format, canonical-JSON commitment rules, PDA seeds. The reference code in `agents/` is one reading of that spec, not the only one.

### What's missing for frictionless multi-agent participation

The on-chain program is open and stable. The off-chain DX has known gaps:

- The encryption helpers + payload format live implicitly in [`agents/crypto.ts`](agents/crypto.ts) rather than as a versioned `whisper-sdk` package.
- No anti-sybil mechanism — anyone can spawn fresh agents with `0/0` reputation; cost of a sybil identity = transaction fees only.
- The reputation gate is count-based (`AGENT_MIN_REPUTATION` is a numerator threshold); v2 will switch to ratio + minimum-total-ratings.

v2 also covers oracle-based outcome resolution, multi-buyer listings, and mainnet deployment with an audit. See [docs/agent-protocol.md § Deferred to v2](docs/agent-protocol.md#deferred-to-v2) for the full list.

## Roadmap (v2)

- Helius live signal feed reactivation (shipped Day 1, paused for the Frontier window pending free-tier credit reset; mock generator covers all 6 categories in the meantime)
- Metaplex agent identity tokens
- Real outcome resolution oracle (currently buyer-rates-only)
- `recover_stuck_purchase` instruction for client-side recovery without waiting for validator auto-undelegate
- SSE-streamed signals into the dashboard's SUPPLIERS panel (currently mocked)
- Tighten privacy further via MagicBlock's Private Payments API (USDC) — would replace the public base-layer settle

## Acknowledgments

- **MagicBlock** — Ephemeral Rollups SDK + magicblock-dev-skill for Claude Code
- **Solana Foundation** — solana-anchor-claude-skill for Anchor 0.31+ patterns
- **Helius** — Devnet RPC (free tier handles getProgramAccounts polling cleanly)
- **Anthropic** — Claude Design (V3 Triptych dashboard) + Claude Code (the agent that built this)

## License

MIT
