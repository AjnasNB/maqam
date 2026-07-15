export type JsonObject = Record<string, unknown>;

export interface CrawlRedirect {
  from: string;
  to: string;
  status: number;
}

export interface CrawlPage {
  url: string;
  canonical: string | null;
  title: string;
  description: string;
  h1: string;
  language: string | null;
  text: string;
  markdown: string;
  links: string[];
  fetchedAt: string;
  status?: number;
  contentType?: string;
  bytes?: number;
  contentHash?: string;
  depth?: number;
  discoveredFrom?: string | null;
  redirectChain?: CrawlRedirect[];
  etag?: string | null;
  lastModified?: string | null;
  robotsAllowed?: boolean;
}

export interface CrawlFailure {
  url: string;
  phase: "page" | "sitemap" | string;
  code: string;
  error: string;
}

export interface CrawlStats {
  requests: number;
  retries: number;
  skippedByRobots: number;
  skippedByOrigin: number;
  queueDropped: number;
  pages: number;
  failures: number;
  queued: number;
  seen: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
}

export interface CrawlDetailedResult {
  pages: CrawlPage[];
  failures: CrawlFailure[];
  stats: CrawlStats;
}

export interface CrawlerDnsAddress {
  address: string;
  family: 4 | 6;
}

export type CrawlerDnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true }
) => CrawlerDnsAddress | CrawlerDnsAddress[] | Promise<CrawlerDnsAddress | CrawlerDnsAddress[]>;

export interface CrawlOptions {
  seeds?: string[];
  /** Legacy alias for `seeds`. Ignored when `seeds` is present. */
  urls?: string[];
  maxPages?: number;
  maxSeeds?: number;
  maxRequests?: number;
  maxQueue?: number;
  maxLinksPerPage?: number;
  maxDepth?: number;
  concurrency?: number;
  sameOrigin?: boolean;
  allowedOrigins?: string[];
  includeSitemaps?: boolean;
  maxSitemaps?: number;
  maxUrlsPerSitemap?: number;
  obeyRobots?: boolean;
  /** Trusted opt-in for supported private/loopback ranges. Link-local metadata and other unsafe ranges remain blocked. */
  allowPrivateNetworks?: boolean;
  userAgent?: string;
  delayMs?: number;
  timeoutMs?: number;
  maxDurationMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  signal?: AbortSignal | null;
  /** Advanced/test hook. Every returned address is still validated and the selected address is pinned. */
  dnsLookup?: CrawlerDnsLookup | null;
  onPage?: (page: CrawlPage) => void | Promise<void>;
  onError?: (failure: CrawlFailure) => void | Promise<void>;
}

export function crawl(input?: CrawlOptions): Promise<CrawlPage[]>;
export function crawlDetailed(input?: CrawlOptions): Promise<CrawlDetailedResult>;
export function extractPage(html: string, url: string, options?: { maxLinksPerPage?: number }): CrawlPage;
export function normalizeUrl(value: string | URL): string;
export function discoverSitemapUrls(sitemapUrl: string | URL, options?: CrawlOptions): Promise<string[]>;
export function createCrawlerTool(defaultOptions?: CrawlOptions): AgentTool<CrawlOptions, CrawlPage[]>;

export interface ClassifiedIpAddress {
  address: string;
  family: 0 | 4 | 6;
  range: string;
  isPublic: boolean;
}

export interface ResolvedUrlAddress extends ClassifiedIpAddress {
  family: 4 | 6;
}

export interface ResolvedUrlTarget {
  url: URL;
  hostname: string;
  address: string;
  family: 4 | 6;
  addresses: ResolvedUrlAddress[];
}

export function classifyIpAddress(value: string): ClassifiedIpAddress;
export function isPublicIpAddress(value: string): boolean;
export function resolveUrlTarget(value: string | URL, options?: {
  allowPrivateNetworks?: boolean;
  lookup?: CrawlerDnsLookup;
  signal?: AbortSignal | null;
}): Promise<ResolvedUrlTarget>;

export interface FrameworkErrorOptions {
  code?: string;
  details?: JsonObject;
  cause?: unknown;
}

export class AjnasFrameworkError extends Error {
  constructor(message: string, options?: FrameworkErrorOptions);
  code: string;
  details: JsonObject;
}

export class MaqamError extends AjnasFrameworkError {}
export class PolicyDeniedError extends MaqamError {}
export class ApprovalRequiredError extends MaqamError {}

export interface ErrorRecord {
  name: string;
  code: string;
  message: string;
  details: JsonObject;
}

export function toErrorRecord(error: unknown): ErrorRecord;

export interface PolicyDecision {
  status: "allow" | "deny" | "needs_approval";
  reason: string;
  limits: JsonObject;
  requiredApprovals: string[];
  scope?: PolicyAuthorizationScope;
}

export interface PolicyAuthorizationScope {
  allowedOrigins: string[];
  originsExplicit: boolean;
  originsUnrestricted: boolean;
}

export interface WorkflowGoal extends JsonObject {
  runId?: string;
  objective?: string;
  allowedTools?: string[];
  allowedOrigins?: string[];
  budget?: JsonObject;
  approvalId?: string;
  approvalIds?: string[];
  requestedBy?: string;
  approvalEvidence?: string[];
}

export interface ToolMetadata extends JsonObject {
  effects?: string[];
}

export interface PolicyEngineConfig {
  allowedTools?: string[];
  deniedTools?: string[];
  allowedOrigins?: string[];
  deniedOrigins?: string[];
  approvalRequiredTools?: string[];
  approvalRequiredEffects?: string[];
  deniedEffects?: string[];
  /** Explicitly permits tools when `allowedTools` is empty. Defaults to false. */
  allowAllTools?: boolean;
  /** Explicitly permits URL origins when `allowedOrigins` is empty. Defaults to false. */
  allowAllOrigins?: boolean;
  defaultLimits?: JsonObject;
  maxToolCalls?: number;
}

export class PolicyEngine {
  constructor(config?: PolicyEngineConfig);
  evaluateGoal(goal?: WorkflowGoal): PolicyDecision;
  authorizeToolCall(input?: {
    toolName?: string;
    input?: unknown;
    context?: unknown;
    goal?: WorkflowGoal | null;
    metadata?: ToolMetadata;
  }): PolicyDecision;
  isToolAllowed(toolName: string): boolean;
  isOriginAllowed(origin: string): boolean;
  authorizationScope(goal?: WorkflowGoal): PolicyAuthorizationScope;
}

export interface EvidenceInput {
  evidenceId?: string;
  runId?: string | null;
  taskId?: string | null;
  sourceType?: string;
  source?: string;
  retrievedAt?: string;
  excerpt?: string;
  hash?: string;
  tool?: string | null;
  confidence?: number;
}

export interface EvidenceRecord {
  evidenceId: string;
  runId: string | null;
  taskId: string | null;
  sourceType: string;
  source: string;
  retrievedAt: string;
  excerpt: string;
  hash: string;
  tool: string | null;
  confidence: number;
}

export interface ClaimInput {
  claimId?: string;
  runId?: string | null;
  taskId?: string | null;
  text?: string;
  evidenceIds?: string[];
  confidence?: number;
}

export interface ClaimRecord {
  claimId: string;
  runId: string | null;
  taskId: string | null;
  text: string;
  evidenceIds: string[];
  confidence: number;
}

export interface EvidenceLedgerJson {
  evidence: EvidenceRecord[];
  claims: ClaimRecord[];
  unsupportedClaims: ClaimRecord[];
}

export class EvidenceLedger {
  constructor(options?: { clock?: () => Date });
  addEvidence(input?: EvidenceInput): EvidenceRecord;
  addClaim(input?: ClaimInput): ClaimRecord;
  listEvidence(): EvidenceRecord[];
  listClaims(): ClaimRecord[];
  unsupportedClaims(): ClaimRecord[];
  toJSON(): EvidenceLedgerJson;
}

export interface AgentToolContext extends JsonObject {
  runId?: string;
  taskId?: string;
  goal?: WorkflowGoal;
  limits?: JsonObject;
  signal?: AbortSignal;
  authorizedOrigins?: string[];
  authorizationScope?: PolicyAuthorizationScope | null;
  approvalId?: string | null;
  approvalIds?: string[];
  requestedBy?: string;
  approvalEvidence?: string[];
  evidence?: EvidenceLedger | null;
  evidenceLedger?: EvidenceLedger | null;
  approvals?: ApprovalQueue | null;
  tools?: ToolGateway | null;
  outputs?: JsonObject;
  trace?: JsonObject[];
}

export type AgentTool<TInput = unknown, TOutput = unknown> = ((
  input?: TInput,
  context?: AgentToolContext
) => Promise<TOutput>) & {
  governance?: Readonly<JsonObject>;
};

export type AgentHandler<TInput = unknown, TOutput = unknown> = ((
  input: TInput,
  context: AgentToolContext
) => TOutput | Promise<TOutput>) & {
  governance?: Readonly<JsonObject>;
};

export interface ToolGatewayCommonOptions {
  evidenceLedger?: EvidenceLedger;
  approvalQueue?: ApprovalQueue;
  goal?: WorkflowGoal | null;
  clock?: () => Date;
}

export type ToolGatewayOptions = ToolGatewayCommonOptions & (
  | { policyEngine: PolicyEngine; allowUngoverned?: false }
  | { policyEngine?: undefined; /** Explicit opt-in for intentionally ungoverned use. */ allowUngoverned: true }
);

export class ToolGateway {
  constructor(options: ToolGatewayOptions);
  registerTool<TInput = unknown, TOutput = unknown>(
    name: string,
    handler: AgentHandler<TInput, TOutput>,
    metadata?: ToolMetadata
  ): this;
  call<TOutput = unknown, TInput = unknown>(
    toolName: string,
    input?: TInput,
    context?: AgentToolContext
  ): Promise<TOutput>;
  getCallCount(runId?: string): number;
  resetRun(runId: string): void;
  trace: JsonObject[];
}

export interface SkillRecord {
  id: string;
  name: string;
  version: string;
  triggers: string[];
  capabilities: string[];
  trustLevel: string;
  evalScore: number;
  metadata: JsonObject;
}

export type SkillInput = Pick<SkillRecord, "id" | "name" | "version"> & Partial<Omit<SkillRecord, "id" | "name" | "version">>;

export interface SkillQuery {
  text?: string;
  trigger?: string;
  capabilities?: string[];
}

export class SkillRegistry {
  constructor(options?: { skills?: SkillInput[] });
  register(skill: SkillInput): SkillRecord;
  get(id: string): SkillRecord | null;
  list(): SkillRecord[];
  find(query?: Pick<SkillQuery, "text" | "capabilities">): SkillRecord[];
  findByCapability(capability: string): SkillRecord[];
  select(query?: SkillQuery): SkillRecord[];
}

export interface WorkflowTask<TOutput = unknown> {
  id: string;
  retries?: number;
  retryable?: boolean;
  retryOn?: string[] | ((error: unknown, attempt: number) => boolean);
  timeoutMs?: number;
  run: (context: AgentToolContext) => TOutput | Promise<TOutput>;
}

export interface Workflow {
  name?: string;
  tasks?: WorkflowTask[];
}

export interface WorkflowTraceRecord extends JsonObject {
  taskId: string;
  status: "completed" | "failed" | "needs_approval";
  attempt: number;
  startedAt: string;
  finishedAt: string;
  error?: ErrorRecord;
}

export interface WorkflowRunResult extends JsonObject {
  runId: string;
  status: "completed" | "failed" | "deny" | "needs_approval" | string;
  reason?: string;
  error?: ErrorRecord;
  limits: JsonObject;
  trace: WorkflowTraceRecord[];
  outputs: JsonObject;
  evidence?: EvidenceLedgerJson | null;
  startedAt: string;
  finishedAt: string;
}

export class AgentRuntime {
  constructor(options?: {
    policyEngine?: PolicyEngine;
    evidenceLedger?: EvidenceLedger;
    toolGateway?: ToolGateway;
    approvalQueue?: ApprovalQueue;
    clock?: () => Date;
    cancellationGraceMs?: number;
  });
  runWorkflow(workflow: Workflow, goal?: WorkflowGoal): Promise<WorkflowRunResult>;
}

export interface ApprovalConsumption {
  consumedAt: string;
  consumedBy: string;
  runId: string | null;
  toolName: string | null;
}

export interface ApprovalDecision {
  decidedBy: string;
  note: string;
  decidedAt: string;
}

export interface ApprovalRecord {
  approvalId: string;
  action: string;
  status: "pending" | "approved" | "rejected";
  risk: "low" | "medium" | "high" | "critical" | string;
  requestedBy: string;
  reason: string;
  subject: JsonObject;
  evidence: string[];
  requestedAt: string;
  decision?: ApprovalDecision;
  reusable: boolean;
  consumptions: ApprovalConsumption[];
}

export interface ApprovalRequest {
  action?: string;
  requestedBy?: string;
  reason?: string;
  risk?: ApprovalRecord["risk"];
  subject?: JsonObject;
  evidence?: string[];
  reusable?: boolean;
}

export interface ApprovalUsage {
  consumedBy?: string;
  runId?: string;
  toolName?: string;
}

export interface ApprovalQueueJson {
  approvals: ApprovalRecord[];
  nextId: number;
}

export class ApprovalQueue {
  constructor(options?: { clock?: () => Date; approvals?: ApprovalRecord[]; nextId?: number });
  static fromJSON(input?: Partial<ApprovalQueueJson>, options?: { clock?: () => Date }): ApprovalQueue;
  requestApproval(input?: ApprovalRequest): ApprovalRecord;
  approve(approvalId: string, decision?: { decidedBy?: string; note?: string }): ApprovalRecord;
  reject(approvalId: string, decision?: { decidedBy?: string; note?: string }): ApprovalRecord;
  consume(approvalId: string, usage?: ApprovalUsage): ApprovalRecord;
  consumeMany(requests?: Array<{ approvalId: string; usage?: ApprovalUsage }>): ApprovalRecord[];
  get(approvalId: string): ApprovalRecord | null;
  pending(): ApprovalRecord[];
  findMatching(input?: {
    action?: string;
    status?: ApprovalRecord["status"];
    subject?: JsonObject;
  }): ApprovalRecord | null;
  toJSON(): ApprovalQueueJson;
}

export interface ReleaseVerification {
  command?: string;
  status?: string;
  summary?: string;
}

export interface ReleaseArtifact {
  integrity: string;
  gitCommit: string;
  filename: string;
  sizeBytes: number;
  [key: string]: unknown;
}

export interface ReleaseGateReport {
  packageName: string | null;
  version: string | null;
  license: string | null;
  publishCommand: string;
  registry: string | null;
  artifact: Partial<ReleaseArtifact> | null;
  status: "blocked" | "waiting_for_approval" | "approved";
  readyToPublish: boolean;
  missing: string[];
  blockers: string[];
  verification: ReleaseVerification[];
  provenance: JsonObject;
  approval: ApprovalRecord | null;
  summary: string;
}

export interface ReleaseGateInput {
  packageName?: string;
  version?: string;
  license?: string;
  publishCommand?: "npm publish --access public" | "npm publish --access public --provenance" | string;
  registry?: string;
  artifact?: Partial<ReleaseArtifact>;
  requiredFiles?: Record<string, boolean>;
  verification?: ReleaseVerification[];
  provenance?: JsonObject & {
    inspectedProjects?: JsonObject[];
    copiedThirdPartyCode?: boolean;
  };
  approval?: ApprovalRecord | null;
}

export function createReleaseGateReport(input?: ReleaseGateInput): ReleaseGateReport;

export interface CliAgentOptions {
  name?: string;
  command: string;
  args?: string[];
  cwd?: string;
  allowedCwdRoots?: string[];
  env?: Record<string, string>;
  inheritEnv?: boolean;
  envAllowlist?: string[];
  /** Required with `inheritEnv` to inherit all process variables when no allowlist is supplied. */
  allowUnsafeEnvInheritance?: boolean;
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
  jsonLines?: JsonObject[];
}

export interface ProviderUsage extends JsonObject {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
  reasoningOutputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface ProviderNormalization {
  sessionId: string | null;
  output: string;
  usage: ProviderUsage;
  activity: JsonObject;
  failure: string | null;
}

export interface ProviderProcessSummary extends JsonObject {
  command: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  approxInputTokens: number;
  approxOutputTokens: number;
  outputBytes: number;
  stderr: string;
}

export interface ProviderAgentResult {
  provider: "codex" | "claude-code";
  status: "completed";
  sessionId: string | null;
  output: string;
  usage: ProviderUsage;
  activity: JsonObject;
  failure: null;
  events: JsonObject[];
  process: ProviderProcessSummary;
  governance: JsonObject;
}

export interface ProviderAgentBaseOptions {
  name?: string;
  command?: string;
  commandPrefixArgs?: string[];
  cwd?: string;
  allowedCwdRoots?: string[];
  timeoutMs?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxOutputBytes?: number;
  maxTotalTokens?: number | null;
  expectedOutput?: string | RegExp;
  includeEvents?: boolean;
  env?: Record<string, string>;
  envAllowlist?: string[];
  additionalEnvKeys?: string[];
}

export interface CodexAgentToolOptions extends ProviderAgentBaseOptions {
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  allowDangerFullAccess?: boolean;
  approvalPolicy?: "untrusted" | "on-request" | "never";
  ignoreUserConfig?: boolean;
  ignoreRules?: boolean;
  ephemeral?: boolean;
  model?: string;
  configOverrides?: string[];
  requireFileChanges?: boolean;
}

export interface ClaudeCodeAgentToolOptions extends ProviderAgentBaseOptions {
  permissionMode?: "acceptEdits" | "auto" | "bypassPermissions" | "default" | "dontAsk" | "plan";
  allowDangerousPermissions?: boolean;
  tools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  minToolCalls?: number;
}

export type AgentInvoker<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: AgentToolContext
) => TOutput | Promise<TOutput>;

export type AgentLike<TInput = unknown, TOutput = unknown> = { name?: string } & (
  | { run: AgentInvoker<TInput, TOutput> }
  | { invoke: AgentInvoker<TInput, TOutput> }
  | { call: AgentInvoker<TInput, TOutput> }
);

export function createAgentTool<TInput = unknown, TOutput = unknown>(
  agent: AgentInvoker<TInput, TOutput> | AgentLike<TInput, TOutput>,
  options?: { name?: string }
): AgentTool<TInput, TOutput>;
export function createCliAgentTool(options: CliAgentOptions): AgentTool<unknown, CliAgentResult>;
export function estimateCliInputTokens(value: unknown): number;
export function parseCliJsonLines(value: string, name?: string): JsonObject[];
export function createCodexAgentTool(options?: CodexAgentToolOptions): AgentTool<unknown, ProviderAgentResult>;
export function createClaudeCodeAgentTool(options?: ClaudeCodeAgentToolOptions): AgentTool<unknown, ProviderAgentResult>;
export function normalizeCodexEvents(events?: JsonObject[]): ProviderNormalization;
export function normalizeClaudeCodeEvents(events?: JsonObject[]): ProviderNormalization;

export interface ResearchWorkflowOptions {
  seeds?: string[];
  maxPages?: number;
  maxEvidenceChars?: number;
  sameOrigin?: boolean;
  includeSitemaps?: boolean;
}

export function createResearchWorkflow(options?: ResearchWorkflowOptions): Workflow;
