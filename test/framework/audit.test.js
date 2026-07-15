import assert from "node:assert/strict";
import { test } from "node:test";
import { hashValue, redactSensitive, redactText } from "../../src/framework/audit.js";

test("approval hashes are stable for key order and reject JSON-ambiguous -0", () => {
  assert.equal(hashValue({ b: 2, a: 1 }), hashValue({ a: 1, b: 2 }));
  assert.throws(() => hashValue({ value: -0 }), /cannot contain -0/);
});

test("approval hashing rejects values that JSON would erase or collapse", () => {
  const sparse = [];
  sparse.length = 1;
  const withExtraProperty = ["value"];
  withExtraProperty.extra = true;
  const withHiddenProperty = {};
  Object.defineProperty(withHiddenProperty, "secret", { value: "hidden", enumerable: false });

  for (const value of [
    new URL("https://example.com/?token=secret"),
    new Date("2026-07-15T00:00:00.000Z"),
    new Map([["key", "value"]]),
    Buffer.from("data"),
    { value: Number.NaN },
    { value: Number.POSITIVE_INFINITY },
    { value: undefined },
    sparse,
    withExtraProperty,
    withHiddenProperty
  ]) {
    assert.throws(() => hashValue(value), TypeError);
  }
});

test("approval hashing rejects cycles and repeated object references", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const shared = { value: 1 };

  assert.throws(() => hashValue(cyclic), /cycle/i);
  assert.throws(() => hashValue({ first: shared, second: shared }), /cycle/i);
});

test("approval hashing preserves own __proto__ keys without prototype mutation", () => {
  const ordinary = JSON.parse('{"safe":1}');
  const withOwnProto = JSON.parse('{"__proto__":{"polluted":true},"safe":1}');

  assert.notEqual(hashValue(ordinary), hashValue(withOwnProto));
  assert.equal({}.polluted, undefined);
});

test("approval hashing applies depth and payload-size limits", () => {
  let deep = { leaf: true };
  for (let index = 0; index < 101; index += 1) deep = { child: deep };

  assert.throws(() => hashValue(deep), /maximum depth/i);
  assert.throws(() => hashValue({ value: "x".repeat(1_000_001) }), /too large/i);
});

test("approval hashing rejects null-prototype objects that handlers can distinguish", () => {
  const value = Object.create(null);
  value.safe = true;
  assert.throws(() => hashValue(value), /plain JSON object/i);
});

test("redaction covers keys, credentials, sensitive query parameters, fragments, and bare tokens", () => {
  const secret = `npm_${"A".repeat(24)}`;
  const text = redactText(`failed at https://user:pass@example.com/path?api_key=${secret}&page=1#session_id=abc ${secret}`);

  assert.doesNotMatch(text, /user:pass/);
  assert.doesNotMatch(text, new RegExp(secret));
  assert.match(text, /page=1/);
  assert.match(text, /REDACTED/);

  const object = redactSensitive({
    apiKey: secret,
    nested: { sessionId: "session-secret", message: `Bearer ${"B".repeat(20)}` }
  });
  assert.equal(object.apiKey, "[REDACTED]");
  assert.equal(object.nested.sessionId, "[REDACTED]");
  assert.doesNotMatch(object.nested.message, /BBBB/);
});

test("redaction preserves an own __proto__ field without mutating the output prototype", () => {
  const input = JSON.parse('{"__proto__":{"apiKey":"hidden"},"safe":true}');
  const output = redactSensitive(input);

  assert.equal(Object.hasOwn(output, "__proto__"), true);
  assert.equal(output.__proto__.apiKey, "[REDACTED]");
  assert.equal(Object.getPrototypeOf(output), Object.prototype);
  assert.match(JSON.stringify(output), /"__proto__"/);
});
