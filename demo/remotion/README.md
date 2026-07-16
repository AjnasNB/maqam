# Maqam 60-second proof, benchmark, and ecosystem video

Repository-only, separately installed Remotion source for the Maqam demonstration. It is MIT-licensed with the root project but marked `private` so it cannot be published as an npm package. It combines deterministic CLI proof, source-fingerprinted MGES performance and conformance artifacts, an honest connection map, local SAPI narration, and generated captions.

## Generate source assets

From this directory:

```powershell
npm install
npm run proof
npm run benchmark-proof
npm run voiceover
npm run captions:portable
npm run check
```

`npm run proof` executes the repository CLI command `maqam demo approval --json` and validates the result before writing `public/demo-proof.json`.

`npm run benchmark-proof` validates and summarizes the reviewed MGES v1 performance and conformance artifacts into `public/benchmark-proof.json`. A release-baseline result is shown only when the report passes Maqam's project checks and records a clean source tree; otherwise the video displays `RESULT WITHHELD / REVIEW`. MGES is project-defined and is not an industry standard, external certification, security score, competitor benchmark, or SLA. See the [benchmarking methodology](../../docs/benchmarking.md).

`npm run voiceover` uses the local Windows `System.Speech` engine. It writes `public/voiceover.wav`, word-timed `public/captions.json`, and `public/voiceover-metadata.json`. No cloud TTS call is made.

## Preview and render

```powershell
npm run dev
npm run render:video
npm run render:poster
npm run render:frames
```

Output paths:

- `out/maqam-exact-approval-demo.mp4`
- `out/maqam-exact-approval-demo.srt`
- `out/maqam-exact-approval-demo.vtt`
- `out/maqam-proof-poster.png`
- `out/screenshots/policy-path.png` at frame 75
- `out/screenshots/pending-exact-approval.png` at frame 195
- `out/screenshots/01-scope-mismatch.png` at frame 345
- `out/screenshots/02-exact-execution.png` at frame 480
- `out/screenshots/03-evidence-linked.png` at frame 780
- `out/screenshots/04-benchmark-method.png` at frame 975
- `out/screenshots/05-ecosystem-boundary.png` at frame 1320

`npm run render:all` validates and produces every output. The `out/` directory is ignored and the rendered MP4 must not be committed.

The video composition is fixed at 1920x1080, 30 fps, 1800 frames (60 seconds). See [ASSET_PROVENANCE.md](./ASSET_PROVENANCE.md) for asset origins and licensing notes.
