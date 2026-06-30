import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AgentRuntime,
  EvidenceLedger,
  PolicyEngine,
  SkillRegistry,
  ToolGateway,
  createAgentTool,
  createCliAgentTool,
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
  assert.equal(typeof createAgentTool, "function");
  assert.equal(typeof createCliAgentTool, "function");
  assert.equal(typeof createResearchWorkflow, "function");
  assert.equal(typeof createCrawlerTool, "function");
});
