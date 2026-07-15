import assert from "node:assert/strict";
import { test } from "node:test";
import { EvidenceLedger } from "../../src/framework/evidence-ledger.js";

test("addEvidence stores normalized evidence with a stable hash", () => {
  const ledger = new EvidenceLedger({
    clock: () => new Date("2026-06-28T10:00:00.000Z")
  });

  const record = ledger.addEvidence({
    runId: "run_1",
    taskId: "inspect",
    sourceType: "url",
    source: "https://github.com/apify/crawlee",
    excerpt: "Apache-2.0 license",
    tool: "github",
    confidence: 0.9
  });

  assert.equal(record.evidenceId, "ev_1");
  assert.equal(record.retrievedAt, "2026-06-28T10:00:00.000Z");
  assert.match(record.hash, /^sha256:/);
  assert.equal(ledger.listEvidence().length, 1);
});

test("addClaim links claims to evidence and reports unsupported claims", () => {
  const ledger = new EvidenceLedger();
  const evidence = ledger.addEvidence({
    sourceType: "url",
    source: "https://www.npmjs.com/package/crawlee",
    excerpt: "Package metadata"
  });

  ledger.addClaim({
    text: "Crawlee is published on npm.",
    evidenceIds: [evidence.evidenceId],
    confidence: 0.8
  });
  const unsupported = ledger.addClaim({
    text: "Unsupported claim",
    evidenceIds: [],
    confidence: 0.2
  });

  assert.equal(unsupported.claimId, "claim_2");
  assert.deepEqual(ledger.unsupportedClaims().map((claim) => claim.claimId), ["claim_2"]);
});

test("ledger rejects spoofed hashes and duplicate evidence or claim ids", () => {
  const ledger = new EvidenceLedger();
  const evidence = ledger.addEvidence({
    evidenceId: "ev_exact",
    source: "https://example.com/source",
    excerpt: "verified"
  });
  ledger.addClaim({ claimId: "claim_exact", text: "Verified", evidenceIds: [evidence.evidenceId] });

  assert.throws(() => ledger.addEvidence({
    source: "https://example.com/source",
    excerpt: "tampered",
    hash: evidence.hash
  }), /hash.*does not match/i);
  assert.throws(() => ledger.addEvidence({ evidenceId: "ev_exact" }), /already registered/);
  assert.throws(() => ledger.addClaim({ claimId: "claim_exact" }), /already registered/);
});

test("ledger outputs and claim evidence links are immutable copies", () => {
  const ledger = new EvidenceLedger();
  const record = ledger.addEvidence({
    evidenceId: "ev_copy",
    runId: "run_1",
    source: "source",
    excerpt: "original"
  });
  const evidenceIds = [record.evidenceId];
  const claim = ledger.addClaim({ runId: "run_1", text: "claim", evidenceIds });

  record.excerpt = "mutated";
  evidenceIds[0] = "unknown";
  claim.evidenceIds[0] = "unknown";
  const listedEvidence = ledger.listEvidence();
  const listedClaims = ledger.listClaims();
  listedEvidence[0].excerpt = "also mutated";
  listedClaims[0].evidenceIds[0] = "also unknown";

  assert.equal(ledger.listEvidence()[0].excerpt, "original");
  assert.deepEqual(ledger.listClaims()[0].evidenceIds, ["ev_copy"]);
  assert.deepEqual(ledger.unsupportedClaims(), []);
});

test("claims cannot borrow evidence from a different run", () => {
  const ledger = new EvidenceLedger();
  const evidence = ledger.addEvidence({ runId: "run_a", source: "source", excerpt: "proof" });
  const claim = ledger.addClaim({ runId: "run_b", text: "claim", evidenceIds: [evidence.evidenceId] });

  assert.deepEqual(ledger.unsupportedClaims().map((item) => item.claimId), [claim.claimId]);
});
