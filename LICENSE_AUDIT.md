# License Audit

Audit date: 2026-07-20.

## Package License

Maqam is distributed under MIT. Market research and reference inspection do not change that license because no inspected upstream implementation was incorporated into this package.

## Direct Runtime Dependencies

| Package | Version resolved at review | Declared license | Purpose |
| --- | --- | --- | --- |
| `@types/node` | 20.19.43 | MIT | Node.js declarations required by the public `maqam/server` TypeScript surface. |
| `cheerio` | 1.2.0 | MIT | HTML parsing and extraction. |
| `ipaddr.js` | 2.4.0 | MIT | IP address parsing and special-range classification. |
| `robots-parser` | 3.0.1 | MIT | robots.txt parsing. |
| `turndown` | 7.2.4 | MIT | HTML-to-Markdown conversion. |
| `undici` | 7.28.0 | MIT | HTTP transport with pinned, validated DNS destinations. |

Versions are resolved by `package-lock.json`; installed package manifests reported the licenses above. Re-run the dependency and package-content audits whenever the lockfile changes. This table is not a substitute for reviewing transitive packages and included license files.

## Optional External Source Boundaries

These integrations are not npm dependencies and are not distributed in the Maqam tarball:

| External system | Evidence reviewed | Distribution and responsibility boundary |
| --- | --- | --- |
| [Exa hosted MCP](https://exa.ai/docs/reference/exa-mcp) | Official hosted-MCP documentation reviewed 2026-07-18. | Maqam sends a bounded MCP request to an explicitly declared remote origin. No Exa SDK, server source, credentials, or branding is bundled. Operators remain responsible for Exa's current service terms, privacy policy, availability, and rate limits. |
| [`yt-dlp`](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.07.04), release `2026.07.04` | Upstream core `LICENSE` is a public-domain dedication. The release notes state that standalone executables also contain ISC-, MIT-, and other third-party-licensed components recorded in the release's `THIRD_PARTY_LICENSES.txt`. | Maqam never installs or redistributes `yt-dlp`. An operator must provide an absolute path to a separately reviewed executable and retain the notices applicable to the exact build they install. The live compatibility binary used during this audit stayed outside the repository and npm package. |

## Repository-Only Video Toolchain

`demo/remotion/` is a separate private npm workspace used to render launch media. It is excluded from the public `maqam` npm tarball and adds no Maqam runtime dependency.

| Package | Version | License observed | Purpose |
| --- | --- | --- | --- |
| `remotion`, `@remotion/cli` | 4.0.490 | Remotion License | Composition and local rendering. The official pricing page describes free use for individuals and companies up to three people; larger collaborations/companies require a company license. |
| `@remotion/captions` | 4.0.490 | MIT | Caption grouping and display. |
| `@remotion/media` | 4.0.490 | Package manifest omits a license field; it depends on `remotion`, so the upstream Remotion terms must be reviewed as a unit. | Audio playback during render. |
| `react`, `react-dom` | 19.2.3 | MIT | Video composition UI. |
| `typescript` | 5.9.3 | Apache-2.0 | Repository-only type checking. |
| `eslint`, `prettier` | 9.39.5, 3.8.1 | MIT | Repository-only linting and formatting. |

The original Maqam video composition, narration, captions, and generated proof assets are covered by the root MIT project license. Third-party rendering software retains its own terms. See [`demo/remotion/ASSET_PROVENANCE.md`](demo/remotion/ASSET_PROVENANCE.md) and the [official Remotion license page](https://www.remotion.dev/docs/license/pricing). This project records Ajnas NB as an individual publisher; any larger organization must confirm its own eligibility before re-rendering or operationalizing the toolchain.

## Repository-Only Google ADK Fixture

`integration-fixtures/google-adk-function-tool/` is a private fixture workspace. It is excluded from Maqam's root package allowlist and is not a runtime dependency of `maqam`.

| Package | Version | License observed | Purpose |
| --- | --- | --- | --- |
| `@google/adk` | 1.2.0 | Apache-2.0 | Offline `FunctionTool` callback fixture that routes one deterministic function call through Maqam's `ToolGateway`. |

The fixture is installed in CI with `npm --prefix integration-fixtures/google-adk-function-tool ci --ignore-scripts`, audited with `npm run audit:google-adk-fixture`, and tested with `npm run test:google-adk-fixture`. Install scripts are deliberately disabled because the resolved fixture tree contains install-script packages (`@google/genai`, `protobufjs`, `sqlite3`) while the offline FunctionTool fixture does not require native compilation or provider setup. The fixture lockfile uses npm `overrides` to keep audited vulnerable transitive paths on patched versions.

The resolved fixture tree's package metadata reported no missing license fields during the 2026-07-20 audit. License identifiers observed in the tree include MIT, Apache-2.0, ISC, BSD-family identifiers, 0BSD, BlueOak-1.0.0, LGPL-2.1-or-later and Python-2.0. This fixture does not certify live Google ADK, Gemini, Google account, Tool Confirmation, MCPToolset or production behavior.

## Inspected References, Not Dependencies

No source code, documentation text, examples, tests, prompts, assets, logos, or branding from these projects was copied into Maqam.

| Project | License observed from upstream | Incorporation status |
| --- | --- | --- |
| [Agent Reach](https://github.com/Panniantong/Agent-Reach), commit `1494c2ab239e7355a77e7cceaf3271453a1f34b5` | MIT in the inspected repository `LICENSE`. | Reference inspection only. Its explicit source-channel registry and doctor concepts informed an independent JavaScript implementation for Maqam's existing `ToolGateway`; no source, documentation, examples, tests, assets, logos, or branding was copied. |
| [Crawl4AI](https://github.com/unclecode/crawl4ai) | [Apache-2.0 text plus an additional prominent-attribution requirement](https://github.com/unclecode/crawl4ai/blob/main/LICENSE). | Reference inspection only; no code incorporated. |
| [Firecrawl](https://github.com/firecrawl/firecrawl) | Primarily AGPL-3.0; SDKs and some UI components are MIT. See its [license notice](https://github.com/firecrawl/firecrawl#license). | Reference inspection only; no code incorporated. An optional external-service adapter is preferable to copying AGPL core into this MIT package. |
| [Crawlee](https://github.com/apify/crawlee) | [Apache-2.0](https://github.com/apify/crawlee/blob/master/LICENSE.md). | Reference inspection only; no code incorporated. |
| [Browser Use](https://github.com/browser-use/browser-use) | [MIT](https://github.com/browser-use/browser-use/blob/main/LICENSE). | Reference inspection only; no code incorporated. |
| [LangGraph](https://github.com/langchain-ai/langgraph) | [MIT](https://github.com/langchain-ai/langgraph/blob/main/LICENSE). | Reference inspection only; no code incorporated. |
| [Microsoft Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit) | MIT. | Reference inspection only; no code incorporated. |
| [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) | MIT. | Reference inspection only; no code incorporated. |
| [OpenAI Agents SDK for JavaScript](https://github.com/openai/openai-agents-js) | MIT. | Reference inspection only; no code incorporated. |
| [Invariant Guardrails](https://github.com/invariantlabs-ai/invariant) | Apache-2.0. | Reference inspection only; no code incorporated. |
| [NVIDIA NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) | Apache-2.0. | Reference inspection only; no code incorporated. |
| [Open Policy Agent](https://github.com/open-policy-agent/opa) | Apache-2.0. | Reference inspection only; no code incorporated. |
| [HumanLayer legacy repository](https://github.com/humanlayer/humanlayer) | Apache-2.0 for the deprecated public repository; do not infer that license for the current rebuild. | Reference inspection only; no code incorporated. |
| [Arize Phoenix](https://github.com/Arize-ai/phoenix) | Elastic License 2.0 at the reviewed root license. | Source-available reference inspection only; no code incorporated. |
| [Qwen-Agent](https://github.com/QwenLM/Qwen-Agent) | Apache-2.0. | Reference inspection only; no code incorporated. |
| [PageAgent](https://github.com/alibaba/page-agent) | MIT. | Reference inspection only; no code incorporated. This corrects an earlier audit entry that incorrectly listed Apache-2.0. |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | Apache-2.0. | Reference inspection only; no code incorporated. |
| [Google ADK](https://adk.dev/get-started/typescript/) / [`@google/adk`](https://www.npmjs.com/package/@google/adk) | Apache-2.0 from inspected package metadata. | Optional integration pattern and private offline fixture only; no source, docs text, provider credentials, account state, branding or live service output incorporated. |

## Distribution Boundary

- Maqam's published tarball may include only Maqam files and declared dependency metadata intended by `package.json`.
- Nominative project names and links in comparison/provenance documentation are references, not bundled branding or endorsement claims.
- Any future dependency, vendored file, port, patch, generated derivative, or copied documentation requires a new audit of the exact upstream version and obligations.
- Firecrawl's AGPL core must not be copied into the MIT package without an explicit architecture and license decision.
- Crawl4AI's additional attribution language must be evaluated before any incorporation or derivative use.
- Agent Reach's permissive license does not make copied code part of Maqam automatically. Any future incorporation would still require exact-file provenance, copyright/license notice handling, modification records, and a new audit.
- A network request to Exa or an operator-provided `yt-dlp` process is an external integration, not an incorporation claim. Bundling either implementation later would require a new exact-version audit.
- Permissive licenses still require preservation of applicable copyright and license notices.

## Result

The inspected references add no third-party source to the current Maqam package and therefore do not alter its MIT license. The direct runtime dependencies listed above report MIT licenses. See [docs/provenance-and-licenses.md](docs/provenance-and-licenses.md) for the inspection record and [docs/comparison.md](docs/comparison.md) for the evidence-linked product comparison.

This audit is an engineering record, not legal advice.
