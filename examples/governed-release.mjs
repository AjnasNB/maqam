import { ApprovalQueue, createReleaseGateReport } from "maqam";

const approvals = new ApprovalQueue();
const approval = approvals.requestApproval({
  action: "publish:npm",
  requestedBy: "release-bot",
  reason: "Maqam release candidate passed local verification and needs owner approval.",
  risk: "high",
  subject: {
    packageName: "maqam",
    version: "0.2.0"
  },
  evidence: [
    "npm test",
    "npm pack --dry-run"
  ]
});

const report = createReleaseGateReport({
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
    { command: "npm test", status: "pass", summary: "Run this before publishing." },
    { command: "npm pack --dry-run", status: "pass", summary: "Run this before publishing." }
  ],
  provenance: {
    inspectedProjects: [],
    copiedThirdPartyCode: false
  },
  approval
});

console.log(JSON.stringify(report, null, 2));
