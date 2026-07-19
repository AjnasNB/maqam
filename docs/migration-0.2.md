# Migrating to Maqam 0.2

Maqam 0.2 hardens default policy, crawler networking, child-process isolation, approvals, evidence, and release checks. Most changes are fail-closed, so applications that relied on implicit access must opt in deliberately.

## Runtime requirement

Current Maqam installs require a maintained Node.js 22, 24, or 26 release.

## Policy and gateway defaults

Empty tool and origin allowlists now deny access. Declare the exact scope:

```js
const policy = new PolicyEngine({
  allowedTools: ["crawler"],
  allowedOrigins: ["https://example.com"]
});

const gateway = new ToolGateway({ policyEngine: policy });
```

For an intentionally unrestricted policy, use `allowAllTools: true` and/or `allowAllOrigins: true`. `new ToolGateway()` now throws without a policy. Only explicitly ungoverned local code should use `new ToolGateway({ allowUngoverned: true })`.

The effective origin scope passed to a tool is the intersection of tenant policy, workflow goal, and tool authorization. A workflow cannot widen its parent policy.

## Crawler networking

Crawler requests now:

- resolve and validate every destination before connection;
- block private, loopback, link-local, reserved, multicast, and other non-public ranges by default;
- reject embedded URL credentials;
- validate every redirect hop against origin and network policy;
- pin the connection to a validated DNS result;
- enforce request, queue, depth, sitemap, link, response-byte, redirect, retry, and duration limits; and
- fail closed when robots.txt cannot be fetched, except for a definite `404` or `410` response.

Trusted local integrations can set `allowPrivateNetworks: true` for the explicitly supported private ranges. That switch does not permit link-local metadata endpoints, multicast, reserved, or otherwise invalid destinations. Prefer an isolated network and egress policy even when opting in.

Use `crawlDetailed()` when failures and request statistics matter:

```js
const { pages, failures, stats } = await crawlDetailed({
  seeds: ["https://example.com"],
  allowedOrigins: ["https://example.com"],
  maxPages: 10
});
```

`crawl()` remains available and returns only `pages`.

## CLI workers

Generic CLI workers no longer inherit the complete parent environment by default. A small operational allowlist is used unless `envAllowlist` is supplied. Full inheritance requires all of the following: `inheritEnv: true`, `allowUnsafeEnvInheritance: true`, and no explicit allowlist.

The default cwd is the current working directory and the default allowed root is that same directory. Both are resolved through real paths before execution. Shell execution still requires `allowUnsafeShell: true`.

## Provider adapters

Codex and Claude Code adapters accept only a complete terminal event stream. A truncated or empty successful process now fails with `AGENT_PROVIDER_INCOMPLETE_STREAM`. The CLIs must be installed and authenticated separately; Maqam does not bundle provider credentials or prove a live provider connection during package installation.

## Approvals and evidence

Approval-gated tool inputs must be safely canonicalizable. Approvals remain bound to the exact run, tool, and input hash, are one-use by default, and multi-approval consumption is atomic.

Evidence hashes are computed from the normalized source and excerpt. A caller-supplied mismatching hash is rejected, duplicate evidence/claim ids are rejected, returned records are copies, and claim support is evaluated within the same run.

Approval and evidence storage remains in-process. Persist `ApprovalQueue.toJSON()` and ledger output in the host application when required; Maqam 0.2 does not provide restart-safe workflow checkpoints.

## Server deployment

Server helpers are available from the explicit subpath:

```js
import { startMaqamServer } from "maqam/server";
```

The research request body can no longer supply `allowedOrigins` or `allowPrivateNetworks`. Configure network authority at trusted server startup. The server limits each run to at most 10 returned pages and requires JSON requests, an allowed Host header, and same-site/origin checks. Binding beyond loopback requires both an API bearer token and an explicit Host allowlist.

## Release reports

`createReleaseGateReport()` now requires:

- passing entries for the exact commands `npm test` and `npm pack --dry-run`;
- the npm public registry and an approved public publish command;
- an artifact filename, positive size, SHA-256 or SHA-512 integrity, and full Git commit;
- provenance with `copiedThirdPartyCode: false`; and
- an approved `publish:npm` record whose subject exactly matches the package, version, registry, command, artifact, and commit.

The report describes evidence; it does not execute or cryptographically enforce a publish by itself.
