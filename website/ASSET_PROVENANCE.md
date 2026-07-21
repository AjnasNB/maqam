# Website asset provenance

This file records the source and intended use of static website artwork and remotely served release media. Maqam 0.2.4 was published through npm Trusted Publishing on 2026-07-17. The 0.3.0 website reuses the same reviewed product-specific artwork and historical release media; it adds no unrelated stock or generated image.

## Static assets

| Website asset | Source | Method | Use |
|---|---|---|---|
| `public/assets/maqam-logo.svg` | `app/assets/maqam-logo.svg` in this repository | Copied without modification | Site identity and favicon |
| `public/assets/approval-gate-art.png` | Codex generated image `exec-1549a141-c9d6-49c8-ad79-fbc777742bf2.png` | Generated for this release on 2026-07-16 | Benchmark article hero |
| `public/assets/evidence-article.png` | Codex generated image `exec-7cc1c0d7-d0d2-43d3-abec-736520a349c3.png` | Generated for this release on 2026-07-16 | Exact-approval article hero |
| `public/assets/productloop-ecosystem.png` | Codex generated image `exec-0578709a-409f-4283-8a60-91161cf095f1.png` | Generated for this release on 2026-07-16 | ProductLoop ecosystem illustration |
| `public/assets/benchmark-metrology-v2.png` | OpenAI image generation, original release artwork | Generated for this release on 2026-07-17 | Benchmark methodology and measurement illustration |
| `public/assets/community-workbench-v2.png` | OpenAI image generation, original release artwork | Generated for this release on 2026-07-17 | Open-source contribution and modular-review illustration |
| `public/assets/maqam-exact-gate-3d.png` | OpenAI image generation, original website artwork | Generated on 2026-07-17 as a dark isometric gate with one approved capsule and rejected alternate paths | Homepage exact-approval concept |
| `public/assets/productloop-modular-hub-3d.png` | OpenAI image generation, original website artwork | Generated on 2026-07-17 as a central composition hub with eight independent modules | ProductLoop package-family map |
| `public/assets/integration-dock-3d.png` | OpenAI image generation, original website artwork | Generated on 2026-07-17 as a provider-neutral adapter dock with a controlled gateway | Integration and provider-boundary pages |
| `public/assets/evidence-metrology-3d.png` | OpenAI image generation, original website artwork | Generated on 2026-07-17 as a metrology instrument linking execution, evidence, and conformance | Benchmark, security, roadmap, and release evidence |

The generated artwork was created specifically for Maqam, then copied into the committed public asset directory. No external stock image, third-party logo, or runtime generation dependency is used.

The 0.3.0 governed-sources guide and release page reuse `integration-dock-3d.png` and its WebP derivative because the visual represents static adapters entering one controlled gateway. Reuse is intentional: no new image is presented as release evidence, and the artwork does not imply a provider partnership, live network verification, or Agent Reach affiliation.

Matching `.webp` files are high-quality delivery derivatives generated from the committed PNG masters. Pages use `<picture>` so supported browsers receive the smaller WebP while PNG remains the fallback and social-card source.

## Release media

Release videos, posters, captions, demo stills, and benchmark artifacts are
assembled from the repository's reviewed Remotion outputs and versioned release
asset staging directory. The fixed public paths are declared in `src/index.js`;
the short `/media/maqam-*` aliases remain for backwards compatibility.

The release operator must preserve rendered-video and benchmark provenance
beside their original outputs. Hosting provider, account, bucket, object-key,
route, credential, and environment configuration are intentionally outside the
public repository and do not change the authorship or benchmark claims.
