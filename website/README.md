# Maqamagent static site

This directory contains the open-source static site for `maqamagent.com`. It uses semantic HTML, native CSS, and small progressive-enhancement JavaScript. There are no external runtime dependencies, analytics tags, cookies, or form submissions.

## Local checks

Use Node.js 22 or newer.

```sh
cd website
npm ci
npm run check
```

The check validates the static information architecture, security headers,
redirect behavior, accessibility contracts, fixed media routes, and range
request semantics without requiring production credentials.

Public media paths are fixed in `src/index.js`; arbitrary storage keys are never
accepted from the URL. The test suite exercises media behavior through an
in-memory binding.

Production hosting, account identifiers, routes, storage names, credentials, and
environment configuration are intentionally maintained outside the public
repository. Public CI verifies the portable website artifact without deploying
it.

## Content boundaries

- Maqam is the focused TypeScript governance boundary.
- ProductLoop OS is the composed package family.
- External SDK examples are labeled as host integration sketches when they are not shipped or tested by this repository.
- MGES is a project-defined regression suite, not a standard, certification, security score, competitor ranking, capacity benchmark, or SLA.

The public information architecture includes the runnable quickstart, the exact package atlas, a category-based comparison, the public roadmap, unified release notes, security and integration documentation, benchmark methodology, technical articles, and community contribution paths. The site checker validates these internal routes together with the Worker redirect and media response semantics.
