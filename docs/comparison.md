# Maqam and Related Open-Source Tools

Last reviewed: 2026-07-15. This comparison uses upstream repositories and official documentation. It is a product-scope comparison, not a performance benchmark or legal opinion.

## Positioning

Maqam is a local, provider-neutral governance framework for workflows and tools. Its center is the path from goal policy, through a registered tool gateway, to scoped approval and source-linked evidence. The built-in crawler is one connector, not the whole product.

No project reviewed below has that exact center, but Maqam is not the only agent runtime, approval system, crawler, or research tool. A practical substitute can be assembled from LangGraph plus a crawler or browser engine and application-specific policy and evidence code. Claims that Maqam is the "only," "best," or "perfect" system would not be supported by this review.

## Capability Matrix

| Project | Product center and web capability | Controls and evidence | Deployment and license | Relationship to Maqam |
| --- | --- | --- | --- | --- |
| Maqam | General workflow runtime, registered worker adapters, and a static HTTP crawler with robots.txt, sitemap discovery, bounded concurrency, per-origin rate limiting, Markdown, JSON, and JSONL output. | Deterministic goal/tool/origin/effect policy, exact input-bound one-use approvals, redacted traces, and claim-to-evidence links. | Local Node.js/npm package; MIT. | Governance is the differentiator. The crawler is intentionally smaller than dedicated crawl platforms. |
| [Crawl4AI](https://github.com/unclecode/crawl4ai) | Browser-backed crawling, sessions, hooks, deep BFS/DFS/best-first traversal, Markdown, and CSS/XPath/regex or model-assisted extraction. See its [deep-crawl](https://docs.crawl4ai.com/core/deep-crawling/) and [extraction](https://docs.crawl4ai.com/extraction/no-llm-strategies/) documentation. | URL filters and an optional robots.txt check. Its Markdown references are content citations, not a workflow approval or claim-provenance ledger. | Python, CLI, and Docker. Its [license](https://github.com/unclecode/crawl4ai/blob/main/LICENSE) contains Apache-2.0 text plus an additional prominent-attribution requirement. | Far broader crawler/browser feature set; not documented as a general cross-agent governance runtime. |
| [Firecrawl](https://github.com/firecrawl/firecrawl) | Search, scrape, interact, agent, crawl, map, batch, structured output, document parsing, CLI, MCP, and SDKs. See its [feature overview](https://github.com/firecrawl/firecrawl#feature-overview). | Robots.txt is respected by default and crawl webhooks can be HMAC-signed. The reviewed docs do not describe Maqam-style scoped approvals or claim-level evidence. | Hosted service and [self-hosting](https://github.com/firecrawl/firecrawl/blob/main/SELF_HOST.md). The core is AGPL-3.0; SDKs and some UI components are MIT, as stated in the [repository license notice](https://github.com/firecrawl/firecrawl#license). | A full web-context service. Prefer an optional API adapter over incorporating AGPL core code into Maqam. |
| [Crawlee](https://github.com/apify/crawlee) | Mature HTTP and Playwright/Puppeteer crawling with persistent request queues, storage, sessions, proxy rotation, retries, hooks, and autoscaling. | Operational crawl controls, not an agent policy, human-approval, or claim-evidence system. | Node.js/TypeScript and Python implementations; the linked Node project is [Apache-2.0](https://github.com/apify/crawlee/blob/master/LICENSE.md). | A strong optional crawl engine beneath Maqam's gateway; not a replacement for the governance layer. |
| [Browser Use](https://github.com/browser-use/browser-use) | Model-driven browser navigation, actions, form filling, extraction, custom tools, and persistent authenticated profiles. | Supports allowed/prohibited domains, domain-scoped tools, and domain-scoped sensitive data. See its [browser parameters](https://docs.browser-use.com/open-source/customize/browser/all-parameters) and [authentication guidance](https://docs.browser-use.com/open-source/customize/browser/authentication). It does not document Maqam's approval-receipt or claim-evidence model. | Self-hostable Python library and optional cloud service; [MIT](https://github.com/browser-use/browser-use/blob/main/LICENSE). | A natural browser-worker adapter that Maqam could govern. |
| [LangGraph](https://github.com/langchain-ai/langgraph) | Long-running, stateful agent orchestration with checkpoints, recovery, streaming, memory, and Python/JS libraries. | Its [human-in-the-loop middleware](https://docs.langchain.com/oss/python/langchain/human-in-the-loop) supports conditional tool review and approve/edit/reject/respond decisions. Its [persistence layer](https://docs.langchain.com/oss/python/langgraph/persistence) supports pause/resume and fault recovery. | Open-source library under [MIT](https://github.com/langchain-ai/langgraph/blob/main/LICENSE), with optional hosted services. | The closest runtime comparison. It is materially stronger than current Maqam in durable execution; Maqam's narrower distinction is exact one-use input binding and integrated evidence semantics. |

Adjacent research products also overlap with Maqam's research workflow. [GPT Researcher](https://github.com/assafelovic/gpt-researcher) generates source-tracked reports using planner and execution agents, while [Open Deep Research](https://github.com/langchain-ai/open_deep_research) is a configurable LangGraph research agent supporting multiple model, search, and MCP providers.

## Current Maqam Limitations

- The built-in crawler uses HTTP fetch and HTML parsing; it does not render JavaScript, operate a browser, provide web search or map endpoints, perform schema-based extraction, parse office documents, rotate proxies, or persist a distributed crawl queue.
- The current runtime, approval queue, and evidence ledger are in-process. Their JSON export makes host persistence possible, but Maqam does not itself provide durable checkpoint storage or restart-safe pause/resume comparable to LangGraph.
- Evidence records carry content hashes and claim links. They are not, by themselves, a signed or hash-chained tamper-evident audit bundle.
- Only calls routed through registered adapters are governed. An external agent's internal actions remain bounded by that provider's own sandbox and permission model.
- The crawler validates every DNS answer and redirect hop, blocks non-public destinations by default, and pins each request to a validated address. This reduces DNS-rebinding and redirect-based SSRF risk; it is not a substitute for deployment egress controls, authentication, Host/origin allowlists, or an isolated network boundary.
- Test success is evidence for the tested cases, not proof that the software has no errors.

## Safe Product Direction

Maqam can improve without copying another implementation:

- define a provider-neutral `search`, `map`, `crawl`, `scrape`, `extract`, `interact`, and `parse` connector contract;
- add optional adapters for dedicated engines while routing every call through Maqam policy, budget, trace, approval, and evidence hooks;
- add persistent run, approval, and evidence stores plus checkpoint/resume;
- retain raw-artifact digests, redirect history, robots decisions, extraction versions, and claim-level citations;
- extend the existing SSRF-safe destination validation with browser isolation, deployment egress policy, and continuing adversarial security fixtures; and
- publish reproducible comparisons instead of unqualified superiority claims.

## License Boundary

Reviewing public behavior does not incorporate upstream code. No source code, documentation text, examples, tests, assets, logos, or branding from the compared projects was copied into Maqam during this review. Any future dependency, vendoring, modification, or distribution must be audited separately. In particular, Firecrawl's AGPL core and Crawl4AI's additional attribution term require deliberate review before incorporation. An adapter to a separately installed or hosted service is the preferred architectural boundary, subject to project-owner legal review.
