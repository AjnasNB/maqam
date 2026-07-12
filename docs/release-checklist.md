# Maqam Release Checklist

Use this checklist before publishing any Maqam release.

## Release Candidate

- Package: `maqam`
- Version: `0.2.0`
- License: MIT
- Registry target: npm public registry
- Publish command: `npm publish --access public`

## Required Checks

Run these commands from the repository root:

```bash
npm ci
npm test
npm pack --dry-run
```

Expected result:

- `npm ci` installs from `package-lock.json` without dependency resolution changes.
- `npm test` reports all tests passing with zero failures.
- `npm pack --dry-run` includes source, type declarations, examples, app assets, docs, README, CHANGELOG, SECURITY, release checklist, license audit, package metadata, and LICENSE.

## Manual Review

Confirm before release:

- README explains install, CLI usage, SDK usage, safety principles, and publish gate.
- `docs/usage.md` documents runtime, policy, evidence, skills, CLI workers, crawler, and console flows.
- `docs/provenance-and-licenses.md` documents inspiration boundaries and third-party license handling.
- `CHANGELOG.md` contains the exact release notes for the version being published.
- `SECURITY.md`, `RELEASE_CHECKLIST.md`, and `LICENSE_AUDIT.md` are present at the package root.
- `examples/governed-release.mjs` demonstrates `ApprovalQueue` and `createReleaseGateReport`.
- No secrets, private credentials, generated tokens, or local-only files are included in the package tarball.
- No third-party project branding, copied examples, copied docs, or pasted source code are included.

## Approval Gate

Publishing requires explicit user approval for the exact package and version in the current run. Approval must name `maqam@0.2.0` or a later reviewed version.

Do not publish automatically from an automation, background run, scheduled job, or release-preparation task.

## Publish Steps After Approval

```bash
npm login
npm publish --access public
npm view maqam version
```

After publishing, create a GitHub release with the `0.2.0` changelog entry and attach the npm package URL.
