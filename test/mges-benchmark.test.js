import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const performanceSuite = fileURLToPath(new URL("../benchmarks/governance-suite.mjs", import.meta.url));
const conformanceSuite = fileURLToPath(new URL("../benchmarks/governance-conformance.mjs", import.meta.url));

function checkedResult(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
}

function checkedSha256(path) {
  return createHash("sha256")
    .update(readFileSync(new URL(path, import.meta.url)))
    .digest("hex");
}

function verifyRecordedFingerprint(result) {
  assert.equal(result.sourceFingerprint.algorithm, "sha256");
  const combined = createHash("sha256");
  const paths = new Set();
  for (const file of result.sourceFingerprint.files) {
    assert.match(file.path, /^[A-Za-z0-9_./-]+$/);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.equal(paths.has(file.path), false, `duplicate recorded fingerprint path: ${file.path}`);
    paths.add(file.path);
    combined.update(`${file.path}\0${file.sha256}\n`);
  }
  assert.equal(combined.digest("hex"), result.sourceFingerprint.combined);
}

function run(script, ...args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000
  });
}

test("MGES performance profile emits isolated raw observations and uncertainty metadata", () => {
  const completed = run(
    performanceSuite,
    "--samples", "2",
    "--direct-iterations", "100",
    "--governed-iterations", "3",
    "--direct-warmup", "1",
    "--governed-warmup", "1",
    "--bootstrap-resamples", "100",
    "--json"
  );
  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(completed.stderr, "");
  const result = JSON.parse(completed.stdout);

  assert.equal(result.schema, "maqam.benchmark.performance/v1");
  assert.equal(result.suite.shortName, "MGES");
  assert.equal(result.suite.profile, "local-call-performance");
  assert.equal(result.suite.version, "1.1.0");
  assert.equal(result.suite.externallyStandardized, false);
  assert.equal(result.environment.timer.api, "process.hrtime.bigint");
  assert.equal(result.environment.isolation.freshProcessPerObservation, true);
  assert.equal(result.raw.rounds.length, 2);
  assert.deepEqual(result.raw.rounds[0].order, ["direct", "governed"]);
  assert.deepEqual(result.raw.rounds[1].order, ["governed", "direct"]);
  assert.equal(result.results.direct.sampleCount, 2);
  assert.equal(result.results.governed.sampleCount, 2);
  assert.equal(result.results.pairedAdded.sampleCount, 2);
  assert.equal(result.results.governed.bootstrapMedian95Interval.resamples, 100);
  assert.equal(typeof result.sourceFingerprint.combined, "string");
  assert.equal(result.sourceFingerprint.combined.length, 64);
  assert.equal(result.quality.publicationCandidate, false);
  assert.match(result.interpretation, /not a competitor benchmark/i);

  for (const round of result.raw.rounds) {
    for (const observation of round.observations) {
      assert.ok(observation.elapsedNs > 0);
      assert.ok(observation.nsPerOperation > 0);
      assert.ok(observation.operationsPerSecond > 0);
      assert.equal(observation.verification.iterations, observation.iterations);
      if (observation.variant === "governed") {
        assert.equal(observation.verification.governedTraceEntries, observation.iterations);
        assert.equal(observation.verification.governedCallCount, observation.iterations);
      }
    }
  }

  const invalid = run(performanceSuite, "--samples");
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /--samples requires a value/);
});

test("MGES conformance profile publishes named project invariants without a security score", () => {
  const completed = run(conformanceSuite, "--json");
  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(completed.stderr, "");
  const result = JSON.parse(completed.stdout);

  assert.equal(result.schema, "maqam.benchmark.conformance/v1");
  assert.equal(result.suite.shortName, "MGES");
  assert.equal(result.suite.profile, "governance-boundary-conformance");
  assert.equal(result.suite.externallyStandardized, false);
  assert.equal(result.suite.externallyCertified, false);
  assert.equal(result.suite.version, "1.1.0");
  assert.deepEqual(result.summary, { total: 14, passed: 14, failed: 0, allPassed: true });
  assert.deepEqual(result.cases.map((item) => item.id), [
    "MGES-C01", "MGES-C02", "MGES-C03", "MGES-C04", "MGES-C05", "MGES-C06",
    "MGES-C07", "MGES-C08", "MGES-C09", "MGES-C10", "MGES-C11", "MGES-C12",
    "MGES-C13", "MGES-C14"
  ]);
  assert.ok(result.cases.every((item) => item.status === "pass"));
  assert.match(result.interpretation, /not a penetration test/i);
  assert.equal(Object.hasOwn(result.summary, "score"), false);
});

test("MGES result schemas are versioned machine-readable JSON Schema documents", () => {
  const performanceSchema = JSON.parse(readFileSync(new URL(
    "../benchmarks/schemas/performance-v1.schema.json",
    import.meta.url
  ), "utf8"));
  const conformanceSchema = JSON.parse(readFileSync(new URL(
    "../benchmarks/schemas/conformance-v1.schema.json",
    import.meta.url
  ), "utf8"));

  assert.equal(performanceSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(performanceSchema.properties.schema.const, "maqam.benchmark.performance/v1");
  assert.equal(conformanceSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(conformanceSchema.properties.schema.const, "maqam.benchmark.conformance/v1");
});

test("previous public 0.3.0 MGES release artifacts remain internally consistent", () => {
  const performance = checkedResult(
    "../benchmarks/results/2026-07-18-mges-performance-windows-node24-main-545fe8bb.json"
  );
  const conformance = checkedResult(
    "../benchmarks/results/2026-07-18-mges-conformance-windows-node24-main-545fe8bb.json"
  );

  assert.equal(performance.repository.workingTreeDirty, false);
  assert.equal(conformance.repository.workingTreeDirty, false);
  assert.equal(performance.repository.commit, "545fe8bbc40f21cec0f9ec2ae3954f3e75783f22");
  assert.equal(conformance.repository.commit, performance.repository.commit);
  assert.equal(performance.quality.publicationCandidate, true);
  assert.equal(conformance.summary.allPassed, true);
  verifyRecordedFingerprint(performance);
  verifyRecordedFingerprint(conformance);
});

test("final 0.3.1 candidate MGES artifacts are exact-main, clean, and digest-bound", () => {
  const expectedCommit = "a96413c4da5f27dc31b9772996e70faab0b38382";
  const performancePath =
    "../benchmarks/results/2026-07-19-mges-performance-ubuntu24-node24-main-a96413c4.json";
  const conformancePath =
    "../benchmarks/results/2026-07-19-mges-conformance-ubuntu24-node24-main-a96413c4.json";
  const manifestPath =
    "../benchmarks/results/2026-07-19-mges-evidence-manifest-ubuntu24-node24-main-a96413c4.json";
  const manifest = checkedResult(manifestPath);
  const performance = checkedResult(performancePath);
  const conformance = checkedResult(conformancePath);

  assert.equal(performance.repository.commit, expectedCommit);
  assert.equal(conformance.repository.commit, expectedCommit);
  assert.equal(performance.repository.workingTreeDirty, false);
  assert.equal(conformance.repository.workingTreeDirty, false);
  assert.equal(performance.environment.runtime.node, "v24.18.0");
  assert.equal(performance.environment.operatingSystem.platform, "linux");
  assert.equal(performance.environment.operatingSystem.architecture, "x64");
  assert.equal(performance.quality.publicationCandidate, true);
  assert.equal(performance.results.governed.sampleCount, 30);
  assert.equal(performance.results.governed.medianMicrosecondsPerOperation, 129.849);
  assert.equal(performance.results.governed.coefficientOfVariation, 0.011106);
  const requiredChecks = performance.quality.checks.filter((check) => check.required);
  assert.equal(requiredChecks.length, 4);
  assert.ok(requiredChecks.every((check) => check.passed));
  assert.deepEqual(conformance.summary, { total: 14, passed: 14, failed: 0, allPassed: true });
  assert.equal(
    performance.sourceFingerprint.combined,
    "00283c6f289cd1935177892a8a9356a8ebfaba4648ff6d2c50e12bbcb55d65fa"
  );
  assert.equal(
    conformance.sourceFingerprint.combined,
    "4f5f5c35454fbf09c34d1bbf43c1d5e91a7a3d0b319409c94f08e338369655f0"
  );
  verifyRecordedFingerprint(performance);
  verifyRecordedFingerprint(conformance);

  assert.equal(manifest.schema, "maqam.mges.evidence-manifest/v1");
  assert.equal(manifest.gitCommit, expectedCommit);
  assert.equal(manifest.cleanCheckout, true);
  assert.equal(manifest.runtime, "v24.18.0");
  assert.equal(manifest.runner, "linux-x64");
  assert.equal(manifest.performance.filename, performancePath.split("/").at(-1));
  assert.equal(manifest.conformance.filename, conformancePath.split("/").at(-1));
  assert.equal(manifest.performance.sha256, checkedSha256(performancePath));
  assert.equal(manifest.conformance.sha256, checkedSha256(conformancePath));
  assert.equal(
    manifest.performance.governedMedianMicroseconds,
    performance.results.governed.medianMicrosecondsPerOperation
  );
  assert.equal(
    manifest.performance.governedCoefficientOfVariation,
    performance.results.governed.coefficientOfVariation
  );
  assert.equal(manifest.conformance.passed, conformance.summary.passed);
  assert.equal(manifest.conformance.total, conformance.summary.total);
  assert.equal(manifest.conformance.allPassed, conformance.summary.allPassed);
  assert.equal(
    checkedSha256(manifestPath),
    "4b6d26a0f303c312124685cfa8ea0e257caf09e7f07db7d7bb9298301d4dd974"
  );
  assert.equal(manifest.performance.publicationCandidate, true);
  assert.equal(manifest.conformance.allPassed, true);
});

test("superseded Node 20 action-runtime run remains a truthful passing historical record", () => {
  const expectedCommit = "29c1b9ec0fb8af162d1b73f950851263d35a0527";
  const performancePath =
    "../benchmarks/results/2026-07-19-mges-performance-ubuntu24-node24-main-29c1b9ec.json";
  const conformancePath =
    "../benchmarks/results/2026-07-19-mges-conformance-ubuntu24-node24-main-29c1b9ec.json";
  const manifestPath =
    "../benchmarks/results/2026-07-19-mges-evidence-manifest-ubuntu24-node24-main-29c1b9ec.json";
  const performance = checkedResult(performancePath);
  const conformance = checkedResult(conformancePath);
  const manifest = checkedResult(manifestPath);

  assert.equal(performance.repository.commit, expectedCommit);
  assert.equal(conformance.repository.commit, expectedCommit);
  assert.equal(performance.repository.workingTreeDirty, false);
  assert.equal(conformance.repository.workingTreeDirty, false);
  assert.equal(performance.quality.publicationCandidate, true);
  assert.deepEqual(conformance.summary, { total: 14, passed: 14, failed: 0, allPassed: true });
  assert.equal(manifest.gitCommit, expectedCommit);
  assert.equal(manifest.performance.sha256, checkedSha256(performancePath));
  assert.equal(manifest.conformance.sha256, checkedSha256(conformancePath));
  assert.equal(
    checkedSha256(manifestPath),
    "5daf94a9ad742d7bab08f70331db47e87ca4206671f509371a8699b4943b3370"
  );
  verifyRecordedFingerprint(performance);
  verifyRecordedFingerprint(conformance);
});

test("superseded 0.3.1 candidate MGES artifacts remain internally consistent historical records", () => {
  const expectedCommit = "513a7a0bf3711e26ca0e82b4ae1a1663553cc345";
  const performance = checkedResult(
    "../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b.json"
  );
  const conformance = checkedResult(
    "../benchmarks/results/2026-07-19-mges-conformance-windows-node24-main-513a7a0b.json"
  );
  const reviewAttempts = [1, 2, 3].map((attempt) => checkedResult(
    `../benchmarks/results/2026-07-19-mges-performance-windows-node24-main-513a7a0b-review-attempt${attempt}.json`
  ));

  assert.equal(performance.repository.commit, expectedCommit);
  assert.equal(conformance.repository.commit, expectedCommit);
  assert.equal(performance.repository.workingTreeDirty, false);
  assert.equal(conformance.repository.workingTreeDirty, false);
  assert.equal(performance.quality.publicationCandidate, true);
  assert.equal(performance.results.governed.sampleCount, 30);
  assert.equal(performance.results.governed.medianMicrosecondsPerOperation, 139.173);
  assert.equal(performance.results.governed.coefficientOfVariation, 0.074764);
  assert.deepEqual(conformance.summary, { total: 14, passed: 14, failed: 0, allPassed: true });
  verifyRecordedFingerprint(performance);
  verifyRecordedFingerprint(conformance);

  for (const attempt of reviewAttempts) {
    assert.equal(attempt.repository.commit, expectedCommit);
    assert.equal(attempt.repository.workingTreeDirty, false);
    assert.equal(attempt.quality.publicationCandidate, false);
    assert.ok(attempt.results.governed.coefficientOfVariation > 0.1);
    assert.equal(attempt.sourceFingerprint.combined, performance.sourceFingerprint.combined);
    verifyRecordedFingerprint(attempt);
  }
});
