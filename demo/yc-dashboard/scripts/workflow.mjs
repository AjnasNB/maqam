import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const demoDirectory = resolve(scriptDirectory, "..");
const packageDirectory = resolve(demoDirectory, "node_modules");

const RUN_ID = "run_vendor_v2_001";
const TOOL_NAME = "apply_patch";
const TASK = "Migrate the Acme Jobs client from v1 to v2. Preserve retry safety, run tests, and do not write without exact approval.";

const ORIGINAL_CLIENT = `export async function createJob(payload, token) {
  const response = await fetch("https://api.acme.test/v1/jobs", {
    method: "POST",
    headers: {
      authorization: \`Bearer \${token}\`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(\`Acme request failed: \${response.status}\`);
  return response.json();
}
`;

const PATCHED_CLIENT = `import { randomUUID } from "node:crypto";

export async function createJob(payload, token, idempotencyKey = randomUUID()) {
  const response = await fetch("https://api.acme.test/v2/tasks", {
    method: "POST",
    headers: {
      authorization: \`Bearer \${token}\`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey
    },
    body: JSON.stringify({ task: payload })
  });

  if (!response.ok) throw new Error(\`Acme request failed: \${response.status}\`);
  return response.json();
}
`;

const UNSAFE_CLIENT = PATCHED_CLIENT.replace(
  '      "idempotency-key": idempotencyKey\n',
  ""
);

const PATCH = `diff --git a/src/vendor-client.js b/src/vendor-client.js
index 7a49b87..4f6d99a 100644
--- a/src/vendor-client.js
+++ b/src/vendor-client.js
@@ -1,12 +1,15 @@
-export async function createJob(payload, token) {
-  const response = await fetch("https://api.acme.test/v1/jobs", {
+import { randomUUID } from "node:crypto";
+
+export async function createJob(payload, token, idempotencyKey = randomUUID()) {
+  const response = await fetch("https://api.acme.test/v2/tasks", {
     method: "POST",
     headers: {
       authorization: \`Bearer \${token}\`,
-      "content-type": "application/json"
+      "content-type": "application/json",
+      "idempotency-key": idempotencyKey
     },
-    body: JSON.stringify(payload)
+    body: JSON.stringify({ task: payload })
   });
`;

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

async function loadPackageVersion(name) {
  const packageJson = JSON.parse(
    await readFile(resolve(packageDirectory, name, "package.json"), "utf8")
  );
  return packageJson.version;
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

export async function runYcWorkflow() {
  const startedAt = Date.now();
  const workspace = await mkdtemp(resolve(tmpdir(), "maqam-yc-control-plane-"));
  const sourcePath = resolve(workspace, "src", "vendor-client.js");
  const vendorDocs = await startVendorDocs();
  let executions = 0;

  try {
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, ORIGINAL_CLIENT, "utf8");

    const qarinahWorkspace = await initializeWorkspace(workspace, { capture: "content" });
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

    await append({
      kind: "decision",
      title: "Retryable creates must be idempotent",
      body: "All retryable vendor create operations must send one stable idempotency key for the same logical operation.",
      confidence: "verified",
      retention: { class: "project" },
      actor: { type: "human", id: "engineering-owner" }
    });
    await append({
      kind: "artifact",
      title: "Vendor client implementation",
      body: "src/vendor-client.js owns the createJob request. The current client uses POST /v1/jobs and sends payload directly.",
      data: { path: "src/vendor-client.js", contentHash: sha256(ORIGINAL_CLIENT) },
      confidence: "extracted",
      retention: { class: "project" },
      actor: { type: "system", id: "project-index" }
    });
    await append({
      kind: "approval",
      title: "Production writes require exact one-use approval",
      body: "Any patch that changes an outbound vendor request requires approval bound to run ID, tool name, and the exact input hash. Approval is consumed after one successful call.",
      confidence: "verified",
      retention: { class: "project" },
      actor: { type: "human", id: "security-owner" }
    });
    await append({
      kind: "decision",
      title: "Migration acceptance criteria",
      body: "Acme Jobs v2 tasks migration: the vendor client must preserve idempotency on retry, and production change approval remains mandatory.",
      confidence: "verified",
      retention: { class: "project" },
      actor: { type: "human", id: "api-owner" }
    });
    await rebuildDerivedState(workspace);

    const contextPack = await compileContext(
      "Acme Jobs v2 tasks migration idempotency retry approval vendor client",
      {
        cwd: workspace,
        maxChars: 4200,
        limit: 5,
        diversity: 0.35,
        minimumCoverage: "direct",
        rebuild: false
      }
    );
    const contextMarkdown = renderContextPackMarkdown(contextPack);
    const qarinahVerification = await verifyStore(workspace);

    const crawl = await crawlDetailed({
      seeds: [vendorDocs.url],
      maxPages: 1,
      maxRequests: 4,
      maxQueue: 4,
      maxLinksPerPage: 12,
      maxDepth: 0,
      maxDurationMs: 10_000,
      maxTotalBytes: 256_000,
      sameOrigin: true,
      allowedOrigins: [new URL(vendorDocs.url).origin],
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

    const approvalQueue = new ApprovalQueue();
    const evidenceLedger = new EvidenceLedger();
    const policyEngine = new PolicyEngine({
      allowedTools: [TOOL_NAME],
      approvalRequiredEffects: ["write"]
    });
    const gateway = new ToolGateway({
      policyEngine,
      approvalQueue,
      evidenceLedger
    });

    gateway.registerTool(TOOL_NAME, async (input, context) => {
      executions += 1;
      await writeFile(sourcePath, input.content, "utf8");
      const stored = await readFile(sourcePath, "utf8");
      const tests = {
        passed: (
          stored.includes("/v2/tasks")
          && stored.includes('"idempotency-key": idempotencyKey')
          && stored.includes("JSON.stringify({ task: payload })")
        ),
        checks: [
          "uses POST /v2/tasks",
          "preserves one idempotency key across retries",
          "wraps the request body under task"
        ]
      };
      if (!tests.passed) throw new Error("The exact patch failed its migration tests.");

      const sourceEvidence = context.evidence.addEvidence({
        sourceType: "document",
        source: "vendor-docs://migration/jobs-v2",
        excerpt: "POST /v2/tasks requires Idempotency-Key for retryable creates.",
        confidence: 1
      });
      const outputEvidence = context.evidence.addEvidence({
        sourceType: "tool_output",
        source: "workspace://src/vendor-client.js",
        excerpt: stored,
        confidence: 1
      });
      const claim = context.evidence.addClaim({
        text: "The approved patch migrated createJob to the v2 contract and passed all migration checks.",
        evidenceIds: [sourceEvidence.evidenceId, outputEvidence.evidenceId],
        confidence: 1
      });
      return {
        path: "src/vendor-client.js",
        contentHash: sha256(stored),
        bytes: Buffer.byteLength(stored),
        tests,
        evidenceIds: [sourceEvidence.evidenceId, outputEvidence.evidenceId],
        claimId: claim.claimId
      };
    }, {
      effects: ["write"],
      risk: "high"
    });

    const approvedInput = {
      path: "src/vendor-client.js",
      content: PATCHED_CLIENT,
      patch: PATCH,
      contextManifestHash: contextPack.manifestHash,
      sourceContentHash: vendorPage.contentHash
    };
    const alteredInput = {
      ...approvedInput,
      content: UNSAFE_CLIENT
    };
    const callContext = {
      runId: RUN_ID,
      taskId: "migrate_vendor_api",
      requestedBy: "coding-agent",
      approvalEvidence: [
        contextPack.manifestHash,
        vendorPage.contentHash
      ]
    };

    const requested = await expectCode(
      () => gateway.call(TOOL_NAME, approvedInput, callContext),
      "APPROVAL_REQUIRED"
    );
    const [approvalRequest] = approvalQueue.pending();
    if (!approvalRequest) throw new Error("Maqam did not create an approval request.");

    approvalQueue.approve(approvalRequest.approvalId, {
      decidedBy: "engineering-owner",
      note: "Approve this exact patch for this run once."
    });

    const altered = await expectCode(
      () => gateway.call(TOOL_NAME, alteredInput, {
        ...callContext,
        approvalId: approvalRequest.approvalId
      }),
      "APPROVAL_SCOPE_MISMATCH"
    );
    const exact = await gateway.call(TOOL_NAME, approvedInput, {
      ...callContext,
      approvalId: approvalRequest.approvalId
    });
    const replay = await expectCode(
      () => gateway.call(TOOL_NAME, approvedInput, {
        ...callContext,
        approvalId: approvalRequest.approvalId
      }),
      "APPROVAL_INVALID"
    );

    const approval = approvalQueue.get(approvalRequest.approvalId);
    const ledger = evidenceLedger.toJSON();
    const receiptCore = {
      runId: RUN_ID,
      sourceHash: vendorPage.contentHash,
      contextManifestHash: contextPack.manifestHash,
      policy: "write_requires_exact_one_use_approval",
      approvalId: approval.approvalId,
      approvedInputHash: approval.subject.inputHash,
      outputHash: exact.contentHash,
      claimId: exact.claimId
    };
    const receiptHash = sha256(stableJson(receiptCore));

    const passed = (
      contextPack.retrieval.coverage.status === "direct"
      && qarinahVerification.ok === true
      && crawl.stats.pages === 1
      && requested.code === "APPROVAL_REQUIRED"
      && altered.code === "APPROVAL_SCOPE_MISMATCH"
      && exact.tests.passed === true
      && executions === 1
      && approval.consumptions.length === 1
      && replay.code === "APPROVAL_INVALID"
      && ledger.unsupportedClaims.length === 0
    );
    if (!passed) throw new Error("The combined YC workflow invariants did not hold.");

    return {
      schemaVersion: "maqam.yc-control-plane-demo.v1",
      status: "passed",
      run: {
        id: RUN_ID,
        title: "Acme Jobs API v2 migration",
        task: TASK,
        requestedBy: "coding-agent",
        environment: "engineering-sandbox",
        durationMs: Date.now() - startedAt
      },
      packages: {
        maqam: "0.3.3",
        qarinah: await loadPackageVersion("qarinah"),
        cockroachCrawler: await loadPackageVersion("cockroach-crawler")
      },
      policy: {
        decision: "allow_with_approval",
        reason: "Source reads are allowed. A write requires approval bound to this run, tool, and exact input hash.",
        tool: TOOL_NAME,
        effects: ["write"],
        risk: "high"
      },
      memory: {
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
      },
      evidence: {
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
      },
      proposal: {
        path: "src/vendor-client.js",
        patch: PATCH,
        checks: [
          "uses POST /v2/tasks",
          "preserves one idempotency key across retries",
          "wraps the request body under task"
        ]
      },
      approval: {
        id: approval.approvalId,
        status: approval.status,
        reusable: approval.reusable,
        subject: approval.subject,
        requested: {
          code: requested.code,
          executions: 0
        },
        alteredInput: {
          code: altered.code,
          executions: 0,
          reason: "Removing Idempotency-Key changed the approved input hash."
        },
        exactInput: {
          status: "completed",
          executions: 1,
          consumptionCount: approval.consumptions.length,
          result: exact
        },
        replay: {
          code: replay.code,
          executions
        }
      },
      receipt: {
        ...receiptCore,
        receiptHash,
        chain: [
          { kind: "source", label: "Vendor migration guide", hash: vendorPage.contentHash },
          { kind: "context", label: "Qarinah context pack", hash: contextPack.manifestHash },
          { kind: "policy", label: "Write requires exact approval", hash: sha256("write_requires_exact_one_use_approval") },
          { kind: "approval", label: "One exact input approved", hash: sha256(approval.subject.inputHash) },
          { kind: "action", label: "Patch applied once", hash: exact.contentHash },
          { kind: "outcome", label: "3 migration checks passed", hash: sha256(stableJson(exact.tests)) }
        ],
        evidenceRecords: ledger.evidence.length,
        claims: ledger.claims.length,
        unsupportedClaims: ledger.unsupportedClaims.length
      }
    };
  } finally {
    await vendorDocs.close();
    await rm(workspace, { recursive: true, force: true });
  }
}
