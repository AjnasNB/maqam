import assert from "node:assert/strict";
import { test } from "node:test";
import { createMaqamServer } from "../src/maqam/server.js";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("Maqam server exposes health and console shell", async () => {
  const server = createMaqamServer({
    crawlerTool: async () => []
  });
  const baseUrl = await listen(server);
  try {
    const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
    const capabilities = await fetch(`${baseUrl}/api/capabilities`).then((response) => response.json());
    const html = await fetch(`${baseUrl}/`).then((response) => response.text());

    assert.equal(health.product.name, "Maqam");
    assert.match(html, /Maqam/);
    assert.match(html, /Compose governed agents/);
    assert.match(html, /Governance path/);
    assert.match(html, /Adapter coverage/);
    assert.ok(capabilities.capabilities.adapters.some((adapter) => adapter.id === "codex"));
    assert.ok(capabilities.capabilities.adapters.some((adapter) => adapter.id === "claude-code"));
    assert.match(capabilities.capabilities.limitations.join(" "), /registered adapters/i);
  } finally {
    await close(server);
  }
});

test("Maqam server runs a governed research workflow", async () => {
  const server = createMaqamServer({
    crawlerTool: async () => [
      {
        url: "https://github.com/apify/crawlee",
        title: "Crawlee",
        text: "Crawlee is a web crawling and browser automation library.",
        status: 200
      }
    ]
  });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/runs/research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        seeds: ["https://github.com/apify/crawlee"],
        maxPages: 1
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.product.name, "Maqam");
    assert.equal(payload.run.status, "completed");
    assert.equal(payload.run.outputs.synthesize_report.candidates[0].name, "Crawlee");
    assert.equal(payload.run.evidence.evidence.length, 1);
  } finally {
    await close(server);
  }
});
