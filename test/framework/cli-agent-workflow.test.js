import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentRuntime } from "../../src/framework/runtime.js";
import { createCliAgentTool } from "../../src/framework/cli-agent-tool.js";
import { EvidenceLedger } from "../../src/framework/evidence-ledger.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";

test("AgentRuntime can build a small artifact through a governed CLI worker", async () => {
  const evidenceLedger = new EvidenceLedger({
    clock: () => new Date("2026-06-30T11:00:00.000Z")
  });
  const policyEngine = new PolicyEngine({
    allowedTools: ["builderWorker"]
  });
  const toolGateway = new ToolGateway({ policyEngine, evidenceLedger });

  toolGateway.registerTool("builderWorker", createCliAgentTool({
    name: "builderWorker",
    command: process.execPath,
    args: [
      "--input-type=module",
      "-e",
      "let body=''; for await (const c of process.stdin) body += c; const input = JSON.parse(body); console.log(JSON.stringify({ fileName: `${input.name}.txt`, content: `Built ${input.name}` }));"
    ],
    stdin: "json",
    parseJson: true,
    timeoutMs: 5000,
    maxInputTokens: 100,
    maxOutputBytes: 4096
  }));

  const runtime = new AgentRuntime({ policyEngine, evidenceLedger, toolGateway });
  const result = await runtime.runWorkflow({
    name: "governed_cli_build",
    tasks: [
      {
        id: "build",
        run: (context) => context.tools.call("builderWorker", { name: "demo-widget" }, context)
      },
      {
        id: "record",
        run: (context) => {
          const output = context.outputs.build.json;
          const evidence = context.evidence.addEvidence({
            runId: context.runId,
            taskId: "record",
            sourceType: "cli_worker_output",
            source: "builderWorker",
            excerpt: output.content,
            tool: "builderWorker",
            confidence: 0.8
          });
          context.evidence.addClaim({
            runId: context.runId,
            taskId: "record",
            text: `The worker created ${output.fileName}.`,
            evidenceIds: [evidence.evidenceId],
            confidence: 0.8
          });
          return output;
        }
      }
    ]
  }, {
    objective: "Build a small artifact through a governed CLI worker",
    allowedTools: ["builderWorker"]
  });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.record.fileName, "demo-widget.txt");
  assert.equal(result.outputs.record.content, "Built demo-widget");
  assert.equal(result.evidence.evidence.length, 1);
  assert.equal(result.evidence.unsupportedClaims.length, 0);
});
