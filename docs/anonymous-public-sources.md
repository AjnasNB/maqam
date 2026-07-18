# Anonymous-Public Source Pack

This guide defines Maqam's independent, opt-in contract for public web search and public YouTube research without requiring a developer API key. It is not a promise of unrestricted access to the internet.

> **Implementation status:** this checkout includes the factories, public declarations, offline contract tests, and console API wiring described here. A checkout is not publication proof. Verify the exact installed package exports, provenance, matching Git tag, and release record before describing a registry version as shipped.

The pack keeps discovery behind `ResearchSourceRegistry` and execution behind `ToolGateway`. It adds two narrow routes:

- hosted anonymous web search through Exa's MCP endpoint; and
- public YouTube metadata, search results, and available captions through a separately installed `yt-dlp` executable.

It does not add automatic installers, media downloading, cookie import, account login, CAPTCHA or anti-bot bypass, paywall bypass, or an implicit credentialed fallback.

## Five Different Access Modes

"No API key" is too broad to be a security or privacy description. Classify every source by credential and execution mode:

| Mode | Meaning | Example | Maqam treatment |
|---|---|---|---|
| Anonymous public | The host contacts a public source without a user or developer credential. | Bounded HTTP crawling or a public RSS feed. | `authentication: "none"`; public access, robots, terms, and rate limits still apply. |
| Hosted anonymous | A third-party hosted service accepts requests without a developer key, usually under a shared or IP-based free allowance. | Exa's hosted MCP web-search endpoint. | `authentication: "none"`, plus explicit remote origin, data-disclosure, availability, and rate-limit boundaries. |
| Browser session | A browser profile or storage state supplies cookies, tokens, or logged-in identity. | Reading a page visible only in a signed-in browser. | Credentialed access. Keep it outside this pack; use a separate adapter marked `authentication: "required"` and require explicit opt-in. |
| Developer credential | A provider key, OAuth grant, service account, or application quota authorizes the request. | YouTube Data API or a paid search account. | Separate integration and secret lifecycle; never fall into it implicitly from an anonymous route. |
| Local processing | A locally installed program or model performs some work on the host. | `yt-dlp` subprocess plus local caption parsing. | No provider key does not mean offline: process execution and upstream network effects remain governed and must be sandboxed by the host. |

These modes may overlap. The YouTube adapter is both local processing and anonymous public network access. Exa is hosted anonymous and sends the query to a third party.

## Why This Is Governed Reach, Not "All Internet"

The pack expands reachable public sources while keeping authority explicit. It does not guarantee that a URL, video, transcript, region, or search result is available. Sources can require login, remove captions, return a consent page, enforce geographic or age restrictions, reject automation, change an undocumented response, or rate-limit an IP.

Maqam governs only calls routed through the registered gateway. It does not turn a child process into a network sandbox, grant legal permission to collect content, make third-party text trustworthy, or control a second client that bypasses the gateway.

The honest product claim is:

> Maqam can route selected anonymous-public research operations through explicit policy, budgets, approvals, trace, and normalized evidence.

It is not:

> Maqam can explore every site or platform without credentials.

## Exa Hosted MCP Web Search

`createExaSearchSourceAdapter()` creates the `web-search.exa-hosted-mcp` adapter and registers the tool name `research.web-search.exa-hosted-mcp`. By default it uses:

```text
https://mcp.exa.ai/mcp?tools=web_search_exa
```

The adapter calls only `web_search_exa`, sends no developer API key, rejects redirects, bounds time and response bytes, and normalizes parseable result URLs into `ResearchDocument` records. Its offline doctor check confirms configuration only; it deliberately does not spend anonymous quota or prove live service availability.

Operational boundary:

- Exa documents a no-key free MCP path, but the hosted service may change access policy or apply shared/IP-based limits.
- The query, request metadata, client IP, and service-visible results leave the local machine and are handled under Exa's policies.
- HTTP `429`, transient server failures, timeouts, empty results, or an unreachable endpoint are availability failures. They may fall through only to another explicitly configured anonymous web-search backend.
- HTTP `401` or `403` is classified as authentication required and is fatal for this anonymous route. Maqam does not silently add a key.
- Exa tools that require an account or usage billing are outside this adapter's declared surface.

For production volume, evaluate a separately configured credentialed integration rather than presenting an anonymous allowance as an SLA.

## Public YouTube Metadata And Captions

`createYtDlpYouTubeSourceAdapter()` creates the `youtube.yt-dlp` adapter and registers the tool name `research.youtube.yt-dlp`. It executes an independently installed `yt-dlp` binary without a shell. The adapter forces configuration, plugin directories, remote components, cookies, cache, watched-state mutation, and video/audio download off. URL reads request an available manual or automatically generated caption track by default for local parsing; pass `includeTranscript: false` for metadata only. Search reads never fetch captions.

The packaged HTTP console does not discover or execute a PATH command by default. Enable its YouTube route with a reviewed absolute executable path:

```bash
maqam --yt-dlp-command /opt/maqam-tools/yt-dlp

# or
MAQAM_YT_DLP_COMMAND=/opt/maqam-tools/yt-dlp maqam
```

On Windows, quote the absolute path when it contains spaces. Supplying this server option is an explicit operator opt-in to local process execution for authenticated or same-origin console requests; programmatic gateway integrations should still apply their normal exact-approval policy.

Install and maintain `yt-dlp` outside the Maqam package. Prefer a reviewed, pinned executable path rather than relying on a mutable `PATH`:

```js
const youtube = createYtDlpYouTubeSourceAdapter({
  command: "/opt/maqam-tools/yt-dlp",
  timeoutMs: 45_000,
  captionTimeoutMs: 15_000,
  maxResults: 5,
  maxOutputBytes: 8 * 1024 * 1024,
  maxCaptionBytes: 2 * 1024 * 1024,
  maxTranscriptChars: 500_000,
  languages: ["en", "en-US"]
});
```

On Windows, use an exact reviewed path such as `C:\Tools\yt-dlp.exe`. Confirm the binary's origin, checksum, update policy, and license composition. `yt-dlp`'s project license and the licenses of standalone builds or bundled components are not automatically inherited from Maqam's MIT license.

The input is exactly one of a canonical `https://www.youtube.com` URL or a search query. Short, mobile, and no-cookie alias origins are rejected because the gateway authorizes the exact input origin before the adapter runs:

```js
{ query: "governed agent approvals", maxResults: 5 }

{ url: "https://www.youtube.com/watch?v=VIDEO_ID", includeTranscript: true }
```

Important limitations:

- This is an unofficial, best-effort extraction path, not the YouTube Data API and not a browser session.
- A recent `yt-dlp` and a supported JavaScript runtime may be required as YouTube changes its player behavior. The adapter does not enable `yt-dlp` remote components.
- YouTube may require proof-of-origin tokens, login, cookies, or additional client behavior for some requests. This pack does not acquire or generate those implicitly.
- Explicitly unavailable captions produce a metadata-only document when metadata is available. Caption security, size, cancellation, and malformed-protocol failures stop the route instead of being hidden as a successful metadata-only read. Automatically generated captions can be inaccurate.
- Search ranking, counts, descriptions, and availability can vary by time, locale, IP, and upstream behavior.
- Do not add `--cookies-from-browser`, account cookies, plugin directories, remote components, or media download flags to the anonymous adapter. Those change its identity, privacy, legal, and execution boundary and require a separate reviewed adapter.
- Review the YouTube Terms of Service, copyright, local law, retention, and downstream-use requirements for the intended deployment. Technical accessibility is not permission to copy or redistribute content.

The official YouTube Data API remains the appropriate separate route when the deployment needs a documented developer API, quota accounting, OAuth-authorized data, or provider-supported semantics. It requires a Google project and credentials and must not be used as a hidden fallback from `youtube.yt-dlp`.

## Safe Gateway And Registry Setup

Create the adapters, allow only their exact tools and canonical origins, register their `read` handlers, and bind the registry to `ToolGateway.call`:

```js
import {
  EXA_HOSTED_MCP_ENDPOINT,
  PolicyEngine,
  ResearchSourceRegistry,
  ToolGateway,
  createExaSearchSourceAdapter,
  createYtDlpYouTubeSourceAdapter,
  defineResearchToolCaller
} from "maqam";

const exa = createExaSearchSourceAdapter({
  endpoint: EXA_HOSTED_MCP_ENDPOINT,
  timeoutMs: 20_000,
  maxResponseBytes: 2 * 1024 * 1024,
  maxResults: 5
});

const youtube = createYtDlpYouTubeSourceAdapter({
  command: "/opt/maqam-tools/yt-dlp",
  timeoutMs: 45_000,
  maxResults: 5,
  maxOutputBytes: 8 * 1024 * 1024,
  maxCaptionBytes: 2 * 1024 * 1024,
  maxTranscriptChars: 500_000
});

const policyEngine = new PolicyEngine({
  allowedTools: [exa.toolName, youtube.toolName],
  allowedOrigins: ["https://mcp.exa.ai", "https://www.youtube.com"],
  approvalRequiredEffects: ["process:execute"],
  maxToolCalls: 8
});

const gateway = new ToolGateway({
  policyEngine,
  // Supply the application's approval queue and evidence ledger here.
});

gateway.registerTool(exa.toolName, exa.read);
gateway.registerTool(youtube.toolName, youtube.read);

const sources = new ResearchSourceRegistry({
  adapters: [exa, youtube],
  preferences: {
    "web-search": [exa.id],
    youtube: [youtube.id]
  },
  toolCaller: defineResearchToolCaller({
    call: gateway.call.bind(gateway)
  })
});
```

The factory handlers carry non-downgradable governance declarations. Exa declares `network:read` and its configured endpoint origin at low risk. YouTube declares `network:read`, `process:execute`, and its canonical public origin at medium risk. Registration metadata can add authority but cannot erase those declarations.

Requiring approval for `process:execute` is a deliberate safer default. Complete the application's normal exact-call approval flow before routing YouTube, or remove that requirement only after explicitly accepting the local-process boundary. A route without the required approval fails before dispatch.

Route each channel explicitly:

```js
const web = await sources.route({
  channel: "web-search",
  input: { query: "exact approval agent tools", numResults: 5 }
}, { runId: "research_web_1" });

const video = await sources.route({
  channel: "youtube",
  input: {
    url: "https://www.youtube.com/watch?v=VIDEO_ID",
    includeTranscript: true,
    languages: ["en"]
  }
}, {
  runId: "research_video_1",
  approvalId: "APPROVAL_BOUND_TO_THIS_EXACT_CALL"
});
```

Do not use `routeUngoverned()` for these operations if the result will be described as policy-checked, approved, traced, or governed.

### The subprocess boundary

`ToolGateway` evaluates the YouTube handler's declared effect and canonical origin, but it is not an operating-system sandbox and cannot observe every connection made inside `yt-dlp`. Run the executable as a restricted user or container, apply host egress controls, deny private networks and local metadata services, bound CPU/memory/time/output, and keep its installation directory read-only. Review the exact upstream hosts needed by the pinned version instead of granting the process general network authority.

## Routing And Failure Rules

Keep anonymous, session, and credentialed backends separately named. If multiple backends share a channel, fallback is allowed only after `ResearchSourceUnavailableError`. Policy denial, missing approval, authentication required, authorization failure, security rejection, goal-scope denial, and call-ceiling exhaustion are fatal and must stop routing.

Recommended classifications:

| Condition | Classification | Fallback? |
|---|---|---|
| Exa `429`, timeout, transient `5xx`, or network outage | Unavailable | Only to another explicitly ordered backend with the same accepted credential boundary. |
| `yt-dlp` absent, timeout, no result, or ordinary public-data extraction failure | Unavailable | Only to another explicitly ordered public YouTube backend. |
| Exa requests authentication | Authentication required | No. Do not inject a key automatically. |
| YouTube content requires login/cookies | Authentication required | No. Do not import a browser session automatically. |
| Missing exact process approval | Policy/approval failure | No. |
| Invalid URL, unsafe caption origin, private-network target, or malformed bounded output | Input/security/protocol failure | No. |

A browser-session adapter or developer-credential adapter may be selected only by an explicit request and policy that allows authenticated sources. Never let an availability failure upgrade authority.

## Privacy, Content Safety, And Evidence

- Minimize Exa queries because they leave the machine. Do not put secrets, private document fragments, customer identifiers, or credentials in a hosted search query.
- Treat titles, snippets, descriptions, captions, links, and tool-protocol text as untrusted input. They may contain prompt injection, misleading instructions, unsafe links, or false claims.
- Preserve the source URI, provider/backend label, retrieval time, transcript kind, and adapter attempt record. Do not present an automatically generated caption as a verified quotation.
- Redact query and content excerpts according to the host application's evidence policy. Maqam's registration does not create a retention or data-processing agreement with either provider.
- Never store browser cookies, OAuth tokens, API keys, signed caption URLs, or complete sensitive responses in trace metadata.

## Doctor And Operations

Run `sources.doctor()` before a job, but interpret it precisely:

- Exa `ready` means the anonymous endpoint is configured; the check is offline and does not prove live quota.
- YouTube `ready` means the configured `yt-dlp` executable returned a local version; the check does not contact YouTube.
- A live smoke request is a separate governed call that consumes provider capacity and may disclose a query or IP.

Record adapter id, executable version, bounded failure class, duration, result count, and whether a transcript was manual, automatic, or unavailable. Do not record secrets or signed caption URLs. Alert on sustained `429`, authentication-required responses, protocol drift, and repeated subprocess timeouts instead of automatically widening permissions.

## Readiness Checklist

Before calling the pack production-ready:

1. verify the exact package exports and separately installed `yt-dlp` artifact;
2. test allow, zero-dispatch deny, exact approval, replay denial, timeout, cancellation, malformed output, rate limit, no-caption, and fatal-no-fallback behavior;
3. pin tools, origins, call count, response bytes, results, transcript length, and runtime;
4. isolate the subprocess and verify that gateway denial produces zero process starts;
5. document third-party data flow, retention, terms, copyright, executable licensing, and update ownership;
6. keep browser sessions and developer credentials in separately named adapters with explicit authenticated opt-in; and
7. phrase capability as selected governed public research, never universal internet access.

## Primary References

- [Exa MCP server documentation](https://exa.ai/docs/reference/exa-mcp)
- [`yt-dlp` README and usage reference](https://github.com/yt-dlp/yt-dlp/blob/master/README.md)
- [`yt-dlp` YouTube proof-of-origin token guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)
- [`yt-dlp` extractor and account-use guidance](https://github.com/yt-dlp/yt-dlp/wiki/Extractors)
- [YouTube Terms of Service](https://www.youtube.com/static?template=terms)
- [YouTube Data API getting started](https://developers.google.com/youtube/v3/getting-started)
- [Playwright authentication and browser storage state](https://playwright.dev/docs/auth)
- [MCP security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
