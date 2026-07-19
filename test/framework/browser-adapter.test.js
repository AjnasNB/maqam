import assert from "node:assert/strict";
import { test } from "node:test";
import { ApprovalQueue } from "../../src/framework/approval-queue.js";
import { PolicyEngine } from "../../src/framework/policy.js";
import { ToolGateway } from "../../src/framework/tool-gateway.js";
import { registerGovernedBrowserTools } from "../../src/index.js";

const APP_ORIGIN = "https://app.example";
const NEXT_ORIGIN = "https://next.example";
const UNUSED_ORIGIN = "https://unused.example";
const TOOL_NAMES = ["browser.observe", "browser.preview", "browser.apply", "browser.submit"];
const PROHIBITED_EFFECTS = [
  "external-protocol",
  "download",
  "filesystem-read",
  "filesystem-write",
  "file-picker",
  "clipboard-read",
  "clipboard-write",
  "permission-prompt",
  "print-dialog",
  "modal-dialog"
];

function target(overrides = {}) {
  return {
    sessionId: "session-1",
    pageId: "page-1",
    origin: APP_ORIGIN,
    revision: "revision-1",
    ...overrides
  };
}

function observation(observedTarget, overrides = {}) {
  return {
    target: { ...observedTarget },
    url: `${observedTarget.origin}/form`,
    title: "Account form",
    elements: [
      {
        elementId: "field-name",
        role: "textbox",
        name: "Name",
        states: { required: true, valuePresent: false }
      },
      {
        elementId: "submit-account",
        role: "button",
        name: "Save",
        states: { disabled: false }
      }
    ],
    ...overrides
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function noMutationEffects() {
  return {
    externalProtocol: false,
    download: false,
    filesystemRead: false,
    filesystemWrite: false,
    filePicker: false,
    clipboardRead: false,
    clipboardWrite: false,
    permissionPrompt: false,
    printDialog: false,
    modalDialog: false
  };
}

function createFakeDriver(overrides = {}) {
  const calls = { observe: [], preview: [], apply: [], submit: [] };
  const driver = {
    async observe(request, execution) {
      calls.observe.push({ request, execution });
      return observation(request.target);
    },
    async preview(request, execution) {
      calls.preview.push({ request, execution });
      return {
        schemaVersion: "maqam.browser-plan.v1",
        target: cloneJson(request.target),
        phase: request.phase,
        operations: cloneJson(request.operations)
      };
    },
    async apply(request, execution) {
      calls.apply.push({ request, execution });
      return {
        operationId: request.operationId,
        effects: noMutationEffects(),
        target: {
          ...cloneJson(request.plan.target),
          revision: "revision-2"
        }
      };
    },
    async submit(request, execution) {
      calls.submit.push({ request, execution });
      const operation = request.plan.operations[0];
      return {
        operationId: request.operationId,
        effects: noMutationEffects(),
        target: {
          ...cloneJson(request.plan.target),
          pageId: operation.opensNewPage ? "page-2" : request.plan.target.pageId,
          origin: operation.expectedOrigin,
          revision: "revision-3"
        }
      };
    },
    ...overrides
  };
  return { driver, calls };
}

function createGateway({
  driver,
  approvals = true,
  origins = [APP_ORIGIN, NEXT_ORIGIN, UNUSED_ORIGIN],
  limits = { maxElements: 10, maxTextChars: 10_000, maxOperations: 5 }
}) {
  const approvalQueue = new ApprovalQueue();
  const gateway = new ToolGateway({
    approvalQueue,
    policyEngine: new PolicyEngine({
      allowedTools: TOOL_NAMES,
      allowedOrigins: origins,
      ...(approvals
        ? { approvalRequiredEffects: ["browser:apply", "browser:submit"] }
        : {})
    })
  });
  const registration = registerGovernedBrowserTools(gateway, {
    driver,
    allowedOrigins: origins,
    limits
  });
  return { gateway, approvalQueue, registration };
}

async function previewApply(gateway, runId = "browser-run") {
  return gateway.call("browser.preview", {
    target: target(),
    phase: "apply",
    operations: [
      { kind: "setValueRef", elementId: "field-name", valueRef: "ref:profile.display-name" },
      { kind: "setChecked", elementId: "terms", checked: true }
    ]
  }, { runId });
}

async function approveExact(gateway, approvalQueue, toolName, input, runId) {
  let request;
  await assert.rejects(
    () => gateway.call(toolName, input, { runId }),
    (error) => {
      request = error.details.approvalRequests[0];
      return error.code === "APPROVAL_REQUIRED";
    }
  );
  approvalQueue.approve(request.approvalId, { decidedBy: "browser-owner" });
  return request;
}

test("governed browser observe and preview expose bounded structural read-only records", async () => {
  const { driver, calls } = createFakeDriver();
  const baseObserve = driver.observe;
  driver.observe = async (request, execution) => ({
    ...await baseObserve(request, execution),
    url: "https://app.example/form?account=private#secret-fragment"
  });
  const { gateway, registration } = createGateway({ driver });

  const observed = await gateway.call("browser.observe", {
    target: target(),
    maxElements: 5
  }, { runId: "observe-run" });
  assert.equal(
    observed.url,
    "https://app.example/form?account=%5BREDACTED%5D#[REDACTED]"
  );
  assert.equal(observed.elements[0].elementId, "field-name");
  assert.equal(Object.hasOwn(observed.elements[0], "selector"), false);
  assert.equal(Object.hasOwn(observed.elements[0], "value"), false);
  assert.equal(Object.isFrozen(observed), true);
  assert.equal(Object.getPrototypeOf(observed), Object.prototype);

  const firstPlan = await previewApply(gateway);
  const secondPlan = await previewApply(gateway);
  assert.equal(firstPlan.schemaVersion, "maqam.browser-plan.v1");
  assert.match(firstPlan.planHash, /^[a-f0-9]{64}$/);
  assert.equal(firstPlan.planHash, secondPlan.planHash);
  assert.match(firstPlan.planToken, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.notEqual(firstPlan.planToken, secondPlan.planToken);
  assert.equal(Object.getPrototypeOf(firstPlan), Object.prototype);
  assert.equal(Object.isFrozen(firstPlan.operations), true);
  assert.equal(calls.observe.length, 1);
  assert.equal(calls.preview.length, 2);
  assert.equal(calls.apply.length, 0);
  assert.equal(calls.submit.length, 0);
  assert.deepEqual(registration.toolNames, {
    observe: "browser.observe",
    preview: "browser.preview",
    apply: "browser.apply",
    submit: "browser.submit"
  });
  assert.deepEqual([...registration.prohibitedEffects], PROHIBITED_EFFECTS);
  assert.deepEqual([...gateway.tools.get("browser.apply").metadata.effects], [
    "browser:write",
    "browser:apply",
    "network:write"
  ]);
  assert.deepEqual([...gateway.tools.get("browser.submit").metadata.effects], [
    "browser:write",
    "browser:submit",
    "network:write"
  ]);
  assert.deepEqual(
    [...gateway.tools.get("browser.apply").metadata.browserAdapter.prohibitedEffects],
    PROHIBITED_EFFECTS
  );
  assert.deepEqual([...calls.preview[0].execution.authorizedOrigins], [APP_ORIGIN]);
  assert.deepEqual([...calls.preview[0].execution.prohibitedEffects], PROHIBITED_EFFECTS);
});

test("apply requires its exact approval action, exact plan, active guard, and re-observation", async () => {
  const { driver, calls } = createFakeDriver();
  const { gateway, approvalQueue } = createGateway({ driver });
  const plan = await previewApply(gateway, "apply-run");
  const input = { plan, operationId: "apply-1" };
  const request = await approveExact(gateway, approvalQueue, "browser.apply", input, "apply-run");

  const directHandler = gateway.tools.get("browser.apply").handler;
  await assert.rejects(
    () => directHandler(input, { toolName: "browser.apply" }),
    (error) => error.code === "TOOL_GATEWAY_EXECUTION_REQUIRED"
  );
  assert.equal(calls.apply.length, 0);

  await assert.rejects(
    () => gateway.call("browser.apply", {
      plan: { ...plan, operations: [
        { kind: "setValueRef", elementId: "field-name", valueRef: "ref:profile.other-name" }
      ] },
      operationId: "apply-1"
    }, { runId: "apply-run", approvalId: request.approvalId }),
    (error) => error.code === "APPROVAL_SCOPE_MISMATCH"
      || error.code === "BROWSER_INPUT_INVALID"
  );
  assert.equal(calls.apply.length, 0);

  const result = await gateway.call("browser.apply", input, {
    runId: "apply-run",
    approvalId: request.approvalId
  });
  assert.equal(result.status, "applied");
  assert.equal(result.operationId, "apply-1");
  assert.equal(result.observation.target.revision, "revision-2");
  assert.equal(calls.apply.length, 1);
  assert.equal(calls.observe.length, 1);
  assert.deepEqual([...calls.apply[0].execution.approvalActions], ["effect:browser:apply"]);
  assert.deepEqual([...calls.apply[0].execution.authorizedOrigins], [APP_ORIGIN]);
  assert.deepEqual([...calls.apply[0].execution.prohibitedEffects], PROHIBITED_EFFECTS);
  assert.equal(calls.apply[0].execution.toolName, "browser.apply");
  assert.equal(Object.hasOwn(calls.apply[0].execution, "context"), false);
});

test("write plans must be issued by the same adapter preview and run", async () => {
  const firstFixture = createFakeDriver();
  const firstGateway = createGateway({ driver: firstFixture.driver }).gateway;
  const foreignPlan = await previewApply(firstGateway, "foreign-plan-run");

  const secondFixture = createFakeDriver();
  const { gateway, approvalQueue } = createGateway({ driver: secondFixture.driver });
  const foreignInput = { plan: foreignPlan, operationId: "foreign-plan" };
  await assert.rejects(
    () => gateway.call("browser.apply", foreignInput, {
      runId: "foreign-plan-run"
    }),
    (error) => error.code === "BROWSER_PREVIEW_REQUIRED"
  );
  assert.equal(approvalQueue.pending().length, 0);
  assert.equal(secondFixture.calls.apply.length, 0);

  const localPlan = await previewApply(gateway, "issued-plan-run-1");
  const firstInput = { plan: localPlan, operationId: "issued-plan-1" };
  const firstApproval = await approveExact(
    gateway,
    approvalQueue,
    "browser.apply",
    firstInput,
    "issued-plan-run-1"
  );
  await gateway.call("browser.apply", firstInput, {
    runId: "issued-plan-run-1",
    approvalId: firstApproval.approvalId
  });

  const secondInput = { plan: localPlan, operationId: "wrong-run" };
  await assert.rejects(
    () => gateway.call("browser.apply", secondInput, {
      runId: "issued-plan-run-2"
    }),
    (error) => error.code === "BROWSER_PREVIEW_REQUIRED"
  );
  assert.equal(secondFixture.calls.apply.length, 1);
});

test("write tools fail closed before the driver when policy omits the phase-specific approval", async () => {
  const { driver, calls } = createFakeDriver();
  const { gateway } = createGateway({ driver, approvals: false });
  const plan = await previewApply(gateway, "misconfigured-policy");

  await assert.rejects(
    () => gateway.call("browser.apply", { plan, operationId: "unapproved-apply" }, {
      runId: "misconfigured-policy"
    }),
    (error) => error.code === "BROWSER_APPROVAL_REQUIRED"
      && error.details.requiredApproval === "effect:browser:apply"
  );
  assert.equal(calls.apply.length, 0);
});

test("submit binds the expected origin and new-page decision, then re-observes that exact page", async () => {
  const { driver, calls } = createFakeDriver();
  const { gateway, approvalQueue } = createGateway({ driver });
  const plan = await gateway.call("browser.preview", {
    target: target(),
    phase: "submit",
    operations: [{
      kind: "navigate",
      url: `${NEXT_ORIGIN}/complete`,
      expectedOrigin: NEXT_ORIGIN,
      opensNewPage: true
    }]
  }, { runId: "submit-run" });
  const input = { plan, operationId: "submit-1" };
  const request = await approveExact(gateway, approvalQueue, "browser.submit", input, "submit-run");

  const result = await gateway.call("browser.submit", input, {
    runId: "submit-run",
    approvalId: request.approvalId
  });
  assert.equal(result.status, "submitted");
  assert.equal(result.observation.target.pageId, "page-2");
  assert.equal(result.observation.target.origin, NEXT_ORIGIN);
  assert.equal(calls.submit.length, 1);
  assert.equal(calls.observe.length, 1);
  assert.deepEqual(
    [...calls.preview[0].execution.authorizedOrigins],
    [APP_ORIGIN, NEXT_ORIGIN]
  );
  assert.deepEqual([...calls.submit[0].execution.approvalActions], ["effect:browser:submit"]);
  assert.deepEqual(
    [...calls.submit[0].execution.authorizedOrigins],
    [APP_ORIGIN, NEXT_ORIGIN]
  );
  assert.deepEqual([...calls.submit[0].execution.prohibitedEffects], PROHIBITED_EFFECTS);
});

test("plan structure and authenticity tokens are independent of the observation text budget", async () => {
  const { driver } = createFakeDriver();
  const { gateway } = createGateway({
    driver,
    origins: [APP_ORIGIN],
    limits: { maxElements: 10, maxTextChars: 64, maxOperations: 5 }
  });
  const plan = await previewApply(gateway, "small-observation-budget");
  assert.ok(plan.planToken.length > 64);

  const oversizedFixture = createFakeDriver({
    async observe(request) {
      return observation(request.target, { title: "x".repeat(64) });
    }
  });
  const oversizedGateway = createGateway({
    driver: oversizedFixture.driver,
    origins: [APP_ORIGIN],
    limits: { maxElements: 10, maxTextChars: 64, maxOperations: 5 }
  }).gateway;
  await assert.rejects(
    () => oversizedGateway.call("browser.observe", { target: target() }),
    (error) => error.code === "BROWSER_DRIVER_OUTPUT_INVALID"
  );
});

test("mutation drivers must attest every prohibited side effect remained blocked", async () => {
  for (const effect of Object.keys(noMutationEffects())) {
    let mutationCalls = 0;
    const { driver } = createFakeDriver({
      async apply(request) {
        mutationCalls += 1;
        return {
          operationId: request.operationId,
          target: { ...cloneJson(request.plan.target), revision: "revision-2" },
          effects: { ...noMutationEffects(), [effect]: true }
        };
      }
    });
    const { gateway, approvalQueue } = createGateway({ driver });
    const runId = `blocked-effect-${effect}`;
    const plan = await previewApply(gateway, runId);
    const input = { plan, operationId: `operation-${effect}` };
    const approval = await approveExact(gateway, approvalQueue, "browser.apply", input, runId);
    await assert.rejects(
      () => gateway.call("browser.apply", input, {
        runId,
        approvalId: approval.approvalId
      }),
      (error) => error.code === "BROWSER_DRIVER_OUTPUT_INVALID"
    );
    assert.equal(mutationCalls, 1);
  }

  const { driver } = createFakeDriver({
    async apply(request) {
      return {
        operationId: request.operationId,
        target: { ...cloneJson(request.plan.target), revision: "revision-2" }
      };
    }
  });
  const { gateway, approvalQueue } = createGateway({ driver });
  const plan = await previewApply(gateway, "missing-effects");
  const input = { plan, operationId: "missing-effects" };
  const approval = await approveExact(
    gateway,
    approvalQueue,
    "browser.apply",
    input,
    "missing-effects"
  );
  await assert.rejects(
    () => gateway.call("browser.apply", input, {
      runId: "missing-effects",
      approvalId: approval.approvalId
    }),
    (error) => error.code === "BROWSER_DRIVER_OUTPUT_INVALID"
  );

  {
    let getterCalls = 0;
    const accessorEffects = noMutationEffects();
    Object.defineProperty(accessorEffects, "download", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return false;
      }
    });
    const accessorFixture = createFakeDriver({
      async apply(request) {
        return {
          operationId: request.operationId,
          target: { ...cloneJson(request.plan.target), revision: "revision-2" },
          effects: accessorEffects
        };
      }
    });
    const fixture = createGateway({ driver: accessorFixture.driver });
    const accessorPlan = await previewApply(fixture.gateway, "accessor-effects");
    const accessorInput = { plan: accessorPlan, operationId: "accessor-effects" };
    const accessorApproval = await approveExact(
      fixture.gateway,
      fixture.approvalQueue,
      "browser.apply",
      accessorInput,
      "accessor-effects"
    );
    await assert.rejects(
      () => fixture.gateway.call("browser.apply", accessorInput, {
        runId: "accessor-effects",
        approvalId: accessorApproval.approvalId
      }),
      (error) => error.code === "BROWSER_DRIVER_OUTPUT_INVALID"
    );
    assert.equal(getterCalls, 0);
    assert.equal(accessorFixture.calls.observe.length, 0);
  }

  {
    const extraFixture = createFakeDriver({
      async apply(request) {
        return {
          operationId: request.operationId,
          target: { ...cloneJson(request.plan.target), revision: "revision-2" },
          effects: { ...noMutationEffects(), newWindow: false }
        };
      }
    });
    const fixture = createGateway({ driver: extraFixture.driver });
    const extraPlan = await previewApply(fixture.gateway, "extra-effects");
    const extraInput = { plan: extraPlan, operationId: "extra-effects" };
    const extraApproval = await approveExact(
      fixture.gateway,
      fixture.approvalQueue,
      "browser.apply",
      extraInput,
      "extra-effects"
    );
    await assert.rejects(
      () => fixture.gateway.call("browser.apply", extraInput, {
        runId: "extra-effects",
        approvalId: extraApproval.approvalId
      }),
      (error) => error.code === "BROWSER_DRIVER_OUTPUT_INVALID"
    );
    assert.equal(extraFixture.calls.observe.length, 0);
  }
});

test("plans reject raw values, selectors, script, and secret-bearing navigation before driver dispatch", async () => {
  const { driver, calls } = createFakeDriver();
  const { gateway } = createGateway({ driver });
  const invalidOperations = [
    { kind: "setValueRef", elementId: "field-name", value: "raw-secret" },
    { kind: "setValueRef", elementId: "field-name", valueRef: "sk-raw-secret-value" },
    {
      kind: "setValueRef",
      elementId: "field-name",
      valueRef: "ref:profile.name",
      selector: "#name"
    },
    {
      kind: "setChecked",
      elementId: "terms",
      checked: true,
      script: "document.cookie"
    }
  ];
  for (const operation of invalidOperations) {
    await assert.rejects(
      () => gateway.call("browser.preview", {
        target: target(),
        phase: "apply",
        operations: [operation]
      }),
      (error) => error.code === "BROWSER_INPUT_INVALID"
    );
  }
  await assert.rejects(
    () => gateway.call("browser.preview", {
      target: target(),
      phase: "submit",
      operations: [{
        kind: "navigate",
        url: `${NEXT_ORIGIN}/?api_token=raw-secret`,
        expectedOrigin: NEXT_ORIGIN,
        opensNewPage: false
      }]
    }),
    (error) => error.code === "BROWSER_INPUT_INVALID"
  );
  for (const url of [
    `${NEXT_ORIGIN}/download/sk-raw-secret-value`,
    `${NEXT_ORIGIN}/search?q=sk-raw-secret-value`,
    `${NEXT_ORIGIN}/download/sk%2Draw%2Dsecret%2Dvalue`
  ]) {
    await assert.rejects(
      () => gateway.call("browser.preview", {
        target: target(),
        phase: "submit",
        operations: [{
          kind: "navigate",
          url,
          expectedOrigin: NEXT_ORIGIN,
          opensNewPage: false
        }]
      }),
      (error) => error.code === "BROWSER_INPUT_INVALID"
    );
  }
  assert.equal(calls.preview.length, 0);
});

test("driver outputs reject accessors, stale targets, and bounds without invoking getters", async () => {
  let getterCalls = 0;
  const accessorOutput = observation(target());
  Object.defineProperty(accessorOutput, "title", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "forged";
    }
  });
  const accessorFixture = createFakeDriver({
    async observe() {
      return accessorOutput;
    }
  });
  const accessorGateway = createGateway({ driver: accessorFixture.driver }).gateway;
  await assert.rejects(
    () => accessorGateway.call("browser.observe", { target: target() }),
    (error) => error.code === "BROWSER_DRIVER_OUTPUT_INVALID"
  );
  assert.equal(getterCalls, 0);

  const staleFixture = createFakeDriver({
    async observe(request) {
      return observation({ ...request.target, revision: "unexpected-revision" });
    }
  });
  const staleGateway = createGateway({ driver: staleFixture.driver }).gateway;
  await assert.rejects(
    () => staleGateway.call("browser.observe", { target: target() }),
    (error) => error.code === "BROWSER_DRIVER_OUTPUT_INVALID"
  );

  const largeFixture = createFakeDriver({
    async observe(request) {
      return observation(request.target, {
        elements: Array.from({ length: 11 }, (_, index) => ({
          elementId: `field-${index}`,
          role: "textbox",
          name: `Field ${index}`,
          states: {}
        }))
      });
    }
  });
  const largeGateway = createGateway({ driver: largeFixture.driver }).gateway;
  await assert.rejects(
    () => largeGateway.call("browser.observe", { target: target() }),
    (error) => error.code === "BROWSER_DRIVER_OUTPUT_INVALID"
  );
});

test("registration requires explicit origins and four own driver data functions", () => {
  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: TOOL_NAMES, allowedOrigins: [APP_ORIGIN] })
  });
  const { driver } = createFakeDriver();
  assert.throws(
    () => registerGovernedBrowserTools(gateway, { driver, allowedOrigins: [] }),
    /at least one exact origin/
  );
  assert.throws(
    () => registerGovernedBrowserTools(gateway, {
      driver,
      allowedOrigins: ["https://app.example/path"]
    }),
    /exact canonical HTTP\(S\) origin/
  );

  let getterCalls = 0;
  const accessorDriver = { ...driver };
  Object.defineProperty(accessorDriver, "apply", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return async () => ({});
    }
  });
  assert.throws(
    () => registerGovernedBrowserTools(gateway, {
      driver: accessorDriver,
      allowedOrigins: [APP_ORIGIN]
    }),
    /own enumerable data function/
  );
  assert.equal(getterCalls, 0);

  const manyOrigins = Array.from(
    { length: 33 },
    (_, index) => `https://browser-${index}.example`
  );
  const manyGateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: TOOL_NAMES, allowedOrigins: manyOrigins })
  });
  const manyRegistration = registerGovernedBrowserTools(manyGateway, {
    driver,
    allowedOrigins: manyOrigins,
    limits: { maxElements: 10 }
  });
  assert.equal(manyRegistration.allowedOrigins.length, 33);
  assert.equal(manyGateway.tools.size, 4);

  const invalidGateway = new ToolGateway({
    policyEngine: new PolicyEngine({ allowedTools: TOOL_NAMES, allowedOrigins: [APP_ORIGIN] })
  });
  assert.throws(
    () => registerGovernedBrowserTools(invalidGateway, {
      driver,
      allowedOrigins: [APP_ORIGIN],
      toolPrefix: "INVALID PREFIX"
    }),
    /unsupported characters/
  );
  assert.equal(invalidGateway.tools.size, 0);
});
