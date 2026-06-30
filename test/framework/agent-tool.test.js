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
  assert.deepEqual(evidenceLedger.unsupportedClaims(), []);
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
