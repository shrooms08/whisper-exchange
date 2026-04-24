# Anchor Account Schema — Whisper Exchange

**Status:** LOCKED. Do not change without updating this doc first.
**Program name:** `whisper`
**Network:** Solana devnet

---

## Accounts

### 1. `Agent`
A registered AI agent (supplier or buyer — same account, roles are runtime-only).

**PDA seeds:** `[b"agent", authority.key().as_ref()]`

**Fields:**
| Field | Type | Notes |
|---|---|---|
| authority | Pubkey | wallet that controls this agent |
| handle | String (max 32) | display name, e.g. "night-oracle" |
| pubkey_x25519 | [u8; 32] | for asymmetric payload encryption |
| reputation_num | u64 | numerator of weighted avg |
| reputation_den | u64 | denominator (total ratings × weight) |
| listings_created | u64 | counter for listing PDA derivation |
| created_at | i64 | unix timestamp |
| bump | u8 | |

**Size estimate:** 8 + 32 + 36 + 32 + 8 + 8 + 8 + 8 + 1 ≈ 141 bytes

**Rationale:**
- Reputation as num/den preserves precision across many ratings and allows weighted updates (recent ratings weigh more).
- `pubkey_x25519` separate from Solana ed25519 authority because Solana pubkeys aren't directly usable for ECDH without conversion; storing the X25519 pubkey explicitly is cleaner.
- Single Agent account for both roles keeps the schema simple and allows agents to switch roles.

---

### 2. `Listing`
A sealed tip for sale.

**PDA seeds:** `[b"listing", supplier.key().as_ref(), &listing_id.to_le_bytes()]`
(`listing_id` = supplier's `listings_created` counter at creation time)

**Fields:**
| Field | Type | Notes |
|---|---|---|
| supplier | Pubkey | Agent account key |
| listing_id | u64 | supplier-local counter |
| category | u8 (enum) | Whale=0, Mev=1, Mint=2, Imbal=3, Insdr=4, Bridge=5 |
| price_lamports | u64 | in SOL lamports |
| payload_commitment | [u8; 32] | hash of the plaintext payload (binding) |
| supplier_payload_cid | String (max 64) | offchain pointer (IPFS/Arweave) to supplier's encrypted blob |
| ttl_slot | u64 | listing expires after this slot |
| status | u8 (enum) | Active=0, Sold=1, Expired=2, Rated=3 |
| buyer | Option<Pubkey> | set on purchase |
| purchase_slot | Option<u64> | |
| created_at | i64 | |
| bump | u8 | |

**Size estimate:** ~200 bytes with String overhead

**Rationale:**
- `payload_commitment` binds the supplier to a specific tip before anyone buys — prevents bait-and-switch.
- `supplier_payload_cid` points to the initial encrypted blob (encrypted to supplier's own key — placeholder). On purchase, supplier re-encrypts to buyer's pubkey in `deliver_payload`.
- `listing_id` via counter means supplier can't front-run their own PDA derivation.
- Status state machine: Active → Sold → Rated, or Active → Expired.

---

### 3. `Purchase`
Records a private purchase event + the re-encrypted payload for the buyer.

**PDA seeds:** `[b"purchase", listing.key().as_ref()]`
(1:1 with listing; only one buyer per listing in v1)

**Fields:**
| Field | Type | Notes |
|---|---|---|
| listing | Pubkey | |
| buyer | Pubkey | Agent account key |
| price_paid_lamports | u64 | |
| buyer_payload_cid | String (max 64) | offchain pointer to ciphertext encrypted for buyer's pubkey_x25519 |
| purchased_at_slot | u64 | |
| delivered | bool | true once supplier posts the re-encrypted payload |
| bump | u8 | |

**Size estimate:** ~150 bytes

**Rationale:**
- Separate Purchase account keeps Listing immutable once sold.
- `delivered` flag lets buyer verify supplier posted the re-encrypted payload before rating.
- In v1, price_paid == price_lamports, but separating allows future auction / negotiation.

---

### 4. `Rating`
Buyer's verdict on the tip outcome.

**PDA seeds:** `[b"rating", purchase.key().as_ref()]`

**Fields:**
| Field | Type | Notes |
|---|---|---|
| purchase | Pubkey | |
| rater | Pubkey | must match purchase.buyer |
| verdict | u8 (enum) | True=0, False=1, Partial=2 |
| rated_at | i64 | |
| weight | u8 | 1 for v1, reserved for future weighting by price |
| bump | u8 | |

**Size estimate:** ~80 bytes

**Rationale:**
- Partial=2 reserved for future gradient; v1 uses True/False only, but schema is forward-compat.
- Rating triggers reputation update on Agent (supplier) via CPI or direct mutation in same instruction.

---

## Instructions

| Name | Signer | Accounts touched | What it does |
|---|---|---|---|
| `register_agent` | authority | Agent (init) | One-time registration, sets handle + x25519 pubkey |
| `create_listing` | supplier authority | Agent (mut, counter++), Listing (init) | Seals a tip. Supplier posts commitment + initial CID. |
| `purchase_listing` | buyer authority | Listing (mut), Purchase (init) | **PRIVATE via MagicBlock ER.** Transfers lamports supplier → buyer (wait, supplier receives; buyer pays). Sets listing.status=Sold. |
| `deliver_payload` | supplier authority | Purchase (mut) | Supplier posts buyer_payload_cid (re-encrypted ciphertext). Sets delivered=true. |
| `submit_rating` | buyer authority | Purchase, Rating (init), Agent (supplier, mut) | Creates rating + updates supplier reputation. Sets listing.status=Rated. |

**Note on MagicBlock:** `purchase_listing` is the only instruction that runs on the ephemeral rollup. All others are base-layer Anchor. Listing + Purchase accounts get delegated to the ER for the duration of the purchase, then committed back.

---

## Reputation math (inside `submit_rating`)

```
let delta = match verdict {
    True    => +1,
    Partial => 0,
    False   => -1,
};
// weighted average with decay
agent.reputation_num = agent.reputation_num + max(0, delta);
agent.reputation_den = agent.reputation_den + 1;
// reputation score (offchain display) = num / den, clamped [0, 1]
```

v1 keeps it dead simple. Decay / recency weighting is out of scope.

---

## Error codes (reserved)
- ~~`AlreadyRegistered`~~ — dropped 2026-04-24; Anchor's `init` constraint already surfaces this via `AccountAlreadyInUse` on PDA collision.
- `ListingExpired` — ttl_slot passed
- `ListingNotActive` — wrong status
- `NotBuyer` — rating signer mismatch
- `NotSupplier` — deliver_payload signer mismatch
- `AlreadyDelivered` — double delivery
- `AlreadyRated` — rating exists

---

## What Claude Code must do before writing Rust
1. Read this doc end-to-end.
2. Propose an `Accounts` struct for each instruction (just the Anchor `#[derive(Accounts)]` blocks, no instruction bodies).
3. Wait for my approval.
4. Only then implement instruction bodies.
