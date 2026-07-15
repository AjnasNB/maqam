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
