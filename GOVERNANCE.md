# Maqam project governance

Maqam is an open-source project maintained by AjnasNB. Development is public, but repository write and release authority remain intentionally narrow.

## Roles

### Users

Users install Maqam, report reproducible problems, ask questions, and propose use cases.

### Contributors

Contributors work through forks or repository branches and submit pull requests. Opening a pull request does not grant merge or release authority.

### Maintainers

Maintainers triage issues, review pull requests, protect security boundaries, decide roadmap scope, merge accepted changes, and manage releases. The current owner-maintainer is `@AjnasNB`.

## Decision process

Routine changes use review discussion and maintainer judgment. Larger changes should begin with a GitHub Discussion or design issue describing:

- the problem;
- the proposed public contract;
- security and compatibility consequences;
- alternatives considered;
- test strategy; and
- migration or rollback plan.

The maintainer makes the final merge decision. Lack of response is not approval.

## Merge policy

- Changes enter `main` through reviewed pull requests whenever practical.
- CI must pass on supported Node.js versions.
- Security-sensitive changes require focused regression tests.
- Public API changes require declarations and clean-consumer tests.
- Documentation-only changes still require link and claim review.
- Maintainers may use direct commits for an urgent security fix or release repair, followed by public evidence and changelog updates.

External contributors cannot merge directly. GitHub permissions, CODEOWNERS, CI, and maintainer review enforce this boundary.

## Release authority

Only a maintainer may publish npm packages, create release tags, or attach official release artifacts. Each npm release requires review of the exact package name, version, registry, publish command, tarball filename, byte size, integrity digest, and full Git commit before publication.

Release tags must identify the source used for the public package. Registry metadata and public installation are verified before a GitHub Release is marked complete.

## Security response

Security reports follow [SECURITY.md](SECURITY.md), not public issues. A maintainer may temporarily restrict details, prepare a private fix, and publish a coordinated advisory and release.

## Changes to governance

Governance changes use a pull request and require explicit maintainer approval. The current file in `main` is authoritative.
