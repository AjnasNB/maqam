import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import {
  snapshotJsonValue,
  snapshotOwnDataRecord
} from "../../framework/boundary.js";
import { MaqamError } from "../../framework/errors.js";
import { defineResearchSourceAdapter } from "../source-adapter.js";
import { ResearchSourceUnavailableError } from "../source-error.js";

const PARSER_ID = "maqam:rss-atom-offline-v1";
const OPTION_KEYS = [
  "maxItems",
  "maxInputBytes",
  "maxTextChars",
  "maxMetadataChars",
  "maxTotalTextChars"
];
const ADAPTER_INPUT_KEYS = ["url"];
const READER_RESPONSE_KEYS = [
  "body",
  "url",
  "finalUrl",
  "status",
  "contentType",
  "retrievedAt"
];
const DEFAULTS = Object.freeze({
  maxItems: 100,
  maxInputBytes: 2 * 1024 * 1024,
  maxTextChars: 20_000,
  maxMetadataChars: 2_000,
  maxTotalTextChars: 1_000_000
});
const LIMITS = Object.freeze({
  maxItems: [1, 1_000],
  maxInputBytes: [1_024, 10 * 1024 * 1024],
  maxTextChars: [128, 100_000],
  maxMetadataChars: [32, 10_000],
  maxTotalTextChars: [256, 5_000_000]
});
const MAX_URL_LENGTH = 8_192;
const MAX_CONTENT_TYPE_LENGTH = 256;
const DISALLOWED_CONTENT_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "template",
  "svg",
  "math",
  "canvas",
  "audio",
  "video",
  "source",
  "track",
  "link",
  "meta"
];
const MARKDOWN_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "ul"
]);

function safeInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be a safe integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function snapshotOptions(options = {}) {
  const snapshot = snapshotOwnDataRecord(options, {
    label: "RSS/Atom parser options",
    recognizedKeys: OPTION_KEYS
  });
  for (const key of OPTION_KEYS) {
    const value = snapshot[key] ?? DEFAULTS[key];
    const [minimum, maximum] = LIMITS[key];
    snapshot[key] = safeInteger(value, `RSS/Atom parser option ${key}`, minimum, maximum);
  }
  return Object.freeze(snapshot);
}

function boundedString(value, label, maximumLength, { allowEmpty = false } = {}) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string.`);
  if (!allowEmpty && value.trim() === "") throw new TypeError(`${label} must be non-empty.`);
  if (value.length > maximumLength) {
    throw new TypeError(`${label} cannot exceed ${maximumLength} characters.`);
  }
  return value;
}

function truncate(value, maximumLength) {
  if (value.length <= maximumLength) return value;
  let result = value.slice(0, maximumLength);
  const finalCodeUnit = result.charCodeAt(result.length - 1);
  if (finalCodeUnit >= 0xD800 && finalCodeUnit <= 0xDBFF) result = result.slice(0, -1);
  return result;
}

function normalizeSpace(value) {
  return value.replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\r?\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainTextFromSanitizedHtml(html) {
  const blockBoundary = "\uE000";
  const lineBoundary = "\uE001";
  const document = cheerio.load(`<body>${html}</body>`, {
    xmlMode: false,
    decodeEntities: true,
    scriptingEnabled: false
  });
  const body = document("body");
  body.find("br").replaceWith(lineBoundary);
  body.find("blockquote,div,h1,h2,h3,h4,h5,h6,hr,li,ol,p,pre,ul").each((_, element) => {
    const node = document(element);
    node.prepend(blockBoundary);
    node.append(blockBoundary);
  });
  return normalizeSpace(
    body.text()
      .replace(/\s+/g, " ")
      .replace(new RegExp(` *${blockBoundary}+ *`, "g"), "\n\n")
      .replace(new RegExp(` *${lineBoundary} *`, "g"), "\n")
  );
}

function safeHttpUrl(value, baseUrl, { required = false } = {}) {
  if (typeof value !== "string" || value.trim() === "") {
    if (required) throw new TypeError("Feed URL must be a non-empty string.");
    return null;
  }
  if (value.length > MAX_URL_LENGTH) {
    if (required) throw new TypeError(`Feed URL cannot exceed ${MAX_URL_LENGTH} characters.`);
    return null;
  }
  let parsed;
  try {
    parsed = baseUrl === undefined ? new URL(value) : new URL(value, baseUrl);
  } catch {
    if (required) throw new TypeError("Feed URL must be an absolute HTTP(S) URL.");
    return null;
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    if (required) {
      throw new TypeError("Feed URL must be an absolute HTTP(S) URL without credentials.");
    }
    return null;
  }
  parsed.hash = "";
  return parsed.toString();
}

function elementName(element) {
  const name = element?.name ?? element?.tagName ?? "";
  return String(name).toLowerCase().split(":").at(-1);
}

function directChildren($, parent, name) {
  return $(parent).children().toArray().filter((element) => elementName(element) === name);
}

function firstDirectChild($, parent, names) {
  const wanted = new Set(Array.isArray(names) ? names : [names]);
  return $(parent).children().toArray().find((element) => wanted.has(elementName(element))) ?? null;
}

function directText($, parent, names) {
  const element = firstDirectChild($, parent, names);
  return element ? $(element).text() : "";
}

function directPayload($, parent, names) {
  const element = firstDirectChild($, parent, names);
  if (!element) return "";
  const hasElementChildren = $(element).children().length > 0;
  return hasElementChildren ? ($(element).html() ?? "") : $(element).text();
}

function attributeValue($, element, name) {
  if (!element) return "";
  const attributes = element.attribs ?? {};
  const matchingKey = Object.keys(attributes).find((key) => key.toLowerCase() === name.toLowerCase());
  return matchingKey ? $(element).attr(matchingKey) ?? "" : "";
}

function xmlBase($, element, fallback) {
  return safeHttpUrl(attributeValue($, element, "xml:base"), fallback) ?? fallback;
}

function sanitizeContent(rawValue, baseUrl, maximumLength) {
  if (typeof rawValue !== "string" || rawValue === "" || maximumLength <= 0) {
    return { text: "", markdown: "" };
  }
  const document = cheerio.load(`<body>${rawValue}</body>`, {
    xmlMode: false,
    decodeEntities: true,
    scriptingEnabled: false
  });
  const body = document("body");
  body.find(DISALLOWED_CONTENT_TAGS.join(",")).remove();

  body.find("a").each((_, element) => {
    const link = document(element);
    const href = safeHttpUrl(link.attr("href") ?? "", baseUrl);
    if (!href) {
      link.replaceWith(link.contents());
      return;
    }
    const label = normalizeSpace(link.text());
    link.replaceWith(`<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`);
  });

  body.find("*").each((_, element) => {
    const node = document(element);
    const name = elementName(element);
    if (!MARKDOWN_TAGS.has(name)) {
      node.replaceWith(node.contents());
      return;
    }
    if (name !== "a") {
      for (const attribute of Object.keys(element.attribs ?? {})) node.removeAttr(attribute);
    }
  });

  const sanitizedHtml = body.html() ?? "";
  const text = truncate(plainTextFromSanitizedHtml(sanitizedHtml), maximumLength);
  const turndown = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    headingStyle: "atx",
    strongDelimiter: "**"
  });
  const markdown = truncate(
    normalizeSpace(turndown.turndown(sanitizedHtml)),
    maximumLength
  );
  return { text, markdown };
}

function sanitizeMetadata(rawValue, baseUrl, maximumLength) {
  return sanitizeContent(rawValue, baseUrl, maximumLength).text;
}

function normalizeTimestamp(rawValue, baseUrl, maximumLength) {
  const value = sanitizeMetadata(rawValue, baseUrl, maximumLength);
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableEntryHash(entry) {
  return sha256(JSON.stringify([
    entry.id,
    entry.url,
    entry.title,
    entry.author,
    entry.publishedAt,
    entry.text,
    entry.markdown
  ]));
}

function contentWithinBudget(rawContent, baseUrl, config, remaining) {
  if (remaining <= 0) return { text: "", markdown: "", consumed: 0 };
  const perRepresentation = Math.min(config.maxTextChars, Math.max(1, Math.floor(remaining / 2)));
  const sanitized = sanitizeContent(rawContent, baseUrl, perRepresentation);
  let text = sanitized.text;
  let markdown = sanitized.markdown;
  let consumed = text.length + markdown.length;
  if (consumed > remaining) {
    const textAllowance = Math.min(text.length, Math.floor(remaining / 2));
    text = truncate(text, textAllowance);
    markdown = truncate(markdown, Math.max(0, remaining - text.length));
    consumed = text.length + markdown.length;
  }
  return { text, markdown, consumed };
}

function atomLink($, parent, baseUrl) {
  const links = directChildren($, parent, "link");
  const selected = links.find((element) => {
    const rel = attributeValue($, element, "rel").trim().toLowerCase();
    return rel === "" || rel === "alternate";
  });
  if (!selected) return null;
  const elementBase = xmlBase($, selected, baseUrl);
  return safeHttpUrl(attributeValue($, selected, "href"), elementBase);
}

function atomAuthor($, parent, baseUrl, maximumLength) {
  const author = firstDirectChild($, parent, "author");
  if (!author) return "";
  return sanitizeMetadata(
    directText($, author, "name") || $(author).text(),
    baseUrl,
    maximumLength
  );
}

function rssItemUrl($, item, baseUrl) {
  const link = safeHttpUrl(directText($, item, "link"), baseUrl);
  if (link) return link;
  const guidElement = firstDirectChild($, item, "guid");
  if (!guidElement) return null;
  const isPermalink = attributeValue($, guidElement, "isPermaLink").trim().toLowerCase();
  if (isPermalink === "false") return null;
  return safeHttpUrl($(guidElement).text(), baseUrl);
}

function buildEntry({
  id,
  url,
  title,
  author,
  publishedAt,
  text,
  markdown,
  sourceUrl,
  format
}) {
  const entry = {
    id: id || url,
    url,
    title: title || url,
    author: author || null,
    publishedAt,
    text,
    markdown
  };
  const contentHash = stableEntryHash(entry);
  return {
    ...entry,
    contentHash,
    provenance: {
      sourceUrl,
      format,
      itemId: entry.id,
      contentHash,
      parser: PARSER_ID
    }
  };
}

function parseRss($, root, sourceUrl, config) {
  const channel = firstDirectChild($, root, "channel");
  if (!channel) throw new TypeError("RSS 2.0 document must contain a channel element.");
  const baseUrl = xmlBase($, channel, xmlBase($, root, sourceUrl));
  const feedTitle = sanitizeMetadata(directText($, channel, "title"), baseUrl, config.maxMetadataChars);
  const feedAuthor = sanitizeMetadata(
    directText($, channel, ["managingeditor", "creator", "author"]),
    baseUrl,
    config.maxMetadataChars
  );
  const items = [];
  const seen = new Set();
  let remainingText = config.maxTotalTextChars;
  for (const item of directChildren($, channel, "item")) {
    if (items.length >= config.maxItems) break;
    const itemBase = xmlBase($, item, baseUrl);
    const url = rssItemUrl($, item, itemBase);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const id = sanitizeMetadata(
      directText($, item, "guid") || url,
      itemBase,
      config.maxMetadataChars
    );
    const content = contentWithinBudget(
      directPayload($, item, ["encoded", "content", "description", "summary"]),
      itemBase,
      config,
      remainingText
    );
    remainingText -= content.consumed;
    items.push(buildEntry({
      id,
      url,
      title: sanitizeMetadata(directPayload($, item, "title"), itemBase, config.maxMetadataChars),
      author: sanitizeMetadata(
        directText($, item, ["creator", "author"]) || feedAuthor,
        itemBase,
        config.maxMetadataChars
      ),
      publishedAt: normalizeTimestamp(
        directText($, item, ["pubdate", "date", "published", "updated"]),
        itemBase,
        config.maxMetadataChars
      ),
      text: content.text,
      markdown: content.markdown,
      sourceUrl,
      format: "rss2"
    }));
  }
  return {
    format: "rss2",
    title: feedTitle,
    description: sanitizeMetadata(
      directPayload($, channel, ["description", "subtitle"]),
      baseUrl,
      config.maxMetadataChars
    ),
    homeUrl: safeHttpUrl(directText($, channel, "link"), baseUrl),
    language: sanitizeMetadata(directText($, channel, "language"), baseUrl, config.maxMetadataChars) || null,
    author: feedAuthor || null,
    updatedAt: normalizeTimestamp(
      directText($, channel, ["lastbuilddate", "pubdate", "date"]),
      baseUrl,
      config.maxMetadataChars
    ),
    items
  };
}

function parseAtom($, root, sourceUrl, config) {
  const baseUrl = xmlBase($, root, sourceUrl);
  const feedAuthor = atomAuthor($, root, baseUrl, config.maxMetadataChars);
  const items = [];
  const seen = new Set();
  let remainingText = config.maxTotalTextChars;
  for (const entry of directChildren($, root, "entry")) {
    if (items.length >= config.maxItems) break;
    const entryBase = xmlBase($, entry, baseUrl);
    const url = atomLink($, entry, entryBase)
      ?? safeHttpUrl(directText($, entry, "id"), entryBase);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const id = sanitizeMetadata(
      directText($, entry, "id") || url,
      entryBase,
      config.maxMetadataChars
    );
    const content = contentWithinBudget(
      directPayload($, entry, ["content", "summary"]),
      entryBase,
      config,
      remainingText
    );
    remainingText -= content.consumed;
    items.push(buildEntry({
      id,
      url,
      title: sanitizeMetadata(directPayload($, entry, "title"), entryBase, config.maxMetadataChars),
      author: atomAuthor($, entry, entryBase, config.maxMetadataChars) || feedAuthor,
      publishedAt: normalizeTimestamp(
        directText($, entry, ["published", "updated"]),
        entryBase,
        config.maxMetadataChars
      ),
      text: content.text,
      markdown: content.markdown,
      sourceUrl,
      format: "atom"
    }));
  }
  return {
    format: "atom",
    title: sanitizeMetadata(directPayload($, root, "title"), baseUrl, config.maxMetadataChars),
    description: sanitizeMetadata(
      directPayload($, root, ["subtitle", "tagline"]),
      baseUrl,
      config.maxMetadataChars
    ),
    homeUrl: atomLink($, root, baseUrl),
    language: sanitizeMetadata(attributeValue($, root, "xml:lang"), baseUrl, config.maxMetadataChars) || null,
    author: feedAuthor || null,
    updatedAt: normalizeTimestamp(
      directText($, root, ["updated", "published"]),
      baseUrl,
      config.maxMetadataChars
    ),
    items
  };
}

function documentRoot($) {
  return $.root().children().toArray().find((element) => ["rss", "feed"].includes(elementName(element))) ?? null;
}

/**
 * Parse an already-retrieved RSS 2.0 or Atom document without network access.
 * The caller remains responsible for retrieving the document through a governed
 * Maqam crawler or another host-supplied, policy-enforced reader.
 */
export function parseRssAtom(xml, sourceUrl, options = {}) {
  const config = snapshotOptions(options);
  sourceUrl = safeHttpUrl(sourceUrl, undefined, { required: true });
  if (typeof xml !== "string") throw new TypeError("RSS/Atom document must be a string.");
  if (xml.trim() === "") throw new TypeError("RSS/Atom document must be non-empty.");
  const inputBytes = Buffer.byteLength(xml, "utf8");
  if (inputBytes > config.maxInputBytes) {
    throw new TypeError(`RSS/Atom document cannot exceed ${config.maxInputBytes} bytes.`);
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new TypeError("RSS/Atom document cannot contain DTD or entity declarations.");
  }

  const $ = cheerio.load(xml, {
    xmlMode: true,
    decodeEntities: true,
    scriptingEnabled: false
  });
  const root = documentRoot($);
  if (!root) throw new TypeError("Document must be RSS 2.0 or Atom XML.");
  const format = elementName(root);
  const parsed = format === "rss"
    ? parseRss($, root, sourceUrl, config)
    : parseAtom($, root, sourceUrl, config);
  const contentHash = sha256(xml);
  return snapshotJsonValue({
    sourceUrl,
    ...parsed,
    contentHash,
    provenance: {
      sourceUrl,
      format: parsed.format,
      contentHash,
      parser: PARSER_ID,
      networkAccess: false
    }
  }, {
    label: "RSS/Atom parse result",
    maximumCollectionSize: config.maxItems + 32,
    maximumStringLength: Math.max(config.maxTextChars, config.maxMetadataChars, MAX_URL_LENGTH),
    allowNullPrototype: true,
    freeze: true
  });
}

function snapshotAdapterInput(input) {
  const snapshot = snapshotOwnDataRecord(input, {
    label: "RSS/Atom adapter input",
    recognizedKeys: ADAPTER_INPUT_KEYS
  });
  if (!Object.hasOwn(snapshot, "url")) throw new TypeError("RSS/Atom adapter input requires url.");
  return Object.freeze({ url: safeHttpUrl(snapshot.url, undefined, { required: true }) });
}

function timestamp(value, label) {
  if (value === undefined || value === null) return null;
  value = boundedString(value, label, 128);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be a valid timestamp.`);
  return new Date(parsed).toISOString();
}

function snapshotReaderResponse(value, requestedUrl) {
  if (typeof value === "string") {
    return Object.freeze({
      body: value,
      finalUrl: requestedUrl,
      status: null,
      contentType: null,
      retrievedAt: null
    });
  }
  const snapshot = snapshotOwnDataRecord(value, {
    label: "RSS/Atom reader response",
    recognizedKeys: READER_RESPONSE_KEYS
  });
  if (!Object.hasOwn(snapshot, "body")) throw new TypeError("RSS/Atom reader response requires body.");
  if (typeof snapshot.body !== "string") throw new TypeError("RSS/Atom reader response.body must be a string.");
  const finalUrl = safeHttpUrl(snapshot.finalUrl ?? snapshot.url ?? requestedUrl, undefined, { required: true });
  let status = null;
  if (snapshot.status !== undefined && snapshot.status !== null) {
    status = safeInteger(snapshot.status, "RSS/Atom reader response.status", 100, 599);
  }
  let contentType = null;
  if (snapshot.contentType !== undefined && snapshot.contentType !== null) {
    contentType = boundedString(
      snapshot.contentType,
      "RSS/Atom reader response.contentType",
      MAX_CONTENT_TYPE_LENGTH
    );
  }
  return Object.freeze({
    body: snapshot.body,
    finalUrl,
    status,
    contentType,
    retrievedAt: timestamp(snapshot.retrievedAt, "RSS/Atom reader response.retrievedAt")
  });
}

function requireSuccessfulReaderResponse(response) {
  const { status } = response;
  if (status === null || (status >= 200 && status < 300)) return;
  const details = { status, finalUrl: response.finalUrl };
  if (status === 401) {
    throw new MaqamError("The RSS/Atom reader requires authentication.", {
      code: "AUTHENTICATION_HTTP_401",
      details
    });
  }
  if (status === 403) {
    throw new MaqamError("The RSS/Atom reader denied authorization.", {
      code: "AUTHORIZATION_HTTP_403",
      details
    });
  }
  if (status === 404 || status === 410) {
    throw new ResearchSourceUnavailableError("The RSS/Atom source is unavailable.", {
      details
    });
  }
  throw new MaqamError(`The RSS/Atom reader returned HTTP ${status}.`, {
    code: "RESEARCH_SOURCE_HTTP_ERROR",
    details
  });
}

/**
 * Create an adapter around a host-supplied governed document reader. This
 * factory deliberately has no fetch fallback and never performs network I/O.
 */
export function createRssAtomResearchAdapter(readDocument, options = {}) {
  if (typeof readDocument !== "function") {
    throw new TypeError("createRssAtomResearchAdapter requires a host-supplied readDocument function.");
  }
  const config = snapshotOptions(options);

  return async function rssAtomResearchAdapter(input = {}, context = {}) {
    const request = snapshotAdapterInput(input);
    const readerRequest = snapshotJsonValue({
      url: request.url,
      maxBytes: config.maxInputBytes,
      acceptedFormats: ["rss2", "atom"]
    }, {
      label: "RSS/Atom reader request",
      freeze: true
    });
    const response = snapshotReaderResponse(
      await readDocument(readerRequest, context),
      request.url
    );
    requireSuccessfulReaderResponse(response);
    const parsed = parseRssAtom(response.body, response.finalUrl, config);
    const {
      networkAccess: parserNetworkAccess,
      ...parserProvenance
    } = parsed.provenance;
    return snapshotJsonValue({
      ...parsed,
      provenance: {
        ...parserProvenance,
        parserNetworkAccess,
        retrieval: "host-supplied-reader",
        retrievalNetworkAccess: "host-defined",
        requestedUrl: request.url,
        finalUrl: response.finalUrl,
        status: response.status,
        contentType: response.contentType,
        retrievedAt: response.retrievedAt
      }
    }, {
      label: "RSS/Atom adapter result",
      maximumCollectionSize: config.maxItems + 32,
      maximumStringLength: Math.max(config.maxTextChars, config.maxMetadataChars, MAX_URL_LENGTH),
      allowNullPrototype: true,
      freeze: true
    });
  };
}

/**
 * Create the built-in RSS/Atom source descriptor. Register `adapter.read` at
 * `adapter.toolName` in a ToolGateway, then let ResearchSourceRegistry route
 * through a bound ToolCaller. The host reader remains responsible for the
 * governed network retrieval; this package supplies parsing and normalization.
 */
export function createRssAtomSourceAdapter(readDocument, options = {}) {
  const readFeed = createRssAtomResearchAdapter(readDocument, options);
  return defineResearchSourceAdapter({
    id: "rss-atom.direct",
    channel: "rss-atom",
    toolName: "research.rss-atom.direct",
    label: "RSS and Atom through a governed host reader",
    priority: 100,
    authentication: "none",
    capabilities: ["read", "rss", "atom"],
    metadata: {
      parser: PARSER_ID,
      retrieval: "host-supplied-governed-reader",
      parserNetworkAccess: false,
      implicitNetworkAccess: false
    },
    check: async () => ({
      status: "ready",
      message: "The offline RSS/Atom parser is registered; this check does not test the host reader or network.",
      details: {
        parser: PARSER_ID,
        liveVerified: false
      }
    }),
    read: async (input, context) => {
      const feed = await readFeed(input, context);
      return feed.items.map((item) => ({
        id: item.id,
        uri: item.url,
        title: item.title || null,
        text: item.text || item.title || item.url,
        markdown: item.markdown || null,
        contentType: "text/markdown",
        language: feed.language || null,
        authors: item.author ? [item.author] : [],
        publishedAt: item.publishedAt,
        metadata: {
          contentHash: item.contentHash,
          feed: {
            uri: feed.sourceUrl,
            title: feed.title || null,
            format: feed.format,
            contentHash: feed.contentHash
          },
          provenance: item.provenance
        },
        citations: [{
          uri: feed.sourceUrl,
          title: feed.title || null
        }]
      }));
    }
  });
}
