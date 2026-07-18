import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AgentRuntime,
  EvidenceLedger,
  PolicyEngine,
  SkillRegistry,
  ToolGateway,
  ApprovalQueue,
  MaqamError,
  createAgentTool,
  createClaudeCodeAgentTool,
  createCliAgentTool,
  createCodexAgentTool,
  createCrawlerTool,
  defineToolAdapter,
  registerToolAdapter,
  runToolAdapterConformance,
  createReleaseGateReport,
  createResearchWorkflow,
  ResearchSourceRegistry,
  ResearchSourceAuthenticationRequiredError,
  ResearchSourceToolCallerRequiredError,
  ResearchSourceUnavailableError,
  RESEARCH_SOURCE_AUTHENTICATION_MODES,
  RESEARCH_SOURCE_CHECK_STATUSES,
  checkResearchSourceAdapter,
  classifyResearchSourceError,
  describeResearchSourceAdapter,
  defineResearchSourceAdapter,
  defineResearchToolCaller,
  isFatalResearchSourceError,
  isResearchSourceAdapter,
  normalizeResearchDocument,
  normalizeResearchDocuments,
  runResearchSourceDoctor,
  parseRssAtom,
  createRssAtomResearchAdapter,
  createRssAtomSourceAdapter,
  createExaSearchSourceAdapter,
  EXA_HOSTED_MCP_ENDPOINT,
  createYtDlpYouTubeSourceAdapter,
  YOUTUBE_PUBLIC_ORIGIN,
  createWebCrawlerSourceAdapter,
  crawl
} from "../../src/index.js";

test("framework primitives are exported without removing crawler exports", () => {
  assert.equal(typeof crawl, "function");
  assert.equal(typeof AgentRuntime, "function");
  assert.equal(typeof EvidenceLedger, "function");
  assert.equal(typeof PolicyEngine, "function");
  assert.equal(typeof SkillRegistry, "function");
  assert.equal(typeof ToolGateway, "function");
  assert.equal(typeof ApprovalQueue, "function");
  assert.equal(typeof MaqamError, "function");
  assert.equal(typeof createAgentTool, "function");
  assert.equal(typeof createCodexAgentTool, "function");
  assert.equal(typeof createClaudeCodeAgentTool, "function");
  assert.equal(typeof createCliAgentTool, "function");
  assert.equal(typeof defineToolAdapter, "function");
  assert.equal(typeof registerToolAdapter, "function");
  assert.equal(typeof runToolAdapterConformance, "function");
  assert.equal(typeof createResearchWorkflow, "function");
  assert.equal(typeof createCrawlerTool, "function");
  assert.equal(typeof createReleaseGateReport, "function");
  assert.equal(typeof ResearchSourceRegistry, "function");
  assert.equal(typeof ResearchSourceAuthenticationRequiredError, "function");
  assert.equal(typeof ResearchSourceToolCallerRequiredError, "function");
  assert.equal(typeof ResearchSourceUnavailableError, "function");
  assert.deepEqual([...RESEARCH_SOURCE_AUTHENTICATION_MODES], ["none", "required"]);
  assert.deepEqual(
    [...RESEARCH_SOURCE_CHECK_STATUSES],
    ["ready", "degraded", "unavailable", "blocked", "error"]
  );
  assert.equal(typeof checkResearchSourceAdapter, "function");
  assert.equal(typeof classifyResearchSourceError, "function");
  assert.equal(typeof describeResearchSourceAdapter, "function");
  assert.equal(typeof defineResearchSourceAdapter, "function");
  assert.equal(typeof defineResearchToolCaller, "function");
  assert.equal(typeof isFatalResearchSourceError, "function");
  assert.equal(typeof isResearchSourceAdapter, "function");
  assert.equal(typeof normalizeResearchDocument, "function");
  assert.equal(typeof normalizeResearchDocuments, "function");
  assert.equal(typeof runResearchSourceDoctor, "function");
  assert.equal(typeof parseRssAtom, "function");
  assert.equal(typeof createRssAtomResearchAdapter, "function");
  assert.equal(typeof createRssAtomSourceAdapter, "function");
  assert.equal(typeof createExaSearchSourceAdapter, "function");
  assert.equal(EXA_HOSTED_MCP_ENDPOINT, "https://mcp.exa.ai/mcp?tools=web_search_exa");
  assert.equal(typeof createYtDlpYouTubeSourceAdapter, "function");
  assert.equal(YOUTUBE_PUBLIC_ORIGIN, "https://www.youtube.com");
  assert.equal(typeof createWebCrawlerSourceAdapter, "function");
});
