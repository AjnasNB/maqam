import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApprovalQueue,
  EvidenceLedger,
  PolicyEngine,
  ToolGateway
} from "../src/index.js";

const SCHEMA = "maqam.benchmark.conformance/v1";
const SUITE_VERSION = "1.0.0";
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE_FILES = Object.freeze([
  "benchmarks/governance-conformance.mjs",
  "src/index.js",
  "src/framework/tool-gateway.js",
  "src/framework/policy.js",
  "src/framework/approval-queue.js",
  "src/framework/evidence-ledger.js",
  "src/framework/evidence-scope.js",
  "src/framework/audit.js",
  "src/framework/boundary.js",
  "src/framework/errors.js"
]);

function parseOptions(argv) {
  const options = { json: false, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--output") {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
        throw new TypeError("--output requires a value.");
      }
      options.output = argv[++index];
      if (options.output.trim() === "") throw new TypeError("--output must be a non-empty path.");
    } else {
      throw new TypeError(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function captureRejection(operation) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the operation to reject, but it completed.");
}

function approvalFixture({ runId = "release_run", input = { path: "release.txt", content: "safe" } } = {}) {
  const approvalQueue = new ApprovalQueue();
  let executions = 0;
  const gateway = new ToolGateway({
    approvalQueue,
    policyEngine: new PolicyEngine({
      allowedTools: ["writer", "other-writer"],
      approvalRequiredEffects: ["write"]
    })
  });
  gateway.registerTool("writer", async (value) => {
    executions += 1;
    return value.content;
  }, { effects: ["write"] });
  gateway.registerTool("other-writer", async (value) => {
    executions += 1;
    return value.content;
  }, { effects: ["write"] });
  return {
    approvalQueue,
    gateway,
    input,
    runId,
    executions: () => executions
  };
}

async function requestAndApprove(fixture) {
  const pending = await captureRejection(() => fixture.gateway.call(
    "writer",
    fixture.input,
    { runId: fixture.runId }
  ));
  requireCondition(pending.code === "APPROVAL_REQUIRED", `Expected APPROVAL_REQUIRED; got ${pending.code}.`);
  const request = pending.details.approvalRequests?.[0];
  requireCondition(request?.status === "pending", "Approval request was not created.");
  fixture.approvalQueue.approve(request.approvalId, { decidedBy: "conformance-fixture" });
  return request;
}

const CASES = Object.freeze([
  {
    id: "MGES-C01",
    property: "deny-by-default-construction",
    threat: "An execution gateway is created without an explicit policy boundary.",
    async run() {
      let error;
      try {
        new ToolGateway();
      } catch (cause) {
        error = cause;
      }
      requireCondition(error instanceof TypeError, "ToolGateway construction did not reject missing policy.");
      return { constructorRejected: true, errorType: error.name };
    }
  },
  {
    id: "MGES-C02",
    property: "policy-denial-blocks-dispatch",
    threat: "A registered tool is invoked even though policy denies it.",
    async run() {
      let executions = 0;
      const gateway = new ToolGateway({ policyEngine: new PolicyEngine() });
      gateway.registerTool("writer", async () => { executions += 1; });
      const error = await captureRejection(() => gateway.call("writer", { value: 1 }));
      requireCondition(error.code === "POLICY_DENIED", `Expected POLICY_DENIED; got ${error.code}.`);
      requireCondition(executions === 0, `Denied handler executed ${executions} times.`);
      return { rejectionCode: error.code, handlerExecutions: executions };
    }
  },
  {
    id: "MGES-C03",
    property: "policy-evaluation-fails-closed",
    threat: "A policy backend exception falls through to tool execution.",
    async run() {
      let executions = 0;
      const gateway = new ToolGateway({
        policyEngine: { authorizeToolCall: () => { throw new Error("policy unavailable"); } }
      });
      gateway.registerTool("writer", async () => { executions += 1; });
      const error = await captureRejection(() => gateway.call("writer"));
      requireCondition(error.code === "POLICY_EVALUATION_FAILED", `Unexpected code ${error.code}.`);
      requireCondition(executions === 0, `Handler executed ${executions} times.`);
      return { rejectionCode: error.code, handlerExecutions: executions };
    }
  },
  {
    id: "MGES-C04",
    property: "accessor-input-rejected-without-execution",
    threat: "Input accessors execute while authorization data is being canonicalized.",
    async run() {
      let getterExecutions = 0;
      let policyExecutions = 0;
      let handlerExecutions = 0;
      const gateway = new ToolGateway({
        policyEngine: {
          authorizeToolCall() {
            policyExecutions += 1;
            return { status: "allow", reason: "fixture", limits: {}, requiredApprovals: [] };
          }
        }
      });
      gateway.registerTool("writer", async () => { handlerExecutions += 1; });
      const input = {};
      Object.defineProperty(input, "value", {
        enumerable: true,
        get() {
          getterExecutions += 1;
          return "unsafe";
        }
      });
      const error = await captureRejection(() => gateway.call("writer", input));
      requireCondition(error.code === "APPROVAL_INPUT_INVALID", `Unexpected code ${error.code}.`);
      requireCondition(getterExecutions === 0, "Input getter executed.");
      requireCondition(policyExecutions === 0, "Policy evaluated unsafe input.");
      requireCondition(handlerExecutions === 0, "Handler received unsafe input.");
      return { rejectionCode: error.code, getterExecutions, policyExecutions, handlerExecutions };
    }
  },
  {
    id: "MGES-C05",
    property: "approval-bound-to-run-tool-and-canonical-input",
    threat: "An approval for one exact call authorizes a changed run, tool, or payload.",
    async run() {
      const fixture = approvalFixture();
      const request = await requestAndApprove(fixture);
      const changedRun = await captureRejection(() => fixture.gateway.call(
        "writer",
        fixture.input,
        { runId: "different_run", approvalId: request.approvalId }
      ));
      const changedInput = await captureRejection(() => fixture.gateway.call(
        "writer",
        { ...fixture.input, content: "changed" },
        { runId: fixture.runId, approvalId: request.approvalId }
      ));
      const changedTool = await captureRejection(() => fixture.gateway.call(
        "other-writer",
        fixture.input,
        { runId: fixture.runId, approvalId: request.approvalId }
      ));
      requireCondition(changedRun.code === "APPROVAL_SCOPE_MISMATCH", `Changed run: ${changedRun.code}.`);
      requireCondition(changedInput.code === "APPROVAL_SCOPE_MISMATCH", `Changed input: ${changedInput.code}.`);
      requireCondition(changedTool.code === "APPROVAL_SCOPE_MISMATCH", `Changed tool: ${changedTool.code}.`);
      requireCondition(fixture.executions() === 0, "A mismatched approval reached the handler.");
      requireCondition(fixture.approvalQueue.get(request.approvalId).consumptions.length === 0,
        "A mismatched call consumed the approval.");
      const result = await fixture.gateway.call("writer", fixture.input, {
        runId: fixture.runId,
        approvalId: request.approvalId
      });
      requireCondition(result === "safe", "The exact approved call returned an unexpected result.");
      return {
        changedRunCode: changedRun.code,
        changedInputCode: changedInput.code,
        changedToolCode: changedTool.code,
        exactCallExecutions: fixture.executions(),
        approvalConsumptions: fixture.approvalQueue.get(request.approvalId).consumptions.length,
        boundInputHash: request.subject.inputHash
      };
    }
  },
  {
    id: "MGES-C06",
    property: "approval-single-use-by-default",
    threat: "A consumed approval can be replayed for a second execution.",
    async run() {
      const fixture = approvalFixture();
      const request = await requestAndApprove(fixture);
      await fixture.gateway.call("writer", fixture.input, {
        runId: fixture.runId,
        approvalId: request.approvalId
      });
      const replay = await captureRejection(() => fixture.gateway.call("writer", fixture.input, {
        runId: fixture.runId,
        approvalId: request.approvalId
      }));
      requireCondition(replay.code === "APPROVAL_INVALID", `Unexpected replay code ${replay.code}.`);
      requireCondition(fixture.executions() === 1, `Handler executed ${fixture.executions()} times.`);
      return {
        replayCode: replay.code,
        handlerExecutions: fixture.executions(),
        approvalConsumptions: fixture.approvalQueue.get(request.approvalId).consumptions.length
      };
    }
  },
  {
    id: "MGES-C07",
    property: "per-run-call-limit-enforced",
    threat: "A caller raises a policy-owned call limit and executes again.",
    async run() {
      let executions = 0;
      const gateway = new ToolGateway({
        policyEngine: new PolicyEngine({ allowedTools: ["echo"], maxToolCalls: 1 })
      });
      gateway.registerTool("echo", async () => { executions += 1; return executions; });
      await gateway.call("echo", {}, { runId: "limited", limits: { maxToolCalls: 999 } });
      const error = await captureRejection(() => gateway.call(
        "echo",
        {},
        { runId: "limited", limits: { maxToolCalls: 999 } }
      ));
      requireCondition(error.code === "TOOL_CALL_LIMIT_EXCEEDED", `Unexpected code ${error.code}.`);
      requireCondition(executions === 1, `Handler executed ${executions} times.`);
      return { rejectionCode: error.code, handlerExecutions: executions, effectiveLimit: 1 };
    }
  },
  {
    id: "MGES-C08",
    property: "handler-input-is-detached-and-immutable",
    threat: "The handler receives a mutable caller-owned object that can change after authorization.",
    async run() {
      const callerInput = { nested: { value: "safe" } };
      const gateway = new ToolGateway({
        policyEngine: new PolicyEngine({ allowedTools: ["reader"] })
      });
      gateway.registerTool("reader", async (input) => {
        let mutationRejected = false;
        try {
          input.nested.value = "changed";
        } catch {
          mutationRejected = true;
        }
        return {
          detached: input !== callerInput,
          rootFrozen: Object.isFrozen(input),
          nestedFrozen: Object.isFrozen(input.nested),
          nullPrototype: Object.getPrototypeOf(input) === null,
          mutationRejected,
          value: input.nested.value
        };
      });
      const evidence = await gateway.call("reader", callerInput);
      requireCondition(Object.values({
        detached: evidence.detached,
        rootFrozen: evidence.rootFrozen,
        nestedFrozen: evidence.nestedFrozen,
        nullPrototype: evidence.nullPrototype,
        mutationRejected: evidence.mutationRejected
      }).every(Boolean), "Handler input boundary was not detached and immutable.");
      requireCondition(evidence.value === "safe", "Handler observed mutated input.");
      return evidence;
    }
  },
  {
    id: "MGES-C09",
    property: "cross-run-evidence-does-not-support-a-claim",
    threat: "Evidence from another run is treated as support for a claim.",
    async run() {
      const ledger = new EvidenceLedger({ clock: () => new Date("2026-01-01T00:00:00.000Z") });
      const evidence = ledger.addEvidence({
        runId: "run_a",
        sourceType: "fixture",
        source: "conformance",
        excerpt: "release completed"
      });
      const mismatched = ledger.addClaim({
        runId: "run_b",
        text: "release completed",
        evidenceIds: [evidence.evidenceId]
      });
      const supported = ledger.addClaim({
        runId: "run_a",
        text: "release completed",
        evidenceIds: [evidence.evidenceId]
      });
      const unsupported = ledger.unsupportedClaims();
      requireCondition(unsupported.length === 1, `Expected one unsupported claim; got ${unsupported.length}.`);
      requireCondition(unsupported[0].claimId === mismatched.claimId, "The cross-run claim was not identified.");
      requireCondition(!unsupported.some((claim) => claim.claimId === supported.claimId),
        "The same-run claim was incorrectly identified as unsupported.");
      return {
        evidenceId: evidence.evidenceId,
        mismatchedClaimId: mismatched.claimId,
        supportedClaimId: supported.claimId,
        unsupportedClaimIds: unsupported.map((claim) => claim.claimId)
      };
    }
  },
  {
    id: "MGES-C10",
    property: "multi-approval-consumption-is-atomic",
    threat: "A failed multi-approval call partially consumes the still-valid approval.",
    async run() {
      const approvalQueue = new ApprovalQueue();
      let executions = 0;
      const gateway = new ToolGateway({
        approvalQueue,
        policyEngine: new PolicyEngine({
          allowedTools: ["publisher"],
          approvalRequiredTools: ["publisher"],
          approvalRequiredEffects: ["publish"]
        })
      });
      gateway.registerTool("publisher", async () => { executions += 1; }, { effects: ["publish"] });
      const input = { packageName: "maqam", version: "fixture" };
      const context = { runId: "atomic_release" };
      const pending = await captureRejection(() => gateway.call("publisher", input, context));
      const requests = pending.details.approvalRequests;
      requireCondition(requests?.length === 2, `Expected two approvals; got ${requests?.length}.`);
      for (const request of requests) approvalQueue.approve(request.approvalId, { decidedBy: "fixture" });

      // Make the second approval invalid before the gateway attempts the atomic pair.
      approvalQueue.consume(requests[1].approvalId, {
        consumedBy: "fixture",
        runId: context.runId,
        toolName: "publisher"
      });
      const error = await captureRejection(() => gateway.call("publisher", input, {
        ...context,
        approvalIds: requests.map((request) => request.approvalId)
      }));
      requireCondition(error.code === "APPROVAL_INVALID", `Unexpected code ${error.code}.`);
      requireCondition(approvalQueue.get(requests[0].approvalId).consumptions.length === 0,
        "The first approval was partially consumed.");
      requireCondition(executions === 0, "Handler executed after atomic approval failure.");
      return {
        rejectionCode: error.code,
        firstApprovalConsumptions: approvalQueue.get(requests[0].approvalId).consumptions.length,
        secondApprovalConsumptions: approvalQueue.get(requests[1].approvalId).consumptions.length,
        handlerExecutions: executions
      };
    }
  },
  {
    id: "MGES-C11",
    property: "gateway-evidence-attribution-is-run-task-and-tool-scoped",
    threat: "A handler forges the run, task, or tool attribution on evidence it records.",
    async run() {
      const ledger = new EvidenceLedger({ clock: () => new Date("2026-01-01T00:00:00.000Z") });
      const gateway = new ToolGateway({
        evidenceLedger: ledger,
        policyEngine: new PolicyEngine({ allowedTools: ["reader"] })
      });
      gateway.registerTool("reader", async (_input, context) => context.evidence.addEvidence({
        runId: "forged_run",
        taskId: "forged_task",
        tool: "forged_tool",
        sourceType: "fixture",
        source: "conformance",
        excerpt: "scoped"
      }));
      const recorded = await gateway.call("reader", {}, { runId: "real_run", taskId: "real_task" });
      requireCondition(recorded.runId === "real_run", `Unexpected run attribution ${recorded.runId}.`);
      requireCondition(recorded.taskId === "real_task", `Unexpected task attribution ${recorded.taskId}.`);
      requireCondition(recorded.tool === "reader", `Unexpected tool attribution ${recorded.tool}.`);
      return {
        attemptedAttribution: { runId: "forged_run", taskId: "forged_task", tool: "forged_tool" },
        recordedAttribution: { runId: recorded.runId, taskId: recorded.taskId, tool: recorded.tool }
      };
    }
  },
  {
    id: "MGES-C12",
    property: "denial-trace-is-redacted-and-coded",
    threat: "A denied call omits an audit trace or writes caller secrets into it.",
    async run() {
      let executions = 0;
      const gateway = new ToolGateway({ policyEngine: new PolicyEngine() });
      gateway.registerTool("publisher", async () => { executions += 1; });
      const error = await captureRejection(() => gateway.call(
        "publisher",
        { apiToken: "conformance-secret", value: 1 },
        { runId: "trace_run" }
      ));
      const trace = gateway.trace[0];
      requireCondition(error.code === "POLICY_DENIED", `Unexpected code ${error.code}.`);
      requireCondition(gateway.trace.length === 1, `Expected one trace; got ${gateway.trace.length}.`);
      requireCondition(trace.status === "denied", `Unexpected trace status ${trace.status}.`);
      requireCondition(trace.error?.code === "POLICY_DENIED", `Unexpected trace code ${trace.error?.code}.`);
      requireCondition(trace.input.apiToken === "[REDACTED]", "Trace did not redact apiToken.");
      requireCondition(executions === 0, "Denied handler executed.");
      return {
        rejectionCode: error.code,
        traceStatus: trace.status,
        traceErrorCode: trace.error.code,
        redactedToken: trace.input.apiToken,
        handlerExecutions: executions
      };
    }
  }
]);

function sourceFingerprint() {
  const files = SOURCE_FILES.map((path) => ({
    path,
    sha256: createHash("sha256").update(readFileSync(resolve(REPOSITORY_ROOT, path))).digest("hex")
  }));
  const combined = createHash("sha256");
  for (const file of files) combined.update(`${file.path}\0${file.sha256}\n`);
  return { algorithm: "sha256", combined: combined.digest("hex"), files };
}

function gitMetadata() {
  const run = (...args) => spawnSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    windowsHide: true
  });
  const commit = run("rev-parse", "HEAD");
  const status = run("status", "--porcelain", "--untracked-files=all");
  if (commit.status !== 0 || status.status !== 0) {
    return { available: false, commit: null, workingTreeDirty: null };
  }
  return {
    available: true,
    commit: commit.stdout.trim(),
    workingTreeDirty: status.stdout.trim() !== ""
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const measuredAt = new Date().toISOString();
  const cases = [];
  for (const definition of CASES) {
    const startedAt = process.hrtime.bigint();
    try {
      const evidence = await definition.run();
      cases.push({
        id: definition.id,
        property: definition.property,
        threat: definition.threat,
        status: "pass",
        durationMs: Number((Number(process.hrtime.bigint() - startedAt) / 1_000_000).toFixed(3)),
        evidence
      });
    } catch (error) {
      cases.push({
        id: definition.id,
        property: definition.property,
        threat: definition.threat,
        status: "fail",
        durationMs: Number((Number(process.hrtime.bigint() - startedAt) / 1_000_000).toFixed(3)),
        failure: {
          name: typeof error?.name === "string" ? error.name : "Error",
          code: typeof error?.code === "string" ? error.code : "ERROR",
          message: typeof error?.message === "string" ? error.message : String(error)
        }
      });
    }
  }

  const passed = cases.filter((item) => item.status === "pass").length;
  const failed = cases.length - passed;
  const result = {
    schema: SCHEMA,
    suite: {
      name: "Maqam Governance Evaluation Suite",
      shortName: "MGES",
      profile: "governance-boundary-conformance",
      version: SUITE_VERSION,
      authority: "Maqam project-defined conformance fixtures",
      externallyStandardized: false,
      externallyCertified: false
    },
    measuredAt,
    repository: gitMetadata(),
    environment: {
      node: process.version,
      v8: process.versions.v8,
      operatingSystem: `${os.type()} ${os.release()}`,
      platform: process.platform,
      architecture: process.arch
    },
    sourceFingerprint: sourceFingerprint(),
    summary: { total: cases.length, passed, failed, allPassed: failed === 0 },
    cases,
    interpretation: "Passing confirms only these deterministic fixtures on this source fingerprint. It is not a penetration test, formal proof, compliance assessment, security certification, or universal security score."
  };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;

  if (options.output !== null) {
    const output = resolve(process.cwd(), options.output);
    if (!existsSync(dirname(output))) throw new Error(`Output directory does not exist: ${dirname(output)}`);
    writeFileSync(output, serialized, { encoding: "utf8", flag: "w" });
  }
  if (options.json) process.stdout.write(serialized);
  else {
    process.stdout.write([
      `MGES governance-boundary conformance: ${passed}/${cases.length} passed`,
      ...cases.map((item) => `${item.status === "pass" ? "PASS" : "FAIL"} ${item.id} ${item.property}`),
      "",
      result.interpretation,
      ""
    ].join("\n"));
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exitCode = 1;
});
