import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentRuntime } from "../../src/framework/runtime.js";
import { createAgentTool } from "../../src/framework/agent-tool.js";
import { createCliAgentTool } from "../../src/framework/cli-agent-tool.js";
import { EvidenceLedger } from "../../src/framework/evidence-ledger.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";

test("AgentRuntime controls function, object, and CLI workers in one governed workflow", async () => {
  const evidenceLedger = new EvidenceLedger({
    clock: () => new Date("2026-06-30T12:00:00.000Z")
  });
  const policyEngine = new PolicyEngine({
    allowedTools: ["planner", "designer", "builder"]
  });
  const toolGateway = new ToolGateway({ policyEngine, evidenceLedger });

  toolGateway.registerTool("planner", createAgentTool(async (input) => ({
    plan: [`Design ${input.product}`, "Build artifact", "Record evidence"]
  }), { name: "planner" }));

  toolGateway.registerTool("designer", createAgentTool({
    invoke: async (input) => ({
      spec: {
        name: input.product,
        workflow: input.plan.join(" -> ")
      }
    })
  }, { name: "designer" }));

  toolGateway.registerTool("builder", createCliAgentTool({
    name: "builder",
    command: process.execPath,
    args: [
      "--input-type=module",
      "-e",
      "let body=''; for await (const c of process.stdin) body += c; const input = JSON.parse(body); console.log(JSON.stringify({ artifact: `${input.name}.txt`, content: `Built ${input.workflow}` }));"
    ],
    stdin: "json",
    parseJson: true,
    timeoutMs: 5000,
    maxInputTokens: 120,
    maxOutputBytes: 4096
  }));

  const runtime = new AgentRuntime({ policyEngine, evidenceLedger, toolGateway });
  const result = await runtime.runWorkflow({
    name: "universal_agent_control",
    tasks: [
      {
        id: "plan",
        run: (context) => context.tools.call("planner", { product: "agent-workflow" }, context)
      },
      {
        id: "design",
        run: (context) => context.tools.call("designer", {
          product: "agent-workflow",
          plan: context.outputs.plan.plan
        }, context)
      },
      {
        id: "build",
        run: (context) => context.tools.call("builder", context.outputs.design.spec, context)
      },
      {
        id: "record",
        run: (context) => {
          const output = context.outputs.build.json;
          const evidence = context.evidence.addEvidence({
            runId: context.runId,
            taskId: "record",
            sourceType: "universal_agent_output",
            source: "planner+designer+builder",
            excerpt: output.content,
            tool: "builder",
            confidence: 0.85
          });
          context.evidence.addClaim({
            runId: context.runId,
            taskId: "record",
            text: `Maqam produced ${output.artifact} through multiple governed worker shapes.`,
            evidenceIds: [evidence.evidenceId],
            confidence: 0.85
          });
          return output;
        }
      }
    ]
  }, {
    objective: "Prove Maqam can control multiple worker shapes.",
    allowedTools: ["planner", "designer", "builder"]
  });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.record.artifact, "agent-workflow.txt");
  assert.match(result.outputs.record.content, /Design agent-workflow/);
  assert.deepEqual([...result.evidence.unsupportedClaims], []);
  assert.deepEqual(toolGateway.trace.map((entry) => entry.toolName), ["planner", "designer", "builder"]);
});
