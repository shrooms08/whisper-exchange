# Flows — Whisper Exchange

**Status:** LOCKED. Three sequences below. Reference these before coding agent logic.

---

## Flow 1 — Signal → Listing

Actors: Supplier Agent (Node script), Signal Source (mock or Helius), Anchor program

```
1. Supplier agent polls signal source every N seconds.
   - v1 default: mock feed emits scripted WHALE/IMBAL/MINT events.
   - Stretch: Helius MCP subscription to swap events on target pools.

2. On new signal, supplier generates a tip payload:
   {
     "category": "WHALE",
     "signal_ref": "slot 287491203, wallet 7xKX...Qh9",
     "claim": "WHALE_SWAP predicted within 6 blocks",
     "evidence": [...],
     "recommended_action": "short JUP/SOL, size ≤ 120 SOL"
   }

3. Supplier computes:
   - commitment = sha256(canonical_json(payload))
   - ciphertext_self = encrypt(payload, supplier.pubkey_x25519)   # placeholder seal
   - cid = upload(ciphertext_self)   # IPFS/Arweave (or local stub for demo)

4. Supplier sends `create_listing` tx:
   - category
   - price_lamports (rule-based: WHALE=2.4 SOL, IMBAL=0.8 SOL, etc. — hardcode table for v1)
   - payload_commitment = commitment
   - supplier_payload_cid = cid
   - ttl_slot = current_slot + 6

5. On confirmation, supplier logs to TX log.
```

**Demo consideration:** use a scripted signal queue so the demo is reproducible. Mock feed emits a WHALE event 5s after script start.

---

## Flow 2 — Private Purchase + Delivery

Actors: Buyer Agent, MagicBlock ER, Supplier Agent, Anchor program

```
1. Buyer agent polls Listing accounts every N seconds (getProgramAccounts filtered by status=Active).

2. Buyer applies purchase rule:
   - IF price_lamports < max_budget
     AND supplier.reputation_score > min_rep
     AND category in preferred_categories
   - THEN purchase.

3. Buyer + Listing accounts delegated to MagicBlock ER.

4. Buyer sends `purchase_listing` tx on ER:
   - Transfers price_lamports to supplier authority
   - Writes Purchase account with buyer pubkey + price
   - Sets listing.status = Sold

5. ER state commits back to base layer.
   - This is the privacy win: buyer identity + price are hidden during the ER phase.

6. Supplier agent (polling Purchase accounts where supplier==self && delivered==false):
   - Fetches Purchase account
   - Reads buyer's Agent account to get buyer.pubkey_x25519
   - Decrypts own ciphertext_self → plaintext payload
   - Re-encrypts to buyer: ciphertext_for_buyer = encrypt(payload, buyer.pubkey_x25519)
   - Uploads: buyer_cid = upload(ciphertext_for_buyer)
   - Sends `deliver_payload` tx: sets Purchase.buyer_payload_cid + delivered=true

7. Buyer agent (polling own purchases where delivered==true):
   - Fetches Purchase.buyer_payload_cid
   - Downloads ciphertext, decrypts with own x25519 private key
   - Verifies sha256(plaintext) == Listing.payload_commitment
   - Logs decrypted payload to UI
```

**Critical:** step 7's commitment check is non-negotiable. Without it, supplier could deliver garbage. If commitment mismatches, buyer should refuse to rate and flag the supplier (v2).

**Escape hatch:** if MagicBlock ER integration slips, purchase runs on base layer. Privacy is lost but flow still works. Document in `/docs/decisions.md`.

---

## Flow 3 — Outcome Resolution + Rating

Actors: Buyer Agent, Supplier Agent, Anchor program

```
1. After purchase, buyer agent starts a watch timer.
   - For demo: hardcoded 30-second window.
   - v2: actual outcome verification via Helius (did whale swap happen?)

2. At window close, buyer agent evaluates outcome.
   - v1 demo: outcome is scripted. Mock signal generator publishes a resolution event.
   - Example: "WHALE_SWAP_RESOLVED — true" triggers the rating.

3. Buyer sends `submit_rating` tx:
   - purchase = the Purchase account
   - verdict = True | False | Partial
   - Instruction CPI/mutates supplier's Agent account:
     - reputation_num += (verdict == True ? 1 : 0)
     - reputation_den += 1

4. Rating account created. Listing.status = Rated.

5. UI updates:
   - Supplier's reputation bar ticks up (or stays flat if False)
   - TX log shows `REP++ supplier=night-oracle +0.12`
   - Active Listings pane shows new listing price reflecting updated rep
```

**Demo consideration:** script the entire 30s window so the video shows: detect → list → buy → deliver → rate → rep update, all in ~45 seconds. Pre-fund devnet wallets beforehand.

---

## Overall demo script (for Sunday recording)

```
T+0s    Start supplier.ts + buyer.ts in two terminals. Open dashboard.
T+5s    Mock feed emits WHALE signal. Supplier UI shows "Whale swap detected · Raydium".
T+8s    Supplier seals + lists. Dashboard shows new listing L-0419 in order book.
T+12s   Buyer scans order book, triggers Purchase Privately. Envelope animates across Arena.
T+16s   Purchase confirms. Listing shows Sold. Buyer's "In-flight" shows pending delivery.
T+20s   Supplier delivers re-encrypted payload. Buyer decrypts, payload appears in UI.
T+35s   Mock feed emits WHALE_SWAP_RESOLVED true. Buyer rates TIP TRUE.
T+38s   Supplier reputation bar ticks +0.12. TX log updates.
T+45s   End scene. Freeze frame on TX log showing full trail.
```

If a single step takes longer than 3x budget, cut it from the demo and re-shoot.
