// V3 Triptych — Suppliers · Exchange Arena · Buyers + bottom TX log.
// Live: polls /api/chain every 2s for real on-chain data. Signals panel keeps
// the static mock list (signals live in supplier.ts stdout, not on chain;
// v2 would tail via SSE/WS).

'use client';

import { useEffect, useRef, useState } from 'react';

import {
  DecryptedPayload,
  Envelope,
  ListingRow,
  LogBar,
  OrderBookRow,
  PanelHead,
  Rep,
  SignalCard,
  TopBar,
  type ListingLite,
  type TxLogEntry,
} from './components/wireframe-parts';
import { MOCK_SIGNALS } from './lib/mock-data';

interface InFlight {
  listing: string;
  purchase: string;
  buyer: string;
  price: string;
}

interface PurchaseSummary {
  pubkey: string;
  slot: number;
  price: string;
}

interface DashboardPayload {
  myListings: ListingLite[];
  inFlight: InFlight | null;
  txLog: TxLogEntry[];
  throughputPerMin: number;
  totalActive: number;
  fetchedAt: string;
  currentSlot: number;
  purchaseSummaries: PurchaseSummary[];
}

const INITIAL: DashboardPayload = {
  myListings: [],
  inFlight: null,
  txLog: [],
  throughputPerMin: 0,
  totalActive: 0,
  fetchedAt: '',
  currentSlot: 0,
  purchaseSummaries: [],
};

const POLL_MS = 2_000;

export default function Page() {
  const [data, setData] = useState<DashboardPayload>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [animating, setAnimating] = useState<PurchaseSummary | null>(null);
  // null until first poll completes; then holds the set of pubkeys we already
  // knew about, so subsequent polls only animate genuinely-new purchases.
  const seenPurchases = useRef<Set<string> | null>(null);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch('/api/chain', { cache: 'no-store' });
        const json = await r.json();
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error ?? 'unknown error');
          return;
        }
        const payload = json.payload as DashboardPayload;
        setData(payload);
        setError(null);
        setLoaded(true);

        // Diff for envelope animation.
        const currentSet = new Set(payload.purchaseSummaries.map((p) => p.pubkey));
        if (seenPurchases.current === null) {
          // First load: seed the set so existing purchases don't all animate.
          seenPurchases.current = currentSet;
        } else {
          const novel = payload.purchaseSummaries.filter(
            (p) => !seenPurchases.current!.has(p.pubkey),
          );
          if (novel.length > 0 && !animationTimer.current) {
            // Pick the most recent of the new ones; ignore the rest (one at a time).
            const latest = [...novel].sort((a, b) => b.slot - a.slot)[0];
            setAnimating(latest);
            animationTimer.current = setTimeout(() => {
              setAnimating(null);
              animationTimer.current = null;
            }, 2000);
          }
          seenPurchases.current = currentSet;
        }
      } catch (e) {
        if (cancelled) return;
        setError(String(e).slice(0, 200));
      }
    };
    tick();
    const handle = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
      if (animationTimer.current) {
        clearTimeout(animationTimer.current);
        animationTimer.current = null;
      }
    };
  }, []);

  // Suppliers panel: top 3 active listings (any supplier). Demo-friendly stand-in
  // for "MY ACTIVE LISTINGS" since the dashboard isn't authenticated as anyone.
  const myListings = data.myListings.slice(0, 3);
  // Buyer order book: all active.
  const orderBook = data.myListings;
  const inFlightLast3 = data.myListings.slice(0, 3);

  const ping = loaded
    ? `sol-devnet · ${data.totalActive} active · last fetch ${new Date(data.fetchedAt).toISOString().slice(11, 19)}`
    : 'sol-devnet · loading…';

  return (
    <div className="screen scan">
      <TopBar
        ping={ping}
        agent={
          error
            ? `⚠ ${error}`
            : `program 6ac2…tBCwP4 · use_private_purchase=true`
        }
      />

      <div className="split-3">
        {/* SUPPLIERS */}
        <div className="panel">
          <PanelHead
            title="SUPPLIERS"
            sub={`${MOCK_SIGNALS.length} signals · ${data.totalActive} active drops`}
            right={<span className="dot v" />}
          />
          <div className="panel-body">
            <div className="label">SIGNALS</div>
            <div className="list" style={{ gap: 5 }}>
              {MOCK_SIGNALS.map((s) => (
                <SignalCard key={s.id} s={s} />
              ))}
            </div>

            <div className="label" style={{ marginTop: 6 }}>
              QUICK LIST
            </div>
            <div className="wf-dashed" style={{ padding: 8, fontSize: 11 }}>
              <div className="field">
                <label>cat</label>
                <div className="inp">WHALE ▾</div>
              </div>
              <div className="field" style={{ marginTop: 4 }}>
                <label>price</label>
                <div className="inp" style={{ color: 'var(--accent)' }}>
                  2.40 ◎
                </div>
              </div>
              <button className="btn" style={{ width: '100%', marginTop: 6 }}>
                SEAL →
              </button>
            </div>

            <div className="label" style={{ marginTop: 6 }}>
              ACTIVE LISTINGS · top {myListings.length}
            </div>
            <div className="list">
              {myListings.length === 0 ? (
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', padding: '4px 0' }}>
                  {loaded ? 'no active listings' : 'loading…'}
                </div>
              ) : (
                myListings.map((l) => <ListingRow key={l.id} l={l} />)
              )}
            </div>
          </div>
        </div>

        {/* ARENA */}
        <div className="panel arena">
          <PanelHead
            title="EXCHANGE ARENA"
            sub={`live · ${data.fetchedAt ? new Date(data.fetchedAt).toISOString().slice(11, 19) : '--:--:--'}`}
            right={<span className="pill accent">SEALED</span>}
          />
          {animating && (
            <div
              className="purchase-fly"
              key={animating.pubkey}
              title={`new purchase ${animating.pubkey} · ${animating.price} ◎`}
            >
              <Envelope size={28} />
            </div>
          )}
          <div className="panel-body" style={{ alignItems: 'stretch' }}>
            <div
              style={{
                position: 'relative',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 0,
              }}
            >
              <svg
                viewBox="0 0 300 300"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              >
                <defs>
                  <linearGradient id="flow" x1="0" x2="1">
                    <stop offset="0" stopColor="oklch(0.68 0.25 300)" stopOpacity="0" />
                    <stop offset="0.5" stopColor="oklch(0.68 0.25 300)" stopOpacity="0.8" />
                    <stop offset="1" stopColor="oklch(0.68 0.25 300)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0 80 Q 150 40 300 100" stroke="url(#flow)" strokeWidth="1" fill="none" strokeDasharray="2 4" />
                <path d="M0 160 Q 150 200 300 140" stroke="url(#flow)" strokeWidth="1" fill="none" strokeDasharray="2 4" />
                <path d="M0 240 Q 150 220 300 220" stroke="url(#flow)" strokeWidth="1" fill="none" strokeDasharray="2 4" />
              </svg>

              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px 0',
                  }}
                >
                  <div className="env-anim" style={{ animationDelay: `${i * 2}s` }}>
                    <Envelope size={24} />
                  </div>
                </div>
              ))}

              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div
                    className="wf"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 10px',
                      marginBottom: 10,
                      background: 'rgba(157,78,221,0.08)',
                      borderColor: 'var(--accent-dim)',
                    }}
                  >
                    <span className="dot v" />
                    <span className="label" style={{ color: 'var(--accent)' }}>
                      IN-FLIGHT
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>
                      {data.inFlight
                        ? `${data.inFlight.purchase} · ${data.inFlight.buyer} · ${data.inFlight.price} ◎`
                        : 'channel idle · awaiting purchase'}
                    </span>
                  </div>
                  <div className="label" style={{ color: 'var(--accent)' }}>
                    LISTED LAST 60s
                  </div>
                  <div
                    className="mono h"
                    style={{ fontSize: 28, color: 'var(--ink)', letterSpacing: '-0.02em' }}
                  >
                    {data.throughputPerMin}
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>/min</span>
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}>
                    sealed · private · final
                  </div>
                </div>
              </div>
            </div>

            <div className="wf" style={{ padding: 8 }}>
              <div className="label" style={{ marginBottom: 6 }}>
                LAST 3 · IN-FLIGHT
              </div>
              {inFlightLast3.length === 0 ? (
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', padding: 4 }}>
                  {loaded ? 'no recent listings' : 'loading…'}
                </div>
              ) : (
                inFlightLast3.map((l) => (
                  <div
                    key={l.id}
                    className="ob"
                    style={{
                      gridTemplateColumns: '60px 1fr 70px 60px 30px',
                      borderBottom: '1px dashed var(--rule-2)',
                    }}
                  >
                    <span className="cat">{l.cat}</span>
                    <span className="redacted" style={{ height: 8 }}>&nbsp;</span>
                    <Rep score={l.rep} />
                    <span className="price">{l.price} ◎</span>
                    <Envelope size={14} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* BUYERS */}
        <div className="panel">
          <PanelHead
            title="BUYERS"
            sub="channel open · private mode"
            right={<span className="pill">{data.totalActive} ◎ open</span>}
          />
          <div className="panel-body">
            <div className="label">ORDER BOOK</div>
            <div className="wf" style={{ background: '#0d0d12' }}>
              {orderBook.length === 0 ? (
                <div
                  className="mono"
                  style={{ fontSize: 10, color: 'var(--ink-3)', padding: 12 }}
                >
                  {loaded ? 'order book empty' : 'loading…'}
                </div>
              ) : (
                orderBook.map((l) => <OrderBookRow key={l.id} l={l} />)
              )}
            </div>
            <button className="btn glow" style={{ width: '100%' }}>
              PURCHASE PRIVATELY
            </button>
            <div className="label" style={{ marginTop: 4 }}>
              DECRYPTED
            </div>
            <DecryptedPayload />

            <div className="label" style={{ marginTop: 4 }}>
              RATE OUTCOME
            </div>
            <div className="wf-dashed" style={{ padding: 10 }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 8 }}>
                L-0008 · window closes in 4 slots · oracle pending
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn glow" style={{ flex: 1 }}>
                  ✓ TIP TRUE
                </button>
                <button
                  className="btn ghost"
                  style={{ flex: 1, borderColor: 'var(--rule)' }}
                >
                  ✗ TIP FALSE
                </button>
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  color: 'var(--ink-2)',
                  marginTop: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>rep delta preview</span>
                <span style={{ color: 'var(--accent)' }}>+0.12 → night-oracle</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <LogBar entries={data.txLog} />
    </div>
  );
}
