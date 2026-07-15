# Changelog

All notable Maqam changes are tracked here before release.

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
