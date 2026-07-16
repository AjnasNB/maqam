import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { ApprovalQueue } from "../framework/approval-queue.js";
import { EvidenceLedger } from "../framework/evidence-ledger.js";
import { PolicyEngine } from "../framework/policy.js";
import { ToolGateway } from "../framework/tool-gateway.js";

const DEMO_TIMESTAMP = "2026-07-16T12:00:00.000Z";
const DEMO_RUN_ID = "demo_release_1";
const DEMO_TOOL_NAME = "writer";
const DEMO_INPUT = Object.freeze({
  path: "release/notes.json",
  content: "Maqam exact approval verified."
});
const ALTERED_INPUT = Object.freeze({
  path: "release/notes.json",
  content: "ALTERED after approval"
});

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function expectCode(operation, expectedCode) {
  try {
    await operation();
  } catch (error) {
    if (error?.code !== expectedCode) throw error;
    return {
      code: error.code,
      message: error.message
    };
  }
  throw new Error(`Expected Maqam error '${expectedCode}', but the operation completed.`);
}

function compactTrace(trace) {
  return trace.map((entry) => ({
    status: entry.status,
    code: entry.error?.code || null,
    approvalIds: entry.approvalIds || []
  }));
}

function approvalScope(request) {
  return {
    runId: request.subject.runId,
    toolName: request.subject.toolName,
    inputHash: request.subject.inputHash
  };
}

export async function runApprovalDemo() {
  const workspace = await mkdtemp(resolve(tmpdir(), "maqam-approval-demo-"));
  const clock = () => new Date(DEMO_TIMESTAMP);
  const approvalQueue = new ApprovalQueue({ clock });
  const evidenceLedger = new EvidenceLedger({ clock });
  const policyEngine = new PolicyEngine({
    allowedTools: [DEMO_TOOL_NAME],
    approvalRequiredEffects: ["write"]
  });
  const toolGateway = new ToolGateway({
    policyEngine,
    approvalQueue,
    evidenceLedger,
    clock
  });
  let report;
  let executions = 0;
  try {
    const targetPath = resolve(workspace, DEMO_INPUT.path);
    const pathFromWorkspace = relative(workspace, targetPath);
    if (pathFromWorkspace.startsWith("..") || isAbsolute(pathFromWorkspace)) {
      throw new Error("The approval demo target escaped its temporary workspace.");
    }

    toolGateway.registerTool(DEMO_TOOL_NAME, async (input, context) => {
      executions += 1;
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, input.content, { encoding: "utf8", flag: "wx" });
      const storedContent = await readFile(targetPath, "utf8");
      if (storedContent !== input.content) {
        throw new Error("The demo writer did not persist the exact authorized content.");
      }

      const evidence = context.evidence.addEvidence({
        sourceType: "tool_output",
        source: `demo://${input.path}`,
        excerpt: storedContent,
        confidence: 1
      });
      const claim = context.evidence.addClaim({
        text: `${input.path} contains the exact approved content.`,
        evidenceIds: [evidence.evidenceId],
        confidence: 1
      });
      return {
        path: input.path,
        bytes: Buffer.byteLength(storedContent),
        contentHash: sha256(storedContent),
        verified: true,
        evidenceId: evidence.evidenceId,
        claimId: claim.claimId
      };
    }, {
      effects: ["write"],
      risk: "high"
    });

    const context = {
      runId: DEMO_RUN_ID,
      taskId: "write_release_note",
      requestedBy: "demo-operator",
      approvalEvidence: ["Deterministic local exact-approval demonstration."]
    };

    const requested = await expectCode(
      () => toolGateway.call(DEMO_TOOL_NAME, DEMO_INPUT, context),
      "APPROVAL_REQUIRED"
    );
    const [request] = approvalQueue.pending();
    if (!request || request.status !== "pending") {
      throw new Error("The demo did not receive the expected pending approval request.");
    }

    const requestStep = {
      id: "request",
      status: "needs_approval",
      code: requested.code,
      approvalId: request.approvalId,
      action: request.action,
      approvalStatus: request.status,
      scope: approvalScope(request),
      executions,
      fileExists: await pathExists(targetPath)
    };

    approvalQueue.approve(request.approvalId, {
      decidedBy: "demo-owner",
      note: "Approve only this exact run, tool, and input."
    });

    const altered = await expectCode(
      () => toolGateway.call(DEMO_TOOL_NAME, ALTERED_INPUT, {
        ...context,
        approvalId: request.approvalId
      }),
      "APPROVAL_SCOPE_MISMATCH"
    );
    const alteredStep = {
      id: "altered_input",
      status: "blocked",
      code: altered.code,
      message: altered.message,
      executions,
      fileExists: await pathExists(targetPath)
    };

    const exactResult = await toolGateway.call(DEMO_TOOL_NAME, DEMO_INPUT, {
      ...context,
      approvalId: request.approvalId
    });
    const storedAfterExact = await readFile(targetPath, "utf8");
    const approvalAfterExact = approvalQueue.get(request.approvalId);
    const exactStep = {
      id: "exact_input",
      status: "completed",
      code: null,
      executions,
      approvalConsumptions: approvalAfterExact.consumptions.length,
      result: exactResult,
      file: {
        path: DEMO_INPUT.path,
        content: storedAfterExact,
        verified: storedAfterExact === DEMO_INPUT.content
      }
    };

    const replay = await expectCode(
      () => toolGateway.call(DEMO_TOOL_NAME, DEMO_INPUT, {
        ...context,
        approvalId: request.approvalId
      }),
      "APPROVAL_INVALID"
    );
    const storedAfterReplay = await readFile(targetPath, "utf8");
    const replayStep = {
      id: "replay",
      status: "blocked",
      code: replay.code,
      message: replay.message,
      executions,
      fileUnchanged: storedAfterReplay === storedAfterExact
    };

    const evidence = evidenceLedger.toJSON();
    const finalApproval = approvalQueue.get(request.approvalId);
    const passed = (
      requestStep.executions === 0
      && requestStep.fileExists === false
      && alteredStep.executions === 0
      && alteredStep.fileExists === false
      && exactStep.executions === 1
      && exactStep.approvalConsumptions === 1
      && exactStep.file.verified === true
      && replayStep.executions === 1
      && replayStep.fileUnchanged === true
      && evidence.evidence.length === 1
      && evidence.claims.length === 1
      && evidence.unsupportedClaims.length === 0
    );
    if (!passed) throw new Error("The exact-approval demo invariants did not hold.");

    report = {
      schemaVersion: 1,
      demo: "exact-approval",
      status: "passed",
      description: "A changed input is blocked, the exact approved write runs once, and replay is rejected.",
      approvedInput: { ...DEMO_INPUT },
      alteredInput: { ...ALTERED_INPUT },
      steps: [requestStep, alteredStep, exactStep, replayStep],
      approval: {
        approvalId: finalApproval.approvalId,
        status: finalApproval.status,
        action: finalApproval.action,
        reusable: finalApproval.reusable,
        scope: approvalScope(finalApproval),
        decision: finalApproval.decision,
        consumptions: finalApproval.consumptions
      },
      evidence,
      trace: compactTrace(toolGateway.trace),
      summary: {
        executions,
        approvalConsumptions: finalApproval.consumptions.length,
        evidenceRecords: evidence.evidence.length,
        claims: evidence.claims.length,
        unsupportedClaims: evidence.unsupportedClaims.length
      }
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }

  return {
    ...report,
    cleanup: {
      temporaryWorkspaceRemoved: !(await pathExists(workspace))
    }
  };
}

export function formatApprovalDemo(report) {
  const [request, altered, exact, replay] = report.steps;
  const evidence = report.evidence.evidence[0];
  const claim = report.evidence.claims[0];
  return [
    "Maqam exact-approval demo",
    "",
    `1 REQUEST   ${request.code}`,
    `  approval  ${request.approvalId} (${request.approvalStatus})`,
    `  run       ${request.scope.runId}`,
    `  tool      ${request.scope.toolName}`,
    `  input     sha256:${request.scope.inputHash}`,
    `  executions ${request.executions}`,
    "",
    `2 ALTERED   ${altered.code}`,
    `  executions ${altered.executions} | file exists ${altered.fileExists}`,
    "",
    `3 EXACT     ${exact.status.toUpperCase()}`,
    `  ${exact.result.path} | ${exact.result.bytes} bytes | verified ${exact.result.verified}`,
    `  executions ${exact.executions} | approval consumptions ${exact.approvalConsumptions}`,
    "",
    `4 REPLAY    ${replay.code}`,
    `  executions ${replay.executions} | file unchanged ${replay.fileUnchanged}`,
    "",
    "5 EVIDENCE  LINKED",
    `  ${evidence.evidenceId} -> ${claim.claimId}`,
    `  ${evidence.hash}`,
    `  unsupported claims ${report.summary.unsupportedClaims}`,
    "",
    "PASS: one exact write; altered input and replay were blocked."
  ].join("\n");
}
