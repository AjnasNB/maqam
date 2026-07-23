# Maqam Five-Minute Quickstart

This quickstart proves the exact-approval path locally. It needs a maintained Node.js 22, 24, or 26 release and does not need a model key, hosted account, browser, database, or external side effect.

Commands below target the exact `maqam@0.3.3` stable release. Confirm that `npm view maqam@0.3.3 version dist.integrity gitHead` returns the reviewed version, integrity, and commit and that the matching `v0.3.3` GitHub release identifies the same source.

## 1. Run The Built-In Proof

From any directory:

```bash
npx -y maqam@0.3.3 demo approval
```

Expected checkpoints:

```text
APPROVAL_REQUIRED
APPROVAL_SCOPE_MISMATCH
executions 0
COMPLETED
executions 1 | approval consumptions 1
APPROVAL_INVALID
ev_1 -> claim_1
unsupported claims 0
PASS
```

The command creates a temporary isolated workspace, performs one exact approved file write, verifies it, and removes the workspace. Add `--json` for the deterministic machine-readable report used by the launch video:

```bash
npx -y maqam@0.3.3 demo approval --json
```

## 2. Install In A Project

```bash
mkdir maqam-quickstart
cd maqam-quickstart
npm init -y
npm install maqam@0.3.3
```

Create `approval.mjs` with this local, side-effect-free example:

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
  approvalRequiredEffects: ["publish"]
});
const gateway = new ToolGateway({
  policyEngine: policy,
  approvalQueue: approvals
});

let executions = 0;
gateway.registerTool("publisher", async (input) => {
  executions += 1;
  return { published: input.version };
}, { effects: ["publish"] });

const input = { packageName: "demo", version: "1.0.0" };
const context = { runId: "release_1" };
let request;

try {
  await gateway.call("publisher", input, context);
  assert.fail("The handler must wait for approval.");
} catch (error) {
  assert.ok(error instanceof ApprovalRequiredError);
  request = error.details.approvalRequests[0];
}

assert.equal(executions, 0);
approvals.approve(request.approvalId, { decidedBy: "authenticated-owner" });

await assert.rejects(
  gateway.call("publisher", { ...input, version: "2.0.0" }, {
    ...context,
    approvalId: request.approvalId
  }),
  (error) => error.code === "APPROVAL_SCOPE_MISMATCH"
);
assert.equal(executions, 0);

const result = await gateway.call("publisher", input, {
  ...context,
  approvalId: request.approvalId
});
assert.deepEqual(result, { published: "1.0.0" });
assert.equal(executions, 1);

await assert.rejects(
  gateway.call("publisher", input, {
    ...context,
    approvalId: request.approvalId
  }),
  (error) => error.code === "APPROVAL_INVALID"
);

console.log("PASS: changed input blocked; exact call ran; replay blocked.");
```

Run it:

```bash
node approval.mjs
```

`decidedBy` is only an audit field in this local example. In production, the host must authenticate and authorize the reviewer; never take reviewer identity or an approval decision from agent-controlled input.

## 3. Connect A Real Tool Safely

Replace the fake handler only after defining:

- its minimum effects, such as `write`, `publish`, `send`, or `billing`;
- the tools and URL origins policy allows;
- which effects require approval;
- the exact input fields a reviewer must see;
- handler idempotency and recovery behavior;
- trusted storage and identity for approvals; and
- provider, operating-system, credential, and network boundaries outside Maqam.

Only calls routed through the registered `ToolGateway` path are governed. Evidence and claims must be explicitly recorded by the handler or workflow. Current approval, runtime, trace, and evidence state is in-process unless the host exports and protects it.

## 4. Try Governed Sources From The 0.3 Release Source

From a checkout matching the reviewed 0.3.0 release commit:

```bash
npm install
node examples/governed-sources.mjs
```

The example uses an offline RSS fixture, registers the RSS handler under its declared `toolName`, binds `ResearchSourceRegistry` to `ToolGateway.call`, routes one normalized document, and prints the gateway trace. It does not need a provider account or network request.

The important boundary is:

```text
ResearchSourceRegistry.route()
  -> bound ToolCaller
  -> ToolGateway.call(adapter.toolName, ...)
  -> policy / approval / trace
  -> registered source handler
```

`route()` fails closed if no caller is bound. `routeUngoverned()` is available only for an intentional direct integration and bypasses policy, approvals, call ceilings, and trace capture. Read [Governed Sources](governed-sources.md) before connecting a remote provider or credentials.

## Cleanup And Reset

The built-in approval demo removes its temporary workspace automatically and writes no Maqam state to your home directory.

For the scratch project:

```bash
npm uninstall maqam
cd ..
```

Then delete the `maqam-quickstart` directory with your normal file manager or platform command if you no longer need it.

If Maqam was installed globally:

```bash
npm uninstall -g maqam
```

Stop a running local console with `Ctrl+C`. The current console has no bundled durable database to reset. Do not delete or clear the shared npm cache as part of ordinary cleanup.

## Next

- [Why Maqam](why-maqam.md)
- [Complete usage guide](usage.md)
- [Coding-agent adapters](external-agents.md)
- [Governed Sources](governed-sources.md)
- [0.3 migration guide](migration-0.3.md)
- [Detailed comparison](comparison.md)
- [Security policy](../SECURITY.md)
