# Maqam Usage Guide

Maqam is an MIT-licensed Ajnas agent framework for governed workflows. It gives you a small local runtime for building agent systems that can be inspected, policy-checked, and connected to evidence. The crawler is only one built-in connector; Maqam can also govern arbitrary agents and tools through `createAgentTool` and `ToolGateway`.

This guide covers installation, CLI usage, SDK usage, the local console, crawler usage, API reference, common patterns, and troubleshooting.

## Table Of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Local Console](#local-console)
- [Crawler CLI](#crawler-cli)
- [Framework SDK](#framework-sdk)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Build A Custom Workflow](#build-a-custom-workflow)
- [Control Any Agent](#control-any-agent)
- [Control CLI Workers](#control-cli-workers)
- [Register A Custom Tool](#register-a-custom-tool)
- [Use Policy And Approvals](#use-policy-and-approvals)
- [Use Evidence And Claims](#use-evidence-and-claims)
- [Use The Skill Registry](#use-the-skill-registry)
- [HTTP API](#http-api)
- [Security And Compliance Notes](#security-and-compliance-notes)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Install

Maqam requires Node.js 20 or newer.

Global install:

```bash
npm install -g maqam
```

Project install:

```bash
npm install maqam
```

Run from the cloned repository:

```bash
git clone https://github.com/AjnasNB/maqam.git
cd maqam
npm install
npm test
npm run maqam
```

## Quick Start

Start the local web console:

```bash
maqam
```

Open:

```text
http://127.0.0.1:8787
```

Run the crawler CLI:

```bash
maqam-crawl https://example.com --max-pages 10 --jsonl
```

Use the SDK:

```js
import {
  AgentRuntime,
  EvidenceLedger,
  PolicyEngine,
  ToolGateway,
  createAgentTool,
  createCliAgentTool,
  createCrawlerTool,
  createResearchWorkflow
} from "maqam";

const evidenceLedger = new EvidenceLedger();
const policyEngine = new PolicyEngine({
  allowedTools: ["crawler", "summarizer"],
  allowedOrigins: ["https://github.com"]
});

const toolGateway = new ToolGateway({ policyEngine, evidenceLedger });
toolGateway.registerTool("crawler", createCrawlerTool());
toolGateway.registerTool("summarizer", createAgentTool(async (input) => ({
  summary: `Reviewed ${input.topic}`
}), { name: "summarizer" }));
toolGateway.registerTool("localWorker", createCliAgentTool({
  name: "localWorker",
  command: process.execPath,
  args: ["--version"],
  stdin: "none",
  timeoutMs: 5000,
  maxInputTokens: 20,
  maxOutputBytes: 2048
}));

const runtime = new AgentRuntime({ policyEngine, evidenceLedger, toolGateway });
const result = await runtime.runWorkflow(
  createResearchWorkflow({
    seeds: ["https://github.com/AjnasNB/maqam"],
    maxPages: 3
  }),
  {
    objective: "Research Maqam from public sources",
    allowedTools: ["crawler", "summarizer"],
    allowedOrigins: ["https://github.com"],
    budget: { maxToolCalls: 20, maxRuntimeMs: 120_000 }
  }
);

console.log(result.status);
console.log(result.outputs.synthesize_report.candidates);
console.log(result.evidence);
```

## Local Console

The `maqam` command starts a local browser console for governed research runs.

```bash
maqam
```

Use a custom port:

```bash
maqam --port 8788
```

The console lets you:

- Enter a seed URL.
- Choose the maximum pages to crawl.
- Keep crawling on the same origin or allow wider origin discovery.
- Run a governed workflow through policy, tool gateway, evidence, runtime, and synthesis.
- Inspect candidates, evidence records, claims, runtime trace, and tool trace.

The console is local by default and binds to `127.0.0.1`.

## Crawler CLI

Maqam includes a crawler because public-source collection is the first governed connector.

```bash
maqam-crawl https://example.com --max-pages 50 --jsonl --output crawl.jsonl
```

Legacy aliases are also available:

```bash
ajnas-crawl https://example.com
ajnas-agent-crawler https://example.com
```

### CLI Options

| Option | Description | Default |
| --- | --- | --- |
| `--max-pages <n>` | Maximum pages to return. | `50` |
| `--concurrency <n>` | Concurrent workers. | `4` |
| `--delay <ms>` | Minimum delay per origin. | `250` |
| `--timeout <ms>` | Request timeout. | `15000` |
| `--sitemaps` | Discover URLs from `robots.txt` sitemaps and `/sitemap.xml`. | off |
| `--all-origins` | Allow crawling across discovered origins. | off |
| `--jsonl` | Output JSON Lines instead of a JSON array. | off |
| `--output <file>` | Write output to a file. | stdout |
| `--user-agent <ua>` | Use a custom user agent. | Maqam default |
| `--help` | Show CLI help. | off |

### Crawler Output

Each crawled page has this shape:

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
  "fetchedAt": "2026-06-30T00:00:00.000Z",
  "status": 200,
  "contentType": "text/html; charset=utf-8"
}
```

### Crawler Safety Defaults

The crawler:

- Uses `robots.txt` by default.
- Rate-limits per origin.
- Limits response size.
- Avoids non-HTTP URLs.
- Does not bypass login walls, paywalls, CAPTCHA, anti-bot systems, or authorization boundaries.

## Framework SDK

Install in a project:

```bash
npm install maqam
```

Import the public API:

```js
import {
  AgentRuntime,
  EvidenceLedger,
  PolicyEngine,
  ToolGateway,
  SkillRegistry,
  createAgentTool,
  createCliAgentTool,
  createCrawlerTool,
  createResearchWorkflow,
  crawl,
  extractPage,
  normalizeUrl,
  discoverSitemapUrls,
  AjnasFrameworkError,
  PolicyDeniedError,
  ApprovalRequiredError,
  toErrorRecord
} from "maqam";
```

Maqam is ESM-only. Use `import`, not `require`.

## Architecture

Maqam is composed from small framework primitives:

```text
User Goal
  -> PolicyEngine.evaluateGoal()
  -> AgentRuntime.runWorkflow()
  -> ToolGateway.call()
  -> EvidenceLedger.addEvidence()
  -> EvidenceLedger.addClaim()
  -> Quality checks
  -> Auditable output
```

Core objects:

- `AgentRuntime`: owns workflow execution.
- `PolicyEngine`: decides what is allowed, denied, or approval-gated.
- `ToolGateway`: routes all external tool calls through policy.
- `createAgentTool`: wraps arbitrary agents so they can be governed like any other tool.
- `createCliAgentTool`: wraps fixed command-line workers with timeout, approximate input-token limits, output byte limits, and no shell execution by default.
- `EvidenceLedger`: stores source evidence and claim support.
- `SkillRegistry`: stores skill metadata and selects matching skills.
- `createResearchWorkflow`: bundled workflow for public web research.
- `crawl`: lower-level crawler API used by `createCrawlerTool`.

## API Reference

### `new PolicyEngine(config)`

Creates a deterministic policy engine.

```js
const policyEngine = new PolicyEngine({
  allowedTools: ["crawler", "github"],
  deniedTools: ["email"],
  allowedOrigins: ["https://github.com", "https://www.npmjs.com"],
  deniedOrigins: ["https://example-private.local"],
  approvalRequiredTools: ["github"],
  maxToolCalls: 40,
  defaultLimits: {
    maxRuntimeMs: 600_000
  }
});
```

Config fields:

| Field | Type | Description |
| --- | --- | --- |
| `allowedTools` | `string[]` | If non-empty, only these tools may run. |
| `deniedTools` | `string[]` | Tools that must never run. |
| `allowedOrigins` | `string[]` | If non-empty, only these URL origins may be used. |
| `deniedOrigins` | `string[]` | URL origins that must never be used. |
| `approvalRequiredTools` | `string[]` | Tools that return `needs_approval`. |
| `maxToolCalls` | `number` | Shortcut for default `limits.maxToolCalls`. |
| `defaultLimits` | `object` | Default runtime and tool limits. |

Methods:

```js
policyEngine.evaluateGoal(goal);
policyEngine.authorizeToolCall({ toolName, input, context });
policyEngine.isToolAllowed("crawler");
policyEngine.isOriginAllowed("https://github.com");
```

Decision shape:

```json
{
  "status": "allow",
  "reason": "Goal is allowed by policy.",
  "limits": {
    "maxToolCalls": 100,
    "maxRuntimeMs": 600000
  },
  "requiredApprovals": []
}
```

Possible statuses:

- `allow`: execution can continue.
- `deny`: execution must stop.
- `needs_approval`: a human approval step is required before continuing.

### `new EvidenceLedger(options)`

Creates an in-memory evidence and claim store.

```js
const evidenceLedger = new EvidenceLedger({
  clock: () => new Date()
});
```

Methods:

```js
const evidence = evidenceLedger.addEvidence({
  runId: "run_1",
  taskId: "collect_sources",
  sourceType: "url",
  source: "https://github.com/AjnasNB/maqam",
  excerpt: "Repository metadata and README excerpt.",
  tool: "crawler",
  confidence: 0.85
});

const claim = evidenceLedger.addClaim({
  runId: "run_1",
  taskId: "synthesize_report",
  text: "Maqam ships a policy engine.",
  evidenceIds: [evidence.evidenceId],
  confidence: 0.8
});

evidenceLedger.listEvidence();
evidenceLedger.listClaims();
evidenceLedger.unsupportedClaims();
evidenceLedger.toJSON();
```

Evidence record shape:

```json
{
  "evidenceId": "ev_1",
  "runId": "run_1",
  "taskId": "collect_sources",
  "sourceType": "url",
  "source": "https://github.com/AjnasNB/maqam",
  "retrievedAt": "2026-06-30T00:00:00.000Z",
  "excerpt": "Repository metadata and README excerpt.",
  "hash": "sha256:...",
  "tool": "crawler",
  "confidence": 0.85
}
```

Unsupported claims are claims with no evidence IDs or with evidence IDs that do not exist in the ledger.

### `new ToolGateway(options)`

Creates a governed tool registry and execution path.

```js
const toolGateway = new ToolGateway({
  policyEngine,
  evidenceLedger
});

toolGateway.registerTool("echo", async (input) => {
  return { value: input.value };
});

const result = await toolGateway.call("echo", { value: "ok" });
```

Methods:

```js
toolGateway.registerTool(name, handler, metadata);
toolGateway.call(toolName, input, context);
toolGateway.trace;
```

Tool handler signature:

```js
async function handler(input, context) {
  return { ok: true };
}
```

The handler context includes:

- `toolName`
- `evidenceLedger`
- Any workflow context passed to `call`

If policy denies the call, `ToolGateway` throws `PolicyDeniedError`.

If policy requires approval, `ToolGateway` throws `ApprovalRequiredError`.

### `new AgentRuntime(options)`

Creates the workflow runner.

```js
const runtime = new AgentRuntime({
  policyEngine,
  evidenceLedger,
  toolGateway
});
```

Run a workflow:

```js
const result = await runtime.runWorkflow(workflow, goal);
```

Workflow shape:

```js
const workflow = {
  name: "my_workflow",
  tasks: [
    {
      id: "first_task",
      retries: 1,
      timeoutMs: 5000,
      run: async (context) => {
        return { ok: true };
      }
    }
  ]
};
```

Goal shape:

```js
const goal = {
  runId: "run_custom_1",
  objective: "Research public sources",
  allowedTools: ["crawler"],
  allowedOrigins: ["https://github.com"],
  budget: {
    maxToolCalls: 40,
    maxRuntimeMs: 600_000
  }
};
```

Runtime result shape:

```json
{
  "runId": "run_123",
  "status": "completed",
  "trace": [
    {
      "taskId": "first_task",
      "status": "completed",
      "attempt": 1,
      "startedAt": "2026-06-30T00:00:00.000Z",
      "finishedAt": "2026-06-30T00:00:01.000Z"
    }
  ],
  "outputs": {
    "first_task": {
      "ok": true
    }
  },
  "evidence": {
    "evidence": [],
    "claims": [],
    "unsupportedClaims": []
  }
}
```

Task context fields:

- `runId`
- `goal`
- `outputs`
- `evidence`
- `tools`
- `trace`

### `new SkillRegistry()`

Creates a lightweight registry for skill metadata.

```js
const registry = new SkillRegistry();

registry.register({
  id: "oss-research",
  name: "OSS Research",
  version: "0.1.0",
  triggers: ["oss", "github", "agent framework"],
  capabilities: ["research", "synthesis"],
  trustLevel: "verified",
  evalScore: 0.9,
  metadata: {
    owner: "Ajnas"
  }
});

const matches = registry.find({
  text: "Research agent framework projects",
  capabilities: ["research"]
});
```

Methods:

```js
registry.register(skill);
registry.get("oss-research");
registry.list();
registry.find({ text, capabilities });
```

Selection sorts by `evalScore` descending, then by `id`.

### `createCrawlerTool(defaultOptions)`

Wraps the low-level crawler as a `ToolGateway` handler.

```js
const crawlerTool = createCrawlerTool({
  concurrency: 2,
  delayMs: 250,
  timeoutMs: 12_000
});

toolGateway.registerTool("crawler", crawlerTool);
```

When called through the gateway, input is passed to `crawl`:

```js
await toolGateway.call("crawler", {
  seeds: ["https://example.com"],
  maxPages: 5,
  sameOrigin: true,
  includeSitemaps: false
});
```

### `createAgentTool(agent, options)`

Wraps an arbitrary agent so it can be controlled by Maqam policy and executed through `ToolGateway`.

Supported agent shapes:

- Function agent: `async (input, context) => output`
- Object agent with `run(input, context)`
- Object agent with `invoke(input, context)`
- Object agent with `call(input, context)`

```js
const summarizer = createAgentTool(async (input, context) => {
  return {
    summary: `Reviewed ${input.topic}`,
    evidence: [
      {
        evidenceId: "ev_agent_1",
        sourceType: "agent_output",
        source: "summarizer",
        excerpt: "The agent reviewed policy and evidence controls.",
        confidence: 0.8
      }
    ],
    claims: [
      {
        text: "The summarizer reviewed policy and evidence controls.",
        evidenceIds: ["ev_agent_1"],
        confidence: 0.8
      }
    ]
  };
}, { name: "summarizer" });

toolGateway.registerTool("summarizer", summarizer);

const result = await toolGateway.call("summarizer", {
  topic: "Maqam"
}, {
  runId: "run_1",
  taskId: "summarize"
});
```

If the agent output includes `evidence` or `claims` arrays, Maqam records them into the active `EvidenceLedger`.

Object-agent example:

```js
const browserAgent = {
  async run(input) {
    return {
      url: input.url,
      result: "Browser task completed"
    };
  }
};

toolGateway.registerTool("browserAgent", createAgentTool(browserAgent, {
  name: "browserAgent"
}));
```

### `createResearchWorkflow(options)`

Creates the bundled public research workflow.

```js
const workflow = createResearchWorkflow({
  seeds: ["https://github.com/AjnasNB/maqam"],
  maxPages: 5,
  sameOrigin: true,
  includeSitemaps: false
});
```

### `createCliAgentTool(options)`

Wraps a fixed command-line worker so it can run through Maqam policy and trace capture.

```js
const localWorker = createCliAgentTool({
  name: "localWorker",
  command: process.execPath,
  args: ["--input-type=module", "-e", "let body=''; for await (const c of process.stdin) body += c; const input = JSON.parse(body); console.log(JSON.stringify({ artifact: `built:${input.name}` }));"],
  stdin: "json",
  parseJson: true,
  timeoutMs: 5000,
  maxInputTokens: 50,
  maxOutputBytes: 2048
});

toolGateway.registerTool("localWorker", localWorker);

const result = await toolGateway.call("localWorker", {
  name: "demo-widget"
});

console.log(result.json.artifact);
```

Options:

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string` | Name used in result metadata. |
| `command` | `string` | Fixed executable path or command. Required. |
| `args` | `string[]` | Fixed argument list. Dynamic user input should go through stdin, not command args. |
| `cwd` | `string` | Optional working directory. |
| `env` | `object` | Extra environment variables. |
| `inheritEnv` | `boolean` | Inherit `process.env`. Default: `true`. |
| `stdin` | `"json" | "text" | "none"` | How input is passed to the worker. Default: `"json"`. |
| `parseJson` | `boolean` | Parse stdout as JSON and expose it as `result.json`. |
| `timeoutMs` | `number` | Hard runtime timeout. Default: `30000`. |
| `maxInputTokens` | `number` | Approximate input token limit. Default: `4000`. |
| `maxOutputBytes` | `number` | Maximum combined stdout/stderr bytes. Default: `65536`. |
| `rejectOnNonZero` | `boolean` | Reject when exit code is not zero. Default: `true`. |
| `shell` | `boolean` | Run through a shell. Default: `false`. Use only when a platform wrapper requires it. |

Result shape:

```json
{
  "name": "localWorker",
  "command": "node",
  "args": ["--version"],
  "exitCode": 0,
  "signal": null,
  "timedOut": false,
  "stdout": "v20.0.0\n",
  "stderr": "",
  "durationMs": 42,
  "approxInputTokens": 0,
  "outputBytes": 9,
  "limits": {
    "maxInputTokens": 50,
    "maxOutputBytes": 2048,
    "timeoutMs": 5000
  }
}
```

Limit errors:

| Code | Meaning |
| --- | --- |
| `CLI_INPUT_LIMIT_EXCEEDED` | Input was too large before execution. |
| `CLI_OUTPUT_LIMIT_EXCEEDED` | stdout/stderr exceeded the configured byte limit. |
| `CLI_TIMEOUT` | Process exceeded `timeoutMs`. |
| `CLI_EXIT_NONZERO` | Process exited with a non-zero code. |
| `CLI_JSON_PARSE_FAILED` | `parseJson` was enabled but stdout was not valid JSON. |
| `CLI_SPAWN_FAILED` | The process could not be started. |

Security notes:

- Maqam does not use a shell for CLI workers by default.
- Keep `command` and `args` fixed in code.
- Send user input through stdin.
- Use narrow `allowedTools`.
- Set short `timeoutMs` and small `maxOutputBytes` for untrusted workers.
- Use approval gates for workers that write, publish, send, or modify state.
- Prefer direct executable paths over platform wrapper scripts. On Windows, some `.cmd` or `.ps1` shims may require `shell: true` or a direct underlying executable path.

Tasks:

| Task ID | Purpose |
| --- | --- |
| `collect_sources` | Calls the crawler tool and records evidence for every page. |
| `synthesize_report` | Converts pages into candidate summaries and links claims to evidence. |
| `quality_checks` | Reports unsupported claims and evidence count. |

Candidate shape:

```json
{
  "name": "Maqam",
  "url": "https://github.com/AjnasNB/maqam",
  "whatItDoes": "Summary excerpt...",
  "whyUseful": "Potential source or reference for enterprise agent framework capabilities.",
  "risks": ["Requires license and maintenance review before reuse."],
  "recommendation": "inspiration_first",
  "evidenceIds": ["ev_1"]
}
```

### `crawl(input)`

Runs the low-level crawler.

```js
const pages = await crawl({
  seeds: ["https://example.com"],
  maxPages: 25,
  concurrency: 4,
  sameOrigin: true,
  includeSitemaps: false,
  obeyRobots: true,
  userAgent: "MyCrawler/1.0 (+https://example.com)",
  delayMs: 250,
  timeoutMs: 15_000,
  maxBytes: 3 * 1024 * 1024,
  onPage(page) {
    console.log(page.url);
  },
  onError(error) {
    console.error(error.url, error.error);
  }
});
```

Input fields:

| Field | Type | Description |
| --- | --- | --- |
| `seeds` or `urls` | `string[]` | Starting URLs. At least one HTTP(S) URL is required. |
| `maxPages` | `number` | Maximum pages to return. |
| `concurrency` | `number` | Number of workers. |
| `sameOrigin` | `boolean` | Restrict discovered links to seed origins. |
| `includeSitemaps` | `boolean` | Discover URLs from sitemaps. |
| `obeyRobots` | `boolean` | Respect `robots.txt`. |
| `userAgent` | `string` | Custom user agent. |
| `delayMs` | `number` | Per-origin delay. |
| `timeoutMs` | `number` | Request timeout. |
| `maxBytes` | `number` | Maximum response body bytes. |
| `onPage` | `function` | Optional callback for each page. |
| `onError` | `function` | Optional callback for crawl failures. |

### Error Classes

```js
import {
  AjnasFrameworkError,
  PolicyDeniedError,
  ApprovalRequiredError,
  toErrorRecord
} from "maqam";
```

Use `PolicyDeniedError` when policy blocks execution and `ApprovalRequiredError` when a human decision is required.

```js
try {
  await toolGateway.call("github", { action: "fork" });
} catch (error) {
  if (error instanceof ApprovalRequiredError) {
    console.log(error.details.requiredApprovals);
  }
}
```

`toErrorRecord(error)` converts framework and native errors into serializable records.

## Build A Custom Workflow

This example builds a two-task workflow that collects data from a custom tool and records a supported claim.

```js
import {
  AgentRuntime,
  EvidenceLedger,
  PolicyEngine,
  ToolGateway
} from "maqam";

const evidenceLedger = new EvidenceLedger();
const policyEngine = new PolicyEngine({
  allowedTools: ["packageInfo"],
  allowedOrigins: ["https://registry.npmjs.org"]
});
const toolGateway = new ToolGateway({ policyEngine, evidenceLedger });

toolGateway.registerTool("packageInfo", async ({ name }) => {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
  return response.json();
});

const workflow = {
  name: "npm_package_review",
  tasks: [
    {
      id: "fetch_package",
      retries: 1,
      timeoutMs: 15_000,
      run: async (context) => {
        return context.tools.call("packageInfo", { name: "maqam" }, context);
      }
    },
    {
      id: "record_summary",
      run: async (context) => {
        const pkg = context.outputs.fetch_package;
        const evidence = context.evidence.addEvidence({
          runId: context.runId,
          taskId: "record_summary",
          sourceType: "registry",
          source: "https://registry.npmjs.org/maqam",
          excerpt: pkg.description,
          tool: "packageInfo",
          confidence: 0.9
        });

        context.evidence.addClaim({
          runId: context.runId,
          taskId: "record_summary",
          text: "Maqam is published on npm.",
          evidenceIds: [evidence.evidenceId],
          confidence: 0.9
        });

        return {
          name: pkg.name,
          latest: pkg["dist-tags"]?.latest,
          evidenceId: evidence.evidenceId
        };
      }
    }
  ]
};

const runtime = new AgentRuntime({ policyEngine, evidenceLedger, toolGateway });
const result = await runtime.runWorkflow(workflow, {
  objective: "Review an npm package",
  allowedTools: ["packageInfo"],
  allowedOrigins: ["https://registry.npmjs.org"]
});

console.log(result.outputs.record_summary);
console.log(result.evidence.unsupportedClaims);
```

## Control Any Agent

Yes, Maqam can control agents beyond crawling. The pattern is:

1. Wrap the agent with `createAgentTool`.
2. Register it in `ToolGateway`.
3. Put the agent name in `PolicyEngine.allowedTools`.
4. Add it to `approvalRequiredTools` if it can write, publish, send, modify, or spend.
5. Call it from an `AgentRuntime` workflow task.

Example with multiple agents:

```js
import {
  AgentRuntime,
  EvidenceLedger,
  PolicyEngine,
  ToolGateway,
  createAgentTool
} from "maqam";

const evidenceLedger = new EvidenceLedger();
const policyEngine = new PolicyEngine({
  allowedTools: ["researchAgent", "reviewAgent", "publishAgent"],
  approvalRequiredTools: ["publishAgent"]
});
const toolGateway = new ToolGateway({ policyEngine, evidenceLedger });

toolGateway.registerTool("researchAgent", createAgentTool(async (input) => ({
  notes: `Researched ${input.topic}`,
  evidence: [
    {
      evidenceId: "ev_research_1",
      sourceType: "agent_output",
      source: "researchAgent",
      excerpt: `Researched ${input.topic}`,
      confidence: 0.7
    }
  ]
}), { name: "researchAgent" }));

toolGateway.registerTool("reviewAgent", createAgentTool({
  async run(input) {
    return { approvedForDraft: Boolean(input.notes) };
  }
}, { name: "reviewAgent" }));

toolGateway.registerTool("publishAgent", createAgentTool(async () => ({
  published: true
}), { name: "publishAgent" }));

const workflow = {
  name: "multi_agent_governed_flow",
  tasks: [
    {
      id: "research",
      run: (context) => context.tools.call("researchAgent", { topic: "Maqam" }, context)
    },
    {
      id: "review",
      run: (context) => context.tools.call("reviewAgent", context.outputs.research, context)
    },
    {
      id: "publish",
      run: (context) => context.tools.call("publishAgent", context.outputs.review, context)
    }
  ]
};

const runtime = new AgentRuntime({ policyEngine, evidenceLedger, toolGateway });
const result = await runtime.runWorkflow(workflow, {
  objective: "Run a governed multi-agent workflow",
  allowedTools: ["researchAgent", "reviewAgent", "publishAgent"]
});

console.log(result.status);
```

In this example, `publishAgent` will throw `ApprovalRequiredError` because it is approval-gated. That is intentional: Maqam controls the agent rather than letting it publish directly.

What Maqam can control:

- Function agents.
- LangChain/LangGraph-style agents if exposed through `invoke` or wrapped in a function.
- External SDK-style functions if wrapped in a function.
- Browser agents.
- Research agents.
- GitHub/npm/internal API agents.
- Email, Slack, Jira, database, or release agents when registered as tools.

What Maqam cannot do automatically:

- It cannot control an agent you do not route through `ToolGateway`.
- It cannot make an unsafe third-party agent safe if that agent bypasses the wrapper and performs side effects internally.
- It cannot approve risky actions by itself; approval-gated actions should be routed to humans.

## Control CLI Workers

Maqam can govern command-line workers the same way it governs function agents.

The pattern is:

1. Create a fixed CLI adapter with `createCliAgentTool`.
2. Register it with `ToolGateway`.
3. Add the worker name to `allowedTools`.
4. Configure `timeoutMs`, `maxInputTokens`, and `maxOutputBytes`.
5. Call the worker from a workflow task.

Example workflow:

```js
import {
  AgentRuntime,
  EvidenceLedger,
  PolicyEngine,
  ToolGateway,
  createCliAgentTool
} from "maqam";

const evidenceLedger = new EvidenceLedger();
const policyEngine = new PolicyEngine({
  allowedTools: ["builderWorker"]
});
const toolGateway = new ToolGateway({ policyEngine, evidenceLedger });

toolGateway.registerTool("builderWorker", createCliAgentTool({
  name: "builderWorker",
  command: process.execPath,
  args: ["--input-type=module", "-e", "let body=''; for await (const c of process.stdin) body += c; const input = JSON.parse(body); console.log(JSON.stringify({ fileName: `${input.name}.txt`, content: `Built ${input.name}` }));"],
  stdin: "json",
  parseJson: true,
  timeoutMs: 5000,
  maxInputTokens: 100,
  maxOutputBytes: 4096
}));

const workflow = {
  name: "governed_cli_build",
  tasks: [
    {
      id: "build",
      run: (context) => context.tools.call("builderWorker", {
        name: "demo-widget"
      }, context)
    },
    {
      id: "record",
      run: (context) => {
        const output = context.outputs.build.json;
        const evidence = context.evidence.addEvidence({
          runId: context.runId,
          taskId: "record",
          sourceType: "cli_worker_output",
          source: "builderWorker",
          excerpt: output.content,
          tool: "builderWorker",
          confidence: 0.8
        });
        context.evidence.addClaim({
          runId: context.runId,
          taskId: "record",
          text: `The worker created ${output.fileName}.`,
          evidenceIds: [evidence.evidenceId],
          confidence: 0.8
        });
        return output;
      }
    }
  ]
};

const runtime = new AgentRuntime({ policyEngine, evidenceLedger, toolGateway });
const result = await runtime.runWorkflow(workflow, {
  objective: "Build a small artifact through a governed CLI worker",
  allowedTools: ["builderWorker"]
});

console.log(result.outputs.record);
console.log(result.evidence.unsupportedClaims);
```

## Register A Custom Tool

Tools should be small and explicit. The gateway handles policy and trace capture.

```js
toolGateway.registerTool("internalDocs", async ({ query }, context) => {
  const records = await searchDocs(query);

  for (const record of records) {
    context.evidenceLedger?.addEvidence({
      runId: context.runId,
      taskId: context.taskId,
      sourceType: "internal_doc",
      source: record.id,
      excerpt: record.snippet,
      tool: "internalDocs",
      confidence: 0.75
    });
  }

  return records;
}, {
  description: "Search internal documentation."
});
```

Good tool design:

- Accept structured input.
- Return structured output.
- Avoid side effects unless approval is required.
- Keep auth and secrets outside the tool input.
- Record evidence for source-backed results.

## Use Policy And Approvals

Deny a tool:

```js
const policyEngine = new PolicyEngine({
  allowedTools: ["crawler"]
});

const decision = policyEngine.authorizeToolCall({
  toolName: "email",
  input: { to: "customer@example.com" }
});

console.log(decision.status); // "deny"
```

Require approval:

```js
const policyEngine = new PolicyEngine({
  allowedTools: ["github"],
  approvalRequiredTools: ["github"]
});

const toolGateway = new ToolGateway({ policyEngine });
toolGateway.registerTool("github", async () => ({ ok: true }));

await toolGateway.call("github", { action: "create_release" });
```

The call throws `ApprovalRequiredError`. Your application can catch it and place a human approval request in a queue.

## Use Evidence And Claims

Use evidence for source facts:

```js
const evidence = evidenceLedger.addEvidence({
  sourceType: "url",
  source: "https://github.com/AjnasNB/maqam",
  excerpt: "Maqam is an MIT-licensed Ajnas agent framework...",
  tool: "crawler",
  confidence: 0.85
});

evidenceLedger.addClaim({
  text: "Maqam is MIT licensed.",
  evidenceIds: [evidence.evidenceId],
  confidence: 0.8
});

const unsupported = evidenceLedger.unsupportedClaims();
```

Use unsupported-claim checks before publishing reports:

```js
if (evidenceLedger.unsupportedClaims().length > 0) {
  throw new Error("Report contains unsupported claims.");
}
```

## Use The Skill Registry

The current registry is intentionally lightweight. It stores metadata and returns matching skills.

```js
const registry = new SkillRegistry();

registry.register({
  id: "license-review",
  name: "License Review",
  version: "0.1.0",
  triggers: ["license", "mit", "apache"],
  capabilities: ["compliance", "research"],
  trustLevel: "verified",
  evalScore: 0.93
});

const skills = registry.find({
  text: "Check whether this package is MIT licensed",
  capabilities: ["compliance"]
});

console.log(skills[0].id);
```

Recommended metadata:

- `id`: stable machine identifier.
- `name`: human-readable name.
- `version`: semantic version.
- `triggers`: text phrases that should select the skill.
- `capabilities`: capability tags.
- `trustLevel`: `community`, `verified`, or tenant-specific labels.
- `evalScore`: numeric quality score from 0 to 1.
- `metadata`: owner, source, license, compatibility, or audit information.

## HTTP API

The local Maqam server exposes two API endpoints.

### `GET /api/health`

Response:

```json
{
  "product": {
    "name": "Maqam",
    "tagline": "Compose governed agents",
    "description": "Enterprise agent framework console for policy-bound research, evidence capture, and auditable workflow runs."
  },
  "status": "ok"
}
```

### `POST /api/runs/research`

Request:

```json
{
  "seeds": ["https://github.com/AjnasNB/maqam"],
  "maxPages": 2,
  "sameOrigin": true,
  "allowedOrigins": ["https://github.com"],
  "objective": "Research Maqam from public sources"
}
```

Rules:

- `seeds` must be an array of HTTP(S) URLs.
- `maxPages` is clamped from 1 to 25.
- If `allowedOrigins` is omitted, Maqam derives origins from `seeds`.
- The server only registers the `crawler` tool for this endpoint.

Example:

```bash
curl -X POST http://127.0.0.1:8787/api/runs/research \
  -H "content-type: application/json" \
  -d "{\"seeds\":[\"https://github.com/AjnasNB/maqam\"],\"maxPages\":1}"
```

Response shape:

```json
{
  "product": {
    "name": "Maqam",
    "tagline": "Compose governed agents"
  },
  "run": {
    "runId": "run_123",
    "status": "completed",
    "trace": [],
    "outputs": {},
    "evidence": {}
  },
  "toolTrace": [],
  "generatedAt": "2026-06-30T00:00:00.000Z"
}
```

## Security And Compliance Notes

Maqam is designed to make control points explicit, but it is not a complete compliance platform by itself.

Use these defaults:

- Keep `allowedTools` narrow.
- Keep `allowedOrigins` narrow.
- Require approval for write actions such as email, PR creation, release creation, publishing, customer data access, and production changes.
- Store secrets outside workflow input.
- Record evidence for every claim that may be used in a report.
- Run quality checks before publishing output.
- Keep crawler use limited to public, authorized content.

Do not use Maqam to:

- Bypass access controls.
- Evade CAPTCHA or anti-bot systems.
- Ignore robots.txt where it applies.
- Scrape private, gated, or paid content without permission.
- Publish generated reports without review when policy says approval is required.

## Development

Clone and test:

```bash
git clone https://github.com/AjnasNB/maqam.git
cd maqam
npm install
npm test
```

Run the console from source:

```bash
npm run maqam
```

Run the crawler from source:

```bash
npm run crawl -- https://example.com --max-pages 5
```

Check the package contents:

```bash
npm pack --dry-run
```

Run a specific test file:

```bash
npm test -- test/framework/policy.test.js
```

## Publishing

Package maintainers can publish with:

```bash
npm publish --access public
```

Before publishing:

```bash
npm test
npm pack --dry-run
git status --short
```

## Troubleshooting

### `maqam` command not found

Install globally:

```bash
npm install -g maqam
```

Then restart your terminal so the npm global bin directory is on `PATH`.

### Port 8787 is already in use

Use another port:

```bash
maqam --port 8788
```

### Workflow returns `deny`

Check:

- The requested tool is present in `allowedTools`.
- The URL origin is present in `allowedOrigins`.
- The tool is not present in `deniedTools`.
- The origin is not present in `deniedOrigins`.

### Tool call throws `ApprovalRequiredError`

The tool is configured in `approvalRequiredTools`. Catch the error and route it to a human approval queue.

### Crawler returns fewer pages than expected

Common causes:

- `robots.txt` disallows the page.
- `sameOrigin` blocks off-origin links.
- The page is not HTML/text/XML.
- The response is too large.
- The request timed out.
- The site requires login or blocks automated access.

### `npm publish` asks for OTP

The npm account has two-factor authentication enabled. Re-run with a current OTP:

```bash
npm publish --access public --otp=123456
```

## Current Limitations

Maqam `0.1.x` is intentionally small:

- Evidence storage is in memory.
- Workflow execution is sequential.
- Human approval is represented by errors, not a full approval UI.
- Skill registry is metadata-only.
- The bundled console runs one research workflow.
- No model provider is bundled.
- No hosted control plane is included.

These constraints keep the package easy to inspect and extend.

## Next Extensions

Useful next packages or modules:

- Persistent evidence storage with SQLite or Postgres.
- First-class human approval queue.
- MCP-compatible connector framework.
- Evaluation harness for policy and evidence quality.
- Browser automation connector.
- GitHub and npm metadata connectors.
- Tenant-aware configuration and audit export.

## Open Development

Maqam is open source under MIT and open for development, issues, ideas, and contributions.
