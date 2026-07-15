import { createHash } from "node:crypto";
import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./boundary.js";

const LEDGER_OPTION_KEYS = new Set(["clock"]);
const EVIDENCE_INPUT_KEYS = new Set([
  "evidenceId", "runId", "taskId", "sourceType", "source", "retrievedAt",
  "excerpt", "hash", "tool", "confidence"
]);
const CLAIM_INPUT_KEYS = new Set([
  "claimId", "runId", "taskId", "text", "evidenceIds", "confidence"
]);
const BATCH_INPUT_KEYS = new Set(["evidence", "claims"]);
const MAX_RECORDS = 100_000;
const MAX_BATCH_RECORDS = 10_000;
const MAX_EVIDENCE_IDS = 10_000;
const MAX_TOTAL_EVIDENCE_LINKS = 100_000;
const MAX_OUTPUT_NODES = 4_000_000;
const MAX_ID_LENGTH = 256;
const MAX_SHORT_STRING_LENGTH = 10_000;
const MAX_SOURCE_LENGTH = 100_000;
const MAX_EXCERPT_LENGTH = 1_000_000;

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stringValue(value, path, {
  fallback,
  nullable = false,
  allowEmpty = true,
  maximumLength = MAX_SHORT_STRING_LENGTH
} = {}) {
  if (value === undefined) return fallback;
  if (nullable && value === null) return null;
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new TypeError(`${path} must be ${nullable ? "null or " : ""}a${allowEmpty ? "" : " non-empty"} string.`);
  }
  if (value.length > maximumLength) {
    throw new TypeError(`${path} cannot exceed ${maximumLength} characters.`);
  }
  return value;
}

function confidenceValue(value, path) {
  if (value === undefined) return 0.5;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${path} must be a finite number between 0 and 1.`);
  }
  return value;
}

function timestampValue(value, path) {
  const timestamp = stringValue(value, path, {
    allowEmpty: false,
    maximumLength: MAX_SHORT_STRING_LENGTH
  });
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new TypeError(`${path} must be a valid timestamp string.`);
  }
  return timestamp;
}

function clockTimestamp(clock) {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(Date.prototype.getTime.call(value))) {
    throw new TypeError("EvidenceLedger clock must return a valid Date.");
  }
  return Date.prototype.toISOString.call(value);
}

function snapshotEvidenceInput(value, index) {
  const path = `Evidence batch.evidence[${index}]`;
  const input = snapshotOwnDataRecord(value, {
    label: path,
    recognizedKeys: EVIDENCE_INPUT_KEYS
  });
  return Object.assign(Object.create(null), {
    evidenceId: stringValue(input.evidenceId, `${path}.evidenceId`, {
      fallback: null,
      allowEmpty: false,
      maximumLength: MAX_ID_LENGTH
    }),
    runId: stringValue(input.runId, `${path}.runId`, {
      fallback: null,
      nullable: true,
      allowEmpty: false
    }),
    taskId: stringValue(input.taskId, `${path}.taskId`, {
      fallback: null,
      nullable: true,
      allowEmpty: false
    }),
    sourceType: stringValue(input.sourceType, `${path}.sourceType`, {
      fallback: "unknown",
      maximumLength: MAX_SHORT_STRING_LENGTH
    }),
    source: stringValue(input.source, `${path}.source`, {
      fallback: "unknown",
      maximumLength: MAX_SOURCE_LENGTH
    }),
    retrievedAt: input.retrievedAt === undefined
      ? null
      : timestampValue(input.retrievedAt, `${path}.retrievedAt`),
    excerpt: stringValue(input.excerpt, `${path}.excerpt`, {
      fallback: "",
      maximumLength: MAX_EXCERPT_LENGTH
    }),
    hash: stringValue(input.hash, `${path}.hash`, {
      fallback: null,
      allowEmpty: false,
      maximumLength: MAX_SHORT_STRING_LENGTH
    }),
    tool: stringValue(input.tool, `${path}.tool`, {
      fallback: null,
      nullable: true,
      allowEmpty: false
    }),
    confidence: confidenceValue(input.confidence, `${path}.confidence`)
  });
}

function snapshotClaimInput(value, index, remainingEvidenceLinks) {
  const path = `Evidence batch.claims[${index}]`;
  const input = snapshotOwnDataRecord(value, {
    label: path,
    recognizedKeys: CLAIM_INPUT_KEYS
  });
  const evidenceIds = input.evidenceIds === undefined
    ? snapshotOwnDataArray([], { label: `${path}.evidenceIds` })
    : snapshotOwnDataArray(input.evidenceIds, {
      label: `${path}.evidenceIds`,
      maximumLength: Math.min(MAX_EVIDENCE_IDS, remainingEvidenceLinks)
    });
  const uniqueEvidenceIds = new Set();
  for (let evidenceIndex = 0; evidenceIndex < evidenceIds.length; evidenceIndex += 1) {
    const evidenceId = stringValue(
      evidenceIds[evidenceIndex],
      `${path}.evidenceIds[${evidenceIndex}]`,
      { allowEmpty: false, maximumLength: MAX_ID_LENGTH }
    );
    if (uniqueEvidenceIds.has(evidenceId)) {
      throw new TypeError(`${path}.evidenceIds cannot contain duplicate ids.`);
    }
    uniqueEvidenceIds.add(evidenceId);
    evidenceIds[evidenceIndex] = evidenceId;
  }
  return Object.assign(Object.create(null), {
    claimId: stringValue(input.claimId, `${path}.claimId`, {
      fallback: null,
      allowEmpty: false,
      maximumLength: MAX_ID_LENGTH
    }),
    runId: stringValue(input.runId, `${path}.runId`, {
      fallback: null,
      nullable: true,
      allowEmpty: false
    }),
    taskId: stringValue(input.taskId, `${path}.taskId`, {
      fallback: null,
      nullable: true,
      allowEmpty: false
    }),
    text: stringValue(input.text, `${path}.text`, {
      fallback: "",
      maximumLength: MAX_EXCERPT_LENGTH
    }),
    evidenceIds,
    confidence: confidenceValue(input.confidence, `${path}.confidence`)
  });
}

function allocateId(prefix, counter, ids) {
  let next = counter;
  let id;
  do {
    if (!Number.isSafeInteger(next) || next >= Number.MAX_SAFE_INTEGER) {
      throw new TypeError(`EvidenceLedger ${prefix} id sequence is exhausted.`);
    }
    id = `${prefix}_${next}`;
    next += 1;
  } while (ids.has(id));
  ids.add(id);
  return { id, next };
}

function internalRecord(value) {
  return snapshotJsonValue(value, {
    label: "EvidenceLedger record",
    allowNullPrototype: true,
    freeze: true
  });
}

function detached(value, label = "EvidenceLedger output") {
  return snapshotJsonValue(value, {
    label,
    allowNullPrototype: true,
    maximumNodes: MAX_OUTPUT_NODES
  });
}

export class EvidenceLedger {
  #clock;
  #evidence = [];
  #claims = [];
  #nextEvidenceNumber = 1;
  #nextClaimNumber = 1;
  #evidenceLinkCount = 0;
  #mutating = false;

  constructor(options = {}) {
    options = snapshotOwnDataRecord(options, {
      label: "EvidenceLedger options",
      recognizedKeys: LEDGER_OPTION_KEYS
    });
    if (options.clock !== undefined && typeof options.clock !== "function") {
      throw new TypeError("EvidenceLedger clock must be a function.");
    }
    this.#clock = options.clock || (() => new Date());
  }

  addEvidence(input = {}) {
    return this.addBatch({ evidence: [input], claims: [] }).evidence[0];
  }

  addClaim(input = {}) {
    return this.addBatch({ evidence: [], claims: [input] }).claims[0];
  }

  addBatch(input = {}) {
    if (this.#mutating) {
      throw new TypeError("EvidenceLedger does not allow reentrant mutations.");
    }
    this.#mutating = true;
    try {
      return this.#commitBatch(input);
    } finally {
      this.#mutating = false;
    }
  }

  #commitBatch(input) {
    const batch = snapshotOwnDataRecord(input, {
      label: "Evidence batch",
      recognizedKeys: BATCH_INPUT_KEYS
    });
    const evidenceValues = batch.evidence === undefined
      ? snapshotOwnDataArray([], { label: "Evidence batch.evidence" })
      : snapshotOwnDataArray(batch.evidence, {
        label: "Evidence batch.evidence",
        maximumLength: MAX_BATCH_RECORDS
      });
    const claimValues = batch.claims === undefined
      ? snapshotOwnDataArray([], { label: "Evidence batch.claims" })
      : snapshotOwnDataArray(batch.claims, {
        label: "Evidence batch.claims",
        maximumLength: MAX_BATCH_RECORDS
      });
    if (evidenceValues.length + claimValues.length > MAX_BATCH_RECORDS) {
      throw new TypeError(`Evidence batch cannot exceed ${MAX_BATCH_RECORDS} total records.`);
    }
    if (this.#evidence.length + evidenceValues.length > MAX_RECORDS
      || this.#claims.length + claimValues.length > MAX_RECORDS) {
      throw new TypeError(`EvidenceLedger cannot exceed ${MAX_RECORDS} evidence or claim records.`);
    }

    // Everything below is prepared against local counters and collections.
    // Private state is replaced only after the complete batch validates.
    const evidenceInputs = evidenceValues.map(snapshotEvidenceInput);
    const claimInputs = [];
    let batchEvidenceLinkCount = 0;
    for (let index = 0; index < claimValues.length; index += 1) {
      const claim = snapshotClaimInput(
        claimValues[index],
        index,
        MAX_TOTAL_EVIDENCE_LINKS - batchEvidenceLinkCount
      );
      batchEvidenceLinkCount += claim.evidenceIds.length;
      claimInputs.push(claim);
    }
    if (this.#evidenceLinkCount + batchEvidenceLinkCount > MAX_TOTAL_EVIDENCE_LINKS) {
      throw new TypeError(
        `EvidenceLedger cannot exceed ${MAX_TOTAL_EVIDENCE_LINKS} total claim evidence links.`
      );
    }
    const evidenceIds = new Set(this.#evidence.map((record) => record.evidenceId));
    const claimIds = new Set(this.#claims.map((record) => record.claimId));
    let nextEvidenceNumber = this.#nextEvidenceNumber;
    let nextClaimNumber = this.#nextClaimNumber;
    const newEvidence = [];
    const newClaims = [];

    for (const inputRecord of evidenceInputs) {
      let evidenceId = inputRecord.evidenceId;
      if (evidenceId === null) {
        const allocation = allocateId("ev", nextEvidenceNumber, evidenceIds);
        evidenceId = allocation.id;
        nextEvidenceNumber = allocation.next;
      } else if (evidenceIds.has(evidenceId)) {
        throw new TypeError(`Evidence id '${evidenceId}' is already registered.`);
      } else {
        evidenceIds.add(evidenceId);
      }
      const hash = sha256(JSON.stringify([inputRecord.source, inputRecord.excerpt]));
      if (inputRecord.hash !== null && inputRecord.hash !== hash) {
        throw new TypeError(`Evidence '${evidenceId}' supplied a hash that does not match its source and excerpt.`);
      }
      newEvidence.push(internalRecord({
        evidenceId,
        runId: inputRecord.runId,
        taskId: inputRecord.taskId,
        sourceType: inputRecord.sourceType,
        source: inputRecord.source,
        retrievedAt: inputRecord.retrievedAt || clockTimestamp(this.#clock),
        excerpt: inputRecord.excerpt,
        hash,
        tool: inputRecord.tool,
        confidence: inputRecord.confidence
      }));
    }

    for (const inputRecord of claimInputs) {
      let claimId = inputRecord.claimId;
      if (claimId === null) {
        const allocation = allocateId("claim", nextClaimNumber, claimIds);
        claimId = allocation.id;
        nextClaimNumber = allocation.next;
      } else if (claimIds.has(claimId)) {
        throw new TypeError(`Claim id '${claimId}' is already registered.`);
      } else {
        claimIds.add(claimId);
      }
      newClaims.push(internalRecord({
        claimId,
        runId: inputRecord.runId,
        taskId: inputRecord.taskId,
        text: inputRecord.text,
        evidenceIds: inputRecord.evidenceIds,
        confidence: inputRecord.confidence
      }));
    }

    const committedEvidence = [...this.#evidence, ...newEvidence];
    const committedClaims = [...this.#claims, ...newClaims];
    this.#evidence = committedEvidence;
    this.#claims = committedClaims;
    this.#nextEvidenceNumber = nextEvidenceNumber;
    this.#nextClaimNumber = nextClaimNumber;
    this.#evidenceLinkCount += batchEvidenceLinkCount;

    return detached({ evidence: newEvidence, claims: newClaims }, "Evidence batch result");
  }

  listEvidence() {
    return detached(this.#evidence, "Evidence records");
  }

  listClaims() {
    return detached(this.#claims, "Claim records");
  }

  unsupportedClaims() {
    const known = new Map(this.#evidence.map((record) => [record.evidenceId, record]));
    const unsupported = this.#claims.filter((claim) => (
      !claim.evidenceIds.length || claim.evidenceIds.some((id) => {
        const evidence = known.get(id);
        return !evidence || evidence.runId !== claim.runId;
      })
    ));
    return detached(unsupported, "Unsupported claim records");
  }

  toJSON() {
    const known = new Map(this.#evidence.map((record) => [record.evidenceId, record]));
    return detached({
      evidence: this.#evidence,
      claims: this.#claims,
      unsupportedClaims: this.#claims.filter((claim) => {
        return !claim.evidenceIds.length || claim.evidenceIds.some((id) => {
          const evidence = known.get(id);
          return !evidence || evidence.runId !== claim.runId;
        });
      })
    }, "EvidenceLedger JSON");
  }
}
