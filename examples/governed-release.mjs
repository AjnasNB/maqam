import { ApprovalQueue, createReleaseGateReport } from "maqam";

const [filename, rawSizeBytes, integrity, gitCommit] = process.argv.slice(2);
if (!filename || !rawSizeBytes || !integrity || !gitCommit) {
  throw new Error(
    "Usage: node examples/governed-release.mjs <artifact.tgz> <size-bytes> <sha256:hex-or-sha512-base64> <40-char-git-commit>"
  );
}

const artifact = {
  filename,
  sizeBytes: Number(rawSizeBytes),
  integrity,
  gitCommit
};
const release = {
  packageName: "maqam",
  version: "0.2.3",
  registry: "https://registry.npmjs.org/",
  publishCommand: "npm publish --access public"
};

const approvals = new ApprovalQueue();
const approval = approvals.requestApproval({
  action: "publish:npm",
  requestedBy: "release-preparer",
  reason: "The exact Maqam artifact passed local verification and needs owner approval.",
  risk: "critical",
  subject: {
    ...release,
    artifactFilename: artifact.filename,
    artifactSizeBytes: artifact.sizeBytes,
    artifactIntegrity: artifact.integrity,
    gitCommit: artifact.gitCommit
  },
  evidence: [
    "npm test: pass",
    "npm pack --dry-run: pass"
  ]
});

const report = createReleaseGateReport({
  ...release,
  license: "MIT",
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
    { command: "npm test", status: "pass", summary: "Recorded from the reviewed release run." },
    { command: "npm pack --dry-run", status: "pass", summary: "Recorded from the reviewed release run." }
  ],
  provenance: {
    inspectedProjects: [],
    copiedThirdPartyCode: false
  },
  approval
});

console.log(JSON.stringify(report, null, 2));
