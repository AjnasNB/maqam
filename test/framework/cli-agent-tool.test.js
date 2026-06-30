import assert from "node:assert/strict";
import { test } from "node:test";
import { AjnasFrameworkError } from "../../src/framework/errors.js";
import { createCliAgentTool } from "../../src/framework/cli-agent-tool.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";

function nodeCli(code) {
  return {
    command: process.execPath,
    args: ["--input-type=module", "-e", code]
  };
}

test("createCliAgentTool runs a fixed CLI through ToolGateway", async () => {
  const cli = createCliAgentTool({
    name: "builder",
    ...nodeCli(`
      let body = "";
      for await (const chunk of process.stdin) body += chunk;
      const input = JSON.parse(body);
      console.log(JSON.stringify({
        artifact: "mini-widget",
        prompt: input.prompt
      }));
    `),
    parseJson: true,
    maxInputTokens: 50,
    maxOutputBytes: 2048,
    timeoutMs: 5000
  });
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: ["builder"] })
  });
  gateway.registerTool("builder", cli);

  const result = await gateway.call("builder", { prompt: "create a small widget" });

  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, false);
  assert.equal(result.json.artifact, "mini-widget");
  assert.equal(result.json.prompt, "create a small widget");
  assert.equal(gateway.trace[0].toolName, "builder");
});

test("createCliAgentTool enforces approximate input token limits before execution", async () => {
  const cli = createCliAgentTool({
    name: "limited",
    ...nodeCli("console.log('must not run')"),
    maxInputTokens: 2
  });

  await assert.rejects(
    () => cli({ prompt: "this input is too large for the configured limit" }),
    (error) => error instanceof AjnasFrameworkError && error.code === "CLI_INPUT_LIMIT_EXCEEDED"
  );
});

test("createCliAgentTool stops commands that exceed output limits", async () => {
  const cli = createCliAgentTool({
    name: "noisy",
    ...nodeCli("console.log('x'.repeat(5000))"),
    maxOutputBytes: 128
  });

  await assert.rejects(
    () => cli({ prompt: "run" }),
    (error) => error instanceof AjnasFrameworkError && error.code === "CLI_OUTPUT_LIMIT_EXCEEDED"
  );
});

test("createCliAgentTool stops commands that exceed timeout", async () => {
  const cli = createCliAgentTool({
    name: "slow",
    ...nodeCli("setTimeout(() => console.log('late'), 2000)"),
    timeoutMs: 50
  });

  await assert.rejects(
    () => cli({ prompt: "run" }),
    (error) => error instanceof AjnasFrameworkError && error.code === "CLI_TIMEOUT"
  );
});

test("createCliAgentTool reports spawn failures as framework errors", async () => {
  const cli = createCliAgentTool({
    name: "missing",
    command: "maqam-command-that-does-not-exist",
    timeoutMs: 500
  });

  await assert.rejects(
    () => cli({ prompt: "run" }),
    (error) => error instanceof AjnasFrameworkError && error.code === "CLI_SPAWN_FAILED"
  );
});
