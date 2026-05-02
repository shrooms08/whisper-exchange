// Supplier agent — detects signals, seals tips, publishes listings, and
// delivers re-encrypted payloads to buyers.
//
// Two independent loops run concurrently via Promise.all:
//   Loop A (signal):   consumes the SignalFeed async iterator → create_listing
//   Loop B (delivery): every POLL_MS, scans own Purchases where !delivered
//                      → re-encrypt to buyer → deliver_payload
//
// Neither loop blocks the other: Loop A awaits the feed iterator; Loop B
// awaits a setTimeout. Both run in the same event-loop thread but yield on
// every await, so a slow RPC in one does not delay the other's cadence.
//
// Set DRY_RUN=1 to skip all on-chain calls (useful for demo prep and for
// verifying the signal → payload → commitment → local-file path without
// a deployed program).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import {
  AnchorProvider,
  BN,
  Program,
  Wallet,
  web3,
} from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';

import { x25519 } from '@noble/curves/ed25519';

import { commit, openSealed, sealTo, toHex } from './crypto.ts';
import { fetchAllSafe } from './anchor-helpers.ts';
import { MockFeed, type FeedEvent, type Signal, type SignalCategory } from './signals.ts';

loadDotenv();

// ---------- config ----------

const DRY_RUN = process.env.DRY_RUN === '1';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
if (!DRY_RUN && !HELIUS_API_KEY) {
  console.error(
    '[supplier] FATAL: HELIUS_API_KEY env var is required. Get one at https://dashboard.helius.dev/ and put it in agents/.env',
  );
  process.exit(1);
}
const BASE_RPC =
  process.env.BASE_RPC ?? `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY ?? ''}`;
const ER_RPC = process.env.ER_RPC ?? 'https://devnet.magicblock.app/';
const HANDLE = process.env.SUPPLIER_HANDLE ?? 'night-oracle';
const PAYLOADS_DIR = resolve('payloads');
const KEYSTORE_DIR = resolve('keys');
const TTL_SLOTS = 200n;
const DELIVERY_POLL_MS = 3_000;

// Frontier track — when true, supplier polls the webhook receiver for
// real Helius-derived whale signals instead of running the scripted mock.
// Defaults to false so cold E2E reproducibility is preserved.
const USE_REAL_SIGNALS = process.env.USE_REAL_SIGNALS === 'true';
const RECEIVER_URL = process.env.RECEIVER_URL ?? 'http://localhost:4000';
const REAL_POLL_MS = 5_000;
const REAL_POLL_BACKOFF_MS = 30_000;
const RECEIVER_UNREACHABLE_THRESHOLD = 6; // consecutive errors → backoff

// Test-mode helper: when true, the real-signal loop creates exactly one
// listing then idles. Used by the cold E2E harness, which assumes a
// single-listing-per-run cadence inherited from the mock feed. In normal
// operation (demo / dashboard), leave false — supplier should create one
// listing per qualifying whale.
const HALT_AFTER_FIRST_LISTING = process.env.HALT_AFTER_FIRST_LISTING === 'true';

// Hardcoded price table (SOL). Matches the design mock for the dashboard order book.
const PRICES_SOL: Record<SignalCategory, number> = {
  WHALE: 2.4,
  IMBAL: 0.8,
  MINT: 1.2,
  MEV: 5.8,
  INSDR: 11.0,
  BRIDGE: 3.3,
};

const LAMPORTS_PER_SOL = 1_000_000_000;

// ---------- logging ----------

function log(event: string, fields: Record<string, unknown> = {}): void {
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${fmt(v)}`);
  const ts = new Date().toISOString();
  console.log(`${ts} [supplier] ${event}${parts.length ? ' ' + parts.join(' ') : ''}`);
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Uint8Array) return toHex(v).slice(0, 16) + '…';
  return JSON.stringify(v);
}

// ---------- keystore ----------

interface Keystore {
  solana: web3.Keypair;
  x25519Priv: Uint8Array;
  x25519Pub: Uint8Array;
}

function loadOrCreateKeystore(): Keystore {
  mkdirSync(KEYSTORE_DIR, { recursive: true });
  const solPath = resolve(KEYSTORE_DIR, 'supplier-solana.json');
  const xPath = resolve(KEYSTORE_DIR, 'supplier-x25519.json');

  let solana: web3.Keypair;
  if (existsSync(solPath)) {
    solana = web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(solPath, 'utf8'))));
  } else {
    solana = web3.Keypair.generate();
    writeFileSync(solPath, JSON.stringify(Array.from(solana.secretKey)));
  }

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

// ---------- chain ----------

interface Chain {
  // Base layer (source of truth for all reads + supplier instructions).
  connection: web3.Connection;
  programBase: Program<Idl>;
  provider: AnchorProvider;
  // Ephemeral rollup. Supplier doesn't currently use the ER (delivery + create
  // run on base; Purchase only becomes visible post-commit), but kept here
  // for symmetry with buyer.ts and as cheap insurance for future hardening.
  erConnection: web3.Connection;
  programEr: Program<Idl>;
  // Shared.
  programId: web3.PublicKey;
  wallet: Wallet;
}

async function setupChain(solana: web3.Keypair): Promise<Chain> {
  const connection = new web3.Connection(BASE_RPC, 'confirmed');
  const erConnection = new web3.Connection(ER_RPC, 'confirmed');
  const wallet = new Wallet(solana);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const erProvider = new AnchorProvider(erConnection, wallet, { commitment: 'confirmed' });
  const idl = JSON.parse(
    readFileSync(resolve('..', 'target', 'idl', 'whisper.json'), 'utf8'),
  ) as Idl;
  const programBase = new Program(idl, provider);
  const programEr = new Program(idl, erProvider);
  return {
    connection,
    programBase,
    provider,
    erConnection,
    programEr,
    programId: programBase.programId,
    wallet,
  };
}

function agentPda(programId: web3.PublicKey, authority: web3.PublicKey): [web3.PublicKey, number] {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('agent'), authority.toBuffer()],
    programId,
  );
}

function listingPda(
  programId: web3.PublicKey,
  supplierAgent: web3.PublicKey,
  listingId: bigint,
): [web3.PublicKey, number] {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(listingId);
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('listing'), supplierAgent.toBuffer(), idBuf],
    programId,
  );
}

async function ensureRegistered(chain: Chain, x25519Pub: Uint8Array): Promise<web3.PublicKey> {
  const [pda] = agentPda(chain.programId, chain.wallet.publicKey);
  const existing = await chain.connection.getAccountInfo(pda);
  if (existing) {
    log('AGENT_EXISTS', { pda: pda.toBase58() });
    return pda;
  }

  log('REGISTERING_AGENT', { handle: HANDLE, pda: pda.toBase58() });
  const sig = await (chain.programBase.methods as any)
    .registerAgent(HANDLE, Array.from(x25519Pub))
    .accounts({
      agent: pda,
      authority: chain.wallet.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();
  log('AGENT_REGISTERED', { tx: sig });
  return pda;
}

// ---------- signal loop ----------

async function signalLoop(
  feed: AsyncIterable<FeedEvent>,
  ctx: {
    chain: Chain | null;
    supplierPda: web3.PublicKey | null;
    x25519Pub: Uint8Array;
  },
): Promise<void> {
  let localCounter = 0n;

  for await (const event of feed) {
    if (event.kind !== 'signal') continue;
    await handleSignal(event.signal, 'mock', ctx, localCounter);
    localCounter += 1n;
  }
  log('SIGNAL_LOOP_DONE');
}

// Real-source loop — polls the webhook receiver for Helius-normalized signals.
// Runs in place of signalLoop when USE_REAL_SIGNALS=true. Same downstream
// evaluator (handleSignal) — only the source changes.
async function realSignalLoop(
  ctx: {
    chain: Chain | null;
    supplierPda: web3.PublicKey | null;
    x25519Pub: Uint8Array;
    stop: { flag: boolean };
  },
): Promise<void> {
  log('REAL_SIGNAL_LOOP_STARTED', { receiver_url: RECEIVER_URL });
  let localCounter = 0n;
  let consecutiveErrors = 0;
  let backoff = false;

  while (!ctx.stop.flag) {
    try {
      const res = await fetch(`${RECEIVER_URL}/signals/next`);
      if (res.status === 200) {
        const sig = (await res.json()) as Signal;
        log('SIGNAL_RECEIVED', { source: 'helius', id: sig.id });
        consecutiveErrors = 0;
        if (backoff) {
          log('RECEIVER_RECOVERED');
          backoff = false;
        }
        await handleSignal(sig, 'helius', ctx, localCounter);
        localCounter += 1n;
        if (HALT_AFTER_FIRST_LISTING) {
          log('HALT_AFTER_FIRST_LISTING_REACHED', { listings: localCounter.toString() });
          while (!ctx.stop.flag) await sleep(REAL_POLL_BACKOFF_MS);
          break;
        }
      } else if (res.status === 204) {
        consecutiveErrors = 0;
        if (backoff) {
          log('RECEIVER_RECOVERED');
          backoff = false;
        }
      } else {
        consecutiveErrors += 1;
        log('RECEIVER_FETCH_ERROR', { status: res.status, reason: 'unexpected_status' });
      }
    } catch (err) {
      consecutiveErrors += 1;
      log('RECEIVER_FETCH_ERROR', { reason: String(err).slice(0, 120) });
    }

    if (!backoff && consecutiveErrors >= RECEIVER_UNREACHABLE_THRESHOLD) {
      log('RECEIVER_UNREACHABLE_30S', { consecutive_errors: consecutiveErrors });
      backoff = true;
    }

    await sleep(backoff ? REAL_POLL_BACKOFF_MS : REAL_POLL_MS);
  }
  log('REAL_SIGNAL_LOOP_DONE');
}

async function handleSignal(
  signal: Signal,
  source: 'mock' | 'helius',
  ctx: { chain: Chain | null; supplierPda: web3.PublicKey | null; x25519Pub: Uint8Array },
  localCounter: bigint,
): Promise<void> {
  log('SIGNAL_DETECTED', { source, id: signal.id, category: signal.category });

  const payload = {
    signal_id: signal.id,
    category: signal.category,
    signal_ref: signal.signal_ref,
    claim: signal.claim,
    evidence: signal.evidence,
    recommended_action: signal.recommended_action,
  };
  const commitment = commit(payload);
  const ciphertext = sealTo(ctx.x25519Pub, new TextEncoder().encode(JSON.stringify(payload)));

  const listingId = ctx.chain && ctx.supplierPda
    ? await fetchListingsCreated(ctx.chain, ctx.supplierPda)
    : localCounter;

  mkdirSync(PAYLOADS_DIR, { recursive: true });
  const ciphertextPath = resolve(PAYLOADS_DIR, `L-${listingId}.bin`);
  writeFileSync(ciphertextPath, ciphertext);
  const cid = `local://L-${listingId}.bin`;

  const priceLamports = BigInt(Math.round(PRICES_SOL[signal.category] * LAMPORTS_PER_SOL));

  log('PAYLOAD_SEALED', {
    source,
    listing_id: listingId,
    commitment: commitment,
    cid,
    ciphertext_bytes: ciphertext.length,
  });

  if (!ctx.chain || !ctx.supplierPda) {
    log('LISTING_CREATED_DRY_RUN', {
      source,
      signal_id: signal.id,
      listing_id: listingId,
      category: signal.category,
      price_sol: PRICES_SOL[signal.category],
    });
    return;
  }

  const [listing] = listingPda(ctx.chain.programId, ctx.supplierPda, listingId);
  const currentSlot = BigInt(await ctx.chain.connection.getSlot('confirmed'));
  const ttlSlot = currentSlot + TTL_SLOTS;

  const sig = await (ctx.chain.programBase.methods as any)
    .createListing(
      new BN(listingId.toString()),
      { [signal.category.toLowerCase()]: {} },
      new BN(priceLamports.toString()),
      Array.from(commitment),
      cid,
      new BN(ttlSlot.toString()),
    )
    .accounts({
      supplierAgent: ctx.supplierPda,
      listing,
      authority: ctx.chain.wallet.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  log('LISTING_CREATED', {
    source,
    signal_id: signal.id,
    listing_id: listingId,
    listing_pda: listing.toBase58(),
    price_lamports: priceLamports,
    ttl_slot: ttlSlot,
    tx: sig,
  });
}

async function fetchListingsCreated(chain: Chain, supplierPda: web3.PublicKey): Promise<bigint> {
  const agent = await (chain.programBase.account as any).agent.fetch(supplierPda);
  return BigInt(agent.listingsCreated.toString());
}

// ---------- delivery loop ----------

async function deliveryLoop(ctx: {
  chain: Chain | null;
  supplierPda: web3.PublicKey | null;
  x25519Priv: Uint8Array;
  x25519Pub: Uint8Array;
  stop: { flag: boolean };
}): Promise<void> {
  if (!ctx.chain || !ctx.supplierPda) {
    log('DELIVERY_LOOP_DRY_RUN');
    while (!ctx.stop.flag) {
      await sleep(DELIVERY_POLL_MS);
    }
    return;
  }

  while (!ctx.stop.flag) {
    try {
      await pollAndDeliver(ctx.chain, ctx.supplierPda, ctx.x25519Priv);
    } catch (err) {
      log('DELIVERY_POLL_ERROR', { err: String(err) });
    }
    await sleep(DELIVERY_POLL_MS);
  }
  log('DELIVERY_LOOP_DONE');
}

async function pollAndDeliver(
  chain: Chain,
  supplierPda: web3.PublicKey,
  x25519Priv: Uint8Array,
): Promise<void> {
  const { results: purchases, skipped: purchasesSkipped } = await fetchAllSafe<any>(
    chain.programBase,
    'Purchase',
  );
  if (purchasesSkipped > 0) {
    log('PURCHASES_FILTERED', { skipped: purchasesSkipped });
  }
  for (const { publicKey: purchasePda, account: purchase } of purchases) {
    if (purchase.delivered) continue;

    const listing = await (chain.programBase.account as any).listing.fetch(purchase.listing);
    if (!listing.supplier.equals(supplierPda)) continue;

    const buyerAgent = await (chain.programBase.account as any).agent.fetch(purchase.buyer);

    const listingId = BigInt(listing.listingId.toString());
    const ciphertextSelfPath = resolve(PAYLOADS_DIR, `L-${listingId}.bin`);
    if (!existsSync(ciphertextSelfPath)) {
      log('DELIVERY_SKIP_MISSING_SOURCE', { listing_id: listingId });
      continue;
    }

    const ciphertextSelf = readFileSync(ciphertextSelfPath);
    const plaintext = openSealed(x25519Priv, new Uint8Array(ciphertextSelf));
    const ciphertextBuyer = sealTo(Uint8Array.from(buyerAgent.pubkeyX25519), plaintext);

    const buyerCid = `local://P-${listingId}.bin`;
    writeFileSync(resolve(PAYLOADS_DIR, `P-${listingId}.bin`), ciphertextBuyer);

    const sig = await (chain.programBase.methods as any)
      .deliverPayload(buyerCid)
      .accounts({
        purchase: purchasePda,
        listing: purchase.listing,
        supplierAgent: supplierPda,
        authority: chain.wallet.publicKey,
      })
      .rpc();

    log('PAYLOAD_DELIVERED', {
      listing_id: listingId,
      buyer_cid: buyerCid,
      tx: sig,
    });
  }
}

// ---------- main ----------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  log('STARTUP', {
    dry_run: DRY_RUN,
    base_rpc: DRY_RUN ? '(skipped)' : BASE_RPC,
    er_rpc: DRY_RUN ? '(skipped)' : ER_RPC,
    use_real_signals: USE_REAL_SIGNALS,
  });

  const keystore = loadOrCreateKeystore();
  log('KEYS_LOADED', {
    solana: keystore.solana.publicKey.toBase58(),
    x25519: toHex(keystore.x25519Pub).slice(0, 16) + '…',
  });

  let chain: Chain | null = null;
  let supplierPda: web3.PublicKey | null = null;
  if (!DRY_RUN) {
    chain = await setupChain(keystore.solana);
    supplierPda = await ensureRegistered(chain, keystore.x25519Pub);
  }

  const feed = new MockFeed();
  const stop = { flag: false };
  const shutdown = () => {
    log('SHUTDOWN_REQUESTED');
    stop.flag = true;
    feed.stop();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  const ctx = {
    chain,
    supplierPda,
    x25519Priv: keystore.x25519Priv,
    x25519Pub: keystore.x25519Pub,
    stop,
  };

  const signalTask = USE_REAL_SIGNALS
    ? realSignalLoop(ctx)
    : signalLoop(feed.start(), ctx);

  await Promise.all([signalTask, deliveryLoop(ctx)]);

  log('EXIT');
}

main().catch((err) => {
  log('FATAL', { err: String(err) });
  process.exit(1);
});
