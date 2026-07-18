import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createMaqamServer, startMaqamServer } from "../src/maqam/server.js";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function rawRequest(url, options = {}) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: options.method || "GET",
      headers: options.headers || {}
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

function fakeSourceAdapter({
  id = "web-search.fake",
  channel = "web-search",
  toolName = "research.web-search.fake",
  authentication = "none",
  networkOrigins = ["https://source.example"],
  read = async () => [{
    uri: "https://source.example/result",
    title: "Fake result",
    text: "Bounded fake source content."
  }],
  check = async () => ({
    status: "ready",
    message: "Fake adapter is ready.",
    details: { offline: true }
  })
} = {}) {
  Object.defineProperty(read, "governance", {
    value: {
      effects: ["network:read"],
      networkOrigins,
      risk: "low"
    },
    enumerable: false,
    configurable: true,
    writable: true
  });
  return {
    id,
    channel,
    toolName,
    label: `Fake source ${id}`,
    authentication,
    capabilities: ["read"],
    metadata: { fake: true },
    read,
    check
  };
}

test("Maqam server exposes health and console shell", async () => {
  const server = createMaqamServer({
    crawlerTool: async () => []
  });
  const baseUrl = await listen(server);
  try {
    const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
    const capabilities = await fetch(`${baseUrl}/api/capabilities`).then((response) => response.json());
    const html = await fetch(`${baseUrl}/`).then((response) => response.text());

    assert.equal(health.product.name, "Maqam");
    assert.match(html, /Maqam/);
    assert.match(html, /Compose governed agents/);
    assert.match(html, /Search the public web/);
    assert.match(html, /Read a public YouTube video \+ captions/);
    assert.match(html, /Hosted anonymous access/);
    assert.match(html, /API authentication/);
    assert.match(html, /Governance path/);
    assert.match(html, /Adapter coverage/);
    assert.ok(capabilities.capabilities.adapters.some((adapter) => adapter.id === "codex"));
    assert.ok(capabilities.capabilities.adapters.some((adapter) => adapter.id === "claude-code"));
    assert.match(capabilities.capabilities.limitations.join(" "), /registered adapters/i);
  } finally {
    await close(server);
  }
});

test("default server does not discover a local YouTube executable implicitly", async () => {
  const server = createMaqamServer({ crawlerTool: async () => [] });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(
      `${baseUrl}/api/sources/status?channel=youtube&adapterId=youtube.yt-dlp`
    );
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /not registered/i);
  } finally {
    await close(server);
  }
});

test("YouTube console enablement requires an explicit absolute executable path", () => {
  assert.throws(
    () => createMaqamServer({ ytDlpCommand: "yt-dlp" }),
    /absolute executable path/i
  );
});

test("Maqam server runs a governed research workflow", async () => {
  const server = createMaqamServer({
    crawlerTool: async () => [
      {
        url: "https://github.com/apify/crawlee",
        title: "Crawlee",
        text: "Crawlee is a web crawling and browser automation library.",
        status: 200
      }
    ]
  });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/runs/research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        seeds: ["https://github.com/apify/crawlee"],
        maxPages: 1
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.product.name, "Maqam");
    assert.equal(payload.run.status, "completed");
    assert.equal(payload.run.outputs.synthesize_report.candidates[0].name, "Crawlee");
    assert.equal(payload.run.evidence.evidence.length, 1);
  } finally {
    await close(server);
  }
});

test("Maqam server rejects hostile Host, Origin, cross-site, and non-JSON requests", async () => {
  let crawlerCalls = 0;
  const server = createMaqamServer({ crawlerTool: async () => { crawlerCalls += 1; return []; } });
  const baseUrl = await listen(server);
  const body = JSON.stringify({ seeds: ["https://example.com"] });
  try {
    const hostileHost = await rawRequest(`${baseUrl}/api/health`, {
      headers: { Host: "attacker.example" }
    });
    assert.equal(hostileHost.status, 403);

    const hostileOrigin = await fetch(`${baseUrl}/api/runs/research`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body
    });
    assert.equal(hostileOrigin.status, 403);

    const crossSite = await fetch(`${baseUrl}/api/runs/research`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body
    });
    assert.equal(crossSite.status, 403);

    const textPlain = await fetch(`${baseUrl}/api/runs/research`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body
    });
    assert.equal(textPlain.status, 415);
    assert.equal(crawlerCalls, 0);
  } finally {
    await close(server);
  }
});

test("exact UI origins receive CORS headers and can cross sites, including authenticated preflight", async () => {
  const allowedOrigin = "https://console.example";
  const configuredUiOrigins = [allowedOrigin];
  const server = createMaqamServer({
    apiToken: "cors-test-token",
    allowedUiOrigins: configuredUiOrigins,
    crawlerTool: async () => [{
      url: "https://example.com/",
      title: "Example",
      text: "Example source",
      status: 200
    }]
  });
  configuredUiOrigins[0] = "https://attacker.example";
  const baseUrl = await listen(server);
  try {
    const preflight = await rawRequest(`${baseUrl}/api/runs/research`, {
      method: "OPTIONS",
      headers: {
        Origin: allowedOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
        "Sec-Fetch-Site": "cross-site"
      }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.body, "");
    assert.equal(preflight.headers["access-control-allow-origin"], allowedOrigin);
    assert.equal(preflight.headers["access-control-allow-methods"], "GET,POST,OPTIONS");
    assert.equal(preflight.headers["access-control-allow-headers"], "Authorization,Content-Type");
    assert.match(preflight.headers.vary, /(?:^|,\s*)Origin(?:,|$)/i);
    assert.notEqual(preflight.headers["access-control-allow-origin"], "*");

    const health = await fetch(`${baseUrl}/api/health`, {
      headers: {
        authorization: "Bearer cors-test-token",
        origin: allowedOrigin,
        "sec-fetch-site": "cross-site"
      }
    });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("access-control-allow-origin"), allowedOrigin);
    assert.match(health.headers.get("vary"), /(?:^|,\s*)Origin(?:,|$)/i);

    const research = await fetch(`${baseUrl}/api/runs/research`, {
      method: "POST",
      headers: {
        authorization: "Bearer cors-test-token",
        "content-type": "application/json",
        origin: allowedOrigin,
        "sec-fetch-site": "cross-site"
      },
      body: JSON.stringify({ seeds: ["https://example.com"], maxPages: 1 })
    });
    assert.equal(research.status, 200);
    assert.equal(research.headers.get("access-control-allow-origin"), allowedOrigin);
  } finally {
    await close(server);
  }
});

test("CORS rejects unlisted, null, malformed, and origin-less cross-site requests", async () => {
  const server = createMaqamServer({
    allowedUiOrigins: ["https://console.example"],
    crawlerTool: async () => []
  });
  const baseUrl = await listen(server);
  try {
    for (const origin of [
      "https://attacker.example",
      "null",
      "https://console.example/"
    ]) {
      const response = await rawRequest(`${baseUrl}/api/health`, {
        headers: { Origin: origin, "Sec-Fetch-Site": "cross-site" }
      });
      assert.equal(response.status, 403);
      assert.equal(response.headers["access-control-allow-origin"], undefined);
      assert.match(response.headers.vary, /(?:^|,\s*)Origin(?:,|$)/i);
    }

    const missingOriginPreflight = await rawRequest(`${baseUrl}/api/runs/research`, {
      method: "OPTIONS",
      headers: { "Access-Control-Request-Method": "POST" }
    });
    assert.equal(missingOriginPreflight.status, 403);
    assert.equal(missingOriginPreflight.headers["access-control-allow-origin"], undefined);

    const originlessCrossSite = await rawRequest(`${baseUrl}/api/health`, {
      headers: { "Sec-Fetch-Site": "cross-site" }
    });
    assert.equal(originlessCrossSite.status, 403);
  } finally {
    await close(server);
  }
});

test("same-origin and origin-less local API requests retain their behavior", async () => {
  const server = createMaqamServer({ crawlerTool: async () => [] });
  const baseUrl = await listen(server);
  try {
    const sameOrigin = await fetch(`${baseUrl}/api/health`, {
      headers: { origin: baseUrl, "sec-fetch-site": "same-origin" }
    });
    assert.equal(sameOrigin.status, 200);
    assert.equal(sameOrigin.headers.get("access-control-allow-origin"), baseUrl);
    assert.notEqual(sameOrigin.headers.get("access-control-allow-origin"), "*");

    const withoutOrigin = await fetch(`${baseUrl}/api/health`);
    assert.equal(withoutOrigin.status, 200);
    assert.equal(withoutOrigin.headers.get("access-control-allow-origin"), null);
    assert.match(withoutOrigin.headers.get("vary"), /(?:^|,\s*)Origin(?:,|$)/i);
  } finally {
    await close(server);
  }
});

test("UI origin configuration accepts only exact serialized HTTP(S) origins", () => {
  for (const value of [
    "*",
    "null",
    "https://console.example/",
    "https://console.example/path",
    "https://user@example.com"
  ]) {
    assert.throws(
      () => createMaqamServer({ allowedUiOrigins: [value] }),
      /exact HTTP\(S\) origins/
    );
  }
});

test("crawler and source allowlists accept only exact canonical HTTP(S) origins", () => {
  for (const key of ["allowedOrigins", "sourceAllowedOrigins"]) {
    for (const value of [
      "*",
      "https://allowed.example/",
      "https://allowed.example/path",
      "https://user@allowed.example",
      "HTTPS://ALLOWED.EXAMPLE"
    ]) {
      assert.throws(
        () => createMaqamServer({ [key]: [value] }),
        new RegExp(`${key} server option accepts only exact canonical HTTP\\(S\\) origins`)
      );
    }
  }
});

test("research requests cannot broaden server network policy", async () => {
  let crawlerCalls = 0;
  const server = createMaqamServer({ crawlerTool: async () => { crawlerCalls += 1; return []; } });
  const baseUrl = await listen(server);
  try {
    for (const override of [
      { allowedOrigins: ["http://127.0.0.1"] },
      { allowPrivateNetworks: true }
    ]) {
      const response = await fetch(`${baseUrl}/api/runs/research`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seeds: ["https://example.com"], ...override })
      });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /cannot be broadened/i);
    }

    const crossOrigin = await fetch(`${baseUrl}/api/runs/research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seeds: ["https://example.com"], sameOrigin: false })
    });
    assert.equal(crossOrigin.status, 400);
    assert.equal(crawlerCalls, 0);
  } finally {
    await close(server);
  }
});

test("server-side origin allowlists are enforced before invoking a crawler", async () => {
  let crawlerCalls = 0;
  const server = createMaqamServer({
    allowedOrigins: ["https://allowed.example"],
    crawlerTool: async () => { crawlerCalls += 1; return []; }
  });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/runs/research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seeds: ["https://outside.example"] })
    });
    assert.equal(response.status, 403);
    assert.equal(crawlerCalls, 0);
  } finally {
    await close(server);
  }
});

test("API authentication protects every API route when configured", async () => {
  const server = createMaqamServer({ apiToken: "test-server-token", crawlerTool: async () => [] });
  const baseUrl = await listen(server);
  try {
    const anonymous = await fetch(`${baseUrl}/api/health`);
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get("www-authenticate"), "Bearer");

    const authenticated = await fetch(`${baseUrl}/api/health`, {
      headers: { authorization: "Bearer test-server-token" }
    });
    assert.equal(authenticated.status, 200);
  } finally {
    await close(server);
  }
});

test("non-loopback startup requires both an API token and explicit Host allowlist", () => {
  assert.throws(
    () => startMaqamServer({ host: "0.0.0.0", port: 0 }),
    /requires MAQAM_API_TOKEN|apiToken/
  );
  assert.throws(
    () => startMaqamServer({ host: "0.0.0.0", port: 0, apiToken: "configured" }),
    /requires an explicit allowedHosts list/
  );
});

test("server authority options must be explicit own data properties", () => {
  const authorityFields = [
    ["apiToken", "inherited-token"],
    ["allowedHosts", ["localhost"]],
    ["publicDir", process.cwd()],
    ["crawlerTool", async () => []],
    ["allowedOrigins", ["https://example.com"]],
    ["sourceAllowedOrigins", ["https://example.com"]],
    ["allowedUiOrigins", ["https://example.com"]],
    ["allowPrivateNetworks", true],
    ["allowCrossOriginCrawls", true],
    ["sourceAdapters", []],
    ["host", "0.0.0.0"]
  ];
  for (const [key, value] of authorityFields) {
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
    try {
      Object.defineProperty(Object.prototype, key, { value, configurable: true });
      assert.throws(
        () => createMaqamServer(),
        new RegExp(`Inherited Maqam server options field '${key}'`)
      );
    } finally {
      if (previous) Object.defineProperty(Object.prototype, key, previous);
      else delete Object.prototype[key];
    }
  }

  const previousToken = Object.getOwnPropertyDescriptor(Object.prototype, "apiToken");
  const previousHosts = Object.getOwnPropertyDescriptor(Object.prototype, "allowedHosts");
  try {
    Object.defineProperty(Object.prototype, "apiToken", { value: "forged", configurable: true });
    Object.defineProperty(Object.prototype, "allowedHosts", { value: ["localhost"], configurable: true });
    assert.throws(
      () => startMaqamServer({ host: "0.0.0.0", port: 0 }),
      /Inherited Maqam server options field/
    );
  } finally {
    if (previousToken) Object.defineProperty(Object.prototype, "apiToken", previousToken);
    else delete Object.prototype.apiToken;
    if (previousHosts) Object.defineProperty(Object.prototype, "allowedHosts", previousHosts);
    else delete Object.prototype.allowedHosts;
  }
});

test("server construction snapshots arrays and rejects accessors without invocation", async () => {
  const options = { apiToken: "configured", allowedHosts: ["localhost"] };
  const server = createMaqamServer(options);
  options.allowedHosts.length = 0;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", resolve);
  });
  await close(server);

  let getterCalls = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "apiToken", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "forged";
    }
  });
  assert.throws(() => createMaqamServer(accessorOptions), /own enumerable data property/);
  assert.equal(getterCalls, 0);
});

test("raw embedded servers fail closed on non-loopback or implicit TCP binding", async () => {
  for (const listenArgs of [
    [0, "0.0.0.0"],
    [{ port: 0, host: "::" }],
    [{ path: "ignored.sock", port: 0, host: "0.0.0.0" }],
    [0]
  ]) {
    const server = createMaqamServer();
    assert.throws(
      () => server.listen(...listenArgs),
      /requires MAQAM_API_TOKEN|apiToken/
    );
    assert.equal(server.listening, false);
  }

  const missingHosts = createMaqamServer({ apiToken: "configured" });
  assert.throws(
    () => missingHosts.listen(0, "0.0.0.0"),
    /requires an explicit allowedHosts list/
  );
  assert.equal(missingHosts.listening, false);
});

test("raw embedded servers reject listen options that disguise existing handles as IPC", async () => {
  const donor = createNetServer();
  await new Promise((resolve, reject) => {
    donor.once("error", reject);
    donor.listen(0, "0.0.0.0", resolve);
  });
  try {
    const server = createMaqamServer();
    assert.throws(
      () => server.listen({ path: "ignored.sock", host: "127.0.0.1", handle: donor._handle }),
      /requires MAQAM_API_TOKEN|apiToken/
    );
    assert.equal(server.listening, false);

    for (const options of [
      { path: "ignored.sock", _handle: {} },
      { path: "ignored.sock", fd: 0 }
    ]) {
      const guarded = createMaqamServer();
      assert.throws(() => guarded.listen(options), /requires MAQAM_API_TOKEN|apiToken/);
      assert.equal(guarded.listening, false);
    }

    const ipcPath = process.platform === "win32"
      ? `\\\\.\\pipe\\maqam-prototype-${process.pid}-${Date.now()}`
      : join(tmpdir(), `maqam-prototype-${process.pid}-${Date.now()}.sock`);
    const ipcServer = createMaqamServer();
    let resolveListen;
    let rejectListen;
    const listening = new Promise((resolve, reject) => {
      resolveListen = resolve;
      rejectListen = reject;
    });
    ipcServer.once("error", rejectListen);
    const previousHandleDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "handle");
    try {
      Object.defineProperty(Object.prototype, "handle", {
        value: donor._handle,
        configurable: true
      });
      ipcServer.listen({ path: ipcPath }, resolveListen);
    } finally {
      if (previousHandleDescriptor) {
        Object.defineProperty(Object.prototype, "handle", previousHandleDescriptor);
      } else {
        delete Object.prototype.handle;
      }
    }
    await listening;
    try {
      assert.equal(typeof ipcServer.address(), "string");
    } finally {
      await close(ipcServer);
      if (process.platform !== "win32") await rm(ipcPath, { force: true });
    }
  } finally {
    await close(donor);
  }
});

test("raw embedded servers snapshot listen options and reject accessor-backed hosts", () => {
  let getterCalls = 0;
  const options = { port: 0 };
  Object.defineProperty(options, "host", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return getterCalls === 1 ? "127.0.0.1" : "0.0.0.0";
    }
  });
  const server = createMaqamServer();
  assert.throws(() => server.listen(options), /own data property/);
  assert.equal(getterCalls, 0);
  assert.equal(server.listening, false);

  const coercibleHost = createMaqamServer();
  assert.throws(
    () => coercibleHost.listen({ port: 0, host: { toString: () => "127.0.0.1" } }),
    /requires options.apiToken/
  );
  assert.equal(coercibleHost.listening, false);
});

test("descriptor prototype pollution cannot forge raw listen options", () => {
  let getterCalls = 0;
  const options = { port: 0 };
  Object.defineProperty(options, "host", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "0.0.0.0";
    }
  });
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "value");
  const server = createMaqamServer();
  try {
    Object.defineProperty(Object.prototype, "value", {
      value: "127.0.0.1",
      configurable: true
    });
    assert.throws(() => server.listen(options), /own data property/);
  } finally {
    if (previous) Object.defineProperty(Object.prototype, "value", previous);
    else delete Object.prototype.value;
  }
  assert.equal(getterCalls, 0);
  assert.equal(server.listening, false);
});

test("raw embedded servers permit protected non-loopback binding", async () => {
  const server = createMaqamServer({
    apiToken: "embedded-test-token",
    allowedHosts: ["localhost"]
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", resolve);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const anonymous = await rawRequest(`${baseUrl}/api/health`, {
      headers: { Host: "localhost" }
    });
    assert.equal(anonymous.status, 401);

    const authenticated = await rawRequest(`${baseUrl}/api/health`, {
      headers: {
        Host: "localhost",
        authorization: "Bearer embedded-test-token"
      }
    });
    assert.equal(authenticated.status, 200);
  } finally {
    await close(server);
  }
});

test("public source runs use registry routing and gateway-authorized handler context", async () => {
  let observedInput;
  let observedContext;
  const adapter = fakeSourceAdapter({
    read: async (input, context) => {
      observedInput = input;
      observedContext = context;
      return [{
        uri: "https://source.example/result-1",
        title: "Governed result",
        text: "Evidence returned by a fake public source."
      }];
    }
  });
  const server = createMaqamServer({ sourceAdapters: [adapter] });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/runs/source`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: "web-search",
        input: { query: "governed source" },
        backendPreference: ["web-search.fake"]
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(observedInput.query, "governed source");
    assert.ok(observedContext.signal instanceof AbortSignal);
    assert.equal(observedContext.toolName, "research.web-search.fake");
    assert.deepEqual(Array.from(observedContext.toolMetadata.networkOrigins), ["https://source.example"]);
    assert.deepEqual(Array.from(observedContext.authorizedOrigins), ["https://source.example"]);
    assert.equal(observedContext.authorizationScope.originsExplicit, true);
    assert.equal(payload.source.adapter.id, "web-search.fake");
    assert.equal(payload.source.documents[0].title, "Governed result");
    assert.equal(payload.source.governance.mode, "tool-caller");
    assert.equal(payload.toolTrace[0].status, "completed");
  } finally {
    await close(server);
  }
});

test("declared source origins are denied before adapter dispatch", async () => {
  let calls = 0;
  const server = createMaqamServer({
    sourceAdapters: [fakeSourceAdapter({
      networkOrigins: ["https://blocked.example"],
      read: async () => {
        calls += 1;
        return [];
      }
    })],
    sourceAllowedOrigins: ["https://allowed.example"]
  });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/runs/source`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "web-search", input: { query: "blocked" } })
    });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /not allowed/i);
    assert.equal(calls, 0);
  } finally {
    await close(server);
  }
});

test("source API derives a restrictive default origin scope from handler declarations", async () => {
  let calls = 0;
  const server = createMaqamServer({
    sourceAdapters: [fakeSourceAdapter({
      networkOrigins: ["https://source.example"],
      read: async () => {
        calls += 1;
        return [];
      }
    })]
  });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/runs/source`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: "web-search",
        input: { url: "https://outside.example/result" }
      })
    });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /not allowed/i);
    assert.equal(calls, 0);
  } finally {
    await close(server);
  }
});

test("crawler and public-source origin allowlists remain independent", async () => {
  let calls = 0;
  const server = createMaqamServer({
    allowedOrigins: ["https://crawl-only.example"],
    sourceAdapters: [fakeSourceAdapter({
      networkOrigins: ["https://source.example"],
      read: async () => {
        calls += 1;
        return [{ uri: "https://source.example/result", text: "independent" }];
      }
    })]
  });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/runs/source`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "web-search", input: { query: "independent" } })
    });
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
  } finally {
    await close(server);
  }
});

test("public source route cannot opt into authenticated adapters", async () => {
  let calls = 0;
  const server = createMaqamServer({
    sourceAdapters: [fakeSourceAdapter({
      authentication: "required",
      read: async () => {
        calls += 1;
        return [];
      }
    })]
  });
  const baseUrl = await listen(server);
  try {
    const denied = await fetch(`${baseUrl}/api/runs/source`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "web-search", input: { query: "private" } })
    });
    assert.equal(denied.status, 403);
    assert.equal(calls, 0);

    const override = await fetch(`${baseUrl}/api/runs/source`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: "web-search",
        input: { query: "private" },
        allowAuthenticated: true
      })
    });
    assert.equal(override.status, 400);
    assert.equal(calls, 0);
  } finally {
    await close(server);
  }
});

test("source status runs bounded selected checks without invoking reads", async () => {
  let checks = 0;
  let reads = 0;
  const adapter = fakeSourceAdapter({
    read: async () => {
      reads += 1;
      return [];
    },
    check: async ({ signal }) => {
      checks += 1;
      assert.ok(signal instanceof AbortSignal);
      return {
        status: "ready",
        message: "Offline fake check passed.",
        details: { offline: true }
      };
    }
  });
  const server = createMaqamServer({ sourceAdapters: [adapter] });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(
      `${baseUrl}/api/sources/status?channel=web-search&adapterId=web-search.fake&timeoutMs=1000`
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.doctor.status, "ready");
    assert.equal(payload.doctor.checks[0].adapter.id, "web-search.fake");
    assert.equal(payload.doctor.checks[0].details.offline, true);
    assert.equal(checks, 1);
    assert.equal(reads, 0);

    for (const suffix of ["?unknown=true", "?timeoutMs=1&timeoutMs=2", "?timeoutMs=10001"]) {
      const invalid = await fetch(`${baseUrl}/api/sources/status${suffix}`);
      assert.equal(invalid.status, 400);
    }
    assert.equal(checks, 1);
  } finally {
    await close(server);
  }
});

test("source API enforces token and exact CORS controls", async () => {
  let calls = 0;
  const origin = "https://console.example";
  const server = createMaqamServer({
    apiToken: "source-token",
    allowedUiOrigins: [origin],
    sourceAdapters: [fakeSourceAdapter({
      read: async () => {
        calls += 1;
        return [{ uri: "https://source.example/result", text: "ok" }];
      }
    })]
  });
  const baseUrl = await listen(server);
  try {
    const anonymous = await fetch(`${baseUrl}/api/runs/source`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "web-search", input: { query: "auth" } })
    });
    assert.equal(anonymous.status, 401);
    assert.equal(calls, 0);

    const authorized = await fetch(`${baseUrl}/api/runs/source`, {
      method: "POST",
      headers: {
        authorization: "Bearer source-token",
        "content-type": "application/json",
        origin,
        "sec-fetch-site": "cross-site"
      },
      body: JSON.stringify({ channel: "web-search", input: { query: "auth" } })
    });
    assert.equal(authorized.status, 200);
    assert.equal(authorized.headers.get("access-control-allow-origin"), origin);
    assert.equal(calls, 1);
  } finally {
    await close(server);
  }
});

test("source request, result count, and serialized output stay bounded", async () => {
  let calls = 0;
  const adapter = fakeSourceAdapter({
    read: async (input) => {
      calls += 1;
      if (input.mode === "many") {
        return Array.from({ length: 26 }, (_, index) => ({
          uri: `https://source.example/${index}`,
          text: `result ${index}`
        }));
      }
      return [{
        uri: "https://source.example/large",
        text: "x".repeat(200_000)
      }];
    }
  });
  const server = createMaqamServer({ sourceAdapters: [adapter] });
  const baseUrl = await listen(server);
  const post = (body) => fetch(`${baseUrl}/api/runs/source`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  try {
    const oversizedInput = await post({
      channel: "web-search",
      input: { query: "q".repeat(10_001) }
    });
    assert.equal(oversizedInput.status, 400);
    assert.equal(calls, 0);

    const tooMany = await post({ channel: "web-search", input: { mode: "many" } });
    assert.equal(tooMany.status, 502);
    assert.equal(calls, 1);

    const compacted = await post({ channel: "web-search", input: { mode: "large" } });
    const payload = await compacted.json();
    assert.equal(compacted.status, 200);
    assert.equal(payload.source.documents[0].text.length, 50_000);
    assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 4 * 1024 * 1024);

    const oversizedBody = await fetch(`${baseUrl}/api/runs/source`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "web-search", padding: "x".repeat(130 * 1024) })
    });
    assert.equal(oversizedBody.status, 413);
  } finally {
    await close(server);
  }
});

test("source adapter options are validated and snapshotted without invoking accessors", async () => {
  assert.throws(
    () => createMaqamServer({ sourceAdapters: {} }),
    /sourceAdapters must be an array/
  );
  assert.throws(
    () => createMaqamServer({
      sourceAdapters: [{ id: "missing.read", channel: "web", toolName: "missing.read" }]
    }),
    /requires a read handler/
  );
  assert.throws(
    () => createMaqamServer({ sourceAdapters: [fakeSourceAdapter(), fakeSourceAdapter()] }),
    /already registered/
  );
  assert.throws(
    () => createMaqamServer({
      sourceAdapters: [fakeSourceAdapter({ networkOrigins: ["https://source.example/"] })]
    }),
    /exact HTTP\(S\) origins/
  );

  let getterCalls = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "sourceAdapters", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return [];
    }
  });
  assert.throws(() => createMaqamServer(accessorOptions), /own enumerable data property/);
  assert.equal(getterCalls, 0);

  let calls = 0;
  const origins = ["https://blocked.example"];
  const adapters = [fakeSourceAdapter({
    networkOrigins: origins,
    read: async () => {
      calls += 1;
      return [];
    }
  })];
  const server = createMaqamServer({
    sourceAdapters: adapters,
    sourceAllowedOrigins: ["https://allowed.example"]
  });
  adapters.length = 0;
  origins[0] = "https://allowed.example";
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/runs/source`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "web-search", input: { query: "mutation" } })
    });
    assert.equal(response.status, 403);
    assert.equal(calls, 0);
  } finally {
    await close(server);
  }
});

test("package server subpath exposes server APIs", async () => {
  const serverModule = await import("maqam/server");
  assert.equal(serverModule.createMaqamServer, createMaqamServer);
  assert.equal(serverModule.startMaqamServer, startMaqamServer);
});
