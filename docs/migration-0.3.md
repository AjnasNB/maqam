# Migrating To Maqam 0.3

Maqam 0.3 adds governed source routing, normalized research documents, offline RSS/Atom parsing, feed-aware crawling, and a safer crawler CLI. The exact-approval and `ToolGateway` model from 0.2 remains the enforcement center.

## Before You Upgrade

- Require a maintained Node.js 22, 24, or 26 release.
- Read the [Governed Sources guide](governed-sources.md).
- Run the full test and clean-consumer checks against your adapters.
- Verify the public [`maqam@0.3.0`](https://www.npmjs.com/package/maqam/v/0.3.0) artifact, provenance, integrity, registry `gitHead`, and matching [`v0.3.0` GitHub release](https://github.com/AjnasNB/maqam/releases/tag/v0.3.0), then update the pinned dependency from 0.2.4.

## Crawler CLI: Replace `--all-origins`

`--all-origins` is removed and now fails with a usage error. Name every additional origin explicitly:

```bash
# 0.2: broad discovered-origin traversal
maqam-crawl https://docs.example.com --all-origins

# 0.3: exact cross-origin scope
maqam-crawl https://docs.example.com \
  --allowed-origin https://cdn.example.com \
  --allowed-origin https://status.example.com
```

Repeat `--allowed-origin` for each permitted HTTP(S) origin. Redirects and DNS results are still validated hop by hop.

## Set Explicit Crawl Budgets

The CLI now exposes request, depth, byte, duration, retry, feed, and failure-reporting controls:

```bash
maqam-crawl https://docs.example.com \
  --max-pages 50 \
  --max-requests 120 \
  --max-depth 4 \
  --max-bytes 3145728 \
  --max-duration 120000 \
  --max-retries 1 \
  --detailed \
  --stats \
  --fail-on-error
```

`--detailed` emits `{ pages, failures, stats }`. `--stats` writes statistics to stderr. `--fail-on-error` exits with status 2 when non-fatal crawl failures are present. `--detailed` and `--jsonl` are mutually exclusive.

## Enable Feed Discovery Explicitly

Feed discovery is opt-in:

```bash
maqam-crawl https://example.com \
  --feeds \
  --max-feed-links 10 \
  --max-feed-items 50
```

HTML results can expose discovered feed links. RSS and Atom responses are parsed into bounded feed records. Cross-origin feeds still require exact origin permission.

## Route Sources Through ToolGateway

Do not call a source adapter directly and describe the result as governed. Bind the registry to a caller backed by the gateway:

```js
const toolCaller = defineResearchToolCaller({
  call: gateway.call.bind(gateway)
});

const sources = new ResearchSourceRegistry({
  adapters,
  toolCaller
});

await sources.route({
  channel: "research",
  input: { query: "release integrity" }
}, { runId: "research_1" });
```

The adapter handler must already be registered at `adapter.toolName`. `route()` now fails closed when no `toolCaller` exists. Use `routeUngoverned()` only when the bypass is deliberate and clearly labeled; it does not apply policy, approval, call ceilings, or trace capture.

## Authenticated Sources Require Opt-In

Adapters with `authentication: "required"` will not run unless the route request contains:

```js
{ allowAuthenticated: true }
```

This does not provide credentials. Continue to construct and authenticate provider clients in trusted host code. Do not put tokens, cookies, or session data into route inputs.

## Normalize Existing Adapter Output

Source adapter handlers must return an array of document-like objects. Each item needs an absolute HTTP(S) `uri` and non-empty `text` or `markdown`. Maqam validates, detaches, freezes, and stamps the selected adapter/channel provenance.

If an existing integration returns provider-specific records, map them before returning:

```js
return providerResults.map((item) => ({
  id: item.id,
  uri: item.url,
  title: item.title ?? null,
  text: item.body,
  contentType: "text/plain",
  authors: item.author ? [item.author] : [],
  citations: [{ uri: item.url, title: item.title ?? null }],
  metadata: { providerRecordId: item.id }
}));
```

## Add Offline Health Checks Carefully

Adapter `check()` functions should inspect local configuration or deterministic fixtures. `doctor()` enforces timeouts and isolates errors, but cannot sandbox arbitrary host code or prove that a custom check performs no network request.

Do not use a doctor check to authenticate, mutate provider state, import browser credentials, or access private records.

## RSS/Atom Reader Boundary

`parseRssAtom()` has no network access. `createRssAtomResearchAdapter()` and `createRssAtomSourceAdapter()` require a host-supplied reader and have no implicit `fetch` fallback. Supply a bounded, policy-reviewed reader and register the resulting handler through `ToolGateway` for governed use.

## Rebuild Release-Gate Evidence

Maqam 0.3 makes `createReleaseGateReport()` intentionally stricter. A 0.2 release report is not reusable. Rebuild it with:

- artifact `packageName` and `version` values that exactly match the release;
- the tarball's independent lowercase `sha256` hex digest and its separate canonical npm `sha512-...` `integrity` value;
- the exact tarball filename, positive byte size, and full lowercase 40-character Git commit;
- passing entries for `npm test`, `npm run test:consumer-types`, `npm run test:website`, `npm audit --omit=dev`, `npm pack --json --ignore-scripts`, and both MGES profiles, with every entry naming the artifact commit in `gitCommit`;
- at least one `inspectedProjects` record with a name, HTTPS URL, exact full Git revision, observed license, and inspection use; and
- a `publish:npm` approval that also binds `artifactSha256` in addition to the existing package, version, registry, command, filename, size, integrity, and commit fields.

The old practice of putting either a SHA-256 or an npm integrity value into one `artifact.integrity` field is no longer accepted. The gate validates the supplied record; the trusted release workflow must still run the checks and independently recompute both digests.

## Verify The Upgrade

```bash
npm test
npm run test:consumer-types
npm run test:website
npm audit --omit=dev
npm pack --json --ignore-scripts
npm run benchmark:mges:conformance
npm run benchmark:mges:performance
```

Also add application tests proving:

- one allowed source call dispatches exactly once;
- a policy-denied call dispatches zero times;
- authenticated adapters require explicit opt-in;
- fatal approval, policy, and security failures do not fall through;
- ordinary source unavailability follows the intended preference order; and
- UI output treats every source field as untrusted text.
