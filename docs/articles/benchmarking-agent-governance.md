# Benchmarking an agent-governance boundary without fooling yourself

Agent products often compress several unrelated questions into one number: How fast is it? Does policy actually stop a call? Is the system secure? Does the agent complete useful work? Those are different evaluation objectives, and a benchmark that answers one cannot silently stand in for the others.

This article explains the design of the Maqam Governance Evaluation Suite (MGES) v1, what its first result means, and what it would take to develop a broader ecosystem benchmark.

## Start with the measurement claim

MGES v1 has two profiles:

1. a local-call performance microbenchmark;
2. a deterministic governance-boundary conformance suite.

The performance objective is intentionally narrow:

> Measure the sequential cost of Maqam's current local governed-call path so maintainers and adopters can detect material regressions under matched conditions.

It does not measure model quality, task success, prompt-injection resistance, network throughput, durable workflow performance, human review time, or the speed of another product.

The conformance objective is different:

> Exercise named Maqam boundary invariants and publish the observed pass/fail evidence for the exact source fingerprint that was tested.

A conformance pass is regression evidence. It is not a security score or proof that every deployment path is governed.

This separation follows a basic measurement principle: define what will be measured and how the result will be used before selecting a metric. The January 2026 [NIST AI 800-2 Initial Public Draft](https://doi.org/10.6028/NIST.AI.800-2.ipd) makes that principle explicit for automated AI benchmark evaluations. It also recommends reporting assumptions, statistical uncertainty, evaluation details, item-level results and qualified conclusions. MGES is not an evaluation of language-model behavior and does not claim NIST conformance, but those transparency practices transfer well to a runtime microbenchmark.

## What one governed call does

The fixture registers a trivial asynchronous handler:

```js
const input = { value: 41, nested: { release: "0.2.x" } };
const handler = async (value) => value.value + 1;
```

The direct variant invokes that handler. The governed variant invokes it through `ToolGateway` with an allowlist `PolicyEngine` and tracing enabled.

The governed path includes the work Maqam performs at the boundary:

- snapshot and validate caller context;
- canonicalize, detach, deep-freeze and hash input;
- resolve the registered tool and effective goal;
- evaluate and normalize policy;
- enforce per-run limits;
- construct a scoped evidence facade;
- dispatch the exact detached input;
- append a redacted completion trace.

The benchmark retains the resulting trace. After the timed batch it verifies that the result checksum is correct, the governed call count equals the requested operation count, and every governed operation produced one trace entry. The benchmark therefore cannot report an attractive number after silently skipping normal trace work.

## Why the direct and governed batches have different sizes

The direct handler is only an async addition. A short direct batch can finish so quickly that scheduling noise dominates the estimate. The governed path allocates snapshots and trace records, so it needs fewer operations to reach a stable timed interval.

MGES defaults to:

| Variant | Warmup operations | Timed operations per observation |
|---|---:|---:|
| Direct | 250,000 | 5,000,000 |
| Governed | 500 | 5,000 |

Each observation reports elapsed time divided by its own operation count. Different batch sizes do not change the operation being estimated; they give both estimates a sufficiently long timing window.

Both median timed batches exceeded the project's 100 ms minimum in the current run: 334.519 ms direct and 687.398 ms governed.

## Fresh processes and alternating order

JavaScript benchmark results are sensitive to runtime optimization state, allocation, garbage collection, CPU scheduling and execution order. The [Node.js core benchmark guide](https://github.com/nodejs/node/blob/main/doc/contributing/writing-and-running-benchmarks.md) uses separate processes for configurations, defaults to 30 comparison runs, and warns that a single execution does not provide enough statistical information for a conclusion.

MGES runs every observation in a fresh Node child process. Process startup and module loading occur before the timed interval. Warmup uses a separate fixture, then the measured governed fixture begins with an empty trace and zero call count.

Thirty paired rounds alternate order:

```text
round 1: direct   -> governed
round 2: governed -> direct
round 3: direct   -> governed
...
```

Alternation reduces one simple temporal bias: a fixed direct-then-governed order could consistently favor whichever variant runs first or second as system conditions drift.

The timer is Node's monotonic [`process.hrtime.bigint()`](https://nodejs.org/api/process.html#processhrtimebigint), with elapsed nanoseconds calculated by integer subtraction.

## The statistics and what they mean

For each observation, MGES calculates the batch mean:

```text
nanoseconds per operation = elapsed nanoseconds / completed operations
```

The headline is the median of the 30 governed observation means. MGES also reports the mean, sample standard deviation, coefficient of variation, median absolute deviation, minimum, maximum, 5th and 95th percentiles of observation means, and every raw observation.

The reported 95% interval is a deterministic percentile-bootstrap interval for the sample median using 10,000 resamples. It estimates sampling uncertainty across runs under the conditions of this machine. It does not describe uncertainty across other processors, operating systems, Node versions, thermal states or production workloads.

The sequential rate is derived from the median:

```text
operations per second at median = 1,000,000,000 / median nanoseconds per operation
```

It is not a concurrency or capacity measurement.

MGES also pairs the direct and governed estimates from each round and reports the median absolute addition. It intentionally does not promote the governed/direct ratio. When the baseline intentionally does almost no work, a ratio can be numerically large while conveying little useful engineering information.

## The current MGES v1.1 result

The current clean-source artifact is [`2026-07-18-mges-performance-windows-node24.json`](../../benchmarks/results/2026-07-18-mges-performance-windows-node24.json).

| Field | Result |
|---|---:|
| Runtime and host | Node 24.15.0, Windows x64, AMD Ryzen 7 4800H |
| Observations | 30 fresh processes per variant |
| Governed median | **123.773 microseconds/call** |
| 95% bootstrap interval for the sample median | **122.659-126.087 microseconds/call** |
| Sequential rate at the median | **8,079.310 calls/second** |
| Paired added median | **123.716 microseconds/call** |
| Governed coefficient of variation | **2.930%** |
| Direct coefficient of variation (diagnostic) | **8.853%** |
| Project publication checks | **PASS (4/4 required; direct diagnostic also passed)** |

MGES v1.1 criteria version 2 requires 30 observations, governed coefficient of variation no greater than 10%, and median timed batches of at least 100 ms for both variants. Direct-path CV remains a reported diagnostic because the near-zero baseline is dominated by cross-process CPU-frequency noise; no direct observation is removed. These are stability gates chosen for this suite, not an industry acceptance rule.

Earlier review runs showed why raw stability gates matter: uncontrolled background load can move cross-process CV above the declared ceiling even when the fixture is unchanged. No observations were deleted. Criteria version 2 keeps the product-path 10% ceiling, both minimum batch-duration gates, and all raw direct diagnostics while no longer treating the near-zero direct baseline as a product stability gate.

The passing artifact identifies the benchmark and implementation files with individual and combined SHA-256 fingerprints. It records clean source commit `50d9fa92d6ba195cba15c943cfeec789374b9184` and `workingTreeDirty: false`. Later release commits may change files outside the measured path; any change to a fingerprinted source requires another run.

## Conformance is not another latency metric

The MGES governance-boundary profile executes 14 deterministic cases:

- deny-by-default gateway construction;
- denial before handler dispatch;
- fail-closed policy evaluation;
- accessor input rejection without invoking getter, policy or handler;
- approval binding to the exact run, tool and canonical-input hash;
- single-use approval replay rejection;
- policy-owned call-limit enforcement;
- detached and frozen handler input;
- cross-run evidence rejection for claim support;
- atomic multi-approval consumption;
- run/task/tool-bound evidence attribution;
- coded, redacted denial traces;
- fatal source-policy denial with zero backend dispatch; and
- ordered fallback after ordinary source unavailability with normalized provenance.

The current machine-readable artifact, [`2026-07-18-mges-conformance-windows-node24.json`](../../benchmarks/results/2026-07-18-mges-conformance-windows-node24.json), records 14/14 passing fixtures.

The suite does not collapse those cases into a percentage security score. Equal weighting would imply that the cases have equal risk and coverage, which has not been established. Case durations are diagnostic only.

## Relationship to OWASP agentic risks

The [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) is a globally peer-reviewed risk framework. MGES is neither a substitute for it nor an OWASP certification.

The MGES cases provide narrow evidence relevant to ASI02, Tool Misuse & Exploitation: Maqam denies unregistered or disallowed calls at its registered boundary, scopes approval to an exact call, enforces a call limit, and consumes approvals atomically. They do not test prompt injection, poisoned tool definitions, provider-internal tool paths, operating-system containment or network isolation.

Approval scope and one-use consumption are also relevant to accidental authority reuse under ASI03, Identity & Privilege Abuse. But Maqam v0.2.x accepts reviewer identity as host-supplied data. Authentication, IAM, credentials, delegation and non-repudiation remain responsibilities of the host deployment.

An approval gate creates a review point relevant to ASI09, Human-Agent Trust Exploitation. MGES does not evaluate whether a review interface communicates risk, whether the reviewer is fatigued or socially engineered, or whether the host authenticated that reviewer.

That is a relevance crosswalk with explicit gaps—not a compliance statement.

## Why this cannot rank Maqam against other tools

Maqam, an orchestration framework, a policy engine and a crawler do not perform the same job. Comparing their default “tool call” timings would reward whatever system performs the least work.

A valid cross-product comparison would need, at minimum:

1. a shared workload with the same payload and effect;
2. the same policy decision and approval obligations;
3. equivalent input immutability and scope binding;
4. equivalent trace and evidence outputs;
5. an agreed persistence and process model;
6. public adapters and configuration for every system;
7. predeclared statistics and acceptance criteria;
8. multiple independently operated machines;
9. disclosure of failed and unstable runs;
10. peer review by maintainers who understand every product.

MGES v1 supplies none of the competitor adapters and therefore makes no speed ranking.

## A path to an ecosystem evaluation

MGES can grow without turning one microbenchmark into a marketing scorecard. A useful roadmap would add versioned profiles rather than silently broadening v1:

### Adapter conformance

Every integration could run a common protocol that checks:

- all effectful calls enter the registered gateway;
- an unregistered provider-internal tool cannot bypass the adapter;
- run, task, tool and canonical-input identifiers survive transport;
- approval requests and decisions preserve exact scope;
- cancellation and errors remain fail-closed;
- evidence and trace identifiers propagate across process boundaries.

Results should name the adapter, provider, version and unsupported properties. “Not tested” must remain different from “pass.”

### End-to-end workload profiles

Separate profiles could cover local CLI execution, MCP transport, HTTP services, durable queues, crawler research, and multi-agent handoffs. Each needs its own fixture and result schema because their latency and failure models differ.

### Adversarial evaluation

Security evaluation should include malicious tool descriptions, prompt-injected content, forged approval identities, replay across restarts, poisoned evidence, bypass attempts, network-origin violations, partial persistence failures and concurrent races. Those are attack experiments, not extensions of a latency loop.

### Public result registry

Artifacts could be signed and indexed by suite version, source fingerprint, clean commit, environment and profile. Independent reruns would make it possible to distinguish one machine's observation from a repeatable ecosystem result.

## How to quote the result responsibly

A defensible compact statement is:

> MGES v1.1.0 local-call profile on Node 24.15.0 / Windows x64 / Ryzen 7 4800H: 123.773 microseconds median per governed call (95% bootstrap interval for the sample median: 122.659-126.087; 30 fresh-process observations; governed CV 2.930%; required checks PASS). Local in-process component benchmark; excludes model, network, storage and concurrency; not a competitor benchmark or SLA.

For conformance:

> MGES v1.1.0 governance-boundary profile: 14/14 project-defined fixtures passed on the recorded source fingerprint. This is regression evidence, not a security score, penetration test or certification.

The raw JSON should accompany either statement. A number without its objective, fixture, environment, uncertainty, limitations and artifact is not a benchmark report; it is an anecdote.
