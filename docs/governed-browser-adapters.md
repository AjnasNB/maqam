# Governed browser adapters

Maqam can place four structural browser operations behind `ToolGateway` without bundling a browser engine, model, login flow, profile reader, or credential store:

| Tool | Contract | Effects | Default risk |
| --- | --- | --- | --- |
| `browser.observe` | Read one exact page revision as a bounded accessibility-oriented element list | `browser:read` | low |
| `browser.preview` | Validate one structural apply or submit plan without changing the page | `browser:read` | low |
| `browser.apply` | Apply field-state operations, then re-observe the resulting revision | `browser:write`, `browser:apply`, `network:write` | high |
| `browser.submit` | Perform one commit/navigation operation, then re-observe the resulting page | `browser:write`, `browser:submit`, `network:write` | critical |

The implementation is an independent adapter contract. It does not incorporate a third-party browser-agent runtime or its API. The application supplies and remains responsible for the browser driver.

## Safe registration

Every origin and write-approval effect is explicit. Do not use `allowAllOrigins` for this adapter.

```js
import {
  ApprovalQueue,
  PolicyEngine,
  ToolGateway,
  registerGovernedBrowserTools
} from "maqam";

const allowedOrigins = ["https://admin.example"];
const approvalQueue = new ApprovalQueue();
const gateway = new ToolGateway({
  approvalQueue,
  policyEngine: new PolicyEngine({
    allowedTools: [
      "browser.observe",
      "browser.preview",
      "browser.apply",
      "browser.submit"
    ],
    allowedOrigins,
    approvalRequiredEffects: ["browser:apply", "browser:submit"]
  })
});

registerGovernedBrowserTools(gateway, {
  allowedOrigins,
  driver: {
    // Supply own enumerable data functions. Bind class methods explicitly.
    async observe(request, execution) {
      // Read only. Return the exact requested target and bounded elements.
    },
    async preview(request, execution) {
      // Read only. Validate availability, target revision, and operations.
      // Return the same target, phase, and operations with schemaVersion.
    },
    async apply(request, execution) {
      // Do not retry automatically. Deduplicate request.operationId.
      // Block every execution.prohibitedEffects entry before dispatch.
      // Return { operationId, target: resultingTarget, effects: allFalseEffects }.
    },
    async submit(request, execution) {
      // Do not retry automatically. Enforce execution.authorizedOrigins.
      // Block every execution.prohibitedEffects entry before dispatch.
      // Return { operationId, target: resultingTarget, effects: allFalseEffects }.
    }
  }
});
```

The registration result and each tool's `browserAdapter` metadata publish the frozen prohibited-effect list for inspection. The driver receives the same list in a frozen, informational execution view containing the run, tool, canonical input hash, consumed approval identities/actions, the exact origins named by that request, and an optional abort signal. It does not receive a raw gateway context, approval queue, browser credential, or reusable authority token.

## Observe and preview

A target always names the exact session, page, canonical HTTP(S) origin, and driver-defined revision:

```js
const target = {
  sessionId: "session-1",
  pageId: "page-1",
  origin: "https://admin.example",
  revision: "revision-42"
};

const observation = await gateway.call("browser.observe", {
  target,
  maxElements: 100
});
```

Observations contain only `elementId`, accessibility `role`/`name`, and boolean state. They do not contain raw HTML, selectors, scripts, cookies, credentials, or form values; URL query values and fragments are redacted. `valuePresent` can report presence without revealing a value. Element IDs are opaque driver references, not CSS or XPath selectors.

`limits.maxTextChars` bounds the aggregate normalized observation text. It does not truncate or invalidate structural plan fields, plan hashes, or authenticity tokens; those have separate fixed bounds.

Preview accepts structural operations only. Natural-language interpretation, if any, happens outside this adapter and cannot become policy authority.

```js
const plan = await gateway.call("browser.preview", {
  target,
  phase: "apply",
  operations: [
    {
      kind: "setValueRef",
      elementId: "display-name",
      valueRef: "ref:profile.display-name"
    }
  ]
});
```

`valueRef` is an opaque `ref:`-prefixed reference resolved by the host driver or its vault. Raw form values are deliberately not accepted. The returned plan carries a SHA-256 `planHash` over its canonical target, phase, and operations plus an opaque HMAC `planToken`. The digest is tamper evidence, not authority. The token proves that the same adapter instance issued this plan for the same run after a successful driver preview.

## Apply and submit

`browser.apply` accepts only `setValueRef`, `selectOption`, and `setChecked`. It is still a browser and network write: modern applications can autosave or trigger requests when a field changes.

`browser.submit` accepts exactly one `activate`, `submitForm`, or `navigate` operation. Every submit operation declares `expectedOrigin` and whether it opens a new page. A new page receives a new explicit `pageId`; there is no ambient "current tab."

For either write:

1. `ToolGateway` canonicalizes and hashes the full plan and `operationId`.
2. Policy evaluates the registered effects, explicit origin scope, and configured limits.
3. The trusted internal guarded-tool validator authenticates the same-run plan token before an approval is requested or consumed.
4. Policy requests the phase-specific approval, and the exact run/tool/input approval is consumed atomically.
5. The adapter authenticates the live gateway dispatch through its private verifier and verifies the token again.
6. The driver blocks every `execution.prohibitedEffects` entry, executes once, and returns the resulting target plus an explicit all-false effects record.
7. The adapter validates that record, calls `observe`, and returns the bounded post-action observation.

An invalid plan hash, stale target, altered approval input, missing phase-specific approval, unauthorized origin, malformed driver result, or aborted signal fails closed before the corresponding driver dispatch whenever the condition is knowable in advance. An approval is consumed before a driver call; a failed driver call does not restore it.

## Trust boundary

- Only calls routed through these four registered tools are governed. A host that retains and directly calls its raw browser driver is outside Maqam's boundary.
- `authorizedOrigins` contains only origins named by the exact observe/preview/apply/submit request after intersection with adapter configuration and policy scope. It never grants every otherwise permitted origin to one driver call.
- The driver must enforce `authorizedOrigins`, revalidate the target revision, and block external protocols, downloads, filesystem reads and writes, file pickers, clipboard reads and writes, permission prompts, print dialogs, and modal dialogs before dispatch. Those effects are deliberately not modeled as browser operations.
- Apply and submit results must include an explicit all-false `effects` record for every prohibited effect. Maqam rejects missing, true, accessor-backed, or extra effect fields. This is a host-driver attestation checked after dispatch, not proof that an untrusted driver told the truth; output validation cannot undo a side effect.
- Preview authenticity proves that this adapter observed the proposal; it does not prove a proprietary driver rechecked a later DOM. The host remains responsible for redirects, form actions, and new-page creation inside the exact request scope.
- `observe` and `preview` are read-only contracts. Maqam cannot inspect a proprietary driver to prove that it honors them.
- Page content, accessibility names, and driver errors are untrusted data, never instructions or approval.
- Write methods must not retry automatically. The host must deduplicate `operationId` and surface an indeterminate result when it cannot prove whether a side effect occurred.
- Navigation rejects sensitive parameter names and recognized secret/token patterns in decoded path, query values, and fragments. Pattern checks are defense in depth, not a general secret detector.
- Plan tokens use an in-memory per-adapter key. They intentionally fail after process restart and cannot move to another worker. V1 is for an immediate same-process preview-to-write flow, not durable pause/resume or horizontally distributed approval routing. A future host may supply a reviewed durable signer/replay store through a separate contract.
- The adapter never discovers browser profiles, imports cookies, logs in, bypasses anti-bot controls, solves challenges, or stores secrets.

## Optional Page Agent bridge

[Alibaba Page Agent](https://github.com/alibaba/page-agent) can be evaluated as one independently installed host-side DOM controller. Maqam does not vendor its code, extension, prompts, model client, or MCP server, and Page Agent is not required by this package.

Do not register a broad `execute(naturalLanguageTask)` call as the approved write. A safe bridge separates responsibilities:

1. Page Agent or another host controller observes the current page and proposes bounded structural operations.
2. The host maps those operations to `browser.preview` without raw field values, selectors, scripts, cookies, or credentials.
3. Maqam binds review to the exact target revision, origin, operation list, plan hash, and one-use operation ID.
4. The host resolves any approved `valueRef` inside its trusted process and calls `browser.apply` or `browser.submit` exactly once.
5. The driver re-observes the resulting page and returns the structural receipt through Maqam.

The same split supports an embedded SaaS copilot, form filling, accessibility commands, a multi-page extension, or an MCP-facing browser host. The host remains responsible for model credentials, local-model configuration, extension permissions, page-agent compatibility, CORS, tab ownership, credential isolation, and origin enforcement. Maqam supplies the governed operation boundary; it does not turn an upstream beta MCP bridge or browser extension into a production security boundary.
