import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { Writable } from "node:stream";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatOutput,
  readArgs,
  run,
  writeOutput
} from "../bin/ajnas-crawl.js";

const temporaryFiles = new Set();

afterEach(async () => {
  await Promise.all([...temporaryFiles].map((file) => rm(file, { force: true })));
  temporaryFiles.clear();
});

function captureStream({ failWith = null } = {}) {
  let body = "";
  const stream = new Writable({
    write(chunk, encoding, callback) {
      if (failWith) {
        callback(failWith);
        return;
      }
      body += chunk.toString();
      callback();
    }
  });
  return { stream, body: () => body };
}

const emptyResult = {
  pages: [],
  failures: [],
  stats: {
    requests: 0,
    retries: 0,
    skippedByRobots: 0,
    skippedByOrigin: 0,
    queueDropped: 0,
    pages: 0,
    failures: 0,
    queued: 0,
    seen: 0,
    durationMs: 0,
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:00.000Z"
  }
};

test("CLI accepts bounded crawl controls and repeatable allowed origins", async () => {
  const observed = [];
  const stdout = captureStream();
  const code = await run([
    "https://seed.example/start",
    "--allowed-origin", "https://docs.example/path",
    "--allowed-origin=https://api.example:8443/resource",
    "--max-pages", "8",
    "--max-requests=21",
    "--max-depth", "3",
    "--max-bytes", "4096",
    "--max-duration", "900",
    "--max-retries", "1",
    "--feeds",
    "--max-feed-links", "12",
    "--max-feed-items", "40",
    "--concurrency", "2",
    "--delay", "0",
    "--timeout", "500"
  ], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    crawler: async (options) => {
      observed.push(options);
      return emptyResult;
    }
  });

  assert.equal(code, 0);
  assert.equal(stdout.body(), "[]\n");
  assert.equal(observed.length, 1);
  assert.deepEqual(observed[0].allowedOrigins, [
    "https://seed.example",
    "https://docs.example",
    "https://api.example:8443"
  ]);
  assert.equal(observed[0].sameOrigin, false);
  assert.equal(observed[0].maxPages, 8);
  assert.equal(observed[0].maxRequests, 21);
  assert.equal(observed[0].maxDepth, 3);
  assert.equal(observed[0].maxBytes, 4096);
  assert.equal(observed[0].maxDurationMs, 900);
  assert.equal(observed[0].maxRetries, 1);
  assert.equal(observed[0].includeFeeds, true);
  assert.equal(observed[0].maxFeedLinks, 12);
  assert.equal(observed[0].maxFeedItems, 40);
});

test("CLI remains same-origin by default and rejects unbounded cross-origin mode", async () => {
  let observed;
  await run(["https://seed.example/start"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    crawler: async (options) => {
      observed = options;
      return emptyResult;
    }
  });

  assert.equal(observed.sameOrigin, true);
  assert.deepEqual(observed.allowedOrigins, []);
  assert.throws(
    () => readArgs(["https://seed.example", "--all-origins"]),
    /no longer supported.*--allowed-origin/i
  );
});

test("CLI reports missing, malformed, and out-of-range option values", () => {
  for (const [argv, pattern] of [
    [["https://seed.example", "--max-pages"], /--max-pages requires a value/],
    [["https://seed.example", "--max-pages", "--stats"], /--max-pages requires a value/],
    [["https://seed.example", "--max-pages", "many"], /--max-pages must be an integer/],
    [["https://seed.example", "--max-pages", "1.5"], /--max-pages must be an integer/],
    [["https://seed.example", "--max-depth", "-1"], /--max-depth must be an integer from 0 to 100/],
    [["https://seed.example", "--max-bytes", "100"], /--max-bytes must be an integer from 1024/],
    [["https://seed.example", "--max-retries", "6"], /--max-retries must be an integer from 0 to 5/],
    [["https://seed.example", "--allowed-origin"], /--allowed-origin requires a value/],
    [["https://seed.example", "--allowed-origin", "file:\/\/\/tmp"], /absolute HTTP\(S\)/],
    [["https://seed.example", "--unknown"], /Unknown option: --unknown/]
  ]) {
    assert.throws(() => readArgs(argv), pattern);
  }
});

test("default, JSONL, and detailed formats are stable and unambiguous", () => {
  const result = {
    ...emptyResult,
    pages: [{ url: "https://one.example/" }, { url: "https://two.example/" }]
  };

  assert.equal(
    formatOutput(result, { detailed: false, jsonl: false }),
    `${JSON.stringify(result.pages, null, 2)}\n`
  );
  assert.equal(
    formatOutput(result, { detailed: false, jsonl: true }),
    '{"url":"https://one.example/"}\n{"url":"https://two.example/"}\n'
  );
  assert.equal(
    formatOutput(result, { detailed: true, jsonl: false }),
    `${JSON.stringify(result, null, 2)}\n`
  );
  assert.equal(formatOutput(emptyResult, { detailed: false, jsonl: true }), "");
  assert.throws(
    () => readArgs(["https://seed.example", "--detailed", "--jsonl"]),
    /cannot be used together/
  );
});

test("stats use stderr and fail-on-error preserves machine-readable stdout", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const result = {
    ...emptyResult,
    failures: [{
      url: "https://seed.example/failed",
      phase: "page",
      code: "CRAWL_ERROR",
      error: "fixture failure"
    }],
    stats: { ...emptyResult.stats, failures: 1 }
  };

  const code = await run([
    "https://seed.example",
    "--stats",
    "--fail-on-error"
  ], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    crawler: async (options) => {
      await options.onError(result.failures[0]);
      return result;
    }
  });

  assert.equal(code, 2);
  assert.equal(stdout.body(), "[]\n");
  assert.match(stderr.body(), /^crawl warning: https:\/\/seed\.example\/failed: fixture failure\n/);
  assert.match(stderr.body(), /crawl stats: \{"requests":0/);
});

test("output files are complete before writeOutput resolves", async () => {
  const file = fileURLToPath(new URL(`./.crawler-cli-${process.pid}-${Date.now()}.json`, import.meta.url));
  temporaryFiles.add(file);
  await writeOutput(emptyResult, {
    detailed: true,
    jsonl: false,
    output: file
  });

  assert.equal(await readFile(file, "utf8"), `${JSON.stringify(emptyResult, null, 2)}\n`);
});

test("output stream failures reject instead of reporting false success", async () => {
  const failure = new Error("disk fixture failed");
  const output = captureStream({ failWith: failure });

  await assert.rejects(
    () => writeOutput(emptyResult, {
      detailed: false,
      jsonl: false,
      output: "fixture.json"
    }, {
      createOutputStream: () => output.stream
    }),
    /disk fixture failed/
  );
});
