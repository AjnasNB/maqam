import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker, { MEDIA_OBJECTS, parseByteRange, serveMedia } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const publicRoot = path.join(root, "public");
const ignoredDirectories = new Set(["node_modules", ".wrangler", ".wrangler-dry-run"]);

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.filter((entry) => (
    !entry.isDirectory() || !ignoredDirectories.has(entry.name)
  )).map(async (entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  }));
  return nested.flat();
};

const exists = async (candidate) => {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
};

const resolvePublicPath = async (urlPath) => {
  const clean = decodeURIComponent(urlPath.split(/[?#]/, 1)[0]);
  const relative = clean.replace(/^\/+/, "");
  const candidate = path.join(publicRoot, relative);
  if (clean.endsWith("/")) return path.join(candidate, "index.html");
  if (await exists(candidate)) return candidate;
  return path.join(candidate, "index.html");
};

const files = await walk(root);
const textFiles = files.filter((file) => /\.(?:css|html|js|jsonc|md|mjs|svg|txt|xml)$/i.test(file));
const failures = [];

for (const file of textFiles) {
  const source = await readFile(file, "utf8");
  if (source.includes("\u2014")) failures.push(`${path.relative(root, file)} contains an em dash`);
  if (source.includes("\u2013")) failures.push(`${path.relative(root, file)} contains an en dash`);
}

const htmlFiles = files.filter((file) => file.endsWith(".html"));
for (const file of htmlFiles) {
  const source = await readFile(file, "utf8");
  const label = path.relative(publicRoot, file);
  const requireMatch = (pattern, message) => {
    if (!pattern.test(source)) failures.push(`${label}: ${message}`);
  };

  requireMatch(/<html\s+lang="en">/i, "missing English document language");
  requireMatch(/<title>[^<]+<\/title>/i, "missing title");
  requireMatch(/<meta\s+name="description"\s+content="[^"]+">/i, "missing meta description");
  requireMatch(/<a\s+class="skip-link"\s+href="#main">/i, "missing skip link");
  requireMatch(/<main\b[^>]*\bid="main"/i, "missing main landmark id");

  if (/0\.2\.3|candidate pending exact release approval/i.test(source)) {
    failures.push(`${label}: contains stale pre-0.2.4 publication wording`);
  }

  const tableCount = (source.match(/<table\b/gi) || []).length;
  const captionCount = (source.match(/<caption\b/gi) || []).length;
  if (tableCount !== captionCount) {
    failures.push(`${label}: expected one caption per table; tables=${tableCount}, captions=${captionCount}`);
  }

  for (const match of source.matchAll(/<th\b([^>]*)>/gi)) {
    if (!/\bscope="(?:row|col)"/i.test(match[1])) failures.push(`${label}: table header missing row or column scope`);
  }

  for (const match of source.matchAll(/<div\s+class="table-wrap"([^>]*)>/gi)) {
    const attributes = match[1];
    if (!/\btabindex="0"/i.test(attributes) || !/\brole="region"/i.test(attributes) || !/\baria-label="[^"]+"/i.test(attributes)) {
      failures.push(`${label}: table wrapper must be a labelled keyboard-scrollable region`);
    }
  }

  if (label === "index.html") {
    requireMatch(/v0\.2\.4 is live/i, "homepage must identify the live 0.2.4 release");
    requireMatch(/maqam@0\.2\.4/i, "homepage install command must pin maqam@0.2.4");
  }

  if (label === path.join("articles", "exact-agent-approvals", "index.html")) {
    requireMatch(
      /allowedOrigins:\s*\["https:\/\/registry\.npmjs\.org"\]/,
      "runnable approval example must allow its declared registry origin"
    );
  }

  const h1Count = (source.match(/<h1\b/gi) || []).length;
  if (h1Count !== 1) failures.push(`${label}: expected one h1, found ${h1Count}`);

  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) failures.push(`${label}: duplicate ids ${[...new Set(duplicateIds)].join(", ")}`);

  for (const match of source.matchAll(/<img\b([^>]*)>/gi)) {
    if (!/\balt="[^"]*"/i.test(match[1])) failures.push(`${label}: image missing alt attribute`);
  }

  for (const match of source.matchAll(/\bdata-copy="([^"]+)"/g)) {
    const selector = match[1];
    if (!selector.startsWith("#")) {
      failures.push(`${label}: copy target must be an id selector: ${selector}`);
      continue;
    }
    const count = ids.filter((id) => id === selector.slice(1)).length;
    if (count !== 1) failures.push(`${label}: copy target ${selector} resolves ${count} times`);
  }

  for (const match of source.matchAll(/<(?:script|img|source|track)\b[^>]*\bsrc="([^"]+)"/gi)) {
    const value = match[1];
    if (/^(?:https?:)?\/\//i.test(value)) failures.push(`${label}: runtime resource is external: ${value}`);
  }
  for (const match of source.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/gi)) {
    const value = match[1];
    if (/^(?:https?:)?\/\//i.test(value)) failures.push(`${label}: stylesheet is external: ${value}`);
  }

  const localReferences = [
    ...source.matchAll(/\b(?:href|src|poster)="(\/[^"]*)"/g),
    ...source.matchAll(/<track\b[^>]*\bsrc="(\/[^"]*)"/g)
  ].map((match) => match[1]);

  for (const reference of new Set(localReferences)) {
    const pathname = reference.split(/[?#]/, 1)[0];
    if (pathname.startsWith("/media/")) {
      if (!MEDIA_OBJECTS[pathname]) failures.push(`${label}: unknown fixed media path ${pathname}`);
      continue;
    }
    const target = await resolvePublicPath(pathname);
    if (!(await exists(target))) failures.push(`${label}: missing internal target ${pathname}`);
  }
}

assert.deepEqual(parseByteRange("bytes=2-5", 10), { offset: 2, length: 4, end: 5 });
assert.deepEqual(parseByteRange("bytes=7-", 10), { offset: 7, length: 3, end: 9 });
assert.deepEqual(parseByteRange("bytes=-3", 10), { offset: 7, length: 3, end: 9 });
assert.deepEqual(parseByteRange("bytes=-30", 10), { offset: 0, length: 10, end: 9 });
assert.equal(parseByteRange(null, 10), null);
assert.equal(parseByteRange("items=1-2", 10), null);
assert.deepEqual(parseByteRange("bytes=10-11", 10), { invalid: true });
assert.deepEqual(parseByteRange("bytes=4-2", 10), { invalid: true });
assert.deepEqual(parseByteRange("bytes=1-2,4-5", 10), { invalid: true });

const bytes = new TextEncoder().encode("abcdefghij");
const uploaded = new Date("2026-07-16T08:00:00.000Z");
const metadata = {
  size: bytes.byteLength,
  etag: "etag-123",
  httpEtag: '"etag-123"',
  uploaded,
  writeHttpMetadata(headers) {
    headers.set("Content-Disposition", "inline");
  }
};
const calls = [];
const env = {
  MEDIA: {
    async head(key) {
      calls.push({ method: "head", key });
      return metadata;
    },
    async get(key, options) {
      calls.push({ method: "get", key, options });
      if (options.onlyIf?.etagMatches !== metadata.etag) return null;
      const body = options.range
        ? bytes.slice(options.range.offset, options.range.offset + options.range.length)
        : bytes;
      return { body };
    }
  },
  ASSETS: {
    async fetch() {
      return new Response("<!doctype html><title>asset</title>", {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
  }
};
const descriptor = { key: "fixture.bin", contentType: "application/octet-stream" };
const request = (headers = {}, method = "GET") => new Request("https://maqamagent.com/media/fixture", { method, headers });

let response = await serveMedia(request(), env, descriptor);
assert.equal(response.status, 200);
assert.equal(await response.text(), "abcdefghij");
assert.equal(response.headers.get("Content-Length"), "10");
assert.equal(response.headers.get("Accept-Ranges"), "bytes");
assert.equal(response.headers.get("ETag"), '"etag-123"');
assert.match(response.headers.get("Content-Security-Policy"), /default-src 'self'/);

response = await serveMedia(request({ Range: "bytes=2-5" }), env, descriptor);
assert.equal(response.status, 206);
assert.equal(await response.text(), "cdef");
assert.equal(response.headers.get("Content-Range"), "bytes 2-5/10");
assert.equal(response.headers.get("Content-Length"), "4");

response = await serveMedia(request({ Range: "bytes=-3" }, "HEAD"), env, descriptor);
assert.equal(response.status, 206);
assert.equal(response.body, null);
assert.equal(response.headers.get("Content-Range"), "bytes 7-9/10");

response = await serveMedia(request({ "If-None-Match": 'W/"etag-123"' }), env, descriptor);
assert.equal(response.status, 304);

response = await serveMedia(request({ "If-Match": '"different"' }), env, descriptor);
assert.equal(response.status, 412);

response = await serveMedia(request({ Range: "bytes=2-5", "If-Range": '"different"' }), env, descriptor);
assert.equal(response.status, 200);
assert.equal(await response.text(), "abcdefghij");

response = await serveMedia(request({ Range: "bytes=99-100" }), env, descriptor);
assert.equal(response.status, 416);
assert.equal(response.headers.get("Content-Range"), "bytes */10");

response = await serveMedia(request({}, "POST"), env, descriptor);
assert.equal(response.status, 405);
assert.equal(response.headers.get("Allow"), "GET, HEAD");

response = await worker.fetch(new Request("https://maqamagent.com/media/not-registered.mp4"), env);
assert.equal(response.status, 404);
assert.equal(response.headers.get("X-Frame-Options"), "DENY");

response = await worker.fetch(new Request("https://maqamagent.com/docs/"), env);
assert.equal(response.status, 200);
assert.equal(response.headers.get("Cache-Control"), "public, max-age=0, must-revalidate");
assert.equal(response.headers.get("Cross-Origin-Opener-Policy"), "same-origin");

response = await worker.fetch(new Request("https://www.maqamagent.com/docs/?source=canonical"), env);
assert.equal(response.status, 308);
assert.equal(response.headers.get("Location"), "https://maqamagent.com/docs/?source=canonical");
assert.equal(response.headers.get("Cache-Control"), "public, max-age=3600");
assert.equal(response.headers.get("X-Frame-Options"), "DENY");

if (failures.length) {
  console.error(`Site check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Site check passed: ${htmlFiles.length} HTML pages, ${textFiles.length} text assets, Worker media semantics verified.`);
}
