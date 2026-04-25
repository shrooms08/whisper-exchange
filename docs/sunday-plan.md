# Sunday submission plan — 26 April 2026

**Hard deadline:** Sun 26 Apr 2026, **14:00 UTC**.
**Submission portal:** https://luma.com/0hyyu37m
**Prizes:** $1,000 USDC pool + Wizardio's Choice $100.

This is the run-of-show. Execute top to bottom. If a step blows up, the [Hour-30 escape hatch](#escape-hatch) flips us to the public path and we ship the safe story.

---

## 0. Pre-flight (Sun, ~07:00–08:00 UTC)

Wake up. Coffee. **Do not edit code yet.** Verify state first.

### 0a. Wallet funding (~10 min)
```bash
# Default wallet should have >= 8 SOL for any redeploy emergency.
solana balance --url devnet --keypair ~/.config/solana/id.json

# Buyer wallet for live demo. Needs >= 4 SOL (one private cycle ~2.5 SOL).
solana balance --url devnet 2Rpgzgmtp6x4Pz7G4fUtMw3JqPS75WuiQTJV4DCRnB5F

# Supplier wallet — used as a piggy bank when buyer runs low. Should have >= 4 SOL.
solana balance --url devnet 4hKCYECqV2DiyQDZHvtTYK6pyugqUip8VeN5eWX2PUYH
```

If buyer < 4 SOL → top up via web faucet (https://faucet.solana.com) OR transfer from supplier:
```bash
solana transfer 2Rpgzgmtp6x4Pz7G4fUtMw3JqPS75WuiQTJV4DCRnB5F 3 \
  --keypair agents/keys/supplier-solana.json \
  --url devnet --allow-unfunded-recipient \
  --fee-payer agents/keys/supplier-solana.json
```

If default < 5 SOL → web faucet only. Don't drain it from supplier (we may need it for an emergency `solana program extend` + redeploy).

### 0b. Smoke test (~3 min)
Cold E2E run on the **public** path first to confirm no overnight rot:
```bash
cd /Users/minos/Projects/whisper-exchange
rm -rf agents/payloads
USE_PRIVATE_PURCHASE=false bash scripts/run-e2e.sh 2>&1 | tail -20
```
Expect: 6/6 PASS in ~60s.

Then the **private** path:
```bash
rm -rf agents/payloads
USE_PRIVATE_PURCHASE=true bash scripts/run-e2e.sh 2>&1 | tail -20
```
Expect: 6/6 PASS in ~70s. Look for `PURCHASE_VIA_ER_TX1_OK` → `TX2_OK` → `SETTLE_RETRY_OK` → `PAYLOAD_DELIVERED` → `RATING_SUBMITTED` in the log.

If either run fails: stop, diagnose, decide between fix vs escape hatch (below).

---

## 1. Frontend wiring (~08:00–11:00 UTC, 3 hours)

The Next.js scaffold under `app/` has the V3 Triptych design files in `design-reference/Whisper Exchange/`. We're not building a new dashboard — we're wiring the locked design to a live data source.

### Scope (minimum viable for demo)
- **Order book pane** — left third: list of `Listing.all()` filtered by `status=Active`, sorted by `created_at` desc. Show category badge, price in SOL, supplier handle (from `Agent.fetch(listing.supplier).handle`), supplier reputation as `num/den`.
- **Arena pane** — center third: animated envelope when a Purchase tx is observed (poll for new `Purchase` accounts every 2s, show "Buyer X bought from Supplier Y" with explorer links).
- **TX log pane** — right third: live tail of all program-related signatures from the buyer + supplier (ws subscription via `connection.onLogs(programId, ...)` if it works on devnet, else 2s poll).

### Data layer
Reuse `agents/anchor-helpers.ts` (`fetchAllSafe`) — it handles the Anchor 0.31 camelCase coder gotcha and the orphan-Purchase deserialize issue. Don't reimplement.

### Out of scope
- Wallet connect (use a hardcoded read-only Connection)
- Mobile responsive
- Anything beyond the three panes

### Deliverable
`app/` runs `npm run dev` cleanly, hits localhost:3000, shows live devnet data updating every 2s. Doesn't need to handle clicks or write txs — read-only is enough for the recording.

---

## 2. Demo recording (~11:00–13:00 UTC, 2 hours)

### 2a. Pre-recording setup (10 min)
```bash
# Three terminal windows arranged side-by-side:
#   1. cd agents && npx tsx supplier.ts
#   2. cd agents && npx tsx buyer.ts
#   3. cd app && npm run dev
# Plus the browser at localhost:3000.
```

Top up buyer to ~5 SOL (per pre-flight check above) so it can do at least 2 cycles cleanly.

Verify `agents/.env` has `USE_PRIVATE_PURCHASE=true` (this is the demo claim; flip false only as fallback).

Clear stale payloads: `rm -rf agents/payloads`.

### 2b. Shot list (3-minute video target)

Per [CLAUDE.md](../CLAUDE.md) demo success criteria (the 7-step flow that's the ship/no-ship gate):

| Time | Shot | Source |
|---|---|---|
| 0:00–0:10 | Title slide: "Whisper Exchange — Alpha, sealed. Private information market for AI agents on Solana." | static |
| 0:10–0:20 | Pan across the V3 Triptych dashboard (3 panes empty) | browser |
| 0:20–0:35 | Start supplier + buyer terminals; show STARTUP logs scrolling | terminals |
| 0:35–0:50 | **Shot 1:** Mock feed emits WHALE signal at T+5s. Supplier terminal shows `SIGNAL_DETECTED id=sig-WHALE-0001`. Dashboard's order book pane gets a new entry (after PAYLOAD_SEALED → LISTING_CREATED). | terminal + browser |
| 0:50–1:10 | **Shot 2:** Buyer matches the rule (`PURCHASE_RULE_MATCH`). Buyer terminal shows `PURCHASE_VIA_ER_TX1_OK` (init+delegate batch on base) → `PURCHASE_VIA_ER_TX2_OK` (purchase_listing_private on ER + commit_and_undelegate). Dashboard arena pane animates the envelope flying across. | both |
| 1:10–1:25 | **Shot 3:** `SETTLE_RETRY_OK` from settleWatcher (~5s after tx2). Dashboard tx log pane shows the settle tx with explorer link. | both |
| 1:25–1:45 | **Shot 4:** Supplier delivers (`PAYLOAD_DELIVERED`). Buyer decrypts (`payload_decrypted` JSON line shows the WHALE tip in plaintext). Commitment verification logged. | terminals |
| 1:45–2:15 | **Shot 5:** 30s outcome window. While waiting, voiceover explains the privacy claim — pull up explorer.solana.com and show the listing PDA: status=Sold, but no buyer wallet visible inline; the buyer's identity only appears on the settle tx (decoupled in time). | browser tab |
| 2:15–2:35 | **Shot 6:** `RESOLUTION_RECEIVED` from mock feed. `RATING_SUBMITTED verdict=True`. Supplier reputation pane ticks up (e.g. 6/6 → 7/7). | terminal + browser |
| 2:35–2:55 | **Shot 7:** Dashboard tx log pane now shows the full lifecycle (6 txs from create → rate). Voiceover: "Full audit trail on devnet, hidden buyer-listing linkage during the ER phase, supplier reputation accrued. End-to-end private alpha marketplace." | browser |
| 2:55–3:00 | End slide: project name + GitHub URL + submission link. | static |

### 2c. Recording rules
- **One shot, one take.** Don't try to splice scenes — the timing of mock feed + ER round-trip is set in code; if you cut, it desyncs.
- **Re-record if any step fails.** Pre-fund the buyer with enough for 5 retakes worth of purchases (~12 SOL).
- **Audio:** record voiceover separately and overlay. Live narration over a live demo is too risky.
- **Software:** OBS or QuickTime screen recording. 1080p, 30fps minimum.

### 2d. Time budget — if recording slips past 13:00 UTC
Cut shots 5 (the 30s explainer) and shorten shot 7. Get a clean run-through above all else.

---

## 3. Submission (~13:00–14:00 UTC, 1 hour buffer)

### 3a. Push final commits
- Confirm `main` is pushed to https://github.com/shrooms08/whisper-exchange
- Tag a release: `git tag -a v1.0-blitz -m "MagicBlock Solana Blitz v4 submission" && git push origin v1.0-blitz`

### 3b. Upload demo video
- YouTube unlisted (not public — judges only) OR Loom. Get the URL.

### 3c. Fill the Luma submission form at https://luma.com/0hyyu37m
Fields likely required (verify on the form):
- Project name: **Whisper Exchange**
- One-liner: **Alpha, sealed. A private information market for AI agents on Solana.**
- Devnet program ID: `6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H`
- GitHub: https://github.com/shrooms08/whisper-exchange
- Demo video URL: (from 3b)
- MagicBlock features used: **Ephemeral Rollups (delegation + commit_and_undelegate)** — list `purchase_listing_private` as the ER instruction
- Team: Oghenerukevwe (shrooms08)

### 3d. Smoke-test the submitted artifacts
- Click the GitHub link from the form, confirm the README loads with the listing 8 tx links.
- Click the video URL from the form, confirm it plays.
- Confirm the explorer link to the program ID resolves.

### 3e. Submit. Screenshot confirmation. Stop.

---

## Escape hatch

If at any point Sunday morning the private path breaks (e.g. ER endpoint regresses, MagicBlock SDK changes, devnet upgrade), flip to the public path:
```bash
sed -i '' 's/USE_PRIVATE_PURCHASE=true/USE_PRIVATE_PURCHASE=false/' agents/.env
```
Re-record demo with shots 2–4 simplified to "buyer purchases publicly via single tx." Privacy claim drops to "agent-to-agent commerce primitives + reputation marketplace." Less impressive, still ship-able, takes ~30 min less to record. Use only if the private path is broken at recording time.

---

## What we're NOT doing Sunday

- Building `recover_stuck_purchase` (deferred from Phase B)
- Stripping the three test instructions (`delegate_test`, `commit_and_undelegate_test`, `delegate_test_with_transfer`) — they're harmless and removing requires another extend + deploy
- Adding the Helius webhook signal adapter (mock feed is sufficient for demo)
- Mobile responsive frontend
- Wallet connect or any user-facing tx capability

---

## If something goes wrong (top fixes by likelihood)

| Symptom | Fix | Time cost |
|---|---|---|
| Buyer wallet underfunded | `solana transfer ... --keypair agents/keys/supplier-solana.json` (see 0a) | 1 min |
| Helius RPC 429s | Restart agents (back-off resets); or switch to QuickNode devnet temporarily | 5 min |
| ER endpoint timeout on `purchase_listing_private` | Flip `USE_PRIVATE_PURCHASE=false` (see escape hatch) | 1 min |
| Anchor build broke after a config change | `git stash && anchor build` | 2 min |
| Listing TTL expired mid-cycle | TTL is already 200 slots (~80–100s); should not happen. If it does, increase to 400 slots in `agents/supplier.ts` and restart | 3 min |
| Payload decrypt fails | Check `agents/keys/buyer-x25519.json` is the same one supplier sealed against. Don't regenerate keys mid-demo | 5 min |
| Frontend 500s | Use the dev console; most likely a transient `getProgramAccounts` fail. The poll loop will recover. If not, refresh. | <1 min |

---

## After submission

Tweet the demo + GitHub link tagging @magicblock. Update [CLAUDE.md](../CLAUDE.md) with `## Submitted: <ts>` line. Sleep.
