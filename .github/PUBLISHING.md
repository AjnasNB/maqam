# Publishing Maqam through GitHub

Maqam uses npm Trusted Publishing so GitHub Actions can publish with a short-lived OIDC identity. Do not store an npm write token in GitHub and do not paste an npm token or OTP into an issue, pull request, workflow input, log, or chat.

## One-time GitHub setup

Create an environment named `npm-publish` under **Repository Settings > Environments** before dispatching the workflow. Configure:

- Required reviewer: the Maqam maintainer who will inspect the verification summary
- Prevent self-review: off only while Maqam has a single maintainer
- Deployment branches and tags: selected branch `main` only
- Administrator bypass: disabled when the repository plan exposes that control

The environment is a release gate. A workflow reference alone can create an unprotected environment, so do not run the publisher until these protection rules are visible in GitHub.

## One-time npm setup

Open `https://www.npmjs.com/package/maqam/access` while signed in as an npm package owner. In **Trusted Publisher**, choose **GitHub Actions** and enter these exact, case-sensitive values:

- Organization or user: `AjnasNB`
- Repository: `maqam`
- Workflow filename: `publish-npm.yml`
- Environment name: `npm-publish`
- Allowed action: `npm publish`

Save the publisher. npm validates the OIDC identity when the workflow actually publishes, so recheck every value before running it.

Revoke any npm token that has appeared in chat, logs, screenshots, or shell history. After the first successful trusted publish, set the package's **Publishing access** to **Require two-factor authentication and disallow tokens**. Trusted Publishing continues to work through short-lived OIDC credentials.

## Publishing a reviewed version

1. Confirm the candidate commit is on `main` and CI plus CodeQL are green.
2. Open the successful main CI run's `maqam-npm-candidate-COMMIT` artifact. Review `release-manifest.json`; it was packed on Linux with Node `24.18.0` and npm `12.0.1` and expires after one day. This job does not publish.
3. Open **Actions > Publish npm (trusted) > Run workflow** and select `main`.
4. Enter the manifest's full `gitCommit`, exact version, tarball byte size, SHA-256, and integrity values.
5. Enter the confirmation `publish maqam@VERSION`.
6. Wait for **Verify approved artifact** to pass.
7. Review the verification summary and confirm it still names the approved commit and artifact, then approve the `npm-publish` environment deployment.
8. Wait for the publish job to verify npm version, `gitHead`, byte size, integrity, downloaded tarball SHA-256, signatures, and provenance.
9. Only after that job succeeds, create the matching annotated Git tag and GitHub Release.

The workflow deliberately refuses non-`main` dispatches, a dispatch SHA different from the approved full commit, malformed confirmation values, a non-positive byte size, an already-published version, package identity changes, tarball size or checksum changes, registry integrity changes, and `gitHead` mismatches.

## Emergency local fallback

Use local publishing only if npm Trusted Publishing is unavailable. It requires an authenticated npm owner session and a fresh OTP or a newly created granular access token explicitly permitted to bypass 2FA. Never reuse a token exposed in chat or logs. Run the complete verification suite, publish from the reviewed clean commit, and verify registry `gitHead`, integrity, and the downloaded tarball before creating a GitHub Release.
