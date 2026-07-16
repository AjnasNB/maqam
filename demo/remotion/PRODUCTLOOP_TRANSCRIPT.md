# ProductLoop OS ecosystem overview transcript

ProductLoop OS is a TypeScript composition layer for policy-gated agent workflows.

One install exposes Maqam and eight Ajnas modules: runtime, policy, approvals, provenance, evaluations, connectors, skills, and browser research.

The default composition denies by default. Tools are registered explicitly, and policy decisions enter their own audit ledger.

When policy requires review, the runtime binds approval to the run, step, tool, risk, canonical input, metadata, reason, and prompt.

Bridges are narrow and tested. Runtime and skill events enter provenance; run snapshots and browser reports become evaluation artifacts.

Maqam remains a separate subsystem. Its crawler can become an explicit high-risk runtime tool, but nothing is registered automatically.

Stores stay separate. ProductLoop does not supply distributed transactions, models, live browsers, credentials, identity, sandboxes, databases, or schedulers.

Use it for inspectable governance primitives without choosing one model provider. Run the dependency doctor, then expose only reviewed tools.

## Source basis

This narration is based on the ProductLoop OS root README, `productloop-os/README.md`, `docs/architecture.md`, `docs/security-boundaries.md`, `productloop-os/src/composition.ts`, `productloop-os/src/adapters.ts`, and their tests as inspected on 2026-07-16. The video does not claim a hosted control plane, bundled providers, durable transactions, certification, or universal safety.
