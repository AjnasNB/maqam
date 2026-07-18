import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "../../framework/boundary.js";
import { defineResearchSourceAdapter } from "../source-adapter.js";
import { ResearchSourceUnavailableError } from "../source-error.js";

const PAGE_KEYS = new Set([
  "sourceType", "url", "canonical", "title", "description", "h1", "language",
  "text", "markdown", "links", "feedLinks", "feed", "fetchedAt", "status",
  "contentType", "bytes", "contentHash", "depth", "discoveredFrom",
  "redirectChain", "etag", "lastModified", "robotsAllowed"
]);
const MAX_PAGES = 10_000;
const MAX_TEXT_LENGTH = 5_000_000;
const MAX_SHORT_TEXT_LENGTH = 100_000;
const REDIRECT_KEYS = new Set(["from", "to", "status"]);

function optionalString(value, label, { nullable = false, maximumLength = MAX_SHORT_TEXT_LENGTH } = {}) {
  if (value === undefined || (nullable && value === null)) return value ?? null;
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be ${nullable ? "null or " : ""}a string.`);
  }
  if (value.length > maximumLength) {
    throw new TypeError(`${label} cannot exceed ${maximumLength} characters.`);
  }
  return value;
}

function requiredUrlString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  if (value.length > MAX_SHORT_TEXT_LENGTH) {
    throw new TypeError(`${label} cannot exceed ${MAX_SHORT_TEXT_LENGTH} characters.`);
  }
  return value;
}

function typedString(value, label, {
  nullable = false,
  maximumLength = MAX_SHORT_TEXT_LENGTH
} = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be ${nullable ? "null or " : ""}a string.`);
  }
  if (value.length > maximumLength) {
    throw new TypeError(`${label} cannot exceed ${maximumLength} characters.`);
  }
  return value;
}

function typedInteger(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be a safe integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function typedStringArray(value, label) {
  const items = snapshotOwnDataArray(value, { label, maximumLength: 10_000 });
  for (let index = 0; index < items.length; index += 1) {
    items[index] = typedString(items[index], `${label}[${index}]`);
  }
  return items;
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain JSON object.`);
  }
  return value;
}

function requireFields(record, fields, label) {
  for (const field of fields) {
    if (!Object.hasOwn(record, field)) throw new TypeError(`${label} requires ${field}.`);
  }
}

function validateFeedItem(value, index) {
  const label = `Web crawler page feed.items[${index}]`;
  const item = requireRecord(value, label);
  requireFields(item, [
    "id", "url", "title", "author", "publishedAt", "text", "markdown",
    "contentHash", "provenance"
  ], label);
  for (const key of ["id", "url", "title", "text", "markdown", "contentHash"]) {
    typedString(item[key], `${label}.${key}`);
  }
  for (const key of ["author", "publishedAt"]) {
    typedString(item[key], `${label}.${key}`, { nullable: true });
  }
  const provenance = requireRecord(item.provenance, `${label}.provenance`);
  requireFields(
    provenance,
    ["sourceUrl", "format", "itemId", "contentHash", "parser"],
    `${label}.provenance`
  );
  for (const key of ["sourceUrl", "itemId", "contentHash", "parser"]) {
    typedString(provenance[key], `${label}.provenance.${key}`);
  }
  if (!["rss2", "atom"].includes(provenance.format)) {
    throw new TypeError(`${label}.provenance.format must be 'rss2' or 'atom'.`);
  }
}

function validatedFeed(value) {
  const feed = snapshotJsonValue(value, {
    label: "Web crawler page feed",
    maximumDepth: 50,
    maximumNodes: 100_000,
    maximumCollectionSize: 10_000,
    maximumStringLength: MAX_TEXT_LENGTH,
    allowNullPrototype: true,
    freeze: true
  });
  requireRecord(feed, "Web crawler page feed");
  requireFields(feed, [
    "sourceUrl", "format", "title", "description", "homeUrl", "language",
    "author", "updatedAt", "items", "contentHash", "provenance"
  ], "Web crawler page feed");
  for (const key of ["sourceUrl", "title", "description", "contentHash"]) {
    typedString(feed[key], `Web crawler page feed.${key}`);
  }
  if (!["rss2", "atom"].includes(feed.format)) {
    throw new TypeError("Web crawler page feed.format must be 'rss2' or 'atom'.");
  }
  for (const key of ["homeUrl", "language", "author", "updatedAt"]) {
    typedString(feed[key], `Web crawler page feed.${key}`, { nullable: true });
  }
  if (!Array.isArray(feed.items)) {
    throw new TypeError("Web crawler page feed.items must be an array.");
  }
  feed.items.forEach(validateFeedItem);
  const provenance = requireRecord(feed.provenance, "Web crawler page feed.provenance");
  requireFields(
    provenance,
    ["sourceUrl", "format", "contentHash", "parser", "networkAccess"],
    "Web crawler page feed.provenance"
  );
  for (const key of ["sourceUrl", "contentHash", "parser"]) {
    typedString(provenance[key], `Web crawler page feed.provenance.${key}`);
  }
  if (!["rss2", "atom"].includes(provenance.format)) {
    throw new TypeError("Web crawler page feed.provenance.format must be 'rss2' or 'atom'.");
  }
  if (provenance.networkAccess !== false) {
    throw new TypeError("Web crawler page feed.provenance.networkAccess must be false.");
  }
  return feed;
}

function validatedRedirects(value, label) {
  const redirects = snapshotOwnDataArray(value, { label, maximumLength: 1_000 });
  return redirects.map((entry, index) => {
    const itemLabel = `${label}[${index}]`;
    const redirect = snapshotOwnDataRecord(entry, {
      label: itemLabel,
      recognizedKeys: REDIRECT_KEYS
    });
    requireFields(redirect, ["from", "to", "status"], itemLabel);
    redirect.from = typedString(redirect.from, `${itemLabel}.from`);
    redirect.to = typedString(redirect.to, `${itemLabel}.to`);
    redirect.status = typedInteger(redirect.status, `${itemLabel}.status`, 100, 599);
    return redirect;
  });
}

function validatedPage(value, index) {
  const label = `Web crawler page ${index + 1}`;
  const page = snapshotOwnDataRecord(value, {
    label,
    recognizedKeys: PAGE_KEYS
  });
  if (!Object.hasOwn(page, "url")) throw new TypeError(`${label} requires url.`);
  page.url = requiredUrlString(page.url, `${label}.url`);
  for (const key of [
    "title", "description", "h1", "contentType", "contentHash", "fetchedAt"
  ]) {
    if (page[key] !== undefined) page[key] = typedString(page[key], `${label}.${key}`);
  }
  for (const key of [
    "canonical", "language", "discoveredFrom", "etag", "lastModified"
  ]) {
    if (page[key] !== undefined) {
      page[key] = typedString(page[key], `${label}.${key}`, { nullable: true });
    }
  }
  if (page.text !== undefined) {
    page.text = typedString(page.text, `${label}.text`, { maximumLength: MAX_TEXT_LENGTH });
  }
  if (page.markdown !== undefined) {
    page.markdown = typedString(page.markdown, `${label}.markdown`, {
      nullable: true,
      maximumLength: MAX_TEXT_LENGTH
    });
  }
  for (const key of ["links", "feedLinks"]) {
    if (page[key] !== undefined) page[key] = typedStringArray(page[key], `${label}.${key}`);
  }
  if (page.sourceType !== undefined && !["web", "feed"].includes(page.sourceType)) {
    throw new TypeError(`${label}.sourceType must be 'web' or 'feed'.`);
  }
  if (page.status !== undefined) page.status = typedInteger(page.status, `${label}.status`, 100, 599);
  for (const key of ["bytes", "depth"]) {
    if (page[key] !== undefined) page[key] = typedInteger(page[key], `${label}.${key}`, 0);
  }
  if (page.robotsAllowed !== undefined && typeof page.robotsAllowed !== "boolean") {
    throw new TypeError(`${label}.robotsAllowed must be a boolean.`);
  }
  if (page.redirectChain !== undefined) {
    page.redirectChain = validatedRedirects(page.redirectChain, `${label}.redirectChain`);
  }
  if (page.feed !== undefined) page.feed = validatedFeed(page.feed);
  return page;
}

function pageMetadata(page) {
  const metadata = Object.create(null);
  for (const key of [
    "sourceType", "canonical", "description", "h1", "fetchedAt", "status", "bytes",
    "contentHash", "depth", "discoveredFrom", "redirectChain", "etag",
    "lastModified", "robotsAllowed", "links", "feedLinks", "feed"
  ]) {
    if (page[key] !== undefined) metadata[key] = page[key];
  }
  return snapshotJsonValue(metadata, {
    label: "Web crawler ResearchDocument metadata",
    maximumDepth: 50,
    maximumNodes: 100_000,
    maximumCollectionSize: 10_000,
    maximumStringLength: MAX_TEXT_LENGTH,
    allowNullPrototype: true,
    freeze: true,
    rejectRepeatedReferences: false
  });
}

function pageDocument(value, index) {
  const label = `Web crawler page ${index + 1}`;
  const page = validatedPage(value, index);
  const url = page.url;
  const title = optionalString(page.title, `${label}.title`) ?? "";
  const text = optionalString(page.text, `${label}.text`, {
    maximumLength: MAX_TEXT_LENGTH
  }) ?? "";
  const markdown = optionalString(page.markdown, `${label}.markdown`, {
    nullable: true,
    maximumLength: MAX_TEXT_LENGTH
  });
  const contentHash = optionalString(page.contentHash, `${label}.contentHash`);
  const contentType = optionalString(page.contentType, `${label}.contentType`);
  const language = optionalString(page.language, `${label}.language`, { nullable: true });
  const fetchedAt = optionalString(page.fetchedAt, `${label}.fetchedAt`);

  return {
    id: contentHash || url,
    uri: url,
    title: title || null,
    text: text || markdown || title || url,
    markdown: markdown || null,
    contentType: contentType || "text/html",
    language: language || null,
    authors: [],
    ...(fetchedAt ? { retrievedAt: fetchedAt } : {}),
    metadata: pageMetadata(page),
    citations: [{ uri: url, title: title || null }]
  };
}

/**
 * Wrap a host-supplied Maqam crawler tool (or `crawl`) as a governed source.
 * This adapter never imports or calls a network client on its own.
 */
export function createWebCrawlerSourceAdapter(hostCrawler) {
  if (typeof hostCrawler !== "function") {
    throw new TypeError("createWebCrawlerSourceAdapter requires a host-supplied crawler function.");
  }

  return defineResearchSourceAdapter({
    id: "web-crawler.direct",
    channel: "web",
    toolName: "research.web-crawler.direct",
    label: "Web pages through a governed host crawler",
    priority: 100,
    authentication: "none",
    capabilities: ["read", "web", "crawl"],
    metadata: {
      retrieval: "host-supplied-governed-crawler",
      implicitNetworkAccess: false,
      implicitAuthentication: false
    },
    check: async () => ({
      status: "ready",
      message: "The host crawler adapter is registered; this local check does not perform a crawl or test the network.",
      details: {
        registrationReady: true,
        liveVerified: false
      }
    }),
    read: async (input, context) => {
      const rawPages = await hostCrawler(input, context);
      const pages = snapshotOwnDataArray(rawPages, {
        label: "Web crawler source result",
        maximumLength: MAX_PAGES
      });
      if (pages.length === 0) {
        throw new ResearchSourceUnavailableError("The governed host crawler returned no pages.", {
          details: {
            adapterId: "web-crawler.direct",
            toolName: "research.web-crawler.direct"
          }
        });
      }
      return pages.map(pageDocument);
    }
  });
}
