import { createHash } from "node:crypto";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

export class EvidenceLedger {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.evidence = [];
    this.claims = [];
    this.nextEvidenceNumber = 1;
    this.nextClaimNumber = 1;
  }

  #nextId(prefix, collection, counterKey, idKey) {
    let id;
    do {
      id = `${prefix}_${this[counterKey]}`;
      this[counterKey] += 1;
    } while (collection.some((record) => record[idKey] === id));
    return id;
  }

  addEvidence(input = {}) {
    const evidenceId = input.evidenceId
      || this.#nextId("ev", this.evidence, "nextEvidenceNumber", "evidenceId");
    if (this.evidence.some((record) => record.evidenceId === evidenceId)) {
      throw new TypeError(`Evidence id '${evidenceId}' is already registered.`);
    }
    const source = String(input.source || "unknown");
    const excerpt = String(input.excerpt || "");
    const hash = sha256(JSON.stringify([source, excerpt]));
    if (input.hash && input.hash !== hash) {
      throw new TypeError(`Evidence '${evidenceId}' supplied a hash that does not match its source and excerpt.`);
    }
    const record = {
      evidenceId,
      runId: input.runId || null,
      taskId: input.taskId || null,
      sourceType: String(input.sourceType || "unknown"),
      source,
      retrievedAt: input.retrievedAt || this.clock().toISOString(),
      excerpt,
      hash,
      tool: input.tool ? String(input.tool) : null,
      confidence: clampConfidence(input.confidence)
    };
    this.evidence.push(deepFreeze(record));
    return clone(record);
  }

  addClaim(input = {}) {
    const claimId = input.claimId
      || this.#nextId("claim", this.claims, "nextClaimNumber", "claimId");
    if (this.claims.some((claim) => claim.claimId === claimId)) {
      throw new TypeError(`Claim id '${claimId}' is already registered.`);
    }
    const claim = {
      claimId,
      runId: input.runId || null,
      taskId: input.taskId || null,
      text: String(input.text || ""),
      evidenceIds: [...(input.evidenceIds || [])].map(String),
      confidence: clampConfidence(input.confidence)
    };
    this.claims.push(deepFreeze(claim));
    return clone(claim);
  }

  listEvidence() {
    return clone(this.evidence);
  }

  listClaims() {
    return clone(this.claims);
  }

  unsupportedClaims() {
    const known = new Map(this.evidence.map((record) => [record.evidenceId, record]));
    return clone(this.claims.filter((claim) => {
      return !claim.evidenceIds.length || claim.evidenceIds.some((id) => {
        const evidence = known.get(id);
        return !evidence || evidence.runId !== claim.runId;
      });
    }));
  }

  toJSON() {
    return {
      evidence: this.listEvidence(),
      claims: this.listClaims(),
      unsupportedClaims: this.unsupportedClaims()
    };
  }
}
