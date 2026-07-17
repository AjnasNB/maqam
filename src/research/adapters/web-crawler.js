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
  const page = snapshotOwnDataRecord(value, {
    label,
    recognizedKeys: PAGE_KEYS
  });
  if (!Object.hasOwn(page, "url")) throw new TypeError(`${label} requires url.`);
  const url = requiredUrlString(page.url, `${label}.url`);
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
