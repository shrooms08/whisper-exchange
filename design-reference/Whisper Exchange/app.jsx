// App: design canvas + tweaks

const ACCENTS = {
  violet: "oklch(0.68 0.25 300)",
  cyan:   "oklch(0.78 0.17 210)",
  amber:  "oklch(0.80 0.18 70)",
};

function App() {
  const defaults = JSON.parse(document.getElementById("_tweak_defaults").textContent);
  const [tweaks, setTweak] = window.useTweaks ? window.useTweaks(defaults) : [defaults, () => {}];

  React.useEffect(() => {
    const a = ACCENTS[tweaks.accent] || ACCENTS.violet;
    document.documentElement.style.setProperty("--accent", a);
    document.documentElement.style.setProperty("--accent-soft", a.replace(")", " / 0.18)").replace("oklch(", "oklch("));
    document.documentElement.style.setProperty("--accent-dim", a.replace(")", " / 0.45)").replace("oklch(", "oklch("));
  }, [tweaks.accent]);

  const W = tweaks.density === "dense" ? 1440 : 1520;
  const H = 900;

  const { DesignCanvas, DCSection, DCArtboard,
          TweaksPanel, TweakSection, TweakRadio, TweakToggle } = window;

  return (
    <>
      <DesignCanvas initialZoom={0.55}>
        <DCSection
          id="wireframes"
          title="Whisper Exchange · split-screen dashboard"
          subtitle="4 wireframe directions · dark terminal · electric-violet accent"
        >
          <DCArtboard id="v1" label="V1 · Classic 50/50 Bloomberg" width={W} height={H}>
            <window.V1Bloomberg personas={tweaks.personas} />
          </DCArtboard>
          <DCArtboard id="v2" label="V2 · Asymmetric Dead-Drop" width={W} height={H}>
            <window.V2DeadDrop personas={tweaks.personas} />
          </DCArtboard>
          <DCArtboard id="v3" label="V3 · Triptych · Suppliers / Arena / Buyers" width={W} height={H}>
            <window.V3Triptych personas={tweaks.personas} />
          </DCArtboard>
          <DCArtboard id="v4" label="V4 · Stacked Radar Console" width={W} height={H}>
            <window.V4Radar personas={tweaks.personas} />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      {TweaksPanel && (
        <TweaksPanel title="Tweaks">
          <TweakSection label="Appearance" />
          <TweakRadio
            label="Accent"
            value={tweaks.accent}
            options={["violet", "cyan", "amber"]}
            onChange={(v) => setTweak("accent", v)}
          />
          <TweakRadio
            label="Density"
            value={tweaks.density}
            options={["breathing", "dense"]}
            onChange={(v) => setTweak("density", v)}
          />
          <TweakSection label="Agents" />
          <TweakToggle
            label="Show supplier handles"
            value={tweaks.personas}
            onChange={(v) => setTweak("personas", v)}
          />
        </TweaksPanel>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
