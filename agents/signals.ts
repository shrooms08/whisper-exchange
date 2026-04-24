// Signal feed for Whisper Exchange.
//
// v1: `MockFeed` emits a scripted WHALE signal at T+5s and a matching
// WHALE_SWAP_RESOLVED (True) resolution at T+35s, matching the demo script
// in docs/flows.md. Timing is relative to `start()` — callers (supplier + buyer)
// should launch their feeds within the same second for the demo to land on beat.
//
// v2 (stretch): `HeliusFeed` subscribes to real on-chain swap events via the
// Helius MCP/webhook. Stub interface lives at the bottom of this file;
// implementation is deliberately deferred.

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

// ---------- Mock feed (v1 demo) ----------

interface ScriptedEvent {
  delayMs: number;
  event: FeedEvent;
}

const DEMO_SCRIPT: ScriptedEvent[] = [
  {
    delayMs: 5_000,
    event: {
      kind: 'signal',
      signal: {
        id: 'sig-WHALE-0001',
        category: 'WHALE',
        signal_ref: 'slot 287491203, wallet 7xKXtg2CW87iF5RxC84LBu68kAr7GhvsqxNWwUPHhQh9',
        claim: 'WHALE_SWAP predicted within 6 blocks',
        evidence: [
          { kind: 'balance_delta', wallet: '7xKX…Qh9', pool: 'Raydium JUP/SOL', sol: 120 },
        ],
        recommended_action: 'short JUP/SOL, size ≤ 120 SOL',
        emitted_at: 0,
      },
    },
  },
  {
    delayMs: 35_000,
    event: {
      kind: 'resolution',
      resolution: {
        signal_id: 'sig-WHALE-0001',
        verdict: 'True',
        resolved_at: 0,
      },
    },
  },
];

export class MockFeed implements SignalFeed {
  private stopped = false;
  private timers: ReturnType<typeof setTimeout>[] = [];

  start(): AsyncIterable<FeedEvent> {
    const queue: FeedEvent[] = [];
    const waiters: Array<(v: IteratorResult<FeedEvent>) => void> = [];

    const push = (event: FeedEvent) => {
      if (this.stopped) return;
      const stamped = stampEvent(event, Date.now());
      const waiter = waiters.shift();
      if (waiter) waiter({ value: stamped, done: false });
      else queue.push(stamped);
    };

    for (const { delayMs, event } of DEMO_SCRIPT) {
      this.timers.push(setTimeout(() => push(event), delayMs));
    }

    const finalDelay = DEMO_SCRIPT[DEMO_SCRIPT.length - 1]!.delayMs + 1_000;
    this.timers.push(
      setTimeout(() => {
        this.stopped = true;
        while (waiters.length) waiters.shift()!({ value: undefined, done: true });
      }, finalDelay),
    );

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
  }
}

// ---------- Helius adapter (v2 stub) ----------

export interface HeliusFeedOptions {
  apiKey: string;
  wallets: string[]; // wallets whose swaps we care about
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
