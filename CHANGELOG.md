# Changelog

All notable Maqam changes are tracked here before release.

## 0.3.1

Documentation and release-truth patch. Availability is defined by the live npm registry, provenance, integrity, matching Git tag, and GitHub release—not by this packaged changelog. At candidate preparation time, 0.3.0 was the previous verified public release.

### Changed

- Replaced stale pre-publication 0.3.0 wording in the packaged README, documentation, and website with verified public-release records and evergreen registry checks.
- Kept the 0.2.4 videos and benchmark artifacts explicitly labeled as historical evidence for that artifact rather than relabeling them as 0.3 evidence.
- Updated package, release-gate, trusted-publishing, and MCP client metadata to the 0.3.1 identity without changing the public API or governance behavior.
- Requires clean-main 0.3.1 MGES evidence in a separate evidence-only follow-up while preserving the public 0.3.0 benchmark record.

See [docs/release-0.3.1.md](docs/release-0.3.1.md) for the release boundary and required verification.

## 0.3.0 - 2026-07-18

Governed source routing, normalized research documents, RSS/Atom support, and safer crawler controls.

**Release verification:** use the npm version record, provenance, integrity, Git tag, and GitHub release to verify public availability. Source metadata alone is not proof that a version was published. See [docs/release-0.3.0.md](docs/release-0.3.0.md).

### Added

- `ResearchSourceRegistry`, source-adapter descriptors, a bound `ToolCaller` contract, deterministic backend preferences, bounded attempt records, and normalized `ResearchDocument` output.
- Source error classification that allows ordinary availability fallback while stopping policy, approval, authentication, authorization, crawler-security, robots, goal-scope, and tool-call-limit failures.
- Bounded host-defined source-doctor checks with cooperative timeout cancellation, error isolation, and readiness summaries.
- Offline RSS 2.0/Atom parsing with bounded, sanitized output, content hashes, and host-reader/source-adapter factories that perform no implicit network access.
- Feed discovery and parsing for the bounded crawler, plus a governed source example, complete guide, and 0.3 migration notes.
- Crawler CLI budgets for requests, depth, bytes, duration, retries, feed links/items, detailed failures, statistics, and fail-on-error behavior.
- Anonymous hosted Exa MCP web search with exact-origin policy metadata, DNS-pinned public-network transport, bounded Streamable HTTP parsing, normalized results, and explicit authentication/rate-limit failures.
- Public YouTube search, metadata, and timestamped available captions through an explicitly configured absolute `yt-dlp` executable path, with no shell, browser cookies, remote components, plugins, or media download.
- Immutable handler-declared `networkOrigins` enforced by `ToolGateway` and `PolicyEngine` before dispatch.
- Local console routes and source checks for hosted public search and explicitly enabled YouTube research, including access-mode and third-party data-flow disclosures.
- Anonymous-public source documentation covering credential classes, terms, limits, subprocess isolation, and honest capability wording.

### Changed

- Governed source routes require a bound caller and execute through the adapter's registered `ToolGateway` tool name. Direct `routeUngoverned()` use is explicit and reported as a bypass.
- Authenticated adapters require per-route `allowAuthenticated: true`; this opt-in does not obtain or synchronize credentials.
- The crawler CLI rejects the old unbounded `--all-origins` option. Every additional origin must be named with a repeatable `--allowed-origin` flag.
- RSS/Atom feed results expose normalized content and parser provenance while keeping network retrieval under host/crawler policy.
- The console keeps local process execution disabled until the operator supplies an absolute `--yt-dlp-command` or `MAQAM_YT_DLP_COMMAND` path.

### Boundaries and provenance

- This release does not add automatic installers, browser-cookie/session import, provider login, anti-bot bypass, browser automation, built-in social-platform adapters, provider approval synchronization, or a hosted crawler fleet.
- Hosted anonymous services remain remote and rate-limited; `yt-dlp` remains unofficial, best-effort, separately installed, and subject to upstream behavior and terms.
- The architecture was informed by Agent Reach at commit `1494c2ab239e7355a77e7cceaf3271453a1f34b5` (MIT). Maqam's implementation is independent; no Agent Reach source, documentation, examples, tests, assets, logos, or branding was copied.
- Historical 0.2.4 release media and benchmark artifacts remain evidence for 0.2.4. Fresh 0.3.0 release and MGES evidence is required wherever fingerprints changed.

## 0.2.4 - 2026-07-17

Evaluation, ecosystem-adapter, documentation-site, and proof-video candidate.

**Release status:** `maqam@0.2.4` was published to npm through trusted OIDC publishing and released as GitHub tag `v0.2.4`. The original candidate preparation record remains in [docs/release-0.2.4-candidate.md](docs/release-0.2.4-candidate.md); its pre-publication wording is historical and must not be treated as the current registry state.

### Added

- Maqam Governance Evaluation Suite (MGES) v1 with a 30-observation fresh-process local-call profile, raw observations, source fingerprints, coefficient-of-variation gates, a deterministic 95% bootstrap interval, versioned JSON Schemas, and copy-safe claim templates.
- A separate 12-case governance-boundary conformance profile covering default denial, fail-closed policy, accessor input rejection, exact run/tool/input approval scope, replay rejection, call ceilings, immutable input, atomic multi-approval consumption, evidence attribution, and redacted denial traces without collapsing them into a security score.
- `defineToolAdapter`, `registerToolAdapter`, and `runToolAdapterConformance` for explicit host-supplied function, SDK, HTTP, MCP-style, and custom adapters.
- A deterministic adapter ecosystem example and documented explicit composition with ProductLoop OS through its existing `maqamGateway`.
- A revised 60-second Remotion proof with real benchmark artifacts, PASS/REVIEW withholding, an honest ecosystem boundary, local TTS, portable captions, and release stills.
- Narrated ProductLoop OS and governed-crawler overview videos with posters, VTT/SRT captions, reproducible Remotion source, and immutable candidate-media URLs.
- A responsive terminal/editorial documentation site at [maqamagent.com](https://maqamagent.com/) with quickstart, ProductLoop package atlas, integration, benchmark, security, articles, community, and all three videos.

### Security and boundaries

- Adapter effects, risk, identity, and transport metadata are explicit and cannot be downgraded through extra metadata. Registration preserves stricter governance declared on the underlying handler, and ambiguous leading/trailing whitespace is rejected. Governed adapters receive the same detached frozen input and exact approval semantics as other registered tools.
- Adapter conformance errors expose only bounded error identity. SDK/MCP clients, authentication, discovery, HTTP transport security, secrets, persistence, retries, provider-internal actions, and direct bypass paths remain host responsibilities.
- MGES is project-defined regression evidence, not a globally standardized benchmark, penetration test, compliance result, competitor ranking, SLA, security score, or certification.

### Documentation

- Added canonical benchmark documentation, raw artifacts, methodology, presentation rules, a detailed benchmarking article, an OWASP relevance crosswalk with explicit gaps, and a host-adapter integration guide.
- Added provider-specific Google ADK and Microsoft Agent 365 templates that distinguish repository-tested Maqam behavior from illustrative provider wiring and document direct-tool bypass paths.
- Documented Maqam as the governed execution kernel and ProductLoop OS as its explicit companion package ecosystem, with an exact public package-version map and no claim that their runtimes or ledgers are silently merged.
- Added open-source contribution, governance, support, code-of-conduct, issue/PR template, and community entry points.
- Replaced future `v0.2.4` GitHub tag/release links with live website media or `main` documentation links while retaining the candidate-versus-public-package distinction.

### Release verification

- Candidate preparation recorded a 202/202 local Maqam test pass.
- Candidate clean-consumer TypeScript compilation and production dependency audit passed; the audit reported zero known production vulnerabilities.
- The candidate record preserves the source-CI and exact-artifact evidence used before trusted publication. Consult the `v0.2.4` GitHub release and npm provenance for the published artifact rather than treating these preparation counts as 0.3.0 evidence.
- ProductLoop OS `0.2.0` remains a separately published companion release. Its nine-package workspace verification covered 124 tests, builds, typechecks, integration, dependency doctor, clean-consumer declarations, and package previews.

## 0.2.3 - 2026-07-16

Launch, documentation, and reproducible-proof patch for exact approvals.

### Added

- `maqam demo approval` and `npm run demo:approval` now run a deterministic temporary-file flow that proves altered input is rejected before execution, the exact approved input runs once, replay is rejected, evidence links to the resulting claim, and cleanup succeeds. `--json` emits stable machine-readable render input.
- A permanent CLI regression suite covers the approval request, canonical input scope mismatch, one-use consumption, replay rejection, evidence linkage, and deterministic output.
- A reproducible local governed-call overhead microbenchmark with machine-readable output and explicit interpretation limits.
- Public “Why Maqam,” five-minute quickstart and cleanup, current open-source/source-available comparison, enforcement-boundary diagram, roadmap, technical article, HN-compliant author fact brief, release plan, and Remotion launch-video source.

### Documentation

- Positions Maqam as a compact TypeScript enforcement boundary rather than claiming to replace broader agent runtimes, durable orchestrators, enterprise governance platforms, model guardrails, or general policy engines.
- Documents the current in-process persistence model, registered-adapter enforcement boundary, and the difference between evidence-link integrity checks and semantic proof that a claim is true.

## 0.2.2 - 2026-07-15

Security patch for JavaScript authority-boundary integrity under prototype pollution,
accessor-backed input, and post-validation mutation.

### Security

- Canonical approval inputs, audit redaction, approval queue snapshots, policy/tool metadata, and embedded-server listen options now require `value` to be an own property of each JavaScript property descriptor.
- A polluted `Object.prototype.value` can no longer make accessor-backed input appear to be an inert data property at governance boundaries.
- Exported governance constructors and calls reject inherited recognized fields, accessors, symbol keys, and unknown option fields. Authority-bearing arrays and records are detached into prototype-isolated snapshots instead of retaining caller-owned configuration.
- `ToolGateway` hashes, authorizes, approves, and executes one immutable JSON snapshot. Later caller or prototype mutation cannot add unhashed handler authority, and handlers cannot mutate the frozen policy decision or authorization scope recorded in the trace.
- Approval queue imports, release approvals, policy allow-all flags, runtime goals/tasks/approval ids, ungoverned gateway opt-ins, CLI shell/environment unlocks, provider permission bypasses, crawler private-network controls, and server bind credentials must all be explicit own data properties.
- CLI/provider factories snapshot commands, arguments, cwd roots, environment selection, provider tools, permission modes, and limits at construction. The resolved cwd and selected parent environment no longer change between construction and execution.
- Direct and agent-backed crawler options are strict own-data snapshots; numeric limits are no longer string-coerced, mutable defaults cannot diverge from advertised governance, and known cloud metadata/platform endpoints remain blocked even when trusted private-network crawling is enabled.
- Workflow tasks can no longer reach `ApprovalQueue` or the raw evidence ledger. Runtime and tool handlers receive call-only tool capabilities and run/task/tool-scoped evidence facades that stamp trusted attribution fields.
- Evidence storage is private and transactional. Whole agent evidence-and-claim batches validate before one atomic commit, so a failed claim cannot leave partial evidence behind.
- Agent object runners must be explicit own data functions (class prototype methods can be bound explicitly); inherited or accessor-backed `run`, `invoke`, and `call` capabilities are rejected.
- CLI calls reject already-aborted signals before spawning, and parsed JSON/JSONL values are bounded prototype-isolated snapshots. JSONL records must be objects.
- Provider streams ignore inherited completion fields, require terminal success records and complete non-negative safe-integer usage, reject missing observed cost when a spend budget applies, keep normalized IDs/output/failure fields within their declared types, and prevent composite Claude tool selectors from bypassing write approval.
- The skill registry now uses private storage, strict snapshot validation, and duplicate-id rejection. The bundled research workflow snapshots its configuration and validates/caps every crawler page before recording evidence.
- Crawler callbacks receive frozen detached records and cannot outlive total duration or cancellation. The local server now supports exact-origin CORS and authenticated API preflights through `allowedUiOrigins` and `--allowed-ui-origin` without wildcard access.
- Framework errors and runtime error classification ignore inherited/accessor-backed spoofing fields, detach and freeze JSON-safe details, and normalize even self-throwing proxy values without letting error reporting escape the workflow result boundary.
- Regression tests cover approval, release, policy, gateway, runtime, CLI, provider, crawler, and server boundaries without invoking attacker-controlled getters.

### Compatibility

- Governed tool inputs must be finite, acyclic JSON values with dense arrays and plain objects. Unsupported values, repeated references, accessors, and `-0` fail closed before policy or handler execution.
- Exported option objects now reject misspelled/unknown keys instead of silently ignoring them.
- Duplicate skill ids are rejected instead of replacing an existing registration, and object-agent prototype methods must be explicitly bound before registration.

## 0.2.1 - 2026-07-15

Security and packaging patch for effect-policy integrity, embedded-server binding, and clean TypeScript consumption.

### Security

- Tool registration metadata can add effects or raise recognized risk levels but can no longer erase effects or lower a recognized risk declared by a handler, preventing approval policy and audit metadata from being downgraded during registration while retaining custom risk-label compatibility.
- Registration metadata is stored as an immutable JSON snapshot and policy/handler calls receive detached copies, so one invocation cannot mutate the authorization metadata used by later calls.
- Malformed, accessor-backed, inconsistent, or unknown policy decisions now fail closed before a tool handler executes.
- Caller-provided `maxToolCalls` can lower but cannot raise or disable the policy limit.
- Restored approval queues now validate JSON structure, ids, status transitions, decisions, consumptions, risk, and sequence state while documenting that serialization does not authenticate a decision.
- `createMaqamServer()` now guards its raw `listen()` path: TCP binding beyond loopback, including an omitted host, ambiguous port/path options, existing handle/file-descriptor options, or mutable/accessor-backed listen options, requires both bearer authentication and an explicit Host allowlist.
- Raw embedded-server tests exercise IPv4, IPv6-unspecified, omitted-host, ambiguous transport options, existing TCP handles, accessor/TOCTOU attempts, missing-allowlist, and authenticated non-loopback cases.

### Packaging and release

- The public `maqam/server` declarations now carry `@types/node` as a package dependency, so a clean TypeScript consumer can resolve `node:http` without manually adding Node types.
- A clean-consumer release check packs Maqam, installs only that artifact into a temporary project, and compiles both root and server imports with strict TypeScript settings.
- CI uses immutable action revisions and verifies Node.js 20, 22, and 24 across tests, clean-consumer compilation, production audit, and package preview.
- Release instructions publish from the reviewed repository directory and require post-publish verification of `gitHead` and the absence of local-path `_resolved` or `_from` registry metadata.
- Corrected the recorded resolved Undici version to 7.28.0.

## 0.2.0 - 2026-07-15

Fail-closed governance, crawler-network security, typed server exports, and release-evidence hardening.

### Added

- Release checklist with required verification commands and explicit approval gate.
- Provenance and license notes documenting original implementation boundaries.
- Package-readiness tests that enforce release governance docs and npm package contents.
- `ApprovalQueue` for in-memory, serializable human approval records and atomic multi-approval consumption.
- `createReleaseGateReport` for reporting public-release readiness from exact checks, artifact identity, provenance, and owner approval.
- Type declarations, security policy, license audit, and a governed release example.
- Provider adapters for Codex CLI and Claude Code with safe defaults and normalized JSONL usage.
- Cwd roots, environment allowlists, cancellation, process-tree termination, output-token ceilings, and JSON Lines parsing for CLI workers.
- Exact one-time approval binding to run, tool, and input hash.
- Capability API and dashboard coverage table for preventive and observed controls.
- `crawlDetailed()` with structured failures, request statistics, redirect provenance, content digests, discovery depth, response sizes, and cache metadata.
- DNS/private-network destination validation, per-hop redirect authorization, and DNS pinning for crawler requests.
- Typed `maqam/server` export for embedding the local console server.
- Explicit crawler budgets for seeds, requests, queue entries, depth, sitemaps, links, URLs per sitemap, redirects, retries, response bytes, and total duration.

### Changed

- Package file list now ships examples, declarations, root release/security artifacts, public documentation, and only the app files required at runtime; large presentation PNGs remain repository-only.
- README now links to release, provenance, and license governance docs.
- Tenant budgets and origin scope are clamped, tool-call and runtime ceilings are enforced, and denied or failed calls are traced with credential and URL redaction.
- Dashboard rendering now treats crawler-derived content as untrusted text and validates outbound source links.
- Empty policy allowlists now deny by default; unrestricted policies require `allowAllTools` or `allowAllOrigins`.
- `ToolGateway` now requires a policy unless `allowUngoverned: true` is explicit.
- CLI workers inherit only a small operational environment by default and validate real cwd roots.
- Provider adapters reject empty or truncated event streams instead of reporting false completion.
- Evidence hashes are computed and verified, duplicate ids are rejected, and claim support is scoped to the same run.
- Task retries are opt-in and runtime timeout results identify operations that did not settle during the cancellation grace period.
- The HTTP server rejects request-supplied network authority, non-JSON research requests, disallowed Host/origin values, and unauthenticated non-loopback deployment.

### Breaking changes

- Node.js 20.18.1 or later is required.
- Code that relied on empty policy allowlists allowing everything must configure explicit allowlists or explicit `allowAll*` flags.
- `new ToolGateway()` without a policy now throws unless explicitly created with `allowUngoverned: true`.
- Private and special-purpose crawler destinations are blocked by default; trusted private-network use requires startup/library opt-in and never enables link-local metadata ranges.
- Generic CLI workers no longer inherit all environment variables by default.
- Release-gate callers must provide the exact npm registry, publish command, artifact filename/size/integrity/Git commit, required verification commands, provenance decision, and a matching `publish:npm` approval.

See [docs/migration-0.2.md](docs/migration-0.2.md) for migration examples.

### Release process

Run `npm test` and `npm pack --dry-run`, review the tarball and dependency audit, and require explicit approval for the exact artifact before `npm publish --access public`.
