import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./boundary.js";
import { PolicyEngine } from "./policy.js";
import { ToolGateway } from "./tool-gateway.js";

const ADAPTER_SCHEMA_VERSION = "maqam.tool-adapter.v1";
const CONFORMANCE_SCHEMA_VERSION = "maqam.tool-adapter-conformance.v1";
const ADAPTER_KEYS = new Set([
  "schemaVersion", "name", "transport", "description", "effects", "risk",
  "metadata", "invoke"
]);
const CONFORMANCE_OPTION_KEYS = new Set(["input", "context", "verifyOutput"]);
const CONFORMANCE_CONTEXT_KEYS = new Set([
  "runId", "taskId", "goal", "limits", "signal", "authorizedOrigins",
  "authorizationScope", "approvalId", "approvalIds", "requestedBy",
  "approvalEvidence"
]);
const TRANSPORTS = new Set(["function", "sdk", "http", "mcp", "custom"]);
const RESERVED_METADATA_KEYS = new Set(["adapter", "effects", "risk"]);
const MAX_TEXT_LENGTH = 10_000;
const MAX_EFFECTS = 10_000;

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "" || value.length > MAX_TEXT_LENGTH) {
    throw new TypeError(`${label} must be a non-empty string no longer than ${MAX_TEXT_LENGTH} characters.`);
  }
  if (value !== value.trim()) {
    throw new TypeError(`${label} must not contain leading or trailing whitespace.`);
  }
  return value;
}

function normalizeEffects(value) {
  const effects = snapshotOwnDataArray(value, {
    label: "Tool adapter effects",
    maximumLength: MAX_EFFECTS
  });
  const unique = [];
  const seen = new Set();
  for (let index = 0; index < effects.length; index += 1) {
    const effect = requiredString(effects[index], `Tool adapter effects[${index}]`);
    if (!seen.has(effect)) {
      seen.add(effect);
      unique.push(effect);
    }
  }
  return Object.freeze(unique);
}

function normalizeMetadata(value = {}) {
  const metadata = snapshotJsonValue(value, {
    label: "Tool adapter metadata",
    allowNullPrototype: true,
    freeze: true
  });
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new TypeError("Tool adapter metadata must be a plain JSON object.");
  }
  return metadata;
}

function validateInvokeGovernance(invoke) {
  const governanceDescriptor = Object.getOwnPropertyDescriptor(invoke, "governance");
  if (!governanceDescriptor && "governance" in invoke) {
    throw new TypeError("Tool adapter invoke governance must be an own data property.");
  }
  if (!governanceDescriptor) return null;
  if (!Object.hasOwn(governanceDescriptor, "value")) {
    throw new TypeError("Tool adapter invoke governance must be a data property.");
  }

  const governance = governanceDescriptor.value;
  if (!governance || typeof governance !== "object" || Array.isArray(governance)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(governance))) {
    throw new TypeError("Tool adapter invoke governance must be a plain object.");
  }
  for (const key of ["effects", "risk"]) {
    if (!Object.hasOwn(governance, key) && key in governance) {
      throw new TypeError(`Inherited tool adapter invoke governance field '${key}' is not allowed.`);
    }
  }

  const effectsDescriptor = Object.getOwnPropertyDescriptor(governance, "effects");
  if (effectsDescriptor) {
    if (!effectsDescriptor.enumerable || !Object.hasOwn(effectsDescriptor, "value")) {
      throw new TypeError("Tool adapter invoke governance.effects must be an enumerable data property.");
    }
    normalizeEffects(effectsDescriptor.value);
  }
  const riskDescriptor = Object.getOwnPropertyDescriptor(governance, "risk");
  if (riskDescriptor) {
    if (!riskDescriptor.enumerable || !Object.hasOwn(riskDescriptor, "value")) {
      throw new TypeError("Tool adapter invoke governance.risk must be an enumerable data property.");
    }
    if (riskDescriptor.value !== undefined) {
      requiredString(riskDescriptor.value, "Tool adapter invoke governance.risk");
    }
  }
  return governanceDescriptor;
}

function dataFunction(value, key, label) {
  let current = value;
  while (current
    && current !== Object.prototype
    && current !== Function.prototype
    && (typeof current === "object" || typeof current === "function")) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      if (!Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "function") {
        throw new TypeError(`${label}.${key} must be a data function.`);
      }
      return descriptor.value.bind(value);
    }
    current = Object.getPrototypeOf(current);
  }
  throw new TypeError(`${label}.${key} must be a function.`);
}

function isDeepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, "value")
      && !isDeepFrozen(descriptor.value, seen)) return false;
  }
  return true;
}

function sameStrings(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((entry, index) => entry === right[index]);
}

function errorIdentity(error) {
  if (!error) return null;
  const dataString = (key, fallback) => {
    let current = error;
    try {
      while (current
        && current !== Object.prototype
        && current !== Function.prototype
        && (typeof current === "object" || typeof current === "function")) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (descriptor) {
          return Object.hasOwn(descriptor, "value")
            && typeof descriptor.value === "string"
            && descriptor.value
            ? descriptor.value
            : fallback;
        }
        current = Object.getPrototypeOf(current);
      }
    } catch {
      return fallback;
    }
    return fallback;
  };
  return {
    name: dataString("name", "Error"),
    code: dataString("code", null)
  };
}

/**
 * Define a host-supplied adapter that can be registered at a ToolGateway.
 * The transport value is descriptive: Maqam does not create a client,
 * authenticate it, discover remote tools, or validate a wire protocol.
 */
export function defineToolAdapter(spec) {
  spec = snapshotOwnDataRecord(spec, {
    label: "Tool adapter",
    recognizedKeys: ADAPTER_KEYS
  });
  if (spec.schemaVersion !== undefined && spec.schemaVersion !== ADAPTER_SCHEMA_VERSION) {
    throw new TypeError(`Tool adapter schemaVersion must be '${ADAPTER_SCHEMA_VERSION}'.`);
  }
  const name = requiredString(spec.name, "Tool adapter name");
  const transport = requiredString(spec.transport, "Tool adapter transport");
  if (!TRANSPORTS.has(transport)) {
    throw new TypeError(`Tool adapter transport must be one of: ${[...TRANSPORTS].join(", ")}.`);
  }
  const description = requiredString(spec.description, "Tool adapter description");
  if (spec.effects === undefined) {
    throw new TypeError("Tool adapter effects must be an explicit array; use [] for a pure adapter.");
  }
  const effects = normalizeEffects(spec.effects);
  const risk = requiredString(spec.risk, "Tool adapter risk");
  if (typeof spec.invoke !== "function") {
    throw new TypeError("Tool adapter invoke must be an own function; bind class methods explicitly.");
  }
  validateInvokeGovernance(spec.invoke);
  const suppliedMetadata = normalizeMetadata(spec.metadata);
  for (const key of RESERVED_METADATA_KEYS) {
    if (Object.hasOwn(suppliedMetadata, key)) {
      const normalizedDescriptor = spec.schemaVersion === ADAPTER_SCHEMA_VERSION
        && suppliedMetadata.adapter?.schemaVersion === ADAPTER_SCHEMA_VERSION
        && suppliedMetadata.adapter?.name === name
        && suppliedMetadata.adapter?.transport === transport
        && suppliedMetadata.adapter?.description === description
        && sameStrings(suppliedMetadata.effects, effects)
        && suppliedMetadata.risk === risk;
      if (!normalizedDescriptor) {
        throw new TypeError(`Tool adapter metadata cannot redefine reserved field '${key}'.`);
      }
    }
  }
  const extraMetadata = Object.create(null);
  for (const [key, value] of Object.entries(suppliedMetadata)) {
    extraMetadata[key] = value;
  }
  const metadata = snapshotJsonValue({
    ...extraMetadata,
    adapter: {
      schemaVersion: ADAPTER_SCHEMA_VERSION,
      name,
      transport,
      description
    },
    effects: [...effects],
    risk
  }, {
    label: "Tool adapter gateway metadata",
    allowNullPrototype: true,
    freeze: true
  });

  return Object.freeze({
    schemaVersion: ADAPTER_SCHEMA_VERSION,
    name,
    transport,
    description,
    effects,
    risk,
    metadata,
    invoke: spec.invoke
  });
}

/** Register one static adapter name at a ToolGateway. */
export function registerToolAdapter(gateway, adapter) {
  if (!gateway || (typeof gateway !== "object" && typeof gateway !== "function")) {
    throw new TypeError("registerToolAdapter requires a ToolGateway-compatible object.");
  }
  const register = dataFunction(gateway, "registerTool", "ToolGateway-compatible object");
  const normalized = defineToolAdapter(adapter);
  // Register the original function so ToolGateway can inspect and merge its
  // own non-downgradable `governance` descriptor. Wrapping here would erase
  // that descriptor and could understate effects or risk.
  register(normalized.name, normalized.invoke, normalized.metadata);
  return gateway;
}

/**
 * Exercise an adapter once through an isolated allowlisted ToolGateway.
 * Use a fixture or sandbox: this function invokes the supplied adapter.
 */
export async function runToolAdapterConformance(adapter, options = {}) {
  const normalized = defineToolAdapter(adapter);
  options = snapshotOwnDataRecord(options, {
    label: "Tool adapter conformance options",
    recognizedKeys: CONFORMANCE_OPTION_KEYS
  });
  if (options.verifyOutput !== undefined && typeof options.verifyOutput !== "function") {
    throw new TypeError("Tool adapter conformance verifyOutput must be a function.");
  }
  const context = snapshotOwnDataRecord(options.context || {}, {
    label: "Tool adapter conformance context",
    recognizedKeys: CONFORMANCE_CONTEXT_KEYS,
    rejectUnknown: false
  });

  let invocationCount = 0;
  let receivedFrozenInput = false;
  let receivedAdapterMetadata = false;
  const observedInvoke = async (input, context) => {
    invocationCount += 1;
    receivedFrozenInput = isDeepFrozen(input);
    receivedAdapterMetadata = context?.toolMetadata?.adapter?.schemaVersion === ADAPTER_SCHEMA_VERSION
      && context.toolMetadata.adapter.name === normalized.name
      && context.toolMetadata.adapter.transport === normalized.transport
      && context.toolMetadata.risk === normalized.risk
      && sameStrings(context.toolMetadata.effects, normalized.effects);
    return normalized.invoke(input, context);
  };
  const governanceDescriptor = validateInvokeGovernance(normalized.invoke);
  if (governanceDescriptor) {
    Object.defineProperty(observedInvoke, "governance", governanceDescriptor);
  }
  const observed = defineToolAdapter({
    ...normalized,
    invoke: observedInvoke
  });

  const gateway = new ToolGateway({
    policyEngine: new PolicyEngine({
      allowedTools: [normalized.name],
      allowAllOrigins: true,
      maxToolCalls: 1
    })
  });
  registerToolAdapter(gateway, observed);

  let output;
  let callError = null;
  try {
    output = await gateway.call(normalized.name, options.input === undefined ? {} : options.input, {
      ...context,
      runId: context.runId === undefined ? "adapter_conformance" : context.runId
    });
  } catch (error) {
    callError = error;
  }

  let outputStatus = "skipped";
  let verifierError = null;
  if (!callError && options.verifyOutput) {
    try {
      outputStatus = await options.verifyOutput(output) === true ? "passed" : "failed";
    } catch (error) {
      outputStatus = "failed";
      verifierError = error;
    }
  }

  const trace = gateway.trace[0] || null;
  const checks = [
    { id: "registered", status: "passed" },
    { id: "policy_routed", status: trace?.decision?.status === "allow" ? "passed" : "failed" },
    { id: "invoked_once", status: invocationCount === 1 ? "passed" : "failed" },
    { id: "canonical_input_frozen", status: receivedFrozenInput ? "passed" : "failed" },
    { id: "adapter_metadata_forwarded", status: receivedAdapterMetadata ? "passed" : "failed" },
    { id: "trace_completed", status: trace?.status === "completed" ? "passed" : "failed" },
    { id: "output_verified", status: outputStatus }
  ];
  const passed = checks.every((check) => check.status !== "failed");

  return snapshotJsonValue({
    schemaVersion: CONFORMANCE_SCHEMA_VERSION,
    adapter: {
      schemaVersion: normalized.schemaVersion,
      name: normalized.name,
      transport: normalized.transport,
      description: normalized.description,
      effects: [...normalized.effects],
      risk: normalized.risk
    },
    passed,
    checks,
    traceStatus: trace?.status || null,
    error: errorIdentity(callError || verifierError),
    limitations: [
      "This probe exercises one configured invocation; it is not a protocol certification or production SLA.",
      "The host still owns transport authentication, secret handling, retries, rate limits, and network security.",
      "Only calls routed through the registered ToolGateway adapter are governed."
    ]
  }, {
    label: "Tool adapter conformance report",
    allowNullPrototype: true,
    freeze: true
  });
}

export {
  ADAPTER_SCHEMA_VERSION as TOOL_ADAPTER_SCHEMA_VERSION,
  CONFORMANCE_SCHEMA_VERSION as TOOL_ADAPTER_CONFORMANCE_SCHEMA_VERSION
};
