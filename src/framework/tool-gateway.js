import { hashValue, redactSensitive } from "./audit.js";
import { ApprovalRequiredError, PolicyDeniedError, toErrorRecord } from "./errors.js";

function safeErrorRecord(error) {
  const record = toErrorRecord(error);
  return { ...record, details: redactSensitive(record.details) };
}

export class ToolGateway {
  constructor(options = {}) {
    this.policyEngine = options.policyEngine || null;
    this.evidenceLedger = options.evidenceLedger || null;
    this.approvalQueue = options.approvalQueue || null;
    this.goal = options.goal || null;
    this.clock = options.clock || (() => new Date());
    this.tools = new Map();
    this.trace = [];
    this.runCallCounts = new Map();
  }

  registerTool(name, handler, metadata = {}) {
    if (!name || typeof handler !== "function") {
      throw new TypeError("ToolGateway.registerTool requires a name and handler.");
    }
    const governance = handler.governance || {};
    this.tools.set(name, {
      name,
      handler,
      metadata: {
        ...governance,
        ...metadata,
        effects: metadata.effects || governance.effects || []
      }
    });
    return this;
  }

  async call(toolName, input = {}, context = {}) {
    const runId = context.runId || "default";
    const startedAt = this.clock().toISOString();
    const traceBase = {
      runId,
      toolName,
      input: redactSensitive(input),
      startedAt
    };
    const tool = this.tools.get(toolName);
    if (!tool) {
      const error = new PolicyDeniedError(`Tool '${toolName}' is not registered.`, {
        details: { toolName }
      });
      this.#recordTrace(traceBase, "denied", { error: safeErrorRecord(error) });
      throw error;
    }

    const decision = this.policyEngine?.authorizeToolCall({
      goal: context.goal || this.goal,
      toolName,
      input,
      context,
      metadata: tool.metadata
    }) || { status: "allow", reason: "No policy engine configured.", requiredApprovals: [] };

    if (decision.status === "deny") {
      const error = new PolicyDeniedError(decision.reason, {
        details: { toolName, decision }
      });
      this.#recordTrace(traceBase, "denied", { decision, error: safeErrorRecord(error) });
      throw error;
    }

    const callCount = this.runCallCounts.get(runId) || 0;
    const maxToolCalls = context.limits?.maxToolCalls ?? decision.limits?.maxToolCalls;
    if (Number.isFinite(maxToolCalls) && callCount >= maxToolCalls) {
      const error = new PolicyDeniedError(`Run '${runId}' exceeded maxToolCalls (${maxToolCalls}).`, {
        code: "TOOL_CALL_LIMIT_EXCEEDED",
        details: { runId, toolName, maxToolCalls, callCount }
      });
      this.#recordTrace(traceBase, "denied", { decision, error: safeErrorRecord(error) });
      throw error;
    }

    let approvals = [];
    if (decision.status === "needs_approval") {
      try {
        approvals = this.#resolveApprovals({ toolName, input, context, decision });
      } catch (error) {
        this.#recordTrace(traceBase, "needs_approval", {
          decision,
          error: safeErrorRecord(error),
          approvalRequests: error.details?.approvalRequests || []
        });
        throw error;
      }
    }

    this.runCallCounts.set(runId, callCount + 1);
    try {
      const result = await tool.handler(input, {
        ...context,
        toolName,
        toolMetadata: tool.metadata,
        approvals,
        evidenceLedger: this.evidenceLedger
      });

      this.#recordTrace(traceBase, "completed", {
        decision,
        approvalIds: approvals.map((approval) => approval.approvalId)
      });
      return result;
    } catch (error) {
      this.#recordTrace(traceBase, "failed", {
        decision,
        approvalIds: approvals.map((approval) => approval.approvalId),
        error: safeErrorRecord(error)
      });
      throw error;
    }
  }

  getCallCount(runId = "default") {
    return this.runCallCounts.get(runId) || 0;
  }

  resetRun(runId) {
    this.runCallCounts.delete(runId);
  }

  #resolveApprovals({ toolName, input, context, decision }) {
    if (!this.approvalQueue) {
      throw new ApprovalRequiredError(decision.reason, {
        details: { toolName, requiredApprovals: decision.requiredApprovals, decision }
      });
    }

    const actions = decision.requiredApprovals?.length
      ? decision.requiredApprovals
      : [`tool:${toolName}`];
    const approvalIds = [context.approvalId, ...(context.approvalIds || [])].filter(Boolean);
    const inputHash = hashValue(input);
    const subject = { runId: context.runId || "default", toolName, inputHash };
    const approved = [];
    const approvalRequests = [];

    for (const action of actions) {
      const candidate = approvalIds
        .map((approvalId) => this.approvalQueue.get(approvalId))
        .find((approval) => approval?.action === action);

      if (!candidate) {
        const existing = this.approvalQueue.findMatching({ action, subject });
        approvalRequests.push(existing || this.approvalQueue.requestApproval({
          action,
          requestedBy: context.requestedBy || "tool-gateway",
          reason: decision.reason,
          risk: toolName === "publish" ? "critical" : "high",
          subject,
          evidence: context.approvalEvidence || []
        }));
        continue;
      }

      if (candidate.status !== "approved") {
        approvalRequests.push(candidate);
        continue;
      }
      if (candidate.subject?.runId !== subject.runId
        || candidate.subject?.toolName !== subject.toolName
        || candidate.subject?.inputHash !== subject.inputHash) {
        throw new ApprovalRequiredError(`Approval '${candidate.approvalId}' does not match this exact tool call.`, {
          code: "APPROVAL_SCOPE_MISMATCH",
          details: { toolName, action, approvalId: candidate.approvalId }
        });
      }

      try {
        approved.push(this.approvalQueue.consume(candidate.approvalId, {
          runId: subject.runId,
          toolName,
          consumedBy: context.requestedBy || "tool-gateway"
        }));
      } catch (error) {
        throw new ApprovalRequiredError(error.message, {
          code: "APPROVAL_INVALID",
          details: { toolName, action, approvalId: candidate.approvalId }
        });
      }
    }

    if (approvalRequests.length) {
      throw new ApprovalRequiredError(decision.reason, {
        details: {
          toolName,
          requiredApprovals: actions,
          approvalRequests,
          decision
        }
      });
    }

    return approved;
  }

  #recordTrace(base, status, extra = {}) {
    this.trace.push({
      ...base,
      ...extra,
      status,
      finishedAt: this.clock().toISOString()
    });
  }
}
