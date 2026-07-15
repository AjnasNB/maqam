import { hashValue, redactSensitive, redactText } from "./audit.js";
import { ApprovalRequiredError, PolicyDeniedError, toErrorRecord } from "./errors.js";

function safeErrorRecord(error) {
  const record = toErrorRecord(error);
  return {
    ...record,
    message: redactText(record.message),
    details: redactSensitive(record.details)
  };
}

function cloneGoal(goal) {
  if (!goal) return {};
  try {
    return structuredClone(goal);
  } catch {
    throw new TypeError("ToolGateway goals must contain structured-clone-safe values.");
  }
}

function intersectScope(configured, requested, name) {
  const left = Array.isArray(configured) ? [...new Set(configured)] : [];
  const right = Array.isArray(requested) ? [...new Set(requested)] : [];
  if (!left.length) return { values: right, conflict: false };
  if (!right.length) return { values: left, conflict: false };
  const values = left.filter((value) => right.includes(value));
  return { values, conflict: values.length === 0, name };
}

function combineGoals(configuredGoal, requestedGoal) {
  const configured = cloneGoal(configuredGoal);
  const requested = cloneGoal(requestedGoal);
  const tools = intersectScope(configured.allowedTools, requested.allowedTools, "allowedTools");
  const origins = intersectScope(configured.allowedOrigins, requested.allowedOrigins, "allowedOrigins");
  const configuredBudget = configured.budget && typeof configured.budget === "object" ? configured.budget : {};
  const requestedBudget = requested.budget && typeof requested.budget === "object" ? requested.budget : {};
  const budget = { ...requestedBudget, ...configuredBudget };
  for (const key of new Set([...Object.keys(configuredBudget), ...Object.keys(requestedBudget)])) {
    const left = configuredBudget[key];
    const right = requestedBudget[key];
    if (Number.isFinite(left) && Number.isFinite(right)) budget[key] = Math.min(left, right);
    else if (right !== undefined && left === undefined) budget[key] = right;
  }
  return {
    goal: {
      ...requested,
      ...configured,
      ...(tools.values.length ? { allowedTools: tools.values } : {}),
      ...(origins.values.length ? { allowedOrigins: origins.values } : {}),
      ...(Object.keys(budget).length ? { budget } : {})
    },
    conflicts: [tools, origins].filter((scope) => scope.conflict).map((scope) => scope.name)
  };
}

export class ToolGateway {
  constructor(options = {}) {
    if (!options.policyEngine && options.allowUngoverned !== true) {
      throw new TypeError("ToolGateway requires a policyEngine. Set allowUngoverned: true only for explicitly ungoverned use.");
    }
    this.policyEngine = options.policyEngine || null;
    this.evidenceLedger = options.evidenceLedger || null;
    this.approvalQueue = options.approvalQueue || null;
    this.goal = options.goal ? cloneGoal(options.goal) : null;
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

    const combinedGoal = combineGoals(this.goal, context.goal);
    const effectiveGoal = combinedGoal.goal;
    if (combinedGoal.conflicts.length) {
      const error = new PolicyDeniedError("Caller goal has no overlap with the gateway goal scope.", {
        code: "GOAL_SCOPE_CONFLICT",
        details: { scopes: combinedGoal.conflicts, toolName }
      });
      this.#recordTrace(traceBase, "denied", { error: safeErrorRecord(error) });
      throw error;
    }
    const decision = this.policyEngine?.authorizeToolCall({
      goal: effectiveGoal,
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
        this.#recordTrace(traceBase, error?.code === "APPROVAL_INPUT_INVALID" ? "denied" : "needs_approval", {
          decision,
          error: safeErrorRecord(error),
          approvalRequests: redactSensitive(error.details?.approvalRequests || [])
        });
        throw error;
      }
    }

    this.runCallCounts.set(runId, callCount + 1);
    try {
      const result = await tool.handler(input, {
        ...context,
        // Always pass the exact goal and origin scope that were authorized. A
        // caller-provided context must not be able to broaden either value.
        goal: effectiveGoal,
        authorizedOrigins: [...(decision.scope?.allowedOrigins || [])],
        authorizationScope: decision.scope || null,
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
    let inputHash;
    try {
      inputHash = hashValue(input);
    } catch (error) {
      throw new PolicyDeniedError("Approval-gated tool input is not safely canonicalizable.", {
        code: "APPROVAL_INPUT_INVALID",
        details: { toolName, reason: error.message }
      });
    }
    const subject = { runId: context.runId || "default", toolName, inputHash };
    const consumptionRequests = [];
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

      consumptionRequests.push({
        approvalId: candidate.approvalId,
        usage: {
          runId: subject.runId,
          toolName,
          consumedBy: context.requestedBy || "tool-gateway"
        }
      });
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

    try {
      if (consumptionRequests.length > 1) {
        if (typeof this.approvalQueue.consumeMany !== "function") {
          throw new Error("The approval queue must support atomic consumeMany() for multi-approval calls.");
        }
        return this.approvalQueue.consumeMany(consumptionRequests);
      }
      return consumptionRequests.map(({ approvalId, usage }) => (
        this.approvalQueue.consume(approvalId, usage)
      ));
    } catch (error) {
      throw new ApprovalRequiredError(error.message, {
        code: "APPROVAL_INVALID",
        details: {
          toolName,
          approvalIds: consumptionRequests.map((request) => request.approvalId)
        }
      });
    }
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
