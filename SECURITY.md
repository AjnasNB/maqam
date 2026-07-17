# Security Policy

Maqam is designed for governed local agent workflows. Treat every tool, connector, crawler seed, and release action as untrusted until policy allows it and a human approval gate covers high-risk side effects.

## Supported Version

The maintained source line is `0.3.x`. Treat a version as a supported public artifact only after its exact npm record, provenance, integrity, registry `gitHead`, matching Git tag, and GitHub release have been verified; source metadata alone is not publication proof. Version 0.3.0 adds a fail-closed governed-source caller boundary, fatal-error fallback rules, explicit authenticated-source opt-in, offline bounded feed parsing, and exact cross-origin crawler controls. The published `0.2.4` artifact remains historical, and security fixes are backported only when maintainers explicitly choose to support an older line.

## Reporting Issues

Report security issues privately to the package owner before public disclosure. Do not include secrets, tokens, private customer data, or exploit payloads in public issues.

## Required Controls

- Route write, publish, send, billing, account, and production-change actions through `ToolGateway`.
- Configure explicit `allowedTools` and `allowedOrigins`; empty allowlists deny by default. Use `allowAllTools` and `allowAllOrigins` only for an intentional unrestricted policy.
- Configure `PolicyEngine.approvalRequiredTools` or `approvalRequiredEffects` for high-risk actions.
- Treat handler-declared effects as a minimum risk set. Registration metadata may add effects but cannot remove effects declared by a handler; Maqam snapshots that metadata so policy and handler mutation cannot weaken later calls.
- Use `ApprovalQueue` to bind approval to the exact run, tool, and input hash. Keep approvals one-time unless reuse is an explicit policy decision.
- Treat serialized approval queues as security-sensitive, integrity-protected trusted state. Validate their source and protect persisted JSON against tampering before passing it to `ApprovalQueue.fromJSON()`. Structural validation rejects malformed records, but serialization does not authenticate approvals or prove who made a restored decision.
- Set tenant `maxToolCalls` and `maxRuntimeMs`; workflow and direct-call budgets can lower but cannot raise those limits.
- Use cwd roots and environment allowlists for child processes. Do not inherit unrelated credentials.
- Keep coding-agent sandboxes, permission modes, tool restrictions, turn limits, and spend limits enabled.
- Use `createReleaseGateReport` before publishing packages or triggering external release channels.
- Keep credentials outside workflow input and out of provenance excerpts.
- Keep private-network crawler access disabled for untrusted input. Maqam validates all DNS answers, pins each connection, re-authorizes redirects, rejects embedded URL credentials, and never permits link-local metadata ranges through the private-network opt-in.
- Respect robots.txt and authorization boundaries for crawler-backed research. Robots retrieval failures deny crawling for that origin except for definite `404` or `410` responses.
- Do not let an HTTP request choose server `allowedOrigins` or private-network authority. Both `startMaqamServer()` and the raw server returned by `createMaqamServer()` reject non-loopback TCP binding unless bearer authentication and an explicit Host allowlist are configured. Omitted hosts, ambiguous transport options, existing handles, and file descriptors are treated as non-loopback unless the protected bind path is configured. Remote deployments also require trusted UI origins and deployment-level egress controls.
- Use a container, virtual machine, restricted operating-system account, and egress controls when a hard host boundary is required.
- Treat post-run token or cost violations as potentially side-effecting. Inspect and explicitly roll back the workspace when the error reports observed activity.
- Treat task and tool evidence capabilities as scoped append/read views. Maqam stamps the active run, task, and tool attribution and never exposes its raw ledger to a handler.
- Keep Claude tool selectors canonical and separately listed. Composite selector strings are rejected, and unrecognized enabled selectors are classified as write-capable for approval policy.
- Crawler `onPage` and `onError` callbacks receive detached, frozen payloads and remain inside the total crawl deadline and caller cancellation boundary.
- Configure cross-origin console access only with exact `allowedUiOrigins` values. Wildcards, `null`, paths, credentials, query strings, and fragments are rejected; origin-less browser cross-site API requests remain denied.

## Governed Source Boundary

- Construct `ResearchSourceRegistry` with a `toolCaller` bound to `ToolGateway.call`. `route()` fails closed without it.
- Register each adapter handler under the exact declared `toolName` and apply explicit policy, origins, effects, risk, and call limits there. Registry registration alone does not register or govern a tool.
- Treat `routeUngoverned()` as an explicit bypass. It offers ordered direct reads and normalization but no gateway policy, approval, call ceiling, or trace capture.
- Never fall through after a policy denial, approval requirement, authentication/authorization failure, crawler security or robots denial, goal-scope conflict, or tool-call limit. Maqam classifies these errors as fatal for source routing.
- Adapters marked `authentication: "required"` need an explicit `allowAuthenticated: true` route option. This flag does not authenticate, obtain a token, import cookies, or authorize the caller; the host owns those controls.
- Keep adapter credentials in host-managed secret storage. Do not place tokens, cookies, session exports, passwords, or private records in route input, metadata, trace details, or evidence excerpts.
- Treat every normalized `ResearchDocument` field as untrusted content. Escape it in the UI and do not execute returned markup, commands, links, or embedded instructions.
- Keep source `check()` implementations local and deterministic. `doctor()` applies timeout and result validation but cannot sandbox arbitrary host JavaScript or prove that a custom check is offline or side-effect free.
- `parseRssAtom()` performs no network request and rejects DTD/entity declarations. The host-supplied reader used by RSS/Atom adapter factories still needs DNS/redirect authorization, byte/time limits, egress controls, and credential isolation.
- The crawler CLI no longer supports `--all-origins`. Use repeatable exact `--allowed-origin` values; this remains an application scope decision, not a substitute for deployment egress control.

## External Agent Boundary

Maqam governs only calls routed through registered adapters. Provider event records can show internal commands and file changes, but they are not a substitute for preventive provider permissions. The local console intentionally exposes no HTTP route that launches coding agents.

## Release Approval

Publishing is blocked unless the exact package, version, registry, command, artifact filename/size/integrity, and Git commit have explicit maintainer approval. Automation may prepare artifacts and the protected trusted-publishing workflow may publish only after that exact approval and GitHub environment gate. It must not publish a different artifact or publish to npm, GitHub, social channels, or other external systems without the corresponding authorization.
