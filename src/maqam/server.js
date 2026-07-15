import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentRuntime,
  EvidenceLedger,
  PolicyEngine,
  ToolGateway,
  createCrawlerTool,
  createResearchWorkflow
} from "../index.js";
import { redactText } from "../framework/audit.js";

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

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": CONTENT_TYPES[".json"],
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.byteLength;
    if (size > 1024 * 1024) throw httpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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

function normalizedConfiguredOrigins(values = []) {
  if (!Array.isArray(values)) throw new TypeError("allowedOrigins server option must be an array.");
  return [...new Set(values.map((value) => {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("allowedOrigins server option accepts only HTTP(S) origins.");
    }
    return url.origin;
  }))];
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
  const pages = run.outputs?.collect_sources?.pages;
  if (Array.isArray(pages)) {
    run.outputs.collect_sources.pages = pages.map(compactPage);
  }
  return run;
}

async function runResearch(body, crawlerTool, serverOptions = {}) {
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
    signal: serverOptions.signal || null
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
  const root = resolve(publicDir);
  const filePath = resolve(root, `.${decodeURIComponent(pathname)}`);
  const pathFromRoot = relative(root, filePath);

  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
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
  const publicDir = options.publicDir || DEFAULT_PUBLIC_DIR;
  const crawlerTool = options.crawlerTool || null;
  const allowedHostValues = Array.isArray(options.allowedHosts) && options.allowedHosts.length
    ? options.allowedHosts
    : ["127.0.0.1", "localhost", "::1"];
  const allowedHosts = new Set(allowedHostValues
    .map((host) => String(host).replace(/^\[|\]$/g, "").toLowerCase()));
  const apiToken = options.apiToken || null;

  return createServer(async (request, response) => {
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

      if (url.pathname.startsWith("/api/") && apiToken) {
        if (request.headers.authorization !== `Bearer ${apiToken}`) {
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

      if (request.method === "POST" && url.pathname === "/api/runs/research") {
        const contentType = String(request.headers["content-type"] || "").toLowerCase();
        if (!/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;|$)/i.test(contentType)) {
          throw httpError(415, "Content-Type must be application/json.");
        }
        const origin = request.headers.origin;
        if (origin && origin !== `http://${hostHeader}` && !(options.allowedUiOrigins || []).includes(origin)) {
          throw httpError(403, "Cross-origin API requests are not allowed.");
        }
        if (request.headers["sec-fetch-site"] === "cross-site") {
          throw httpError(403, "Cross-site API requests are not allowed.");
        }
        const body = await readJsonBody(request);
        const disconnectController = new AbortController();
        const onAborted = () => disconnectController.abort(new Error("HTTP client disconnected."));
        request.once("aborted", onAborted);
        response.once("close", () => {
          if (!response.writableEnded) onAborted();
        });
        sendJson(response, 200, await runResearch(body, crawlerTool, {
          ...options,
          signal: disconnectController.signal
        }));
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
}

export function startMaqamServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 8787);
  const host = options.host || process.env.HOST || "127.0.0.1";
  const apiToken = options.apiToken || process.env.MAQAM_API_TOKEN || null;
  const loopback = new Set(["127.0.0.1", "localhost", "::1"]);
  if (!loopback.has(host) && !apiToken) {
    throw new Error("Binding Maqam beyond loopback requires MAQAM_API_TOKEN or options.apiToken.");
  }
  if (!loopback.has(host) && !(options.allowedHosts || []).length) {
    throw new Error("Binding Maqam beyond loopback requires an explicit allowedHosts list.");
  }
  const server = createMaqamServer({ ...options, apiToken });
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
