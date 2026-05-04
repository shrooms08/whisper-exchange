#!/usr/bin/env tsx
// One-shot funder. Transfers SOL from a source keypair to a recipient
// agent, on whichever devnet RPC is configured. Used for bootstrapping
// new agents before they run for the first time.
//
// Usage:
//   BASE_RPC=<rpc> npx tsx scripts/fund-agent.ts <from-keypair> <to-handle> <sol-amount>
//
// Examples:
//   BASE_RPC=$QUICKNODE_RPC_URL npx tsx scripts/fund-agent.ts \
//     agents/keys/supplier-solana.json dawn-watcher 3
//
// Idempotent-ish: prints the recipient's pre/post balance. If the recipient
// is already above the requested target, no transfer is sent.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

const KEYS_DIR = resolve(process.cwd(), "agents/keys");

function fail(msg: string): never {
  console.error(`fund-agent: ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const [fromArg, toHandle, solStr] = process.argv.slice(2);
  if (!fromArg || !toHandle || !solStr) {
    fail("usage: <from-keypair> <to-handle> <sol-amount>");
  }
  const targetSol = Number(solStr);
  if (!Number.isFinite(targetSol) || targetSol <= 0) {
    fail(`invalid sol amount: ${solStr}`);
  }

  const rpc = process.env.BASE_RPC ?? "https://api.devnet.solana.com";
  const conn = new Connection(rpc, "confirmed");

  const fromKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(fromArg, "utf8"))),
  );
  const toPath = resolve(KEYS_DIR, `${toHandle}-solana.json`);
  const toKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(toPath, "utf8"))),
  );

  const fromBalLamports = await conn.getBalance(fromKp.publicKey, "confirmed");
  const toBalLamports = await conn.getBalance(toKp.publicKey, "confirmed");
  const targetLamports = Math.floor(targetSol * LAMPORTS_PER_SOL);

  console.log(
    `[fund-agent] from=${fromKp.publicKey.toBase58()} bal=${(fromBalLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
  );
  console.log(
    `[fund-agent] to=${toKp.publicKey.toBase58()} (${toHandle}) bal=${(toBalLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL target=${targetSol} SOL`,
  );

  if (toBalLamports >= targetLamports) {
    console.log(`[fund-agent] recipient already at or above target — no-op`);
    return;
  }

  const transferLamports = targetLamports - toBalLamports;
  if (fromBalLamports < transferLamports + 5_000) {
    fail(
      `source has ${fromBalLamports} lamports, needs ${transferLamports + 5_000} (transfer + fee buffer)`,
    );
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKp.publicKey,
      toPubkey: toKp.publicKey,
      lamports: transferLamports,
    }),
  );

  const sig = await conn.sendTransaction(tx, [fromKp], {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  console.log(`[fund-agent] sent ${transferLamports / LAMPORTS_PER_SOL} SOL, sig=${sig}`);

  const conf = await conn.confirmTransaction(sig, "confirmed");
  if (conf.value.err) fail(`tx failed: ${JSON.stringify(conf.value.err)}`);

  const postBal = await conn.getBalance(toKp.publicKey, "confirmed");
  console.log(
    `[fund-agent] confirmed. recipient post-balance=${(postBal / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
  );
}

main().catch((err) => {
  console.error(`[fund-agent] error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
