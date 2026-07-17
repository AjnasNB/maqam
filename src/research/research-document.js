import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "../framework/boundary.js";

const DOCUMENT_KEYS = new Set([
  "id", "uri", "title", "text", "markdown", "contentType", "language",
  "authors", "publishedAt", "retrievedAt", "metadata", "citations"
]);
const PROVENANCE_KEYS = new Set(["adapterId", "channel", "retrievedAt"]);
const CITATION_KEYS = new Set(["uri", "title"]);
const MAX_DOCUMENTS = 10_000;
const MAX_AUTHORS = 1_000;
const MAX_CITATIONS = 10_000;
const MAX_IDENTIFIER_LENGTH = 200;
const MAX_URI_LENGTH = 100_000;
const MAX_TEXT_LENGTH = 5_000_000;
const MAX_SHORT_TEXT_LENGTH = 100_000;

function snapshotJsonObject(value, options) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${options.label} must be a plain JSON object.`);
  }
  return snapshotJsonValue(value, options);
}

function boundedString(value, label, maximumLength, { empty = false, nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || (!empty && value.trim() === "")) {
    throw new TypeError(`${label} must be ${nullable ? "null or " : ""}a${empty ? "" : " non-empty"} string.`);
  }
  if (value.length > maximumLength) {
    throw new TypeError(`${label} cannot exceed ${maximumLength} characters.`);
  }
  return value;
}

function identifier(value, label) {
  value = boundedString(value, label, MAX_IDENTIFIER_LENGTH);
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i.test(value)) {
    throw new TypeError(`${label} must contain only letters, numbers, dots, underscores, or hyphens.`);
  }
  return value;
}

function absoluteUri(value, label) {
  value = boundedString(value, label, MAX_URI_LENGTH);
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

function timestamp(value, label) {
  value = boundedString(value, label, MAX_SHORT_TEXT_LENGTH);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new TypeError(`${label} must be a valid timestamp.`);
  return new Date(milliseconds).toISOString();
}

function stringArray(value, label, maximumLength) {
  const result = snapshotOwnDataArray(value, { label, maximumLength });
  for (let index = 0; index < result.length; index += 1) {
    result[index] = boundedString(result[index], `${label}[${index}]`, MAX_SHORT_TEXT_LENGTH);
  }
  return result;
}

function normalizeCitation(value, index) {
  const label = `ResearchDocument citations[${index}]`;
  const citation = snapshotOwnDataRecord(value, {
    label,
    recognizedKeys: CITATION_KEYS
  });
  if (!Object.hasOwn(citation, "uri")) throw new TypeError(`${label} requires uri.`);
  return {
    uri: absoluteUri(citation.uri, `${label}.uri`),
    title: citation.title === undefined || citation.title === null
      ? null
      : boundedString(citation.title, `${label}.title`, MAX_SHORT_TEXT_LENGTH)
  };
}

function normalizeCitations(value) {
  const citations = snapshotOwnDataArray(value, {
    label: "ResearchDocument citations",
    maximumLength: MAX_CITATIONS
  });
  return citations.map(normalizeCitation);
}

function normalizeProvenance(value) {
  const provenance = snapshotOwnDataRecord(value, {
    label: "ResearchDocument provenance",
    recognizedKeys: PROVENANCE_KEYS
  });
  for (const key of ["adapterId", "channel"]) {
    if (!Object.hasOwn(provenance, key)) {
      throw new TypeError(`ResearchDocument provenance requires ${key}.`);
    }
  }
  return {
    adapterId: identifier(provenance.adapterId, "ResearchDocument provenance.adapterId"),
    channel: identifier(provenance.channel, "ResearchDocument provenance.channel"),
    retrievedAt: timestamp(
      provenance.retrievedAt === undefined ? new Date().toISOString() : provenance.retrievedAt,
      "ResearchDocument provenance.retrievedAt"
    )
  };
}

/**
 * Validate and detach one adapter result into the stable ResearchDocument v1
 * shape. The returned object and every nested collection are frozen.
 */
export function normalizeResearchDocument(value, provenance) {
  const source = normalizeProvenance(provenance);
  const input = snapshotOwnDataRecord(value, {
    label: "ResearchDocument",
    recognizedKeys: DOCUMENT_KEYS
  });
  if (!Object.hasOwn(input, "uri")) throw new TypeError("ResearchDocument requires uri.");

  const text = input.text === undefined
    ? ""
    : boundedString(input.text, "ResearchDocument.text", MAX_TEXT_LENGTH, { empty: true });
  const markdown = input.markdown === undefined || input.markdown === null
    ? null
    : boundedString(input.markdown, "ResearchDocument.markdown", MAX_TEXT_LENGTH, { empty: true });
  if (text.trim() === "" && (markdown === null || markdown.trim() === "")) {
    throw new TypeError("ResearchDocument requires non-empty text or markdown content.");
  }

  const retrievedAt = input.retrievedAt === undefined
    ? source.retrievedAt
    : timestamp(input.retrievedAt, "ResearchDocument.retrievedAt");

  return snapshotJsonValue({
    schemaVersion: "1.0",
    source: {
      adapterId: source.adapterId,
      channel: source.channel
    },
    id: input.id === undefined || input.id === null
      ? null
      : boundedString(input.id, "ResearchDocument.id", MAX_SHORT_TEXT_LENGTH),
    uri: absoluteUri(input.uri, "ResearchDocument.uri"),
    title: input.title === undefined || input.title === null
      ? null
      : boundedString(input.title, "ResearchDocument.title", MAX_SHORT_TEXT_LENGTH),
    text,
    markdown,
    contentType: boundedString(
      input.contentType === undefined ? "text/plain" : input.contentType,
      "ResearchDocument.contentType",
      MAX_IDENTIFIER_LENGTH
    ),
    language: input.language === undefined || input.language === null
      ? null
      : boundedString(input.language, "ResearchDocument.language", MAX_IDENTIFIER_LENGTH),
    authors: stringArray(
      input.authors === undefined ? [] : input.authors,
      "ResearchDocument authors",
      MAX_AUTHORS
    ),
    publishedAt: input.publishedAt === undefined || input.publishedAt === null
      ? null
      : timestamp(input.publishedAt, "ResearchDocument.publishedAt"),
    retrievedAt,
    metadata: snapshotJsonObject(input.metadata === undefined ? {} : input.metadata, {
      label: "ResearchDocument metadata",
      maximumDepth: 30,
      maximumNodes: 100_000,
      maximumCollectionSize: 10_000,
      maximumStringLength: MAX_TEXT_LENGTH,
      allowNullPrototype: true,
      freeze: true
    }),
    citations: normalizeCitations(input.citations === undefined ? [] : input.citations)
  }, {
    label: "Normalized ResearchDocument",
    allowNullPrototype: true,
    freeze: true
  });
}

/** Validate and freeze an adapter's complete document collection. */
export function normalizeResearchDocuments(value, provenance) {
  const source = normalizeProvenance(provenance);
  const documents = snapshotOwnDataArray(value, {
    label: "ResearchDocument collection",
    maximumLength: MAX_DOCUMENTS
  });
  return snapshotJsonValue(
    documents.map((document) => normalizeResearchDocument(document, source)),
    {
      label: "Normalized ResearchDocument collection",
      allowNullPrototype: true,
      freeze: true
    }
  );
}
