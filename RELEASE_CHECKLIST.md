# Maqam Release Checklist

Use this root checklist as the release gate for the unpublished `maqam@0.3.1` candidate. The current public release remains 0.3.0, and historical artifacts remain evidence for their own versions only.

## Package

- Name: `maqam`
- Version: `0.3.1`
- State: unpublished candidate; package metadata is not publication proof
- License: MIT
- Registry: npm public registry
- Publish command after approval: `npm publish --access public --ignore-scripts --provenance`
- Artifact: exact `.tgz` filename, positive byte size, canonical npm SHA-512 integrity, independent SHA-256, and full 40-character Git commit

## Verification

Run from the package root:

```bash
npm install --global npm@12.0.1 --ignore-scripts
npm ci
npm test
npm run test:consumer-types
npm run test:website
npm run benchmark:mges:conformance -- --output "$MGES_OUT/maqam-mges-conformance.json"
npm run benchmark:mges:performance -- --output "$MGES_OUT/maqam-mges-performance.json"
npm pack --dry-run
npm pack --json --ignore-scripts
npm audit --omit=dev
```

`MGES_OUT` must be an existing directory outside the clean measured worktree. Run both profiles from the same clean source commit; writing the first result into that worktree would make the second result dirty.

Required result:

- `npm ci` installs from `package-lock.json`.
- `npm test` has zero failures.
- `npm run test:consumer-types` packs the candidate into a temporary clean project and strictly compiles both `maqam` and `maqam/server` without adding consumer type dependencies.
- `npm run test:website` verifies release truth, internal links, accessibility structure, local assets, and Worker media semantics.
- Governed-source allow/deny, fatal-no-fallback, availability-fallback, authentication opt-in, doctor, normalized-document, RSS/Atom, feed-crawl, and crawler-CLI fixtures pass on Node.js 20, 22, and 24.
- MGES conformance and performance are rerun because version, lockfile, and client metadata changed; 0.3.0 and 0.2.4 figures are not relabeled as 0.3.1 evidence.
- With squash merging enabled, use two PR phases: merge implementation first, rerun MGES from that exact clean main commit, then merge an evidence/docs/test-only PR. The measured main commit must remain an ancestor of the final release commit and no fingerprinted source may change in the evidence PR.
- `npm pack --dry-run` includes `src/`, `src/index.d.ts`, `src/maqam/server.d.ts`, `examples/`, `docs/governed-sources.md`, `docs/migration-0.3.md`, both versioned 0.3 release records, the other public docs, `README.md`, `LICENSE`, `CHANGELOG.md`, `SECURITY.md`, `RELEASE_CHECKLIST.md`, and `LICENSE_AUDIT.md`.
- The tarball includes only `app/index.html`, `app/app.js`, `app/styles.css`, and `app/assets/maqam-logo.svg` from the console; repository-only presentation PNGs are excluded.
- `npm audit --omit=dev` reports no known production dependency vulnerabilities.
- The packed artifact identity and current full Git commit are recorded before approval. The worktree is clean and the commit is pushed.
- The exact Linux/npm-12 identity is taken from the successful main CI `maqam-npm-candidate-COMMIT` manifest rather than assumed from a different local toolchain.

## Approval Gate

Do not start the trusted publishing job until the exact artifact receives explicit maintainer approval for `maqam@0.3.1` and the protected GitHub environment can enforce that approval.

Approval must name:

- Package: `maqam`
- Version: `0.3.1`
- Target: npm public registry
- Command: `npm publish --access public --ignore-scripts --provenance`
- Artifact: filename, byte size, npm integrity, independent SHA-256, and Git commit

For `createReleaseGateReport`, the approval action must be `publish:npm`. Its subject must exactly match `packageName`, `version`, `registry`, `publishCommand`, `artifactFilename`, `artifactSizeBytes`, `artifactIntegrity`, and `gitCommit`. Provenance must explicitly record `copiedThirdPartyCode: false` and the Agent Reach reference-only boundary, and every required test, clean-consumer, benchmark, audit, and pack check must pass.

## After Approval

```bash
npm publish --access public --ignore-scripts --provenance
npm view maqam@0.3.1 version dist.integrity gitHead _resolved _from
npx -y maqam@0.3.1 demo approval
```

The protected GitHub workflow should publish with npm trusted OIDC provenance from the reviewed, clean, pushed commit; do not pass a local `.tgz` path or paste a reusable npm token/OTP into workflow input. Require registry `gitHead` to equal the approved commit and confirm `_resolved` and `_from` are absent or contain no local filesystem path. Record the published version and integrity, then create annotated tag `v0.3.1` and the GitHub release only after npm verification succeeds.
