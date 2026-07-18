import assert from "node:assert/strict";
import { test } from "node:test";
import { PolicyDeniedError } from "../../src/framework/errors.js";
import {
  checkResearchSourceAdapter,
  defineResearchSourceAdapter,
  RESEARCH_SOURCE_CHECK_STATUSES,
  ResearchSourceRegistry,
  runResearchSourceDoctor
} from "../../src/research/index.js";

function checkedAdapter(id, check) {
  return defineResearchSourceAdapter({
    id,
    channel: "web",
    toolName: `research.${id}`,
    read: async () => [],
    check
  });
}

test("source doctor isolates each adapter and preserves fatal denial status", async () => {
  assert.deepEqual(
    [...RESEARCH_SOURCE_CHECK_STATUSES],
    ["ready", "degraded", "unavailable", "blocked", "error"]
  );
  const calls = [];
  const report = await runResearchSourceDoctor([
    checkedAdapter("ready", async (context) => {
      calls.push("ready");
      assert.ok(Object.isFrozen(context));
      assert.ok(Object.isFrozen(context.adapter));
      return { status: "ready", message: "local parser ready", details: { mode: "offline" } };
    }),
    checkedAdapter("broken", async () => {
      calls.push("broken");
      throw new Error("fixture failed");
    }),
    checkedAdapter("denied", async () => {
      calls.push("denied");
      throw new PolicyDeniedError("health information is outside policy");
    }),
    defineResearchSourceAdapter({
      id: "unchecked",
      channel: "web",
      toolName: "research.unchecked",
      read: async () => []
    })
  ]);

  assert.deepEqual(calls.sort(), ["broken", "denied", "ready"]);
  assert.equal(report.status, "blocked");
  assert.deepEqual({ ...report.summary }, {
    total: 4,
    ready: 1,
    degraded: 0,
    unavailable: 1,
    blocked: 1,
    error: 1
  });
  assert.equal(report.checks.find((entry) => entry.adapter.id === "denied").error.kind, "fatal");
  assert.equal(report.checks.find((entry) => entry.adapter.id === "broken").status, "error");
  assert.equal(report.checks.find((entry) => entry.adapter.id === "unchecked").status, "unavailable");
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.checks));
});

test("doctor converts invalid or accessor check output into an isolated error", async () => {
  let getterCalls = 0;
  const result = {};
  Object.defineProperty(result, "status", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "ready";
    }
  });
  const report = await runResearchSourceDoctor([
    checkedAdapter("accessor", async () => result),
    checkedAdapter("healthy", async () => ({ status: "ready" }))
  ]);
  assert.equal(getterCalls, 0);
  assert.equal(report.checks[0].status, "error");
  assert.match(report.checks[0].message, /own enumerable data property/);
  assert.equal(report.checks[1].status, "ready");

  for (const details of [null, [], "details", 1, true]) {
    const invalidDetails = await checkResearchSourceAdapter(
      checkedAdapter("invalid-details", async () => ({ status: "ready", details }))
    );
    assert.equal(invalidDetails.status, "error");
    assert.match(invalidDetails.message, /Research source check details.*must be a plain JSON object/);
  }
});

test("doctor applies a bounded timeout and cooperatively aborts the host check", async () => {
  let observedSignal = null;
  const delayed = checkedAdapter("delayed", (context) => new Promise((_, reject) => {
    observedSignal = context.signal;
    context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
  }));
  const startedAt = Date.now();
  const result = await checkResearchSourceAdapter(delayed, { timeoutMs: 20 });
  assert.equal(result.status, "error");
  assert.equal(result.error.error.code, "RESEARCH_SOURCE_CHECK_TIMEOUT");
  assert.ok(observedSignal instanceof AbortSignal);
  assert.equal(observedSignal.aborted, true);
  assert.equal(observedSignal.reason.code, "RESEARCH_SOURCE_CHECK_TIMEOUT");
  assert.ok(Date.now() - startedAt < 1_000);

  assert.throws(
    () => defineResearchSourceAdapter({
      id: "command-check",
      channel: "web",
      toolName: "research.command-check",
      read: async () => [],
      check: async () => ({ status: "ready" }),
      shell: true
    }),
    /Unknown Research source adapter field 'shell'/
  );
});

test("registry doctor can select a channel or explicit adapter IDs", async () => {
  const registry = new ResearchSourceRegistry({
    adapters: [
      checkedAdapter("web.ready", async () => ({ status: "ready" })),
      {
        id: "video.ready",
        channel: "video",
        toolName: "research.video.ready",
        read: async () => [],
        check: async () => ({ status: "degraded", message: "metadata only" })
      }
    ]
  });
  const web = await registry.doctor({ channel: "web" });
  assert.equal(web.summary.total, 1);
  assert.equal(web.checks[0].adapter.id, "web.ready");

  const selected = await registry.doctor({ adapterIds: ["video.ready"] });
  assert.equal(selected.summary.degraded, 1);
  assert.equal(selected.checks[0].adapter.channel, "video");

  await assert.rejects(
    () => registry.doctor({ channel: "web", adapterIds: ["video.ready"] }),
    /not registered in the selected scope/
  );
});

test("doctor options and results reject inherited or accessor authority", async () => {
  const adapter = checkedAdapter("ready", async () => ({ status: "ready" }));
  let getterCalls = 0;
  const options = {};
  Object.defineProperty(options, "timeoutMs", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    }
  });
  await assert.rejects(
    () => checkResearchSourceAdapter(adapter, options),
    /own enumerable data property/
  );
  assert.equal(getterCalls, 0);

  const inherited = Object.create({ timeoutMs: 1 });
  await assert.rejects(
    () => checkResearchSourceAdapter(adapter, inherited),
    /plain object/
  );
  await assert.rejects(
    () => checkResearchSourceAdapter(adapter, { signal: {} }),
    /must be an AbortSignal/
  );
  await assert.rejects(
    () => checkResearchSourceAdapter(adapter, { timeoutMs: null }),
    /timeoutMs must be a safe integer/
  );
});
