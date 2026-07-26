import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runYcWorkflow } from "./workflow.mjs";

const demoDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDirectory = resolve(demoDirectory, "public");
const portArgument = process.argv.find((value) => value.startsWith("--port="));
const port = Number(portArgument?.split("=")[1] || process.env.PORT || 4177);
let activeRun = null;

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

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, service: "maqam-yc-demo" });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/run") {
    try {
      activeRun ??= runYcWorkflow().finally(() => {
        activeRun = null;
      });
      const proof = await activeRun;
      sendJson(response, 200, proof);
    } catch (error) {
      sendJson(response, 500, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
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
  process.stdout.write(`Maqam YC dashboard listening at http://127.0.0.1:${port}\n`);
});
