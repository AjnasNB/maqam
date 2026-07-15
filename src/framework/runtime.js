import { randomUUID } from "node:crypto";
import { MaqamError } from "./errors.js";
import { redactSensitive, redactText } from "./audit.js";
import {
  SAFE_ARRAY_PROTOTYPE,
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./boundary.js";
import { createScopedEvidenceFacade } from "./evidence-scope.js";

const RUNTIME_OPTION_KEYS = new Set([
  "policyEngine", "evidenceLedger", "toolGateway", "approvalQueue", "clock",
  "cancellationGraceMs"
]);
const WORKFLOW_KEYS = new Set(["name", "tasks"]);
const TASK_KEYS = new Set(["id", "retries", "retryable", "retryOn", "timeoutMs", "run"]);
const GOAL_KEYS = new Set([
  "runId", "objective", "allowedTools", "allowedOrigins", "budget", "approvalId",
  "approvalIds", "requestedBy", "approvalEvidence"
]);
const PREFLIGHT_KEYS = new Set(["status", "reason", "limits", "requiredApprovals", "scope"]);
const POLICY_STATUSES = new Set(["allow", "deny", "needs_approval"]);
const POLICY_SCOPE_KEYS = new Set(["allowedOrigins", "originsExplicit", "originsUnrestricted"]);
const LIMIT_KEYS = new Set(["maxToolCalls", "maxRuntimeMs", "maxPages", "maxNetworkRequests"]);
const MAX_WORKFLOW_TASKS = 10_000;
const MAX_RETRIES = 10_000;

function ownDataField(value, key) {
  try {
    if ((!value || typeof value !== "object") && typeof value !== "function") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function safeErrorMessage(error, fallback = "Workflow validation failed.") {
  const message = ownDataField(error, "message");
  return typeof message === "string" && message.trim() !== "" ? message : fallback;
}

function isMaqamError(error) {
  try {
    return error instanceof MaqamError;
  } catch {
    return false;
  }
}

function errorCode(error) {
  const code = ownDataField(error, "code");
  return typeof code === "string" ? code : "";
}

function safeErrorRecord(error) {
  const name = ownDataField(error, "name");
  const message = ownDataField(error, "message");
  const details = ownDataField(error, "details");
  let safeDetails = Object.create(null);
  try {
    safeDetails = redactSensitive(details ?? Object.create(null));
  } catch {
    safeDetails = Object.assign(Object.create(null), {
      unavailable: "Error details were not safe to inspect."
    });
  }
  return Object.assign(Object.create(null), {
    name: typeof name === "string" && name ? name : "Error",
    code: errorCode(error) || "ERROR",
    message: redactText(typeof message === "string" ? message : "Task failed."),
    details: safeDetails
  });
}

function workflowError(message, code = "WORKFLOW_INVALID") {
  return new MaqamError(message, { code });
}

function safeArray(length = 0) {
  const value = new Array(length);
  Object.setPrototypeOf(value, SAFE_ARRAY_PROTOTYPE);
  return value;
}

function runResult(fields) {
  return Object.assign(Object.create(null), fields);
}

function snapshotStringArray(value, label) {
  const snapshot = snapshotOwnDataArray(value, {
    label,
    maximumLength: MAX_WORKFLOW_TASKS
  });
  for (let index = 0; index < snapshot.length; index += 1) {
    if (typeof snapshot[index] !== "string" || snapshot[index].trim() === "") {
      throw workflowError(`${label} must contain only non-empty strings.`);
    }
  }
  return Object.freeze(snapshot);
}

function snapshotGoal(goal) {
  const snapshot = snapshotOwnDataRecord(goal, {
    label: "Workflow goal",
    recognizedKeys: GOAL_KEYS,
    rejectUnknown: false
  });
  for (const key of ["runId", "objective", "approvalId", "requestedBy"]) {
    if (snapshot[key] !== undefined
      && (typeof snapshot[key] !== "string" || snapshot[key].trim() === "")) {
      throw workflowError(`Workflow goal '${key}' must be a non-empty string.`);
    }
  }
  for (const key of ["allowedTools", "allowedOrigins", "approvalIds", "approvalEvidence"]) {
    if (snapshot[key] !== undefined) {
      snapshot[key] = snapshotStringArray(snapshot[key], `Workflow goal.${key}`);
    }
  }
  if (snapshot.budget !== undefined) {
    snapshot.budget = snapshotJsonValue(snapshot.budget, {
      label: "Workflow goal.budget",
      allowNullPrototype: true,
      freeze: true
    });
  }
  try {
    return snapshotJsonValue(snapshot, {
      label: "Workflow goal",
      allowNullPrototype: true,
      freeze: true
    });
  } catch (error) {
    throw workflowError(safeErrorMessage(error));
  }
}

function snapshotTask(task, index) {
  const label = `Workflow task[${index}]`;
  const snapshot = snapshotOwnDataRecord(task, {
    label,
    recognizedKeys: TASK_KEYS
  });
  if (typeof snapshot.id !== "string" || snapshot.id.trim() === ""
    || typeof snapshot.run !== "function") {
    throw workflowError("Every workflow task requires a unique string id and run function.");
  }
  if (snapshot.retries !== undefined
    && (!Number.isInteger(snapshot.retries) || snapshot.retries < 0 || snapshot.retries > MAX_RETRIES)) {
    throw workflowError(`${label}.retries must be an integer between 0 and ${MAX_RETRIES}.`);
  }
  if (snapshot.retryable !== undefined && typeof snapshot.retryable !== "boolean") {
    throw workflowError(`${label}.retryable must be a boolean.`);
  }
  if (snapshot.timeoutMs !== undefined
    && (!Number.isFinite(snapshot.timeoutMs) || snapshot.timeoutMs <= 0)) {
    throw workflowError(`${label}.timeoutMs must be a positive finite number.`);
  }
  if (snapshot.retryOn !== undefined && typeof snapshot.retryOn !== "function") {
    snapshot.retryOn = snapshotStringArray(snapshot.retryOn, `${label}.retryOn`);
  }
  return Object.freeze(snapshot);
}

function snapshotWorkflow(workflow) {
  const snapshot = snapshotOwnDataRecord(workflow, {
    label: "Workflow",
    recognizedKeys: WORKFLOW_KEYS
  });
  if (snapshot.name !== undefined
    && (typeof snapshot.name !== "string" || snapshot.name.trim() === "")) {
    throw workflowError("Workflow name must be a non-empty string.");
  }
  const tasks = snapshot.tasks === undefined ? safeArray() : snapshotOwnDataArray(snapshot.tasks, {
    label: "Workflow tasks",
    maximumLength: MAX_WORKFLOW_TASKS
  });
  const taskSnapshots = safeArray(tasks.length);
  for (let index = 0; index < tasks.length; index += 1) {
    taskSnapshots[index] = snapshotTask(tasks[index], index);
  }
  snapshot.tasks = Object.freeze(taskSnapshots);
  return Object.freeze(snapshot);
}

function snapshotPreflight(value) {
  try {
    const snapshot = snapshotOwnDataRecord(value, {
      label: "Policy preflight decision",
      recognizedKeys: PREFLIGHT_KEYS
    });
    if (!POLICY_STATUSES.has(snapshot.status)) {
      throw new TypeError("Policy preflight status must be allow, deny, or needs_approval.");
    }
    if (typeof snapshot.reason !== "string" || snapshot.reason.trim() === "") {
      throw new TypeError("Policy preflight reason must be a non-empty string.");
    }
    const limits = snapshotOwnDataRecord(snapshot.limits, {
      label: "Policy preflight limits",
      recognizedKeys: LIMIT_KEYS,
      rejectUnknown: false
    });
    for (const [key, ceiling] of Object.entries(limits)) {
      if (!Number.isFinite(ceiling) || ceiling < 0) {
        throw new TypeError(`Policy preflight limits.${key} must be a non-negative finite number.`);
      }
      if ((key === "maxToolCalls" || key === "maxPages" || key === "maxNetworkRequests")
        && !Number.isInteger(ceiling)) {
        throw new TypeError(`Policy preflight limits.${key} must be an integer.`);
      }
    }
    snapshot.limits = limits;

    const requiredApprovals = snapshot.requiredApprovals === undefined
      ? safeArray()
      : snapshotStringArray(snapshot.requiredApprovals, "Policy preflight requiredApprovals");
    if (new Set(requiredApprovals).size !== requiredApprovals.length) {
      throw new TypeError("Policy preflight requiredApprovals cannot contain duplicates.");
    }
    if (snapshot.status === "needs_approval" && requiredApprovals.length === 0) {
      throw new TypeError("A needs_approval preflight must name at least one required approval.");
    }
    if (snapshot.status !== "needs_approval" && requiredApprovals.length !== 0) {
      throw new TypeError(`A ${snapshot.status} preflight cannot name required approvals.`);
    }
    snapshot.requiredApprovals = requiredApprovals;

    if (snapshot.scope !== undefined) {
      const scope = snapshotOwnDataRecord(snapshot.scope, {
        label: "Policy preflight scope",
        recognizedKeys: POLICY_SCOPE_KEYS
      });
      scope.allowedOrigins = snapshotStringArray(
        scope.allowedOrigins,
        "Policy preflight scope.allowedOrigins"
      );
      if (typeof scope.originsExplicit !== "boolean"
        || typeof scope.originsUnrestricted !== "boolean") {
        throw new TypeError("Policy preflight scope flags must be booleans.");
      }
      snapshot.scope = scope;
    }

    return snapshotJsonValue(snapshot, {
      label: "Policy preflight decision",
      allowNullPrototype: true,
      freeze: true
    });
  } catch (error) {
    throw workflowError(
      safeErrorMessage(error, "Policy preflight decision was invalid."),
      "POLICY_DECISION_INVALID"
    );
  }
}

function shouldRetry(task, error, attempt, maxAttempts) {
  if (attempt >= maxAttempts) return false;
  const code = errorCode(error);
  const neverRetry = new Set([
    "APPROVAL_REQUIRED",
    "APPROVAL_SCOPE_MISMATCH",
    "APPROVAL_INPUT_INVALID",
    "APPROVAL_INVALID",
    "POLICY_DENIED",
    "GOAL_SCOPE_CONFLICT",
    "TOOL_CALL_LIMIT_EXCEEDED",
    "TASK_TIMEOUT",
    "RUN_TIMEOUT",
    "RUN_ABORTED",
    "CLI_ABORTED",
    "CLI_TIMEOUT",
    "CLI_INPUT_LIMIT_EXCEEDED",
    "CLI_OUTPUT_LIMIT_EXCEEDED",
    "CLI_OUTPUT_TOKEN_LIMIT_EXCEEDED",
    "CLI_JSON_PARSE_FAILED",
    "CLI_JSONL_PARSE_FAILED",
    "CLI_EXIT_NONZERO",
    "CLI_SPAWN_FAILED",
    "CRAWLER_URL_BLOCKED",
    "CRAWL_REQUEST_LIMIT",
    "CRAWL_DURATION_LIMIT",
    "CRAWL_ABORTED"
  ]);
  if (neverRetry.has(code)
    || code.startsWith("AGENT_")
    || code.startsWith("APPROVAL_")
    || code.startsWith("CLI_")
    || code.startsWith("POLICY_")) return false;
  if (typeof task.retryOn === "function") {
    return task.retryOn(error, attempt) === true;
  }
  if (Array.isArray(task.retryOn)) {
    return code !== "" && task.retryOn.includes(code);
  }
  // Retries are opt-in because repeating a denied or effectful task is unsafe.
  const details = ownDataField(error, "details");
  return task.retryable === true
    || ownDataField(error, "retryable") === true
    || ownDataField(details, "retryable") === true;
}

function validateTasks(tasks = []) {
  const ids = new Set();
  for (const task of tasks) {
    if (!task?.id || typeof task.id !== "string" || typeof task.run !== "function") {
      throw workflowError("Every workflow task requires a unique string id and run function.");
    }
    if (ids.has(task.id)) throw workflowError(`Workflow task id '${task.id}' is duplicated.`);
    ids.add(task.id);
  }
}

function settlesWithin(operation, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    operation.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(true);
      }
    );
  });
}

async function runWithTimeout(run, timeoutMs, taskId, parentSignal, cancellationGraceMs) {
  const controller = new AbortController();
  const signals = parentSignal ? [parentSignal, controller.signal] : [controller.signal];
  const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);
  let timer = null;
  let onAbort = null;

  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new MaqamError(`Task '${taskId}' timed out after ${timeoutMs}ms.`, {
          code: "TASK_TIMEOUT",
          details: { taskId, timeoutMs }
        });
        controller.abort(error);
        reject(error);
      }, timeoutMs);
    })
    : null;

  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason || new MaqamError(`Task '${taskId}' was aborted.`, {
      code: "RUN_ABORTED",
      details: { taskId }
    }));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });

  const operation = Promise.resolve().then(() => run(signal));
  try {
    return await Promise.race([operation, aborted, ...(timeout ? [timeout] : [])]);
  } catch (error) {
    const code = errorCode(error);
    if (code === "TASK_TIMEOUT" || code === "RUN_TIMEOUT") {
      const settled = await settlesWithin(operation, cancellationGraceMs);
      const descriptor = Object.getOwnPropertyDescriptor(error, "details");
      if (descriptor && Object.hasOwn(descriptor, "value") && descriptor.writable) {
        let details = Object.create(null);
        try {
          details = snapshotJsonValue(descriptor.value ?? Object.create(null), {
            label: "Timeout error details",
            allowNullPrototype: true
          });
        } catch {
          // Do not inspect accessor-backed or otherwise unsafe task errors.
        }
        error.details = {
          ...details,
          cancellationGraceMs,
          operationMayStillBeRunning: !settled
        };
      }
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

export class AgentRuntime {
  constructor(options = {}) {
    options = snapshotOwnDataRecord(options, {
      label: "AgentRuntime options",
      recognizedKeys: RUNTIME_OPTION_KEYS
    });
    if (options.clock !== undefined && typeof options.clock !== "function") {
      throw new TypeError("AgentRuntime clock must be a function.");
    }
    if (options.cancellationGraceMs !== undefined
      && (!Number.isFinite(options.cancellationGraceMs) || options.cancellationGraceMs < 0)) {
      throw new TypeError("AgentRuntime cancellationGraceMs must be a non-negative finite number.");
    }
    this.policyEngine = options.policyEngine || null;
    this.evidenceLedger = options.evidenceLedger || null;
    this.toolGateway = options.toolGateway || null;
    this.approvalQueue = options.approvalQueue || null;
    this.clock = options.clock || (() => new Date());
    this.cancellationGraceMs = Number.isFinite(options.cancellationGraceMs)
      ? Math.max(0, options.cancellationGraceMs)
      : 1_000;
    this.activeRunIds = new Set();
  }

  async runWorkflow(workflow, goal = {}) {
    let safeGoal;
    let safeWorkflow;
    try {
      safeGoal = snapshotGoal(goal);
      safeWorkflow = snapshotWorkflow(workflow);
      validateTasks(safeWorkflow.tasks);
    } catch (error) {
      const runId = `run_${randomUUID()}`;
      const now = this.clock().toISOString();
      const invalid = isMaqamError(error)
        ? error
        : workflowError(safeErrorMessage(error));
      return runResult({
        runId,
        status: "failed",
        error: safeErrorRecord(invalid),
        limits: Object.create(null),
        trace: safeArray(),
        outputs: Object.create(null),
        startedAt: now,
        finishedAt: now
      });
    }

    goal = safeGoal;
    workflow = safeWorkflow;
    const runId = goal.runId || `run_${randomUUID()}`;
    if (this.activeRunIds.has(runId)) {
      const now = this.clock().toISOString();
      return runResult({
        runId,
        status: "failed",
        error: safeErrorRecord(new MaqamError(`Run id '${runId}' is already active.`, {
          code: "RUN_ID_ACTIVE",
          details: { runId }
        })),
        limits: Object.create(null),
        trace: safeArray(),
        outputs: Object.create(null),
        startedAt: now,
        finishedAt: now
      });
    }

    this.activeRunIds.add(runId);
    try {
      return await this.#executeWorkflow(workflow, goal, runId);
    } finally {
      this.activeRunIds.delete(runId);
    }
  }

  async #executeWorkflow(workflow, goal, runId) {
    const startedAt = this.clock().toISOString();
    let preflight;
    try {
      preflight = snapshotPreflight(this.policyEngine?.evaluateGoal(goal) || {
        status: "allow",
        reason: "No policy engine configured.",
        limits: {}
      });
    } catch (error) {
      const invalid = isMaqamError(error)
        ? error
        : workflowError(
          safeErrorMessage(error, "Policy preflight decision was invalid."),
          "POLICY_DECISION_INVALID"
        );
      return runResult({
        runId,
        status: "failed",
        error: safeErrorRecord(invalid),
        limits: Object.create(null),
        trace: safeArray(),
        outputs: Object.create(null),
        startedAt,
        finishedAt: this.clock().toISOString()
      });
    }

    if (preflight.status !== "allow") {
      return runResult({
        runId,
        status: preflight.status,
        reason: preflight.reason,
        limits: preflight.limits,
        trace: safeArray(),
        outputs: Object.create(null),
        startedAt,
        finishedAt: this.clock().toISOString()
      });
    }

    this.toolGateway?.resetRun?.(runId);
    const runController = new AbortController();
    const maxRuntimeMs = preflight.limits?.maxRuntimeMs;
    const deadlineAt = Number.isFinite(maxRuntimeMs) ? Date.now() + maxRuntimeMs : null;
    const deadlineTimer = Number.isFinite(maxRuntimeMs)
      ? setTimeout(() => runController.abort(new MaqamError(
        `Run '${runId}' timed out after ${maxRuntimeMs}ms.`,
        { code: "RUN_TIMEOUT", details: { runId, maxRuntimeMs } }
      )), maxRuntimeMs)
      : null;

    const context = Object.assign(Object.create(null), {
      runId,
      goal,
      limits: preflight.limits || {},
      approvalId: goal.approvalId || null,
      approvalIds: goal.approvalIds || safeArray(),
      requestedBy: goal.requestedBy || "runtime",
      approvalEvidence: goal.approvalEvidence || safeArray(),
      outputs: Object.create(null),
      trace: safeArray()
    });

    try {
      for (const task of workflow.tasks || []) {
        const scopedEvidence = createScopedEvidenceFacade(this.evidenceLedger, {
          runId,
          taskId: task.id,
          toolName: null
        });
        let taskContext;
        let scopedTools = null;
        if (this.toolGateway) {
          scopedTools = Object.freeze(Object.assign(Object.create(null), {
            call: (toolName, input = {}) => this.toolGateway.call(toolName, input, Object.assign(
              Object.create(null),
              {
                runId,
                taskId: task.id,
                goal,
                limits: context.limits,
                signal: taskContext.signal,
                approvalId: goal.approvalId || null,
                approvalIds: goal.approvalIds || safeArray(),
                requestedBy: goal.requestedBy || "runtime",
                approvalEvidence: goal.approvalEvidence || safeArray(),
                tools: scopedTools
              }
            ))
          }));
        }
        taskContext = Object.assign(Object.create(null), {
          runId,
          taskId: task.id,
          goal,
          limits: context.limits,
          approvalId: goal.approvalId || null,
          approvalIds: goal.approvalIds || safeArray(),
          requestedBy: goal.requestedBy || "runtime",
          approvalEvidence: goal.approvalEvidence || safeArray(),
          outputs: context.outputs,
          evidence: scopedEvidence,
          evidenceLedger: scopedEvidence,
          tools: scopedTools
        });
        const maxAttempts = 1 + Math.max(0, task.retries || 0);
        let lastError = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const taskStartedAt = this.clock().toISOString();
          try {
            const remainingMs = deadlineAt === null ? null : Math.max(1, deadlineAt - Date.now());
            // Let the run controller own the tenant deadline so it is reported
            // as RUN_TIMEOUT. A task timer is only installed when it is the
            // earlier, task-specific boundary.
            const timeoutMs = Number.isFinite(task.timeoutMs)
              && (remainingMs === null || task.timeoutMs < remainingMs)
              ? task.timeoutMs
              : null;
            const output = await runWithTimeout(
              (signal) => {
                taskContext.signal = signal;
                return task.run(taskContext);
              },
              timeoutMs,
              task.id,
              runController.signal,
              this.cancellationGraceMs
            );
            context.outputs[task.id] = output;
            context.trace.push(runResult({
              taskId: task.id,
              status: "completed",
              attempt,
              startedAt: taskStartedAt,
              finishedAt: this.clock().toISOString()
            }));
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            context.trace.push(runResult({
              taskId: task.id,
              status: errorCode(error) === "APPROVAL_REQUIRED" ? "needs_approval" : "failed",
              attempt,
              startedAt: taskStartedAt,
              finishedAt: this.clock().toISOString(),
              error: safeErrorRecord(error)
            }));
            if (!shouldRetry(task, error, attempt, maxAttempts) || runController.signal.aborted) break;
          }
        }

        if (lastError) {
          return runResult({
            runId,
            status: errorCode(lastError) === "APPROVAL_REQUIRED" ? "needs_approval" : "failed",
            error: safeErrorRecord(lastError),
            limits: context.limits,
            trace: context.trace,
            outputs: context.outputs,
            startedAt,
            finishedAt: this.clock().toISOString()
          });
        }
      }

      return runResult({
        runId,
        status: "completed",
        limits: context.limits,
        trace: context.trace,
        outputs: context.outputs,
        evidence: createScopedEvidenceFacade(this.evidenceLedger, {
          runId,
          taskId: null,
          toolName: null
        })?.toJSON() || null,
        startedAt,
        finishedAt: this.clock().toISOString()
      });
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
    }
  }
}
