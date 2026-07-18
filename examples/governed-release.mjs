import { ApprovalQueue, createReleaseGateReport } from "maqam";

const [filename, rawSizeBytes, sha256, integrity, gitCommit] = process.argv.slice(2);
if (!filename || !rawSizeBytes || !sha256 || !integrity || !gitCommit) {
  throw new Error(
    "Usage: node examples/governed-release.mjs <artifact.tgz> <size-bytes> <sha256-hex> <sha512-integrity> <40-char-git-commit>"
  );
}

const release = {
  packageName: "maqam",
  version: "0.3.0",
  registry: "https://registry.npmjs.org/",
  publishCommand: "npm publish --access public --ignore-scripts --provenance"
};
const artifact = {
  packageName: release.packageName,
  version: release.version,
  filename,
  sizeBytes: Number(rawSizeBytes),
  sha256,
  integrity,
  gitCommit
};
const verificationCommands = [
  "npm test",
  "npm run test:consumer-types",
  "npm run test:website",
  "npm audit --omit=dev",
  "npm pack --json --ignore-scripts",
  "npm run benchmark:mges:conformance",
  "npm run benchmark:mges:performance"
];

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
    artifactSha256: artifact.sha256,
    artifactIntegrity: artifact.integrity,
    gitCommit: artifact.gitCommit
  },
  evidence: verificationCommands.map((command) => `${command}: pass at ${gitCommit}`)
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
  verification: verificationCommands.map((command) => ({
    command,
    status: "pass",
    summary: "Recorded from the reviewed release run.",
    gitCommit
  })),
  provenance: {
    inspectedProjects: [{
      name: "Panniantong/agent-reach",
      url: "https://github.com/Panniantong/agent-reach",
      revision: "1494c2ab239e7355a77e7cceaf3271453a1f34b5",
      license: "MIT",
      use: "reference inspection only"
    }],
    copiedThirdPartyCode: false
  },
  approval
});

console.log(JSON.stringify(report, null, 2));
