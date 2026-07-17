import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, test } from "node:test";
import { crawl, crawlDetailed, extractPage } from "../src/index.js";

const servers = new Set();

async function listen(handler) {
  const server = createServer(handler);
  servers.add(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  })));
  servers.clear();
});

const localOptions = {
  obeyRobots: false,
  allowPrivateNetworks: true,
  delayMs: 0,
  maxRetries: 0
};

const fixturePageHtml = "<main><h1>Crawler fixture page</h1></main>";

test("maxPages is exact under concurrency and onPage fires only for returned pages", async () => {
  let hits = 0;
  const baseUrl = await listen((request, response) => {
    hits += 1;
    response.setHeader("content-type", "text/html");
    response.end(fixturePageHtml);
  });
  const observed = [];
  const pages = await crawl({
    ...localOptions,
    seeds: Array.from({ length: 8 }, (_, index) => `${baseUrl}/page-${index}`),
    maxPages: 3,
    concurrency: 8,
    onPage: (page) => observed.push(page.url)
  });

  assert.equal(pages.length, 3);
  assert.equal(observed.length, 3);
  assert.equal(hits, 3);
});

test("crawler performs concurrent fetches while preserving per-origin start delay", async () => {
  let active = 0;
  let maxActive = 0;
  const starts = [];
  const baseUrl = await listen(async (request, response) => {
    starts.push(Date.now());
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 90));
    active -= 1;
    response.setHeader("content-type", "text/html");
    response.end(fixturePageHtml);
  });

  const pages = await crawl({
    ...localOptions,
    seeds: ["/a", "/b", "/c"].map((path) => `${baseUrl}${path}`),
    maxPages: 3,
    concurrency: 3,
    delayMs: 80
  });

  assert.equal(pages.length, 3);
  assert.ok(maxActive >= 2, `expected overlapping requests, observed maxActive=${maxActive}`);
  const sorted = starts.toSorted((a, b) => a - b);
  for (let index = 1; index < sorted.length; index += 1) {
    assert.ok(sorted[index] - sorted[index - 1] >= 35, `request gap was ${sorted[index] - sorted[index - 1]}ms`);
  }
});

test("request budget is enforced atomically under concurrency", async () => {
  const baseUrl = await listen(async (request, response) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    response.setHeader("content-type", "text/html");
    response.end("<main>ok</main>");
  });

  await assert.rejects(
    () => crawlDetailed({
      ...localOptions,
      seeds: ["/a", "/b", "/c"].map((path) => `${baseUrl}${path}`),
      maxPages: 3,
      maxRequests: 2,
      concurrency: 3
    }),
    (error) => error.code === "CRAWL_REQUEST_LIMIT"
  );
});

test("crawler validates numeric limits instead of silently coercing unsafe values", async () => {
  for (const input of [
    { maxPages: 0 },
    { concurrency: 0 },
    { delayMs: -1 },
    { maxRequests: 1.5 },
    { maxDurationMs: Infinity }
  ]) {
    await assert.rejects(
      () => crawl({ seeds: ["https://example.com"], ...input }),
      TypeError
    );
  }
});

test("crawler enforces seed and extracted-link collection limits", async () => {
  await assert.rejects(
    () => crawl({
      seeds: ["https://one.example", "https://two.example"],
      maxSeeds: 1
    }),
    /seeds exceeds maxSeeds/
  );

  const page = extractPage(
    '<main><a href="/one">one</a><a href="/two">two</a><a href="/three">three</a></main>',
    "https://example.com/",
    { maxLinksPerPage: 2 }
  );
  assert.deepEqual(page.links, ["https://example.com/one", "https://example.com/two"]);
});

test("robots retrieval failures fail closed", async () => {
  let pageHits = 0;
  const baseUrl = await listen((request, response) => {
    if (request.url === "/robots.txt") {
      response.statusCode = 500;
      response.end("temporarily unavailable");
      return;
    }
    pageHits += 1;
    response.setHeader("content-type", "text/html");
    response.end("<main>must not be fetched</main>");
  });

  const result = await crawlDetailed({
    seeds: [`${baseUrl}/page`],
    allowPrivateNetworks: true,
    delayMs: 0,
    maxRetries: 0
  });

  assert.deepEqual(result.pages, []);
  assert.equal(pageHits, 0);
  assert.equal(result.stats.skippedByRobots, 1);
});

test("response bytes are capped and reported without returning partial content", async () => {
  const baseUrl = await listen((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<main>${"x".repeat(4096)}</main>`);
  });

  const result = await crawlDetailed({
    ...localOptions,
    seeds: [baseUrl],
    maxBytes: 1024
  });

  assert.equal(result.pages.length, 0);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].error, /maxBytes|too large/i);
});

test("an aborted crawl stops before issuing network requests", async () => {
  let hits = 0;
  const baseUrl = await listen((request, response) => {
    hits += 1;
    response.end("unexpected");
  });
  const controller = new AbortController();
  controller.abort(new Error("cancelled by test"));

  await assert.rejects(
    () => crawl({
      ...localOptions,
      seeds: [baseUrl],
      signal: controller.signal
    }),
    /cancelled by test|aborted/i
  );
  assert.equal(hits, 0);
});

test("onPage callbacks are detached, frozen, and bounded by maxDurationMs", async () => {
  const baseUrl = await listen((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end('<main><a href="/next">next</a></main>');
  });
  const startedAt = Date.now();

  await assert.rejects(
    () => crawl({
      ...localOptions,
      seeds: [baseUrl],
      maxDurationMs: 200,
      onPage(page) {
        assert.equal(Object.isFrozen(page), true);
        assert.equal(Object.isFrozen(page.links), true);
        return new Promise(() => {});
      }
    }),
    (error) => error.code === "CRAWL_DURATION_LIMIT"
  );
  assert.ok(Date.now() - startedAt < 1_500, "onPage escaped the total crawl deadline");
});

test("onError callbacks are detached, frozen, and bounded by maxDurationMs", async () => {
  const baseUrl = await listen((request, response) => {
    response.statusCode = 500;
    response.end("failed");
  });
  const startedAt = Date.now();

  await assert.rejects(
    () => crawlDetailed({
      ...localOptions,
      seeds: [baseUrl],
      maxDurationMs: 200,
      onError(failure) {
        assert.equal(Object.isFrozen(failure), true);
        return new Promise(() => {});
      }
    }),
    (error) => error.code === "CRAWL_DURATION_LIMIT"
  );
  assert.ok(Date.now() - startedAt < 1_500, "onError escaped the total crawl deadline");
});

test("crawler callbacks stop waiting when the caller aborts", async () => {
  const baseUrl = await listen((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<main>ok</main>");
  });
  const controller = new AbortController();

  await assert.rejects(
    () => crawl({
      ...localOptions,
      seeds: [baseUrl],
      signal: controller.signal,
      onPage() {
        setTimeout(() => controller.abort(new Error("callback cancelled")), 20);
        return new Promise(() => {});
      }
    }),
    /callback cancelled/
  );
});

test("nested sitemap traversal obeys maxSitemaps exactly", async () => {
  const sitemapHits = new Map();
  let baseUrl;
  baseUrl = await listen((request, response) => {
    if (request.url === "/robots.txt") {
      response.setHeader("content-type", "text/plain");
      response.end(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/s1.xml\n`);
      return;
    }
    if (["/s1.xml", "/s2.xml", "/s3.xml"].includes(request.url)) {
      sitemapHits.set(request.url, (sitemapHits.get(request.url) || 0) + 1);
      response.setHeader("content-type", "application/xml");
      if (request.url === "/s1.xml") {
        response.end(`<sitemapindex><sitemap><loc>${baseUrl}/s2.xml</loc></sitemap><sitemap><loc>${baseUrl}/s3.xml</loc></sitemap></sitemapindex>`);
      } else {
        response.end(`<urlset><url><loc>${baseUrl}/page${request.url[2]}</loc></url></urlset>`);
      }
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end(fixturePageHtml);
  });

  const result = await crawlDetailed({
    seeds: [`${baseUrl}/seed`],
    includeSitemaps: true,
    maxSitemaps: 2,
    maxPages: 3,
    allowPrivateNetworks: true,
    delayMs: 0,
    maxRetries: 0
  });

  assert.equal(sitemapHits.get("/s1.xml"), 1);
  assert.equal(sitemapHits.get("/s2.xml"), 1);
  assert.equal(sitemapHits.get("/s3.xml"), undefined);
  assert.ok(result.pages.some((page) => page.url.endsWith("/page2")));
  assert.equal(result.pages.some((page) => page.url.endsWith("/page3")), false);
});

test("each sitemap document is capped by maxUrlsPerSitemap", async () => {
  let baseUrl;
  baseUrl = await listen((request, response) => {
    if (request.url === "/robots.txt") {
      response.setHeader("content-type", "text/plain");
      response.end(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
      return;
    }
    if (request.url === "/sitemap.xml") {
      response.setHeader("content-type", "application/xml");
      response.end(`<urlset>${Array.from({ length: 5 }, (_, index) => (
        `<url><loc>${baseUrl}/from-sitemap-${index}</loc></url>`
      )).join("")}</urlset>`);
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end(fixturePageHtml);
  });

  const pages = await crawl({
    seeds: [`${baseUrl}/seed`],
    includeSitemaps: true,
    maxSitemaps: 1,
    maxUrlsPerSitemap: 2,
    maxPages: 10,
    allowPrivateNetworks: true,
    delayMs: 0,
    maxRetries: 0
  });
  const sitemapPages = pages.filter((page) => page.url.includes("/from-sitemap-"));
  assert.equal(sitemapPages.length, 2);
  assert.deepEqual(sitemapPages.map((page) => page.url).sort(), [
    `${baseUrl}/from-sitemap-0`,
    `${baseUrl}/from-sitemap-1`
  ]);
});

test("manual redirects retain provenance and obey maxRedirects", async () => {
  const baseUrl = await listen((request, response) => {
    if (request.url === "/start") {
      response.writeHead(302, { location: "/final" });
      response.end();
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end("<main><h1>Final</h1></main>");
  });

  const [page] = await crawl({
    ...localOptions,
    seeds: [`${baseUrl}/start`],
    maxRedirects: 1
  });
  assert.equal(page.url, `${baseUrl}/final`);
  assert.deepEqual(page.redirectChain, [{
    from: `${baseUrl}/start`,
    to: `${baseUrl}/final`,
    status: 302
  }]);

  const blocked = await crawlDetailed({
    ...localOptions,
    seeds: [`${baseUrl}/start`],
    maxRedirects: 0
  });
  assert.equal(blocked.pages.length, 0);
  assert.match(blocked.failures[0].error, /Redirect limit exceeded/);
});
