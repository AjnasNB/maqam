import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import robotsParser from "robots-parser";
import TurndownService from "turndown";
import { createCrawlerSecurityError, withPinnedFetch } from "./crawler/security.js";
import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./framework/boundary.js";

const DEFAULT_USER_AGENT = "Maqam/0.2 (+https://github.com/AjnasNB/maqam)";
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CRAWL_OPTION_KEYS = [
  "seeds", "urls", "maxPages", "maxSeeds", "maxRequests", "maxQueue",
  "maxLinksPerPage", "maxDepth", "concurrency", "sameOrigin", "allowedOrigins",
  "includeSitemaps", "maxSitemaps", "maxUrlsPerSitemap", "obeyRobots",
  "allowPrivateNetworks", "userAgent", "delayMs", "timeoutMs", "maxDurationMs",
  "maxBytes", "maxRedirects", "maxRetries", "retryDelayMs", "signal", "dnsLookup",
  "onPage", "onError"
];
const CRAWLER_CONTEXT_KEYS = [
  "runId", "taskId", "goal", "limits", "signal", "authorizedOrigins",
  "authorizationScope", "approvalId", "approvalIds", "requestedBy",
  "approvalEvidence", "evidence", "evidenceLedger", "approvals", "tools",
  "outputs", "trace"
];
const CRAWL_BOOLEAN_KEYS = [
  "sameOrigin", "includeSitemaps", "obeyRobots", "allowPrivateNetworks"
];

function snapshotStringArray(value, label) {
  const result = snapshotOwnDataArray(value, { label });
  for (let index = 0; index < result.length; index += 1) {
    if (typeof result[index] !== "string") {
      throw new TypeError(`${label}[${index}] must be a string.`);
    }
  }
  return Object.freeze(result);
}

function snapshotCrawlerOptions(value = {}, label = "Crawler options") {
  const snapshot = snapshotOwnDataRecord(value, {
    label,
    recognizedKeys: CRAWL_OPTION_KEYS
  });
  for (const key of ["seeds", "urls", "allowedOrigins"]) {
    if (snapshot[key] !== undefined) snapshot[key] = snapshotStringArray(snapshot[key], `${label}.${key}`);
  }
  for (const key of CRAWL_BOOLEAN_KEYS) {
    if (snapshot[key] !== undefined && typeof snapshot[key] !== "boolean") {
      throw new TypeError(`${label}.${key} must be a boolean.`);
    }
  }
  if (snapshot.userAgent !== undefined && typeof snapshot.userAgent !== "string") {
    throw new TypeError(`${label}.userAgent must be a string.`);
  }
  for (const key of ["dnsLookup", "onPage", "onError"]) {
    if (snapshot[key] !== undefined && snapshot[key] !== null && typeof snapshot[key] !== "function") {
      throw new TypeError(`${label}.${key} must be a function or null.`);
    }
  }
  if (snapshot.signal !== undefined && snapshot.signal !== null
    && !(snapshot.signal instanceof AbortSignal)) {
    throw new TypeError(`${label}.signal must be an AbortSignal or null.`);
  }
  return Object.freeze(snapshot);
}

function snapshotCrawlerContext(value = {}) {
  const snapshot = snapshotOwnDataRecord(value, {
    label: "Crawler tool context",
    recognizedKeys: CRAWLER_CONTEXT_KEYS,
    rejectUnknown: false
  });
  if (snapshot.authorizedOrigins !== undefined) {
    snapshot.authorizedOrigins = snapshotStringArray(
      snapshot.authorizedOrigins,
      "Crawler tool context.authorizedOrigins"
    );
  }
  if (snapshot.goal !== undefined && snapshot.goal !== null) {
    snapshot.goal = snapshotJsonValue(snapshot.goal, {
      label: "Crawler tool context.goal",
      freeze: true
    });
  }
  if (snapshot.limits !== undefined && snapshot.limits !== null) {
    snapshot.limits = snapshotJsonValue(snapshot.limits, {
      label: "Crawler tool context.limits",
      freeze: true
    });
  }
  return Object.freeze(snapshot);
}

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error("Crawler operation was aborted.");
  error.name = "AbortError";
  error.code = "CRAWL_ABORTED";
  return error;
}

function crawlDurationError(maxDurationMs) {
  const error = new Error(`Crawl exceeded maxDurationMs (${maxDurationMs}).`);
  error.code = "CRAWL_DURATION_LIMIT";
  return error;
}

async function runCallbackWithinDeadline(callback, payload, {
  deadlineAt,
  maxDurationMs,
  signal,
  label
}) {
  if (signal?.aborted) throw abortError(signal);
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw crawlDurationError(maxDurationMs);
  const safePayload = snapshotJsonValue(payload, {
    label: `${label} payload`,
    maximumStringLength: 50 * 1024 * 1024,
    allowNullPrototype: true,
    freeze: true
  });

  let timer;
  let onAbort;
  const boundary = new Promise((_, reject) => {
    timer = setTimeout(() => reject(crawlDurationError(maxDurationMs)), Math.max(1, remainingMs));
    if (signal) {
      onAbort = () => reject(abortError(signal));
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    }
  });
  try {
    await Promise.race([
      Promise.resolve().then(() => callback(safePayload)),
      boundary
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
  if (signal?.aborted) throw abortError(signal);
  if (Date.now() >= deadlineAt) throw crawlDurationError(maxDurationMs);
}

function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function toUrl(value, base) {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = "";
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }
  return url.toString();
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sameOrigin(a, b) {
  return new URL(a).origin === new URL(b).origin;
}

function integerOption(value, name, fallback, minimum, maximum) {
  const candidate = value === undefined ? fallback : value;
  if (!Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return candidate;
}

function normalizeAllowedOrigins(values = []) {
  const snapshot = snapshotStringArray(values, "allowedOrigins");
  return [...new Set(snapshot.map((value) => {
    if (!isHttpUrl(value)) throw new TypeError(`Invalid allowed origin '${value}'.`);
    return new URL(value).origin;
  }))];
}

function normalizeOptions(input, seedCount) {
  input = snapshotCrawlerOptions(input);
  const maxPages = integerOption(input.maxPages, "maxPages", 50, 1, 10_000);
  const maxSeeds = integerOption(input.maxSeeds, "maxSeeds", 100, 1, 1_000);
  if (seedCount > maxSeeds) throw new TypeError(`seeds exceeds maxSeeds (${seedCount} > ${maxSeeds}).`);
  const userAgent = input.userAgent ?? DEFAULT_USER_AGENT;
  if (!userAgent || userAgent.length > 256 || /[\r\n]/.test(userAgent)) {
    throw new TypeError("userAgent must be 1-256 characters without line breaks.");
  }

  return {
    maxPages,
    maxSeeds,
    maxRequests: integerOption(input.maxRequests, "maxRequests", Math.min(50_000, Math.max(50, maxPages * 8)), 1, 50_000),
    maxQueue: integerOption(input.maxQueue, "maxQueue", Math.min(100_000, Math.max(100, maxPages * 20)), 1, 100_000),
    maxLinksPerPage: integerOption(input.maxLinksPerPage, "maxLinksPerPage", 2_000, 1, 20_000),
    maxDepth: integerOption(input.maxDepth, "maxDepth", 20, 0, 100),
    concurrency: integerOption(input.concurrency, "concurrency", 4, 1, 64),
    sameOrigin: input.sameOrigin !== false,
    allowedOrigins: normalizeAllowedOrigins(input.allowedOrigins || []),
    includeSitemaps: input.includeSitemaps === true,
    maxSitemaps: integerOption(input.maxSitemaps, "maxSitemaps", 20, 0, 1_000),
    maxUrlsPerSitemap: integerOption(input.maxUrlsPerSitemap, "maxUrlsPerSitemap", 5_000, 1, 50_000),
    obeyRobots: input.obeyRobots !== false,
    allowPrivateNetworks: input.allowPrivateNetworks === true,
    userAgent,
    delayMs: integerOption(input.delayMs, "delayMs", 250, 0, 60_000),
    timeoutMs: integerOption(input.timeoutMs, "timeoutMs", 15_000, 100, 120_000),
    maxDurationMs: integerOption(input.maxDurationMs, "maxDurationMs", 600_000, 100, 3_600_000),
    maxBytes: integerOption(input.maxBytes, "maxBytes", DEFAULT_MAX_BYTES, 1_024, 50 * 1024 * 1024),
    maxRedirects: integerOption(input.maxRedirects, "maxRedirects", 5, 0, 10),
    maxRetries: integerOption(input.maxRetries, "maxRetries", 2, 0, 5),
    retryDelayMs: integerOption(input.retryDelayMs, "retryDelayMs", 250, 0, 30_000),
    onPage: typeof input.onPage === "function" ? input.onPage : null,
    onError: typeof input.onError === "function" ? input.onError : null,
    signal: input.signal || null,
    dnsLookup: input.dnsLookup || null
  };
}

async function readResponseBody(response, maxBytes) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error(`Response too large: ${declaredLength} bytes`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    const bytes = Buffer.byteLength(text);
    if (bytes > maxBytes) throw new Error(`Response exceeded maxBytes: ${maxBytes}`);
    return { text, bytes };
  }

  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeded maxBytes: ${maxBytes}`);
    }
    chunks.push(Buffer.from(value));
  }
  return { text: Buffer.concat(chunks).toString("utf8"), bytes: received };
}

async function fetchText(startUrl, options) {
  let currentUrl = normalizeUrl(startUrl);
  const redirectChain = [];

  for (let hop = 0; ; hop += 1) {
    if (options.signal?.aborted) throw abortError(options.signal);
    if (!options.isUrlAllowed(currentUrl)) {
      throw createCrawlerSecurityError("Crawler URL is outside the configured origin policy.", {
        url: currentUrl,
        origin: new URL(currentUrl).origin
      });
    }
    await options.beforeRequest?.(currentUrl);

    const controller = new AbortController();
    const remainingMs = Math.max(1, options.deadlineAt - Date.now());
    const timeoutMs = Math.min(options.timeoutMs, remainingMs);
    const timeout = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms.`)), timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;

    try {
      const result = await withPinnedFetch(currentUrl, {
        headers: {
          "user-agent": options.userAgent,
          accept: options.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5"
        },
        signal
      }, {
        allowPrivateNetworks: options.allowPrivateNetworks,
        lookup: options.dnsLookup || undefined,
        signal
      }, async (response, target) => {
        if (REDIRECT_STATUSES.has(response.status)) {
          const location = response.headers.get("location");
          await response.body?.cancel();
          if (!location) throw new Error(`Redirect response ${response.status} did not include Location.`);
          return {
            redirect: normalizeUrl(new URL(location, target.url)),
            status: response.status
          };
        }

        const { text, bytes } = await readResponseBody(response, options.maxBytes);
        return {
          status: response.status,
          ok: response.ok,
          text,
          bytes,
          contentType: response.headers.get("content-type") || "",
          retryAfter: response.headers.get("retry-after"),
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified")
        };
      });

      if (!result.redirect) {
        return { ...result, finalUrl: currentUrl, redirectChain };
      }
      if (hop >= options.maxRedirects) {
        throw new Error(`Redirect limit exceeded (${options.maxRedirects}).`);
      }
      if (!options.isUrlAllowed(result.redirect)) {
        throw createCrawlerSecurityError("Redirect target is outside the configured origin policy.", {
          from: currentUrl,
          to: result.redirect,
          status: result.status
        });
      }
      redirectChain.push({ from: currentUrl, to: result.redirect, status: result.status });
      currentUrl = result.redirect;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseRobotsSitemaps(robotsText, robotsUrl, limit) {
  return robotsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^sitemap:/i.test(line))
    .map((line) => toUrl(line.replace(/^sitemap:\s*/i, "").trim(), robotsUrl))
    .filter((value) => value && isHttpUrl(value))
    .map(normalizeUrl)
    .slice(0, limit);
}

async function loadRobots(origin, options) {
  const robotsUrl = new URL("/robots.txt", origin).toString();
  const denyAll = () => ({
    parser: robotsParser(robotsUrl, "User-agent: *\nDisallow: /\n"),
    sitemaps: [],
    unavailable: true
  });
  try {
    const result = await fetchText(robotsUrl, {
      ...options,
      accept: "text/plain,*/*;q=0.5",
      maxBytes: Math.min(options.maxBytes, 512 * 1024),
      beforeRequest: options.beforeNetworkRequest
    });
    if (result.status === 404 || result.status === 410) {
      return { parser: robotsParser(robotsUrl, ""), sitemaps: [] };
    }
    if (!result.ok) return denyAll();
    return {
      parser: robotsParser(robotsUrl, result.text),
      sitemaps: parseRobotsSitemaps(result.text, robotsUrl, options.maxSitemaps)
    };
  } catch (error) {
    if (error?.code === "CRAWLER_URL_BLOCKED" || error?.code === "CRAWL_REQUEST_LIMIT" || options.signal?.aborted) {
      throw error;
    }
    return denyAll();
  }
}

function parseSitemap(text, maxUrls) {
  const $ = cheerio.load(text, { xmlMode: true });
  const urls = new Set();
  const sitemaps = new Set();
  $("urlset > url > loc").each((_, element) => {
    if (urls.size + sitemaps.size >= maxUrls) return false;
    const value = $(element).text().trim();
    if (isHttpUrl(value)) urls.add(normalizeUrl(value));
    return undefined;
  });
  $("sitemapindex > sitemap > loc").each((_, element) => {
    if (urls.size + sitemaps.size >= maxUrls) return false;
    const value = $(element).text().trim();
    if (isHttpUrl(value)) sitemaps.add(normalizeUrl(value));
    return undefined;
  });
  return { urls: [...urls], sitemaps: [...sitemaps] };
}

async function discoverSitemapDocument(sitemapUrl, options) {
  try {
    const result = await fetchText(sitemapUrl, {
      ...options,
      accept: "application/xml,text/xml,*/*;q=0.5",
      beforeRequest: options.beforeNetworkRequest
    });
    if (!result.ok || (!result.contentType.includes("xml") && !result.text.trim().startsWith("<"))) {
      return { urls: [], sitemaps: [] };
    }
    return parseSitemap(result.text, options.maxUrlsPerSitemap);
  } catch (error) {
    await options.recordFailure?.(sitemapUrl, error, "sitemap");
    if (isFatalCrawlError(error)) throw error;
    return { urls: [], sitemaps: [] };
  }
}

async function discoverSitemapUrls(sitemapUrl, options = {}) {
  const input = snapshotCrawlerOptions(options, "discoverSitemapUrls options");
  const normalized = normalizeOptions({ ...input, maxPages: input.maxPages ?? 50 }, 1);
  const seedOrigin = new URL(sitemapUrl).origin;
  const isUrlAllowed = (url) => (
    (!normalized.allowedOrigins.length || normalized.allowedOrigins.includes(new URL(url).origin))
    && (!normalized.sameOrigin || new URL(url).origin === seedOrigin)
  );
  const deadlineAt = Date.now() + normalized.maxDurationMs;
  const result = await discoverSitemapDocument(sitemapUrl, {
    ...normalized,
    deadlineAt,
    isUrlAllowed,
    beforeNetworkRequest: null,
    recordFailure: null
  });
  return [...result.urls, ...result.sitemaps];
}

function extractLinks($, baseUrl, maxLinks) {
  const links = new Set();
  $("a[href]").each((_, element) => {
    if (links.size >= maxLinks) return false;
    const resolved = toUrl($(element).attr("href"), baseUrl);
    if (resolved && isHttpUrl(resolved)) links.add(normalizeUrl(resolved));
    return undefined;
  });
  return [...links];
}

function cleanForExtraction($) {
  $("script, style, noscript, template, svg, canvas, iframe, object, embed").remove();
  $("[hidden], [aria-hidden='true']").remove();
}

export function extractPage(html, url, options = {}) {
  options = snapshotOwnDataRecord(options, {
    label: "extractPage options",
    recognizedKeys: ["maxLinksPerPage"]
  });
  const $ = cheerio.load(html);
  cleanForExtraction($);

  const title = ($("title").first().text() || $("h1").first().text() || "").trim().replace(/\s+/g, " ");
  const description = ($("meta[name='description']").attr("content") || "").trim();
  const h1 = $("h1").first().text().trim().replace(/\s+/g, " ");
  const canonical = toUrl($("link[rel='canonical']").attr("href") || url, url);
  const maxLinks = integerOption(options.maxLinksPerPage, "maxLinksPerPage", 2_000, 1, 20_000);
  const links = extractLinks($, url, maxLinks);
  const language = ($("html").attr("lang") || "").trim() || null;

  const main = $("main, article, [role='main']").first();
  const contentRoot = main.length ? main : $("body");
  const htmlFragment = contentRoot.html() || "";
  const text = contentRoot.text().replace(/\s+/g, " ").trim();

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-"
  });
  const markdown = turndown.turndown(htmlFragment).replace(/\n{3,}/g, "\n\n").trim();

  return {
    url,
    canonical,
    title,
    description,
    h1,
    language,
    text,
    markdown,
    links,
    fetchedAt: new Date().toISOString()
  };
}

class CrawlQueue {
  constructor() {
    this.items = [];
    this.offset = 0;
  }

  push(item) {
    this.items.push(item);
  }

  shift() {
    if (this.offset >= this.items.length) return null;
    const value = this.items[this.offset];
    this.offset += 1;
    if (this.offset > 1_000 && this.offset * 2 > this.items.length) {
      this.items = this.items.slice(this.offset);
      this.offset = 0;
    }
    return value;
  }

  get length() {
    return this.items.length - this.offset;
  }
}

function retryDelay(error, attempt, options) {
  if (error?.retryAfter) {
    const seconds = Number(error.retryAfter);
    if (Number.isFinite(seconds)) return Math.min(30_000, Math.max(0, seconds * 1_000));
    const date = Date.parse(error.retryAfter);
    if (Number.isFinite(date)) return Math.min(30_000, Math.max(0, date - Date.now()));
  }
  return Math.min(30_000, options.retryDelayMs * (2 ** attempt));
}

function isRetryable(error) {
  if (["CRAWLER_URL_BLOCKED", "ROBOTS_DENIED", "CRAWL_REQUEST_LIMIT", "CRAWL_ABORTED"].includes(error?.code)) {
    return false;
  }
  return !Number.isFinite(error?.status) || error.status === 408 || error.status === 429 || error.status >= 500;
}

function isFatalCrawlError(error) {
  return [
    "CRAWLER_URL_BLOCKED",
    "CRAWL_REQUEST_LIMIT",
    "CRAWL_DURATION_LIMIT",
    "CRAWL_ABORTED"
  ].includes(error?.code) || error?.name === "AbortError";
}

export async function crawlDetailed(input = {}) {
  input = snapshotCrawlerOptions(input, "crawlDetailed input");
  const rawSeeds = input.seeds ?? input.urls ?? [];
  if (!Array.isArray(rawSeeds) || rawSeeds.length === 0) {
    throw new TypeError("At least one http(s) seed URL is required.");
  }
  const seeds = rawSeeds.map((seed) => {
    if (!isHttpUrl(seed)) throw new TypeError(`Invalid HTTP(S) seed URL '${seed}'.`);
    return normalizeUrl(seed);
  });
  const uniqueSeeds = [...new Set(seeds)];
  const options = normalizeOptions(input, uniqueSeeds.length);
  const startedAtMs = Date.now();
  const deadlineAt = startedAtMs + options.maxDurationMs;
  const queue = new CrawlQueue();
  const seen = new Set();
  const seenFinal = new Set();
  const enqueued = new Set();
  const pages = [];
  const failures = [];
  const robotsByOrigin = new Map();
  const lastFetchByOrigin = new Map();
  const originGates = new Map();
  const seedOrigins = new Set(uniqueSeeds.map((seed) => new URL(seed).origin));
  const allowedOrigins = new Set(options.allowedOrigins);
  const stats = {
    requests: 0,
    retries: 0,
    skippedByRobots: 0,
    skippedByOrigin: 0,
    queueDropped: 0
  };

  const isUrlAllowed = (url) => {
    const origin = new URL(url).origin;
    if (allowedOrigins.size && !allowedOrigins.has(origin)) return false;
    return !options.sameOrigin || seedOrigins.has(origin);
  };

  const enqueue = (url, depth = 0, discoveredFrom = null) => {
    if (!url || depth > options.maxDepth || enqueued.has(url) || seen.has(url)) return false;
    if (!isUrlAllowed(url)) {
      stats.skippedByOrigin += 1;
      return false;
    }
    if (queue.length >= options.maxQueue) {
      stats.queueDropped += 1;
      return false;
    }
    enqueued.add(url);
    queue.push({ url, depth, discoveredFrom });
    return true;
  };

  for (const seed of uniqueSeeds) enqueue(seed);

  async function waitForOrigin(url) {
    const origin = new URL(url).origin;
    const previous = originGates.get(origin) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    originGates.set(origin, previous.catch(() => {}).then(() => gate));
    await previous.catch(() => {});
    try {
      const nextAt = (lastFetchByOrigin.get(origin) || 0) + options.delayMs;
      await sleep(Math.max(0, nextAt - Date.now()), options.signal);
      lastFetchByOrigin.set(origin, Date.now());
    } finally {
      release();
    }
  }

  async function beforeNetworkRequest(url) {
    if (options.signal?.aborted) throw abortError(options.signal);
    if (Date.now() >= deadlineAt) {
      throw crawlDurationError(options.maxDurationMs);
    }
    if (stats.requests >= options.maxRequests) {
      const error = new Error(`Crawl exceeded maxRequests (${options.maxRequests}).`);
      error.code = "CRAWL_REQUEST_LIMIT";
      throw error;
    }
    stats.requests += 1;
    await waitForOrigin(url);
  }

  async function getRobots(url) {
    const origin = new URL(url).origin;
    if (!robotsByOrigin.has(origin)) {
      robotsByOrigin.set(origin, loadRobots(origin, {
        ...options,
        deadlineAt,
        isUrlAllowed,
        beforeNetworkRequest
      }));
    }
    return robotsByOrigin.get(origin);
  }

  async function recordFailure(url, error, phase = "page") {
    const failure = {
      url,
      phase,
      code: error?.code || "CRAWL_ERROR",
      error: error?.message || String(error)
    };
    failures.push(failure);
    if (options.onError) {
      await runCallbackWithinDeadline(options.onError, failure, {
        deadlineAt,
        maxDurationMs: options.maxDurationMs,
        signal: options.signal,
        label: "Crawler onError"
      });
    }
  }

  if (options.includeSitemaps && options.maxSitemaps > 0) {
    const sitemapQueue = [];
    const queuedSitemaps = new Set();
    const enqueueSitemap = (value) => {
      if (queuedSitemaps.size >= options.maxSitemaps) return;
      const normalized = normalizeUrl(value);
      if (queuedSitemaps.has(normalized) || !isUrlAllowed(normalized)) return;
      queuedSitemaps.add(normalized);
      sitemapQueue.push(normalized);
    };
    for (const seed of uniqueSeeds) {
      const robots = await getRobots(seed);
      for (const sitemap of (robots.sitemaps.length
        ? robots.sitemaps
        : [new URL("/sitemap.xml", new URL(seed).origin).toString()])) enqueueSitemap(sitemap);
    }
    const visitedSitemaps = new Set();
    while (sitemapQueue.length && visitedSitemaps.size < options.maxSitemaps) {
      const sitemapUrl = normalizeUrl(sitemapQueue.shift());
      if (visitedSitemaps.has(sitemapUrl) || !isUrlAllowed(sitemapUrl)) continue;
      visitedSitemaps.add(sitemapUrl);
      const document = await discoverSitemapDocument(sitemapUrl, {
        ...options,
        deadlineAt,
        isUrlAllowed,
        beforeNetworkRequest,
        recordFailure
      });
      for (const url of document.urls) enqueue(url, 0, sitemapUrl);
      for (const nested of document.sitemaps) {
        if (!visitedSitemaps.has(nested)) enqueueSitemap(nested);
      }
    }
  }

  async function processItem(item) {
    if (seen.has(item.url)) return null;
    seen.add(item.url);

    for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
      try {
        const result = await fetchText(item.url, {
          ...options,
          deadlineAt,
          isUrlAllowed,
          beforeRequest: async (url) => {
            if (options.obeyRobots) {
              const robots = await getRobots(url);
              if (robots.parser && robots.parser.isAllowed(url, options.userAgent) === false) {
                stats.skippedByRobots += 1;
                const error = new Error(`robots.txt disallows ${url}`);
                error.code = "ROBOTS_DENIED";
                throw error;
              }
            }
            await beforeNetworkRequest(url);
          }
        });

        if (!result.ok) {
          const error = new Error(`HTTP ${result.status}`);
          error.status = result.status;
          error.retryAfter = result.retryAfter;
          throw error;
        }
        if (result.contentType && !/html|xml|text\//i.test(result.contentType)) return null;
        if (seenFinal.has(result.finalUrl)) return null;
        seenFinal.add(result.finalUrl);

        const page = extractPage(result.text, result.finalUrl, {
          maxLinksPerPage: options.maxLinksPerPage
        });
        page.status = result.status;
        page.contentType = result.contentType;
        page.bytes = result.bytes;
        page.contentHash = `sha256:${createHash("sha256").update(result.text).digest("hex")}`;
        page.depth = item.depth;
        page.discoveredFrom = item.discoveredFrom;
        page.redirectChain = result.redirectChain;
        page.etag = result.etag;
        page.lastModified = result.lastModified;
        page.robotsAllowed = true;
        return page;
      } catch (error) {
        if (options.signal?.aborted) throw abortError(options.signal);
        if (attempt < options.maxRetries && isRetryable(error) && Date.now() < deadlineAt) {
          stats.retries += 1;
          await sleep(retryDelay(error, attempt, options), options.signal);
          continue;
        }
        if (error?.code !== "ROBOTS_DENIED") await recordFailure(item.url, error, "page");
        if (isFatalCrawlError(error)) throw error;
        return null;
      }
    }
    return null;
  }

  while (queue.length && pages.length < options.maxPages) {
    if (options.signal?.aborted) throw abortError(options.signal);
    if (Date.now() >= deadlineAt || stats.requests >= options.maxRequests) break;
    const batch = [];
    const batchSize = Math.min(options.concurrency, options.maxPages - pages.length);
    while (batch.length < batchSize && queue.length) batch.push(queue.shift());
    const batchPages = await Promise.all(batch.map(processItem));
    for (const page of batchPages) {
      if (!page || pages.length >= options.maxPages) continue;
      pages.push(page);
      if (options.onPage) {
        await runCallbackWithinDeadline(options.onPage, page, {
          deadlineAt,
          maxDurationMs: options.maxDurationMs,
          signal: options.signal,
          label: "Crawler onPage"
        });
      }
      if (page.depth < options.maxDepth) {
        for (const link of page.links) enqueue(link, page.depth + 1, page.url);
      }
    }
  }

  const finishedAtMs = Date.now();
  return {
    pages,
    failures,
    stats: {
      ...stats,
      pages: pages.length,
      failures: failures.length,
      queued: enqueued.size,
      seen: seen.size,
      durationMs: finishedAtMs - startedAtMs,
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString()
    }
  };
}

export async function crawl(input = {}) {
  return (await crawlDetailed(input)).pages;
}

export { discoverSitemapUrls, normalizeUrl };
export { AjnasFrameworkError, MaqamError, ApprovalRequiredError, PolicyDeniedError, toErrorRecord } from "./framework/errors.js";
export { PolicyEngine } from "./framework/policy.js";
export { EvidenceLedger } from "./framework/evidence-ledger.js";
export { ToolGateway } from "./framework/tool-gateway.js";
export { SkillRegistry } from "./framework/skill-registry.js";
export { AgentRuntime } from "./framework/runtime.js";
export { ApprovalQueue } from "./framework/approval-queue.js";
export { createAgentTool } from "./framework/agent-tool.js";
export {
  TOOL_ADAPTER_SCHEMA_VERSION,
  TOOL_ADAPTER_CONFORMANCE_SCHEMA_VERSION,
  defineToolAdapter,
  registerToolAdapter,
  runToolAdapterConformance
} from "./framework/tool-adapter.js";
export { createCliAgentTool, estimateCliInputTokens, parseCliJsonLines } from "./framework/cli-agent-tool.js";
export {
  createCodexAgentTool,
  createClaudeCodeAgentTool,
  normalizeCodexEvents,
  normalizeClaudeCodeEvents
} from "./framework/provider-agent-tool.js";
export { createReleaseGateReport } from "./framework/release-gate.js";
export { createResearchWorkflow } from "./framework/research-workflow.js";
export { classifyIpAddress, isPublicIpAddress, resolveUrlTarget } from "./crawler/security.js";

function boundedNumber(requested, configured, fallback, mode = "max") {
  const boundary = configured ?? fallback;
  if (requested === undefined) return boundary;
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    throw new TypeError("Crawler numeric limits must be finite numbers.");
  }
  return mode === "min"
    ? Math.max(boundary, requested)
    : Math.min(boundary, requested);
}

export function createCrawlerTool(defaultOptions = {}) {
  const configured = snapshotCrawlerOptions(defaultOptions, "createCrawlerTool options");
  const tool = async function crawlerTool(input = {}, context = {}) {
    input = snapshotCrawlerOptions(input, "Crawler tool input");
    context = snapshotCrawlerContext(context);
    const signals = [context.signal, configured.signal].filter(Boolean);
    const configuredOrigins = normalizeAllowedOrigins(configured.allowedOrigins || []);
    const authorizedOrigins = normalizeAllowedOrigins(context.authorizedOrigins || []);
    const goalOrigins = normalizeAllowedOrigins(context.goal?.allowedOrigins || []);
    const explicitScopes = [configuredOrigins, authorizedOrigins, goalOrigins]
      .filter((origins) => origins.length > 0);
    const allowedOrigins = explicitScopes.length
      ? explicitScopes.slice(1).reduce(
        (intersection, origins) => intersection.filter((origin) => origins.includes(origin)),
        [...explicitScopes[0]]
      )
      : [];
    if (explicitScopes.length > 1 && allowedOrigins.length === 0) {
      throw createCrawlerSecurityError("Crawler origin policy has no overlap with the workflow goal.", {
        configuredOrigins,
        authorizedOrigins,
        goalOrigins
      });
    }
    const sameOrigin = configured.sameOrigin === false ? input.sameOrigin === true : true;
    if (!sameOrigin && allowedOrigins.length === 0) {
      throw createCrawlerSecurityError("Cross-origin crawling requires an explicit trusted origin allowlist.");
    }
    const maxPages = boundedNumber(
      boundedNumber(input.maxPages, context.limits?.maxPages, configured.maxPages ?? 50),
      configured.maxPages,
      50
    );
    const maxRequests = boundedNumber(
      boundedNumber(input.maxRequests, context.limits?.maxNetworkRequests, configured.maxRequests ?? 400),
      configured.maxRequests,
      400
    );
    const maxDurationMs = boundedNumber(
      boundedNumber(input.maxDurationMs, context.limits?.maxRuntimeMs, configured.maxDurationMs ?? 600_000),
      configured.maxDurationMs,
      600_000
    );
    return crawl({
      ...input,
      maxPages,
      maxSeeds: boundedNumber(input.maxSeeds, configured.maxSeeds, 100),
      maxRequests,
      maxQueue: boundedNumber(input.maxQueue, configured.maxQueue, 1_000),
      maxLinksPerPage: boundedNumber(input.maxLinksPerPage, configured.maxLinksPerPage, 2_000),
      maxDepth: boundedNumber(input.maxDepth, configured.maxDepth, 20),
      concurrency: boundedNumber(input.concurrency, configured.concurrency, 4),
      delayMs: boundedNumber(input.delayMs, configured.delayMs, 250, "min"),
      timeoutMs: boundedNumber(input.timeoutMs, configured.timeoutMs, 15_000),
      maxDurationMs,
      maxBytes: boundedNumber(input.maxBytes, configured.maxBytes, DEFAULT_MAX_BYTES),
      maxRedirects: boundedNumber(input.maxRedirects, configured.maxRedirects, 5),
      maxRetries: boundedNumber(input.maxRetries, configured.maxRetries, 2),
      maxSitemaps: boundedNumber(input.maxSitemaps, configured.maxSitemaps, 20),
      maxUrlsPerSitemap: boundedNumber(input.maxUrlsPerSitemap, configured.maxUrlsPerSitemap, 5_000),
      retryDelayMs: boundedNumber(input.retryDelayMs, configured.retryDelayMs, 250, "min"),
      sameOrigin,
      obeyRobots: configured.obeyRobots === false ? input.obeyRobots === true : true,
      allowPrivateNetworks: configured.allowPrivateNetworks === true,
      allowedOrigins,
      userAgent: configured.userAgent || input.userAgent,
      includeSitemaps: input.includeSitemaps === true && configured.includeSitemaps !== false,
      signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0] || null,
      dnsLookup: configured.dnsLookup || null,
      onPage: configured.onPage || null,
      onError: configured.onError || null
    });
  };
  tool.governance = Object.freeze({
    name: "crawler",
    effects: ["network:read"],
    safeDefaults: {
      obeyRobots: configured.obeyRobots !== false,
      sameOrigin: configured.sameOrigin !== false,
      allowPrivateNetworks: configured.allowPrivateNetworks === true
    }
  });
  return tool;
}
