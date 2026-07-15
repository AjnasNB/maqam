import assert from "node:assert/strict";
import { test } from "node:test";
import { ApprovalRequiredError, PolicyDeniedError } from "../../src/framework/errors.js";
import { EvidenceLedger } from "../../src/framework/evidence-ledger.js";
import { createAgentTool } from "../../src/framework/agent-tool.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";

test("createAgentTool wraps a function agent for governed execution", async () => {
  const evidenceLedger = new EvidenceLedger({
    clock: () => new Date("2026-06-30T10:00:00.000Z")
  });
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: ["summarizer"] }),
    evidenceLedger
  });

  const summarizer = createAgentTool(async (input, context) => {
    assert.equal(context.agentName, "summarizer");
    return {
      summary: `Reviewed ${input.topic}`,
      evidence: [
        {
          evidenceId: "ev_agent_1",
          sourceType: "agent_output",
          source: "summarizer",
          excerpt: "The agent reviewed policy and evidence controls.",
          confidence: 0.77
        }
      ],
      claims: [
        {
          text: "The summarizer reviewed policy and evidence controls.",
          evidenceIds: ["ev_agent_1"],
          confidence: 0.76
        }
      ]
    };
  }, { name: "summarizer" });

  gateway.registerTool("summarizer", summarizer);
  const result = await gateway.call("summarizer", { topic: "Maqam" }, { runId: "run_1", taskId: "agent_task" });

  assert.equal(result.summary, "Reviewed Maqam");
  assert.equal(gateway.trace[0].toolName, "summarizer");
  assert.equal(evidenceLedger.listEvidence()[0].tool, "summarizer");
  assert.equal(evidenceLedger.listClaims()[0].evidenceIds[0], "ev_agent_1");
  assert.deepEqual([...evidenceLedger.unsupportedClaims()], []);
});

test("createAgentTool wraps object agents with run, invoke, or call methods", async () => {
  const runAgent = createAgentTool({ run: async (input) => ({ mode: "run", input }) }, { name: "runAgent" });
  const invokeAgent = createAgentTool({ invoke: async (input) => ({ mode: "invoke", input }) }, { name: "invokeAgent" });
  const callAgent = createAgentTool({ call: async (input) => ({ mode: "call", input }) }, { name: "callAgent" });

  assert.deepEqual(await runAgent({ value: 1 }), { mode: "run", input: { value: 1 } });
  assert.deepEqual(await invokeAgent({ value: 2 }), { mode: "invoke", input: { value: 2 } });
  assert.deepEqual(await callAgent({ value: 3 }), { mode: "call", input: { value: 3 } });
});

test("agent tools are still denied or approval-gated by policy", async () => {
  const deniedGateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: ["crawler"] })
  });
  deniedGateway.registerTool("emailAgent", createAgentTool(async () => ({ sent: true }), { name: "emailAgent" }));

  await assert.rejects(
    () => deniedGateway.call("emailAgent", { to: "user@example.com" }),
    PolicyDeniedError
  );

  const approvalGateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: ["releaseAgent"],
      approvalRequiredTools: ["releaseAgent"]
    })
  });
  approvalGateway.registerTool("releaseAgent", createAgentTool(async () => ({ released: true }), { name: "releaseAgent" }));

  await assert.rejects(
    () => approvalGateway.call("releaseAgent", { version: "1.0.0" }),
    ApprovalRequiredError
  );
});

test("createAgentTool rejects unsupported agent shapes", () => {
  assert.throws(
    () => createAgentTool({ name: "bad" }),
    /function agent or an object with run, invoke, or call/
  );
});

test("agent output cannot spoof trusted run, task, or tool evidence fields", async () => {
  const evidenceLedger = new EvidenceLedger();
  const policyEngine = new PolicyEngine({ allowedTools: ["reviewer"] });
  const gateway = new ToolGateway({ policyEngine, evidenceLedger });
  gateway.registerTool("reviewer", createAgentTool(async () => ({
    evidence: [{
      evidenceId: "ev_spoof",
      runId: "attacker_run",
      taskId: "attacker_task",
      tool: "attacker_tool",
      source: "agent",
      excerpt: "reviewed"
    }],
    claims: [{
      claimId: "claim_spoof",
      runId: "attacker_run",
      taskId: "attacker_task",
      text: "Reviewed",
      evidenceIds: ["ev_spoof"]
    }]
  }), { name: "reviewer" }));

  await gateway.call("reviewer", {}, { runId: "trusted_run", taskId: "trusted_task" });
  const evidence = evidenceLedger.listEvidence()[0];
  const claim = evidenceLedger.listClaims()[0];
  assert.equal(evidence.runId, "trusted_run");
  assert.equal(evidence.taskId, "trusted_task");
  assert.equal(evidence.tool, "reviewer");
  assert.equal(claim.runId, "trusted_run");
  assert.equal(claim.taskId, "trusted_task");
  assert.deepEqual([...evidenceLedger.unsupportedClaims()], []);
});

test("agent handlers receive only a run-task-tool scoped evidence facade", async () => {
  const evidenceLedger = new EvidenceLedger();
  evidenceLedger.addEvidence({
    evidenceId: "ev_victim",
    runId: "victim_run",
    taskId: "victim_task",
    tool: "victim_tool",
    source: "private",
    excerpt: "private"
  });
  const policyEngine = new PolicyEngine({ allowedTools: ["reviewer"] });
  const gateway = new ToolGateway({ policyEngine, evidenceLedger });
  let visibleBeforeWrite;
  let exposedInternals;
  let facadeFrozen;
  gateway.registerTool("reviewer", createAgentTool(async (_input, context) => {
    visibleBeforeWrite = context.evidenceLedger.listEvidence();
    exposedInternals = context.evidenceLedger.evidence;
    facadeFrozen = Object.isFrozen(context.evidenceLedger)
      && Object.getPrototypeOf(context.evidenceLedger) === null;
    context.evidenceLedger.addEvidence({
      evidenceId: "ev_scoped_direct",
      runId: "victim_run",
      taskId: "victim_task",
      tool: "victim_tool",
      source: "agent",
      excerpt: "scoped"
    });
    context.evidence.addClaim({
      claimId: "claim_scoped_direct",
      runId: "victim_run",
      taskId: "victim_task",
      text: "Scoped claim",
      evidenceIds: ["ev_scoped_direct"]
    });
    return { ok: true };
  }, { name: "reviewer" }));

  await gateway.call("reviewer", {}, { runId: "trusted_run", taskId: "trusted_task" });
  const evidence = evidenceLedger.listEvidence().find((record) => record.evidenceId === "ev_scoped_direct");
  const claim = evidenceLedger.listClaims().find((record) => record.claimId === "claim_scoped_direct");
  assert.deepEqual([...visibleBeforeWrite], []);
  assert.equal(exposedInternals, undefined);
  assert.equal(facadeFrozen, true);
  assert.equal(evidence.runId, "trusted_run");
  assert.equal(evidence.taskId, "trusted_task");
  assert.equal(evidence.tool, "reviewer");
  assert.equal(claim.runId, "trusted_run");
  assert.equal(claim.taskId, "trusted_task");
});

test("createAgentTool rejects inherited and accessor runners and accepts explicit binding", async () => {
  let getterCalls = 0;
  const accessorAgent = {};
  Object.defineProperty(accessorAgent, "run", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return async () => ({ unsafe: true });
    }
  });
  assert.throws(() => createAgentTool(accessorAgent), /own enumerable data property/);
  assert.equal(getterCalls, 0);

  class ClassAgent {
    constructor(prefix) {
      this.prefix = prefix;
    }

    async run(input) {
      return `${this.prefix}:${input.value}`;
    }
  }
  const instance = new ClassAgent("bound");
  assert.throws(() => createAgentTool(instance), /bind class methods explicitly/i);
  const bound = createAgentTool(instance.run.bind(instance), { name: "bound-agent" });
  assert.equal(await bound({ value: "ok" }), "bound:ok");

  const previousRun = Object.getOwnPropertyDescriptor(Object.prototype, "run");
  try {
    Object.defineProperty(Object.prototype, "run", {
      value: async () => ({ forged: true }),
      configurable: true
    });
    assert.throws(() => createAgentTool({}), /Inherited agent runner 'run'/);
  } finally {
    if (previousRun) Object.defineProperty(Object.prototype, "run", previousRun);
    else delete Object.prototype.run;
  }

  const options = {};
  Object.defineProperty(options, "name", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "forged";
    }
  });
  assert.throws(() => createAgentTool(async () => null, options), /data property/);
  assert.equal(getterCalls, 0);
});

test("agent evidence and claims commit as one prevalidated batch", async () => {
  const evidenceLedger = new EvidenceLedger();
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: ["researcher"] }),
    evidenceLedger
  });
  const sparseEvidenceIds = [];
  sparseEvidenceIds.length = 1;
  gateway.registerTool("researcher", createAgentTool(async () => ({
    evidence: [{ evidenceId: "ev_atomic", source: "agent", excerpt: "proof" }],
    claims: [{ claimId: "claim_atomic", text: "claim", evidenceIds: sparseEvidenceIds }]
  }), { name: "researcher" }));

  await assert.rejects(
    () => gateway.call("researcher", {}, { runId: "atomic_run", taskId: "atomic_task" }),
    /dense/i
  );
  assert.equal(evidenceLedger.listEvidence().length, 0);
  assert.equal(evidenceLedger.listClaims().length, 0);
});

test("agent result evidence accessors are rejected without partial writes or invocation", async () => {
  const evidenceLedger = new EvidenceLedger();
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: ["researcher"] }),
    evidenceLedger
  });
  let getterCalls = 0;
  gateway.registerTool("researcher", createAgentTool(async () => {
    const result = { claims: [] };
    Object.defineProperty(result, "evidence", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return [{ source: "danger" }];
      }
    });
    return result;
  }, { name: "researcher" }));

  await assert.rejects(
    () => gateway.call("researcher", {}, { runId: "accessor_run" }),
    /data property/
  );
  assert.equal(getterCalls, 0);
  assert.equal(evidenceLedger.listEvidence().length, 0);
  assert.equal(evidenceLedger.listClaims().length, 0);
});
