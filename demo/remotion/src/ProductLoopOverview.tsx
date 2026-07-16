import { Audio } from "@remotion/media";
import { Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CaptionTrack } from "./CaptionTrack";
import {
  Arrow,
  codeFont,
  OverviewBackground,
  OverviewChip,
  OverviewEyebrow,
  OverviewHeader,
  OverviewPanel,
  OverviewScene,
  OverviewTitle,
  overviewPalette,
  Reveal,
  toneColor,
  uiFont,
} from "./OverviewKit";
import type { NarrationScene } from "./useNarratedAssets";
import { useNarratedAssets } from "./useNarratedAssets";

const tone = "violet" as const;

const Hook: React.FC<{ readonly duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const orbit = (frame / Math.max(1, duration)) * 360;
  return (
    <OverviewScene durationInFrames={duration}>
      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 76, flex: 1, alignItems: "center" }}>
        <div>
          <OverviewEyebrow tone={tone}>Ecosystem overview</OverviewEyebrow>
          <OverviewTitle maxWidth={920}>Governance is a system, not one guard.</OverviewTitle>
          <div style={{ marginTop: 28, color: overviewPalette.muted, fontSize: 37, lineHeight: 1.32, maxWidth: 820 }}>
            ProductLoop OS composes policy-gated workflow primitives in TypeScript.
          </div>
        </div>
        <div style={{ position: "relative", height: 560 }}>
          <div
            style={{
              position: "absolute",
              inset: 40,
              borderRadius: "50%",
              border: `1px solid ${toneColor(tone)}55`,
              rotate: `${orbit}deg`,
            }}
          >
            {[0, 90, 180, 270].map((angle) => (
              <span
                key={angle}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  backgroundColor: angle % 180 === 0 ? overviewPalette.violet : overviewPalette.blue,
                  translate: `calc(-50% + ${Math.cos((angle * Math.PI) / 180) * 240}px) calc(-50% + ${Math.sin((angle * Math.PI) / 180) * 240}px)`,
                  boxShadow: `0 0 24px ${overviewPalette.violet}77`,
                }}
              />
            ))}
          </div>
          <OverviewPanel
            tone={tone}
            style={{
              position: "absolute",
              inset: 150,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <div style={{ color: overviewPalette.violet, fontFamily: codeFont, fontSize: 22, letterSpacing: 2.8 }}>ONE INSTALL</div>
            <div style={{ marginTop: 12, fontSize: 47, fontWeight: 760 }}>ProductLoop OS</div>
            <div style={{ marginTop: 10, color: overviewPalette.muted, fontSize: 24 }}>explicit composition</div>
          </OverviewPanel>
        </div>
      </div>
    </OverviewScene>
  );
};

const Modules: React.FC<{ readonly duration: number }> = ({ duration }) => {
  const modules = [
    ["runtime", "ordered tools"],
    ["policy", "allow / deny / review"],
    ["approvals", "human tickets"],
    ["provenance", "hash-linked traces"],
    ["evals", "deterministic reports"],
    ["connectors", "manifests + trust"],
    ["skills", "signed manifests"],
    ["browser research", "plans + replay"],
    ["Maqam", "agents + crawler"],
  ];
  return (
    <OverviewScene durationInFrames={duration}>
      <OverviewEyebrow tone={tone}>One umbrella · named namespaces</OverviewEyebrow>
      <OverviewTitle size={76}>Maqam plus eight focused Ajnas modules.</OverviewTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 17, marginTop: 38, flex: 1 }}>
        {modules.map(([name, detail], index) => (
          <Reveal key={name} from={8 + index * 3} style={{ display: "flex" }}>
            <OverviewPanel
              tone={name === "Maqam" ? "green" : index % 2 === 0 ? "violet" : "blue"}
              style={{ padding: "20px 23px", flex: 1, display: "flex", alignItems: "center", gap: 17 }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  flex: "0 0 auto",
                  borderRadius: 12,
                  display: "grid",
                  placeItems: "center",
                  color: name === "Maqam" ? overviewPalette.green : overviewPalette.violet,
                  backgroundColor: name === "Maqam" ? `${overviewPalette.green}15` : `${overviewPalette.violet}15`,
                  fontFamily: codeFont,
                  fontSize: 19,
                  fontWeight: 800,
                }}
              >
                {String(index + 1).padStart(2, "0")}
              </div>
              <div>
                <div style={{ fontSize: 30, fontWeight: 730 }}>{name}</div>
                <div style={{ marginTop: 4, color: overviewPalette.muted, fontSize: 21 }}>{detail}</div>
              </div>
            </OverviewPanel>
          </Reveal>
        ))}
      </div>
    </OverviewScene>
  );
};

const DefaultDeny: React.FC<{ readonly duration: number }> = ({ duration }) => (
  <OverviewScene durationInFrames={duration}>
    <OverviewEyebrow tone={tone}>Default composition</OverviewEyebrow>
    <OverviewTitle>Deny until a reviewed rule says otherwise.</OverviewTitle>
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", alignItems: "center", gap: 24, flex: 1, marginTop: 38 }}>
      <Reveal from={8}>
        <OverviewPanel style={{ padding: 30, minHeight: 260 }}>
          <OverviewChip tone="blue">TOOL REQUEST</OverviewChip>
          <div style={{ marginTop: 26, fontFamily: codeFont, fontSize: 31 }}>local.echo</div>
          <div style={{ marginTop: 15, color: overviewPalette.muted, fontSize: 25 }}>name · risk · input · metadata</div>
        </OverviewPanel>
      </Reveal>
      <Arrow tone="violet" />
      <Reveal from={20}>
        <OverviewPanel tone="violet" style={{ padding: 30, minHeight: 260 }}>
          <OverviewChip tone="violet">POLICY ENGINE</OverviewChip>
          <div style={{ marginTop: 24, fontSize: 34, fontWeight: 730 }}>Explicit bundle</div>
          <div style={{ marginTop: 15, color: overviewPalette.muted, fontSize: 25 }}>decision enters policy audit</div>
        </OverviewPanel>
      </Reveal>
      <Arrow tone="red" />
      <Reveal from={32}>
        <OverviewPanel tone="red" style={{ padding: 30, minHeight: 260 }}>
          <OverviewChip tone="red">DEFAULT</OverviewChip>
          <div style={{ marginTop: 24, color: overviewPalette.red, fontSize: 47, fontWeight: 780 }}>DENY</div>
          <div style={{ marginTop: 10, color: overviewPalette.muted, fontSize: 25 }}>no implicit tool access</div>
        </OverviewPanel>
      </Reveal>
    </div>
  </OverviewScene>
);

const Approval: React.FC<{ readonly duration: number }> = ({ duration }) => {
  const fields = ["run", "step", "tool", "risk", "input", "metadata", "reason", "prompt"];
  return (
    <OverviewScene durationInFrames={duration}>
      <div style={{ display: "grid", gridTemplateColumns: "0.82fr 1.18fr", gap: 70, flex: 1, alignItems: "center" }}>
        <div>
          <OverviewEyebrow tone="amber">Review binding</OverviewEyebrow>
          <OverviewTitle size={78}>Approval echoes one exact digest.</OverviewTitle>
          <div style={{ marginTop: 28, color: overviewPalette.muted, fontSize: 34, lineHeight: 1.35 }}>
            A mismatched or missing <span style={{ color: overviewPalette.amber, fontFamily: codeFont }}>bindingDigest</span> fails before execution.
          </div>
        </div>
        <OverviewPanel tone="amber" style={{ padding: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <OverviewChip tone="amber">SHA-256 BINDING</OverviewChip>
            <span style={{ color: overviewPalette.muted, fontFamily: codeFont, fontSize: 20 }}>canonical JSON</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 13, marginTop: 28 }}>
            {fields.map((field, index) => (
              <Reveal key={field} from={10 + index * 3}>
                <div
                  style={{
                    height: 84,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 14,
                    border: `1px solid ${overviewPalette.amber}44`,
                    backgroundColor: `${overviewPalette.amber}0d`,
                    color: overviewPalette.paper,
                    fontFamily: codeFont,
                    fontSize: 24,
                  }}
                >
                  {field}
                </div>
              </Reveal>
            ))}
          </div>
          <div style={{ marginTop: 24, padding: "17px 20px", borderRadius: 12, backgroundColor: "rgba(0,0,0,0.28)", fontFamily: codeFont, fontSize: 23, color: overviewPalette.amber }}>
            approval.bindingDigest === request.bindingDigest
          </div>
        </OverviewPanel>
      </div>
    </OverviewScene>
  );
};

const Bridges: React.FC<{ readonly duration: number }> = ({ duration }) => {
  const bridges = [
    ["runtime events", "provenance trace"],
    ["skill audit", "provenance trace"],
    ["run snapshot", "eval artifact"],
    ["browser report", "eval artifact"],
  ];
  return (
    <OverviewScene durationInFrames={duration}>
      <OverviewEyebrow tone="blue">Tested bridges</OverviewEyebrow>
      <OverviewTitle size={78}>Translate only where schemas agree.</OverviewTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, marginTop: 40, flex: 1 }}>
        {bridges.map(([source, target], index) => (
          <Reveal key={source} from={8 + index * 7} style={{ display: "flex" }}>
            <OverviewPanel style={{ padding: 25, flex: 1, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 22 }}>
              <div>
                <div style={{ color: overviewPalette.muted, fontSize: 19, letterSpacing: 2 }}>SOURCE</div>
                <div style={{ marginTop: 8, fontSize: 30, fontWeight: 720 }}>{source}</div>
              </div>
              <Arrow tone={index < 2 ? "violet" : "blue"} />
              <div>
                <div style={{ color: overviewPalette.muted, fontSize: 19, letterSpacing: 2 }}>COPIED AS</div>
                <div style={{ marginTop: 8, color: index < 2 ? overviewPalette.violet : overviewPalette.blue, fontSize: 30, fontWeight: 720 }}>{target}</div>
              </div>
            </OverviewPanel>
          </Reveal>
        ))}
      </div>
    </OverviewScene>
  );
};

const MaqamBridge: React.FC<{ readonly duration: number }> = ({ duration }) => (
  <OverviewScene durationInFrames={duration}>
    <OverviewEyebrow tone="green">Explicit subsystem boundary</OverviewEyebrow>
    <OverviewTitle size={77}>Maqam is composed, not silently merged.</OverviewTitle>
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 30, alignItems: "center", flex: 1, marginTop: 34 }}>
      <OverviewPanel tone="green" style={{ padding: 31, minHeight: 340 }}>
        <OverviewChip tone="green">MAQAM</OverviewChip>
        <div style={{ marginTop: 26, fontSize: 38, fontWeight: 740 }}>Policy · evidence · approvals</div>
        <div style={{ marginTop: 18, color: overviewPalette.muted, fontSize: 29, lineHeight: 1.35 }}>
          ToolGateway, workflow runtime, CLI agents, HTTP crawler
        </div>
      </OverviewPanel>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <Arrow tone="amber" />
        <OverviewChip tone="amber">EXPLICIT ADAPTER</OverviewChip>
        <div style={{ color: overviewPalette.muted, fontSize: 22, textAlign: "center", maxWidth: 220 }}>
          crawler → high-risk runtime tool
        </div>
      </div>
      <OverviewPanel tone="violet" style={{ padding: 31, minHeight: 340 }}>
        <OverviewChip tone="violet">PRODUCTLOOP RUNTIME</OverviewChip>
        <div style={{ marginTop: 26, fontSize: 38, fontWeight: 740 }}>Own contracts · own stores</div>
        <div style={{ marginTop: 18, color: overviewPalette.muted, fontSize: 29, lineHeight: 1.35 }}>
          Nothing is registered or executed automatically.
        </div>
      </OverviewPanel>
    </div>
  </OverviewScene>
);

const Boundaries: React.FC<{ readonly duration: number }> = ({ duration }) => {
  const hostOwned = ["models", "live browsers", "credentials", "identity", "sandboxes", "databases", "schedulers"];
  return (
    <OverviewScene durationInFrames={duration}>
      <OverviewEyebrow tone="red">Production boundary</OverviewEyebrow>
      <OverviewTitle size={76}>Inspectability is not infrastructure.</OverviewTitle>
      <div style={{ display: "grid", gridTemplateColumns: "0.88fr 1.12fr", gap: 28, flex: 1, marginTop: 36 }}>
        <OverviewPanel tone="green" style={{ padding: 30 }}>
          <OverviewChip tone="green">IN PROCESS</OverviewChip>
          <div style={{ marginTop: 28, fontSize: 40, fontWeight: 740 }}>Registries, ledgers, policies, adapters.</div>
          <div style={{ marginTop: 22, color: overviewPalette.muted, fontSize: 29, lineHeight: 1.4 }}>
            Useful records and narrow interfaces. No distributed transaction is implied.
          </div>
        </OverviewPanel>
        <OverviewPanel tone="red" style={{ padding: 30 }}>
          <OverviewChip tone="red">HOST OWNED</OverviewChip>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 13, marginTop: 28 }}>
            {hostOwned.map((item, index) => (
              <Reveal key={item} from={8 + index * 3}>
                <div style={{ padding: "13px 17px", borderRadius: 12, color: overviewPalette.paper, backgroundColor: "rgba(255,130,125,0.09)", border: "1px solid rgba(255,130,125,0.24)", fontSize: 27, fontWeight: 680 }}>
                  {item}
                </div>
              </Reveal>
            ))}
          </div>
          <div style={{ marginTop: 25, color: overviewPalette.muted, fontSize: 27 }}>
            Add persistence, retries and reconciliation at deployment scale.
          </div>
        </OverviewPanel>
      </div>
    </OverviewScene>
  );
};

const Final: React.FC<{ readonly duration: number }> = ({ duration }) => (
  <OverviewScene durationInFrames={duration}>
    <div style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 72, flex: 1, alignItems: "center" }}>
      <div>
        <OverviewEyebrow tone={tone}>Start with the boundary</OverviewEyebrow>
        <OverviewTitle size={80}>Expose only the tools you reviewed.</OverviewTitle>
        <div style={{ marginTop: 28, color: overviewPalette.muted, fontSize: 34, lineHeight: 1.35 }}>
          Provider-neutral primitives. Early 0.x APIs. No hosted control plane.
        </div>
      </div>
      <OverviewPanel tone={tone} style={{ padding: 34 }}>
        <div style={{ color: overviewPalette.muted, fontSize: 20, letterSpacing: 2.5 }}>TERMINAL</div>
        <div style={{ marginTop: 24, fontFamily: codeFont, fontSize: 32, lineHeight: 1.7 }}>
          <div><span style={{ color: overviewPalette.violet }}>$</span> npm install productloop-os</div>
          <div><span style={{ color: overviewPalette.violet }}>$</span> npx productloop-os doctor --json</div>
        </div>
        <div style={{ marginTop: 22, paddingTop: 22, borderTop: `1px solid ${overviewPalette.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <OverviewChip tone="green">MODULE IMPORTS CHECKED</OverviewChip>
          <span style={{ color: overviewPalette.muted, fontSize: 22 }}>external services not probed</span>
        </div>
      </OverviewPanel>
    </div>
  </OverviewScene>
);

const sceneComponent = (timing: NarrationScene, duration: number) => {
  switch (timing.scene) {
    case "hook": return <Hook duration={duration} />;
    case "modules": return <Modules duration={duration} />;
    case "default": return <DefaultDeny duration={duration} />;
    case "approval": return <Approval duration={duration} />;
    case "bridges": return <Bridges duration={duration} />;
    case "maqam": return <MaqamBridge duration={duration} />;
    case "boundaries": return <Boundaries duration={duration} />;
    case "final": return <Final duration={duration} />;
    default: throw new Error(`Unknown ProductLoop scene '${timing.scene}'.`);
  }
};

export const ProductLoopOverview: React.FC = () => {
  const assets = useNarratedAssets("productloop");
  const { fps } = useVideoConfig();
  if (!assets) return null;
  return (
    <>
      <OverviewBackground tone={tone} />
      {assets.scenes.map((timing) => {
        const from = Math.round((timing.startMs / 1000) * fps);
        const end = Math.round((timing.endMs / 1000) * fps);
        const duration = Math.max(1, end - from);
        return (
          <Sequence key={timing.scene} name={`ProductLoop · ${timing.scene}`} from={from} durationInFrames={duration} premountFor={fps}>
            {sceneComponent(timing, duration)}
          </Sequence>
        );
      })}
      <OverviewHeader brand="PRODUCTLOOP OS" label="COMPOSABLE GOVERNANCE" tone={tone} />
      <Audio src={staticFile(assets.audioFile)} volume={0.96} />
      <CaptionTrack captions={assets.captions} />
      <div style={{ position: "absolute", right: 90, bottom: 49, color: overviewPalette.muted, fontFamily: uiFont, fontSize: 18, letterSpacing: 1.2 }}>
        LOCAL SAPI VOICE · NO CLOUD TTS
      </div>
    </>
  );
};
