import assert from "node:assert/strict";
import { test } from "node:test";
import { EvidenceLedger } from "../../src/framework/evidence-ledger.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { createResearchWorkflow } from "../../src/framework/research-workflow.js";
import { AgentRuntime } from "../../src/framework/runtime.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";

test("createResearchWorkflow uses gateway results and records evidence", async () => {
  const evidenceLedger = new EvidenceLedger({
    clock: () => new Date("2026-06-28T10:00:00.000Z")
  });
  const policyEngine = new PolicyEngine({
    allowedTools: ["crawler"],
    allowedOrigins: ["https://github.com"]
  });
  const gateway = new ToolGateway({ policyEngine, evidenceLedger });
  gateway.registerTool("crawler", async () => [
    {
      url: "https://github.com/apify/crawlee",
      title: "Crawlee",
      text: "Crawlee is a web crawling and browser automation library.",
      markdown: "# Crawlee",
      status: 200
    }
  ]);

  const runtime = new AgentRuntime({ policyEngine, evidenceLedger, toolGateway: gateway });
  const result = await runtime.runWorkflow(
    createResearchWorkflow({
      seeds: ["https://github.com/apify/crawlee"],
      maxPages: 1
    }),
    {
      objective: "Research Crawlee",
      allowedTools: ["crawler"],
      allowedOrigins: ["https://github.com"]
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.collect_sources.pages.length, 1);
  assert.equal(result.outputs.synthesize_report.candidates[0].name, "Crawlee");
  assert.equal(evidenceLedger.listEvidence().length, 1);
  assert.equal(evidenceLedger.unsupportedClaims().length, 0);
});
