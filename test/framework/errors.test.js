import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AjnasFrameworkError,
  ApprovalRequiredError,
  PolicyDeniedError,
  toErrorRecord
} from "../../src/framework/errors.js";

test("framework errors serialize code and details", () => {
  const denied = new PolicyDeniedError("Tool blocked", {
    details: { tool: "browser" }
  });
  const approval = new ApprovalRequiredError("Approval needed", {
    details: { approvals: ["publish"] }
  });
  const custom = new AjnasFrameworkError("Bad input", {
    code: "BAD_INPUT",
    details: { field: "goal" }
  });

  assert.equal(denied.name, "PolicyDeniedError");
  assert.equal(denied.code, "POLICY_DENIED");
  assert.deepEqual(denied.details, { tool: "browser" });
  assert.equal(approval.code, "APPROVAL_REQUIRED");
  assert.deepEqual(approval.details.approvals, ["publish"]);
  assert.deepEqual(toErrorRecord(custom), {
    name: "AjnasFrameworkError",
    code: "BAD_INPUT",
    message: "Bad input",
    details: { field: "goal" }
  });
});

test("toErrorRecord handles native errors", () => {
  assert.deepEqual(toErrorRecord(new Error("Native failure")), {
    name: "Error",
    code: "ERROR",
    message: "Native failure",
    details: {}
  });
});
