import {
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./boundary.js";
import { createScopedEvidenceFacade } from "./evidence-scope.js";

const AGENT_OPTION_KEYS = new Set(["name"]);
const RUNNER_KEYS = ["run", "invoke", "call"];
const EVIDENCE_INPUT_KEYS = new Set([
  "evidenceId", "runId", "taskId", "sourceType", "source", "retrievedAt",
  "excerpt", "hash", "tool", "confidence"
]);
const CLAIM_INPUT_KEYS = new Set([
  "claimId", "runId", "taskId", "text", "evidenceIds", "confidence"
]);
const MAX_AGENT_RECORDS = 10_000;

function ownDataValue(value, key, label) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) {
    if (key in value) throw new TypeError(`Inherited ${label} field '${key}' is not allowed.`);
    return undefined;
  }
  if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
    throw new TypeError(`${label} field '${key}' must be an own enumerable data property.`);
  }
  return descriptor.value;
}

function copyContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(context))) {
    throw new TypeError("Agent tool context must be a plain object.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(context);
  const snapshot = Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") throw new TypeError("Agent tool context cannot contain symbol fields.");
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`Agent tool context field '${key}' must be an own enumerable data property.`);
    }
    Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return snapshot;
}

function resolveAgentInvoker(agent) {
  if (typeof agent === "function") return agent;
  if (!agent || typeof agent !== "object" || Array.isArray(agent)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(agent))) {
    throw new TypeError(
      "createAgentTool requires a function or a plain object with an own run, invoke, or call method; bind class methods explicitly."
    );
  }

  let selected = null;
  for (const key of RUNNER_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(agent, key);
    if (!descriptor) {
      if (key in agent) {
        throw new TypeError(`Inherited agent runner '${key}' is not allowed; bind it explicitly.`);
      }
      continue;
    }
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`Agent runner '${key}' must be an own enumerable data property.`);
    }
    if (typeof descriptor.value !== "function") {
      throw new TypeError(`Agent runner '${key}' must be a function.`);
    }
    if (!selected) selected = descriptor.value.bind(agent);
  }
  if (selected) return selected;
  throw new TypeError("createAgentTool requires a function agent or an object with run, invoke, or call as an own method.");
}

function agentNameFrom(agent, configuredName) {
  if (configuredName !== undefined) {
    if (typeof configuredName !== "string" || configuredName.trim() === "") {
      throw new TypeError("createAgentTool name must be a non-empty string.");
    }
    return configuredName;
  }
  if ((typeof agent === "function" || (agent && typeof agent === "object"))) {
    const descriptor = Object.getOwnPropertyDescriptor(agent, "name");
    if (descriptor) {
      if (!Object.hasOwn(descriptor, "value")) {
        throw new TypeError("Agent name must be an own data property.");
      }
      if (typeof descriptor.value === "string" && descriptor.value.trim() !== "") {
        return descriptor.value;
      }
    } else if ("name" in agent) {
      throw new TypeError("Inherited agent name is not allowed.");
    }
  }
  return "agent";
}

function scopeString(value, label, fallback, { nullable = false } = {}) {
  if (value === undefined) return fallback;
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be ${nullable ? "null or " : ""}a non-empty string.`);
  }
  return value;
}

function resultRecords(result, key, label, recognizedKeys) {
  if (!result || (typeof result !== "object" && typeof result !== "function")) return [];
  const value = ownDataValue(result, key, "Agent result");
  if (value === undefined) return [];
  const records = snapshotOwnDataArray(value, {
    label,
    maximumLength: MAX_AGENT_RECORDS
  });
  return records.map((record, index) => snapshotOwnDataRecord(record, {
    label: `${label}[${index}]`,
    recognizedKeys
  }));
}

function recordAgentEvidence(result, ledger) {
  if (!ledger) return;
  const evidence = resultRecords(
    result,
    "evidence",
    "Agent result evidence",
    EVIDENCE_INPUT_KEYS
  );
  const claims = resultRecords(
    result,
    "claims",
    "Agent result claims",
    CLAIM_INPUT_KEYS
  );
  if (evidence.length === 0 && claims.length === 0) return;
  ledger.addBatch({ evidence, claims });
}

export function createAgentTool(agent, options = {}) {
  options = snapshotOwnDataRecord(options, {
    label: "createAgentTool options",
    recognizedKeys: AGENT_OPTION_KEYS
  });
  const invoke = resolveAgentInvoker(agent);
  const agentName = agentNameFrom(agent, options.name);

  return async function agentTool(input = {}, context = {}) {
    const safeContext = copyContext(context);
    const rawLedger = ownDataValue(safeContext, "evidenceLedger", "Agent tool context")
      ?? ownDataValue(safeContext, "evidence", "Agent tool context");
    const runId = scopeString(
      ownDataValue(safeContext, "runId", "Agent tool context"),
      "Agent tool context.runId",
      "default"
    );
    const taskId = scopeString(
      ownDataValue(safeContext, "taskId", "Agent tool context"),
      "Agent tool context.taskId",
      null,
      { nullable: true }
    );
    const toolName = scopeString(
      ownDataValue(safeContext, "toolName", "Agent tool context"),
      "Agent tool context.toolName",
      agentName
    );
    const ledger = createScopedEvidenceFacade(rawLedger, { runId, taskId, toolName });
    safeContext.evidence = ledger;
    safeContext.evidenceLedger = ledger;
    safeContext.agentName = agentName;

    const result = await invoke(input, safeContext);
    recordAgentEvidence(result, ledger);
    return result;
  };
}
