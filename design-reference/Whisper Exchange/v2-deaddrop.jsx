// V2 — Asymmetric Dead-Drop
// Narrow supplier on left, wider buyer on right. Heavy redacted styling, "classified" vibe.

function V2DeadDrop({ personas = true }) {
  const { SIGNALS, LISTINGS } = window;
  return (
    <div className="screen scan">
      <TopBar label="dead-drop protocol · classified channel" />
      <div className="split-asym">
        {/* SUPPLIER (narrow) */}
        <div className="panel" style={{ background: "#0e0e13" }}>
          <PanelHead title="SUPPLIER // DROP" sub="handle: night-oracle · rep 4/5" right={<Rep score={4} />} />
          <div className="panel-body">
            <div className="label">SIGNAL INTERCEPTS</div>
            <div className="list" style={{ gap: 5 }}>
              {SIGNALS.map((s) => (
                <div key={s.id} className="wf" style={{ padding: 8, background: "#0d0d12", borderStyle: "dashed" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="label" style={{ color: "var(--accent)" }}>// {s.tag}</span>
                    <span className="mono" style={{ fontSize: 9, color: "var(--ink-3)" }}>{s.meta.split("·")[1]}</span>
                  </div>
                  <div style={{ fontSize: 11, marginTop: 3 }}>{s.title}</div>
                  <div className="redact-line"><span className="bar" /><span className="bar short" /></div>
                  <div className="redact-line"><span className="bar mid" /><span className="bar" /></div>
                </div>
              ))}
            </div>

            <div className="label" style={{ marginTop: 8 }}>COMPOSE DROP</div>
            <div className="wf-dashed" style={{ padding: 10 }}>
              <div className="field"><label>dead-drop category</label><div className="inp">WHALE ▾</div></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                <div className="field"><label>price</label><div className="inp" style={{ color: "var(--accent)" }}>2.40 ◎</div></div>
                <div className="field"><label>ttl</label><div className="inp">6 slots</div></div>
              </div>
              <div className="field" style={{ marginTop: 6 }}>
                <label>payload</label>
                <div style={{ border: "1px dashed var(--accent-dim)", padding: 8, background: "rgba(157,78,221,0.04)" }}>
                  <div className="redact-line"><span className="bar" /></div>
                  <div className="redact-line"><span className="bar mid" /><span className="bar short" /></div>
                  <div className="redact-line"><span className="bar" /><span className="bar" /></div>
                  <div className="mono" style={{ fontSize: 9, color: "var(--ink-3)", marginTop: 4 }}>// sealed with supplier.pk · AES-256</div>
                </div>
              </div>
              <button className="btn glow" style={{ width: "100%", marginTop: 8 }}>☍ SEAL &amp; DROP</button>
            </div>
          </div>
        </div>

        {/* BUYER (wide) */}
        <div className="panel">
          <PanelHead
            title="BUYER // RETRIEVE"
            sub="6 sealed drops in channel · filter: all categories"
            right={<span className="pill accent">PRIVATE MODE</span>}
          />
          <div className="panel-body">
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, flex: 1, minHeight: 0 }}>
              {/* book */}
              <div>
                <div className="label">DROP BOOK</div>
                <div className="wf" style={{ background: "#0d0d12" }}>
                  {LISTINGS.map((l, i) => (
                    <div key={l.id} className="ob" style={{ gridTemplateColumns: "60px 1fr 70px 60px 30px" }}>
                      <span className="cat">{l.cat}</span>
                      <span style={{ display: "flex", gap: 4 }}>
                        <span className="redacted" style={{ height: 8, flex: 1 }}>&nbsp;</span>
                        <span className="redacted" style={{ height: 8, width: 24 }}>&nbsp;</span>
                      </span>
                      <Rep score={l.rep} />
                      <span className="price">{l.price} ◎</span>
                      <Envelope size={14} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button className="btn glow" style={{ flex: 1 }}>RETRIEVE · 0.80 ◎</button>
                  <button className="btn ghost">HOLD</button>
                </div>
              </div>

              {/* payload */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="label">LAST RETRIEVED</div>
                <DecryptedPayload />
                <div className="label">ARCHIVE</div>
                <div className="list" style={{ gap: 4 }}>
                  {window.BUYER_INVENTORY.map((b) => (
                    <div key={b.id} className="row" style={{ padding: "6px 8px" }}>
                      <Envelope size={14} sealed={b.status !== "DECRYPTED"} />
                      <span className="cell" style={{ flex: 1 }}>{b.id} · {b.cat}</span>
                      <span className="pill">{b.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <LogBar />
    </div>
  );
}

window.V2DeadDrop = V2DeadDrop;
