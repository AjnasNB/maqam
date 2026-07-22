# Maqam launch media matrix

Use existing reviewed artwork. Do not replace it with generic robots, locks, shields, fake dashboards, or fabricated benchmark screens.

| Surface | Asset | Native size | Use |
| --- | --- | ---: | --- |
| GitHub README / X / LinkedIn / YouTube | `app/assets/maqam-readme-hero.png` | 1672 x 941 | Primary wide launch banner; crop from the edges only |
| Product Hunt thumbnail | `docs/launch/assets/maqam-product-hunt-thumbnail.svg` and `.png` | 240 x 240 | Exact square product mark |
| Brand reference | `app/assets/maqam-brand-board.png` | 1024 x 1536 | Palette, logo spacing, and typography reference; do not post as the main landscape card |
| Architecture explanation | `app/assets/maqam-system-map.svg` | Vector | Technical articles and documentation |
| CLI-worker explanation | `app/assets/maqam-cli-agent-flow.png` | 1672 x 941 | Coding-agent integration posts |
| Product Hunt gallery 1 | `docs/assets/demo/01-scope-mismatch.png` | Release proof | “Changed input stays outside the approval” |
| Product Hunt gallery 2 | `docs/assets/demo/02-exact-execution.png` | Release proof | “The exact approved input executes once” |
| Product Hunt gallery 3 | `docs/assets/demo/03-evidence-linked.png` | Release proof | “The outcome leaves a linked receipt” |
| Benchmark article | `docs/assets/demo/04-benchmark-method.png` | Release proof | Method card, never a universal performance claim |
| Ecosystem explanation | `docs/assets/demo/05-ecosystem-boundary.png` | Release proof | Maqam, Qarinah, Crawler, and ProductLoop boundaries |

## Required alt text

**Primary banner:** Maqam approval gate connecting one reviewed agent input to one registered execution path, with policy and evidence nodes visible.

**Scope mismatch:** An altered tool input is rejected because it no longer matches the approved canonical input hash.

**Exact execution:** The registered tool accepts the exact approved input and consumes the one-use approval.

**Evidence-linked:** The governed action produces a reviewable outcome and source-linked evidence record.

## Publishing checks

- verify product name and tagline remain readable at mobile width;
- never show secrets, private paths, real browser profiles, or production tokens;
- keep release-proof screenshots attached to the release that generated them;
- provide captions for every video and meaningful alt text for every image; and
- test the live Open Graph card from a signed-out browser before launch.
