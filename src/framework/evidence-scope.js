import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./boundary.js";

const EVIDENCE_INPUT_KEYS = new Set([
  "evidenceId", "runId", "taskId", "sourceType", "source", "retrievedAt",
  "excerpt", "hash", "tool", "confidence"
]);
const CLAIM_INPUT_KEYS = new Set([
  "claimId", "runId", "taskId", "text", "evidenceIds", "confidence"
]);
const BATCH_INPUT_KEYS = new Set(["evidence", "claims"]);
const MAX_EVIDENCE_IDS = 10_000;
const MAX_BATCH_RECORDS = 10_000;
const MAX_OUTPUT_NODES = 4_000_000;

function optionalString(record, key, label, { nullable = false } = {}) {
  const value = record[key];
  if (value === undefined || (nullable && value === null)) return;
  if (typeof value !== "string") throw new TypeError(`${label}.${key} must be a string.`);
}

function optionalConfidence(record, label) {
  if (record.confidence !== undefined && !Number.isFinite(record.confidence)) {
    throw new TypeError(`${label}.confidence must be a finite number.`);
  }
}

function snapshotEvidenceInput(input) {
  const record = snapshotOwnDataRecord(input, {
    label: "Scoped evidence input",
    recognizedKeys: EVIDENCE_INPUT_KEYS
  });
  for (const key of ["evidenceId", "sourceType", "source", "retrievedAt", "excerpt", "hash"]) {
    optionalString(record, key, "Scoped evidence input");
  }
  optionalConfidence(record, "Scoped evidence input");
  // These values are untrusted attribution claims. They are intentionally
  // discarded and replaced by the scope captured in the facade closure.
  delete record.runId;
  delete record.taskId;
  delete record.tool;
  return snapshotJsonValue(record, {
    label: "Scoped evidence input",
    allowNullPrototype: true
  });
}

function snapshotClaimInput(input) {
  const record = snapshotOwnDataRecord(input, {
    label: "Scoped claim input",
    recognizedKeys: CLAIM_INPUT_KEYS
  });
  for (const key of ["claimId", "text"]) optionalString(record, key, "Scoped claim input");
  optionalConfidence(record, "Scoped claim input");
  if (record.evidenceIds !== undefined) {
    const evidenceIds = snapshotOwnDataArray(record.evidenceIds, {
      label: "Scoped claim input.evidenceIds",
      maximumLength: MAX_EVIDENCE_IDS
    });
    for (let index = 0; index < evidenceIds.length; index += 1) {
      if (typeof evidenceIds[index] !== "string" || evidenceIds[index].trim() === "") {
        throw new TypeError("Scoped claim input.evidenceIds must contain non-empty strings.");
      }
    }
    record.evidenceIds = evidenceIds;
  }
  delete record.runId;
  delete record.taskId;
  return snapshotJsonValue(record, {
    label: "Scoped claim input",
    allowNullPrototype: true
  });
}

function safeOutput(value, label) {
  return snapshotJsonValue(value, {
    label,
    allowNullPrototype: true,
    freeze: true,
    maximumNodes: MAX_OUTPUT_NODES
  });
}

function recordsForRun(records, runId, label) {
  const snapshot = safeOutput(records, label);
  if (!Array.isArray(snapshot)) throw new TypeError(`${label} must be an array.`);
  return safeOutput(
    snapshot.filter((record) => record?.runId === runId),
    `${label} for run '${runId}'`
  );
}

function scopedBatch(input, { runId, taskId, toolName }) {
  const batch = snapshotOwnDataRecord(input, {
    label: "Scoped evidence batch",
    recognizedKeys: BATCH_INPUT_KEYS
  });
  const evidence = snapshotOwnDataArray(batch.evidence === undefined ? [] : batch.evidence, {
    label: "Scoped evidence batch.evidence",
    maximumLength: MAX_BATCH_RECORDS
  });
  const claims = snapshotOwnDataArray(batch.claims === undefined ? [] : batch.claims, {
    label: "Scoped evidence batch.claims",
    maximumLength: MAX_BATCH_RECORDS
  });
  if (evidence.length + claims.length > MAX_BATCH_RECORDS) {
    throw new TypeError(`Scoped evidence batch cannot exceed ${MAX_BATCH_RECORDS} total records.`);
  }
  return Object.assign(Object.create(null), {
    evidence: evidence.map((item) => Object.assign(
      Object.create(null),
      snapshotEvidenceInput(item),
      { runId, taskId, tool: toolName }
    )),
    claims: claims.map((item) => Object.assign(
      Object.create(null),
      snapshotClaimInput(item),
      { runId, taskId }
    ))
  });
}

export function createScopedEvidenceFacade(ledger, {
  runId,
  taskId = null,
  toolName = null
} = {}) {
  if (!ledger) return null;
  if (typeof runId !== "string" || runId.trim() === "") {
    throw new TypeError("Scoped evidence runId must be a non-empty string.");
  }
  for (const [key, value] of [["taskId", taskId], ["toolName", toolName]]) {
    if (value !== null && (typeof value !== "string" || value.trim() === "")) {
      throw new TypeError(`Scoped evidence ${key} must be null or a non-empty string.`);
    }
  }

  const scope = { runId, taskId, toolName };
  const addBatch = (input = {}) => safeOutput(
    ledger.addBatch(scopedBatch(input, scope)),
    "Scoped evidence batch result"
  );
  const addEvidence = (input = {}) => addBatch({
    evidence: [input],
    claims: []
  }).evidence[0];
  const addClaim = (input = {}) => addBatch({
    evidence: [],
    claims: [input]
  }).claims[0];
  const listEvidence = () => recordsForRun(
    ledger.listEvidence(),
    runId,
    "Scoped evidence records"
  );
  const listClaims = () => recordsForRun(
    ledger.listClaims(),
    runId,
    "Scoped claim records"
  );
  const unsupportedClaims = () => recordsForRun(
    ledger.unsupportedClaims(),
    runId,
    "Scoped unsupported claims"
  );
  const toJSON = () => safeOutput({
    evidence: listEvidence(),
    claims: listClaims(),
    unsupportedClaims: unsupportedClaims()
  }, "Scoped evidence ledger JSON");

  return Object.freeze(Object.assign(Object.create(null), {
    addEvidence,
    addClaim,
    addBatch,
    listEvidence,
    listClaims,
    unsupportedClaims,
    toJSON
  }));
}
