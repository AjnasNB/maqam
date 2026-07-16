# Website asset provenance

This file records the source and intended use of static website artwork and remotely served candidate-release media. Maqam 0.2.4 is not public on npm until its exact release approval completes.

## Static assets

| Website asset | Source | Method | Use |
|---|---|---|---|
| `public/assets/maqam-logo.svg` | `app/assets/maqam-logo.svg` in this repository | Copied without modification | Site identity and favicon |
| `public/assets/approval-gate-art.png` | Codex generated image `exec-1549a141-c9d6-49c8-ad79-fbc777742bf2.png` | Generated for this release on 2026-07-16 | Benchmark article hero |
| `public/assets/evidence-article.png` | Codex generated image `exec-7cc1c0d7-d0d2-43d3-abec-736520a349c3.png` | Generated for this release on 2026-07-16 | Exact-approval article hero |
| `public/assets/productloop-ecosystem.png` | Codex generated image `exec-0578709a-409f-4283-8a60-91161cf095f1.png` | Generated for this release on 2026-07-16 | ProductLoop ecosystem illustration |

The generated-image sources are local build inputs under `C:\Users\20cs0\.codex\generated_images\019f65d0-13bf-7a90-953f-7460e3d72d19`. The copied files are committed build assets, so the website does not depend on that local directory at runtime.

## R2 release media

The Worker exposes only fixed public paths from the `maqam-media` R2 bucket. The exact-approval sources are assembled under `D:\skill box\release-assets\maqam-v0.2.4`. ProductLoop and crawler video sources and their QA records are under `demo/remotion/out` before release upload.

| Public path | R2 object key | Source |
|---|---|---|
| `/media/releases/maqam/v0.2.4/maqam-exact-approval-demo.mp4` | `releases/maqam/v0.2.4/maqam-exact-approval-demo.mp4` | Rendered 60-second Remotion release video |
| `/media/releases/maqam/v0.2.4/maqam-demo-poster.png` | `releases/maqam/v0.2.4/maqam-demo-poster.png` | Rendered exact-approval poster |
| `/media/releases/maqam/v0.2.4/maqam-exact-approval-demo.vtt` | `releases/maqam/v0.2.4/maqam-exact-approval-demo.vtt` | Authored VTT captions |
| `/media/releases/maqam/v0.2.4/maqam-exact-approval-demo.srt` | `releases/maqam/v0.2.4/maqam-exact-approval-demo.srt` | Authored SRT captions |
| `/media/releases/maqam/v0.2.4/productloop-os-ecosystem-overview.mp4` | `releases/maqam/v0.2.4/productloop-os-ecosystem-overview.mp4` | Rendered 55-second Remotion ecosystem video |
| `/media/releases/maqam/v0.2.4/productloop-os-ecosystem-poster.png` | `releases/maqam/v0.2.4/productloop-os-ecosystem-poster.png` | ProductLoop video poster |
| `/media/releases/maqam/v0.2.4/productloop-os-ecosystem-overview.vtt` | `releases/maqam/v0.2.4/productloop-os-ecosystem-overview.vtt` | Authored VTT captions |
| `/media/releases/maqam/v0.2.4/productloop-os-ecosystem-overview.srt` | `releases/maqam/v0.2.4/productloop-os-ecosystem-overview.srt` | Authored SRT captions |
| `/media/releases/maqam/v0.2.4/maqam-crawler-governed-research.mp4` | `releases/maqam/v0.2.4/maqam-crawler-governed-research.mp4` | Rendered 55-second Remotion crawler video |
| `/media/releases/maqam/v0.2.4/maqam-crawler-governed-research-poster.png` | `releases/maqam/v0.2.4/maqam-crawler-governed-research-poster.png` | Crawler video poster |
| `/media/releases/maqam/v0.2.4/maqam-crawler-governed-research.vtt` | `releases/maqam/v0.2.4/maqam-crawler-governed-research.vtt` | Authored VTT captions |
| `/media/releases/maqam/v0.2.4/maqam-crawler-governed-research.srt` | `releases/maqam/v0.2.4/maqam-crawler-governed-research.srt` | Authored SRT captions |
| `/media/01-scope-mismatch.png` | `releases/maqam/v0.2.4/01-scope-mismatch.png` | Demo still |
| `/media/02-exact-execution.png` | `releases/maqam/v0.2.4/02-exact-execution.png` | Demo still |
| `/media/03-evidence-linked.png` | `releases/maqam/v0.2.4/03-evidence-linked.png` | Demo still |
| `/media/04-benchmark-method.png` | `releases/maqam/v0.2.4/04-benchmark-method.png` | Demo still |
| `/media/05-ecosystem-boundary.png` | `releases/maqam/v0.2.4/05-ecosystem-boundary.png` | Demo still |
| `/media/mges-performance.json` | `releases/maqam/v0.2.4/mges-performance-windows-node24.json` | Clean MGES performance artifact |
| `/media/mges-conformance.json` | `releases/maqam/v0.2.4/mges-conformance-windows-node24.json` | MGES conformance artifact |

The short `/media/maqam-*` exact-approval aliases remain in the Worker for backwards compatibility. Website pages use the explicit versioned paths. The release operator must preserve the rendered-video and benchmark provenance files beside their original outputs. Uploading to R2 changes the delivery surface, not the authorship or benchmark claims.
