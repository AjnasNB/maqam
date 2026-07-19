import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "maqam-consumer-types-"));
const consumerDirectory = join(temporaryRoot, "consumer");
const npmCli = process.env.npm_execpath;
const tscPath = join(root, "node_modules", "typescript", "bin", "tsc");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.capture ? "pipe" : "inherit",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.${detail ? `\n${detail}` : ""}`);
  }
  return result.stdout || "";
}

function runNpm(args, options = {}) {
  if (!npmCli) throw new Error("Run this check through npm so npm_execpath is available.");
  return run(process.execPath, [npmCli, ...args], options);
}

try {
  const packReport = JSON.parse(runNpm([
    "pack",
    "--json",
    "--ignore-scripts",
    "--dry-run=false",
    "--pack-destination",
    temporaryRoot
  ], { capture: true, env: { npm_config_dry_run: "false" } }));
  // npm <=11 reports an array, while npm 12 reports an object keyed by the
  // package name. Normalize both CLI shapes, then keep the check
  // fail-closed so this fixture never installs an ambiguous artifact.
  const packed = Array.isArray(packReport)
    ? packReport
    : packReport && typeof packReport === "object"
      ? Object.values(packReport)
      : [];
  if (
    packed.length !== 1
    || packed[0]?.name !== "maqam"
    || packed[0]?.version !== "0.3.1"
    || !packed[0]?.filename
  ) {
    throw new Error("npm pack did not report exactly one Maqam artifact.");
  }

  await mkdir(consumerDirectory);
  const tarball = join(temporaryRoot, basename(packed[0].filename));
  await writeFile(join(consumerDirectory, "package.json"), JSON.stringify({
    name: "maqam-clean-consumer",
    private: true,
    type: "module"
  }, null, 2));
  await writeFile(join(consumerDirectory, "consumer.ts"), [
    "import { AgentRuntime, PolicyEngine, ResearchSourceRegistry, ToolGateway, crawl, createCrawlerTool, createExaSearchSourceAdapter, createRssAtomResearchAdapter, createRssAtomSourceAdapter, createWebCrawlerSourceAdapter, createYtDlpYouTubeSourceAdapter, defineResearchSourceAdapter, defineResearchToolCaller, parseRssAtom, registerGovernedBrowserTools, registerToolAdapter, defineToolAdapter, runToolAdapterConformance } from \"maqam\";",
    "import type { BrowserApplyOperation, BrowserDriverEffects, BrowserPlan, BrowserTarget, GovernedBrowserDriver, ResearchSourceCheckInput, ResearchSourceCheckOutput, ResearchSourceErrorClassification, ResearchSourceReadHandler, ToolExecutionReceipt } from \"maqam\";",
    "import { createMaqamServer } from \"maqam/server\";",
    "void AgentRuntime;",
    "void crawl;",
    "const gateway = new ToolGateway({ policyEngine: new PolicyEngine({ allowedTools: [\"fixture.echo\"] }) });",
    "const adapter = defineToolAdapter({ name: \"fixture.echo\", transport: \"function\", description: \"Echo a typed fixture.\", effects: [], risk: \"low\", invoke: async (input: { value: string }) => ({ value: input.value }) });",
    "registerToolAdapter(gateway, adapter);",
    "void runToolAdapterConformance(adapter, { input: { value: \"ok\" }, verifyOutput: (output) => output.value === \"ok\" });",
    "gateway.registerGuardedTool<{ value: string }, { value: string }>(\"fixture.guarded\", (verifier) => async (input, context) => {",
    "  const receipt: ToolExecutionReceipt = verifier.requireExecution(input, context);",
    "  void receipt.inputHash;",
    "  return { value: input.value };",
    "});",
    "const browserTarget: BrowserTarget = { sessionId: \"session-1\", pageId: \"page-1\", origin: \"https://app.example\", revision: \"revision-1\" };",
    "const noBrowserEffects = (): BrowserDriverEffects => ({ externalProtocol: false, download: false, filesystemRead: false, filesystemWrite: false, filePicker: false, clipboardRead: false, clipboardWrite: false, permissionPrompt: false, printDialog: false, modalDialog: false });",
    "// @ts-expect-error A prohibited browser effect cannot be attested as true.",
    "const invalidBrowserEffects: BrowserDriverEffects = { ...noBrowserEffects(), download: true };",
    "void invalidBrowserEffects;",
    "const browserDriver: GovernedBrowserDriver = {",
    "  async observe(request, execution) { void execution.authorizedOrigins; void execution.prohibitedEffects; return { target: { ...request.target }, url: `${request.target.origin}/`, title: \"Fixture\", elements: [] }; },",
    "  async preview(request) { return { schemaVersion: \"maqam.browser-plan.v1\", target: { ...request.target }, phase: request.phase, operations: request.operations }; },",
    "  async apply(request) { return { operationId: request.operationId, target: { ...request.plan.target, revision: \"revision-2\" }, effects: noBrowserEffects() }; },",
    "  async submit(request) { return { operationId: request.operationId, target: { ...request.plan.target, revision: \"revision-2\" }, effects: noBrowserEffects() }; }",
    "};",
    "const browserGateway = new ToolGateway({ policyEngine: new PolicyEngine({ allowedTools: [\"browser.observe\", \"browser.preview\", \"browser.apply\", \"browser.submit\"], allowedOrigins: [\"https://app.example\"] }) });",
    "const browserRegistration = registerGovernedBrowserTools(browserGateway, { driver: browserDriver, allowedOrigins: [\"https://app.example\"] });",
    "void browserRegistration.toolNames.observe; void browserRegistration.prohibitedEffects;",
    "const typedPlan: BrowserPlan = { schemaVersion: \"maqam.browser-plan.v1\", target: browserTarget, phase: \"apply\", operations: [{ kind: \"setChecked\", elementId: \"terms\", checked: true }], planHash: \"a\".repeat(64), planToken: \"v1.fixture.fixture\" };",
    "void browserGateway.call(\"browser.apply\", { plan: typedPlan, operationId: \"operation-1\" });",
    "// @ts-expect-error Raw browser values are not part of the structural operation contract.",
    "const rawBrowserValue: BrowserApplyOperation = { kind: \"setValueRef\", elementId: \"name\", value: \"secret\" };",
    "void rawBrowserValue;",
    "// @ts-expect-error Arbitrary scripts are not part of the structural operation contract.",
    "const scriptedBrowserOperation: BrowserApplyOperation = { kind: \"setChecked\", elementId: \"terms\", checked: true, script: \"document.cookie\" };",
    "void scriptedBrowserOperation;",
    "// @ts-expect-error Browser plans require the same-run authenticity token.",
    "const missingPlanToken: BrowserPlan = { schemaVersion: \"maqam.browser-plan.v1\", target: browserTarget, phase: \"apply\", operations: [{ kind: \"setChecked\", elementId: \"terms\", checked: true }], planHash: \"a\".repeat(64) };",
    "void missingPlanToken;",
    "// @ts-expect-error Internal guarded-tool definitions are not a public package export.",
    "void import(\"maqam\").then((module) => module.defineInternalGuardedTool);",
    "const sourceAdapter = defineResearchSourceAdapter({ id: \"fixture.web\", channel: \"web\", toolName: \"source.web.fixture\", capabilities: [\"read\"], read: async () => [{ uri: \"https://example.com/\", text: \"fixture\" }] });",
    "const sourceRead: ResearchSourceReadHandler | null = sourceAdapter.read;",
    "void sourceRead;",
    "void defineResearchSourceAdapter(sourceAdapter);",
    "// @ts-expect-error A host check message must be a string when it is provided.",
    "const invalidCheckMessage: ResearchSourceCheckOutput = { status: \"ready\", message: null };",
    "void invalidCheckMessage;",
    "const sourceCaller = defineResearchToolCaller({ call: async () => [{ uri: \"https://example.com/\", text: \"fixture\" }] });",
    "const sources = new ResearchSourceRegistry({ adapters: [sourceAdapter], toolCaller: sourceCaller });",
    "void sources.route({ channel: \"web\", input: { url: \"https://example.com/\" } });",
    "const parsedFeed = parseRssAtom('<rss version=\"2.0\"><channel><title>x</title></channel></rss>', \"https://example.com/feed.xml\");",
    "const parserHasNoNetwork: false = parsedFeed.provenance.networkAccess;",
    "void parserHasNoNetwork;",
    "// @ts-expect-error Parsed feed items are immutable output.",
    "parsedFeed.items.push(parsedFeed.items[0]);",
    "// @ts-expect-error Parsed provenance is immutable output.",
    "parsedFeed.provenance.networkAccess = false;",
    "const readFeed = createRssAtomResearchAdapter(async () => '<rss version=\"2.0\"><channel><title>x</title></channel></rss>');",
    "void readFeed({ url: \"https://example.com/feed.xml\" }).then((feed) => {",
    "  const parserNetworkAccess: false = feed.provenance.parserNetworkAccess;",
    "  const retrieval: \"host-supplied-reader\" = feed.provenance.retrieval;",
    "  const retrievalNetworkAccess: \"host-defined\" = feed.provenance.retrievalNetworkAccess;",
    "  void parserNetworkAccess; void retrieval; void retrievalNetworkAccess;",
    "  // @ts-expect-error Reader provenance deliberately does not claim retrieval was offline.",
    "  void feed.provenance.networkAccess;",
    "  // @ts-expect-error Reader feed provenance is immutable output.",
    "  feed.provenance.retrieval = \"host-supplied-reader\";",
    "});",
    "const inspectCheckInput = (input: ResearchSourceCheckInput) => {",
    "  void input.signal.aborted;",
    "  // @ts-expect-error Source check input is a frozen host boundary.",
    "  input.signal = null;",
    "};",
    "void inspectCheckInput;",
    "const inspectSourceError = (classification: ResearchSourceErrorClassification) => {",
    "  // @ts-expect-error Classified error details are immutable output.",
    "  classification.error.details.reason = \"mutated\";",
    "};",
    "void inspectSourceError;",
    "void createRssAtomSourceAdapter(async () => '<rss version=\"2.0\"><channel><title>x</title></channel></rss>');",
    "void createWebCrawlerSourceAdapter(async () => [{ url: \"https://example.com/\", text: \"minimal host page\" }]);",
    "void createWebCrawlerSourceAdapter(crawl);",
    "void createWebCrawlerSourceAdapter(createCrawlerTool());",
    "void createExaSearchSourceAdapter({ maxResults: 5 });",
    "void createYtDlpYouTubeSourceAdapter({ command: \"yt-dlp\", languages: [\"en\"] });",
    "const server = createMaqamServer();",
    "server.close();",
    ""
  ].join("\n"));
  await writeFile(join(consumerDirectory, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2022",
      strict: true,
      noEmit: true,
      skipLibCheck: false
    },
    include: ["consumer.ts"]
  }, null, 2));

  runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--dry-run=false", tarball], {
    cwd: consumerDirectory,
    env: { npm_config_dry_run: "false" }
  });
  const installed = JSON.parse(await readFile(
    join(consumerDirectory, "node_modules", "maqam", "package.json"),
    "utf8"
  ));
  if (installed.version !== "0.3.1" || installed.dependencies?.["@types/node"] !== "^22.20.1") {
    throw new Error("The packed Maqam manifest does not expose the reviewed Node type dependency.");
  }
  run(process.execPath, [tscPath, "-p", join(consumerDirectory, "tsconfig.json")], {
    cwd: consumerDirectory
  });
  process.stdout.write("Clean Maqam consumer TypeScript compile passed.\n");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
