// Verify interop between (a) the proposed wallet-onboarding x25519 derivation
// and (b) the existing agents/crypto.ts sealTo/openSealed helpers.
//
// Onboarding flow (Stream B, Day 5):
//   user signs "Whisper Exchange identity v1" with their ed25519 Solana wallet
//   → SHA-256(signature) → first 32 bytes → x25519 private key seed
//   → x25519.getPublicKey(seed) → register_agent(pubkey)
//
// Suppliers re-encrypt sealed payloads to that pubkey at delivery time using
// agents/crypto.ts's sealTo. The buyer agent (or browser-side decrypt path
// later) must be able to recover the plaintext using the same derivation.
//
// This script exercises the full chain with a fixed, repeatable input so we
// catch any encoding/byte-order issue before Stream B builds Steps 2-4.
//
// Run:   cd scripts && npx tsx verify-wallet-x25519-interop.ts
//
// Pass = sealed→opened plaintext bytes match. Fail = derivation needs redesign.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ed25519 } from '@noble/curves/ed25519';

import { sealTo, openSealed, generateKeypair } from '../agents/crypto.ts';
// Single source of truth for the derivation. The browser-side
// GenerateIdentityStep imports from the same module, guaranteeing the bytes
// going on-chain via register_agent are identical to what this test
// validates against agents/crypto.ts.
import {
  ONBOARDING_MESSAGE,
  deriveX25519FromSignature,
  onboardingMessageBytes,
} from '../app/lib/wallet-onboarding.ts';

// ---------- helpers ----------

function loadEd25519SecretKey(): { secretKey: Uint8Array; publicKey: Uint8Array } {
  // Solana JSON keypair format: 64-byte array, first 32 = ed25519 seed,
  // last 32 = ed25519 pubkey. @noble/curves/ed25519's sign() takes the
  // 32-byte seed as its secret key (it does the SHA-512 expansion internally).
  const path = resolve(__dirname, '..', 'agents', 'keys', 'supplier-solana.json');
  const arr = JSON.parse(readFileSync(path, 'utf8')) as number[];
  if (arr.length !== 64) {
    throw new Error(`expected 64-byte secret key, got ${arr.length}`);
  }
  const secretKey = Uint8Array.from(arr.slice(0, 32));
  const publicKey = Uint8Array.from(arr.slice(32));
  return { secretKey, publicKey };
}

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

// ---------- test ----------

function main(): void {
  console.log('=== verify-wallet-x25519-interop ===');
  console.log();

  // 1. Simulate the wallet sign step using a known on-disk Solana keypair.
  const { secretKey: ed25519Seed, publicKey: ed25519Pub } = loadEd25519SecretKey();
  console.log(`step 1: wallet pubkey (ed25519) = ${hex(ed25519Pub).slice(0, 16)}…`);

  // 2. Sign the fixed onboarding message. ed25519 signatures are deterministic
  // for a given key + message, so this output is stable across runs — exactly
  // the property we want for "user reconnects, derives same identity".
  const messageBytes = onboardingMessageBytes();
  const signature = ed25519.sign(messageBytes, ed25519Seed);
  console.log(`step 2: signed "${ONBOARDING_MESSAGE}" → ${signature.length} bytes`);
  console.log(`        sig[:16] = ${hex(signature).slice(0, 32)}…`);

  // Determinism sanity-check: sign twice, must match.
  const signature2 = ed25519.sign(messageBytes, ed25519Seed);
  if (!bytesEqual(signature, signature2)) {
    console.error('FAIL: ed25519 signing is non-deterministic for same input — design assumption broken');
    process.exit(1);
  }
  console.log(`        determinism: OK (two signs matched byte-for-byte)`);

  // 3. Derive x25519 keypair from the signature.
  const derived = deriveX25519FromSignature(signature);
  console.log(`step 3: derived x25519 priv = ${hex(derived.privateKey).slice(0, 16)}…`);
  console.log(`        derived x25519 pub  = ${hex(derived.publicKey).slice(0, 16)}…`);

  // Determinism of derivation itself.
  const derived2 = deriveX25519FromSignature(signature);
  if (!bytesEqual(derived.publicKey, derived2.publicKey)) {
    console.error('FAIL: x25519 derivation is non-deterministic');
    process.exit(1);
  }
  console.log(`        derivation determinism: OK`);

  // 4. Encrypt a test payload using the existing agents/crypto.ts sealTo,
  //    addressed to the derived pubkey (just like a supplier would do at
  //    deliver_payload time).
  const plaintext = new TextEncoder().encode(
    JSON.stringify({
      signal_id: 'sig-WHALE-test',
      category: 'WHALE',
      claim: 'interop verification payload — should round-trip cleanly',
      evidence: [{ kind: 'fixture', value: Math.random().toString(36).slice(2) }],
    }),
  );
  const sealed = sealTo(derived.publicKey, plaintext);
  console.log(`step 4: sealTo() produced sealed bytes len=${sealed.length}`);

  // 5. Decrypt with the derived private key using openSealed.
  let recovered: Uint8Array;
  try {
    recovered = openSealed(derived.privateKey, sealed);
  } catch (err) {
    console.error(`FAIL: openSealed() threw: ${String(err)}`);
    process.exit(1);
  }

  // 6. Assert plaintext bytes match.
  if (!bytesEqual(plaintext, recovered)) {
    console.error('FAIL: recovered plaintext bytes do not match original');
    console.error(`  original  len=${plaintext.length}`);
    console.error(`  recovered len=${recovered.length}`);
    process.exit(1);
  }

  console.log(`step 5: openSealed() recovered ${recovered.length} bytes`);
  console.log(`step 6: plaintext bytes match ✓`);
  console.log();
  console.log('=== PASS ===');
  console.log('Signature-derived x25519 is byte-compatible with agents/crypto.ts.');
  console.log('Stream B Steps 2-4 can proceed on this scheme.');

  // Bonus sanity: a freshly-generated keypair and a derived one should NOT
  // be byte-equal (rules out any "everyone gets the same key" disaster).
  const fresh = generateKeypair();
  if (bytesEqual(fresh.publicKey, derived.publicKey)) {
    console.error('UNEXPECTED: fresh and derived pubkeys collided — astronomical odds, fail loudly');
    process.exit(1);
  }
}

main();
