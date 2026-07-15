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

test("ApprovalQueue rejects malformed or semantically impossible restored state", () => {
  const queue = new ApprovalQueue({ clock: fixedClock });
  queue.requestApproval({ action: "publish:npm", reason: "Release package." });
  const pending = queue.toJSON();

  assert.throws(() => ApprovalQueue.fromJSON([]), /plain object/);
  assert.throws(() => ApprovalQueue.fromJSON({ approvals: {}, nextId: 1 }), /must be an array/);
  assert.throws(() => ApprovalQueue.fromJSON({ ...pending, nextId: "2" }), /nextId/);
  assert.throws(() => ApprovalQueue.fromJSON({ ...pending, nextId: 1 }), /at least 2/);
  assert.throws(
    () => ApprovalQueue.fromJSON({ ...pending, nextId: Number.MAX_SAFE_INTEGER }),
    /nextId/
  );
  assert.throws(() => ApprovalQueue.fromJSON({ ...pending, unexpected: true }), /unknown fields/);
  assert.throws(() => ApprovalQueue.fromJSON({
    approvals: [structuredClone(pending.approvals[0]), structuredClone(pending.approvals[0])],
    nextId: 2
  }), /Duplicate approval id/);

  const unknownStatus = structuredClone(pending);
  unknownStatus.approvals[0].status = "allowed";
  assert.throws(() => ApprovalQueue.fromJSON(unknownStatus), /status/);

  const unsafeId = structuredClone(pending);
  unsafeId.approvals[0].approvalId = `approval_${Number.MAX_SAFE_INTEGER}`;
  unsafeId.nextId = Number.MAX_SAFE_INTEGER;
  assert.throws(() => ApprovalQueue.fromJSON(unsafeId), /safe sequence range/);

  const forgedShape = structuredClone(pending);
  forgedShape.approvals[0].status = "approved";
  assert.throws(() => ApprovalQueue.fromJSON(forgedShape), /decision/);

  const consumedPending = structuredClone(pending);
  consumedPending.approvals[0].consumptions.push({
    consumedAt: "2026-07-05T02:00:00.000Z",
    consumedBy: "attacker",
    runId: "release_1",
    toolName: "publisher"
  });
  assert.throws(() => ApprovalQueue.fromJSON(consumedPending), /cannot be consumed while pending/);

  const approvedQueue = new ApprovalQueue({ clock: fixedClock });
  const request = approvedQueue.requestApproval({ action: "publish:npm" });
  approvedQueue.approve(request.approvalId, { decidedBy: "owner" });
  assert.equal(
    ApprovalQueue.fromJSON(approvedQueue.toJSON(), { clock: fixedClock }).get(request.approvalId).status,
    "approved"
  );
});

test("ApprovalQueue clone boundaries reject accessors, cycles, and malformed risk values", () => {
  const queue = new ApprovalQueue({ clock: fixedClock });
  let getterCalls = 0;
  const accessorSubject = {};
  Object.defineProperty(accessorSubject, "packageName", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "maqam";
    }
  });
  assert.throws(
    () => queue.requestApproval({ action: "publish:npm", subject: accessorSubject }),
    /data property/
  );
  assert.equal(getterCalls, 0);

  const cycle = {};
  cycle.self = cycle;
  assert.throws(
    () => queue.requestApproval({ action: "publish:npm", subject: cycle }),
    /cycle or repeated reference/
  );
  assert.equal(
    queue.requestApproval({ action: "publish:npm", risk: "organization-specific" }).risk,
    "organization-specific"
  );
  assert.throws(() => queue.requestApproval({ action: "publish:npm", risk: "" }), /non-empty string/);
  assert.throws(() => queue.requestApproval({ action: "publish:npm", risk: 4 }), /non-empty string/);

  const accessorSerialized = {};
  Object.defineProperty(accessorSerialized, "approvals", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return [];
    }
  });
  assert.throws(() => ApprovalQueue.fromJSON(accessorSerialized), /data property/);
  assert.equal(getterCalls, 0);
});

test("ApprovalQueue clones mutable subjects and evidence at every boundary", () => {
  const queue = new ApprovalQueue({ clock: fixedClock });
  const subject = { release: { packageName: "maqam", version: "0.2.0" } };
  const evidence = ["npm test: pass"];
  const requested = queue.requestApproval({ action: "publish:npm", subject, evidence });

  subject.release.version = "9.9.9";
  evidence[0] = "npm test: fail";
  requested.subject.release.version = "8.8.8";
  requested.evidence[0] = "npm test: fail";

  const stored = queue.get(requested.approvalId);
  assert.equal(stored.subject.release.version, "0.2.0");
  assert.equal(stored.evidence[0], "npm test: pass");
});

test("consumeMany is atomic when any approval is invalid", () => {
  const queue = new ApprovalQueue({ clock: fixedClock });
  const first = queue.requestApproval({ action: "tool:publisher" });
  const second = queue.requestApproval({ action: "effect:publish" });
  queue.approve(first.approvalId);
  queue.approve(second.approvalId);
  queue.consume(second.approvalId);

  assert.throws(() => queue.consumeMany([
    { approvalId: first.approvalId, usage: { runId: "release_1" } },
    { approvalId: second.approvalId, usage: { runId: "release_1" } }
  ]), /already been consumed/);

  assert.deepEqual(queue.get(first.approvalId).consumptions, []);
  assert.equal(queue.get(second.approvalId).consumptions.length, 1);
});
