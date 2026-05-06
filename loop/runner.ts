// loop/runner.ts — continuous-activity orchestrator for Whisper Exchange.
//
// Loops forever (or until SIGINT/SIGTERM):
//   1. Reconstruct 8 keypair files (4 agents × 2 kinds) from Fly secrets to
//      /tmp/keys/ so existing supplier.ts / buyer.ts can read them via
//      AGENT_SOLANA_KEYPAIR / AGENT_X25519_KEYPAIR (absolute paths).
//   2. Check buyer balances; refund alpha-hunter or cipher-rook from
//      night-oracle if either is below threshold. Skip silently if
//      night-oracle itself is too low to cover refunds + buffer.
//   3. Spawn 4 agents (night-oracle, dawn-watcher, alpha-hunter,
//      cipher-rook) using the same env contract as scripts/launch-multi.sh.
//      Stream each child's stdout/stderr to the runner's stdout, prefixed
//      by handle, so Fly's log shipper sees a unified stream.
//   4. Run for SESSION_DURATION_MS, then SIGINT all four. Wait up to
//      SHUTDOWN_GRACE_MS for graceful exit, then SIGTERM stragglers.
//   5. Idle for IDLE_BETWEEN_SESSIONS_MS, then loop.
//
// Designed for a single Fly.io shared-cpu-1x VM, 512MB. The runner's own
// memory footprint is small (~30MB); the four child Node processes do the
// real work.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

// ---------- config ----------

const SESSION_DURATION_MS = parseInt(
  process.env.SESSION_DURATION_MS ?? '1500000',
  10,
); // 25 min default
const IDLE_BETWEEN_SESSIONS_MS = parseInt(
  process.env.IDLE_BETWEEN_SESSIONS_MS ?? '300000',
  10,
); // 5 min default
// Buyer agents commonly take 20-40s to honour SIGINT — not a runner bug:
// @solana/web3.js has its own 429-backoff and confirmation-wait loops that
// don't yield to the agent's stop.flag, and with 4 concurrent agents on a
// shared QuickNode endpoint we routinely hit 429s. 45s grace covers the
// common case; SIGTERM stays as the floor for stragglers and is harmless
// (children exit code 0 on SIGINT, signal=15 on SIGTERM, runner doesn't
// distinguish).
const SHUTDOWN_GRACE_MS = parseInt(
  process.env.SHUTDOWN_GRACE_MS ?? '45000',
  10,
);

const BASE_RPC = process.env.BASE_RPC;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const PROGRAM_ID = process.env.PROGRAM_ID;
const USE_PRIVATE_PURCHASE = process.env.USE_PRIVATE_PURCHASE ?? 'true';

// agents/supplier.ts and agents/buyer.ts both gate-check HELIUS_API_KEY at
// startup even when traffic routes through BASE_RPC (Day 1.5). Boot fails
// without it.
if (!BASE_RPC) die('BASE_RPC env required');
if (!HELIUS_API_KEY) die('HELIUS_API_KEY env required (agents gate-check it)');
if (!PROGRAM_ID) die('PROGRAM_ID env required');

const KEYS_DIR = process.env.KEYS_DIR ?? '/tmp/keys';
const AGENTS_CWD = process.env.AGENTS_CWD ?? '/app/agents';

// Refund thresholds in SOL.
const ALPHA_HUNTER_LOW_SOL = 4;
const ALPHA_HUNTER_REFUND_SOL = 5;
const CIPHER_ROOK_LOW_SOL = 2.5;
const CIPHER_ROOK_REFUND_SOL = 3;
// dawn-watcher is a supplier; it pays ~0.01 SOL rent per listing and earns
// from sales, so the refund is a safety net against extended low-sales
// windows rather than the primary funding model.
const DAWN_WATCHER_LOW_SOL = 2;
const DAWN_WATCHER_REFUND_SOL = 3;
// Reserve kept on night-oracle so it can still pay listing rent + fees.
const REFUND_RESERVE_SOL = 0.5;

interface AgentSpec {
  handle: string;
  role: 'supplier' | 'buyer';
  solanaSecret: string;
  x25519Secret: string;
  extraEnv: Record<string, string>;
}

// Mirrors scripts/launch-multi.sh exactly. Keep in sync if profiles change.
const AGENTS: AgentSpec[] = [
  {
    handle: 'night-oracle',
    role: 'supplier',
    solanaSecret: 'NIGHT_ORACLE_SOLANA',
    x25519Secret: 'NIGHT_ORACLE_X25519',
    extraEnv: {
      AGENT_SIGNAL_CATEGORIES: 'WHALE,MEV',
      AGENT_PRICE_LAMPORTS: '2400000000',
    },
  },
  {
    handle: 'dawn-watcher',
    role: 'supplier',
    solanaSecret: 'DAWN_WATCHER_SOLANA',
    x25519Secret: 'DAWN_WATCHER_X25519',
    extraEnv: {
      AGENT_SIGNAL_CATEGORIES: 'MINT,INSDR,IMBAL',
      AGENT_PRICE_LAMPORTS: '1800000000',
    },
  },
  {
    handle: 'alpha-hunter',
    role: 'buyer',
    solanaSecret: 'ALPHA_HUNTER_SOLANA',
    x25519Secret: 'ALPHA_HUNTER_X25519',
    extraEnv: {
      AGENT_BUY_CATEGORIES: 'WHALE,MEV,IMBAL',
      AGENT_MAX_PRICE_LAMPORTS: '3000000000',
      AGENT_MIN_REPUTATION: '0',
    },
  },
  {
    handle: 'cipher-rook',
    role: 'buyer',
    solanaSecret: 'CIPHER_ROOK_SOLANA',
    x25519Secret: 'CIPHER_ROOK_X25519',
    extraEnv: {
      AGENT_BUY_CATEGORIES: 'MINT,INSDR,WHALE',
      AGENT_MAX_PRICE_LAMPORTS: '2500000000',
      AGENT_MIN_REPUTATION: '8',
    },
  },
];

// ---------- helpers ----------

function log(scope: string, msg: string): void {
  console.log(`[${new Date().toISOString()}] [${scope}] ${msg}`);
}

function die(msg: string): never {
  console.error(`[runner] FATAL: ${msg}`);
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface KeyPaths {
  solana: string;
  x25519: string;
}

function reconstructKeypairsFromSecrets(): Map<string, KeyPaths> {
  mkdirSync(KEYS_DIR, { recursive: true });
  const out = new Map<string, KeyPaths>();
  for (const agent of AGENTS) {
    const solanaJson = process.env[agent.solanaSecret];
    const x25519Json = process.env[agent.x25519Secret];
    if (!solanaJson) die(`secret ${agent.solanaSecret} not set`);
    if (!x25519Json) die(`secret ${agent.x25519Secret} not set`);
    // Validate by parsing — both should be JSON arrays of bytes.
    let parsedSol: unknown;
    let parsedX: unknown;
    try {
      parsedSol = JSON.parse(solanaJson);
    } catch {
      die(`secret ${agent.solanaSecret} is not valid JSON`);
    }
    try {
      parsedX = JSON.parse(x25519Json);
    } catch {
      die(`secret ${agent.x25519Secret} is not valid JSON`);
    }
    if (!Array.isArray(parsedSol) || (parsedSol as unknown[]).length !== 64) {
      die(`secret ${agent.solanaSecret} is not a 64-byte array`);
    }
    if (!Array.isArray(parsedX) || (parsedX as unknown[]).length !== 32) {
      die(`secret ${agent.x25519Secret} is not a 32-byte array`);
    }
    const solanaPath = resolve(KEYS_DIR, `${agent.handle}-solana.json`);
    const x25519Path = resolve(KEYS_DIR, `${agent.handle}-x25519.json`);
    writeFileSync(solanaPath, solanaJson);
    writeFileSync(x25519Path, x25519Json);
    out.set(agent.handle, { solana: solanaPath, x25519: x25519Path });
  }
  log('runner', `reconstructed ${AGENTS.length * 2} keypair files into ${KEYS_DIR}`);
  return out;
}

function pubkeyOfSecret(secretJson: string): PublicKey {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretJson))).publicKey;
}

async function checkBalancesOrRefund(connection: Connection): Promise<void> {
  const nightSecret = process.env.NIGHT_ORACLE_SOLANA!;
  const nightKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(nightSecret)),
  );
  const nightPubkey = nightKeypair.publicKey;
  const dawnPubkey = pubkeyOfSecret(process.env.DAWN_WATCHER_SOLANA!);
  const alphaPubkey = pubkeyOfSecret(process.env.ALPHA_HUNTER_SOLANA!);
  const cipherPubkey = pubkeyOfSecret(process.env.CIPHER_ROOK_SOLANA!);

  const [nightBal, dawnBal, alphaBal, cipherBal] = await Promise.all([
    connection.getBalance(nightPubkey),
    connection.getBalance(dawnPubkey),
    connection.getBalance(alphaPubkey),
    connection.getBalance(cipherPubkey),
  ]);

  log(
    'refund',
    `balances: night-oracle=${(nightBal / LAMPORTS_PER_SOL).toFixed(2)} ` +
      `dawn-watcher=${(dawnBal / LAMPORTS_PER_SOL).toFixed(2)} ` +
      `alpha-hunter=${(alphaBal / LAMPORTS_PER_SOL).toFixed(2)} ` +
      `cipher-rook=${(cipherBal / LAMPORTS_PER_SOL).toFixed(2)} (SOL)`,
  );

  const refunds: { to: PublicKey; sol: number; reason: string }[] = [];
  if (dawnBal < DAWN_WATCHER_LOW_SOL * LAMPORTS_PER_SOL) {
    refunds.push({
      to: dawnPubkey,
      sol: DAWN_WATCHER_REFUND_SOL,
      reason: 'dawn-watcher below threshold (listing rent runway)',
    });
  }
  if (alphaBal < ALPHA_HUNTER_LOW_SOL * LAMPORTS_PER_SOL) {
    refunds.push({
      to: alphaPubkey,
      sol: ALPHA_HUNTER_REFUND_SOL,
      reason: 'alpha-hunter below threshold',
    });
  }
  if (cipherBal < CIPHER_ROOK_LOW_SOL * LAMPORTS_PER_SOL) {
    refunds.push({
      to: cipherPubkey,
      sol: CIPHER_ROOK_REFUND_SOL,
      reason: 'cipher-rook below threshold',
    });
  }

  if (refunds.length === 0) {
    log('refund', 'all buyers above threshold; no refund needed');
    return;
  }

  const totalRefund = refunds.reduce((sum, r) => sum + r.sol, 0);
  if (nightBal < (totalRefund + REFUND_RESERVE_SOL) * LAMPORTS_PER_SOL) {
    log(
      'refund',
      `WARN: night-oracle has ${(nightBal / LAMPORTS_PER_SOL).toFixed(2)} SOL; ` +
        `${totalRefund + REFUND_RESERVE_SOL} SOL needed (refunds + reserve); ` +
        `skipping refunds this cycle`,
    );
    return;
  }

  for (const r of refunds) {
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: nightPubkey,
          toPubkey: r.to,
          lamports: Math.floor(r.sol * LAMPORTS_PER_SOL),
        }),
      );
      const sig = await sendAndConfirmTransaction(connection, tx, [nightKeypair], {
        commitment: 'confirmed',
      });
      log(
        'refund',
        `transferred ${r.sol} SOL → ${r.to.toBase58().slice(0, 8)}… ` +
          `(${r.reason}) tx=${sig.slice(0, 16)}…`,
      );
    } catch (err) {
      log(
        'refund',
        `ERROR refunding ${r.to.toBase58().slice(0, 8)}…: ${String(err).slice(0, 200)}`,
      );
    }
  }
}

interface SessionHandle {
  children: ChildProcess[];
  stop: () => Promise<void>;
}

function streamChild(child: ChildProcess, handle: string): void {
  const prefix = (line: string, stderr = false) => {
    const tag = stderr ? `[${handle}!]` : `[${handle}]`;
    console.log(`${tag} ${line}`);
  };
  if (child.stdout) {
    child.stdout.setEncoding('utf8');
    let buf = '';
    child.stdout.on('data', (chunk: string) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) if (line.length) prefix(line);
    });
    child.stdout.on('end', () => {
      if (buf.length) prefix(buf);
    });
  }
  if (child.stderr) {
    child.stderr.setEncoding('utf8');
    let buf = '';
    child.stderr.on('data', (chunk: string) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) if (line.length) prefix(line, true);
    });
    child.stderr.on('end', () => {
      if (buf.length) prefix(buf, true);
    });
  }
}

function launchAgents(keyPaths: Map<string, KeyPaths>): SessionHandle {
  const children: ChildProcess[] = [];

  for (const agent of AGENTS) {
    const paths = keyPaths.get(agent.handle)!;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AGENT_HANDLE: agent.handle,
      AGENT_SOLANA_KEYPAIR: paths.solana,
      AGENT_X25519_KEYPAIR: paths.x25519,
      USE_PRIVATE_PURCHASE,
      ...agent.extraEnv,
    };
    const child = spawn('npx', ['tsx', `${agent.role}.ts`], {
      cwd: AGENTS_CWD,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    streamChild(child, agent.handle);
    child.on('exit', (code, signal) => {
      log('runner', `${agent.handle} exited code=${code} signal=${signal}`);
    });
    log('runner', `spawned ${agent.handle} (${agent.role}) pid=${child.pid}`);
  }

  return {
    children,
    stop: async () => {
      log('runner', `sending SIGINT to ${children.length} agents`);
      for (const c of children) {
        try {
          c.kill('SIGINT');
        } catch {
          /* noop */
        }
      }
      const deadline = Date.now() + SHUTDOWN_GRACE_MS;
      while (Date.now() < deadline) {
        const alive = children.filter(
          (c) => c.exitCode === null && c.signalCode === null,
        );
        if (alive.length === 0) break;
        await sleep(500);
      }
      const stillAlive = children.filter(
        (c) => c.exitCode === null && c.signalCode === null,
      );
      if (stillAlive.length > 0) {
        log(
          'runner',
          `${stillAlive.length} agent(s) still alive after ${SHUTDOWN_GRACE_MS}ms; sending SIGTERM`,
        );
        for (const c of stillAlive) {
          try {
            c.kill('SIGTERM');
          } catch {
            /* noop */
          }
        }
        await sleep(5_000);
      }
      log('runner', 'all agents stopped');
    },
  };
}

// ---------- main loop ----------

let activeSession: SessionHandle | null = null;
let stopRequested = false;

function installSignalHandlers(): void {
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      log('runner', `${sig} received; winding down`);
      if (stopRequested) {
        // Second signal — force exit.
        log('runner', `${sig} again; forcing exit`);
        process.exit(1);
      }
      stopRequested = true;
      if (activeSession) {
        activeSession
          .stop()
          .catch((err) => log('runner', `stop error: ${err}`))
          .finally(() => process.exit(0));
      } else {
        process.exit(0);
      }
    });
  }
}

async function main(): Promise<void> {
  installSignalHandlers();

  log(
    'runner',
    `boot: SESSION_DURATION_MS=${SESSION_DURATION_MS} ` +
      `IDLE_BETWEEN_SESSIONS_MS=${IDLE_BETWEEN_SESSIONS_MS} ` +
      `USE_PRIVATE_PURCHASE=${USE_PRIVATE_PURCHASE} ` +
      `BASE_RPC=${BASE_RPC!.replace(/\/[^/]*$/, '/…')}`,
  );

  const connection = new Connection(BASE_RPC!, 'confirmed');
  const keyPaths = reconstructKeypairsFromSecrets();

  let cycle = 0;
  while (!stopRequested) {
    cycle += 1;
    log('runner', `--- cycle ${cycle} begin ---`);

    try {
      await checkBalancesOrRefund(connection);
    } catch (err) {
      log('runner', `balance check failed: ${String(err).slice(0, 200)}; continuing`);
    }

    activeSession = launchAgents(keyPaths);
    log('runner', `session live; running for ${SESSION_DURATION_MS / 1000}s`);

    const sessionStart = Date.now();
    while (Date.now() - sessionStart < SESSION_DURATION_MS && !stopRequested) {
      await sleep(5_000);
      const alive = activeSession.children.filter(
        (c) => c.exitCode === null && c.signalCode === null,
      );
      if (alive.length === 0) {
        log('runner', 'all agents exited unexpectedly; ending session early');
        break;
      }
    }

    if (activeSession) {
      await activeSession.stop();
      activeSession = null;
    }

    log('runner', `--- cycle ${cycle} end ---`);
    if (stopRequested) break;

    log('runner', `idle for ${IDLE_BETWEEN_SESSIONS_MS / 1000}s before next cycle`);
    await sleep(IDLE_BETWEEN_SESSIONS_MS);
  }

  log('runner', 'main loop exited cleanly');
  process.exit(0);
}

main().catch((err) => {
  log('runner', `FATAL in main: ${String(err)}`);
  process.exit(1);
});
