import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "../framework/boundary.js";

const ADAPTER_KEYS = new Set([
  "id", "channel", "toolName", "label", "priority", "authentication", "capabilities",
  "metadata", "read", "check"
]);
const AUTHENTICATION_MODES = new Set(["none", "required"]);
const MAX_IDENTIFIER_LENGTH = 200;
const MAX_LABEL_LENGTH = 10_000;
const MAX_CAPABILITIES = 1_000;
const MAX_PRIORITY = 1_000_000;
const DEFINED_ADAPTERS = new WeakSet();

function snapshotJsonObject(value, options) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${options.label} must be a plain JSON object.`);
  }
  return snapshotJsonValue(value, options);
}

function boundedString(value, label, maximumLength) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  if (value.length > maximumLength) {
    throw new TypeError(`${label} cannot exceed ${maximumLength} characters.`);
  }
  return value;
}

export function researchSourceIdentifier(value, label = "Research source identifier") {
  value = boundedString(value, label, MAX_IDENTIFIER_LENGTH);
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i.test(value)) {
    throw new TypeError(`${label} must contain only letters, numbers, dots, underscores, or hyphens.`);
  }
  return value;
}

function normalizeCapabilities(value) {
  const capabilities = snapshotOwnDataArray(value, {
    label: "Research source adapter capabilities",
    maximumLength: MAX_CAPABILITIES
  });
  const observed = new Set();
  for (let index = 0; index < capabilities.length; index += 1) {
    capabilities[index] = researchSourceIdentifier(
      capabilities[index],
      `Research source adapter capabilities[${index}]`
    );
    if (observed.has(capabilities[index])) {
      throw new TypeError(`Research source adapter capability '${capabilities[index]}' is duplicated.`);
    }
    observed.add(capabilities[index]);
  }
  return capabilities;
}

function immutableAdapter(properties) {
  const adapter = Object.create(null);
  for (const [key, value] of Object.entries(properties)) {
    Object.defineProperty(adapter, key, {
      value,
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
  DEFINED_ADAPTERS.add(adapter);
  return Object.freeze(adapter);
}

/**
 * Define one source backend. There is deliberately no command, shell, cookie,
 * or implicit-login field: process and authentication behavior must remain in
 * explicit adapter code reviewed by the host application.
 */
export function defineResearchSourceAdapter(value) {
  if (DEFINED_ADAPTERS.has(value)) return value;
  const input = snapshotOwnDataRecord(value, {
    label: "Research source adapter",
    recognizedKeys: ADAPTER_KEYS
  });
  for (const key of ["id", "channel", "toolName"]) {
    if (!Object.hasOwn(input, key)) throw new TypeError(`Research source adapter requires ${key}.`);
  }
  if (input.read !== undefined && typeof input.read !== "function") {
    throw new TypeError("Research source adapter read must be a function when provided.");
  }
  if (input.check !== undefined && typeof input.check !== "function") {
    throw new TypeError("Research source adapter check must be a function when provided.");
  }

  const priority = input.priority === undefined ? 100 : input.priority;
  if (!Number.isSafeInteger(priority) || priority < 0 || priority > MAX_PRIORITY) {
    throw new TypeError(`Research source adapter priority must be a safe integer between 0 and ${MAX_PRIORITY}.`);
  }
  const authentication = input.authentication === undefined ? "none" : input.authentication;
  if (!AUTHENTICATION_MODES.has(authentication)) {
    throw new TypeError("Research source adapter authentication must be 'none' or 'required'.");
  }

  const id = researchSourceIdentifier(input.id, "Research source adapter id");
  const channel = researchSourceIdentifier(input.channel, "Research source adapter channel");
  const toolName = researchSourceIdentifier(input.toolName, "Research source adapter toolName");
  const metadata = snapshotJsonObject(input.metadata === undefined ? {} : input.metadata, {
    label: "Research source adapter metadata",
    maximumDepth: 30,
    maximumNodes: 100_000,
    maximumCollectionSize: 10_000,
    maximumStringLength: 1_000_000,
    allowNullPrototype: true,
    freeze: true
  });

  return immutableAdapter({
    id,
    channel,
    toolName,
    label: input.label === undefined
      ? id
      : boundedString(input.label, "Research source adapter label", MAX_LABEL_LENGTH),
    priority,
    authentication,
    capabilities: Object.freeze(normalizeCapabilities(
      input.capabilities === undefined ? [] : input.capabilities
    )),
    metadata,
    read: input.read ?? null,
    check: input.check ?? null
  });
}

export function isResearchSourceAdapter(value) {
  return DEFINED_ADAPTERS.has(value);
}

export function describeResearchSourceAdapter(value) {
  const adapter = defineResearchSourceAdapter(value);
  return snapshotJsonValue({
    id: adapter.id,
    channel: adapter.channel,
    toolName: adapter.toolName,
    label: adapter.label,
    priority: adapter.priority,
    authentication: adapter.authentication,
    capabilities: adapter.capabilities,
    metadata: adapter.metadata,
    directRead: adapter.read === null ? "unavailable" : "explicitly-ungoverned-only",
    check: adapter.check === null ? "unavailable" : "host-supplied"
  }, {
    label: "Research source adapter description",
    allowNullPrototype: true,
    freeze: true,
    rejectRepeatedReferences: false
  });
}

export const RESEARCH_SOURCE_AUTHENTICATION_MODES = Object.freeze([...AUTHENTICATION_MODES]);
