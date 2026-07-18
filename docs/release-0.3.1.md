# Maqam 0.3.1 Release Record

**Lifecycle:** registry-defined. Maqam 0.3.1 is public only when the live npm record, provenance, integrity, registry `gitHead`, matching `v0.3.1` tag, and GitHub release identify the same reviewed artifact. Package metadata, a local tarball, a branch, or this document alone is not publication proof. At candidate preparation time, 0.3.0 was the previous verified public release.

## Purpose

The npm README packed into 0.3.0 is immutable and retained pre-publication wording after the release completed. Version 0.3.1 prepares a truthful replacement while keeping live-state claims conditional on the npm registry, provenance, integrity, Git tag, and GitHub release.

## Release Scope

- synchronize the packaged README, current documentation, and website with the verified public 0.3.0 release;
- label all reused 0.2.4 proof media and benchmark artifacts as historical 0.2.4 evidence;
- add evergreen checks for the current npm dist-tag and latest GitHub release;
- update package, lockfile, release-gate, trusted-publishing, and MCP client metadata to 0.3.1; and
- add regression assertions that reject a return to stale 0.3.0 candidate wording.

This patch does not change Maqam's public API, policy decisions, approval semantics, evidence model, crawler behavior, source-routing behavior, dependencies, or documented security boundary.

## Required Candidate Verification

Run from one clean committed source tree:

```bash
npm ci
npm run verify
npm run benchmark:mges:conformance -- --output /outside/worktree/maqam-0.3.1-mges-conformance.json
npm run benchmark:mges:performance -- --output /outside/worktree/maqam-0.3.1-mges-performance.json
npm pack --json --ignore-scripts --pack-destination /outside/worktree/artifacts
```

Generate the MGES outputs and tarball outside the repository first. After a clean run, raw MGES JSON may be copied unchanged into a separate evidence-only commit that does not alter fingerprinted source; the tarball must remain outside the repository. Record the exact full source commit, tarball filename, positive byte size, independent SHA-256, npm SHA-512 integrity, packed-file list, and clean-tree state. The version and lockfile metadata changed, so the candidate must not reuse a prior version's benchmark identity or artifact approval.

## Candidate Evidence Snapshot

The implementation phase merged as exact clean `main` commit `513a7a0bf3711e26ca0e82b4ae1a1663553cc345`. The preparatory clean install was verified with npm `12.0.1`; MGES records Node `24.15.0`, Windows x64, and an AMD Ryzen 7 4800H. This evidence-only follow-up changes raw results, documentation, and tests, not the implementation, benchmark programs, or lockfile files recorded by the source fingerprints.

- [Performance candidate](../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b.json): 30 fresh-process observations, `139.173 microseconds/call` governed median, `137.898-142.079` 95% bootstrap interval, `7.476%` governed coefficient of variation, and all four required project checks passed. SHA-256: `2a6b0238b7385629677a7952d2d5e4506b8f063be36ca538f5d965caec65715a`.
- [Conformance candidate](../benchmarks/results/2026-07-19-mges-conformance-windows-node24-main-513a7a0b.json): `14/14` named deterministic fixtures passed. SHA-256: `3bd24204b519b82f3f52d40e609a33808e8667b4b1714a67464e4c5237a913df`.

Three earlier clean-main performance runs remain in the repository as transparent `REVIEW` records. Their governed coefficients of variation exceeded the predeclared 10% stability gate; no observations, source files, or thresholds were removed or changed:

| Run | Governed median | Governed CV | Status | SHA-256 |
| --- | ---: | ---: | --- | --- |
| [Review attempt 1](../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b-review-attempt1.json) | 158.390 microseconds | 14.223% | `REVIEW` | `09c6e3d34581529bd57d3c9a837b8afdcee30c396f13ec84d1202156b6f5d843` |
| [Review attempt 2](../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b-review-attempt2.json) | 158.644 microseconds | 14.860% | `REVIEW` | `f8a0af8e0955cc5ddb62e18f33605d1711f2b42524cbb5b8ae2ca7f6389c2a31` |
| [Review attempt 3](../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b-review-attempt3.json) | 160.523 microseconds | 12.886% | `REVIEW` | `1ebafcc6c74bcc31cd40a545802aa06e6c3d7b07c997db1c704cecbc79660950` |

The passing fourth run is the candidate, not proof of global performance. MGES is a local in-process regression profile; it excludes model, network, storage, human-review, and concurrency latency and is not a competitor benchmark, SLA, security score, compliance result, or certification. The public 0.3.0 evidence remains unchanged until 0.3.1 is actually published and independently verified.

## Publication Boundary

Before any publish action:

- prove `maqam@0.3.1` is absent from npm;
- use the successful clean-main CI candidate manifest as the Linux/npm-12 artifact identity;
- obtain explicit maintainer approval for the exact 0.3.1 artifact and full commit;
- publish only through the protected npm Trusted Publishing workflow; and
- do not create `v0.3.1` or announce the release until npm version, `gitHead`, integrity, provenance, downloaded tarball SHA-256, signatures, and a clean install are verified.

Preparation of this candidate does not authorize publication, deployment, tagging, or a GitHub release.

## Historical Evidence

The 0.3.0 npm artifact, `v0.3.0` release, integrity, source commit, and MGES records remain evidence for 0.3.0. The 0.2.4 media, transcripts, and benchmark records remain evidence for 0.2.4. Neither version's evidence may be silently relabeled as 0.3.1 evidence.
