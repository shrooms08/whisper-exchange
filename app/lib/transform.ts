// Pure transformers: raw on-chain accounts → wireframe-ready shapes.
// No Anchor / web3 / process imports here so this module is safe to import from
// either server or client code.

import type {
  ListingLite,
  TxLogEntry,
} from '../app/components/wireframe-parts';

// ---------- helpers ----------

function variantName(v: any): string {
  if (typeof v !== 'object' || v === null) return String(v);
  return Object.keys(v)[0] ?? '';
}

function lamportsToSol(n: any): string {
  // BN-like or number
  const lamports = typeof n === 'string' ? BigInt(n) : BigInt(n.toString?.() ?? n);
  const sol = Number(lamports) / 1_000_000_000;
  return sol.toFixed(2);
}

function repScore(num: any, den: any): number {
  const n = Number(num?.toString?.() ?? num ?? 0);
  const d = Number(den?.toString?.() ?? den ?? 0);
  if (d === 0) return 0;
  // 0..5 scale, rounded to nearest int
  return Math.max(0, Math.min(5, Math.round((n / d) * 5)));
}

function paddedListingId(id: any): string {
  return `L-${String(id?.toString?.() ?? id ?? 0).padStart(4, '0')}`;
}

function shortPubkey(pk: any): string {
  const s = pk?.toBase58?.() ?? String(pk);
  return s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

function shortHandle(handle: string | undefined, fallback: any): string {
  if (handle && handle.length > 0) return handle;
  return shortPubkey(fallback);
}

function unixToHHMMSS(unix: any): string {
  const n = Number(unix?.toString?.() ?? unix ?? 0);
  if (n === 0) return '--:--:--';
  const d = new Date(n * 1000);
  return d.toISOString().slice(11, 19);
}

const EXPLORER = (kind: 'address' | 'tx', id: string) =>
  `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;

// ---------- types for caller convenience ----------

export interface RawAccount<T = any> {
  publicKey: { toBase58: () => string } & any;
  account: T;
}

export interface AgentEntry {
  pda: string;
  authority: string;
  handle: string;
  reputationNum: bigint;
  reputationDen: bigint;
  listingsCreated: bigint;
}

export function indexAgents(agents: RawAccount[]): Map<string, AgentEntry> {
  const m = new Map<string, AgentEntry>();
  for (const { publicKey, account } of agents) {
    m.set(publicKey.toBase58(), {
      pda: publicKey.toBase58(),
      authority: account.authority?.toBase58?.() ?? '',
      handle: account.handle ?? '',
      reputationNum: BigInt(account.reputationNum?.toString?.() ?? 0),
      reputationDen: BigInt(account.reputationDen?.toString?.() ?? 0),
      listingsCreated: BigInt(account.listingsCreated?.toString?.() ?? 0),
    });
  }
  return m;
}

// ---------- toListingRows ----------

export interface EnrichedListing extends ListingLite {
  pda: string;
  status: string;
  createdAt: number;
}

export function toListingRows(
  listings: RawAccount[],
  agents: Map<string, AgentEntry>,
  opts: { onlyActive?: boolean } = {},
): EnrichedListing[] {
  const rows = listings.map(({ publicKey, account }) => {
    const supplierPda = account.supplier?.toBase58?.() ?? '';
    const supplierAgent = agents.get(supplierPda);
    return {
      pda: publicKey.toBase58(),
      id: paddedListingId(account.listingId),
      cat: variantName(account.category).toUpperCase(),
      price: lamportsToSol(account.priceLamports),
      rep: supplierAgent
        ? repScore(supplierAgent.reputationNum, supplierAgent.reputationDen)
        : 0,
      seller: shortHandle(supplierAgent?.handle, supplierPda),
      status: variantName(account.status),
      createdAt: Number(account.createdAt?.toString?.() ?? 0),
    };
  });
  rows.sort((a, b) => b.createdAt - a.createdAt);
  if (opts.onlyActive) {
    return rows.filter((r) => r.status === 'active');
  }
  return rows;
}

// ---------- toTxLogEvents ----------

interface InternalEvent {
  unix: number;
  kind: TxLogEntry['kind'];
  rest: string;
  link?: string;
}

export function toTxLogEvents(
  listings: RawAccount[],
  purchases: RawAccount[],
  ratings: RawAccount[],
  agents: Map<string, AgentEntry>,
): TxLogEntry[] {
  const events: InternalEvent[] = [];

  // LISTED — from listings.created_at
  for (const { publicKey, account } of listings) {
    const supplierPda = account.supplier?.toBase58?.() ?? '';
    const handle = agents.get(supplierPda)?.handle ?? shortPubkey(supplierPda);
    const cat = variantName(account.category).toUpperCase();
    events.push({
      unix: Number(account.createdAt?.toString?.() ?? 0),
      kind: 'LISTED',
      rest: `${paddedListingId(account.listingId)} (cat=${cat}) by ${handle}`,
      link: EXPLORER('address', publicKey.toBase58()),
    });
  }

  // SEALED — from purchases.purchased_at_slot. Slot ≠ unix, but it's monotonic
  // and gives a sortable proxy. For display ts we fall back to slot/2 as
  // pseudo-seconds (close enough for ordering vs LISTED unix).
  for (const { publicKey, account } of purchases) {
    const slot = Number(account.purchasedAtSlot?.toString?.() ?? 0);
    if (slot === 0) continue;
    const buyerPda = account.buyer?.toBase58?.() ?? '';
    const buyerHandle = agents.get(buyerPda)?.handle ?? shortPubkey(buyerPda);
    events.push({
      unix: slot, // pseudo-time for ordering only
      kind: 'SEALED',
      rest: `${shortPubkey(account.listing)} → ${buyerHandle} · ${lamportsToSol(account.pricePaidLamports)} ◎`,
      link: EXPLORER('address', publicKey.toBase58()),
    });
  }

  // DECRYPT — from purchases.delivered=true (no delivered_at field; reuse slot)
  for (const { publicKey, account } of purchases) {
    if (!account.delivered) continue;
    const slot = Number(account.purchasedAtSlot?.toString?.() ?? 0);
    const buyerPda = account.buyer?.toBase58?.() ?? '';
    const buyerHandle = agents.get(buyerPda)?.handle ?? shortPubkey(buyerPda);
    events.push({
      unix: slot + 1, // edge-after sealed
      kind: 'DECRYPT',
      rest: `${shortPubkey(account.listing)} payload delivered → ${buyerHandle}`,
      link: EXPLORER('address', publicKey.toBase58()),
    });
  }

  // RATED — from ratings.rated_at (i64 unix)
  for (const { publicKey, account } of ratings) {
    const verdict = variantName(account.verdict);
    events.push({
      unix: Number(account.ratedAt?.toString?.() ?? 0),
      kind: 'RATED',
      rest: `${shortPubkey(account.purchase)} TIP_${verdict.toUpperCase()}`,
      link: EXPLORER('address', publicKey.toBase58()),
    });
  }

  events.sort((a, b) => b.unix - a.unix);

  return events.slice(0, 8).map((e) => ({
    ts: e.unix > 1_000_000_000 ? unixToHHMMSS(e.unix) : `slot ${e.unix}`,
    kind: e.kind,
    rest: e.rest,
    sig: e.link,
  }));
}

// ---------- toInFlight ----------

export interface InFlight {
  listing: string;
  purchase: string;
  buyer: string;
  price: string;
}

export function toInFlight(
  _listings: RawAccount[],
  purchases: RawAccount[],
  agents: Map<string, AgentEntry>,
  currentSlot: number,
): InFlight | null {
  // Most recent Purchase that's not yet delivered AND was created within the
  // last ~5 minutes (600 slots @ ~0.4-0.5s per slot). Filters out yesterday's
  // stranded purchases so the IN-FLIGHT pill reflects current-session activity.
  const FRESHNESS_SLOTS = 600;
  const cutoff = currentSlot - FRESHNESS_SLOTS;
  const candidates = purchases
    .filter((p) => !p.account.delivered)
    .map((p) => ({
      pubkey: p.publicKey.toBase58(),
      slot: Number(p.account.purchasedAtSlot?.toString?.() ?? 0),
      account: p.account,
    }))
    .filter((p) => p.slot > cutoff)
    .sort((a, b) => b.slot - a.slot);
  if (!candidates.length) return null;
  const top = candidates[0];
  const buyerPda = top.account.buyer?.toBase58?.() ?? '';
  return {
    listing: shortPubkey(top.account.listing),
    purchase: shortPubkey(top.pubkey),
    buyer: agents.get(buyerPda)?.handle ?? shortPubkey(buyerPda),
    price: lamportsToSol(top.account.pricePaidLamports),
  };
}

// ---------- top-level dashboard payload ----------

export interface PurchaseSummary {
  pubkey: string;
  slot: number;
  price: string;
}

export interface DashboardPayload {
  myListings: EnrichedListing[];        // all active, sorted desc — used for both supplier MY ACTIVE + buyer ORDER BOOK
  inFlight: InFlight | null;
  txLog: TxLogEntry[];
  throughputPerMin: number;             // count of LISTED events in last 60s
  totalActive: number;
  fetchedAt: string;                    // ISO ts
  currentSlot: number;
  // Used by the client to detect new Purchases between polls and trigger the
  // envelope animation.
  purchaseSummaries: PurchaseSummary[];
}

export function buildDashboard(
  listings: RawAccount[],
  purchases: RawAccount[],
  agents: RawAccount[],
  ratings: RawAccount[],
  currentSlot: number,
): DashboardPayload {
  const agentMap = indexAgents(agents);
  const allRows = toListingRows(listings, agentMap);
  const activeRows = allRows.filter((r) => r.status === 'active');

  const nowUnix = Math.floor(Date.now() / 1000);
  const recentListings = allRows.filter((r) => r.createdAt > nowUnix - 60).length;

  const purchaseSummaries: PurchaseSummary[] = purchases.map((p) => ({
    pubkey: p.publicKey.toBase58(),
    slot: Number(p.account.purchasedAtSlot?.toString?.() ?? 0),
    price: lamportsToSol(p.account.pricePaidLamports),
  }));

  return {
    myListings: activeRows,
    inFlight: toInFlight(listings, purchases, agentMap, currentSlot),
    txLog: toTxLogEvents(listings, purchases, ratings, agentMap),
    throughputPerMin: recentListings,
    totalActive: activeRows.length,
    fetchedAt: new Date().toISOString(),
    currentSlot,
    purchaseSummaries,
  };
}
