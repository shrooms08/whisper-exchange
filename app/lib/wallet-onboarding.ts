// Shared x25519 derivation for the wallet onboarding flow.
//
// Both the live UI (app/app/become-an-agent/steps/GenerateIdentityStep.tsx)
// and the verification test (scripts/verify-wallet-x25519-interop.ts) import
// from here so we have a single source of truth — same bytes go on-chain
// from the browser as the verify test demonstrated were interop-clean with
// agents/crypto.ts.
//
// Scheme (locked, see docs/wallet-onboarding-design.md):
//
//   seed = SHA-256( ed25519.sign( utf8(ONBOARDING_MESSAGE), walletSecret ) )
//   x25519_priv = seed                                  // 32 bytes
//   x25519_pub  = x25519.getPublicKey(x25519_priv)      // 32 bytes
//
// Pure module — no React, no DOM, no node-only APIs. Safe to import from
// either the browser bundle or a Node script.

import { x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';

export const ONBOARDING_MESSAGE = 'Whisper Exchange identity v1';

/** UTF-8 bytes of the fixed onboarding message — what the wallet signs. */
export function onboardingMessageBytes(): Uint8Array {
  return new TextEncoder().encode(ONBOARDING_MESSAGE);
}

export interface DerivedX25519 {
  /** 32-byte x25519 private key. NEVER render in UI. */
  privateKey: Uint8Array;
  /** 32-byte x25519 public key. Safe to display + put on-chain. */
  publicKey: Uint8Array;
}

/**
 * Derive an x25519 keypair from a 64-byte ed25519 signature over the fixed
 * onboarding message. Deterministic: same wallet + same message → same
 * keypair, every time, on every device.
 *
 * Throws if the signature isn't 64 bytes. Pure function otherwise.
 */
export function deriveX25519FromSignature(signature: Uint8Array): DerivedX25519 {
  if (signature.length !== 64) {
    throw new Error(
      `expected 64-byte ed25519 signature, got ${signature.length} bytes`,
    );
  }
  // SHA-256 of the full 64-byte signature → 32-byte digest. The whole
  // signature carries entropy (both R and s halves), and SHA-256 is the
  // simplest 32-byte fingerprint that's universally available.
  const seed = sha256(signature);

  // @noble/curves/ed25519's x25519 module clamps on use, so any 32-byte
  // input is acceptable. No manual clamping needed at this boundary.
  const privateKey = seed;
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}
