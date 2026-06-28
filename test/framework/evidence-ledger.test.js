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
