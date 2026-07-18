# Maqam Governance Evaluation Suite (MGES) v1

MGES is a project-defined evaluation suite with two deliberately separate profiles:

1. **Local-call performance** measures one narrow, in-process `ToolGateway` path.
2. **Governance-boundary conformance** runs deterministic pass/fail fixtures for Maqam's documented invariants.

MGES is not a globally standardized benchmark, an industry certification, a security score, or a competitor ranking. Its purpose is to make Maqam's own measurements inspectable, repeatable, and difficult to overstate.

See [`CLAIMS.md`](CLAIMS.md) for copy-safe presentation templates and the checks required before placing a result in release notes, articles, slides, social posts or video.

## Run it

```bash
# Fast deterministic governance checks
npm run benchmark:mges:conformance

# Full performance profile (about 30-90 seconds depending on the machine)
npm run benchmark:mges:performance

# Both profiles
npm run benchmark:mges
```

Write machine-readable artifacts without losing the human summary:

```bash
node benchmarks/governance-conformance.mjs \
  --output benchmarks/results/my-conformance.json

node benchmarks/governance-suite.mjs \
  --output benchmarks/results/my-performance.json
```

Use `--json` to emit the complete result on standard output. Output directories must already exist.

## Is this benchmark globally accepted?

No. There is currently no universal benchmark or certification for the runtime cost and enforcement quality of agent-governance boundaries.

MGES adapts relevant reporting practices from authoritative work, but that does not make MGES endorsed or certified by those organizations:

- The [Node.js core benchmark guide](https://github.com/nodejs/node/blob/main/doc/contributing/writing-and-running-benchmarks.md) uses repeated runs, separate processes, statistical analysis, and calibration based on variation. It warns against drawing conclusions from a single run. MGES uses 30 fresh-process observations per variant, alternating paired order, and explicit variation checks.
- The [Node.js `process.hrtime.bigint()` documentation](https://nodejs.org/api/process.html#processhrtimebigint) defines the monotonic, nanosecond timer used inside each timed batch.
- The January 2026 [NIST AI 800-2 Initial Public Draft](https://doi.org/10.6028/NIST.AI.800-2.ipd) recommends defining the evaluation objective, reporting assumptions and uncertainty, sharing evaluation details and item-level results, and qualifying claims. That draft is voluntary, remains an initial public draft, and primarily addresses automated evaluations of language models. MGES only borrows compatible transparency principles; it does not claim NIST conformance.
- [SPEC's benchmark-development policy](https://www.spec.org/osg/policy/) emphasizes clear run and reporting rules, automation, experimental records, reproducibility, and disclosure of relevant conditions. MGES is not a SPEC benchmark and has not been reviewed by SPEC.

Broader acceptance would require a stable public specification, independent implementations and reruns, results across operating systems and hardware, peer review, versioned workloads, and—before any product comparison—the same representative workload and disclosure rules for every participant.

## Performance profile

### Evaluation objective

Measure the sequential cost of the current Maqam local governed-call path so maintainers and adopters can detect material regressions on matched hardware and runtime configurations.

The fixture calls the same asynchronous handler in two variants:

- `direct`: call the handler directly;
- `governed`: call a registered tool through `ToolGateway` and an allowlist `PolicyEngine`, including canonical input snapshotting and hashing, policy evaluation, limits, redacted trace creation, and dispatch.

The governed measurement intentionally retains the audit trace and per-run call count produced by normal execution. A checksum and post-run assertions verify that every requested operation completed and every governed call produced exactly one trace entry.

### Default protocol

| Setting | Value |
|---|---:|
| Observations per variant | 30 |
| Direct operations per observation | 5,000,000 |
| Governed operations per observation | 5,000 |
| Direct warmup operations | 250,000 |
| Governed warmup operations | 500 |
| Process isolation | Fresh Node child for every observation |
| Order | Alternating direct/governed and governed/direct rounds |
| Timer | `process.hrtime.bigint()` |
| Median uncertainty | Deterministic percentile bootstrap, 10,000 resamples, 95% interval |
| Raw data | Every observation, order, elapsed time, rate, checksum and verification record |

Warmup uses an independent fixture. The measured governed fixture therefore starts with an empty trace and zero run-call state. Child-process startup is outside the timed interval.

Options:

```text
--samples <2..200>
--direct-iterations <1..10000000>
--governed-iterations <1..10000000>
--direct-warmup <0..10000000>
--governed-warmup <0..10000000>
--bootstrap-resamples <100..100000>
--output <existing-directory/result.json>
--json
```

### Project publication checks

MGES v1.1 uses criteria version 2. The runner marks an artifact `publicationCandidate: true` only when all required project rules pass:

- at least 30 observations per variant;
- governed coefficient of variation no greater than 10%;
- median timed batch of at least 100 ms for each variant.

The direct-path coefficient of variation remains a published diagnostic, but it is not a required gate. The intentionally near-zero direct handler is dominated by cross-process CPU-frequency noise and is not the product path or a headline claim. Its raw observations, interval, CV, and paired contribution remain in the artifact.

These thresholds are MGES stability rules. They are not universal acceptance criteria. A pass does not control CPU affinity, CPU frequency, virtualization, thermal state, or background load; each artifact discloses those uncontrolled conditions. Do not remove outliers or silently change thresholds to obtain a pass.

### Current implementation-PR candidate

[`2026-07-18-mges-performance-windows-node24-governed-public-research-280e43cd.json`](results/2026-07-18-mges-performance-windows-node24-governed-public-research-280e43cd.json) records a clean-source passing MGES v1.1.0 implementation-PR run:

| Field | Observed value |
|---|---:|
| Environment | Node 24.15.0, Windows x64, AMD Ryzen 7 4800H |
| Governed median | **146.842 microseconds/call** |
| 95% bootstrap interval for the sample median | **145.085-153.521 microseconds/call** |
| Sequential rate at the median | **6,810.042 calls/second** |
| Paired added median | **146.767 microseconds/call** |
| Governed coefficient of variation | **9.430%** |
| Direct coefficient of variation (diagnostic) | **12.730%** |
| MGES project publication checks | **PASS (4/4 required; optional direct diagnostic did not meet its 10% reference threshold)** |

The artifact records clean source commit `280e43cde71cdd6128a5c94202dd32abf6e6cdb8` with `workingTreeDirty: false`. It includes SHA-256 fingerprints for every benchmark and implementation file in the measured path. It is provisional because squash merging will rewrite the implementation commit; final release evidence must be rerun from the resulting main commit. Any change to a fingerprinted source requires another run.

This repository squash-merges pull requests, so final release evidence uses two PR phases. First merge the implementation. Then measure that resulting clean `main` commit and submit only artifacts, claims, documentation, and the artifact-selection test in a second PR. The measured commit remains an ancestor of the final release commit; a candidate artifact created before the implementation squash is not final release evidence even when its file fingerprints match.

The earlier [`2026-07-16-mges-performance-windows-node24.json`](results/2026-07-16-mges-performance-windows-node24.json) is retained as the 0.2.4 baseline, and [`2026-07-16-windows-node24.json`](results/2026-07-16-windows-node24.json) remains a legacy seven-sample result. Neither is relabeled as 0.3.0 evidence.

Two clean runs from superseded source commit `c58cb850daeffa24f5f088a97689f5c75c2db69b` are retained as transparent `REVIEW` records: [attempt 1](results/2026-07-18-mges-performance-windows-node24-governed-public-research-c58cb850.json) observed `19.122%` governed CV, and [attempt 2](results/2026-07-18-mges-performance-windows-node24-governed-public-research-c58cb850-attempt2.json) observed `25.691%`. No observations or thresholds were removed. The subsequent source change omitted an unnecessary empty `networkOrigins` metadata field for local-only tools; because that changed a fingerprinted implementation file, both [performance](results/2026-07-18-mges-performance-windows-node24-governed-public-research-280e43cd.json) and [conformance](results/2026-07-18-mges-conformance-windows-node24-governed-public-research-280e43cd.json) were rerun from the new clean commit.

### What the number excludes

The timed interval excludes model inference, network and filesystem I/O, durable storage, human review time, process startup, and concurrent load. It therefore does not predict end-to-end agent latency. The sequential rate is the reciprocal of the observed median, not a concurrent capacity test.

The direct handler deliberately does almost no work. The ratio between direct and governed paths is not a useful product claim and MGES does not report it as a headline metric. The absolute governed time and movement under a matched fixture are the useful values.

## Governance-boundary conformance profile

Run:

```bash
npm run benchmark:mges:conformance
```

The current candidate [`2026-07-18-mges-conformance-windows-node24-governed-public-research-280e43cd.json`](results/2026-07-18-mges-conformance-windows-node24-governed-public-research-280e43cd.json) records **14/14 passing project-defined fixtures**:

| ID | Invariant exercised |
|---|---|
| MGES-C01 | Constructing a governed gateway without policy is rejected |
| MGES-C02 | Policy denial occurs before handler dispatch |
| MGES-C03 | A policy evaluation failure closes the boundary |
| MGES-C04 | Accessor-bearing input is rejected without invoking getter, policy or handler |
| MGES-C05 | Approval is bound to the exact run, tool and canonical-input hash |
| MGES-C06 | Approval is single-use unless explicitly reusable |
| MGES-C07 | A caller cannot raise the policy-owned per-run call limit |
| MGES-C08 | The handler receives a detached, frozen, null-prototype input snapshot |
| MGES-C09 | Cross-run evidence does not support a claim |
| MGES-C10 | Multi-approval consumption is atomic |
| MGES-C11 | Gateway evidence attribution is bound to the real run, task and tool |
| MGES-C12 | A denial trace is present, coded and secret-redacted |
| MGES-C13 | A policy denial on a source route stops every backend before dispatch |
| MGES-C14 | Ordinary source unavailability falls back in order and binds normalized provenance |

This profile reports pass/fail evidence, not a weighted score. Case duration is diagnostic only and must not be used as a performance result. A pass confirms those fixtures on the recorded source fingerprint; it is not a penetration test, proof of semantic correctness, formal verification, compliance assessment, or security certification.

### Narrow OWASP relevance crosswalk

The [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) is a globally peer-reviewed risk framework. It is not a performance benchmark or certification program, and MGES does not cover the full Top 10.

| OWASP risk | Relevant MGES evidence | Important gaps |
|---|---|---|
| ASI02 Tool Misuse & Exploitation | Default denial, pre-dispatch policy, exact approval scope, limits and atomic consumption provide evidence about the registered Maqam tool boundary | Does not test prompt injection, poisoned tools, provider-internal tools, unregistered bypass paths, operating-system containment, or network isolation |
| ASI03 Identity & Privilege Abuse | Exact run/tool/input binding and single-use consumption reduce accidental authority reuse inside the boundary | Reviewer identity is a host-supplied string; MGES does not test authentication, IAM, credential storage, delegation or non-repudiation |
| ASI09 Human-Agent Trust Exploitation | Approval-gated effects create a point where a host can require human review | Does not test review UI quality, reviewer comprehension, social engineering, coercion, fatigue, or whether the host authenticated the reviewer |

This is a relevance crosswalk only. It does not establish OWASP compliance or endorsement.

## How to present MGES results

### Compact, acceptable form

> Provisional result: MGES v1.1.0 local-call profile on Node 24.15.0 / Windows x64 / Ryzen 7 4800H: 146.842 microseconds median per governed call (95% bootstrap interval for the sample median: 145.085-153.521; 30 fresh-process observations; governed CV 9.430%; required checks PASS). Implementation-PR candidate that requires a post-squash main rerun. Local in-process component benchmark; excludes model, network, storage and concurrency; not a competitor benchmark or SLA. Raw JSON: [artifact](results/2026-07-18-mges-performance-windows-node24-governed-public-research-280e43cd.json).

For conformance:

> Provisional result: MGES v1.1.0 governance-boundary profile: 14/14 project-defined fixtures passed on the recorded source fingerprint. Implementation-PR candidate requiring a post-squash main rerun. This is regression evidence, not a security score, penetration test or certification. Raw JSON: [artifact](results/2026-07-18-mges-conformance-windows-node24-governed-public-research-280e43cd.json).

### Do not publish

- “Maqam is 137 microseconds globally.”
- “Maqam is 7,843 times faster” or any comparison that did not run the same representative workload.
- “14/14 means Maqam is secure.”
- “NIST-, SPEC- or OWASP-certified.”
- A point estimate without environment, interval, sample count, scope and raw artifact.

## Comparing future results

Only compare artifacts when suite version, fixture, source scope, Node major version, hardware class, operating-system conditions, iteration counts and quality status are compatible. Prefer repeated before/after runs on the same controlled host. Report the full distributions and absolute difference; do not infer a product advantage from overlapping or noisy measurements.

An honest cross-product study would require adapters that execute the same policy, payload, trace/evidence obligations and persistence model for every product, published configuration and code, multiple independent machines, predeclared analysis, and peer review. MGES v1 does not do that.
