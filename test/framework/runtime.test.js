import assert from "node:assert/strict";
import { test } from "node:test";
import { EvidenceLedger } from "../../src/framework/evidence-ledger.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { AgentRuntime } from "../../src/framework/runtime.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";
import { ApprovalQueue } from "../../src/framework/approval-queue.js";

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

test("AgentRuntime enforces the tenant runtime ceiling", async () => {
  const policyEngine = new PolicyEngine({ defaultLimits: { maxRuntimeMs: 25 } });
  const runtime = new AgentRuntime({ policyEngine });

  const result = await runtime.runWorkflow({
    tasks: [{ id: "slow", run: () => new Promise((resolve) => setTimeout(resolve, 200)) }]
  }, { budget: { maxRuntimeMs: 1000 } });

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "RUN_TIMEOUT");
  assert.equal(result.limits.maxRuntimeMs, 25);
});

test("AgentRuntime rejects duplicate task ids before execution", async () => {
  const runtime = new AgentRuntime();
  const result = await runtime.runWorkflow({
    tasks: [
      { id: "same", run: () => "one" },
      { id: "same", run: () => "two" }
    ]
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "WORKFLOW_INVALID");
});

test("AgentRuntime resumes an exact approval-gated action", async () => {
  const approvalQueue = new ApprovalQueue();
  const policyEngine = new PolicyEngine({
    allowedTools: ["writer"],
    approvalRequiredEffects: ["write"]
  });
  const toolGateway = new ToolGateway({ policyEngine, approvalQueue });
  toolGateway.registerTool("writer", async (input) => ({ wrote: input.file }), { effects: ["write"] });
  const runtime = new AgentRuntime({ policyEngine, toolGateway, approvalQueue });
  const workflow = {
    tasks: [{
      id: "write",
      run: (context) => context.tools.call("writer", { file: "proof.txt" }, context)
    }]
  };
  const goal = { runId: "write_1", allowedTools: ["writer"] };

  const pending = await runtime.runWorkflow(workflow, goal);
  const request = pending.error.details.approvalRequests[0];
  approvalQueue.approve(request.approvalId, { decidedBy: "owner" });
  const completed = await runtime.runWorkflow(workflow, { ...goal, approvalId: request.approvalId });

  assert.equal(pending.status, "needs_approval");
  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.outputs.write, { wrote: "proof.txt" });
});
