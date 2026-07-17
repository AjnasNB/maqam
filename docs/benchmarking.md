# Maqam Benchmarking

Maqam publishes the project-defined **Maqam Governance Evaluation Suite (MGES) v1.1.0**. It keeps two questions separate:

- **local-call performance:** how long one narrow in-process governed fixture took on a disclosed machine;
- **governance-boundary conformance:** whether named deterministic boundary fixtures passed on a disclosed source fingerprint.

MGES is not a globally standardized benchmark, competitor ranking, penetration test, security score, compliance assessment or certification.

## Current clean-source result

On Node 24.15.0, Windows x64 and an AMD Ryzen 7 4800H, the MGES local-call profile recorded:

| Metric | Result |
|---|---:|
| Governed median | **123.773 microseconds/call** |
| 95% bootstrap interval for the sample median | **122.659-126.087 microseconds/call** |
| Sequential rate at the median | **8,079.310 calls/second** |
| Governed coefficient of variation | **2.930%** |
| Observations | **30 fresh processes per variant** |
| Project publication checks | **PASS (4/4 required; direct-CV diagnostic also passed)** |

The timed fixture excludes model inference, network and filesystem I/O, durable storage, human review, process startup and concurrent load. The rate is a derived sequential rate, not a concurrent capacity claim.

The artifact records source commit `50d9fa92d6ba195cba15c943cfeec789374b9184` with `workingTreeDirty: false` and fingerprints every benchmark and implementation file in the measured path. Later release commits may change files outside the measured path, but any change to a fingerprinted source requires another run.

The separate governance-boundary profile currently records **14/14 project-defined fixtures passed**, including denial before dispatch, fail-closed policy, exact run/tool/input approval scope, changed-input and replay rejection, immutable detached input, atomic multi-approval consumption, evidence scoping, redacted denial traces, fatal source-denial behavior, and normalized ordered fallback. This is regression evidence only—not proof that Maqam or a deployment is secure.

## Run both profiles

```bash
npm run benchmark:mges:conformance
npm run benchmark:mges:performance
```

## Canonical artifacts

- [Complete MGES methodology and interpretation](../benchmarks/README.md)
- [Presentation and claim templates](../benchmarks/CLAIMS.md)
- [Detailed technical article](articles/benchmarking-agent-governance.md)
- [Raw performance JSON](../benchmarks/results/2026-07-18-mges-performance-windows-node24.json)
- [Raw conformance JSON](../benchmarks/results/2026-07-18-mges-conformance-windows-node24.json)
- [Performance result schema](../benchmarks/schemas/performance-v1.schema.json)
- [Conformance result schema](../benchmarks/schemas/conformance-v1.schema.json)

## Acceptable compact wording

> MGES v1.1.0 local-call profile on Node 24.15.0 / Windows x64 / Ryzen 7 4800H: 123.773 microseconds median per governed call (95% bootstrap interval for the sample median: 122.659-126.087; 30 fresh-process observations; governed CV 2.930%; required project checks PASS). Local in-process component benchmark; excludes model, network, storage and concurrency; not a competitor benchmark or SLA.

For conformance:

> MGES v1.1.0 governance-boundary profile: 14/14 project-defined fixtures passed on the recorded source fingerprint. Regression evidence only—not a security score, penetration test, formal proof, compliance result or certification.

Do not shorten either statement by removing its scope or qualification.
