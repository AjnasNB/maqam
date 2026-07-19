# Maqam 0.3.1 Release Record

**Lifecycle:** unpublished source candidate. Maqam 0.3.1 becomes public only when the live npm record, provenance, integrity, registry `gitHead`, matching `v0.3.1` tag, and GitHub release identify the same reviewed artifact. Package metadata, a branch, a local tarball, benchmark JSON, or this document alone is not publication proof. Maqam 0.3.0 remains the previous verified public release at this snapshot.

## Purpose

Version 0.3.1 prepares a guarded execution-verification API and a structural governed-browser boundary while correcting documentation that remained stale after 0.3.0 publication. It does not bundle a browser engine, model, browser profile, login flow, credential store, or third-party agent runtime.

## Candidate Scope

- expose `ToolGateway.registerGuardedTool()` with an unforgeable live-dispatch verifier for public guarded handlers while keeping Maqam's internal pre-approval validator private;
- add `registerGovernedBrowserTools()` for bounded observe, preview, apply, and submit operations around a host-owned driver;
- bind write plans to the issuing adapter instance and run with an opaque preview token, exact phase approval, exact target revision, exact request origins, one dispatch, and post-action observation;
- keep raw values, selectors, scripts, cookies, credentials, external protocols, downloads, filesystem reads or writes, file-picker actions, clipboard reads or writes, permission prompts, print dialogs, and modal dialogs outside the modeled browser operation surface;
- require the host driver to block prohibited effects before dispatch and return an explicit all-false effects attestation that Maqam validates after dispatch;
- synchronize the packaged README, security guidance, release checklist, consumer types, website, package metadata, and release records; and
- preserve prior release media and benchmark records under their original historical identities.

This candidate changes the public TypeScript and JavaScript API and the documented security boundary. It does not claim operating-system isolation, browser-driver trust, rollback, durable cross-instance plan tokens, unrestricted web access, or equivalent coverage to a general browser-agent product.

## Required Final Verification

Run from one clean committed source tree after all implementation and documentation changes are merged:

```bash
npm ci
npm run verify
npm run benchmark:mges:conformance -- --output /outside/worktree/maqam-0.3.1-mges-conformance.json
npm run benchmark:mges:performance -- --output /outside/worktree/maqam-0.3.1-mges-performance.json
npm pack --json --ignore-scripts --pack-destination /outside/worktree/artifacts
```

Generate MGES output and the tarball outside the repository. Record the exact full source commit, clean-tree state, Node and npm versions, operating system, tarball filename, positive byte size, independent SHA-256, npm SHA-512 integrity, and packed-file list. Compile a clean TypeScript consumer from that exact tarball and inspect its root exports. Raw MGES JSON may then be copied unchanged into a separate evidence-only commit that does not alter fingerprinted source; the tarball must remain outside the repository.

Any source, test, documentation, package, lockfile, benchmark program, or fingerprint input change invalidates the final candidate identity and requires a new clean run. Do not update expected MGES source fingerprints merely to make a changed tree pass; generate them from the final reviewed clean commit through the documented evidence procedure.

## Current Evidence Status

No final 0.3.1 artifact or MGES record exists for the guarded-tool and governed-browser source described above. Final commit, tarball hashes, npm integrity, packed-file list, and benchmark results are intentionally not invented in this document. They remain release gates.

The following files were produced for the earlier metadata-only candidate at commit `513a7a0bf3711e26ca0e82b4ae1a1663553cc345`. They are retained as transparent, superseded historical candidate evidence and must not be cited as proof of the current source or a public 0.3.1 release:

- [Superseded performance candidate](../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b.json), SHA-256 `2a6b0238b7385629677a7952d2d5e4506b8f063be36ca538f5d965caec65715a`.
- [Superseded conformance candidate](../benchmarks/results/2026-07-19-mges-conformance-windows-node24-main-513a7a0b.json), SHA-256 `3bd24204b519b82f3f52d40e609a33808e8667b4b1714a67464e4c5237a913df`.
- [Superseded review attempt 1](../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b-review-attempt1.json), SHA-256 `09c6e3d34581529bd57d3c9a837b8afdcee30c396f13ec84d1202156b6f5d843`.
- [Superseded review attempt 2](../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b-review-attempt2.json), SHA-256 `f8a0af8e0955cc5ddb62e18f33605d1711f2b42524cbb5b8ae2ca7f6389c2a31`.
- [Superseded review attempt 3](../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b-review-attempt3.json), SHA-256 `1ebafcc6c74bcc31cd40a545802aa06e6c3d7b07c997db1c704cecbc79660950`.

MGES is a local in-process regression profile. It excludes model, network, storage, browser, human-review, and concurrency latency and is not a competitor benchmark, SLA, security score, compliance result, or certification.

## Publication Boundary

Before any publish action:

- prove `maqam@0.3.1` is absent from npm;
- complete final review and all clean-source checks, including the governed-browser tests, packed consumer compile, website check, audit, and MGES gates;
- obtain explicit maintainer approval for the exact full commit and exact packed artifact identity;
- publish only through the protected npm Trusted Publishing workflow; and
- do not create `v0.3.1` or announce the release until npm version, registry `gitHead`, integrity, provenance, downloaded tarball SHA-256, signatures, and a clean install are verified.

Preparation of this candidate does not authorize publication, deployment, tagging, a GitHub release, or an announcement.

## Historical Evidence

The 0.3.0 npm artifact, `v0.3.0` release, integrity, source commit, and MGES records remain evidence for 0.3.0. The 0.2.4 media, transcripts, and benchmark records remain evidence for 0.2.4. The superseded 0.3.1 candidate records above remain evidence only for their exact earlier commit. None may be silently relabeled as final 0.3.1 evidence.
