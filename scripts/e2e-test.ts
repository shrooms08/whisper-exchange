// End-to-end devnet test for Whisper Exchange.
//
// Expected CWD: whisper-exchange/agents  (so node_modules + relative IDL path work).
// Launch from repo root:
//   (cd agents && npx tsx ../scripts/e2e-test.ts)
//
// Flow:
//   1. Load/gen keypairs (Solana + x25519) for supplier + buyer.
//   2. Register both agents on chain (idempotent).
//   3. Spawn supplier.ts + buyer.ts as children; tee stdout into unified log.
//   4. Poll chain state every 2s; exit as soon as all assertions pass
//      or at T+90s timeout.
//   5. Teardown children cleanly.
//   6. Exit 0 on full pass, 1 on any assertion fail / timeout.

import { spawn, type ChildProcess } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { AnchorProvider, Program, Wallet, web3 } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import { x25519 } from '@noble/curves/ed25519';

loadDotenv();

// Day 1.5: same precedence chain as app/lib/chain.ts and agents/supplier.ts.
// BASE_RPC (typically QuickNode after the Helius quota wall) wins; Helius is
// the fallback for when its credits return; public devnet is last resort.
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
if (!HELIUS_API_KEY && !process.env.BASE_RPC) {
  console.error(
    '[e2e] FATAL: BASE_RPC or HELIUS_API_KEY env var is required.',
  );
  process.exit(1);
}
const RPC_URL =
  process.env.BASE_RPC ??
  `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY ?? ''}`;
// Bumped from 90s → 150s on 2026-04-28 (Frontier track day 1). The buyer's
// purchase loop is concurrent across all matching active listings — when
// there's any backlog (real-signal supplier creating multiple listings, or
// the multi-agent demo planned for day 2), the freshly-created listing's
// rating window can fall outside the original 90s budget. 150s gives the
// settle→deliver→rate sequence headroom.
const TIMEOUT_MS = 150_000;
const POLL_MS = 2_000;
const KEYS_DIR = resolve('keys');
const LOG_PATH = resolve('..', 'output', 'e2e-log.txt');

const t0 = Date.now();
function elapsed(): string {
  const s = ((Date.now() - t0) / 1000).toFixed(1);
  return `T+${s}s`;
}

function ts(): string {
  return new Date().toISOString();
}

mkdirSync(resolve('..', 'output'), { recursive: true });
const logFile = createWriteStream(LOG_PATH);

function log(line: string): void {
  const out = `${ts()} ${elapsed()} ${line}`;
  console.log(out);
  logFile.write(out + '\n');
}

function logChild(tag: string, line: string): void {
  log(`[${tag}] ${line}`);
}

// ---------- keystore ----------

interface Keystore {
  solana: web3.Keypair;
  x25519Priv: Uint8Array;
  x25519Pub: Uint8Array;
}

function loadOrCreateKeystore(role: 'supplier' | 'buyer'): Keystore {
  mkdirSync(KEYS_DIR, { recursive: true });
  const solPath = resolve(KEYS_DIR, `${role}-solana.json`);
  const xPath = resolve(KEYS_DIR, `${role}-x25519.json`);

  if (!existsSync(solPath)) {
    throw new Error(`missing ${solPath} — run scripts/setup-devnet.sh first`);
  }
  const solana = web3.Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(solPath, 'utf8'))),
  );

  let x25519Priv: Uint8Array;
  if (existsSync(xPath)) {
    x25519Priv = Uint8Array.from(JSON.parse(readFileSync(xPath, 'utf8')));
  } else {
    x25519Priv = x25519.utils.randomSecretKey();
    writeFileSync(xPath, JSON.stringify(Array.from(x25519Priv)));
  }
  const x25519Pub = x25519.getPublicKey(x25519Priv);
  return { solana, x25519Priv, x25519Pub };
}

// ---------- anchor ----------

const idl = JSON.parse(
  readFileSync(resolve('..', 'target', 'idl', 'whisper.json'), 'utf8'),
) as Idl;

function makeProgram(keypair: web3.Keypair): {
  program: Program<Idl>;
  connection: web3.Connection;
  wallet: Wallet;
} {
  const connection = new web3.Connection(RPC_URL, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new Program(idl, provider);
  return { program, connection, wallet };
}

function agentPda(
  programId: web3.PublicKey,
  authority: web3.PublicKey,
): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('agent'), authority.toBuffer()],
    programId,
  )[0];
}

function listingPda(
  programId: web3.PublicKey,
  supplierAgent: web3.PublicKey,
  listingId: bigint,
): web3.PublicKey {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(listingId);
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('listing'), supplierAgent.toBuffer(), idBuf],
    programId,
  )[0];
}

function purchasePdaFor(
  programId: web3.PublicKey,
  listing: web3.PublicKey,
): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('purchase'), listing.toBuffer()],
    programId,
  )[0];
}

function ratingPdaFor(
  programId: web3.PublicKey,
  purchase: web3.PublicKey,
): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('rating'), purchase.toBuffer()],
    programId,
  )[0];
}

async function ensureRegistered(
  role: 'supplier' | 'buyer',
  keystore: Keystore,
  handle: string,
): Promise<web3.PublicKey> {
  const { program, connection, wallet } = makeProgram(keystore.solana);
  const pda = agentPda(program.programId, wallet.publicKey);
  const existing = await connection.getAccountInfo(pda);
  if (existing) {
    log(`[setup] ${role} agent already registered at ${pda.toBase58()}`);
    return pda;
  }
  log(`[setup] registering ${role} agent (handle=${handle}) at ${pda.toBase58()}`);
  const sig = await (program.methods as any)
    .registerAgent(handle, Array.from(keystore.x25519Pub))
    .accounts({
      agent: pda,
      authority: wallet.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();
  log(`[setup] ${role} registered tx=${sig}`);
  return pda;
}

// ---------- child process management ----------

function spawnAgent(role: 'supplier' | 'buyer'): ChildProcess {
  const child = spawn('npx', ['tsx', `${role}.ts`], {
    cwd: process.cwd(),
    // Propagate as BASE_RPC so the agent's existing precedence chain
     // (BASE_RPC > Helius) picks it up. RPC_URL is kept for any legacy
     // consumer; agents themselves only read BASE_RPC.
    env: { ...process.env, BASE_RPC: RPC_URL, RPC_URL },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (child.stdout) {
    createInterface({ input: child.stdout }).on('line', (l) => logChild(role, l));
  }
  if (child.stderr) {
    createInterface({ input: child.stderr }).on('line', (l) => logChild(`${role}!`, l));
  }
  child.on('exit', (code, signal) => log(`[main] ${role} exited code=${code} signal=${signal}`));
  return child;
}

function teardown(children: ChildProcess[]): Promise<void> {
  return new Promise((done) => {
    log('[main] sending SIGTERM to children');
    for (const c of children) {
      try { c.kill('SIGTERM'); } catch { /* noop */ }
    }
    const deadline = Date.now() + 3_000;
    const poll = setInterval(() => {
      const allDead = children.every((c) => c.exitCode !== null || c.signalCode !== null);
      if (allDead || Date.now() > deadline) {
        clearInterval(poll);
        for (const c of children) {
          if (c.exitCode === null && c.signalCode === null) {
            log(`[main] SIGKILL pid=${c.pid}`);
            try { c.kill('SIGKILL'); } catch { /* noop */ }
          }
        }
        done();
      }
    }, 200);
  });
}

// ---------- assertions ----------

interface Result {
  name: string;
  pass: boolean;
  detail: string;
}

function pickVariant(v: any): string {
  if (typeof v !== 'object' || v === null) return String(v);
  return Object.keys(v)[0] ?? '(empty)';
}

async function runAssertions(
  supplierPda: web3.PublicKey,
  supplierKeypair: web3.Keypair,
  baseline: { listingsCreated: bigint; reputationDen: bigint; reputationNum: bigint },
): Promise<Result[]> {
  const { program } = makeProgram(supplierKeypair);
  const results: Result[] = [];

  const supplierAgent: any = await (program.account as any).agent.fetch(supplierPda);
  const listingsCreated = BigInt(supplierAgent.listingsCreated.toString());
  const ratingDen = BigInt(supplierAgent.reputationDen.toString());
  const ratingNum = BigInt(supplierAgent.reputationNum.toString());

  if (listingsCreated <= baseline.listingsCreated) {
    results.push({
      name: 'fresh listing produced this run',
      pass: false,
      detail: `listings_created=${listingsCreated} (baseline=${baseline.listingsCreated})`,
    });
    return results;
  }

  const lastId = listingsCreated - 1n;
  const listing = listingPda(program.programId, supplierPda, lastId);
  const listingAcc: any = await (program.account as any).listing.fetch(listing);
  const statusVariant = pickVariant(listingAcc.status);

  results.push({
    name: 'listing status == Rated',
    pass: statusVariant === 'rated',
    detail: `status=${statusVariant} listing_id=${lastId} pda=${listing.toBase58()}`,
  });

  const purchase = purchasePdaFor(program.programId, listing);
  let purchaseAcc: any = null;
  try {
    purchaseAcc = await (program.account as any).purchase.fetch(purchase);
  } catch (err) {
    results.push({ name: 'purchase exists', pass: false, detail: `fetch failed: ${err}` });
    return results;
  }
  results.push({
    name: 'purchase exists',
    pass: purchaseAcc != null,
    detail: `pda=${purchase.toBase58()}`,
  });
  results.push({
    name: 'purchase.delivered == true',
    pass: purchaseAcc.delivered === true,
    detail: `delivered=${purchaseAcc.delivered} cid=${purchaseAcc.buyerPayloadCid}`,
  });

  const rating = ratingPdaFor(program.programId, purchase);
  let ratingAcc: any = null;
  try {
    ratingAcc = await (program.account as any).rating.fetch(rating);
  } catch (err) {
    results.push({ name: 'rating exists', pass: false, detail: `fetch failed: ${err}` });
    return results;
  }
  results.push({ name: 'rating exists', pass: ratingAcc != null, detail: `pda=${rating.toBase58()}` });
  const verdictVariant = pickVariant(ratingAcc.verdict);
  results.push({
    name: 'rating.verdict == True',
    pass: verdictVariant === 'true',
    detail: `verdict=${verdictVariant}`,
  });

  results.push({
    name: 'supplier.reputation_den incremented by exactly 1',
    pass: ratingDen === baseline.reputationDen + 1n && ratingNum >= baseline.reputationNum,
    detail: `num=${ratingNum} den=${ratingDen} (baseline num=${baseline.reputationNum} den=${baseline.reputationDen})`,
  });

  return results;
}

async function allPass(results: Result[]): Promise<boolean> {
  return results.length > 0 && results.every((r) => r.pass);
}

// ---------- main ----------

async function main(): Promise<number> {
  log('[main] e2e start');

  const supplierKs = loadOrCreateKeystore('supplier');
  const buyerKs = loadOrCreateKeystore('buyer');
  log(`[main] supplier pubkey: ${supplierKs.solana.publicKey.toBase58()}`);
  log(`[main] buyer    pubkey: ${buyerKs.solana.publicKey.toBase58()}`);

  const supplierPda = await ensureRegistered('supplier', supplierKs, 'night-oracle');
  await ensureRegistered('buyer', buyerKs, 'alpha-hunter');

  // Snapshot supplier's pre-run state so assertions can require fresh activity
  // rather than greenlighting on stale terminal state from a prior run.
  const { program: baselineProgram } = makeProgram(supplierKs.solana);
  const baselineAgent: any = await (baselineProgram.account as any).agent.fetch(supplierPda);
  const baseline = {
    listingsCreated: BigInt(baselineAgent.listingsCreated.toString()),
    reputationDen: BigInt(baselineAgent.reputationDen.toString()),
    reputationNum: BigInt(baselineAgent.reputationNum.toString()),
  };
  log(
    `[main] baseline supplier state: listings_created=${baseline.listingsCreated} ` +
      `rep=${baseline.reputationNum}/${baseline.reputationDen} ` +
      `(this run must produce listing_id=${baseline.listingsCreated})`,
  );

  log('[main] spawning supplier + buyer');
  const supplier = spawnAgent('supplier');
  const buyer = spawnAgent('buyer');
  const children = [supplier, buyer];

  const ASSERTION_FLOOR_MS = 30_000;
  const startedAt = Date.now();
  const deadline = startedAt + TIMEOUT_MS;
  let lastResults: Result[] = [];
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    try {
      lastResults = await runAssertions(supplierPda, supplierKs.solana, baseline);
      const elapsed = Date.now() - startedAt;
      if (await allPass(lastResults)) {
        if (elapsed < ASSERTION_FLOOR_MS) {
          log(
            `[main] assertions pass at T+${(elapsed / 1000).toFixed(1)}s but floor is ` +
              `${ASSERTION_FLOOR_MS / 1000}s — continuing to confirm`,
          );
          continue;
        }
        log(`[main] all assertions pass at T+${(elapsed / 1000).toFixed(1)}s — early exit`);
        break;
      }
    } catch (err) {
      log(`[main] assertion check deferred: ${String(err).slice(0, 180)}`);
    }
  }

  log('[main] tearing down children');
  await teardown(children);

  const passed = lastResults.length > 0 && lastResults.every((r) => r.pass);
  log('');
  log('=== assertions ===');
  for (const r of lastResults) {
    log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
  }
  log(`=== total wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
  log(`=== result: ${passed ? 'PASS' : 'FAIL'} ===`);

  await new Promise<void>((r) => logFile.end(() => r()));
  return passed ? 0 : 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log(`[main] FATAL ${String(err)}`);
    process.exit(2);
  },
);
