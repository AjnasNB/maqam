# Maqam Benchmarking

Maqam publishes the project-defined **Maqam Governance Evaluation Suite (MGES) v1.1.0**. It keeps two questions separate:

- **local-call performance:** how long one narrow in-process governed fixture took on a disclosed machine;
- **governance-boundary conformance:** whether named deterministic boundary fixtures passed on a disclosed source fingerprint.

MGES is not a globally standardized benchmark, competitor ranking, penetration test, security score, compliance assessment or certification.

## Published 0.3.1 measured-source result

On pinned Node 24.18.0, a GitHub-hosted Ubuntu 24.04 x64 runner, and an AMD EPYC 7763, the 0.3.1 measured-source MGES local-call profile recorded:

| Metric | Result |
|---|---:|
| Governed median | **129.849 microseconds/call** |
| 95% bootstrap interval for the sample median | **129.539-130.648 microseconds/call** |
| Sequential rate at the median | **7,701.249 calls/second** |
| Governed coefficient of variation | **1.111%** |
| Observations | **30 fresh processes per variant** |
| Project publication checks | **PASS (4/4 required; direct-CV diagnostic also passed)** |

The timed fixture excludes model inference, network and filesystem I/O, durable storage, human review, process startup and concurrent load. The rate is a derived sequential rate, not a concurrent capacity claim.

The candidate artifacts record exact clean measured-source commit `a96413c4da5f27dc31b9772996e70faab0b38382` with `workingTreeDirty: false` and fingerprint every benchmark and implementation file in the measured path. The evidence-only follow-up does not alter those fingerprinted files; any later fingerprinted change requires another run. The post-merge package commit and tarball identity are separate release gates.

The separate governance-boundary profile records **14/14 project-defined fixtures passed**, including denial before dispatch, fail-closed policy, exact run/tool/input approval scope, changed-input and replay rejection, immutable detached input, atomic multi-approval consumption, evidence scoping, redacted denial traces, fatal source-denial behavior, and normalized ordered fallback. This is regression evidence only—not a browser-adapter test or proof that Maqam or a deployment is secure.

The previous public 0.3.0 release evidence remains preserved for its own exact commit: Node 24.15.0 on Windows x64, `140.816 microseconds/call` governed median, `138.983-142.820` interval, `5.020%` governed CV, and `14/14` fixtures at `545fe8bbc40f21cec0f9ec2ae3954f3e75783f22`.

## Run both profiles

```bash
npm run benchmark:mges:conformance
npm run benchmark:mges:performance
```

## Canonical artifacts

- [Complete MGES methodology and interpretation](../benchmarks/README.md)
- [Presentation and claim templates](../benchmarks/CLAIMS.md)
- [Detailed technical article](articles/benchmarking-agent-governance.md)
- [0.3.1 measured-source performance JSON](../benchmarks/results/2026-07-19-mges-performance-ubuntu24-node24-main-a96413c4.json)
- [0.3.1 measured-source conformance JSON](../benchmarks/results/2026-07-19-mges-conformance-ubuntu24-node24-main-a96413c4.json)
- [0.3.1 measured-source digest manifest](../benchmarks/results/2026-07-19-mges-evidence-manifest-ubuntu24-node24-main-a96413c4.json)
- [Previous public 0.3.0 performance JSON](../benchmarks/results/2026-07-18-mges-performance-windows-node24-main-545fe8bb.json)
- [Previous public 0.3.0 conformance JSON](../benchmarks/results/2026-07-18-mges-conformance-windows-node24-main-545fe8bb.json)
- [Performance result schema](../benchmarks/schemas/performance-v1.schema.json)
- [Conformance result schema](../benchmarks/schemas/conformance-v1.schema.json)

## Acceptable compact wording

> Published 0.3.1 measured-source evidence — MGES v1.1.0 local-call profile on Node 24.18.0 / Ubuntu 24.04 x64 / AMD EPYC 7763: 129.849 microseconds median per governed call (95% bootstrap interval for the sample median: 129.539-130.648; 30 fresh-process observations; governed CV 1.111%; required project checks PASS). Measured from exact clean main commit `a96413c4da5f27dc31b9772996e70faab0b38382`; the published artifact's release-only delta leaves the fingerprinted implementation and benchmark sources unchanged. Local in-process component benchmark; excludes model, network, storage, browser and concurrency; not a competitor benchmark, release announcement or SLA.

For conformance:

> Published 0.3.1 measured-source evidence — MGES v1.1.0 governance-boundary profile: 14/14 project-defined fixtures passed on the recorded source fingerprint. Regression evidence only—not a browser-adapter test, security score, penetration test, formal proof, compliance result or certification.

Do not shorten either statement by removing its scope or qualification.
