import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { crawl, extractPage } from "../src/index.js";

let server;
let baseUrl;

before(async () => {
  server = createServer((req, res) => {
    if (req.url === "/robots.txt") {
      res.setHeader("content-type", "text/plain");
      res.end("User-agent: *\nDisallow: /private\nSitemap: /sitemap.xml\n");
      return;
    }
    if (req.url === "/sitemap.xml") {
      res.setHeader("content-type", "application/xml");
      res.end(`<?xml version="1.0"?><urlset><url><loc>${baseUrl}/about</loc></url></urlset>`);
      return;
    }
    if (req.url === "/") {
      res.setHeader("content-type", "text/html");
      res.end(`
        <html>
          <head>
            <title>Home</title>
            <meta name="description" content="Home description">
            <link rel="alternate" type="application/rss+xml" href="/feed.xml">
          </head>
          <body><main><h1>Home page</h1><p>Hello crawler.</p><a href="/about">About</a><a href="/private">Private</a></main></body>
        </html>
      `);
      return;
    }
    if (req.url === "/feed.xml") {
      res.setHeader("content-type", "application/rss+xml");
      res.end(`<?xml version="1.0"?>
        <rss version="2.0"><channel>
          <title>Maqam fixture feed</title>
          <link>${baseUrl}/</link>
          <description>Governed feed updates.</description>
          <item>
            <guid>fixture-entry-1</guid>
            <title>Feed entry</title>
            <link>${baseUrl}/feed-entry</link>
            <description><![CDATA[<p>Bounded <strong>feed</strong> content.</p>]]></description>
          </item>
        </channel></rss>`);
      return;
    }
    if (req.url === "/feed-entry") {
      res.setHeader("content-type", "text/html");
      res.end("<html><body><main><h1>Feed entry</h1><p>Entry page.</p></main></body></html>");
      return;
    }
    if (req.url === "/about") {
      res.setHeader("content-type", "text/html");
      res.end("<html><body><main><h1>About</h1><p>About text.</p></main></body></html>");
      return;
    }
    if (req.url === "/private") {
      res.setHeader("content-type", "text/html");
      res.end("<html><body><main><h1>Private</h1></main></body></html>");
      return;
    }
    res.statusCode = 404;
    res.end("missing");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("extractPage returns agent-friendly fields", () => {
  const page = extractPage("<html><head><title>Test</title><link rel='alternate' type='application/atom+xml' href='/feed.atom'></head><body><main><h1>Hello</h1><p>World</p></main></body></html>", "https://example.com/");
  assert.equal(page.title, "Test");
  assert.equal(page.h1, "Hello");
  assert.match(page.markdown, /Hello/);
  assert.match(page.text, /World/);
  assert.equal(page.sourceType, "web");
  assert.deepEqual(page.feedLinks, ["https://example.com/feed.atom"]);
});

test("extractPage removes active URL schemes from Markdown and canonical metadata", () => {
  const page = extractPage(`
    <html><head><link rel="canonical" href="file:///etc/passwd"></head><body><main>
      <a href="javascript:alert(1)">unsafe link</a>
      <a href="/safe">safe link</a>
      <img alt="unsafe image" src="data:image/svg+xml,<svg onload=alert(1)>">
      <img alt="safe image" src="/safe.png">
    </main></body></html>
  `, "https://example.com/page");

  assert.equal(page.canonical, "https://example.com/page");
  assert.deepEqual(page.links, ["https://example.com/safe"]);
  assert.doesNotMatch(page.markdown, /javascript:|data:|file:/i);
  assert.match(page.markdown, /unsafe link/);
  assert.match(page.markdown, /\[safe link\]\(https:\/\/example\.com\/safe\)/);
  assert.match(page.markdown, /!\[safe image\]\(https:\/\/example\.com\/safe\.png\)/);
});

test("crawler respects robots.txt and extracts linked pages", async () => {
  const pages = await crawl({
    seeds: [`${baseUrl}/`],
    maxPages: 5,
    concurrency: 2,
    delayMs: 0,
    allowPrivateNetworks: true
  });

  const urls = pages.map((page) => new URL(page.url).pathname).sort();
  assert.deepEqual(urls, ["/", "/about"]);
  assert.equal(pages.some((page) => page.url.endsWith("/private")), false);
});

test("crawler can discover sitemap URLs", async () => {
  const pages = await crawl({
    seeds: [`${baseUrl}/`],
    includeSitemaps: true,
    maxPages: 2,
    delayMs: 0,
    allowPrivateNetworks: true
  });

  assert.ok(pages.some((page) => page.url.endsWith("/about")));
});

test("crawler parses a seeded RSS document into bounded agent-friendly records", async () => {
  const pages = await crawl({
    seeds: [`${baseUrl}/feed.xml`],
    maxPages: 1,
    maxDepth: 0,
    delayMs: 0,
    allowPrivateNetworks: true
  });

  assert.equal(pages.length, 1);
  assert.equal(pages[0].sourceType, "feed");
  assert.equal(pages[0].title, "Maqam fixture feed");
  assert.deepEqual(pages[0].links, [`${baseUrl}/feed-entry`]);
  assert.equal(pages[0].feed.format, "rss2");
  assert.equal(pages[0].feed.items[0].title, "Feed entry");
  assert.match(pages[0].feed.items[0].markdown, /Bounded \*\*feed\*\* content/);
  assert.match(pages[0].contentHash, /^sha256:[a-f0-9]{64}$/);
});

test("crawler discovers same-origin feed links only when explicitly enabled", async () => {
  const pages = await crawl({
    seeds: [`${baseUrl}/`],
    includeFeeds: true,
    maxPages: 4,
    maxDepth: 1,
    concurrency: 2,
    delayMs: 0,
    allowPrivateNetworks: true
  });

  assert.ok(pages.some((page) => page.url.endsWith("/feed.xml") && page.sourceType === "feed"));
  assert.equal(pages.some((page) => page.url.endsWith("/feed-entry")), false);
});
