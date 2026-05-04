#!/usr/bin/env tsx
// Generate a Solana keypair + x25519 keypair for a named agent handle.
// Output files mirror the existing supplier-/buyer-* layout under
// agents/keys/, so agents/supplier.ts and agents/buyer.ts can load them
// via AGENT_*_KEYPAIR env vars without code changes.
//
// Idempotent: if both files for the handle already exist, this script
// logs "exists" and exits cleanly. Never overwrites — we don't want to
// silently nuke a funded keypair.
//
// Usage:
//   npx tsx scripts/generate-agent.ts <handle>
//
// Examples:
//   npx tsx scripts/generate-agent.ts dawn-watcher
//   npx tsx scripts/generate-agent.ts cipher-rook

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { x25519 } from "@noble/curves/ed25519";
import { Keypair } from "@solana/web3.js";

const KEYS_DIR = resolve(process.cwd(), "agents/keys");
const HANDLE_RE = /^[a-z][a-z0-9-]{1,30}$/;

function fail(msg: string): never {
  console.error(`generate-agent: ${msg}`);
  process.exit(1);
}

function main(): void {
  const handle = process.argv[2];
  if (!handle) fail("missing <handle> argument");
  if (!HANDLE_RE.test(handle)) {
    fail(
      `invalid handle '${handle}'. Must be lowercase, 2-31 chars, [a-z0-9-], starting with a letter.`,
    );
  }

  mkdirSync(KEYS_DIR, { recursive: true });
  const solPath = resolve(KEYS_DIR, `${handle}-solana.json`);
  const xPath = resolve(KEYS_DIR, `${handle}-x25519.json`);

  // Solana keypair
  let solana: Keypair;
  if (existsSync(solPath)) {
    solana = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(solPath, "utf8"))),
    );
    console.log(
      `[generate-agent] ${handle}-solana.json exists, pubkey=${solana.publicKey.toBase58()}`,
    );
  } else {
    solana = Keypair.generate();
    writeFileSync(solPath, JSON.stringify(Array.from(solana.secretKey)));
    console.log(
      `[generate-agent] ${handle}-solana.json created, pubkey=${solana.publicKey.toBase58()}`,
    );
  }

  // x25519 keypair (private-key-only file, matches supplier/buyer pattern)
  if (existsSync(xPath)) {
    const priv = Uint8Array.from(JSON.parse(readFileSync(xPath, "utf8")));
    const pub = x25519.getPublicKey(priv);
    console.log(
      `[generate-agent] ${handle}-x25519.json exists, pub=${Buffer.from(pub).toString("hex").slice(0, 16)}…`,
    );
  } else {
    const priv = x25519.utils.randomSecretKey();
    const pub = x25519.getPublicKey(priv);
    writeFileSync(xPath, JSON.stringify(Array.from(priv)));
    console.log(
      `[generate-agent] ${handle}-x25519.json created, pub=${Buffer.from(pub).toString("hex").slice(0, 16)}…`,
    );
  }

  console.log(`[generate-agent] ${handle}: done`);
}

main();
