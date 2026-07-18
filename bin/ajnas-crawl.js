#!/usr/bin/env node
import { createWriteStream, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { crawlDetailed } from "../src/index.js";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const NUMERIC_OPTIONS = new Map([
  ["--max-pages", { key: "maxPages", minimum: 1, maximum: 10_000 }],
  ["--max-requests", { key: "maxRequests", minimum: 1, maximum: 50_000 }],
  ["--max-depth", { key: "maxDepth", minimum: 0, maximum: 100 }],
  ["--max-bytes", { key: "maxBytes", minimum: 1_024, maximum: 50 * 1024 * 1024 }],
  ["--max-duration", { key: "maxDurationMs", minimum: 100, maximum: 3_600_000 }],
  ["--max-retries", { key: "maxRetries", minimum: 0, maximum: 5 }],
  ["--max-feed-links", { key: "maxFeedLinks", minimum: 1, maximum: 200 }],
  ["--max-feed-items", { key: "maxFeedItems", minimum: 1, maximum: 1_000 }],
  ["--concurrency", { key: "concurrency", minimum: 1, maximum: 64 }],
  ["--delay", { key: "delayMs", minimum: 0, maximum: 60_000 }],
  ["--timeout", { key: "timeoutMs", minimum: 100, maximum: 120_000 }]
]);

export function usage() {
  return `
Maqam Crawler

Usage:
  maqam-crawl <url> [more urls...] [options]

Options:
  --max-pages <n>          Maximum pages to return. Default: 50
  --max-requests <n>       Maximum network requests. Core default is budget-derived
  --max-depth <n>          Maximum link depth. Default: 20
  --max-bytes <n>          Maximum bytes per response. Default: 3145728
  --max-duration <ms>      Maximum total crawl duration. Default: 600000
  --max-retries <n>        Retries per request. Default: 2
  --concurrency <n>        Concurrent workers. Default: 4
  --delay <ms>             Minimum delay per origin. Default: 250
  --timeout <ms>           Request timeout. Default: 15000
  --sitemaps               Discover URLs from robots.txt sitemaps and /sitemap.xml
  --feeds                  Discover linked RSS and Atom feeds
  --max-feed-links <n>     Maximum feed links discovered per HTML page. Default: 20
  --max-feed-items <n>     Maximum entries parsed from each feed. Default: 100
  --allowed-origin <url>   Permit one cross-origin target; repeat for each origin
  --detailed               Output { pages, failures, stats } instead of only pages
  --stats                  Write crawl statistics as JSON to stderr
  --fail-on-error          Exit with status 2 if any non-fatal crawl failure occurred
  --jsonl                  Output one page per line (cannot be used with --detailed)
  --output <file>          Write output to a file
  --user-agent <ua>        Custom user agent
  --version                Print the installed Maqam version
  --help                   Show this help

Cross-origin crawling is denied unless every additional origin is named with
--allowed-origin. The old unbounded --all-origins option is intentionally rejected.

This crawler is Maqam's first governed connector. It respects robots.txt by default and does not bypass access controls.
`;
}

function splitOption(arg) {
  if (!arg.startsWith("--")) return { name: arg, inlineValue: undefined };
  const equalsIndex = arg.indexOf("=");
  if (equalsIndex === -1) return { name: arg, inlineValue: undefined };
  return {
    name: arg.slice(0, equalsIndex),
    inlineValue: arg.slice(equalsIndex + 1)
  };
}

function requiredValue(argv, index, option, inlineValue, { numeric = false } = {}) {
  if (inlineValue !== undefined) {
    if (!inlineValue) throw new Error(`${option} requires a value.`);
    return { value: inlineValue, index };
  }
  const value = argv[index + 1];
  const looksLikeAnotherOption = value?.startsWith("-")
    && value !== "-"
    && (!numeric || !/^-\d+$/.test(value));
  if (value === undefined || value === "--" || looksLikeAnotherOption) {
    throw new Error(`${option} requires a value.`);
  }
  return { value, index: index + 1 };
}

function integerValue(value, option, minimum, maximum) {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${option} must be an integer from ${minimum} to ${maximum}.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${option} must be an integer from ${minimum} to ${maximum}.`);
  }
  return number;
}

function originValue(value, option) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${option} requires an absolute HTTP(S) URL or origin.`);
  }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
    throw new Error(`${option} requires an absolute HTTP(S) URL or origin without credentials.`);
  }
  return url.origin;
}

export function readArgs(argv) {
  const urls = [];
  const options = {
    maxPages: 50,
    concurrency: 4,
    delayMs: 250,
    timeoutMs: 15_000,
    includeSitemaps: false,
    includeFeeds: false,
    allowedOrigins: [],
    jsonl: false,
    detailed: false,
    stats: false,
    failOnError: false,
    output: null,
    userAgent: undefined
  };
  let positionalOnly = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (positionalOnly) {
      urls.push(arg);
      continue;
    }
    if (arg === "--") {
      positionalOnly = true;
      continue;
    }

    const { name, inlineValue } = splitOption(arg);
    if (name === "--help" || name === "-h") {
      if (inlineValue !== undefined) throw new Error(`${name} does not accept a value.`);
      options.help = true;
    } else if (name === "--version" || name === "-v") {
      if (inlineValue !== undefined) throw new Error(`${name} does not accept a value.`);
      options.version = true;
    } else if (NUMERIC_OPTIONS.has(name)) {
      const definition = NUMERIC_OPTIONS.get(name);
      const parsed = requiredValue(argv, i, name, inlineValue, { numeric: true });
      i = parsed.index;
      options[definition.key] = integerValue(
        parsed.value,
        name,
        definition.minimum,
        definition.maximum
      );
    } else if (name === "--sitemaps") {
      if (inlineValue !== undefined) throw new Error(`${name} does not accept a value.`);
      options.includeSitemaps = true;
    } else if (name === "--feeds") {
      if (inlineValue !== undefined) throw new Error(`${name} does not accept a value.`);
      options.includeFeeds = true;
    } else if (name === "--allowed-origin") {
      const parsed = requiredValue(argv, i, name, inlineValue);
      i = parsed.index;
      options.allowedOrigins.push(originValue(parsed.value, name));
    } else if (name === "--all-origins") {
      throw new Error("--all-origins is no longer supported. Use repeatable --allowed-origin flags to name each permitted origin.");
    } else if (name === "--detailed") {
      if (inlineValue !== undefined) throw new Error(`${name} does not accept a value.`);
      options.detailed = true;
    } else if (name === "--stats") {
      if (inlineValue !== undefined) throw new Error(`${name} does not accept a value.`);
      options.stats = true;
    } else if (name === "--fail-on-error") {
      if (inlineValue !== undefined) throw new Error(`${name} does not accept a value.`);
      options.failOnError = true;
    } else if (name === "--jsonl") {
      if (inlineValue !== undefined) throw new Error(`${name} does not accept a value.`);
      options.jsonl = true;
    } else if (name === "--output" || name === "-o") {
      const parsed = requiredValue(argv, i, name, inlineValue);
      i = parsed.index;
      options.output = parsed.value === "-" ? null : parsed.value;
    } else if (name === "--user-agent") {
      const parsed = requiredValue(argv, i, name, inlineValue);
      i = parsed.index;
      options.userAgent = parsed.value;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${name}`);
    } else {
      urls.push(arg);
    }
  }

  if (options.detailed && options.jsonl) {
    throw new Error("--detailed and --jsonl cannot be used together; JSONL remains one page object per line.");
  }
  options.allowedOrigins = [...new Set(options.allowedOrigins)];
  return { urls, options };
}

export function formatOutput(result, options) {
  if (options.detailed) return `${JSON.stringify(result, null, 2)}\n`;
  if (options.jsonl) {
    return result.pages.length
      ? `${result.pages.map((page) => JSON.stringify(page)).join("\n")}\n`
      : "";
  }
  return `${JSON.stringify(result.pages, null, 2)}\n`;
}

function writeText(stream, body, { close = false } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      stream.removeListener("error", onError);
      stream.removeListener("finish", onFinish);
      if (error) reject(error);
      else resolve();
    };
    const onError = (error) => finish(error);
    const onFinish = () => finish();
    stream.once("error", onError);
    if (close) {
      stream.once("finish", onFinish);
      stream.end(body);
      return;
    }
    stream.write(body, (error) => finish(error));
  });
}

export async function writeOutput(result, options, {
  stdout = process.stdout,
  createOutputStream = createWriteStream
} = {}) {
  const body = formatOutput(result, options);
  if (!options.output) {
    await writeText(stdout, body);
    return;
  }
  const stream = createOutputStream(options.output, { encoding: "utf8" });
  await writeText(stream, body, { close: true });
}

function crawlOptions(urls, options, onError) {
  const seedOrigins = urls.map((value) => originValue(value, "Seed URL"));
  const permitsCrossOrigin = options.allowedOrigins.length > 0;
  return {
    seeds: urls,
    maxPages: options.maxPages,
    maxRequests: options.maxRequests,
    maxDepth: options.maxDepth,
    maxBytes: options.maxBytes,
    maxDurationMs: options.maxDurationMs,
    maxRetries: options.maxRetries,
    concurrency: options.concurrency,
    delayMs: options.delayMs,
    timeoutMs: options.timeoutMs,
    includeSitemaps: options.includeSitemaps,
    includeFeeds: options.includeFeeds,
    maxFeedLinks: options.maxFeedLinks,
    maxFeedItems: options.maxFeedItems,
    sameOrigin: !permitsCrossOrigin,
    allowedOrigins: permitsCrossOrigin
      ? [...new Set([...seedOrigins, ...options.allowedOrigins])]
      : [],
    userAgent: options.userAgent,
    onError
  };
}

export async function run(argv, {
  crawler = crawlDetailed,
  stdout = process.stdout,
  stderr = process.stderr,
  createOutputStream = createWriteStream
} = {}) {
  const { urls, options } = readArgs(argv);
  if (options.help) {
    await writeText(stdout, usage());
    return 0;
  }
  if (options.version) {
    await writeText(stdout, `${version}\n`);
    return 0;
  }
  if (!urls.length) {
    await writeText(stderr, "At least one HTTP(S) seed URL is required.\n\n");
    await writeText(stderr, usage());
    return 1;
  }

  const result = await crawler(crawlOptions(urls, options, async (failure) => {
    await writeText(stderr, `crawl warning: ${failure.url}: ${failure.error}\n`);
  }));

  await writeOutput(result, options, { stdout, createOutputStream });
  if (options.stats) {
    await writeText(stderr, `crawl stats: ${JSON.stringify(result.stats)}\n`);
  }
  return options.failOnError && result.failures.length > 0 ? 2 : 0;
}

async function main() {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.stack || error.message || String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main();
}
