# Maqam Benchmarking

Maqam publishes the project-defined **Maqam Governance Evaluation Suite (MGES) v1**. It keeps two questions separate:

- **local-call performance:** how long one narrow in-process governed fixture took on a disclosed machine;
- **governance-boundary conformance:** whether named deterministic boundary fixtures passed on a disclosed source fingerprint.

MGES is not a globally standardized benchmark, competitor ranking, penetration test, security score, compliance assessment or certification.

## Current clean-source result

On Node 24.15.0, Windows x64 and an AMD Ryzen 7 4800H, the MGES local-call profile recorded:

| Metric | Result |
|---|---:|
| Governed median | **127.498 microseconds/call** |
| 95% bootstrap interval for the sample median | **126.334-128.942 microseconds/call** |
| Sequential rate at the median | **7,843.288 calls/second** |
| Governed coefficient of variation | **5.572%** |
| Observations | **30 fresh processes per variant** |
| Project publication checks | **PASS (5/5)** |

The timed fixture excludes model inference, network and filesystem I/O, durable storage, human review, process startup and concurrent load. The rate is a derived sequential rate, not a concurrent capacity claim.

The artifact records source commit `44c198f9eab1ea3a2dedb1f784413a2733b7745d` with `workingTreeDirty: false` and fingerprints every benchmark and implementation file in the measured path. A later evidence-only release commit may add this JSON, documentation, and rendered media, but must not change those fingerprinted sources without another rerun.

The separate governance-boundary profile currently records **12/12 project-defined fixtures passed**, including denial before dispatch, fail-closed policy, exact run/tool/input approval scope, changed-input and replay rejection, immutable detached input, atomic multi-approval consumption, evidence scoping, and redacted denial traces. This is regression evidence only—not proof that Maqam or a deployment is secure.

## Run both profiles

```bash
npm run benchmark:mges:conformance
npm run benchmark:mges:performance
```

## Canonical artifacts

- [Complete MGES methodology and interpretation](../benchmarks/README.md)
- [Presentation and claim templates](../benchmarks/CLAIMS.md)
- [Detailed technical article](articles/benchmarking-agent-governance.md)
- [Raw performance JSON](../benchmarks/results/2026-07-16-mges-performance-windows-node24.json)
- [Raw conformance JSON](../benchmarks/results/2026-07-16-mges-conformance-windows-node24.json)
- [Performance result schema](../benchmarks/schemas/performance-v1.schema.json)
- [Conformance result schema](../benchmarks/schemas/conformance-v1.schema.json)

## Acceptable compact wording

> MGES v1 local-call profile on Node 24.15.0 / Windows x64 / Ryzen 7 4800H: 127.498 microseconds median per governed call (95% bootstrap interval for the sample median: 126.334-128.942; 30 fresh-process observations; CV 5.572%; project checks PASS). Local in-process component benchmark; excludes model, network, storage and concurrency; not a competitor benchmark or SLA.

For conformance:

> MGES v1 governance-boundary profile: 12/12 project-defined fixtures passed on the recorded source fingerprint. Regression evidence only—not a security score, penetration test, formal proof, compliance result or certification.

Do not shorten either statement by removing its scope or qualification.
