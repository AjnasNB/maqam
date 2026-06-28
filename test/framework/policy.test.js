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
