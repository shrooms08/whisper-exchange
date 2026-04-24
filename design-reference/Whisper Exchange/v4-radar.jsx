// V4 — Stacked console with radar signal feed
// Supplier on top, buyer on bottom. Signals visualized as a radar.

function V4Radar({ personas = true }) {
  const { SIGNALS, LISTINGS } = window;
  return (
    <div className="screen scan">
      <TopBar label="stacked · radar signal topology" />
      <div className="split-v">
        {/* SUPPLIER */}
        <div className="panel" style={{ flex: 1, minHeight: 0 }}>
          <PanelHead title="SUPPLIER · radar console" sub="3 pings in sweep · 4 drops queued" right={<span className="pill accent"><span className="dot v" /> SWEEP</span>} />
          <div className="panel-body" style={{ flexDirection: "row", gap: 14 }}>
            {/* radar */}
            <div style={{ width: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div className="radar" style={{ width: 180, height: 180 }}>
                <svg viewBox="0 0 200 200" style={{ width: "100%", height: "100%" }}>
                  <circle cx="100" cy="100" r="90" fill="none" stroke="var(--rule)" />
                  <circle cx="100" cy="100" r="60" fill="none" stroke="var(--rule-2)" />
                  <circle cx="100" cy="100" r="30" fill="none" stroke="var(--rule-2)" />
                  <line x1="100" y1="10" x2="100" y2="190" stroke="var(--rule-2)" />
                  <line x1="10" y1="100" x2="190" y2="100" stroke="var(--rule-2)" />
                  {/* pings */}
                  <circle cx="138" cy="72" r="4" fill="var(--accent)" />
                  <circle cx="138" cy="72" r="10" fill="none" stroke="var(--accent-dim)" />
                  <circle cx="62"  cy="128" r="3" fill="var(--accent)" />
                  <circle cx="62"  cy="128" r="8" fill="none" stroke="var(--accent-dim)" />
                  <circle cx="120" cy="150" r="3" fill="var(--accent)" />
                </svg>
                <svg viewBox="0 0 200 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                  <g className="sweep" style={{ transformOrigin: "100px 100px" }}>
                    <defs>
                      <linearGradient id="sw" x1="0" x2="1">
                        <stop offset="0" stopColor="oklch(0.68 0.25 300)" stopOpacity="0.35" />
                        <stop offset="1" stopColor="oklch(0.68 0.25 300)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M100 100 L190 100 A90 90 0 0 0 160 40 Z" fill="url(#sw)" />
                  </g>
                </svg>
              </div>
            </div>

            {/* signal list + compose */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
              <div className="label">PINGS · last sweep</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {SIGNALS.map((s) => <SignalCard key={s.id} s={s} />)}
              </div>

              <div className="label" style={{ marginTop: 4 }}>COMPOSE SEALED LISTING</div>
              <div className="wf-dashed" style={{ padding: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                <div className="field"><label>cat</label><div className="inp">WHALE ▾</div></div>
                <div className="field"><label>price (SOL)</label><div className="inp" style={{ color: "var(--accent)" }}>2.40 ◎</div></div>
                <div className="field"><label>ttl</label><div className="inp">6 slots</div></div>
                <button className="btn glow">SEAL ▸</button>
              </div>
            </div>
          </div>
        </div>

        {/* BUYER */}
        <div className="panel" style={{ flex: 1, minHeight: 0 }}>
          <PanelHead title="BUYER · retrieval console" sub="6 sealed · scroll to browse" right={<span className="pill">bal 128.4 ◎</span>} />
          <div className="panel-body" style={{ flexDirection: "row", gap: 14 }}>
            <div style={{ flex: 1.2, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div className="label">SEALED ORDER BOOK</div>
              <div className="wf" style={{ background: "#0d0d12", flex: 1, minHeight: 0 }}>
                <div className="ob" style={{ color: "var(--ink-3)", fontSize: 10 }}>
                  <span>CAT</span><span>TITLE (sealed)</span><span>REP</span><span>PRICE</span><span></span>
                </div>
                {LISTINGS.map((l) => <OrderBookRow key={l.id} l={l} />)}
              </div>
              <button className="btn glow" style={{ marginTop: 8 }}>PURCHASE PRIVATELY · 2.40 ◎</button>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
              <div className="label">DECRYPTED PAYLOAD</div>
              <DecryptedPayload />
            </div>
          </div>
        </div>
      </div>
      <LogBar />
    </div>
  );
}

window.V4Radar = V4Radar;
