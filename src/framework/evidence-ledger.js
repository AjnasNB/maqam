import { createHash } from "node:crypto";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

export class EvidenceLedger {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.evidence = [];
    this.claims = [];
  }

  addEvidence(input = {}) {
    const record = {
      evidenceId: input.evidenceId || `ev_${this.evidence.length + 1}`,
      runId: input.runId || null,
      taskId: input.taskId || null,
      sourceType: input.sourceType || "unknown",
      source: input.source || "unknown",
      retrievedAt: input.retrievedAt || this.clock().toISOString(),
      excerpt: input.excerpt || "",
      hash: input.hash || sha256(`${input.source || ""}\n${input.excerpt || ""}`),
      tool: input.tool || null,
      confidence: clampConfidence(input.confidence)
    };
    this.evidence.push(record);
    return record;
  }

  addClaim(input = {}) {
    const claim = {
      claimId: input.claimId || `claim_${this.claims.length + 1}`,
      runId: input.runId || null,
      taskId: input.taskId || null,
      text: input.text || "",
      evidenceIds: input.evidenceIds || [],
      confidence: clampConfidence(input.confidence)
    };
    this.claims.push(claim);
    return claim;
  }

  listEvidence() {
    return [...this.evidence];
  }

  listClaims() {
    return [...this.claims];
  }

  unsupportedClaims() {
    const known = new Set(this.evidence.map((record) => record.evidenceId));
    return this.claims.filter((claim) => {
      return !claim.evidenceIds.length || claim.evidenceIds.some((id) => !known.has(id));
    });
  }

  toJSON() {
    return {
      evidence: this.listEvidence(),
      claims: this.listClaims(),
      unsupportedClaims: this.unsupportedClaims()
    };
  }
}
