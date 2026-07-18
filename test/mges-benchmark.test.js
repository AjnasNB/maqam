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

function verifySourceFingerprint(result) {
  const combined = createHash("sha256");
  for (const file of result.sourceFingerprint.files) {
    const bytes = readFileSync(new URL(`../${file.path}`, import.meta.url));
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert.equal(digest, file.sha256, `${file.path} changed after the recorded MGES run`);
    combined.update(`${file.path}\0${file.sha256}\n`);
  }
  assert.equal(combined.digest("hex"), result.sourceFingerprint.combined);
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

test("previous MGES release artifacts remain internally consistent while 0.3.1 clean-main evidence is pending", () => {
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
