# Ajnas Agent Crawler

Maqam is the enterprise agent framework console built on Ajnas Agent Crawler. The name comes from the idea of composing smaller trusted units into a larger controlled system: skills, tools, policy, evidence, and runtime traces become one governed workflow.

The package still includes a fast, respectful crawler, but it now also ships local framework primitives and a runnable Maqam console for governed research runs.

## Principles

- Respect `robots.txt` by default.
- Use a clear user agent.
- Rate-limit per origin.
- Avoid bypassing access controls, paywalls, anti-bot systems, or private content.
- No AI dependency.
- No external hosted service.
- JSON/JSONL output that agents can consume directly.

## Install

```bash
npm install -g ajnas-agent-crawler
```

Or run without global install:

```bash
npx ajnas-agent-crawler https://example.com --max-pages 20 --jsonl
```

## CLI

```bash
ajnas-crawl https://example.com --max-pages 50 --jsonl --output crawl.jsonl
```

Options:

- `--max-pages <n>`: maximum pages to return. Default: `50`
- `--concurrency <n>`: concurrent workers. Default: `4`
- `--delay <ms>`: minimum delay per origin. Default: `250`
- `--timeout <ms>`: request timeout. Default: `15000`
- `--sitemaps`: discover URLs from robots.txt sitemaps and `/sitemap.xml`
- `--all-origins`: allow crawling across discovered origins
- `--jsonl`: output JSON Lines instead of a JSON array
- `--output <file>`: write output to a file
- `--user-agent <ua>`: custom user agent

## Maqam Console

```bash
npm run maqam
```

Then open `http://127.0.0.1:8787`.

The console runs a governed research workflow through:

- `PolicyEngine`: allows or denies goals and tool calls.
- `ToolGateway`: routes all external work through policy checks.
- `EvidenceLedger`: records source-backed evidence and claim support.
- `AgentRuntime`: executes workflow tasks with traces and retries.
- `createResearchWorkflow`: composes crawler collection, synthesis, and quality checks.

Brand assets live in `app/assets/`, including `maqam-logo.svg` and the generated `maqam-brand-board.png`.

## Library API

```js
import { crawl } from "ajnas-agent-crawler";

const pages = await crawl({
  seeds: ["https://example.com"],
  maxPages: 25,
  concurrency: 4,
  includeSitemaps: true,
  onPage(page) {
    console.log(page.url, page.title);
  }
});

console.log(pages[0].markdown);
```

## Framework SDK

```js
import {
  AgentRuntime,
  EvidenceLedger,
  PolicyEngine,
  ToolGateway,
  createCrawlerTool,
  createResearchWorkflow
} from "ajnas-agent-crawler";

const evidenceLedger = new EvidenceLedger();
const policyEngine = new PolicyEngine({
  allowedTools: ["crawler"],
  allowedOrigins: ["https://github.com", "https://www.npmjs.com"]
});
const gateway = new ToolGateway({ policyEngine, evidenceLedger });
gateway.registerTool("crawler", createCrawlerTool());

const runtime = new AgentRuntime({ policyEngine, evidenceLedger, toolGateway: gateway });
const result = await runtime.runWorkflow(
  createResearchWorkflow({
    seeds: ["https://github.com/apify/crawlee"],
    maxPages: 5
  }),
  {
    objective: "Research permissive OSS agent framework projects",
    allowedTools: ["crawler"],
    allowedOrigins: ["https://github.com"]
  }
);

console.log(result.outputs.synthesize_report.candidates);
```

## Output shape

```json
{
  "url": "https://example.com/",
  "canonical": "https://example.com/",
  "title": "Example",
  "description": "Example description",
  "h1": "Example",
  "text": "Readable text...",
  "markdown": "# Example\n\nReadable markdown...",
  "links": ["https://example.com/about"],
  "fetchedAt": "2026-06-27T00:00:00.000Z",
  "status": 200,
  "contentType": "text/html; charset=utf-8"
}
```

## What this is not

This is not a stealth scraper and does not include bypass tooling. It will not help evade login walls, paywalls, anti-bot protections, CAPTCHA, robots.txt, or authorization boundaries.

## Development

```bash
npm install
npm test
```

## Publish

```bash
npm publish --access public
```

## License

MIT
