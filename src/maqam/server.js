import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentRuntime,
  EvidenceLedger,
  PolicyEngine,
  ToolGateway,
  createCrawlerTool,
  createResearchWorkflow
} from "../index.js";

const PRODUCT = {
  name: "Maqam",
  tagline: "Compose governed agents",
  description: "Enterprise agent framework console for policy-bound research, evidence capture, and auditable workflow runs."
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
  response.writeHead(statusCode, { "content-type": CONTENT_TYPES[".json"] });
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

function normalizeSeeds(seeds) {
  if (!Array.isArray(seeds)) throw httpError(400, "`seeds` must be an array of URLs.");
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
  return Math.max(1, Math.min(25, Math.floor(maxPages)));
}

function deriveOrigins(seeds) {
  return [...new Set(seeds.map((seed) => new URL(seed).origin))];
}

async function runResearch(body, crawlerTool) {
  const seeds = normalizeSeeds(body.seeds || []);
  const maxPages = clampMaxPages(body.maxPages);
  const allowedOrigins = Array.isArray(body.allowedOrigins) && body.allowedOrigins.length
    ? body.allowedOrigins
    : deriveOrigins(seeds);

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
    timeoutMs: 12_000
  }));

  const runtime = new AgentRuntime({ policyEngine, evidenceLedger, toolGateway });
  const run = await runtime.runWorkflow(
    createResearchWorkflow({ seeds, maxPages, sameOrigin: body.sameOrigin ?? true }),
    {
      objective: body.objective || "Run a governed public research workflow.",
      allowedTools: ["crawler"],
      allowedOrigins,
      budget: { maxToolCalls: 40, maxRuntimeMs: 600_000 }
    }
  );

  return {
    product: PRODUCT,
    run,
    toolTrace: toolGateway.trace,
    generatedAt: new Date().toISOString()
  };
}

async function serveStatic(request, response, publicDir) {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const root = resolve(publicDir);
  const filePath = resolve(root, `.${decodeURIComponent(pathname)}`);

  if (!filePath.startsWith(root)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream"
    });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

export function createMaqamServer(options = {}) {
  const publicDir = options.publicDir || DEFAULT_PUBLIC_DIR;
  const crawlerTool = options.crawlerTool || null;

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { product: PRODUCT, status: "ok" });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/runs/research") {
        const body = await readJsonBody(request);
        sendJson(response, 200, await runResearch(body, crawlerTool));
        return;
      }

      if (request.method === "GET" || request.method === "HEAD") {
        await serveStatic(request, response, publicDir);
        return;
      }

      sendJson(response, 405, { error: "Method not allowed" });
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        error: error.message || "Unexpected server error"
      });
    }
  });
}

export function startMaqamServer(options = {}) {
  const port = Number(options.port || process.env.PORT || 8787);
  const host = options.host || process.env.HOST || "127.0.0.1";
  const server = createMaqamServer(options);
  server.listen(port, host, () => {
    const address = `http://${host}:${port}`;
    process.stdout.write(`Maqam console running at ${address}\n`);
  });
  return server;
}

export { PRODUCT as MAQAM_PRODUCT };
