# Provenance and License Notes

Last reviewed: 2026-07-20.

Maqam is an original Ajnas NB implementation distributed under the MIT license. The package implementation, API names, documentation, examples, tests, command-line behavior, product identity, and visual assets are maintained as Maqam work.

## Source Boundary

Public projects may be examined to understand the state of the market, compare documented behavior, identify security lessons, and design interoperable adapters. Inspection is not incorporation.

No source code, documentation text, examples, tests, prompts, generated assets, logos, or branding from the projects in the inspection log below was copied into Maqam. Project names and links appear only as nominative references for comparison and attribution; they do not imply affiliation or endorsement.

If a future change adds, vendors, modifies, links, or distributes third-party code, its exact version, source, license, notices, modifications, and distribution obligations must be reviewed and recorded before release. A network adapter to an independently installed or hosted service does not, by itself, mean that service's source is incorporated into Maqam, but the final architecture and use still require license review.

## Runtime Dependencies

Maqam's direct runtime dependencies are declared in `package.json` and resolved in `package-lock.json`:

- `cheerio`: MIT; HTML parsing for crawler extraction.
- `ipaddr.js`: MIT; IP address parsing and special-range classification for crawler destination policy.
- `robots-parser`: MIT; robots.txt parsing.
- `turndown`: MIT; HTML-to-Markdown conversion.
- `undici`: MIT; HTTP transport with a per-request dispatcher used to pin validated DNS destinations.

The installed package manifests and lockfile must be re-audited for every release. Transitive dependencies are not covered merely by listing the direct packages here.

## Optional External Integrations

The anonymous-public source pack uses two explicit external boundaries, neither of which is included in the Maqam tarball:

- [Exa hosted MCP](https://exa.ai/docs/reference/exa-mcp) is a third-party remote service. Maqam sends bounded requests only to its configured exact origin and does not include an Exa SDK, API key, server implementation, or account session. Operators must review the service's current privacy, terms, availability, and rate-limit conditions.
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.07.04) is an optional, separately installed executable. Maqam does not download, update, vendor, or redistribute it. The upstream core uses a public-domain dedication, while official standalone builds include components under additional licenses identified by upstream. Operators must verify the exact executable and preserve the notices applicable to that build.

The `2026.07.04` Windows standalone used for the 2026-07-18 manual compatibility check remained outside the repository and package. Its SHA-256 was `52FE3C26DCF71FBDC85B528589020BB0B8E383155CFA81B64DD447BBE35E24B8`, matching the upstream release checksum file. This compatibility check does not pin, install, endorse, or redistribute that executable for package consumers.

## Repository-Only Integration Fixtures

`integration-fixtures/google-adk-function-tool/` is a private npm workspace used to exercise an offline Google ADK `FunctionTool` callback routed through Maqam's `ToolGateway`. It is not listed in the root `files` allowlist and is not part of the published `maqam` npm tarball.

The fixture has its own lockfile and pins `@google/adk@1.2.0` under Apache-2.0. Its CI install command uses `npm --prefix integration-fixtures/google-adk-function-tool ci --ignore-scripts`; this is intentional because the resolved fixture tree contains packages that declare install scripts, including `@google/genai`, `protobufjs`, and `sqlite3`, while the offline callback test does not need install-time native compilation. The fixture lockfile uses npm `overrides` for audited vulnerable transitive paths and is checked by `npm run audit:google-adk-fixture`.

The fixture audit observed no missing package-license fields in the resolved dependency tree. License identifiers present in the resolved tree include MIT, Apache-2.0, ISC, BSD-family identifiers, 0BSD, BlueOak-1.0.0, LGPL-2.1-or-later and Python-2.0. This record is dependency-surface evidence only; it is not legal advice and does not make Google ADK a Maqam runtime dependency.

## Upstream Inspection Log

The following entries record reference inspection only. None is a Maqam runtime dependency, and no code from them was copied into this package.

| Project | Upstream license observed | What was inspected |
| --- | --- | --- |
| [Agent Reach](https://github.com/Panniantong/Agent-Reach) at commit `1494c2ab239e7355a77e7cceaf3271453a1f34b5` | MIT, from the repository `LICENSE` at the inspected commit. | Explicit source-channel configuration, ordered routing, diagnostics, platform-tool setup, and authentication/session assumptions. Maqam independently implements only the registry/doctor ideas within its existing `ToolGateway` boundary; no Agent Reach source, documentation, examples, tests, assets, logos, or branding was copied. |
| [Crawl4AI](https://github.com/unclecode/crawl4ai) | Its [license file](https://github.com/unclecode/crawl4ai/blob/main/LICENSE) contains Apache-2.0 text plus an additional prominent-attribution requirement. | Browser crawling, deep-crawl strategies, extraction, deployment, robots configuration, and the security boundary described in its [v0.9.0 release notes](https://github.com/unclecode/crawl4ai/blob/main/docs/blog/release-v0.9.0.md). |
| [Firecrawl](https://github.com/firecrawl/firecrawl) | Primarily AGPL-3.0; SDKs and some UI components are MIT, as stated in its [license notice](https://github.com/firecrawl/firecrawl#license). | Search/scrape/interact/crawl/map product surface, self-hosting, webhook integrity, robots behavior, and cloud-versus-self-host boundaries. |
| [Crawlee](https://github.com/apify/crawlee) | [Apache-2.0](https://github.com/apify/crawlee/blob/master/LICENSE.md). | HTTP/browser crawler architecture, queues, storage, sessions, retries, proxy rotation, and deployment patterns. |
| [Browser Use](https://github.com/browser-use/browser-use) | [MIT](https://github.com/browser-use/browser-use/blob/main/LICENSE). | Browser-agent actions, custom tools, domain restrictions, sensitive-data scoping, persistent profiles, and local/cloud boundaries. |
| [LangGraph](https://github.com/langchain-ai/langgraph) | [MIT](https://github.com/langchain-ai/langgraph/blob/main/LICENSE). | Durable execution, persistence, checkpoints, conditional human review, and pause/resume semantics. |
| [Qwen-Agent](https://github.com/QwenLM/Qwen-Agent) | Apache-2.0. | Public agent, tool, model, MCP, and application separation patterns. |
| [PageAgent](https://github.com/alibaba/page-agent) | MIT. | Public in-page browser-agent boundaries and MCP positioning. Earlier audit text that called this project Apache-2.0 was incorrect and has been corrected. |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | Apache-2.0. | Public terminal-agent and provider-neutral model configuration patterns. |
| [Google ADK](https://adk.dev/get-started/typescript/) / [`@google/adk`](https://www.npmjs.com/package/@google/adk) | Apache-2.0 from the inspected npm package metadata. | Optional integration pattern plus the repository-only offline `FunctionTool` fixture. No Google source, docs text, credentials, service output, branding or provider account state is copied into Maqam. |

See [comparison.md](comparison.md) for the evidence-linked product comparison derived from this inspection.

## Compliance Rules

- Respect robots.txt by default.
- Do not bypass login walls, paywalls, anti-bot systems, CAPTCHA, private content, or authorization boundaries.
- Do not let automation publish without explicit maintainer approval for the exact artifact and protected trusted-publishing environment gate.
- Keep release evidence for tests, package contents, dependency audit, provenance, and the publish decision.
- Keep Maqam under MIT unless the package owner explicitly approves a change after compatibility review.
- Do not describe inspection as a license to copy. Ideas and documented behavior may inform an original implementation; copied expression or code carries its own obligations.

This file records engineering provenance and is not legal advice.
