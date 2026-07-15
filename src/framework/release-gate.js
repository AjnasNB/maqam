const REQUIRED_FILE_KEYS = [
  "readme",
  "license",
  "changelog",
  "security",
  "releaseChecklist",
  "licenseAudit",
  "types",
  "examples"
];

const REQUIRED_VERIFICATION_COMMANDS = ["npm test", "npm pack --dry-run"];
const NPM_REGISTRY = "https://registry.npmjs.org/";
const ALLOWED_PUBLISH_COMMANDS = new Set([
  "npm publish --access public",
  "npm publish --access public --provenance"
]);

function collectMissing(input) {
  const missing = [];
  for (const key of REQUIRED_FILE_KEYS) {
    if (!input.requiredFiles?.[key]) {
      missing.push(`requiredFiles.${key}`);
    }
  }
  if (!input.publishCommand) {
    missing.push("publishCommand");
  }
  if (!input.packageName) {
    missing.push("packageName");
  }
  if (!input.version) {
    missing.push("version");
  }
  if (!input.license) {
    missing.push("license");
  }
  if (!input.registry) {
    missing.push("registry");
  }
  if (!input.artifact?.integrity) {
    missing.push("artifact.integrity");
  }
  if (!input.artifact?.gitCommit) {
    missing.push("artifact.gitCommit");
  }
  if (!input.artifact?.filename) {
    missing.push("artifact.filename");
  }
  if (!input.artifact?.sizeBytes) {
    missing.push("artifact.sizeBytes");
  }
  return missing;
}

function hasValidIntegrity(value) {
  if (/^sha256:[a-f0-9]{64}$/i.test(value || "")) return true;
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(value || "");
  if (!match) return false;
  try {
    const decoded = Buffer.from(match[1], "base64");
    return decoded.byteLength === 64 && decoded.toString("base64") === match[1];
  } catch {
    return false;
  }
}

function collectBlockers(input) {
  const blockers = [];
  const verification = Array.isArray(input.verification) ? input.verification : [];
  if (verification.length === 0) {
    blockers.push("Release verification evidence is required.");
  }
  for (const command of REQUIRED_VERIFICATION_COMMANDS) {
    if (!verification.some((check) => check?.command === command && check.status === "pass")) {
      blockers.push(`Required verification has not passed: ${command}.`);
    }
  }
  for (const check of verification) {
    if (check.status !== "pass") {
      blockers.push(`Verification failed: ${check.command || "unknown command"}.`);
    }
  }

  if (input.registry && input.registry !== NPM_REGISTRY) {
    blockers.push(`Registry must be '${NPM_REGISTRY}'.`);
  }
  if (input.publishCommand && !ALLOWED_PUBLISH_COMMANDS.has(input.publishCommand)) {
    blockers.push("Publish command is not an approved npm public-release command.");
  }
  if (!hasValidIntegrity(input.artifact?.integrity)) {
    blockers.push("Artifact integrity must be sha256:<64 hex> or canonical sha512-<base64>.");
  }
  if (!/^[a-f0-9]{40}$/i.test(input.artifact?.gitCommit || "")) {
    blockers.push("Artifact gitCommit must be a full 40-character Git commit.");
  }
  if (input.artifact?.filename && !/^[A-Za-z0-9._-]+\.tgz$/.test(input.artifact.filename)) {
    blockers.push("Artifact filename must be a basename ending in .tgz.");
  }
  if (input.artifact?.sizeBytes !== undefined
    && (!Number.isSafeInteger(input.artifact.sizeBytes) || input.artifact.sizeBytes <= 0)) {
    blockers.push("Artifact sizeBytes must be a positive safe integer.");
  }
  if (input.provenance?.copiedThirdPartyCode !== false) {
    blockers.push("Provenance policy requires copiedThirdPartyCode to be explicitly false.");
  }

  if (!input.approval) {
    blockers.push("Explicit release approval is required before publishing.");
  } else {
    const subject = input.approval.subject || {};
    if (input.approval.action !== "publish:npm") {
      blockers.push("Release approval action must be 'publish:npm'.");
    }
    if (subject.packageName !== input.packageName || subject.version !== input.version) {
      blockers.push(`Release approval must be scoped to ${input.packageName}@${input.version}.`);
    }
    if (subject.registry !== input.registry
      || subject.publishCommand !== input.publishCommand
      || subject.artifactIntegrity !== input.artifact?.integrity
      || subject.artifactFilename !== input.artifact?.filename
      || subject.artifactSizeBytes !== input.artifact?.sizeBytes
      || subject.gitCommit !== input.artifact?.gitCommit) {
      blockers.push("Release approval does not match the registry, command, artifact identity, and Git commit.");
    }
    if (input.approval.status === "pending") {
      blockers.push(`Approval ${input.approval.approvalId} is pending for ${input.approval.action}.`);
    } else if (input.approval.status === "rejected") {
      blockers.push(`Approval ${input.approval.approvalId} was rejected for ${input.approval.action}.`);
    } else if (input.approval.status !== "approved") {
      blockers.push(`Approval ${input.approval.approvalId || "unknown"} has invalid status '${input.approval.status}'.`);
    }
  }

  return blockers;
}

export function createReleaseGateReport(input = {}) {
  const missing = collectMissing(input);
  const blockers = collectBlockers(input);
  const approved = input.approval?.status === "approved";
  const complete = missing.length === 0 && blockers.length === 0;

  let status = "blocked";
  if (complete && approved) {
    status = "approved";
  } else if (missing.length === 0 && blockers.length === 1 && input.approval?.status === "pending") {
    status = "waiting_for_approval";
  }

  return {
    packageName: input.packageName || null,
    version: input.version || null,
    license: input.license || null,
    publishCommand: input.publishCommand || "",
    registry: input.registry || null,
    artifact: input.artifact || null,
    status,
    readyToPublish: status === "approved",
    missing,
    blockers,
    verification: input.verification || [],
    provenance: input.provenance || {},
    approval: input.approval || null,
    summary: `${input.packageName || "package"}@${input.version || "unversioned"} release gate is ${status}.`
  };
}
