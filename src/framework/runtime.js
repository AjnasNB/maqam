import { randomUUID } from "node:crypto";
import { MaqamError, toErrorRecord } from "./errors.js";
import { redactSensitive, redactText } from "./audit.js";

function safeErrorRecord(error) {
  const record = toErrorRecord(error);
  return {
    ...record,
    message: redactText(record.message),
    details: redactSensitive(record.details)
  };
}

function workflowError(message, code = "WORKFLOW_INVALID") {
  return new MaqamError(message, { code });
}

function shouldRetry(task, error, attempt, maxAttempts) {
  if (attempt >= maxAttempts) return false;
  const code = String(error?.code || "");
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
    return typeof error?.code === "string" && task.retryOn.includes(error.code);
  }
  // Retries are opt-in because repeating a denied or effectful task is unsafe.
  return task.retryable === true || error?.retryable === true || error?.details?.retryable === true;
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
    if (error?.code === "TASK_TIMEOUT" || error?.code === "RUN_TIMEOUT") {
      const settled = await settlesWithin(operation, cancellationGraceMs);
      error.details = {
        ...(error.details || {}),
        cancellationGraceMs,
        operationMayStillBeRunning: !settled
      };
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

export class AgentRuntime {
  constructor(options = {}) {
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
    const runId = goal.runId || `run_${randomUUID()}`;
    if (this.activeRunIds.has(runId)) {
      const now = this.clock().toISOString();
      return {
        runId,
        status: "failed",
        error: safeErrorRecord(new MaqamError(`Run id '${runId}' is already active.`, {
          code: "RUN_ID_ACTIVE",
          details: { runId }
        })),
        limits: {},
        trace: [],
        outputs: {},
        startedAt: now,
        finishedAt: now
      };
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
    const preflight = this.policyEngine?.evaluateGoal(goal) || {
      status: "allow",
      reason: "No policy engine configured.",
      limits: {}
    };

    if (preflight.status !== "allow") {
      return {
        runId,
        status: preflight.status,
        reason: preflight.reason,
        limits: preflight.limits,
        trace: [],
        outputs: {},
        startedAt,
        finishedAt: this.clock().toISOString()
      };
    }

    try {
      validateTasks(workflow.tasks || []);
    } catch (error) {
      return {
        runId,
        status: "failed",
        error: safeErrorRecord(error),
        limits: preflight.limits,
        trace: [],
        outputs: {},
        startedAt,
        finishedAt: this.clock().toISOString()
      };
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

    const context = {
      runId,
      goal,
      limits: preflight.limits || {},
      approvalId: goal.approvalId || null,
      approvalIds: goal.approvalIds || [],
      requestedBy: goal.requestedBy || "runtime",
      approvalEvidence: goal.approvalEvidence || [],
      outputs: {},
      evidence: this.evidenceLedger,
      evidenceLedger: this.evidenceLedger,
      approvals: this.approvalQueue,
      tools: this.toolGateway,
      trace: []
    };

    try {
      for (const task of workflow.tasks || []) {
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
                context.signal = signal;
                return task.run(context);
              },
              timeoutMs,
              task.id,
              runController.signal,
              this.cancellationGraceMs
            );
            context.outputs[task.id] = output;
            context.trace.push({
              taskId: task.id,
              status: "completed",
              attempt,
              startedAt: taskStartedAt,
              finishedAt: this.clock().toISOString()
            });
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            context.trace.push({
              taskId: task.id,
              status: error?.code === "APPROVAL_REQUIRED" ? "needs_approval" : "failed",
              attempt,
              startedAt: taskStartedAt,
              finishedAt: this.clock().toISOString(),
              error: safeErrorRecord(error)
            });
            if (!shouldRetry(task, error, attempt, maxAttempts) || runController.signal.aborted) break;
          }
        }

        if (lastError) {
          return {
            runId,
            status: lastError.code === "APPROVAL_REQUIRED" ? "needs_approval" : "failed",
            error: safeErrorRecord(lastError),
            limits: context.limits,
            trace: context.trace,
            outputs: context.outputs,
            startedAt,
            finishedAt: this.clock().toISOString()
          };
        }
      }

      return {
        runId,
        status: "completed",
        limits: context.limits,
        trace: context.trace,
        outputs: context.outputs,
        evidence: this.evidenceLedger?.toJSON?.() || null,
        startedAt,
        finishedAt: this.clock().toISOString()
      };
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
    }
  }
}
