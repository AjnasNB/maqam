import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { runYcWorkflow } from "../scripts/workflow.mjs";

test("the YC workflow returns one evidence-linked exact execution", async () => {
  const proof = await runYcWorkflow();

  assert.equal(proof.status, "passed");
  assert.equal(proof.memory.coverage.status, "direct");
  assert.equal(proof.memory.store.verified, true);
  assert.equal(proof.evidence.records, 1);
  assert.equal(proof.evidence.failures.length, 0);
  assert.equal(proof.approval.requested.code, "APPROVAL_REQUIRED");
  assert.equal(proof.approval.alteredInput.code, "APPROVAL_SCOPE_MISMATCH");
  assert.equal(proof.approval.exactInput.executions, 1);
  assert.equal(proof.approval.exactInput.consumptionCount, 1);
  assert.equal(proof.approval.replay.code, "APPROVAL_INVALID");
  assert.equal(proof.receipt.chain.length, 6);
  assert.equal(proof.receipt.unsupportedClaims, 0);
  assert.equal(proof.receipt.testExitCode, 0);
  assert.match(proof.receipt.testOutput, /pass 3/);
  assert.match(proof.receipt.gitDiff, /\/v2\/tasks/);
  assert.equal(proof.repository.persisted, true);
  assert.match(proof.workspace, /yc-dashboard[\\/]\.runs[\\/]run_vendor_v2_/);
});

test("the dashboard carries the YC control-plane story without audio", async () => {
  const html = await readFile(resolve(import.meta.dirname, "..", "public", "index.html"), "utf8");
  const app = await readFile(resolve(import.meta.dirname, "..", "public", "app.js"), "utf8");

  assert.match(html, /RUN GOVERNED WORKFLOW/);
  assert.match(html, /CAUSAL RECEIPT/);
  assert.doesNotMatch(html, /<audio|<video/i);
  assert.match(app, /alteredInput\.code/);
  assert.match(app, /APPROVE THIS EXACT PATCH ONCE/);
  assert.match(app, /REAL FILE WRITE \+ REAL TEST PROCESS/);
  assert.match(app, /api\/runs/);
  assert.doesNotMatch(app, /const schedule/);
});
