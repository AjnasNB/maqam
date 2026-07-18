import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./boundary.js";

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

const REQUIRED_VERIFICATION_COMMANDS = [
  "npm test",
  "npm run test:consumer-types",
  "npm run test:website",
  "npm audit --omit=dev",
  "npm pack --json --ignore-scripts",
  "npm run benchmark:mges:conformance",
  "npm run benchmark:mges:performance"
];
const NPM_REGISTRY = "https://registry.npmjs.org/";
const ALLOWED_PUBLISH_COMMANDS = new Set([
  "npm publish --access public",
  "npm publish --access public --provenance",
  "npm publish --access public --ignore-scripts --provenance"
]);
const RELEASE_INPUT_KEYS = new Set([
  "packageName", "version", "license", "publishCommand", "registry", "artifact",
  "requiredFiles", "verification", "provenance", "approval"
]);
const ARTIFACT_KEYS = new Set([
  "packageName", "version", "filename", "sizeBytes", "sha256", "integrity", "gitCommit"
]);
const VERIFICATION_KEYS = new Set(["command", "status", "summary", "gitCommit"]);
const PROVENANCE_KEYS = new Set(["inspectedProjects", "copiedThirdPartyCode"]);
const INSPECTED_PROJECT_KEYS = new Set(["name", "url", "revision", "license", "use"]);
const APPROVAL_KEYS = new Set([
  "approvalId", "status", "action", "requestedBy", "reason", "risk", "subject",
  "evidence", "reusable", "consumptions", "requestedAt", "decision"
]);
const RELEASE_SUBJECT_KEYS = new Set([
  "packageName", "version", "registry", "publishCommand", "artifactIntegrity",
  "artifactSha256", "artifactFilename", "artifactSizeBytes", "gitCommit"
]);

function requireOptionalString(record, key, label) {
  if (record[key] !== undefined && typeof record[key] !== "string") {
    throw new TypeError(`${label}.${key} must be a string.`);
  }
}

function snapshotReleaseInput(value) {
  const input = snapshotOwnDataRecord(value, {
    label: "Release gate input",
    recognizedKeys: RELEASE_INPUT_KEYS
  });
  for (const key of ["packageName", "version", "license", "publishCommand", "registry"]) {
    requireOptionalString(input, key, "Release gate input");
  }

  if (input.requiredFiles !== undefined) {
    input.requiredFiles = snapshotOwnDataRecord(input.requiredFiles, {
      label: "Release requiredFiles",
      recognizedKeys: new Set(REQUIRED_FILE_KEYS)
    });
    for (const key of Object.keys(input.requiredFiles)) {
      if (typeof input.requiredFiles[key] !== "boolean") {
        throw new TypeError(`Release requiredFiles.${key} must be a boolean.`);
      }
    }
  }
  if (input.artifact !== undefined) {
    input.artifact = snapshotOwnDataRecord(input.artifact, {
      label: "Release artifact",
      recognizedKeys: ARTIFACT_KEYS
    });
    for (const key of [
      "packageName", "version", "filename", "sha256", "integrity", "gitCommit"
    ]) {
      requireOptionalString(input.artifact, key, "Release artifact");
    }
    if (input.artifact.sizeBytes !== undefined && typeof input.artifact.sizeBytes !== "number") {
      throw new TypeError("Release artifact.sizeBytes must be a number.");
    }
  }
  if (input.verification !== undefined) {
    const verification = snapshotOwnDataArray(input.verification, {
      label: "Release verification"
    });
    const checks = verification.map((check, index) => {
      const snapshot = snapshotOwnDataRecord(check, {
        label: `Release verification[${index}]`,
        recognizedKeys: VERIFICATION_KEYS
      });
      for (const key of ["command", "status", "summary", "gitCommit"]) {
        requireOptionalString(snapshot, key, `Release verification[${index}]`);
      }
      return snapshot;
    });
    input.verification = snapshotJsonValue(checks, {
      label: "Release verification",
      allowNullPrototype: true
    });
  }
  if (input.provenance !== undefined) {
    const provenance = snapshotOwnDataRecord(input.provenance, {
      label: "Release provenance",
      recognizedKeys: PROVENANCE_KEYS
    });
    if (provenance.inspectedProjects !== undefined) {
      const projects = snapshotOwnDataArray(provenance.inspectedProjects, {
        label: "Release provenance.inspectedProjects"
      });
      provenance.inspectedProjects = projects.map((project, index) => {
        const snapshot = snapshotOwnDataRecord(project, {
          label: `Release provenance.inspectedProjects[${index}]`,
          recognizedKeys: INSPECTED_PROJECT_KEYS
        });
        for (const key of INSPECTED_PROJECT_KEYS) {
          requireOptionalString(snapshot, key, `Release provenance.inspectedProjects[${index}]`);
        }
        return snapshot;
      });
    }
    if (provenance.copiedThirdPartyCode !== undefined
      && typeof provenance.copiedThirdPartyCode !== "boolean") {
      throw new TypeError("Release provenance.copiedThirdPartyCode must be a boolean.");
    }
    input.provenance = snapshotJsonValue(provenance, {
      label: "Release provenance",
      allowNullPrototype: true
    });
  }
  if (input.approval !== undefined && input.approval !== null) {
    const approval = snapshotOwnDataRecord(input.approval, {
      label: "Release approval",
      recognizedKeys: APPROVAL_KEYS
    });
    for (const key of ["approvalId", "status", "action", "requestedBy", "reason", "risk", "requestedAt"]) {
      requireOptionalString(approval, key, "Release approval");
    }
    if (approval.subject !== undefined) {
      approval.subject = snapshotOwnDataRecord(approval.subject, {
        label: "Release approval subject",
        recognizedKeys: RELEASE_SUBJECT_KEYS
      });
      for (const key of [
        "packageName", "version", "registry", "publishCommand", "artifactIntegrity",
        "artifactSha256", "artifactFilename", "gitCommit"
      ]) {
        requireOptionalString(approval.subject, key, "Release approval subject");
      }
      if (approval.subject.artifactSizeBytes !== undefined
        && typeof approval.subject.artifactSizeBytes !== "number") {
        throw new TypeError("Release approval subject.artifactSizeBytes must be a number.");
      }
    }
    input.approval = snapshotJsonValue(approval, {
      label: "Release approval",
      allowNullPrototype: true
    });
  }
  return input;
}

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
  if (!input.artifact?.sha256) {
    missing.push("artifact.sha256");
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
  if (!input.artifact?.packageName) {
    missing.push("artifact.packageName");
  }
  if (!input.artifact?.version) {
    missing.push("artifact.version");
  }
  return missing;
}

function hasValidSha512Integrity(value) {
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(value || "");
  if (!match) return false;
  try {
    const decoded = Buffer.from(match[1], "base64");
    return decoded.byteLength === 64 && decoded.toString("base64") === match[1];
  } catch {
    return false;
  }
}

function hasCompleteInspectedProject(project) {
  if (!project || typeof project !== "object") return false;
  if (!["name", "url", "revision", "license", "use"].every(
    (key) => typeof project[key] === "string"
      && project[key] !== ""
      && project[key] === project[key].trim()
  )) return false;
  if (!/^[a-f0-9]{40}$/.test(project.revision)) return false;
  try {
    const url = new URL(project.url);
    return url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === "";
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
    if (!verification.some((check) => check?.command === command
      && check.status === "pass"
      && check.gitCommit === input.artifact?.gitCommit)) {
      blockers.push(`Required verification has not passed: ${command}.`);
    }
  }
  for (const check of verification) {
    if (check.status !== "pass") {
      blockers.push(`Verification failed: ${check.command || "unknown command"}.`);
    }
    if (check.gitCommit !== input.artifact?.gitCommit) {
      blockers.push(
        `Verification is not bound to artifact gitCommit: ${check.command || "unknown command"}.`
      );
    }
  }

  if (input.registry && input.registry !== NPM_REGISTRY) {
    blockers.push(`Registry must be '${NPM_REGISTRY}'.`);
  }
  if (input.publishCommand && !ALLOWED_PUBLISH_COMMANDS.has(input.publishCommand)) {
    blockers.push("Publish command is not an approved npm public-release command.");
  }
  if (!/^[a-f0-9]{64}$/.test(input.artifact?.sha256 || "")) {
    blockers.push("Artifact sha256 must be an independent lowercase 64-character SHA-256 hex digest.");
  }
  if (!hasValidSha512Integrity(input.artifact?.integrity)) {
    blockers.push("Artifact integrity must be a canonical npm sha512-<base64> integrity value.");
  }
  if (!/^[a-f0-9]{40}$/.test(input.artifact?.gitCommit || "")) {
    blockers.push("Artifact gitCommit must be a full lowercase 40-character Git commit.");
  }
  if (input.artifact?.filename && !/^[A-Za-z0-9._-]+\.tgz$/.test(input.artifact.filename)) {
    blockers.push("Artifact filename must be a basename ending in .tgz.");
  }
  if (input.artifact?.sizeBytes !== undefined
    && (!Number.isSafeInteger(input.artifact.sizeBytes) || input.artifact.sizeBytes <= 0)) {
    blockers.push("Artifact sizeBytes must be a positive safe integer.");
  }
  if (input.artifact?.packageName !== input.packageName
    || input.artifact?.version !== input.version) {
    blockers.push("Artifact packageName and version must exactly match the release package and version.");
  }
  if (input.provenance?.copiedThirdPartyCode !== false) {
    blockers.push("Provenance policy requires copiedThirdPartyCode to be explicitly false.");
  }
  const inspectedProjects = Array.isArray(input.provenance?.inspectedProjects)
    ? input.provenance.inspectedProjects
    : [];
  if (inspectedProjects.length === 0) {
    blockers.push("Provenance requires at least one explicitly identified inspected project.");
  }
  inspectedProjects.forEach((project, index) => {
    if (!hasCompleteInspectedProject(project)) {
      blockers.push(
        `Provenance inspectedProjects[${index}] requires a name, HTTPS URL, full lowercase Git revision, license, and use.`
      );
    }
  });

  if (!input.approval) {
    blockers.push("Explicit release approval is required before publishing.");
  } else {
    const subject = input.approval.subject || Object.create(null);
    if (input.approval.action !== "publish:npm") {
      blockers.push("Release approval action must be 'publish:npm'.");
    }
    if (subject.packageName !== input.packageName || subject.version !== input.version) {
      blockers.push(`Release approval must be scoped to ${input.packageName}@${input.version}.`);
    }
    if (subject.registry !== input.registry
      || subject.publishCommand !== input.publishCommand
      || subject.artifactSha256 !== input.artifact?.sha256
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
  input = snapshotReleaseInput(input);
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
