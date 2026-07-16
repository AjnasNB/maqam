# Asset provenance

This project contains no copied third-party footage, screenshots, logos, music, sound effects, illustrations, or font files.

## Generated proof data

- `public/demo-proof.json` is generated locally by `scripts/generate-proof.mjs`.
- The generator executes `node ../../bin/maqam.js demo approval --json` from this project and validates the exact approval, scope-mismatch, single execution, replay rejection, evidence link, and cleanup invariants before writing the file.
- The proof describes a deterministic temporary-workspace run of the MIT-licensed Maqam source in this repository.

## Benchmark and conformance data

- `public/benchmark-proof.json` is generated locally by `scripts/generate-benchmark-proof.mjs` from the reviewed MGES v1 JSON artifacts under `benchmarks/results/`.
- The generator validates suite identity, version, standardization and certification flags, performance statistics, project stability checks, source fingerprints, environment metadata, and the conformance summary before writing the video asset.
- `scripts/validate-assets.mjs` compares the summarized asset back to both raw reports. A stale summary or changed source fingerprint fails the release render.
- The performance result is a local, sequential, in-process `ToolGateway` component measurement. It excludes model inference, network I/O, storage, review time, and concurrency. The value is hidden whenever the project publication checks do not pass or the artifact reports a dirty source tree.
- The conformance total describes only the named deterministic MGES fixtures. Success treatment is withheld when any fixture fails or the artifact reports a dirty source tree. It is not a penetration test, formal proof, compliance assessment, security score, external certification, or industry benchmark.
- Methodology, schemas, claim rules, and raw artifacts are documented in [`docs/benchmarking.md`](../../docs/benchmarking.md).

## Voiceover and captions

- `public/voiceover.wav` is synthesized locally with Microsoft Windows `System.Speech` / SAPI from the original narration in `scripts/voiceover-script.json`.
- The preferred installed voice is `Microsoft Zira Desktop`; the generator records the actual selected voice in `public/voiceover-metadata.json`.
- No text, prompt, recording, or metadata is sent to a cloud TTS service.
- `public/captions.json` is generated from SAPI `SpeakProgress` timings and follows the Remotion `Caption` JSON shape.
- The narration and caption text are original to this project.
- `public/productloop-voiceover.wav` and `public/crawler-voiceover.wav` are synthesized by the same local SAPI pipeline from the original scripts in `scripts/productloop-voiceover-script.json` and `scripts/crawler-voiceover-script.json`.
- Their selected voice, speech rate, volume, WAV duration, and caption count are recorded in the corresponding `*-voiceover-metadata.json` files.
- `public/productloop-captions.json` and `public/crawler-captions.json` contain SAPI word timings. `scripts/export-additional-captions.mjs` exports matching portable SRT and WebVTT sidecars under `out/`.

## ProductLoop and crawler implementation facts

- `public/productloop-facts.json` is generated from the sibling ProductLoop OS source by `scripts/generate-additional-facts.mjs`. The generator checks the exported module names, Maqam gateway wiring, exact-approval binding fields, and the deliberately separate registry/store boundaries before fingerprinting every inspected file.
- `public/crawler-facts.json` is generated from this repository. The generator checks crawler limits, URL/origin and DNS controls, redirect validation, robots behavior, structured page output, tool effect declarations, and the Maqam gateway path before fingerprinting every inspected file.
- `scripts/validate-additional-assets.mjs` rejects missing, malformed, or timeline-inconsistent facts, narration, captions, or scene timing. `npm run render:additional` refreshes source facts first, and the render hooks repeat asset-shape checks so a bad asset fails the composition rather than silently appearing in a release video.
- These implementation facts describe the inspected local source revisions. They are not an industry benchmark, independent audit, penetration test, browser-automation claim, or guarantee about a downstream deployment.

## Visuals and fonts

- All visual elements are original React/CSS/SVG primitives authored in `src/`.
- The render uses system font stacks headed by `Segoe UI` and `Cascadia Code`. No font file is bundled or redistributed.
- Rendering on a host without those fonts falls back to Arial, Consolas, and generic sans-serif/monospace fonts.

## Software dependencies

Remotion, React, and their nested dependencies are development/rendering software recorded in this private project's `package-lock.json`; they are not media assets. Their respective licenses remain applicable and are not replaced by Maqam's MIT license.

Remotion 4.0.490 is distributed under the Remotion License. The [official pricing page](https://www.remotion.dev/docs/license/pricing), reviewed 2026-07-16, describes free commercial use for individuals and companies of up to three people and a company license for collaborations or companies of four or more. This repository was prepared as an individual Ajnas NB project. Any larger organization that re-renders or operationalizes this source must confirm its own Remotion license eligibility.
