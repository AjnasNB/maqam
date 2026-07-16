# Your Agent Approval May Not Authorize The Input That Actually Executes

**A technical guide to exact, one-use approval boundaries for agent tools**

Agent products increasingly add a confirmation step before an email is sent, a repository is modified, or a deployment is started. The screen looks reassuring: it names an action, a person clicks Approve, and the agent continues.

But what did that click authorize?

If the approval is only a boolean or a reusable id, the answer may be much broader than the reviewer expects. The target can change after review. A later run can reuse the decision. A tool can receive a different object from the one policy inspected. The application can display a friendly summary while executing an unreviewed payload.

This article describes the narrower property implemented by Maqam's `ToolGateway`: bind a human decision to one run, one registered tool, and one canonical input, then consume the decision when the approved handler executes.

That does not make the action correct, prove the reviewer's identity, or make a malicious tool safe. It closes a specific class of authority gaps at the application boundary.

## The Common Boolean Model

A minimal approval implementation often resembles this:

```js
if (approval.status === "approved") {
  await tool.call(currentInput);
}
```

The code answers one question: is this approval record marked approved? It does not necessarily answer:

- Was the record created for this run?
- Was it created for this tool?
- Does `currentInput` still match what the reviewer saw?
- Has the record already authorized another execution?
- Did policy inspect the same value the handler will receive?
- Was the stored decision restored from an authenticated source?

Those are different security properties. A user-interface confirmation cannot supply them on its own.

## Threat Model

Exact approval binding is useful against several ordinary application failures.

### Input mutation

The application authorizes a caller-owned object. Before the handler reads it, another callback changes `environment: "staging"` to `environment: "production"`.

### Approval replay

One valid approval id is presented for a second execution, a different run, or a different payload.

### Confused tool authority

An approval requested for a preview or read tool is accepted by a publish or write tool because the record is not scoped to the registered tool name.

### Display/execution drift

The review screen summarizes a subset of fields, while hidden or newly added input fields affect execution.

### Partial multi-approval consumption

An action needs both a tool approval and an effect approval. The first is consumed before the second is found to be invalid, leaving state that is difficult to retry safely.

An exact receipt can reduce these risks. It cannot solve every problem around the boundary.

## The Maqam Call Boundary

Maqam requires governed inputs to be finite, acyclic JSON values made from supported primitives, dense arrays, and plain objects. Accessors, symbol keys, sparse arrays, repeated object references, non-finite numbers, `-0`, and unsupported object types fail closed.

`ToolGateway` then uses one detached snapshot for authorization, approval binding, and handler execution. For an approval-gated call, the lifecycle is:

1. Validate and detach the input.
2. Ask policy whether the tool and its declared effects are allowed.
3. Create pending approval requests when policy requires them.
4. Bind gateway-generated requests to the run id, registered tool, and input hash.
5. Return `ApprovalRequiredError` without invoking the handler.
6. Let a trusted application reviewer approve the request.
7. Retry the same call with the approval id.
8. Validate all required approvals and consume them atomically.
9. Invoke the handler with the authorized detached input.

If the run, tool, or input changes, the approval does not match. If the approval was already consumed, it cannot authorize another execution.

## Runnable Example

The following example uses a fake publisher so it has no external side effect. It demonstrates an approval request, a rejected changed input, one successful exact call, and a rejected replay.

```js
import assert from "node:assert/strict";
import {
  ApprovalQueue,
  ApprovalRequiredError,
  PolicyEngine,
  ToolGateway
} from "maqam";

const approvals = new ApprovalQueue();
const policy = new PolicyEngine({
  allowedTools: ["publisher"],
  allowedOrigins: ["https://registry.npmjs.org"],
  approvalRequiredEffects: ["publish"]
});
const gateway = new ToolGateway({
  policyEngine: policy,
  approvalQueue: approvals
});

const executions = [];
gateway.registerTool("publisher", async (input) => {
  executions.push(input);
  return { published: input.version };
}, { effects: ["publish"] });

const input = {
  packageName: "example-package",
  version: "1.2.3",
  registry: "https://registry.npmjs.org/",
  artifactIntegrity: "sha512:reviewed-example"
};
const context = { runId: "release_42" };

let request;
try {
  await gateway.call("publisher", input, context);
  assert.fail("The handler must not run before approval.");
} catch (error) {
  assert.ok(error instanceof ApprovalRequiredError);
  request = error.details.approvalRequests[0];
}

assert.equal(executions.length, 0);
approvals.approve(request.approvalId, { decidedBy: "release-owner" });

// The approved record cannot authorize a changed version.
await assert.rejects(
  gateway.call("publisher", { ...input, version: "1.2.4" }, {
    ...context,
    approvalId: request.approvalId
  }),
  (error) => error.code === "APPROVAL_SCOPE_MISMATCH"
);

// The exact approved call executes once.
const result = await gateway.call("publisher", input, {
  ...context,
  approvalId: request.approvalId
});
assert.deepEqual(result, { published: "1.2.3" });
assert.equal(executions.length, 1);

// The consumed record cannot be replayed.
await assert.rejects(
  gateway.call("publisher", input, {
    ...context,
    approvalId: request.approvalId
  }),
  (error) => error.code === "APPROVAL_INVALID"
);
```

In a real application, `decidedBy` must come from the authenticated reviewer context. Do not accept it from the agent, tool input, query string, or an unsigned client payload.

## Why The Execution Snapshot Matters

Hash comparison is insufficient if the handler later receives the original mutable object.

Consider this sequence:

```js
const input = { environment: "staging" };
const call = governedCall(input);
input.environment = "production";
await call;
```

If policy hashed `staging` but the handler reads the caller object after the mutation, the audit record and execution disagree. Freezing only the outer object is also insufficient when nested values remain caller-owned.

Maqam validates and detaches the governed JSON value, then uses that snapshot across policy, approval, and execution. This addresses mutation at the gateway boundary. It does not guarantee that the handler interprets fields correctly or that a remote service honors them.

## Tool Effects Are Part Of The Policy Model

A tool name alone is often too coarse. The same connector may read a repository, write a file, and publish a release. Maqam tools can declare effects such as `read`, `write`, or `publish`, and policy can require approval for selected effects.

Handler-declared effects are treated as a minimum authority set. Registration metadata can add effects or raise recognized risk, but it cannot remove an effect declared by the handler. This prevents an integration layer from relabeling a write-capable handler as read-only after registration.

Effects are still application vocabulary. Maqam does not inspect arbitrary handler code and discover its real side effects. The adapter author must declare them accurately, and the underlying credential should remain least-privileged.

## Multiple Required Approvals

Some calls require more than one decision—for example, approval of a sensitive tool plus approval of its `publish` effect. Consuming records one at a time creates an awkward failure mode: the first decision may be spent before the application discovers that the second is missing or invalid.

Maqam validates the required set before committing consumption. If the set cannot authorize the call, the valid records are not partially consumed. This provides atomicity inside one `ApprovalQueue` instance; it is not a distributed transaction across an external reviewer database and a remote side effect.

## Evidence Is A Separate Question

Approval answers whether a configured action may execute. Evidence answers what recorded sources support a later claim. Conflating them makes both concepts weaker.

Maqam's `EvidenceLedger` can record:

- source type and location;
- a source excerpt;
- a computed content hash;
- run, task, and tool attribution;
- confidence metadata; and
- claims that cite evidence ids from the same run.

Scoped evidence capabilities prevent a handler from choosing trusted attribution fields or accessing the raw ledger. Batch insertion validates the entire evidence-and-claim set before committing it.

This is provenance, not truth verification. A hash shows that recorded content has a particular digest. A claim link shows that the workflow cites a record. Neither establishes that the source is reliable or that the claim follows semantically from it. Human review, domain validation, and evaluation remain necessary.

## What The Boundary Prevents, Records, And Leaves To The Host

| Concern | Maqam boundary | Host or deployment responsibility |
| --- | --- | --- |
| Disallowed registered tool | Deny before handler execution | Configure accurate policy and prevent bypass paths |
| Changed approved input | Reject mismatched approval | Render every authority-bearing field for the reviewer |
| Approval replay | Consume once by default | Durable concurrency control after external persistence is added |
| Caller mutation | Execute detached governed input | Ensure remote service and handler honor the input |
| Tool/effect downgrade | Preserve handler minimum effects | Declare real effects and use least-privilege credentials |
| Reviewer identity | Store supplied decision metadata | Authenticate and authorize the reviewer |
| Restored approval integrity | Structurally validate JSON | Use trusted, integrity-protected or signed storage |
| Provider-internal actions | Record normalized provider events where exposed | Provider permissions, sandbox, container, VM, and egress policy |
| Claim provenance | Hash evidence and link same-run records | Source trust and semantic/factual evaluation |
| Restart-safe state | Export in-process state | Durable store, locking, recovery, and migration |

## Bypass Is Still Bypass

No application library can govern a process that does not call it.

If an agent has direct access to `child_process`, a cloud SDK, a deployment credential, or a network endpoint outside the registered gateway, Maqam cannot intercept that path. Similarly, a command-line agent can perform internal file or shell actions according to its provider sandbox and permission configuration; Maqam sees only the adapter boundary and the provider events that are exposed.

Use defense in depth:

- remove direct credentials from the agent environment;
- expose narrow registered tools instead of general shells;
- use provider read-only or plan defaults;
- isolate high-risk workers in containers or virtual machines;
- enforce network egress separately;
- use service-side authorization and idempotency; and
- verify the external outcome after execution.

Maqam is one layer in that design.

## In-Process State Is Not Durable Governance

Current Maqam approvals, traces, runtime state, and evidence live in process. `toJSON()` and restore APIs make host persistence possible, but serialization does not authenticate a decision and does not make concurrent consumption safe across processes.

A production persistence layer must define:

- reviewer identity and authorization;
- an authenticated or integrity-protected record format;
- compare-and-swap or transaction semantics for one-use consumption;
- schema versions and migrations;
- crash recovery between consumption and side effect;
- retention, redaction, and deletion; and
- audit access controls.

Until those semantics exist, describe current Maqam as a local governance core, not a durable approval service.

## Tests That Matter

A serious approval boundary should test more than the happy path. Maqam's regression suite covers cases including:

- changed run, tool, or input;
- replay after consumption;
- atomic multi-approval failure;
- caller mutation before and during handler execution;
- accessors, proxies, prototype pollution, inherited fields, and symbol keys;
- effect and risk metadata downgrade attempts;
- malformed or unauthenticated restored structures;
- cancellation, timeouts, provider-stream truncation, and output limits;
- evidence attribution forgery and partial batch insertion; and
- network redirects, DNS answers, private addresses, Host values, and browser origins.

Those tests are evidence for the cases and environments executed. They are not proof of absence of defects, and they do not validate an application's external reviewer identity, connector implementation, or deployment controls.

## A Practical Adoption Sequence

1. Identify one high-risk action with a stable structured input.
2. Remove direct access to that action from the agent.
3. Register a narrow adapter with accurate effects.
4. Configure a deny-by-default tool and origin policy.
5. Display every authority-bearing input field to the reviewer.
6. Supply reviewer identity from authenticated application context.
7. Retry only the exact gateway-generated request after approval.
8. Verify the external outcome and record relevant evidence.
9. Add mismatch, replay, mutation, bypass, and failure tests.
10. Add durable storage only with explicit integrity and concurrency semantics.

Start with one consequential boundary. A smaller control that is actually enforced is more useful than a broad governance diagram that agents can bypass.

## Conclusion

"A human approved it" is incomplete unless the system can say what *it* was.

An exact approval receipt should identify the execution context, bind the reviewed payload, reject drift, and resist replay. It should also be honest about what remains outside the boundary: reviewer authentication, handler behavior, provider-internal actions, operating-system isolation, durable state, and semantic correctness.

That is the role Maqam is designed to play. It is not a universal agent framework or a proof system. It is a focused TypeScript control boundary for applications that need a stronger connection between policy, approval, execution, and evidence.

## Publication Notes

- Suggested title: **Your Agent Approval May Not Authorize The Input That Actually Executes**
- Suggested subtitle: **How exact, one-use receipts close the gap between a review screen and an agent tool call**
- Suggested tags: `typescript`, `security`, `agents`, `opensource`
- Repository: <https://github.com/AjnasNB/maqam>
- npm: <https://www.npmjs.com/package/maqam>
- Detailed comparison: <https://github.com/AjnasNB/maqam/blob/main/docs/comparison.md>
- Security boundary: <https://github.com/AjnasNB/maqam/blob/main/SECURITY.md>
