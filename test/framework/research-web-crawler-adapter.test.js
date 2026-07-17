import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { PolicyEngine } from "../../src/framework/policy.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";
import {
  ResearchSourceRegistry,
  ResearchSourceUnavailableError,
  createCrawlerTool,
  createWebCrawlerSourceAdapter,
  defineResearchSourceAdapter
} from "../../src/index.js";

test("createWebCrawlerSourceAdapter routes a host crawler through its exact ToolGateway identity", async () => {
  const calls = [];
  const hostCrawler = async (input, context) => {
    calls.push({ input, toolName: context.toolName });
    return [{
      sourceType: "web",
      url: "https://example.com/research",
      canonical: "https://example.com/research",
      title: "Governed research",
      description: "One reviewed source.",
      h1: "Governed research",
      language: "en",
      text: "Policy runs before the crawler.",
      markdown: "# Governed research\n\nPolicy runs before the crawler.",
      links: ["https://example.com/evidence"],
      feedLinks: [],
      fetchedAt: "2026-07-18T00:00:00.000Z",
      status: 200,
      contentType: "text/html",
      bytes: 512,
      contentHash: "abc123",
      depth: 0,
      discoveredFrom: null,
      redirectChain: [],
      etag: null,
      lastModified: null,
      robotsAllowed: true
    }];
  };
  const source = createWebCrawlerSourceAdapter(hostCrawler);
  assert.equal(source.id, "web-crawler.direct");
  assert.equal(source.channel, "web");
  assert.equal(source.toolName, "research.web-crawler.direct");
  assert.equal(source.authentication, "none");

  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: [source.toolName],
      allowedOrigins: ["https://example.com"]
    })
  });
  gateway.registerTool(source.toolName, source.read, {
    effects: ["network:read"],
    risk: "low"
  });
  const registry = new ResearchSourceRegistry({
    adapters: [source],
    toolCaller: { call: gateway.call.bind(gateway) },
    clock: () => new Date("2026-07-18T01:00:00.000Z")
  });

  const result = await registry.route({
    channel: "web",
    input: {
      seeds: ["https://example.com/research"],
      maxPages: 1
    }
  }, { runId: "web_source_fixture" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].toolName, source.toolName);
  assert.deepEqual([...calls[0].input.seeds], ["https://example.com/research"]);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].source.adapterId, "web-crawler.direct");
  assert.equal(result.documents[0].uri, "https://example.com/research");
  assert.equal(result.documents[0].id, "abc123");
  assert.equal(result.documents[0].metadata.status, 200);
  assert.equal(result.documents[0].metadata.robotsAllowed, true);
  assert.equal(result.documents[0].retrievedAt, "2026-07-18T00:00:00.000Z");
  assert.equal(gateway.trace[0].toolName, source.toolName);
  assert.equal(gateway.trace[0].status, "completed");

  const doctor = await registry.doctor();
  assert.equal(doctor.status, "ready");
  assert.equal(doctor.checks[0].details.registrationReady, true);
  assert.equal(doctor.checks[0].details.liveVerified, false);
  assert.match(doctor.checks[0].message, /does not perform a crawl or test the network/);
  assert.equal(calls.length, 1, "offline doctor must not invoke the host crawler");
});

test("empty host crawler output is explicit unavailability and permits an ordered fallback", async () => {
  const web = createWebCrawlerSourceAdapter(async () => []);
  const fallback = defineResearchSourceAdapter({
    id: "web.fixture-fallback",
    channel: "web",
    toolName: "research.web.fixture-fallback",
    priority: 200
  });
  const calls = [];
  const registry = new ResearchSourceRegistry({
    adapters: [web, fallback],
    toolCaller: {
      call: async (toolName, input, context) => {
        calls.push(toolName);
        if (toolName === web.toolName) return web.read(input, context);
        return [{ uri: "https://example.com/fallback", text: "fallback evidence" }];
      }
    }
  });

  const result = await registry.route({ channel: "web", input: {} });
  assert.deepEqual(calls, [web.toolName, fallback.toolName]);
  assert.equal(result.adapter.id, fallback.id);
  assert.equal(result.attempts[0].status, "unavailable");
  assert.equal(result.attempts[0].classification.error.code, "RESEARCH_SOURCE_UNAVAILABLE");

  await assert.rejects(
    () => web.read({}, {}),
    (error) => error instanceof ResearchSourceUnavailableError
      && error.code === "RESEARCH_SOURCE_UNAVAILABLE"
  );
});

test("a robots-only crawler result is fatal and never dispatches a source fallback", async () => {
  let pageHits = 0;
  const server = createServer((request, response) => {
    if (request.url === "/robots.txt") {
      response.setHeader("content-type", "text/plain");
      response.end("User-agent: *\nDisallow: /blocked\n");
      return;
    }
    pageHits += 1;
    response.setHeader("content-type", "text/html");
    response.end("<main>must not be fetched</main>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    const web = createWebCrawlerSourceAdapter(createCrawlerTool({
      allowedOrigins: [origin],
      allowPrivateNetworks: true,
      delayMs: 0,
      maxPages: 1,
      maxRetries: 0
    }));
    const fallback = defineResearchSourceAdapter({
      id: "web.robots-fallback",
      channel: "web",
      toolName: "research.web.robots-fallback",
      priority: 200
    });
    let fallbackCalls = 0;
    const gateway = new ToolGateway({
      policyEngine: new PolicyEngine({
        allowedTools: [web.toolName, fallback.toolName],
        allowedOrigins: [origin]
      })
    });
    gateway.registerTool(web.toolName, web.read, {
      effects: ["network:read"],
      risk: "low"
    });
    gateway.registerTool(fallback.toolName, async () => {
      fallbackCalls += 1;
      return [{ uri: `${origin}/fallback`, text: "must not run" }];
    });
    const registry = new ResearchSourceRegistry({
      adapters: [web, fallback],
      toolCaller: { call: gateway.call.bind(gateway) }
    });

    await assert.rejects(
      () => registry.route({
        channel: "web",
        input: { seeds: [`${origin}/blocked`], maxPages: 1 }
      }, { runId: "robots_source_fixture" }),
      (error) => error.code === "ROBOTS_DENIED"
    );
    assert.equal(pageHits, 0);
    assert.equal(fallbackCalls, 0);
    assert.deepEqual(gateway.trace.map((entry) => entry.toolName), [web.toolName]);
    assert.equal(gateway.trace[0].status, "failed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("web crawler source snapshots hostile pages without invoking accessors", async () => {
  let getterCalls = 0;
  const page = {
    url: "https://example.com/safe",
    text: "safe"
  };
  Object.defineProperty(page, "title", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "forged";
    }
  });
  const source = createWebCrawlerSourceAdapter(async () => [page]);
  await assert.rejects(() => source.read({}, {}), /own enumerable data property/);
  assert.equal(getterCalls, 0);
});

test("web crawler source has no internal network or authentication fallback", async () => {
  let hostCalls = 0;
  const source = createWebCrawlerSourceAdapter(async () => {
    hostCalls += 1;
    return [{ url: "https://example.com/only-host", text: "host result" }];
  });
  const documents = await source.read({}, {});
  assert.equal(hostCalls, 1);
  assert.equal(documents[0].uri, "https://example.com/only-host");
  assert.equal(source.metadata.implicitNetworkAccess, false);
  assert.equal(source.metadata.implicitAuthentication, false);
  assert.throws(
    () => createWebCrawlerSourceAdapter(null),
    /host-supplied crawler function/
  );
});
