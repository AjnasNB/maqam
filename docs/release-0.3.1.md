# Maqam 0.3.1 Release Record

**Lifecycle authority:** live-record-driven. Maqam 0.3.1 is public: the [npm record](https://www.npmjs.com/package/maqam/v/0.3.1), SLSA provenance, integrity, registry `gitHead`, matching [`v0.3.1` tag and GitHub release](https://github.com/AjnasNB/maqam/releases/tag/v0.3.1) identify the same reviewed artifact. Always re-check those live records rather than treating package metadata, a branch, a local tarball, benchmark JSON, or this document alone as publication proof.

## Purpose

Version 0.3.1 prepares a guarded execution-verification API and a structural governed-browser boundary while correcting documentation that remained stale after 0.3.0 publication. It does not bundle a browser engine, model, browser profile, login flow, credential store, or third-party agent runtime.

## Release Scope

- expose `ToolGateway.registerGuardedTool()` with an unforgeable live-dispatch verifier for public guarded handlers while keeping Maqam's internal pre-approval validator private;
- add `registerGovernedBrowserTools()` for bounded observe, preview, apply, and submit operations around a host-owned driver;
- bind write plans to the issuing adapter instance and run with an opaque preview token, exact phase approval, exact target revision, exact request origins, one dispatch, and post-action observation;
- keep raw values, selectors, scripts, cookies, credentials, external protocols, downloads, filesystem reads or writes, file-picker actions, clipboard reads or writes, permission prompts, print dialogs, and modal dialogs outside the modeled browser operation surface;
- require the host driver to block prohibited effects before dispatch and return an explicit all-false effects attestation that Maqam validates after dispatch;
- move active runtime support and CI to the maintained Node.js 22 LTS, 24 LTS, and 26 Current release lines, excluding end-of-life odd majors through the package engine range;
- synchronize the packaged README, security guidance, release checklist, consumer types, website, package metadata, and release records; and
- preserve prior release media and benchmark records under their original historical identities.

This release changes the public TypeScript and JavaScript API and the documented security boundary. It does not claim operating-system isolation, browser-driver trust, rollback, durable cross-instance plan tokens, unrestricted web access, or equivalent coverage to a general browser-agent product.

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

Any change to a fingerprinted implementation file, benchmark program, or `package-lock.json` invalidates the measured-source identity and requires a new clean MGES run. An evidence-only follow-up may add unchanged raw artifacts and update non-fingerprinted documentation or tests while keeping the measured commit as an ancestor. Those package-included changes still alter tarball bytes, so they require a fresh post-merge pack and candidate manifest even though they do not relabel the measured fingerprint. Do not update expected MGES fingerprints merely to make a changed tree pass.

## Published Artifact and Evidence

Final clean-main MGES candidate evidence now exists for the guarded-tool and governed-browser source at exact commit `a96413c4da5f27dc31b9772996e70faab0b38382`. The [successful evidence workflow](https://github.com/AjnasNB/maqam/actions/runs/29696564034) checked out that commit on a GitHub-hosted Ubuntu 24.04 x64 runner, installed pinned Node `24.18.0`, verified a clean tree, generated both profiles outside the checkout, validated their commit binding and digests, uploaded them with the Node 24-based `actions/upload-artifact@v7.0.1` runtime, and enforced the unchanged publication criteria. The run completed with zero job annotations.

- [Final candidate performance JSON](../benchmarks/results/2026-07-19-mges-performance-ubuntu24-node24-main-a96413c4.json), SHA-256 `977f9fcd2ef447840cd78d0e4c04ae937d8049644d3a027d52d6ff59a61b3d57`: 30 observations, `129.849 microseconds/call` governed median, `129.539-130.648` 95% bootstrap interval for the sample median, `1.111%` governed coefficient of variation, and every required project criterion passed.
- [Final candidate conformance JSON](../benchmarks/results/2026-07-19-mges-conformance-ubuntu24-node24-main-a96413c4.json), SHA-256 `44b78de19625ba6337bad7508ffafba938a613c57895f3c55c5fd2f6eeb5675a`: `14/14` named project-defined fixtures passed.
- [Digest manifest](../benchmarks/results/2026-07-19-mges-evidence-manifest-ubuntu24-node24-main-a96413c4.json), SHA-256 `4b6d26a0f303c312124685cfa8ea0e257caf09e7f07db7d7bb9298301d4dd974`: binds both raw filenames and SHA-256 digests to the exact commit, clean-checkout state, runtime, and runner class.

These measured-source regression records are not publication proof by themselves. Publication was independently verified against the post-merge CI candidate and the downloaded registry artifact: `maqam-0.3.1.tgz`, 346105 bytes, SHA-256 `5c6357eefd431b1de1c03d8106e2cc63e2ddfe6d87511767dc47e991916d5e02`, npm integrity `sha512-ZszRNaHqxoWls8bJ76ouptPwwNnbctfaolXP5PD3/pbFxj3fecvcuYmxSrnkvf2UxBUmWmzJls3hAuBAGqVIiA==`, and registry `gitHead` `2f7231db912012e37e89ec962f6d57c54c6275a3`. The registry install passed the exact-approval demo, production audit, 30-package signature audit, and 2-package attestation verification.

An earlier clean evidence run at commit `29c1b9ec0fb8af162d1b73f950851263d35a0527` also passed, but its artifact upload emitted a Node 20 action-runtime deprecation annotation. It was superseded by the action-runtime fix and the annotation-free exact-main run above and is not cited as final 0.3.1 evidence. Its raw [performance](../benchmarks/results/2026-07-19-mges-performance-ubuntu24-node24-main-29c1b9ec.json), SHA-256 `fb7d94b9b97c6aa6d7448e2e86f6ef49d854a6b4e5c568c2ac22a1f1b08663f5`, [conformance](../benchmarks/results/2026-07-19-mges-conformance-ubuntu24-node24-main-29c1b9ec.json), SHA-256 `0294028d7407facca7f9901eb9e2c9460f19d35048394b71ad68d4a778e4587c`, and [manifest](../benchmarks/results/2026-07-19-mges-evidence-manifest-ubuntu24-node24-main-29c1b9ec.json), SHA-256 `5daf94a9ad742d7bab08f70331db47e87ca4206671f509371a8699b4943b3370`, are retained unchanged alongside [workflow run 29696392506](https://github.com/AjnasNB/maqam/actions/runs/29696392506).

The following files were produced for the earlier metadata-only candidate at commit `513a7a0bf3711e26ca0e82b4ae1a1663553cc345`. They are retained as transparent, superseded historical candidate evidence and must not be cited as proof of the current source or a public 0.3.1 release:

- [Superseded performance candidate](../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b.json), SHA-256 `2a6b0238b7385629677a7952d2d5e4506b8f063be36ca538f5d965caec65715a`.
- [Superseded conformance candidate](../benchmarks/results/2026-07-19-mges-conformance-windows-node24-main-513a7a0b.json), SHA-256 `3bd24204b519b82f3f52d40e609a33808e8667b4b1714a67464e4c5237a913df`.
- [Superseded review attempt 1](../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b-review-attempt1.json), SHA-256 `09c6e3d34581529bd57d3c9a837b8afdcee30c396f13ec84d1202156b6f5d843`.
- [Superseded review attempt 2](../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b-review-attempt2.json), SHA-256 `f8a0af8e0955cc5ddb62e18f33605d1711f2b42524cbb5b8ae2ca7f6389c2a31`.
- [Superseded review attempt 3](../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b-review-attempt3.json), SHA-256 `1ebafcc6c74bcc31cd40a545802aa06e6c3d7b07c997db1c704cecbc79660950`.

MGES is a local in-process regression profile. It excludes model, network, storage, browser, human-review, and concurrency latency and is not a competitor benchmark, SLA, security score, compliance result, or certification.

## Completed Publication Gate

The release completed these gates before its tag and GitHub release were created:

- prove `maqam@0.3.1` was absent from npm before publication;
- complete final review and all clean-source checks, including the governed-browser tests, packed consumer compile, website check, audit, and MGES gates;
- obtain explicit maintainer approval for the exact full commit and exact packed artifact identity;
- publish only through the protected npm Trusted Publishing workflow; and
- do not create `v0.3.1` or announce the release until npm version, registry `gitHead`, integrity, provenance, downloaded tarball SHA-256, signatures, and a clean install are verified.

The protected workflow published through npm Trusted Publishing on 2026-07-19. Its publish step succeeded; an immediate cached registry tarball lookup briefly returned `ETARGET`, so the downloaded artifact and signatures were reverified through a fresh cache before `v0.3.1` and the GitHub release were created.

## Historical Evidence

The 0.3.0 npm artifact, `v0.3.0` release, integrity, source commit, and MGES records remain evidence for 0.3.0. The 0.2.4 media, transcripts, and benchmark records remain evidence for 0.2.4. The superseded 0.3.1 candidate records above remain evidence only for their exact earlier commit. None may be silently relabeled as final 0.3.1 evidence.
