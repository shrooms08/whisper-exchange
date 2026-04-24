# CLAUDE.md — Whisper Exchange

## What this is
A private alpha marketplace for AI agents on Solana. Supplier agents detect on-chain signals (via Helius), list them as sealed tips with a price. Buyer agents purchase blind via MagicBlock's Private Payment API, decrypt the payload, rate the outcome. Reputation accrues over time and drives price discovery.

**One-liner:** "Alpha, sealed. A private information market for AI agents."

## Hackathon context
- Event: MagicBlock Solana Blitz v4 (agentic theme)
- Deadline: **Sunday 26 April 2026, 2 PM UTC**. Hard stop.
- Prizes: $1,000 USDC pool + Wizardio's Choice $100
- Submission: luma.com/0hyyu37m
- Partners required/preferred: MagicBlock (core), Helius, Metaplex, SendAI

## Stack
- **On-chain**: Anchor (Rust) on Solana devnet
- **Privacy layer**: MagicBlock Private Payment API (ephemeral rollup)
- **Signal source**: Helius MCP / webhook (with mock fallback)
- **Agents**: TypeScript Node scripts, polling loops, run manually for demo
- **Frontend**: Next.js + Tailwind, consumes design handoff from `/design-reference/`
- **Encryption**: asymmetric, buyer pubkey for payload sealing

## Design handoff
- Locked dashboard design in `/design-reference/` (exported from Claude Design)
- Use the V3 Triptych layout verbatim. Do NOT redesign.
- Color tokens, spacing, and component patterns are in the handoff bundle.

## User preferences (follow these)
- Bullet points over paragraphs
- Verdict-first communication: lead with the call, justify after
- Complete replacement files, not diffs
- Propose a plan before executing on anything architectural
- Brutally honest feedback — no hedging, no false positives
- Call out my mistakes directly

## Non-negotiables
- **Approval gate before Rust.** Before writing any Anchor instruction code, propose the account layout + PDA scheme as a markdown doc and wait for my approval.
- **Devnet only.** No mainnet. Ever.
- **Commit every hour.** I lose work otherwise.
- **Hour 30 escape hatch.** If MagicBlock Private Payment isn't integrated by Saturday night, fall back to public payment and re-pitch as "agent-to-agent commerce primitives." Do not die on that hill and ship nothing.
- **Never auto-run `solana program deploy` or similar irreversible commands** without explicit confirmation.

## Scope discipline
### In scope (v1 demo)
- 4 accounts: Agent, Listing, Purchase, Rating
- Instructions: register_agent, create_listing, purchase_listing (private), deliver_payload, submit_rating
- 1 supplier agent + 1 buyer agent, scripted demo
- Mock signal feed (hardcoded whale wallet for reproducibility)
- Dashboard UI matching /design-reference/

### Out of scope (do NOT build)
- Oracle for tip truth resolution (buyer-rates-only for v1)
- Metaplex agent identity tokens (stretch goal — only if ahead Sunday morning)
- Multi-buyer listings (1 buyer per listing)
- Mobile responsive UI
- User auth / wallet connect beyond hackathon demo needs
- Any production hardening (rate limits, anti-spam, sybil resistance)

## File layout (target)
```
whisper-exchange/
├── CLAUDE.md                    # this file
├── docs/
│   ├── anchor-schema.md         # account spec (locked)
│   ├── flows.md                 # sequence flows (locked)
│   └── decisions.md             # log of architectural decisions you make
├── design-reference/            # exported from Claude Design
├── programs/whisper/            # Anchor program
├── agents/
│   ├── supplier.ts              # supplier loop
│   ├── buyer.ts                 # buyer loop
│   ├── signals.ts               # mock signal feed + Helius adapter
│   └── crypto.ts                # encryption helpers
├── app/                         # Next.js frontend
└── tests/                       # Anchor tests (bankrun preferred)
```

## Demo success criteria
The 3-minute video must show, in order:
1. Supplier agent detects whale signal in live feed
2. Supplier seals + publishes listing with price
3. Buyer agent scans order book, buys privately (MagicBlock)
4. Buyer decrypts payload
5. Outcome resolves, buyer rates tip true
6. Supplier reputation ticks up visibly
7. TX log shows full trail

If any of those 7 steps don't work, we don't submit.

## Budget
- Friday: design (done) + Anchor scaffold + supplier agent
- Saturday: MagicBlock integration + buyer agent + rating + reputation
- Sunday AM: frontend polish + demo recording
- Sunday 12–2 PM UTC: submit

## When you're stuck
- Reference `/docs/anchor-schema.md` and `/docs/flows.md` before inventing new architecture.
- If a spec is ambiguous, ASK me. Do not guess on account layouts or PDA seeds.
- If you hit a MagicBlock-specific snag, log it in `/docs/decisions.md` with a timestamp.
