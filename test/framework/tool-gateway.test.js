import assert from "node:assert/strict";
import { test } from "node:test";
import { ApprovalRequiredError, PolicyDeniedError } from "../../src/framework/errors.js";
import { ApprovalQueue } from "../../src/framework/approval-queue.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";

test("ToolGateway executes registered tools through policy", async () => {
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: ["echo"] })
  });

  gateway.registerTool("echo", async (input) => ({ value: input.value }));
  const result = await gateway.call("echo", { value: "ok" });

  assert.deepEqual(result, { value: "ok" });
  assert.equal(gateway.trace.length, 1);
  assert.equal(gateway.trace[0].toolName, "echo");
});

test("ToolGateway blocks disallowed tools before execution", async () => {
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: ["crawler"] })
  });

  gateway.registerTool("browser", async () => {
    throw new Error("must not run");
  });

  await assert.rejects(
    () => gateway.call("browser", { url: "https://example.com" }),
    PolicyDeniedError
  );
});

test("ToolGateway raises approval errors for approval decisions", async () => {
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: ["github"],
      approvalRequiredTools: ["github"]
    })
  });

  gateway.registerTool("github", async () => ({ ok: true }));

  await assert.rejects(
    () => gateway.call("github", { action: "fork" }),
    ApprovalRequiredError
  );
});

test("ToolGateway enforces per-run tool-call limits and redacts trace secrets", async () => {
  const policyEngine = new PolicyEngine({ allowedTools: ["echo"], maxToolCalls: 1 });
  const gateway = new ToolGateway({ policyEngine });
  gateway.registerTool("echo", async () => ({ ok: true }));
  const limits = policyEngine.evaluateGoal().limits;

  await gateway.call("echo", { apiToken: "hidden" }, { runId: "run_budget", limits });
  await assert.rejects(
    () => gateway.call("echo", {}, { runId: "run_budget", limits }),
    (error) => error.code === "TOOL_CALL_LIMIT_EXCEEDED"
  );

  assert.equal(gateway.getCallCount("run_budget"), 1);
  assert.equal(gateway.trace[0].input.apiToken, "[REDACTED]");
  assert.equal(gateway.trace[1].status, "denied");
});

test("ToolGateway binds a one-time approval to the exact run, tool, and input", async () => {
  const approvalQueue = new ApprovalQueue();
  const policyEngine = new PolicyEngine({
    allowedTools: ["publisher"],
    approvalRequiredEffects: ["publish"]
  });
  const gateway = new ToolGateway({ policyEngine, approvalQueue });
  gateway.registerTool("publisher", async () => ({ published: true }), { effects: ["publish"] });
  const input = { packageName: "maqam", version: "0.2.0" };
  const context = { runId: "release_1" };

  let request;
  await assert.rejects(
    () => gateway.call("publisher", input, context),
    (error) => {
      request = error.details.approvalRequests[0];
      return error instanceof ApprovalRequiredError && request.status === "pending";
    }
  );

  approvalQueue.approve(request.approvalId, { decidedBy: "owner" });
  const result = await gateway.call("publisher", input, { ...context, approvalId: request.approvalId });
  assert.deepEqual(result, { published: true });

  await assert.rejects(
    () => gateway.call("publisher", input, { ...context, approvalId: request.approvalId }),
    (error) => error.code === "APPROVAL_INVALID"
  );
});
