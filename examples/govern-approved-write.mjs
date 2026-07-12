import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AgentRuntime,
  ApprovalQueue,
  MaqamError,
  PolicyEngine,
  ToolGateway,
  createCodexAgentTool
} from "../src/index.js";

const cwd = resolve(process.argv[2] || process.cwd());
const allowTestWrite = process.env.MAQAM_APPROVE_WRITE === "YES";
const model = process.env.MAQAM_CODEX_MODEL || null;
const maxTotalTokens = Number(process.env.MAQAM_MAX_TOTAL_TOKENS || 50_000);
const input = {
  prompt: "Set maqam-proof.txt to the exact UTF-8 bytes represented by \"governed write succeeded.\\n\". The period before the newline is required. Do not change any other file, access the network, or publish anything."
};
const goal = {
  runId: "approved_write_proof",
  objective: "Create one bounded proof file.",
  allowedTools: ["writer"],
  budget: { maxToolCalls: 1, maxRuntimeMs: 120_000 }
};

const approvalQueue = new ApprovalQueue();
const policyEngine = new PolicyEngine({
  allowedTools: ["writer"],
  approvalRequiredEffects: ["write"],
  maxToolCalls: 1,
  defaultLimits: { maxRuntimeMs: 120_000 }
});
const toolGateway = new ToolGateway({ policyEngine, approvalQueue });
toolGateway.registerTool("writer", createCodexAgentTool({
  cwd,
  sandbox: "workspace-write",
  ...(model ? { model } : {}),
  ...(process.platform === "win32" ? { configOverrides: ["windows.sandbox=\"elevated\""] } : {}),
  timeoutMs: 90_000,
  maxInputTokens: 500,
  maxOutputTokens: 16_000,
  maxTotalTokens,
  requireFileChanges: true,
  includeEvents: false
}));
const runtime = new AgentRuntime({ policyEngine, toolGateway, approvalQueue });
const workflow = {
  tasks: [{
    id: "write_proof",
    run: (context) => context.tools.call("writer", input, context)
  }, {
    id: "verify_proof",
    run: async () => {
      const content = await readFile(resolve(cwd, "maqam-proof.txt"), "utf8");
      if (content.trim() !== "governed write succeeded.") {
        throw new MaqamError("Proof file content did not match the approved outcome.", {
          code: "AGENT_OUTCOME_VALIDATION_FAILED",
          details: { expected: "governed write succeeded." }
        });
      }
      return { file: "maqam-proof.txt", verified: true };
    }
  }]
};

const pending = await runtime.runWorkflow(workflow, goal);
const request = pending.error?.details?.approvalRequests?.[0] || null;
if (!request) throw new Error("Expected an approval request before the write.");

if (!allowTestWrite) {
  process.stdout.write(`${JSON.stringify({ status: pending.status, approval: request }, null, 2)}\n`);
  process.exitCode = 2;
} else {
  approvalQueue.approve(request.approvalId, {
    decidedBy: "explicit-example-operator",
    note: "Approved only for the exact proof file input in this throwaway workspace."
  });
  const completed = await runtime.runWorkflow(workflow, { ...goal, approvalId: request.approvalId });
  const output = completed.outputs.write_proof;
  process.stdout.write(`${JSON.stringify({
    status: completed.status,
    approval: approvalQueue.get(request.approvalId),
    provider: output?.provider || null,
    output: output?.output || null,
    usage: output?.usage || null,
    activity: output?.activity || null,
    verification: completed.outputs.verify_proof || null,
    error: completed.error || null,
    trace: toolGateway.trace
  }, null, 2)}\n`);
  if (completed.status !== "completed") process.exitCode = 1;
}
