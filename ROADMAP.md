# Maqam Public Roadmap

Last updated: 2026-07-19.

This roadmap communicates direction, not delivery dates. Items move only after their design, security boundary, compatibility impact, and maintenance cost are understood. Released behavior is documented in the README, changelog, and versioned package—not promised by this file.

## Product Direction

Maqam is becoming a small, interoperable governance layer for agent tools and workflows. Its center remains:

- policy before a registered tool executes;
- approval bound to the exact governed call;
- bounded adapters for functions, command-line workers, and connectors;
- source-linked evidence and reviewable traces; and
- honest, testable enforcement boundaries.

Maqam will integrate with orchestration, model, browser, crawl, and observability systems instead of attempting to replace all of them.

## Shipped Baseline: 0.2.x

- Provider-neutral function, object, generic CLI, Codex CLI, and Claude Code adapters.
- Fail-closed goal and tool policy for tools, origins, effects, and configured limits.
- Exact run/tool/input-bound, one-use approval flow through `ToolGateway`.
- Transactional in-process evidence and claim records with scoped attribution.
- Bounded HTTP crawler with robots handling, redirect authorization, DNS validation, DNS pinning, and private-network denial by default.
- Local research console, typed `maqam/server` export, JSON/JSONL crawler output, examples, migration guidance, and security documentation.
- Node.js 20, 22, and 24 continuous integration, clean external TypeScript consumption, production dependency audit, and package-content checks.
- MGES v1 project-defined performance and governance-boundary profiles with raw observations, source fingerprints, uncertainty reporting, stability gates, and named conformance evidence.
- A typed host-supplied adapter descriptor, explicit `ToolGateway` registration, and fixture conformance probe for function, SDK, HTTP, MCP-style, and custom transports.

## Shipped: 0.3.0 Governed Sources

- Ordered `ResearchSourceRegistry` backends with explicit preferences and a normalized, frozen `ResearchDocument` contract.
- Governed routing through an adapter's registered `ToolGateway` name, with a deliberately separate `routeUngoverned()` escape hatch.
- Fatal-error stop rules so policy, approval, authentication, authorization, crawler-security, robots, goal-scope, and call-limit failures cannot silently fall through.
- Explicit opt-in for authenticated source adapters without bundling credential acquisition or browser-session import.
- Offline source-doctor reports with bounded checks, timeouts, and isolated errors.
- Offline bounded RSS 2.0/Atom parsing plus host-supplied reader factories; no implicit network request or login behavior.
- Feed-aware HTTP crawling and safer CLI budgets, exact repeatable cross-origin permission, detailed failures, statistics, and fail-on-error behavior.

The public [`maqam@0.3.0`](https://www.npmjs.com/package/maqam/v/0.3.0) artifact and matching [`v0.3.0` GitHub release](https://github.com/AjnasNB/maqam/releases/tag/v0.3.0) completed these release gates:

- public exports and declarations compile in a clean consumer;
- allow, deny-with-zero-dispatch, fatal-no-fallback, availability-fallback, authentication-opt-in, doctor, RSS/Atom, feed-crawl, and CLI fixtures pass on Node.js 20, 22, and 24;
- package contents, provenance, license audit, migration notes, and source-boundary documentation match the shipped artifact;
- a fresh MGES run is attached when fingerprinted inputs changed; and
- the exact tarball received maintainer approval and registry verification before `v0.3.0` was tagged.

## Now: Make Adoption Verifiable

- Publish a five-minute quickstart and a reproducible 60-second demonstration of policy, approval mismatch, one-use consumption, trace, and evidence.
- Add independently maintained source adapters only when their authentication, license, rate-limit, fallback, and bypass boundaries have offline contract tests.
- Gather real-world governed-source fixtures for public web, RSS/Atom, licensed search, and internal-index use without bundling credentials or provider packages into the core runtime.
- Extend adapter conformance beyond the shipped single-invocation fixture to cover cancellation, retry/idempotency, protocol errors, durable correlation, and bypass audits.
- Add focused examples for an MCP tool, OpenAI Agents SDK, LangGraph, and a generic HTTP service without making those systems runtime dependencies.
- Solicit independent MGES reruns on Linux, macOS, Windows, multiple Node releases, and multiple processor families; publish compatible artifacts without treating one machine as a universal baseline.
- Version MGES schemas and workloads without silently changing the v1 measurement construct; publish unstable and failed publication checks instead of discarding them.
- Improve issue templates, security-reporting guidance, contribution boundaries, and good-first integration tasks.

Exit criteria:

- a new user can run a local governed example without a model key;
- every published benchmark is independently reproducible;
- adapter examples pass the same conformance fixtures in CI; and
- launch material contains no feature or security claim that the tests and documented boundary do not support.

## Next: Durable Governance State

- Design storage interfaces for runs, approvals, evidence, claims, and trace events.
- Provide a reference local durable store after crash-safety, concurrency, migration, secret handling, and integrity tests are defined.
- Support restart-safe approval wait/resume without treating untrusted serialized queue data as an authenticated decision.
- Add an export format for review bundles with stable canonicalization and optional application-supplied signing.
- Add retention and redaction hooks before durable records are written.

Exit criteria:

- interrupted workflows can resume without replaying a consumed approval;
- concurrent consumers cannot double-consume one approval;
- schema migrations and recovery have adversarial tests; and
- signatures, when enabled, authenticate a documented byte representation and identity source rather than implying semantic truth.

## Current Implementation: Anonymous-Public Source Pack

- Added an opt-in hosted-anonymous Exa MCP adapter for bounded web search without a developer key, with a fixed tool allowlist, explicit remote data boundary, and honest anonymous-rate-limit behavior.
- Added an opt-in public YouTube adapter for metadata, search, and available captions through a separately installed `yt-dlp` executable; media download, cookies, account login, plugins, and remote components stay disabled.
- Label anonymous public, hosted anonymous, browser session, developer credential, and local processing as distinct access modes in source metadata, documentation, doctor output, and operator review.
- Keep browser-session and developer-credential routes separately named and explicitly selected. An availability failure must never upgrade authority or import credentials.
- Maintain deterministic fault fixtures for `429`, missing captions, authentication-required content, protocol drift, subprocess timeout, unsafe caption origins, and policy-denied zero dispatch; keep any optional live smoke dated, bounded, and separate from hermetic CI.
- Document provider terms, privacy/data flow, executable provenance and licensing, upstream update ownership, and the gap between gateway admission control and subprocess network isolation.

Exit criteria:

- a clean consumer can import only the adapters present in the exact verified package;
- no-developer-key examples run without a model key, browser profile, provider token, or hidden credential lookup;
- tools, origins, calls, bytes, results, transcript length, runtime, and local-process effects are bounded and tested;
- denial, missing approval, authentication required, and security failures stop without fallback or subprocess dispatch;
- doctor output distinguishes local/configuration readiness from a live provider check; and
- release material says selected governed public research, not unlimited or universal internet access.

## Next: Ecosystem Adapters

- MCP client/tool adapter with explicit server identity, capability allowlists, input/effect mapping, and cancellation.
- OpenAI Agents SDK adapter/example for routing selected tool calls through Maqam while retaining the SDK's orchestration and tracing.
- LangGraph adapter/example for using its persistence and pause/resume around Maqam-governed tool boundaries.
- Microsoft Agent Framework example where its Python/.NET workflow runtime calls a separately deployed Node connector governed by Maqam.
- Optional Firecrawl, Crawl4AI, Crawlee, and Browser Use connectors that remain separately installed and preserve their license and deployment boundaries.
- Optional source-channel adapters with explicit provider routing, added only after provider terms, authentication, privacy, licensing, and security behavior are reviewed.

Exit criteria:

- adapters do not silently bypass policy or inflate declared guarantees;
- dependencies are optional and license-reviewed;
- credential and environment behavior is documented; and
- each adapter has success, zero-dispatch denial, fatal-no-fallback, cancellation, malformed-output, and approval-mismatch tests.

## Later: Operations And Team Review

- A review-oriented console for pending decisions, evidence, traces, and exported bundles.
- Pluggable reviewer identity and authorization interfaces for host applications.
- Notification adapters for systems such as Slack, Teams, email, and ticketing, with approval links that do not place credentials or decisions in URLs.
- OpenTelemetry-compatible event export and optional integrations with established observability platforms.
- Policy authoring and simulation tools that show why a call would allow, deny, or require approval before execution.
- An optional hosted service only after tenant isolation, authentication, authorization, audit retention, egress, incident response, and data-processing expectations have explicit designs and tests.

## Security Work That Never Becomes "Done"

- Continue adversarial tests for input canonicalization, mutation, prototype pollution, accessors, proxies, approval replay, metadata downgrade, URL parsing, DNS rebinding, redirects, Host/origin validation, credential redaction, and child-process termination.
- Track runtime and direct-dependency advisories and verify registry signatures during releases.
- Maintain a provenance record for inspected projects, copied code, dependencies, generated media, and license obligations.
- Publish security fixes as narrowly scoped releases with an upgrade path and a clear statement of affected versions.

## Explicit Non-Goals

Maqam does not plan to become:

- a foundation-model provider or prompt marketplace;
- a universal replacement for durable workflow engines;
- a stealth crawler, CAPTCHA bypass, paywall bypass, or access-control evasion tool;
- an operating-system sandbox, container runtime, or network firewall;
- a guarantee that an external source or model output is factually correct;
- a turnkey legal, regulatory, or compliance certification; or
- a claim that every agent action is controlled when processes can bypass registered adapters.

## How Priorities Are Chosen

Work moves earlier when it strengthens the core governance boundary, closes a demonstrated security or reliability gap, makes adoption measurably easier, or enables an integration without coupling Maqam to one provider. Work moves later when it expands surface area without a clear user, duplicates a mature open-source system, or creates a guarantee the implementation cannot enforce.

For proposals, open a [GitHub issue](https://github.com/AjnasNB/maqam/issues) with the use case, required boundary, failure modes, expected evidence, and a small acceptance test. Security reports should follow [SECURITY.md](SECURITY.md).
