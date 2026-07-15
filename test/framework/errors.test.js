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
  assert.deepEqual({ ...denied.details }, { tool: "browser" });
  assert.equal(approval.code, "APPROVAL_REQUIRED");
  assert.deepEqual([...approval.details.approvals], ["publish"]);
  const record = toErrorRecord(custom);
  assert.deepEqual({ ...record, details: { ...record.details } }, {
    name: "AjnasFrameworkError",
    code: "BAD_INPUT",
    message: "Bad input",
    details: { field: "goal" }
  });
});

test("toErrorRecord handles native errors", () => {
  const record = toErrorRecord(new Error("Native failure"));
  assert.deepEqual({ ...record, details: { ...record.details } }, {
    name: "Error",
    code: "ERROR",
    message: "Native failure",
    details: {}
  });
});

test("framework errors detach and freeze validated details", () => {
  const details = { nested: { value: 1 }, items: ["safe"] };
  const error = new AjnasFrameworkError("Detached", { details });
  details.nested.value = 9;
  details.items[0] = "changed";

  assert.equal(error.details.nested.value, 1);
  assert.equal(error.details.items[0], "safe");
  assert.equal(Object.getPrototypeOf(error.details), null);
  assert.equal(Object.getPrototypeOf(error.details.nested), null);
  assert.notEqual(Object.getPrototypeOf(error.details.items), Array.prototype);
  assert.equal(Object.isFrozen(error.details), true);
  assert.equal(Object.isFrozen(error.details.nested), true);
});

test("toErrorRecord ignores inherited fields and own accessors without invocation", () => {
  let getterCalls = 0;
  const hostile = {};
  for (const key of ["name", "code", "message", "details"]) {
    Object.defineProperty(hostile, key, {
      enumerable: true,
      get() {
        getterCalls += 1;
        return key === "details" ? { admin: true } : "forged";
      }
    });
  }

  const previous = new Map();
  for (const [key, value] of [
    ["name", "ForgedError"],
    ["code", "FORGED"],
    ["message", "forged"],
    ["details", { admin: true }]
  ]) {
    previous.set(key, Object.getOwnPropertyDescriptor(Object.prototype, key));
    Object.defineProperty(Object.prototype, key, { value, configurable: true });
  }
  try {
    const record = toErrorRecord(hostile);
    assert.equal(record.name, "Error");
    assert.equal(record.code, "ERROR");
    assert.equal(record.message, "Unknown error.");
    assert.equal(Object.hasOwn(record.details, "admin"), false);
    assert.equal(getterCalls, 0);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
      else delete Object.prototype[key];
    }
  }
});

test("toErrorRecord is total for hostile proxies, cycles, and primitive throws", () => {
  const proxy = new Proxy({}, {
    getOwnPropertyDescriptor() {
      throw new Error("trap");
    }
  });
  const cyclicDetails = {};
  cyclicDetails.self = cyclicDetails;
  const cyclic = Object.assign(new Error("cyclic"), { details: cyclicDetails });

  for (const value of [proxy, cyclic, Symbol("failure"), null, undefined, 42]) {
    let record;
    assert.doesNotThrow(() => { record = toErrorRecord(value); });
    assert.equal(Object.getPrototypeOf(record), null);
    assert.equal(Object.getPrototypeOf(record.details), null);
    assert.equal(typeof record.message, "string");
  }
  assert.equal(toErrorRecord(cyclic).details.unavailable, "Unsafe error details were omitted.");
});

test("error constructors reject option and nested detail accessors without invoking them", () => {
  let getterCalls = 0;
  const options = {};
  Object.defineProperty(options, "code", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "FORGED";
    }
  });
  assert.throws(() => new AjnasFrameworkError("bad", options), /data property/);

  const details = {};
  Object.defineProperty(details, "secret", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "secret";
    }
  });
  assert.throws(
    () => new AjnasFrameworkError("bad", { details }),
    /data property/
  );
  assert.equal(getterCalls, 0);
});
