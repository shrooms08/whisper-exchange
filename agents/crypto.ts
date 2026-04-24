// Encryption helpers for Whisper Exchange.
//
// Scheme: libsodium-style sealed-box built on X25519 ECDH + HKDF-SHA256 +
// ChaCha20-Poly1305 AEAD. Sender encrypts with an ephemeral keypair; output
// carries the ephemeral public key so the recipient can recover the shared
// secret with only their own private key.
//
// Wire format:  [ eph_pub (32B) | nonce (12B) | ciphertext+tag ]

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

const EPH_PUB_LEN = 32;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const KDF_INFO = new TextEncoder().encode('whisper-seal-v1');

export interface X25519Keypair {
  privateKey: Uint8Array; // 32 bytes
  publicKey: Uint8Array; // 32 bytes
}

export function generateKeypair(): X25519Keypair {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function derivePublicKey(privateKey: Uint8Array): Uint8Array {
  assertLen(privateKey, 32, 'privateKey');
  return x25519.getPublicKey(privateKey);
}

export function sealTo(recipientPubkey: Uint8Array, plaintext: Uint8Array): Uint8Array {
  assertLen(recipientPubkey, 32, 'recipientPubkey');

  const ephPriv = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(ephPriv);
  const shared = x25519.getSharedSecret(ephPriv, recipientPubkey);

  const nonce = randomBytes(NONCE_LEN);
  const key = hkdf(sha256, shared, concat(ephPub, recipientPubkey), KDF_INFO, 32);

  const cipher = createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: TAG_LEN });
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return concat(ephPub, nonce, ct, tag);
}

export function openSealed(recipientPrivkey: Uint8Array, sealed: Uint8Array): Uint8Array {
  assertLen(recipientPrivkey, 32, 'recipientPrivkey');
  if (sealed.length < EPH_PUB_LEN + NONCE_LEN + TAG_LEN) {
    throw new Error('sealed payload too short');
  }

  const ephPub = sealed.subarray(0, EPH_PUB_LEN);
  const nonce = sealed.subarray(EPH_PUB_LEN, EPH_PUB_LEN + NONCE_LEN);
  const ctAndTag = sealed.subarray(EPH_PUB_LEN + NONCE_LEN);
  const ct = ctAndTag.subarray(0, ctAndTag.length - TAG_LEN);
  const tag = ctAndTag.subarray(ctAndTag.length - TAG_LEN);

  const recipientPub = x25519.getPublicKey(recipientPrivkey);
  const shared = x25519.getSharedSecret(recipientPrivkey, ephPub);
  const key = hkdf(sha256, shared, concat(ephPub, recipientPub), KDF_INFO, 32);

  const decipher = createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return new Uint8Array(pt);
}

// SHA-256 commitment over the canonical JSON representation of an object.
// Used for Listing.payload_commitment — binds the supplier to a specific tip
// before anyone buys. Buyer re-hashes decrypted plaintext and compares.
export function commit(payload: unknown): Uint8Array {
  const canonical = new TextEncoder().encode(canonicalJSON(payload));
  return sha256(canonical);
}

export function commitBytes(bytes: Uint8Array): Uint8Array {
  return sha256(bytes);
}

// Deterministic JSON: keys sorted at every object depth. Matches what the
// on-chain payload_commitment is expected to hash over.
function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (k) => JSON.stringify(k) + ':' + canonicalJSON((value as Record<string, unknown>)[k]),
  );
  return '{' + entries.join(',') + '}';
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function assertLen(buf: Uint8Array, len: number, name: string): void {
  if (buf.length !== len) {
    throw new Error(`${name} must be ${len} bytes, got ${buf.length}`);
  }
}
