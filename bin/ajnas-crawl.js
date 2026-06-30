#!/usr/bin/env node
import { createWriteStream } from "node:fs";
import { crawl } from "../src/index.js";

function usage() {
  console.log(`
Maqam Crawler

Usage:
  maqam-crawl <url> [more urls...] [options]

Options:
  --max-pages <n>       Maximum pages to return. Default: 50
  --concurrency <n>     Concurrent workers. Default: 4
  --delay <ms>          Minimum delay per origin. Default: 250
  --timeout <ms>        Request timeout. Default: 15000
  --sitemaps            Discover URLs from robots.txt sitemaps and /sitemap.xml
  --all-origins         Allow crawling across origins discovered from links
  --jsonl               Output JSON Lines instead of a JSON array
  --output <file>       Write output to a file
  --user-agent <ua>     Custom user agent
  --help                Show this help

This crawler is Maqam's first governed connector. It respects robots.txt by default and does not bypass access controls.
`);
}

function readArgs(argv) {
  const urls = [];
  const options = {
    maxPages: 50,
    concurrency: 4,
    delayMs: 250,
    timeoutMs: 15_000,
    includeSitemaps: false,
    sameOrigin: true,
    jsonl: false,
    output: null,
    userAgent: undefined
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--max-pages") {
      options.maxPages = Number(argv[++i]);
    } else if (arg === "--concurrency") {
      options.concurrency = Number(argv[++i]);
    } else if (arg === "--delay") {
      options.delayMs = Number(argv[++i]);
    } else if (arg === "--timeout") {
      options.timeoutMs = Number(argv[++i]);
    } else if (arg === "--sitemaps") {
      options.includeSitemaps = true;
    } else if (arg === "--all-origins") {
      options.sameOrigin = false;
    } else if (arg === "--jsonl") {
      options.jsonl = true;
    } else if (arg === "--output" || arg === "-o") {
      options.output = argv[++i];
    } else if (arg === "--user-agent") {
      options.userAgent = argv[++i];
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      urls.push(arg);
    }
  }

  return { urls, options };
}

function writeOutput(pages, options) {
  const body = options.jsonl
    ? pages.map((page) => JSON.stringify(page)).join("\n") + "\n"
    : JSON.stringify(pages, null, 2) + "\n";

  if (!options.output) {
    process.stdout.write(body);
    return;
  }
  const stream = createWriteStream(options.output, { encoding: "utf8" });
  stream.end(body);
}

async function main() {
  const { urls, options } = readArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!urls.length) {
    usage();
    process.exitCode = 1;
    return;
  }

  const pages = await crawl({
    seeds: urls,
    maxPages: options.maxPages,
    concurrency: options.concurrency,
    delayMs: options.delayMs,
    timeoutMs: options.timeoutMs,
    includeSitemaps: options.includeSitemaps,
    sameOrigin: options.sameOrigin,
    userAgent: options.userAgent,
    onError: (failure) => {
      process.stderr.write(`crawl warning: ${failure.url}: ${failure.error}\n`);
    }
  });

  writeOutput(pages, options);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
