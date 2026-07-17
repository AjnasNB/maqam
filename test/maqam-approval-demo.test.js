import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runApprovalDemo } from "../src/maqam/approval-demo.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const maqamBin = fileURLToPath(new URL("../bin/maqam.js", import.meta.url));
const crawlerBin = fileURLToPath(new URL("../bin/ajnas-crawl.js", import.meta.url));

function runCli(...args) {
  return spawnSync(process.execPath, [maqamBin, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true
  });
}

function runCrawlerCli(...args) {
  return spawnSync(process.execPath, [crawlerBin, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true
  });
}

test("exact-approval demo blocks altered input, executes once, rejects replay, and links evidence", async () => {
  const report = await runApprovalDemo();
  const [request, altered, exact, replay] = report.steps;

  assert.equal(report.status, "passed");
  assert.deepEqual(report.approvedInput, {
    path: "release/notes.json",
    content: "Maqam exact approval verified."
  });
  assert.equal(request.code, "APPROVAL_REQUIRED");
  assert.equal(request.action, "effect:write");
  assert.match(request.scope.inputHash, /^[a-f0-9]{64}$/);
  assert.equal(request.executions, 0);
  assert.equal(request.fileExists, false);

  assert.equal(altered.code, "APPROVAL_SCOPE_MISMATCH");
  assert.equal(altered.executions, 0);
  assert.equal(altered.fileExists, false);

  assert.equal(exact.status, "completed");
  assert.equal(exact.executions, 1);
  assert.equal(exact.approvalConsumptions, 1);
  assert.equal(exact.result.verified, true);
  assert.match(exact.result.contentHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(exact.file.content, report.approvedInput.content);

  assert.equal(replay.code, "APPROVAL_INVALID");
  assert.match(replay.message, /already been consumed/);
  assert.equal(replay.executions, 1);
  assert.equal(replay.fileUnchanged, true);

  assert.equal(report.approval.reusable, false);
  assert.equal(report.approval.consumptions.length, 1);
  assert.equal(report.evidence.evidence.length, 1);
  assert.equal(report.evidence.claims.length, 1);
  assert.deepEqual(
    [...report.evidence.claims[0].evidenceIds],
    [report.evidence.evidence[0].evidenceId]
  );
  assert.deepEqual([...report.evidence.unsupportedClaims], []);
  assert.deepEqual(report.trace.map(({ status, code }) => ({ status, code })), [
    { status: "needs_approval", code: "APPROVAL_REQUIRED" },
    { status: "needs_approval", code: "APPROVAL_SCOPE_MISMATCH" },
    { status: "completed", code: null },
    { status: "needs_approval", code: "APPROVAL_INVALID" }
  ]);
  assert.deepEqual(report.summary, {
    executions: 1,
    approvalConsumptions: 1,
    evidenceRecords: 1,
    claims: 1,
    unsupportedClaims: 0
  });
  assert.equal(report.cleanup.temporaryWorkspaceRemoved, true);
});

test("maqam demo approval --json emits deterministic machine-readable proof", () => {
  const first = runCli("demo", "approval", "--json");
  const second = runCli("demo", "approval", "--json");

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);

  const report = JSON.parse(first.stdout);
  assert.equal(report.demo, "exact-approval");
  assert.equal(report.status, "passed");
  assert.equal(report.steps[1].code, "APPROVAL_SCOPE_MISMATCH");
  assert.equal(report.steps[2].executions, 1);
  assert.equal(report.steps[3].code, "APPROVAL_INVALID");
  assert.equal(report.cleanup.temporaryWorkspaceRemoved, true);
});

test("maqam demo approval emits stable human-readable proof and rejects unknown options", () => {
  const first = runCli("demo", "approval");
  const second = runCli("demo", "approval");
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.match(first.stdout, /Maqam exact-approval demo/);
  assert.match(first.stdout, /APPROVAL_SCOPE_MISMATCH/);
  assert.match(first.stdout, /APPROVAL_INVALID/);
  assert.match(first.stdout, /PASS: one exact write/);

  const invalid = runCli("demo", "approval", "--unsafe");
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  assert.match(invalid.stderr, /Unknown demo option: --unsafe/);
});

test("maqam reports its installed package version", () => {
  for (const option of ["--version", "-v"]) {
    const result = runCli(option);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "0.3.0\n");
  }
});

test("maqam crawler aliases report the installed package version", () => {
  for (const option of ["--version", "-v"]) {
    const result = runCrawlerCli(option);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "0.3.0\n");
  }
});
