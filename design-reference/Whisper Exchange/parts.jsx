// Shared wireframe parts

function Rep({ score = 3, max = 5 }) {
  return (
    <span className="rep" title={`reputation ${score}/${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <i key={i} className={i < score ? "on" : ""} />
      ))}
    </span>
  );
}

function Envelope({ size = 22, sealed = true, anim = false }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 40 28" className={anim ? "env-anim" : ""}>
      <rect x="1" y="1" width="38" height="26" rx="1.5" className="envelope" />
      <path d="M1 1 L20 16 L39 1" className="envelope" />
      {sealed && <circle cx="20" cy="16" r="3.2" className="seal" />}
    </svg>
  );
}

function TopBar({ label = "whisper.exchange // private alpha", ping = "sol-mainnet · slot 287,491,203" }) {
  return (
    <div className="topbar">
      <div className="brand">WHISPER<span>.</span>EXCHANGE</div>
      <div className="crumbs">&nbsp;· {label}</div>
      <div className="spacer" />
      <div className="status">
        <span className="dot" />
        <span>{ping}</span>
        <span style={{ color: "var(--ink-3)" }}>|</span>
        <span>agent.session 0x91ae…b2c1</span>
      </div>
    </div>
  );
}

function LogBar({ animateEnvelope = true, variant = "ticker" }) {
  const colorize = (line) => {
    const m = line.match(/^(\[[^\]]+\])\s+(\w+[+\-]*)\s+(.*)$/);
    if (!m) return <span>{line}</span>;
    const [, ts, kind, rest] = m;
    const kindColor = {
      SEALED:  "var(--accent)",
      LISTED:  "var(--ink)",
      SIGNAL:  "oklch(0.78 0.17 210)",
      DECRYPT: "var(--accent)",
      RATED:   "var(--ok)",
      "REP++": "var(--ok)",
      "REP--": "var(--danger)",
      EXPIRED: "var(--ink-3)",
    }[kind] || "var(--ink-2)";
    return (
      <>
        <span style={{ color: "var(--ink-3)" }}>{ts}</span>{" "}
        <span style={{ color: kindColor, fontWeight: 600 }}>{kind}</span>{" "}
        <span style={{ color: "var(--ink-2)" }}>{rest}</span>
      </>
    );
  };
  const joined = window.TX_LOG.map((l, i) => (
    <span key={i} style={{ marginRight: 28 }}>{colorize(l)}<span style={{ color: "var(--rule)", marginLeft: 28 }}>·</span></span>
  ));
  return (
    <div className="logbar" style={{ position: "relative", height: 38 }}>
      <span className="label" style={{ color: "var(--accent)" }}>TX LOG</span>
      <span className="dot v" />
      <span className="pill">{window.TX_LOG.length} events</span>
      <div style={{ flex: 1, overflow: "hidden", position: "relative", height: "100%", display: "flex", alignItems: "center" }}>
        <div className="ticker mono" style={{ fontSize: 10.5 }}>
          {joined}{joined}
        </div>
        {animateEnvelope && (
          <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: 0, pointerEvents: "none" }}>
            <Envelope anim size={18} />
          </div>
        )}
      </div>
      <span className="pill accent">SEALED</span>
    </div>
  );
}

function SignalCard({ s }) {
  return (
    <div className="signal">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h5 className="h">{s.title}</h5>
        <span className="pill accent">{s.tag}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-2)", marginBottom: 4 }}>{s.body}</div>
      <div className="meta">{s.meta}</div>
    </div>
  );
}

function ListingRow({ l, personas = true, compact = false }) {
  return (
    <div className="row" style={{ padding: compact ? "6px 10px" : "8px 10px" }}>
      <Envelope size={18} />
      <div className="cell" style={{ color: "var(--ink)", width: 54 }}>{l.id}</div>
      <span className="pill">{l.cat}</span>
      <div style={{ flex: 1 }} />
      {personas && <div className="cell" style={{ color: "var(--ink-2)", width: 96, textAlign: "right" }}>{l.seller}</div>}
      <Rep score={l.rep} />
      <div className="cell" style={{ color: "var(--accent)", width: 58, textAlign: "right" }}>{l.price} ◎</div>
    </div>
  );
}

function OrderBookRow({ l, onBuy }) {
  return (
    <div className="ob" title={`sealed listing ${l.id}`}>
      <span className="cat">{l.cat}</span>
      <span className="redacted" style={{ height: 8, width: "100%", maxWidth: 140 }}>&nbsp;</span>
      <Rep score={l.rep} />
      <span className="price">{l.price} ◎</span>
      <Envelope size={14} />
    </div>
  );
}

function DecryptedPayload() {
  return (
    <div className="payload">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span className="label" style={{ color: "var(--accent)" }}>L-0412 · DECRYPTED</span>
        <span className="label">17:38:22</span>
      </div>
      <div className="line">$ payload.open --key=session.0x91ae</div>
      <div className="line">&gt; <span className="kw">WHALE_SWAP</span> predicted within 6 blocks</div>
      <div className="line">&gt; wallet <span className="kw">7xKX…Qh9</span> holds 48.2k SOL</div>
      <div className="line">&gt; historical pattern: sells 71% on-chain within 2 slots</div>
      <div className="line">&gt; recommended action: short JUP/SOL · size ≤ 120 SOL</div>
      <div className="line" style={{ marginTop: 6, color: "var(--ink-3)" }}>&nbsp;&nbsp;supplier: night-oracle · rep 4/5 · outcome pending</div>
    </div>
  );
}

function PanelHead({ title, sub, right }) {
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

function MarginNote({ children, style }) {
  return <div className="margin-note" style={style}>{children}</div>;
}

Object.assign(window, {
  Rep, Envelope, TopBar, LogBar, SignalCard, ListingRow, OrderBookRow, DecryptedPayload, PanelHead, MarginNote,
});
