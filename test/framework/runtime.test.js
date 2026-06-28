import assert from "node:assert/strict";
import { test } from "node:test";
import { EvidenceLedger } from "../../src/framework/evidence-ledger.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { AgentRuntime } from "../../src/framework/runtime.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";

test("AgentRuntime runs workflow tasks in order", async () => {
  const calls = [];
  const policyEngine = new PolicyEngine();
  const runtime = new AgentRuntime({
    policyEngine,
    evidenceLedger: new EvidenceLedger(),
    toolGateway: new ToolGateway({ policyEngine })
  });

  const result = await runtime.runWorkflow({
    name: "ordered",
    tasks: [
      { id: "first", run: async () => calls.push("first") },
      { id: "second", run: async () => calls.push("second") }
    ]
  }, {
    objective: "Run ordered workflow"
  });

  assert.deepEqual(calls, ["first", "second"]);
  assert.equal(result.status, "completed");
  assert.equal(result.trace.length, 2);
});

test("AgentRuntime retries failed tasks", async () => {
  let attempts = 0;
  const policyEngine = new PolicyEngine();
  const runtime = new AgentRuntime({
    policyEngine,
    evidenceLedger: new EvidenceLedger(),
    toolGateway: new ToolGateway({ policyEngine })
  });

  const result = await runtime.runWorkflow({
    name: "retry",
    tasks: [
      {
        id: "fragile",
        retries: 1,
        run: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("first failure");
          return "ok";
        }
      }
    ]
  }, {
    objective: "Retry once"
  });

  assert.equal(attempts, 2);
  assert.equal(result.outputs.fragile, "ok");
});
