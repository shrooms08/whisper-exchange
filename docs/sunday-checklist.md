# Sunday Checklist — 2026-04-26

Submission deadline: **Sunday 14:00 UTC** (MagicBlock Solana Blitz v4). Submit at https://luma.com/0hyyu37m.

Plan to be done by **13:00 UTC** to leave a 1h buffer. Total wall-time below ≈ 2h, so start ≥ 11:00 UTC.

---

## 1. Pre-flight (~10 min)

- [ ] Open terminal at `/Users/minos/Projects/whisper-exchange`.
- [ ] Confirm devnet program is deployed and reachable:
  ```
  solana program show 6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H --url devnet
  ```
- [ ] Confirm wallet balances meet thresholds:
  ```
  solana balance --url devnet                                      # default ≥ 4 SOL
  solana balance $(solana-keygen pubkey agents/keys/supplier-solana.json) --url devnet  # ≥ 5 SOL
  solana balance $(solana-keygen pubkey agents/keys/buyer-solana.json) --url devnet     # ≥ 10 SOL
  ```
- [ ] If buyer is short, transfer from supplier:
  ```
  solana transfer --url devnet --keypair agents/keys/supplier-solana.json --allow-unfunded-recipient $(solana-keygen pubkey agents/keys/buyer-solana.json) <amount>
  ```
- [ ] Confirm `agents/.env` has `HELIUS_API_KEY` set and `USE_PRIVATE_PURCHASE=true`.
- [ ] Confirm dashboard builds + runs:
  ```
  cd app && npm run dev
  ```
  Open http://localhost:3000, see the three panels populate. Kill with Ctrl-C.

## 2. Dry run (~5 min)

- [ ] Cold E2E run, private path:
  ```
  USE_PRIVATE_PURCHASE=true bash scripts/run-e2e.sh
  ```
- [ ] Watch for: `LISTING_CREATED listing_id=N`, `PURCHASE_VIA_ER_DONE`, `SETTLE_RETRY_OK`, `PAYLOAD_DELIVERED`, `RATING_SUBMITTED`. Wall-clock should be 70–100s.
- [ ] If anything fails: do not panic. Most failures are "listing already sold" 0x1770 from stale state, harmless. The new listing_id=N flow is what matters; check that those 5 lines fired.
- [ ] Capture the 6 sigs for the new listing_id (create_listing, tx1, tx2, settle, deliver, rate) — paste into a scratch file.

## 3. Recording (~60–90 min, 3–5 takes)

- [ ] Quit Slack, Discord, browser notifications. Do Not Disturb on macOS.
- [ ] Open OBS (or QuickTime → New Screen Recording). Set resolution to 1920×1080 or 1440p. Test mic level.
- [ ] Layout: terminal split (supplier left / buyer right) on top half, dashboard at localhost:3000 on bottom half. Solana Explorer (devnet) ready in a third app for click-throughs.
- [ ] Open `docs/demo-script.md` on a second monitor / phone. Read it twice silently before the first take.
- [ ] Take 1: full run, no stops. Don't restart on small flubs — just keep the energy up.
- [ ] Takes 2–4: tighten the slow parts. Focus Scene 3 — the envelope animation timing is the moneyshot.
- [ ] Pick the best take. Trim head + tail in QuickTime / OBS. Target 2:50–3:05.

## 4. Upload + share (~15 min)

- [ ] Upload to YouTube, **Unlisted**:
  - Title: `Whisper Exchange — Private Alpha Marketplace on Solana (MagicBlock Blitz v4)`
  - Description: 2-line summary + link to GitHub repo + Program ID + devnet sigs.
  - Thumbnail: optional — frame from Scene 3 with the envelope mid-flight is good.
- [ ] Copy the YouTube URL. Update [README.md](../README.md) line 5 (`**Demo:** [3-min video →](TBD — Sunday)`) with the real link.
- [ ] If the recording produced new sigs, update the README "Live demo flow" section with them. Also update [docs/demo-script.md](demo-script.md) "Concrete sigs" block.
- [ ] Commit + push:
  ```
  git add README.md docs/demo-script.md
  git commit -m "docs: link demo video + update sigs from Sunday recording"
  git push origin main
  ```

## 5. Submit (~15 min)

- [ ] Open https://luma.com/0hyyu37m.
- [ ] Fill the form:
  - **Project name:** Whisper Exchange
  - **Track:** Agentic
  - **Repo:** https://github.com/<user>/whisper-exchange (confirm public visibility before submitting)
  - **Demo video:** YouTube unlisted URL
  - **Devnet program ID:** `6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H`
  - **Description:** 1–2 sentences from README's opening paragraph.
  - **What did you build with MagicBlock:** Reference docs/decisions.md and docs/magicblock-integration.md — the two-tx flow + the empirical SOL-on-ER probes are the core technical contribution.
- [ ] Confirm the repo is public on GitHub. If still private, flip it.
- [ ] Submit. Screenshot the confirmation page.

## 6. Social (~10 min, optional)

- [ ] Tweet thread:
  - T1: 1-line pitch + video link
  - T2: the two-tx ER pattern + why it matters (privacy structural, not bolted on)
  - T3: shoutouts — @magicblock, @solana, @helius, @anthropicai (Claude Code)
- [ ] Post in MagicBlock Discord submissions channel.

---

## Troubleshooting

- **Dashboard shows nothing:** check `app/.env.local` has `HELIUS_API_KEY`. Server-side log `[chain] HELIUS_API_KEY missing` is the smoking gun.
- **E2E hangs at "delegation propagation":** ER endpoint flaky. Wait 60s, retry. If persistent, switch ER_RPC and confirm with curl.
- **Buyer underfunded mid-run (0x1 lamports):** transfer 1 SOL from supplier, re-run.
- **All purchases fail with 0x1770 ListingNotActive:** all current listings are already sold. Wait for supplier loop to mint a new one (~15s) — or just run e2e again, supplier creates a fresh listing each run.
- **Recording too long / too short:** see timing notes at bottom of demo-script.md.

## Hard stops

- Do not redeploy the program on Sunday. The deployed binary is locked.
- Do not change the schema on Sunday. Old account data on devnet will break.
- Do not push uncommitted CSS/UI changes the morning of recording. Lock the dashboard at 11:00 UTC.
