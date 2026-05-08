# Wallet onboarding — derivation design

Day 5 Stream B foundation document. Locks in the byte-level scheme used by the
`/become-an-agent` flow to derive an x25519 encryption identity from a Solana
wallet's ed25519 signing key.

## Goal

Let any visitor with a Solana wallet (Phantom, Solflare, Backpack, etc.)
become a participating agent on Whisper Exchange without managing a separate
encryption key file. The derivation must:

1. Produce x25519 keypairs that **interop byte-for-byte** with the existing
   [`agents/crypto.ts`](../agents/crypto.ts) `sealTo` / `openSealed` helpers
   so suppliers can re-encrypt sealed payloads to the buyer's onboarded
   pubkey.
2. Be **deterministic** — same wallet + same message → same x25519 keypair.
   The user can re-derive their identity on any device with their wallet.
3. Be **derivable client-side only** — no server round-trip, no exposed
   private key on disk, the Solana wallet's existing security model carries.

## Scheme (locked)

```
seed = SHA-256(  ed25519.sign(  utf8("Whisper Exchange identity v1"),  walletSecret  )  )
x25519_priv = seed                                       // 32 bytes
x25519_pub  = x25519.getPublicKey(x25519_priv)           // 32 bytes, via @noble/curves
```

### Step-by-step

1. The wallet adapter exposes a `signMessage(bytes: Uint8Array)` method (for
   Phantom and other wallet-standard wallets). The fixed message is:

   ```
   const ONBOARDING_MESSAGE = "Whisper Exchange identity v1";
   ```

2. The wallet returns a 64-byte ed25519 signature. Ed25519 signing is
   **deterministic** for a given (key, message) pair — RFC 8032 §5.1.6
   defines the nonce as `SHA-512(prefix || message)[0..32]`, not from a CSPRNG.
   This is the property that makes "same wallet → same identity" work.

3. SHA-256 the 64-byte signature to a 32-byte digest. SHA-256 is used (not
   SHA-512) because we need exactly 32 bytes for the x25519 private key and
   want a hash that's universally available across runtime targets.

4. Use the digest directly as the x25519 private key. `@noble/curves/ed25519`'s
   `x25519` module clamps on use, so any 32-byte input is acceptable — no
   manual clamping required at the boundary.

5. Derive the public key with `x25519.getPublicKey(seed)`. This is the value
   passed to `register_agent(handle, pubkey_x25519)` on-chain.

### Why each choice

| choice | reason |
|---|---|
| Fixed message string | Makes the derivation reproducible. Versioned ("v1") so we can rotate the scheme later without colliding identities. |
| ed25519 (not Solana memo program) | Wallet adapters universally expose `signMessage` for offchain signatures. No transaction, no fee, no slot dependency. |
| SHA-256 of full 64-byte signature | Both halves of the ed25519 signature (R and s) are entropy-bearing. SHA-256 of the whole thing is the cleanest 32-byte fingerprint. |
| Direct seed → x25519 private key | `@noble/curves` clamps internally. No KDF, no salt — the SHA-256 step *is* the spreader. Adding HKDF would be cargo-culting. |

## Interop verification — PASSED

[`scripts/verify-wallet-x25519-interop.ts`](../scripts/verify-wallet-x25519-interop.ts)
exercises the full chain with a fixed input:

1. Loads `agents/keys/supplier-solana.json` (a known ed25519 keypair).
2. Signs `"Whisper Exchange identity v1"`.
3. Asserts ed25519 signing is deterministic (signs twice, bytes match).
4. Runs the SHA-256 → x25519 derivation.
5. Asserts derivation is deterministic (derives twice, bytes match).
6. Calls `sealTo(derivedPub, plaintext)` — the supplier-side path.
7. Calls `openSealed(derivedPriv, sealed)` — the buyer-side path.
8. Asserts plaintext bytes match.

Run output (2026-05-08):

```
=== verify-wallet-x25519-interop ===
step 1: wallet pubkey (ed25519) = 36e6dee945616442…
step 2: signed "Whisper Exchange identity v1" → 64 bytes
        sig[:16] = 51387bc2d767243747431ae6b35ba331…
        determinism: OK (two signs matched byte-for-byte)
step 3: derived x25519 priv = 5b82980deb08f22c…
        derived x25519 pub  = 0144861586b65d1b…
        derivation determinism: OK
step 4: sealTo() produced sealed bytes len=232
step 5: openSealed() recovered 172 bytes
step 6: plaintext bytes match ✓

=== PASS ===
Signature-derived x25519 is byte-compatible with agents/crypto.ts.
```

The scheme is **locked**. Day 6 builds Steps 2-4 of the onboarding UI on
this foundation.

## Trade-offs (acknowledged)

### Pros

- **Deterministic recovery.** The user can sign in on a fresh laptop with the
  same wallet and re-derive the same x25519 keypair. No backup file.
- **No new key storage.** Wallet security model carries — if Phantom is
  secure, the derived key is as secure as Phantom.
- **Simple register_agent flow.** One on-chain transaction, no key escrow.
- **Inspectable.** The seed can be re-derived in any language with ed25519
  signing + SHA-256 + x25519 — three primitives every crypto library has.

### Cons

- **Wallet-bound identity.** If the user changes wallets, their on-chain
  `Agent` PDA and accumulated reputation are tied to the old wallet. They
  can re-register from a new wallet but it's a fresh agent.
- **Same wallet, two registrations is a footgun.** A user who forgets they
  already registered and signs the message again will get the same x25519
  key — but `register_agent` will fail because the Agent PDA already exists
  for their wallet. Surface this with a clear "you're already registered"
  state in Step 3.
- **Signing is identity-establishing.** The user should be informed before
  they sign — the message popup will say `"Whisper Exchange identity v1"`,
  which is reasonably clear, but the UI should add a one-line explanation:
  "this signature derives your encryption key; the same key on every device".
- **Key compromise propagates.** If the wallet is compromised, the
  attacker can re-derive the same x25519 key and read every sealed payload
  ever delivered to that agent. This is no worse than the threat model where
  losing a wallet loses the assets it custodies, but it's worth stating: the
  on-chain reputation is recoverable; the encryption history is not.
- **No forward secrecy.** Once an attacker has the derived key, every
  historical sealed payload addressed to that pubkey decrypts. v2 could add
  a per-listing ephemeral subkey if this becomes a real concern.

### Alternatives considered, rejected

| alternative | why rejected |
|---|---|
| Generate fresh in browser, ask user to download keypair file | Worst UX. File loss = identity loss with no recovery. |
| Server-side key generation, send to client encrypted | Whisper Exchange has no auth backend. Adding one for this is overkill and undermines the "no custody" claim. |
| Hardware-wallet-only, derive via SLIP-0010 path | Phantom doesn't expose SLIP-0010 derivation paths to dapps. Would block ~80% of users. |
| Use the wallet's ed25519 pubkey directly as encryption key | x25519 ≠ ed25519. Curve25519 conversion exists but is non-trivial and the conversion direction (ed25519 → x25519) is one-way; we'd lose the ability to verify signatures. Cleaner to derive a separate x25519 from a signature. |

## Wire format

The on-chain `Agent` account stores `pubkey_x25519: [u8; 32]` (raw bytes).
No encoding wrapper — same as the supplier's existing key. The browser
serializes the derived pubkey as `Array.from(pubkey)` for the Anchor
instruction call. Same shape every supplier and buyer already uses.

## Surface area in code

| where | what |
|---|---|
| [`scripts/verify-wallet-x25519-interop.ts`](../scripts/verify-wallet-x25519-interop.ts) | The verify test. Re-run anytime `agents/crypto.ts` changes. |
| [`agents/crypto.ts`](../agents/crypto.ts) | `sealTo` / `openSealed` / `derivePublicKey` — unchanged, used as-is. |
| `app/app/become-an-agent/steps/SignIdentityStep.tsx` (Day 6) | UI for the actual signing + derivation step. Will reuse the derivation helper from `verify-wallet-x25519-interop.ts`, refactored into a shared module. |
| `app/lib/wallet-onboarding.ts` (Day 6) | Pure derivation helper that both the verify test and the UI import. |
