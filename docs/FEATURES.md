# Maqam Feature Inventory

This is the source-backed inventory for Maqam `0.3.3` and the documentation
changes proposed after that release. It describes behavior that is represented
by public code, public types, tests, or an explicit host contract. It does not
turn roadmap ideas into release claims.

Status terms:

- **Public 0.3.3** means the feature exists in the current npm package.
- **Optional** means the feature requires an explicitly configured executable,
  credential, network reader, browser driver, or host component.
- **Documentation update** means the implementation is already public and the
  current branch makes its description easier to find and verify.
- **Not provided** means the host application remains responsible for the
  capability.

## Installation and runtime surfaces

- Public ESM npm package with TypeScript declarations.
- Maintained Node.js 22, 24, and 26 support.
- Root package API and a separate `maqam/server` export.
- `maqam` CLI for the local app, demonstrations, server, source doctor, source
  reads, and governed workflows.
- `maqam-crawl` CLI for bounded crawling.
- Local console assets packed without the large presentation media.
- Side-effect-free package metadata for bundlers.
- Built-in exact-approval demonstration that uses an isolated temporary
  workspace and needs no model API key.
- Packed-consumer TypeScript compile verification.

## Policy engine

- Tool allowlists and denylists.
- Effect allowlists and denylists.
- Origin allowlists and denylists.
- Total tool-call budgets.
- Goal-level token and tool-call ceilings.
- Tenant-level ceilings and authorization scopes.
- Explicit `allow`, `deny`, and `needs_approval` decisions.
- Deny-by-default behavior when a requested action is outside policy.
- Stable, detached policy decisions that model-controlled input cannot mutate.
- Structured denial and approval-required errors.

## Tool gateway and execution receipts

- Explicit tool registration before dispatch.
- Immutable registered metadata for tool name, effects, origins, and handler
  governance.
- Policy evaluation before a registered handler runs.
- Canonical input binding.
- Exact input hashing for approvals and receipts.
- Per-run tool-call limit enforcement.
- Registered effect and origin enforcement.
- Trace recording around dispatch and failure.
- Redaction of bounded error and trace data.
- Guard receipts for the decision that authorized execution.
- Approval consumption before an approval-gated handler runs.
- Tool execution receipts with run, tool, exact input, decision, and approval
  identity.
- Verification hooks for exact tool input.
- Calls that bypass `ToolGateway` remain explicitly outside Maqam's control.

## Exact one-use approvals

- Deterministic pending approval requests.
- Explicit approve and reject operations.
- Approval bound to the exact run id, tool name, and canonical input hash.
- Altered input rejection.
- Cross-run and cross-tool rejection.
- One-use consumption by default.
- Replay rejection after consumption.
- Atomic multi-approval consumption for grouped operations.
- Serializable and restorable approval state.
- Detached, immutable approval snapshots.
- Rejection of accessors, inherited authority, prototype-sensitive data, and
  hostile objects.
- Recorded usage and decision history.

## Evidence and claims

- Normalized evidence records.
- Stable evidence identifiers and content hashes.
- Claims linked to bounded evidence identifiers.
- Run and task isolation.
- Atomic evidence-and-claim batches.
- Scoped evidence facades for worker code.
- Immutable records and snapshots.
- Bounded source links, metadata, text, and claim relationships.
- Serialization and restoration.
- Evidence cannot be silently attributed to another run through the scoped
  worker interface.

## Workflow runtime

- Sequential workflow tasks with explicit tool calls.
- Per-task retry policy.
- Deterministic governance failures excluded from automatic retry.
- Goal and tenant ceiling enforcement.
- Task and workflow timeouts.
- Cooperative cancellation and cancellation grace handling.
- Active run-id collision rejection.
- Duplicate task-id rejection.
- Approval-required pause and resume flow.
- Scoped evidence access for each task.
- Workflow traces and results.

## Skill registry

- Validated skill manifests.
- Skill names, versions, descriptions, triggers, capabilities, tools, and
  metadata.
- Deterministic skill selection and scoring.
- Capability and trigger filtering.
- Duplicate id rejection.
- Unknown-field rejection where the contract is closed.
- Accessor, inherited-data, and hostile-object rejection.
- Detached, immutable skill descriptions.

## Agent and object adapters

- Function agents wrapped as governed tools.
- Object agents with `run`, `invoke`, or `call` methods.
- Explicit tool names and metadata.
- Invocation context with run, task, goal, evidence, and signal data.
- Worker output returned through the gateway receipt.
- Agent code cannot supply authoritative gateway evidence or overwrite the
  gateway's governance record.
- Reusable generic tool-adapter contract for function, SDK, HTTP, MCP-style,
  and custom host transports.
- Data-first adapter definitions and descriptions.
- Adapter registration through a gateway.
- Adapter conformance reports.
- Registered effects cannot be downgraded by model-controlled invocation data.
- Host-supplied discovery and client boundaries for MCP-style adapters.
- Maqam is not itself a universal MCP client, MCP server, or plugin
  marketplace.

## Command-line worker adapters

- Fixed command and argument configuration.
- No shell evaluation for worker execution.
- JSON Lines event parsing.
- Input token estimation.
- Output-byte, event, token, and duration ceilings.
- Allowlisted environment forwarding.
- Configured working-directory root containment.
- Symlink-aware working-directory checks.
- Cooperative abort handling.
- Spawn, exit, signal, timeout, parse, and output-limit errors.
- Structured process summaries.

## Codex and Claude Code adapters

- Public Codex CLI tool adapter.
- Public Claude Code CLI tool adapter.
- Provider-specific event normalization.
- Normalized sessions, tool calls, messages, usage, process summaries, and
  final output.
- Safe default sandbox and permission arguments.
- Explicit configuration required before weakening provider safety defaults.
- Provider errors translated into bounded Maqam error records.
- The adapters govern configured CLI invocations; they do not intercept every
  action performed outside those invocations.

## Governed browser adapter contract

- Structural `observe`, `preview`, `apply`, and `submit` phases.
- Opaque page, element, value, revision, and plan identities.
- Supported interactive roles and bounded element states.
- Stale element and document revision rejection.
- Authentic plan hashes and plan tokens.
- Apply operations for value references, option selection, and checked state.
- Submit operations for activation, form submission, and navigation.
- Sensitive values resolved by the trusted driver only after approval.
- Expected-origin binding.
- New-page binding.
- Re-observation after mutation.
- Required driver attestations for downloads, external protocols, filesystem
  access, file pickers, clipboard access, permission prompts, printing, and
  modal effects.
- Rejection of raw selectors, raw scripts, raw secret values, and unsupported
  effects in model-controlled plans.
- The injected browser driver remains a host trust boundary.
- Maqam does not bundle Chromium, Playwright, browser profiles, or a browser
  sandbox.

## Research document model

- Normalized research documents with schema version.
- Adapter and channel provenance.
- URI, title, text, Markdown, content type, language, authors, dates, metadata,
  and citations.
- Bounded and immutable normalized records.
- Single-document and multi-document normalization.
- Stable source descriptions for later evidence linkage.

## Governed source routing

- Validated source-adapter definitions.
- Channel, tool name, priority, authentication mode, capabilities, and
  metadata.
- Deterministic adapter ordering.
- Per-channel backend preferences.
- Authenticated-source opt-in.
- Routing through a host-supplied `ToolGateway` caller.
- Explicitly named ungoverned route for hosts that deliberately bypass the
  gateway.
- Fallback only after classified unavailable or allowed failure states.
- Authentication, policy, security, and other fatal errors stop fallback.
- Bounded attempt records.
- Source doctor with ready, degraded, unavailable, blocked, and error states.
- Per-adapter timeout and cancellation.
- Structured source-error classification.
- Duplicate and malformed adapter rejection.

## Public research adapters

- Host-crawler adapter that converts bounded crawl pages into normalized
  research documents.
- Offline RSS 2.0 and Atom parsing.
- RSS/Atom item, text, metadata, count, and total-text limits.
- RSS/Atom sanitization and provenance.
- Host-supplied RSS/Atom reader contract with explicit retrieval provenance.
- Optional hosted-anonymous Exa search through its streamable HTTP MCP
  endpoint.
- Exa query, response-byte, result-count, timeout, and endpoint validation.
- Rejection of private, loopback, metadata, and otherwise unsafe custom Exa
  endpoints.
- Optional `yt-dlp` YouTube search, metadata, and available caption reads
  without a YouTube developer key.
- YouTube canonical-origin validation.
- No shell evaluation for `yt-dlp`.
- Explicit command, timeout, output, result, language, caption-byte, and
  transcript-character limits.
- No cookie or browser-profile loading in the built-in YouTube adapter.
- No media download in the built-in YouTube adapter.
- Research workflow composition with source-linked evidence.

## Built-in bounded crawler

- Multiple public HTTP(S) seeds.
- Breadth-first link traversal.
- Same-origin traversal by default.
- Explicit allowed origins.
- Include and exclude filtering.
- Sensitive-path filtering.
- Robots.txt enforcement.
- Sitemap and nested sitemap discovery.
- Manual redirect validation and provenance.
- URL normalization and deduplication.
- Page, request, queue, depth, link, retry, byte, redirect, timeout, and total
  duration limits.
- DNS classification and destination validation.
- Public-network-only behavior by default.
- Explicit private-network opt-in that still excludes unsafe metadata and
  special-use ranges.
- DNS pinning for the Node transport.
- Clean text and Markdown extraction.
- Title, description, H1, language, canonical, links, feed links, status,
  content type, bytes, hash, depth, parent, ETag, Last-Modified, robots, and
  redirect records.
- Feed-aware crawling and parsed feed records.
- JSON and JSON Lines CLI output.
- The dedicated `cockroach-crawler` package has a broader crawler, provider,
  browser-rendering, Worker, and mapping/extraction surface.

## Release gate

- Exact package name and version checks.
- Registry and commit identity checks.
- Prepared tarball path, size, SHA-256, and npm SHA-512 integrity checks.
- Required test, type, audit, and package checks.
- Explicit approval state for the exact artifact.
- Inspected-project provenance.
- Structured pass, fail, and reason records.
- npm Trusted Publishing workflow bound to reviewed source.
- Release documentation that distinguishes a candidate from a public registry
  artifact.

## Local server and console

- Health endpoint and local browser console.
- Governed research and source-doctor endpoints.
- Exact CORS allowlist.
- Host-header validation.
- API-token requirement for non-loopback access.
- Allowed-origin enforcement.
- Explicit private-network opt-in.
- Independent enablement of sources and crawler features.
- Explicit absolute executable-path control for server-side `yt-dlp`.
- Request, result, output, and response limits.
- Bounded JSON parsing and structured errors.

## Security and hostile-input handling

- Stable structured error codes and records.
- Error conversion that remains total for proxies, cycles, throwing accessors,
  and unusual values.
- Secret and sensitive-data redaction.
- Stable canonical hashing.
- Accessor and inherited-property rejection at authority boundaries.
- Prototype-pollution key rejection.
- Deep-frozen policy, approval, evidence, adapter, and receipt records.
- Origin, effect, run, task, tenant, input, and artifact identities checked at
  their corresponding boundaries.
- No CAPTCHA, paywall, authentication, authorization, or robots bypass.

## Verification and benchmark surfaces

- Node 22, 24, and 26 CI.
- Unit, integration, adversarial, CLI, server, crawler, source, browser,
  approval, evidence, runtime, release, and documentation regression tests.
- Clean packed-consumer TypeScript compile.
- Runtime dependency audit.
- npm tarball dry run.
- CodeQL analysis.
- MGES versioned conformance and performance schemas.
- Named governance fixtures and machine-readable results.
- Reproducible local-call benchmark.
- Benchmark scope and environment recorded with results.
- MGES is an evidence format and test suite, not third-party certification.

## Documentation update on the current branch

1. Removes the oversized README hero image from the npm landing page.
2. Keeps the npm README image-free and replaces stale packaged release text
   with current public `0.3.3` truth.
3. Reduces ProductLoop detail in the Maqam-first README.
4. Adds a direct complete-feature inventory.
5. Generates canonical, robots, Open Graph, Twitter, and JSON-LD metadata for
   every public website page.
6. Updates the sitemap and `llms.txt`.
7. Adds regression checks that prevent release status and search metadata from
   silently drifting.
8. Uses one-pass entity decoding in the metadata generator to avoid recursive
   encoded-markup interpretation.

## Explicit boundaries and non-goals

- Maqam governs only calls routed through its registered boundaries.
- Maqam is not an operating-system syscall interceptor.
- Maqam is not an operating-system sandbox, container, or virtual machine.
- Maqam is not identity, authentication, authorization-directory, or secret
  management infrastructure.
- Maqam is not a durable database or distributed consensus system.
- Maqam is not a model provider or agent planner.
- Maqam is not a replacement for a durable workflow orchestrator.
- Maqam is not a browser engine or anti-bot system.
- Maqam is not a universal internet-access promise.
- Maqam is not a native general-purpose MCP marketplace or remote control
  plane.
- Browser drivers, network readers, model providers, credentials, durable
  storage, and production isolation remain explicit host responsibilities.
