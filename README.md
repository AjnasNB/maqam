# Ajnas Agent Crawler

A fast, respectful web crawler for agent workflows. It extracts page title, description, text, markdown, links, status, content type, and fetch timestamps into JSON or JSONL.

This package is designed for research agents, RAG ingestion, documentation indexing, QA crawling, and content inventory jobs that need a clean Node.js API and a simple CLI.

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
