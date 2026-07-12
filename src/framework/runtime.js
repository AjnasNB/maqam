import { MaqamError, toErrorRecord } from "./errors.js";

function workflowError(message, code = "WORKFLOW_INVALID") {
  return new MaqamError(message, { code });
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

async function runWithTimeout(run, timeoutMs, taskId, parentSignal) {
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

  try {
    const operation = Promise.resolve().then(() => run(signal));
    return await Promise.race([operation, aborted, ...(timeout ? [timeout] : [])]);
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
  }

  async runWorkflow(workflow, goal = {}) {
    const runId = goal.runId || `run_${this.clock().getTime()}`;
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
        error: toErrorRecord(error),
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
            const timeoutMs = Number.isFinite(task.timeoutMs)
              ? (remainingMs === null ? task.timeoutMs : Math.min(task.timeoutMs, remainingMs))
              : remainingMs;
            const output = await runWithTimeout(
              (signal) => {
                context.signal = signal;
                return task.run(context);
              },
              timeoutMs,
              task.id,
              runController.signal
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
              error: toErrorRecord(error)
            });
            if (error?.code === "APPROVAL_REQUIRED" || runController.signal.aborted) break;
          }
        }

        if (lastError) {
          return {
            runId,
            status: lastError.code === "APPROVAL_REQUIRED" ? "needs_approval" : "failed",
            error: toErrorRecord(lastError),
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
