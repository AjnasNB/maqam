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
  assert.deepEqual(approvalQueue.get(requests[0].approvalId).consumptions, []);
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
