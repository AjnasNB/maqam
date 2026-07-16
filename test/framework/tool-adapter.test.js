import assert from "node:assert/strict";
import { test } from "node:test";
import { ApprovalQueue } from "../../src/framework/approval-queue.js";
import { ApprovalRequiredError, PolicyDeniedError } from "../../src/framework/errors.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import {
  defineToolAdapter,
  registerToolAdapter,
  runToolAdapterConformance
} from "../../src/framework/tool-adapter.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";

test("host-supplied SDK adapters execute only through an allowlisted ToolGateway", async () => {
  let receivedContext;
  const sdk = {
    issues: {
      async create(input) {
        return { id: "issue_1", title: input.title };
      }
    }
  };
  const adapter = defineToolAdapter({
    name: "sdk.issues.create",
    transport: "sdk",
    description: "Create one issue through the host's SDK client.",
    effects: ["network:write"],
    risk: "high",
    metadata: { owner: "release-team" },
    async invoke(input, context) {
      receivedContext = context;
      assert.equal(Object.isFrozen(input), true);
      return sdk.issues.create(input);
    }
  });
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: [adapter.name] })
  });

  assert.equal(registerToolAdapter(gateway, adapter), gateway);
  const output = await gateway.call(adapter.name, { title: "Ship adapter contract" }, {
    runId: "sdk_adapter"
  });

  assert.deepEqual(output, { id: "issue_1", title: "Ship adapter contract" });
  assert.equal(gateway.getCallCount("sdk_adapter"), 1);
  assert.equal(gateway.trace[0].status, "completed");
  assert.equal(receivedContext.toolMetadata.adapter.transport, "sdk");
  assert.equal(receivedContext.toolMetadata.owner, "release-team");
  assert.deepEqual([...receivedContext.toolMetadata.effects], ["network:write"]);
  assert.equal(receivedContext.toolMetadata.risk, "high");
});

test("adapter effects cannot be downgraded through extra metadata", async () => {
  let invocations = 0;
  const definition = {
    name: "http.publish",
    transport: "http",
    description: "Publish through a host-owned HTTP transport.",
    effects: ["network:write", "publish"],
    risk: "critical",
    metadata: {
      effects: [],
      risk: "low",
      adapter: { transport: "function" }
    },
    async invoke() {
      invocations += 1;
      return { ok: true };
    }
  };
  assert.throws(
    () => defineToolAdapter(definition),
    /metadata cannot redefine reserved field 'adapter'/
  );
  const { metadata: _metadata, ...safeDefinition } = definition;
  const adapter = defineToolAdapter(safeDefinition);
  assert.deepEqual([...adapter.metadata.effects], ["network:write", "publish"]);
  assert.equal(adapter.metadata.risk, "critical");
  assert.equal(adapter.metadata.adapter.transport, "http");

  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: [adapter.name],
      deniedEffects: ["publish"]
    })
  });
  registerToolAdapter(gateway, adapter);

  await assert.rejects(
    () => gateway.call(adapter.name, { body: "release" }),
    (error) => error instanceof PolicyDeniedError && /Effect 'publish'/.test(error.message)
  );
  assert.equal(invocations, 0);
});

test("adapter registration preserves stricter governance declared by the invoke handler", async () => {
  let invocations = 0;
  const invoke = async () => {
    invocations += 1;
    return { published: true };
  };
  Object.defineProperty(invoke, "governance", {
    value: { effects: ["publish"], risk: "critical" },
    enumerable: true
  });
  const adapter = defineToolAdapter({
    name: "sdk.hidden-governance",
    transport: "sdk",
    description: "Exercise a stricter handler governance descriptor.",
    effects: [],
    risk: "low",
    invoke
  });
  const gateway = new ToolGateway({
    approvalQueue: new ApprovalQueue(),
    policyEngine: new PolicyEngine({
      allowedTools: [adapter.name],
      approvalRequiredEffects: ["publish"]
    })
  });
  registerToolAdapter(gateway, adapter);

  await assert.rejects(
    () => gateway.call(adapter.name, {}, { runId: "adapter_hidden_governance" }),
    (error) => error instanceof ApprovalRequiredError
  );
  assert.equal(invocations, 0);
  assert.deepEqual([...gateway.tools.get(adapter.name).metadata.effects], ["publish"]);
  assert.equal(gateway.tools.get(adapter.name).metadata.risk, "critical");
});

test("adapter registration rejects whitespace-bearing handler governance before dispatch", () => {
  let invocations = 0;
  const invoke = async () => {
    invocations += 1;
    return { published: true };
  };
  const definition = {
    name: "sdk.ambiguous-governance",
    transport: "sdk",
    description: "Reject ambiguous handler governance labels.",
    effects: [],
    risk: "low",
    invoke
  };

  Object.defineProperty(invoke, "governance", {
    value: { effects: ["publish "], risk: "critical" },
    configurable: true
  });
  assert.throws(
    () => defineToolAdapter(definition),
    /must not contain leading or trailing whitespace/
  );

  Object.defineProperty(invoke, "governance", {
    value: { effects: ["publish"], risk: "critical " },
    configurable: true
  });
  assert.throws(
    () => defineToolAdapter(definition),
    /must not contain leading or trailing whitespace/
  );

  delete invoke.governance;
  const adapter = defineToolAdapter(definition);
  Object.defineProperty(invoke, "governance", {
    value: { effects: ["publish "], risk: "critical" },
    configurable: true
  });
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: [adapter.name],
      approvalRequiredEffects: ["publish"]
    })
  });
  assert.throws(
    () => registerToolAdapter(gateway, adapter),
    /must not contain leading or trailing whitespace/
  );
  assert.equal(invocations, 0);
  assert.equal(gateway.tools.has(adapter.name), false);
});

test("an MCP-style adapter keeps discovery and client behavior host supplied", async () => {
  const calls = [];
  const mcpClient = {
    async callTool(request) {
      calls.push(request);
      return { content: [{ type: "text", text: "created #42" }] };
    }
  };
  const adapter = defineToolAdapter({
    name: "mcp.github.create_issue",
    transport: "mcp",
    description: "Call one statically selected MCP tool through a host client.",
    effects: ["network:write"],
    risk: "high",
    invoke: (input) => mcpClient.callTool({
      name: "create_issue",
      arguments: input
    })
  });
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: [adapter.name] })
  });
  registerToolAdapter(gateway, adapter);

  const output = await gateway.call(adapter.name, {
    owner: "AjnasNB",
    repo: "maqam",
    title: "Connector contract"
  });

  assert.equal(output.content[0].text, "created #42");
  assert.deepEqual(calls.map((call) => ({
    ...call,
    arguments: { ...call.arguments }
  })), [{
    name: "create_issue",
    arguments: {
      owner: "AjnasNB",
      repo: "maqam",
      title: "Connector contract"
    }
  }]);
});

test("host-supplied adapters retain exact approval binding", async () => {
  let invocations = 0;
  const adapter = defineToolAdapter({
    name: "sdk.release.publish",
    transport: "sdk",
    description: "Publish one release through a host SDK.",
    effects: ["publish"],
    risk: "critical",
    invoke: async (input) => {
      invocations += 1;
      return { published: input.version };
    }
  });
  const approvalQueue = new ApprovalQueue();
  const gateway = new ToolGateway({
    approvalQueue,
    policyEngine: new PolicyEngine({
      allowedTools: [adapter.name],
      approvalRequiredEffects: ["publish"]
    })
  });
  registerToolAdapter(gateway, adapter);
  const input = { packageName: "maqam", version: "next" };
  const context = { runId: "adapter_release" };

  let request;
  await assert.rejects(
    () => gateway.call(adapter.name, input, context),
    (error) => {
      request = error.details.approvalRequests[0];
      return error instanceof ApprovalRequiredError;
    }
  );
  approvalQueue.approve(request.approvalId, { decidedBy: "release-owner" });

  await assert.rejects(
    () => gateway.call(adapter.name, { ...input, version: "altered" }, {
      ...context,
      approvalId: request.approvalId
    }),
    (error) => error.code === "APPROVAL_SCOPE_MISMATCH"
  );
  assert.equal(invocations, 0);
  assert.deepEqual(await gateway.call(adapter.name, input, {
    ...context,
    approvalId: request.approvalId
  }), { published: "next" });
  assert.equal(invocations, 1);
});

test("adapter conformance reports gateway behavior without claiming protocol certification", async () => {
  const adapter = defineToolAdapter({
    name: "fixture.lookup",
    transport: "custom",
    description: "Read a deterministic fixture.",
    effects: [],
    risk: "low",
    invoke: async (input) => ({ value: input.key.toUpperCase() })
  });

  const report = await runToolAdapterConformance(adapter, {
    input: { key: "maqam" },
    verifyOutput: (output) => output.value === "MAQAM"
  });

  assert.equal(report.schemaVersion, "maqam.tool-adapter-conformance.v1");
  assert.equal(report.passed, true);
  assert.equal(report.traceStatus, "completed");
  assert.equal(report.error, null);
  assert.deepEqual(
    [...report.checks].map(({ id, status }) => [id, status]),
    [
      ["registered", "passed"],
      ["policy_routed", "passed"],
      ["invoked_once", "passed"],
      ["canonical_input_frozen", "passed"],
      ["adapter_metadata_forwarded", "passed"],
      ["trace_completed", "passed"],
      ["output_verified", "passed"]
    ]
  );
  assert.match(report.limitations[0], /not a protocol certification/);
  assert.equal(Object.isFrozen(report), true);

  const failedOutput = await runToolAdapterConformance(adapter, {
    input: { key: "maqam" },
    verifyOutput: () => false
  });
  assert.equal(failedOutput.passed, false);
  assert.equal(
    failedOutput.checks.find((check) => check.id === "output_verified").status,
    "failed"
  );
});

test("adapter conformance returns a bounded failure identity when invocation fails", async () => {
  const failure = new Error("secret-bearing transport failure");
  failure.code = "FIXTURE_FAILED";
  const report = await runToolAdapterConformance(defineToolAdapter({
    name: "fixture.failure",
    transport: "function",
    description: "Fail deterministically.",
    effects: [],
    risk: "low",
    invoke: async () => { throw failure; }
  }));

  assert.equal(report.passed, false);
  assert.equal(report.traceStatus, "failed");
  assert.deepEqual({ ...report.error }, { name: "Error", code: "FIXTURE_FAILED" });
  assert.equal(JSON.stringify(report).includes("secret-bearing"), false);
});

test("tool adapter descriptors fail closed on ambiguous executable fields", () => {
  const base = {
    name: "fixture.echo",
    transport: "function",
    description: "Echo a fixture.",
    effects: [],
    risk: "low",
    invoke: async (input) => input
  };
  assert.throws(
    () => defineToolAdapter({ ...base, transport: "magic" }),
    /transport must be one of/
  );
  assert.throws(
    () => defineToolAdapter({ ...base, effects: ["publish "] }),
    /must not contain leading or trailing whitespace/
  );
  assert.throws(
    () => defineToolAdapter({ ...base, risk: "critical " }),
    /must not contain leading or trailing whitespace/
  );
  const { effects: _effects, ...withoutEffects } = base;
  assert.throws(
    () => defineToolAdapter(withoutEffects),
    /effects must be an explicit array/
  );
  const accessor = { ...base };
  Object.defineProperty(accessor, "invoke", { enumerable: true, get: () => base.invoke });
  assert.throws(
    () => defineToolAdapter(accessor),
    /own enumerable data property/
  );
  assert.throws(
    () => registerToolAdapter(Object.defineProperty({}, "registerTool", {
      get: () => () => undefined
    }), base),
    /registerTool must be a data function/
  );
  const prior = Object.getOwnPropertyDescriptor(Object.prototype, "registerTool");
  try {
    Object.defineProperty(Object.prototype, "registerTool", {
      value: () => undefined,
      configurable: true
    });
    assert.throws(
      () => registerToolAdapter({}, base),
      /registerTool must be a function/
    );
  } finally {
    if (prior) Object.defineProperty(Object.prototype, "registerTool", prior);
    else delete Object.prototype.registerTool;
  }
});
