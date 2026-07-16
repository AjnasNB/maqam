import { Audio } from "@remotion/media";
import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { CaptionTrack } from "./CaptionTrack";
import type { DemoProof } from "./proof";
import { useDemoAssets } from "./useDemoAssets";

const palette = {
  ink: "#080b0d",
  panel: "#101518",
  panelRaised: "#151b1e",
  paper: "#f2efe7",
  muted: "#9da7a3",
  line: "rgba(255,255,255,0.12)",
  green: "#8fffc1",
  greenDim: "rgba(143,255,193,0.13)",
  red: "#ff7772",
  redDim: "rgba(255,119,114,0.13)",
  amber: "#f2c66d",
  blue: "#9bc8ff",
} as const;

const uiFont = "'Segoe UI', Arial, sans-serif";
const codeFont = "'Cascadia Code', Consolas, monospace";

const sceneTiming = {
  hook: { from: 0, duration: 150 },
  approval: { from: 150, duration: 156 },
  mismatch: { from: 306, duration: 234 },
  exact: { from: 540, duration: 199 },
  replay: { from: 739, duration: 214 },
  evidence: { from: 953, duration: 168 },
  summary: { from: 1121, duration: 378 },
  final: { from: 1499, duration: 301 },
} as const;

const shortHash = (value: string, length = 12) => {
  const normalized = value.replace(/^sha256:/, "");
  return `${normalized.slice(0, length)}…${normalized.slice(-6)}`;
};

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: palette.ink }}>
      <div
        style={{
          position: "absolute",
          inset: -240,
          background:
            "radial-gradient(circle at 20% 18%, rgba(74,163,120,0.20), transparent 31%), radial-gradient(circle at 82% 78%, rgba(72,110,159,0.16), transparent 34%)",
          translate: `${interpolate(frame, [0, 1800], [-20, 32], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px ${interpolate(frame, [0, 1800], [-12, 18], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.22,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          backgroundPosition: `${interpolate(frame, [0, 1800], [0, 80])}px 0`,
          maskImage: "linear-gradient(to bottom, black, transparent 88%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(8,11,13,0.08), rgba(8,11,13,0.48))",
        }}
      />
    </AbsoluteFill>
  );
};

const FrameHeader: React.FC = () => {
  const frame = useCurrentFrame();
  const seconds = Math.min(59, Math.floor(frame / 30));
  const timecode = `00:${String(seconds).padStart(2, "0")} / 01:00`;
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 48,
          left: 88,
          right: 88,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 10,
          fontFamily: uiFont,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 15,
              height: 15,
              borderRadius: "50%",
              backgroundColor: palette.green,
              boxShadow: "0 0 28px rgba(143,255,193,0.45)",
            }}
          />
          <div style={{ color: palette.paper, fontSize: 28, fontWeight: 750, letterSpacing: 5 }}>MAQAM</div>
          <div style={{ width: 1, height: 27, backgroundColor: palette.line }} />
          <div style={{ color: palette.muted, fontSize: 22, fontWeight: 600, letterSpacing: 2.2 }}>
            EXACT APPROVAL · REAL CLI PROOF
          </div>
        </div>
        <div
          style={{
            color: palette.muted,
            fontFamily: uiFont,
            fontSize: 21,
            fontWeight: 650,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: 0.8,
          }}
        >
          {timecode}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 100,
          left: 88,
          right: 88,
          height: 2,
          backgroundColor: "rgba(255,255,255,0.08)",
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: `${interpolate(frame, [0, 1799], [0, 100], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}%`,
            height: "100%",
            backgroundColor: palette.green,
          }}
        />
      </div>
    </>
  );
};

const SceneShell: React.FC<{
  readonly durationInFrames: number;
  readonly children: ReactNode;
}> = ({ durationInFrames, children }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        padding: "142px 108px 188px",
        fontFamily: uiFont,
        color: palette.paper,
        opacity: interpolate(
          frame,
          [0, 16, Math.max(17, durationInFrames - 18), durationInFrames],
          [0, 1, 1, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          },
        ),
        translate: `0 ${interpolate(frame, [0, 24], [18, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}px`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Eyebrow: React.FC<{ readonly children: ReactNode; readonly tone?: "green" | "red" }> = ({
  children,
  tone = "green",
}) => (
  <div
    style={{
      color: tone === "red" ? palette.red : palette.green,
      fontSize: 24,
      fontWeight: 720,
      letterSpacing: 3.8,
      textTransform: "uppercase",
      marginBottom: 18,
    }}
  >
    {children}
  </div>
);

const Title: React.FC<{ readonly children: ReactNode; readonly maxWidth?: number }> = ({
  children,
  maxWidth = 1500,
}) => (
  <div
    style={{
      maxWidth,
      color: palette.paper,
      fontSize: 96,
      fontWeight: 720,
      letterSpacing: -4.4,
      lineHeight: 0.98,
    }}
  >
    {children}
  </div>
);

const Card: React.FC<{
  readonly children: ReactNode;
  readonly style?: CSSProperties;
  readonly tone?: "neutral" | "green" | "red";
}> = ({ children, style, tone = "neutral" }) => (
  <div
    style={{
      backgroundColor:
        tone === "green" ? palette.greenDim : tone === "red" ? palette.redDim : "rgba(16,21,24,0.88)",
      border: `1px solid ${
        tone === "green"
          ? "rgba(143,255,193,0.32)"
          : tone === "red"
            ? "rgba(255,119,114,0.34)"
            : palette.line
      }`,
      borderRadius: 20,
      boxShadow: "0 28px 70px rgba(0,0,0,0.24)",
      ...style,
    }}
  >
    {children}
  </div>
);

const Status: React.FC<{
  readonly children: ReactNode;
  readonly tone?: "green" | "red" | "amber";
}> = ({ children, tone = "green" }) => {
  const color = tone === "red" ? palette.red : tone === "amber" ? palette.amber : palette.green;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        borderRadius: 999,
        color,
        border: `1px solid ${color}55`,
        backgroundColor: `${color}12`,
        fontFamily: codeFont,
        fontSize: 21,
        fontWeight: 700,
        letterSpacing: 0.4,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color }} />
      {children}
    </div>
  );
};

const Terminal: React.FC<{ readonly children: ReactNode; readonly style?: CSSProperties }> = ({
  children,
  style,
}) => (
  <Card style={{ overflow: "hidden", ...style }}>
    <div
      style={{
        height: 48,
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "0 18px",
        borderBottom: `1px solid ${palette.line}`,
        backgroundColor: "rgba(255,255,255,0.025)",
      }}
    >
      {["#ff7772", "#f2c66d", "#8fffc1"].map((color) => (
        <span key={color} style={{ width: 11, height: 11, borderRadius: "50%", backgroundColor: color }} />
      ))}
      <span style={{ marginLeft: 10, color: palette.muted, fontFamily: codeFont, fontSize: 18 }}>
        local · maqam
      </span>
    </div>
    <div
      style={{
        padding: "24px 28px 27px",
        color: "#d8ddd9",
        fontFamily: codeFont,
        fontSize: 29,
        lineHeight: 1.55,
      }}
    >
      {children}
    </div>
  </Card>
);

const KeyValue: React.FC<{
  readonly label: string;
  readonly value: ReactNode;
  readonly accent?: string;
}> = ({ label, value, accent }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "190px minmax(0, 1fr)",
      alignItems: "center",
      gap: 26,
      padding: "17px 0",
      borderBottom: `1px solid ${palette.line}`,
      fontFamily: codeFont,
      fontSize: 25,
    }}
  >
    <div style={{ color: palette.muted }}>{label}</div>
    <div style={{ color: accent ?? palette.paper, overflowWrap: "anywhere" }}>{value}</div>
  </div>
);

const HookScene: React.FC<{ readonly proof: DemoProof }> = ({ proof }) => {
  const frame = useCurrentFrame();
  return (
    <SceneShell durationInFrames={sceneTiming.hook.duration}>
      <div style={{ display: "flex", flex: 1, gap: 80, alignItems: "center" }}>
        <div style={{ width: 800 }}>
          <Eyebrow>One write request</Eyebrow>
          <Title maxWidth={790}>Approval should mean this exact action.</Title>
          <div style={{ marginTop: 28, color: palette.muted, fontSize: 38, lineHeight: 1.3 }}>
            Not a blanket yes. Not a reusable permission.
          </div>
        </div>
        <Terminal style={{ flex: 1, opacity: interpolate(frame, [18, 42], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }) }}>
          <div><span style={{ color: palette.green }}>$</span> maqam demo approval --json</div>
          <div style={{ marginTop: 20, color: palette.muted }}>requested effect</div>
          <div>write → {proof.approvedInput.path}</div>
          <div style={{ color: palette.blue }}>&quot;{proof.approvedInput.content}&quot;</div>
          <div style={{ marginTop: 22, color: Math.floor(frame / 12) % 2 === 0 ? palette.green : "transparent" }}>▌</div>
        </Terminal>
      </div>
    </SceneShell>
  );
};

const ApprovalScene: React.FC<{ readonly proof: DemoProof }> = ({ proof }) => {
  const [request] = proof.steps;
  const frame = useCurrentFrame();
  return (
    <SceneShell durationInFrames={sceneTiming.approval.duration}>
      <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 80, flex: 1, alignItems: "center" }}>
        <div>
          <Eyebrow>Step 01 · pause</Eyebrow>
          <Title maxWidth={730}>Approval becomes a receipt.</Title>
          <div style={{ marginTop: 30 }}><Status tone="amber">{request.code}</Status></div>
          <div style={{ marginTop: 28, color: palette.muted, fontSize: 36, lineHeight: 1.35 }}>
            The handler has not run. The target file does not exist.
          </div>
        </div>
        <Card style={{ padding: "30px 34px", opacity: interpolate(frame, [18, 40], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 30, fontWeight: 720 }}>{request.approvalId}</div>
            <Status tone="amber">{request.approvalStatus}</Status>
          </div>
          <div style={{ marginTop: 22 }}>
            <KeyValue label="run" value={request.scope.runId} />
            <KeyValue label="tool" value={request.scope.toolName} />
            <KeyValue label="input sha256" value={request.scope.inputHash} accent={palette.green} />
            <KeyValue label="effect" value={request.action} />
          </div>
          <div style={{ display: "flex", gap: 24, marginTop: 24, fontFamily: codeFont, fontSize: 23 }}>
            <span style={{ color: palette.green }}>executions {request.executions}</span>
            <span style={{ color: palette.muted }}>file exists {String(request.fileExists)}</span>
          </div>
        </Card>
      </div>
    </SceneShell>
  );
};

const MismatchScene: React.FC<{ readonly proof: DemoProof }> = ({ proof }) => {
  const [, altered] = proof.steps;
  const frame = useCurrentFrame();
  return (
    <SceneShell durationInFrames={sceneTiming.mismatch.duration}>
      <Eyebrow tone="red">Step 02 · mutate</Eyebrow>
      <Title>Change the input. It fails closed.</Title>
      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 0.75fr", gap: 34, flex: 1, marginTop: 42 }}>
        <Card style={{ padding: 30, display: "grid", gridTemplateRows: "1fr 1fr", gap: 20 }}>
          <div style={{ borderBottom: `1px solid ${palette.line}`, paddingBottom: 22 }}>
            <div style={{ color: palette.muted, fontSize: 22, letterSpacing: 2.5, fontWeight: 700 }}>APPROVED INPUT</div>
            <div style={{ marginTop: 16, fontFamily: codeFont, fontSize: 29, lineHeight: 1.45 }}>
              content: <span style={{ color: palette.green }}>&quot;{proof.approvedInput.content}&quot;</span>
            </div>
          </div>
          <div style={{ opacity: interpolate(frame, [22, 48], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }) }}>
            <div style={{ color: palette.red, fontSize: 22, letterSpacing: 2.5, fontWeight: 700 }}>ALTERED INPUT</div>
            <div style={{ marginTop: 16, fontFamily: codeFont, fontSize: 29, lineHeight: 1.45 }}>
              content: <span style={{ color: palette.red, backgroundColor: palette.redDim, padding: "5px 9px" }}>&quot;{proof.alteredInput.content}&quot;</span>
            </div>
          </div>
        </Card>
        <Card tone="red" style={{ padding: 32, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <Status tone="red">BLOCKED</Status>
            <div style={{ marginTop: 24, color: palette.red, fontFamily: codeFont, fontSize: 29, fontWeight: 760, lineHeight: 1.25 }}>
              {altered.code}
            </div>
            <div style={{ marginTop: 20, color: palette.paper, fontSize: 32, lineHeight: 1.3 }}>
              {altered.message}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><div style={{ color: palette.muted, fontSize: 20 }}>EXECUTIONS</div><div style={{ color: palette.paper, fontSize: 52, fontWeight: 740 }}>{altered.executions}</div></div>
            <div><div style={{ color: palette.muted, fontSize: 20 }}>FILE EXISTS</div><div style={{ color: palette.paper, fontSize: 52, fontWeight: 740 }}>{String(altered.fileExists)}</div></div>
          </div>
        </Card>
      </div>
    </SceneShell>
  );
};

const ExactScene: React.FC<{ readonly proof: DemoProof }> = ({ proof }) => {
  const [, , exact] = proof.steps;
  const frame = useCurrentFrame();
  return (
    <SceneShell durationInFrames={sceneTiming.exact.duration}>
      <Eyebrow>Step 03 · restore</Eyebrow>
      <Title>Exact input. One verified write.</Title>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 0.88fr", gap: 34, flex: 1, marginTop: 42 }}>
        <Terminal>
          <div><span style={{ color: palette.green }}>✓</span> approval scope matched</div>
          <div><span style={{ color: palette.green }}>✓</span> handler executed once</div>
          <div><span style={{ color: palette.green }}>✓</span> stored bytes verified</div>
          <div style={{ marginTop: 24, color: palette.muted }}>result.contentHash</div>
          <div style={{ color: palette.blue, overflowWrap: "anywhere" }}>{exact.result.contentHash}</div>
        </Terminal>
        <Card tone="green" style={{ padding: 32, display: "flex", flexDirection: "column", justifyContent: "space-between", opacity: interpolate(frame, [22, 50], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }) }}>
          <div>
            <Status>COMPLETED</Status>
            <div style={{ marginTop: 24, color: palette.muted, fontFamily: codeFont, fontSize: 23 }}>{exact.file.path}</div>
            <div style={{ marginTop: 16, color: palette.paper, fontFamily: codeFont, fontSize: 34, lineHeight: 1.35 }}>
              &quot;{exact.file.content}&quot;
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {[
              ["EXECUTIONS", exact.executions],
              ["CONSUMED", exact.approvalConsumptions],
              ["BYTES", exact.result.bytes],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ color: palette.muted, fontSize: 18 }}>{label}</div>
                <div style={{ color: palette.green, fontSize: 50, fontWeight: 750 }}>{value}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </SceneShell>
  );
};

const ReplayScene: React.FC<{ readonly proof: DemoProof }> = ({ proof }) => {
  const [, , , replay] = proof.steps;
  const frame = useCurrentFrame();
  return (
    <SceneShell durationInFrames={sceneTiming.replay.duration}>
      <Eyebrow tone="red">Step 04 · replay</Eyebrow>
      <Title>Consumed means consumed.</Title>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 180px 1fr", gap: 24, alignItems: "center", flex: 1, marginTop: 40 }}>
        <Card style={{ padding: 34 }}>
          <div style={{ color: palette.muted, fontSize: 22, letterSpacing: 2 }}>APPROVAL RECEIPT</div>
          <div style={{ marginTop: 18, fontSize: 43, fontWeight: 750 }}>{proof.approval.approvalId}</div>
          <KeyValue label="reusable" value={String(proof.approval.reusable)} />
          <KeyValue label="consumptions" value={proof.approval.consumptions.length} accent={palette.green} />
          <div style={{ marginTop: 18 }}><Status>CONSUMED ONCE</Status></div>
        </Card>
        <div
          style={{
            textAlign: "center",
            color: palette.red,
            fontSize: 76,
            opacity: interpolate(frame, [30, 58], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: `${interpolate(frame, [30, 58], [-26, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            })}px 0`,
          }}
        >
          →
        </div>
        <Card tone="red" style={{ padding: 34 }}>
          <Status tone="red">REPLAY BLOCKED</Status>
          <div style={{ marginTop: 24, color: palette.red, fontFamily: codeFont, fontSize: 30, fontWeight: 750 }}>{replay.code}</div>
          <div style={{ marginTop: 20, color: palette.paper, fontSize: 31, lineHeight: 1.3 }}>{replay.message}</div>
          <div style={{ display: "flex", gap: 28, marginTop: 30, fontFamily: codeFont, fontSize: 22 }}>
            <span>executions <b style={{ color: palette.green }}>{replay.executions}</b></span>
            <span>file unchanged <b style={{ color: palette.green }}>{String(replay.fileUnchanged)}</b></span>
          </div>
        </Card>
      </div>
    </SceneShell>
  );
};

const EvidenceScene: React.FC<{ readonly proof: DemoProof }> = ({ proof }) => {
  const frame = useCurrentFrame();
  const evidence = proof.evidence.evidence[0];
  const claim = proof.evidence.claims[0];
  return (
    <SceneShell durationInFrames={sceneTiming.evidence.duration}>
      <Eyebrow>Step 05 · evidence</Eyebrow>
      <Title>The governed write records evidence.</Title>
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 180, flex: 1, alignItems: "center", marginTop: 30 }}>
        <svg
          viewBox="0 0 1000 200"
          style={{ position: "absolute", left: "28%", right: "28%", top: "40%", width: "44%", height: 180, overflow: "visible", zIndex: 0 }}
        >
          <path
            d="M 20 100 C 300 18, 700 182, 980 100"
            fill="none"
            stroke={palette.green}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="1100"
            strokeDashoffset={interpolate(frame, [32, 95], [1100, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            })}
          />
        </svg>
        <Card tone="green" style={{ position: "relative", zIndex: 1, padding: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: palette.green, fontSize: 25, fontWeight: 750, letterSpacing: 2 }}>EVIDENCE</div>
            <Status>{evidence.evidenceId}</Status>
          </div>
          <KeyValue label="source" value={evidence.source} />
          <KeyValue label="excerpt" value={`“${evidence.excerpt}”`} />
          <KeyValue label="sha256" value={shortHash(evidence.hash, 18)} accent={palette.green} />
          <KeyValue label="run" value={evidence.runId} />
        </Card>
        <Card style={{ position: "relative", zIndex: 1, padding: 32, opacity: interpolate(frame, [68, 105], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: palette.blue, fontSize: 25, fontWeight: 750, letterSpacing: 2 }}>CLAIM</div>
            <Status>{claim.claimId}</Status>
          </div>
          <div style={{ marginTop: 30, color: palette.paper, fontSize: 38, lineHeight: 1.3 }}>&quot;{claim.text}&quot;</div>
          <KeyValue label="evidenceIds" value={claim.evidenceIds.join(", ")} accent={palette.green} />
          <KeyValue label="same run" value={claim.runId} />
        </Card>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
        <Status>UNSUPPORTED CLAIMS {proof.summary.unsupportedClaims}</Status>
      </div>
    </SceneShell>
  );
};

const SummaryScene: React.FC<{ readonly proof: DemoProof }> = ({ proof }) => {
  const frame = useCurrentFrame();
  const metrics = [
    { label: "ALTERED INPUT", value: "BLOCKED", tone: palette.red },
    { label: "EXECUTIONS", value: proof.summary.executions, tone: palette.green },
    { label: "CONSUMPTIONS", value: proof.summary.approvalConsumptions, tone: palette.green },
    { label: "UNSUPPORTED", value: proof.summary.unsupportedClaims, tone: palette.green },
  ];
  return (
    <SceneShell durationInFrames={sceneTiming.summary.duration}>
      <Eyebrow>Deterministic report</Eyebrow>
      <Title>The proof, in one frame.</Title>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 22, flex: 1, alignItems: "center", marginTop: 36 }}>
        {metrics.map((metric, index) => (
          <Card
            key={metric.label}
            style={{
              minHeight: 250,
              padding: 28,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              opacity: interpolate(frame, [18 + index * 10, 40 + index * 10], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: `0 ${interpolate(frame, [18 + index * 10, 40 + index * 10], [20, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              })}px`,
            }}
          >
            <div style={{ color: palette.muted, fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>{metric.label}</div>
            <div style={{ color: metric.tone, fontFamily: codeFont, fontSize: typeof metric.value === "number" ? 98 : 46, fontWeight: 780, lineHeight: 1 }}>
              {metric.value}
            </div>
          </Card>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", color: palette.muted, fontFamily: codeFont, fontSize: 22 }}>
        <span>evidence {proof.summary.evidenceRecords} · claims {proof.summary.claims}</span>
        <span style={{ color: palette.green }}>temporary workspace removed {String(proof.cleanup.temporaryWorkspaceRemoved)}</span>
      </div>
    </SceneShell>
  );
};

const FinalScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <SceneShell durationInFrames={sceneTiming.final.duration}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <Eyebrow>Maqam · TypeScript governance</Eyebrow>
        <div style={{ maxWidth: 1480, fontSize: 104, lineHeight: 0.98, letterSpacing: -5, fontWeight: 740 }}>
          The agent can act. <span style={{ color: palette.green }}>Maqam makes it prove why.</span>
        </div>
        <div style={{ display: "flex", gap: 32, marginTop: 34, color: palette.muted, fontSize: 30 }}>
          <span>Policy before execution</span><span style={{ color: palette.line }}>•</span>
          <span>Exact approval for the call</span><span style={{ color: palette.line }}>•</span>
          <span>Evidence behind the claim</span>
        </div>
        <div
          style={{
            marginTop: 42,
            display: "flex",
            alignItems: "center",
            gap: 30,
            opacity: interpolate(frame, [24, 50], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div style={{ padding: "17px 26px", borderRadius: 12, border: `1px solid ${palette.green}66`, backgroundColor: palette.greenDim, color: palette.paper, fontFamily: codeFont, fontSize: 31 }}>
            npm install maqam
          </div>
          <div style={{ color: palette.muted, fontFamily: codeFont, fontSize: 26 }}>github.com/AjnasNB/maqam</div>
        </div>
      </div>
    </SceneShell>
  );
};

export const MaqamDemo: React.FC = () => {
  const assets = useDemoAssets();
  if (!assets) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: palette.ink }}>
      <Background />
      <FrameHeader />
      {assets.voiceoverAvailable ? (
        <Audio
          src={staticFile("voiceover.wav")}
          volume={(frame) =>
            interpolate(frame, [0, 15, 1740, 1785], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      ) : null}
      <Sequence name="Hook" durationInFrames={sceneTiming.hook.duration}><HookScene proof={assets.proof} /></Sequence>
      <Sequence name="Approval receipt" from={sceneTiming.approval.from} durationInFrames={sceneTiming.approval.duration}><ApprovalScene proof={assets.proof} /></Sequence>
      <Sequence name="Scope mismatch" from={sceneTiming.mismatch.from} durationInFrames={sceneTiming.mismatch.duration}><MismatchScene proof={assets.proof} /></Sequence>
      <Sequence name="Exact execution" from={sceneTiming.exact.from} durationInFrames={sceneTiming.exact.duration}><ExactScene proof={assets.proof} /></Sequence>
      <Sequence name="Replay rejected" from={sceneTiming.replay.from} durationInFrames={sceneTiming.replay.duration}><ReplayScene proof={assets.proof} /></Sequence>
      <Sequence name="Evidence linked" from={sceneTiming.evidence.from} durationInFrames={sceneTiming.evidence.duration}><EvidenceScene proof={assets.proof} /></Sequence>
      <Sequence name="Proof summary" from={sceneTiming.summary.from} durationInFrames={sceneTiming.summary.duration}><SummaryScene proof={assets.proof} /></Sequence>
      <Sequence name="Call to action" from={sceneTiming.final.from} durationInFrames={sceneTiming.final.duration}><FinalScene /></Sequence>
      <CaptionTrack captions={assets.captions} />
    </AbsoluteFill>
  );
};
