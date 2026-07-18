import assert from "node:assert/strict";
import { test } from "node:test";
import { PolicyEngine } from "../../src/framework/policy.js";

test("evaluateGoal allows public research goals within tenant limits", () => {
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

test("authorizeToolCall denies disallowed tools and origins", () => {
  const toolPolicy = new PolicyEngine({ allowedTools: ["crawler"] });
  const originPolicy = new PolicyEngine({
    allowedTools: ["crawler"],
    allowedOrigins: ["https://github.com"]
  });

  assert.equal(toolPolicy.authorizeToolCall({
    toolName: "browser",
    input: { url: "https://github.com" }
  }).status, "deny");

  const originDecision = originPolicy.authorizeToolCall({
    toolName: "crawler",
    input: { seeds: ["https://example.com"] }
  });
  assert.equal(originDecision.status, "deny");
  assert.match(originDecision.reason, /origin/i);
});

test("authorizeToolCall enforces declared network origins with input URLs", () => {
  const policy = new PolicyEngine({
    allowedTools: ["search"],
    allowedOrigins: ["https://input.example", "https://provider.example"]
  });
  assert.equal(policy.authorizeToolCall({
    toolName: "search",
    input: { url: "https://input.example/path" },
    metadata: { networkOrigins: ["https://provider.example"] }
  }).status, "allow");

  const tenantDenied = policy.authorizeToolCall({
    toolName: "search",
    input: { query: "no visible URL" },
    metadata: { networkOrigins: ["https://blocked.example"] }
  });
  assert.equal(tenantDenied.status, "deny");
  assert.match(tenantDenied.reason, /blocked\.example/);

  const goalDenied = policy.authorizeToolCall({
    goal: { allowedOrigins: ["https://input.example"] },
    toolName: "search",
    input: { url: "https://input.example/path" },
    metadata: { networkOrigins: ["https://provider.example"] }
  });
  assert.equal(goalDenied.status, "deny");
  assert.match(goalDenied.reason, /goal/i);
});

test("PolicyEngine rejects malformed and polluted network origin metadata", () => {
  const policy = new PolicyEngine({ allowedTools: ["reader"], allowAllOrigins: true });
  for (const origin of [
    "https://example.com/",
    "https://example.com/path",
    "https://user@example.com",
    "file:///tmp/source"
  ]) {
    assert.throws(
      () => policy.authorizeToolCall({
        toolName: "reader",
        metadata: { networkOrigins: [origin] }
      }),
      /exact HTTP\(S\) origins/
    );
  }

  let getterCalls = 0;
  const origins = [];
  Object.defineProperty(origins, "0", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "https://example.com";
    }
  });
  assert.throws(
    () => policy.authorizeToolCall({
      toolName: "reader",
      metadata: { networkOrigins: origins }
    }),
    /own enumerable data property/
  );
  assert.equal(getterCalls, 0);

  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "networkOrigins");
  try {
    Object.defineProperty(Object.prototype, "networkOrigins", {
      value: ["https://polluted.example"],
      configurable: true
    });
    assert.throws(
      () => policy.authorizeToolCall({ toolName: "reader", metadata: {} }),
      /Inherited Tool authorization metadata field 'networkOrigins'/
    );
  } finally {
    if (previous) Object.defineProperty(Object.prototype, "networkOrigins", previous);
    else delete Object.prototype.networkOrigins;
  }
});

test("authorizeToolCall requests approval for configured approval tools", () => {
  const policy = new PolicyEngine({
    allowedTools: ["github"],
    allowedOrigins: ["https://github.com"],
    approvalRequiredTools: ["github"]
  });

  const decision = policy.authorizeToolCall({
    toolName: "github",
    input: { action: "fork", url: "https://github.com/apify/crawlee" }
  });

  assert.equal(decision.status, "needs_approval");
  assert.deepEqual([...decision.requiredApprovals], ["tool:github"]);
});

test("empty allowlists deny tools and URL origins by default", () => {
  const empty = new PolicyEngine();
  assert.equal(empty.authorizeToolCall({ toolName: "reader" }).status, "deny");

  const toolOnly = new PolicyEngine({ allowedTools: ["reader"] });
  assert.equal(toolOnly.authorizeToolCall({
    toolName: "reader",
    input: { url: "https://example.com" }
  }).status, "deny");

  const explicit = new PolicyEngine({ allowAllTools: true, allowAllOrigins: true });
  assert.equal(explicit.authorizeToolCall({
    toolName: "reader",
    input: { url: "https://example.com" }
  }).status, "allow");
});

test("goal budgets can lower but cannot raise tenant limits", () => {
  const policy = new PolicyEngine({
    maxToolCalls: 10,
    defaultLimits: { maxRuntimeMs: 5000 }
  });

  const raised = policy.evaluateGoal({ budget: { maxToolCalls: 1000, maxRuntimeMs: 60_000 } });
  const lowered = policy.evaluateGoal({ budget: { maxToolCalls: 3, maxRuntimeMs: 1200 } });

  assert.equal(raised.limits.maxToolCalls, 10);
  assert.equal(raised.limits.maxRuntimeMs, 5000);
  assert.equal(lowered.limits.maxToolCalls, 3);
  assert.equal(lowered.limits.maxRuntimeMs, 1200);
});

test("denied effects and origins fail before approval evaluation", () => {
  const policy = new PolicyEngine({
    allowedTools: ["publisher"],
    allowedOrigins: ["https://example.com"],
    approvalRequiredTools: ["publisher"],
    deniedEffects: ["billing"]
  });

  assert.equal(policy.authorizeToolCall({
    toolName: "publisher",
    input: { url: "https://example.com" },
    metadata: { effects: ["billing"] }
  }).status, "deny");

  assert.equal(policy.authorizeToolCall({
    toolName: "publisher",
    input: { url: "https://not-allowed.example" },
    metadata: { effects: ["write"] }
  }).status, "deny");
});

test("tool calls cannot exceed the goal's narrower tool and origin scope", () => {
  const policy = new PolicyEngine({
    allowedTools: ["reader", "writer"],
    allowedOrigins: ["https://one.example", "https://two.example"]
  });

  assert.equal(policy.authorizeToolCall({
    goal: { allowedTools: ["reader"] },
    toolName: "writer"
  }).status, "deny");

  assert.equal(policy.authorizeToolCall({
    goal: { allowedOrigins: ["https://one.example"] },
    toolName: "reader",
    input: { url: "https://two.example/path" }
  }).status, "deny");
});

test("PolicyEngine rejects inherited and accessor authority without retaining caller state", () => {
  const previousAllowAllTools = Object.getOwnPropertyDescriptor(Object.prototype, "allowAllTools");
  try {
    Object.defineProperty(Object.prototype, "allowAllTools", {
      value: true,
      configurable: true
    });
    assert.throws(
      () => new PolicyEngine({}),
      /Inherited PolicyEngine config field 'allowAllTools'/
    );
  } finally {
    if (previousAllowAllTools) {
      Object.defineProperty(Object.prototype, "allowAllTools", previousAllowAllTools);
    } else {
      delete Object.prototype.allowAllTools;
    }
  }

  const allowedTools = ["reader"];
  const policy = new PolicyEngine({ allowedTools, allowAllOrigins: true });
  allowedTools[0] = "writer";
  assert.equal(policy.authorizeToolCall({ toolName: "reader" }).status, "allow");
  assert.equal(policy.authorizeToolCall({ toolName: "writer" }).status, "deny");

  const previousAllowedTools = Object.getOwnPropertyDescriptor(Object.prototype, "allowedTools");
  try {
    Object.defineProperty(Object.prototype, "allowedTools", {
      value: ["reader"],
      configurable: true
    });
    assert.throws(
      () => policy.evaluateGoal({}),
      /Inherited Workflow goal field 'allowedTools'/
    );
  } finally {
    if (previousAllowedTools) Object.defineProperty(Object.prototype, "allowedTools", previousAllowedTools);
    else delete Object.prototype.allowedTools;
  }

  const previousEffects = Object.getOwnPropertyDescriptor(Object.prototype, "effects");
  try {
    Object.defineProperty(Object.prototype, "effects", {
      value: ["publish"],
      configurable: true
    });
    assert.throws(
      () => policy.authorizeToolCall({ toolName: "reader", metadata: {} }),
      /Inherited Tool authorization metadata field 'effects'/
    );
  } finally {
    if (previousEffects) Object.defineProperty(Object.prototype, "effects", previousEffects);
    else delete Object.prototype.effects;
  }

  let getterCalls = 0;
  const request = {};
  Object.defineProperty(request, "toolName", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "reader";
    }
  });
  assert.throws(() => policy.authorizeToolCall(request), /data property/);
  assert.equal(getterCalls, 0);
});
