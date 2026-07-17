import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApprovalRequiredError,
  PolicyDeniedError
} from "../../src/framework/errors.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";
import {
  classifyResearchSourceError,
  ResearchSourceAuthenticationRequiredError,
  ResearchSourceRegistry,
  ResearchSourceToolCallerRequiredError,
  ResearchSourceUnavailableError
} from "../../src/research/index.js";

const fixedClock = () => new Date("2026-07-18T01:02:03.000Z");

function adapter(id, {
  channel = "web",
  priority = 100,
  authentication = "none",
  read
} = {}) {
  return {
    id,
    channel,
    toolName: `research.${id}`,
    priority,
    authentication,
    read: read ?? (async () => [{ uri: `https://example.com/${id}`, text: id }])
  };
}

function createRegistry(options) {
  const byToolName = new Map(options.adapters.map((source) => [source.toolName, source]));
  return new ResearchSourceRegistry({
    ...options,
    toolCaller: {
      call: async (toolName, input, context) => {
        const source = byToolName.get(toolName);
        if (!source) throw new Error(`Unknown test tool '${toolName}'.`);
        return source.read(input, { toolName, routeContext: context });
      }
    }
  });
}

test("ResearchSourceRegistry follows deterministic priority and explicit backend preference", async () => {
  const calls = [];
  const registry = createRegistry({
    clock: fixedClock,
    adapters: [
      adapter("slow", {
        priority: 20,
        read: async () => {
          calls.push("slow");
          throw new ResearchSourceUnavailableError("slow is offline");
        }
      }),
      adapter("fast", {
        priority: 10,
        read: async (input, context) => {
          calls.push("fast");
          assert.ok(Object.isFrozen(input));
          assert.equal(context.toolName, "research.fast");
          assert.ok(Object.isFrozen(context.routeContext));
          return [{ uri: input.uri, title: "Fast", text: "verified" }];
        }
      })
    ]
  });

  assert.deepEqual(registry.list({ channel: "web" }).map((entry) => entry.id), ["fast", "slow"]);
  assert.deepEqual(
    registry.resolve("web", { backendPreference: ["slow"] }).map((entry) => entry.id),
    ["slow", "fast"]
  );

  const result = await registry.route({
    channel: "web",
    backendPreference: ["slow"],
    input: { uri: "https://example.com/evidence" }
  });
  assert.deepEqual(calls, ["slow", "fast"]);
  assert.equal(result.adapter.id, "fast");
  assert.equal(result.documents[0].source.adapterId, "fast");
  assert.equal(result.documents[0].retrievedAt, "2026-07-18T01:02:03.000Z");
  assert.deepEqual(result.attempts.map((attempt) => attempt.status), ["unavailable", "completed"]);
  assert.equal(result.attempts[1].toolName, "research.fast");
  assert.deepEqual({ ...result.governance }, {
    mode: "tool-caller",
    toolName: "research.fast"
  });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.documents[0]));
  assert.ok(Object.isFrozen(result.attempts));
});

test("fallback provenance timestamps the successful retrieval rather than route start", async () => {
  let now = "2026-07-18T01:00:00.000Z";
  const registry = createRegistry({
    clock: () => new Date(now),
    adapters: [
      adapter("unavailable", {
        priority: 1,
        read: async () => {
          now = "2026-07-18T01:00:05.000Z";
          throw new ResearchSourceUnavailableError("try next");
        }
      }),
      adapter("winner", {
        priority: 2,
        read: async () => {
          now = "2026-07-18T01:00:09.000Z";
          return [{ uri: "https://example.com/winner", text: "winner" }];
        }
      })
    ]
  });

  const result = await registry.route({ channel: "web" });
  assert.equal(result.documents[0].retrievedAt, "2026-07-18T01:00:09.000Z");
});

test("governed routing dispatches the exact tool identity and a denial executes zero backends", async () => {
  let deniedBackendCalls = 0;
  let fallbackBackendCalls = 0;
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: ["unrelated.tool"] })
  });
  gateway.registerTool("research.denied", async () => {
    deniedBackendCalls += 1;
    return [];
  });
  gateway.registerTool("research.fallback", async () => {
    fallbackBackendCalls += 1;
    return [];
  });
  const registry = new ResearchSourceRegistry({
    adapters: [
      adapter("denied", { priority: 1 }),
      adapter("fallback", { priority: 2 })
    ],
    toolCaller: { call: gateway.call.bind(gateway) }
  });

  await assert.rejects(() => registry.route({ channel: "web" }), PolicyDeniedError);
  assert.equal(deniedBackendCalls, 0);
  assert.equal(fallbackBackendCalls, 0);
  assert.equal(gateway.trace.length, 1);
  assert.equal(gateway.trace[0].toolName, "research.denied");
  assert.equal(gateway.trace[0].status, "denied");
});

test("ToolGateway routing falls back only after ordinary source unavailability", async () => {
  const calls = [];
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: ["research.primary", "research.secondary"]
    })
  });
  gateway.registerTool("research.primary", async () => {
    calls.push("research.primary");
    throw new ResearchSourceUnavailableError("primary is offline");
  });
  gateway.registerTool("research.secondary", async () => {
    calls.push("research.secondary");
    return [{ uri: "https://example.com/secondary", text: "secondary" }];
  });
  const registry = new ResearchSourceRegistry({
    adapters: [
      adapter("primary", { priority: 1 }),
      adapter("secondary", { priority: 2 })
    ],
    toolCaller: { call: gateway.call.bind(gateway) }
  });

  const result = await registry.route({ channel: "web" });
  assert.deepEqual(calls, ["research.primary", "research.secondary"]);
  assert.deepEqual(
    gateway.trace.map((entry) => [entry.toolName, entry.status]),
    [["research.primary", "failed"], ["research.secondary", "completed"]]
  );
  assert.equal(result.adapter.toolName, "research.secondary");
  assert.deepEqual(result.attempts.map((entry) => entry.status), ["unavailable", "completed"]);
});

test("direct adapter execution is unavailable by default and explicitly marked when requested", async () => {
  const source = adapter("direct");
  const registry = new ResearchSourceRegistry({ adapters: [source] });
  await assert.rejects(
    () => registry.route({ channel: "web" }),
    ResearchSourceToolCallerRequiredError
  );

  const result = await registry.routeUngoverned({ channel: "web" });
  assert.equal(result.adapter.id, "direct");
  assert.deepEqual({ ...result.governance }, {
    mode: "explicitly-ungoverned-direct",
    toolName: "research.direct"
  });
});

test("registry preferences are snapshotted and validated against channel membership", async () => {
  const preferred = ["second"];
  const preferences = { web: preferred };
  const observed = [];
  const registry = createRegistry({
    preferences,
    adapters: [
      adapter("first", { priority: 1, read: async () => (observed.push("first"), []) }),
      adapter("second", { priority: 2, read: async () => (observed.push("second"), []) })
    ]
  });
  preferred[0] = "first";
  preferences.web = ["first"];

  await registry.route({ channel: "web" });
  assert.deepEqual(observed, ["second"]);

  assert.throws(
    () => new ResearchSourceRegistry({
      adapters: [adapter("video", { channel: "youtube" })],
      preferences: { web: ["video"] }
    }),
    /not registered for channel 'web'/
  );
});

test("registry enforces one adapter identity per ToolGateway tool name", () => {
  assert.throws(
    () => new ResearchSourceRegistry({
      adapters: [
        adapter("public", { authentication: "none" }),
        {
          ...adapter("private", { authentication: "required" }),
          toolName: "research.public"
        }
      ]
    }),
    /tool 'research\.public' is already registered/
  );
});

test("policy, approval, crawler-security, and robots denials are fatal and never fall through", async (t) => {
  const cases = [
    ["policy", () => new PolicyDeniedError("blocked")],
    ["approval", () => new ApprovalRequiredError("review required")],
    ["security", () => Object.assign(new Error("private target"), { code: "CRAWLER_URL_BLOCKED" })],
    ["robots", () => Object.assign(new Error("robots denied"), { code: "ROBOTS_DENIED" })]
  ];

  for (const [name, createError] of cases) {
    await t.test(name, async () => {
      let fallbackCalls = 0;
      const expected = createError();
      const registry = createRegistry({
        adapters: [
          adapter(`${name}.denied`, { priority: 1, read: async () => { throw expected; } }),
          adapter(`${name}.fallback`, { priority: 2, read: async () => { fallbackCalls += 1; return []; } })
        ]
      });
      await assert.rejects(
        () => registry.route({ channel: "web" }),
        (error) => error === expected
      );
      assert.equal(fallbackCalls, 0);
      const classification = classifyResearchSourceError(expected);
      assert.equal(classification.kind, "fatal");
      assert.equal(classification.fatal, true);
      assert.ok(Object.isFrozen(classification));
    });
  }
});

test("authenticated adapters require explicit opt-in and cannot become silent fallbacks", async () => {
  let authenticatedCalls = 0;
  let laterCalls = 0;
  const registry = createRegistry({
    adapters: [
      adapter("anonymous", {
        priority: 1,
        read: async () => { throw new ResearchSourceUnavailableError("offline"); }
      }),
      adapter("session", {
        priority: 2,
        authentication: "required",
        read: async () => {
          authenticatedCalls += 1;
          return [{ uri: "https://example.com/session", text: "authenticated" }];
        }
      }),
      adapter("later", {
        priority: 3,
        read: async () => { laterCalls += 1; return []; }
      })
    ]
  });

  await assert.rejects(
    () => registry.route({ channel: "web" }),
    (error) => error instanceof ResearchSourceAuthenticationRequiredError
      && error.code === "RESEARCH_AUTHENTICATION_REQUIRED"
  );
  assert.equal(authenticatedCalls, 0);
  assert.equal(laterCalls, 0);

  const result = await registry.route({ channel: "web", allowAuthenticated: true });
  assert.equal(result.adapter.id, "session");
  assert.equal(authenticatedCalls, 1);
  assert.equal(laterCalls, 0);
});

test("malformed adapter output fails closed without trying another backend", async () => {
  let getterCalls = 0;
  let fallbackCalls = 0;
  const unsafeDocument = { uri: "https://example.com/unsafe", text: "unsafe" };
  Object.defineProperty(unsafeDocument, "metadata", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return { injected: true };
    }
  });
  const registry = createRegistry({
    adapters: [
      adapter("unsafe", { priority: 1, read: async () => [unsafeDocument] }),
      adapter("safe", {
        priority: 2,
        read: async () => {
          fallbackCalls += 1;
          return [{ uri: "https://example.com/safe", text: "safe" }];
        }
      })
    ]
  });
  await assert.rejects(
    () => registry.route({ channel: "web" }),
    /own enumerable data property/
  );
  assert.equal(getterCalls, 0);
  assert.equal(fallbackCalls, 0);
});

test("unknown and HTTP authorization failures fail closed without fallback", async (t) => {
  const cases = [
    ["unknown", new Error("adapter bug")],
    ["http-401", Object.assign(new Error("HTTP 401"), { status: 401 })],
    ["http-403", Object.assign(new Error("HTTP 403"), { status: 403 })]
  ];

  for (const [name, expected] of cases) {
    await t.test(name, async () => {
      let fallbackCalls = 0;
      const registry = createRegistry({
        adapters: [
          adapter(`${name}.failed`, { priority: 1, read: async () => { throw expected; } }),
          adapter(`${name}.fallback`, {
            priority: 2,
            read: async () => {
              fallbackCalls += 1;
              return [{ uri: "https://example.com/fallback", text: "fallback" }];
            }
          })
        ]
      });
      await assert.rejects(
        () => registry.route({ channel: "web" }),
        (error) => error === expected
      );
      assert.equal(fallbackCalls, 0);
      assert.equal(classifyResearchSourceError(expected).kind, "failure");
    });
  }
});

test("routing boundaries reject accessors, inherited authority, and invalid preferences", async () => {
  const registry = createRegistry({ adapters: [adapter("safe")] });
  let getterCalls = 0;
  const request = { channel: "web" };
  Object.defineProperty(request, "allowAuthenticated", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    }
  });
  await assert.rejects(() => registry.route(request), /own enumerable data property/);
  assert.equal(getterCalls, 0);

  const inherited = Object.create({ allowAuthenticated: true });
  inherited.channel = "web";
  await assert.rejects(() => registry.route(inherited), /plain object/);
  assert.throws(
    () => registry.resolve("web", { backendPreference: ["unknown"] }),
    /not registered/
  );
  await assert.rejects(
    () => registry.route({ channel: "web", input: ["not", "an", "object"] }),
    /plain JSON object/
  );
});

test("complete backend failure exposes detached attempts without leaking mutable errors", async () => {
  const details = { endpoint: "primary" };
  const registry = createRegistry({
    adapters: [adapter("failed", {
      read: async () => {
        const error = new ResearchSourceUnavailableError("not ready", { details });
        throw error;
      }
    })]
  });
  const error = await registry.route({ channel: "web" }).catch((caught) => caught);
  details.endpoint = "mutated";
  assert.ok(error instanceof ResearchSourceUnavailableError);
  assert.equal(error.code, "RESEARCH_SOURCE_UNAVAILABLE");
  assert.equal(error.details.attempts.length, 1);
  assert.equal(error.details.attempts[0].classification.error.details.endpoint, "primary");
});

test("error classifications redact credentials from attempt records", () => {
  const error = new ResearchSourceUnavailableError(
    "request failed with npm_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
    {
      details: {
        apiToken: "npm_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
        endpoint: "https://example.com/?token=supersecretvalue"
      }
    }
  );
  const classification = classifyResearchSourceError(error);
  assert.doesNotMatch(classification.error.message, /npm_[A-Z0-9]+/);
  assert.equal(classification.error.details.apiToken, "[REDACTED]");
  assert.match(classification.error.details.endpoint, /REDACTED/);
});
