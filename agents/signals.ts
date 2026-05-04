// Signal feed for Whisper Exchange.
//
// MockFeed emits signals across all 6 categories on randomized 5-15s
// intervals with category-specific templates and randomized fillers. Each
// signal is paired with a resolution ~30s later (mostly True, occasional
// False/Partial) so buyers can rate purchases. Runs until stop().
//
// Day-1 history: the previous MockFeed emitted a single scripted WHALE
// signal at T+5s and one resolution at T+35s — used by the cold E2E
// harness for deterministic single-cycle assertions. That harness is
// being replaced by scripts/multi-e2e.ts in Day 2; this generator is the
// driver for both the multi-agent demo and the dashboard's "looks alive"
// requirement.
//
// HeliusFeed (the real-source path used when USE_REAL_SIGNALS=true) lives
// at the bottom and is unchanged.

export type SignalCategory = 'WHALE' | 'MEV' | 'MINT' | 'IMBAL' | 'INSDR' | 'BRIDGE';
export type Verdict = 'True' | 'False' | 'Partial';

export interface Signal {
  id: string;
  category: SignalCategory;
  signal_ref: string;
  claim: string;
  evidence: unknown[];
  recommended_action: string;
  emitted_at: number; // unix ms
}

export interface Resolution {
  signal_id: string;
  verdict: Verdict;
  resolved_at: number; // unix ms
}

export type FeedEvent =
  | { kind: 'signal'; signal: Signal }
  | { kind: 'resolution'; resolution: Resolution };

export interface SignalFeed {
  start(): AsyncIterable<FeedEvent>;
  stop(): void;
}

// ---------- Random fillers ----------

const BASE58_ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}
function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}
function pick<T>(xs: readonly T[]): T {
  return xs[randInt(0, xs.length - 1)]!;
}
function fakeWallet(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += BASE58_ALPHA[randInt(0, BASE58_ALPHA.length - 1)];
  let suf = '';
  for (let i = 0; i < 3; i++) suf += BASE58_ALPHA[randInt(0, BASE58_ALPHA.length - 1)];
  return `${s}…${suf}`;
}

const TOKENS = ['SOL', 'USDC', 'JUP', 'BONK', 'WIF', 'JTO', 'PYTH', 'mSOL'] as const;
const STABLES = ['USDC', 'USDT'] as const;
const DEXES = ['Raydium', 'Orca', 'Meteora', 'Phoenix', 'Lifinity', 'Jupiter v6'] as const;
const POOLS = [
  'Raydium SOL/USDC',
  'Orca JUP/SOL',
  'Meteora BONK/SOL',
  'Lifinity JTO/USDC',
  'Phoenix WIF/USDC',
  'Raydium PYTH/SOL',
] as const;
const TOKEN_NAMES = ['catwifgun', 'pepehat', 'doglol', 'frogcoin', 'mooncult', 'baseboi', 'reflexAI', 'orbitDAO'] as const;
const CHAINS = ['Ethereum', 'Arbitrum', 'Polygon', 'Base', 'BNB', 'Avalanche'] as const;
const BRIDGES = ['Wormhole', 'Mayan', 'deBridge', 'Allbridge', 'Portal'] as const;
const INSDR_ACTIONS = ['LP add', 'directional perp', 'pre-mint snipe', 'sandwich', 'grid bot'] as const;

// ---------- Per-category renderers ----------

interface RenderedClaim {
  signal_ref: string;
  claim: string;
  evidence: unknown[];
  recommended_action: string;
}

function renderWhale(): RenderedClaim {
  const wallet = fakeWallet();
  const tokenIn = pick(TOKENS);
  const tokenOut = pick(TOKENS.filter((t) => t !== tokenIn));
  const amountIn = randInt(80, 850);
  const amountOut = Math.round(amountIn * rand(0.85, 1.15));
  const dex = pick(DEXES);
  const slot = 460_000_000 + randInt(0, 200_000);
  return {
    signal_ref: `slot ${slot}, wallet ${wallet}`,
    claim: `Whale ${wallet}: ${amountIn} ${tokenIn} → ${amountOut} ${tokenOut} on ${dex}`,
    evidence: [{ kind: 'balance_delta', wallet, dex, in: amountIn, out: amountOut }],
    recommended_action: `short ${tokenIn}/${tokenOut}, size ≤ ${amountIn} ${tokenIn}`,
  };
}

function renderMev(): RenderedClaim {
  const pool = pick(POOLS);
  const deltaBps = randInt(8, 95);
  const slot = 460_000_000 + randInt(0, 200_000);
  return {
    signal_ref: `slot ${slot}, pool ${pool}`,
    claim: `MEV opportunity: sandwich vector on ${pool} (${deltaBps} bps spread)`,
    evidence: [{ kind: 'mempool_delta', pool, spread_bps: deltaBps }],
    recommended_action: `front-run with ${randInt(2, 14)} SOL inventory`,
  };
}

function renderMint(): RenderedClaim {
  const name = pick(TOKEN_NAMES);
  const supply = `${randInt(100, 999)}M`;
  const pct = randInt(35, 88);
  const mint = fakeWallet();
  return {
    signal_ref: `mint ${mint}`,
    claim: `New mint detected: ${name} (${supply} supply, ${pct}% concentrated)`,
    evidence: [{ kind: 'mint_authority', mint, top_holder_pct: pct }],
    recommended_action: pct > 70 ? 'avoid — high concentration' : `LP add max ${randInt(1, 6)} SOL`,
  };
}

function renderImbal(): RenderedClaim {
  const pool = pick(POOLS);
  // tokenA is non-stable (asset side of the pool); tokenB is the stable
  // counter. Filtering ensures we don't emit nonsense like USDC:USDC.
  const NON_STABLES = TOKENS.filter((t) => !STABLES.includes(t as (typeof STABLES)[number]));
  const tokenA = pick(NON_STABLES);
  const tokenB = pick(STABLES);
  const ratioNow = (rand(0.4, 1.6)).toFixed(3);
  const ratioPrev = (rand(0.95, 1.05)).toFixed(3);
  const drift = randInt(40, 320);
  const slot = 460_000_000 + randInt(0, 200_000);
  return {
    signal_ref: `slot ${slot}, pool ${pool}`,
    claim: `Pool imbalance: ${pool} ${tokenA}:${tokenB} ratio ${ratioNow} (was ${ratioPrev}, ${drift} bps drift)`,
    evidence: [{ kind: 'pool_state', pool, ratio_now: ratioNow, ratio_prev: ratioPrev, drift_bps: drift }],
    recommended_action: `arb ${tokenA}/${tokenB} via ${pick(DEXES)}, ≤ ${randInt(5, 50)} SOL size`,
  };
}

function renderInsdr(): RenderedClaim {
  const wallet = fakeWallet();
  const hours = randInt(2, 36);
  const amount = randInt(40, 1200);
  const token = pick(TOKENS);
  const action = pick(INSDR_ACTIONS);
  return {
    signal_ref: `wallet ${wallet}`,
    claim: `Wallet age <${hours}h funded ${amount} ${token}, deployed ${action}`,
    evidence: [{ kind: 'wallet_profile', wallet, age_hours: hours, recent_action: action }],
    recommended_action: `monitor ${wallet} for follow-on tx in next ${randInt(1, 6)}h`,
  };
}

function renderBridge(): RenderedClaim {
  const amount = randInt(50_000, 4_500_000);
  const token = pick(STABLES);
  const chainA = pick(CHAINS);
  const chainB = pick(CHAINS.filter((c) => c !== chainA));
  const bridge = pick(BRIDGES);
  return {
    signal_ref: `${bridge} relay ${fakeWallet()}`,
    claim: `Cross-chain bridge: ${amount.toLocaleString('en-US')} ${token} from ${chainA} → ${chainB} via ${bridge}`,
    evidence: [{ kind: 'bridge_event', bridge, src_chain: chainA, dst_chain: chainB, amount_usd: amount }],
    recommended_action: `position for inflow on ${chainB} DEXes within ${randInt(2, 12)} blocks`,
  };
}

const RENDERERS: Record<SignalCategory, () => RenderedClaim> = {
  WHALE: renderWhale,
  MEV: renderMev,
  MINT: renderMint,
  IMBAL: renderImbal,
  INSDR: renderInsdr,
  BRIDGE: renderBridge,
};

// ---------- Weighted category picker ----------

const CATEGORY_WEIGHTS: ReadonlyArray<readonly [SignalCategory, number]> = [
  ['WHALE', 4], // ~33%
  ['IMBAL', 3], // ~25%
  ['MEV', 2],   // ~17%
  ['MINT', 1],  // ~8%
  ['INSDR', 1], // ~8%
  ['BRIDGE', 1],// ~8%
];
const TOTAL_WEIGHT = CATEGORY_WEIGHTS.reduce((s, [, w]) => s + w, 0);

function pickCategory(): SignalCategory {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const [cat, w] of CATEGORY_WEIGHTS) {
    if (r < w) return cat;
    r -= w;
  }
  return 'WHALE';
}

// ---------- MockFeed ----------

const VERDICT_WEIGHTS: ReadonlyArray<readonly [Verdict, number]> = [
  ['True', 7],    // 70% — most signals validate
  ['Partial', 2], // 20%
  ['False', 1],   // 10%
];
const VERDICT_TOTAL = VERDICT_WEIGHTS.reduce((s, [, w]) => s + w, 0);

function pickVerdict(): Verdict {
  let r = Math.random() * VERDICT_TOTAL;
  for (const [v, w] of VERDICT_WEIGHTS) {
    if (r < w) return v;
    r -= w;
  }
  return 'True';
}

const MIN_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 15_000;
const RESOLUTION_MIN_MS = 25_000;
const RESOLUTION_MAX_MS = 35_000;

export class MockFeed implements SignalFeed {
  private stopped = false;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private seq = 0;
  // Instance-scoped so stop() can drain pending waiters — without this,
  // a consumer parked on next() never wakes up after the feed is stopped
  // (e.g. supplier's signalLoop on SIGTERM).
  private waiters: Array<(v: IteratorResult<FeedEvent>) => void> = [];

  start(): AsyncIterable<FeedEvent> {
    const queue: FeedEvent[] = [];
    const waiters = this.waiters;

    const push = (event: FeedEvent) => {
      if (this.stopped) return;
      const stamped = stampEvent(event, Date.now());
      const waiter = waiters.shift();
      if (waiter) waiter({ value: stamped, done: false });
      else queue.push(stamped);
    };

    const scheduleNext = (delay: number) => {
      if (this.stopped) return;
      this.timers.push(
        setTimeout(() => {
          if (this.stopped) return;
          const category = pickCategory();
          this.seq += 1;
          const id = `sig-${category}-${this.seq.toString().padStart(4, '0')}`;
          const { signal_ref, claim, evidence, recommended_action } = RENDERERS[category]();
          const signal: Signal = {
            id,
            category,
            signal_ref,
            claim,
            evidence,
            recommended_action,
            emitted_at: 0,
          };
          push({ kind: 'signal', signal });

          // Pair each signal with a randomized-verdict resolution.
          const resDelay = randInt(RESOLUTION_MIN_MS, RESOLUTION_MAX_MS);
          this.timers.push(
            setTimeout(() => {
              if (this.stopped) return;
              push({
                kind: 'resolution',
                resolution: { signal_id: id, verdict: pickVerdict(), resolved_at: 0 },
              });
            }, resDelay),
          );

          scheduleNext(randInt(MIN_INTERVAL_MS, MAX_INTERVAL_MS));
        }, delay),
      );
    };

    // First signal in 1-3s so suppliers see something quickly on startup.
    scheduleNext(randInt(1_000, 3_000));

    const self = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<FeedEvent> {
        return {
          next(): Promise<IteratorResult<FeedEvent>> {
            if (queue.length) return Promise.resolve({ value: queue.shift()!, done: false });
            if (self.stopped) return Promise.resolve({ value: undefined, done: true });
            return new Promise((resolve) => waiters.push(resolve));
          },
          return(): Promise<IteratorResult<FeedEvent>> {
            self.stop();
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    };

    function stampEvent(event: FeedEvent, now: number): FeedEvent {
      if (event.kind === 'signal') {
        return { kind: 'signal', signal: { ...event.signal, emitted_at: now } };
      }
      return {
        kind: 'resolution',
        resolution: { ...event.resolution, resolved_at: now },
      };
    }
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    while (this.waiters.length) {
      this.waiters.shift()!({ value: undefined, done: true });
    }
  }
}

// ---------- Helius adapter (unchanged — used when USE_REAL_SIGNALS=true) ----------

export interface HeliusFeedOptions {
  apiKey: string;
  wallets: string[];
}

export class HeliusFeed implements SignalFeed {
  constructor(opts: HeliusFeedOptions) {
    void opts;
  }

  start(): AsyncIterable<FeedEvent> {
    throw new Error('HeliusFeed not implemented for v1 — use MockFeed');
  }

  stop(): void {
    /* no-op */
  }
}

export function selectFeed(mode: string, opts?: Partial<HeliusFeedOptions>): SignalFeed {
  if (mode === 'helius') {
    if (!opts?.apiKey) throw new Error('HELIUS_API_KEY required for helius mode');
    return new HeliusFeed({ apiKey: opts.apiKey, wallets: opts.wallets ?? [] });
  }
  return new MockFeed();
}
