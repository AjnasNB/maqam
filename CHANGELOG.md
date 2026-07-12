# Changelog

All notable Maqam changes are tracked here before release.

## 0.2.0 - 2026-07-12

Release candidate for the first approval-gated public release.

### Added

- Release checklist with required verification commands and explicit approval gate.
- Provenance and license notes documenting original implementation boundaries.
- Package-readiness tests that enforce release governance docs and npm package contents.
- `ApprovalQueue` for durable, serializable human approval requests.
- `createReleaseGateReport` for blocking public publishing until evidence and owner approval are complete.
- Type declarations, security policy, license audit, and a governed release example.
- Provider adapters for Codex CLI and Claude Code with safe defaults and normalized JSONL usage.
- Cwd roots, environment allowlists, cancellation, process-tree termination, output-token ceilings, and JSON Lines parsing for CLI workers.
- Exact one-time approval binding to run, tool, and input hash.
- Capability API and dashboard coverage table for preventive and observed controls.

### Changed

- Package file list now ships examples, type declarations, root release/security artifacts, public documentation, and this changelog.
- README now links to release, provenance, and license governance docs.
- Tenant budgets are clamped, tool-call and runtime ceilings are enforced, and denied or failed calls are traced with credential redaction.
- Dashboard rendering now treats crawler-derived content as untrusted text and validates outbound source links.

### Release Status

- Status: ready for owner review after tests and package dry run pass.
- Publish command: `npm publish --access public`
- Approval: blocked until explicit user approval for `maqam@0.2.0`.
