import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const benchmark = fileURLToPath(new URL("../benchmarks/governance-overhead.mjs", import.meta.url));

function runBenchmark(...args) {
  return spawnSync(process.execPath, [benchmark, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true
  });
}

function assertMeasurement(summary, label) {
  for (const key of [
    "medianNsPerCall",
    "p95SampleNsPerCall",
    "minNsPerCall",
    "maxNsPerCall"
  ]) {
    assert.equal(typeof summary[key], "number", `${label}.${key}`);
    assert.equal(Number.isFinite(summary[key]), true, `${label}.${key}`);
    assert.ok(summary[key] >= 0, `${label}.${key}`);
  }
  assert.ok(summary.minNsPerCall <= summary.medianNsPerCall, label);
  assert.ok(summary.medianNsPerCall <= summary.maxNsPerCall, label);
  assert.ok(summary.minNsPerCall <= summary.p95SampleNsPerCall, label);
  assert.ok(summary.p95SampleNsPerCall <= summary.maxNsPerCall, label);
}

test("governance overhead benchmark emits bounded JSON and rejects a missing option value", () => {
  const completed = runBenchmark(
    "--iterations", "3",
    "--samples", "2",
    "--warmup", "1",
    "--json"
  );

  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(completed.stderr, "");
  const report = JSON.parse(completed.stdout);

  assert.equal(report.benchmark, "maqam-governed-local-call-overhead");
  assert.equal(Number.isFinite(Date.parse(report.measuredAt)), true);
  assert.equal(typeof report.environment.node, "string");
  assert.equal(typeof report.environment.platform, "string");
  assert.equal(typeof report.environment.architecture, "string");
  assert.equal(typeof report.environment.cpu, "string");
  assert.deepEqual(report.fixture.input, {
    value: 41,
    nested: { release: "0.2.x" }
  });
  assert.equal(report.fixture.tool, "echo");
  assert.equal(report.fixture.iterationsPerSample, 3);
  assert.equal(report.fixture.samples, 2);
  assert.equal(report.fixture.warmupIterations, 1);

  assertMeasurement(report.results.direct, "results.direct");
  assertMeasurement(report.results.governed, "results.governed");
  for (const key of [
    "medianAddedNsPerCall",
    "medianAddedMicrosecondsPerCall",
    "medianRatio"
  ]) {
    assert.equal(typeof report.results[key], "number", `results.${key}`);
    assert.equal(Number.isFinite(report.results[key]), true, `results.${key}`);
    assert.ok(report.results[key] >= 0, `results.${key}`);
  }
  assert.match(report.interpretation, /not a competitor benchmark/);

  const invalid = runBenchmark("--iterations");
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  assert.match(invalid.stderr, /--iterations must be an integer from 1 to 1000000/);
});
