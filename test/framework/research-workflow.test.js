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

test("createResearchWorkflow snapshots authority-bearing options", async () => {
  const seeds = ["https://example.com/safe"];
  const options = {
    seeds,
    maxPages: 1,
    sameOrigin: true,
    includeSitemaps: false
  };
  const workflow = createResearchWorkflow(options);
  seeds[0] = "http://127.0.0.1/admin";
  options.maxPages = 999;
  options.sameOrigin = false;
  options.includeSitemaps = true;

  let observedInput;
  const result = await workflow.tasks[0].run({
    tools: {
      async call(name, input) {
        assert.equal(name, "crawler");
        observedInput = input;
        return [{
          url: "https://example.com/safe",
          title: "Safe",
          text: "safe result",
          status: 200
        }];
      }
    },
    evidence: {
      addBatch(batch) {
        return { evidence: batch.evidence.map((_, index) => ({ evidenceId: `ev_${index + 1}` })), claims: [] };
      }
    }
  });

  assert.deepEqual([...observedInput.seeds], ["https://example.com/safe"]);
  assert.equal(observedInput.maxPages, 1);
  assert.equal(observedInput.sameOrigin, true);
  assert.equal(observedInput.includeSitemaps, false);
  assert.equal(result.pages[0].url, "https://example.com/safe");
});

test("createResearchWorkflow rejects inherited and accessor options without invoking getters", () => {
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "sameOrigin");
  try {
    Object.defineProperty(Object.prototype, "sameOrigin", { value: false, configurable: true });
    assert.throws(
      () => createResearchWorkflow({ seeds: ["https://example.com"] }),
      /Inherited Research workflow options field 'sameOrigin'/
    );
  } finally {
    if (previous) Object.defineProperty(Object.prototype, "sameOrigin", previous);
    else delete Object.prototype.sameOrigin;
  }

  let getterCalls = 0;
  const options = {};
  Object.defineProperty(options, "includeSitemaps", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    }
  });
  assert.throws(() => createResearchWorkflow(options), /own enumerable data property/);
  assert.equal(getterCalls, 0);
});

test("research collection validates crawler pages before committing evidence", async () => {
  let evidenceCalls = 0;
  const contextFor = (pages) => ({
    tools: { call: async () => pages },
    evidence: {
      addBatch() {
        evidenceCalls += 1;
        return { evidence: [], claims: [] };
      }
    }
  });
  const workflow = createResearchWorkflow({
    seeds: ["https://example.com"],
    maxPages: 1
  });

  await assert.rejects(
    () => workflow.tasks[0].run(contextFor([
      { url: "https://example.com/1" },
      { url: "https://example.com/2" }
    ])),
    /cannot exceed 1 items/
  );
  assert.equal(evidenceCalls, 0);

  let getterCalls = 0;
  const page = { url: "https://example.com/safe" };
  Object.defineProperty(page, "text", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "forged";
    }
  });
  await assert.rejects(
    () => workflow.tasks[0].run(contextFor([page])),
    /own enumerable data property/
  );
  assert.equal(getterCalls, 0);
  assert.equal(evidenceCalls, 0);

  await assert.rejects(
    () => workflow.tasks[0].run(contextFor([{ url: "http://user:pass@example.com/private" }])),
    /without credentials/
  );
  assert.equal(evidenceCalls, 0);
});
