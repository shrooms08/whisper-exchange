# Whisper Exchange — Agent Protocol

Specification for building a third-party agent that participates in Whisper Exchange's on-chain marketplace.

- **Program ID:** `6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H`
- **Network:** Solana devnet
- **Anchor IDL:** [`target/idl/whisper.json`](../target/idl/whisper.json) in this repo

The program is permissionless — any Solana wallet can `register_agent` and trade. The reference agents in `agents/supplier.ts` and `agents/buyer.ts` share a single codebase; their differences come entirely from environment variables (see [§ Behavior profiles](#behavior-profiles)). A third-party agent in any language only needs to (a) speak Anchor RPC against the program and (b) match the encryption + commitment scheme described below.

## Account derivation

All PDAs use the program ID above.

| Account | Seeds |
|---------|-------|
| `Agent` | `[b"agent", authority.key().as_ref()]` |
| `Listing` | `[b"listing", supplier_agent.key().as_ref(), &listing_id.to_le_bytes()]` |
| `Purchase` | `[b"purchase", listing.key().as_ref()]` |
| `Rating` | `[b"rating", purchase.key().as_ref()]` |

`listing_id` is the supplier's `listings_created` counter at the time of creation; it is passed as an instruction argument and asserted equal to the on-chain counter, then the counter increments. v1 supports a single buyer per listing — `Purchase` is one-to-one with `Listing`.

## On-chain account shapes

Anchor structs in [`programs/whisper/src/state.rs`](../programs/whisper/src/state.rs). Field names below use the Rust spelling; Anchor TS clients see them as camelCase.

### Agent

| Field | Type | Notes |
|---|---|---|
| `authority` | `Pubkey` | Wallet that signed `register_agent` |
| `handle` | `String` | ≤ 32 bytes, free-form display name |
| `pubkey_x25519` | `[u8; 32]` | Encryption pubkey, separate from the Solana wallet (ed25519) |
| `reputation_num` | `u64` | Count of `True`-verdict ratings received as a supplier |
| `reputation_den` | `u64` | Count of all ratings received as a supplier |
| `listings_created` | `u64` | Monotonic counter; consumed as `listing_id` seed |
| `created_at` | `i64` | Unix seconds |
| `bump` | `u8` | |

Fresh agents are initialized with `reputation_num = 0, reputation_den = 0`.

### Listing

| Field | Type | Notes |
|---|---|---|
| `supplier` | `Pubkey` | Supplier's Agent PDA |
| `listing_id` | `u64` | Matches the supplier's counter at creation time |
| `category` | `Category` | Enum (see below) |
| `price_lamports` | `u64` | Buyer pays this on purchase |
| `payload_commitment` | `[u8; 32]` | sha256 of the canonical JSON payload |
| `supplier_payload_cid` | `String` | ≤ 64 bytes; storage pointer for supplier-sealed ciphertext |
| `ttl_slot` | `u64` | Absolute slot; on-chain expiry check is `clock.slot ≤ ttl_slot` |
| `status` | `ListingStatus` | `Active → Sold → Rated`; `Expired` is implicit (ttl_slot < clock.slot) |
| `buyer` | `Option<Pubkey>` | Set on purchase |
| `purchase_slot` | `Option<u64>` | Set on purchase |
| `created_at` / `bump` | | |

### Purchase

| Field | Type | Notes |
|---|---|---|
| `listing` | `Pubkey` | |
| `buyer` | `Pubkey` | Buyer's Agent PDA |
| `price_paid_lamports` | `u64` | |
| `buyer_payload_cid` | `String` | ≤ 64 bytes; populated by `deliver_payload` |
| `purchased_at_slot` | `u64` | Set on tx2 (private path) or tx1 (public path) |
| `delivered` | `bool` | Set true by `deliver_payload` |
| `settled` | `bool` | Set true by `settle_purchase` (private) or atomically (public) |
| `bump` | `u8` | |

### Rating

| Field | Type | Notes |
|---|---|---|
| `purchase` / `rater` / `bump` | | |
| `verdict` | `Verdict` | `True | False | Partial` |
| `rated_at` | `i64` | |
| `weight` | `u8` | Always `1` in v1 (placeholder for weighted ratings later) |

### Enums

```rust
enum Category   { Whale, Mev, Mint, Imbal, Insdr, Bridge }
enum ListingStatus { Active, Sold, Expired, Rated }
enum Verdict    { True, False, Partial }
```

**Anchor TS encoding:** discriminated unions like `{ whale: {} }`, `{ true: {} }`, etc. Lower-case variant name as the key, empty struct as the value. The reference suppliers send the JSON payload's `category` as upper-case (`"WHALE"`) and lower-case it at the Anchor call site:

```ts
.createListing(new BN(listingId), { [signal.category.toLowerCase()]: {} }, /* ... */)
```

## Encryption scheme

Tip payloads are encrypted with **X25519 ECDH + HKDF-SHA256 + ChaCha20-Poly1305 AEAD**, libsodium-style. Reference: [`sealTo` / `openSealed`](../agents/crypto.ts).

Each Agent stores its 32-byte x25519 public key on-chain in `Agent.pubkey_x25519`. (Solana wallets sign on ed25519 — separate curve. The two keys aren't derived from each other.)

### Wire format

A sealed payload is a single byte sequence:

```
[ ephemeral_pub (32B) | nonce (12B) | ciphertext (var) | poly1305_tag (16B) ]
```

The recipient recovers the shared secret using their own private key + the embedded ephemeral public key — no out-of-band metadata is required.

### Key derivation

```
shared      = x25519_ecdh(eph_priv, recipient_pub)
key (32B)   = HKDF-SHA256(
                ikm    = shared,
                salt   = eph_pub || recipient_pub,
                info   = b"whisper-seal-v1",
                length = 32,
              )
```

The salt MUST include both public keys in that order. Supplier and buyer implementations must agree byte-for-byte.

### Sealing a tip (supplier)

The supplier seals to its **own** x25519 pubkey at listing time — the ciphertext sits in storage; only the supplier can decrypt until a buyer purchases and the supplier re-seals.

1. Build the canonical payload (see [§ Payload format](#payload-format)).
2. Compute the commitment: `sha256(canonicalize(payload))`.
3. Generate an ephemeral x25519 keypair for this listing.
4. Derive the shared secret via `x25519(eph_priv, supplier_own_pubkey_x25519)`.
5. Derive the symmetric key via the HKDF call above.
6. Encrypt with ChaCha20-Poly1305 using a fresh 12-byte random nonce.
7. Concatenate `eph_pub || nonce || ct || tag`.
8. Upload the blob to your storage layer (reference uses local filesystem; IPFS or Arweave equivalent).
9. Call `create_listing` with the storage CID + the 32-byte commitment hash.

### Re-sealing for the buyer (after purchase)

When a Purchase exists with `delivered == false && settled == true`:

1. Read the buyer's `pubkey_x25519` from their Agent account.
2. Decrypt the original ciphertext to recover the plaintext.
3. Re-encrypt the plaintext to the buyer's x25519 pubkey using the same scheme.
4. Upload the new ciphertext blob.
5. Call `deliver_payload(buyer_payload_cid)`.

### Verifying delivery (buyer)

Once `purchase.delivered == true`:

1. Fetch the ciphertext from `purchase.buyer_payload_cid`.
2. Decrypt using the buyer's x25519 private key (`openSealed`).
3. Compute `sha256(canonicalize(plaintext))`.
4. Verify it equals the `payload_commitment` from the Listing — bait-and-switch protection.
5. On mismatch: do NOT call `submit_rating`; flag the supplier locally.

## Canonical JSON serialization

Both supplier and buyer MUST produce the same byte sequence for the commitment hash. Rules (implemented in [`canonicalize()`](../agents/crypto.ts)):

- Object keys sorted lexicographically at every nesting level
- No whitespace between tokens (no spaces, no newlines)
- UTF-8 throughout
- Numbers serialized via `JSON.stringify` (no exponential notation for integers)
- Arrays preserve order; recurse element-wise

Locked down by [`agents/tests/commitment.test.ts`](../agents/tests/commitment.test.ts).

## Payload format

The supplier writes a JSON object before sealing. Required fields are evaluated by buyer rules; everything else is opaque payload visible only after delivery.

```json
{
  "category": "WHALE",
  "signal_id": "sig-WHALE-0042",
  "signal_ref": "slot 460088125, wallet AbCd…XyZ",
  "claim": "Whale AbCd…XyZ: 503 SOL → 487 USDC on Raydium",
  "evidence": [{"kind":"balance_delta","wallet":"AbCd…XyZ","sol":503}],
  "recommended_action": "short SOL/USDC, size ≤ 500 SOL"
}
```

| Field | Required | Notes |
|---|---|---|
| `category` | yes | One of `WHALE | MEV | MINT | IMBAL | INSDR | BRIDGE`. Must match `Category` enum (see Anchor TS encoding above) |
| `signal_id` | yes | Unique-per-tip identifier; used for outcome resolution |
| `claim` | yes | Human-readable assertion (what the supplier is selling) |
| `evidence` | yes | Array of supporting data; arbitrary shape, but stable enough to canonicalize |
| `signal_ref` | recommended | Free-form provenance pointer (slot, wallet, pool, etc) |
| `recommended_action` | recommended | What the buyer should do with this tip |

Suppliers may include any additional fields — the commitment binds whatever was canonicalized, so the buyer's verification will check whatever was hashed.

## Behavior profiles

The reference `supplier.ts` and `buyer.ts` are **single binaries** parameterized via env vars. Multiple agents run from the same source; differentiation is configuration. This is the recommended pattern for third-party agents too — fork the repo or reimplement, but keep the env-var contract.

### Common (both roles)

| Var | Default | Notes |
|---|---|---|
| `AGENT_HANDLE` | `night-oracle` (sup) / `alpha-hunter` (buy) | On-chain registration name + log prefix |
| `AGENT_SOLANA_KEYPAIR` | `keys/{role}-solana.json` | Solana keypair file path |
| `AGENT_X25519_KEYPAIR` | `keys/{role}-x25519.json` | x25519 keypair file path |
| `BASE_RPC` | constructed from `HELIUS_API_KEY`, falls back to public devnet | See [§ RPC infrastructure](#rpc-infrastructure) |

### Supplier-only

| Var | Default | Notes |
|---|---|---|
| `AGENT_SIGNAL_CATEGORIES` | unset (accept all) | CSV. Supplier ignores any signal whose category isn't in the list |
| `AGENT_PRICE_LAMPORTS` | unset (per-category fallback table) | When set, every listing is priced at this amount regardless of category |

### Buyer-only

| Var | Default | Notes |
|---|---|---|
| `AGENT_BUY_CATEGORIES` | all six | CSV. Buyer purchases only these categories |
| `AGENT_MAX_PRICE_LAMPORTS` | 6 SOL | Skip listings priced ≥ this |
| `AGENT_MIN_REPUTATION` | unset (legacy ratio gate) | See [§ Reputation gate](#reputation-gate) |

### Reference profiles

The four agents in the multi-agent demo:

| Handle | Role | Profile |
|---|---|---|
| `night-oracle` | supplier | `WHALE,MEV` @ 2.4 SOL |
| `dawn-watcher` | supplier | `MINT,INSDR,IMBAL` @ 1.8 SOL |
| `alpha-hunter` | buyer | buys `WHALE,MEV,IMBAL`, max 3.0 SOL, no rep gate |
| `cipher-rook` | buyer | buys `MINT,INSDR,WHALE`, max 2.5 SOL, `min_rep=8` |

Launcher: [`scripts/launch-multi.sh`](../scripts/launch-multi.sh). End-to-end harness: [`scripts/multi-e2e.ts`](../scripts/multi-e2e.ts).

## Reputation gate

`AGENT_MIN_REPUTATION` is an **integer numerator threshold** (count-based, v1).

| Value | Behavior |
|---|---|
| unset | Legacy fractional gate (`MIN_REP=0.5` default): skip if `den > 0 && num/den < 0.5` |
| `0` | No gate; buy from anyone |
| `>0` | Skip listing if **either** `den === 0` (fresh, rep unknown) **or** `num < AGENT_MIN_REPUTATION` |

The "fresh agent ⇒ skipped" rule is intentional: a buyer with `min_reputation > 0` opts in to "I don't trade with strangers." Fresh suppliers must accumulate ratings via rep-agnostic buyers (e.g. `alpha-hunter` with `min_reputation=0`) before stricter buyers like `cipher-rook` will accept them.

When the buyer skips, it logs:

```
LISTING_SKIPPED handle=cipher-rook reason=below_min_rep
  listing_id=110324 listing_pda=GZ9X…hT71
  supplier_rep=2/3 min_reputation=8
```

**v2 will replace this with a ratio + min-total-ratings combo** (e.g. `≥80% over ≥5 ratings`). The count-based gate is sufficient for v1 demo dynamics but has known weaknesses called out in [§ Deferred to v2](#deferred-to-v2).

## Signal sources

The supplier accepts signals from one of three sources, controlled by env vars:

| Source | Trigger | Status |
|---|---|---|
| Mock generator | `USE_REAL_SIGNALS=false` (default) | **Active.** Built-in 6-category generator at [`agents/signals.ts`](../agents/signals.ts) — weighted random, 5–15s intervals, category-specific claim templates |
| Helius webhook | `USE_REAL_SIGNALS=true` | **Paused** for the Frontier window (Helius free-tier credits exhausted; resets ~2026-05-21). Code path remains live: webhook receiver at [`agents/webhook-receiver.ts`](../agents/webhook-receiver.ts), filter at [`agents/lib/signal-filter.ts`](../agents/lib/signal-filter.ts), normalizer at [`agents/lib/signal-normalize.ts`](../agents/lib/signal-normalize.ts) |
| Cold dry-run | `DRY_RUN=1` | No on-chain calls; scripts emit log lines but never hit Solana. Useful for unit-style smoke tests |

Logs distinguish via the `source` field:

```
SIGNAL_DETECTED handle=night-oracle source=mock id=sig-WHALE-0001 category=WHALE
SIGNAL_DETECTED handle=night-oracle source=helius id=helius-9f3a category=WHALE
```

The downstream evaluator (`handleSignal` in `supplier.ts`) is source-agnostic — it sees the same `Signal` shape from either source.

## RPC infrastructure

Agents and the dashboard read RPC URLs in this precedence order:

1. `BASE_RPC` (env, explicit)
2. `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` (env, constructed)
3. `https://api.devnet.solana.com` (public, last resort — `getProgramAccounts` will 429 under any real load)

Dashboard mirrors this chain with `QUICKNODE_RPC_URL > HELIUS_API_KEY > public`. As of 2026-05-04, the active provider is **QuickNode devnet** (Helius outbound paused per above). Setting `BASE_RPC` to a QuickNode endpoint in `agents/.env` gives the agents the same path.

## Instruction call sequences

### Supplier flow

1. `register_agent(handle, pubkey_x25519)` — once per wallet
2. On signal:
   - Seal payload → upload ciphertext → compute `payload_commitment`
   - `create_listing(listing_id, category, price_lamports, payload_commitment, supplier_payload_cid, ttl_slot)` where `ttl_slot = current_slot + 200` is the reference convention (gives ~80 seconds at 400ms slots)
3. On detected purchase (poll Purchase accounts for `delivered == false && settled == true`):
   - Re-encrypt to buyer's `pubkey_x25519`, upload new ciphertext, then `deliver_payload(buyer_payload_cid)`

### Buyer flow (private path — privacy-preserving via MagicBlock ER)

1. `register_agent(handle, pubkey_x25519)` — once per wallet
2. Scan listings (poll Listing accounts where `status == Active`); apply purchase rules (price, category, reputation gate)
3. On match:
   - **Tx 1 (base layer, batched in one transaction):** `init_purchase_for_delegation` + `delegate_for_purchase`
   - **Tx 2 (MagicBlock ER):** `purchase_listing_private` — runs on the rollup; bundles `commit_and_undelegate` at the end
   - Wait for commit-back: poll Purchase on base layer for `purchased_at_slot > 0` (typically ~5–10s)
   - **Tx 3 (base layer):** `settle_purchase` — transfers SOL to supplier, marks `settled = true`
4. Poll Purchase accounts for delivery (`delivered == true`)
5. Verify commitment, decrypt, decide outcome
6. `submit_rating(verdict)` — `Verdict` is one of `True | False | Partial`

### Buyer flow (public path — single-tx escape hatch)

When ER integration isn't possible or desired, `purchase_listing_public` runs the entire purchase atomically on base layer in one transaction. No privacy benefit, no ER dependency. The handler transfers SOL inline and sets `settled = true` immediately, satisfying `deliver_payload`'s gate.

`USE_PRIVATE_PURCHASE=false` (the default) selects this path. It's a first-class flow, not a fallback — agents that don't want to manage delegation should use it.

## Reputation accumulation

Stored on the supplier's `Agent` account as `reputation_num: u64` and `reputation_den: u64`. Score (when `den > 0`) is `num / den`.

Per-rating effect:
- `den` increments by 1 always
- `num` increments by 1 only when verdict is `True`
- `False` and `Partial` leave `num` unchanged

Both fields are saturating-add internally — no overflow path. Fresh agents are 0/0; their first rating moves them to either 1/1 (True) or 0/1 (False/Partial).

This monotonic structure means a supplier with bad ratings sees their effective score decay toward zero rather than going negative, but their `den` keeps climbing — useful signal for buyers who care about volume of evidence. v2 will introduce reputation decay over time and ratio-with-floor gating.

## Defensive behaviors worth knowing

These aren't on-chain protocol — they're production patterns the reference agents adopt. Third-party agents should match them or document their own approach.

- **Single-tx-failure isolation.** A `TransactionExpiredTimeoutError` on `create_listing` (RPC flake) used to kill the supplier. The reference loop now wraps `handleSignal` in try/catch — logs `SIGNAL_HANDLE_ERROR`, drops the signal, keeps running. Same pattern is recommended for the buyer's purchase loop.
- **Listing residue.** Buyers see Listings from prior runs whose TTL has lapsed. Trying to purchase one returns `ListingExpired`. Until the Day 9 cleanup ships, the reference buyer churns scan cycles on residue. Agents that filter `listing.ttl_slot < currentSlot` client-side avoid wasted gas. (Tracked as a TODO in [`docs/frontier-track-plan.md`](frontier-track-plan.md) Day 9.)
- **Idempotent registration.** Agents check whether their `Agent` PDA already exists before calling `register_agent` (instruction would fail on re-init). Reference: `ensureRegistered` in supplier/buyer.

## Deferred to v2

Known protocol-level gaps. Filing here so third-party implementers know what's coming:

- **Stake-to-list / anti-sybil.** Anyone can spawn fresh agents with 0/0 reputation; cost of a sybil identity = transaction fees only.
- **Ratio + min-total-ratings reputation gate.** Replaces v1 count-based threshold (e.g. `≥80% over ≥5 ratings` instead of `num ≥ 4`).
- **Oracle-based outcome resolution.** Currently buyer-rates-only — buyer's verdict is the supplier's reputation truth. v2: an oracle (or multi-buyer median) resolves the `signal_id` independently.
- **Reputation decay over time.** Old ratings should weigh less.
- **Multi-buyer listings.** v1 enforces 1:1 Purchase per Listing.
- **Versioned protocol field on Agent.** Forward-compat for protocol upgrades.
- **Published `whisper-sdk` package.** Currently the helpers in `agents/crypto.ts` + `agents/anchor-helpers.ts` must be reimplemented or imported directly.
- **`recover_stuck_purchase` instruction.** For Purchases stranded mid-flow (delegated but not committed back, etc.).
- **Mainnet deployment + audit.** Devnet only in v1.
