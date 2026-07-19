import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker, { MEDIA_OBJECTS, parseByteRange, serveMedia } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const publicRoot = path.join(root, "public");
const ignoredDirectories = new Set(["node_modules", ".wrangler", ".wrangler-dry-run"]);
const approvedProductVisuals = new Set([
  "/assets/approval-gate-art.png",
  "/assets/community-workbench-v2.png",
  "/assets/evidence-article.png",
  "/assets/evidence-metrology-3d.png",
  "/assets/integration-dock-3d.png",
  "/assets/maqam-exact-gate-3d.png",
  "/assets/productloop-modular-hub-3d.png"
]);
const productVisualDimensions = new Map([
  ["/assets/evidence-metrology-3d.png", [1586, 992]],
  ["/assets/integration-dock-3d.png", [1586, 992]],
  ["/assets/maqam-exact-gate-3d.png", [1586, 992]],
  ["/assets/productloop-modular-hub-3d.png", [1568, 1003]]
]);
const requiredProductVisuals = new Map([
  ["index.html", ["/assets/maqam-exact-gate-3d.png", "/assets/productloop-modular-hub-3d.png", "/assets/evidence-metrology-3d.png"]],
  [path.join("why", "index.html"), ["/assets/maqam-exact-gate-3d.png"]],
  [path.join("community", "index.html"), ["/assets/community-workbench-v2.png"]],
  [path.join("roadmap", "index.html"), ["/assets/evidence-metrology-3d.png"]],
  [path.join("releases", "v0.3.0", "index.html"), ["/assets/integration-dock-3d.png"]],
  [path.join("releases", "v0.3.1", "index.html"), ["/assets/integration-dock-3d.png"]],
  [path.join("releases", "v0.2.4", "index.html"), ["/assets/evidence-metrology-3d.png"]],
  [path.join("docs", "benchmark", "index.html"), ["/assets/evidence-metrology-3d.png"]],
  [path.join("docs", "integrations", "index.html"), ["/assets/integration-dock-3d.png"]],
  [path.join("docs", "sources", "index.html"), ["/assets/integration-dock-3d.png"]],
  [path.join("docs", "productloop", "index.html"), ["/assets/productloop-modular-hub-3d.png"]],
  [path.join("docs", "security", "index.html"), ["/assets/evidence-metrology-3d.png"]],
  [path.join("articles", "benchmarking-governance", "index.html"), ["/assets/approval-gate-art.png"]],
  [path.join("articles", "exact-agent-approvals", "index.html"), ["/assets/evidence-article.png"]]
]);

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

  if (/href="\/releases\/v0\.3\.0\/"[^>]*>Release</i.test(source)) {
    failures.push(`${label}: primary Release navigation must target v0.3.1`);
  }
  if (label !== path.join("releases", "v0.3.0", "index.html") && /(?:npm install|npx[^\n<]*package=)\s*maqam@0\.3\.0/i.test(source)) {
    failures.push(`${label}: active install examples must pin maqam@0.3.1`);
  }

  for (const requiredVisual of requiredProductVisuals.get(label) || []) {
    if (!source.includes('src="' + requiredVisual + '"')) {
      failures.push(label + ": missing required product visual " + requiredVisual);
    }
  }

  requireMatch(/<html\s+lang="en">/i, "missing English document language");
  requireMatch(/<title>[^<]+<\/title>/i, "missing title");
  requireMatch(/<meta\s+name="description"\s+content="[^"]+">/i, "missing meta description");
  requireMatch(/<a\s+class="skip-link"\s+href="#main">/i, "missing skip link");
  requireMatch(/<main\b[^>]*\bid="main"/i, "missing main landmark id");

  if (source.includes('class="site-header"') && !source.includes('href="/releases/v0.3.1/"')) {
    failures.push(`${label}: primary navigation must link the 0.3.1 release record`);
  }

  if (/0\.2\.3|candidate pending exact release approval/i.test(source)) {
    failures.push(`${label}: contains stale pre-0.2.4 publication wording`);
  }

  if (/Maqam 0\.3\.0 candidate|v0\.3\.0 release candidate|0\.3\.0 source candidate|0\.3\.0 candidate API line|0\.3\.0 candidate install gate/i.test(source)) {
    failures.push(`${label}: contains stale pre-publication 0.3.0 wording`);
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
    requireMatch(/v0\.3\.1 public release/i, "homepage must identify 0.3.1 as the public release");
    requireMatch(/npm Trusted Publishing and the matching GitHub release are verified/i, "homepage must identify the completed release verification");
    requireMatch(/SLSA provenance, registry signatures, and exact tarball bytes match/i, "homepage must summarize the verified 0.3.1 release identity");
    requireMatch(/Verify the live npm and GitHub release records before use[\s\S]{0,120}maqam@0\.3\.1/i, "homepage install command must retain a live-record verification reminder");
    requireMatch(/historical 0\.2\.4 proof media/i, "homepage must label 0.2.4 proof media as historical");
    requireMatch(/Maqam is a security turnstile for agent actions/i, "homepage must include the plain-English Maqam definition");
    requireMatch(/Node matrix[\s\S]{0,160}22\s*\/\s*24\s*\/\s*26/i, "homepage must show the maintained Node 22, 24, and 26 matrix");
    requireMatch(/Published 0\.3\.1 measured-source MGES evidence/i, "homepage must label the public 0.3.1 measured-source evidence");
    requireMatch(/Previous public 0\.3\.0 MGES evidence/i, "homepage must retain and label the previous public 0.3.0 benchmark evidence");
  }

  if (label === path.join("docs", "benchmark", "index.html")) {
    requireMatch(/Published 0\.3\.1 measured-source evidence/i, "benchmark docs must label the public 0.3.1 measured-source evidence");
    requireMatch(/Previous public 0\.3\.0 evidence/i, "benchmark docs must retain and label the previous public 0.3.0 evidence");
    requireMatch(/a96413c4da5f27dc31b9772996e70faab0b38382/i, "benchmark docs must bind candidate evidence to the exact source commit");
    requireMatch(/545fe8bbc40f21cec0f9ec2ae3954f3e75783f22/i, "benchmark docs must retain the previous public source commit");
    requireMatch(/does not[\s\S]{0,120}test browser navigation/i, "benchmark docs must not imply browser-behavior coverage");
  }

  if (label === path.join("articles", "benchmarking-governance", "index.html")) {
    requireMatch(/Published 0\.3\.1 measured-source evidence/i, "benchmark article must label the public 0.3.1 measured-source evidence");
    requireMatch(/Previous public 0\.3\.0 evidence/i, "benchmark article must retain and label the previous public 0.3.0 evidence");
    requireMatch(/a96413c4da5f27dc31b9772996e70faab0b38382/i, "benchmark article must bind candidate evidence to the exact source commit");
    requireMatch(/545fe8bbc40f21cec0f9ec2ae3954f3e75783f22/i, "benchmark article must retain the previous public source commit");
    requireMatch(/does not test browser navigation/i, "benchmark article must not imply browser-behavior coverage");
  }

  if (label === path.join("docs", "index.html")) {
    requireMatch(/security turnstile for actions performed by software agents/i, "docs must define Maqam in plain English");
    requireMatch(/The modular toolbox around Maqam/i, "docs must define ProductLoop OS in plain English");
    requireMatch(/Calls that bypass the gateway remain outside Maqam's control/i, "docs must state the gateway bypass boundary");
    requireMatch(/ResearchSourceRegistry/, "docs must introduce governed research-source routing");
    requireMatch(/href="\/docs\/browser\/"/, "docs must navigate to the governed browser guide");
  }

  if (label === path.join("docs", "browser", "index.html")) {
    requireMatch(/Published in Maqam 0\.3\.1/i, "browser guide must identify its public lifecycle");
    requireMatch(/registerGovernedBrowserTools/, "browser guide must show the registration API");
    requireMatch(/only origins named by the exact request/i, "browser guide must state exact request origin narrowing");
    requireMatch(/external protocols[\s\S]{0,300}modal dialogs/i, "browser guide must enumerate prohibited effects");
    requireMatch(/attestation rather than rollback/i, "browser guide must state the post-dispatch effect boundary");
    requireMatch(/does not discover profiles[\s\S]{0,200}distributed browser fleet/i, "browser guide must reject browser-engine and session overclaims");
  }

  if (label === path.join("releases", "v0.3.1", "index.html")) {
    requireMatch(/npm install maqam@0\.3\.1/i, "0.3.1 release page must contain the pinned install command");
    requireMatch(/2f7231db912012e37e89ec962f6d57c54c6275a3/i, "0.3.1 release page must contain the registry gitHead");
    requireMatch(/5c6357eefd431b1de1c03d8106e2cc63e2ddfe6d87511767dc47e991916d5e02/i, "0.3.1 release page must contain the verified SHA-256");
    requireMatch(/Node 22 \/ 24 \/ 26/i, "0.3.1 release page must contain the supported Node matrix");
  }

  if (label === path.join("docs", "sources", "index.html")) {
    requireMatch(/Governed research sources/i, "sources guide must define the new product surface");
    requireMatch(/routeUngoverned\(\).*bypasses that gateway/i, "sources guide must label direct routing as ungoverned");
    requireMatch(/Agent Reach[\s\S]{0,500}broader platform-specific/i, "sources guide must describe Agent Reach coverage accurately");
    requireMatch(/does not copy Agent Reach's auto-installation/i, "sources guide must reject equivalent-coverage claims");
  }

  if (label === path.join("releases", "v0.3.0", "index.html")) {
    requireMatch(/Maqam 0\.3\.0/, "0.3.0 release page must identify the release");
    requireMatch(/does not claim equivalent channel coverage/i, "0.3.0 release must keep the Agent Reach comparison narrow");
    requireMatch(/98c2d97dc31495ec30a0b44c5016fd76316c2074/i, "0.3.0 release must identify the verified registry gitHead");
    requireMatch(/sha512-0fV354AKT6JtVMYzWcMCfjUQpJHIjaNF\+bGjxq8TzcuElNVQsx3Cp5Yc062RgNJ5zSDVgUJSn1hzn04hT3jWuQ==/i, "0.3.0 release must identify the verified npm integrity");
  }

  if (label === path.join("docs", "productloop", "index.html")) {
    requireMatch(/productloop-os@0\.2\.2/, "ProductLoop install command must pin productloop-os@0.2.2");
    requireMatch(/productloop-os\/releases\/tag\/v0\.2\.2/, "ProductLoop atlas must link the v0.2.2 source release");
    requireMatch(/npmjs\.com\/package\/maqam\/v\/0\.3\.1/, "ProductLoop atlas must link the current Maqam npm release");
    requireMatch(/records release versions, not a permanent live-registry guarantee/i, "ProductLoop atlas must avoid a blanket npm publication claim");
    for (const [packageName, version] of [
      ["productloop-os", "0.2.2"],
      ["ajnas-runtime", "0.2.2"],
      ["ajnas-skills-registry", "0.2.2"],
      ["ajnas-provenance", "0.1.4"],
      ["ajnas-policy", "0.1.3"],
      ["ajnas-evals", "0.1.3"],
      ["ajnas-connectors", "0.1.3"],
      ["ajnas-approvals", "0.1.3"],
      ["ajnas-browser-research", "0.1.4"]
    ]) {
      requireMatch(
        new RegExp(`<code>${packageName}<\\/code>[\\s\\S]{0,120}<td>${version}<\\/td>`),
        `${packageName} must show public version ${version}`
      );
    }
    requireMatch(/<code>maqam<\/code>[\s\S]{0,120}<td>0\.3\.1<\/td>/, "ProductLoop atlas must show public Maqam 0.3.1");
    requireMatch(/historical 0\.2\.4 proof video/i, "ProductLoop atlas must label its 0.2.4 video as historical");
  }

  if (label === path.join("docs", "integrations", "index.html")) {
    requireMatch(/productloop-os@0\.2\.2/, "integration guide must name the current ProductLoop umbrella");
    requireMatch(/productloop-os\/releases\/tag\/v0\.2\.2/, "integration guide must link the v0.2.2 source release");
  }

  if (label === path.join("roadmap", "index.html")) {
    requireMatch(/ProductLoop OS 0\.2\.2 public/i, "roadmap must name the current ProductLoop release");
    requireMatch(/productloop-os\/releases\/tag\/v0\.2\.2/, "roadmap must link the v0.2.2 source release");
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

  for (const match of source.matchAll(/<img\b([^>]*)>/gi)) {
    const src = match[1].match(/\bsrc="([^"]+)"/i)?.[1];
    if (src?.startsWith("/assets/") && !src.endsWith(".svg") && !approvedProductVisuals.has(src)) {
      failures.push(label + ": unreviewed conceptual image " + src + "; use a product-specific 3D visual or real product proof");
    }

    const expectedDimensions = productVisualDimensions.get(src);
    if (expectedDimensions) {
      const width = Number(match[1].match(/\bwidth="(\d+)"/i)?.[1]);
      const height = Number(match[1].match(/\bheight="(\d+)"/i)?.[1]);
      if (width !== expectedDimensions[0] || height !== expectedDimensions[1]) {
        failures.push(`${label}: ${src} must declare its intrinsic ${expectedDimensions[0]}x${expectedDimensions[1]} dimensions`);
      }
    }
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

  const srcsetReferences = [...source.matchAll(/\bsrcset="([^"]+)"/g)].flatMap((match) => (
    match[1].split(",").map((candidate) => candidate.trim().split(/\s+/, 1)[0])
  ));
  const localReferences = [
    ...source.matchAll(/\b(?:href|src|poster)="(\/[^"]*)"/g),
    ...source.matchAll(/<track\b[^>]*\bsrc="(\/[^"]*)"/g)
  ].map((match) => match[1]).concat(srcsetReferences.filter((reference) => reference.startsWith("/")));

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
