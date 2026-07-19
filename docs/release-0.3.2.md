# Maqam 0.3.2 Release Record

**Lifecycle authority:** live-record-driven. This document describes a source candidate, not a published release. Treat 0.3.2 as public only when the [npm record](https://www.npmjs.com/package/maqam/v/0.3.2), SLSA provenance, integrity, registry `gitHead`, and matching [`v0.3.2` tag and GitHub release](https://github.com/AjnasNB/maqam/releases/tag/v0.3.2) identify the same reviewed artifact. Until then, [0.3.1](https://www.npmjs.com/package/maqam/v/0.3.1) remains the verified public release.

## Purpose

Version 0.3.2 is a release-truth patch. The 0.3.1 npm artifact is immutable and its packaged README still names ProductLoop OS 0.2.1. Repository documentation now correctly identifies the verified ProductLoop OS 0.2.2 companion release, so a new Maqam version is required for npm to carry that correction.

## Release Scope

- set the package, lockfile, CLI/version tests, clean-consumer checks, release examples, Exa MCP client identity, and trusted-publishing default to 0.3.2;
- ship the verified ProductLoop OS 0.2.2 package map in the Maqam README;
- make active install instructions conditional on matching npm and GitHub release records;
- add this release record to the packed file allowlist; and
- preserve all 0.3.1 and 0.2.4 release, benchmark, media, provenance, and artifact identities unchanged.

This patch does not change Maqam's policy, approval, evidence, crawler, browser, research, network, or credential boundaries. It does not add unrestricted internet or YouTube access, bundle a browser engine or `yt-dlp`, or claim control over calls that bypass a registered Maqam adapter.

## Required Verification

Run from one clean committed source tree after this candidate is merged:

```bash
npm install --global npm@12.0.1 --ignore-scripts
npm ci
npm run verify
npm run benchmark:mges:conformance -- --output "$MGES_OUT/maqam-0.3.2-mges-conformance.json"
npm run benchmark:mges:performance -- --output "$MGES_OUT/maqam-0.3.2-mges-performance.json"
npm pack --json --ignore-scripts --pack-destination "$ARTIFACT_OUT"
npm audit --omit=dev
```

`MGES_OUT` and `ARTIFACT_OUT` must be existing directories outside the clean worktree. The final Linux/Node 24/npm 12 candidate manifest from main CI is authoritative for the tarball filename, positive byte size, npm SHA-512 integrity, independent SHA-256, packed file list, and full Git commit. A local Windows artifact is useful verification but is not a substitute for that canonical identity.

Changing `package-lock.json` changes the MGES performance fingerprint. The published 0.3.1 MGES results therefore remain historical 0.3.1 evidence and must not be relabeled as 0.3.2 results. Record fresh 0.3.2 results only after measuring an exact clean commit; if squash merging changes that commit, follow the repository's two-phase evidence process.

## Publication Gate

Do not publish, tag, or announce 0.3.2 from a release-preparation branch. After review and clean-main verification:

1. prove `maqam@0.3.2` is absent from npm;
2. obtain explicit maintainer approval for the exact package, version, registry, publish command, tarball filename, byte size, integrity, SHA-256, and full Git commit;
3. publish only through the protected npm Trusted Publishing workflow;
4. verify registry version, `gitHead`, integrity, provenance, signatures, downloaded tarball bytes, clean install, and the exact-approval demo; and
5. create `v0.3.2` and the GitHub release only after every registry check succeeds.

The release workflow fails closed if its approved commit or artifact identity differs. It does not accept a reusable npm token or a local tarball path.

## Historical Evidence

The [0.3.1 release record](release-0.3.1.md) remains the authority for the verified 0.3.1 npm artifact and its measured-source MGES evidence. The [0.3.0 record](release-0.3.0.md) and [0.2.4 source record](release-0.2.4-candidate.md) remain evidence for those exact historical artifacts. None is 0.3.2 publication proof.
