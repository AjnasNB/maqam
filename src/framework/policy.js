const DEFAULT_LIMITS = {
  maxToolCalls: 100,
  maxRuntimeMs: 600_000
};

function asSet(values = []) {
  return new Set(values.filter(Boolean));
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function collectUrls(value, urls = []) {
  if (!value) return urls;
  if (typeof value === "string") {
    if (isHttpUrl(value)) urls.push(value);
    return urls;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, urls);
    return urls;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) collectUrls(item, urls);
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
    this.defaultLimits = {
      ...DEFAULT_LIMITS,
      ...(config.defaultLimits || {}),
      ...(config.maxToolCalls ? { maxToolCalls: config.maxToolCalls } : {})
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
        ...this.defaultLimits,
        ...(goal.budget || {})
      }
    });
  }

  authorizeToolCall({ toolName, input = {} } = {}) {
    if (!this.isToolAllowed(toolName)) {
      return this.decision("deny", `Tool '${toolName}' is not allowed.`);
    }

    if (this.approvalRequiredTools.has(toolName)) {
      return this.decision("needs_approval", `Tool '${toolName}' requires approval.`, {
        requiredApprovals: [`tool:${toolName}`]
      });
    }

    const origins = [...new Set(collectUrls(input).map(toOrigin))];
    for (const origin of origins) {
      if (!this.isOriginAllowed(origin)) {
        return this.decision("deny", `URL origin '${origin}' is not allowed.`);
      }
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

export { collectUrls };
