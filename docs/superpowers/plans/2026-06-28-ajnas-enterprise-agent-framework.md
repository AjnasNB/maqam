# Maqam Agent Framework Implementation Plan

> Historical implementation record (2026-06-28): commands, imports, package names, and unchecked steps below describe an earlier plan. They are not current release instructions or additional package manifests. The shipped package in this repository is `maqam`; do not publish placeholder packages from this record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first local SDK slice of the Maqam agent framework while preserving the existing crawler API and CLI.

**Architecture:** Keep `crawl` as the first governed tool connector. Add framework modules under `src/framework/` for policy, evidence, tool gateway, skill registry, runtime, and a stubbed research workflow. Export the new framework primitives from `src/index.js` without changing existing crawler behavior.

**Tech Stack:** Node.js 20, ESM modules, `node:test`, current crawler dependencies (`cheerio`, `robots-parser`, `turndown`), no new runtime dependency for the first slice.

---

## File Structure

- Create `src/framework/errors.js`: framework-specific errors and serializable error records.
- Create `src/framework/policy.js`: deterministic policy decisions for goals and tool calls.
- Create `src/framework/evidence-ledger.js`: in-memory evidence and claim store with stable hashes.
- Create `src/framework/tool-gateway.js`: governed tool registration and execution.
- Create `src/framework/skill-registry.js`: skill metadata validation and selection.
- Create `src/framework/runtime.js`: sequential task graph runtime with retries, timeout, trace, and budget checks.
- Create `src/framework/research-workflow.js`: first enterprise research workflow that uses the gateway and evidence ledger.
- Modify `src/index.js`: preserve crawler exports and add framework exports.
- Modify `README.md`: position the package as the crawler-backed seed of the Maqam framework.
- Create tests under `test/framework/` for every new module.

## Task 1: Framework Errors

**Files:**
- Create: `src/framework/errors.js`
- Test: `test/framework/errors.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/framework/errors.test.js`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AjnasFrameworkError,
  ApprovalRequiredError,
  PolicyDeniedError,
  toErrorRecord
} from "../../src/framework/errors.js";

test("PolicyDeniedError carries code and details", () => {
  const error = new PolicyDeniedError("Tool blocked", {
    details: { tool: "browser" }
  });

  assert.equal(error.name, "PolicyDeniedError");
  assert.equal(error.code, "POLICY_DENIED");
  assert.deepEqual(error.details, { tool: "browser" });
});

test("ApprovalRequiredError records approval requirements", () => {
  const error = new ApprovalRequiredError("Approval needed", {
    details: { approvals: ["publish"] }
  });

  assert.equal(error.code, "APPROVAL_REQUIRED");
  assert.deepEqual(error.details.approvals, ["publish"]);
});

test("toErrorRecord serializes framework and native errors", () => {
  const framework = toErrorRecord(new AjnasFrameworkError("Bad input", {
    code: "BAD_INPUT",
    details: { field: "goal" }
  }));
  const native = toErrorRecord(new Error("Native failure"));

  assert.equal(framework.code, "BAD_INPUT");
  assert.equal(framework.message, "Bad input");
  assert.deepEqual(framework.details, { field: "goal" });
  assert.equal(native.code, "ERROR");
  assert.equal(native.message, "Native failure");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- test/framework/errors.test.js`

Expected: fail with `Cannot find module` for `src/framework/errors.js`.

- [ ] **Step 3: Implement the errors module**

Create `src/framework/errors.js`:

```js
export class AjnasFrameworkError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code || "AJNAS_FRAMEWORK_ERROR";
    this.details = options.details || {};
  }
}

export class PolicyDeniedError extends AjnasFrameworkError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || "POLICY_DENIED"
    });
  }
}

export class ApprovalRequiredError extends AjnasFrameworkError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || "APPROVAL_REQUIRED"
    });
  }
}

export function toErrorRecord(error) {
  return {
    name: error?.name || "Error",
    code: error?.code || "ERROR",
    message: error?.message || String(error),
    details: error?.details || {}
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- test/framework/errors.test.js`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/framework/errors.js test/framework/errors.test.js
git commit -m "feat: add framework errors"
```

## Task 2: Policy Engine

**Files:**
- Create: `src/framework/policy.js`
- Test: `test/framework/policy.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/framework/policy.test.js`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { PolicyEngine } from "../../src/framework/policy.js";

test("evaluateGoal allows public research goals within limits", () => {
  const policy = new PolicyEngine({
    allowedTools: ["crawler", "search"],
    allowedOrigins: ["https://github.com", "https://www.npmjs.com"],
    maxToolCalls: 10
  });

  const decision = policy.evaluateGoal({
    objective: "Research OSS projects",
    allowedTools: ["crawler"],
    allowedOrigins: ["https://github.com"],
    budget: { maxToolCalls: 5 }
  });

  assert.equal(decision.status, "allow");
  assert.equal(decision.limits.maxToolCalls, 5);
});

test("authorizeToolCall denies disallowed tools", () => {
  const policy = new PolicyEngine({ allowedTools: ["crawler"] });
  const decision = policy.authorizeToolCall({
    toolName: "browser",
    input: { url: "https://example.com" }
  });

  assert.equal(decision.status, "deny");
  assert.match(decision.reason, /not allowed/);
});

test("authorizeToolCall denies disallowed origins", () => {
  const policy = new PolicyEngine({
    allowedTools: ["crawler"],
    allowedOrigins: ["https://github.com"]
  });

  const decision = policy.authorizeToolCall({
    toolName: "crawler",
    input: { seeds: ["https://example.com"] }
  });

  assert.equal(decision.status, "deny");
  assert.match(decision.reason, /origin/);
});

test("authorizeToolCall requests approval for configured approval tools", () => {
  const policy = new PolicyEngine({
    allowedTools: ["github"],
    approvalRequiredTools: ["github"]
  });

  const decision = policy.authorizeToolCall({
    toolName: "github",
    input: { action: "fork", url: "https://github.com/apify/crawlee" }
  });

  assert.equal(decision.status, "needs_approval");
  assert.deepEqual(decision.requiredApprovals, ["tool:github"]);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- test/framework/policy.test.js`

Expected: fail with `Cannot find module` for `src/framework/policy.js`.

- [ ] **Step 3: Implement the policy engine**

Create `src/framework/policy.js`:

```js
const DEFAULT_LIMITS = {
  maxToolCalls: 100,
  maxRuntimeMs: 600_000
};

function asSet(values = []) {
  return new Set(values.filter(Boolean));
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function collectUrls(value, urls = []) {
  if (!value) return urls;
  if (typeof value === "string") {
    if (isHttpUrl(value)) urls.push(value);
    return urls;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, urls);
    return urls;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) collectUrls(item, urls);
  }
  return urls;
}

function originOf(value) {
  return new URL(value).origin;
}

export class PolicyEngine {
  constructor(config = {}) {
    this.allowedTools = asSet(config.allowedTools);
    this.deniedTools = asSet(config.deniedTools);
    this.allowedOrigins = asSet(config.allowedOrigins);
    this.deniedOrigins = asSet(config.deniedOrigins);
    this.approvalRequiredTools = asSet(config.approvalRequiredTools);
    this.defaultLimits = {
      ...DEFAULT_LIMITS,
      ...(config.defaultLimits || {}),
      ...(config.maxToolCalls ? { maxToolCalls: config.maxToolCalls } : {})
    };
  }

  evaluateGoal(goal = {}) {
    const requestedTools = goal.allowedTools || [];
    for (const tool of requestedTools) {
      if (!this.isToolAllowed(tool)) {
        return this.decision("deny", `Tool '${tool}' is not allowed for this tenant.`);
      }
    }

    const requestedOrigins = goal.allowedOrigins || [];
    for (const origin of requestedOrigins) {
      if (!this.isOriginAllowed(origin)) {
        return this.decision("deny", `Origin '${origin}' is not allowed for this tenant.`);
      }
    }

    return this.decision("allow", "Goal is allowed by policy.", {
      limits: {
        ...this.defaultLimits,
        ...(goal.budget || {})
      }
    });
  }

  authorizeToolCall({ toolName, input = {} } = {}) {
    if (!this.isToolAllowed(toolName)) {
      return this.decision("deny", `Tool '${toolName}' is not allowed.`);
    }

    if (this.approvalRequiredTools.has(toolName)) {
      return this.decision("needs_approval", `Tool '${toolName}' requires approval.`, {
        requiredApprovals: [`tool:${toolName}`]
      });
    }

    const origins = [...new Set(collectUrls(input).map(originOf))];
    for (const origin of origins) {
      if (!this.isOriginAllowed(origin)) {
        return this.decision("deny", `URL origin '${origin}' is not allowed.`);
      }
    }

    return this.decision("allow", "Tool call is allowed.");
  }

  isToolAllowed(toolName) {
    if (!toolName || this.deniedTools.has(toolName)) return false;
    return this.allowedTools.size === 0 || this.allowedTools.has(toolName);
  }

  isOriginAllowed(origin) {
    if (!origin || this.deniedOrigins.has(origin)) return false;
    return this.allowedOrigins.size === 0 || this.allowedOrigins.has(origin);
  }

  decision(status, reason, extra = {}) {
    return {
      status,
      reason,
      limits: extra.limits || { ...this.defaultLimits },
      requiredApprovals: extra.requiredApprovals || []
    };
  }
}

export { collectUrls };
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- test/framework/policy.test.js`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/framework/policy.js test/framework/policy.test.js
git commit -m "feat: add policy engine"
```

## Task 3: Evidence Ledger

**Files:**
- Create: `src/framework/evidence-ledger.js`
- Test: `test/framework/evidence-ledger.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/framework/evidence-ledger.test.js`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { EvidenceLedger } from "../../src/framework/evidence-ledger.js";

test("addEvidence stores normalized evidence with hash", () => {
  const ledger = new EvidenceLedger({
    clock: () => new Date("2026-06-28T10:00:00.000Z")
  });

  const record = ledger.addEvidence({
    runId: "run_1",
    taskId: "inspect",
    sourceType: "url",
    source: "https://github.com/apify/crawlee",
    excerpt: "Apache-2.0 license",
    tool: "github",
    confidence: 0.9
  });

  assert.equal(record.evidenceId, "ev_1");
  assert.equal(record.retrievedAt, "2026-06-28T10:00:00.000Z");
  assert.match(record.hash, /^sha256:/);
  assert.equal(ledger.listEvidence().length, 1);
});

test("addClaim links claims to evidence and reports unsupported claims", () => {
  const ledger = new EvidenceLedger();
  const evidence = ledger.addEvidence({
    sourceType: "url",
    source: "https://www.npmjs.com/package/crawlee",
    excerpt: "Package metadata"
  });

  const supported = ledger.addClaim({
    text: "Crawlee is published on npm.",
    evidenceIds: [evidence.evidenceId],
    confidence: 0.8
  });
  const unsupported = ledger.addClaim({
    text: "Unsupported claim",
    evidenceIds: [],
    confidence: 0.2
  });

  assert.equal(supported.claimId, "claim_1");
  assert.equal(unsupported.claimId, "claim_2");
  assert.deepEqual(ledger.unsupportedClaims().map((claim) => claim.claimId), ["claim_2"]);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- test/framework/evidence-ledger.test.js`

Expected: fail with `Cannot find module` for `src/framework/evidence-ledger.js`.

- [ ] **Step 3: Implement the evidence ledger**

Create `src/framework/evidence-ledger.js`:

```js
import { createHash } from "node:crypto";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

export class EvidenceLedger {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.evidence = [];
    this.claims = [];
  }

  addEvidence(input = {}) {
    const record = {
      evidenceId: input.evidenceId || `ev_${this.evidence.length + 1}`,
      runId: input.runId || null,
      taskId: input.taskId || null,
      sourceType: input.sourceType || "unknown",
      source: input.source || "unknown",
      retrievedAt: input.retrievedAt || this.clock().toISOString(),
      excerpt: input.excerpt || "",
      hash: input.hash || sha256(`${input.source || ""}\n${input.excerpt || ""}`),
      tool: input.tool || null,
      confidence: clampConfidence(input.confidence)
    };
    this.evidence.push(record);
    return record;
  }

  addClaim(input = {}) {
    const claim = {
      claimId: input.claimId || `claim_${this.claims.length + 1}`,
      runId: input.runId || null,
      taskId: input.taskId || null,
      text: input.text || "",
      evidenceIds: input.evidenceIds || [],
      confidence: clampConfidence(input.confidence)
    };
    this.claims.push(claim);
    return claim;
  }

  listEvidence() {
    return [...this.evidence];
  }

  listClaims() {
    return [...this.claims];
  }

  unsupportedClaims() {
    const known = new Set(this.evidence.map((record) => record.evidenceId));
    return this.claims.filter((claim) => {
      return !claim.evidenceIds.length || claim.evidenceIds.some((id) => !known.has(id));
    });
  }

  toJSON() {
    return {
      evidence: this.listEvidence(),
      claims: this.listClaims(),
      unsupportedClaims: this.unsupportedClaims()
    };
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- test/framework/evidence-ledger.test.js`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/framework/evidence-ledger.js test/framework/evidence-ledger.test.js
git commit -m "feat: add evidence ledger"
```

## Task 4: Tool Gateway

**Files:**
- Create: `src/framework/tool-gateway.js`
- Test: `test/framework/tool-gateway.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/framework/tool-gateway.test.js`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { PolicyEngine } from "../../src/framework/policy.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";
import { ApprovalRequiredError, PolicyDeniedError } from "../../src/framework/errors.js";

test("ToolGateway executes registered tools through policy", async () => {
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: ["echo"] })
  });

  gateway.registerTool("echo", async (input) => ({ value: input.value }));
  const result = await gateway.call("echo", { value: "ok" });

  assert.deepEqual(result, { value: "ok" });
  assert.equal(gateway.trace.length, 1);
  assert.equal(gateway.trace[0].toolName, "echo");
});

test("ToolGateway blocks disallowed tools before execution", async () => {
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: ["crawler"] })
  });

  gateway.registerTool("browser", async () => {
    throw new Error("must not run");
  });

  await assert.rejects(
    () => gateway.call("browser", { url: "https://example.com" }),
    PolicyDeniedError
  );
});

test("ToolGateway raises approval errors for approval decisions", async () => {
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: ["github"],
      approvalRequiredTools: ["github"]
    })
  });

  gateway.registerTool("github", async () => ({ ok: true }));

  await assert.rejects(
    () => gateway.call("github", { action: "fork" }),
    ApprovalRequiredError
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- test/framework/tool-gateway.test.js`

Expected: fail with `Cannot find module` for `src/framework/tool-gateway.js`.

- [ ] **Step 3: Implement the tool gateway**

Create `src/framework/tool-gateway.js`:

```js
import { ApprovalRequiredError, PolicyDeniedError } from "./errors.js";

export class ToolGateway {
  constructor(options = {}) {
    this.policyEngine = options.policyEngine;
    this.evidenceLedger = options.evidenceLedger || null;
    this.goal = options.goal || null;
    this.tools = new Map();
    this.trace = [];
  }

  registerTool(name, handler, metadata = {}) {
    if (!name || typeof handler !== "function") {
      throw new TypeError("ToolGateway.registerTool requires a name and handler.");
    }
    this.tools.set(name, { name, handler, metadata });
    return this;
  }

  async call(toolName, input = {}, context = {}) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new PolicyDeniedError(`Tool '${toolName}' is not registered.`, {
        details: { toolName }
      });
    }

    const decision = this.policyEngine?.authorizeToolCall({
      goal: this.goal,
      toolName,
      input,
      context
    }) || { status: "allow", reason: "No policy engine configured.", requiredApprovals: [] };

    if (decision.status === "deny") {
      throw new PolicyDeniedError(decision.reason, {
        details: { toolName, decision }
      });
    }

    if (decision.status === "needs_approval") {
      throw new ApprovalRequiredError(decision.reason, {
        details: { toolName, requiredApprovals: decision.requiredApprovals, decision }
      });
    }

    const startedAt = new Date().toISOString();
    const result = await tool.handler(input, {
      ...context,
      toolName,
      evidenceLedger: this.evidenceLedger
    });
    const finishedAt = new Date().toISOString();

    this.trace.push({
      toolName,
      input,
      startedAt,
      finishedAt,
      decision
    });

    return result;
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- test/framework/tool-gateway.test.js`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/framework/tool-gateway.js test/framework/tool-gateway.test.js
git commit -m "feat: add governed tool gateway"
```

## Task 5: Skill Registry

**Files:**
- Create: `src/framework/skill-registry.js`
- Test: `test/framework/skill-registry.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/framework/skill-registry.test.js`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { SkillRegistry } from "../../src/framework/skill-registry.js";

test("SkillRegistry validates and lists skills", () => {
  const registry = new SkillRegistry();
  registry.register({
    id: "oss-research",
    name: "OSS Research",
    version: "0.1.0",
    triggers: ["oss", "github"],
    capabilities: ["research"],
    trustLevel: "verified",
    evalScore: 0.82
  });

  assert.equal(registry.list().length, 1);
  assert.equal(registry.get("oss-research").name, "OSS Research");
});

test("SkillRegistry selects by trigger and capability", () => {
  const registry = new SkillRegistry();
  registry.register({
    id: "low",
    name: "Low",
    version: "0.1.0",
    triggers: ["research"],
    capabilities: ["research"],
    evalScore: 0.2
  });
  registry.register({
    id: "high",
    name: "High",
    version: "0.1.0",
    triggers: ["agent framework"],
    capabilities: ["research", "synthesis"],
    evalScore: 0.9
  });

  const matches = registry.find({
    text: "Research agent framework projects",
    capabilities: ["research"]
  });

  assert.deepEqual(matches.map((skill) => skill.id), ["high", "low"]);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- test/framework/skill-registry.test.js`

Expected: fail with `Cannot find module` for `src/framework/skill-registry.js`.

- [ ] **Step 3: Implement the skill registry**

Create `src/framework/skill-registry.js`:

```js
function normalizeSkill(input) {
  if (!input?.id || !input?.name || !input?.version) {
    throw new TypeError("Skill requires id, name, and version.");
  }
  return {
    id: input.id,
    name: input.name,
    version: input.version,
    triggers: input.triggers || [],
    capabilities: input.capabilities || [],
    trustLevel: input.trustLevel || "community",
    evalScore: Number.isFinite(Number(input.evalScore)) ? Number(input.evalScore) : 0,
    metadata: input.metadata || {}
  };
}

function containsAny(text, values) {
  const haystack = text.toLowerCase();
  return values.some((value) => haystack.includes(String(value).toLowerCase()));
}

export class SkillRegistry {
  constructor() {
    this.skills = new Map();
  }

  register(input) {
    const skill = normalizeSkill(input);
    this.skills.set(skill.id, skill);
    return skill;
  }

  get(id) {
    return this.skills.get(id) || null;
  }

  list() {
    return [...this.skills.values()];
  }

  find(query = {}) {
    const text = query.text || "";
    const requiredCapabilities = query.capabilities || [];
    return this.list()
      .filter((skill) => {
        const triggerMatch = !text || containsAny(text, skill.triggers);
        const capabilityMatch = requiredCapabilities.every((capability) => {
          return skill.capabilities.includes(capability);
        });
        return triggerMatch && capabilityMatch;
      })
      .sort((a, b) => b.evalScore - a.evalScore || a.id.localeCompare(b.id));
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- test/framework/skill-registry.test.js`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/framework/skill-registry.js test/framework/skill-registry.test.js
git commit -m "feat: add skill registry"
```

## Task 6: Agent Runtime

**Files:**
- Create: `src/framework/runtime.js`
- Test: `test/framework/runtime.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/framework/runtime.test.js`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentRuntime } from "../../src/framework/runtime.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { EvidenceLedger } from "../../src/framework/evidence-ledger.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";

test("AgentRuntime runs workflow tasks in order", async () => {
  const calls = [];
  const runtime = new AgentRuntime({
    policyEngine: new PolicyEngine(),
    evidenceLedger: new EvidenceLedger(),
    toolGateway: new ToolGateway({ policyEngine: new PolicyEngine() })
  });

  const result = await runtime.runWorkflow({
    name: "ordered",
    tasks: [
      { id: "first", run: async () => calls.push("first") },
      { id: "second", run: async () => calls.push("second") }
    ]
  }, {
    objective: "Run ordered workflow"
  });

  assert.deepEqual(calls, ["first", "second"]);
  assert.equal(result.status, "completed");
  assert.equal(result.trace.length, 2);
});

test("AgentRuntime retries failed tasks", async () => {
  let attempts = 0;
  const runtime = new AgentRuntime({
    policyEngine: new PolicyEngine(),
    evidenceLedger: new EvidenceLedger(),
    toolGateway: new ToolGateway({ policyEngine: new PolicyEngine() })
  });

  const result = await runtime.runWorkflow({
    name: "retry",
    tasks: [
      {
        id: "fragile",
        retries: 1,
        run: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("first failure");
          return "ok";
        }
      }
    ]
  }, {
    objective: "Retry once"
  });

  assert.equal(attempts, 2);
  assert.equal(result.outputs.fragile, "ok");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- test/framework/runtime.test.js`

Expected: fail with `Cannot find module` for `src/framework/runtime.js`.

- [ ] **Step 3: Implement the runtime**

Create `src/framework/runtime.js`:

```js
import { toErrorRecord } from "./errors.js";

function withTimeout(promise, timeoutMs, taskId) {
  if (!timeoutMs) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Task '${taskId}' timed out after ${timeoutMs}ms.`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class AgentRuntime {
  constructor(options = {}) {
    this.policyEngine = options.policyEngine;
    this.evidenceLedger = options.evidenceLedger;
    this.toolGateway = options.toolGateway;
    this.clock = options.clock || (() => new Date());
  }

  async runWorkflow(workflow, goal = {}) {
    const runId = goal.runId || `run_${this.clock().getTime()}`;
    const preflight = this.policyEngine?.evaluateGoal(goal) || {
      status: "allow",
      reason: "No policy engine configured.",
      limits: {}
    };

    if (preflight.status !== "allow") {
      return {
        runId,
        status: preflight.status,
        reason: preflight.reason,
        trace: [],
        outputs: {}
      };
    }

    const context = {
      runId,
      goal,
      outputs: {},
      evidence: this.evidenceLedger,
      tools: this.toolGateway,
      trace: []
    };

    for (const task of workflow.tasks || []) {
      const startedAt = this.clock().toISOString();
      const maxAttempts = 1 + (task.retries || 0);
      let lastError = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const output = await withTimeout(
            Promise.resolve(task.run(context)),
            task.timeoutMs,
            task.id
          );
          context.outputs[task.id] = output;
          context.trace.push({
            taskId: task.id,
            status: "completed",
            attempt,
            startedAt,
            finishedAt: this.clock().toISOString()
          });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          context.trace.push({
            taskId: task.id,
            status: "failed",
            attempt,
            startedAt,
            finishedAt: this.clock().toISOString(),
            error: toErrorRecord(error)
          });
        }
      }

      if (lastError) {
        return {
          runId,
          status: "failed",
          error: toErrorRecord(lastError),
          trace: context.trace,
          outputs: context.outputs
        };
      }
    }

    return {
      runId,
      status: "completed",
      trace: context.trace,
      outputs: context.outputs,
      evidence: this.evidenceLedger?.toJSON?.() || null
    };
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- test/framework/runtime.test.js`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/framework/runtime.js test/framework/runtime.test.js
git commit -m "feat: add agent runtime"
```

## Task 7: Research Workflow

**Files:**
- Create: `src/framework/research-workflow.js`
- Test: `test/framework/research-workflow.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/framework/research-workflow.test.js`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { EvidenceLedger } from "../../src/framework/evidence-ledger.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { AgentRuntime } from "../../src/framework/runtime.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";
import { createResearchWorkflow } from "../../src/framework/research-workflow.js";

test("createResearchWorkflow uses gateway results and records evidence", async () => {
  const evidenceLedger = new EvidenceLedger({
    clock: () => new Date("2026-06-28T10:00:00.000Z")
  });
  const policyEngine = new PolicyEngine({
    allowedTools: ["crawler"],
    allowedOrigins: ["https://github.com"]
  });
  const gateway = new ToolGateway({ policyEngine, evidenceLedger });
  gateway.registerTool("crawler", async () => [
    {
      url: "https://github.com/apify/crawlee",
      title: "Crawlee",
      text: "Crawlee is a web crawling and browser automation library.",
      markdown: "# Crawlee",
      status: 200
    }
  ]);

  const runtime = new AgentRuntime({ policyEngine, evidenceLedger, toolGateway: gateway });
  const result = await runtime.runWorkflow(
    createResearchWorkflow({
      seeds: ["https://github.com/apify/crawlee"],
      maxPages: 1
    }),
    {
      objective: "Research Crawlee",
      allowedTools: ["crawler"],
      allowedOrigins: ["https://github.com"]
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.collect_sources.pages.length, 1);
  assert.equal(result.outputs.synthesize_report.candidates[0].name, "Crawlee");
  assert.equal(evidenceLedger.listEvidence().length, 1);
  assert.equal(evidenceLedger.unsupportedClaims().length, 0);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- test/framework/research-workflow.test.js`

Expected: fail with `Cannot find module` for `src/framework/research-workflow.js`.

- [ ] **Step 3: Implement the research workflow**

Create `src/framework/research-workflow.js`:

```js
function candidateNameFromPage(page) {
  if (page.title) return page.title.replace(/\s*[-|].*$/, "").trim();
  const url = new URL(page.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.at(-1) || url.hostname;
}

export function createResearchWorkflow(options = {}) {
  const seeds = options.seeds || [];
  const maxPages = options.maxPages || 10;

  return {
    name: "enterprise_research",
    tasks: [
      {
        id: "collect_sources",
        retries: 1,
        run: async (context) => {
          const pages = await context.tools.call("crawler", {
            seeds,
            maxPages,
            sameOrigin: options.sameOrigin ?? true,
            includeSitemaps: options.includeSitemaps ?? false
          }, context);

          const evidenceIds = pages.map((page) => {
            const evidence = context.evidence.addEvidence({
              runId: context.runId,
              taskId: "collect_sources",
              sourceType: "url",
              source: page.url,
              excerpt: page.text || page.markdown || page.title || "",
              tool: "crawler",
              confidence: page.status === 200 ? 0.85 : 0.5
            });
            return evidence.evidenceId;
          });

          return { pages, evidenceIds };
        }
      },
      {
        id: "synthesize_report",
        run: async (context) => {
          const collected = context.outputs.collect_sources || { pages: [], evidenceIds: [] };
          const candidates = collected.pages.map((page, index) => {
            const evidenceId = collected.evidenceIds[index];
            context.evidence.addClaim({
              runId: context.runId,
              taskId: "synthesize_report",
              text: `${candidateNameFromPage(page)} was inspected from ${page.url}.`,
              evidenceIds: [evidenceId],
              confidence: 0.8
            });
            return {
              name: candidateNameFromPage(page),
              url: page.url,
              whatItDoes: page.description || page.text?.slice(0, 240) || page.title || "",
              whyUseful: "Potential source or reference for governed agent framework capabilities.",
              risks: ["Requires license and maintenance review before reuse."],
              recommendation: "inspiration_first",
              evidenceIds: [evidenceId]
            };
          });

          return { candidates };
        }
      },
      {
        id: "quality_checks",
        run: async (context) => {
          return {
            unsupportedClaims: context.evidence.unsupportedClaims(),
            evidenceCount: context.evidence.listEvidence().length
          };
        }
      }
    ]
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- test/framework/research-workflow.test.js`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/framework/research-workflow.js test/framework/research-workflow.test.js
git commit -m "feat: add governed research workflow"
```

## Task 8: Public Exports And Crawler Connector

**Files:**
- Modify: `src/index.js`
- Test: `test/framework/exports.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/framework/exports.test.js`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AgentRuntime,
  EvidenceLedger,
  PolicyEngine,
  SkillRegistry,
  ToolGateway,
  createCrawlerTool,
  createResearchWorkflow,
  crawl
} from "../../src/index.js";

test("framework primitives are exported without removing crawler exports", () => {
  assert.equal(typeof crawl, "function");
  assert.equal(typeof AgentRuntime, "function");
  assert.equal(typeof EvidenceLedger, "function");
  assert.equal(typeof PolicyEngine, "function");
  assert.equal(typeof SkillRegistry, "function");
  assert.equal(typeof ToolGateway, "function");
  assert.equal(typeof createResearchWorkflow, "function");
  assert.equal(typeof createCrawlerTool, "function");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- test/framework/exports.test.js`

Expected: fail because framework exports do not exist in `src/index.js`.

- [ ] **Step 3: Add exports and crawler tool factory**

Modify the bottom of `src/index.js` to keep existing exports and add:

```js
export { AjnasFrameworkError, ApprovalRequiredError, PolicyDeniedError, toErrorRecord } from "./framework/errors.js";
export { PolicyEngine } from "./framework/policy.js";
export { EvidenceLedger } from "./framework/evidence-ledger.js";
export { ToolGateway } from "./framework/tool-gateway.js";
export { SkillRegistry } from "./framework/skill-registry.js";
export { AgentRuntime } from "./framework/runtime.js";
export { createResearchWorkflow } from "./framework/research-workflow.js";

export function createCrawlerTool(defaultOptions = {}) {
  return async function crawlerTool(input = {}) {
    return crawl({
      ...defaultOptions,
      ...input
    });
  };
}
```

- [ ] **Step 4: Run the export test and full test suite**

Run: `npm test -- test/framework/exports.test.js`

Expected: pass.

Run: `npm test`

Expected: all crawler and framework tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/index.js test/framework/exports.test.js
git commit -m "feat: export framework sdk primitives"
```

## Task 9: README Framework Positioning

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README introduction**

Replace the first two paragraphs with:

```md
# Ajnas Agent Crawler

Maqam is the crawler-backed seed of a governed agent framework. The current package provides a respectful crawler plus local SDK primitives for governed agent workflows: policy checks, evidence capture, tool execution, skill selection, and runtime orchestration.

The crawler remains the first built-in connector. It is designed for research agents, RAG ingestion, documentation indexing, QA crawling, and content inventory jobs that need a clean Node.js API, JSON/JSONL output, and compliance-friendly defaults.
```

- [ ] **Step 2: Add a framework SDK section after the Library API section**

Add:

````md
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
````

- [ ] **Step 3: Run tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: describe framework sdk direction"
```

## Task 10: Final Verification

**Files:**
- Inspect: `src/index.js`
- Inspect: `README.md`
- Inspect: `docs/superpowers/specs/2026-06-28-ajnas-enterprise-agent-framework-design.md`

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: every `node:test` test passes.

- [ ] **Step 2: Check package exports manually**

Run:

```bash
node --input-type=module -e "import('./src/index.js').then((m) => console.log(['crawl','AgentRuntime','PolicyEngine','EvidenceLedger','ToolGateway','SkillRegistry','createResearchWorkflow','createCrawlerTool'].every((k) => typeof m[k] !== 'undefined')))"
```

Expected output: `true`

- [ ] **Step 3: Check git state**

Run: `git status --short`

Expected: no uncommitted changes except files intentionally left for review.

## Self-Review

- Spec coverage: this plan covers the MVP slice from the design spec: runtime, policy, evidence, gateway, skill registry, research workflow, exports, tests, and README positioning.
- Placeholder scan: the plan uses exact files, commands, expected outcomes, and code blocks for each code-changing task.
- Type consistency: module names and exported identifiers are consistent across tasks.
