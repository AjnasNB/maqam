# Asset provenance

This project contains no copied third-party footage, screenshots, logos, music, sound effects, illustrations, or font files.

## Generated proof data

- `public/demo-proof.json` is generated locally by `scripts/generate-proof.mjs`.
- The generator executes `node ../../bin/maqam.js demo approval --json` from this project and validates the exact approval, scope-mismatch, single execution, replay rejection, evidence link, and cleanup invariants before writing the file.
- The proof describes a deterministic temporary-workspace run of the MIT-licensed Maqam source in this repository.

## Voiceover and captions

- `public/voiceover.wav` is synthesized locally with Microsoft Windows `System.Speech` / SAPI from the original narration in `scripts/voiceover-script.json`.
- The preferred installed voice is `Microsoft Zira Desktop`; the generator records the actual selected voice in `public/voiceover-metadata.json`.
- No text, prompt, recording, or metadata is sent to a cloud TTS service.
- `public/captions.json` is generated from SAPI `SpeakProgress` timings and follows the Remotion `Caption` JSON shape.
- The narration and caption text are original to this project.

## Visuals and fonts

- All visual elements are original React/CSS/SVG primitives authored in `src/`.
- The render uses system font stacks headed by `Segoe UI` and `Cascadia Code`. No font file is bundled or redistributed.
- Rendering on a host without those fonts falls back to Arial, Consolas, and generic sans-serif/monospace fonts.

## Software dependencies

Remotion, React, and their nested dependencies are development/rendering software recorded in this private project's `package-lock.json`; they are not media assets. Their respective licenses remain applicable and are not replaced by Maqam's MIT license.

Remotion 4.0.490 is distributed under the Remotion License. The [official pricing page](https://www.remotion.dev/docs/license/pricing), reviewed 2026-07-16, describes free commercial use for individuals and companies of up to three people and a company license for collaborations or companies of four or more. This repository was prepared as an individual Ajnas NB project. Any larger organization that re-renders or operationalizes this source must confirm its own Remotion license eligibility.
