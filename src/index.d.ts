export interface CrawlPage {
  url: string;
  canonical: string | null;
  title: string;
  description: string;
  h1: string;
  text: string;
  markdown: string;
  links: string[];
  fetchedAt: string;
  status?: number;
  contentType?: string;
}

export interface CrawlOptions {
  seeds?: string[];
  urls?: string[];
  maxPages?: number;
  concurrency?: number;
  sameOrigin?: boolean;
  includeSitemaps?: boolean;
  obeyRobots?: boolean;
  userAgent?: string;
  delayMs?: number;
  timeoutMs?: number;
  maxBytes?: number;
  onPage?: (page: CrawlPage) => void | Promise<void>;
  onError?: (failure: { url: string; error: string }) => void | Promise<void>;
}

export function crawl(input?: CrawlOptions): Promise<CrawlPage[]>;
export function extractPage(html: string, url: string): CrawlPage;
export function createCrawlerTool(defaultOptions?: CrawlOptions): (input?: CrawlOptions) => Promise<CrawlPage[]>;

export class AjnasFrameworkError extends Error {
  code: string;
  details: Record<string, unknown>;
}

export class MaqamError extends AjnasFrameworkError {}
export class PolicyDeniedError extends MaqamError {}
export class ApprovalRequiredError extends MaqamError {}
export function toErrorRecord(error: unknown): { name: string; code: string; message: string; details: Record<string, unknown> };

export interface PolicyDecision {
  status: "allow" | "deny" | "needs_approval";
  reason: string;
  limits: Record<string, unknown>;
  requiredApprovals: string[];
}

export class PolicyEngine {
  constructor(config?: {
    allowedTools?: string[];
    deniedTools?: string[];
    allowedOrigins?: string[];
    deniedOrigins?: string[];
    approvalRequiredTools?: string[];
    approvalRequiredEffects?: string[];
    deniedEffects?: string[];
    defaultLimits?: Record<string, unknown>;
    maxToolCalls?: number;
  });
  evaluateGoal(goal?: Record<string, unknown>): PolicyDecision;
  authorizeToolCall(input?: { toolName?: string; input?: unknown; context?: unknown; goal?: unknown; metadata?: { effects?: string[] } }): PolicyDecision;
  isToolAllowed(toolName: string): boolean;
  isOriginAllowed(origin: string): boolean;
}

export class EvidenceLedger {
  constructor(options?: { clock?: () => Date });
  addEvidence(input?: Record<string, unknown>): Record<string, unknown>;
  addClaim(input?: Record<string, unknown>): Record<string, unknown>;
  listEvidence(): Record<string, unknown>[];
  listClaims(): Record<string, unknown>[];
  unsupportedClaims(): Record<string, unknown>[];
  toJSON(): Record<string, unknown>;
}

export class ToolGateway {
  constructor(options?: { policyEngine?: PolicyEngine; evidenceLedger?: EvidenceLedger; approvalQueue?: ApprovalQueue; goal?: unknown; clock?: () => Date });
  registerTool(name: string, handler: AgentTool, metadata?: Record<string, unknown> & { effects?: string[] }): this;
  call(toolName: string, input?: unknown, context?: Record<string, unknown>): Promise<unknown>;
  getCallCount(runId?: string): number;
  resetRun(runId: string): void;
  trace: Array<Record<string, unknown>>;
}

export class SkillRegistry {
  constructor(options?: { skills?: Record<string, unknown>[] });
  register(skill: Record<string, unknown>): this;
  list(): Record<string, unknown>[];
  findByCapability(capability: string): Record<string, unknown>[];
  select(input?: { trigger?: string; capabilities?: string[] }): Record<string, unknown>[];
}

export class AgentRuntime {
  constructor(options?: { policyEngine?: PolicyEngine; evidenceLedger?: EvidenceLedger; toolGateway?: ToolGateway; approvalQueue?: ApprovalQueue; clock?: () => Date });
  runWorkflow(workflow: { tasks?: Array<{ id: string; retries?: number; timeoutMs?: number; run: (context: Record<string, unknown>) => unknown | Promise<unknown> }> }, goal?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface ApprovalRecord {
  approvalId: string;
  action: string;
  status: "pending" | "approved" | "rejected";
  risk: "low" | "medium" | "high" | "critical" | string;
  requestedBy: string;
  reason: string;
  subject: Record<string, unknown>;
  evidence: string[];
  requestedAt: string;
  decision?: null | { decidedBy: string; note: string; decidedAt: string };
  reusable?: boolean;
  consumptions?: Array<{ consumedAt: string; consumedBy: string; runId: string | null; toolName: string | null }>;
}

export class ApprovalQueue {
  constructor(options?: { clock?: () => Date; approvals?: ApprovalRecord[]; nextId?: number });
  static fromJSON(input?: { approvals?: ApprovalRecord[]; nextId?: number }, options?: { clock?: () => Date }): ApprovalQueue;
  requestApproval(input?: Partial<ApprovalRecord> & { action?: string }): ApprovalRecord;
  approve(approvalId: string, decision?: { decidedBy?: string; note?: string; decidedAt?: string }): ApprovalRecord;
  reject(approvalId: string, decision?: { decidedBy?: string; note?: string; decidedAt?: string }): ApprovalRecord;
  consume(approvalId: string, usage?: { consumedBy?: string; runId?: string; toolName?: string }): ApprovalRecord;
  get(approvalId: string): ApprovalRecord | null;
  pending(): ApprovalRecord[];
  findMatching(input?: { action?: string; status?: ApprovalRecord["status"]; subject?: Record<string, unknown> }): ApprovalRecord | null;
  toJSON(): { approvals: ApprovalRecord[]; nextId: number };
}

export interface ReleaseGateReport {
  packageName: string | null;
  version: string | null;
  license: string | null;
  publishCommand: string;
  status: "blocked" | "waiting_for_approval" | "approved";
  readyToPublish: boolean;
  missing: string[];
  blockers: string[];
  verification: Array<{ command?: string; status?: string; summary?: string }>;
  provenance: Record<string, unknown>;
  approval: ApprovalRecord | null;
  summary: string;
}

export function createReleaseGateReport(input?: {
  packageName?: string;
  version?: string;
  license?: string;
  publishCommand?: string;
  requiredFiles?: Record<string, boolean>;
  verification?: Array<{ command?: string; status?: string; summary?: string }>;
  provenance?: { inspectedProjects?: Array<Record<string, unknown>>; copiedThirdPartyCode?: boolean };
  approval?: ApprovalRecord | null;
}): ReleaseGateReport;

export type AgentTool<TInput = unknown, TOutput = unknown> = ((input?: TInput, context?: Record<string, unknown>) => Promise<TOutput>) & {
  governance?: Readonly<Record<string, unknown>>;
};

export interface CliAgentOptions {
  name?: string;
  command: string;
  args?: string[];
  cwd?: string;
  allowedCwdRoots?: string[];
  env?: Record<string, string>;
  inheritEnv?: boolean;
  envAllowlist?: string[];
  stdin?: "json" | "text" | "none";
  parseJson?: boolean;
  parseJsonLines?: boolean;
  timeoutMs?: number;
  maxInputTokens?: number | null;
  maxOutputTokens?: number | null;
  maxOutputBytes?: number | null;
  rejectOnNonZero?: boolean;
  shell?: boolean;
  allowUnsafeShell?: boolean;
}

export interface CliAgentResult {
  name: string;
  command: string;
  args: string[];
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  approxInputTokens: number;
  approxOutputTokens: number;
  outputBytes: number;
  limits: Record<string, number | null>;
  json?: unknown;
  jsonLines?: Array<Record<string, unknown>>;
}

export interface ProviderAgentResult {
  provider: "codex" | "claude-code";
  status: "completed";
  sessionId: string | null;
  output: string;
  usage: Record<string, number | null>;
  activity: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
  process: Record<string, unknown>;
  governance: Record<string, unknown>;
}

export interface CodexAgentToolOptions {
  name?: string;
  command?: string;
  commandPrefixArgs?: string[];
  cwd?: string;
  allowedCwdRoots?: string[];
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  allowDangerFullAccess?: boolean;
  approvalPolicy?: "untrusted" | "on-request" | "never";
  ignoreUserConfig?: boolean;
  ignoreRules?: boolean;
  ephemeral?: boolean;
  model?: string;
  configOverrides?: string[];
  timeoutMs?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxOutputBytes?: number;
  maxTotalTokens?: number | null;
  expectedOutput?: string | RegExp;
  requireFileChanges?: boolean;
  includeEvents?: boolean;
  env?: Record<string, string>;
  envAllowlist?: string[];
  additionalEnvKeys?: string[];
}

export interface ClaudeCodeAgentToolOptions {
  name?: string;
  command?: string;
  commandPrefixArgs?: string[];
  cwd?: string;
  allowedCwdRoots?: string[];
  permissionMode?: "acceptEdits" | "auto" | "bypassPermissions" | "default" | "dontAsk" | "plan";
  allowDangerousPermissions?: boolean;
  tools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  maxTotalTokens?: number | null;
  expectedOutput?: string | RegExp;
  minToolCalls?: number;
  timeoutMs?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxOutputBytes?: number;
  includeEvents?: boolean;
  env?: Record<string, string>;
  envAllowlist?: string[];
  additionalEnvKeys?: string[];
}

export function createAgentTool(agent: unknown, options?: Record<string, unknown>): AgentTool;
export function createCliAgentTool(options: CliAgentOptions): AgentTool<unknown, CliAgentResult>;
export function estimateCliInputTokens(value: unknown): number;
export function parseCliJsonLines(value: string, name?: string): Array<Record<string, unknown>>;
export function createCodexAgentTool(options?: CodexAgentToolOptions): AgentTool<unknown, ProviderAgentResult>;
export function createClaudeCodeAgentTool(options?: ClaudeCodeAgentToolOptions): AgentTool<unknown, ProviderAgentResult>;
export function normalizeCodexEvents(events?: Array<Record<string, unknown>>): Record<string, unknown>;
export function normalizeClaudeCodeEvents(events?: Array<Record<string, unknown>>): Record<string, unknown>;
export function createResearchWorkflow(options?: Record<string, unknown>): { name: string; tasks: Array<Record<string, unknown>> };
