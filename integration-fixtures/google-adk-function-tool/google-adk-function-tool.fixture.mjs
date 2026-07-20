import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { FunctionTool } from "@google/adk";
import { PolicyEngine } from "../../src/framework/policy.js";
import {
  defineToolAdapter,
  registerToolAdapter
} from "../../src/framework/tool-adapter.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";

function createOfflineFunctionToolFixture({ allowed }) {
  const invoke = mock.fn(async (input) => ({
    status: "routed",
    value: `maqam:${input.value}`
  }));
  const adapter = defineToolAdapter({
    name: "adk.fixture.route",
    transport: "function",
    description: "Route one deterministic offline value.",
    effects: [],
    risk: "low",
    invoke
  });
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: allowed ? [adapter.name] : []
    })
  });
  registerToolAdapter(gateway, adapter);
  const tool = new FunctionTool({
    name: "route_with_maqam",
    description: "Route a deterministic offline value through Maqam.",
    execute: (input) => gateway.call(adapter.name, input, {
      runId: "google_adk_function_tool_fixture"
    })
  });

  return { invoke, tool };
}

test("Google ADK FunctionTool dispatches one allowed call through Maqam", async () => {
  const { invoke, tool } = createOfflineFunctionToolFixture({ allowed: true });

  const result = await tool.runAsync({
    args: { value: "offline" },
    toolContext: undefined
  });

  assert.deepEqual(result, {
    status: "routed",
    value: "maqam:offline"
  });
  assert.equal(invoke.mock.callCount(), 1);
});

test("Google ADK FunctionTool does not dispatch a policy-denied call", async () => {
  const { invoke, tool } = createOfflineFunctionToolFixture({ allowed: false });

  await assert.rejects(
    () => tool.runAsync({
      args: { value: "denied" },
      toolContext: undefined
    }),
    /Tool 'adk\.fixture\.route' is not allowed/
  );
  assert.equal(invoke.mock.callCount(), 0);
});
