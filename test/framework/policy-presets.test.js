import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PolicyEngine,
  createPolicyPreset,
  simulatePolicyWorkflow
} from "../../src/index.js";

test("policy presets remain fail-closed and immutable", () => {
  const config = createPolicyPreset("production", {
    allowedTools: ["release", "release"],
    allowedOrigins: ["https://deploy.example.com"],
    defaultLimits: { maxToolCalls: 8, maxRuntimeMs: 60_000 }
  });

  assert.deepEqual(config.allowedTools, ["release"]);
  assert.deepEqual(config.allowedOrigins, ["https://deploy.example.com"]);
  assert.equal(config.allowAllTools, false);
  assert.equal(config.allowAllOrigins, false);
  assert.equal(config.defaultLimits.maxToolCalls, 8);
  assert.ok(config.approvalRequiredEffects.includes("write"));
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.allowedTools));
  assert.throws(() => createPolicyPreset("unknown"), /Unknown policy preset/);
  assert.throws(
    () => createPolicyPreset("production", { allowAllTools: true }),
    /Unknown Policy preset options field/
  );
  assert.throws(
    () => createPolicyPreset("production", { allowedOrigins: ["https://example.com/path"] }),
    /exact HTTP\(S\) origins/
  );
  assert.throws(
    () => createPolicyPreset("production", { maxToolCalls: "8" }),
    /non-negative safe integer/
  );
  assert.throws(
    () => createPolicyPreset("production", { defaultLimits: { maxRuntimeMs: -1 } }),
    /non-negative safe integer/
  );
});

test("local and team presets deny higher-authority effects", () => {
  const local = new PolicyEngine(createPolicyPreset("local-development", {
    allowedTools: ["release"]
  }));
  const team = new PolicyEngine(createPolicyPreset("team-delivery", {
    allowedTools: ["release"]
  }));

  assert.equal(local.authorizeToolCall({
    toolName: "release",
    metadata: { effects: ["production"] }
  }).status, "deny");
  assert.equal(team.authorizeToolCall({
    toolName: "release",
    metadata: { effects: ["secret"] }
  }).status, "deny");
});

test("workflow simulation reports policy outcomes without dispatching", () => {
  let dispatched = 0;
  const policyEngine = new PolicyEngine(createPolicyPreset("production", {
    allowedTools: ["read", "release"],
    allowedOrigins: ["https://deploy.example.com"]
  }));
  const report = simulatePolicyWorkflow({
    policyEngine,
    goal: {
      allowedTools: ["read", "release"],
      allowedOrigins: ["https://deploy.example.com"]
    },
    calls: [
      { toolName: "read", input: { url: "https://deploy.example.com/status" } },
      {
        toolName: "release",
        input: { url: "https://deploy.example.com/releases" },
        metadata: { effects: ["publish"] }
      }
    ]
  });

  assert.equal(report.status, "needs_approval");
  assert.equal(report.dispatched, false);
  assert.deepEqual({ ...report.summary }, {
    allowed: 1,
    denied: 0,
    needsApproval: 1,
    skipped: 0
  });
  assert.equal(dispatched, 0);
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.calls));
});

test("workflow simulation skips calls when the goal is denied", () => {
  const policyEngine = new PolicyEngine(createPolicyPreset("production", {
    allowedTools: ["read"]
  }));
  const report = simulatePolicyWorkflow({
    policyEngine,
    goal: { allowedTools: ["release"] },
    calls: [{ toolName: "read" }]
  });

  assert.equal(report.status, "deny");
  assert.equal(report.calls.length, 0);
  assert.equal(report.summary.skipped, 1);
});

test("workflow simulation rejects inherited and accessor authority fields", () => {
  const policyEngine = new PolicyEngine(createPolicyPreset("production", {
    allowedTools: ["read"]
  }));
  assert.throws(
    () => simulatePolicyWorkflow(Object.create({ policyEngine })),
    /must be a plain object/
  );
  const request = { calls: [] };
  Object.defineProperty(request, "policyEngine", { get: () => policyEngine, enumerable: true });
  assert.throws(() => simulatePolicyWorkflow(request), /own enumerable data property/);
});
