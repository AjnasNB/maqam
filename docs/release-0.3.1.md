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

Pending the required two-phase sequence. Merge the implementation first, measure that exact clean main commit, and add the raw performance and conformance outputs in a separate evidence-only pull request without changing fingerprinted source. Branch-only measurements are diagnostic and are not release evidence because squash merging does not preserve their measured commit in main ancestry. The public 0.3.0 evidence remains unchanged until the clean-main follow-up lands.

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
