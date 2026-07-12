# Security Policy

Maqam is designed for governed local agent workflows. Treat every tool, connector, crawler seed, and release action as untrusted until policy allows it and a human approval gate covers high-risk side effects.

## Supported Version

Security fixes are prepared against the latest release candidate in this workspace.

## Reporting Issues

Report security issues privately to the package owner before public disclosure. Do not include secrets, tokens, private customer data, or exploit payloads in public issues.

## Required Controls

- Route write, publish, send, billing, account, and production-change actions through `ToolGateway`.
- Configure `PolicyEngine.approvalRequiredTools` or `approvalRequiredEffects` for high-risk actions.
- Use `ApprovalQueue` to bind approval to the exact run, tool, and input hash. Keep approvals one-time unless reuse is an explicit policy decision.
- Set tenant `maxToolCalls` and `maxRuntimeMs`; workflow budgets can lower but cannot raise those limits.
- Use cwd roots and environment allowlists for child processes. Do not inherit unrelated credentials.
- Keep coding-agent sandboxes, permission modes, tool restrictions, turn limits, and spend limits enabled.
- Use `createReleaseGateReport` before publishing packages or triggering external release channels.
- Keep credentials outside workflow input and out of provenance excerpts.
- Respect robots.txt and authorization boundaries for crawler-backed research.
- Use a container, virtual machine, restricted operating-system account, and egress controls when a hard host boundary is required.
- Treat post-run token or cost violations as potentially side-effecting. Inspect and explicitly roll back the workspace when the error reports observed activity.

## External Agent Boundary

Maqam governs only calls routed through registered adapters. Provider event records can show internal commands and file changes, but they are not a substitute for preventive provider permissions. The local console intentionally exposes no HTTP route that launches coding agents.

## Release Approval

Publishing is blocked unless the exact package and version have explicit user approval. Automation runs may prepare release artifacts, but must not publish to npm, GitHub, social channels, or other external systems without that approval.
