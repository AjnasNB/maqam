import { MaqamError } from "../../framework/errors.js";
import { withPinnedFetch } from "../../crawler/security.js";
import {
  snapshotJsonValue,
  snapshotOwnDataRecord
} from "../../framework/boundary.js";
import { defineResearchSourceAdapter } from "../source-adapter.js";
import {
  ResearchSourceAuthenticationRequiredError,
  ResearchSourceUnavailableError
} from "../source-error.js";

const DEFAULT_ENDPOINT = "https://mcp.exa.ai/mcp?tools=web_search_exa";
const MCP_PROTOCOL_VERSION = "2025-11-25";
const MCP_SUPPORTED_PROTOCOL_VERSIONS = new Set([
  MCP_PROTOCOL_VERSION,
  "2025-06-18",
  "2025-03-26"
]);
const OPTION_KEYS = new Set([
  "endpoint", "fetch", "timeoutMs", "maxResponseBytes", "maxResults"
]);
const INPUT_KEYS = new Set(["query", "numResults"]);
const MAX_QUERY_LENGTH = 10_000;
const MAX_RESULTS = 25;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_TIMEOUT_MS = 120_000;

function positiveInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be a safe integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function endpointUrl(value) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new TypeError("Exa MCP endpoint must be an absolute HTTPS URL.");
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash) {
    throw new TypeError("Exa MCP endpoint must be an absolute HTTPS URL without credentials or a fragment.");
  }
  return endpoint;
}

function adapterOptions(value) {
  const input = snapshotOwnDataRecord(value, {
    label: "Exa search adapter options",
    recognizedKeys: OPTION_KEYS
  });
  if (input.fetch !== undefined && typeof input.fetch !== "function") {
    throw new TypeError("Exa search adapter fetch must be a function.");
  }
  const endpoint = endpointUrl(input.endpoint ?? DEFAULT_ENDPOINT);
  return Object.freeze({
    endpoint,
    fetch: input.fetch ?? null,
    timeoutMs: positiveInteger(
      input.timeoutMs ?? 30_000,
      "Exa search adapter timeoutMs",
      100,
      MAX_TIMEOUT_MS
    ),
    maxResponseBytes: positiveInteger(
      input.maxResponseBytes ?? 5 * 1024 * 1024,
      "Exa search adapter maxResponseBytes",
      1_024,
      MAX_RESPONSE_BYTES
    ),
    maxResults: positiveInteger(
      input.maxResults ?? 10,
      "Exa search adapter maxResults",
      1,
      MAX_RESULTS
    )
  });
}

function routeInput(value, maximumResults) {
  const input = snapshotOwnDataRecord(value, {
    label: "Exa search input",
    recognizedKeys: INPUT_KEYS
  });
  if (typeof input.query !== "string" || input.query.trim() === "") {
    throw new TypeError("Exa search input requires a non-empty query.");
  }
  if (input.query.length > MAX_QUERY_LENGTH) {
    throw new TypeError(`Exa search query cannot exceed ${MAX_QUERY_LENGTH} characters.`);
  }
  return Object.freeze({
    query: input.query.trim(),
    numResults: positiveInteger(
      input.numResults ?? maximumResults,
      "Exa search input numResults",
      1,
      maximumResults
    )
  });
}

function linkedTimeout(parentSignal, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new MaqamError(
    `Exa search timed out after ${timeoutMs}ms.`,
    { code: "RESEARCH_SOURCE_TIMEOUT", details: { timeoutMs } }
  )), timeoutMs);
  const onAbort = () => controller.abort(
    parentSignal.reason instanceof Error
      ? parentSignal.reason
      : new MaqamError("Exa search was aborted.", { code: "RESEARCH_SOURCE_ABORTED" })
  );
  if (parentSignal) {
    if (parentSignal.aborted) onAbort();
    else parentSignal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", onAbort);
    }
  };
}

async function boundedResponseText(response, maximumBytes) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    await response.body?.cancel?.();
    throw new MaqamError("Exa MCP response exceeded the configured byte limit.", {
      code: "RESEARCH_SOURCE_RESPONSE_TOO_LARGE",
      details: { maximumBytes, contentLength }
    });
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maximumBytes) {
      throw new MaqamError("Exa MCP response exceeded the configured byte limit.", {
        code: "RESEARCH_SOURCE_RESPONSE_TOO_LARGE",
        details: { maximumBytes }
      });
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new MaqamError("Exa MCP response exceeded the configured byte limit.", {
          code: "RESEARCH_SOURCE_RESPONSE_TOO_LARGE",
          details: { maximumBytes }
        });
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

function rpcMessages(text, contentType) {
  if (text.trim() === "") return [];
  const values = [];
  if (String(contentType || "").toLowerCase().includes("text/event-stream")) {
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      try {
        values.push(JSON.parse(data));
      } catch {
        throw new MaqamError("Exa MCP returned malformed event-stream JSON.", {
          code: "RESEARCH_SOURCE_PROTOCOL_INVALID"
        });
      }
    }
  } else {
    try {
      const parsed = JSON.parse(text);
      values.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      throw new MaqamError("Exa MCP returned malformed JSON.", {
        code: "RESEARCH_SOURCE_PROTOCOL_INVALID"
      });
    }
  }
  return snapshotJsonValue(values, {
    label: "Exa MCP messages",
    maximumDepth: 100,
    maximumNodes: 200_000,
    maximumCollectionSize: 100_000,
    maximumStringLength: 5_000_000,
    allowNullPrototype: true,
    freeze: true
  });
}

function statusError(status, endpoint) {
  const details = { status, origin: endpoint.origin };
  if (status === 401 || status === 403) {
    return new ResearchSourceAuthenticationRequiredError(
      "The Exa hosted MCP endpoint requires authentication for this request.",
      { details }
    );
  }
  if (status === 408 || status === 429 || status >= 500) {
    return new ResearchSourceUnavailableError(
      `The Exa hosted MCP endpoint is temporarily unavailable (HTTP ${status}).`,
      { details }
    );
  }
  return new MaqamError(`The Exa hosted MCP endpoint returned HTTP ${status}.`, {
    code: "RESEARCH_SOURCE_PROTOCOL_FAILED",
    details
  });
}

function sessionIdentifier(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 1_024 || !/^[\x21-\x7E]+$/.test(value)) {
    throw new MaqamError("Exa MCP returned an invalid session identifier.", {
      code: "RESEARCH_SOURCE_PROTOCOL_INVALID"
    });
  }
  return value;
}

function protocolIdentifier(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MaqamError("Exa MCP returned an invalid protocol version.", {
      code: "RESEARCH_SOURCE_PROTOCOL_INVALID"
    });
  }
  return value;
}

function negotiatedProtocolIdentifier(value) {
  const protocolVersion = protocolIdentifier(value);
  if (!MCP_SUPPORTED_PROTOCOL_VERSIONS.has(protocolVersion)) {
    throw new MaqamError(
      `Exa MCP negotiated unsupported protocol version '${protocolVersion}'.`,
      {
        code: "RESEARCH_SOURCE_PROTOCOL_UNSUPPORTED",
        details: {
          protocolVersion,
          supportedProtocolVersions: [...MCP_SUPPORTED_PROTOCOL_VERSIONS]
        }
      }
    );
  }
  return protocolVersion;
}

async function postRpc(config, body, signal, sessionId = null, protocolVersion = null) {
  let record;
  const request = {
    method: "POST",
    redirect: "error",
    signal,
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      ...(protocolVersion ? { "mcp-protocol-version": protocolVersion } : {})
    },
    body: JSON.stringify(body)
  };
  const consume = async (response) => ({
    ok: response.ok,
    status: response.status,
    text: await boundedResponseText(response, config.maxResponseBytes),
    contentType: response.headers?.get?.("content-type") || "",
    sessionId: response.headers?.get?.("mcp-session-id") || null
  });
  try {
    record = config.fetch
      ? await consume(await config.fetch(config.endpoint, request))
      : await withPinnedFetch(config.endpoint, request, {
          signal,
          allowPrivateNetworks: false
        }, consume);
  } catch (cause) {
    if (signal.aborted) throw signal.reason;
    if (cause instanceof MaqamError) throw cause;
    if (cause?.code === "CRAWLER_URL_BLOCKED") throw cause;
    throw new ResearchSourceUnavailableError("The Exa hosted MCP endpoint could not be reached.", {
      cause,
      details: { origin: config.endpoint.origin }
    });
  }
  if (!record.ok) throw statusError(record.status, config.endpoint);
  return {
    messages: rpcMessages(record.text, record.contentType),
    sessionId: sessionIdentifier(record.sessionId) || sessionId
  };
}

async function closeSession(config, sessionId, protocolVersion) {
  const signal = AbortSignal.timeout(2_000);
  const request = {
    method: "DELETE",
    redirect: "error",
    signal,
    headers: {
      "mcp-session-id": sessionId,
      "mcp-protocol-version": protocolVersion
    }
  };
  if (config.fetch) {
    const response = await config.fetch(config.endpoint, request);
    await response.body?.cancel?.();
    return;
  }
  await withPinnedFetch(config.endpoint, request, {
    signal,
    allowPrivateNetworks: false
  }, async (response) => {
    await response.body?.cancel?.();
  });
}

function rpcResult(messages, id, label) {
  const message = messages.find((candidate) => candidate?.id === id);
  if (!message) {
    throw new MaqamError(`${label} did not return a matching JSON-RPC response.`, {
      code: "RESEARCH_SOURCE_PROTOCOL_INVALID"
    });
  }
  if (message.error) {
    const detail = typeof message.error.message === "string"
      ? message.error.message.slice(0, 1_000)
      : "Unknown MCP error";
    if (/api.?key|authenticat|unauthori[sz]ed/i.test(detail)) {
      throw new ResearchSourceAuthenticationRequiredError(
        "The Exa hosted MCP endpoint requires authentication for this request."
      );
    }
    if (/rate.?limit|temporar|unavailable|timeout/i.test(detail)) {
      throw new ResearchSourceUnavailableError(`Exa search is unavailable: ${detail}`);
    }
    throw new MaqamError(`Exa MCP tool call failed: ${detail}`, {
      code: "RESEARCH_SOURCE_PROTOCOL_FAILED"
    });
  }
  return message.result;
}

function toolText(result) {
  if (!result || typeof result !== "object" || !Array.isArray(result.content)) {
    throw new MaqamError("Exa MCP tool result did not contain a content array.", {
      code: "RESEARCH_SOURCE_PROTOCOL_INVALID"
    });
  }
  const parts = result.content
    .filter((item) => item && item.type === "text" && typeof item.text === "string")
    .map((item) => item.text);
  const text = parts.join("\n\n").trim();
  if (result.isError === true) {
    if (/api.?key|authenticat|unauthori[sz]ed/i.test(text)) {
      throw new ResearchSourceAuthenticationRequiredError(
        "The Exa hosted MCP endpoint requires authentication for this request."
      );
    }
    if (/rate.?limit|temporar|unavailable|timeout/i.test(text)) {
      throw new ResearchSourceUnavailableError("The Exa hosted MCP endpoint is temporarily unavailable.");
    }
    throw new MaqamError("The Exa MCP search tool reported an error.", {
      code: "RESEARCH_SOURCE_PROTOCOL_FAILED"
    });
  }
  if (!text) {
    throw new ResearchSourceUnavailableError("The Exa MCP search returned no text results.");
  }
  return text;
}

function safeTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function searchDocuments(text, request, endpoint) {
  const matches = [...text.matchAll(/^Title:\s*(.+)\r?\nURL:\s*(https?:\/\/\S+)\s*$/gm)];
  const documents = [];
  for (let index = 0; index < matches.length && documents.length < request.numResults; index += 1) {
    const match = matches[index];
    const end = matches[index + 1]?.index ?? text.length;
    const block = text.slice(match.index + match[0].length, end).trim();
    let uri;
    try {
      uri = new URL(match[2]);
      if (!["http:", "https:"].includes(uri.protocol) || uri.username || uri.password) continue;
    } catch {
      continue;
    }
    const published = block.match(/^Published:\s*(.+)$/m)?.[1]?.trim() ?? null;
    const author = block.match(/^Author:\s*(.+)$/m)?.[1]?.trim() ?? null;
    const content = block
      .replace(/^Published:\s*.*$/m, "")
      .replace(/^Author:\s*.*$/m, "")
      .replace(/^Highlights:\s*/m, "")
      .trim();
    const title = match[1].trim().slice(0, 100_000);
    const body = (content || title || uri.toString()).slice(0, 1_000_000);
    documents.push({
      id: uri.toString(),
      uri: uri.toString(),
      title: title || null,
      text: body,
      contentType: "text/plain",
      authors: author && !/^n\/?a$/i.test(author) ? [author.slice(0, 100_000)] : [],
      ...(safeTimestamp(published) ? { publishedAt: safeTimestamp(published) } : {}),
      metadata: {
        provider: "exa-hosted-mcp",
        endpointOrigin: endpoint.origin,
        query: request.query,
        rank: documents.length + 1,
        developerApiKeyRequired: false
      },
      citations: [{ uri: uri.toString(), title: title || null }]
    });
  }
  if (!documents.length) {
    throw new ResearchSourceUnavailableError("The Exa MCP search returned no parseable result URLs.");
  }
  return documents;
}

async function search(config, input, context) {
  const request = routeInput(input, config.maxResults);
  const timeout = linkedTimeout(context?.signal ?? null, config.timeoutMs);
  let sessionId = null;
  let protocolVersion = MCP_PROTOCOL_VERSION;
  try {
    const initialized = await postRpc(config, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "maqam", version: "0.3.3" }
      }
    }, timeout.signal);
    sessionId = initialized.sessionId;
    const initializeResult = rpcResult(initialized.messages, 1, "Exa MCP initialize");
    protocolVersion = negotiatedProtocolIdentifier(initializeResult?.protocolVersion);
    await postRpc(config, {
      jsonrpc: "2.0",
      method: "notifications/initialized"
    }, timeout.signal, sessionId, protocolVersion);
    const called = await postRpc(config, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "web_search_exa",
        arguments: {
          query: request.query,
          numResults: request.numResults
        }
      }
    }, timeout.signal, sessionId, protocolVersion);
    const result = rpcResult(called.messages, 2, "Exa MCP tools/call");
    return searchDocuments(toolText(result), request, config.endpoint);
  } finally {
    timeout.cleanup();
    if (sessionId) {
      try {
        await closeSession(config, sessionId, protocolVersion);
      } catch {
        // Session cleanup is best-effort and must never replace the search result.
      }
    }
  }
}

function declareGovernance(handler, endpoint) {
  Object.defineProperty(handler, "governance", {
    value: Object.freeze({
      effects: Object.freeze(["network:read"]),
      networkOrigins: Object.freeze([endpoint.origin]),
      risk: "low"
    }),
    enumerable: false,
    configurable: false,
    writable: false
  });
  return handler;
}

/**
 * Create an opt-in web-search adapter for Exa's anonymous hosted MCP tier.
 * No developer API key is sent. The hosted service may impose anonymous rate
 * limits or change its authentication policy, which is reported explicitly.
 */
export function createExaSearchSourceAdapter(options = {}) {
  const config = adapterOptions(options);
  const read = declareGovernance(
    async (input = {}, context = {}) => search(config, input, context),
    config.endpoint
  );
  return defineResearchSourceAdapter({
    id: "web-search.exa-hosted-mcp",
    channel: "web-search",
    toolName: "research.web-search.exa-hosted-mcp",
    label: "Anonymous hosted Exa web search through governed MCP",
    priority: 100,
    authentication: "none",
    capabilities: ["read", "search", "web", "mcp"],
    metadata: {
      provider: "exa",
      accessMode: "hosted-anonymous",
      executionMode: "remote-mcp",
      dataBoundary: "third-party-hosted",
      contentIsUntrusted: true,
      transport: "streamable-http",
      endpointOrigin: config.endpoint.origin,
      developerApiKeyRequired: false,
      anonymousRateLimitsApply: true,
      browserSessionReuse: false
    },
    check: async () => ({
      status: "ready",
      message: "The anonymous Exa MCP adapter is configured; this check does not contact Exa or consume rate limit.",
      details: {
        endpointOrigin: config.endpoint.origin,
        registrationReady: true,
        liveVerified: false,
        developerApiKeyRequired: false,
        accessMode: "hosted-anonymous"
      }
    }),
    read
  });
}

export const EXA_HOSTED_MCP_ENDPOINT = DEFAULT_ENDPOINT;
