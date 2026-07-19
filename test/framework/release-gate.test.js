import assert from "node:assert/strict";
import { test } from "node:test";
import { ApprovalQueue } from "../../src/framework/approval-queue.js";
import { createReleaseGateReport } from "../../src/framework/release-gate.js";

const artifact = {
  packageName: "maqam",
  version: "0.3.2",
  sha256: "b".repeat(64),
  integrity: `sha512-${Buffer.alloc(64, 7).toString("base64")}`,
  gitCommit: "a".repeat(40),
  filename: "maqam-0.3.2.tgz",
  sizeBytes: 12_345
};

const requiredVerificationCommands = [
  "npm test",
  "npm run test:consumer-types",
  "npm run test:website",
  "npm audit --omit=dev",
  "npm pack --json --ignore-scripts",
  "npm run benchmark:mges:conformance",
  "npm run benchmark:mges:performance"
];

const completeInput = {
  packageName: "maqam",
  version: "0.3.2",
  license: "MIT",
  registry: "https://registry.npmjs.org/",
  publishCommand: "npm publish --access public --ignore-scripts --provenance",
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
  verification: requiredVerificationCommands.map((command) => ({
    command,
    status: "pass",
    summary: `${command} passed for the release commit`,
    gitCommit: artifact.gitCommit
  })),
  provenance: {
    inspectedProjects: [
      {
        name: "Panniantong/agent-reach",
        url: "https://github.com/Panniantong/agent-reach",
        revision: "1494c2ab239e7355a77e7cceaf3271453a1f34b5",
        license: "MIT",
        use: "reference inspection only"
      }
    ],
    copiedThirdPartyCode: false
  }
};

function requestReleaseApproval(queue, overrides = {}) {
  return queue.requestApproval({
    action: "publish:npm",
    reason: "Maqam 0.3.2 is ready for owner approval.",
    subject: {
      packageName: completeInput.packageName,
      version: completeInput.version,
      registry: completeInput.registry,
      publishCommand: completeInput.publishCommand,
      artifactSha256: artifact.sha256,
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
      artifactSha256: artifact.sha256,
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
  assert.match(report.summary, /maqam@0\.3\.2/);
});

test("unrelated actions and mismatched release subjects cannot authorize publishing", () => {
  const cases = [
    { action: "post:announcement" },
    { subject: { version: "0.2.2" } },
    { subject: { registry: "https://registry.example/" } },
    { subject: { publishCommand: "npm publish" } },
    { subject: { artifactSha256: "c".repeat(64) } },
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

test("release gate requires every promised check on the exact artifact commit", () => {
  for (const command of requiredVerificationCommands) {
    const verification = completeInput.verification.filter((check) => check.command !== command);
    const report = createReleaseGateReport({ ...completeInput, verification });
    assert.equal(report.readyToPublish, false, command);
    assert.ok(
      report.blockers.includes(`Required verification has not passed: ${command}.`),
      command
    );
  }

  const stale = structuredClone(completeInput.verification);
  stale[0].gitCommit = "c".repeat(40);
  const staleReport = createReleaseGateReport({ ...completeInput, verification: stale });
  assert.equal(staleReport.readyToPublish, false);
  assert.ok(staleReport.blockers.some((blocker) => /not bound to artifact gitCommit/i.test(blocker)));

  const failed = structuredClone(completeInput.verification);
  failed[1].status = "fail";
  const failedReport = createReleaseGateReport({ ...completeInput, verification: failed });
  assert.equal(failedReport.readyToPublish, false);
  assert.ok(failedReport.blockers.includes(
    `Verification failed: ${requiredVerificationCommands[1]}.`
  ));
});

test("createReleaseGateReport explains missing and invalid production evidence", () => {
  const report = createReleaseGateReport({
    packageName: "maqam",
    version: "0.3.2",
    license: "MIT",
    registry: "https://registry.example/",
    publishCommand: "npm publish",
    artifact: {
      packageName: "other-package",
      version: "0.3.2",
      sha256: "not-a-digest",
      integrity: "sha256:wrong-algorithm",
      gitCommit: "short",
      filename: "../bad.tgz",
      sizeBytes: -1
    },
    requiredFiles: { readme: true, license: true },
    verification: [{
      command: "npm test",
      status: "fail",
      summary: "one failing test",
      gitCommit: "different"
    }],
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
  assert.ok(report.blockers.some((blocker) => /sha256/i.test(blocker)));
  assert.ok(report.blockers.some((blocker) => /gitCommit/i.test(blocker)));
  assert.ok(report.blockers.some((blocker) => /filename/i.test(blocker)));
  assert.ok(report.blockers.some((blocker) => /sizeBytes/i.test(blocker)));
  assert.ok(report.blockers.some((blocker) => /packageName and version/i.test(blocker)));
  assert.ok(report.blockers.some((blocker) => /inspected project/i.test(blocker)));
});

test("release gate requires complete inspected-project provenance", () => {
  const cases = [
    [],
    [{
      name: "Panniantong/agent-reach",
      url: "https://github.com/Panniantong/agent-reach",
      license: "MIT",
      use: "reference inspection only"
    }],
    [{
      name: "Panniantong/agent-reach",
      url: "http://github.com/Panniantong/agent-reach",
      revision: "1494c2ab239e7355a77e7cceaf3271453a1f34b5",
      license: "MIT",
      use: "reference inspection only"
    }]
  ];

  for (const inspectedProjects of cases) {
    const report = createReleaseGateReport({
      ...completeInput,
      provenance: { inspectedProjects, copiedThirdPartyCode: false }
    });
    assert.equal(report.readyToPublish, false);
    assert.ok(report.blockers.some((blocker) => /inspected project|inspectedProjects/i.test(blocker)));
  }
});

test("release gate keeps SHA-256 separate from canonical npm SHA-512 integrity", () => {
  const sharedSha256 = `sha256:${"d".repeat(64)}`;
  const report = createReleaseGateReport({
    ...completeInput,
    artifact: {
      ...artifact,
      sha256: sharedSha256,
      integrity: sharedSha256
    }
  });

  assert.equal(report.readyToPublish, false);
  assert.ok(report.blockers.some((blocker) => /Artifact sha256/i.test(blocker)));
  assert.ok(report.blockers.some((blocker) => /canonical npm sha512/i.test(blocker)));
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
    artifactSha256: artifact.sha256,
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
  mutable.provenance.inspectedProjects[0].revision = "c".repeat(40);

  assert.equal(report.readyToPublish, true);
  assert.equal(report.artifact.filename, artifact.filename);
  assert.equal(report.verification[0].status, "pass");
  assert.equal(report.provenance.copiedThirdPartyCode, false);
  assert.equal(
    report.provenance.inspectedProjects[0].revision,
    completeInput.provenance.inspectedProjects[0].revision
  );
  assert.equal(Object.getPrototypeOf(report.artifact), null);
  assert.notEqual(Object.getPrototypeOf(report.verification), Array.prototype);
});
