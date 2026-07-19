# Contributing to Maqam

Thank you for helping improve Maqam. Contributions are reviewed through pull requests. Public contributors do not need direct write access to the repository.

## Contribution workflow

1. Fork `AjnasNB/maqam` on GitHub.
2. Create a focused branch from the latest `main`.
3. Make one coherent change with tests and documentation.
4. Run the required checks locally.
5. Push the branch to your fork and open a pull request.
6. Respond to review comments with additional commits. Maintainers squash or merge only after the required checks and review are complete.

Suggested branch names:

```text
fix/approval-scope-message
feat/sqlite-evidence-store
docs/google-adk-boundary
test/linux-mges-replication
```

Do not open a pull request for a security vulnerability. Follow [SECURITY.md](SECURITY.md) instead.

## Local setup

Maqam supports the maintained Node.js 22 LTS, 24 LTS, and 26 Current release lines.

```bash
git clone https://github.com/YOUR-ACCOUNT/maqam.git
cd maqam
npm ci
npm test
npm run test:consumer-types
npm audit --omit=dev
npm pack --dry-run
```

The complete suite must pass on Node.js 22, 24, and 26 in CI.

## What a pull request must include

- A short explanation of the problem and why the change belongs in Maqam.
- Tests that fail before the change and pass afterward for behavioral fixes.
- Documentation for public APIs, configuration, security boundaries, or compatibility changes.
- A clear note for any new network, filesystem, process, credential, approval, or persistence authority.
- No credentials, tokens, generated package archives, dependency directories, or private fixture data.
- No claim that a fixture, adapter label, benchmark, or test is an external certification.

Keep changes small enough to review. Unrelated refactors should use a separate pull request.

## Security-sensitive code

Changes to policy, approval, input snapshotting, evidence, release gates, process execution, crawling, server binding, adapter registration, or redaction require adversarial tests. Tests should cover inherited fields, accessors, mutation after validation, prototype pollution, replay, altered input, malformed policy decisions, and dispatch counts where relevant.

The core rule is simple: a rejected or approval-gated call must not reach the handler.

## Adapter contributions

Maqam adapters describe a host-supplied callable operation. They do not automatically implement a provider protocol.

An adapter contribution must:

- use a static tool identity;
- declare effects and risk explicitly;
- keep credentials and trusted identity outside model-controlled input;
- route every claimed governed call through `ToolGateway`;
- state what the host still owns;
- include deterministic fixture tests; and
- label provider examples as illustrative until exercised against an official SDK or mock service.

## Benchmark contributions

MGES is a project-defined regression and conformance suite. Benchmark changes must preserve raw observations, environment data, uncertainty, source fingerprints, machine-readable schemas, and non-generalization wording. A change to any fingerprinted measured source requires a new clean run.

Do not describe MGES as globally standardized, certified, a penetration test, a competitor ranking, a security score, a capacity result, or an SLA.

## Documentation and examples

Examples must be copy-pasteable and complete. Mark code as one of:

- `tested in this repository`;
- `tested against a local fixture`; or
- `illustrative and not provider-tested`.

Use primary documentation when describing third-party APIs. Avoid unsupported product comparisons and time-sensitive claims without a dated source.

## Commit and review expectations

Use descriptive commits such as:

```text
fix: reject inherited adapter effects
feat: add durable approval store interface
docs: clarify Google ADK bridge boundary
test: replicate MGES on Linux arm64
```

Maintainers may request changes, close out-of-scope proposals, or split a large pull request. A pull request is not accepted until a maintainer explicitly merges it.

By contributing, you agree that your contribution is licensed under the repository's MIT license.
