import { redactSensitive, redactText, snapshotHashedValue } from "./audit.js";
import { ApprovalRequiredError, PolicyDeniedError, toErrorRecord } from "./errors.js";

const POLICY_STATUSES = new Set(["allow", "deny", "needs_approval"]);
const RISK_LEVELS = ["low", "medium", "high", "critical"];
const MAX_POLICY_LIST_ITEMS = 10_000;
const MAX_POLICY_STRING_LENGTH = 10_000;

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

function normalizeStringArray(value, source) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${source} must be an array of non-empty strings.`);
  }
  if (value.length > MAX_POLICY_LIST_ITEMS) {
    throw new TypeError(`${source} cannot exceed ${MAX_POLICY_LIST_ITEMS} items.`);
  }
  const keys = Reflect.ownKeys(value);
  const allowed = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
    throw new TypeError(`${source} must be a dense array without extra properties.`);
  }
  const normalized = Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)
      || typeof descriptor.value !== "string" || descriptor.value.trim() === ""
      || descriptor.value.length > MAX_POLICY_STRING_LENGTH) {
      throw new TypeError(`${source} must contain only enumerable non-empty string data properties.`);
    }
    return descriptor.value;
  });
  return normalized;
}

function normalizeEffects(effects, source) {
  if (effects === undefined) return [];
  return [...new Set(normalizeStringArray(effects, `${source} effects`))];
}

function normalizeRisk(risk, source) {
  if (risk === undefined) return null;
  if (typeof risk !== "string" || risk.trim() === "" || risk.length > MAX_POLICY_STRING_LENGTH) {
    throw new TypeError(`${source} risk must be a non-empty string.`);
  }
  return risk;
}

function highestRisk(...risks) {
  return risks.filter(Boolean).reduce((highest, risk) => (
    RISK_LEVELS.indexOf(risk) > RISK_LEVELS.indexOf(highest) ? risk : highest
  ), "low");
}

function effectiveRegistrationRisk(governanceRisk, metadataRisk) {
  const recognized = [governanceRisk, metadataRisk].filter((risk) => RISK_LEVELS.includes(risk));
  if (recognized.length) return highestRisk(...recognized);
  // Custom labels were valid ToolMetadata in 0.2.0. They remain available
  // when no ordered governance level is present, with registration metadata
  // retaining its historical precedence.
  return metadataRisk || governanceRisk || null;
}

function ownDataValue(record, key, required = false) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) {
    if (required) throw new TypeError(`Policy decision is missing '${key}'.`);
    return undefined;
  }
  if (!("value" in descriptor) || !descriptor.enumerable) {
    throw new TypeError(`Policy decision '${key}' must be an enumerable data property.`);
  }
  return descriptor.value;
}

function copyDataRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`Policy decision '${name}' must be a plain object.`);
  }
  const result = {};
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_POLICY_LIST_ITEMS) {
    throw new TypeError(`Policy decision '${name}' has too many properties.`);
  }
  for (const key of keys) {
    if (typeof key !== "string") throw new TypeError(`Policy decision '${name}' cannot contain symbol keys.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new TypeError(`Policy decision '${name}.${key}' must be an enumerable data property.`);
    }
    Object.defineProperty(result, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return result;
}

function copyRegistrationRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${name} must be a plain object.`);
  }
  const result = {};
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_POLICY_LIST_ITEMS) throw new TypeError(`${name} has too many properties.`);
  for (const key of keys) {
    if (typeof key !== "string") throw new TypeError(`${name} cannot contain symbol keys.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${name}.${key} must be an enumerable data property.`);
    }
    Object.defineProperty(result, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return result;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function snapshotToolMetadata(value) {
  // Parse the canonical bytes themselves so validation and detachment are one
  // operation, without a second serialization surface.
  return deepFreeze(snapshotHashedValue(value).snapshot);
}

function cloneToolMetadata(value) {
  return structuredClone(value);
}

function effectiveToolCallLimit(context, decision) {
  const policyLimit = decision.limits?.maxToolCalls;
  const callerLimit = context.limits?.maxToolCalls;
  if (callerLimit !== undefined
    && (!Number.isInteger(callerLimit) || callerLimit < 0)) {
    throw new TypeError("Caller limits.maxToolCalls must be a non-negative integer.");
  }
  if (callerLimit === undefined) return policyLimit;
  return Number.isInteger(policyLimit) ? Math.min(policyLimit, callerLimit) : callerLimit;
}

function normalizePolicyDecision(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError("Policy engine must return a plain decision object.");
  }

  const status = ownDataValue(value, "status", true);
  const reason = ownDataValue(value, "reason", true);
  const requiredApprovals = ownDataValue(value, "requiredApprovals", true);
  const rawLimits = ownDataValue(value, "limits", true);
  const rawScope = ownDataValue(value, "scope");
  if (typeof status !== "string" || !POLICY_STATUSES.has(status)) {
    throw new TypeError("Policy decision status is not supported.");
  }
  if (typeof reason !== "string" || reason.trim() === "" || reason.length > MAX_POLICY_STRING_LENGTH) {
    throw new TypeError("Policy decision reason must be a non-empty string.");
  }
  const normalizedApprovals = normalizeStringArray(
    requiredApprovals,
    "Policy decision requiredApprovals"
  );
  if (new Set(normalizedApprovals).size !== normalizedApprovals.length) {
    throw new TypeError("Policy decision requiredApprovals cannot contain duplicates.");
  }
  if (status === "needs_approval" && normalizedApprovals.length === 0) {
    throw new TypeError("A needs_approval policy decision must name at least one required approval.");
  }
  if (status !== "needs_approval" && normalizedApprovals.length > 0) {
    throw new TypeError(`A ${status} policy decision cannot include required approvals.`);
  }

  const limits = snapshotToolMetadata(copyDataRecord(rawLimits, "limits"));
  if (limits.maxToolCalls !== undefined
    && (!Number.isInteger(limits.maxToolCalls) || limits.maxToolCalls < 0)) {
    throw new TypeError("Policy decision limits.maxToolCalls must be a non-negative integer.");
  }

  let scope;
  if (rawScope !== undefined) {
    const copiedScope = copyDataRecord(rawScope, "scope");
    const allowedOrigins = normalizeStringArray(
      copiedScope.allowedOrigins,
      "Policy decision scope.allowedOrigins"
    );
    if (typeof copiedScope.originsExplicit !== "boolean"
      || typeof copiedScope.originsUnrestricted !== "boolean") {
      throw new TypeError("Policy decision origin scope flags must be booleans.");
    }
    scope = {
      allowedOrigins: [...new Set(allowedOrigins)],
      originsExplicit: copiedScope.originsExplicit,
      originsUnrestricted: copiedScope.originsUnrestricted
    };
  }

  return {
    status,
    reason,
    limits,
    requiredApprovals: [...normalizedApprovals],
    ...(scope ? { scope } : {})
  };
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
    const governanceDescriptor = Object.getOwnPropertyDescriptor(handler, "governance");
    if (!governanceDescriptor && "governance" in handler) {
      throw new TypeError("Handler governance must be an own data property.");
    }
    if (governanceDescriptor && !("value" in governanceDescriptor)) {
      throw new TypeError("Handler governance must be a data property.");
    }
    const governance = copyRegistrationRecord(governanceDescriptor?.value || {}, "Handler governance");
    const registrationMetadata = copyRegistrationRecord(metadata, "Registration metadata");
    const governanceEffects = normalizeEffects(governance.effects, "Handler governance");
    const metadataEffects = normalizeEffects(registrationMetadata.effects, "Registration metadata");
    const governanceRisk = normalizeRisk(governance.risk, "Handler governance");
    const metadataRisk = normalizeRisk(registrationMetadata.risk, "Registration metadata");
    const effectiveRisk = effectiveRegistrationRisk(governanceRisk, metadataRisk);
    const effectiveMetadata = {
      ...governance,
      ...registrationMetadata,
      // Registration metadata may declare additional risk, but it cannot
      // erase effects that the handler itself declares.
      effects: [...new Set([...governanceEffects, ...metadataEffects])]
    };
    if (effectiveRisk) effectiveMetadata.risk = effectiveRisk;
    else delete effectiveMetadata.risk;
    this.tools.set(name, {
      name,
      handler,
      metadata: snapshotToolMetadata(effectiveMetadata)
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
    let decision;
    try {
      const rawDecision = this.policyEngine
        ? this.policyEngine.authorizeToolCall({
          goal: effectiveGoal,
          toolName,
          input,
          context,
          metadata: cloneToolMetadata(tool.metadata)
        })
        : {
          status: "allow",
          reason: "No policy engine configured.",
          limits: {},
          requiredApprovals: []
        };
      decision = normalizePolicyDecision(rawDecision);
    } catch (cause) {
      const error = new PolicyDeniedError("Policy evaluation did not return a valid authorization decision.", {
        code: cause instanceof TypeError ? "POLICY_DECISION_INVALID" : "POLICY_EVALUATION_FAILED",
        details: { toolName, reason: redactText(cause?.message || "Policy evaluation failed.") }
      });
      this.#recordTrace(traceBase, "denied", { error: safeErrorRecord(error) });
      throw error;
    }

    if (decision.status === "deny") {
      const error = new PolicyDeniedError(decision.reason, {
        details: { toolName, decision }
      });
      this.#recordTrace(traceBase, "denied", { decision, error: safeErrorRecord(error) });
      throw error;
    }

    const callCount = this.runCallCounts.get(runId) || 0;
    let maxToolCalls;
    try {
      maxToolCalls = effectiveToolCallLimit(context, decision);
    } catch (cause) {
      const error = new PolicyDeniedError("Caller supplied an invalid tool-call limit.", {
        code: "TOOL_CALL_LIMIT_INVALID",
        details: { runId, toolName, reason: cause.message }
      });
      this.#recordTrace(traceBase, "denied", { decision, error: safeErrorRecord(error) });
      throw error;
    }
    if (Number.isFinite(maxToolCalls) && callCount >= maxToolCalls) {
      const error = new PolicyDeniedError(`Run '${runId}' exceeded maxToolCalls (${maxToolCalls}).`, {
        code: "TOOL_CALL_LIMIT_EXCEEDED",
        details: { runId, toolName, maxToolCalls, callCount }
      });
      this.#recordTrace(traceBase, "denied", { decision, error: safeErrorRecord(error) });
      throw error;
    }

    let approvals = [];
    let handlerInput = input;
    if (decision.status === "needs_approval") {
      try {
        const resolved = this.#resolveApprovals({ tool, toolName, input, context, decision });
        approvals = resolved.approvals;
        handlerInput = resolved.input;
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
      const result = await tool.handler(handlerInput, {
        ...context,
        // Always pass the exact goal and origin scope that were authorized. A
        // caller-provided context must not be able to broaden either value.
        goal: effectiveGoal,
        authorizedOrigins: [...(decision.scope?.allowedOrigins || [])],
        authorizationScope: decision.scope || null,
        toolName,
        // Handlers receive a detached snapshot. Mutating it cannot weaken the
        // metadata used to authorize later calls.
        toolMetadata: cloneToolMetadata(tool.metadata),
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

  #resolveApprovals({ tool, toolName, input, context, decision }) {
    if (!this.approvalQueue) {
      throw new ApprovalRequiredError(decision.reason, {
        details: { toolName, requiredApprovals: decision.requiredApprovals, decision }
      });
    }

    const actions = decision.requiredApprovals?.length
      ? decision.requiredApprovals
      : [`tool:${toolName}`];
    const approvalIds = [context.approvalId, ...(context.approvalIds || [])].filter(Boolean);
    let approvedInput;
    let inputHash;
    try {
      const approved = snapshotHashedValue(input);
      approvedInput = approved.snapshot;
      inputHash = approved.hash;
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
          risk: highestRisk(tool?.metadata?.risk, toolName === "publish" ? "critical" : "high"),
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
        return {
          approvals: this.approvalQueue.consumeMany(consumptionRequests),
          input: approvedInput
        };
      }
      return {
        approvals: consumptionRequests.map(({ approvalId, usage }) => (
          this.approvalQueue.consume(approvalId, usage)
        )),
        input: approvedInput
      };
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
