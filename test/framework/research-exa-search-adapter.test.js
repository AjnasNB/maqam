import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { test } from "node:test";
import { PolicyEngine } from "../../src/framework/policy.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";
import {
  EXA_HOSTED_MCP_ENDPOINT,
  createExaSearchSourceAdapter
} from "../../src/research/adapters/exa-search.js";
import {
  ResearchSourceAuthenticationRequiredError,
  ResearchSourceRegistry,
  ResearchSourceUnavailableError
} from "../../src/research/index.js";

function jsonResponse(value, {
  status = 200,
  headers = {}
} = {}) {
  return new Response(
    typeof value === "string" ? value : JSON.stringify(value),
    {
      status,
      headers: {
        "content-type": "application/json",
        ...headers
      }
    }
  );
}

function emptyResponse(status = 202) {
  return new Response(null, { status });
}

function requestRecord(endpoint, init) {
  return {
    endpoint: String(endpoint),
    method: init.method,
    headers: Object.fromEntries(new Headers(init.headers).entries()),
    body: init.body === undefined ? null : JSON.parse(init.body),
    signal: init.signal,
    redirect: init.redirect
  };
}

function scriptedFetch(responses) {
  const queue = [...responses];
  const calls = [];
  const fetch = async (endpoint, init = {}) => {
    const call = requestRecord(endpoint, init);
    calls.push(call);
    if (call.method === "DELETE") return emptyResponse(204);
    if (queue.length === 0) {
      throw new Error(`Unexpected ${call.method} request to ${call.endpoint}.`);
    }
    const response = queue.shift();
    return typeof response === "function" ? response(call) : response;
  };
  return {
    calls,
    fetch,
    remaining() {
      return queue.length;
    }
  };
}

function initializeResponse({
  sessionId = "exa-session-1",
  protocolVersion = "2025-03-26"
} = {}) {
  const body = [
    "{",
    '"jsonrpc":"2.0",',
    '"id":1,',
    '"__proto__":{"polluted":"must-not-escape"},',
    `"result":{"protocolVersion":"${protocolVersion}",`,
    '"capabilities":{"tools":{}},',
    '"serverInfo":{"name":"offline-exa-fixture","version":"1.0.0"}}',
    "}"
  ].join("");
  return jsonResponse(body, {
    headers: { "mcp-session-id": sessionId }
  });
}

function initializeResultResponse(result, { sessionId = "exa-session-invalid" } = {}) {
  return jsonResponse({
    jsonrpc: "2.0",
    id: 1,
    result
  }, {
    headers: { "mcp-session-id": sessionId }
  });
}

function toolResultMessage(text) {
  const result = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    result: {
      content: [
        { type: "text", text },
        { type: "image", data: "ignored" }
      ]
    }
  });
  return result.replace(
    '"result":',
    '"__proto__":{"polluted":"must-not-escape"},"result":'
  );
}

function eventStreamToolResponse(text) {
  const message = toolResultMessage(text);
  const splitAt = message.indexOf('"result"');
  const first = message.slice(0, splitAt);
  const second = message.slice(splitAt);
  return new Response([
    ": offline heartbeat",
    'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1}}',
    `event: message\ndata: ${first}\ndata: ${second}`,
    "data: [DONE]"
  ].join("\n\n") + "\n\n", {
    headers: { "content-type": "Text/Event-Stream; charset=utf-8" }
  });
}

function successfulResponses(text, options = {}) {
  return [
    initializeResponse(options),
    emptyResponse(),
    options.jsonBatch === true
      ? jsonResponse([
        { jsonrpc: "2.0", method: "notifications/progress", params: { progress: 1 } },
        JSON.parse(toolResultMessage(text))
      ])
      : eventStreamToolResponse(text)
  ];
}

const TWO_RESULTS = [
  "Title: First result",
  "URL: https://example.com/first?ref=offline",
  "Published: 2026-07-17T12:30:00Z",
  "Author: Alice Example",
  "Highlights: First highlighted passage.",
  "A second line of evidence.",
  "",
  "Title: Credentialed URL must be discarded",
  "URL: https://user:secret@example.invalid/private",
  "Highlights: This result must not cross the document boundary.",
  "",
  "Title: Second result",
  "URL: http://example.org/second",
  "Published: not-a-timestamp",
  "Author: N/A",
  "Highlights: Second highlighted passage."
].join("\n");

test("Exa adapter performs initialize, initialized, and tools/call over JSON and SSE", async () => {
  const transport = scriptedFetch(successfulResponses(TWO_RESULTS));
  const adapter = createExaSearchSourceAdapter({
    fetch: transport.fetch,
    maxResults: 3
  });
  const registry = new ResearchSourceRegistry({
    adapters: [adapter],
    clock: () => new Date("2026-07-18T04:05:06.000Z")
  });

  const result = await registry.routeUngoverned({
    channel: "web-search",
    input: { query: "  governed agent research  ", numResults: 2 }
  });
  await nextTurn();

  assert.equal(transport.remaining(), 0);
  assert.deepEqual(
    transport.calls.map((call) => call.method),
    ["POST", "POST", "POST", "DELETE"]
  );
  const [initialize, initialized, toolCall, cleanup] = transport.calls;
  assert.equal(initialize.endpoint, EXA_HOSTED_MCP_ENDPOINT);
  assert.equal(initialize.redirect, "error");
  assert.equal(initialize.body.method, "initialize");
  assert.equal(initialize.body.id, 1);
  assert.equal(initialize.body.params.protocolVersion, "2025-11-25");
  assert.deepEqual(initialize.body.params.capabilities, {});
  assert.deepEqual(initialize.body.params.clientInfo, {
    name: "maqam",
    version: "0.3.1"
  });
  assert.equal(initialize.headers["mcp-session-id"], undefined);
  assert.equal(initialize.headers["mcp-protocol-version"], undefined);

  assert.equal(initialized.body.method, "notifications/initialized");
  assert.equal(initialized.body.id, undefined);
  assert.equal(initialized.headers["mcp-session-id"], "exa-session-1");
  assert.equal(initialized.headers["mcp-protocol-version"], "2025-03-26");

  assert.equal(toolCall.body.method, "tools/call");
  assert.equal(toolCall.body.id, 2);
  assert.deepEqual(toolCall.body.params, {
    name: "web_search_exa",
    arguments: {
      query: "governed agent research",
      numResults: 2
    }
  });
  assert.equal(toolCall.headers["mcp-session-id"], "exa-session-1");
  assert.equal(toolCall.headers["mcp-protocol-version"], "2025-03-26");
  assert.equal(cleanup.headers["mcp-session-id"], "exa-session-1");
  assert.equal(cleanup.headers["mcp-protocol-version"], "2025-03-26");
  for (const call of transport.calls.slice(0, 3)) {
    assert.equal(call.headers.authorization, undefined);
    assert.equal(call.headers.cookie, undefined);
    assert.equal(call.signal instanceof AbortSignal, true);
  }

  assert.equal(result.adapter.id, "web-search.exa-hosted-mcp");
  assert.equal(result.governance.mode, "explicitly-ungoverned-direct");
  assert.equal(result.governance.toolName, "research.web-search.exa-hosted-mcp");
  assert.equal(result.documents.length, 2);
  assert.deepEqual({ ...result.documents[0] }, {
    schemaVersion: "1.0",
    source: result.documents[0].source,
    id: "https://example.com/first?ref=offline",
    uri: "https://example.com/first?ref=offline",
    title: "First result",
    text: "First highlighted passage.\nA second line of evidence.",
    markdown: null,
    contentType: "text/plain",
    language: null,
    authors: result.documents[0].authors,
    publishedAt: "2026-07-17T12:30:00.000Z",
    retrievedAt: "2026-07-18T04:05:06.000Z",
    metadata: result.documents[0].metadata,
    citations: result.documents[0].citations
  });
  assert.deepEqual({ ...result.documents[0].source }, {
    adapterId: "web-search.exa-hosted-mcp",
    channel: "web-search"
  });
  assert.deepEqual([...result.documents[0].authors], ["Alice Example"]);
  assert.deepEqual({ ...result.documents[0].metadata }, {
    provider: "exa-hosted-mcp",
    endpointOrigin: "https://mcp.exa.ai",
    query: "governed agent research",
    rank: 1,
    developerApiKeyRequired: false
  });
  assert.deepEqual(
    result.documents[0].citations.map((citation) => ({ ...citation })),
    [{ uri: "https://example.com/first?ref=offline", title: "First result" }]
  );
  assert.equal(result.documents[1].publishedAt, null);
  assert.deepEqual([...result.documents[1].authors], []);
  assert.equal(result.documents[1].metadata.rank, 2);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.documents), true);
  assert.equal(Object.isFrozen(result.documents[0].metadata), true);
  assert.equal({}.polluted, undefined);
});

test("Exa adapter governance blocks an unauthorized hosted origin before fetch", async () => {
  let fetchCalls = 0;
  const adapter = createExaSearchSourceAdapter({
    fetch: async () => {
      fetchCalls += 1;
      throw new Error("policy must run before fetch");
    }
  });
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: [adapter.toolName],
      allowedOrigins: ["https://example.com"]
    })
  });
  gateway.registerTool(adapter.toolName, adapter.read);

  await assert.rejects(
    () => gateway.call(adapter.toolName, { query: "governed origin" }),
    (error) => error.code === "POLICY_DENIED"
      && /https:\/\/mcp\.exa\.ai/.test(error.message)
  );
  assert.equal(fetchCalls, 0);
});

test("Exa adapter accepts batched application/json MCP responses", async () => {
  const transport = scriptedFetch(successfulResponses([
    "Title: JSON result",
    "URL: https://example.net/json",
    "Highlights: Parsed from a JSON-RPC batch."
  ].join("\n"), { jsonBatch: true }));
  const adapter = createExaSearchSourceAdapter({ fetch: transport.fetch });

  const documents = await adapter.read({ query: "json batch", numResults: 1 });
  await nextTurn();

  assert.equal(documents.length, 1);
  assert.equal(documents[0].uri, "https://example.net/json");
  assert.equal(documents[0].text, "Parsed from a JSON-RPC batch.");
  assert.deepEqual(
    transport.calls.map((call) => call.method),
    ["POST", "POST", "POST", "DELETE"]
  );
});

test("Exa adapter rejects invalid MCP session and negotiated protocol identifiers", async (t) => {
  await t.test("oversized session identifier", async () => {
    const transport = scriptedFetch([
      initializeResponse({ sessionId: "s".repeat(1_025) })
    ]);
    const adapter = createExaSearchSourceAdapter({ fetch: transport.fetch });
    await assert.rejects(
      () => adapter.read({ query: "invalid session" }),
      (error) => error.code === "RESEARCH_SOURCE_PROTOCOL_INVALID"
        && /invalid session identifier/.test(error.message)
    );
    assert.deepEqual(
      transport.calls.map((call) => call.method),
      ["POST"]
    );
  });

  await t.test("malformed negotiated protocol version", async () => {
    const transport = scriptedFetch([
      initializeResponse({ protocolVersion: "2025/03/26" })
    ]);
    const adapter = createExaSearchSourceAdapter({ fetch: transport.fetch });
    await assert.rejects(
      () => adapter.read({ query: "invalid protocol" }),
      (error) => error.code === "RESEARCH_SOURCE_PROTOCOL_INVALID"
        && /invalid protocol version/.test(error.message)
    );
    assert.deepEqual(
      transport.calls.map((call) => call.method),
      ["POST", "DELETE"]
    );
    assert.equal(
      transport.calls[1].headers["mcp-protocol-version"],
      "2025-11-25"
    );
  });

  for (const scenario of [
    {
      name: "missing negotiated protocol version",
      result: {
        capabilities: { tools: {} },
        serverInfo: { name: "missing-version", version: "1.0.0" }
      },
      code: "RESEARCH_SOURCE_PROTOCOL_INVALID",
      message: /invalid protocol version/
    },
    {
      name: "non-string negotiated protocol version",
      result: {
        protocolVersion: 123,
        capabilities: { tools: {} },
        serverInfo: { name: "numeric-version", version: "1.0.0" }
      },
      code: "RESEARCH_SOURCE_PROTOCOL_INVALID",
      message: /invalid protocol version/
    },
    {
      name: "well-formed but unsupported negotiated protocol version",
      result: {
        protocolVersion: "2099-01-01",
        capabilities: { tools: {} },
        serverInfo: { name: "future-version", version: "1.0.0" }
      },
      code: "RESEARCH_SOURCE_PROTOCOL_UNSUPPORTED",
      message: /unsupported protocol version '2099-01-01'/
    }
  ]) {
    await t.test(scenario.name, async () => {
      const transport = scriptedFetch([initializeResultResponse(scenario.result)]);
      const adapter = createExaSearchSourceAdapter({ fetch: transport.fetch });
      await assert.rejects(
        () => adapter.read({ query: "invalid negotiation" }),
        (error) => error.code === scenario.code && scenario.message.test(error.message)
      );
      assert.deepEqual(
        transport.calls.map((call) => call.method),
        ["POST", "DELETE"]
      );
      assert.equal(
        transport.calls[1].headers["mcp-protocol-version"],
        "2025-11-25"
      );
    });
  }
});

test("Exa default transport blocks private MCP endpoints before network dispatch", async () => {
  const adapter = createExaSearchSourceAdapter({
    endpoint: "https://127.0.0.1:443/mcp",
    timeoutMs: 1_000
  });

  await assert.rejects(
    () => adapter.read({ query: "private endpoint must not run" }),
    (error) => error.code === "CRAWLER_URL_BLOCKED"
      && error.details.address === "127.0.0.1"
  );
});

test("Exa adapter declares anonymous hosted metadata and an offline-only doctor", async () => {
  let fetchCalls = 0;
  const endpoint = "https://exa-fixture.example/mcp?tools=web_search_exa";
  const adapter = createExaSearchSourceAdapter({
    endpoint,
    fetch: async () => {
      fetchCalls += 1;
      throw new Error("doctor must remain offline");
    }
  });

  assert.equal(adapter.id, "web-search.exa-hosted-mcp");
  assert.equal(adapter.channel, "web-search");
  assert.equal(adapter.toolName, "research.web-search.exa-hosted-mcp");
  assert.equal(adapter.authentication, "none");
  assert.deepEqual([...adapter.capabilities], ["read", "search", "web", "mcp"]);
  assert.deepEqual({ ...adapter.metadata }, {
    provider: "exa",
    accessMode: "hosted-anonymous",
    executionMode: "remote-mcp",
    dataBoundary: "third-party-hosted",
    contentIsUntrusted: true,
    transport: "streamable-http",
    endpointOrigin: "https://exa-fixture.example",
    developerApiKeyRequired: false,
    anonymousRateLimitsApply: true,
    browserSessionReuse: false
  });
  assert.equal(Object.isFrozen(adapter), true);
  assert.equal(Object.isFrozen(adapter.metadata), true);

  const governanceDescriptor = Object.getOwnPropertyDescriptor(adapter.read, "governance");
  assert.equal(governanceDescriptor.enumerable, false);
  assert.equal(governanceDescriptor.configurable, false);
  assert.equal(governanceDescriptor.writable, false);
  assert.equal(Object.isFrozen(governanceDescriptor.value), true);
  assert.deepEqual({ ...governanceDescriptor.value }, {
    effects: governanceDescriptor.value.effects,
    networkOrigins: governanceDescriptor.value.networkOrigins,
    risk: "low"
  });
  assert.deepEqual([...governanceDescriptor.value.effects], ["network:read"]);
  assert.deepEqual(
    [...governanceDescriptor.value.networkOrigins],
    ["https://exa-fixture.example"]
  );

  const registry = new ResearchSourceRegistry({ adapters: [adapter] });
  const report = await registry.doctor({ channel: "web-search" });
  assert.equal(fetchCalls, 0);
  assert.equal(report.status, "ready");
  assert.deepEqual({ ...report.summary }, {
    total: 1,
    ready: 1,
    degraded: 0,
    unavailable: 0,
    blocked: 0,
    error: 0
  });
  assert.match(report.checks[0].message, /does not contact Exa or consume rate limit/);
  assert.deepEqual({ ...report.checks[0].details }, {
    endpointOrigin: "https://exa-fixture.example",
    registrationReady: true,
    liveVerified: false,
    developerApiKeyRequired: false,
    accessMode: "hosted-anonymous"
  });
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.checks), true);
});

test("Exa adapter classifies HTTP 401 and 429 without leaking response text", async (t) => {
  await t.test("401 requires authentication", async () => {
    const secretBody = "developer key secret-value should not escape";
    const adapter = createExaSearchSourceAdapter({
      fetch: async () => new Response(secretBody, { status: 401 })
    });
    await assert.rejects(
      () => adapter.read({ query: "authentication" }),
      (error) => {
        assert.equal(error instanceof ResearchSourceAuthenticationRequiredError, true);
        assert.equal(error.code, "RESEARCH_AUTHENTICATION_REQUIRED");
        assert.equal(error.details.status, 401);
        assert.equal(error.details.origin, "https://mcp.exa.ai");
        assert.doesNotMatch(error.message, /secret-value/);
        return true;
      }
    );
  });

  await t.test("429 is temporary unavailability", async () => {
    const adapter = createExaSearchSourceAdapter({
      fetch: async () => new Response("slow down", { status: 429 })
    });
    await assert.rejects(
      () => adapter.read({ query: "rate limit" }),
      (error) => {
        assert.equal(error instanceof ResearchSourceUnavailableError, true);
        assert.equal(error.code, "RESEARCH_SOURCE_UNAVAILABLE");
        assert.equal(error.details.status, 429);
        assert.equal(error.details.origin, "https://mcp.exa.ai");
        assert.match(error.message, /temporarily unavailable/);
        return true;
      }
    );
  });
});

test("Exa adapter maps JSON-RPC and MCP tool errors to stable source errors", async (t) => {
  await t.test("JSON-RPC rate limit is unavailable", async () => {
    const transport = scriptedFetch([
      initializeResponse(),
      emptyResponse(),
      jsonResponse({
        jsonrpc: "2.0",
        id: 2,
        error: { code: -32000, message: "Temporary rate limit reached" }
      })
    ]);
    const adapter = createExaSearchSourceAdapter({ fetch: transport.fetch });
    await assert.rejects(
      () => adapter.read({ query: "rpc rate limit" }),
      (error) => error instanceof ResearchSourceUnavailableError
        && error.code === "RESEARCH_SOURCE_UNAVAILABLE"
        && /rate limit/i.test(error.message)
    );
  });

  await t.test("MCP isError authentication is fatal", async () => {
    const transport = scriptedFetch([
      initializeResponse(),
      emptyResponse(),
      jsonResponse({
        jsonrpc: "2.0",
        id: 2,
        result: {
          isError: true,
          content: [{ type: "text", text: "Unauthorized API key" }]
        }
      })
    ]);
    const adapter = createExaSearchSourceAdapter({ fetch: transport.fetch });
    await assert.rejects(
      () => adapter.read({ query: "rpc authentication" }),
      (error) => error instanceof ResearchSourceAuthenticationRequiredError
        && error.code === "RESEARCH_AUTHENTICATION_REQUIRED"
        && !/API key/.test(error.message)
    );
  });
});

test("Exa adapter rejects malformed JSON, malformed SSE, and invalid RPC envelopes", async (t) => {
  await t.test("malformed application/json", async () => {
    const adapter = createExaSearchSourceAdapter({
      fetch: async () => jsonResponse("{not-json")
    });
    await assert.rejects(
      () => adapter.read({ query: "bad json" }),
      (error) => error.code === "RESEARCH_SOURCE_PROTOCOL_INVALID"
        && /malformed JSON/.test(error.message)
    );
  });

  await t.test("malformed text/event-stream JSON", async () => {
    const transport = scriptedFetch([
      initializeResponse(),
      emptyResponse(),
      new Response("data: {not-json}\n\n", {
        headers: { "content-type": "text/event-stream" }
      })
    ]);
    const adapter = createExaSearchSourceAdapter({ fetch: transport.fetch });
    await assert.rejects(
      () => adapter.read({ query: "bad sse" }),
      (error) => error.code === "RESEARCH_SOURCE_PROTOCOL_INVALID"
        && /event-stream JSON/.test(error.message)
    );
  });

  await t.test("missing matching JSON-RPC id", async () => {
    const transport = scriptedFetch([
      initializeResponse(),
      emptyResponse(),
      jsonResponse({ jsonrpc: "2.0", id: 999, result: { content: [] } })
    ]);
    const adapter = createExaSearchSourceAdapter({ fetch: transport.fetch });
    await assert.rejects(
      () => adapter.read({ query: "wrong id" }),
      (error) => error.code === "RESEARCH_SOURCE_PROTOCOL_INVALID"
        && /matching JSON-RPC response/.test(error.message)
    );
  });

  await t.test("tool result without a content array", async () => {
    const transport = scriptedFetch([
      initializeResponse(),
      emptyResponse(),
      jsonResponse({ jsonrpc: "2.0", id: 2, result: { content: {} } })
    ]);
    const adapter = createExaSearchSourceAdapter({ fetch: transport.fetch });
    await assert.rejects(
      () => adapter.read({ query: "bad tool result" }),
      (error) => error.code === "RESEARCH_SOURCE_PROTOCOL_INVALID"
        && /content array/.test(error.message)
    );
  });

  await t.test("text without parseable result URLs is unavailable", async () => {
    const transport = scriptedFetch(successfulResponses("No result URLs in this response."));
    const adapter = createExaSearchSourceAdapter({ fetch: transport.fetch });
    await assert.rejects(
      () => adapter.read({ query: "no urls" }),
      (error) => error instanceof ResearchSourceUnavailableError
        && /no parseable result URLs/.test(error.message)
    );
  });
});

test("Exa adapter enforces declared and streamed response byte limits", async (t) => {
  await t.test("declared content length is rejected and canceled", async () => {
    let canceled = 0;
    const oversizedResponse = {
      headers: {
        get(name) {
          if (name.toLowerCase() === "content-length") return "2048";
          if (name.toLowerCase() === "content-type") return "application/json";
          return null;
        }
      },
      body: {
        async cancel() {
          canceled += 1;
        }
      },
      ok: true,
      status: 200,
      async text() {
        throw new Error("oversized response must not be buffered");
      }
    };
    const adapter = createExaSearchSourceAdapter({
      fetch: async () => oversizedResponse,
      maxResponseBytes: 1024
    });
    await assert.rejects(
      () => adapter.read({ query: "declared oversize" }),
      (error) => error.code === "RESEARCH_SOURCE_RESPONSE_TOO_LARGE"
        && error.details.maximumBytes === 1024
        && error.details.contentLength === 2048
    );
    assert.equal(canceled, 1);
  });

  await t.test("chunked body is stopped after crossing the limit", async () => {
    const adapter = createExaSearchSourceAdapter({
      fetch: async () => new Response("x".repeat(1025), {
        headers: { "content-type": "application/json" }
      }),
      maxResponseBytes: 1024
    });
    await assert.rejects(
      () => adapter.read({ query: "streamed oversize" }),
      (error) => error.code === "RESEARCH_SOURCE_RESPONSE_TOO_LARGE"
        && error.details.maximumBytes === 1024
        && error.details.contentLength === undefined
    );
  });
});

test("Exa adapter validates options and search input before dispatch", async () => {
  for (const [options, expected] of [
    [{ endpoint: "http://mcp.example/mcp" }, /absolute HTTPS URL/],
    [{ endpoint: "https://user:secret@mcp.example/mcp" }, /without credentials or a fragment/],
    [{ endpoint: "https://mcp.example/mcp#fragment" }, /without credentials or a fragment/],
    [{ fetch: true }, /fetch must be a function/],
    [{ timeoutMs: 99 }, /between 100 and 120000/],
    [{ timeoutMs: 120001 }, /between 100 and 120000/],
    [{ maxResponseBytes: 1023 }, /between 1024 and 10485760/],
    [{ maxResults: 0 }, /between 1 and 25/],
    [{ maxResults: 26 }, /between 1 and 25/],
    [{ apiKey: "must-not-be-accepted" }, /Unknown Exa search adapter options field 'apiKey'/]
  ]) {
    assert.throws(() => createExaSearchSourceAdapter(options), expected);
  }

  let optionGetterCalls = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "fetch", {
    enumerable: true,
    get() {
      optionGetterCalls += 1;
      return globalThis.fetch;
    }
  });
  assert.throws(
    () => createExaSearchSourceAdapter(accessorOptions),
    /fetch.*own enumerable data property/
  );
  assert.equal(optionGetterCalls, 0);
  assert.throws(
    () => createExaSearchSourceAdapter(Object.create({ fetch: globalThis.fetch })),
    /plain object/
  );

  let fetchCalls = 0;
  const adapter = createExaSearchSourceAdapter({
    fetch: async () => {
      fetchCalls += 1;
      throw new Error("invalid input must not dispatch");
    },
    maxResults: 3
  });
  const invalidInputs = [
    [{}, /requires a non-empty query/],
    [{ query: "" }, /requires a non-empty query/],
    [{ query: "   " }, /requires a non-empty query/],
    [{ query: 7 }, /requires a non-empty query/],
    [{ query: "x".repeat(10_001) }, /cannot exceed 10000 characters/],
    [{ query: "valid", numResults: 0 }, /between 1 and 3/],
    [{ query: "valid", numResults: 4 }, /between 1 and 3/],
    [{ query: "valid", numResults: 1.5 }, /between 1 and 3/],
    [{ query: "valid", apiKey: "forged" }, /Unknown Exa search input field 'apiKey'/],
    [null, /plain object/],
    [[], /plain object/]
  ];
  for (const [input, expected] of invalidInputs) {
    await assert.rejects(() => adapter.read(input), expected);
  }

  let queryGetterCalls = 0;
  const accessorInput = {};
  Object.defineProperty(accessorInput, "query", {
    enumerable: true,
    get() {
      queryGetterCalls += 1;
      return "forged query";
    }
  });
  await assert.rejects(
    () => adapter.read(accessorInput),
    /query.*own enumerable data property/
  );
  assert.equal(queryGetterCalls, 0);
  await assert.rejects(
    () => adapter.read(Object.create({ query: "inherited query" })),
    /plain object/
  );
  const symbolInput = { query: "safe" };
  symbolInput[Symbol("forged")] = true;
  await assert.rejects(
    () => adapter.read(symbolInput),
    /Unknown Exa search input field 'Symbol\(forged\)'/
  );
  assert.equal(fetchCalls, 0);
});

test("Exa adapter propagates cancellation and wraps an offline fetch failure", async (t) => {
  await t.test("parent cancellation reaches the in-flight fetch", async () => {
    const controller = new AbortController();
    const reason = new Error("caller canceled offline fixture");
    let observedSignal = null;
    let markStarted;
    const started = new Promise((resolve) => {
      markStarted = resolve;
    });
    const adapter = createExaSearchSourceAdapter({
      fetch: async (_endpoint, init) => {
        observedSignal = init.signal;
        markStarted();
        return new Promise((resolve, reject) => {
          if (init.signal.aborted) {
            reject(init.signal.reason);
            return;
          }
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        });
      }
    });

    const pending = adapter.read(
      { query: "cancel this request" },
      { signal: controller.signal }
    );
    await started;
    controller.abort(reason);
    await assert.rejects(pending, (error) => error === reason);
    assert.equal(observedSignal instanceof AbortSignal, true);
    assert.notEqual(observedSignal, controller.signal);
    assert.equal(observedSignal.aborted, true);
    assert.equal(observedSignal.reason, reason);
  });

  await t.test("transport failure becomes source unavailability", async () => {
    const cause = new Error("offline socket failure");
    const adapter = createExaSearchSourceAdapter({
      fetch: async () => {
        throw cause;
      }
    });
    await assert.rejects(
      () => adapter.read({ query: "offline failure" }),
      (error) => {
        assert.equal(error instanceof ResearchSourceUnavailableError, true);
        assert.equal(error.code, "RESEARCH_SOURCE_UNAVAILABLE");
        assert.equal(error.cause, cause);
        assert.equal(error.details.origin, "https://mcp.exa.ai");
        assert.doesNotMatch(error.message, /socket failure/);
        return true;
      }
    );
  });
});
