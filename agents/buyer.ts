// Buyer agent — scans the order book, purchases privately, decrypts the
// delivered payload, verifies the supplier's commitment, and rates the tip
// after a 30-second outcome window.
//
// Three independent loops + a feed consumer, all driven by Promise.all.
// None blocks another — every await yields the event loop.
//
//   Loop 1 (scan):     program.account.listing.all() every 2s, applies
//                      purchase rule, calls purchase_listing.
//   Loop 2 (delivery): every 2s, fetches own Purchase accounts, decrypts
//                      delivered payloads, verifies sha256 commitment.
//   Loop 3 (rating):   every 2s, walks open outcome windows; when the
//                      window has closed AND a matching resolution event
//                      has arrived, calls submit_rating.
//   Feed consumer:     sinks MockFeed resolution events into a map keyed
//                      by signal_id, used by Loop 3.
//
// DRY_RUN=1 skips all chain calls; the feed consumer + timers still run
// so the demo clock can be verified.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import {
  AnchorProvider,
  Program,
  Wallet,
  web3,
} from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';

import { x25519 } from '@noble/curves/ed25519';

import { canonicalize, commit, openSealed, toHex } from './crypto.ts';
import { fetchAllSafe } from './anchor-helpers.ts';
import { MockFeed, type FeedEvent, type Resolution, type SignalCategory, type Verdict } from './signals.ts';

loadDotenv();

// ---------- config ----------

const DRY_RUN = process.env.DRY_RUN === '1';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
if (!DRY_RUN && !HELIUS_API_KEY) {
  console.error(
    '[buyer] FATAL: HELIUS_API_KEY env var is required. Get one at https://dashboard.helius.dev/ and put it in agents/.env',
  );
  process.exit(1);
}
const RPC_URL = `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY ?? ''}`;
const HANDLE = process.env.BUYER_HANDLE ?? 'alpha-hunter';
const PAYLOADS_DIR = resolve('payloads');
const KEYSTORE_DIR = resolve('keys');

const SCAN_POLL_MS = 2_000;
const DELIVERY_POLL_MS = 2_000;
const RATING_POLL_MS = 2_000;
const OUTCOME_WINDOW_MS = 30_000;

const BUYER_MAX_PRICE_LAMPORTS = BigInt(
  Math.round(Number(process.env.BUYER_MAX_PRICE ?? '6') * 1_000_000_000),
);
const MIN_REP = Number(process.env.MIN_REP ?? '0.5');
const BUYER_CATEGORIES = new Set<SignalCategory>(
  (process.env.BUYER_CATEGORIES?.split(',').map((s) => s.trim().toUpperCase()) as SignalCategory[]) ??
    ['WHALE', 'MEV', 'MINT', 'IMBAL', 'INSDR', 'BRIDGE'],
);

// ---------- logging ----------

function log(event: string, fields: Record<string, unknown> = {}): void {
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${fmt(v)}`);
  const ts = new Date().toISOString();
  console.log(`${ts} [buyer] ${event}${parts.length ? ' ' + parts.join(' ') : ''}`);
}

function logJson(kind: string, payload: unknown): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), actor: 'buyer', kind, payload }));
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
  const solPath = resolve(KEYSTORE_DIR, 'buyer-solana.json');
  const xPath = resolve(KEYSTORE_DIR, 'buyer-x25519.json');

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
  connection: web3.Connection;
  program: Program<Idl>;
  provider: AnchorProvider;
  programId: web3.PublicKey;
  wallet: Wallet;
}

async function setupChain(solana: web3.Keypair): Promise<Chain> {
  const connection = new web3.Connection(RPC_URL, 'confirmed');
  const wallet = new Wallet(solana);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const idl = JSON.parse(
    readFileSync(resolve('..', 'target', 'idl', 'whisper.json'), 'utf8'),
  ) as Idl;
  const program = new Program(idl, provider);
  return { connection, program, provider, programId: program.programId, wallet };
}

function agentPda(programId: web3.PublicKey, authority: web3.PublicKey): [web3.PublicKey, number] {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('agent'), authority.toBuffer()],
    programId,
  );
}

function purchasePda(programId: web3.PublicKey, listing: web3.PublicKey): [web3.PublicKey, number] {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('purchase'), listing.toBuffer()],
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
  const sig = await (chain.program.methods as any)
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

// ---------- shared state ----------

interface OpenPurchase {
  purchasePda: web3.PublicKey;
  listingPda: web3.PublicKey;
  signalId: string;
  windowOpenedAt: number;
  decryptedAt: number;
  supplierAgentPda: web3.PublicKey;
}

interface State {
  purchasedListings: Set<string>;
  ratedPurchases: Set<string>;
  openPurchases: Map<string, OpenPurchase>; // key = purchasePda.toBase58()
  resolutions: Map<string, Resolution>; // key = signal_id
  stop: { flag: boolean };
}

// ---------- retry helper ----------

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<any> {
  try {
    return await fn();
  } catch (err) {
    log('RPC_RETRY', { label, err: shorten(String(err)) });
    await sleep(1_000);
    return await fn();
  }
}

function shorten(s: string): string {
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
}

// ---------- loop 1: listing scanner ----------

async function listingScanner(ctx: {
  chain: Chain | null;
  buyerPda: web3.PublicKey | null;
  state: State;
}): Promise<void> {
  if (!ctx.chain || !ctx.buyerPda) {
    log('LISTING_SCANNER_DRY_RUN');
    while (!ctx.state.stop.flag) await sleep(SCAN_POLL_MS);
    return;
  }

  while (!ctx.state.stop.flag) {
    try {
      await scanOnce(ctx.chain, ctx.buyerPda, ctx.state);
    } catch (err) {
      log('SCAN_ERROR', { err: shorten(String(err)) });
    }
    await sleep(SCAN_POLL_MS);
  }
  log('LISTING_SCANNER_DONE');
}

async function scanOnce(chain: Chain, buyerPda: web3.PublicKey, state: State): Promise<void> {
  const { results: listings, skipped: listingsSkipped } = await withRetry(
    () => fetchAllSafe<any>(chain.program, 'Listing'),
    'listing.all',
  );
  if (listingsSkipped > 0) {
    log('LISTINGS_FILTERED', { skipped: listingsSkipped });
  }

  for (const { publicKey: listingPda, account: listing } of listings) {
    const key = listingPda.toBase58();
    if (state.purchasedListings.has(key)) continue;
    if (!isActive(listing.status)) continue;

    const category = parseCategory(listing.category);
    if (!category || !BUYER_CATEGORIES.has(category)) continue;

    const priceLamports = BigInt(listing.priceLamports.toString());
    if (priceLamports >= BUYER_MAX_PRICE_LAMPORTS) continue;

    const supplierAgent = await withRetry(
      () => (chain.program.account as any).agent.fetch(listing.supplier),
      'agent.fetch(supplier)',
    );
    const den = BigInt(supplierAgent.reputationDen.toString());
    const num = BigInt(supplierAgent.reputationNum.toString());
    if (den > 0n) {
      const rep = Number(num) / Number(den);
      if (rep < MIN_REP) {
        log('SCAN_SKIP_LOW_REP', { listing: key, rep });
        continue;
      }
    }

    log('PURCHASE_RULE_MATCH', {
      listing: key,
      category,
      price_lamports: priceLamports,
      supplier_rep_den: den,
    });

    await purchase(chain, buyerPda, listingPda, listing, state);
  }
}

async function purchase(
  chain: Chain,
  buyerPda: web3.PublicKey,
  listingPda: web3.PublicKey,
  listing: any,
  state: State,
): Promise<void> {
  const key = listingPda.toBase58();
  state.purchasedListings.add(key); // optimistic — re-check on-chain below

  const fresh = await withRetry(
    () => (chain.program.account as any).listing.fetch(listingPda),
    'listing.fetch(recheck)',
  );
  if (!isActive(fresh.status)) {
    log('PURCHASE_SKIP_RACE', { listing: key });
    return;
  }

  const supplierAgent = await withRetry(
    () => (chain.program.account as any).agent.fetch(listing.supplier),
    'agent.fetch(supplier)',
  );

  const [purchase] = purchasePda(chain.programId, listingPda);

  try {
    const sig = await withRetry(
      () =>
        (chain.program.methods as any)
          .purchaseListingPublic()
          .accounts({
            listing: listingPda,
            purchase,
            buyerAgent: buyerPda,
            supplierAgent: listing.supplier,
            supplierAuthority: supplierAgent.authority,
            authority: chain.wallet.publicKey,
            systemProgram: web3.SystemProgram.programId,
          })
          .rpc(),
      'purchase_listing_public',
    );

    log('LISTING_PURCHASED', {
      listing: key,
      purchase: purchase.toBase58(),
      tx: sig,
    });
  } catch (err) {
    state.purchasedListings.delete(key); // allow retry next scan
    log('PURCHASE_FAILED', { listing: key, err: shorten(String(err)) });
  }
}

function isActive(status: any): boolean {
  return typeof status === 'object' && status !== null && 'active' in status;
}

function isRated(status: any): boolean {
  return typeof status === 'object' && status !== null && 'rated' in status;
}

function parseCategory(category: any): SignalCategory | null {
  if (typeof category !== 'object' || category === null) return null;
  const key = Object.keys(category)[0]?.toUpperCase();
  if (!key) return null;
  const valid: SignalCategory[] = ['WHALE', 'MEV', 'MINT', 'IMBAL', 'INSDR', 'BRIDGE'];
  return valid.includes(key as SignalCategory) ? (key as SignalCategory) : null;
}

// ---------- loop 2: delivery watcher ----------

async function deliveryWatcher(ctx: {
  chain: Chain | null;
  buyerPda: web3.PublicKey | null;
  x25519Priv: Uint8Array;
  state: State;
}): Promise<void> {
  if (!ctx.chain || !ctx.buyerPda) {
    log('DELIVERY_WATCHER_DRY_RUN');
    while (!ctx.state.stop.flag) await sleep(DELIVERY_POLL_MS);
    return;
  }

  while (!ctx.state.stop.flag) {
    try {
      await deliveryOnce(ctx.chain, ctx.buyerPda, ctx.x25519Priv, ctx.state);
    } catch (err) {
      log('DELIVERY_POLL_ERROR', { err: shorten(String(err)) });
    }
    await sleep(DELIVERY_POLL_MS);
  }
  log('DELIVERY_WATCHER_DONE');
}

async function deliveryOnce(
  chain: Chain,
  buyerPda: web3.PublicKey,
  x25519Priv: Uint8Array,
  state: State,
): Promise<void> {
  const { results: purchases, skipped: purchasesSkipped } = await withRetry(
    () => fetchAllSafe<any>(chain.program, 'Purchase'),
    'purchase.all',
  );
  if (purchasesSkipped > 0) {
    log('PURCHASES_FILTERED', { skipped: purchasesSkipped });
  }

  for (const { publicKey: purchasePdaKey, account: purchase } of purchases) {
    if (!purchase.buyer.equals(buyerPda)) continue;
    if (!purchase.delivered) continue;
    const key = purchasePdaKey.toBase58();
    if (state.openPurchases.has(key) || state.ratedPurchases.has(key)) continue;

    const listing = await withRetry(
      () => (chain.program.account as any).listing.fetch(purchase.listing),
      'listing.fetch(delivery)',
    );

    const cid: string = purchase.buyerPayloadCid;
    const localName = cid.startsWith('local://') ? cid.slice('local://'.length) : null;
    if (!localName) {
      log('DELIVERY_UNSUPPORTED_CID', { purchase: key, cid });
      continue;
    }
    const ciphertextPath = resolve(PAYLOADS_DIR, localName);
    if (!existsSync(ciphertextPath)) {
      log('DELIVERY_MISSING_CIPHERTEXT', { purchase: key, path: ciphertextPath });
      continue;
    }

    const ciphertext = new Uint8Array(readFileSync(ciphertextPath));
    let plaintext: Uint8Array;
    try {
      plaintext = openSealed(x25519Priv, ciphertext);
    } catch (err) {
      log('DELIVERY_DECRYPT_FAILED', { purchase: key, err: shorten(String(err)) });
      continue;
    }

    // commitment check — buyer refuses to rate on mismatch
    const expected = Uint8Array.from(listing.payloadCommitment);
    const payloadObj = JSON.parse(new TextDecoder().decode(plaintext));
    const actual = commit(payloadObj);
    if (!equalBytes(expected, actual)) {
      log('COMMITMENT_MISMATCH', {
        purchase: key,
        expected: expected,
        actual: actual,
      });
      state.ratedPurchases.add(key); // refuse to rate this one, never revisit
      continue;
    }

    logJson('payload_decrypted', {
      purchase: key,
      listing: purchase.listing.toBase58(),
      signal_id: payloadObj.signal_id,
      payload: payloadObj,
    });

    state.openPurchases.set(key, {
      purchasePda: purchasePdaKey,
      listingPda: purchase.listing,
      signalId: String(payloadObj.signal_id ?? ''),
      windowOpenedAt: Date.now(),
      decryptedAt: Date.now(),
      supplierAgentPda: listing.supplier,
    });

    log('OUTCOME_WINDOW_OPENED', {
      purchase: key,
      signal_id: payloadObj.signal_id,
      window_ms: OUTCOME_WINDOW_MS,
    });

    // canonicalize for parity with supplier's commit()
    void canonicalize; // re-exported but implicit via commit(); silence unused
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------- loop 3: rating dispatcher ----------

async function ratingDispatcher(ctx: {
  chain: Chain | null;
  buyerPda: web3.PublicKey | null;
  state: State;
}): Promise<void> {
  while (!ctx.state.stop.flag) {
    try {
      await ratingTick(ctx.chain, ctx.buyerPda, ctx.state);
    } catch (err) {
      log('RATING_TICK_ERROR', { err: shorten(String(err)) });
    }
    await sleep(RATING_POLL_MS);
  }
  log('RATING_DISPATCHER_DONE');
}

async function ratingTick(
  chain: Chain | null,
  buyerPda: web3.PublicKey | null,
  state: State,
): Promise<void> {
  const now = Date.now();
  for (const [key, open] of state.openPurchases) {
    if (state.ratedPurchases.has(key)) continue;
    if (now - open.windowOpenedAt < OUTCOME_WINDOW_MS) continue;

    const resolution = state.resolutions.get(open.signalId);
    if (!resolution) continue;

    if (!chain || !buyerPda) {
      log('RATING_DRY_RUN', {
        purchase: key,
        signal_id: open.signalId,
        verdict: resolution.verdict,
      });
      state.ratedPurchases.add(key);
      continue;
    }

    // re-check on-chain status before submitting
    const listing = await withRetry(
      () => (chain.program.account as any).listing.fetch(open.listingPda),
      'listing.fetch(pre-rate)',
    );
    if (isRated(listing.status)) {
      state.ratedPurchases.add(key);
      continue;
    }

    try {
      const [rating] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from('rating'), open.purchasePda.toBuffer()],
        chain.programId,
      );
      const sig = await withRetry(
        () =>
          (chain.program.methods as any)
            .submitRating(toAnchorVerdict(resolution.verdict))
            .accounts({
              purchase: open.purchasePda,
              listing: open.listingPda,
              rating,
              supplierAgent: open.supplierAgentPda,
              buyerAgent: buyerPda,
              authority: chain.wallet.publicKey,
              systemProgram: web3.SystemProgram.programId,
            })
            .rpc(),
        'submit_rating',
      );

      log('RATING_SUBMITTED', {
        purchase: key,
        signal_id: open.signalId,
        verdict: resolution.verdict,
        tx: sig,
      });
      state.ratedPurchases.add(key);
    } catch (err) {
      log('RATING_FAILED', { purchase: key, err: shorten(String(err)) });
    }
  }
}

function toAnchorVerdict(v: Verdict): Record<string, Record<string, never>> {
  if (v === 'True') return { true: {} };
  if (v === 'False') return { false: {} };
  return { partial: {} };
}

// ---------- feed consumer ----------

async function feedConsumer(feed: AsyncIterable<FeedEvent>, state: State): Promise<void> {
  for await (const event of feed) {
    if (event.kind === 'resolution') {
      state.resolutions.set(event.resolution.signal_id, event.resolution);
      log('RESOLUTION_RECEIVED', {
        signal_id: event.resolution.signal_id,
        verdict: event.resolution.verdict,
      });
    } else {
      log('FEED_SIGNAL_OBSERVED', { signal_id: event.signal.id });
    }
  }
  log('FEED_CONSUMER_DONE');
}

// ---------- main ----------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  log('STARTUP', { dry_run: DRY_RUN, rpc: DRY_RUN ? '(skipped)' : RPC_URL });

  const keystore = loadOrCreateKeystore();
  log('KEYS_LOADED', {
    solana: keystore.solana.publicKey.toBase58(),
    x25519: toHex(keystore.x25519Pub).slice(0, 16) + '…',
  });

  mkdirSync(PAYLOADS_DIR, { recursive: true });

  let chain: Chain | null = null;
  let buyerPda: web3.PublicKey | null = null;
  if (!DRY_RUN) {
    chain = await setupChain(keystore.solana);
    buyerPda = await ensureRegistered(chain, keystore.x25519Pub);
  }

  const feed = new MockFeed();
  const state: State = {
    purchasedListings: new Set(),
    ratedPurchases: new Set(),
    openPurchases: new Map(),
    resolutions: new Map(),
    stop: { flag: false },
  };

  const shutdown = () => {
    log('SHUTDOWN_REQUESTED');
    state.stop.flag = true;
    feed.stop();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await Promise.all([
    listingScanner({ chain, buyerPda, state }),
    deliveryWatcher({ chain, buyerPda, x25519Priv: keystore.x25519Priv, state }),
    ratingDispatcher({ chain, buyerPda, state }),
    feedConsumer(feed.start(), state),
  ]);

  log('EXIT');
}

main().catch((err) => {
  log('FATAL', { err: String(err) });
  process.exit(1);
});
