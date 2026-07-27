import assert from "node:assert/strict";
import test from "node:test";
import { createJob } from "../src/vendor-client.js";

function response(status, body = { id: "task_123" }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

test("uses the v2 endpoint, body, bearer token, and supplied idempotency key", async () => {
  const calls = [];
  const fetchImpl = async (...args) => {
    calls.push(args);
    return response(201);
  };

  const result = await createJob(
    { title: "Ship demo" },
    "token_abc",
    { fetchImpl, idempotencyKey: "idem_123", retries: 0 }
  );

  assert.deepEqual(result, { id: "task_123" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://api.acme.test/v2/tasks");
  assert.equal(calls[0][1].method, "POST");
  assert.equal(calls[0][1].headers.authorization, "Bearer token_abc");
  assert.equal(calls[0][1].headers["idempotency-key"], "idem_123");
  assert.equal(calls[0][1].body, JSON.stringify({ task: { title: "Ship demo" } }));
});

test("reuses one Idempotency-Key across a retry", async () => {
  const calls = [];
  const fetchImpl = async (...args) => {
    calls.push(args);
    return calls.length === 1 ? response(503) : response(201);
  };

  await createJob(
    { title: "Retry safely" },
    "token_abc",
    { fetchImpl, idempotencyKey: "stable_key", retries: 1 }
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].headers["idempotency-key"], "stable_key");
  assert.equal(calls[1][1].headers["idempotency-key"], "stable_key");
});

test("does not retry a client error", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response(400);
  };

  await assert.rejects(
    createJob({}, "token_abc", { fetchImpl, idempotencyKey: "idem_bad", retries: 3 }),
    /Acme request failed: 400/
  );
  assert.equal(calls, 1);
});
