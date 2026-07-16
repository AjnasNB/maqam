import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const overviewPalette = {
  ink: "#070a0c",
  panel: "rgba(16, 22, 25, 0.90)",
  panelSolid: "#11171a",
  paper: "#f3f0e7",
  muted: "#a3adaa",
  line: "rgba(255,255,255,0.13)",
  green: "#8fffc1",
  blue: "#8ecbff",
  violet: "#c7a8ff",
  amber: "#f5cc75",
  red: "#ff827d",
} as const;

export const uiFont = "'Segoe UI', Arial, sans-serif";
export const codeFont = "'Cascadia Code', Consolas, monospace";

export type OverviewTone = "green" | "blue" | "violet" | "amber" | "red";

export const toneColor = (tone: OverviewTone) => overviewPalette[tone];

export const OverviewBackground: React.FC<{ readonly tone: OverviewTone }> = ({ tone }) => {
  const frame = useCurrentFrame();
  const color = toneColor(tone);
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: overviewPalette.ink }}>
      <div
        style={{
          position: "absolute",
          inset: -260,
          background: `radial-gradient(circle at 16% 20%, ${color}2a, transparent 31%), radial-gradient(circle at 86% 74%, rgba(73,121,164,0.18), transparent 35%)`,
          translate: `${interpolate(frame, [0, 1650], [-30, 42], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px ${interpolate(frame, [0, 1650], [-15, 24], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.24,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "76px 76px",
          backgroundPosition: `${interpolate(frame, [0, 1650], [0, 76])}px 0`,
          maskImage: "linear-gradient(to bottom, black, transparent 92%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(7,10,12,0.02), rgba(7,10,12,0.55))",
        }}
      />
    </AbsoluteFill>
  );
};

export const OverviewHeader: React.FC<{
  readonly brand: string;
  readonly label: string;
  readonly tone: OverviewTone;
}> = ({ brand, label, tone }) => {
  const frame = useCurrentFrame();
  const seconds = Math.min(54, Math.floor(frame / 30));
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 48,
          left: 88,
          right: 88,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: uiFont,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span
            style={{
              width: 15,
              height: 15,
              borderRadius: "50%",
              backgroundColor: toneColor(tone),
              boxShadow: `0 0 30px ${toneColor(tone)}66`,
            }}
          />
          <span style={{ color: overviewPalette.paper, fontSize: 28, fontWeight: 760, letterSpacing: 4.5 }}>
            {brand}
          </span>
          <span style={{ width: 1, height: 27, backgroundColor: overviewPalette.line }} />
          <span style={{ color: overviewPalette.muted, fontSize: 21, fontWeight: 650, letterSpacing: 2.1 }}>
            {label}
          </span>
        </div>
        <span
          style={{
            color: overviewPalette.muted,
            fontSize: 21,
            fontWeight: 650,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {`00:${String(seconds).padStart(2, "0")} / 00:55`}
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          top: 100,
          left: 88,
          right: 88,
          zIndex: 20,
          height: 2,
          backgroundColor: "rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            width: `${interpolate(frame, [0, 1649], [0, 100], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}%`,
            height: "100%",
            backgroundColor: toneColor(tone),
          }}
        />
      </div>
    </>
  );
};

export const OverviewScene: React.FC<{
  readonly durationInFrames: number;
  readonly children: ReactNode;
}> = ({ durationInFrames, children }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        padding: "142px 104px 190px",
        color: overviewPalette.paper,
        fontFamily: uiFont,
        opacity: interpolate(
          frame,
          [0, 12, Math.max(13, durationInFrames - 14), durationInFrames],
          [0, 1, 1, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          },
        ),
        translate: `0 ${interpolate(frame, [0, 20], [16, 0], {
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

export const OverviewEyebrow: React.FC<{
  readonly children: ReactNode;
  readonly tone: OverviewTone;
}> = ({ children, tone }) => (
  <div
    style={{
      color: toneColor(tone),
      fontSize: 24,
      fontWeight: 760,
      letterSpacing: 3.7,
      textTransform: "uppercase",
      marginBottom: 17,
    }}
  >
    {children}
  </div>
);

export const OverviewTitle: React.FC<{
  readonly children: ReactNode;
  readonly maxWidth?: number;
  readonly size?: number;
}> = ({ children, maxWidth = 1500, size = 88 }) => (
  <div
    style={{
      maxWidth,
      color: overviewPalette.paper,
      fontSize: size,
      fontWeight: 735,
      letterSpacing: -4,
      lineHeight: 1,
    }}
  >
    {children}
  </div>
);

export const OverviewPanel: React.FC<{
  readonly children: ReactNode;
  readonly style?: CSSProperties;
  readonly tone?: OverviewTone;
}> = ({ children, style, tone }) => (
  <div
    style={{
      backgroundColor: overviewPalette.panel,
      border: `1px solid ${tone ? `${toneColor(tone)}55` : overviewPalette.line}`,
      borderRadius: 22,
      boxShadow: "0 28px 80px rgba(0,0,0,0.28)",
      ...style,
    }}
  >
    {children}
  </div>
);

export const OverviewChip: React.FC<{
  readonly children: ReactNode;
  readonly tone?: OverviewTone;
  readonly style?: CSSProperties;
}> = ({ children, tone = "green", style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      minHeight: 48,
      padding: "9px 15px",
      borderRadius: 999,
      border: `1px solid ${toneColor(tone)}55`,
      backgroundColor: `${toneColor(tone)}12`,
      color: toneColor(tone),
      fontFamily: codeFont,
      fontSize: 21,
      fontWeight: 700,
      ...style,
    }}
  >
    <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: toneColor(tone) }} />
    {children}
  </div>
);

export const Reveal: React.FC<{
  readonly from?: number;
  readonly children: ReactNode;
  readonly style?: CSSProperties;
}> = ({ from = 12, children, style }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        opacity: interpolate(frame, [from, from + 18], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        translate: `0 ${interpolate(frame, [from, from + 18], [14, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}px`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Arrow: React.FC<{ readonly tone?: OverviewTone }> = ({ tone = "green" }) => (
  <div style={{ color: toneColor(tone), fontSize: 38, fontWeight: 500, lineHeight: 1 }}>→</div>
);
