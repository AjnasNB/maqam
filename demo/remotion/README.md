# Maqam and ProductLoop proof videos

Repository-only, separately installed Remotion source for three factual product demonstrations. It is MIT-licensed with the root project but marked `private` so it cannot be published as an npm package. The videos combine deterministic source checks, local SAPI narration, generated word-timed captions, and original React/CSS visuals.

## Compositions

| Composition | Runtime | Purpose |
| --- | ---: | --- |
| `MaqamProof60` | 60 seconds | Exact approval, evidence, MGES project benchmark, and ecosystem boundary proof. |
| `ProductLoopEcosystem55` | 55 seconds | ProductLoop OS modules, fail-closed approval binding, adapter boundaries, and production responsibilities. |
| `MaqamCrawlerResearch55` | 55 seconds | Bounded HTTP/HTML crawling, destination controls, structured evidence, and the Maqam gateway path. |

All video compositions are 1920x1080 at 30 fps. The two overview videos intentionally end with a short silent call-to-action hold after their narration.

## Generate source assets

From this directory:

```powershell
npm install
npm run proof
npm run benchmark-proof
npm run facts:additional
npm run voiceover
npm run voiceover:additional
npm run captions:portable
npm run captions:additional
npm run check
```

`npm run proof` executes the repository CLI command `maqam demo approval --json` and validates the result before writing `public/demo-proof.json`.

`npm run benchmark-proof` validates and summarizes the reviewed MGES v1 performance and conformance artifacts into `public/benchmark-proof.json`. A release-baseline result is shown only when the report passes Maqam's project checks and records a clean source tree; otherwise the video displays `RESULT WITHHELD / REVIEW`. MGES is project-defined and is not an industry standard, external certification, security score, competitor benchmark, or SLA. See the [benchmarking methodology](../../docs/benchmarking.md).

`npm run voiceover` uses the local Windows `System.Speech` engine. It writes `public/voiceover.wav`, word-timed `public/captions.json`, and `public/voiceover-metadata.json`. No cloud TTS call is made.

`npm run facts:additional` validates the exact ProductLoop and Maqam source patterns used by the overview videos and writes source-fingerprinted JSON assets. ProductLoop is expected in the workspace's sibling `ajnas-product-loop` checkout. These are implementation facts, not an external certification.

`npm run voiceover:additional` produces local SAPI narration and word-level caption JSON for both overview videos. The narration scripts are in `scripts/productloop-voiceover-script.json` and `scripts/crawler-voiceover-script.json`. Portable SRT and WebVTT files are exported by `npm run captions:additional`.

## Preview and render

```powershell
npm run dev
npm run render:video
npm run render:poster
npm run render:frames
npm run render:productloop
npm run render:crawler
npm run render:additional:frames
```

Output paths:

- `out/maqam-exact-approval-demo.mp4`
- `out/maqam-exact-approval-demo.srt`
- `out/maqam-exact-approval-demo.vtt`
- `out/productloop-os-ecosystem-overview.mp4`
- `out/productloop-os-ecosystem-overview.srt`
- `out/productloop-os-ecosystem-overview.vtt`
- `out/maqam-crawler-governed-research.mp4`
- `out/maqam-crawler-governed-research.srt`
- `out/maqam-crawler-governed-research.vtt`
- `out/maqam-proof-poster.png`
- `out/screenshots/policy-path.png` at frame 75
- `out/screenshots/pending-exact-approval.png` at frame 195
- `out/screenshots/01-scope-mismatch.png` at frame 345
- `out/screenshots/02-exact-execution.png` at frame 480
- `out/screenshots/03-evidence-linked.png` at frame 780
- `out/screenshots/04-benchmark-method.png` at frame 975
- `out/screenshots/05-ecosystem-boundary.png` at frame 1320
- `out/additional-screenshots/productloop-*.png` at five representative frames
- `out/additional-screenshots/crawler-*.png` at six representative frames

`npm run render:all` validates and produces the original 60-second proof outputs. `npm run render:additional` regenerates source facts, validates both new narrated timelines, renders their representative stills, and renders both overview MP4s. The `out/` directory is ignored and rendered media must not be committed.

See [ASSET_PROVENANCE.md](./ASSET_PROVENANCE.md) for asset origins and licensing notes. The publication-ready narration text is also preserved in [PRODUCTLOOP_TRANSCRIPT.md](./PRODUCTLOOP_TRANSCRIPT.md) and [CRAWLER_TRANSCRIPT.md](./CRAWLER_TRANSCRIPT.md).
