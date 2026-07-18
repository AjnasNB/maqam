# Maqam 0.3.0 Release Record

**Status:** exact-artifact release record. This file describes the `0.3.0` surface and required evidence; verify public availability from the npm registry, provenance, integrity, Git tag, and GitHub release rather than trusting source metadata alone.

## Release Intent

Maqam 0.3.0 extends the governed execution boundary with ordered research-source routing and feed-aware collection while preserving exact policy and approval semantics.

### Added

- `ResearchSourceRegistry` with deterministic priority, explicit backend preferences, bounded attempt records, fatal-error stop rules, and normalized `ResearchDocument` output.
- `defineResearchSourceAdapter`, `defineResearchToolCaller`, source error classes/classification, and bounded host-defined source-doctor reports.
- Offline RSS 2.0/Atom parsing plus host-reader and source-adapter factories with no implicit network access.
- Crawler feed discovery and parsing with explicit item/link budgets.
- Safer CLI controls for requests, depth, bytes, duration, retries, exact cross-origin permission, detailed failures, statistics, and fail-on-error behavior.
- Bounded anonymous hosted Exa MCP web search plus explicitly enabled public YouTube metadata/caption research through a separately installed absolute `yt-dlp` path.
- Exact handler-declared network origins enforced before dispatch, and local console routes that surface adapter identity, access mode, data boundary, attempts, and gateway trace.
- A governed-source example, complete guide, and 0.3 migration notes.

### Security Boundaries

- Governed source routing requires a bound `ToolCaller` and reaches adapters through their registered `ToolGateway` tool names.
- `routeUngoverned()` is explicitly named and reported as a direct bypass; it provides routing/normalization only.
- Policy, approval, authorization, authentication, crawler-security, robots, goal-scope, and tool-call-limit failures stop routing instead of falling through.
- Authenticated adapters require explicit per-route opt-in and never import or synchronize credentials.
- RSS/Atom parsing rejects DTD/entity declarations, bounds input and output, sanitizes content, and performs no network request.
- `--all-origins` is removed; cross-origin crawling requires repeatable exact `--allowed-origin` values.
- The HTTP console never discovers a YouTube executable from `PATH`; the operator must supply `--yt-dlp-command` or `MAQAM_YT_DLP_COMMAND` with an absolute reviewed path.

### Honest Scope

This release does not add browser automation, automatic dependency installation, cookie/session import, provider login, anti-bot bypass, provider-native approval synchronization, built-in social-platform adapters, or a hosted distributed crawler. Anonymous public access is best-effort and does not mean universal, unlimited, private, or permitted access.

The architecture was informed by Agent Reach's explicit channel-routing and health-check concepts. The implementation is independent and does not claim equivalent platform coverage. See [Provenance and License Notes](provenance-and-licenses.md).

## Manual Public-Source Compatibility Check

On 2026-07-18, the local console completed an anonymous hosted Exa search with five normalized documents and one gateway-authorized adapter call. It also completed a canonical public YouTube URL run with metadata and timestamped caption evidence through the official `yt-dlp` `2026.07.04` Windows standalone. That executable remained outside the repository; its SHA-256 was `52FE3C26DCF71FBDC85B528589020BB0B8E383155CFA81B64DD447BBE35E24B8`, matching the upstream release checksum.

The console reported one adapter attempt and one gateway call for each route, and the browser console had no warnings or errors. No developer API key, browser cookie, account login, media download, plugin, or remote component was used. This is dated compatibility evidence only: hosted availability, anonymous allowance, public captions, and upstream extraction behavior can change, so deterministic transport/process fixtures and the exact release tests remain the acceptance gate.

## Required Verification

The release owner must attach results from the final clean commit for:

```bash
npm test
npm run test:consumer-types
npm run test:website
npm audit --omit=dev
npm pack --dry-run
npm pack --json --ignore-scripts
npm run benchmark:mges:conformance
npm run benchmark:mges:performance
```

Required matrices and focused evidence:

- Node.js 20, 22, and 24 CI;
- allowed source route dispatches once;
- denied source route dispatches zero times;
- fatal source failures never fall through;
- ordinary unavailable adapters follow deterministic preference;
- authenticated adapters require explicit opt-in;
- source doctor timeout/error isolation;
- RSS and Atom fixtures, entity/DTD rejection, limits, sanitization, and provenance;
- crawler feed discovery and exact cross-origin permission;
- crawler CLI argument, output, and failure-exit behavior;
- public exports, declarations, clean-consumer compile, and packed-file assertions;
- MGES performance and conformance rerun when fingerprinted files change.

Do not copy the historical 0.2.4 benchmark result into this release as if it measured 0.3.0. Preserve 0.2.4 evidence for its own artifact.

Because GitHub squash merging rewrites pull-request commits, final 0.3.0 benchmark evidence must be generated after the implementation PR lands on `main`. Submit the resulting raw artifacts and claim updates in a second evidence-only PR. Its measured `main` commit must remain an ancestor of the final release commit and the evidence PR must not change fingerprinted source.

Fresh MGES v1.1.0 evidence was generated from clean source commit `bceaebfa2a4059bc63acd23eccf4fafee794a295`:

- [performance JSON](../benchmarks/results/2026-07-18-mges-performance-windows-node24.json): 30 fresh-process observations, `124.303 microseconds/call` governed median, `123.712-125.695` 95% bootstrap interval, `2.010%` governed CV, and all four required criteria-version-2 checks passed;
- [conformance JSON](../benchmarks/results/2026-07-18-mges-conformance-windows-node24.json): `14/14` named deterministic fixtures passed, including fatal source-policy denial and normalized ordered fallback.

These are local project regression results, not a globally standardized benchmark, security score, certification, competitor ranking, capacity test, or SLA.

## Exact Artifact Approval

Before the trusted npm workflow can publish, the maintainer approval must identify:

- package `maqam` and version `0.3.0`;
- registry `https://registry.npmjs.org/`;
- publish command `npm publish --access public --ignore-scripts --provenance`;
- final Git commit;
- tarball filename and byte size;
- npm `dist.integrity` candidate and independent SHA-256;
- clean tree and required verification results; and
- the `publish:npm` action.

The approved artifact must be rebuilt and matched in the protected GitHub environment before trusted OIDC publication.

## Post-Publish Verification

After publication, verify before tagging or announcing:

```bash
npm view maqam@0.3.0 version dist.integrity gitHead _resolved _from
npx -y maqam@0.3.0 demo approval
```

Require the registry `gitHead` and integrity to match the approved evidence, and confirm `_resolved`/`_from` contain no local path. Then create annotated tag `v0.3.0` and a GitHub release that links to the npm package and exact artifacts.

## Historical Evidence

The [0.2.4 source release record](release-0.2.4-candidate.md), `v0.2.4` GitHub release, media, transcripts, and benchmark artifacts remain historical records for that published artifact. They must not be deleted or silently relabeled as 0.3.0 evidence.
