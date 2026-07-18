# Maqam Release Checklist

Use this checklist before publishing any Maqam release.

## Release Candidate

- Package: `maqam`
- Version: `0.3.0`
- License: MIT
- Registry target: npm public registry
- Publish command: `npm publish --access public --ignore-scripts --provenance`
- Artifact identity: exact `.tgz` filename, positive byte size, canonical npm SHA-512 integrity, independent SHA-256, and full Git commit

## Required Checks

Run these commands from the repository root:

```bash
npm ci
npm test
npm run test:consumer-types
npm run benchmark:mges:conformance
npm run benchmark:mges:performance
npm pack --dry-run
npm pack --json --ignore-scripts
npm audit --omit=dev
```

Expected result:

- `npm ci` installs from `package-lock.json` without dependency resolution changes.
- `npm test` reports all tests passing with zero failures.
- `npm run test:consumer-types` packs the candidate into a temporary clean project and strictly compiles both public entry points without manually installing Node types in the consumer.
- `npm pack --dry-run` includes source, root and server declarations, examples, required console files, docs, README, CHANGELOG, SECURITY, release checklist, license audit, package metadata, and LICENSE.
- Only the console HTML, JavaScript, CSS, and SVG logo ship from `app/`; large brand/presentation PNGs remain repository-only.
- `npm audit --omit=dev` reports no known production dependency vulnerabilities.
- Governed-source allow/deny, fatal-no-fallback, availability-fallback, authenticated opt-in, doctor, normalized-document, RSS/Atom, feed-crawl, and crawler-CLI fixtures pass on Node.js 20, 22, and 24.
- MGES was rerun because the lockfile and governance-path source fingerprints changed. Historical 0.2.4 results remain labeled as 0.2.4 evidence.

## Manual Review

Confirm before release:

- README explains install, CLI usage, SDK usage, safety principles, and publish gate.
- `docs/usage.md` documents runtime, policy, evidence, skills, CLI workers, crawler, and console flows.
- `docs/governed-sources.md`, `docs/migration-0.3.md`, and `docs/release-0.3.0.md` match the public exports and exact candidate boundary.
- `docs/provenance-and-licenses.md` documents inspiration boundaries and third-party license handling.
- `CHANGELOG.md` contains the exact release notes for the version being published.
- `SECURITY.md`, `RELEASE_CHECKLIST.md`, and `LICENSE_AUDIT.md` are present at the package root.
- `examples/governed-release.mjs` demonstrates `ApprovalQueue` and `createReleaseGateReport`.
- `examples/governed-sources.mjs` routes one deterministic offline source through a registered gateway tool.
- No secrets, private credentials, generated tokens, or local-only files are included in the package tarball.
- No third-party project branding, copied examples, copied docs, or pasted source code are included.
- The exact tarball filename, positive size, integrity, and full Git commit have been captured, and the reviewed worktree is clean.

## Approval Gate

Publishing requires explicit maintainer approval for the exact package, version, registry, command, artifact identity, and Git commit. Approval must name `maqam@0.3.0`, use the `publish:npm` action, and be enforced by the protected trusted-publishing environment.

When represented as an `ApprovalQueue` record, the subject must exactly match:

```js
{
  packageName: "maqam",
  version: "0.3.0",
  registry: "https://registry.npmjs.org/",
  publishCommand: "npm publish --access public --ignore-scripts --provenance",
  artifactFilename: "maqam-0.3.0.tgz",
  artifactSizeBytes: 123456,
  artifactIntegrity: "sha512-...",
  gitCommit: "0123456789abcdef0123456789abcdef01234567"
}
```

The values above are illustrative. Record the actual packed artifact values; never approve placeholders.

Do not dispatch the trusted publishing workflow from an unattended, scheduled, or release-preparation task. After exact-artifact approval, the protected workflow may publish only the matching artifact by OIDC; never pass a reusable npm token or OTP as workflow input.

## Publish Steps After Approval

```bash
npm publish --access public --ignore-scripts --provenance
npm view maqam@0.3.0 version dist.integrity gitHead _resolved _from
npx -y maqam@0.3.0 demo approval
```

Run the publish command only inside the protected trusted-publishing job for the reviewed, clean, pushed commit and do not publish by passing a local `.tgz` path. After publishing, require registry `gitHead` to match the approved commit, verify version, integrity, and provenance, and confirm `_resolved` and `_from` expose no local filesystem path. Only then create annotated tag `v0.3.0` and the GitHub release with the npm package URL.
