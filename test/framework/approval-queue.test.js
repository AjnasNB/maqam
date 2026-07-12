import assert from "node:assert/strict";
import { test } from "node:test";
import { ApprovalQueue } from "../../src/framework/approval-queue.js";

const fixedClock = () => new Date("2026-07-05T02:00:00.000Z");

test("ApprovalQueue creates deterministic pending approval requests", () => {
  const queue = new ApprovalQueue({ clock: fixedClock });

  const request = queue.requestApproval({
    action: "publish:npm",
    requestedBy: "release-bot",
    reason: "Maqam 0.2.0 release candidate is ready.",
    risk: "high",
    subject: {
      packageName: "maqam",
      version: "0.2.0"
    },
    evidence: ["npm test: all pass", "npm pack --dry-run: exit 0"]
  });

  assert.equal(request.approvalId, "approval_1");
  assert.equal(request.status, "pending");
  assert.equal(request.action, "publish:npm");
  assert.equal(request.risk, "high");
  assert.equal(request.requestedAt, "2026-07-05T02:00:00.000Z");
  assert.deepEqual(queue.pending().map((item) => item.approvalId), ["approval_1"]);
});

test("ApprovalQueue approves and rejects requests with immutable decision records", () => {
  const queue = new ApprovalQueue({ clock: fixedClock });
  const first = queue.requestApproval({ action: "publish:npm", reason: "Release package." });
  const second = queue.requestApproval({ action: "post:announcement", reason: "Announce release." });

  const approved = queue.approve(first.approvalId, {
    decidedBy: "owner",
    note: "Approved npm release only."
  });
  const rejected = queue.reject(second.approvalId, {
    decidedBy: "owner",
    note: "Announcement can wait."
  });

  assert.equal(approved.status, "approved");
  assert.equal(approved.decision.decidedBy, "owner");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.decision.note, "Announcement can wait.");
  assert.deepEqual(queue.pending(), []);
  assert.throws(
    () => queue.approve(first.approvalId, { decidedBy: "owner" }),
    /already approved/
  );
});

test("ApprovalQueue restores serialized queues for resumed product loops", () => {
  const queue = new ApprovalQueue({ clock: fixedClock });
  queue.requestApproval({ action: "publish:npm", reason: "Release package." });

  const restored = ApprovalQueue.fromJSON(queue.toJSON(), { clock: fixedClock });
  const request = restored.get("approval_1");

  assert.equal(request.status, "pending");
  assert.equal(restored.pending().length, 1);
  assert.equal(restored.toJSON().approvals[0].approvalId, "approval_1");
});
