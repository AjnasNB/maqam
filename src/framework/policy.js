import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./boundary.js";

const DEFAULT_LIMITS = {
  maxToolCalls: 100,
  maxRuntimeMs: 600_000
};
const POLICY_CONFIG_KEYS = new Set([
  "allowedTools", "deniedTools", "allowedOrigins", "deniedOrigins",
  "approvalRequiredTools", "approvalRequiredEffects", "deniedEffects",
  "allowAllTools", "allowAllOrigins", "defaultLimits", "maxToolCalls"
]);
const GOAL_KEYS = new Set([
  "runId", "objective", "allowedTools", "allowedOrigins", "budget", "approvalId",
  "approvalIds", "requestedBy", "approvalEvidence"
]);
const TOOL_AUTHORIZATION_KEYS = new Set(["goal", "toolName", "input", "context", "metadata"]);
const TOOL_METADATA_KEYS = new Set(["effects", "networkOrigins", "risk"]);
const LIMIT_KEYS = new Set(["maxToolCalls", "maxRuntimeMs", "maxPages", "maxNetworkRequests"]);

function stringArray(value, label) {
  const values = snapshotOwnDataArray(value, { label, maximumLength: 10_000 });
  for (let index = 0; index < values.length; index += 1) {
    if (typeof values[index] !== "string" || values[index].trim() === "") {
      throw new TypeError(`${label} must contain non-empty strings.`);
    }
  }
  return values;
}

function asSet(values = [], label = "Policy list") {
  return new Set(stringArray(values, label));
}

function snapshotLimits(value, label) {
  const record = snapshotOwnDataRecord(value, {
    label,
    recognizedKeys: LIMIT_KEYS,
    rejectUnknown: false
  });
  return snapshotJsonValue(record, { label, allowNullPrototype: true });
}

function snapshotGoal(value, label = "Workflow goal") {
  const goal = snapshotOwnDataRecord(value, {
    label,
    recognizedKeys: GOAL_KEYS,
    rejectUnknown: false
  });
  if (goal.allowedTools !== undefined) goal.allowedTools = stringArray(goal.allowedTools, `${label}.allowedTools`);
  if (goal.allowedOrigins !== undefined) goal.allowedOrigins = stringArray(goal.allowedOrigins, `${label}.allowedOrigins`);
  if (goal.approvalIds !== undefined) goal.approvalIds = stringArray(goal.approvalIds, `${label}.approvalIds`);
  if (goal.approvalEvidence !== undefined) goal.approvalEvidence = stringArray(goal.approvalEvidence, `${label}.approvalEvidence`);
  if (goal.budget !== undefined) goal.budget = snapshotLimits(goal.budget, `${label}.budget`);
  return snapshotJsonValue(goal, { label, allowNullPrototype: true });
}

function mergeLimits(defaults, requested = {}) {
  defaults = snapshotLimits(defaults, "Default policy limits");
  requested = snapshotLimits(requested || {}, "Requested policy limits");
  const limits = { ...defaults };
  for (const [key, value] of Object.entries(requested || {})) {
    const tenantValue = defaults[key];
    if (Number.isFinite(tenantValue) && Number.isFinite(value)) {
      limits[key] = Math.max(0, Math.min(tenantValue, value));
    } else if (!(key in defaults)) {
      limits[key] = value;
    }
  }
  return limits;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function collectUrls(value, urls = [], seen = new WeakSet()) {
  if (!value) return urls;
  if (value instanceof URL) {
    if (isHttpUrl(value.toString())) urls.push(value.toString());
    return urls;
  }
  if (typeof value === "string") {
    if (isHttpUrl(value)) urls.push(value);
    return urls;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return urls;
    seen.add(value);
    const items = snapshotOwnDataArray(value, { label: "Tool input array" });
    for (let index = 0; index < items.length; index += 1) collectUrls(items[index], urls, seen);
    return urls;
  }
  if (typeof value === "object") {
    if (seen.has(value)) return urls;
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") throw new TypeError("Tool input cannot contain symbol keys.");
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
        throw new TypeError(`Tool input field '${key}' must be an own enumerable data property.`);
      }
      collectUrls(descriptor.value, urls, seen);
    }
  }
  return urls;
}

function toOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function exactNetworkOrigins(value, label) {
  const origins = stringArray(value, label);
  return [...new Set(origins.map((origin) => {
    let url;
    try {
      url = new URL(origin);
    } catch {
      throw new TypeError(
        `${label} must contain exact HTTP(S) origins without credentials, paths, queries, or fragments.`
      );
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:")
      || url.username
      || url.password
      || url.origin !== origin) {
      throw new TypeError(
        `${label} must contain exact HTTP(S) origins without credentials, paths, queries, or fragments.`
      );
    }
    return url.origin;
  }))];
}

export class PolicyEngine {
  constructor(config = {}) {
    config = snapshotOwnDataRecord(config, {
      label: "PolicyEngine config",
      recognizedKeys: POLICY_CONFIG_KEYS
    });
    this.allowedTools = asSet(config.allowedTools || [], "PolicyEngine allowedTools");
    this.deniedTools = asSet(config.deniedTools || [], "PolicyEngine deniedTools");
    this.allowedOrigins = new Set(stringArray(config.allowedOrigins || [], "PolicyEngine allowedOrigins").map(toOrigin));
    this.deniedOrigins = new Set(stringArray(config.deniedOrigins || [], "PolicyEngine deniedOrigins").map(toOrigin));
    this.approvalRequiredTools = asSet(config.approvalRequiredTools || [], "PolicyEngine approvalRequiredTools");
    this.approvalRequiredEffects = asSet(config.approvalRequiredEffects || [], "PolicyEngine approvalRequiredEffects");
    this.deniedEffects = asSet(config.deniedEffects || [], "PolicyEngine deniedEffects");
    if (config.allowAllTools !== undefined && typeof config.allowAllTools !== "boolean") {
      throw new TypeError("PolicyEngine allowAllTools must be a boolean.");
    }
    if (config.allowAllOrigins !== undefined && typeof config.allowAllOrigins !== "boolean") {
      throw new TypeError("PolicyEngine allowAllOrigins must be a boolean.");
    }
    this.allowAllTools = config.allowAllTools === true;
    this.allowAllOrigins = config.allowAllOrigins === true;
    this.defaultLimits = snapshotLimits({
      ...DEFAULT_LIMITS,
      ...(config.defaultLimits || {}),
      ...(Number.isFinite(config.maxToolCalls) ? { maxToolCalls: config.maxToolCalls } : {})
    }, "PolicyEngine default limits");
  }

  evaluateGoal(goal = {}) {
    goal = snapshotGoal(goal);
    for (const tool of goal.allowedTools || []) {
      if (!this.isToolAllowed(tool)) {
        return this.decision("deny", `Tool '${tool}' is not allowed for this tenant.`);
      }
    }

    for (const origin of goal.allowedOrigins || []) {
      if (!this.isOriginAllowed(toOrigin(origin))) {
        return this.decision("deny", `Origin '${origin}' is not allowed for this tenant.`);
      }
    }

    return this.decision("allow", "Goal is allowed by policy.", {
      limits: {
        ...mergeLimits(this.defaultLimits, goal.budget)
      }
    });
  }

  authorizeToolCall(request = {}) {
    request = snapshotOwnDataRecord(request, {
      label: "Tool authorization request",
      recognizedKeys: TOOL_AUTHORIZATION_KEYS
    });
    const goal = snapshotGoal(request.goal || {}, "Tool authorization goal");
    const toolName = request.toolName;
    const input = request.input ?? {};
    const metadata = snapshotOwnDataRecord(request.metadata || {}, {
      label: "Tool authorization metadata",
      recognizedKeys: TOOL_METADATA_KEYS,
      rejectUnknown: false
    });
    if (typeof toolName !== "string" || toolName.trim() === "") {
      throw new TypeError("Tool authorization toolName must be a non-empty string.");
    }
    if (metadata.risk !== undefined
      && (typeof metadata.risk !== "string" || metadata.risk.trim() === "")) {
      throw new TypeError("Tool authorization metadata.risk must be a non-empty string.");
    }
    const effects = metadata.effects === undefined
      ? []
      : [...new Set(stringArray(metadata.effects, "Tool authorization metadata.effects"))];
    const networkOrigins = metadata.networkOrigins === undefined
      ? []
      : exactNetworkOrigins(
        metadata.networkOrigins,
        "Tool authorization metadata.networkOrigins"
      );
    if (!this.isToolAllowed(toolName)) {
      return this.decision("deny", `Tool '${toolName}' is not allowed.`);
    }
    if (goal.allowedTools?.length && !goal.allowedTools.includes(toolName)) {
      return this.decision("deny", `Tool '${toolName}' is outside the goal's allowedTools scope.`);
    }

    for (const effect of effects) {
      if (this.deniedEffects.has(effect)) {
        return this.decision("deny", `Effect '${effect}' is not allowed for tool '${toolName}'.`);
      }
    }

    const origins = [...new Set([
      ...collectUrls(input).map(toOrigin),
      ...networkOrigins
    ])];
    const goalOrigins = new Set((goal.allowedOrigins || []).map(toOrigin));
    for (const origin of origins) {
      if (!this.isOriginAllowed(origin)) {
        return this.decision("deny", `URL origin '${origin}' is not allowed.`);
      }
      if (goalOrigins.size && !goalOrigins.has(origin)) {
        return this.decision("deny", `URL origin '${origin}' is outside the goal's allowedOrigins scope.`);
      }
    }

    const requiredApprovals = [];
    if (this.approvalRequiredTools.has(toolName)) requiredApprovals.push(`tool:${toolName}`);
    const approvalEffects = effects.filter((effect) => this.approvalRequiredEffects.has(effect));
    requiredApprovals.push(...approvalEffects.map((effect) => `effect:${effect}`));
    if (requiredApprovals.length) {
      return this.decision("needs_approval", `Tool '${toolName}' requires approval.`, {
        requiredApprovals,
        scope: this.authorizationScope(goal)
      });
    }

    return this.decision("allow", "Tool call is allowed.", {
      scope: this.authorizationScope(goal)
    });
  }

  authorizationScope(goal = {}) {
    goal = snapshotGoal(goal, "Authorization scope goal");
    const tenantOrigins = [...this.allowedOrigins];
    const goalOrigins = [...new Set((goal?.allowedOrigins || []).map(toOrigin))];
    const allowedOrigins = tenantOrigins.length && goalOrigins.length
      ? tenantOrigins.filter((origin) => goalOrigins.includes(origin))
      : tenantOrigins.length ? tenantOrigins : goalOrigins;
    return {
      allowedOrigins,
      originsExplicit: tenantOrigins.length > 0 || goalOrigins.length > 0,
      originsUnrestricted: tenantOrigins.length === 0
        && goalOrigins.length === 0
        && this.allowAllOrigins
    };
  }

  isToolAllowed(toolName) {
    if (!toolName || this.deniedTools.has(toolName)) return false;
    return this.allowedTools.has(toolName) || (this.allowedTools.size === 0 && this.allowAllTools);
  }

  isOriginAllowed(origin) {
    if (!origin || this.deniedOrigins.has(origin)) return false;
    return this.allowedOrigins.has(origin) || (this.allowedOrigins.size === 0 && this.allowAllOrigins);
  }

  decision(status, reason, extra = {}) {
    return {
      status,
      reason,
      limits: Object.hasOwn(extra, "limits") ? extra.limits : { ...this.defaultLimits },
      requiredApprovals: Object.hasOwn(extra, "requiredApprovals") ? extra.requiredApprovals : [],
      ...(Object.hasOwn(extra, "scope") ? { scope: extra.scope } : {})
    };
  }
}

export { collectUrls, mergeLimits };
