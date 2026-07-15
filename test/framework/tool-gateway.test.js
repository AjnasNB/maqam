import assert from "node:assert/strict";
import { test } from "node:test";
import { ApprovalRequiredError, PolicyDeniedError } from "../../src/framework/errors.js";
import { ApprovalQueue } from "../../src/framework/approval-queue.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";
import { createCrawlerTool } from "../../src/index.js";
import { createServer } from "node:http";

test("ToolGateway executes registered tools through policy", async () => {
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: ["echo"] })
  });

  gateway.registerTool("echo", async (input) => ({ value: input.value }));
  const result = await gateway.call("echo", { value: "ok" });

  assert.deepEqual(result, { value: "ok" });
  assert.equal(gateway.trace.length, 1);
  assert.equal(gateway.trace[0].toolName, "echo");
});

test("ToolGateway blocks disallowed tools before execution", async () => {
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: ["crawler"] })
  });

  gateway.registerTool("browser", async () => {
    throw new Error("must not run");
  });

  await assert.rejects(
    () => gateway.call("browser", { url: "https://example.com" }),
    PolicyDeniedError
  );
});

test("ToolGateway raises approval errors for approval decisions", async () => {
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: ["github"],
      approvalRequiredTools: ["github"]
    })
  });

  gateway.registerTool("github", async () => ({ ok: true }));

  await assert.rejects(
    () => gateway.call("github", { action: "fork" }),
    ApprovalRequiredError
  );
});

test("registration metadata can add but cannot erase handler-declared effects", async () => {
  let calls = 0;
  const approvalQueue = new ApprovalQueue();
  const writer = async () => {
    calls += 1;
    return { wrote: true };
  };
  Object.defineProperty(writer, "governance", {
    value: Object.freeze({ effects: ["write"], risk: "critical" })
  });

  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: ["writer"],
      approvalRequiredEffects: ["write", "publish"]
    }),
    approvalQueue
  });
  gateway.registerTool("writer", writer, { effects: ["publish"], risk: "low" });

  await assert.rejects(
    () => gateway.call("writer"),
    (error) => {
      assert.deepEqual([...error.details.requiredApprovals], ["effect:write", "effect:publish"]);
      assert.ok(error.details.approvalRequests.every((request) => request.risk === "critical"));
      return error instanceof ApprovalRequiredError;
    }
  );
  assert.equal(calls, 0);

  const eraseAttempt = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: ["writer", "custom-risk"],
      approvalRequiredEffects: ["write"]
    })
  });
  eraseAttempt.registerTool("writer", writer, { effects: [] });
  await assert.rejects(() => eraseAttempt.call("writer"), ApprovalRequiredError);
  assert.equal(calls, 0);

  assert.throws(
    () => eraseAttempt.registerTool("invalid", async () => {}, { effects: "write" }),
    /effects must be an array/i
  );
  eraseAttempt.registerTool("custom-risk", async (_input, context) => context.toolMetadata.risk, {
    risk: "domain-specific"
  });
  assert.equal(await eraseAttempt.call("custom-risk"), "domain-specific");
  assert.throws(
    () => eraseAttempt.registerTool("invalid-risk", async () => {}, { risk: "" }),
    /risk must be a non-empty string/i
  );

  let metadataGetterCalls = 0;
  const accessorEffects = [];
  Object.defineProperty(accessorEffects, "0", {
    enumerable: true,
    configurable: true,
    get() {
      metadataGetterCalls += 1;
      return "write";
    }
  });
  accessorEffects.length = 1;
  assert.throws(
    () => eraseAttempt.registerTool("accessor-effects", async () => {}, { effects: accessorEffects }),
    /data properties/i
  );
  const accessorMetadata = {};
  Object.defineProperty(accessorMetadata, "risk", {
    enumerable: true,
    get() {
      metadataGetterCalls += 1;
      return "critical";
    }
  });
  assert.throws(
    () => eraseAttempt.registerTool("accessor-risk", async () => {}, accessorMetadata),
    /data property/i
  );
  const inheritedGovernance = async () => {};
  Object.setPrototypeOf(inheritedGovernance, { governance: { effects: ["write"] } });
  assert.throws(
    () => eraseAttempt.registerTool("inherited-governance", inheritedGovernance),
    /own data property/i
  );
  assert.equal(metadataGetterCalls, 0);
});

test("descriptor prototype pollution cannot forge tool metadata", () => {
  const gateway = new ToolGateway({ allowUngoverned: true });
  let getterCalls = 0;
  const metadata = {};
  Object.defineProperty(metadata, "risk", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "critical";
    }
  });
  const handler = async () => ({});
  Object.defineProperty(handler, "governance", {
    configurable: true,
    get() {
      getterCalls += 1;
      return { effects: [] };
    }
  });
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "value");
  try {
    Object.defineProperty(Object.prototype, "value", {
      value: "low",
      configurable: true
    });
    assert.throws(
      () => gateway.registerTool("polluted", async () => ({}), metadata),
      /data property/i
    );
    assert.throws(
      () => gateway.registerTool("polluted-handler", handler),
      /data property/i
    );
  } finally {
    if (previous) Object.defineProperty(Object.prototype, "value", previous);
    else delete Object.prototype.value;
  }
  assert.equal(getterCalls, 0);
});

test("handler metadata mutation cannot weaken later authorization", async () => {
  const approvalQueue = new ApprovalQueue();
  const writer = async (_input, context) => {
    context.toolMetadata.effects.length = 0;
    return { wrote: true };
  };
  Object.defineProperty(writer, "governance", {
    value: Object.freeze({ effects: ["write"] })
  });
  const gateway = new ToolGateway({
    approvalQueue,
    policyEngine: new PolicyEngine({
      allowedTools: ["writer"],
      approvalRequiredEffects: ["write"]
    })
  });
  gateway.registerTool("writer", writer);

  let request;
  await assert.rejects(
    () => gateway.call("writer", {}, { runId: "metadata_mutation" }),
    (error) => {
      request = error.details.approvalRequests[0];
      return error instanceof ApprovalRequiredError;
    }
  );
  approvalQueue.approve(request.approvalId, { decidedBy: "owner" });
  assert.deepEqual(
    await gateway.call("writer", {}, { runId: "metadata_mutation", approvalId: request.approvalId }),
    { wrote: true }
  );
  await assert.rejects(
    () => gateway.call("writer", {}, { runId: "metadata_mutation" }),
    ApprovalRequiredError
  );
});

test("ToolGateway fails closed on malformed and unknown policy decisions", async () => {
  let calls = 0;
  let getterCalls = 0;
  const accessorDecision = {
    reason: "must not inspect through accessors",
    limits: {},
    requiredApprovals: []
  };
  Object.defineProperty(accessorDecision, "status", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "allow";
    }
  });
  const malformed = [
    null,
    {},
    { status: "unknown", reason: "bad", limits: {}, requiredApprovals: [] },
    { status: "allow", reason: "bad", limits: {}, requiredApprovals: ["effect:write"] },
    { status: "needs_approval", reason: "bad", limits: {}, requiredApprovals: [] },
    {
      status: "allow",
      reason: "bad scope",
      limits: {},
      requiredApprovals: [],
      scope: { allowedOrigins: "https://example.com", originsExplicit: true, originsUnrestricted: false }
    },
    accessorDecision
  ];

  for (const decision of malformed) {
    const gateway = new ToolGateway({
      policyEngine: { authorizeToolCall: () => decision }
    });
    gateway.registerTool("writer", async () => {
      calls += 1;
      return { wrote: true };
    });
    await assert.rejects(
      () => gateway.call("writer"),
      (error) => error instanceof PolicyDeniedError && error.code === "POLICY_DECISION_INVALID"
    );
    assert.equal(gateway.trace.at(-1).status, "denied");
  }

  const throwingGateway = new ToolGateway({
    policyEngine: { authorizeToolCall: () => { throw new Error("policy backend unavailable"); } }
  });
  throwingGateway.registerTool("writer", async () => {
    calls += 1;
  });
  await assert.rejects(
    () => throwingGateway.call("writer"),
    (error) => error instanceof PolicyDeniedError && error.code === "POLICY_EVALUATION_FAILED"
  );
  assert.equal(throwingGateway.trace[0].status, "denied");
  assert.equal(getterCalls, 0);
  assert.equal(calls, 0);
});

test("policy decision limits are accessor-free immutable audit snapshots", async () => {
  let nestedGetterCalls = 0;
  const accessorValue = {};
  Object.defineProperty(accessorValue, "value", {
    enumerable: true,
    get() {
      nestedGetterCalls += 1;
      return 1;
    }
  });
  const accessorGateway = new ToolGateway({
    policyEngine: {
      authorizeToolCall: () => ({
        status: "allow",
        reason: "malformed nested limit",
        limits: { custom: accessorValue },
        requiredApprovals: []
      })
    }
  });
  accessorGateway.registerTool("echo", async () => ({ ok: true }));
  await assert.rejects(
    () => accessorGateway.call("echo"),
    (error) => error.code === "POLICY_DECISION_INVALID"
  );
  assert.equal(nestedGetterCalls, 0);

  const policyOwned = { value: 1 };
  const snapshotGateway = new ToolGateway({
    policyEngine: {
      authorizeToolCall: () => ({
        status: "allow",
        reason: "valid",
        limits: { custom: policyOwned },
        requiredApprovals: []
      })
    }
  });
  snapshotGateway.registerTool("echo", async () => ({ ok: true }));
  await snapshotGateway.call("echo");
  policyOwned.value = 9;
  assert.equal(snapshotGateway.trace[0].decision.limits.custom.value, 1);
  assert.equal(Object.isFrozen(snapshotGateway.trace[0].decision.limits.custom), true);
});

test("handler scope mutation cannot falsify the frozen authorization decision", async () => {
  const gateway = new ToolGateway({
    policyEngine: {
      authorizeToolCall: () => ({
        status: "allow",
        reason: "scoped",
        limits: {},
        requiredApprovals: [],
        scope: {
          allowedOrigins: ["https://safe.example"],
          originsExplicit: true,
          originsUnrestricted: false
        }
      })
    }
  });
  gateway.registerTool("reader", async (_input, context) => {
    let mutationBlocked = false;
    try {
      context.authorizationScope.allowedOrigins.push("https://evil.example");
    } catch {
      mutationBlocked = true;
    }
    return {
      mutationBlocked,
      scopeFrozen: Object.isFrozen(context.authorizationScope),
      originsFrozen: Object.isFrozen(context.authorizationScope.allowedOrigins)
    };
  });

  const result = await gateway.call("reader");
  const decision = gateway.trace[0].decision;
  assert.deepEqual(result, {
    mutationBlocked: true,
    scopeFrozen: true,
    originsFrozen: true
  });
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(Object.isFrozen(decision.scope), true);
  assert.deepEqual([...decision.scope.allowedOrigins], ["https://safe.example"]);
});

test("ToolGateway enforces per-run tool-call limits and redacts trace secrets", async () => {
  const policyEngine = new PolicyEngine({ allowedTools: ["echo"], maxToolCalls: 1 });
  const gateway = new ToolGateway({ policyEngine });
  gateway.registerTool("echo", async () => ({ ok: true }));
  const limits = policyEngine.evaluateGoal().limits;

  await gateway.call("echo", { apiToken: "hidden" }, { runId: "run_budget", limits });
  await assert.rejects(
    () => gateway.call("echo", {}, { runId: "run_budget", limits }),
    (error) => error.code === "TOOL_CALL_LIMIT_EXCEEDED"
  );

  assert.equal(gateway.getCallCount("run_budget"), 1);
  assert.equal(gateway.trace[0].input.apiToken, "[REDACTED]");
  assert.equal(gateway.trace[1].status, "denied");
});

test("caller limits can lower but cannot raise or disable policy tool-call limits", async () => {
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: ["echo"], maxToolCalls: 1 })
  });
  gateway.registerTool("echo", async () => ({ ok: true }));

  await gateway.call("echo", {}, { runId: "raised_limit", limits: { maxToolCalls: 999 } });
  await assert.rejects(
    () => gateway.call("echo", {}, { runId: "raised_limit", limits: { maxToolCalls: 999 } }),
    (error) => error.code === "TOOL_CALL_LIMIT_EXCEEDED"
  );
  await assert.rejects(
    () => gateway.call("echo", {}, { runId: "invalid_limit", limits: { maxToolCalls: "unlimited" } }),
    (error) => error.code === "TOOL_CALL_LIMIT_INVALID"
  );
});

test("ToolGateway binds a one-time approval to the exact run, tool, and input", async () => {
  const approvalQueue = new ApprovalQueue();
  const policyEngine = new PolicyEngine({
    allowedTools: ["publisher"],
    approvalRequiredEffects: ["publish"]
  });
  const gateway = new ToolGateway({ policyEngine, approvalQueue });
  gateway.registerTool("publisher", async () => ({ published: true }), { effects: ["publish"] });
  const input = { packageName: "maqam", version: "0.2.0" };
  const context = { runId: "release_1" };

  let request;
  await assert.rejects(
    () => gateway.call("publisher", input, context),
    (error) => {
      request = error.details.approvalRequests[0];
      return error instanceof ApprovalRequiredError && request.status === "pending";
    }
  );

  approvalQueue.approve(request.approvalId, { decidedBy: "owner" });
  const result = await gateway.call("publisher", input, { ...context, approvalId: request.approvalId });
  assert.deepEqual(result, { published: true });

  await assert.rejects(
    () => gateway.call("publisher", input, { ...context, approvalId: request.approvalId }),
    (error) => error.code === "APPROVAL_INVALID"
  );
});

test("approval-gated handlers consume the exact detached input that was hashed", async () => {
  const approvalQueue = new ApprovalQueue();
  const policyEngine = new PolicyEngine({
    allowedTools: ["publisher"],
    approvalRequiredEffects: ["publish"]
  });
  const gateway = new ToolGateway({ policyEngine, approvalQueue });
  let releaseHandler;
  const handlerWaiting = new Promise((resolve) => {
    gateway.registerTool("publisher", async (input) => {
      resolve();
      await new Promise((resume) => { releaseHandler = resume; });
      return input.target;
    }, { effects: ["publish"] });
  });
  const input = { target: "safe" };
  const context = { runId: "detached_input" };

  let request;
  await assert.rejects(
    () => gateway.call("publisher", input, context),
    (error) => {
      request = error.details.approvalRequests[0];
      return error instanceof ApprovalRequiredError;
    }
  );
  approvalQueue.approve(request.approvalId, { decidedBy: "owner" });

  const call = gateway.call("publisher", input, { ...context, approvalId: request.approvalId });
  await handlerWaiting;
  input.target = "danger";
  releaseHandler();

  assert.equal(await call, "safe");
  assert.equal(request.subject.inputHash, approvalQueue.get(request.approvalId).subject.inputHash);
});

test("ungated calls authorize and execute one immutable detached input snapshot", async () => {
  let authorizedInput;
  const policyEngine = {
    authorizeToolCall({ input }) {
      authorizedInput = input;
      return {
        status: "allow",
        reason: "Allowed for snapshot regression.",
        limits: {},
        requiredApprovals: []
      };
    }
  };
  const gateway = new ToolGateway({ policyEngine });
  let entered;
  let release;
  let handlerInput;
  const handlerEntered = new Promise((resolve) => { entered = resolve; });
  gateway.registerTool("reader", async (input) => {
    handlerInput = input;
    entered();
    await new Promise((resolve) => { release = resolve; });
    return { value: input.nested.value, inherited: input.nested.authorized };
  });

  const callerInput = { nested: { value: "safe" }, items: [{}] };
  const call = gateway.call("reader", callerInput);
  await handlerEntered;
  callerInput.nested.value = "changed";
  callerInput.items[0].changed = true;

  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "authorized");
  try {
    Object.defineProperty(Object.prototype, "authorized", {
      value: true,
      configurable: true
    });
    release();
    assert.deepEqual(await call, { value: "safe", inherited: undefined });
    assert.equal(authorizedInput, handlerInput);
    assert.equal(handlerInput.items[0].changed, undefined);
    assert.equal(Object.getPrototypeOf(handlerInput), null);
    assert.equal(Object.getPrototypeOf(handlerInput.nested), null);
    assert.notEqual(Object.getPrototypeOf(handlerInput.items), Array.prototype);
    assert.equal(Object.isFrozen(handlerInput), true);
  } finally {
    if (previous) Object.defineProperty(Object.prototype, "authorized", previous);
    else delete Object.prototype.authorized;
  }
});

test("ToolGateway rejects input accessors before policy or handler evaluation", async () => {
  let policyCalls = 0;
  let handlerCalls = 0;
  let getterCalls = 0;
  const gateway = new ToolGateway({
    policyEngine: {
      authorizeToolCall() {
        policyCalls += 1;
        return { status: "allow", reason: "allow", limits: {}, requiredApprovals: [] };
      }
    }
  });
  gateway.registerTool("reader", async () => { handlerCalls += 1; });
  const input = {};
  Object.defineProperty(input, "target", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "danger";
    }
  });

  await assert.rejects(
    () => gateway.call("reader", input),
    (error) => error.code === "APPROVAL_INPUT_INVALID"
  );
  assert.equal(getterCalls, 0);
  assert.equal(policyCalls, 0);
  assert.equal(handlerCalls, 0);
});

test("approved empty input cannot gain authority through later prototype pollution", async () => {
  const approvalQueue = new ApprovalQueue();
  const policyEngine = new PolicyEngine({
    allowedTools: ["writer"],
    approvalRequiredTools: ["writer"]
  });
  const gateway = new ToolGateway({ policyEngine, approvalQueue });
  gateway.registerTool("writer", async (input) => ({
    admin: input.admin,
    prototype: Object.getPrototypeOf(input)
  }));

  let request;
  await assert.rejects(
    () => gateway.call("writer", {}, { runId: "prototype_hash" }),
    (error) => {
      request = error.details.approvalRequests[0];
      return error.code === "APPROVAL_REQUIRED";
    }
  );
  approvalQueue.approve(request.approvalId, { decidedBy: "owner" });

  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "admin");
  try {
    Object.defineProperty(Object.prototype, "admin", {
      value: true,
      configurable: true
    });
    const result = await gateway.call("writer", {}, {
      runId: "prototype_hash",
      approvalId: request.approvalId
    });
    assert.equal(result.admin, undefined);
    assert.equal(result.prototype, null);
  } finally {
    if (previous) Object.defineProperty(Object.prototype, "admin", previous);
    else delete Object.prototype.admin;
  }
});

test("ToolGateway and PolicyEngine deny by default unless ungoverned use is explicit", async () => {
  assert.throws(() => new ToolGateway(), /requires a policyEngine/);

  const governed = new ToolGateway({ policyEngine: new PolicyEngine() });
  governed.registerTool("echo", async () => ({ ok: true }));
  await assert.rejects(() => governed.call("echo"), PolicyDeniedError);

  const ungoverned = new ToolGateway({ allowUngoverned: true });
  ungoverned.registerTool("echo", async () => ({ ok: true }));
  assert.deepEqual(await ungoverned.call("echo"), { ok: true });
});

test("approval input hashing prevents -0 substitution and rejects unsafe values", async () => {
  const approvalQueue = new ApprovalQueue();
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: ["writer"],
      allowAllOrigins: true,
      approvalRequiredTools: ["writer"]
    }),
    approvalQueue
  });
  gateway.registerTool("writer", async () => ({ ok: true }));

  let request;
  await assert.rejects(
    () => gateway.call("writer", { value: 0 }, { runId: "hash_run" }),
    (error) => {
      request = error.details.approvalRequests[0];
      return error.code === "APPROVAL_REQUIRED";
    }
  );
  approvalQueue.approve(request.approvalId);

  await assert.rejects(
    () => gateway.call("writer", { value: -0 }, { runId: "hash_run", approvalId: request.approvalId }),
    (error) => error.code === "APPROVAL_INPUT_INVALID"
  );
  await assert.rejects(
    () => gateway.call("writer", { value: new URL("https://example.com") }, { runId: "hash_run" }),
    (error) => error.code === "APPROVAL_INPUT_INVALID"
  );
});

test("multi-approval tool calls consume approvals atomically", async () => {
  const approvalQueue = new ApprovalQueue();
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: ["publisher"],
      approvalRequiredTools: ["publisher"],
      approvalRequiredEffects: ["publish"]
    }),
    approvalQueue
  });
  gateway.registerTool("publisher", async () => ({ published: true }), { effects: ["publish"] });
  const input = { packageName: "maqam", version: "0.2.0" };
  const context = { runId: "atomic_release" };
  let requests;

  await assert.rejects(
    () => gateway.call("publisher", input, context),
    (error) => {
      requests = error.details.approvalRequests;
      return requests.length === 2;
    }
  );
  for (const request of requests) approvalQueue.approve(request.approvalId);
  approvalQueue.consume(requests[1].approvalId);

  await assert.rejects(
    () => gateway.call("publisher", input, {
      ...context,
      approvalIds: requests.map((request) => request.approvalId)
    }),
    (error) => error.code === "APPROVAL_INVALID"
  );
  assert.deepEqual([...approvalQueue.get(requests[0].approvalId).consumptions], []);
});

test("gateway-level goals remain effective inside crawler tools", async () => {
  let secondHits = 0;
  const second = createServer((request, response) => {
    secondHits += 1;
    response.setHeader("content-type", "text/html");
    response.end("<main><h1>Out of goal</h1></main>");
  });
  await new Promise((resolve) => second.listen(0, "127.0.0.1", resolve));
  const secondOrigin = `http://127.0.0.1:${second.address().port}`;
  const first = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<main><h1>In goal</h1><a href="${secondOrigin}/outside">outside</a></main>`);
  });
  await new Promise((resolve) => first.listen(0, "127.0.0.1", resolve));
  const firstOrigin = `http://127.0.0.1:${first.address().port}`;

  try {
    const goal = { allowedTools: ["crawler"], allowedOrigins: [firstOrigin] };
    const policyEngine = new PolicyEngine({
      allowedTools: ["crawler"],
      allowedOrigins: [firstOrigin, secondOrigin]
    });
    const gateway = new ToolGateway({ policyEngine, goal });
    gateway.registerTool("crawler", createCrawlerTool({
      allowedOrigins: [firstOrigin, secondOrigin],
      sameOrigin: false,
      obeyRobots: false,
      allowPrivateNetworks: true,
      delayMs: 0,
      maxPages: 2,
      maxRetries: 0
    }));

    const pages = await gateway.call("crawler", { seeds: [firstOrigin], maxPages: 2 });
    assert.equal(pages.length, 1);
    assert.equal(new URL(pages[0].url).origin, firstOrigin);
    assert.equal(secondHits, 0);
  } finally {
    await Promise.all([first, second].map((server) => new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    })));
  }
});

test("caller context goals can narrow but cannot replace a gateway-level goal", async () => {
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: ["reader"],
      allowedOrigins: ["https://one.example", "https://two.example"]
    }),
    goal: {
      allowedTools: ["reader"],
      allowedOrigins: ["https://one.example"]
    }
  });
  gateway.registerTool("reader", async () => ({ ok: true }));

  assert.deepEqual(await gateway.call(
    "reader",
    { url: "https://one.example/page" },
    { goal: { allowedTools: ["reader"], allowedOrigins: ["https://one.example"] } }
  ), { ok: true });

  await assert.rejects(
    () => gateway.call(
      "reader",
      { url: "https://two.example/page" },
      { goal: { allowedTools: ["reader"], allowedOrigins: ["https://two.example"] } }
    ),
    (error) => error instanceof PolicyDeniedError && /goal|origin/i.test(error.message)
  );
});

test("ToolGateway rejects malformed goal scopes and detaches configured scopes", async () => {
  const policyEngine = new PolicyEngine({
    allowedTools: ["reader", "writer"],
    allowAllOrigins: true
  });
  assert.throws(
    () => new ToolGateway({ policyEngine, goal: { allowedTools: "reader" } }),
    /array of non-empty strings/
  );

  const allowedTools = ["reader"];
  const gateway = new ToolGateway({ policyEngine, goal: { allowedTools } });
  gateway.registerTool("reader", async () => ({ ok: true }));
  gateway.registerTool("writer", async () => ({ wrote: true }));
  allowedTools[0] = "writer";

  assert.deepEqual(await gateway.call("reader"), { ok: true });
  await assert.rejects(
    () => gateway.call("writer"),
    (error) => error.code === "GOAL_SCOPE_CONFLICT" || error.code === "POLICY_DENIED"
  );
  await assert.rejects(
    () => gateway.call("reader", {}, { goal: { allowedOrigins: "https://example.com" } }),
    /array of non-empty strings/
  );
});
