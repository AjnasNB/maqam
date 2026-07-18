# Maqamagent static site

This directory contains the open-source static site for `maqamagent.com`. It uses semantic HTML, native CSS, and small progressive-enhancement JavaScript. There are no external runtime dependencies, analytics tags, cookies, or form submissions.

## Local checks

Use Node.js 22 or newer. Wrangler is pinned in this workspace so the local runtime supports the configured compatibility date.

```sh
cd website
npm ci
npm run check
npm run dev
```

Open `http://127.0.0.1:8791`. The Worker adds security headers and delegates static files to the `ASSETS` binding. In production, requests for `www.maqamagent.com` receive an HTTPS `308` redirect to the apex hostname while preserving the path and query string.

Release media is served from the `MEDIA` R2 binding. Public paths are fixed in `src/index.js`; arbitrary bucket keys are never accepted from the URL. To test locally, seed Wrangler's local R2 store with the release files before opening a media route.

```sh
npx wrangler r2 object put maqam-media/releases/maqam/v0.2.4/maqam-exact-approval-demo.mp4 --file ../demo/remotion/out/maqam-exact-approval-demo.mp4 --content-type video/mp4 --local
```

## Dry run and deployment

The repository does not contain account IDs, route IDs, API tokens, or R2 credentials.

```sh
npm run deploy:dry
npx wrangler deploy
```

The Wrangler configuration declares `maqamagent.com` and `www.maqamagent.com` as Worker custom domains and binds the existing `maqam-media` bucket. Deployment can create domain records and certificates only in an authorized Cloudflare zone. Verify that neither hostname already has a conflicting CNAME record. Do not commit account-specific identifiers.

## GitHub to Cloudflare deployment

The `Deploy website` GitHub Actions workflow runs for changes under `website/` on `main`. It installs the pinned tools, runs the complete site contract check, creates a Wrangler dry-run artifact, and deploys only after those checks pass.

Configure these GitHub Actions values in the `AjnasNB/maqam` repository:

- Repository variable `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account that owns `maqamagent-site`.
- Repository secret `CLOUDFLARE_API_TOKEN`: a scoped token with permission to deploy this Worker, its custom domains, and the declared R2 binding.

The verification job remains credential-free. The deployment job fails closed when either value is missing, so a green workflow always means the verified artifact reached Cloudflare. Once both values exist, every verified website change on `main` is deployed automatically. Local Wrangler OAuth credentials are never copied into GitHub.

## Content boundaries

- Maqam is the focused TypeScript governance boundary.
- ProductLoop OS is the composed package family.
- External SDK examples are labeled as host integration sketches when they are not shipped or tested by this repository.
- MGES is a project-defined regression suite, not a standard, certification, security score, competitor ranking, capacity benchmark, or SLA.

The public information architecture includes the runnable quickstart, the exact package atlas, a category-based comparison, the public roadmap, unified release notes, security and integration documentation, benchmark methodology, technical articles, and community contribution paths. The site checker validates these internal routes together with the Worker redirect and media response semantics.
