import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./boundary.js";

const OPTION_KEYS = ["seeds", "maxPages", "maxEvidenceChars", "sameOrigin", "includeSitemaps"];
const PAGE_KEYS = [
  "url", "canonical", "title", "description", "h1", "language", "text", "markdown",
  "links", "fetchedAt", "status", "contentType", "bytes", "contentHash", "depth",
  "discoveredFrom", "redirectChain", "etag", "lastModified", "robotsAllowed"
];
const REDIRECT_KEYS = ["from", "to", "status"];
const MAX_SEEDS = 1_000;
const MAX_PAGES = 10_000;
const MAX_LINKS_PER_PAGE = 10_000;
const MAX_REDIRECTS = 100;
const MAX_URL_LENGTH = 100_000;
const MAX_PAGE_TEXT_LENGTH = 2_000_000;

function boundedString(value, label, maximumLength, { nullable = false, empty = true } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || (!empty && value.trim() === "")) {
    throw new TypeError(`${label} must be ${nullable ? "null or " : ""}a${empty ? "" : " non-empty"} string.`);
  }
  if (value.length > maximumLength) {
    throw new TypeError(`${label} cannot exceed ${maximumLength} characters.`);
  }
  return value;
}

function httpUrl(value, label) {
  value = boundedString(value, label, MAX_URL_LENGTH, { empty: false });
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL without credentials.`);
  }
  return parsed.toString();
}

function safeInteger(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be a safe integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function stringArray(value, label, maximumLength, { urls = false } = {}) {
  const values = snapshotOwnDataArray(value, { label, maximumLength });
  for (let index = 0; index < values.length; index += 1) {
    values[index] = urls
      ? httpUrl(values[index], `${label}[${index}]`)
      : boundedString(values[index], `${label}[${index}]`, MAX_URL_LENGTH, { empty: false });
  }
  return values;
}

function snapshotOptions(options) {
  const input = snapshotOwnDataRecord(options, {
    label: "Research workflow options",
    recognizedKeys: OPTION_KEYS
  });
  const seeds = stringArray(input.seeds ?? [], "Research workflow seeds", MAX_SEEDS, { urls: true });
  const maxPages = input.maxPages ?? 10;
  const maxEvidenceChars = input.maxEvidenceChars ?? 20_000;
  safeInteger(maxPages, "Research workflow maxPages", { minimum: 1, maximum: MAX_PAGES });
  safeInteger(maxEvidenceChars, "Research workflow maxEvidenceChars", { minimum: 256, maximum: 100_000 });
  for (const key of ["sameOrigin", "includeSitemaps"]) {
    if (input[key] !== undefined && typeof input[key] !== "boolean") {
      throw new TypeError(`Research workflow ${key} must be a boolean.`);
    }
  }
  return Object.freeze({
    seeds: Object.freeze(seeds),
    maxPages,
    maxEvidenceChars,
    sameOrigin: input.sameOrigin ?? true,
    includeSitemaps: input.includeSitemaps ?? false
  });
}

function snapshotRedirect(value, pageIndex, redirectIndex) {
  const label = `Crawler page ${pageIndex + 1}.redirectChain[${redirectIndex}]`;
  const redirect = snapshotOwnDataRecord(value, { label, recognizedKeys: REDIRECT_KEYS });
  for (const key of REDIRECT_KEYS) {
    if (!Object.hasOwn(redirect, key)) throw new TypeError(`${label} requires ${key}.`);
  }
  redirect.from = httpUrl(redirect.from, `${label}.from`);
  redirect.to = httpUrl(redirect.to, `${label}.to`);
  redirect.status = safeInteger(redirect.status, `${label}.status`, { minimum: 300, maximum: 399 });
  return redirect;
}

function snapshotPage(value, index) {
  const label = `Crawler page ${index + 1}`;
  const page = snapshotOwnDataRecord(value, { label, recognizedKeys: PAGE_KEYS });
  if (!Object.hasOwn(page, "url")) throw new TypeError(`${label} requires url.`);
  page.url = httpUrl(page.url, `${label}.url`);

  for (const key of ["title", "description", "h1", "fetchedAt", "contentType", "contentHash"]) {
    if (page[key] !== undefined) {
      page[key] = boundedString(page[key], `${label}.${key}`, MAX_URL_LENGTH);
    }
  }
  for (const key of ["text", "markdown"]) {
    if (page[key] !== undefined) {
      page[key] = boundedString(page[key], `${label}.${key}`, MAX_PAGE_TEXT_LENGTH);
    }
  }
  for (const key of ["canonical", "language", "discoveredFrom", "etag", "lastModified"]) {
    if (page[key] !== undefined) {
      page[key] = boundedString(page[key], `${label}.${key}`, MAX_URL_LENGTH, { nullable: true });
    }
  }
  if (page.links !== undefined) {
    page.links = stringArray(page.links, `${label}.links`, MAX_LINKS_PER_PAGE, { urls: true });
  }
  if (page.redirectChain !== undefined) {
    const redirects = snapshotOwnDataArray(page.redirectChain, {
      label: `${label}.redirectChain`,
      maximumLength: MAX_REDIRECTS
    });
    page.redirectChain = redirects.map((redirect, redirectIndex) => (
      snapshotRedirect(redirect, index, redirectIndex)
    ));
  }
  if (page.status !== undefined) safeInteger(page.status, `${label}.status`, { minimum: 100, maximum: 599 });
  if (page.bytes !== undefined) safeInteger(page.bytes, `${label}.bytes`);
  if (page.depth !== undefined) safeInteger(page.depth, `${label}.depth`);
  if (page.robotsAllowed !== undefined && typeof page.robotsAllowed !== "boolean") {
    throw new TypeError(`${label}.robotsAllowed must be a boolean.`);
  }
  return snapshotJsonValue(page, {
    label,
    allowNullPrototype: true,
    freeze: true
  });
}

function snapshotPages(value, maxPages) {
  const pages = snapshotOwnDataArray(value, {
    label: "Crawler result",
    maximumLength: maxPages
  });
  return snapshotJsonValue(pages.map(snapshotPage), {
    label: "Research pages",
    allowNullPrototype: true,
    freeze: true
  });
}

function snapshotCollection(value, maxPages) {
  const collected = snapshotOwnDataRecord(value, {
    label: "Collected research output",
    recognizedKeys: ["pages", "evidenceIds"]
  });
  const pages = snapshotPages(collected.pages ?? [], maxPages);
  const evidenceIds = stringArray(
    collected.evidenceIds ?? [],
    "Collected research evidenceIds",
    maxPages
  );
  if (pages.length !== evidenceIds.length) {
    throw new TypeError("Collected research pages and evidenceIds must have the same length.");
  }
  return { pages, evidenceIds: Object.freeze(evidenceIds) };
}

function candidateNameFromPage(page) {
  if (page.title) return page.title.replace(/\s*[-|].*$/, "").trim();
  const url = new URL(page.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.at(-1) || url.hostname;
}

export function createResearchWorkflow(options = {}) {
  const config = snapshotOptions(options);

  return {
    name: "enterprise_research",
    tasks: [
      {
        id: "collect_sources",
        run: async (context) => {
          const rawPages = await context.tools.call("crawler", {
            seeds: config.seeds,
            maxPages: config.maxPages,
            sameOrigin: config.sameOrigin,
            includeSitemaps: config.includeSitemaps
          });
          const pages = snapshotPages(rawPages, config.maxPages);
          const batch = context.evidence.addBatch({
            evidence: pages.map((page) => ({
              sourceType: "url",
              source: page.url,
              excerpt: String(page.text || page.markdown || page.title || "").slice(0, config.maxEvidenceChars),
              confidence: page.status === 200 ? 0.85 : 0.5
            })),
            claims: []
          });
          const evidenceIds = batch.evidence.map((evidence) => evidence.evidenceId);
          return snapshotJsonValue({ pages, evidenceIds }, {
            label: "Collected research result",
            allowNullPrototype: true,
            freeze: true
          });
        }
      },
      {
        id: "synthesize_report",
        run: async (context) => {
          const collected = snapshotCollection(
            context.outputs.collect_sources ?? { pages: [], evidenceIds: [] },
            config.maxPages
          );
          const candidates = collected.pages.map((page, index) => ({
            name: candidateNameFromPage(page),
            url: page.url,
            whatItDoes: page.description || page.text?.slice(0, 240) || page.title || "",
            whyUseful: "Potential source or reference for governed agent framework capabilities.",
            risks: ["Requires license and maintenance review before reuse."],
            recommendation: "inspiration_first",
            evidenceIds: [collected.evidenceIds[index]]
          }));
          context.evidence.addBatch({
            evidence: [],
            claims: candidates.map((candidate) => ({
              text: `${candidate.name} was inspected from ${candidate.url}.`,
              evidenceIds: candidate.evidenceIds,
              confidence: 0.8
            }))
          });
          return snapshotJsonValue({ candidates }, {
            label: "Research synthesis result",
            allowNullPrototype: true,
            freeze: true
          });
        }
      },
      {
        id: "quality_checks",
        run: async (context) => snapshotJsonValue({
          unsupportedClaims: context.evidence.unsupportedClaims(),
          evidenceCount: context.evidence.listEvidence().length
        }, {
          label: "Research quality result",
          allowNullPrototype: true,
          freeze: true
        })
      }
    ]
  };
}
