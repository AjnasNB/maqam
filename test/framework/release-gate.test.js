import assert from "node:assert/strict";
import { test } from "node:test";
import { ApprovalQueue } from "../../src/framework/approval-queue.js";
import { createReleaseGateReport } from "../../src/framework/release-gate.js";

const completeInput = {
  packageName: "maqam",
  version: "0.2.0",
  license: "MIT",
  publishCommand: "npm publish --access public",
  requiredFiles: {
    readme: true,
    license: true,
    changelog: true,
    security: true,
    releaseChecklist: true,
    licenseAudit: true,
    types: true,
    examples: true
  },
  verification: [
    { command: "npm test", status: "pass", summary: "all tests passed" },
    { command: "npm pack --dry-run", status: "pass", summary: "package preview succeeded" }
  ],
  provenance: {
    inspectedProjects: [
      { name: "Qwen-Agent", url: "https://github.com/QwenLM/Qwen-Agent", license: "Apache-2.0", use: "inspiration" },
      { name: "PageAgent", url: "https://github.com/alibaba/page-agent", license: "Apache-2.0", use: "inspiration" }
    ],
    copiedThirdPartyCode: false
  }
};

test("createReleaseGateReport blocks release candidates without approval", () => {
  const queue = new ApprovalQueue({ clock: () => new Date("2026-07-05T02:00:00.000Z") });
  const approval = queue.requestApproval({
    action: "publish:npm",
    reason: "Maqam 0.2.0 is ready for owner approval."
  });

  const report = createReleaseGateReport({
    ...completeInput,
    approval
  });

  assert.equal(report.status, "waiting_for_approval");
  assert.equal(report.readyToPublish, false);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.blockers, ["Approval approval_1 is pending for publish:npm."]);
});

test("createReleaseGateReport marks approved complete releases as publish-ready", () => {
  const queue = new ApprovalQueue({ clock: () => new Date("2026-07-05T02:00:00.000Z") });
  const approval = queue.requestApproval({ action: "publish:npm", reason: "Release package." });
  const approved = queue.approve(approval.approvalId, { decidedBy: "owner", note: "Ship it." });

  const report = createReleaseGateReport({
    ...completeInput,
    approval: approved
  });

  assert.equal(report.status, "approved");
  assert.equal(report.readyToPublish, true);
  assert.deepEqual(report.blockers, []);
  assert.match(report.summary, /maqam@0\.2\.0/);
});

test("createReleaseGateReport explains missing production evidence", () => {
  const report = createReleaseGateReport({
    packageName: "maqam",
    version: "0.2.0",
    license: "MIT",
    publishCommand: "",
    requiredFiles: {
      readme: true,
      license: true
    },
    verification: [
      { command: "npm test", status: "fail", summary: "one failing test" }
    ],
    provenance: {
      inspectedProjects: [],
      copiedThirdPartyCode: true
    }
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.readyToPublish, false);
  assert.ok(report.missing.includes("requiredFiles.changelog"));
  assert.ok(report.missing.includes("publishCommand"));
  assert.ok(report.blockers.includes("Verification failed: npm test."));
  assert.ok(report.blockers.includes("Provenance policy failed: copiedThirdPartyCode must be false."));
});
