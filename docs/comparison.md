# Maqam And Related Open-Source Or Source-Available Tools

Last reviewed: 2026-07-16.

This document compares product scope using official repositories and official documentation available on the review date. Most entries are open source; deprecated or source-available exceptions are identified explicitly. It is not a performance benchmark, security certification, endorsement, or legal opinion. Projects evolve; follow the links before making an adoption or license decision.

Maqam does not publish a speed ranking for these products. Its [MGES v1 benchmark](../benchmarks/README.md) measures only Maqam's own local component path and project-defined conformance fixtures. A fair cross-product benchmark would require the same representative workload, policy and approval obligations, trace/evidence outputs, persistence model, configuration disclosure, repeated environments, predeclared analysis and public adapters for every participant. Those matched conditions do not exist in MGES v1.

## Short Answer

Maqam is not the only open-source project concerned with agent safety, human approval, policy, provenance, orchestration, or crawling. Its current center is narrower: a local TypeScript path from declared policy, through a registered tool boundary, to exact run/tool/input-bound one-use approval and same-run claim-to-evidence records.

The closest broad governance comparison is [Microsoft Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit), whose repository describes a substantially wider governance platform and labels it public preview, with possible breaking changes before general availability. HumanLayer historically overlapped with approval of high-stakes function calls, but its [current public repository](https://github.com/humanlayer/humanlayer) says that the code there is deprecated and directs users to a rebuild; the [current product site](https://humanlayer.com) says that rebuild is not yet open source. A practical substitute for Maqam can also be assembled from an orchestration framework, application-specific policy and approval code, and an observability system.

Maqam is currently smaller than those combined stacks. Its proposed value is a focused, provider-neutral boundary with explicit semantics that can wrap existing workers instead of replacing their orchestration runtime.

## What Maqam Actually Enforces

For calls made through a configured `ToolGateway`, current Maqam can:

- evaluate configured tool, origin, effect, and limit policy before the handler runs;
- require gateway-generated approval records for configured tools or effects;
- bind those records to the run id, tool, and canonical input hash;
- reject changed, invalid, mismatched, or consumed approvals;
- execute the detached input snapshot that was authorized;
- record redacted tool traces and configured usage limits; and
- record source evidence and same-run claim links through scoped capabilities.

It does not intercept unregistered processes, authenticate a human identity by itself, provide a hard operating-system sandbox, make in-process state durable, or prove that a claim is true. Those limits matter throughout the comparison.

## Governance, Policy, And Approval

| Project | Officially documented center | Meaningful overlap | Where it is broader or stronger today | Maqam's narrower distinction |
| --- | --- | --- | --- | --- |
| [Microsoft Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit) | Agent identity, policy enforcement, sandboxing, human oversight, audit, and integrations. The repository describes the project as public preview. | Preventive policy, tool governance, human approval, and auditability. | Broader governance architecture, identity concepts, sandbox integration, multi-language surfaces, and ecosystem integrations. | Small local TypeScript package with exact one-use input binding and an integrated claim-evidence record. It should be evaluated as a lighter embedding option, not described as more complete. |
| [HumanLayer public repository](https://github.com/humanlayer/humanlayer) | Historically provided human-in-the-loop review for high-stakes function calls. The current README says the public code is deprecated and points to a rebuild whose product site says it is not yet open source. | Historical approval and review workflow overlap. | Do not treat the deprecated repository as a current maintained open-source approval platform or assume that its license applies to the rebuild. | Maqam currently ships the local gateway approval semantics described above; it does not provide a comparable hosted reviewer product. |
| [Invariant](https://github.com/invariantlabs-ai/invariant) | Runtime guardrails and policy checks for agent traces and tool interactions. | Detecting and blocking disallowed behavior at an agent/tool boundary. | Dedicated policy language and guardrail analysis designed around agent traces. | Maqam combines a smaller deterministic policy surface with approval consumption and evidence records. Invariant is a stronger starting point when expressive guardrail policy is the primary need. |
| [Open Policy Agent](https://github.com/open-policy-agent/opa) | General-purpose policy-as-code and policy decision APIs. | Externalized allow/deny decisions for structured input. | Mature, domain-neutral policy language, tooling, bundles, decision infrastructure, and deployment patterns. | Maqam supplies agent-specific tool/effect/origin integration, approval lifecycle, and evidence semantics. OPA can be an upstream decision engine rather than a competitor to the complete Maqam path. |
| [NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) | Programmable rails for model input, output, dialog, retrieval, and tool behavior. | Constraining model-driven applications before or after model/tool activity. | Rich conversational and model-output guardrail surface. | Maqam focuses on deterministic execution authority at registered tools and does not attempt to replace dialog or content guardrails. The two layers can be complementary. |
| [Guardrails AI](https://github.com/guardrails-ai/guardrails) | Validation and correction of model inputs and outputs using reusable validators. | Validation around model-generated values. | Validator ecosystem and structured-output validation are the product center. | Maqam governs whether and how a tool executes. It is not an output-quality validator marketplace. |

License references: the linked Microsoft Agent Governance Toolkit repository publishes an [MIT license](https://github.com/microsoft/agent-governance-toolkit/blob/main/LICENSE); the deprecated HumanLayer repository retains an [Apache-2.0 license](https://github.com/humanlayer/humanlayer/blob/main/LICENSE); Invariant publishes an [Apache-2.0 license](https://github.com/invariantlabs-ai/invariant/blob/main/LICENSE); OPA publishes an [Apache-2.0 license](https://github.com/open-policy-agent/opa/blob/main/LICENSE); NeMo Guardrails publishes an [Apache-2.0 license](https://github.com/NVIDIA-NeMo/Guardrails/blob/develop/LICENSE.md); and Guardrails AI publishes an [Apache-2.0 license](https://github.com/guardrails-ai/guardrails/blob/main/LICENSE). The old HumanLayer repository license does not establish the terms of the rebuild it links to.

## Agent And Workflow Runtimes

| Project | Officially documented center | Meaningful overlap | Where it is broader or stronger today | Relationship to Maqam |
| --- | --- | --- | --- | --- |
| [OpenAI Agents SDK for JavaScript](https://github.com/openai/openai-agents-js) | A TypeScript/JavaScript agent runtime with agents, tools, handoffs, guardrails, sessions, tracing, and model-provider integration; see the [official documentation](https://openai.github.io/openai-agents-js/). | TypeScript agents, tools, guardrails, tracing, and a [first-class human-in-the-loop tool-approval flow](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/). | Model and agent orchestration, handoffs, sessions, realtime/voice surfaces, tracing, approval/resumption, and OpenAI ecosystem integration. | Maqam is not a replacement for the SDK's agent loop or approval feature. Its narrower distinction is its documented canonical run/tool/input binding, one-use gateway consumption, effect policy, and claim-evidence record; verify whether those semantics add value before composing the two. |
| [LangGraph](https://github.com/langchain-ai/langgraph) | Long-running, stateful graph orchestration with persistence, streaming, memory, interrupts, and human-in-the-loop workflows. | Tool routing, first-class review interrupts, workflow state, and traces. | Durable execution, checkpoints, pause/resume, recovery, graph composition, and ecosystem maturity; see JavaScript [persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) and [human-in-the-loop](https://docs.langchain.com/oss/javascript/langchain/human-in-the-loop). | LangGraph is materially stronger for durable orchestration and already supports human review. Maqam's narrower distinction is its exact gateway receipt/consumption contract and integrated evidence semantics. |
| [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) | Python and .NET framework for building agents and graph-based workflows; see the [official overview](https://learn.microsoft.com/en-us/agent-framework/overview/). | Agents, tools, workflows, middleware, state, and human review patterns. | Broader agent/workflow runtime, provider integrations, durability, hosting patterns, and enterprise ecosystem. | Agent Framework is not a TypeScript runtime. An integration would place Maqam behind a separate Node connector/service boundary; no first-party integration exists today. |

These projects are not evidence that Maqam should grow another complete agent loop. Interoperability is the safer direction. OpenAI Agents SDK, LangGraph, and Microsoft Agent Framework all publish permissive open-source licenses in their linked repositories: [MIT](https://github.com/openai/openai-agents-js/blob/main/LICENSE), [MIT](https://github.com/langchain-ai/langgraph/blob/main/LICENSE), and [MIT](https://github.com/microsoft/agent-framework/blob/main/LICENSE), respectively.

## Observability, Evaluation, And Provenance

| Project | Officially documented center | Meaningful overlap | Where it is broader or stronger today | Relationship to Maqam |
| --- | --- | --- | --- | --- |
| [Langfuse](https://github.com/langfuse/langfuse) | LLM observability, tracing, prompt management, evaluation, and datasets. | Traces, usage, review, and evaluation context. | Production observability UI, analytics, prompt/evaluation workflows, integrations, and hosted/self-hosted operations. | Export Maqam events to an observability system; do not turn the local evidence ledger into a competing analytics platform. Review the repository's [license boundaries](https://github.com/langfuse/langfuse/blob/main/LICENSE) because enterprise directories have different terms from the MIT-licensed core identified there. |
| [Arize Phoenix](https://github.com/Arize-ai/phoenix) | AI observability and evaluation with tracing, experiments, datasets, and OpenTelemetry support. | Trace inspection, evaluation, and evidence used during review. | Dedicated observability/evaluation product, UI, experiments, and telemetry integrations. | Phoenix can analyze or display workflow events. Maqam's evidence ledger is a small execution-time provenance primitive, not a replacement for Phoenix. The current root [license is Elastic License 2.0](https://github.com/Arize-ai/phoenix/blob/main/LICENSE), which restricts offering the software as a hosted or managed service; review it rather than assuming an OSI-approved license. |

Maqam evidence records contain source metadata, excerpts, hashes, and claim links. They do not provide the operational analytics, distributed collection, experiment management, or review UI of dedicated observability products. They also do not semantically prove a claim.

## Crawling, Browser Automation, And Research

| Project | Officially documented center | Meaningful overlap | Where it is broader or stronger today | Relationship to Maqam |
| --- | --- | --- | --- | --- |
| [Agent Reach](https://github.com/Panniantong/Agent-Reach) | A setup and diagnostics layer that helps agents reach multiple web and social information channels through installed tools and authenticated local capabilities. | Explicit source channels, ordered routing concepts, diagnostics, and agent-facing research access. | Broad platform coverage, automatic setup guidance, external-tool installation, and cookie/session-oriented access patterns. | Maqam 0.3 adopts only the general idea of explicit source descriptors and health reports. Maqam independently implements governed routing through `ToolGateway`, normalized documents, fatal-error stop rules, and no automatic login/cookie behavior. It does not claim equivalent channel coverage. |
| [Crawl4AI](https://github.com/unclecode/crawl4ai) | Browser-backed crawling, sessions, hooks, deep traversal, Markdown generation, and structured or model-assisted extraction; see [deep crawling](https://docs.crawl4ai.com/core/deep-crawling/) and [extraction](https://docs.crawl4ai.com/extraction/no-llm-strategies/). | Collecting web material for agent workflows, URL filtering, robots configuration, and source-oriented Markdown. | JavaScript rendering, browser sessions, extraction strategies, deep crawl options, and deployment depth. | A future separately installed adapter can route Crawl4AI through Maqam policy and evidence. The built-in Maqam crawler is intentionally smaller and HTTP-only. |
| [Firecrawl](https://github.com/firecrawl/firecrawl) | Search, scrape, crawl, map, interact, structured extraction, document parsing, APIs, SDKs, CLI, and MCP. | Web collection and structured context for agents. | Full hosted/self-hosted web-context platform, browser-backed capabilities, search/map APIs, document processing, and operational scale. | Prefer an API adapter over incorporating the core. Firecrawl is a much broader crawl product; it does not replace Maqam's general approval/evidence boundary. |
| [Crawlee](https://github.com/apify/crawlee) | Production crawling with HTTP and Playwright/Puppeteer, request queues, storage, sessions, proxies, retries, hooks, and autoscaling. | Crawl limits, request lifecycle, and browser/HTTP collection. | Mature crawler operations, persistent queues and storage, browser engines, sessions, proxies, and autoscaling. | Crawlee is a strong optional engine beneath a governed adapter. Maqam is not attempting to reproduce Crawlee's operational feature set. |
| [Browser Use](https://github.com/browser-use/browser-use) | Model-driven browser navigation, interaction, extraction, custom tools, and persistent profiles. | Agent-driven browser tools, allowed domains, and sensitive-data controls. | Interactive browser automation and model-driven navigation. | A browser worker can be governed at its adapter boundary, but Maqam cannot see or prevent every internal browser action unless the adapter exposes and enforces it. |

License boundaries deserve special attention. Agent Reach was inspected at commit `1494c2ab239e7355a77e7cceaf3271453a1f34b5` and its repository license is MIT. Firecrawl states that its core is [AGPL-3.0](https://github.com/firecrawl/firecrawl#license), with some SDK/UI components under different terms. Crawlee publishes [Apache-2.0](https://github.com/apify/crawlee/blob/master/LICENSE.md). Browser Use publishes [MIT](https://github.com/browser-use/browser-use/blob/main/LICENSE). The reviewed [Crawl4AI license](https://github.com/unclecode/crawl4ai/blob/main/LICENSE) contains Apache-2.0 text plus an additional prominent-attribution condition; obtain legal review before incorporating or redistributing code. No Agent Reach source or other compared-project source was copied into Maqam.

## Capability Summary

The table below describes product emphasis, not exhaustive feature support. "Application-supplied" means the surrounding application can build the capability, not that the project ships Maqam-equivalent semantics.

| Capability | Maqam 0.3.0 | Microsoft AGT | HumanLayer legacy repo | LangGraph | OpenAI Agents SDK | OPA | Firecrawl/Crawl4AI |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Primary product center | Tool governance boundary | Broad agent governance | Historical human review; now deprecated | Durable orchestration | Agent runtime | General policy engine | Web acquisition |
| Exact run/tool/input approval binding | Built in at `ToolGateway` | Review its current approval contract for the deployment | Deprecated repository | First-class interrupts; the application defines its review payload and exact receipt contract | First-class tool approval; verify its approval item/run-state contract against the required binding | Application-supplied | Not product center |
| One-use approval consumption | Built in, in process | Review current implementation | Deprecated repository | Checkpoint/interrupt state is first class; the application defines any separate one-use receipt | Approval state is first class; verify replay/consumption semantics for the use case | Not an approval store | Not product center |
| Durable restart-safe state | Not yet | Broader platform scope; verify selected components | Deprecated repository | Core strength | Sessions are supported; verify required durability | Policy data/bundles, not workflow state | Crawl-job dependent |
| Claim-to-source records | Built in, in process | Audit-focused; verify claim-level requirements | Deprecated repository | Application-supplied | Application-supplied | Not product center | Source content/citations vary by product |
| Browser or advanced crawling | Basic HTTP crawler | Integration-oriented | Deprecated repository | Via tools | Via tools | Not product center | Core strength |
| Ordered governed source routing | Built in for registered host adapters; normalized documents and fatal-error stop rules | Verify current connector/router surface | Deprecated repository | Application-supplied | Application-supplied | Not product center | Source selection varies by product |
| Hard host sandbox | No | Sandbox integrations are in scope | Deprecated repository | No universal host sandbox | No universal host sandbox | No | Deployment dependent |

Do not infer absence from an empty cell in any marketing matrix. Verify the current version, deployment, and exact guarantee needed for the use case.

## Which Should You Choose?

Choose **Maqam** when:

- the application is TypeScript/Node.js;
- risky activity already has a stable function, CLI, or connector boundary;
- exact approval binding and replay prevention are more important than a broad workflow UI;
- local embedding and a small dependency surface are desirable; and
- in-process state is acceptable or the host will provide trusted persistence.

Choose **Microsoft Agent Governance Toolkit** when broad governance architecture, identity, sandbox integration, and its supported integrations match the deployment better.

The deprecated **HumanLayer** public repository is useful historical reference for approval-centered workflows, but its README now points to a rebuild and the current site says that rebuild is not yet open source. Evaluate the current product and terms directly rather than adopting the old repository as a maintained alternative.

Choose **LangGraph**, **OpenAI Agents SDK**, or **Microsoft Agent Framework** when the primary requirement is building and running the agent or workflow itself. Maqam can be added around selected tools rather than replacing that runtime.

Choose **OPA** or **Invariant** when an expressive, independently managed policy layer is the center of the architecture.

Choose **Langfuse** or **Phoenix** when observability, evaluation, experiments, and operations are the main need.

Choose **Agent Reach** when the main goal is broad agent access to many installed web/social channels and its setup, authentication, and platform terms fit the deployment.

Choose **Firecrawl**, **Crawl4AI**, **Crawlee**, or **Browser Use** when web acquisition or browser automation is the product center.

## Maqam, ProductLoop OS, And Cockroach Crawler

These are related Ajnas NB projects, not three names for the same package:

- **Maqam** is the focused governance product and primary public brand.
- [ProductLoop OS](https://github.com/AjnasNB/productloop-os) is a separate modular suite for runtime, skills, provenance, policy, evaluation, connectors, approvals, and browser research. It composes with Maqam.
- [Cockroach Crawler](https://cockroachcrawler.com/docs/) is a dedicated crawler package with a broader crawl/browser focus than Maqam's built-in research connector. Its [agent integration guide](https://cockroachcrawler.com/docs/agents/) keeps crawler network policy in the crawler and routes the registered tool call through Maqam.

A user who wants the governance boundary should start with `npm install maqam`. A user who needs individually consumable ProductLoop modules or only a crawler can choose those packages directly.

## Current Maqam Limitations

- Runtime, approval, trace, and evidence state is in-process. JSON export makes host persistence possible, but Maqam does not ship durable checkpoints or restart-safe pause/resume.
- Approval records are structurally validated. Maqam does not authenticate reviewer identity or cryptographically protect restored queue JSON.
- Evidence content hashes and claim links record provenance. They do not establish source trustworthiness or semantic truth.
- Only calls routed through registered adapters are governed. Provider-internal or unregistered actions remain bounded by provider and host controls.
- The built-in crawler does not render JavaScript, drive a browser, rotate proxies, parse office documents, or operate a distributed persistent queue.
- Governed Sources does not install provider tools, import browser cookies/sessions, log into social platforms, or bundle ready-made provider channel adapters.
- `routeUngoverned()` is an explicit direct path and has no `ToolGateway` policy, approval, call ceiling, or trace guarantee.
- SSRF defenses reduce risk for the covered network paths; they do not replace deployment egress controls, authentication, Host/origin allowlists, and isolation.
- Successful tests are evidence for the cases executed, not proof that the software has no defects.

## Safe Product Direction

The comparison suggests a focused path:

- integrate with mature runtimes instead of building another universal agent loop;
- publish a connector contract and conformance tests;
- add durable approval/evidence storage without treating serialization as authentication;
- export to established observability tools;
- keep crawl and browser engines optional and separately licensed;
- retain exact approval and evidence semantics as the differentiator; and
- publish reproducible measurements rather than unqualified superiority claims.

See the [public roadmap](../ROADMAP.md) for planned work.

## Source And License Boundary

This comparison records observed public behavior. No source code, documentation text, examples, prompts, tests, assets, logos, or branding from the compared projects was copied into Maqam for this review. A future dependency, vendoring decision, modification, or distribution must record the exact version, source, license, notices, modifications, and obligations before release.

An adapter to a separately installed or hosted project is the preferred architectural boundary where practical. That choice does not eliminate the need to review the final integration, deployment, service terms, data handling, and license obligations.
