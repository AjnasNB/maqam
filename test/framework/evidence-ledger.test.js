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
  assert.deepEqual([...ledger.listClaims()[0].evidenceIds], ["ev_copy"]);
  assert.deepEqual([...ledger.unsupportedClaims()], []);
});

test("claims cannot borrow evidence from a different run", () => {
  const ledger = new EvidenceLedger();
  const evidence = ledger.addEvidence({ runId: "run_a", source: "source", excerpt: "proof" });
  const claim = ledger.addClaim({ runId: "run_b", text: "claim", evidenceIds: [evidence.evidenceId] });

  assert.deepEqual(ledger.unsupportedClaims().map((item) => item.claimId), [claim.claimId]);
});

test("EvidenceLedger state is private and all outputs are detached prototype-safe snapshots", () => {
  const ledger = new EvidenceLedger();
  assert.equal(ledger.evidence, undefined);
  assert.equal(ledger.claims, undefined);
  ledger.evidence = [{ evidenceId: "ev_forged" }];
  ledger.claims = [{ claimId: "claim_forged" }];
  assert.equal(ledger.listEvidence().length, 0);
  assert.equal(ledger.listClaims().length, 0);

  const record = ledger.addEvidence({
    source: "source",
    excerpt: "proof"
  });
  const listed = ledger.listEvidence();
  assert.equal(Object.getPrototypeOf(record), null);
  assert.equal(Object.getPrototypeOf(listed[0]), null);
  assert.notEqual(Object.getPrototypeOf(listed), Array.prototype);
  record.excerpt = "caller mutation";
  listed[0].excerpt = "list mutation";
  assert.equal(ledger.listEvidence()[0].excerpt, "proof");
});

test("EvidenceLedger rejects inherited fields and accessors without invoking them", () => {
  const ledger = new EvidenceLedger();
  let getterCalls = 0;
  const input = {};
  Object.defineProperty(input, "source", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "danger";
    }
  });
  assert.throws(() => ledger.addEvidence(input), /data property/);
  assert.equal(getterCalls, 0);

  const previousRunId = Object.getOwnPropertyDescriptor(Object.prototype, "runId");
  try {
    Object.defineProperty(Object.prototype, "runId", {
      value: "forged_run",
      configurable: true
    });
    assert.throws(
      () => ledger.addEvidence({ source: "source" }),
      /Inherited Evidence batch\.evidence\[0\] field 'runId'/
    );
  } finally {
    if (previousRunId) Object.defineProperty(Object.prototype, "runId", previousRunId);
    else delete Object.prototype.runId;
  }

  const options = {};
  Object.defineProperty(options, "clock", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return () => new Date();
    }
  });
  assert.throws(() => new EvidenceLedger(options), /data property/);
  assert.equal(getterCalls, 0);
});

test("EvidenceLedger addBatch validates and commits evidence and claims atomically", () => {
  const ledger = new EvidenceLedger();
  assert.throws(() => ledger.addBatch({
    evidence: [{ source: "source", excerpt: "proof" }],
    claims: [
      { claimId: "claim_duplicate", text: "first" },
      { claimId: "claim_duplicate", text: "second" }
    ]
  }), /already registered/);
  assert.equal(ledger.listEvidence().length, 0);
  assert.equal(ledger.listClaims().length, 0);

  const committed = ledger.addBatch({
    evidence: [{ source: "source", excerpt: "proof", runId: "run_1" }],
    claims: [{ text: "claim", runId: "run_1", evidenceIds: ["ev_1"] }]
  });
  assert.equal(committed.evidence[0].evidenceId, "ev_1");
  assert.equal(committed.claims[0].claimId, "claim_1");
  assert.equal(ledger.listEvidence().length, 1);
  assert.equal(ledger.listClaims().length, 1);
});

test("EvidenceLedger enforces dense bounded inputs and strict scalar types", () => {
  const ledger = new EvidenceLedger();
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => ledger.addBatch({ evidence: sparse, claims: [] }), /dense/i);
  assert.throws(() => ledger.addEvidence({ confidence: Number.NaN }), /confidence/);
  assert.throws(() => ledger.addEvidence({ confidence: 2 }), /between 0 and 1/);
  assert.throws(() => ledger.addClaim({ evidenceIds: ["same", "same"] }), /duplicate ids/);
  assert.equal(ledger.listEvidence().length, 0);
  assert.equal(ledger.listClaims().length, 0);
});

test("EvidenceLedger rejects reentrant clock mutations without consuming ids", () => {
  let ledger;
  ledger = new EvidenceLedger({
    clock: () => {
      ledger.addEvidence({ source: "reentrant", retrievedAt: "2026-01-01T00:00:00.000Z" });
      return new Date("2026-01-01T00:00:00.000Z");
    }
  });

  assert.throws(
    () => ledger.addEvidence({ source: "outer" }),
    /reentrant mutations/i
  );
  assert.equal(ledger.listEvidence().length, 0);
  assert.equal(ledger.addEvidence({
    source: "safe",
    retrievedAt: "2026-01-01T00:00:00.000Z"
  }).evidenceId, "ev_1");
});

test("EvidenceLedger bounds aggregate claim links before committing", () => {
  const ledger = new EvidenceLedger();
  const evidenceIds = Array.from({ length: 10_000 }, (_, index) => `ev_${index}`);
  const claims = Array.from({ length: 11 }, (_, index) => ({
    claimId: `claim_${index}`,
    evidenceIds
  }));

  assert.throws(
    () => ledger.addBatch({ evidence: [], claims }),
    /cannot exceed 0 items|total claim evidence links/i
  );
  assert.equal(ledger.listClaims().length, 0);
});
