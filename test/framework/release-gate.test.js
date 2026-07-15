import assert from "node:assert/strict";
import { test } from "node:test";
import { ApprovalQueue } from "../../src/framework/approval-queue.js";
import { createReleaseGateReport } from "../../src/framework/release-gate.js";

const artifact = {
  integrity: `sha512-${Buffer.alloc(64, 7).toString("base64")}`,
  gitCommit: "a".repeat(40),
  filename: "maqam-0.2.0.tgz",
  sizeBytes: 12_345
};

const completeInput = {
  packageName: "maqam",
  version: "0.2.0",
  license: "MIT",
  registry: "https://registry.npmjs.org/",
  publishCommand: "npm publish --access public",
  artifact,
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
      { name: "Crawl4AI", url: "https://github.com/unclecode/crawl4ai", license: "Apache-2.0 plus attribution term", use: "reference inspection" },
      { name: "Firecrawl", url: "https://github.com/firecrawl/firecrawl", license: "AGPL-3.0 core", use: "reference inspection" }
    ],
    copiedThirdPartyCode: false
  }
};

function requestReleaseApproval(queue, overrides = {}) {
  return queue.requestApproval({
    action: "publish:npm",
    reason: "Maqam 0.2.0 is ready for owner approval.",
    subject: {
      packageName: completeInput.packageName,
      version: completeInput.version,
      registry: completeInput.registry,
      publishCommand: completeInput.publishCommand,
      artifactIntegrity: artifact.integrity,
      artifactFilename: artifact.filename,
      artifactSizeBytes: artifact.sizeBytes,
      gitCommit: artifact.gitCommit,
      ...overrides.subject
    },
    ...overrides,
    subject: {
      packageName: completeInput.packageName,
      version: completeInput.version,
      registry: completeInput.registry,
      publishCommand: completeInput.publishCommand,
      artifactIntegrity: artifact.integrity,
      artifactFilename: artifact.filename,
      artifactSizeBytes: artifact.sizeBytes,
      gitCommit: artifact.gitCommit,
      ...(overrides.subject || {})
    }
  });
}

test("createReleaseGateReport waits only on an exact pending approval", () => {
  const queue = new ApprovalQueue({ clock: () => new Date("2026-07-05T02:00:00.000Z") });
  const approval = requestReleaseApproval(queue);
  const report = createReleaseGateReport({ ...completeInput, approval });

  assert.equal(report.status, "waiting_for_approval");
  assert.equal(report.readyToPublish, false);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.blockers, ["Approval approval_1 is pending for publish:npm."]);
});

test("createReleaseGateReport marks an exact approved complete release publish-ready", () => {
  const queue = new ApprovalQueue({ clock: () => new Date("2026-07-05T02:00:00.000Z") });
  const approval = requestReleaseApproval(queue);
  const approved = queue.approve(approval.approvalId, { decidedBy: "owner", note: "Ship it." });
  const report = createReleaseGateReport({ ...completeInput, approval: approved });

  assert.equal(report.status, "approved");
  assert.equal(report.readyToPublish, true);
  assert.deepEqual(report.blockers, []);
  assert.match(report.summary, /maqam@0\.2\.0/);
});

test("unrelated actions and mismatched release subjects cannot authorize publishing", () => {
  const cases = [
    { action: "post:announcement" },
    { subject: { version: "0.2.2" } },
    { subject: { registry: "https://registry.example/" } },
    { subject: { publishCommand: "npm publish" } },
    { subject: { artifactIntegrity: "sha512-different" } },
    { subject: { artifactFilename: "other.tgz" } },
    { subject: { artifactSizeBytes: 12_346 } },
    { subject: { gitCommit: "b".repeat(40) } }
  ];

  for (const overrides of cases) {
    const queue = new ApprovalQueue();
    const request = requestReleaseApproval(queue, overrides);
    const approved = queue.approve(request.approvalId, { decidedBy: "owner" });
    const report = createReleaseGateReport({ ...completeInput, approval: approved });
    assert.equal(report.readyToPublish, false, JSON.stringify(overrides));
    assert.equal(report.status, "blocked", JSON.stringify(overrides));
  }
});

test("release gate requires both exact checks and rejects failed or empty verification", () => {
  for (const verification of [
    [],
    [{ command: "npm test", status: "pass" }],
    [
      { command: "npm test", status: "pass" },
      { command: "npm pack --dry-run", status: "fail" }
    ]
  ]) {
    const report = createReleaseGateReport({ ...completeInput, verification });
    assert.equal(report.readyToPublish, false);
    assert.ok(report.blockers.some((blocker) => /verification|approval/i.test(blocker)));
  }
});

test("createReleaseGateReport explains missing and invalid production evidence", () => {
  const report = createReleaseGateReport({
    packageName: "maqam",
    version: "0.2.0",
    license: "MIT",
    registry: "https://registry.example/",
    publishCommand: "npm publish",
    artifact: { integrity: "not-a-digest", gitCommit: "short", filename: "../bad.tgz", sizeBytes: -1 },
    requiredFiles: { readme: true, license: true },
    verification: [{ command: "npm test", status: "fail", summary: "one failing test" }],
    provenance: { inspectedProjects: [], copiedThirdPartyCode: true }
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.readyToPublish, false);
  assert.ok(report.missing.includes("requiredFiles.changelog"));
  assert.ok(report.blockers.includes("Verification failed: npm test."));
  assert.ok(report.blockers.includes("Provenance policy requires copiedThirdPartyCode to be explicitly false."));
  assert.ok(report.blockers.some((blocker) => /Registry must/i.test(blocker)));
  assert.ok(report.blockers.some((blocker) => /Publish command/i.test(blocker)));
  assert.ok(report.blockers.some((blocker) => /integrity/i.test(blocker)));
  assert.ok(report.blockers.some((blocker) => /gitCommit/i.test(blocker)));
  assert.ok(report.blockers.some((blocker) => /filename/i.test(blocker)));
  assert.ok(report.blockers.some((blocker) => /sizeBytes/i.test(blocker)));
});

test("release gate rejects inherited authority and snapshots release evidence before evaluation", () => {
  const queue = new ApprovalQueue({ clock: () => new Date("2026-07-05T02:00:00.000Z") });
  const request = requestReleaseApproval(queue);
  const approved = queue.approve(request.approvalId, { decidedBy: "owner" });

  const previousApproval = Object.getOwnPropertyDescriptor(Object.prototype, "approval");
  try {
    Object.defineProperty(Object.prototype, "approval", {
      value: approved,
      configurable: true
    });
    assert.throws(
      () => createReleaseGateReport({ ...completeInput }),
      /Inherited Release gate input field 'approval'/
    );
  } finally {
    if (previousApproval) Object.defineProperty(Object.prototype, "approval", previousApproval);
    else delete Object.prototype.approval;
  }

  const inheritedSubject = { ...approved.subject };
  delete inheritedSubject.packageName;
  const previousPackageName = Object.getOwnPropertyDescriptor(Object.prototype, "packageName");
  try {
    Object.defineProperty(Object.prototype, "packageName", {
      value: completeInput.packageName,
      configurable: true
    });
    assert.throws(
      () => createReleaseGateReport({
        ...completeInput,
        approval: { ...approved, subject: inheritedSubject }
      }),
      /Inherited Release approval subject field 'packageName'/
    );
  } finally {
    if (previousPackageName) Object.defineProperty(Object.prototype, "packageName", previousPackageName);
    else delete Object.prototype.packageName;
  }

  const subjectFields = {
    packageName: completeInput.packageName,
    version: completeInput.version,
    registry: completeInput.registry,
    publishCommand: completeInput.publishCommand,
    artifactIntegrity: artifact.integrity,
    artifactFilename: artifact.filename,
    artifactSizeBytes: artifact.sizeBytes,
    gitCommit: artifact.gitCommit
  };
  const previousSubjectFields = new Map(
    Object.keys(subjectFields).map((key) => [key, Object.getOwnPropertyDescriptor(Object.prototype, key)])
  );
  try {
    for (const [key, value] of Object.entries(subjectFields)) {
      Object.defineProperty(Object.prototype, key, { value, configurable: true });
    }
    const subjectlessApproval = { ...approved };
    delete subjectlessApproval.subject;
    assert.equal(createReleaseGateReport({
      ...completeInput,
      approval: subjectlessApproval
    }).readyToPublish, false);
  } finally {
    for (const [key, descriptor] of previousSubjectFields) {
      if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
      else delete Object.prototype[key];
    }
  }

  const mutable = structuredClone(completeInput);
  const report = createReleaseGateReport({ ...mutable, approval: approved });
  mutable.artifact.filename = "changed.tgz";
  mutable.verification[0].status = "fail";
  mutable.provenance.copiedThirdPartyCode = true;

  assert.equal(report.readyToPublish, true);
  assert.equal(report.artifact.filename, artifact.filename);
  assert.equal(report.verification[0].status, "pass");
  assert.equal(report.provenance.copiedThirdPartyCode, false);
  assert.equal(Object.getPrototypeOf(report.artifact), null);
  assert.notEqual(Object.getPrototypeOf(report.verification), Array.prototype);
});
