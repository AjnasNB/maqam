const DEFAULT_LIMITS = {
  maxToolCalls: 100,
  maxRuntimeMs: 600_000
};

function asSet(values = []) {
  return new Set(values.filter(Boolean));
}

function mergeLimits(defaults, requested = {}) {
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
  if (typeof value === "string") {
    if (isHttpUrl(value)) urls.push(value);
    return urls;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return urls;
    seen.add(value);
    for (const item of value) collectUrls(item, urls, seen);
    return urls;
  }
  if (typeof value === "object") {
    if (seen.has(value)) return urls;
    seen.add(value);
    for (const item of Object.values(value)) collectUrls(item, urls, seen);
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

export class PolicyEngine {
  constructor(config = {}) {
    this.allowedTools = asSet(config.allowedTools);
    this.deniedTools = asSet(config.deniedTools);
    this.allowedOrigins = asSet((config.allowedOrigins || []).map(toOrigin));
    this.deniedOrigins = asSet((config.deniedOrigins || []).map(toOrigin));
    this.approvalRequiredTools = asSet(config.approvalRequiredTools);
    this.approvalRequiredEffects = asSet(config.approvalRequiredEffects);
    this.deniedEffects = asSet(config.deniedEffects);
    this.defaultLimits = {
      ...DEFAULT_LIMITS,
      ...(config.defaultLimits || {}),
      ...(Number.isFinite(config.maxToolCalls) ? { maxToolCalls: config.maxToolCalls } : {})
    };
  }

  evaluateGoal(goal = {}) {
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

  authorizeToolCall({ goal = {}, toolName, input = {}, metadata = {} } = {}) {
    goal = goal || {};
    if (!this.isToolAllowed(toolName)) {
      return this.decision("deny", `Tool '${toolName}' is not allowed.`);
    }
    if (goal.allowedTools?.length && !goal.allowedTools.includes(toolName)) {
      return this.decision("deny", `Tool '${toolName}' is outside the goal's allowedTools scope.`);
    }

    const effects = [...new Set(metadata.effects || [])];
    for (const effect of effects) {
      if (this.deniedEffects.has(effect)) {
        return this.decision("deny", `Effect '${effect}' is not allowed for tool '${toolName}'.`);
      }
    }

    const origins = [...new Set(collectUrls(input).map(toOrigin))];
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
        requiredApprovals
      });
    }

    return this.decision("allow", "Tool call is allowed.");
  }

  isToolAllowed(toolName) {
    if (!toolName || this.deniedTools.has(toolName)) return false;
    return this.allowedTools.size === 0 || this.allowedTools.has(toolName);
  }

  isOriginAllowed(origin) {
    if (!origin || this.deniedOrigins.has(origin)) return false;
    return this.allowedOrigins.size === 0 || this.allowedOrigins.has(origin);
  }

  decision(status, reason, extra = {}) {
    return {
      status,
      reason,
      limits: extra.limits || { ...this.defaultLimits },
      requiredApprovals: extra.requiredApprovals || []
    };
  }
}

export { collectUrls, mergeLimits };
