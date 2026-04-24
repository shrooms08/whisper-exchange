// V1 — Classic 50/50 Bloomberg Terminal
// Balanced two-column, envelope-slides animation in log bar.

function V1Bloomberg({ personas = true }) {
  const { SIGNALS, LISTINGS, BUYER_INVENTORY } = window;
  return (
    <div className="screen scan">
      <TopBar label="supplier // buyer · split 50/50" />
      <div className="split-2">
        {/* SUPPLIER */}
        <div className="panel">
          <PanelHead
            title="SUPPLIER AGENT · console"
            sub="detecting · sealing · listing"
            right={<span className="pill accent"><span className="dot v" /> LIVE</span>}
          />
          <div className="panel-body">
            <div className="label">LIVE SIGNAL FEED</div>
            <div className="list" style={{ gap: 6 }}>
              {SIGNALS.map((s) => <SignalCard key={s.id} s={s} />)}
            </div>

            <div className="label" style={{ marginTop: 6 }}>CREATE SEALED LISTING</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div className="field">
                <label>category</label>
                <div className="inp">WHALE ▾</div>
              </div>
              <div className="field">
                <label>price (SOL)</label>
                <div className="inp" style={{ color: "var(--accent)" }}>2.40 ◎</div>
              </div>
              <div className="field">
                <label>expiry</label>
                <div className="inp">6 slots</div>
              </div>
            </div>
            <div className="field">
              <label>payload · encrypted preview</label>
              <div className="inp" style={{ height: 52, alignItems: "flex-start", padding: 8, fontSize: 10, color: "var(--ink-3)" }}>
                ▓▓▓▓ ▓▓▓▓▓▓ ▓▓▓▓ ▓▓▓▓▓▓▓▓ ▓▓ ▓▓▓▓▓▓▓<br />
                ▓▓▓▓▓▓▓▓ ▓▓▓ ▓▓▓▓ ▓▓▓▓▓ ▓▓▓▓▓▓
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn">SEAL &amp; PUBLISH</button>
              <button className="btn ghost">SIMULATE</button>
            </div>

            <div className="label" style={{ marginTop: 6 }}>MY ACTIVE LISTINGS · 3</div>
            <div className="list">
              {LISTINGS.slice(0, 3).map((l) => <ListingRow key={l.id} l={l} personas={personas} />)}
            </div>
          </div>
        </div>

        {/* BUYER */}
        <div className="panel">
          <PanelHead
            title="BUYER AGENT · console"
            sub="browse · purchase · decrypt"
            right={<span className="pill">balance 128.4 ◎</span>}
          />
          <div className="panel-body">
            <div className="label">SEALED ORDER BOOK · 6</div>
            <div className="wf" style={{ background: "#0d0d12" }}>
              <div className="ob" style={{ color: "var(--ink-3)", fontSize: 10, letterSpacing: "0.08em" }}>
                <span>CAT</span><span>TITLE (sealed)</span><span>REP</span><span>PRICE</span><span></span>
              </div>
              {LISTINGS.map((l) => <OrderBookRow key={l.id} l={l} />)}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn glow" style={{ flex: 1 }}>PURCHASE PRIVATELY · 2.40 ◎</button>
              <button className="btn ghost">INSPECT META</button>
            </div>

            <div className="label" style={{ marginTop: 4 }}>DECRYPTED PAYLOAD</div>
            <DecryptedPayload />
          </div>
        </div>
      </div>
      <LogBar />
    </div>
  );
}

window.V1Bloomberg = V1Bloomberg;
