# Governed Sources

Governed Sources is Maqam's small, provider-neutral routing layer for research backends. A host registers named source adapters, chooses a deterministic preference order, and routes each selected backend through the same `ToolGateway` boundary used for other governed tools.

It solves a specific problem: an application may have several ways to obtain material—an HTTP crawler, RSS/Atom, a licensed database, an internal index, or a provider SDK—but still needs one normalized document contract and one visible place to enforce policy, approvals, call ceilings, and trace capture.

It is not a social-platform collector, browser automation product, credential manager, or hosted crawling service.

## Enforcement Boundary

```text
host request
  -> ResearchSourceRegistry.route(...)
  -> selected adapter.toolName
  -> bound ToolCaller
  -> ToolGateway policy / approval / call ceiling / trace
  -> registered adapter handler
  -> normalized ResearchDocument[]
```

`ResearchSourceRegistry.route()` requires a `toolCaller`. Bind `ToolGateway.call` as that caller. If no caller is configured, the route fails with `RESEARCH_TOOL_CALLER_REQUIRED`; it does not silently invoke an adapter.

`routeUngoverned()` is an explicit integration escape hatch. It calls an adapter's direct `read` function and provides normalization and ordered fallback only. It bypasses `ToolGateway` policy, approvals, call ceilings, and trace capture. Do not use it for an operation you describe as governed.

Only the selected, registered tool call is governed. A provider's internal actions, authentication flow, browser session, SDK lifecycle, credential store, or network transport remain host responsibilities.

## Complete Offline Example

This fixture parses RSS without a network request. A production `readDocument` implementation should call Maqam's bounded crawler or another reviewed HTTP adapter.

```js
import {
  PolicyEngine,
  ResearchSourceRegistry,
  ToolGateway,
  createRssAtomSourceAdapter,
  defineResearchToolCaller
} from "maqam";

const feedUrl = "https://feeds.example.com/engineering.xml";
const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Engineering notes</title>
  <link>https://example.com/engineering</link>
  <description>Offline fixture</description>
  <item>
    <guid>exact-call-1</guid>
    <title>Bind approval to the exact call</title>
    <link>https://example.com/engineering/exact-call</link>
    <description>Policy runs before the registered source tool.</description>
  </item>
</channel></rss>`;

const rss = createRssAtomSourceAdapter(async ({ url }) => ({
  body: xml,
  finalUrl: url,
  status: 200,
  contentType: "application/rss+xml",
  retrievedAt: "2026-07-18T00:00:00.000Z"
}));

const gateway = new ToolGateway({
  policyEngine: new PolicyEngine({
    allowedTools: [rss.toolName],
    allowedOrigins: [new URL(feedUrl).origin],
    maxToolCalls: 2
  })
});

gateway.registerTool(rss.toolName, rss.read, {
  effects: ["network:read"],
  risk: "low"
});

const sources = new ResearchSourceRegistry({
  adapters: [rss],
  toolCaller: defineResearchToolCaller({
    call: gateway.call.bind(gateway)
  })
});

const result = await sources.route({
  channel: "rss-atom",
  input: { url: feedUrl }
}, {
  runId: "governed_sources_fixture",
  goal: {
    objective: "Read one reviewed engineering feed",
    allowedTools: [rss.toolName],
    allowedOrigins: [new URL(feedUrl).origin]
  }
});

console.log(result.documents);
console.log(gateway.getTrace());
```

The runnable version is [examples/governed-sources.mjs](../examples/governed-sources.mjs).

## Adapter Contract

Define a source with `defineResearchSourceAdapter()` or a factory such as `createRssAtomSourceAdapter()`:

```js
import { defineResearchSourceAdapter } from "maqam";

const adapter = defineResearchSourceAdapter({
  id: "internal.search.v1",
  channel: "internal-search",
  toolName: "research.internal.search",
  label: "Reviewed internal index",
  priority: 20,
  authentication: "required",
  capabilities: ["read", "search"],
  metadata: { owner: "knowledge-platform" },
  read: async (input) => [
    {
      uri: "https://knowledge.example.com/doc/42",
      title: "Runbook 42",
      text: "Normalized content returned by the host adapter.",
      contentType: "text/plain",
      citations: [{ uri: "https://knowledge.example.com/doc/42" }]
    }
  ],
  check: async () => ({
    status: "ready",
    message: "Local adapter configuration is present."
  })
});
```

Required fields:

- `id`: stable adapter identifier;
- `channel`: logical source class used by route requests;
- `toolName`: the exact `ToolGateway` registration that executes the adapter.

Optional fields describe priority, authentication, capabilities, metadata, a direct `read` implementation, and a host-supplied `check` function. Built-in checks are local and deterministic; Maqam cannot prove that an arbitrary custom check is offline. Adapter definitions intentionally have no shell command, cookie-import, implicit login, or automatic installer field.

Register the same handler under the same `toolName` before calling `route()`. The registry does not register tools on the gateway for you.

## Routing And Fallback

Adapters are ordered by ascending priority and then registration order. A registry-level preference or per-request `backendPreference` can move named adapters to the front:

```js
const sources = new ResearchSourceRegistry({
  adapters: [internal, rss, publicWeb],
  preferences: {
    research: ["internal.search.v1", "rss.news.v1"]
  },
  toolCaller
});

const result = await sources.route({
  channel: "research",
  input: { query: "release integrity" },
  backendPreference: ["rss.news.v1", "internal.search.v1"],
  allowAuthenticated: true
}, { runId: "research_42" });
```

Fallback is intentionally narrow:

- Only an explicit `ResearchSourceUnavailableError` may try the next backend and is recorded in `attempts`. Unknown exceptions, malformed output, and HTTP authorization or server failures stop the route rather than being reclassified as availability.
- policy denials, approval requirements, authentication/authorization failures, crawler security denials, robots denials, goal-scope conflicts, tool-call ceilings, and other classified security errors stop immediately;
- an adapter with `authentication: "required"` stops unless the request sets `allowAuthenticated: true` explicitly;
- `allowAuthenticated` is only an opt-in signal. It does not obtain, import, or validate credentials.

This prevents a denied high-trust backend from silently falling through to a less controlled path.

## Normalized ResearchDocument

Every successful adapter result is detached, validated, frozen, and normalized to schema version `1.0`. The stable fields include:

- source adapter id and channel;
- document id, absolute HTTP(S) URI, title, text or Markdown;
- content type, language, authors, publication and retrieval times;
- bounded JSON metadata; and
- absolute source citations.

A document must contain non-empty text or Markdown. URLs cannot contain embedded credentials. The normalized contract records provenance but does not prove that the source is trustworthy or that a claim is true.

## Web Crawler Adapter

`createWebCrawlerSourceAdapter(hostCrawler)` connects the existing bounded crawler to the source registry without adding another network implementation:

```js
import {
  PolicyEngine,
  ResearchSourceRegistry,
  ToolGateway,
  createCrawlerTool,
  createWebCrawlerSourceAdapter,
  defineResearchToolCaller
} from "maqam";

const web = createWebCrawlerSourceAdapter(createCrawlerTool({
  maxPages: 10,
  maxRequests: 80,
  maxDepth: 3,
  sameOrigin: true
}));
const gateway = new ToolGateway({
  policyEngine: new PolicyEngine({
    allowedTools: [web.toolName],
    allowedOrigins: ["https://example.com"],
    maxToolCalls: 1
  })
});
gateway.registerTool(web.toolName, web.read, {
  effects: ["network:read"],
  risk: "low"
});

const sources = new ResearchSourceRegistry({
  adapters: [web],
  toolCaller: defineResearchToolCaller({ call: gateway.call.bind(gateway) })
});
const result = await sources.route({
  channel: "web",
  input: { seeds: ["https://example.com"], maxPages: 3 }
}, {
  runId: "web_research_1",
  authorizedOrigins: ["https://example.com"]
});
```

The factory accepts only a host function and converts returned crawler pages to normalized documents. It does not create a second `fetch` path, import authentication, or weaken the crawler's DNS, redirect, robots, origin, byte, request, depth, and duration controls. An empty page result is classified as ordinary source unavailability so an explicitly registered fallback may run.

## RSS And Atom

`parseRssAtom(xml, sourceUrl, options)` is an offline RSS 2.0 and Atom parser. It:

- performs no network request;
- rejects DTD and entity declarations;
- limits input bytes, item count, text, and metadata;
- removes active or unsupported markup;
- resolves safe HTTP(S) links; and
- emits content hashes and parser provenance.

`createRssAtomResearchAdapter(readDocument, options)` wraps a host-supplied reader and returns a parsed feed. `createRssAtomSourceAdapter(readDocument, options)` additionally maps feed items to normalized source documents. Neither factory has a hidden `fetch` fallback.

The crawler CLI can also discover and parse linked feeds:

```bash
maqam-crawl https://example.com \
  --feeds \
  --max-feed-links 10 \
  --max-feed-items 50 \
  --max-requests 100 \
  --detailed
```

Cross-origin feed targets still require an exact repeatable `--allowed-origin` entry. The removed `--all-origins` option is rejected.

## Source Doctor

`sources.doctor()` runs registered `check()` functions independently with bounded time and error isolation:

```js
const report = await sources.doctor({
  channel: "research",
  timeoutMs: 2_000
});
```

Reports distinguish `ready`, `degraded`, `unavailable`, `blocked`, and `error`. A check reports adapter readiness; it does not authorize a later call and does not prove that remote credentials, a provider, or the network will remain available.

Checks receive an abort signal and adapter description. They are host JavaScript functions. Maqam aborts the signal when the report deadline expires and validates the returned result, but cancellation remains cooperative: arbitrary host code may ignore the signal. Maqam cannot prove that a custom check is offline or side-effect free. Keep checks local and deterministic; never use them to log in, mutate provider state, import browser cookies, or probe private data.

## Security Checklist

Before enabling a source adapter:

1. register its exact `toolName` in a policy-required `ToolGateway`;
2. declare non-downgradable effects and risk on the tool registration;
3. constrain origins, request counts, bytes, depth, retries, duration, and output size;
4. keep credentials in host-controlled secret storage, never in route input or evidence excerpts;
5. require explicit `allowAuthenticated: true` for authenticated adapters;
6. treat returned content as untrusted text and escape it in every UI;
7. keep provider permissions, egress control, isolation, and audit retention outside Maqam; and
8. test both the allowed route and the policy-denied zero-dispatch path.

## What Is Deliberately Not Included

Maqam 0.3.0 does not include automatic installers, browser-cookie extraction or reuse, browser-session import, platform login, anti-bot or CAPTCHA bypass, a headless browser, built-in social-network/channel adapters, provider credential synchronization, or a distributed hosted crawler fleet.

Those capabilities create separate identity, legal, operational, and security boundaries. Integrate them as independently installed host tools only when their licenses and controls have been reviewed, then expose the smallest required operation through a registered Maqam adapter.

## Agent Reach Inspiration And License Boundary

The registry-and-doctor architecture was informed by inspection of [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) at commit `1494c2ab239e7355a77e7cceaf3271453a1f34b5` (MIT license). Maqam's implementation is an independent JavaScript design for its existing `ToolGateway` and evidence contracts.

No Agent Reach source code, documentation, examples, tests, assets, logos, or branding was copied into Maqam. Maqam does not claim Agent Reach's platform coverage or automatic setup behavior. See [Provenance and License Notes](provenance-and-licenses.md).
