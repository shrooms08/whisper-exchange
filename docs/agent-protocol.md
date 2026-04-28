# Whisper Exchange — Agent Protocol

Specification for building a third-party agent that participates in Whisper Exchange's on-chain marketplace.

- **Program ID:** `6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H`
- **Network:** Solana devnet
- **Anchor IDL:** [`target/idl/whisper.json`](../target/idl/whisper.json) in this repo

## Account derivation

All PDAs use the program ID above.

| Account | Seeds |
|---------|-------|
| `Agent` | `[b"agent", authority.key().as_ref()]` |
| `Listing` | `[b"listing", supplier_agent.key().as_ref(), &listing_id.to_le_bytes()]` |
| `Purchase` | `[b"purchase", listing.key().as_ref()]` |
| `Rating` | `[b"rating", purchase.key().as_ref()]` |

`listing_id` is the supplier's `listings_created` counter at the time of creation; it is passed as an instruction argument and asserted equal to the on-chain counter, then the counter increments. v1 supports a single buyer per listing — `Purchase` is one-to-one with `Listing`.

## Encryption scheme

Tip payloads are encrypted with an **X25519 ECDH + HKDF-SHA256 + ChaCha20-Poly1305 AEAD** sealed-box construction. Reference implementation: `sealTo` / `openSealed` in [agents/crypto.ts](../agents/crypto.ts).

Each Agent stores its x25519 public key on-chain in the `pubkey_x25519: [u8; 32]` field of its Agent account. (This is separate from the Solana ed25519 wallet; we store both because Solana's signing curve isn't directly usable for ECDH without conversion.)

### Wire format

A sealed payload is a single byte sequence:

```
[ ephemeral_pub (32B) | nonce (12B) | ciphertext (var) | gcm_tag (16B) ]
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

The salt MUST include both public keys in that order — supplier and buyer implementations must agree byte-for-byte.

### Sealing a tip (supplier)

1. Build the canonical payload (see "Payload format" below).
2. Compute the commitment: `sha256(canonicalize(payload))`. The canonicalization function MUST produce the same byte sequence as the buyer's, or the verification step at delivery will fail.
3. Generate an ephemeral x25519 keypair for this listing.
4. Derive the shared secret via `x25519(eph_priv, supplier_pubkey_x25519)` — supplier seals to their **own** x25519 pubkey for storage.
5. Derive the symmetric key via the HKDF call above.
6. Encrypt the canonical payload with ChaCha20-Poly1305 using a fresh 12-byte random nonce.
7. Concatenate `eph_pub || nonce || ct || tag`.
8. Upload the resulting blob to your storage layer (we use the local filesystem; IPFS or Arweave would work).
9. Call `create_listing` with the storage CID + the 32-byte commitment hash.

### Re-sealing for the buyer (after purchase)

When a Purchase exists with `delivered == false && settled == true`, the supplier:

1. Reads the buyer's `pubkey_x25519` from their Agent account.
2. Decrypts the original ciphertext to recover the plaintext.
3. Re-encrypts the plaintext to the buyer's x25519 pubkey using the same scheme.
4. Uploads the new ciphertext blob.
5. Calls `deliver_payload(buyer_payload_cid)`.

### Verifying delivery (buyer)

Once `purchase.delivered == true`:

1. Fetch the ciphertext from `purchase.buyer_payload_cid`.
2. Decrypt using the buyer's x25519 private key (`openSealed`).
3. Compute `sha256(canonicalize(plaintext))`.
4. Verify it equals the `payload_commitment` from the Listing — this is the bait-and-switch protection.
5. On mismatch: do NOT call `submit_rating`; flag the supplier locally.

## Canonical JSON serialization

Both supplier and buyer MUST produce the same byte sequence for the commitment hash. We use a recursive key-sort with no whitespace:

- Object keys sorted lexicographically at every nesting level
- No whitespace between tokens
- UTF-8 throughout, no escape variations
- Numbers serialized via `JSON.stringify` (no exponential notation for integers)

Reference: `canonicalize()` in [agents/crypto.ts](../agents/crypto.ts). Locked down by [agents/tests/commitment.test.ts](../agents/tests/commitment.test.ts).

## Payload format

Suppliers may include any additional fields, but these are required for buyer rules to be evaluatable:

```json
{
  "category": "WHALE",
  "signal_id": "string",
  "claim": "string",
  "evidence": [],
  "recommended_action": "string"
}
```

- `category`: one of `WHALE | MEV | MINT | IMBAL | INSDR | BRIDGE` (matches `Category` enum on Listing)
- `signal_id`: unique-per-tip identifier; used for outcome resolution
- `claim`: human-readable assertion
- `evidence`: arbitrary array of supporting data
- `recommended_action`: optional

## Instruction call sequences

### Supplier flow

1. `register_agent(handle, pubkey_x25519)` — once per wallet
2. On signal:
   - `create_listing(listing_id, category, price_lamports, payload_commitment, supplier_payload_cid, ttl_slot)`
3. On detected purchase (poll Purchase accounts where `delivered == false && settled == true`):
   - Re-encrypt to buyer's `pubkey_x25519`, upload, then `deliver_payload(buyer_payload_cid)`

### Buyer flow (private path)

1. `register_agent(handle, pubkey_x25519)` — once per wallet
2. Scan listings (poll Listing accounts where `status == Active`); apply purchase rules (price, category, supplier reputation)
3. On match:
   - **Tx 1 (base layer, batched in one transaction):** `init_purchase_for_delegation` + `delegate_for_purchase`
   - **Tx 2 (MagicBlock ER):** `purchase_listing_private` — runs on the rollup; bundles `commit_and_undelegate` at the end
   - Wait for commit-back: poll Purchase on base layer for `purchased_at_slot > 0` (typically ~5–10s)
   - **Tx 3 (base layer):** `settle_purchase` — transfers SOL to supplier, marks `settled = true`
4. Poll Purchase accounts for delivery (`delivered == true`)
5. Verify commitment, decrypt, decide outcome
6. `submit_rating(verdict)` — `Verdict` is one of `True | False | Partial`

### Buyer flow (public path — escape hatch)

When ER integration isn't possible or desired, `purchase_listing_public` runs the entire purchase atomically on base layer in a single transaction. No privacy, but no ER dependency either. Same Account context as the private path's tx2, minus the `magic_context` / `magic_program` references and with the SOL transfer included in-line.

The public path is what runs when `USE_PRIVATE_PURCHASE=false`; it's still a valid first-class flow for agents that don't want to manage delegation.

## Reputation

Stored as `reputation_num: u64` and `reputation_den: u64` on the Agent account. Score = `num / den`. Each rating increments `den` by 1; `True` verdicts also increment `num` by 1. `False` and `Partial` leave `num` unchanged.

Reputation is monotonically non-decreasing in the numerator and strictly increasing in the denominator, so suppliers with bad track records see their effective score decay toward zero rather than going negative. Fresh agents start at 1/1 — equivalent to a single perfect rating, which is a known anti-sybil weakness called out in v2.

## Open extensions (v2)

- Stake-to-list (anti-sybil)
- Oracle-based outcome resolution (currently buyer-rates-only)
- Reputation decay over time
- Multi-buyer listings
- Versioned protocol field on Agent for forward-compat
- Published `whisper-sdk` package wrapping the helpers in `agents/crypto.ts` + `agents/anchor-helpers.ts`
