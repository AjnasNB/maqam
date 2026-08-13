import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./boundary.js";

const PRESET_OPTION_KEYS = new Set([
  "allowedTools",
  "allowedOrigins",
  "approvalRequiredTools",
  "deniedTools",
  "deniedOrigins",
  "defaultLimits",
  "maxToolCalls"
]);
const WORKFLOW_KEYS = new Set(["policyEngine", "goal", "calls"]);
const CALL_KEYS = new Set(["toolName", "input", "context", "metadata"]);
const LIMIT_KEYS = new Set(["maxToolCalls", "maxRuntimeMs", "maxPages", "maxNetworkRequests"]);

export const POLICY_PRESET_NAMES = Object.freeze([
  "local-development",
  "team-delivery",
  "production"
]);

const BASE_PRESETS = Object.freeze({
  "local-development": Object.freeze({
    approvalRequiredEffects: Object.freeze(["publish", "delete"]),
    deniedEffects: Object.freeze(["production", "identity", "billing", "secret"]),
    defaultLimits: Object.freeze({ maxToolCalls: 40, maxRuntimeMs: 300_000 })
  }),
  "team-delivery": Object.freeze({
    approvalRequiredEffects: Object.freeze(["publish", "delete", "production"]),
    deniedEffects: Object.freeze(["identity", "billing", "secret"]),
    defaultLimits: Object.freeze({ maxToolCalls: 100, maxRuntimeMs: 600_000 })
  }),
  production: Object.freeze({
    approvalRequiredEffects: Object.freeze([
      "write", "publish", "delete", "production", "identity", "billing", "secret"
    ]),
    deniedEffects: Object.freeze([]),
    defaultLimits: Object.freeze({ maxToolCalls: 100, maxRuntimeMs: 600_000 })
  })
});

function stringArray(value, label) {
  const source = snapshotOwnDataArray(value ?? [], { label, maximumLength: 10_000 });
  const unique = [];
  const seen = new Set();
  for (const item of source) {
    if (typeof item !== "string" || item.trim() === "") {
      throw new TypeError(`${label} must contain non-empty strings.`);
    }
    if (!seen.has(item)) {
      seen.add(item);
      unique.push(item);
    }
  }
  return unique;
}

function exactOriginArray(value, label) {
  return stringArray(value, label).map((origin) => {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new TypeError(`${label} must contain exact HTTP(S) origins.`);
    }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.username
      || parsed.password
      || parsed.origin !== origin) {
      throw new TypeError(`${label} must contain exact HTTP(S) origins.`);
    }
    return parsed.origin;
  });
}

function presetLimits(input, defaults) {
  const requested = snapshotOwnDataRecord(input.defaultLimits ?? {}, {
    label: "Policy preset defaultLimits",
    recognizedKeys: LIMIT_KEYS
  });
  if (input.maxToolCalls !== undefined) requested.maxToolCalls = input.maxToolCalls;
  for (const [key, value] of Object.entries(requested)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`Policy preset ${key} must be a non-negative safe integer.`);
    }
  }
  return snapshotJsonValue({ ...defaults, ...requested }, {
    label: "Policy preset limits",
    freeze: true
  });
}

/**
 * Return an immutable, fail-closed PolicyEngine configuration.
 *
 * Presets never enable every tool or origin. Callers must name the exact tools
 * and network origins their host has registered.
 */
export function createPolicyPreset(name, options = {}) {
  if (typeof name !== "string" || !Object.hasOwn(BASE_PRESETS, name)) {
    throw new TypeError(`Unknown policy preset '${String(name)}'.`);
  }
  const input = snapshotOwnDataRecord(options, {
    label: "Policy preset options",
    recognizedKeys: PRESET_OPTION_KEYS
  });
  const preset = BASE_PRESETS[name];
  const defaultLimits = presetLimits(input, preset.defaultLimits);

  return snapshotJsonValue({
    allowedTools: stringArray(input.allowedTools, "Policy preset allowedTools"),
    deniedTools: stringArray(input.deniedTools, "Policy preset deniedTools"),
    allowedOrigins: exactOriginArray(input.allowedOrigins, "Policy preset allowedOrigins"),
    deniedOrigins: exactOriginArray(input.deniedOrigins, "Policy preset deniedOrigins"),
    approvalRequiredTools: stringArray(
      input.approvalRequiredTools,
      "Policy preset approvalRequiredTools"
    ),
    approvalRequiredEffects: [...preset.approvalRequiredEffects],
    deniedEffects: [...preset.deniedEffects],
    allowAllTools: false,
    allowAllOrigins: false,
    defaultLimits
  }, { label: "Policy preset", freeze: true });
}

/**
 * Evaluate a proposed workflow without dispatching any registered tool.
 */
export function simulatePolicyWorkflow(request = {}) {
  const input = snapshotOwnDataRecord(request, {
    label: "Policy workflow simulation",
    recognizedKeys: WORKFLOW_KEYS
  });
  const policyEngine = input.policyEngine;
  if (!policyEngine
    || typeof policyEngine.evaluateGoal !== "function"
    || typeof policyEngine.authorizeToolCall !== "function") {
    throw new TypeError("Policy workflow simulation requires a PolicyEngine-compatible instance.");
  }
  const calls = snapshotOwnDataArray(input.calls ?? [], {
    label: "Policy workflow simulation calls",
    maximumLength: 1_000
  });
  const goalDecision = policyEngine.evaluateGoal(input.goal ?? {});
  const results = [];
  const summary = { allowed: 0, denied: 0, needsApproval: 0, skipped: 0 };

  if (goalDecision.status === "deny") {
    summary.skipped = calls.length;
  } else {
    for (let index = 0; index < calls.length; index += 1) {
      const call = snapshotOwnDataRecord(calls[index], {
        label: `Policy workflow simulation call ${index}`,
        recognizedKeys: CALL_KEYS
      });
      const decision = policyEngine.authorizeToolCall({
        goal: input.goal ?? {},
        toolName: call.toolName,
        input: call.input ?? {},
        context: call.context,
        metadata: call.metadata ?? {}
      });
      if (decision.status === "allow") summary.allowed += 1;
      if (decision.status === "deny") summary.denied += 1;
      if (decision.status === "needs_approval") summary.needsApproval += 1;
      results.push({ index, toolName: call.toolName, decision });
    }
  }

  const status = goalDecision.status === "deny" || summary.denied > 0
    ? "deny"
    : summary.needsApproval > 0 ? "needs_approval" : "allow";

  return snapshotJsonValue({
    status,
    dispatched: false,
    goalDecision,
    calls: results,
    summary
  }, { label: "Policy workflow simulation report", freeze: true });
}
