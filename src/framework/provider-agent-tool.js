import { createCliAgentTool } from "./cli-agent-tool.js";
import { MaqamError } from "./errors.js";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

const SYSTEM_ENV_KEYS = [
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "ComSpec",
  "WINDIR",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "NO_COLOR",
  "CI"
];

const CODEX_ENV_KEYS = [...SYSTEM_ENV_KEYS, "CODEX_HOME", "CODEX_API_KEY"];
const CLAUDE_ENV_KEYS = [...SYSTEM_ENV_KEYS, "CLAUDE_CONFIG_DIR", "ANTHROPIC_API_KEY"];
const CODEX_SANDBOXES = new Set(["read-only", "workspace-write", "danger-full-access"]);
const CODEX_APPROVAL_POLICIES = new Set(["untrusted", "on-request", "never"]);
const CLAUDE_PERMISSION_MODES = new Set(["acceptEdits", "auto", "bypassPermissions", "default", "dontAsk", "plan"]);

function stringArray(value, name) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${name} must be an array of strings.`);
  }
  return value;
}

function promptFromInput(input) {
  if (typeof input === "string") return input;
  return String(input?.prompt ?? input?.text ?? "");
}

function codexLaunch(options) {
  const requestedCommand = options.command || "codex";
  const requestedPrefix = options.commandPrefixArgs || [];
  if (options.command || process.platform !== "win32") {
    return { command: requestedCommand, prefix: requestedPrefix };
  }

  const pathValue = process.env.Path || process.env.PATH || "";
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    const base = directory.replace(/^"|"$/g, "");
    const entry = join(base, "node_modules", "@openai", "codex", "bin", "codex.js");
    if (existsSync(entry)) {
      return { command: process.execPath, prefix: [entry, ...requestedPrefix] };
    }
  }
  return { command: requestedCommand, prefix: requestedPrefix };
}

function processSummary(result) {
  return {
    command: result.command,
    args: result.args,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    approxInputTokens: result.approxInputTokens,
    approxOutputTokens: result.approxOutputTokens,
    outputBytes: result.outputBytes,
    stderr: result.stderr,
    limits: result.limits
  };
}

function numeric(value) {
  return Number.isFinite(value) ? value : 0;
}

function hasObservedActivity(activity = {}) {
  return Object.values(activity).some((value) => (
    (Number.isFinite(value) && value > 0)
    || (Array.isArray(value) && value.length > 0)
  ));
}

function enforceObservedBudget(provider, normalized, maxTotalTokens, maxCostUsd = null) {
  const { usage, activity, output } = normalized;
  if (Number.isFinite(maxTotalTokens) && usage.totalTokens > maxTotalTokens) {
    throw new MaqamError(`${provider} exceeded the observed token budget (${usage.totalTokens} > ${maxTotalTokens}).`, {
      code: "AGENT_TOKEN_BUDGET_EXCEEDED",
      details: {
        provider,
        usage,
        activity,
        observedOutput: output.slice(0, 500),
        maxTotalTokens,
        enforcement: "post-run",
        sideEffectsMayHaveOccurred: hasObservedActivity(activity)
      }
    });
  }
  if (Number.isFinite(maxCostUsd) && Number.isFinite(usage.costUsd) && usage.costUsd > maxCostUsd) {
    throw new MaqamError(`${provider} exceeded the cost budget (${usage.costUsd} > ${maxCostUsd}).`, {
      code: "AGENT_COST_BUDGET_EXCEEDED",
      details: {
        provider,
        usage,
        activity,
        observedOutput: output.slice(0, 500),
        maxCostUsd,
        sideEffectsMayHaveOccurred: hasObservedActivity(activity)
      }
    });
  }
}

function enforceExpectedOutput(provider, output, expectedOutput) {
  if (expectedOutput === undefined || expectedOutput === null) return;
  const matches = expectedOutput instanceof RegExp
    ? expectedOutput.test(output)
    : output.trim() === String(expectedOutput).trim();
  if (!matches) {
    throw new MaqamError(`${provider} completed but did not produce the required output.`, {
      code: "AGENT_OUTCOME_VALIDATION_FAILED",
      details: { provider, expectedOutput: String(expectedOutput), observedOutput: output.slice(0, 500) }
    });
  }
}

function withGovernanceMetadata(tool, metadata) {
  Object.defineProperty(tool, "governance", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: Object.freeze(metadata)
  });
  return tool;
}

export function normalizeCodexEvents(events = []) {
  const usage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    costUsd: null
  };
  const activity = {
    commandExecutions: 0,
    fileChanges: 0,
    mcpCalls: 0,
    webSearches: 0
  };
  let sessionId = null;
  let output = "";
  let failure = null;

  for (const event of events) {
    if (event.type === "thread.started") sessionId = event.thread_id || sessionId;
    if (event.type === "turn.completed") {
      failure = null;
      usage.inputTokens += numeric(event.usage?.input_tokens);
      usage.cachedInputTokens += numeric(event.usage?.cached_input_tokens);
      usage.outputTokens += numeric(event.usage?.output_tokens);
      usage.reasoningOutputTokens += numeric(event.usage?.reasoning_output_tokens);
    }
    if (event.type === "turn.failed") failure = event.error?.message || "Codex reported a failed turn.";
    if (event.type === "item.completed") {
      if (event.item?.type === "agent_message") output = event.item.text || output;
      if (event.item?.type === "command_execution") activity.commandExecutions += 1;
      if (["file_change", "file_changes"].includes(event.item?.type)) activity.fileChanges += 1;
      if (["mcp_call", "mcp_tool_call"].includes(event.item?.type)) activity.mcpCalls += 1;
      if (["web_search", "web_search_call"].includes(event.item?.type)) activity.webSearches += 1;
    }
  }
  usage.totalTokens = usage.inputTokens + usage.outputTokens;
  return { sessionId, output, usage, activity, failure };
}

export function normalizeClaudeCodeEvents(events = []) {
  const resultEvent = [...events].reverse().find((event) => event.type === "result") || {};
  const rawUsage = resultEvent.usage || {};
  const usage = {
    inputTokens: numeric(rawUsage.input_tokens),
    cachedInputTokens: numeric(rawUsage.cache_read_input_tokens),
    cacheCreationInputTokens: numeric(rawUsage.cache_creation_input_tokens),
    outputTokens: numeric(rawUsage.output_tokens),
    totalTokens: numeric(rawUsage.input_tokens) + numeric(rawUsage.output_tokens),
    costUsd: Number.isFinite(resultEvent.total_cost_usd) ? resultEvent.total_cost_usd : null
  };
  const activity = {
    toolCalls: 0,
    toolNames: []
  };
  let sessionId = resultEvent.session_id || null;

  for (const event of events) {
    if (event.type === "system" && event.session_id) sessionId = event.session_id;
    const content = event.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === "tool_use") {
        activity.toolCalls += 1;
        activity.toolNames.push(block.name || "unknown");
      }
    }
  }

  return {
    sessionId,
    output: typeof resultEvent.result === "string" ? resultEvent.result : "",
    usage,
    activity,
    failure: resultEvent.is_error === true
      ? (resultEvent.result || resultEvent.subtype || "Claude Code reported an error result.")
      : null
  };
}

export function createCodexAgentTool(options = {}) {
  const sandbox = options.sandbox || "read-only";
  if (!CODEX_SANDBOXES.has(sandbox)) throw new TypeError(`Unsupported Codex sandbox '${sandbox}'.`);
  if (sandbox === "danger-full-access" && options.allowDangerFullAccess !== true) {
    throw new TypeError("Codex danger-full-access requires allowDangerFullAccess: true.");
  }
  const approvalPolicy = options.approvalPolicy || "never";
  if (!CODEX_APPROVAL_POLICIES.has(approvalPolicy)) {
    throw new TypeError(`Unsupported Codex approval policy '${approvalPolicy}'.`);
  }

  const cwd = options.cwd || process.cwd();
  const launch = codexLaunch(options);
  const configOverrides = stringArray(options.configOverrides || [], "configOverrides");
  const args = [
    ...launch.prefix,
    "--ask-for-approval",
    approvalPolicy,
    ...configOverrides.flatMap((value) => ["--config", value]),
    "--sandbox",
    sandbox,
    ...(options.model ? ["--model", options.model] : []),
    "exec",
    ...(options.ignoreUserConfig === false ? [] : ["--ignore-user-config"]),
    ...(options.ignoreRules === true ? ["--ignore-rules"] : []),
    ...(options.ephemeral === false ? [] : ["--ephemeral"]),
    "--json",
    "-"
  ];
  const maxTotalTokens = options.maxTotalTokens ?? null;
  const runCli = createCliAgentTool({
    name: options.name || "codex",
    command: launch.command,
    args,
    cwd,
    allowedCwdRoots: options.allowedCwdRoots || [cwd],
    stdin: "text",
    parseJsonLines: true,
    timeoutMs: options.timeoutMs ?? 120_000,
    maxInputTokens: options.maxInputTokens ?? 4_000,
    maxOutputTokens: options.maxOutputTokens ?? 32_000,
    maxOutputBytes: options.maxOutputBytes ?? 2 * 1024 * 1024,
    inheritEnv: true,
    envAllowlist: options.envAllowlist || [...CODEX_ENV_KEYS, ...(options.additionalEnvKeys || [])],
    env: options.env || {},
    shell: false
  });

  const tool = async (input = {}, context = {}) => {
    const processResult = await runCli(promptFromInput(input), context);
    const events = processResult.jsonLines || [];
    const normalized = normalizeCodexEvents(events);
    if (normalized.failure) {
      throw new MaqamError(`codex reported a failed turn: ${normalized.failure}`, {
        code: "AGENT_PROVIDER_REPORTED_FAILURE",
        details: { provider: "codex", failure: normalized.failure, activity: normalized.activity, usage: normalized.usage }
      });
    }
    enforceObservedBudget("codex", normalized, maxTotalTokens);
    enforceExpectedOutput("codex", normalized.output, options.expectedOutput);
    if (options.requireFileChanges === true && normalized.activity.fileChanges < 1) {
      throw new MaqamError("codex completed without a reported file change.", {
        code: "AGENT_OUTCOME_VALIDATION_FAILED",
        details: { provider: "codex", activity: normalized.activity, requirement: "fileChanges >= 1" }
      });
    }
    return {
      provider: "codex",
      status: "completed",
      ...normalized,
      events: options.includeEvents === false ? [] : events,
      process: processSummary(processResult),
      governance: {
        sandbox,
        approvalPolicy,
        configOverrides: [...configOverrides],
        ephemeral: options.ephemeral !== false,
        ignoredUserConfig: options.ignoreUserConfig !== false,
        tokenBudgetEnforcement: "post-run"
      }
    };
  };

  return withGovernanceMetadata(tool, {
    provider: "codex",
    sandbox,
    effects: sandbox === "read-only" ? ["read"] : ["read", "write"]
  });
}

export function createClaudeCodeAgentTool(options = {}) {
  const permissionMode = options.permissionMode || "plan";
  if (!CLAUDE_PERMISSION_MODES.has(permissionMode)) {
    throw new TypeError(`Unsupported Claude Code permission mode '${permissionMode}'.`);
  }
  if (permissionMode === "bypassPermissions" && options.allowDangerousPermissions !== true) {
    throw new TypeError("Claude Code bypassPermissions requires allowDangerousPermissions: true.");
  }

  const cwd = options.cwd || process.cwd();
  const tools = stringArray(options.tools || [], "tools");
  const disallowedTools = stringArray(options.disallowedTools || ["mcp__*"], "disallowedTools");
  const maxTurns = options.maxTurns ?? 3;
  const maxBudgetUsd = options.maxBudgetUsd ?? 0.25;
  if (!Number.isInteger(maxTurns) || maxTurns < 1) throw new TypeError("maxTurns must be a positive integer.");
  if (!Number.isFinite(maxBudgetUsd) || maxBudgetUsd < 0) throw new TypeError("maxBudgetUsd must be a non-negative number.");
  const maxTotalTokens = options.maxTotalTokens ?? null;
  const args = [
    ...(options.commandPrefixArgs || []),
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--no-session-persistence",
    "--permission-mode",
    permissionMode,
    "--max-turns",
    String(maxTurns),
    "--max-budget-usd",
    String(maxBudgetUsd),
    "--tools",
    tools.join(","),
    "--disallowedTools",
    disallowedTools.join(","),
    "--strict-mcp-config"
  ];
  const runCli = createCliAgentTool({
    name: options.name || "claude-code",
    command: options.command || "claude",
    args,
    cwd,
    allowedCwdRoots: options.allowedCwdRoots || [cwd],
    stdin: "text",
    parseJsonLines: true,
    timeoutMs: options.timeoutMs ?? 120_000,
    maxInputTokens: options.maxInputTokens ?? 4_000,
    maxOutputTokens: options.maxOutputTokens ?? 32_000,
    maxOutputBytes: options.maxOutputBytes ?? 2 * 1024 * 1024,
    inheritEnv: true,
    envAllowlist: options.envAllowlist || [...CLAUDE_ENV_KEYS, ...(options.additionalEnvKeys || [])],
    env: options.env || {},
    shell: false
  });

  const tool = async (input = {}, context = {}) => {
    const processResult = await runCli(promptFromInput(input), context);
    const events = processResult.jsonLines || [];
    const normalized = normalizeClaudeCodeEvents(events);
    if (normalized.failure) {
      throw new MaqamError(`claude-code reported a failed result: ${normalized.failure}`, {
        code: "AGENT_PROVIDER_REPORTED_FAILURE",
        details: { provider: "claude-code", failure: normalized.failure, activity: normalized.activity, usage: normalized.usage }
      });
    }
    enforceObservedBudget("claude-code", normalized, maxTotalTokens, maxBudgetUsd);
    enforceExpectedOutput("claude-code", normalized.output, options.expectedOutput);
    if (Number.isFinite(options.minToolCalls) && normalized.activity.toolCalls < options.minToolCalls) {
      throw new MaqamError("claude-code completed without the required tool activity.", {
        code: "AGENT_OUTCOME_VALIDATION_FAILED",
        details: { provider: "claude-code", activity: normalized.activity, minToolCalls: options.minToolCalls }
      });
    }
    return {
      provider: "claude-code",
      status: "completed",
      ...normalized,
      events: options.includeEvents === false ? [] : events,
      process: processSummary(processResult),
      governance: {
        permissionMode,
        tools: [...tools],
        disallowedTools: [...disallowedTools],
        maxTurns,
        maxBudgetUsd,
        sessionPersistence: false,
        tokenBudgetEnforcement: "post-run"
      }
    };
  };

  return withGovernanceMetadata(tool, {
    provider: "claude-code",
    permissionMode,
    effects: tools.some((toolName) => ["Edit", "Write", "Bash"].includes(toolName))
      ? ["read", "write"]
      : ["read"]
  });
}

export { CODEX_ENV_KEYS, CLAUDE_ENV_KEYS };
