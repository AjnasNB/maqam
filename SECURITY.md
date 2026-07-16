# Security Policy

Maqam is designed for governed local agent workflows. Treat every tool, connector, crawler seed, and release action as untrusted until policy allows it and a human approval gate covers high-risk side effects.

## Supported Version

Security fixes are prepared against `maqam@0.2.3` and later reviewed 0.2.x releases. Version 0.2.3 adds a reproducible exact-approval demo without weakening the descriptor-validation protections introduced in 0.2.2; 0.2.2 superseded 0.2.1 for authority-boundary integrity under prototype pollution.

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

## External Agent Boundary

Maqam governs only calls routed through registered adapters. Provider event records can show internal commands and file changes, but they are not a substitute for preventive provider permissions. The local console intentionally exposes no HTTP route that launches coding agents.

## Release Approval

Publishing is blocked unless the exact package, version, registry, command, artifact filename/size/integrity, and Git commit have explicit user approval. Automation runs may prepare release artifacts, but must not publish to npm, GitHub, social channels, or other external systems without that approval.
