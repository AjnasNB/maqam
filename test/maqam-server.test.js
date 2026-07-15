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
    assert.match(html, /Governance path/);
    assert.match(html, /Adapter coverage/);
    assert.ok(capabilities.capabilities.adapters.some((adapter) => adapter.id === "codex"));
    assert.ok(capabilities.capabilities.adapters.some((adapter) => adapter.id === "claude-code"));
    assert.match(capabilities.capabilities.limitations.join(" "), /registered adapters/i);
  } finally {
    await close(server);
  }
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
    ["allowedUiOrigins", ["https://example.com"]],
    ["allowPrivateNetworks", true],
    ["allowCrossOriginCrawls", true],
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

test("package server subpath exposes server APIs", async () => {
  const serverModule = await import("maqam/server");
  assert.equal(serverModule.createMaqamServer, createMaqamServer);
  assert.equal(serverModule.startMaqamServer, startMaqamServer);
});
