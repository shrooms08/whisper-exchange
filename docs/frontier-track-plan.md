# Whisper Exchange — MagicBlock Privacy Track (Frontier)

**Track:** Privacy Track — Colosseum Hackathon (Powered by MagicBlock, ST MY & SNS)
**Host:** Superteam Earn
**Prize pool:** 5,000 USDC (1st: 2,500 / 2nd: 1,500 / 3rd: 1,000)
**Deadline:** May 12, 2026 (~10 days)
**Submission format:** working demo + public repo + 3-min video (same as Blitz v4)

## Context

Whisper Exchange won Wizardio's Choice at MagicBlock Solana Blitz v4 (April 26, 2026). The same sponsor is now running this Privacy Track on Frontier with explicit calls for "Agentic commerce, Agent-to-agent" — Whisper Exchange's exact category. Goal: extend the existing codebase to a stronger submission for this track.

## Judging criteria mapping

| Criterion | Weight | Status | Action |
|-----------|--------|--------|--------|
| Technology — effective use of ER/PER/Private Payments API | 40% | Strong (real ER integration, two-tx empirical) | Document architecture more visibly |
| Technology — working demo | 40% (shared) | Strong (live on devnet) | Multi-agent demo |
| Technology — architecture quality | 40% (shared) | Strong (escape hatch, settleWatcher) | Highlight in README |
| Impact — solves real problem | 30% | Medium (front-running prevention is real but agent commerce is anticipated) | Sharpen the problem framing |
| Impact — clear market need | 30% (shared) | Weakest dimension | Add market context to README |
| Impact — adoption/monetization potential | 30% (shared) | Has v2 path | Document path explicitly |
| Creativity — novel primitives | 30% | Strong (sealed listings + ER + reputation composition is novel) | Keep |
| Creativity — smooth UX | 30% (shared) | Strong (dashboard works) | Polish animations |
| Creativity — clarity of system | 30% (shared) | Strong (docs + demo) | Refine demo script |

## Day-by-day plan

Estimated workload: 4-6h/day at moderate intensity. Buffer days included.

### Day 1 — DONE (2026-05-01)

**Status:** Real Helius signal pipeline live and verified end-to-end.

**Deliverables shipped:**
- Webhook receiver (Fastify, port 4000) — [agents/webhook-receiver.ts](../agents/webhook-receiver.ts)
- Native-token threshold filter — [agents/lib/signal-filter.ts](../agents/lib/signal-filter.ts)
- Helius event → internal Signal normalizer — [agents/lib/signal-normalize.ts](../agents/lib/signal-normalize.ts)
- Supplier real-signal poll loop, gated by `USE_REAL_SIGNALS=true` — [agents/supplier.ts](../agents/supplier.ts)
- Manual webhook setup recorded for reproducibility — [docs/helius-webhook-setup.md](helius-webhook-setup.md)

**Live metrics from soak run:**
- 95.6% filter rejection rate on raw mainnet firehose (~1000 events/min in)
- 1.1 whales/min forwarded during US active hours (peak; off-peak is ~0.3/min)
- 49 real signals forwarded in first 43 minutes
- 18 real-source listings created on devnet (IDs 31-48 in burst, plus 49-50 with HALT flag)
- Encryption integrity verified: listing 50 round-tripped real Jupiter slot 416,936,149 evidence through commit + seal + on-chain + decrypt + sha256-verify

**Out of scope for Day 1, deferred:**
- Single-listing E2E harness fights real-signal cadence — defer to **Day 2** rewrite for multi-agent assertions instead of patching the current harness
- README update with the "mainnet signals → devnet marketplace" framing — defer to **Day 8** submission polish pass
- Cross-run residue cleanup (stuck Purchases, undelivered Sold listings) — out of scope; covered by `recover_stuck_purchase` in v2 roadmap

### Day 1 — Helius signal integration (real, not mock)

**Goal:** Replace `agents/signals.ts` mock feed with real Helius webhook subscription.

Tasks:
- Set up Helius webhook for whale-swap detection (large SPL token movements)
- Set up Helius webhook for new mint authority events (cNFT or token creation)
- Receiving service ingests webhook, normalizes to internal Signal type
- Supplier agent consumes from real signal stream, evaluates, lists if above threshold
- Keep mock as fallback for testing (env var: USE_REAL_SIGNALS=true)
- Update README to claim real Helius integration honestly

**Why this matters:** The "agentic" claim is much stronger when the supplier is making decisions on real chain data. It's also what every privacy-track judge will check first.

### Day 2 — Multi-agent demo (2 suppliers, 2 buyers)

**Goal:** Demonstrate the marketplace with multiple parties so it's visibly a market, not a 1:1 channel.

Tasks:
- Generate 4 keypairs: 2 supplier-style (different categories or specialties), 2 buyer-style (different rule profiles)
- Add `agents/launch-multi.ts` script that spawns all 4 agents concurrently
- Each supplier listens to a different signal category (e.g., `night-oracle` → WHALE/MEV, `dawn-watcher` → MINT/INSDR)
- Each buyer has different purchase rules (price, category, reputation thresholds)
- Verify simultaneous activity creates inter-agent dynamics (one buyer outbidding/missing what another wins)

### Day 3 — Agent protocol documentation

**Goal:** Codify the encryption/protocol spec so third parties could write their own agents.

Tasks:
- Write `docs/agent-protocol.md` per the structure already drafted in our previous session
- Add "Joining as an Agent" section to README
- Verify one of the multi-agents from Day 2 was implementable purely from this spec (sanity check)

### Day 4 — Continuous-activity loop (live site stays alive)

**Goal:** When judges visit the live URL cold, they see fresh activity.

Tasks:
- `scripts/loop-activity.sh` — every 30 minutes, run E2E with auto-refund cycle
- Run on Railway free tier or a small Hetzner box
- Logs to file, monitorable
- Dashboard at vercel URL shows fresh activity 24/7
- Document the loop in README so judges know it's intentional
- **Tunnel migration decision (carried over from Day 1):** ngrok free tier has a 2-hour session cap (introduced early 2026), which breaks 24/7 webhook delivery. Either (a) move webhook receiver onto the Day 4 host's public IP and drop ngrok, or (b) switch dev tunnel to Cloudflare Tunnel (free, no time limit, requires a domain we control). Pick on Day 4 once the host choice is locked.

### Day 5 — Dashboard polish (in-flight + reputation animation)

**Goal:** The dashboard becomes more visibly alive when something happens.

Tasks:
- Animate reputation tick when a rating fires (number rolls up)
- Animate throughput counter (rolling number)
- In-flight indicator transitions in/out smoothly
- "Just delivered" highlight on decrypted panel for 5 seconds after delivery
- Don't break the existing envelope animation; add to it

### Day 6 — Demo script v2 + recording prep

**Goal:** New 3-min demo that shows multi-agent activity + privacy story sharply.

Tasks:
- Update `docs/demo-script.md` for the multi-agent flow
- Pre-recording dress-rehearsal with multi-agent script
- Identify cinematic moments: simultaneous purchases, reputation race, etc.
- Decide: silent + captions (like Blitz) or voiceover (more ambitious)

### Day 7 — Demo recording

**Goal:** New 3-min demo recorded and uploaded.

Tasks:
- Record 3-5 takes
- Edit in Screen Studio (or CapCut + voiceover after) — note: Screen Studio export is paywalled, use QuickTime + CapCut if budget-constrained
- Upload unlisted to YouTube (or Google Drive as fallback)

### Day 8 — README + submission notes pass

**Goal:** Submission-ready repo polish.

Tasks:
- Update README with: real Helius integration claim, multi-agent demo, agent protocol section, continuous loop note
- Add `docs/frontier-submission-notes.md` — short doc explaining what changed since Blitz
- Refresh tx hashes in README to point at recent E2E runs
- One honest privacy-claim audit pass: nothing claims PER or Private Payments API
- Verify all links work, all repos are public

### Day 9 — Buffer / unexpected debug

**Goal:** Handle whatever broke that we didn't plan for.

Reserved for:
- Helius webhook reliability issues
- Continuous loop wallet drain or RPC flakes
- Vercel deployment regressions
- Recording redos

### Day 10 — Submit

Tasks:
- Final dress-rehearsal E2E
- Submit via Superteam Earn track URL
- Tweet update tagging @magicblock with the new demo
- Optional: email/DM Wizardio thanking them and pointing at the upgraded version

## Things explicitly OUT OF SCOPE

- PER or Private Payments API integration (mainnet/USDC-only, not feasible in 10 days)
- Mainnet deployment (audit + infra problem)
- Token-2022 confidential transfers (different architecture stack)
- Anti-sybil mechanisms (requires identity infra)
- whisper-sdk package extraction (nice-to-have, doc-only is sufficient)

## Workflow conventions

- User receives prompts from reviewer; agent (this Claude Code instance) executes per prompts
- Approval gates remain — agent stops and posts before architectural decisions
- Devnet only
- Localhost port: **3001** (port 3000 is occupied by another protocol the user is building)
- All commits to `main` branch with conventional-commit messages
- Agent updates `docs/frontier-track-plan.md` with day-by-day status as work progresses
