# Whisper Exchange

> **Alpha, sealed.** A private information market for AI agents on Solana.

Supplier agents detect on-chain signals (whale swaps, MEV setups, token mints, imbalance, insider flow, bridge activity), seal them as encrypted tips with a sha256 commitment, and list them on-chain with a price. Buyer agents scan the order book, purchase blind, decrypt the payload, verify the commitment, and rate the outcome. Reputation accrues per supplier and drives price discovery.

Built for **MagicBlock Solana Blitz v4** (agentic theme). Submission: https://luma.com/0hyyu37m — deadline Sun 26 Apr 2026, 14:00 UTC.

## Status

- ✅ **Anchor program**: 5 instructions (`register_agent`, `create_listing`, `purchase_listing`, `deliver_payload`, `submit_rating`), 4 PDAs (Agent, Listing, Purchase, Rating). Deployed to devnet at [`6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H`](https://explorer.solana.com/address/6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H?cluster=devnet).
- ✅ **Supplier + buyer agents**: TypeScript, three independent poll loops each, X25519 sealed-box encryption, sha256 payload commitment with canonical-JSON ordering.
- ✅ **End-to-end on devnet base layer**: green from cold state in ~70s — signal → seal → list → buy → deliver → decrypt+verify → rate → reputation update.
- 🚧 **MagicBlock Private Payment integration**: in progress. `purchase_listing` will run on the ephemeral rollup so buyer identity + price are hidden during the purchase phase. Base-layer fallback already works (CLAUDE.md hour-30 escape hatch).
- 🚧 **Frontend (Next.js + Tailwind, V3 Triptych dashboard)**: scaffolded, not yet wired to the program.

## Stack

- **On-chain**: Anchor 1.0 / Rust on Solana devnet
- **Privacy layer**: MagicBlock Private Payment API (ephemeral rollup) — base-layer fallback in place
- **Signal source**: scripted mock feed (v1) → Helius webhook adapter (stretch)
- **RPC**: Helius devnet (public devnet rate-limits `getProgramAccounts` too aggressively for paired agents)
- **Agents**: Node + TypeScript (`tsx`), `@coral-xyz/anchor`, `@solana/web3.js`
- **Encryption**: X25519 ECDH + HKDF-SHA256 + ChaCha20-Poly1305 (Node `crypto` + `@noble/curves` + `@noble/hashes`)
- **Frontend**: Next.js 16 App Router + Tailwind 4

## Layout

```
whisper-exchange/
├── programs/whisper/          # Anchor program (Rust)
├── agents/
│   ├── supplier.ts            # signal loop + delivery loop
│   ├── buyer.ts               # scan loop + delivery watcher + rating dispatcher
│   ├── crypto.ts              # X25519 sealed-box + sha256 commitment
│   ├── signals.ts             # mock feed + Helius adapter stub
│   └── tests/commitment.test.ts
├── app/                       # Next.js dashboard (V3 Triptych)
├── design-reference/          # Locked Claude Design export
├── docs/
│   ├── anchor-schema.md       # account spec (LOCKED)
│   ├── flows.md               # sequence flows (LOCKED)
│   ├── accounts-proposal.md   # Accounts struct proposal (approved)
│   └── decisions.md           # architectural decisions log
├── scripts/
│   ├── setup-devnet.sh        # generate + fund agent wallets
│   ├── deploy-devnet.sh       # build + sync + deploy
│   ├── run-e2e.sh             # wrapper for e2e-test.ts
│   └── e2e-test.ts            # cold-start end-to-end test
└── output/                    # logs, generated artifacts (gitignored)
```

## Quickstart (devnet)

Requires `solana-cli`, `anchor-cli` 1.0+, `node` 18+, and a Helius API key from https://dashboard.helius.dev/.

```bash
# 1. install agent deps
(cd agents && npm install)

# 2. configure
echo 'HELIUS_API_KEY=<your-key>' > agents/.env

# 3. fund agent wallets (uses CLI airdrop with default-wallet transfer fallback)
bash scripts/setup-devnet.sh

# 4. deploy program
bash scripts/deploy-devnet.sh

# 5. run end-to-end
bash scripts/run-e2e.sh
```

Expect green pass in ~70s: 1 listing created, 1 purchase, 1 rating, supplier reputation 1/1.

## Documentation

- [docs/anchor-schema.md](docs/anchor-schema.md) — locked account schema (PDAs, fields, sizes, error codes)
- [docs/flows.md](docs/flows.md) — locked sequence flows (signal → listing, purchase + delivery, outcome resolution + rating)
- [docs/accounts-proposal.md](docs/accounts-proposal.md) — `#[derive(Accounts)]` blocks for all 5 instructions
- [docs/decisions.md](docs/decisions.md) — architectural decisions log
- [CLAUDE.md](CLAUDE.md) — hackathon scope, non-negotiables, hour-30 escape hatch
