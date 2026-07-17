import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  createRssAtomResearchAdapter,
  createRssAtomSourceAdapter,
  parseRssAtom
} from "../src/research/adapters/rss.js";
import { ResearchSourceUnavailableError } from "../src/research/source-error.js";

const RSS_SOURCE = "https://feeds.example.com/news/feed.xml";

function rssDocument(items, channel = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"
      xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel>
        <title>Example &amp; Security</title>
        <link>https://example.com/</link>
        <description><![CDATA[<p>Governed research updates.</p>]]></description>
        <language>en-US</language>
        <lastBuildDate>Fri, 17 Jul 2026 12:00:00 GMT</lastBuildDate>
        ${channel}
        ${items}
      </channel>
    </rss>`;
}

test("parseRssAtom parses, sanitizes, resolves, deduplicates, hashes, and freezes RSS 2.0", () => {
  const xml = rssDocument(`
    <item>
      <guid isPermaLink="false">release-1</guid>
      <title><![CDATA[Release <b>one</b>]]></title>
      <link>../posts/release-1#comments</link>
      <dc:creator>Alice</dc:creator>
      <pubDate>Fri, 17 Jul 2026 10:30:00 GMT</pubDate>
      <content:encoded><![CDATA[
        <p>Hello <strong>operators</strong>.</p>
        <script>steal()</script>
        <iframe src="https://evil.example"></iframe>
        <p><a href="javascript:alert(1)">unsafe</a>
        <a href="/docs/start">safe docs</a></p>
      ]]></content:encoded>
    </item>
    <item>
      <title>Duplicate URL</title>
      <link>https://feeds.example.com/posts/release-1</link>
    </item>
    <item>
      <title>Unsafe URL</title>
      <link>file:///etc/passwd</link>
    </item>`);

  const result = parseRssAtom(xml, RSS_SOURCE);

  assert.equal(result.format, "rss2");
  assert.equal(result.sourceUrl, RSS_SOURCE);
  assert.equal(result.title, "Example & Security");
  assert.equal(result.description, "Governed research updates.");
  assert.equal(result.homeUrl, "https://example.com/");
  assert.equal(result.language, "en-US");
  assert.equal(result.updatedAt, "2026-07-17T12:00:00.000Z");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "release-1");
  assert.equal(result.items[0].url, "https://feeds.example.com/posts/release-1");
  assert.equal(result.items[0].title, "Release one");
  assert.equal(result.items[0].author, "Alice");
  assert.equal(result.items[0].publishedAt, "2026-07-17T10:30:00.000Z");
  assert.equal(result.items[0].text, "Hello operators.\n\nunsafe safe docs");
  assert.match(result.items[0].markdown, /Hello \*\*operators\*\*\./);
  assert.match(result.items[0].markdown, /unsafe \[safe docs\]\(https:\/\/feeds\.example\.com\/docs\/start\)/);
  assert.doesNotMatch(result.items[0].markdown, /javascript|script|iframe|steal/i);
  assert.equal(result.contentHash, createHash("sha256").update(xml).digest("hex"));
  assert.match(result.items[0].contentHash, /^[a-f0-9]{64}$/);
  assert.equal(result.items[0].provenance.sourceUrl, RSS_SOURCE);
  assert.equal(result.items[0].provenance.format, "rss2");
  assert.equal(result.provenance.networkAccess, false);
  assert.equal(result.provenance.parser, "maqam:rss-atom-offline-v1");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.items));
  assert.ok(Object.isFrozen(result.items[0]));
  assert.ok(Object.isFrozen(result.items[0].provenance));
  assert.throws(() => {
    result.items[0].url = "https://evil.example/";
  }, TypeError);
});

test("parseRssAtom parses Atom xml:base, authors, timestamps, XHTML, and safe alternate links", () => {
  const atom = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://example.org/journal/" xml:lang="en">
      <title type="text">Maqam Journal</title>
      <subtitle type="html">Policy &amp; evidence</subtitle>
      <updated>2026-07-17T11:00:00+02:00</updated>
      <author><name>Editorial Team</name></author>
      <link rel="self" href="feed.atom" />
      <link rel="alternate" href="../journal" />
      <entry xml:base="entries/">
        <id>tag:example.org,2026:1</id>
        <title type="html">Exact &lt;em&gt;approval&lt;/em&gt;</title>
        <link rel="alternate" href="first#discussion" />
        <published>2026-07-17T08:00:00Z</published>
        <author><name>Bob</name></author>
        <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">
          <h2>Bound call</h2><p>Run it <em>once</em>.</p>
          <object data="https://evil.example/payload">bad</object>
        </div></content>
      </entry>
      <entry>
        <id>https://example.org/journal/second</id>
        <title>Second</title>
        <updated>not-a-date</updated>
        <summary>Fallback author</summary>
      </entry>
      <entry>
        <id>urn:uuid:unsafe-without-web-link</id>
        <title>Skipped</title>
      </entry>
    </feed>`;

  const result = parseRssAtom(atom, "https://feeds.example.org/atom.xml");

  assert.equal(result.format, "atom");
  assert.equal(result.title, "Maqam Journal");
  assert.equal(result.description, "Policy & evidence");
  assert.equal(result.homeUrl, "https://example.org/journal");
  assert.equal(result.language, "en");
  assert.equal(result.author, "Editorial Team");
  assert.equal(result.updatedAt, "2026-07-17T09:00:00.000Z");
  assert.equal(result.items.length, 2);
  assert.deepEqual(
    result.items.map((entry) => entry.url),
    ["https://example.org/journal/entries/first", "https://example.org/journal/second"]
  );
  assert.equal(result.items[0].id, "tag:example.org,2026:1");
  assert.equal(result.items[0].title, "Exact approval");
  assert.equal(result.items[0].author, "Bob");
  assert.equal(result.items[0].publishedAt, "2026-07-17T08:00:00.000Z");
  assert.equal(result.items[0].text, "Bound call\n\nRun it once.");
  assert.match(result.items[0].markdown, /## Bound call/);
  assert.doesNotMatch(result.items[0].markdown, /object|payload|bad/i);
  assert.equal(result.items[1].author, "Editorial Team");
  assert.equal(result.items[1].publishedAt, null);
  assert.equal(result.items[1].text, "Fallback author");
});

test("parseRssAtom applies item, metadata, per-entry, and aggregate text bounds", () => {
  const xml = rssDocument(Array.from({ length: 5 }, (_, index) => `
    <item>
      <title>${`Title-${index}-`.padEnd(100, "x")}</title>
      <link>https://example.com/${index}</link>
      <description>${"content ".repeat(100)}</description>
    </item>`).join(""));

  const result = parseRssAtom(xml, RSS_SOURCE, {
    maxItems: 2,
    maxInputBytes: 100_000,
    maxTextChars: 128,
    maxMetadataChars: 32,
    maxTotalTextChars: 256
  });

  assert.equal(result.items.length, 2);
  assert.ok(result.items.every((entry) => entry.title.length <= 32));
  assert.ok(result.items.every((entry) => entry.text.length <= 128));
  assert.ok(result.items.every((entry) => entry.markdown.length <= 128));
  assert.ok(result.items.reduce((total, entry) => total + entry.text.length + entry.markdown.length, 0) <= 256);
});

test("parseRssAtom rejects DTD/entity input, unsupported XML, unsafe source URLs, and oversized UTF-8", () => {
  const xxe = `<?xml version="1.0"?>
    <!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
    <rss version="2.0"><channel><title>&xxe;</title></channel></rss>`;
  assert.throws(
    () => parseRssAtom(xxe, RSS_SOURCE),
    /cannot contain DTD or entity declarations/
  );
  assert.throws(
    () => parseRssAtom("<html><body>not a feed</body></html>", RSS_SOURCE),
    /must be RSS 2\.0 or Atom XML/
  );
  assert.throws(
    () => parseRssAtom("<rss><channel /></rss>", "file:///tmp/feed.xml"),
    /absolute HTTP\(S\) URL/
  );
  assert.throws(
    () => parseRssAtom("<rss><channel /></rss>", "https://user:pass@example.com/feed.xml"),
    /without credentials/
  );
  const multibyte = rssDocument(`<item><title>${"🙂".repeat(1_100)}</title><link>https://example.com/x</link></item>`);
  assert.ok(multibyte.length < 4_096);
  assert.ok(Buffer.byteLength(multibyte, "utf8") > 4_096);
  assert.throws(
    () => parseRssAtom(multibyte, RSS_SOURCE, { maxInputBytes: 4_096 }),
    /cannot exceed 4096 bytes/
  );
});

test("parseRssAtom snapshots options and rejects inherited/accessor/unknown fields without invoking getters", () => {
  const xml = rssDocument(`
    <item><title>One</title><link>https://example.com/1</link></item>
    <item><title>Two</title><link>https://example.com/2</link></item>`);
  const options = { maxItems: 1 };
  const first = parseRssAtom(xml, RSS_SOURCE, options);
  options.maxItems = 2;
  assert.equal(first.items.length, 1);

  let getterCalls = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "maxItems", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 2;
    }
  });
  assert.throws(
    () => parseRssAtom(xml, RSS_SOURCE, accessorOptions),
    /own enumerable data property/
  );
  assert.equal(getterCalls, 0);
  assert.throws(
    () => parseRssAtom(xml, RSS_SOURCE, { surprise: true }),
    /Unknown RSS\/Atom parser options field 'surprise'/
  );
  for (const key of ["maxItems", "maxInputBytes", "maxTextChars", "maxMetadataChars", "maxTotalTextChars"]) {
    assert.throws(
      () => parseRssAtom(xml, RSS_SOURCE, { [key]: null }),
      new RegExp(`parser option ${key} must be a safe integer`)
    );
  }

  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "maxItems");
  try {
    Object.defineProperty(Object.prototype, "maxItems", { value: 999, configurable: true });
    assert.throws(
      () => parseRssAtom(xml, RSS_SOURCE, {}),
      /Inherited RSS\/Atom parser options field 'maxItems'/
    );
  } finally {
    if (previous) Object.defineProperty(Object.prototype, "maxItems", previous);
    else delete Object.prototype.maxItems;
  }
});

test("createRssAtomResearchAdapter only uses its governed host reader and records response provenance", async () => {
  const originalFetch = globalThis.fetch;
  let globalFetchCalls = 0;
  globalThis.fetch = async () => {
    globalFetchCalls += 1;
    throw new Error("global fetch must not be used");
  };
  try {
    let calls = 0;
    const options = { maxItems: 1, maxInputBytes: 8_192 };
    const adapter = createRssAtomResearchAdapter(async (request, context) => {
      calls += 1;
      assert.ok(Object.isFrozen(request));
      assert.ok(Object.isFrozen(request.acceptedFormats));
      assert.deepEqual([...request.acceptedFormats], ["rss2", "atom"]);
      assert.equal(request.url, RSS_SOURCE);
      assert.equal(request.maxBytes, 8_192);
      assert.equal(context.authorizationScope, "governed-test");
      return {
        body: rssDocument(`
          <item><title>One</title><link>https://example.com/1</link></item>
          <item><title>Two</title><link>https://example.com/2</link></item>`),
        finalUrl: "https://cdn.example.com/final.xml",
        status: 200,
        contentType: "application/rss+xml; charset=utf-8",
        retrievedAt: "2026-07-17T12:34:56+00:00"
      };
    }, options);
    options.maxItems = 500;

    const input = { url: RSS_SOURCE };
    const pending = adapter(input, { authorizationScope: "governed-test" });
    input.url = "https://evil.example/feed.xml";
    const result = await pending;

    assert.equal(calls, 1);
    assert.equal(globalFetchCalls, 0);
    assert.equal(result.items.length, 1);
    assert.equal(result.sourceUrl, "https://cdn.example.com/final.xml");
    assert.equal(result.provenance.requestedUrl, RSS_SOURCE);
    assert.equal(result.provenance.finalUrl, "https://cdn.example.com/final.xml");
    assert.equal(result.provenance.status, 200);
    assert.equal(result.provenance.contentType, "application/rss+xml; charset=utf-8");
    assert.equal(result.provenance.retrievedAt, "2026-07-17T12:34:56.000Z");
    assert.equal(result.provenance.parserNetworkAccess, false);
    assert.equal(result.provenance.retrieval, "host-supplied-reader");
    assert.equal(result.provenance.retrievalNetworkAccess, "host-defined");
    assert.equal(Object.hasOwn(result.provenance, "networkAccess"), false);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.provenance));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createRssAtomResearchAdapter accepts string bodies and rejects hostile reader records", async () => {
  const adapter = createRssAtomResearchAdapter(async () => rssDocument(
    "<item><title>One</title><link>https://example.com/1</link></item>"
  ));
  const result = await adapter({ url: RSS_SOURCE });
  assert.equal(result.items.length, 1);
  assert.equal(result.provenance.finalUrl, RSS_SOURCE);
  assert.equal(result.provenance.status, null);

  let getterCalls = 0;
  const hostileResponse = {};
  Object.defineProperty(hostileResponse, "body", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return rssDocument("");
    }
  });
  const hostileAdapter = createRssAtomResearchAdapter(async () => hostileResponse);
  await assert.rejects(
    () => hostileAdapter({ url: RSS_SOURCE }),
    /own enumerable data property/
  );
  assert.equal(getterCalls, 0);

  await assert.rejects(
    () => adapter({ url: "https://user:pass@example.com/feed.xml" }),
    /without credentials/
  );
  assert.throws(
    () => createRssAtomResearchAdapter(null),
    /host-supplied readDocument function/
  );
  for (const field of ["url", "finalUrl"]) {
    const invalidUrlAdapter = createRssAtomResearchAdapter(async () => ({
      body: rssDocument(""),
      [field]: null
    }));
    await assert.rejects(
      () => invalidUrlAdapter({ url: RSS_SOURCE }),
      /Feed URL must be a non-empty string/
    );
  }
  const shadowedInvalidUrlAdapter = createRssAtomResearchAdapter(async () => ({
    body: rssDocument(""),
    url: null,
    finalUrl: RSS_SOURCE
  }));
  await assert.rejects(
    () => shadowedInvalidUrlAdapter({ url: RSS_SOURCE }),
    /Feed URL must be a non-empty string/
  );
});

test("RSS/Atom reader HTTP status controls parsing and fallback eligibility", async (t) => {
  const body = rssDocument(
    "<item><title>One</title><link>https://example.com/1</link></item>"
  );
  const cases = [
    [401, "AUTHENTICATION_HTTP_401", false],
    [403, "AUTHORIZATION_HTTP_403", false],
    [404, "RESEARCH_SOURCE_UNAVAILABLE", true],
    [410, "RESEARCH_SOURCE_UNAVAILABLE", true],
    [500, "RESEARCH_SOURCE_HTTP_ERROR", false]
  ];

  for (const [status, code, unavailable] of cases) {
    await t.test(String(status), async () => {
      const adapter = createRssAtomResearchAdapter(async () => ({
        body,
        finalUrl: RSS_SOURCE,
        status,
        contentType: "application/rss+xml"
      }));
      await assert.rejects(
        () => adapter({ url: RSS_SOURCE }),
        (error) => error.code === code
          && (error instanceof ResearchSourceUnavailableError) === unavailable
      );
    });
  }
});

test("createRssAtomSourceAdapter emits registry-ready ResearchDocument inputs", async () => {
  const adapter = createRssAtomSourceAdapter(async () => rssDocument(`
    <item>
      <guid>source-adapter-1</guid>
      <title>Source adapter entry</title>
      <link>https://example.com/source-adapter-1</link>
      <description>Normalized through the governed source boundary.</description>
    </item>`));

  assert.equal(adapter.id, "rss-atom.direct");
  assert.equal(adapter.channel, "rss-atom");
  assert.equal(adapter.toolName, "research.rss-atom.direct");
  assert.equal(adapter.metadata.parserNetworkAccess, false);
  assert.equal(adapter.metadata.implicitNetworkAccess, false);
  assert.equal(Object.hasOwn(adapter.metadata, "networkAccess"), false);
  const documents = await adapter.read({ url: RSS_SOURCE }, {});
  assert.equal(documents.length, 1);
  assert.equal(documents[0].uri, "https://example.com/source-adapter-1");
  assert.equal(documents[0].text, "Normalized through the governed source boundary.");
  assert.equal(documents[0].metadata.feed.format, "rss2");
  assert.equal(documents[0].citations[0].uri, RSS_SOURCE);
  const check = await adapter.check({});
  assert.equal(check.status, "ready");
  assert.equal(check.details.liveVerified, false);
});
