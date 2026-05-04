#!/usr/bin/env tsx
// Pre-flight for scripts/launch-multi.sh.
//
// Verifies all 4 keypair files exist, all 4 wallets have minimum balance,
// and the configured BASE_RPC is reachable. Exit 0 = ready to launch,
// exit 1 = something missing or broken (printed reason).

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

interface AgentEntry {
  handle: string;
  solPath: string;
  xPath: string;
  minSol: number;
}

const ROOT = process.cwd();
const AGENTS: AgentEntry[] = [
  {
    handle: "night-oracle",
    solPath: resolve(ROOT, "agents/keys/supplier-solana.json"),
    xPath: resolve(ROOT, "agents/keys/supplier-x25519.json"),
    minSol: 1,
  },
  {
    handle: "dawn-watcher",
    solPath: resolve(ROOT, "agents/keys/dawn-watcher-solana.json"),
    xPath: resolve(ROOT, "agents/keys/dawn-watcher-x25519.json"),
    minSol: 1,
  },
  {
    handle: "alpha-hunter",
    solPath: resolve(ROOT, "agents/keys/buyer-solana.json"),
    xPath: resolve(ROOT, "agents/keys/buyer-x25519.json"),
    minSol: 3,
  },
  {
    handle: "cipher-rook",
    solPath: resolve(ROOT, "agents/keys/cipher-rook-solana.json"),
    xPath: resolve(ROOT, "agents/keys/cipher-rook-x25519.json"),
    minSol: 3,
  },
];

function fail(msg: string): never {
  console.error(`[preflight] FATAL: ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const baseRpc = process.env.BASE_RPC;
  if (!baseRpc) fail("BASE_RPC not set (expected in agents/.env)");

  // 1. Keypair files
  for (const a of AGENTS) {
    if (!existsSync(a.solPath)) fail(`missing ${a.solPath}`);
    if (!existsSync(a.xPath)) fail(`missing ${a.xPath}`);
  }
  console.log("[preflight] keypair files: OK");

  // 2. RPC reachable
  const conn = new Connection(baseRpc, "confirmed");
  let slot: number;
  try {
    slot = await conn.getSlot("confirmed");
  } catch (err) {
    fail(`RPC unreachable: ${(err as Error).message}`);
  }
  console.log(`[preflight] RPC reachable, slot=${slot}`);

  // 3. Balances
  let allOk = true;
  for (const a of AGENTS) {
    const kp = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(a.solPath, "utf8"))),
    );
    const bal = await conn.getBalance(kp.publicKey, "confirmed");
    const sol = bal / LAMPORTS_PER_SOL;
    const ok = sol >= a.minSol;
    if (!ok) allOk = false;
    console.log(
      `[preflight] ${a.handle.padEnd(13)} ${kp.publicKey.toBase58()}  ${sol
        .toFixed(4)
        .padStart(8)} SOL  (min ${a.minSol})  ${ok ? "OK" : "INSUFFICIENT"}`,
    );
  }
  if (!allOk) fail("one or more wallets below required minimum");

  console.log("[preflight] all checks passed");
}

main().catch((err) => {
  console.error(`[preflight] error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
