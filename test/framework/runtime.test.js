import assert from "node:assert/strict";
import { test } from "node:test";
import { EvidenceLedger } from "../../src/framework/evidence-ledger.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { AgentRuntime } from "../../src/framework/runtime.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";
import { ApprovalQueue } from "../../src/framework/approval-queue.js";
import { MaqamError } from "../../src/framework/errors.js";

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
        retryable: true,
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

test("AgentRuntime never retries deterministic governance, approval, or timeout failures", async () => {
  for (const code of ["POLICY_DENIED", "APPROVAL_REQUIRED", "TASK_TIMEOUT", "CLI_INPUT_LIMIT_EXCEEDED"]) {
    let attempts = 0;
    const runtime = new AgentRuntime();
    const result = await runtime.runWorkflow({
      tasks: [{
        id: `unsafe_${code}`,
        retries: 3,
        retryable: true,
        run: async () => {
          attempts += 1;
          throw new MaqamError(`deterministic ${code}`, { code });
        }
      }]
    });

    assert.equal(attempts, 1, code);
    assert.equal(result.error.code, code);
  }
});

test("AgentRuntime gives cooperative tasks time to cancel before returning", async () => {
  let sideEffect = false;
  const runtime = new AgentRuntime({ cancellationGraceMs: 50 });
  const result = await runtime.runWorkflow({
    tasks: [{
      id: "cooperative",
      timeoutMs: 15,
      run: (context) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          sideEffect = true;
          resolve();
        }, 80);
        context.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(context.signal.reason);
        }, { once: true });
      })
    }]
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "TASK_TIMEOUT");
  assert.equal(result.error.details.operationMayStillBeRunning, false);
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(sideEffect, false);
});

test("AgentRuntime marks non-cooperative timed-out tasks as potentially still running", async () => {
  let completed = false;
  const runtime = new AgentRuntime({ cancellationGraceMs: 5 });
  const result = await runtime.runWorkflow({
    tasks: [{
      id: "noncooperative",
      timeoutMs: 10,
      run: () => new Promise((resolve) => setTimeout(() => {
        completed = true;
        resolve();
      }, 70))
    }]
  });

  assert.equal(result.error.code, "TASK_TIMEOUT");
  assert.equal(result.error.details.operationMayStillBeRunning, true);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(completed, true);
});

test("AgentRuntime rejects a concurrently active explicit run id", async () => {
  let release;
  let started;
  const taskStarted = new Promise((resolve) => { started = resolve; });
  const blocker = new Promise((resolve) => { release = resolve; });
  const runtime = new AgentRuntime();
  const workflow = {
    tasks: [{ id: "hold", run: async () => { started(); await blocker; return "done"; } }]
  };

  const first = runtime.runWorkflow(workflow, { runId: "same_run" });
  await taskStarted;
  const duplicate = await runtime.runWorkflow(workflow, { runId: "same_run" });
  release();
  const completed = await first;

  assert.equal(duplicate.status, "failed");
  assert.equal(duplicate.error.code, "RUN_ID_ACTIVE");
  assert.equal(completed.status, "completed");
});

test("AgentRuntime generates collision-resistant default run ids", async () => {
  const runtime = new AgentRuntime();
  const workflow = { tasks: [] };
  const results = await Promise.all(Array.from({ length: 20 }, () => runtime.runWorkflow(workflow)));
  const ids = new Set(results.map((result) => result.runId));

  assert.equal(ids.size, results.length);
  for (const id of ids) assert.match(id, /^run_[0-9a-f-]{36}$/i);
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
