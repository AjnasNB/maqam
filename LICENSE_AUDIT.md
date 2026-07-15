# License Audit

Audit date: 2026-07-15.

## Package License

Maqam is distributed under MIT. Market research and reference inspection do not change that license because no inspected upstream implementation was incorporated into this package.

## Direct Runtime Dependencies

| Package | Version resolved at review | Declared license | Purpose |
| --- | --- | --- | --- |
| `cheerio` | 1.2.0 | MIT | HTML parsing and extraction. |
| `ipaddr.js` | 2.4.0 | MIT | IP address parsing and special-range classification. |
| `robots-parser` | 3.0.1 | MIT | robots.txt parsing. |
| `turndown` | 7.2.4 | MIT | HTML-to-Markdown conversion. |
| `undici` | 6.27.0 | MIT | HTTP transport with pinned, validated DNS destinations. |

Versions are resolved by `package-lock.json`; installed package manifests reported the licenses above. Re-run the dependency and package-content audits whenever the lockfile changes. This table is not a substitute for reviewing transitive packages and included license files.

## Inspected References, Not Dependencies

No source code, documentation text, examples, tests, prompts, assets, logos, or branding from these projects was copied into Maqam.

| Project | License observed from upstream | Incorporation status |
| --- | --- | --- |
| [Crawl4AI](https://github.com/unclecode/crawl4ai) | [Apache-2.0 text plus an additional prominent-attribution requirement](https://github.com/unclecode/crawl4ai/blob/main/LICENSE). | Reference inspection only; no code incorporated. |
| [Firecrawl](https://github.com/firecrawl/firecrawl) | Primarily AGPL-3.0; SDKs and some UI components are MIT. See its [license notice](https://github.com/firecrawl/firecrawl#license). | Reference inspection only; no code incorporated. An optional external-service adapter is preferable to copying AGPL core into this MIT package. |
| [Crawlee](https://github.com/apify/crawlee) | [Apache-2.0](https://github.com/apify/crawlee/blob/master/LICENSE.md). | Reference inspection only; no code incorporated. |
| [Browser Use](https://github.com/browser-use/browser-use) | [MIT](https://github.com/browser-use/browser-use/blob/main/LICENSE). | Reference inspection only; no code incorporated. |
| [LangGraph](https://github.com/langchain-ai/langgraph) | [MIT](https://github.com/langchain-ai/langgraph/blob/main/LICENSE). | Reference inspection only; no code incorporated. |
| [Qwen-Agent](https://github.com/QwenLM/Qwen-Agent) | Apache-2.0. | Reference inspection only; no code incorporated. |
| [PageAgent](https://github.com/alibaba/page-agent) | MIT. | Reference inspection only; no code incorporated. This corrects an earlier audit entry that incorrectly listed Apache-2.0. |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | Apache-2.0. | Reference inspection only; no code incorporated. |

## Distribution Boundary

- Maqam's published tarball may include only Maqam files and declared dependency metadata intended by `package.json`.
- Nominative project names and links in comparison/provenance documentation are references, not bundled branding or endorsement claims.
- Any future dependency, vendored file, port, patch, generated derivative, or copied documentation requires a new audit of the exact upstream version and obligations.
- Firecrawl's AGPL core must not be copied into the MIT package without an explicit architecture and license decision.
- Crawl4AI's additional attribution language must be evaluated before any incorporation or derivative use.
- Permissive licenses still require preservation of applicable copyright and license notices.

## Result

The inspected references add no third-party source to the current Maqam package and therefore do not alter its MIT license. The direct runtime dependencies listed above report MIT licenses. See [docs/provenance-and-licenses.md](docs/provenance-and-licenses.md) for the inspection record and [docs/comparison.md](docs/comparison.md) for the evidence-linked product comparison.

This audit is an engineering record, not legal advice.
