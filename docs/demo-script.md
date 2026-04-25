# Demo Script — 3 minutes, 4 scenes

Recording on Sunday 2026-04-26. Target: ~3:00 ±15s. Adapt language to be natural; practice once silently to check timing.

Visual layout: terminal split (supplier left, buyer right) on top, dashboard at localhost:3000 on bottom — or alt-tab if recording one screen. Solana Explorer in a third tab (devnet) to click into sigs at the end.

---

## Scene 1 — Hook + Problem (~45s)

> "Whisper Exchange is a private alpha marketplace where AI agents trade on-chain intelligence on Solana.
>
> The problem is structural: alpha is only valuable while it's secret. The instant a buyer's transaction hits the public mempool, anyone watching can front-run the trade — the buyer's identity and the price they paid both leak before the alpha can be acted on. So a public-blockchain order book for tips is broken by default.
>
> Our fix is to run the purchase itself on a MagicBlock ephemeral rollup. Buyer identity and price stay hidden during the trade window — exactly when the alpha matters. State commits back to Solana base layer at session end. Reputation accrues. The next price reflects it."

**Visual:** README open at top, scroll past the architecture diagram. Or static title card: "Whisper Exchange — private alpha for AI agents."

---

## Scene 2 — Supplier seals + lists (~45s)

> "Here's a supplier agent. It detects an on-chain signal — say, a whale wallet about to swap on Raydium — wraps the tip into a JSON payload, encrypts it with a fresh symmetric key, and computes a sha256 commitment of the payload.
>
> Only the commitment goes on-chain. The encrypted ciphertext stays off-chain — for now, on local disk; in production it'd be Arweave or IPFS. The on-chain Listing PDA holds the category, the price, the commitment, a TTL slot, and the supplier's pubkey. That's it.
>
> The buyer can verify the payload matches the commitment after delivery. The supplier can't swap in a bad payload after the sale."

**Visual:** Run `bash scripts/run-e2e.sh` — focus on the supplier terminal lines:
- `PAYLOAD_SEALED listing_id=N commitment=...`
- `LISTING_CREATED listing_id=N price_lamports=2400000000 ttl_slot=...`

Click the create_listing tx in Solana Explorer to show it on devnet.

---

## Scene 3 — Private purchase via the ER (the moneyshot, ~45s)

> "Buyer agent scans the order book, decides to buy, and the purchase happens in two transactions.
>
> First transaction, on Solana base layer: the buyer initializes an empty Purchase PDA and transfers ownership of both the Listing and the Purchase to MagicBlock's delegation program. From now on, those accounts live on the ephemeral rollup.
>
> Second transaction, on the ER: the buyer calls `purchase_listing_private`. This is the moment the buyer-listing linkage is hidden — it happens on the rollup, not on the public mempool. The instruction mutates Listing.status to Sold and writes the buyer pubkey + price into Purchase. Then `commit_and_undelegate` bundles the new state back to base.
>
> Watch the dashboard — the violet envelope flying across the Arena column is the purchase committing back. **That's the trade.**
>
> SOL settlement is decoupled — it's a separate base-layer transfer a few seconds later, so observers can't easily correlate the listing flip with the payment."

**Visual:** Buyer terminal showing `PURCHASE_VIA_ER_TX1_OK` then `PURCHASE_VIA_ER_DONE`. Dashboard envelope animation firing in the middle column. Click both txs in Explorer — point out one is on devnet, one is on the ER endpoint.

---

## Scene 4 — Delivery + rating + reputation (~45s)

> "Once the supplier sees a Sold listing whose Purchase is settled, it re-encrypts the payload to the buyer's x25519 public key and calls `deliver_payload`.
>
> The buyer decrypts, verifies the sha256 against the on-chain commitment, scores the outcome, and submits a rating. That bumps the supplier's reputation counter on-chain.
>
> Total wall-clock from listing creation to rating submission: under 100 seconds, all on devnet, no human intervention. The reputation score is what differentiates suppliers in the next round of price discovery — bad tips get rated False, the supplier's reputation denominator climbs without the numerator, and buyers' rules ignore them.
>
> Roadmap is real outcome-resolution oracles, Metaplex-backed agent identity, and tighter privacy via MagicBlock's Private Payments API to remove the public base-layer settle entirely. Submission for MagicBlock Solana Blitz v4. Code, IDL, and full E2E logs in the repo. Thanks."

**Visual:** Supplier terminal `PAYLOAD_DELIVERED`, buyer terminal `payload_decrypted` then `RATING_SUBMITTED`. Dashboard shows supplier reputation increment. Final shot: README's live demo flow section with all six clickable explorer links.

---

## Concrete sigs for the recording (from rehearsal 2026-04-25 17:45 UTC)

If anything goes sideways during the live take, fall back to clicking these from the README:

- **Listing 16** (this morning): listing_id=16, supplier rep 9/9 → 10/10
- create_listing: `BE3LHHrcRNDnjpip9hCzfBDtMueKb5J9mg9entAGzZufxiWseXxsKCGRTQkf1AszP7vwRgGtnZFFnJeiGNse5UM`
- init+delegate (tx1): `4Pyg9eQDdCkt7ktWyZcHQQdvJvLBwwRasC5txbEJiB7ri4avhJaQFvurKsjaM9v3obnTw9k78ZrxUw2kQExTF85m`
- purchase_listing_private + commit_and_undelegate (tx2 on ER): `3JLYMFmqswEDWCZtimEjXNaEuvjw9CtAKcXLSUS2kCMe7wbbzgGeQwJ2WCavkquCNcL6ypktB2HKCZiQoM2ZqLYx`
- settle_purchase: `3FMvnP7b5JqT3f11DtEqJYTbx7HcZKUGpWaWHfVA4v8Lp1EDj7HoN5uV4b7M5ZJyQ7yBkh6syPwzyndHRz1GHViV`
- deliver_payload: `2RYE1VqdRHkRuzfqvDfwcPF6bRt6A9vSXjqcZTp7i4L937Wdoy21Ad5kHcDVikVBmsmEkNW6kEGihHmQ8nKtSiYb`
- submit_rating: `3Pfe9yjEWZk4iWTuyc56JESVcn5VFK5BC5t3tqJ7LRbeowcNDoR4mFyZm8eg1K9jLcG4DnAM6ygTP3tFQqW1oKjt`
- Listing PDA: `5cDABH3BPQT8B4HXEDuHsgu6EuM5aHmKf4NDZdgc1auy`
- Purchase PDA: `9zcBBquzQeJ9iTdfk9jadG59eSWK7Md5FBrXqnFf56Y7`
- Wall-clock: 95.0s create→rate

For the final recording on Sunday, do a fresh run and update README + this script with the new sigs (listing_id=17 or whatever the counter lands on).

---

## Timing notes

- Don't rush Scene 3. The "moneyshot" is the envelope animation hitting at the right narrative beat — let it land.
- If a take runs long, drop the roadmap line in Scene 4 (saves ~10s).
- If a take runs short, add a beat in Scene 1 about why public mempool order books fail (front-running specifically).
- Aim for 2:50–3:05. Anything under 2:30 is rushed; anything over 3:15 is sloppy.
