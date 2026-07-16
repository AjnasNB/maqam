# Maqam Release Checklist

Use this root checklist as the release gate for `maqam@0.2.3`.

## Package

- Name: `maqam`
- Version: `0.2.3`
- License: MIT
- Registry: npm public registry
- Publish command after approval: `npm publish --access public`
- Artifact: exact `.tgz` filename, positive byte size, SHA-256 or canonical npm SHA-512 integrity, and full 40-character Git commit

## Verification

Run from the package root:

```bash
npm ci
npm test
npm run test:consumer-types
npm pack --dry-run
npm audit --omit=dev
```

Required result:

- `npm ci` installs from `package-lock.json`.
- `npm test` has zero failures.
- `npm run test:consumer-types` packs the candidate into a temporary clean project and strictly compiles both `maqam` and `maqam/server` without adding consumer type dependencies.
- `npm pack --dry-run` includes `src/`, `src/index.d.ts`, `src/maqam/server.d.ts`, `examples/`, the public files under `docs/`, `README.md`, `LICENSE`, `CHANGELOG.md`, `SECURITY.md`, `RELEASE_CHECKLIST.md`, and `LICENSE_AUDIT.md`.
- The tarball includes only `app/index.html`, `app/app.js`, `app/styles.css`, and `app/assets/maqam-logo.svg` from the console; repository-only presentation PNGs are excluded.
- `npm audit --omit=dev` reports no known production dependency vulnerabilities.
- The packed artifact identity and current full Git commit are recorded before approval. The worktree is clean and the commit is pushed.

## Approval Gate

Do not publish from automation. Stop after preparing evidence and request explicit user approval for `maqam@0.2.3`.

Approval must name:

- Package: `maqam`
- Version: `0.2.3`
- Target: npm public registry
- Command: `npm publish --access public`
- Artifact: filename, byte size, integrity digest, and Git commit

For `createReleaseGateReport`, the approval action must be `publish:npm`. Its subject must exactly match `packageName`, `version`, `registry`, `publishCommand`, `artifactFilename`, `artifactSizeBytes`, `artifactIntegrity`, and `gitCommit`. Provenance must explicitly record `copiedThirdPartyCode: false`, and the exact `npm test`, `npm run test:consumer-types`, and `npm pack --dry-run` checks must pass.

## After Approval

```bash
npm publish --access public
npm view maqam@0.2.3 version dist.integrity gitHead _resolved _from
```

Run `npm publish --access public` from the reviewed, clean, committed repository directory; do not pass a local `.tgz` path. Use an authenticated npm session or a short-lived release token without writing credentials into the repository, shell history, package metadata, logs, or approval evidence. Require registry `gitHead` to equal the approved commit and confirm `_resolved` and `_from` are absent or contain no local filesystem path. Record the published version and integrity, then create a matching GitHub release only after npm verification succeeds.
