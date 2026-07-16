import {
  createTikTokStyleCaptions,
  type Caption,
  type TikTokPage,
} from "@remotion/captions";
import { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const PAGE_WINDOW_MS = 2600;

const CaptionPage: React.FC<{ readonly page: TikTokPage }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const absoluteTimeMs = page.startMs + (frame / fps) * 1000;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        padding: "0 150px 100px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: 1500,
          minHeight: 78,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "14px 28px 16px",
          borderRadius: 14,
          backgroundColor: "rgba(6, 9, 11, 0.9)",
          border: "1px solid rgba(255,255,255,0.11)",
          color: "#f3f1ea",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          fontSize: 42,
          fontWeight: 650,
          letterSpacing: -0.7,
          lineHeight: 1.18,
          textAlign: "center",
          whiteSpace: "pre-wrap",
          opacity: interpolate(frame, [0, 7], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: `0 ${interpolate(frame, [0, 10], [12, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}px`,
        }}
      >
        {page.tokens.map((token) => {
          const active = token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;
          return (
            <span
              key={`${token.fromMs}-${token.toMs}-${token.text}`}
              style={{ color: active ? "#8fffc1" : "#f3f1ea" }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const CaptionTrack: React.FC<{
  readonly captions: readonly Caption[];
}> = ({ captions }) => {
  const { fps } = useVideoConfig();
  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions: [...captions],
        combineTokensWithinMilliseconds: PAGE_WINDOW_MS,
      }),
    [captions],
  );

  return (
    <AbsoluteFill>
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const startFrame = Math.round((page.startMs / 1000) * fps);
        const nextFrame = nextPage
          ? Math.round((nextPage.startMs / 1000) * fps)
          : Math.round(((page.startMs + PAGE_WINDOW_MS) / 1000) * fps);
        const durationInFrames = Math.max(1, nextFrame - startFrame);
        return (
          <Sequence
            key={`${page.startMs}-${index}`}
            name={`Caption ${index + 1}`}
            from={startFrame}
            durationInFrames={durationInFrames}
          >
            <CaptionPage page={page} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
