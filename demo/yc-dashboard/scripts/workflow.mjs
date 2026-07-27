import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import {
  cp,
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { crawlDetailed } from "cockroach-crawler";
import {
  appendEvent,
  compileContext,
  initializeWorkspace,
  rebuildDerivedState,
  renderContextPackMarkdown,
  verifyStore
} from "qarinah";
import { ApprovalQueue } from "../../../src/framework/approval-queue.js";
import { EvidenceLedger } from "../../../src/framework/evidence-ledger.js";
import { PolicyEngine } from "../../../src/framework/policy.js";
import { ToolGateway } from "../../../src/framework/tool-gateway.js";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const demoDirectory = resolve(scriptDirectory, "..");
const packageDirectory = resolve(demoDirectory, "node_modules");
const fixtureDirectory = resolve(demoDirectory, "fixtures", "acme-client");
const runsDirectory = resolve(demoDirectory, ".runs");
const proposalSchemaPath = resolve(demoDirectory, "fixtures", "proposal.schema.json");

const TOOL_NAME = "apply_patch";
const TASK = "Migrate the Acme Jobs client from v1 to v2. Preserve retry safety, run the real test suite, and do not write without exact approval.";

const PATCHED_CLIENT = `import { randomUUID } from "node:crypto";

export async function createJob(payload, token, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    idempotencyKey = randomUUID(),
    retries = 1
  } = options;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetchImpl("https://api.acme.test/v2/tasks", {
      method: "POST",
      headers: {
        authorization: \`Bearer \${token}\`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey
      },
      body: JSON.stringify({ task: payload })
    });

    if (response.ok) return response.json();
    if (response.status < 500 || attempt === retries) {
      throw new Error(\`Acme request failed: \${response.status}\`);
    }
  }
}
`;

const UNSAFE_CLIENT = PATCHED_CLIENT.replace(
  '        "idempotency-key": idempotencyKey\n',
  ""
);

const VENDOR_DOCUMENT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Acme Jobs API v2 migration guide</title>
    <meta name="description" content="Required changes for the Acme Jobs v2 migration.">
  </head>
  <body>
    <main>
      <h1>Acme Jobs API v2 migration guide</h1>
      <p>Effective July 31, the create-job endpoint moves from <code>POST /v1/jobs</code> to <code>POST /v2/tasks</code>.</p>
      <p>The v2 body is <code>{"task": payload}</code>.</p>
      <p>Every retryable create request must carry an <code>Idempotency-Key</code> header. Reuse the same key when retrying the same logical task.</p>
      <p>Authorization remains a bearer token. A successful request returns the created task as JSON.</p>
    </main>
  </body>
</html>`;

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function compactQarinahItem(item) {
  return {
    eventId: item.eventId,
    kind: item.kind,
    title: item.title,
    excerpt: item.excerpt,
    confidence: item.confidence,
    reason: item.reason,
    hash: item.hash
  };
}

async function loadPackageVersion(name) {
  const packageJson = JSON.parse(
    await readFile(resolve(packageDirectory, name, "package.json"), "utf8")
  );
  return packageJson.version;
}

async function runCommand(command, args, options = {}) {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: environment,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    });
    return {
      command: [command, ...args].join(" "),
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    return {
      command: [command, ...args].join(" "),
      exitCode: Number.isInteger(error.code) ? error.code : 1,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message
    };
  }
}

async function startVendorDocs() {
  const server = createServer((request, response) => {
    if (request.url === "/robots.txt") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("User-agent: *\nAllow: /\n");
      return;
    }
    if (request.url === "/migration/jobs-v2") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(VENDOR_DOCUMENT);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("The controlled vendor documentation server did not expose a TCP port.");
  }
  return {
    url: `http://127.0.0.1:${address.port}/migration/jobs-v2`,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    })
  };
}

async function expectCode(operation, expectedCode) {
  try {
    await operation();
  } catch (error) {
    if (error?.code !== expectedCode) throw error;
    return { code: error.code, message: error.message };
  }
  throw new Error(`Expected '${expectedCode}', but the operation completed.`);
}

async function createProposalDiff(workspace, content) {
  const proposalPath = resolve(workspace, ".proposal", "vendor-client.js");
  await mkdir(dirname(proposalPath), { recursive: true });
  await writeFile(proposalPath, content, "utf8");
  const diff = await runCommand(
    "git",
    ["diff", "--no-index", "--", resolve(workspace, "src", "vendor-client.js"), proposalPath],
    { cwd: workspace }
  );
  if (diff.exitCode !== 0 && diff.exitCode !== 1) {
    throw new Error(`Could not generate the proposal diff: ${diff.stderr}`);
  }
  return diff.stdout
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith("diff --git ")) return "diff --git a/src/vendor-client.js b/src/vendor-client.js";
      if (line.startsWith("--- ")) return "--- a/src/vendor-client.js";
      if (line.startsWith("+++ ")) return "+++ b/src/vendor-client.js";
      return line;
    })
    .join("\n");
}

async function runCodexProposal({ workspace, contextMarkdown, evidence, onProgress }) {
  const outputPath = resolve(workspace, ".proposal", "codex-output.json");
  await mkdir(dirname(outputPath), { recursive: true });
  const currentSource = await readFile(resolve(workspace, "src", "vendor-client.js"), "utf8");
  const committedTests = await readFile(resolve(workspace, "test", "vendor-client.test.js"), "utf8");
  const prompt = [
    "You are the read-only coding worker in a governed software-change demo.",
    "Do not call tools or edit files. All required source material is included below.",
    "Return a JSON object containing the complete replacement content for src/vendor-client.js.",
    "Do not edit files. Do not weaken or change tests.",
    "The implementation must satisfy the v2 contract, preserve one Idempotency-Key across a retry, and keep bearer authorization.",
    "",
    "Task:",
    TASK,
    "",
    "Qarinah context pack:",
    contextMarkdown,
    "",
    "Crawler source evidence:",
    evidence,
    "",
    "Current src/vendor-client.js:",
    "```js",
    currentSource,
    "```",
    "",
    "Committed test/vendor-client.test.js:",
    "```js",
    committedTests,
    "```",
    "",
    "The response must match the supplied JSON schema."
  ].join("\n");

  const executable = process.platform === "win32"
    ? resolve(
        process.env.APPDATA || "",
        "npm",
        "node_modules",
        "@openai",
        "codex",
        "node_modules",
        "@openai",
        "codex-win32-x64",
        "vendor",
        "x86_64-pc-windows-msvc",
        "bin",
        "codex.exe"
      )
    : "codex";
  const args = [
    "exec",
    "--ephemeral",
    "--json",
    "--model", process.env.YC_DEMO_CODEX_MODEL || "gpt-5.6-terra",
    "-c", `model_reasoning_effort="${process.env.YC_DEMO_CODEX_EFFORT || "low"}"`,
    "--sandbox", "read-only",
    "-C", workspace,
    "--skip-git-repo-check",
    "--output-schema", proposalSchemaPath,
    "--output-last-message", outputPath,
    "-"
  ];
  const child = spawn(executable, args, {
    cwd: workspace,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  let stdout = "";
  let stderr = "";
  let eventCount = 0;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    eventCount += chunk.split("\n").filter(Boolean).length;
    onProgress?.(eventCount);
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.end(prompt);
  const exitCode = await new Promise((resolveExit, rejectExit) => {
    const timeout = setTimeout(() => {
      child.kill();
      rejectExit(new Error("Codex proposal exceeded the 90-second live-demo budget."));
    }, 90_000);
    child.once("error", rejectExit);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolveExit(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`Codex proposal failed (${exitCode}): ${stderr || stdout}`);
  }
  const proposal = JSON.parse(await readFile(outputPath, "utf8"));
  if (!proposal.content?.includes("/v2/tasks") || !proposal.content?.toLowerCase().includes("idempotency")) {
    throw new Error("Codex returned a proposal without the required v2 and idempotency behavior.");
  }
  return {
    ...proposal,
    worker: "Codex CLI (read-only proposal)",
    eventCount
  };
}

async function createFixtureProposal() {
  return {
    content: PATCHED_CLIENT,
    rationale: "Migrate to /v2/tasks and reuse one idempotency key across retries.",
    tests: [
      "v2 endpoint and body",
      "bearer authorization",
      "stable Idempotency-Key across retry",
      "terminal error behavior"
    ],
    worker: "Deterministic test worker",
    eventCount: 1
  };
}

export class YcWorkflowRun {
  constructor({
    worker = process.env.YC_DEMO_WORKER || "codex",
    paceMs = Number(process.env.YC_DEMO_PACE_MS || 0)
  } = {}) {
    const suffix = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    this.id = `run_vendor_v2_${suffix}_${randomUUID().slice(0, 6)}`;
    this.workerMode = worker;
    this.paceMs = Number.isFinite(paceMs) ? Math.max(0, paceMs) : 0;
    this.workspace = resolve(runsDirectory, this.id);
    this.executions = 0;
    this.gateway = null;
    this.approvalQueue = null;
    this.approvalRequest = null;
    this.approvedInput = null;
    this.alteredInput = null;
    this.callContext = null;
    this.vendorDocs = null;
    this.startedAt = Date.now();
    this.events = [];
    this.state = {
      schemaVersion: "maqam.yc-control-plane-live.v2",
      id: this.id,
      status: "created",
      stage: "task",
      task: TASK,
      workspace: this.workspace,
      workerMode: this.workerMode,
      events: this.events,
      packages: {}
    };
    this.completion = new Promise((resolveCompletion, rejectCompletion) => {
      this.resolveCompletion = resolveCompletion;
      this.rejectCompletion = rejectCompletion;
    });
    void this.completion.catch(() => {});
  }

  emit(kind, stage, detail = {}) {
    const event = {
      sequence: this.events.length + 1,
      kind,
      stage,
      at: new Date().toISOString(),
      ...detail
    };
    this.events.push(event);
    this.state.stage = stage;
    this.state.events = this.events;
    return event;
  }

  snapshot() {
    return clone(this.state);
  }

  async pace() {
    if (this.paceMs > 0) {
      await new Promise((resolveWait) => setTimeout(resolveWait, this.paceMs));
    }
  }

  async start() {
    if (this.state.status !== "created") return this.snapshot();
    this.state.status = "running";
    void this.prepare().catch((error) => this.fail(error));
    return this.snapshot();
  }

  async prepare() {
    await mkdir(runsDirectory, { recursive: true });
    await cp(fixtureDirectory, this.workspace, { recursive: true });
    await runCommand("git", ["init", "-q"], { cwd: this.workspace });
    await runCommand("git", ["add", "."], { cwd: this.workspace });
    const commit = await runCommand(
      "git",
      ["-c", "user.name=Maqam Demo", "-c", "user.email=demo@maqam.local", "commit", "-qm", "fixture: Acme v1 client"],
      { cwd: this.workspace }
    );
    if (commit.exitCode !== 0) throw new Error(`Could not initialize sample repository: ${commit.stderr}`);
    const initialTree = await runCommand("git", ["rev-parse", "HEAD^{tree}"], { cwd: this.workspace });
    this.state.repository = {
      initialTree: initialTree.stdout.trim(),
      sourcePath: "src/vendor-client.js",
      testPath: "test/vendor-client.test.js",
      persisted: true
    };
    this.emit("workspace.created", "task", {
      label: "Real sample Git repository created",
      workspace: this.workspace
    });
    await this.pace();

    const baseline = await runCommand(
      process.execPath,
      ["--test", "--test-reporter=tap", "test/vendor-client.test.js"],
      { cwd: this.workspace }
    );
    if (baseline.exitCode === 0) {
      throw new Error("The baseline fixture unexpectedly passed the v2 migration tests.");
    }
    this.state.baseline = baseline;
    this.emit("baseline.failed", "task", {
      label: "Baseline tests reproduced the migration bug",
      exitCode: baseline.exitCode
    });
    await this.pace();

    this.state.packages = {
      maqam: "0.3.3",
      qarinah: await loadPackageVersion("qarinah"),
      cockroachCrawler: await loadPackageVersion("cockroach-crawler")
    };
    this.state.policy = {
      decision: "allow_with_approval",
      reason: "Reads and proposals are allowed. A write requires approval bound to this run, tool, and exact input hash.",
      tool: TOOL_NAME,
      effects: ["write"],
      risk: "high"
    };
    this.emit("policy.evaluated", "policy", {
      label: "Write held behind exact one-use approval"
    });
    await this.pace();

    const qarinahWorkspace = await initializeWorkspace(this.workspace, { capture: "content" });
    const eventClock = (() => {
      let tick = 0;
      return () => new Date(Date.UTC(2026, 6, 26, 9, 0, tick++));
    })();
    const append = (input) => appendEvent(input, {
      workspace: qarinahWorkspace,
      capture: "content",
      clock: eventClock,
      randomUUID
    });
    const originalClient = await readFile(resolve(this.workspace, "src", "vendor-client.js"), "utf8");
    await append({
      kind: "decision",
      title: "Retryable creates must be idempotent",
      body: "All retryable vendor create operations must reuse one stable idempotency key for the same logical operation.",
      confidence: "verified",
      retention: { class: "project" },
      actor: { type: "human", id: "engineering-owner" }
    });
    await append({
      kind: "artifact",
      title: "Vendor client implementation",
      body: "src/vendor-client.js owns createJob. The current client uses POST /v1/jobs and sends payload directly.",
      data: { path: "src/vendor-client.js", contentHash: sha256(originalClient) },
      confidence: "extracted",
      retention: { class: "project" },
      actor: { type: "system", id: "project-index" }
    });
    await append({
      kind: "approval",
      title: "Production writes require exact one-use approval",
      body: "Any outbound vendor patch requires approval bound to run ID, tool name, and exact input hash. Approval is consumed after one successful call.",
      confidence: "verified",
      retention: { class: "project" },
      actor: { type: "human", id: "security-owner" }
    });
    await append({
      kind: "decision",
      title: "Migration acceptance criteria",
      body: "Use POST /v2/tasks, wrap payload under task, preserve a stable Idempotency-Key across retry, keep bearer authorization, and pass the committed tests.",
      confidence: "verified",
      retention: { class: "project" },
      actor: { type: "human", id: "api-owner" }
    });
    await rebuildDerivedState(this.workspace);
    const contextPack = await compileContext(
      "Migration acceptance criteria",
      {
        cwd: this.workspace,
        maxChars: 4200,
        limit: 5,
        diversity: 0.35,
        minimumCoverage: "direct",
        rebuild: false
      }
    );
    const contextMarkdown = renderContextPackMarkdown(contextPack);
    const qarinahVerification = await verifyStore(this.workspace);
    if (!qarinahVerification.ok) throw new Error("Qarinah store verification failed.");
    this.state.memory = {
      provider: "Qarinah",
      query: contextPack.query,
      items: contextPack.items.map(compactQarinahItem),
      itemCount: contextPack.items.length,
      usedChars: contextPack.budget.usedChars,
      estimatedTokens: contextPack.budget.estimatedTokens,
      manifestHash: contextPack.manifestHash,
      coverage: contextPack.retrieval.coverage,
      store: {
        eventCount: qarinahVerification.eventCount,
        headHash: qarinahVerification.headHash,
        verified: true
      },
      markdownHash: sha256(contextMarkdown)
    };
    this.emit("memory.compiled", "memory", {
      label: `${contextPack.items.length} cited project memories compiled`,
      manifestHash: contextPack.manifestHash
    });
    await this.pace();

    this.vendorDocs = await startVendorDocs();
    const crawl = await crawlDetailed({
      seeds: [this.vendorDocs.url],
      maxPages: 1,
      maxRequests: 4,
      maxQueue: 4,
      maxLinksPerPage: 12,
      maxDepth: 0,
      maxDurationMs: 10_000,
      maxTotalBytes: 256_000,
      sameOrigin: true,
      allowedOrigins: [new URL(this.vendorDocs.url).origin],
      allowPrivateNetworks: true,
      obeyRobots: true,
      skipSensitivePaths: false
    });
    const [vendorPage] = crawl.pages;
    if (
      !vendorPage
      || !vendorPage.text.includes("/v2/tasks")
      || !vendorPage.text.includes("Idempotency-Key")
      || !vendorPage.contentHash
    ) {
      throw new Error("Cockroach Crawler did not return the required migration evidence.");
    }
    this.state.evidence = {
      provider: "Cockroach Crawler",
      sourceLabel: "Approved vendor migration guide",
      sourceKind: "controlled documentation fixture",
      url: "vendor-docs://migration/jobs-v2",
      title: vendorPage.title,
      excerpt: "POST /v2/tasks wraps the payload under task. Retryable creates require Idempotency-Key.",
      contentHash: vendorPage.contentHash,
      fetchedAt: vendorPage.fetchedAt,
      records: crawl.stats.pages,
      bytes: crawl.stats.bytes,
      requests: crawl.stats.requests,
      failures: crawl.failures
    };
    this.emit("evidence.fetched", "evidence", {
      label: "Vendor contract fetched and hashed",
      contentHash: vendorPage.contentHash
    });
    await this.pace();

    this.state.worker = {
      name: this.workerMode === "codex" ? "Codex CLI" : "Deterministic test worker",
      authority: "read-only",
      status: "working",
      eventCount: 0
    };
    this.emit("agent.started", "proposal", {
      label: `${this.state.worker.name} started in read-only proposal mode`
    });
    await this.pace();
    const proposal = this.workerMode === "codex"
      ? await runCodexProposal({
          workspace: this.workspace,
          contextMarkdown,
          evidence: vendorPage.text,
          onProgress: (eventCount) => {
            this.state.worker.eventCount = eventCount;
          }
        })
      : await createFixtureProposal();
    this.state.worker = {
      name: proposal.worker,
      authority: "read-only",
      status: "proposal_generated",
      eventCount: proposal.eventCount
    };
    const patch = await createProposalDiff(this.workspace, proposal.content);
    this.state.proposal = {
      path: "src/vendor-client.js",
      content: proposal.content,
      patch,
      rationale: proposal.rationale,
      checks: proposal.tests
    };
    this.emit("proposal.generated", "proposal", {
      label: "Complete replacement proposed without writing",
      worker: proposal.worker
    });
    await this.pace();

    this.approvalQueue = new ApprovalQueue();
    const evidenceLedger = new EvidenceLedger();
    const policyEngine = new PolicyEngine({
      allowedTools: [TOOL_NAME],
      approvalRequiredEffects: ["write"]
    });
    this.gateway = new ToolGateway({
      policyEngine,
      approvalQueue: this.approvalQueue,
      evidenceLedger
    });
    this.evidenceLedger = evidenceLedger;
    this.gateway.registerTool(TOOL_NAME, async (input, context) => {
      this.executions += 1;
      const sourcePath = resolve(this.workspace, input.path);
      await writeFile(sourcePath, input.content, "utf8");
      const stored = await readFile(sourcePath, "utf8");
      const tests = await runCommand(
        process.execPath,
        ["--test", "--test-reporter=tap", "test/vendor-client.test.js"],
        { cwd: this.workspace }
      );
      const diffCheck = await runCommand("git", ["diff", "--check"], { cwd: this.workspace });
      if (tests.exitCode !== 0 || diffCheck.exitCode !== 0) {
        throw new Error(`The exact patch failed real verification.\n${tests.stdout}\n${tests.stderr}\n${diffCheck.stderr}`);
      }
      const gitDiff = await runCommand(
        "git",
        ["diff", "--", input.path],
        { cwd: this.workspace }
      );
      const sourceEvidence = context.evidence.addEvidence({
        sourceType: "document",
        source: "vendor-docs://migration/jobs-v2",
        excerpt: "POST /v2/tasks requires Idempotency-Key for retryable creates.",
        confidence: 1
      });
      const outputEvidence = context.evidence.addEvidence({
        sourceType: "tool_output",
        source: `workspace://${input.path}`,
        excerpt: stored,
        confidence: 1
      });
      const testEvidence = context.evidence.addEvidence({
        sourceType: "tool_output",
        source: "workspace://node-test",
        excerpt: tests.stdout,
        confidence: 1
      });
      const claim = context.evidence.addClaim({
        text: "The approved patch migrated createJob to the v2 contract and passed the committed Node test suite.",
        evidenceIds: [sourceEvidence.evidenceId, outputEvidence.evidenceId, testEvidence.evidenceId],
        confidence: 1
      });
      return {
        path: input.path,
        contentHash: sha256(stored),
        bytes: Buffer.byteLength(stored),
        tests,
        diffCheck,
        gitDiff: gitDiff.stdout,
        evidenceIds: [sourceEvidence.evidenceId, outputEvidence.evidenceId, testEvidence.evidenceId],
        claimId: claim.claimId
      };
    }, {
      effects: ["write"],
      risk: "high"
    });

    this.approvedInput = {
      path: "src/vendor-client.js",
      content: proposal.content,
      patch,
      contextManifestHash: contextPack.manifestHash,
      sourceContentHash: vendorPage.contentHash
    };
    this.alteredInput = {
      ...this.approvedInput,
      content: UNSAFE_CLIENT
    };
    this.callContext = {
      runId: this.id,
      taskId: "migrate_vendor_api",
      requestedBy: this.state.worker.name,
      approvalEvidence: [
        contextPack.manifestHash,
        vendorPage.contentHash
      ]
    };
    const requested = await expectCode(
      () => this.gateway.call(TOOL_NAME, this.approvedInput, this.callContext),
      "APPROVAL_REQUIRED"
    );
    [this.approvalRequest] = this.approvalQueue.pending();
    if (!this.approvalRequest) throw new Error("Maqam did not create an approval request.");
    this.state.approval = {
      id: this.approvalRequest.approvalId,
      status: "pending",
      subject: this.approvalRequest.subject,
      requested: {
        code: requested.code,
        executions: 0
      }
    };
    this.state.status = "waiting_approval";
    this.emit("approval.requested", "proposal", {
      label: "Human approval required for the exact patch",
      approvalId: this.approvalRequest.approvalId
    });
  }

  async approve({ decidedBy = "demo-user" } = {}) {
    if (this.state.status !== "waiting_approval" || !this.approvalRequest) {
      throw new Error("This run is not waiting for approval.");
    }
    this.state.status = "running";
    this.approvalQueue.approve(this.approvalRequest.approvalId, {
      decidedBy,
      note: "Approve this exact patch for this run once."
    });
    this.state.approval.status = "approved";
    this.emit("approval.approved", "proposal", {
      label: "Human approved the exact input once",
      decidedBy
    });
    await this.pace();
    void this.execute().catch((error) => this.fail(error));
    return this.snapshot();
  }

  async execute() {
    const altered = await expectCode(
      () => this.gateway.call(TOOL_NAME, this.alteredInput, {
        ...this.callContext,
        approvalId: this.approvalRequest.approvalId
      }),
      "APPROVAL_SCOPE_MISMATCH"
    );
    this.state.approval.alteredInput = {
      code: altered.code,
      executions: 0,
      reason: "Removing Idempotency-Key changed the approved input hash."
    };
    this.emit("tamper.rejected", "altered", {
      label: "Changed input rejected before tool dispatch",
      code: altered.code
    });
    await this.pace();

    const exact = await this.gateway.call(TOOL_NAME, this.approvedInput, {
      ...this.callContext,
      approvalId: this.approvalRequest.approvalId
    });
    const approval = this.approvalQueue.get(this.approvalRequest.approvalId);
    this.state.approval.exactInput = {
      status: "completed",
      executions: 1,
      consumptionCount: approval.consumptions.length,
      result: exact
    };
    this.emit("patch.applied", "exact", {
      label: "Approved patch written exactly once",
      contentHash: exact.contentHash
    });
    this.emit("tests.completed", "exact", {
      label: "Committed Node test suite passed",
      command: exact.tests.command,
      exitCode: exact.tests.exitCode
    });
    await this.pace();

    const replay = await expectCode(
      () => this.gateway.call(TOOL_NAME, this.approvedInput, {
        ...this.callContext,
        approvalId: this.approvalRequest.approvalId
      }),
      "APPROVAL_INVALID"
    );
    this.state.approval.replay = {
      code: replay.code,
      executions: this.executions
    };
    this.emit("replay.rejected", "exact", {
      label: "Consumed approval could not be replayed",
      code: replay.code
    });
    await this.pace();

    const ledger = this.evidenceLedger.toJSON();
    const finalTreeDiff = await runCommand("git", ["diff", "--", "src/vendor-client.js"], { cwd: this.workspace });
    const receiptCore = {
      runId: this.id,
      initialTree: this.state.repository.initialTree,
      sourceHash: this.state.evidence.contentHash,
      contextManifestHash: this.state.memory.manifestHash,
      policy: "write_requires_exact_one_use_approval",
      approvalId: approval.approvalId,
      approvedInputHash: approval.subject.inputHash,
      outputHash: exact.contentHash,
      testOutputHash: sha256(exact.tests.stdout),
      finalDiffHash: sha256(finalTreeDiff.stdout),
      claimId: exact.claimId
    };
    const receiptHash = sha256(stableJson(receiptCore));
    this.state.receipt = {
      ...receiptCore,
      receiptHash,
      chain: [
        { kind: "source", label: "Vendor migration guide", hash: this.state.evidence.contentHash },
        { kind: "context", label: "Qarinah context pack", hash: this.state.memory.manifestHash },
        { kind: "policy", label: "Write requires exact approval", hash: sha256("write_requires_exact_one_use_approval") },
        { kind: "approval", label: "One exact input approved", hash: sha256(approval.subject.inputHash) },
        { kind: "action", label: "Patch applied once", hash: exact.contentHash },
        { kind: "outcome", label: "Real Node tests passed", hash: sha256(exact.tests.stdout) }
      ],
      evidenceRecords: ledger.evidence.length,
      claims: ledger.claims.length,
      unsupportedClaims: ledger.unsupportedClaims.length,
      workspace: this.workspace,
      testCommand: exact.tests.command,
      testExitCode: exact.tests.exitCode,
      testOutput: exact.tests.stdout,
      gitDiff: exact.gitDiff
    };
    const passed = (
      this.state.memory.coverage.status === "direct"
      && this.state.approval.alteredInput.code === "APPROVAL_SCOPE_MISMATCH"
      && exact.tests.exitCode === 0
      && exact.diffCheck.exitCode === 0
      && this.executions === 1
      && approval.consumptions.length === 1
      && replay.code === "APPROVAL_INVALID"
      && ledger.unsupportedClaims.length === 0
    );
    if (!passed) throw new Error("The combined live workflow invariants did not hold.");
    await writeFile(
      resolve(this.workspace, "governed-receipt.json"),
      `${JSON.stringify(this.state.receipt, null, 2)}\n`,
      "utf8"
    );
    this.state.status = "passed";
    this.state.durationMs = Date.now() - this.startedAt;
    this.emit("receipt.verified", "receipt", {
      label: "Source, context, approval, action, and tests linked",
      receiptHash
    });
    await this.vendorDocs?.close();
    this.vendorDocs = null;
    this.resolveCompletion(this.snapshot());
  }

  async fail(error) {
    this.state.status = "failed";
    this.state.error = error instanceof Error ? error.message : String(error);
    this.emit("run.failed", this.state.stage || "task", {
      label: this.state.error
    });
    await this.vendorDocs?.close().catch(() => {});
    this.vendorDocs = null;
    this.rejectCompletion(error);
  }
}

export function createYcWorkflowRun(options) {
  return new YcWorkflowRun(options);
}

export async function runYcWorkflow(options = {}) {
  const run = createYcWorkflowRun({ worker: options.worker || "fixture" });
  await run.start();
  while (run.state.status === "running") {
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  if (run.state.status !== "waiting_approval") {
    return run.completion;
  }
  await run.approve({ decidedBy: "automated-test" });
  return run.completion;
}
