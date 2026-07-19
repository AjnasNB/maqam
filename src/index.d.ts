export type JsonObject = Record<string, unknown>;

export interface RssAtomItemProvenance {
  readonly sourceUrl: string;
  readonly format: "rss2" | "atom";
  readonly itemId: string;
  readonly contentHash: string;
  readonly parser: string;
}

export interface RssAtomItem {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly author: string | null;
  readonly publishedAt: string | null;
  readonly text: string;
  readonly markdown: string;
  readonly contentHash: string;
  readonly provenance: RssAtomItemProvenance;
}

export interface RssAtomFeedProvenance {
  readonly sourceUrl: string;
  readonly format: "rss2" | "atom";
  readonly contentHash: string;
  readonly parser: string;
  readonly networkAccess: false;
}

export interface RssAtomResearchFeedProvenance {
  readonly sourceUrl: string;
  readonly format: "rss2" | "atom";
  readonly contentHash: string;
  readonly parser: string;
  readonly parserNetworkAccess: false;
  readonly retrieval: "host-supplied-reader";
  readonly retrievalNetworkAccess: "host-defined";
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly status: number | null;
  readonly contentType: string | null;
  readonly retrievedAt: string | null;
}

export interface RssAtomFeed<
  TProvenance extends RssAtomFeedProvenance | RssAtomResearchFeedProvenance = RssAtomFeedProvenance
> {
  readonly sourceUrl: string;
  readonly format: "rss2" | "atom";
  readonly title: string;
  readonly description: string;
  readonly homeUrl: string | null;
  readonly language: string | null;
  readonly author: string | null;
  readonly updatedAt: string | null;
  readonly items: readonly RssAtomItem[];
  readonly contentHash: string;
  readonly provenance: TProvenance;
}

export type RssAtomResearchFeed = RssAtomFeed<RssAtomResearchFeedProvenance>;

export interface CrawlRedirect {
  from: string;
  to: string;
  status: number;
}

export interface CrawlPage {
  sourceType: "web" | "feed";
  url: string;
  canonical: string | null;
  title: string;
  description: string;
  h1: string;
  language: string | null;
  text: string;
  markdown: string;
  links: string[];
  feedLinks: string[];
  feed?: RssAtomFeed;
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
  includeFeeds?: boolean;
  maxFeedLinks?: number;
  maxFeedItems?: number;
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
export function extractPage(html: string, url: string, options?: {
  maxLinksPerPage?: number;
  maxFeedLinks?: number;
}): CrawlPage;
export function normalizeUrl(value: string | URL): string;
export function discoverSitemapUrls(sitemapUrl: string | URL, options?: CrawlOptions): Promise<string[]>;
export function createCrawlerTool(defaultOptions?: CrawlOptions): AgentTool<CrawlOptions, CrawlPage[]>;

export interface RssAtomParserOptions {
  maxItems?: number;
  maxInputBytes?: number;
  maxTextChars?: number;
  maxMetadataChars?: number;
  maxTotalTextChars?: number;
}

export interface RssAtomReaderRequest {
  readonly url: string;
  readonly maxBytes: number;
  readonly acceptedFormats: readonly ["rss2", "atom"];
}

export interface RssAtomReaderResponse {
  body: string;
  url?: string;
  finalUrl?: string;
  status?: number | null;
  contentType?: string | null;
  retrievedAt?: string | null;
}

export type RssAtomDocumentReader = (
  request: Readonly<RssAtomReaderRequest>,
  context?: unknown
) => string | RssAtomReaderResponse | Promise<string | RssAtomReaderResponse>;

export function parseRssAtom(
  xml: string,
  sourceUrl: string,
  options?: RssAtomParserOptions
): RssAtomFeed;

export function createRssAtomResearchAdapter(
  readDocument: RssAtomDocumentReader,
  options?: RssAtomParserOptions
): (input: { url: string }, context?: unknown) => Promise<RssAtomResearchFeed>;

export interface ResearchDocumentCitationInput {
  uri: string;
  title?: string | null;
}

export interface ResearchDocumentInput {
  id?: string | null;
  uri: string;
  title?: string | null;
  text?: string;
  markdown?: string | null;
  contentType?: string;
  language?: string | null;
  authors?: readonly string[];
  publishedAt?: string | null;
  retrievedAt?: string;
  metadata?: JsonObject;
  citations?: readonly ResearchDocumentCitationInput[];
}

export interface ResearchDocumentSource {
  readonly adapterId: string;
  readonly channel: string;
}

export interface ResearchDocumentCitation {
  readonly uri: string;
  readonly title: string | null;
}

export interface ResearchDocument {
  readonly schemaVersion: "1.0";
  readonly source: ResearchDocumentSource;
  readonly id: string | null;
  readonly uri: string;
  readonly title: string | null;
  readonly text: string;
  readonly markdown: string | null;
  readonly contentType: string;
  readonly language: string | null;
  readonly authors: readonly string[];
  readonly publishedAt: string | null;
  readonly retrievedAt: string;
  readonly metadata: Readonly<JsonObject>;
  readonly citations: readonly ResearchDocumentCitation[];
}

export interface ResearchDocumentProvenance {
  adapterId: string;
  channel: string;
  retrievedAt?: string;
}

export function normalizeResearchDocument(
  value: ResearchDocumentInput,
  provenance: ResearchDocumentProvenance
): ResearchDocument;

export function normalizeResearchDocuments(
  value: readonly ResearchDocumentInput[],
  provenance: ResearchDocumentProvenance
): readonly ResearchDocument[];

export type ResearchSourceAuthenticationMode = "none" | "required";
export type ResearchSourceCheckStatus = "ready" | "degraded" | "unavailable";
export type ResearchSourceReportStatus = ResearchSourceCheckStatus | "blocked" | "error";

export interface ResearchSourceCheckInput {
  readonly adapter: ResearchSourceAdapterDescription;
  readonly signal: AbortSignal;
}

export interface ResearchSourceCheckOutput {
  status: ResearchSourceCheckStatus;
  message?: string;
  details?: JsonObject;
}

export type ResearchSourceReadHandler = (
  input: Readonly<JsonObject>,
  context: ResearchSourceReadContext
) => readonly ResearchDocumentInput[] | Promise<readonly ResearchDocumentInput[]>;

export type ResearchSourceCheckHandler = (
  context: ResearchSourceCheckInput
) => ResearchSourceCheckOutput | Promise<ResearchSourceCheckOutput>;

export interface ResearchSourceAdapterSpec {
  id: string;
  channel: string;
  toolName: string;
  label?: string;
  priority?: number;
  authentication?: ResearchSourceAuthenticationMode;
  capabilities?: readonly string[];
  metadata?: JsonObject;
  read?: ResearchSourceReadHandler;
  check?: ResearchSourceCheckHandler;
}

export interface ResearchSourceAdapter {
  readonly id: string;
  readonly channel: string;
  readonly toolName: string;
  readonly label: string;
  readonly priority: number;
  readonly authentication: ResearchSourceAuthenticationMode;
  readonly capabilities: readonly string[];
  readonly metadata: Readonly<JsonObject>;
  readonly read: ResearchSourceReadHandler | null;
  readonly check: ResearchSourceCheckHandler | null;
}

export interface ResearchSourceAdapterDescription {
  readonly id: string;
  readonly channel: string;
  readonly toolName: string;
  readonly label: string;
  readonly priority: number;
  readonly authentication: ResearchSourceAuthenticationMode;
  readonly capabilities: readonly string[];
  readonly metadata: Readonly<JsonObject>;
  readonly directRead: "unavailable" | "explicitly-ungoverned-only";
  readonly check: "unavailable" | "host-supplied";
}

export type ResearchSourceReadContext = AgentExecutionContext | Readonly<{
  adapter: ResearchSourceAdapterDescription;
}>;

export const RESEARCH_SOURCE_AUTHENTICATION_MODES: readonly ResearchSourceAuthenticationMode[];
export const RESEARCH_SOURCE_CHECK_STATUSES: readonly ResearchSourceReportStatus[];

export function defineResearchSourceAdapter(
  spec: ResearchSourceAdapterSpec | ResearchSourceAdapter
): ResearchSourceAdapter;
export function describeResearchSourceAdapter(
  adapter: ResearchSourceAdapter | ResearchSourceAdapterSpec
): ResearchSourceAdapterDescription;
export function isResearchSourceAdapter(value: unknown): value is ResearchSourceAdapter;

export interface ResearchToolCaller {
  call(
    toolName: string,
    input?: Readonly<JsonObject>,
    context?: ToolCallContext
  ): unknown | Promise<unknown>;
}

export function defineResearchToolCaller(value: ResearchToolCaller): Readonly<ResearchToolCaller>;

export interface ResearchSourceRegistryOptions {
  adapters?: readonly (ResearchSourceAdapter | ResearchSourceAdapterSpec)[];
  preferences?: Readonly<Record<string, readonly string[]>>;
  clock?: () => Date;
  toolCaller?: ResearchToolCaller;
}

export interface ResearchSourceRouteRequest {
  channel: string;
  input?: JsonObject;
  backendPreference?: readonly string[];
  allowAuthenticated?: boolean;
}

export interface ResearchSourceAttempt {
  readonly adapterId: string;
  readonly toolName: string;
  readonly status: "completed" | "fatal" | "unavailable" | "failure";
  readonly classification?: ResearchSourceErrorClassification;
}

export interface ResearchSourceRouteResult {
  readonly adapter: ResearchSourceAdapterDescription;
  readonly documents: readonly ResearchDocument[];
  readonly attempts: readonly ResearchSourceAttempt[];
  readonly governance: Readonly<{
    mode: "tool-caller" | "explicitly-ungoverned-direct";
    toolName: string;
  }>;
}

export interface ResearchSourceDoctorOptions {
  channel?: string;
  adapterIds?: readonly string[];
  timeoutMs?: number;
  signal?: AbortSignal | null;
}

export interface ResearchSourceCheckRecord {
  readonly adapter: ResearchSourceAdapterDescription;
  readonly status: ResearchSourceReportStatus;
  readonly message: string | null;
  readonly details: Readonly<JsonObject>;
  readonly error: ResearchSourceErrorClassification | null;
}

export interface ResearchSourceDoctorReport {
  readonly status: ResearchSourceReportStatus;
  readonly summary: Readonly<Record<ResearchSourceReportStatus | "total", number>>;
  readonly checks: readonly ResearchSourceCheckRecord[];
}

export type ResearchSourceErrorRecord = Readonly<
  Omit<ErrorRecord, "details"> & { details: Readonly<JsonObject> }
>;

export class ResearchSourceRegistry {
  constructor(options?: ResearchSourceRegistryOptions);
  register(adapter: ResearchSourceAdapter | ResearchSourceAdapterSpec): ResearchSourceAdapterDescription;
  get(id: string): ResearchSourceAdapterDescription | null;
  list(options?: { channel?: string }): readonly ResearchSourceAdapterDescription[];
  resolve(channel: string, options?: { backendPreference?: readonly string[] }): readonly ResearchSourceAdapterDescription[];
  route(request: ResearchSourceRouteRequest, context?: ToolCallContext): Promise<ResearchSourceRouteResult>;
  routeUngoverned(request: ResearchSourceRouteRequest): Promise<ResearchSourceRouteResult>;
  doctor(options?: ResearchSourceDoctorOptions): Promise<ResearchSourceDoctorReport>;
}

export interface ResearchSourceErrorClassification {
  readonly kind: "fatal" | "unavailable" | "failure";
  readonly fatal: boolean;
  readonly error: ResearchSourceErrorRecord;
}

export class ResearchSourceUnavailableError extends MaqamError {}
export class ResearchSourceAuthenticationRequiredError extends MaqamError {}
export class ResearchSourceToolCallerRequiredError extends MaqamError {}
export function isFatalResearchSourceError(error: unknown): boolean;
export function classifyResearchSourceError(error: unknown): ResearchSourceErrorClassification;
export function checkResearchSourceAdapter(
  adapter: ResearchSourceAdapter | ResearchSourceAdapterSpec,
  options?: { timeoutMs?: number; signal?: AbortSignal | null }
): Promise<ResearchSourceCheckRecord>;
export function runResearchSourceDoctor(
  adapters: readonly (ResearchSourceAdapter | ResearchSourceAdapterSpec)[],
  options?: { timeoutMs?: number; signal?: AbortSignal | null }
): Promise<ResearchSourceDoctorReport>;

export function createRssAtomSourceAdapter(
  readDocument: RssAtomDocumentReader,
  options?: RssAtomParserOptions
): ResearchSourceAdapter;

export type WebCrawlerSourcePage = Readonly<
  Pick<CrawlPage, "url"> & Partial<Omit<CrawlPage, "url">>
>;

export type WebCrawlerSourceHost = (
  input?: CrawlOptions,
  context?: AgentToolInvocationContext
) => readonly WebCrawlerSourcePage[] | Promise<readonly WebCrawlerSourcePage[]>;

export function createWebCrawlerSourceAdapter(
  hostCrawler: WebCrawlerSourceHost
): ResearchSourceAdapter;

export interface ExaSearchSourceAdapterOptions {
  /** Streamable HTTP endpoint. Defaults to Exa's anonymous hosted MCP endpoint. */
  endpoint?: string;
  /** Injectable transport for tests or a host-governed HTTP client. */
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxResults?: number;
}

export interface ExaSearchSourceInput extends JsonObject {
  query: string;
  numResults?: number;
}

export const EXA_HOSTED_MCP_ENDPOINT: string;
export function createExaSearchSourceAdapter(
  options?: ExaSearchSourceAdapterOptions
): ResearchSourceAdapter;

export interface YtDlpRunnerRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly signal: AbortSignal | null;
}

export interface YtDlpRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type YtDlpRunner = (
  request: Readonly<YtDlpRunnerRequest>
) => YtDlpRunnerResult | Promise<YtDlpRunnerResult>;

export interface YouTubeCaptionReaderRequest {
  readonly url: string;
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly signal: AbortSignal | null;
}

export interface YouTubeCaptionReaderResponse {
  body: string;
  contentType?: string;
}

export type YouTubeCaptionReader = (
  request: Readonly<YouTubeCaptionReaderRequest>
) => string | YouTubeCaptionReaderResponse | Promise<string | YouTubeCaptionReaderResponse>;

export interface YtDlpYouTubeSourceAdapterOptions {
  /** Exact executable path or command name; arguments are never evaluated by a shell. */
  command?: string;
  runner?: YtDlpRunner;
  captionReader?: YouTubeCaptionReader;
  timeoutMs?: number;
  captionTimeoutMs?: number;
  maxOutputBytes?: number;
  maxCaptionBytes?: number;
  maxTranscriptChars?: number;
  maxResults?: number;
  languages?: readonly string[];
}

export interface YtDlpYouTubeSourceInput extends JsonObject {
  /** Canonical HTTPS URL on `www.youtube.com`; alias origins are rejected before dispatch. */
  url?: string;
  query?: string;
  maxResults?: number;
  languages?: readonly string[];
  /** URL reads request captions by default; set false for metadata only. Ignored by search reads. */
  includeTranscript?: boolean;
}

export const YOUTUBE_PUBLIC_ORIGIN: "https://www.youtube.com";
export function createYtDlpYouTubeSourceAdapter(
  options?: YtDlpYouTubeSourceAdapterOptions
): ResearchSourceAdapter;

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
  /** Exact canonical HTTP(S) origins contacted internally by the registered handler. */
  networkOrigins?: readonly string[];
  /** Standard ordered levels are monotonic; non-empty domain-specific labels remain supported. */
  risk?: string;
}

export interface HandlerGovernance extends JsonObject {
  readonly effects?: readonly string[];
  readonly networkOrigins?: readonly string[];
  readonly risk?: string;
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

export interface EvidenceBatchInput {
  evidence?: EvidenceInput[];
  claims?: ClaimInput[];
}

export interface EvidenceBatchResult {
  evidence: EvidenceRecord[];
  claims: ClaimRecord[];
}

export interface EvidenceLedgerView {
  addEvidence(input?: EvidenceInput): EvidenceRecord;
  addClaim(input?: ClaimInput): ClaimRecord;
  addBatch(input?: EvidenceBatchInput): EvidenceBatchResult;
  listEvidence(): EvidenceRecord[];
  listClaims(): ClaimRecord[];
  unsupportedClaims(): ClaimRecord[];
  toJSON(): EvidenceLedgerJson;
}

export type ScopedEvidenceInput = Omit<EvidenceInput, "runId" | "taskId" | "tool"> & {
  /** Attribution is supplied by the runtime capability and cannot be overridden. */
  runId?: never;
  /** Attribution is supplied by the runtime capability and cannot be overridden. */
  taskId?: never;
  /** Attribution is supplied by the runtime capability and cannot be overridden. */
  tool?: never;
};

export type ScopedClaimInput = Omit<ClaimInput, "runId" | "taskId"> & {
  /** Attribution is supplied by the runtime capability and cannot be overridden. */
  runId?: never;
  /** Attribution is supplied by the runtime capability and cannot be overridden. */
  taskId?: never;
};

export interface ScopedEvidenceBatchInput {
  evidence?: ScopedEvidenceInput[];
  claims?: ScopedClaimInput[];
}

export type ScopedEvidenceRecord = Readonly<EvidenceRecord>;
export type ScopedClaimRecord = Readonly<Omit<ClaimRecord, "evidenceIds">> & {
  readonly evidenceIds: readonly string[];
};

export interface ScopedEvidenceBatchResult {
  readonly evidence: readonly ScopedEvidenceRecord[];
  readonly claims: readonly ScopedClaimRecord[];
}

export interface ScopedEvidenceLedgerJson {
  readonly evidence: readonly ScopedEvidenceRecord[];
  readonly claims: readonly ScopedClaimRecord[];
  readonly unsupportedClaims: readonly ScopedClaimRecord[];
}

/** A run-scoped capability. Writes receive trusted run/task/tool attribution. */
export interface ScopedEvidenceLedger {
  addEvidence(input?: ScopedEvidenceInput): ScopedEvidenceRecord;
  addClaim(input?: ScopedClaimInput): ScopedClaimRecord;
  addBatch(input?: ScopedEvidenceBatchInput): ScopedEvidenceBatchResult;
  listEvidence(): readonly ScopedEvidenceRecord[];
  listClaims(): readonly ScopedClaimRecord[];
  unsupportedClaims(): readonly ScopedClaimRecord[];
  toJSON(): ScopedEvidenceLedgerJson;
}

export class EvidenceLedger implements EvidenceLedgerView {
  constructor(options?: { clock?: () => Date });
  addEvidence(input?: EvidenceInput): EvidenceRecord;
  addClaim(input?: ClaimInput): ClaimRecord;
  addBatch(input?: EvidenceBatchInput): EvidenceBatchResult;
  listEvidence(): EvidenceRecord[];
  listClaims(): ClaimRecord[];
  unsupportedClaims(): ClaimRecord[];
  toJSON(): EvidenceLedgerJson;
}

export interface ToolCaller {
  call<TOutput = unknown, TInput = unknown>(
    toolName: string,
    input?: TInput
  ): Promise<TOutput>;
}

/** Untrusted call metadata accepted at the ToolGateway boundary. */
export interface ToolCallContext extends JsonObject {
  runId?: string;
  taskId?: string;
  goal?: WorkflowGoal | null;
  limits?: JsonObject | null;
  signal?: AbortSignal;
  authorizedOrigins?: string[];
  authorizationScope?: PolicyAuthorizationScope | null;
  approvalId?: string | null;
  approvalIds?: string[];
  requestedBy?: string;
  approvalEvidence?: string[];
}

/** Context accepted when directly invoking an AgentTool wrapper. */
export interface AgentToolInvocationContext extends ToolCallContext {
  evidence?: EvidenceLedgerView | ScopedEvidenceLedger | null;
  evidenceLedger?: EvidenceLedgerView | ScopedEvidenceLedger | null;
}

/** Capability-limited context passed to registered tool and agent handlers. */
export interface AgentExecutionContext extends ToolCallContext {
  readonly toolName?: string;
  readonly toolMetadata?: Readonly<ToolMetadata>;
  readonly agentName?: string;
  /** Detached records for approvals already consumed by this exact call. */
  readonly approvals?: readonly ApprovalRecord[];
  readonly evidence?: ScopedEvidenceLedger | null;
  readonly evidenceLedger?: ScopedEvidenceLedger | null;
  tools?: ToolCaller | null;
  outputs?: JsonObject;
  trace?: readonly JsonObject[];
}

/** Capability-limited context passed to workflow tasks. It has no approval queue. */
export interface WorkflowTaskContext extends ToolCallContext {
  runId: string;
  taskId: string;
  goal: WorkflowGoal;
  limits: JsonObject;
  readonly evidence: ScopedEvidenceLedger | null;
  readonly evidenceLedger: ScopedEvidenceLedger | null;
  readonly tools: ToolCaller | null;
  outputs: JsonObject;
}

/** @deprecated Use AgentExecutionContext, WorkflowTaskContext, or ToolCallContext. */
export type AgentToolContext = AgentExecutionContext;

export type AgentTool<TInput = unknown, TOutput = unknown> = ((
  input?: TInput,
  context?: AgentToolInvocationContext
) => Promise<TOutput>) & {
  governance?: Readonly<HandlerGovernance>;
};

export type AgentHandler<TInput = unknown, TOutput = unknown> = ((
  input: TInput,
  context: AgentExecutionContext
) => TOutput | Promise<TOutput>) & {
  governance?: Readonly<HandlerGovernance>;
};

/** A descriptive transport label. Maqam does not bundle clients for these transports. */
export type ToolAdapterTransport = "function" | "sdk" | "http" | "mcp" | "custom";

export interface ToolAdapterSpec<TInput = unknown, TOutput = unknown> {
  schemaVersion?: "maqam.tool-adapter.v1";
  name: string;
  transport: ToolAdapterTransport;
  description: string;
  /** Required and explicit. Use an empty array only for a pure adapter. */
  effects: readonly string[];
  risk: string;
  metadata?: JsonObject;
  /** Bind class prototype methods before supplying them here. */
  invoke: AgentHandler<TInput, TOutput>;
}

export interface ToolAdapter<TInput = unknown, TOutput = unknown> {
  readonly schemaVersion: "maqam.tool-adapter.v1";
  readonly name: string;
  readonly transport: ToolAdapterTransport;
  readonly description: string;
  readonly effects: readonly string[];
  readonly risk: string;
  readonly metadata: Readonly<JsonObject>;
  readonly invoke: AgentHandler<TInput, TOutput>;
}

export interface ToolAdapterGateway {
  registerTool<TInput = unknown, TOutput = unknown>(
    name: string,
    handler: AgentHandler<TInput, TOutput>,
    metadata?: ToolMetadata
  ): unknown;
}

export interface ToolAdapterConformanceCheck {
  readonly id: string;
  readonly status: "passed" | "failed" | "skipped";
}

export interface ToolAdapterConformanceReport {
  readonly schemaVersion: "maqam.tool-adapter-conformance.v1";
  readonly adapter: {
    readonly schemaVersion: "maqam.tool-adapter.v1";
    readonly name: string;
    readonly transport: ToolAdapterTransport;
    readonly description: string;
    readonly effects: readonly string[];
    readonly risk: string;
  };
  readonly passed: boolean;
  readonly checks: readonly ToolAdapterConformanceCheck[];
  readonly traceStatus: string | null;
  readonly error: Readonly<{ name: string; code: string | null }> | null;
  readonly limitations: readonly string[];
}

export interface ToolAdapterConformanceOptions<TInput = unknown, TOutput = unknown> {
  input?: TInput;
  context?: ToolCallContext;
  verifyOutput?: (output: TOutput) => boolean | Promise<boolean>;
}

export const TOOL_ADAPTER_SCHEMA_VERSION: "maqam.tool-adapter.v1";
export const TOOL_ADAPTER_CONFORMANCE_SCHEMA_VERSION: "maqam.tool-adapter-conformance.v1";
export function defineToolAdapter<TInput = unknown, TOutput = unknown>(
  spec: ToolAdapterSpec<TInput, TOutput>
): ToolAdapter<TInput, TOutput>;
export function registerToolAdapter<
  TGateway extends ToolAdapterGateway,
  TInput = unknown,
  TOutput = unknown
>(
  gateway: TGateway,
  adapter: ToolAdapterSpec<TInput, TOutput> | ToolAdapter<TInput, TOutput>
): TGateway;
/** Invokes the adapter once. Run only against a fixture or sandbox. */
export function runToolAdapterConformance<TInput = unknown, TOutput = unknown>(
  adapter: ToolAdapterSpec<TInput, TOutput> | ToolAdapter<TInput, TOutput>,
  options?: ToolAdapterConformanceOptions<TInput, TOutput>
): Promise<ToolAdapterConformanceReport>;

export interface BrowserTarget {
  readonly sessionId: string;
  readonly pageId: string;
  readonly origin: string;
  readonly revision: string;
}

export interface BrowserElementStates {
  readonly disabled?: boolean;
  readonly checked?: boolean;
  readonly selected?: boolean;
  readonly expanded?: boolean;
  readonly required?: boolean;
  /** Indicates presence only; the adapter never returns a raw form value. */
  readonly valuePresent?: boolean;
}

export interface BrowserObservedElement {
  readonly elementId: string;
  readonly role: string;
  readonly name: string;
  readonly states: Readonly<BrowserElementStates>;
}

export interface BrowserObservation {
  readonly target: Readonly<BrowserTarget>;
  readonly url: string;
  readonly title: string;
  readonly elements: readonly BrowserObservedElement[];
}

export interface BrowserObserveInput {
  target: BrowserTarget;
  maxElements?: number;
}

export type BrowserApplyOperation =
  | { kind: "setValueRef"; elementId: string; /** `ref:`-prefixed host value/vault reference, never a raw value. */ valueRef: string }
  | { kind: "selectOption"; elementId: string; optionId: string }
  | { kind: "setChecked"; elementId: string; checked: boolean };

export type BrowserSubmitOperation =
  | {
      kind: "activate" | "submitForm";
      elementId: string;
      expectedOrigin: string;
      opensNewPage: boolean;
    }
  | {
      kind: "navigate";
      url: string;
      expectedOrigin: string;
      opensNewPage: boolean;
    };

export type BrowserPreviewInput =
  | { target: BrowserTarget; phase: "apply"; operations: readonly BrowserApplyOperation[] }
  | { target: BrowserTarget; phase: "submit"; operations: readonly [BrowserSubmitOperation] };

export type BrowserPlan =
  | {
      readonly schemaVersion: "maqam.browser-plan.v1";
      readonly target: Readonly<BrowserTarget>;
      readonly phase: "apply";
      readonly operations: readonly BrowserApplyOperation[];
      readonly planHash: string;
      /** Opaque same-adapter, same-run preview authenticity token. */
      readonly planToken: string;
    }
  | {
      readonly schemaVersion: "maqam.browser-plan.v1";
      readonly target: Readonly<BrowserTarget>;
      readonly phase: "submit";
      readonly operations: readonly [BrowserSubmitOperation];
      readonly planHash: string;
      /** Opaque same-adapter, same-run preview authenticity token. */
      readonly planToken: string;
    };

export interface BrowserMutationInput {
  plan: BrowserPlan;
  /** Host-deduplicated identifier; write adapters must not retry implicitly. */
  operationId: string;
}

export interface BrowserDriverExecution {
  readonly schemaVersion: "maqam.browser-driver-execution.v1";
  readonly runId: string;
  readonly toolName: string;
  readonly inputHash: string;
  readonly approvalIds: readonly string[];
  readonly approvalActions: readonly string[];
  /** Exact origins named by this request, intersected with adapter and policy scope. */
  readonly authorizedOrigins: readonly string[];
  /** Effects the host driver must block before dispatching the browser operation. */
  readonly prohibitedEffects: readonly BrowserProhibitedEffect[];
  readonly signal: AbortSignal | null;
}

export type BrowserProhibitedEffect =
  | "external-protocol"
  | "download"
  | "filesystem-read"
  | "filesystem-write"
  | "file-picker"
  | "clipboard-read"
  | "clipboard-write"
  | "permission-prompt"
  | "print-dialog"
  | "modal-dialog";

/**
 * Required host-driver attestation for a completed mutation. Each value must
 * remain false; Maqam rejects missing, true, accessor-backed, or extra fields.
 */
export interface BrowserDriverEffects {
  externalProtocol: false;
  download: false;
  filesystemRead: false;
  filesystemWrite: false;
  filePicker: false;
  clipboardRead: false;
  clipboardWrite: false;
  permissionPrompt: false;
  printDialog: false;
  modalDialog: false;
}

export interface BrowserDriverPlanCore {
  schemaVersion: "maqam.browser-plan.v1";
  target: BrowserTarget;
  phase: "apply" | "submit";
  operations: readonly (BrowserApplyOperation | BrowserSubmitOperation)[];
}

export interface BrowserDriverMutationResult {
  operationId: string;
  target: BrowserTarget;
  effects: BrowserDriverEffects;
}

/**
 * Host-owned browser capability. Methods must be supplied as own enumerable
 * data functions; bind class methods explicitly. Observe and preview must be
 * read-only. Apply and submit must block every execution.prohibitedEffects
 * entry before dispatch and return an all-false effects attestation. Maqam
 * never creates a browser, imports a profile, or logs in.
 */
export interface GovernedBrowserDriver {
  observe(
    request: Readonly<Required<BrowserObserveInput>>,
    execution: BrowserDriverExecution
  ): BrowserObservation | Promise<BrowserObservation>;
  preview(
    request: BrowserPreviewInput,
    execution: BrowserDriverExecution
  ): BrowserDriverPlanCore | Promise<BrowserDriverPlanCore>;
  apply(
    request: BrowserMutationInput,
    execution: BrowserDriverExecution
  ): BrowserDriverMutationResult | Promise<BrowserDriverMutationResult>;
  submit(
    request: BrowserMutationInput,
    execution: BrowserDriverExecution
  ): BrowserDriverMutationResult | Promise<BrowserDriverMutationResult>;
}

export interface GovernedBrowserLimits {
  maxElements?: number;
  maxTextChars?: number;
  maxOperations?: number;
}

export interface GovernedBrowserOptions {
  driver: GovernedBrowserDriver;
  /** Required, exact canonical HTTP(S) origins; wildcards are not accepted. */
  allowedOrigins: readonly string[];
  toolPrefix?: string;
  limits?: GovernedBrowserLimits;
}

export interface GovernedBrowserRegistration {
  readonly schemaVersion: "maqam.browser-adapter.v1";
  readonly toolNames: Readonly<{
    observe: string;
    preview: string;
    apply: string;
    submit: string;
  }>;
  readonly allowedOrigins: readonly string[];
  readonly prohibitedEffects: readonly BrowserProhibitedEffect[];
  readonly limits: Readonly<Required<GovernedBrowserLimits>>;
}

export interface BrowserMutationResult {
  readonly schemaVersion: "maqam.browser-result.v1";
  readonly status: "applied" | "submitted";
  readonly operationId: string;
  readonly planHash: string;
  readonly observation: BrowserObservation;
}

export const BROWSER_ADAPTER_SCHEMA_VERSION: "maqam.browser-adapter.v1";
export const BROWSER_DRIVER_EXECUTION_SCHEMA_VERSION: "maqam.browser-driver-execution.v1";
export const BROWSER_PLAN_SCHEMA_VERSION: "maqam.browser-plan.v1";
export const BROWSER_RESULT_SCHEMA_VERSION: "maqam.browser-result.v1";
export function registerGovernedBrowserTools(
  gateway: ToolGateway,
  options: GovernedBrowserOptions
): GovernedBrowserRegistration;

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

export interface ToolExecutionReceipt {
  readonly schemaVersion: "maqam.tool-execution.v1";
  readonly toolName: string;
  readonly runId: string;
  readonly inputHash: string;
  readonly decision: Readonly<PolicyDecision>;
  readonly approvalIds: readonly string[];
  readonly approvalActions: readonly string[];
}

export interface ToolExecutionVerifier<TInput = unknown> {
  requireExecution(input: TInput, context: AgentExecutionContext): ToolExecutionReceipt;
}

export class ToolGateway {
  constructor(options: ToolGatewayOptions);
  registerTool<TInput = unknown, TOutput = unknown>(
    name: string,
    handler: AgentHandler<TInput, TOutput>,
    metadata?: ToolMetadata
  ): this;
  registerGuardedTool<TInput = unknown, TOutput = unknown>(
    name: string,
    factory: (verifier: ToolExecutionVerifier<TInput>) => AgentHandler<TInput, TOutput>,
    metadata?: ToolMetadata
  ): this;
  call<TOutput = unknown, TInput = unknown>(
    toolName: string,
    input?: TInput,
    context?: ToolCallContext
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
  run: (context: WorkflowTaskContext) => TOutput | Promise<TOutput>;
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
  /** Full Git commit on which this check ran; required to match the artifact commit. */
  gitCommit?: string;
}

export interface ReleaseArtifact {
  packageName: string;
  version: string;
  filename: string;
  sizeBytes: number;
  /** Independent lowercase SHA-256 hex digest, without a `sha256:` prefix. */
  sha256: string;
  /** Canonical npm Subresource Integrity value in `sha512-<base64>` form. */
  integrity: string;
  /** Full lowercase 40-character Git commit used to build the artifact. */
  gitCommit: string;
}

export interface ReleaseInspectedProject {
  name: string;
  /** Canonical HTTPS project or repository URL. */
  url: string;
  /** Full lowercase 40-character inspected Git revision. */
  revision: string;
  license: string;
  use: string;
}

export interface ReleaseProvenance {
  inspectedProjects: ReleaseInspectedProject[];
  copiedThirdPartyCode: boolean;
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
  provenance: Partial<ReleaseProvenance>;
  approval: ApprovalRecord | null;
  summary: string;
}

export interface ReleaseGateInput {
  packageName?: string;
  version?: string;
  license?: string;
  publishCommand?: "npm publish --access public" | "npm publish --access public --provenance" | "npm publish --access public --ignore-scripts --provenance" | string;
  registry?: string;
  artifact?: Partial<ReleaseArtifact>;
  requiredFiles?: Record<string, boolean>;
  verification?: ReleaseVerification[];
  provenance?: Partial<ReleaseProvenance>;
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
  context: AgentExecutionContext
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
