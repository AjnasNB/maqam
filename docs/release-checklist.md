# Maqam Release Checklist

Use this checklist before publishing any Maqam release.

## Release Candidate

- Package: `maqam`
- Version: `0.2.3`
- License: MIT
- Registry target: npm public registry
- Publish command: `npm publish --access public`
- Artifact identity: exact `.tgz` filename, positive byte size, SHA-256 or canonical npm SHA-512 integrity, and full Git commit

## Required Checks

Run these commands from the repository root:

```bash
npm ci
npm test
npm run test:consumer-types
npm pack --dry-run
npm audit --omit=dev
```

Expected result:

- `npm ci` installs from `package-lock.json` without dependency resolution changes.
- `npm test` reports all tests passing with zero failures.
- `npm run test:consumer-types` packs the candidate into a temporary clean project and strictly compiles both public entry points without manually installing Node types in the consumer.
- `npm pack --dry-run` includes source, root and server declarations, examples, required console files, docs, README, CHANGELOG, SECURITY, release checklist, license audit, package metadata, and LICENSE.
- Only the console HTML, JavaScript, CSS, and SVG logo ship from `app/`; large brand/presentation PNGs remain repository-only.
- `npm audit --omit=dev` reports no known production dependency vulnerabilities.

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
- The exact tarball filename, positive size, integrity, and full Git commit have been captured, and the reviewed worktree is clean.

## Approval Gate

Publishing requires explicit user approval for the exact package, version, registry, command, artifact identity, and Git commit in the current run. Approval must name `maqam@0.2.3` or a later reviewed version and use the `publish:npm` action.

When represented as an `ApprovalQueue` record, the subject must exactly match:

```js
{
  packageName: "maqam",
  version: "0.2.3",
  registry: "https://registry.npmjs.org/",
  publishCommand: "npm publish --access public",
  artifactFilename: "maqam-0.2.3.tgz",
  artifactSizeBytes: 123456,
  artifactIntegrity: "sha512-...",
  gitCommit: "0123456789abcdef0123456789abcdef01234567"
}
```

The values above are illustrative. Record the actual packed artifact values; never approve placeholders.

Do not publish automatically from an automation, background run, scheduled job, or release-preparation task.

## Publish Steps After Approval

```bash
npm publish --access public
npm view maqam@0.2.3 version dist.integrity gitHead _resolved _from
```

Run the publish command from the reviewed, clean, committed repository directory and do not publish by passing a local `.tgz` path. Use an authenticated npm session or short-lived release token without storing credentials in repository files, shell history, logs, package metadata, or evidence. After publishing, require registry `gitHead` to match the approved commit, verify version and integrity, and confirm `_resolved` and `_from` expose no local filesystem path. Only then create the `0.2.3` GitHub release with the npm package URL.
