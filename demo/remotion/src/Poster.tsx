import { AbsoluteFill } from "remotion";
import { useDemoAssets } from "./useDemoAssets";

const palette = {
  ink: "#080b0d",
  panel: "#111619",
  paper: "#f2efe7",
  muted: "#9da7a3",
  line: "rgba(255,255,255,0.13)",
  green: "#8fffc1",
  greenDim: "rgba(143,255,193,0.12)",
  red: "#ff7772",
  redDim: "rgba(255,119,114,0.11)",
} as const;

const uiFont = "'Segoe UI', Arial, sans-serif";
const codeFont = "'Cascadia Code', Consolas, monospace";

const shortHash = (value: string) => {
  const normalized = value.replace(/^sha256:/, "");
  return `${normalized.slice(0, 14)}…${normalized.slice(-7)}`;
};

const StatusRow: React.FC<{
  readonly index: string;
  readonly label: string;
  readonly detail: string;
  readonly tone: "green" | "red";
}> = ({ index, label, detail, tone }) => {
  const color = tone === "green" ? palette.green : palette.red;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "58px 1fr auto",
        alignItems: "center",
        gap: 22,
        minHeight: 88,
        padding: "0 22px",
        borderTop: `1px solid ${palette.line}`,
        fontFamily: uiFont,
      }}
    >
      <div style={{ color: palette.muted, fontFamily: codeFont, fontSize: 18 }}>{index}</div>
      <div>
        <div style={{ color: palette.paper, fontSize: 23, fontWeight: 690 }}>{label}</div>
        <div style={{ color: palette.muted, fontSize: 17, marginTop: 5 }}>{detail}</div>
      </div>
      <div
        style={{
          border: `1px solid ${color}`,
          borderRadius: 999,
          color,
          backgroundColor: tone === "green" ? palette.greenDim : palette.redDim,
          padding: "8px 13px",
          fontFamily: codeFont,
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: 0.7,
        }}
      >
        {tone === "green" ? "PASS" : "BLOCKED"}
      </div>
    </div>
  );
};

export const MaqamPoster: React.FC = () => {
  const assets = useDemoAssets();
  if (!assets) return null;

  const { proof } = assets;
  const [request, altered, exact, replay] = proof.steps;

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: palette.ink,
        color: palette.paper,
        fontFamily: uiFont,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -180,
          background:
            "radial-gradient(circle at 18% 20%, rgba(63,152,106,0.23), transparent 31%), radial-gradient(circle at 84% 78%, rgba(70,107,151,0.17), transparent 33%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.2,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.038) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.038) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage: "linear-gradient(to bottom, black, transparent 94%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: "62px 86px 66px",
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
          zIndex: 1,
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 28,
            borderBottom: `1px solid ${palette.line}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 15,
                height: 15,
                borderRadius: "50%",
                backgroundColor: palette.green,
                boxShadow: "0 0 30px rgba(143,255,193,0.46)",
              }}
            />
            <div style={{ fontSize: 28, fontWeight: 760, letterSpacing: 5.2 }}>MAQAM</div>
            <div style={{ width: 1, height: 28, backgroundColor: palette.line }} />
            <div style={{ color: palette.muted, fontSize: 19, fontWeight: 650, letterSpacing: 2.2 }}>
              EXACT APPROVAL · 60 SECOND PROOF
            </div>
          </div>
          <div
            style={{
              border: `1px solid ${palette.line}`,
              borderRadius: 999,
              padding: "9px 15px",
              color: palette.muted,
              fontFamily: codeFont,
              fontSize: 16,
            }}
          >
            REAL CLI OUTPUT
          </div>
        </header>

        <main
          style={{
            display: "grid",
            gridTemplateColumns: "0.96fr 1.04fr",
            gap: 82,
            alignItems: "center",
            minHeight: 0,
          }}
        >
          <section>
            <div
              style={{
                color: palette.green,
                fontSize: 21,
                fontWeight: 730,
                letterSpacing: 3.4,
                textTransform: "uppercase",
                marginBottom: 18,
              }}
            >
              Runtime control for agent side effects
            </div>
            <div
              style={{
                maxWidth: 790,
                fontSize: 90,
                fontWeight: 735,
                lineHeight: 0.98,
                letterSpacing: -4.5,
              }}
            >
              One approval.
              <br />
              One exact write.
              <br />
              <span style={{ color: palette.green }}>Zero replay.</span>
            </div>
            <div
              style={{
                maxWidth: 720,
                marginTop: 30,
                color: palette.muted,
                fontSize: 25,
                lineHeight: 1.42,
              }}
            >
              A deterministic CLI proof: altered input is blocked, the approved call runs once, and
              its claim links back to evidence.
            </div>
          </section>

          <section
            style={{
              backgroundColor: palette.panel,
              border: `1px solid ${palette.line}`,
              borderRadius: 24,
              boxShadow: "0 30px 90px rgba(0,0,0,0.34)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "24px 26px 25px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 18,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 690 }}>BOUND APPROVAL SCOPE</div>
                <div style={{ color: palette.green, fontFamily: codeFont, fontSize: 16 }}>
                  {request.approvalId}
                </div>
              </div>
              <div
                style={{
                  borderRadius: 14,
                  backgroundColor: "rgba(0,0,0,0.25)",
                  border: `1px solid ${palette.line}`,
                  padding: "17px 19px",
                  fontFamily: codeFont,
                  fontSize: 17,
                  lineHeight: 1.65,
                }}
              >
                <div><span style={{ color: palette.muted }}>run</span> &nbsp;{request.scope.runId}</div>
                <div><span style={{ color: palette.muted }}>tool</span> &nbsp;{request.scope.toolName}</div>
                <div style={{ color: palette.green }}>
                  <span style={{ color: palette.muted }}>hash</span> &nbsp;{shortHash(request.scope.inputHash)}
                </div>
              </div>
            </div>

            <StatusRow
              index="01"
              label="Altered call"
              detail={altered.code}
              tone="red"
            />
            <StatusRow
              index="02"
              label="Exact approved call"
              detail={`${exact.result.bytes} bytes · ${exact.result.evidenceId} → ${exact.result.claimId}`}
              tone="green"
            />
            <StatusRow
              index="03"
              label="Approval replay"
              detail={replay.code}
              tone="red"
            />
          </section>
        </main>

        <footer
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 25,
            borderTop: `1px solid ${palette.line}`,
          }}
        >
          <div style={{ color: palette.muted, fontSize: 19 }}>
            Deny by default · Exact scope · Evidence ledger
          </div>
          <div
            style={{
              border: `1px solid rgba(143,255,193,0.4)`,
              backgroundColor: palette.greenDim,
              borderRadius: 12,
              padding: "13px 19px",
              color: palette.green,
              fontFamily: codeFont,
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            npm install maqam
          </div>
        </footer>
      </div>
    </AbsoluteFill>
  );
};
