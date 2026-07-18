import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyIpAddress } from "../crawler/security.js";
import {
  AgentRuntime,
  EvidenceLedger,
  PolicyEngine,
  ToolGateway,
  createCrawlerTool,
  createResearchWorkflow
} from "../index.js";
import { redactText } from "../framework/audit.js";
import { PolicyDeniedError } from "../framework/errors.js";
import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "../framework/boundary.js";
import { createExaSearchSourceAdapter } from "../research/adapters/exa-search.js";
import { createYtDlpYouTubeSourceAdapter } from "../research/adapters/youtube.js";
import { defineResearchSourceAdapter } from "../research/source-adapter.js";
import {
  ResearchSourceAuthenticationRequiredError,
  ResearchSourceUnavailableError
} from "../research/source-error.js";
import { ResearchSourceRegistry } from "../research/source-registry.js";

const PRODUCT = {
  name: "Maqam",
  tagline: "Compose governed agents",
  description: "Agent framework console for policy-bound workflows, evidence capture, CLI workers, connectors, and auditable runs."
};

const CAPABILITIES = {
  adapters: [
    {
      id: "function",
      name: "Functions and objects",
      boundary: "In-process adapter",
      preventive: "Registry, policy, call budget, deadline",
      observed: "Task trace, evidence, claims",
      defaultPosture: "Explicit registration"
    },
    {
      id: "cli",
      name: "Generic CLI workers",
      boundary: "Isolated child process",
      preventive: "Fixed command, cwd roots, env allowlist, timeout",
      observed: "Exit, duration, output limits",
      defaultPosture: "No shell"
    },
    {
      id: "codex",
      name: "Codex CLI",
      boundary: "Process plus provider sandbox",
      preventive: "Read-only default, ephemeral run, environment allowlist",
      observed: "JSONL actions and token usage",
      defaultPosture: "Read-only"
    },
    {
      id: "claude-code",
      name: "Claude Code",
      boundary: "Process plus permission mode",
      preventive: "Plan default, tool allowlist, max turns and spend",
      observed: "Stream events, token usage, cost",
      defaultPosture: "Plan, no tools"
    },
    {
      id: "connector",
      name: "HTTP and SDK connectors",
      boundary: "Tool gateway",
      preventive: "Tool, origin, effect, approval policy",
      observed: "Call trace and evidence",
      defaultPosture: "Explicit registration"
    },
    {
      id: "crawler",
      name: "Research connectors",
      boundary: "Tool gateway plus crawler limits",
      preventive: "Origin policy, DNS pinning, redirect and robots checks, request and byte limits",
      observed: "Sources, digests, excerpts, claims",
      defaultPosture: "Public networks only"
    }
  ],
  controls: ["policy", "budgets", "approvals", "environment", "sandbox", "trace", "evidence"],
  limitations: [
    "Only registered adapters are governed.",
    "Provider-internal actions rely on the provider sandbox or permission system.",
    "Observed token ceilings are post-run unless the provider exposes a hard budget.",
    "Run, approval, and evidence state is in-process unless the host persists exported records.",
    "Use a container or virtual machine for hard operating-system isolation."
  ]
};

const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL("../../app/", import.meta.url));
const SERVER_OPTION_KEYS = [
  "publicDir", "crawlerTool", "allowedHosts", "allowedOrigins", "allowedUiOrigins",
  "apiToken", "allowPrivateNetworks", "allowCrossOriginCrawls", "maxSeeds", "port", "host",
  "sourceAdapters", "sourceAllowedOrigins", "ytDlpCommand"
];

const MAX_SOURCE_ADAPTERS = 32;
const MAX_SOURCE_BODY_BYTES = 128 * 1024;
const MAX_SOURCE_BACKEND_PREFERENCES = 32;
const MAX_SOURCE_DOCUMENTS = 25;
const MAX_SOURCE_INPUT_DEPTH = 12;
const MAX_SOURCE_INPUT_NODES = 5_000;
const MAX_SOURCE_INPUT_COLLECTION_SIZE = 100;
const MAX_SOURCE_INPUT_STRING_LENGTH = 10_000;
const MAX_SOURCE_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_OUTPUT_STRING_LENGTH = 50_000;
const MAX_SOURCE_STATUS_QUERY_LENGTH = 4_096;
const MAX_SOURCE_DOCTOR_TIMEOUT_MS = 10_000;
const SOURCE_RUN_KEYS = new Set(["channel", "input", "backendPreference", "objective"]);
const SOURCE_STATUS_QUERY_KEYS = new Set(["channel", "adapterId", "timeoutMs"]);

function snapshotStringArray(value, label) {
  const snapshot = snapshotOwnDataArray(value, { label });
  for (let index = 0; index < snapshot.length; index += 1) {
    if (typeof snapshot[index] !== "string") {
      throw new TypeError(`${label}[${index}] must be a string.`);
    }
  }
  return Object.freeze(snapshot);
}

function snapshotServerOptions(value = {}) {
  const snapshot = snapshotOwnDataRecord(value, {
    label: "Maqam server options",
    recognizedKeys: SERVER_OPTION_KEYS
  });
  for (const key of ["allowedHosts", "allowedOrigins", "allowedUiOrigins", "sourceAllowedOrigins"]) {
    if (snapshot[key] !== undefined) snapshot[key] = snapshotStringArray(snapshot[key], `Maqam server options.${key}`);
  }
  if (snapshot.sourceAdapters !== undefined) {
    snapshot.sourceAdapters = Object.freeze(snapshotOwnDataArray(snapshot.sourceAdapters, {
      label: "Maqam server options.sourceAdapters",
      maximumLength: MAX_SOURCE_ADAPTERS
    }));
  }
  for (const key of ["allowPrivateNetworks", "allowCrossOriginCrawls"]) {
    if (snapshot[key] !== undefined && typeof snapshot[key] !== "boolean") {
      throw new TypeError(`Maqam server options.${key} must be a boolean.`);
    }
  }
  for (const key of ["publicDir", "host", "ytDlpCommand"]) {
    if (snapshot[key] !== undefined && typeof snapshot[key] !== "string") {
      throw new TypeError(`Maqam server options.${key} must be a string.`);
    }
  }
  if (snapshot.ytDlpCommand !== undefined
    && (snapshot.ytDlpCommand.trim() === "" || !isAbsolute(snapshot.ytDlpCommand))) {
    throw new TypeError("Maqam server options.ytDlpCommand must be an absolute executable path.");
  }
  if (snapshot.crawlerTool !== undefined && typeof snapshot.crawlerTool !== "function") {
    throw new TypeError("Maqam server options.crawlerTool must be a function.");
  }
  if (snapshot.apiToken !== undefined && snapshot.apiToken !== null
    && (typeof snapshot.apiToken !== "string" || snapshot.apiToken.length === 0)) {
    throw new TypeError("Maqam server options.apiToken must be a non-empty string or null.");
  }
  if (snapshot.maxSeeds !== undefined
    && (!Number.isInteger(snapshot.maxSeeds) || snapshot.maxSeeds < 1 || snapshot.maxSeeds > 100)) {
    throw new TypeError("Maqam server options.maxSeeds must be an integer from 1 to 100.");
  }
  if (snapshot.port !== undefined
    && (!Number.isInteger(snapshot.port) || snapshot.port < 0 || snapshot.port > 65_535)) {
    throw new TypeError("Maqam server options.port must be an integer from 0 to 65535.");
  }
  return Object.freeze(snapshot);
}

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8"
};

const CORS_ALLOW_METHODS = "GET,POST,OPTIONS";
const CORS_ALLOW_HEADERS = "Authorization,Content-Type";

function normalizeBindHost(value) {
  return (typeof value === "string" ? value : "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function isLoopbackBindHost(value) {
  const host = normalizeBindHost(value);
  if (host === "localhost") return true;
  return classifyIpAddress(host).range === "loopback";
}

function listenTarget(args) {
  const first = args[0];
  if (typeof first === "string") return { kind: "ipc", host: null };
  if (typeof first === "number") {
    return {
      kind: "tcp",
      host: typeof args[1] === "string" ? args[1] : null
    };
  }
  if (first && typeof first === "object") {
    // Existing handles and file descriptors take precedence over port/path in
    // Node. Their actual bind address is opaque here, so require the protected
    // non-loopback path instead of trusting a decoy `path` or loopback `host`.
    if (["handle", "_handle", "fd"].some((key) => Object.hasOwn(first, key))) {
      return { kind: "unknown", host: null };
    }
    // `port` takes precedence over `path` when both are present.
    if (Object.hasOwn(first, "port")) {
      if (first.host !== undefined && typeof first.host !== "string") {
        return { kind: "unknown", host: null };
      }
      return { kind: "tcp", host: first.host || null };
    }
    if (Object.hasOwn(first, "path") && typeof first.path === "string") {
      return { kind: "ipc", host: null };
    }
  }
  return { kind: "unknown", host: null };
}

function snapshotListenOptions(value) {
  // A null prototype ensures Node cannot observe polluted transport selectors
  // (for example Object.prototype.handle) that were not reviewed by the guard.
  const snapshot = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new TypeError("Maqam listen options cannot contain symbol keys.");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`Maqam listen option '${key}' must be an own data property.`);
    }
    Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: descriptor.enumerable,
      configurable: true,
      writable: true
    });
  }
  return snapshot;
}

function prepareListenCall(args) {
  const first = args[0];
  if (!first || typeof first !== "object") {
    return { args, target: listenTarget(args) };
  }

  let prototype;
  try {
    prototype = Object.getPrototypeOf(first);
  } catch {
    throw new TypeError("Maqam listen options must expose a stable object shape.");
  }
  if (prototype !== Object.prototype && prototype !== null) {
    // Direct native handles and custom option objects have an opaque bind
    // target. They are permitted only through the protected non-loopback path.
    return { args, target: { kind: "unknown", host: null } };
  }

  const snapshot = snapshotListenOptions(first);
  const preparedArgs = [snapshot, ...args.slice(1)];
  return { args: preparedArgs, target: listenTarget(preparedArgs) };
}

function guardServerListen(server, { apiToken, hasExplicitAllowedHosts }) {
  const originalListen = server.listen;
  server.listen = function guardedListen(...args) {
    const prepared = prepareListenCall(args);
    const target = prepared.target;
    if (target.kind !== "ipc" && !isLoopbackBindHost(target.host)) {
      if (!apiToken) {
        throw new Error("Binding a raw Maqam server beyond loopback requires options.apiToken; startMaqamServer also supports MAQAM_API_TOKEN.");
      }
      if (!hasExplicitAllowedHosts) {
        throw new Error("Binding Maqam beyond loopback requires an explicit allowedHosts list.");
      }
    }
    return originalListen.apply(this, prepared.args);
  };
  return server;
}

function sendJsonBody(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": CONTENT_TYPES[".json"],
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  });
  response.end(body);
}

function sendJson(response, statusCode, payload) {
  sendJsonBody(response, statusCode, JSON.stringify(payload, null, 2));
}

function sendBoundedJson(response, statusCode, payload, maximumBytes) {
  const body = JSON.stringify(payload, null, 2);
  if (Buffer.byteLength(body) > maximumBytes) {
    throw httpError(502, "Source response exceeded the server output limit.");
  }
  sendJsonBody(response, statusCode, body);
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requireJsonContentType(request) {
  const contentType = String(request.headers["content-type"] || "").toLowerCase();
  if (!/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;|$)/i.test(contentType)) {
    throw httpError(415, "Content-Type must be application/json.");
  }
}

async function readJsonBody(request, maximumBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.byteLength;
    if (size > maximumBytes) throw httpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("Request body must be a JSON object.");
    }
    return snapshotJsonValue(parsed, { label: "Maqam request body" });
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

function normalizeSeeds(seeds, maxSeeds) {
  if (!Array.isArray(seeds)) throw httpError(400, "`seeds` must be an array of URLs.");
  if (seeds.length > maxSeeds) throw httpError(400, `No more than ${maxSeeds} seed URLs are allowed.`);
  const normalized = seeds.map((seed) => {
    try {
      const url = new URL(seed);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
  }).filter(Boolean);
  if (!normalized.length) throw httpError(400, "At least one http(s) seed URL is required.");
  return [...new Set(normalized)];
}

function clampMaxPages(value) {
  const maxPages = Number(value || 5);
  if (!Number.isFinite(maxPages)) return 5;
  return Math.max(1, Math.min(10, Math.floor(maxPages)));
}

function deriveOrigins(seeds) {
  return [...new Set(seeds.map((seed) => new URL(seed).origin))];
}

function normalizedConfiguredOrigins(values = [], label = "allowedOrigins") {
  if (!Array.isArray(values)) throw new TypeError(`${label} server option must be an array.`);
  return [...new Set(values.map((value) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new TypeError(`${label} server option accepts only exact canonical HTTP(S) origins.`);
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:")
      || url.username
      || url.password
      || url.origin !== value) {
      throw new TypeError(`${label} server option accepts only exact canonical HTTP(S) origins.`);
    }
    return url.origin;
  }))];
}

function normalizedUiOrigins(values = []) {
  if (!Array.isArray(values)) throw new TypeError("allowedUiOrigins server option must be an array.");
  return [...new Set(values.map((value) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new TypeError("allowedUiOrigins entries must be exact HTTP(S) origins.");
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== value) {
      throw new TypeError("allowedUiOrigins entries must be exact HTTP(S) origins without paths, credentials, queries, or fragments.");
    }
    return value;
  }))];
}

function appendVaryOrigin(response) {
  const current = response.getHeader("vary");
  const values = (Array.isArray(current) ? current : [current])
    .filter((value) => value !== undefined)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.some((value) => value.toLowerCase() === "origin")) values.push("Origin");
  response.setHeader("vary", values.join(", "));
}

function parseRequestOrigin(value) {
  if (typeof value !== "string" || value === "null") {
    throw httpError(403, "Cross-origin API requests are not allowed.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw httpError(403, "Cross-origin API requests are not allowed.");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== value) {
    throw httpError(403, "Cross-origin API requests are not allowed.");
  }
  return value;
}

function applyApiCors(request, response, hostHeader, allowedUiOrigins) {
  appendVaryOrigin(response);
  const originHeader = request.headers.origin;
  if (originHeader === undefined) {
    if (request.method === "OPTIONS" || request.headers["sec-fetch-site"] === "cross-site") {
      throw httpError(403, "Cross-origin API requests are not allowed.");
    }
    return;
  }

  const origin = parseRequestOrigin(originHeader);
  const requestOrigin = new URL(`http://${hostHeader}`).origin;
  if (origin !== requestOrigin && !allowedUiOrigins.has(origin)) {
    throw httpError(403, "Cross-origin API requests are not allowed.");
  }

  // A browser-controlled Origin is the CORS authority. Sec-Fetch-Site remains
  // useful for rejecting origin-less cross-site requests, but cannot override
  // an exact origin that the operator explicitly allowed.
  response.setHeader("access-control-allow-origin", origin);
}

function sendPreflight(response) {
  response.writeHead(204, {
    "access-control-allow-methods": CORS_ALLOW_METHODS,
    "access-control-allow-headers": CORS_ALLOW_HEADERS,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  });
  response.end();
}

function boundedSourceString(value, label, maximumLength = 200) {
  if (typeof value !== "string" || value.trim() === "") {
    throw httpError(400, `${label} must be a non-empty string.`);
  }
  if (value.length > maximumLength) {
    throw httpError(400, `${label} cannot exceed ${maximumLength} characters.`);
  }
  return value;
}

function boundedSourceStrings(value, label, maximumLength) {
  const values = snapshotOwnDataArray(value, { label, maximumLength });
  const observed = new Set();
  for (let index = 0; index < values.length; index += 1) {
    values[index] = boundedSourceString(values[index], `${label}[${index}]`);
    if (observed.has(values[index])) throw httpError(400, `${label} contains duplicates.`);
    observed.add(values[index]);
  }
  return Object.freeze(values);
}

function normalizeSourceRunRequest(value) {
  let request;
  try {
    request = snapshotOwnDataRecord(value, {
      label: "Source request",
      recognizedKeys: SOURCE_RUN_KEYS
    });
  } catch (error) {
    throw httpError(400, error.message);
  }
  if (!Object.hasOwn(request, "channel")) {
    throw httpError(400, "Source request requires channel.");
  }
  const channel = boundedSourceString(request.channel, "Source request channel");
  const objective = request.objective === undefined
    ? "Retrieve bounded public-source evidence through governed routing."
    : boundedSourceString(request.objective, "Source request objective", 2_000);
  let input;
  try {
    input = snapshotJsonValue(request.input === undefined ? {} : request.input, {
      label: "Source request input",
      maximumDepth: MAX_SOURCE_INPUT_DEPTH,
      maximumNodes: MAX_SOURCE_INPUT_NODES,
      maximumCollectionSize: MAX_SOURCE_INPUT_COLLECTION_SIZE,
      maximumStringLength: MAX_SOURCE_INPUT_STRING_LENGTH,
      allowNullPrototype: true,
      freeze: true
    });
  } catch (error) {
    throw httpError(400, error.message);
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw httpError(400, "Source request input must be a JSON object.");
  }
  return Object.freeze({
    channel,
    input,
    objective,
    backendPreference: request.backendPreference === undefined
      ? null
      : boundedSourceStrings(
        request.backendPreference,
        "Source request backendPreference",
        MAX_SOURCE_BACKEND_PREFERENCES
      )
  });
}

function parseSourceStatusQuery(url) {
  if (url.search.length > MAX_SOURCE_STATUS_QUERY_LENGTH) {
    throw httpError(414, "Source status query is too large.");
  }
  for (const key of url.searchParams.keys()) {
    if (!SOURCE_STATUS_QUERY_KEYS.has(key)) {
      throw httpError(400, `Unknown source status query field '${key}'.`);
    }
  }
  const channels = url.searchParams.getAll("channel");
  if (channels.length > 1) throw httpError(400, "Source status channel may be specified once.");
  const channel = channels.length
    ? boundedSourceString(channels[0], "Source status channel")
    : null;
  const adapterIds = boundedSourceStrings(
    url.searchParams.getAll("adapterId"),
    "Source status adapterId",
    MAX_SOURCE_ADAPTERS
  );
  const timeoutValues = url.searchParams.getAll("timeoutMs");
  if (timeoutValues.length > 1) throw httpError(400, "Source status timeoutMs may be specified once.");
  let timeoutMs = 2_000;
  if (timeoutValues.length) {
    if (!/^[1-9][0-9]*$/.test(timeoutValues[0])) {
      throw httpError(400, "Source status timeoutMs must be a positive integer.");
    }
    timeoutMs = Number(timeoutValues[0]);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs > MAX_SOURCE_DOCTOR_TIMEOUT_MS) {
      throw httpError(
        400,
        `Source status timeoutMs cannot exceed ${MAX_SOURCE_DOCTOR_TIMEOUT_MS}.`
      );
    }
  }
  return Object.freeze({
    channel,
    adapterIds,
    timeoutMs
  });
}

function boundedSourceDocuments(value, adapterId) {
  if (!Array.isArray(value)) {
    throw httpError(502, `Source adapter '${adapterId}' returned a non-array result.`);
  }
  if (value.length > MAX_SOURCE_DOCUMENTS) {
    throw httpError(
      502,
      `Source adapter '${adapterId}' returned more than ${MAX_SOURCE_DOCUMENTS} documents.`
    );
  }
  try {
    return snapshotOwnDataArray(value, {
      label: `Source adapter '${adapterId}' result`,
      maximumLength: MAX_SOURCE_DOCUMENTS
    });
  } catch {
    throw httpError(502, `Source adapter '${adapterId}' returned an unsafe document collection.`);
  }
}

function immutableSourceGovernance(metadata) {
  const governance = {
    effects: Object.freeze([...(metadata.effects || [])]),
    networkOrigins: Object.freeze([...(metadata.networkOrigins || [])])
  };
  if (metadata.risk !== undefined) governance.risk = metadata.risk;
  return Object.freeze(governance);
}

function prepareSourceConfiguration(sourceAdapters, ytDlpCommand) {
  const values = sourceAdapters === undefined
    ? [
        createExaSearchSourceAdapter(),
        ...(ytDlpCommand
          ? [createYtDlpYouTubeSourceAdapter({ command: ytDlpCommand })]
          : [])
      ]
    : sourceAdapters;
  const adapters = values.map((value, index) => {
    let adapter;
    try {
      adapter = defineResearchSourceAdapter(value);
    } catch (error) {
      throw new TypeError(`Maqam server sourceAdapters[${index}] is invalid: ${error.message}`);
    }
    if (adapter.read === null) {
      throw new TypeError(`Maqam server source adapter '${adapter.id}' requires a read handler.`);
    }
    return adapter;
  });

  // The registry validates duplicate adapter identities and tool names. The
  // gateway separately snapshots handler governance, including exact origins.
  new ResearchSourceRegistry({ adapters });
  const toolNames = adapters.map((adapter) => adapter.toolName);
  const validationGateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: toolNames,
      maxToolCalls: Math.max(1, adapters.length)
    })
  });
  for (const adapter of adapters) validationGateway.registerTool(adapter.toolName, adapter.read);

  const registrations = adapters.map((adapter) => {
    const metadata = validationGateway.tools.get(adapter.toolName).metadata;
    const handler = async (input, context) => boundedSourceDocuments(
      await adapter.read(input, context),
      adapter.id
    );
    Object.defineProperty(handler, "governance", {
      value: immutableSourceGovernance(metadata),
      enumerable: false,
      configurable: false,
      writable: false
    });
    return Object.freeze({ adapter, handler });
  });
  const declaredOrigins = [...new Set(registrations.flatMap(({ handler }) => (
    handler.governance.networkOrigins
  )))];

  return Object.freeze({
    adapters: Object.freeze([...adapters]),
    registrations: Object.freeze(registrations),
    toolNames: Object.freeze([...toolNames]),
    declaredOrigins: Object.freeze(declaredOrigins)
  });
}

function createSourceRuntime(configuration, allowedOrigins) {
  const maxToolCalls = Math.max(1, configuration.registrations.length);
  const effectiveOrigins = allowedOrigins.length
    ? allowedOrigins
    : configuration.declaredOrigins;
  const policyEngine = new PolicyEngine({
    allowedTools: configuration.toolNames,
    allowedOrigins: effectiveOrigins,
    maxToolCalls
  });
  const toolGateway = new ToolGateway({ policyEngine });
  for (const { adapter, handler } of configuration.registrations) {
    toolGateway.registerTool(adapter.toolName, handler);
  }
  const registry = new ResearchSourceRegistry({
    adapters: configuration.adapters,
    toolCaller: { call: toolGateway.call.bind(toolGateway) }
  });
  return { registry, toolGateway, maxToolCalls, effectiveOrigins };
}

function compactSourceResult(source) {
  return {
    ...source,
    documents: source.documents.map((document) => ({
      ...document,
      text: document.text.slice(0, MAX_SOURCE_OUTPUT_STRING_LENGTH),
      markdown: typeof document.markdown === "string"
        ? document.markdown.slice(0, MAX_SOURCE_OUTPUT_STRING_LENGTH)
        : document.markdown,
      authors: document.authors.slice(0, 100),
      citations: document.citations.slice(0, 100)
    }))
  };
}

function requestDisconnect(request, response) {
  const controller = new AbortController();
  const abort = () => controller.abort(new Error("HTTP client disconnected."));
  const close = () => {
    if (!response.writableEnded) abort();
  };
  request.once("aborted", abort);
  response.once("close", close);
  if (request.aborted) abort();
  return {
    signal: controller.signal,
    cleanup() {
      request.removeListener("aborted", abort);
      response.removeListener("close", close);
    }
  };
}

async function withDisconnectSignal(request, response, operation) {
  const disconnect = requestDisconnect(request, response);
  try {
    return await operation(disconnect.signal);
  } finally {
    disconnect.cleanup();
  }
}

function asSourceHttpError(error) {
  if (Number.isInteger(error?.statusCode)) return error;
  if (error instanceof PolicyDeniedError
    || error instanceof ResearchSourceAuthenticationRequiredError) {
    return httpError(403, error.message);
  }
  if (error instanceof ResearchSourceUnavailableError) {
    return httpError(503, error.message);
  }
  if (error instanceof TypeError) return httpError(400, error.message);
  return error;
}

async function sendSourceResponse(request, response, operation) {
  try {
    const payload = await withDisconnectSignal(request, response, operation);
    sendBoundedJson(response, 200, payload, MAX_SOURCE_OUTPUT_BYTES);
  } catch (error) {
    throw asSourceHttpError(error);
  }
}

async function runPublicSource(body, configuration, allowedOrigins, signal) {
  const request = normalizeSourceRunRequest(body);
  const { registry, toolGateway, maxToolCalls, effectiveOrigins } = createSourceRuntime(
    configuration,
    allowedOrigins
  );
  const runId = `source-${randomUUID()}`;
  const goal = {
    runId,
    objective: request.objective,
    allowedTools: configuration.toolNames,
    allowedOrigins: effectiveOrigins,
    budget: { maxToolCalls, maxRuntimeMs: 120_000 }
  };
  const routeRequest = {
    channel: request.channel,
    input: request.input,
    allowAuthenticated: false
  };
  if (request.backendPreference !== null) {
    routeRequest.backendPreference = request.backendPreference;
  }
  const source = await registry.route(routeRequest, {
    runId,
    goal,
    limits: { maxToolCalls, maxRuntimeMs: 120_000 },
    signal,
    requestedBy: "maqam-public-source-api"
  });
  return {
    product: PRODUCT,
    source: compactSourceResult(source),
    toolTrace: toolGateway.trace,
    generatedAt: new Date().toISOString()
  };
}

async function runSourceStatus(url, configuration, signal) {
  const query = parseSourceStatusQuery(url);
  const registry = new ResearchSourceRegistry({ adapters: configuration.adapters });
  const doctorOptions = { timeoutMs: query.timeoutMs, signal };
  if (query.channel !== null) doctorOptions.channel = query.channel;
  if (query.adapterIds.length) doctorOptions.adapterIds = query.adapterIds;
  const doctor = await registry.doctor(doctorOptions);
  return {
    product: PRODUCT,
    doctor,
    generatedAt: new Date().toISOString()
  };
}

function compactPage(page) {
  return {
    ...page,
    text: String(page.text || "").slice(0, 20_000),
    markdown: String(page.markdown || "").slice(0, 20_000),
    links: Array.isArray(page.links) ? page.links.slice(0, 200) : []
  };
}

function compactRun(run) {
  const compacted = snapshotJsonValue(run, {
    label: "Maqam research run response",
    allowNullPrototype: true
  });
  const pages = compacted.outputs?.collect_sources?.pages;
  if (Array.isArray(pages)) {
    compacted.outputs.collect_sources.pages = pages.map(compactPage);
  }
  return compacted;
}

async function runResearch(body, crawlerTool, serverOptions = {}, signal = null) {
  if (body.allowedOrigins !== undefined || body.allowPrivateNetworks !== undefined) {
    throw httpError(400, "Network policy is configured by the server and cannot be broadened by a request.");
  }
  const maxSeeds = Math.max(1, Math.min(100, Number(serverOptions.maxSeeds) || 10));
  const seeds = normalizeSeeds(body.seeds || [], maxSeeds);
  const maxPages = clampMaxPages(body.maxPages);
  const configuredOrigins = normalizedConfiguredOrigins(serverOptions.allowedOrigins || []);
  const seedOrigins = deriveOrigins(seeds);
  if (configuredOrigins.length && seedOrigins.some((origin) => !configuredOrigins.includes(origin))) {
    throw httpError(403, "One or more seed origins are outside the server allowlist.");
  }
  const sameOrigin = body.sameOrigin !== false;
  if (!sameOrigin && serverOptions.allowCrossOriginCrawls !== true) {
    throw httpError(400, "Cross-origin crawling is disabled by the server.");
  }
  if (!sameOrigin && configuredOrigins.length === 0) {
    throw httpError(500, "Cross-origin crawling requires a non-empty server allowedOrigins list.");
  }
  const allowedOrigins = configuredOrigins.length ? configuredOrigins : seedOrigins;

  const evidenceLedger = new EvidenceLedger();
  const policyEngine = new PolicyEngine({
    allowedTools: ["crawler"],
    allowedOrigins,
    maxToolCalls: 40
  });
  const toolGateway = new ToolGateway({ policyEngine, evidenceLedger });
  toolGateway.registerTool("crawler", crawlerTool || createCrawlerTool({
    concurrency: 2,
    delayMs: 250,
    timeoutMs: 12_000,
    maxPages: 10,
    maxSeeds,
    maxRequests: Math.min(500, Math.max(40, maxPages * 8)),
    maxQueue: 500,
    maxDepth: 10,
    maxBytes: 512 * 1024,
    sameOrigin,
    allowedOrigins,
    allowPrivateNetworks: serverOptions.allowPrivateNetworks === true,
    signal
  }));

  const runtime = new AgentRuntime({ policyEngine, evidenceLedger, toolGateway });
  const run = await runtime.runWorkflow(
    createResearchWorkflow({ seeds, maxPages, sameOrigin }),
    {
      objective: body.objective || "Run a governed public research workflow.",
      allowedTools: ["crawler"],
      allowedOrigins,
      budget: { maxToolCalls: 40, maxRuntimeMs: 600_000 }
    }
  );

  return {
    product: PRODUCT,
    run: compactRun(run),
    toolTrace: toolGateway.trace,
    generatedAt: new Date().toISOString()
  };
}

async function serveStatic(request, response, publicDir) {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const root = await realpath(resolve(publicDir));
  const candidatePath = resolve(root, `.${decodeURIComponent(pathname)}`);
  const pathFromRoot = relative(root, candidatePath);

  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const filePath = await realpath(candidatePath);
    const resolvedPathFromRoot = relative(root, filePath);
    if (resolvedPathFromRoot.startsWith("..") || isAbsolute(resolvedPathFromRoot)) {
      sendJson(response, 403, { error: "Forbidden" });
      return;
    }
    const file = await readFile(filePath);
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

export function createMaqamServer(options = {}) {
  options = snapshotServerOptions(options);
  const publicDir = options.publicDir || DEFAULT_PUBLIC_DIR;
  const crawlerTool = options.crawlerTool || null;
  // Validate trusted crawl authority at construction time instead of waiting
  // for the first request to discover a malformed or over-broad origin.
  normalizedConfiguredOrigins(options.allowedOrigins || [], "allowedOrigins");
  const sourceConfiguration = prepareSourceConfiguration(
    options.sourceAdapters,
    options.ytDlpCommand
  );
  const sourceAllowedOrigins = normalizedConfiguredOrigins(
    options.sourceAllowedOrigins || [],
    "sourceAllowedOrigins"
  );
  const hasExplicitAllowedHosts = Array.isArray(options.allowedHosts) && options.allowedHosts.length > 0;
  const allowedHostValues = hasExplicitAllowedHosts
    ? options.allowedHosts
    : ["127.0.0.1", "localhost", "::1"];
  const allowedHosts = new Set(allowedHostValues
    .map((host) => String(host).replace(/^\[|\]$/g, "").toLowerCase()));
  const apiToken = options.apiToken || null;
  const allowedUiOrigins = new Set(normalizedUiOrigins(options.allowedUiOrigins || []));

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const hostHeader = request.headers.host;
      if (!hostHeader) throw httpError(400, "Host header is required.");
      if (/[/?#@\\]/.test(hostHeader)) throw httpError(400, "Host header is invalid.");
      let requestHostname;
      try {
        requestHostname = new URL(`http://${hostHeader}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
      } catch {
        throw httpError(400, "Host header is invalid.");
      }
      if (!allowedHosts.has(requestHostname)) throw httpError(403, "Host is not allowed.");

      if (url.pathname.startsWith("/api/")) {
        applyApiCors(request, response, hostHeader, allowedUiOrigins);
        if (request.method === "OPTIONS") {
          sendPreflight(response);
          return;
        }
        if (apiToken && request.headers.authorization !== `Bearer ${apiToken}`) {
          response.setHeader("www-authenticate", "Bearer");
          throw httpError(401, "API authentication is required.");
        }
      }

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { product: PRODUCT, status: "ok" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/capabilities") {
        sendJson(response, 200, { product: PRODUCT, capabilities: CAPABILITIES });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/sources/status") {
        await sendSourceResponse(
          request,
          response,
          (signal) => runSourceStatus(url, sourceConfiguration, signal)
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/runs/source") {
        if (url.search !== "") throw httpError(400, "Source run requests do not accept URL query parameters.");
        requireJsonContentType(request);
        const body = await readJsonBody(request, MAX_SOURCE_BODY_BYTES);
        await sendSourceResponse(
          request,
          response,
          (signal) => runPublicSource(body, sourceConfiguration, sourceAllowedOrigins, signal)
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/runs/research") {
        requireJsonContentType(request);
        const body = await readJsonBody(request);
        sendJson(response, 200, await withDisconnectSignal(
          request,
          response,
          (signal) => runResearch(body, crawlerTool, options, signal)
        ));
        return;
      }

      if (request.method === "GET" || request.method === "HEAD") {
        await serveStatic(request, response, publicDir);
        return;
      }

      sendJson(response, 405, { error: "Method not allowed" });
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        error: redactText(error.message || "Unexpected server error")
      });
    }
  });

  return guardServerListen(server, { apiToken, hasExplicitAllowedHosts });
}

export function startMaqamServer(options = {}) {
  options = snapshotServerOptions(options);
  const environmentPort = process.env.PORT === undefined ? 8787 : Number(process.env.PORT);
  const port = options.port ?? environmentPort;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("Maqam server port must be an integer from 0 to 65535.");
  }
  const host = options.host || process.env.HOST || "127.0.0.1";
  const apiToken = options.apiToken || process.env.MAQAM_API_TOKEN || null;
  const ytDlpCommand = options.ytDlpCommand
    || process.env.MAQAM_YT_DLP_COMMAND
    || undefined;
  if (!isLoopbackBindHost(host) && !apiToken) {
    throw new Error("Binding Maqam beyond loopback requires MAQAM_API_TOKEN or options.apiToken.");
  }
  if (!isLoopbackBindHost(host) && !(options.allowedHosts || []).length) {
    throw new Error("Binding Maqam beyond loopback requires an explicit allowedHosts list.");
  }
  const server = createMaqamServer({ ...options, apiToken, ytDlpCommand });
  server.listen(port, host, () => {
    const bound = server.address();
    const actualPort = typeof bound === "object" && bound ? bound.port : port;
    const displayHost = host.includes(":") ? `[${host}]` : host;
    const address = `http://${displayHost}:${actualPort}`;
    process.stdout.write(`Maqam console running at ${address}\n`);
  });
  return server;
}

export { CAPABILITIES as MAQAM_CAPABILITIES, PRODUCT as MAQAM_PRODUCT };
