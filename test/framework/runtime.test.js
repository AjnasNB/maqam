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

test("AgentRuntime retry decisions ignore inherited fields and error accessors", async () => {
  let attempts = 0;
  const previousRetryable = Object.getOwnPropertyDescriptor(Object.prototype, "retryable");
  try {
    Object.defineProperty(Object.prototype, "retryable", {
      value: true,
      configurable: true
    });
    const result = await new AgentRuntime().runWorkflow({
      tasks: [{
        id: "side_effect",
        retries: 2,
        retryable: false,
        run: () => {
          attempts += 1;
          throw new Error("do not retry");
        }
      }]
    });
    assert.equal(result.status, "failed");
    assert.equal(attempts, 1);
  } finally {
    if (previousRetryable) Object.defineProperty(Object.prototype, "retryable", previousRetryable);
    else delete Object.prototype.retryable;
  }

  let getterCalls = 0;
  attempts = 0;
  const hostileError = { message: "hostile" };
  for (const key of ["code", "retryable", "details"]) {
    Object.defineProperty(hostileError, key, {
      enumerable: true,
      get() {
        getterCalls += 1;
        return key === "code" ? "TRANSIENT" : { retryable: true };
      }
    });
  }
  const result = await new AgentRuntime().runWorkflow({
    tasks: [{
      id: "accessor_error",
      retries: 2,
      run: () => {
        attempts += 1;
        throw hostileError;
      }
    }]
  });
  assert.equal(result.status, "failed");
  assert.equal(attempts, 1);
  assert.equal(getterCalls, 0);
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

test("AgentRuntime rejects inherited workflow, task, and goal authority before execution", async () => {
  const runtime = new AgentRuntime();
  let executions = 0;
  const run = () => { executions += 1; };

  const inheritedGoal = Object.create({ runId: "forged_run", approvalId: "approval_1" });
  const goalResult = await runtime.runWorkflow({ tasks: [{ id: "task", run }] }, inheritedGoal);
  assert.equal(goalResult.status, "failed");
  assert.equal(goalResult.error.code, "WORKFLOW_INVALID");

  const inheritedWorkflow = Object.create({ tasks: [{ id: "task", run }] });
  const workflowResult = await runtime.runWorkflow(inheritedWorkflow);
  assert.equal(workflowResult.status, "failed");
  assert.equal(workflowResult.error.code, "WORKFLOW_INVALID");

  const inheritedTask = Object.create({ run, retryable: true });
  inheritedTask.id = "task";
  const taskResult = await runtime.runWorkflow({ tasks: [inheritedTask] });
  assert.equal(taskResult.status, "failed");
  assert.equal(taskResult.error.code, "WORKFLOW_INVALID");
  assert.equal(executions, 0);
});

test("AgentRuntime never invokes task accessors and rejects unknown task fields", async () => {
  const runtime = new AgentRuntime();
  let getterCalls = 0;
  const task = { id: "accessor" };
  Object.defineProperty(task, "run", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return () => "danger";
    }
  });

  const accessorResult = await runtime.runWorkflow({ tasks: [task] });
  const unknownResult = await runtime.runWorkflow({
    tasks: [{ id: "unknown", run: () => "danger", privileged: true }]
  });
  assert.equal(accessorResult.status, "failed");
  assert.equal(unknownResult.status, "failed");
  assert.equal(getterCalls, 0);
});

test("AgentRuntime executes detached goal and workflow snapshots", async () => {
  const runtime = new AgentRuntime();
  let entered;
  let release;
  let secondImplementation = "original";
  let seenContext;
  const firstEntered = new Promise((resolve) => { entered = resolve; });
  const goal = { objective: "safe", allowedTools: ["reader"] };
  const second = {
    id: "second",
    run: (context) => {
      seenContext = context;
      return secondImplementation;
    }
  };
  const workflow = {
    tasks: [
      {
        id: "first",
        run: async () => {
          entered();
          await new Promise((resolve) => { release = resolve; });
          return "first";
        }
      },
      second
    ]
  };

  const pending = runtime.runWorkflow(workflow, goal);
  await firstEntered;
  goal.objective = "changed";
  goal.allowedTools[0] = "writer";
  second.run = () => "replaced";
  workflow.tasks.splice(1, 1, { id: "attacker", run: () => "attacker" });
  secondImplementation = "original";
  release();
  const result = await pending;

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.second, "original");
  assert.equal(result.outputs.attacker, undefined);
  assert.equal(seenContext.goal.objective, "safe");
  assert.equal(seenContext.goal.allowedTools[0], "reader");
  assert.equal(Object.getPrototypeOf(seenContext), null);
  assert.equal(Object.getPrototypeOf(seenContext.goal), null);
  assert.notEqual(Object.getPrototypeOf(seenContext.goal.allowedTools), Array.prototype);
  assert.equal(Object.isFrozen(seenContext.goal), true);
});

test("AgentRuntime fails closed on malformed custom preflight decisions", async () => {
  const cases = [
    { status: "ship", reason: "invalid", limits: {}, requiredApprovals: [] },
    { status: "allow", reason: "invalid", limits: { maxRuntimeMs: -1 }, requiredApprovals: [] },
    { status: "allow", reason: "invalid", limits: { maxToolCalls: 1.5 }, requiredApprovals: [] },
    {
      status: "allow",
      reason: "invalid",
      limits: {},
      requiredApprovals: [],
      scope: { allowedOrigins: [], originsExplicit: "yes", originsUnrestricted: false }
    },
    { status: "allow", reason: "invalid", limits: {}, requiredApprovals: ["effect:write"] },
    { status: "allow", reason: "invalid", limits: {}, requiredApprovals: [], extra: true }
  ];

  for (const decision of cases) {
    let executions = 0;
    const runtime = new AgentRuntime({ policyEngine: { evaluateGoal: () => decision } });
    const result = await runtime.runWorkflow({
      tasks: [{ id: "must_not_run", run: () => { executions += 1; } }]
    });
    assert.equal(result.status, "failed", JSON.stringify(decision));
    assert.equal(result.error.code, "POLICY_DECISION_INVALID", JSON.stringify(decision));
    assert.equal(executions, 0, JSON.stringify(decision));
    assert.equal(Object.getPrototypeOf(result), null);
    assert.equal(Object.getPrototypeOf(result.limits), null);
    assert.notEqual(Object.getPrototypeOf(result.trace), Array.prototype);
  }

  let getterCalls = 0;
  const accessorDecision = {
    reason: "invalid",
    limits: {},
    requiredApprovals: []
  };
  Object.defineProperty(accessorDecision, "status", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "allow";
    }
  });
  const result = await new AgentRuntime({
    policyEngine: { evaluateGoal: () => accessorDecision }
  }).runWorkflow({ tasks: [] });
  assert.equal(result.error.code, "POLICY_DECISION_INVALID");
  assert.equal(getterCalls, 0);
});

test("workflow tasks cannot self-approve approval-gated effects", async () => {
  const approvalQueue = new ApprovalQueue();
  const policyEngine = new PolicyEngine({
    allowedTools: ["publisher"],
    approvalRequiredEffects: ["publish"]
  });
  const toolGateway = new ToolGateway({ policyEngine, approvalQueue });
  let published = 0;
  let exposedApprovals;
  toolGateway.registerTool("publisher", async () => {
    published += 1;
    return { published: true };
  }, { effects: ["publish"] });
  const runtime = new AgentRuntime({ policyEngine, toolGateway, approvalQueue });

  const result = await runtime.runWorkflow({
    tasks: [{
      id: "hostile",
      run: async (context) => {
        exposedApprovals = context.approvals;
        try {
          return await context.tools.call("publisher", { packageName: "maqam" }, context);
        } catch (error) {
          const request = error.details.approvalRequests[0];
          context.approvals?.approve(request.approvalId, { decidedBy: "hostile-task" });
          context.approvalId = request.approvalId;
          return context.tools.call("publisher", { packageName: "maqam" }, context);
        }
      }
    }]
  }, { runId: "self_approval" });

  assert.equal(exposedApprovals, undefined);
  assert.equal(result.status, "needs_approval");
  assert.equal(published, 0);
  assert.equal(approvalQueue.pending().length, 1);
  assert.equal(approvalQueue.pending()[0].status, "pending");
});

test("workflow tasks receive a run-and-task scoped evidence facade", async () => {
  const evidenceLedger = new EvidenceLedger();
  evidenceLedger.addEvidence({
    evidenceId: "ev_other_run",
    runId: "other_run",
    taskId: "other_task",
    tool: "other_tool",
    source: "private",
    excerpt: "private"
  });
  let visibleRecords;
  let rawCollection;
  const runtime = new AgentRuntime({ evidenceLedger });
  const result = await runtime.runWorkflow({
    tasks: [{
      id: "research",
      run: (context) => {
        visibleRecords = context.evidence.listEvidence();
        rawCollection = context.evidence.evidence;
        context.evidence.addEvidence({
          evidenceId: "ev_runtime_scoped",
          runId: "other_run",
          taskId: "other_task",
          tool: "publisher",
          source: "task",
          excerpt: "proof"
        });
        return "done";
      }
    }]
  }, { runId: "trusted_runtime" });

  const stored = evidenceLedger.listEvidence().find((record) => record.evidenceId === "ev_runtime_scoped");
  assert.deepEqual([...visibleRecords], []);
  assert.equal(rawCollection, undefined);
  assert.equal(stored.runId, "trusted_runtime");
  assert.equal(stored.taskId, "research");
  assert.equal(stored.tool, null);
  assert.equal(result.evidence.evidence.length, 1);
  assert.equal(result.evidence.evidence[0].evidenceId, "ev_runtime_scoped");
});

test("AgentRuntime converts self-throwing hostile errors into structured failures", async () => {
  let hostile;
  hostile = new Proxy(Object.create(null), {
    getOwnPropertyDescriptor() {
      throw hostile;
    },
    getPrototypeOf() {
      throw hostile;
    },
    get() {
      throw hostile;
    }
  });

  const runtime = new AgentRuntime();
  let rejected = false;
  let result;
  try {
    result = await runtime.runWorkflow({
      tasks: [{ id: "hostile", run() { throw hostile; } }]
    });
  } catch {
    rejected = true;
  }
  assert.equal(rejected, false);
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "ERROR");
  assert.equal(result.error.message, "Task failed.");

  let invalidWorkflow;
  try {
    invalidWorkflow = await runtime.runWorkflow(hostile);
  } catch {
    rejected = true;
  }
  assert.equal(rejected, false);
  assert.equal(invalidWorkflow.status, "failed");
  assert.equal(invalidWorkflow.error.code, "WORKFLOW_INVALID");
});
