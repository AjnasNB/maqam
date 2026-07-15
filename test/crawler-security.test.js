import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, test } from "node:test";
import {
  classifyIpAddress,
  crawl,
  createCrawlerTool,
  resolveUrlTarget
} from "../src/index.js";

const servers = new Set();

async function listen(handler) {
  const server = createServer(handler);
  servers.add(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`
  };
}

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  })));
  servers.clear();
});

test("crawler IP classification rejects non-public and IPv4-mapped address ranges", () => {
  assert.deepEqual(classifyIpAddress("127.0.0.1"), {
    address: "127.0.0.1",
    family: 4,
    range: "loopback",
    isPublic: false
  });
  assert.equal(classifyIpAddress("10.0.0.1").range, "private");
  assert.equal(classifyIpAddress("169.254.169.254").range, "linkLocal");
  assert.equal(classifyIpAddress("::1").range, "loopback");
  assert.equal(classifyIpAddress("::ffff:127.0.0.1").range, "loopback");
  assert.equal(classifyIpAddress("224.0.0.1").range, "multicast");
  assert.equal(classifyIpAddress("8.8.8.8").isPublic, true);
});

test("resolveUrlTarget blocks direct, alternate-form, and mixed-DNS private targets", async () => {
  for (const url of [
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/"
  ]) {
    await assert.rejects(
      () => resolveUrlTarget(url),
      (error) => error.code === "CRAWLER_URL_BLOCKED"
    );
  }

  await assert.rejects(
    () => resolveUrlTarget("https://mixed.example/", {
      lookup: async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 }
      ]
    }),
    (error) => (
      error.code === "CRAWLER_URL_BLOCKED"
      && error.details.address === "127.0.0.1"
    )
  );
});

test("private-network opt-in is explicit and never permits link-local or multicast targets", async () => {
  const target = await resolveUrlTarget("http://127.0.0.1/", { allowPrivateNetworks: true });
  assert.equal(target.address, "127.0.0.1");

  for (const address of ["168.63.129.16", "169.254.169.254", "224.0.0.1", "0.0.0.0"]) {
    await assert.rejects(
      () => resolveUrlTarget(`http://${address}/`, { allowPrivateNetworks: true }),
      (error) => error.code === "CRAWLER_URL_BLOCKED"
    );
  }

  await assert.rejects(
    () => resolveUrlTarget("http://[fd00:ec2::254]/", { allowPrivateNetworks: true }),
    (error) => error.code === "CRAWLER_URL_BLOCKED"
  );
});

test("crawler authority options must be own data and cannot change after tool creation", async () => {
  const originalPrivate = Object.getOwnPropertyDescriptor(Object.prototype, "allowPrivateNetworks");
  const originalLookup = Object.getOwnPropertyDescriptor(Object.prototype, "dnsLookup");
  const defaults = { allowPrivateNetworks: false, obeyRobots: false, delayMs: 0 };
  const tool = createCrawlerTool(defaults);
  defaults.allowPrivateNetworks = true;

  const { url } = await listen((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<main><h1>must not be reached</h1></main>");
  });

  try {
    Object.defineProperty(Object.prototype, "allowPrivateNetworks", {
      value: true,
      configurable: true
    });
    Object.defineProperty(Object.prototype, "dnsLookup", {
      value: async () => [{ address: "127.0.0.1", family: 4 }],
      configurable: true
    });
    await assert.rejects(
      () => resolveUrlTarget("http://127.0.0.1/"),
      /Inherited resolveUrlTarget options field 'allowPrivateNetworks'/
    );
    await assert.rejects(
      () => crawl({ seeds: [url], obeyRobots: false, delayMs: 0 }),
      /Inherited crawlDetailed input field 'allowPrivateNetworks'/
    );
  } finally {
    if (originalPrivate) Object.defineProperty(Object.prototype, "allowPrivateNetworks", originalPrivate);
    else delete Object.prototype.allowPrivateNetworks;
    if (originalLookup) Object.defineProperty(Object.prototype, "dnsLookup", originalLookup);
    else delete Object.prototype.dnsLookup;
  }

  assert.equal(tool.governance.safeDefaults.allowPrivateNetworks, false);
  await assert.rejects(
    () => tool({ seeds: [url] }),
    (error) => error.code === "CRAWLER_URL_BLOCKED"
  );
});

test("crawler option accessors are rejected without invocation", async () => {
  let getterCalls = 0;
  const options = {};
  Object.defineProperty(options, "allowPrivateNetworks", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    }
  });
  await assert.rejects(
    () => resolveUrlTarget("http://127.0.0.1/", options),
    /own enumerable data property/
  );
  assert.equal(getterCalls, 0);
});

test("crawler blocks loopback by default and permits it only with trusted opt-in", async () => {
  const { url } = await listen((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<main><h1>Local fixture</h1></main>");
  });

  await assert.rejects(
    () => crawl({ seeds: [url], obeyRobots: false, delayMs: 0 }),
    (error) => error.code === "CRAWLER_URL_BLOCKED"
  );

  const pages = await crawl({
    seeds: [url],
    obeyRobots: false,
    delayMs: 0,
    allowPrivateNetworks: true
  });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].h1, "Local fixture");
});

test("cross-origin redirect is rejected before the target receives a request", async () => {
  let targetHits = 0;
  const target = await listen((request, response) => {
    targetHits += 1;
    response.end("must not be reached");
  });
  const source = await listen((request, response) => {
    response.writeHead(302, { location: `${target.url}/private` });
    response.end();
  });

  await assert.rejects(
    () => crawl({
      seeds: [`${source.url}/start`],
      obeyRobots: false,
      delayMs: 0,
      allowPrivateNetworks: true,
      allowedOrigins: [source.url],
      sameOrigin: false
    }),
    (error) => error.code === "CRAWLER_URL_BLOCKED"
  );
  assert.equal(targetHits, 0);
});

test("DNS resolution honors AbortSignal without waiting for a stalled resolver", async () => {
  const controller = new AbortController();
  const pending = resolveUrlTarget("https://stalled.example/", {
    signal: controller.signal,
    lookup: () => new Promise(() => {})
  });
  controller.abort(new Error("stop now"));

  await assert.rejects(
    () => pending,
    (error) => error.code === "CRAWLER_URL_BLOCKED" && error.cause?.message === "stop now"
  );
});
