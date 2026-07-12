function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isoNow(clock) {
  return clock().toISOString();
}

function nextIdFromApprovals(approvals) {
  const highest = approvals.reduce((max, approval) => {
    const match = /^approval_(\d+)$/.exec(approval.approvalId || "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return highest + 1;
}

function sameSubject(left = {}, right = {}) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class ApprovalQueue {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.approvals = options.approvals ? clone(options.approvals) : [];
    this.nextId = options.nextId || nextIdFromApprovals(this.approvals);
  }

  requestApproval(input = {}) {
    const approval = {
      approvalId: `approval_${this.nextId}`,
      status: "pending",
      action: input.action || "unknown",
      requestedBy: input.requestedBy || "system",
      reason: input.reason || "Approval requested.",
      risk: input.risk || "medium",
      subject: input.subject || {},
      evidence: input.evidence || [],
      reusable: input.reusable === true,
      consumptions: [],
      requestedAt: isoNow(this.clock)
    };

    this.nextId += 1;
    this.approvals.push(approval);
    return clone(approval);
  }

  get(approvalId) {
    const approval = this.approvals.find((item) => item.approvalId === approvalId);
    return approval ? clone(approval) : null;
  }

  pending() {
    return this.approvals
      .filter((approval) => approval.status === "pending")
      .map((approval) => clone(approval));
  }

  findMatching({ action, status = "pending", subject = {} } = {}) {
    const approval = this.approvals.find((item) => (
      item.action === action
      && item.status === status
      && sameSubject(item.subject, subject)
    ));
    return approval ? clone(approval) : null;
  }

  approve(approvalId, decision = {}) {
    return this.#decide(approvalId, "approved", decision);
  }

  reject(approvalId, decision = {}) {
    return this.#decide(approvalId, "rejected", decision);
  }

  consume(approvalId, usage = {}) {
    const index = this.approvals.findIndex((approval) => approval.approvalId === approvalId);
    if (index === -1) throw new Error(`Approval '${approvalId}' was not found.`);

    const current = this.approvals[index];
    if (current.status !== "approved") {
      throw new Error(`Approval '${approvalId}' is ${current.status}, not approved.`);
    }

    const consumptions = current.consumptions || [];
    if (!current.reusable && consumptions.length) {
      throw new Error(`Approval '${approvalId}' has already been consumed.`);
    }

    const updated = {
      ...current,
      consumptions: [
        ...consumptions,
        {
          consumedAt: isoNow(this.clock),
          consumedBy: usage.consumedBy || "tool-gateway",
          runId: usage.runId || null,
          toolName: usage.toolName || null
        }
      ]
    };
    this.approvals[index] = updated;
    return clone(updated);
  }

  #decide(approvalId, status, decision) {
    const index = this.approvals.findIndex((approval) => approval.approvalId === approvalId);
    if (index === -1) {
      throw new Error(`Approval '${approvalId}' was not found.`);
    }

    const current = this.approvals[index];
    if (current.status !== "pending") {
      throw new Error(`Approval '${approvalId}' is already ${current.status}.`);
    }

    const updated = {
      ...current,
      status,
      decision: {
        decidedBy: decision.decidedBy || "system",
        note: decision.note || "",
        decidedAt: isoNow(this.clock)
      }
    };

    this.approvals[index] = updated;
    return clone(updated);
  }

  toJSON() {
    return {
      approvals: clone(this.approvals),
      nextId: this.nextId
    };
  }

  static fromJSON(data = {}, options = {}) {
    return new ApprovalQueue({
      ...options,
      approvals: data.approvals || [],
      nextId: data.nextId || nextIdFromApprovals(data.approvals || [])
    });
  }
}
