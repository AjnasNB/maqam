import { ApprovalRequiredError, PolicyDeniedError } from "./errors.js";

export class ToolGateway {
  constructor(options = {}) {
    this.policyEngine = options.policyEngine || null;
    this.evidenceLedger = options.evidenceLedger || null;
    this.goal = options.goal || null;
    this.tools = new Map();
    this.trace = [];
  }

  registerTool(name, handler, metadata = {}) {
    if (!name || typeof handler !== "function") {
      throw new TypeError("ToolGateway.registerTool requires a name and handler.");
    }
    this.tools.set(name, { name, handler, metadata });
    return this;
  }

  async call(toolName, input = {}, context = {}) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new PolicyDeniedError(`Tool '${toolName}' is not registered.`, {
        details: { toolName }
      });
    }

    const decision = this.policyEngine?.authorizeToolCall({
      goal: this.goal,
      toolName,
      input,
      context
    }) || { status: "allow", reason: "No policy engine configured.", requiredApprovals: [] };

    if (decision.status === "deny") {
      throw new PolicyDeniedError(decision.reason, {
        details: { toolName, decision }
      });
    }

    if (decision.status === "needs_approval") {
      throw new ApprovalRequiredError(decision.reason, {
        details: { toolName, requiredApprovals: decision.requiredApprovals, decision }
      });
    }

    const startedAt = new Date().toISOString();
    const result = await tool.handler(input, {
      ...context,
      toolName,
      evidenceLedger: this.evidenceLedger
    });
    const finishedAt = new Date().toISOString();

    this.trace.push({
      toolName,
      input,
      startedAt,
      finishedAt,
      decision
    });

    return result;
  }
}
