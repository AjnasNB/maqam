import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SUITE_VERSION = "1.1.0";
const SCHEMA = "maqam.benchmark.performance/v1";
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const WORKER = fileURLToPath(new URL("./_governance-worker.mjs", import.meta.url));
const DEFAULTS = Object.freeze({
  samples: 30,
  directIterations: 5_000_000,
  governedIterations: 5_000,
  directWarmup: 250_000,
  governedWarmup: 500,
  bootstrapResamples: 10_000
});
const LIMITS = Object.freeze({
  samples: 200,
  iterations: 10_000_000,
  warmup: 10_000_000,
  bootstrapResamples: 100_000
});
const SOURCE_FILES = Object.freeze([
  "benchmarks/governance-suite.mjs",
  "benchmarks/_governance-worker.mjs",
  "src/framework/tool-gateway.js",
  "src/framework/policy.js",
  "src/framework/audit.js",
  "src/framework/boundary.js",
  "src/framework/evidence-scope.js",
  "src/framework/errors.js",
  "package-lock.json"
]);

function integer(value, name, { minimum = 0, maximum } = {}) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function nextValue(argv, index, name) {
  if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
    throw new TypeError(`${name} requires a value.`);
  }
  return argv[index + 1];
}

function readOptions(argv) {
  const options = { json: false, output: null, ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--output") options.output = nextValue(argv, index++, argument);
    else if (argument === "--samples") {
      options.samples = integer(nextValue(argv, index++, argument), argument, {
        minimum: 2,
        maximum: LIMITS.samples
      });
    } else if (argument === "--direct-iterations") {
      options.directIterations = integer(nextValue(argv, index++, argument), argument, {
        minimum: 1,
        maximum: LIMITS.iterations
      });
    } else if (argument === "--governed-iterations") {
      options.governedIterations = integer(nextValue(argv, index++, argument), argument, {
        minimum: 1,
        maximum: LIMITS.iterations
      });
    } else if (argument === "--direct-warmup") {
      options.directWarmup = integer(nextValue(argv, index++, argument), argument, {
        maximum: LIMITS.warmup
      });
    } else if (argument === "--governed-warmup") {
      options.governedWarmup = integer(nextValue(argv, index++, argument), argument, {
        maximum: LIMITS.warmup
      });
    } else if (argument === "--bootstrap-resamples") {
      options.bootstrapResamples = integer(nextValue(argv, index++, argument), argument, {
        minimum: 100,
        maximum: LIMITS.bootstrapResamples
      });
    } else {
      throw new TypeError(`Unknown option: ${argument}`);
    }
  }
  if (options.output !== null && options.output.trim() === "") {
    throw new TypeError("--output must be a non-empty path.");
  }
  return options;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quantile(values, probability) {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function rounded(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function bootstrapMedianInterval(values, resamples, seed) {
  const random = createPrng(seed);
  const medians = new Array(resamples);
  for (let sample = 0; sample < resamples; sample += 1) {
    const resampled = new Array(values.length);
    for (let index = 0; index < values.length; index += 1) {
      resampled[index] = values[Math.floor(random() * values.length)];
    }
    medians[sample] = median(resampled);
  }
  return {
    method: "deterministic-percentile-bootstrap",
    confidenceLevel: 0.95,
    resamples,
    seed: `0x${seed.toString(16).padStart(8, "0")}`,
    lowNsPerOperation: rounded(quantile(medians, 0.025)),
    highNsPerOperation: rounded(quantile(medians, 0.975)),
    lowMicrosecondsPerOperation: rounded(quantile(medians, 0.025) / 1_000),
    highMicrosecondsPerOperation: rounded(quantile(medians, 0.975) / 1_000)
  };
}

function summarize(samples, bootstrapResamples, seed) {
  const values = samples.map((sample) => sample.nsPerOperation);
  const elapsed = samples.map((sample) => sample.elapsedNs);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.length > 1
    ? values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1)
    : 0;
  const standardDeviation = Math.sqrt(variance);
  const medianValue = median(values);
  const absoluteDeviations = values.map((value) => Math.abs(value - medianValue));
  return {
    sampleCount: values.length,
    medianNsPerOperation: rounded(medianValue),
    medianMicrosecondsPerOperation: rounded(medianValue / 1_000),
    meanNsPerOperation: rounded(mean),
    standardDeviationNsPerOperation: rounded(standardDeviation),
    coefficientOfVariation: mean === 0 ? null : rounded(standardDeviation / mean, 6),
    medianAbsoluteDeviationNsPerOperation: rounded(median(absoluteDeviations)),
    minimumNsPerOperation: rounded(Math.min(...values)),
    p05SampleMeanNsPerOperation: rounded(quantile(values, 0.05)),
    p95SampleMeanNsPerOperation: rounded(quantile(values, 0.95)),
    maximumNsPerOperation: rounded(Math.max(...values)),
    operationsPerSecondAtMedian: rounded(1_000_000_000 / medianValue),
    medianTimedBatchMs: rounded(median(elapsed) / 1_000_000),
    bootstrapMedian95Interval: bootstrapMedianInterval(values, bootstrapResamples, seed)
  };
}

function runWorker(variant, iterations, warmup) {
  const completed = spawnSync(process.execPath, [
    WORKER,
    "--variant", variant,
    "--iterations", String(iterations),
    "--warmup", String(warmup)
  ], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 4 * 1024 * 1024
  });
  if (completed.error) throw completed.error;
  if (completed.status !== 0) {
    throw new Error(`${variant} worker failed (${completed.status}): ${completed.stderr.trim()}`);
  }
  if (completed.stderr !== "") {
    throw new Error(`${variant} worker wrote unexpected stderr: ${completed.stderr.trim()}`);
  }
  let result;
  try {
    result = JSON.parse(completed.stdout);
  } catch (cause) {
    throw new Error(`${variant} worker returned invalid JSON.`, { cause });
  }
  if (result.variant !== variant || result.iterations !== iterations
    || !Number.isFinite(result.nsPerOperation) || result.nsPerOperation <= 0) {
    throw new Error(`${variant} worker returned an invalid measurement.`);
  }
  return result;
}

function gitMetadata() {
  const run = (...args) => spawnSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    windowsHide: true
  });
  const commit = run("rev-parse", "HEAD");
  const status = run("status", "--porcelain", "--untracked-files=all");
  if (commit.status !== 0 || status.status !== 0) {
    return { available: false, commit: null, workingTreeDirty: null };
  }
  return {
    available: true,
    commit: commit.stdout.trim(),
    workingTreeDirty: status.stdout.trim() !== ""
  };
}

function sourceFingerprint() {
  const files = SOURCE_FILES.map((path) => {
    const absolute = resolve(REPOSITORY_ROOT, path);
    if (!existsSync(absolute)) throw new Error(`Fingerprint source is missing: ${path}`);
    return {
      path,
      sha256: createHash("sha256").update(readFileSync(absolute)).digest("hex")
    };
  });
  const combined = createHash("sha256");
  for (const file of files) combined.update(`${file.path}\0${file.sha256}\n`);
  return { algorithm: "sha256", combined: combined.digest("hex"), files };
}

function environmentMetadata() {
  const cpus = os.cpus();
  const speeds = cpus.map((cpu) => cpu.speed).filter(Number.isFinite);
  return {
    runtime: {
      node: process.version,
      v8: process.versions.v8,
      uv: process.versions.uv
    },
    operatingSystem: {
      type: os.type(),
      release: os.release(),
      platform: process.platform,
      architecture: process.arch
    },
    processor: {
      model: cpus[0]?.model?.trim() || "not reported",
      logicalCpuCount: cpus.length,
      reportedSpeedMHz: speeds.length
        ? { minimum: Math.min(...speeds), maximum: Math.max(...speeds) }
        : null
    },
    totalMemoryBytes: os.totalmem(),
    timer: {
      api: "process.hrtime.bigint",
      unit: "nanoseconds",
      monotonic: true
    },
    isolation: {
      freshProcessPerObservation: true,
      cpuAffinityControlled: false,
      cpuFrequencyGovernorControlled: false,
      backgroundLoadControlled: false
    }
  };
}

function qualityChecks(options, direct, governed) {
  const checks = [
    {
      id: "sample-count-at-least-30",
      required: true,
      passed: options.samples >= 30,
      observed: options.samples,
      threshold: 30
    },
    {
      id: "direct-cv-at-most-10-percent",
      required: false,
      passed: direct.coefficientOfVariation !== null && direct.coefficientOfVariation <= 0.10,
      observed: direct.coefficientOfVariation,
      threshold: 0.10
    },
    {
      id: "governed-cv-at-most-10-percent",
      required: true,
      passed: governed.coefficientOfVariation !== null && governed.coefficientOfVariation <= 0.10,
      observed: governed.coefficientOfVariation,
      threshold: 0.10
    },
    {
      id: "direct-median-timed-batch-at-least-100ms",
      required: true,
      passed: direct.medianTimedBatchMs >= 100,
      observed: direct.medianTimedBatchMs,
      threshold: 100
    },
    {
      id: "governed-median-timed-batch-at-least-100ms",
      required: true,
      passed: governed.medianTimedBatchMs >= 100,
      observed: governed.medianTimedBatchMs,
      threshold: 100
    }
  ];
  return {
    projectCriteriaVersion: "2",
    publicationCandidate: checks.every((check) => check.required === false || check.passed),
    checks,
    note: "The direct-path CV is diagnostic because the near-zero baseline is dominated by cross-process CPU-frequency noise. Required checks still enforce 30 samples, governed CV <= 10%, and >= 100 ms median batches for both variants. These are project stability rules, not an external certification or universal benchmark acceptance rule."
  };
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  const suiteStartedAt = new Date();
  const suiteStartedNs = process.hrtime.bigint();
  const samples = { direct: [], governed: [] };
  const rounds = [];

  for (let round = 0; round < options.samples; round += 1) {
    const order = round % 2 === 0 ? ["direct", "governed"] : ["governed", "direct"];
    const roundResult = { round: round + 1, order, observations: [] };
    for (let orderPosition = 0; orderPosition < order.length; orderPosition += 1) {
      const variant = order[orderPosition];
      const iterations = variant === "direct"
        ? options.directIterations
        : options.governedIterations;
      const warmup = variant === "direct" ? options.directWarmup : options.governedWarmup;
      const result = runWorker(variant, iterations, warmup);
      const observation = {
        round: round + 1,
        orderPosition: orderPosition + 1,
        variant,
        iterations,
        warmupIterations: warmup,
        elapsedNs: result.elapsedNs,
        nsPerOperation: rounded(result.nsPerOperation),
        operationsPerSecond: rounded(result.operationsPerSecond),
        checksum: result.checksum,
        verification: result.verification
      };
      samples[variant].push(observation);
      roundResult.observations.push(observation);
    }
    rounds.push(roundResult);
  }

  const direct = summarize(samples.direct, options.bootstrapResamples, 0x4d415141);
  const governed = summarize(samples.governed, options.bootstrapResamples, 0x4d415142);
  const pairedAddedValues = rounds.map((round) => {
    const directObservation = round.observations.find((item) => item.variant === "direct");
    const governedObservation = round.observations.find((item) => item.variant === "governed");
    return governedObservation.nsPerOperation - directObservation.nsPerOperation;
  });
  const pairedSamples = pairedAddedValues.map((nsPerOperation, index) => ({
    elapsedNs: nsPerOperation,
    nsPerOperation,
    round: index + 1
  }));
  const pairedAdded = summarize(pairedSamples, options.bootstrapResamples, 0x4d415143);
  delete pairedAdded.medianTimedBatchMs;
  delete pairedAdded.operationsPerSecondAtMedian;

  const result = {
    schema: SCHEMA,
    suite: {
      name: "Maqam Governance Evaluation Suite",
      shortName: "MGES",
      profile: "local-call-performance",
      version: SUITE_VERSION,
      authority: "Maqam project-defined microbenchmark",
      externallyStandardized: false
    },
    measuredAt: suiteStartedAt.toISOString(),
    executionDurationMs: rounded(Number(process.hrtime.bigint() - suiteStartedNs) / 1_000_000),
    repository: gitMetadata(),
    sourceFingerprint: sourceFingerprint(),
    environment: environmentMetadata(),
    methodology: {
      samplesPerVariant: options.samples,
      order: "Alternating direct/governed then governed/direct paired rounds",
      processIsolation: "Each observation runs in a fresh child process; process startup is outside the timed interval.",
      timing: "One timed sequential batch measured with process.hrtime.bigint().",
      warmup: "Each child warms an independent fixture before creating the measured fixture.",
      interval: "Deterministic percentile bootstrap interval for the sample median; it describes run-to-run sampling uncertainty on this machine, not other machines.",
      directIterationsPerObservation: options.directIterations,
      governedIterationsPerObservation: options.governedIterations,
      directWarmupIterations: options.directWarmup,
      governedWarmupIterations: options.governedWarmup,
      bootstrapResamples: options.bootstrapResamples
    },
    fixture: {
      operation: "Sequential async in-process handler returning input.value + 1",
      input: { value: 41, nested: { release: "0.3.x" } },
      directPath: "Call the same handler directly.",
      governedPath: "Call a registered tool through ToolGateway and an allowlist PolicyEngine with tracing enabled.",
      excluded: [
        "model inference",
        "network I/O",
        "filesystem I/O",
        "durable storage",
        "human review time",
        "process startup",
        "concurrent load"
      ]
    },
    results: { direct, governed, pairedAdded },
    raw: { rounds },
    quality: qualityChecks(options, direct, governed),
    interpretation: "This is a local component microbenchmark for regression tracking. It is not a competitor benchmark, security score, production SLA, globally accepted standard, or evidence of end-to-end agent performance."
  };

  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output !== null) {
    const output = resolve(process.cwd(), options.output);
    if (!existsSync(dirname(output))) {
      throw new Error(`Output directory does not exist: ${dirname(output)}`);
    }
    writeFileSync(output, serialized, { encoding: "utf8", flag: "w" });
  }

  if (options.json) {
    process.stdout.write(serialized);
    return;
  }

  const ci = governed.bootstrapMedian95Interval;
  process.stdout.write([
    "Maqam governed local-call benchmark v1",
    `${options.samples} fresh-process observations/variant; alternating paired order`,
    `${result.environment.runtime.node} | ${process.platform}/${process.arch} | ${result.environment.processor.model}`,
    "",
    `Governed median: ${governed.medianMicrosecondsPerOperation.toFixed(3)} microseconds/call`,
    `95% bootstrap interval for median: ${ci.lowMicrosecondsPerOperation.toFixed(3)}-${ci.highMicrosecondsPerOperation.toFixed(3)} microseconds/call`,
    `Sequential throughput at median: ${governed.operationsPerSecondAtMedian.toFixed(3)} calls/second`,
    `Paired added median: ${pairedAdded.medianMicrosecondsPerOperation.toFixed(3)} microseconds/call`,
    `Governed CV: ${(governed.coefficientOfVariation * 100).toFixed(2)}%`,
    `Project publication checks: ${result.quality.publicationCandidate ? "PASS" : "REVIEW"}`,
    options.output ? `Raw result: ${relative(process.cwd(), resolve(process.cwd(), options.output))}` : "",
    "",
    result.interpretation,
    ""
  ].filter((line, index, values) => line !== "" || values[index - 1] !== "").join("\n"));
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exitCode = 1;
});
