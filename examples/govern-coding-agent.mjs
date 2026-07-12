import { resolve } from "node:path";
import {
  AgentRuntime,
  PolicyEngine,
  ToolGateway,
  createClaudeCodeAgentTool,
  createCodexAgentTool
} from "../src/index.js";

const provider = process.argv[2] || "codex";
const cwd = resolve(process.argv[3] || process.cwd());
const codexModel = process.env.MAQAM_CODEX_MODEL || null;
const prompt = process.argv.slice(4).join(" ")
  || "Return exactly MAQAM_GOVERNED_OK. Do not use tools or change files.";
const isDefaultPrompt = process.argv.slice(4).length === 0;

if (!new Set(["codex", "claude"]).has(provider)) {
  throw new Error("Provider must be 'codex' or 'claude'.");
}

const toolName = provider === "codex" ? "codexAgent" : "claudeAgent";
const policyEngine = new PolicyEngine({
  allowedTools: [toolName],
  maxToolCalls: 1,
  defaultLimits: { maxRuntimeMs: 120_000 }
});
const toolGateway = new ToolGateway({ policyEngine });

const agent = provider === "codex"
  ? createCodexAgentTool({
    cwd,
    sandbox: "read-only",
    ...(codexModel ? { model: codexModel } : {}),
    timeoutMs: 90_000,
    maxInputTokens: 500,
    maxOutputTokens: 16_000,
    maxTotalTokens: 50_000,
    ...(isDefaultPrompt ? { expectedOutput: "MAQAM_GOVERNED_OK" } : {}),
    includeEvents: false
  })
  : createClaudeCodeAgentTool({
    cwd,
    permissionMode: "plan",
    tools: [],
    maxTurns: 1,
    maxBudgetUsd: 0.05,
    maxTotalTokens: 50_000,
    ...(isDefaultPrompt ? { expectedOutput: "MAQAM_GOVERNED_OK" } : {}),
    timeoutMs: 90_000,
    includeEvents: false
  });

toolGateway.registerTool(toolName, agent);
const runtime = new AgentRuntime({ policyEngine, toolGateway });
const run = await runtime.runWorkflow({
  tasks: [{
    id: "provider_smoke",
    run: (context) => context.tools.call(toolName, { prompt }, context)
  }]
}, {
  runId: `smoke_${provider}`,
  objective: `Verify the ${provider} adapter in a bounded read-only run.`,
  allowedTools: [toolName],
  budget: { maxToolCalls: 1, maxRuntimeMs: 90_000 }
});

const output = run.outputs.provider_smoke;
process.stdout.write(`${JSON.stringify({
  runId: run.runId,
  status: run.status,
  provider: output?.provider || provider,
  output: output?.output || null,
  usage: output?.usage || null,
  activity: output?.activity || null,
  process: output ? {
    durationMs: output.process.durationMs,
    exitCode: output.process.exitCode,
    limits: output.process.limits
  } : null,
  error: run.error || null,
  gatewayTrace: toolGateway.trace
}, null, 2)}\n`);

if (run.status !== "completed") process.exitCode = 1;
