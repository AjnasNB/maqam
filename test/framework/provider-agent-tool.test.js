import assert from "node:assert/strict";
import { test } from "node:test";
import { MaqamError } from "../../src/framework/errors.js";
import {
  createClaudeCodeAgentTool,
  createCodexAgentTool,
  normalizeClaudeCodeEvents,
  normalizeCodexEvents
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
      console.log(JSON.stringify({ type: "thread.started", thread_id: "budget-session" }));
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
      console.log(JSON.stringify({ type: "thread.started", thread_id: "no-write-session" }));
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

test("Claude tool selectors reject composites and classify unknown capabilities as write-capable", () => {
  for (const selector of ["Read,Bash", "Read Bash", "Bash(git:*)", "", "x".repeat(201)]) {
    assert.throws(
      () => createClaudeCodeAgentTool({ tools: [selector] }),
      /canonical Claude tool selector/
    );
  }
  assert.throws(
    () => createClaudeCodeAgentTool({ disallowedTools: ["Read,Bash"] }),
    /canonical Claude tool selector/
  );

  assert.deepEqual(createClaudeCodeAgentTool({ tools: ["Read", "WebSearch"] }).governance.effects, ["read"]);
  assert.deepEqual(createClaudeCodeAgentTool({ tools: ["Task"] }).governance.effects, ["read", "write"]);
  assert.deepEqual(createClaudeCodeAgentTool({ tools: ["mcp__filesystem"] }).governance.effects, ["read", "write"]);
});

test("provider permission unlocks must be own data properties", () => {
  for (const [factory, fields] of [
    [createCodexAgentTool, [
      ["sandbox", "danger-full-access"],
      ["allowDangerFullAccess", true],
      ["ignoreRules", true]
    ]],
    [createClaudeCodeAgentTool, [
      ["permissionMode", "bypassPermissions"],
      ["allowDangerousPermissions", true],
      ["tools", ["Bash"]]
    ]]
  ]) {
    for (const [key, value] of fields) {
      const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
      try {
        Object.defineProperty(Object.prototype, key, { value, configurable: true });
        assert.throws(
          () => factory({}),
          new RegExp(`Inherited .+ agent options field '${key}'`)
        );
      } finally {
        if (previous) Object.defineProperty(Object.prototype, key, previous);
        else delete Object.prototype[key];
      }
    }
  }
});

test("provider factories snapshot mutable permission arrays and reject accessors", () => {
  const tools = ["Read"];
  const claude = createClaudeCodeAgentTool({ tools });
  tools.push("Bash");
  assert.deepEqual(claude.governance.effects, ["read"]);

  const codexOptions = { sandbox: "read-only" };
  const codex = createCodexAgentTool(codexOptions);
  codexOptions.sandbox = "danger-full-access";
  codexOptions.allowDangerFullAccess = true;
  assert.equal(codex.governance.sandbox, "read-only");

  let getterCalls = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "permissionMode", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "bypassPermissions";
    }
  });
  assert.throws(() => createClaudeCodeAgentTool(accessorOptions), /own enumerable data property/);
  assert.equal(getterCalls, 0);
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

test("malformed provider failure fields produce stable reported-failure errors", async () => {
  assert.equal(normalizeCodexEvents([{
    type: "turn.failed",
    error: { message: { nested: "not text" } }
  }]).failure, "Codex reported a failed turn.");
  assert.equal(normalizeClaudeCodeEvents([{
    type: "result",
    is_error: true,
    result: { nested: "not text" },
    subtype: { nested: "not text" },
    total_cost_usd: 0,
    usage: { input_tokens: 1, output_tokens: 1 }
  }]).failure, "Claude Code reported an error result.");

  const codex = createCodexAgentTool({
    command: process.execPath,
    commandPrefixArgs: nodePrefix(`
      for await (const chunk of process.stdin) {}
      console.log(JSON.stringify({ type: "turn.failed", error: { message: { nested: "not text" } } }));
    `),
    cwd: process.cwd(),
    timeoutMs: 5000
  });
  await assert.rejects(
    () => codex("run"),
    (error) => error.code === "AGENT_PROVIDER_REPORTED_FAILURE"
      && /Codex reported a failed turn/.test(error.message)
  );

  const claude = createClaudeCodeAgentTool({
    command: process.execPath,
    commandPrefixArgs: nodePrefix(`
      for await (const chunk of process.stdin) {}
      console.log(JSON.stringify({
        type: "result",
        is_error: true,
        result: { nested: "not text" },
        subtype: { nested: "not text" },
        total_cost_usd: 0,
        usage: { input_tokens: 1, output_tokens: 1 }
      }));
    `),
    cwd: process.cwd(),
    timeoutMs: 5000
  });
  await assert.rejects(
    () => claude("run"),
    (error) => error.code === "AGENT_PROVIDER_REPORTED_FAILURE"
      && /Claude Code reported an error result/.test(error.message)
  );
});

test("provider normalization keeps session ids, output, and tool names within declared types", () => {
  const codex = normalizeCodexEvents([
    { type: "thread.started", thread_id: { forged: true } },
    { type: "item.completed", item: { type: "agent_message", text: { forged: true } } },
    { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }
  ]);
  assert.equal(codex.sessionId, null);
  assert.equal(codex.output, "");

  const claude = normalizeClaudeCodeEvents([
    { type: "system", session_id: { forged: true } },
    { type: "assistant", message: { content: [null, { type: "tool_use", name: { forged: true } }] } },
    {
      type: "result",
      session_id: { forged: true },
      result: { forged: true },
      total_cost_usd: 0,
      usage: { input_tokens: 1, output_tokens: 1 }
    }
  ]);
  assert.equal(claude.sessionId, null);
  assert.equal(claude.output, "");
  assert.deepEqual(claude.activity.toolNames, ["unknown"]);
});

test("provider events ignore inherited completion fields", async () => {
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "type");
  try {
    Object.defineProperty(Object.prototype, "type", {
      value: "turn.completed",
      configurable: true
    });
    const codex = createCodexAgentTool({
      command: process.execPath,
      commandPrefixArgs: nodePrefix(`
        for await (const chunk of process.stdin) {}
        console.log(JSON.stringify({ type: "thread.started", thread_id: "spoof-attempt" }));
        console.log(JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1 } }));
      `),
      cwd: process.cwd(),
      timeoutMs: 5000
    });

    await assert.rejects(
      () => codex("run"),
      (error) => error.code === "AGENT_PROVIDER_INCOMPLETE_STREAM"
    );
  } finally {
    if (previous) Object.defineProperty(Object.prototype, "type", previous);
    else delete Object.prototype.type;
  }
});

test("provider usage must be complete, non-negative, and safe", async () => {
  const codexCases = [
    { input_tokens: -100, output_tokens: 50 },
    { output_tokens: 1 },
    { input_tokens: 1, output_tokens: Number.MAX_SAFE_INTEGER }
  ];
  for (const usage of codexCases) {
    const codex = createCodexAgentTool({
      command: process.execPath,
      commandPrefixArgs: nodePrefix(`
        for await (const chunk of process.stdin) {}
        console.log(JSON.stringify({ type: "thread.started", thread_id: "bad-usage" }));
        console.log(JSON.stringify({ type: "turn.completed", usage: ${JSON.stringify(usage)} }));
      `),
      cwd: process.cwd(),
      maxTotalTokens: 1,
      timeoutMs: 5000
    });
    await assert.rejects(
      () => codex("run"),
      (error) => error.code === "AGENT_PROVIDER_INVALID_USAGE"
    );
  }

  const claudeCases = [
    { usage: { input_tokens: -1, output_tokens: 1 }, total_cost_usd: 0 },
    { usage: { input_tokens: 1 }, total_cost_usd: 0 },
    { usage: { input_tokens: 1, output_tokens: 1 } }
  ];
  for (const resultFields of claudeCases) {
    const claude = createClaudeCodeAgentTool({
      command: process.execPath,
      commandPrefixArgs: nodePrefix(`
        for await (const chunk of process.stdin) {}
        console.log(JSON.stringify({ type: "result", result: "done", ...${JSON.stringify(resultFields)} }));
      `),
      cwd: process.cwd(),
      maxBudgetUsd: 0.25,
      timeoutMs: 5000
    });
    await assert.rejects(
      () => claude("run"),
      (error) => error.code === "AGENT_PROVIDER_INVALID_USAGE"
    );
  }
});

test("createCodexAgentTool rejects empty, partial, and non-terminal completion streams", async () => {
  const fakeNpmSecret = ["npm", "A".repeat(24)].join("_");
  const cases = [
    {
      name: "empty",
      code: `for await (const chunk of process.stdin) {}`,
      expected: { eventCount: 0, threadStarted: false, turnCompleted: false, terminalTurnCompleted: false }
    },
    {
      name: "missing thread start",
      code: `
        for await (const chunk of process.stdin) {}
        console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }));
      `,
      expected: { eventCount: 1, threadStarted: false, turnCompleted: true, terminalTurnCompleted: true }
    },
    {
      name: "truncated",
      code: `
        for await (const chunk of process.stdin) {}
        console.log(JSON.stringify({ type: "thread.started", thread_id: "partial" }));
        console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: ${JSON.stringify(fakeNpmSecret)} } }));
      `,
      expected: { eventCount: 2, threadStarted: true, turnCompleted: false, terminalTurnCompleted: false }
    },
    {
      name: "completion is not terminal",
      code: `
        for await (const chunk of process.stdin) {}
        console.log(JSON.stringify({ type: "thread.started", thread_id: "trailing" }));
        console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }));
        console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "late output" } }));
      `,
      expected: { eventCount: 3, threadStarted: true, turnCompleted: true, terminalTurnCompleted: false }
    }
  ];

  for (const testCase of cases) {
    const tool = createCodexAgentTool({
      command: process.execPath,
      commandPrefixArgs: nodePrefix(testCase.code),
      cwd: process.cwd(),
      timeoutMs: 5000
    });

    await assert.rejects(
      () => tool("run"),
      (error) => {
        assert.ok(error instanceof MaqamError, testCase.name);
        assert.equal(error.code, "AGENT_PROVIDER_INCOMPLETE_STREAM", testCase.name);
        assert.match(error.message, /thread\.started.*terminal turn\.completed/, testCase.name);
        assert.deepEqual({ ...error.details }, { provider: "codex", ...testCase.expected }, testCase.name);
        assert.equal(JSON.stringify(error.details).includes(fakeNpmSecret), false);
        return true;
      }
    );
  }
});

test("createClaudeCodeAgentTool rejects empty, partial, and non-terminal result streams", async () => {
  const cases = [
    {
      name: "empty",
      code: `for await (const chunk of process.stdin) {}`,
      expected: { eventCount: 0, resultObserved: false, terminalResult: false }
    },
    {
      name: "truncated",
      code: `
        for await (const chunk of process.stdin) {}
        console.log(JSON.stringify({ type: "system", session_id: "partial" }));
        console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "working" }] } }));
      `,
      expected: { eventCount: 2, resultObserved: false, terminalResult: false }
    },
    {
      name: "result is not terminal",
      code: `
        for await (const chunk of process.stdin) {}
        console.log(JSON.stringify({ type: "system", session_id: "trailing" }));
        console.log(JSON.stringify({ type: "result", session_id: "trailing", result: "done", usage: { input_tokens: 1, output_tokens: 1 } }));
        console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "late output" }] } }));
      `,
      expected: { eventCount: 3, resultObserved: true, terminalResult: false }
    }
  ];

  for (const testCase of cases) {
    const tool = createClaudeCodeAgentTool({
      command: process.execPath,
      commandPrefixArgs: nodePrefix(testCase.code),
      cwd: process.cwd(),
      timeoutMs: 5000
    });

    await assert.rejects(
      () => tool("run"),
      (error) => {
        assert.ok(error instanceof MaqamError, testCase.name);
        assert.equal(error.code, "AGENT_PROVIDER_INCOMPLETE_STREAM", testCase.name);
        assert.match(error.message, /terminal result/, testCase.name);
        assert.deepEqual({ ...error.details }, { provider: "claude-code", ...testCase.expected }, testCase.name);
        return true;
      }
    );
  }
});
