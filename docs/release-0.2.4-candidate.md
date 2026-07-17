# Maqam 0.2.4 and ProductLoop OS Release Record

Prepared: 2026-07-16
Published: 2026-07-17
Status: released to npm and GitHub

[`maqam@0.2.4`](https://www.npmjs.com/package/maqam) is public on npm. The matching [`v0.2.4` GitHub release](https://github.com/AjnasNB/maqam/releases/tag/v0.2.4) publishes the reviewed tarball, artifact manifest, checksums, benchmark JSON, narrated videos, transcripts, and product-specific 3D release assets.

This file keeps its original `release-0.2.4-candidate.md` path so existing links remain valid. Its contents now record the completed release rather than the pre-publication state.

## One Ecosystem, Two Roles

Maqam is the governed execution kernel. It puts registered operations behind `ToolGateway`, evaluates policy before dispatch, binds required approval to the exact run, tool and canonical input hash, consumes approvals once by default, and records reviewable traces and source-linked evidence.

ProductLoop OS is the companion package ecosystem. It adds small packages for workflow runtime, policy decisions, approval operations, provenance, evaluations, connector trust, skill manifests and replayable browser-research records. The `productloop-os` umbrella exposes Maqam and those packages as named namespaces with explicit adapters. It does not silently merge their ledgers or intercept calls that bypass their registered paths.

Install Maqam when the immediate need is a compact governed tool boundary, crawler, local console or CLI-worker adapter. Install `productloop-os` when the application also needs the wider composable package set. See the [ProductLoop package atlas](https://maqamagent.com/docs/productloop/) and the [ProductLoop OS repository](https://github.com/AjnasNB/productloop-os).

## Public Package Map

The current companion package release is [`productloop-os@0.2.1`](https://www.npmjs.com/package/productloop-os), with its own [`v0.2.1` GitHub release](https://github.com/AjnasNB/productloop-os/releases/tag/v0.2.1):

| Package | Public version | Role |
|---|---:|---|
| `productloop-os` | `0.2.1` | Umbrella, named namespaces, composition helpers and dependency doctor |
| `ajnas-runtime` | `0.2.1` | Ordered policy-gated workflows and tool calls |
| `ajnas-skills-registry` | `0.2.1` | Skill manifests, signatures and install policy |
| `ajnas-provenance` | `0.1.3` | Hash-linked traces, bundles, signatures and redaction |
| `ajnas-policy` | `0.1.2` | Declarative allow, deny and approval decisions |
| `ajnas-evals` | `0.1.2` | Deterministic assertions and verifiable evaluation reports |
| `ajnas-connectors` | `0.1.2` | Connector manifests, permission context and trust evaluation |
| `ajnas-approvals` | `0.1.2` | Review tickets, delegation, escalation and decision adapters |
| `ajnas-browser-research` | `0.1.3` | Governed research plans, replay, citations and provenance exports |

Maqam release state:

| Package | State |
|---|---|
| `maqam@0.2.4` | Public on npm and GitHub; npm `gitHead` is `e1f6d3f9cf0d4aac277fc5e6ba1de3ae2c93a701` |

## Release Highlights

- MGES v1 separates a local-call performance profile from 12 named governance-boundary conformance fixtures, publishes raw observations and source fingerprints, and supplies copy-safe claim rules.
- Host-supplied SDK, HTTP, MCP-style and custom functions can use typed adapter descriptors and the same registered `ToolGateway` boundary. Maqam does not provide provider authentication, MCP discovery, protocol clients or automatic interception of provider-internal tools.
- The [Google ADK and Microsoft Agent 365 guide](integrations-google-adk-agent365.md) provides integration templates and explicit bypass warnings. The examples are not native provider integrations, partnerships or certifications.
- The public [Maqam documentation site](https://maqamagent.com/docs/) now joins the quickstart, ProductLoop package atlas, integration boundary, benchmark methodology, security guidance, articles and community entry points.
- Three narrated proof videos are available from stable release-media paths with captions included in the players.

## Videos

| Demonstration | Video | Captions |
|---|---|---|
| Exact approval: changed input blocked, exact input executed once, replay blocked | [MP4](https://maqamagent.com/media/releases/maqam/v0.2.4/maqam-exact-approval-demo.mp4) | [VTT](https://maqamagent.com/media/releases/maqam/v0.2.4/maqam-exact-approval-demo.vtt) · [SRT](https://maqamagent.com/media/releases/maqam/v0.2.4/maqam-exact-approval-demo.srt) |
| ProductLoop OS: Maqam plus eight explicit package namespaces | [MP4](https://maqamagent.com/media/releases/maqam/v0.2.4/productloop-os-ecosystem-overview.mp4) | [VTT](https://maqamagent.com/media/releases/maqam/v0.2.4/productloop-os-ecosystem-overview.vtt) · [SRT](https://maqamagent.com/media/releases/maqam/v0.2.4/productloop-os-ecosystem-overview.srt) |
| Governed crawler research: bounded collection, citations and evidence | [MP4](https://maqamagent.com/media/releases/maqam/v0.2.4/maqam-crawler-governed-research.mp4) | [VTT](https://maqamagent.com/media/releases/maqam/v0.2.4/maqam-crawler-governed-research.vtt) · [SRT](https://maqamagent.com/media/releases/maqam/v0.2.4/maqam-crawler-governed-research.srt) |

## Verification Evidence

Release verification completed on 2026-07-17 includes:

- Maqam `npm test`: 204/204 tests passed.
- Maqam clean-consumer TypeScript compilation: passed.
- Maqam production dependency audit: zero known vulnerabilities.
- Maqam CI passed on Node.js 20, 22 and 24 for the published source commit `e1f6d3f9cf0d4aac277fc5e6ba1de3ae2c93a701`.
- The published `maqam-0.2.4.tgz` is 191,585 bytes with SHA-256 `f4751f4f4ef3a4a97631f8ebddc72cb03962cc52d7ae983f9d0188de9a6318cb` and npm integrity `sha512-/VHGyLNele7rp7At6HGZhrw5UxOF9rlcPWHWZ+7srMz47zhhEBbkJXgKQTdZRA0MLQTGqGs8sKFhNnhgjIPWlA==`.
- ProductLoop OS full workspace verification covered nine public packages, workspace builds and typechecks, umbrella integration, dependency doctor, clean-consumer declarations and all package previews.
- ProductLoop OS production dependency audit: zero known vulnerabilities across the audited 55 production dependencies.
- ProductLoop OS release source is tagged at commit `30c82e6ea6c2c039cf09d8c0bfbb41caf6171dc8`.

These checks cover the behavior and environments they exercised; they are not proof that the software is error-free, secure in every deployment, or compatible with every provider.

## MGES v1 Evidence and Limits

The clean measured source commit is `44c198f9eab1ea3a2dedb1f784413a2733b7745d`. On Node.js 24.15.0, Windows x64 and an AMD Ryzen 7 4800H, the local governed-call profile recorded:

- `127.498 microseconds/call` median;
- `126.334-128.942 microseconds/call` deterministic 95% percentile-bootstrap interval for the sample median;
- 30 fresh-process observations per variant;
- `5.572%` governed coefficient of variation;
- `7,843.288 calls/second` as the reciprocal sequential rate at the observed median; and
- all five MGES project publication checks passing.

The separate governance-boundary profile passed 12/12 project-defined fixtures on the recorded source fingerprint. Read the [methodology and claim rules](../benchmarks/README.md), [performance JSON](../benchmarks/results/2026-07-16-mges-performance-windows-node24.json) and [conformance JSON](../benchmarks/results/2026-07-16-mges-conformance-windows-node24.json).

MGES is project-defined regression evidence. It is not globally standardized, independently certified, a competitor ranking, a penetration test, a security score, a compliance result or an SLA. The local-call fixture excludes model inference, network and filesystem I/O, durable storage, human review, process startup and concurrent load. Do not present the reciprocal sequential rate as concurrent production throughput.

## Security and Integration Boundaries

- Only calls routed through registered Maqam adapters are governed. Direct provider, browser, connector, MCP or SDK calls bypass Maqam.
- Maqam does not supply a model, operating-system sandbox, production browser, hosted crawler fleet, identity system, secret manager, database or distributed scheduler.
- Source-linked evidence makes attribution inspectable; it does not prove that an external claim is true.
- The built-in crawler enforces public-network defaults, DNS and redirect validation, response and request ceilings, and robots handling. Deployment-level credentials, egress, sandboxing, tenant isolation and authorization remain host responsibilities.
- Google ADK and Microsoft Agent 365 examples are host integration templates, not automatic tool interception or provider-native approval synchronization.

Read the [security policy](../SECURITY.md), [integration guide](integrations-google-adk-agent365.md), [comparison](comparison.md) and [Why Maqam](why-maqam.md) before production deployment.

## Completed Release Gate

The release followed the repository's exact-artifact process: clean source verification, fresh packing, manifest and digest generation, clean-consumer installation, explicit maintainer approval, trusted npm publication, registry integrity and `gitHead` verification, then the matching annotated tag and GitHub release. Future versions must repeat that process with a newly built artifact; the 0.2.4 approval cannot authorize a different version or changed tarball.

## Documentation and Community

- [Website](https://maqamagent.com/)
- [Documentation](https://maqamagent.com/docs/)
- [Why Maqam](why-maqam.md) and [comparison](comparison.md)
- [ProductLoop package atlas](https://maqamagent.com/docs/productloop/)
- [Integrations](https://maqamagent.com/docs/integrations/)
- [Benchmark methodology](https://maqamagent.com/docs/benchmark/)
- [Security guidance](https://maqamagent.com/docs/security/)
- [Community hub](https://maqamagent.com/community/)
- [Public roadmap](../ROADMAP.md)
- [Contributing](https://github.com/AjnasNB/maqam/blob/main/CONTRIBUTING.md), [governance](https://github.com/AjnasNB/maqam/blob/main/GOVERNANCE.md), [support](https://github.com/AjnasNB/maqam/blob/main/SUPPORT.md) and [code of conduct](https://github.com/AjnasNB/maqam/blob/main/CODE_OF_CONDUCT.md)
