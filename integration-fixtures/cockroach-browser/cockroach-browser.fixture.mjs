import assert from "node:assert/strict";
import { test } from "node:test";
import { createMaqamBrowserDriver } from "cockroach-browser/maqam";
import {
  ApprovalQueue,
  PolicyEngine,
  ToolGateway,
  registerGovernedBrowserTools
} from "../../src/index.js";

const ORIGIN = "https://app.example";
const TOOLS = [
  "browser.observe",
  "browser.preview",
  "browser.apply",
  "browser.submit"
];
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

function snapshot(revision = "revision-1", valuePresent = false) {
  return {
    sessionId: "session-1",
    tabId: "page-1",
    url: `${ORIGIN}/form`,
    title: "Profile",
    capturedAt: "2026-07-29T00:00:00.000Z",
    text: "Display name Save",
    refs: [
      {
        ref: "display-name",
        role: "textbox",
        name: "Display name",
        tag: "input",
        valuePresent
      },
      {
        ref: "save",
        role: "button",
        name: "Save",
        tag: "button"
      }
    ],
    digest: revision,
    truncated: false
  };
}

function target() {
  return {
    sessionId: "session-1",
    pageId: "page-1",
    origin: ORIGIN,
    revision: "revision-1"
  };
}

function createRuntimeFixture() {
  let current = snapshot();
  const dispatches = [];
  const runtime = new Proxy({
    async snapshot(sessionId, pageId) {
      assert.equal(sessionId, current.sessionId);
      assert.equal(pageId, current.tabId);
      return structuredClone(current);
    }
  }, {
    get(object, property, receiver) {
      if (typeof property === "symbol") {
        return async (sessionId, action, governance) => {
          assert.equal(sessionId, current.sessionId);
          assert.equal(governance.authority, "maqam");
          assert.match(governance.approvalId, /^approval[_-]/);
          assert.match(governance.executionDigest, /^[a-f0-9]{64}$/);
          assert.deepEqual([...governance.authorizedOrigins], [ORIGIN]);
          assert.deepEqual([...governance.prohibitedEffects], PROHIBITED_EFFECTS);
          dispatches.push(structuredClone({ action, governance }));
          current = snapshot("revision-2", true);
          return {
            output: { applied: true },
            receipt: { status: "succeeded" }
          };
        };
      }
      return Reflect.get(object, property, receiver);
    }
  });
  return {
    runtime,
    dispatches,
    get current() {
      return structuredClone(current);
    }
  };
}

function createFixture() {
  const browser = createRuntimeFixture();
  const approvalQueue = new ApprovalQueue();
  const gateway = new ToolGateway({
    approvalQueue,
    policyEngine: new PolicyEngine({
      allowedTools: TOOLS,
      allowedOrigins: [ORIGIN],
      approvalRequiredEffects: ["browser:apply", "browser:submit"]
    })
  });
  let authority;
  let resolvedReferences = 0;
  const registration = registerGovernedBrowserTools(gateway, {
    allowedOrigins: [ORIGIN],
    limits: { maxElements: 20, maxTextChars: 10_000, maxOperations: 5 },
    createDriver(hostAuthority) {
      authority = hostAuthority;
      return createMaqamBrowserDriver({
        runtime: browser.runtime,
        maxElements: 20,
        async resolveValueRef(reference) {
          resolvedReferences += 1;
          assert.equal(reference, "ref:profile.display-name");
          return "Ajnas";
        },
        verifyExecution: hostAuthority.verifyExecution,
        verifyPlanToken: hostAuthority.verifyPlanToken
      });
    }
  });
  return {
    approvalQueue,
    authority,
    browser,
    gateway,
    registration,
    get resolvedReferences() {
      return resolvedReferences;
    }
  };
}

async function exactApproval(gateway, approvalQueue, input, runId) {
  let approval;
  await assert.rejects(
    () => gateway.call("browser.apply", input, { runId }),
    (error) => {
      approval = error.details?.approvalRequests?.[0];
      return error.code === "APPROVAL_REQUIRED"
        && typeof approval?.approvalId === "string";
    }
  );
  approvalQueue.approve(approval.approvalId, { decidedBy: "fixture-owner" });
  return approval;
}

async function preview(gateway, runId) {
  return gateway.call("browser.preview", {
    target: target(),
    phase: "apply",
    operations: [{
      kind: "setValueRef",
      elementId: "display-name",
      valueRef: "ref:profile.display-name"
    }]
  }, { runId });
}

test("published Cockroach Browser follows observe, preview, exact approval, apply, and re-observe", async () => {
  const fixture = createFixture();
  const runId = "cockroach-browser-flow";

  const observed = await fixture.gateway.call("browser.observe", {
    target: target(),
    maxElements: 20
  }, { runId });
  assert.equal(observed.elements[0].states.valuePresent, false);

  const plan = await preview(fixture.gateway, runId);
  assert.match(plan.planHash, /^[a-f0-9]{64}$/);
  assert.match(plan.planToken, /^v1\./);
  assert.equal(fixture.resolvedReferences, 0);

  const input = { plan, operationId: "apply-display-name" };
  const approval = await exactApproval(
    fixture.gateway,
    fixture.approvalQueue,
    input,
    runId
  );
  const result = await fixture.gateway.call("browser.apply", input, {
    runId,
    approvalId: approval.approvalId
  });

  assert.equal(result.status, "applied");
  assert.equal(result.observation.target.revision, "revision-2");
  assert.equal(result.observation.elements[0].states.valuePresent, true);
  assert.equal(fixture.resolvedReferences, 1);
  assert.equal(fixture.browser.dispatches.length, 1);
  assert.equal(fixture.browser.dispatches[0].action.kind, "fill");
  assert.equal(fixture.browser.dispatches[0].action.value, "Ajnas");
  assert.deepEqual(fixture.registration.toolNames, {
    observe: "browser.observe",
    preview: "browser.preview",
    apply: "browser.apply",
    submit: "browser.submit"
  });

  assert.equal(await fixture.authority.verifyExecution({
    expectedToolName: "browser.observe",
    expectedApprovalAction: null,
    execution: {
      schemaVersion: "maqam.browser-driver-execution.v1",
      runId,
      toolName: "browser.observe",
      inputHash: "0".repeat(64),
      approvalIds: [],
      approvalActions: [],
      authorizedOrigins: [ORIGIN],
      prohibitedEffects: PROHIBITED_EFFECTS
    }
  }), false);
});

test("published Cockroach Browser fails closed on tamper, replay, and stale target", async () => {
  const fixture = createFixture();
  const runId = "cockroach-browser-negative-flow";
  const plan = await preview(fixture.gateway, runId);
  const input = { plan, operationId: "apply-once" };
  const approval = await exactApproval(
    fixture.gateway,
    fixture.approvalQueue,
    input,
    runId
  );

  await assert.rejects(
    () => fixture.gateway.call("browser.apply", {
      plan: {
        ...plan,
        operations: [{
          kind: "setValueRef",
          elementId: "display-name",
          valueRef: "ref:profile.other-name"
        }]
      },
      operationId: "tampered"
    }, { runId, approvalId: approval.approvalId }),
    (error) => error.code === "APPROVAL_SCOPE_MISMATCH"
      || error.code === "BROWSER_INPUT_INVALID"
      || error.code === "BROWSER_PREVIEW_REQUIRED"
  );
  assert.equal(fixture.browser.dispatches.length, 0);

  await fixture.gateway.call("browser.apply", input, {
    runId,
    approvalId: approval.approvalId
  });
  assert.equal(fixture.browser.dispatches.length, 1);

  await assert.rejects(
    () => fixture.gateway.call("browser.apply", input, {
      runId,
      approvalId: approval.approvalId
    }),
    (error) => /already been consumed/i.test(error.message)
  );
  assert.equal(fixture.browser.dispatches.length, 1);

  const staleInput = { plan, operationId: "stale-target" };
  const staleApproval = await exactApproval(
    fixture.gateway,
    fixture.approvalQueue,
    staleInput,
    runId
  );
  await assert.rejects(
    () => fixture.gateway.call("browser.apply", staleInput, {
      runId,
      approvalId: staleApproval.approvalId
    }),
    (error) => error.code === "BROWSER_DRIVER_FAILED"
      && error.cause?.code === "STALE_BROWSER_TARGET"
  );
  assert.equal(fixture.browser.dispatches.length, 1);
});
