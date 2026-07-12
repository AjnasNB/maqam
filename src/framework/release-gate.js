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
  return missing;
}

function collectBlockers(input) {
  const blockers = [];
  for (const check of input.verification || []) {
    if (check.status !== "pass") {
      blockers.push(`Verification failed: ${check.command}.`);
    }
  }

  if (input.provenance?.copiedThirdPartyCode) {
    blockers.push("Provenance policy failed: copiedThirdPartyCode must be false.");
  }

  if (!input.approval) {
    blockers.push("Explicit release approval is required before publishing.");
  } else if (input.approval.status === "pending") {
    blockers.push(`Approval ${input.approval.approvalId} is pending for ${input.approval.action}.`);
  } else if (input.approval.status === "rejected") {
    blockers.push(`Approval ${input.approval.approvalId} was rejected for ${input.approval.action}.`);
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
