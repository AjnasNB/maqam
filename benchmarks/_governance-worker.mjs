import process from "node:process";
import { PolicyEngine } from "../src/framework/policy.js";
import { ToolGateway } from "../src/framework/tool-gateway.js";

const MAX_ITERATIONS = 10_000_000;
const INPUT = Object.freeze({
  value: 41,
  nested: Object.freeze({ release: "0.2.x" })
});

function integer(value, name, { minimum = 0 } = {}) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > MAX_ITERATIONS) {
    throw new TypeError(`${name} must be an integer from ${minimum} to ${MAX_ITERATIONS}.`);
  }
  return parsed;
}

function options(argv) {
  const parsed = { variant: null, iterations: null, warmup: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--variant") parsed.variant = argv[++index];
    else if (argument === "--iterations") {
      parsed.iterations = integer(argv[++index], "--iterations", { minimum: 1 });
    } else if (argument === "--warmup") {
      parsed.warmup = integer(argv[++index], "--warmup");
    } else {
      throw new TypeError(`Unknown worker option: ${argument}`);
    }
  }
  if (!["direct", "governed"].includes(parsed.variant)) {
    throw new TypeError("--variant must be 'direct' or 'governed'.");
  }
  if (parsed.iterations === null) throw new TypeError("--iterations is required.");
  if (parsed.warmup === null) throw new TypeError("--warmup is required.");
  return parsed;
}

const handler = async (input) => input.value + 1;

function createOperation(variant) {
  if (variant === "direct") {
    return {
      operation: () => handler(INPUT),
      verify(iterations) {
        return { expectedResult: 42, governedTraceEntries: null, governedCallCount: null, iterations };
      }
    };
  }

  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: ["echo"],
      maxToolCalls: Number.MAX_SAFE_INTEGER
    })
  });
  gateway.registerTool("echo", handler, { effects: [] });
  return {
    operation: () => gateway.call("echo", INPUT, { runId: "benchmark_run" }),
    verify(iterations) {
      if (gateway.trace.length !== iterations) {
        throw new Error(`Expected ${iterations} trace entries; received ${gateway.trace.length}.`);
      }
      if (gateway.getCallCount("benchmark_run") !== iterations) {
        throw new Error(`Expected ${iterations} governed calls; received ${gateway.getCallCount("benchmark_run")}.`);
      }
      return {
        expectedResult: 42,
        governedTraceEntries: gateway.trace.length,
        governedCallCount: gateway.getCallCount("benchmark_run"),
        iterations
      };
    }
  };
}

async function execute(operation, iterations) {
  let checksum = 0;
  for (let index = 0; index < iterations; index += 1) {
    checksum += await operation();
  }
  return checksum;
}

async function main() {
  const parsed = options(process.argv.slice(2));

  // Warm up an independent fixture. The measured governed fixture therefore
  // starts with an empty trace and zero run-call state in every child process.
  const warmupFixture = createOperation(parsed.variant);
  await execute(warmupFixture.operation, parsed.warmup);

  const measuredFixture = createOperation(parsed.variant);
  const startedAt = process.hrtime.bigint();
  const checksum = await execute(measuredFixture.operation, parsed.iterations);
  const elapsedNsBigInt = process.hrtime.bigint() - startedAt;
  const verification = measuredFixture.verify(parsed.iterations);
  const expectedChecksum = verification.expectedResult * parsed.iterations;
  if (checksum !== expectedChecksum) {
    throw new Error(`Benchmark checksum mismatch: expected ${expectedChecksum}; received ${checksum}.`);
  }

  const elapsedNs = Number(elapsedNsBigInt);
  if (!Number.isSafeInteger(elapsedNs) || elapsedNs <= 0) {
    throw new Error("Measured duration was outside the safe positive integer range.");
  }
  process.stdout.write(`${JSON.stringify({
    variant: parsed.variant,
    iterations: parsed.iterations,
    warmupIterations: parsed.warmup,
    elapsedNs,
    nsPerOperation: elapsedNs / parsed.iterations,
    operationsPerSecond: (parsed.iterations * 1_000_000_000) / elapsedNs,
    checksum,
    verification
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exitCode = 1;
});
