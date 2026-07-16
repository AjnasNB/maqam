# Maqam benchmarks

Maqam publishes reproducible, narrowly scoped measurements instead of claiming to be “faster” than products with different jobs and architectures.

## Local governance overhead

Run:

```bash
npm run benchmark:governance
npm run benchmark:governance -- --json
```

The script compares the same in-process asynchronous handler in two paths:

1. called directly;
2. called through `ToolGateway` with an allowlisted tool and policy evaluation.

Each sample performs a warmup, measures a configurable number of sequential calls, and reports the median and sample spread in nanoseconds per call. The governed path includes input snapshotting and hashing, policy evaluation, limit checks, redacted trace creation, and handler dispatch.

Options:

```text
--iterations <1..1000000>  Measured calls per sample (default: 5000)
--samples <1..1000000>     Number of samples (default: 7)
--warmup <1..1000000>      Warmup calls per sample (default: 500)
--json                     Machine-readable result
```

## How to interpret it

This is a local microbenchmark. It is useful for detecting large performance regressions in Maqam's own governed-call path. It is not:

- a comparison with Microsoft Agent Governance Toolkit, OpenAI Agents SDK, LangGraph, OPA, or any other project;
- a network, crawler, browser, model, persistence, or multi-process benchmark;
- evidence that Maqam is more secure;
- a production latency service-level objective.

Publish a result only with its raw JSON, Node version, operating system, architecture, CPU identifier, fixture, warmup, iteration count, and sample count. Virtualization, power management, background load, runtime version, and hardware can materially change the numbers.

Correctness and security properties are covered by the test suite and the deterministic approval demo, not by this timing measurement.

## Recorded baseline

[`results/2026-07-16-windows-node24.json`](results/2026-07-16-windows-node24.json) records the first reviewed baseline. On that specific Windows x64 / Node 24.15.0 run, the median governed path was `143.912 µs/call`, or `143.825 µs/call` above the deliberately trivial direct-handler baseline.

The large ratio to the direct handler is not a useful product comparison: the baseline does almost no work. The absolute governed-path time and future movement under the same fixture are the useful values. Re-run on your target hardware before making a latency decision.
