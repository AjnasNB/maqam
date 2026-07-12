import assert from "node:assert/strict";
import { test } from "node:test";
import { MaqamError } from "../../src/framework/errors.js";
import {
  createClaudeCodeAgentTool,
  createCodexAgentTool
} from "../../src/framework/provider-agent-tool.js";

function nodePrefix(code) {
  return ["--input-type=module", "-e", code, "--"];
}

test("createCodexAgentTool normalizes JSONL output, activity, and token usage", async () => {
  const tool = createCodexAgentTool({
    command: process.execPath,
    commandPrefixArgs: nodePrefix(`
      let prompt = "";
      for await (const chunk of process.stdin) prompt += chunk;
      console.log(JSON.stringify({ type: "thread.started", thread_id: "codex-session" }));
      console.log(JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "npm test" } }));
      console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "done:" + prompt } }));
      console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 120, cached_input_tokens: 20, output_tokens: 8, reasoning_output_tokens: 2 } }));
    `),
    cwd: process.cwd(),
    sandbox: "read-only",
    maxTotalTokens: 200,
    expectedOutput: "done:inspect only",
    timeoutMs: 5000
  });

  const result = await tool({ prompt: "inspect only" });

  assert.equal(result.provider, "codex");
  assert.equal(result.sessionId, "codex-session");
  assert.equal(result.output, "done:inspect only");
  assert.equal(result.usage.totalTokens, 128);
  assert.equal(result.activity.commandExecutions, 1);
  assert.equal(result.governance.sandbox, "read-only");
  assert.deepEqual(tool.governance.effects, ["read"]);
});

test("createCodexAgentTool rejects dangerous sandbox defaults and observed token overruns", async () => {
  assert.throws(
    () => createCodexAgentTool({ sandbox: "danger-full-access" }),
    /allowDangerFullAccess/
  );

  const tool = createCodexAgentTool({
    command: process.execPath,
    commandPrefixArgs: nodePrefix(`
      for await (const chunk of process.stdin) {}
      console.log(JSON.stringify({ type: "item.completed", item: { type: "file_change", path: "proof.txt" } }));
      console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 30, output_tokens: 5 } }));
    `),
    cwd: process.cwd(),
    maxTotalTokens: 10,
    timeoutMs: 5000
  });

  await assert.rejects(
    () => tool("small prompt"),
    (error) => (
      error instanceof MaqamError
      && error.code === "AGENT_TOKEN_BUDGET_EXCEEDED"
      && error.details.sideEffectsMayHaveOccurred === true
      && error.details.activity.fileChanges === 1
    )
  );

  const noWrite = createCodexAgentTool({
    command: process.execPath,
    commandPrefixArgs: nodePrefix(`
      for await (const chunk of process.stdin) {}
      console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "no changes" } }));
      console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 3, output_tokens: 2 } }));
    `),
    cwd: process.cwd(),
    requireFileChanges: true,
    timeoutMs: 5000
  });
  await assert.rejects(
    () => noWrite("write a file"),
    (error) => error.code === "AGENT_OUTCOME_VALIDATION_FAILED"
  );
});

test("createClaudeCodeAgentTool normalizes stream JSON and enforces a safe permission profile", async () => {
  const tool = createClaudeCodeAgentTool({
    command: process.execPath,
    commandPrefixArgs: nodePrefix(`
      for await (const chunk of process.stdin) {}
      console.log(JSON.stringify({ type: "system", session_id: "claude-session" }));
      console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read" }] } }));
      console.log(JSON.stringify({ type: "result", session_id: "claude-session", result: "review complete", total_cost_usd: 0.01, usage: { input_tokens: 50, cache_read_input_tokens: 10, output_tokens: 7 } }));
    `),
    cwd: process.cwd(),
    permissionMode: "plan",
    tools: ["Read"],
    maxTurns: 1,
    maxBudgetUsd: 0.05,
    maxTotalTokens: 100,
    expectedOutput: "review complete",
    minToolCalls: 1,
    timeoutMs: 5000
  });

  const result = await tool("review without edits");

  assert.equal(result.provider, "claude-code");
  assert.equal(result.sessionId, "claude-session");
  assert.equal(result.output, "review complete");
  assert.equal(result.usage.totalTokens, 57);
  assert.equal(result.activity.toolCalls, 1);
  assert.deepEqual(result.governance.tools, ["Read"]);
  assert.deepEqual(result.governance.disallowedTools, ["mcp__*"]);
});

test("createClaudeCodeAgentTool blocks permission bypass unless explicitly enabled", () => {
  assert.throws(
    () => createClaudeCodeAgentTool({ permissionMode: "bypassPermissions" }),
    /allowDangerousPermissions/
  );
});

test("provider-reported failures are not treated as successful runs", async () => {
  const codex = createCodexAgentTool({
    command: process.execPath,
    commandPrefixArgs: nodePrefix(`
      for await (const chunk of process.stdin) {}
      console.log(JSON.stringify({ type: "turn.failed", error: { message: "provider rejected task" } }));
    `),
    cwd: process.cwd(),
    timeoutMs: 5000
  });

  await assert.rejects(
    () => codex("run"),
    (error) => error.code === "AGENT_PROVIDER_REPORTED_FAILURE"
  );
});
