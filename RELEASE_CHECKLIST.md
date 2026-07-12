# Maqam Release Checklist

Use this root checklist as the release gate for `maqam@0.2.0`.

## Package

- Name: `maqam`
- Version: `0.2.0`
- License: MIT
- Registry: npm public registry
- Publish command after approval: `npm publish --access public`

## Verification

Run from the package root:

```bash
npm ci
npm test
npm pack --dry-run
```

Required result:

- `npm ci` installs from `package-lock.json`.
- `npm test` has zero failures.
- `npm pack --dry-run` includes `src/`, `src/index.d.ts`, `examples/`, the public files under `docs/`, `README.md`, `LICENSE`, `CHANGELOG.md`, `SECURITY.md`, `RELEASE_CHECKLIST.md`, and `LICENSE_AUDIT.md`.

## Approval Gate

Do not publish from automation. Stop after preparing evidence and request explicit user approval for `maqam@0.2.0`.

Approval must name:

- Package: `maqam`
- Version: `0.2.0`
- Target: npm public registry
- Command: `npm publish --access public`

## After Approval

```bash
npm login
npm publish --access public
npm view maqam version
```

Record the published npm version and create a matching GitHub release only after the npm publish succeeds.
