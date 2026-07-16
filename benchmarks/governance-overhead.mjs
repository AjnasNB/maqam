import process from "node:process";
import { performance } from "node:perf_hooks";
import { PolicyEngine, ToolGateway } from "../src/index.js";

const DEFAULTS = Object.freeze({
  iterations: 5_000,
  samples: 7,
  warmup: 500
});

function readPositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1_000_000) {
    throw new TypeError(`${name} must be an integer from 1 to 1000000.`);
  }
  return parsed;
}

function readOptions(argv) {
  const options = { json: false, ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--iterations") {
      options.iterations = readPositiveInteger(argv[++index], "--iterations");
    } else if (argument === "--samples") {
      options.samples = readPositiveInteger(argv[++index], "--samples");
    } else if (argument === "--warmup") {
      options.warmup = readPositiveInteger(argv[++index], "--warmup");
    } else {
      throw new TypeError(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function percentile(values, probability) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * probability) - 1));
  return sorted[index];
}

async function measure(operation, iterations, warmup) {
  for (let index = 0; index < warmup; index += 1) await operation(index);
  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) await operation(index);
  return ((performance.now() - startedAt) * 1_000_000) / iterations;
}

function summarize(values) {
  return {
    medianNsPerCall: Math.round(percentile(values, 0.5)),
    p95SampleNsPerCall: Math.round(percentile(values, 0.95)),
    minNsPerCall: Math.round(Math.min(...values)),
    maxNsPerCall: Math.round(Math.max(...values))
  };
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  const input = Object.freeze({ value: 41, nested: Object.freeze({ release: "0.2.x" }) });
  const handler = async (value) => value.value + 1;
  const directSamples = [];
  const governedSamples = [];

  for (let sample = 0; sample < options.samples; sample += 1) {
    directSamples.push(await measure(() => handler(input), options.iterations, options.warmup));

    const gateway = new ToolGateway({
      policyEngine: new PolicyEngine({
        allowedTools: ["echo"],
        maxToolCalls: Number.MAX_SAFE_INTEGER
      })
    });
    gateway.registerTool("echo", handler, { effects: [] });
    governedSamples.push(await measure(
      () => gateway.call("echo", input, { runId: `sample_${sample}` }),
      options.iterations,
      options.warmup
    ));
  }

  const direct = summarize(directSamples);
  const governed = summarize(governedSamples);
  const overheadNs = Math.max(0, governed.medianNsPerCall - direct.medianNsPerCall);
  const result = {
    benchmark: "maqam-governed-local-call-overhead",
    measuredAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: process.env.PROCESSOR_IDENTIFIER || "not reported"
    },
    fixture: {
      tool: "echo",
      input,
      policy: "allowedTools: [echo]",
      handler: "async in-process return",
      iterationsPerSample: options.iterations,
      samples: options.samples,
      warmupIterations: options.warmup
    },
    results: {
      direct,
      governed,
      medianAddedNsPerCall: overheadNs,
      medianAddedMicrosecondsPerCall: Number((overheadNs / 1_000).toFixed(3)),
      medianRatio: Number((governed.medianNsPerCall / Math.max(1, direct.medianNsPerCall)).toFixed(2))
    },
    interpretation: "Measures one local allowed ToolGateway call against the same direct async handler. It is not a competitor benchmark, network benchmark, security score, or production SLA."
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write([
    "Maqam local governance overhead benchmark",
    `Node ${result.environment.node} · ${result.environment.platform}/${result.environment.architecture}`,
    `${options.samples} samples × ${options.iterations.toLocaleString()} measured calls (${options.warmup.toLocaleString()} warmup calls/sample)`,
    "",
    `Direct handler median:  ${(direct.medianNsPerCall / 1_000).toFixed(3)} µs/call`,
    `Governed call median:   ${(governed.medianNsPerCall / 1_000).toFixed(3)} µs/call`,
    `Added median overhead:  ${result.results.medianAddedMicrosecondsPerCall.toFixed(3)} µs/call`,
    `Median ratio:           ${result.results.medianRatio.toFixed(2)}×`,
    "",
    result.interpretation,
    ""
  ].join("\n"));
}

main().catch((error) => {
  process.stderr.write(`${error.message || String(error)}\n`);
  process.exitCode = 1;
});
