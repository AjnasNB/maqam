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

const tone = "blue" as const;

const Hook: React.FC<{ readonly duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const progress = Math.min(1, frame / Math.max(1, duration * 0.78));
  return (
    <OverviewScene durationInFrames={duration}>
      <div style={{ display: "grid", gridTemplateColumns: "0.96fr 1.04fr", gap: 76, flex: 1, alignItems: "center" }}>
        <div>
          <OverviewEyebrow tone={tone}>Governed research connector</OverviewEyebrow>
          <OverviewTitle maxWidth={850}>Bound the crawl before the first request.</OverviewTitle>
          <div style={{ marginTop: 27, color: overviewPalette.muted, fontSize: 36, lineHeight: 1.34 }}>
            HTTP + HTML extraction. No browser automation claim.
          </div>
        </div>
        <OverviewPanel tone={tone} style={{ padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <OverviewChip tone="blue">SEED</OverviewChip>
            <div style={{ flex: 1, height: 3, backgroundColor: overviewPalette.line }}>
              <div style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: overviewPalette.blue }} />
            </div>
            <OverviewChip tone="green">PAGE RECORD</OverviewChip>
          </div>
          <div style={{ marginTop: 30, fontFamily: codeFont, fontSize: 28, lineHeight: 1.65 }}>
            <div><span style={{ color: overviewPalette.blue }}>https://</span>example.com/docs</div>
            <div style={{ marginTop: 20, color: overviewPalette.muted }}>→ origin policy</div>
            <div style={{ color: overviewPalette.muted }}>→ DNS + pinned fetch</div>
            <div style={{ color: overviewPalette.muted }}>→ robots + redirect checks</div>
            <div style={{ color: overviewPalette.green }}>→ title · markdown · sha256</div>
          </div>
        </OverviewPanel>
      </div>
    </OverviewScene>
  );
};

const Limits: React.FC<{ readonly duration: number }> = ({ duration }) => {
  const limits = [
    ["maxPages", "50"],
    ["maxRequests", "400"],
    ["maxQueue", "1,000"],
    ["maxDepth", "20"],
    ["maxBytes", "3 MiB"],
    ["maxRetries", "2"],
    ["concurrency", "4"],
    ["maxDuration", "10 min"],
  ];
  return (
    <OverviewScene durationInFrames={duration}>
      <OverviewEyebrow tone={tone}>Explicit ceilings</OverviewEyebrow>
      <OverviewTitle size={77}>Every discovery path spends a budget.</OverviewTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 17, flex: 1, marginTop: 38 }}>
        {limits.map(([name, value], index) => (
          <Reveal key={name} from={7 + index * 3} style={{ display: "flex" }}>
            <OverviewPanel
              tone={index < 4 ? "blue" : "green"}
              style={{ padding: 23, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}
            >
              <div style={{ color: overviewPalette.muted, fontFamily: codeFont, fontSize: 21 }}>{name}</div>
              <div style={{ marginTop: 20, color: index < 4 ? overviewPalette.blue : overviewPalette.green, fontSize: 48, fontWeight: 760, fontVariantNumeric: "tabular-nums" }}>
                {value}
              </div>
            </OverviewPanel>
          </Reveal>
        ))}
      </div>
      <div style={{ marginTop: 18, color: overviewPalette.muted, fontSize: 23 }}>
        Illustrative built-in defaults; callers and deployment wrappers may narrow them.
      </div>
    </OverviewScene>
  );
};

const Network: React.FC<{ readonly duration: number }> = ({ duration }) => {
  const stages = [
    ["01", "origin", "HTTP(S) only"],
    ["02", "DNS", "all addresses checked"],
    ["03", "pin", "selected address held"],
    ["04", "redirect", "every hop validated"],
    ["05", "robots", "fail closed by default"],
  ];
  return (
    <OverviewScene durationInFrames={duration}>
      <OverviewEyebrow tone="green">Destination safety</OverviewEyebrow>
      <OverviewTitle size={76}>Validate the route, not just the first URL.</OverviewTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 13, alignItems: "stretch", flex: 1, marginTop: 42 }}>
        {stages.map(([number, title, detail], index) => (
          <Reveal key={title} from={8 + index * 6} style={{ display: "flex" }}>
            <OverviewPanel tone={index === stages.length - 1 ? "green" : "blue"} style={{ padding: 23, flex: 1 }}>
              <div style={{ color: overviewPalette.muted, fontFamily: codeFont, fontSize: 20 }}>{number}</div>
              <div style={{ marginTop: 28, color: index === stages.length - 1 ? overviewPalette.green : overviewPalette.blue, fontSize: 37, fontWeight: 760 }}>{title}</div>
              <div style={{ marginTop: 15, color: overviewPalette.paper, fontSize: 24, lineHeight: 1.35 }}>{detail}</div>
              <div style={{ marginTop: 28, width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: "50%", backgroundColor: `${overviewPalette.green}18`, color: overviewPalette.green, fontSize: 24 }}>✓</div>
            </OverviewPanel>
          </Reveal>
        ))}
      </div>
    </OverviewScene>
  );
};

const Scope: React.FC<{ readonly duration: number }> = ({ duration }) => (
  <OverviewScene durationInFrames={duration}>
    <OverviewEyebrow tone="amber">Origin and network scope</OverviewEyebrow>
    <OverviewTitle size={75}>Safe defaults require explicit escape hatches.</OverviewTitle>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22, flex: 1, marginTop: 40 }}>
      <Reveal from={8} style={{ display: "flex" }}>
        <OverviewPanel tone="green" style={{ padding: 29, flex: 1 }}>
          <OverviewChip tone="green">DEFAULT</OverviewChip>
          <div style={{ marginTop: 28, fontSize: 40, fontWeight: 760 }}>Same origin</div>
          <div style={{ marginTop: 18, color: overviewPalette.muted, fontSize: 28, lineHeight: 1.4 }}>Discovered links stay with the seed origin.</div>
        </OverviewPanel>
      </Reveal>
      <Reveal from={20} style={{ display: "flex" }}>
        <OverviewPanel tone="amber" style={{ padding: 29, flex: 1 }}>
          <OverviewChip tone="amber">TRUSTED SCOPE</OverviewChip>
          <div style={{ marginTop: 28, fontSize: 40, fontWeight: 760 }}>Cross origin</div>
          <div style={{ marginTop: 18, color: overviewPalette.muted, fontSize: 28, lineHeight: 1.4 }}>Needs an explicit origin allowlist.</div>
        </OverviewPanel>
      </Reveal>
      <Reveal from={32} style={{ display: "flex" }}>
        <OverviewPanel tone="red" style={{ padding: 29, flex: 1 }}>
          <OverviewChip tone="red">NEVER IMPLIED</OverviewChip>
          <div style={{ marginTop: 28, fontSize: 40, fontWeight: 760 }}>Private network</div>
          <div style={{ marginTop: 18, color: overviewPalette.muted, fontSize: 27, lineHeight: 1.4 }}>Host opt-in only; link-local and unsafe special ranges stay blocked.</div>
        </OverviewPanel>
      </Reveal>
    </div>
  </OverviewScene>
);

const Output: React.FC<{ readonly duration: number }> = ({ duration }) => {
  const fields = ["url", "title", "h1", "text", "markdown", "links", "status", "redirectChain", "contentHash"];
  return (
    <OverviewScene durationInFrames={duration}>
      <div style={{ display: "grid", gridTemplateColumns: "0.78fr 1.22fr", gap: 64, flex: 1, alignItems: "center" }}>
        <div>
          <OverviewEyebrow tone={tone}>Agent-friendly page record</OverviewEyebrow>
          <OverviewTitle size={78}>Structured content with retrieval metadata.</OverviewTitle>
          <div style={{ marginTop: 27, color: overviewPalette.muted, fontSize: 32, lineHeight: 1.35 }}>
            The content hash binds the fetched response body. It does not certify truth.
          </div>
        </div>
        <OverviewPanel tone="blue" style={{ padding: 29 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <OverviewChip tone="blue">CRAWL PAGE</OverviewChip>
            <span style={{ fontFamily: codeFont, color: overviewPalette.green, fontSize: 20 }}>sha256:7b4f…e91c</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 13, marginTop: 26 }}>
            {fields.map((field, index) => (
              <Reveal key={field} from={8 + index * 3}>
                <div style={{ height: 73, display: "grid", placeItems: "center", borderRadius: 13, backgroundColor: index === fields.length - 1 ? `${overviewPalette.green}14` : "rgba(255,255,255,0.035)", border: `1px solid ${index === fields.length - 1 ? `${overviewPalette.green}44` : overviewPalette.line}`, color: index === fields.length - 1 ? overviewPalette.green : overviewPalette.paper, fontFamily: codeFont, fontSize: 22 }}>
                  {field}
                </div>
              </Reveal>
            ))}
          </div>
        </OverviewPanel>
      </div>
    </OverviewScene>
  );
};

const Detail: React.FC<{ readonly duration: number }> = ({ duration }) => (
  <OverviewScene durationInFrames={duration}>
    <OverviewEyebrow tone="green">Two public surfaces</OverviewEyebrow>
    <OverviewTitle size={76}>Raw crawl detail or governed tool capability.</OverviewTitle>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 27, flex: 1, marginTop: 38 }}>
      <OverviewPanel tone="blue" style={{ padding: 31 }}>
        <OverviewChip tone="blue">crawlDetailed()</OverviewChip>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 13, marginTop: 29 }}>
          {["pages", "failures", "stats"].map((item) => (
            <div key={item} style={{ height: 118, display: "grid", placeItems: "center", borderRadius: 14, border: `1px solid ${overviewPalette.blue}3d`, backgroundColor: `${overviewPalette.blue}0d`, fontSize: 32, fontWeight: 730 }}>
              {item}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 24, color: overviewPalette.muted, fontSize: 26 }}>Ordinary page failures can be reported while eligible URLs continue.</div>
      </OverviewPanel>
      <OverviewPanel tone="green" style={{ padding: 31 }}>
        <OverviewChip tone="green">createCrawlerTool()</OverviewChip>
        <div style={{ marginTop: 30, fontFamily: codeFont, fontSize: 29, lineHeight: 1.6 }}>
          <div><span style={{ color: overviewPalette.muted }}>effect</span> <span style={{ color: overviewPalette.green }}>network:read</span></div>
          <div><span style={{ color: overviewPalette.muted }}>defaults</span> deployment-enforced</div>
          <div><span style={{ color: overviewPalette.muted }}>caller</span> may narrow limits</div>
        </div>
        <div style={{ marginTop: 20, color: overviewPalette.muted, fontSize: 26 }}>Private-network authority cannot be enabled by call input.</div>
      </OverviewPanel>
    </div>
  </OverviewScene>
);

const Gateway: React.FC<{ readonly duration: number }> = ({ duration }) => {
  const stages = [
    ["agent / workflow", "blue"],
    ["ToolGateway", "green"],
    ["crawler tool", "blue"],
    ["scoped evidence", "violet"],
  ] as const;
  return (
    <OverviewScene durationInFrames={duration}>
      <OverviewEyebrow tone="green">Governed path</OverviewEyebrow>
      <OverviewTitle size={76}>Research enters through one registered boundary.</OverviewTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr auto 1fr", gap: 20, alignItems: "center", flex: 1, marginTop: 40 }}>
        {stages.flatMap(([label, stageTone], index) => {
          const node = (
            <Reveal key={label} from={8 + index * 7}>
              <OverviewPanel tone={stageTone} style={{ minHeight: 220, padding: 25, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ color: overviewPalette.muted, fontFamily: codeFont, fontSize: 19 }}>0{index + 1}</div>
                <div style={{ color: toneColor(stageTone), fontSize: 35, fontWeight: 750, lineHeight: 1.1 }}>{label}</div>
              </OverviewPanel>
            </Reveal>
          );
          return index < stages.length - 1 ? [node, <Arrow key={`${label}-arrow`} tone={stageTone} />] : [node];
        })}
      </div>
      <div style={{ display: "flex", gap: 13, marginTop: 20 }}>
        <OverviewChip tone="green">POLICY</OverviewChip>
        <OverviewChip tone="amber">EXACT APPROVAL IF CONFIGURED</OverviewChip>
        <OverviewChip tone="blue">CALL CEILINGS</OverviewChip>
        <OverviewChip tone="violet">REDACTED TRACE</OverviewChip>
      </div>
    </OverviewScene>
  );
};

const Final: React.FC<{ readonly duration: number }> = ({ duration }) => (
  <OverviewScene durationInFrames={duration}>
    <div style={{ display: "grid", gridTemplateColumns: "0.88fr 1.12fr", gap: 68, flex: 1, alignItems: "center" }}>
      <div>
        <OverviewEyebrow tone="red">Know when to switch tools</OverviewEyebrow>
        <OverviewTitle size={78}>HTTP research, not browser rendering.</OverviewTitle>
        <div style={{ marginTop: 27, color: overviewPalette.muted, fontSize: 32, lineHeight: 1.38 }}>
          No page JavaScript, anti-bot bypass, visual browser session, or source-truth guarantee.
        </div>
      </div>
      <OverviewPanel tone="blue" style={{ padding: 33 }}>
        <div style={{ color: overviewPalette.muted, fontSize: 20, letterSpacing: 2.5 }}>RUN THE BOUNDED CLI</div>
        <div style={{ marginTop: 23, fontFamily: codeFont, fontSize: 30, lineHeight: 1.7 }}>
          <div><span style={{ color: overviewPalette.blue }}>$</span> npx maqam-crawl https://example.com</div>
          <div style={{ color: overviewPalette.muted, paddingLeft: 27 }}>--max-pages 10 --jsonl</div>
        </div>
        <div style={{ marginTop: 24, paddingTop: 22, borderTop: `1px solid ${overviewPalette.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <OverviewChip tone="green">ROBOTS ON</OverviewChip>
          <span style={{ color: overviewPalette.muted, fontSize: 23 }}>use a browser provider for rendered pages</span>
        </div>
      </OverviewPanel>
    </div>
  </OverviewScene>
);

const sceneComponent = (timing: NarrationScene, duration: number) => {
  switch (timing.scene) {
    case "hook": return <Hook duration={duration} />;
    case "limits": return <Limits duration={duration} />;
    case "network": return <Network duration={duration} />;
    case "scope": return <Scope duration={duration} />;
    case "output": return <Output duration={duration} />;
    case "detail": return <Detail duration={duration} />;
    case "gateway": return <Gateway duration={duration} />;
    case "final": return <Final duration={duration} />;
    default: throw new Error(`Unknown crawler scene '${timing.scene}'.`);
  }
};

export const CrawlerOverview: React.FC = () => {
  const assets = useNarratedAssets("crawler");
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
          <Sequence key={timing.scene} name={`Crawler · ${timing.scene}`} from={from} durationInFrames={duration} premountFor={fps}>
            {sceneComponent(timing, duration)}
          </Sequence>
        );
      })}
      <OverviewHeader brand="MAQAM CRAWLER" label="BOUNDED HTTP RESEARCH" tone={tone} />
      <Audio src={staticFile(assets.audioFile)} volume={0.96} />
      <CaptionTrack captions={assets.captions} />
      <div style={{ position: "absolute", right: 90, bottom: 49, color: overviewPalette.muted, fontFamily: uiFont, fontSize: 18, letterSpacing: 1.2 }}>
        LOCAL SAPI VOICE · NO CLOUD TTS
      </div>
    </>
  );
};
