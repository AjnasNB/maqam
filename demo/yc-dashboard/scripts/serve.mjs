import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createYcWorkflowRun } from "./workflow.mjs";

const demoDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDirectory = resolve(demoDirectory, "public");
const portArgument = process.argv.find((value) => value.startsWith("--port="));
const port = Number(portArgument?.split("=")[1] || process.env.PORT || 4177);
const workerArgument = process.argv.find((value) => value.startsWith("--worker="));
const worker = workerArgument?.split("=")[1] || process.env.YC_DEMO_WORKER || "codex";
const paceArgument = process.argv.find((value) => value.startsWith("--pace="));
const paceMs = Number(paceArgument?.split("=")[1] || process.env.YC_DEMO_PACE_MS || 0);
const runs = new Map();

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

function sendJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`${JSON.stringify(value)}\n`);
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = resolve(publicDirectory, requested);
  if (!candidate.startsWith(`${publicDirectory}${sep}`) && candidate !== publicDirectory) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    await access(candidate);
    const info = await stat(candidate);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "content-type": contentTypes.get(extname(candidate)) || "application/octet-stream",
      "cache-control": "no-store"
    });
    createReadStream(candidate).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function matchRunPath(pathname, action = "") {
  const suffix = action ? `/${action}` : "";
  const match = pathname.match(new RegExp(`^/api/runs/([^/]+)${suffix}$`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "maqam-yc-demo",
      mode: "live",
      worker
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/runs") {
    const run = createYcWorkflowRun({ worker, paceMs });
    runs.set(run.id, run);
    await run.start();
    sendJson(response, 202, run.snapshot());
    return;
  }

  const approveRunId = matchRunPath(url.pathname, "approve");
  if (request.method === "POST" && approveRunId) {
    const run = runs.get(approveRunId);
    if (!run) {
      sendJson(response, 404, { error: "Run not found." });
      return;
    }
    try {
      const snapshot = await run.approve({ decidedBy: "dashboard-user" });
      sendJson(response, 202, snapshot);
    } catch (error) {
      sendJson(response, 409, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  const runId = matchRunPath(url.pathname);
  if (request.method === "GET" && runId) {
    const run = runs.get(runId);
    if (!run) {
      sendJson(response, 404, { error: "Run not found." });
      return;
    }
    sendJson(response, 200, run.snapshot());
    return;
  }

  if (request.method === "GET") {
    await serveStatic(decodeURIComponent(url.pathname), response);
    return;
  }
  response.writeHead(405, { allow: "GET, POST" });
  response.end("Method not allowed");
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `Maqam live YC dashboard listening at http://127.0.0.1:${port} (worker=${worker}, pace=${paceMs}ms)\n`
  );
});
