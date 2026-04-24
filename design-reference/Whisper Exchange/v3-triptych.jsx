// V3 — Triptych: Suppliers · Exchange Arena · Buyers
// Central arena shows the transaction happening (envelope fly between columns).

function V3Triptych({ personas = true }) {
  const { SIGNALS, LISTINGS } = window;
  const myListings = LISTINGS.slice(0, 3);
  return (
    <div className="screen scan">
      <TopBar label="triptych · suppliers / arena / buyers" />
      <div className="split-3">
        {/* SUPPLIERS */}
        <div className="panel">
          <PanelHead title="SUPPLIERS" sub="3 signals · 6 active drops" right={<span className="dot v" />} />
          <div className="panel-body">
            <div className="label">SIGNALS</div>
            <div className="list" style={{ gap: 5 }}>
              {SIGNALS.map((s) => <SignalCard key={s.id} s={s} />)}
            </div>
            <div className="label" style={{ marginTop: 6 }}>QUICK LIST</div>
            <div className="wf-dashed" style={{ padding: 8, fontSize: 11 }}>
              <div className="field"><label>cat</label><div className="inp">WHALE ▾</div></div>
              <div className="field" style={{ marginTop: 4 }}><label>price</label><div className="inp" style={{ color: "var(--accent)" }}>2.40 ◎</div></div>
              <button className="btn" style={{ width: "100%", marginTop: 6 }}>SEAL →</button>
            </div>

            <div className="label" style={{ marginTop: 6 }}>MY ACTIVE LISTINGS · 3</div>
            <div className="list">
              {myListings.map((l) => <ListingRow key={l.id} l={l} personas={personas} />)}
            </div>
          </div>
        </div>

        {/* ARENA */}
        <div className="panel arena">
          <PanelHead title="EXCHANGE ARENA" sub="live · 287,491,203" right={<span className="pill accent">SEALED</span>} />
          <div className="panel-body" style={{ alignItems: "stretch" }}>
            <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 0 }}>
              {/* flying envelopes */}
              <svg viewBox="0 0 300 300" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
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
                <div key={i} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 0" }}>
                  <div className="env-anim" style={{ animationDelay: `${i * 2}s` }}>
                    <Envelope size={24} />
                  </div>
                </div>
              ))}

              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div className="wf" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 10px", marginBottom: 10, background: "rgba(157,78,221,0.08)", borderColor: "var(--accent-dim)" }}>
                    <span className="dot v" />
                    <span className="label" style={{ color: "var(--accent)" }}>IN-FLIGHT</span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>envelope #e83 · buyer.0x91ae · 2.40 ◎</span>
                  </div>
                  <div className="label" style={{ color: "var(--accent)" }}>THROUGHPUT</div>
                  <div className="mono h" style={{ fontSize: 28, color: "var(--ink)", letterSpacing: "-0.02em" }}>14.2<span style={{ fontSize: 12, color: "var(--ink-3)" }}>/min</span></div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4 }}>sealed · private · final</div>
                </div>
              </div>
            </div>

            <div className="wf" style={{ padding: 8 }}>
              <div className="label" style={{ marginBottom: 6 }}>LAST 3 · IN-FLIGHT</div>
              {LISTINGS.slice(0, 3).map((l) => (
                <div key={l.id} className="ob" style={{ gridTemplateColumns: "60px 1fr 70px 60px 30px", borderBottom: "1px dashed var(--rule-2)" }}>
                  <span className="cat">{l.cat}</span>
                  <span className="redacted" style={{ height: 8 }}>&nbsp;</span>
                  <Rep score={l.rep} />
                  <span className="price">{l.price} ◎</span>
                  <Envelope size={14} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* BUYERS */}
        <div className="panel">
          <PanelHead title="BUYERS" sub="channel open · private mode" right={<span className="pill">128.4 ◎</span>} />
          <div className="panel-body">
            <div className="label">ORDER BOOK</div>
            <div className="wf" style={{ background: "#0d0d12" }}>
              {LISTINGS.map((l) => <OrderBookRow key={l.id} l={l} />)}
            </div>
            <button className="btn glow" style={{ width: "100%" }}>PURCHASE PRIVATELY</button>
            <div className="label" style={{ marginTop: 4 }}>DECRYPTED</div>
            <DecryptedPayload />

            <div className="label" style={{ marginTop: 4 }}>RATE OUTCOME</div>
            <div className="wf-dashed" style={{ padding: 10 }}>
              <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 8 }}>
                L-0412 · window closes in 4 slots · oracle pending
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn glow" style={{ flex: 1 }}>✓ TIP TRUE</button>
                <button className="btn ghost" style={{ flex: 1, borderColor: "var(--rule)" }}>✗ TIP FALSE</button>
              </div>
              <div className="mono" style={{ fontSize: 10, color: "var(--ink-2)", marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span>rep delta preview</span>
                <span style={{ color: "var(--accent)" }}>+0.12 → night-oracle</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <LogBar />
    </div>
  );
}

window.V3Triptych = V3Triptych;
