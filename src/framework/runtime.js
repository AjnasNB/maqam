import { toErrorRecord } from "./errors.js";

function withTimeout(promise, timeoutMs, taskId) {
  if (!timeoutMs) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Task '${taskId}' timed out after ${timeoutMs}ms.`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class AgentRuntime {
  constructor(options = {}) {
    this.policyEngine = options.policyEngine || null;
    this.evidenceLedger = options.evidenceLedger || null;
    this.toolGateway = options.toolGateway || null;
    this.clock = options.clock || (() => new Date());
  }

  async runWorkflow(workflow, goal = {}) {
    const runId = goal.runId || `run_${this.clock().getTime()}`;
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
        trace: [],
        outputs: {}
      };
    }

    const context = {
      runId,
      goal,
      outputs: {},
      evidence: this.evidenceLedger,
      tools: this.toolGateway,
      trace: []
    };

    for (const task of workflow.tasks || []) {
      const maxAttempts = 1 + (task.retries || 0);
      let lastError = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const startedAt = this.clock().toISOString();
        try {
          const output = await withTimeout(
            Promise.resolve(task.run(context)),
            task.timeoutMs,
            task.id
          );
          context.outputs[task.id] = output;
          context.trace.push({
            taskId: task.id,
            status: "completed",
            attempt,
            startedAt,
            finishedAt: this.clock().toISOString()
          });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          context.trace.push({
            taskId: task.id,
            status: "failed",
            attempt,
            startedAt,
            finishedAt: this.clock().toISOString(),
            error: toErrorRecord(error)
          });
        }
      }

      if (lastError) {
        return {
          runId,
          status: "failed",
          error: toErrorRecord(lastError),
          trace: context.trace,
          outputs: context.outputs
        };
      }
    }

    return {
      runId,
      status: "completed",
      trace: context.trace,
      outputs: context.outputs,
      evidence: this.evidenceLedger?.toJSON?.() || null
    };
  }
}
