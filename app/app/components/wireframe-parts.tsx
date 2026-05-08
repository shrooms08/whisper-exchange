// Wireframe primitives — verbatim port of design-reference/parts.jsx.
// Pure presentational; no Solana/Anchor imports.

import type { ReactNode } from 'react';

export function Rep({
  score = 3,
  max = 5,
  tick = false,
  tickKey,
}: {
  score?: number;
  max?: number;
  // When true, run the bounce animation. `tickKey` is a per-trigger key (a
  // counter) so React re-mounts the inner span and CSS animation re-fires
  // even if `tick` was already true on the previous render.
  tick?: boolean;
  tickKey?: string | number;
}) {
  return (
    <span className="rep" title={`reputation ${score}/${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <i
          key={tick && i === score - 1 ? `${i}-${tickKey ?? 0}` : i}
          className={[i < score ? 'on' : '', tick && i === score - 1 ? 'tick' : '']
            .filter(Boolean)
            .join(' ')}
        />
      ))}
    </span>
  );
}

// Day 5 — rolling number with cross-fade between values. Used for the
// "LISTED LAST 60s" throughput counter so the digit transition feels alive
// rather than snapping. Keyed on `value` so each change re-mounts the inner
// span and the CSS keyframe re-fires.
export function RollingNumber({
  value,
  className,
  style,
}: {
  value: number | string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={['rolling-number', className].filter(Boolean).join(' ')} style={style}>
      <span key={value} className="rolling-number-inner">
        {value}
      </span>
    </span>
  );
}

export function Envelope({
  size = 22,
  sealed = true,
  anim = false,
}: {
  size?: number;
  sealed?: boolean;
  anim?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size * 0.7}
      viewBox="0 0 40 28"
      className={anim ? 'env-anim' : ''}
    >
      <rect x="1" y="1" width="38" height="26" rx="1.5" className="envelope" />
      <path d="M1 1 L20 16 L39 1" className="envelope" />
      {sealed && <circle cx="20" cy="16" r="3.2" className="seal" />}
    </svg>
  );
}

export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 50 36" aria-label="Whisper Exchange">
      <rect
        x="1.5"
        y="1.5"
        width="47"
        height="33"
        rx="2"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.6"
      />
      <path
        d="M2 2 L25 22 L48 2"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.6"
      />
      <circle
        cx="25"
        cy="22"
        r="6.5"
        fill="var(--accent)"
        style={{ filter: 'drop-shadow(0 0 4px var(--accent-soft))' }}
      />
      <text
        x="25"
        y="25.5"
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill="white"
        fontFamily="var(--font-space), 'Space Grotesk', sans-serif"
      >
        W
      </text>
    </svg>
  );
}

export function TopBar({
  label = 'triptych · suppliers / arena / buyers',
  ping = 'sol-devnet · slot 287,491,203',
  agent = 'agent.session 0x91ae…b2c1',
}: {
  label?: string;
  ping?: string;
  agent?: string;
}) {
  return (
    <div className="topbar">
      <div className="brand" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <BrandMark size={18} />
        WHISPER<span>.</span>EXCHANGE
      </div>
      <div className="crumbs">&nbsp;· {label}</div>
      <div className="spacer" />
      <div className="status">
        <span className="dot" />
        <span>{ping}</span>
        <span style={{ color: 'var(--ink-3)' }}>|</span>
        <span>{agent}</span>
      </div>
    </div>
  );
}

export function PanelHead({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="panel-head">
      <span className="dot v" />
      <div>
        <div className="panel-title">{title}</div>
        {sub && <div className="panel-sub">{sub}</div>}
      </div>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

export interface SignalLite {
  id: string;
  title: string;
  body: string;
  meta: string;
  tag: string;
}

export function SignalCard({ s }: { s: SignalLite }) {
  return (
    <div className="signal">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <h5 className="h">{s.title}</h5>
        <span className="pill accent">{s.tag}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-2)', marginBottom: 4 }}>{s.body}</div>
      <div className="meta">{s.meta}</div>
    </div>
  );
}

export interface ListingLite {
  id: string;
  cat: string;
  price: string;
  rep: number;
  seller: string;
}

export function ListingRow({
  l,
  personas = true,
  compact = false,
  tick = false,
  tickKey,
}: {
  l: ListingLite;
  personas?: boolean;
  compact?: boolean;
  tick?: boolean;
  tickKey?: string | number;
}) {
  return (
    <div className="row" style={{ padding: compact ? '6px 10px' : '8px 10px' }}>
      <Envelope size={18} />
      <div className="cell" style={{ color: 'var(--ink)', width: 54 }}>
        {l.id}
      </div>
      <span className="pill">{l.cat}</span>
      <div style={{ flex: 1 }} />
      {personas && (
        <div
          className="cell"
          style={{ color: 'var(--ink-2)', width: 96, textAlign: 'right' }}
        >
          {l.seller}
        </div>
      )}
      <Rep score={l.rep} tick={tick} tickKey={tickKey} />
      <div
        className="cell"
        style={{ color: 'var(--accent)', width: 58, textAlign: 'right' }}
      >
        {l.price} ◎
      </div>
    </div>
  );
}

export function OrderBookRow({
  l,
  tick = false,
  tickKey,
}: {
  l: ListingLite;
  tick?: boolean;
  tickKey?: string | number;
}) {
  return (
    <div className="ob" title={`sealed listing ${l.id}`}>
      <span className="cat">{l.cat}</span>
      <span className="redacted" style={{ height: 8, width: '100%', maxWidth: 140 }}>
        &nbsp;
      </span>
      <Rep score={l.rep} tick={tick} tickKey={tickKey} />
      <span className="price">{l.price} ◎</span>
      <Envelope size={14} />
    </div>
  );
}

export function DecryptedPayload({
  listingId = 'L-0008',
  ts = '17:38:22',
  supplier = 'night-oracle',
  rep = 4,
  pulsing = false,
}: {
  listingId?: string;
  ts?: string;
  supplier?: string;
  rep?: number;
  // Day 5 — when true, the panel pulses (background flash + scale) for
  // ~5 seconds. Caller controls timing; the component just toggles the class.
  pulsing?: boolean;
}) {
  return (
    <div className={['payload', pulsing ? 'pulse-just-delivered' : ''].filter(Boolean).join(' ')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="label" style={{ color: 'var(--accent)' }}>
          {listingId} · DECRYPTED
        </span>
        <span className="label">{ts}</span>
      </div>
      <div className="line">$ payload.open --key=session.0x91ae</div>
      <div className="line">
        &gt; <span className="kw">WHALE_SWAP</span> predicted within 6 blocks
      </div>
      <div className="line">
        &gt; wallet <span className="kw">7xKX…Qh9</span> holds 48.2k SOL
      </div>
      <div className="line">&gt; historical pattern: sells 71% on-chain within 2 slots</div>
      <div className="line">&gt; recommended action: short JUP/SOL · size ≤ 120 SOL</div>
      <div className="line" style={{ marginTop: 6, color: 'var(--ink-3)' }}>
        &nbsp;&nbsp;supplier: {supplier} · rep {rep}/5 · outcome verified
      </div>
    </div>
  );
}

export interface TxLogEntry {
  ts: string;
  kind: 'SEALED' | 'LISTED' | 'SIGNAL' | 'DECRYPT' | 'RATED' | 'REP++' | 'REP--' | 'EXPIRED';
  rest: string;
  sig?: string;
}

const KIND_COLOR: Record<string, string> = {
  SEALED: 'var(--accent)',
  LISTED: 'var(--ink)',
  SIGNAL: 'oklch(0.78 0.17 210)',
  DECRYPT: 'var(--accent)',
  RATED: 'var(--ok)',
  'REP++': 'var(--ok)',
  'REP--': 'var(--danger)',
  EXPIRED: 'var(--ink-3)',
};

export function LogBar({ entries }: { entries: TxLogEntry[] }) {
  const items = entries.map((e, i) => (
    <span key={i} style={{ marginRight: 28 }}>
      <span style={{ color: 'var(--ink-3)' }}>[{e.ts}]</span>{' '}
      <span style={{ color: KIND_COLOR[e.kind] ?? 'var(--ink-2)', fontWeight: 600 }}>
        {e.kind}
      </span>{' '}
      <span style={{ color: 'var(--ink-2)' }}>{e.rest}</span>
      {e.sig && (
        <a
          href={`https://explorer.solana.com/tx/${e.sig}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--ink-3)', marginLeft: 6 }}
        >
          ↗
        </a>
      )}
      <span style={{ color: 'var(--rule)', marginLeft: 28 }}>·</span>
    </span>
  ));
  return (
    <div className="logbar" style={{ position: 'relative', height: 38 }}>
      <span className="label" style={{ color: 'var(--accent)' }}>
        TX LOG
      </span>
      <span className="dot v" />
      <span className="pill">{entries.length} events</span>
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div className="ticker mono" style={{ fontSize: 10.5 }}>
          {items}
          {items}
        </div>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            left: 0,
            pointerEvents: 'none',
          }}
        >
          <Envelope anim size={18} />
        </div>
      </div>
      <span className="pill accent">SEALED</span>
    </div>
  );
}
