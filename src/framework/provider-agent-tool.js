import { createCliAgentTool } from "./cli-agent-tool.js";
import { MaqamError } from "./errors.js";
import { redactSensitive, redactText } from "./audit.js";
import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./boundary.js";
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
const CLAUDE_READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep", "WebFetch", "WebSearch"]);
const CLAUDE_TOOL_SELECTOR = /^[A-Za-z0-9_*:.+/-]+$/;
const PROVIDER_BASE_OPTION_KEYS = [
  "name", "command", "commandPrefixArgs", "cwd", "allowedCwdRoots", "timeoutMs",
  "maxInputTokens", "maxOutputTokens", "maxOutputBytes", "maxTotalTokens",
  "expectedOutput", "includeEvents", "env", "envAllowlist", "additionalEnvKeys"
];
const CODEX_OPTION_KEYS = [
  ...PROVIDER_BASE_OPTION_KEYS, "sandbox", "allowDangerFullAccess", "approvalPolicy",
  "ignoreUserConfig", "ignoreRules", "ephemeral", "model", "configOverrides",
  "requireFileChanges"
];
const CLAUDE_OPTION_KEYS = [
  ...PROVIDER_BASE_OPTION_KEYS, "permissionMode", "allowDangerousPermissions", "tools",
  "disallowedTools", "maxTurns", "maxBudgetUsd", "minToolCalls"
];

function snapshotStringArray(value, label) {
  const snapshot = snapshotOwnDataArray(value, { label });
  for (let index = 0; index < snapshot.length; index += 1) {
    if (typeof snapshot[index] !== "string") {
      throw new TypeError(`${label}[${index}] must be a string.`);
    }
  }
  return Object.freeze(snapshot);
}

function snapshotEnvironment(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object of string values.`);
  }
  const descriptorKeys = Reflect.ownKeys(Object.getOwnPropertyDescriptors(value));
  const snapshot = snapshotOwnDataRecord(value, {
    label,
    recognizedKeys: descriptorKeys.filter((key) => typeof key === "string")
  });
  for (const key of Object.keys(snapshot)) {
    if (typeof snapshot[key] !== "string") throw new TypeError(`${label}.${key} must be a string.`);
  }
  return Object.freeze(snapshot);
}

function snapshotProviderOptions(value, provider) {
  const label = `${provider} agent options`;
  const recognizedKeys = provider === "Codex" ? CODEX_OPTION_KEYS : CLAUDE_OPTION_KEYS;
  const snapshot = snapshotOwnDataRecord(value, { label, recognizedKeys });
  const arrayKeys = provider === "Codex"
    ? ["commandPrefixArgs", "allowedCwdRoots", "envAllowlist", "additionalEnvKeys", "configOverrides"]
    : ["commandPrefixArgs", "allowedCwdRoots", "envAllowlist", "additionalEnvKeys", "tools", "disallowedTools"];
  for (const key of arrayKeys) {
    if (snapshot[key] !== undefined) snapshot[key] = snapshotStringArray(snapshot[key], `${label}.${key}`);
  }
  if (snapshot.env !== undefined) snapshot.env = snapshotEnvironment(snapshot.env, `${label}.env`);
  for (const key of ["name", "command", "cwd", "model", "sandbox", "approvalPolicy", "permissionMode"]) {
    if (snapshot[key] !== undefined && typeof snapshot[key] !== "string") {
      throw new TypeError(`${label}.${key} must be a string.`);
    }
  }
  const booleanKeys = provider === "Codex"
    ? ["includeEvents", "allowDangerFullAccess", "ignoreUserConfig", "ignoreRules", "ephemeral", "requireFileChanges"]
    : ["includeEvents", "allowDangerousPermissions"];
  for (const key of booleanKeys) {
    if (snapshot[key] !== undefined && typeof snapshot[key] !== "boolean") {
      throw new TypeError(`${label}.${key} must be a boolean.`);
    }
  }
  for (const key of [
    "timeoutMs", "maxInputTokens", "maxOutputTokens", "maxOutputBytes", "maxTotalTokens",
    "maxTurns", "maxBudgetUsd", "minToolCalls"
  ]) {
    const candidate = snapshot[key];
    if (candidate !== undefined && candidate !== null
      && (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < 0)) {
      throw new TypeError(`${label}.${key} must be a non-negative finite number or null.`);
    }
  }
  const expectation = snapshot.expectedOutput;
  if (expectation !== undefined && expectation !== null) {
    if (typeof expectation === "string") {
      // Strings are immutable.
    } else if (expectation instanceof RegExp) {
      snapshot.expectedOutput = new RegExp(expectation.source, expectation.flags);
    } else {
      throw new TypeError(`${label}.expectedOutput must be a string, RegExp, or null.`);
    }
  }
  return Object.freeze(snapshot);
}

function stringArray(value, name) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${name} must be an array of strings.`);
  }
  return snapshotStringArray(value, name);
}

function promptFromInput(input) {
  if (typeof input === "string") return input;
  const record = snapshotOwnDataRecord(input ?? {}, {
    label: "Provider agent input",
    recognizedKeys: ["prompt", "text"],
    rejectUnknown: false
  });
  const prompt = record.prompt ?? record.text ?? "";
  if (typeof prompt !== "string") throw new TypeError("Provider agent input prompt/text must be a string.");
  return prompt;
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
    args: redactSensitive(result.args),
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    approxInputTokens: result.approxInputTokens,
    approxOutputTokens: result.approxOutputTokens,
    outputBytes: result.outputBytes,
    stderr: redactText(result.stderr),
    limits: redactSensitive(result.limits)
  };
}

function invalidUsage(provider, field, value) {
  return new MaqamError(`${provider} reported invalid usage field '${field}'.`, {
    code: "AGENT_PROVIDER_INVALID_USAGE",
    details: { provider, field, value: value === undefined ? null : redactSensitive(value) }
  });
}

function claudeToolSelectors(value, name) {
  const selectors = stringArray(value, name);
  for (let index = 0; index < selectors.length; index += 1) {
    const selector = selectors[index];
    if (selector.length < 1 || selector.length > 200 || !CLAUDE_TOOL_SELECTOR.test(selector)) {
      throw new TypeError(
        `${name}[${index}] must be one canonical Claude tool selector without commas, whitespace, or parentheses.`
      );
    }
  }
  return selectors;
}

function usageInteger(provider, record, field, { required = false } = {}) {
  const value = record?.[field];
  if (value === undefined && !required) return 0;
  if (!Number.isSafeInteger(value) || value < 0) throw invalidUsage(provider, field, value);
  return value;
}

function safeUsageAdd(provider, current, increment, field) {
  const total = current + increment;
  if (!Number.isSafeInteger(total) || total < 0) throw invalidUsage(provider, field, total);
  return total;
}

function providerString(value, fallback, maximumLength = 1_000_000) {
  if (typeof value !== "string" || value.length === 0) return fallback;
  return value.length <= maximumLength ? value : value.slice(0, maximumLength);
}

function providerSessionId(value) {
  return providerString(value, null, 100_000);
}

function snapshotProviderEvents(events, provider) {
  const snapshot = snapshotJsonValue(events, {
    label: `${provider} events`,
    allowNullPrototype: true,
    freeze: true
  });
  if (!Array.isArray(snapshot)) throw new TypeError(`${provider} events must be an array.`);
  for (let index = 0; index < snapshot.length; index += 1) {
    if (!isEventRecord(snapshot[index])) {
      throw new TypeError(`${provider} event ${index + 1} must be an object.`);
    }
  }
  return snapshot;
}

function hasObservedActivity(activity = {}) {
  return Object.values(activity).some((value) => (
    (Number.isFinite(value) && value > 0)
    || (Array.isArray(value) && value.length > 0)
  ));
}

function isEventRecord(event) {
  return event !== null && typeof event === "object" && !Array.isArray(event);
}

function incompleteProviderStream(provider, message, details) {
  return new MaqamError(message, {
    code: "AGENT_PROVIDER_INCOMPLETE_STREAM",
    details: redactSensitive({ provider, ...details })
  });
}

function requireCodexCompletion(events) {
  events = snapshotProviderEvents(events, "codex");
  const terminalFailure = isEventRecord(events.at(-1)) && events.at(-1).type === "turn.failed";
  if (terminalFailure) return;
  const threadStarted = events.some((event) => isEventRecord(event) && event.type === "thread.started");
  const turnCompleted = events.some((event) => isEventRecord(event) && event.type === "turn.completed");
  const terminalTurnCompleted = isEventRecord(events.at(-1)) && events.at(-1).type === "turn.completed";

  if (!threadStarted || !terminalTurnCompleted) {
    throw incompleteProviderStream(
      "codex",
      "codex JSONL stream was incomplete: expected thread.started and a terminal turn.completed event.",
      {
        eventCount: events.length,
        threadStarted,
        turnCompleted,
        terminalTurnCompleted
      }
    );
  }
}

function requireClaudeCompletion(events) {
  events = snapshotProviderEvents(events, "claude-code");
  const resultObserved = events.some((event) => isEventRecord(event) && event.type === "result");
  const terminalResult = isEventRecord(events.at(-1)) && events.at(-1).type === "result";

  if (!terminalResult) {
    throw incompleteProviderStream(
      "claude-code",
      "claude-code stream-json output was incomplete: expected a terminal result event.",
      {
        eventCount: events.length,
        resultObserved,
        terminalResult
      }
    );
  }
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
  if (Number.isFinite(maxCostUsd) && !Number.isFinite(usage.costUsd)) {
    throw invalidUsage(provider, "total_cost_usd", usage.costUsd);
  }
  if (Number.isFinite(maxCostUsd) && usage.costUsd > maxCostUsd) {
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
    ? new RegExp(expectedOutput.source, expectedOutput.flags).test(output)
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
  events = snapshotProviderEvents(events, "codex");
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
    if (!isEventRecord(event)) continue;
    if (event.type === "thread.started") sessionId = providerSessionId(event.thread_id) ?? sessionId;
    if (event.type === "turn.completed") {
      failure = null;
      if (!event.usage || typeof event.usage !== "object" || Array.isArray(event.usage)) {
        throw invalidUsage("codex", "usage", event.usage ?? null);
      }
      usage.inputTokens = safeUsageAdd(
        "codex",
        usage.inputTokens,
        usageInteger("codex", event.usage, "input_tokens", { required: true }),
        "input_tokens"
      );
      usage.cachedInputTokens = safeUsageAdd(
        "codex",
        usage.cachedInputTokens,
        usageInteger("codex", event.usage, "cached_input_tokens"),
        "cached_input_tokens"
      );
      usage.outputTokens = safeUsageAdd(
        "codex",
        usage.outputTokens,
        usageInteger("codex", event.usage, "output_tokens", { required: true }),
        "output_tokens"
      );
      usage.reasoningOutputTokens = safeUsageAdd(
        "codex",
        usage.reasoningOutputTokens,
        usageInteger("codex", event.usage, "reasoning_output_tokens"),
        "reasoning_output_tokens"
      );
    }
    if (event.type === "turn.failed") {
      failure = providerString(event.error?.message, "Codex reported a failed turn.");
    }
    if (event.type === "item.completed") {
      if (event.item?.type === "agent_message") output = providerString(event.item.text, output);
      if (event.item?.type === "command_execution") activity.commandExecutions += 1;
      if (["file_change", "file_changes"].includes(event.item?.type)) activity.fileChanges += 1;
      if (["mcp_call", "mcp_tool_call"].includes(event.item?.type)) activity.mcpCalls += 1;
      if (["web_search", "web_search_call"].includes(event.item?.type)) activity.webSearches += 1;
    }
  }
  usage.totalTokens = safeUsageAdd("codex", usage.inputTokens, usage.outputTokens, "total_tokens");
  return { sessionId, output, usage, activity, failure };
}

export function normalizeClaudeCodeEvents(events = []) {
  events = snapshotProviderEvents(events, "claude-code");
  const resultEvent = [...events].reverse().find((event) => isEventRecord(event) && event.type === "result") || {};
  const rawUsage = resultEvent.usage || {};
  if (!rawUsage || typeof rawUsage !== "object" || Array.isArray(rawUsage)) {
    throw invalidUsage("claude-code", "usage", rawUsage);
  }
  const inputTokens = usageInteger("claude-code", rawUsage, "input_tokens", { required: true });
  const outputTokens = usageInteger("claude-code", rawUsage, "output_tokens", { required: true });
  const costUsd = resultEvent.total_cost_usd;
  if (costUsd !== undefined && (!Number.isFinite(costUsd) || costUsd < 0)) {
    throw invalidUsage("claude-code", "total_cost_usd", costUsd);
  }
  const usage = {
    inputTokens,
    cachedInputTokens: usageInteger("claude-code", rawUsage, "cache_read_input_tokens"),
    cacheCreationInputTokens: usageInteger("claude-code", rawUsage, "cache_creation_input_tokens"),
    outputTokens,
    totalTokens: safeUsageAdd("claude-code", inputTokens, outputTokens, "total_tokens"),
    costUsd: costUsd ?? null
  };
  const activity = {
    toolCalls: 0,
    toolNames: []
  };
  let sessionId = providerSessionId(resultEvent.session_id);

  for (const event of events) {
    if (!isEventRecord(event)) continue;
    if (event.type === "system") sessionId = providerSessionId(event.session_id) ?? sessionId;
    const content = event.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (isEventRecord(block) && block.type === "tool_use") {
        activity.toolCalls += 1;
        activity.toolNames.push(providerString(block.name, "unknown", 10_000));
      }
    }
  }

  const resultText = providerString(resultEvent.result, "");
  const failureText = providerString(
    resultEvent.result,
    providerString(resultEvent.subtype, "Claude Code reported an error result.")
  );

  return {
    sessionId,
    output: resultText,
    usage,
    activity,
    failure: resultEvent.is_error === true
      ? failureText
      : null
  };
}

export function createCodexAgentTool(options = {}) {
  options = snapshotProviderOptions(options, "Codex");
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
    requireCodexCompletion(events);
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
  options = snapshotProviderOptions(options, "Claude Code");
  const permissionMode = options.permissionMode || "plan";
  if (!CLAUDE_PERMISSION_MODES.has(permissionMode)) {
    throw new TypeError(`Unsupported Claude Code permission mode '${permissionMode}'.`);
  }
  if (permissionMode === "bypassPermissions" && options.allowDangerousPermissions !== true) {
    throw new TypeError("Claude Code bypassPermissions requires allowDangerousPermissions: true.");
  }

  const cwd = options.cwd || process.cwd();
  const tools = claudeToolSelectors(options.tools || [], "tools");
  const disallowedTools = claudeToolSelectors(options.disallowedTools || ["mcp__*"], "disallowedTools");
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
    requireClaudeCompletion(events);
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
    effects: tools.some((toolName) => !CLAUDE_READ_ONLY_TOOLS.has(toolName))
      ? ["read", "write"]
      : ["read"]
  });
}

export { CODEX_ENV_KEYS, CLAUDE_ENV_KEYS };
