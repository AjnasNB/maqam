import { createHash } from "node:crypto";

const SENSITIVE_KEY = /(?:authorization|cookie|password|passwd|secret|credential|private[_-]?key|api[_-]?key|token|session[_-]?(?:id|key)|client[_-]?secret)/i;
const SECRET_PATTERNS = [
  /\bnpm_[A-Za-z0-9]{20,}\b/g,
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
];
const MAX_CANONICAL_DEPTH = 100;
const MAX_CANONICAL_NODES = 100_000;
const MAX_CANONICAL_COLLECTION_SIZE = 100_000;
const MAX_CANONICAL_STRING_LENGTH = 1_000_000;

function sanitizeUrl(value) {
  try {
    const url = value instanceof URL ? new URL(value) : new URL(String(value));
    if (url.username) url.username = "REDACTED";
    if (url.password) url.password = "REDACTED";
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, "[REDACTED]");
    }
    if (SENSITIVE_KEY.test(url.hash)) url.hash = "#[REDACTED]";
    return url.toString();
  } catch {
    return String(value ?? "");
  }
}

export function redactText(value) {
  let text = String(value ?? "");
  text = text.replace(/https?:\/\/[^\s<>"']+/gi, (url) => sanitizeUrl(url));
  text = text.replace(
    /([?&](?:[^&#\s=]*(?:token|secret|password|passwd|credential|api[_-]?key|session[_-]?(?:id|key))[^&#\s=]*)=)[^&#\s]*/gi,
    "$1[REDACTED]"
  );
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[REDACTED]");
  }
  return text;
}

export function redactSensitive(value, seen = new WeakSet()) {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (value instanceof Date) return value.toISOString();
  if (value instanceof URL) return redactText(sanitizeUrl(value));
  if (Buffer.isBuffer(value)) return `[Binary ${value.byteLength} bytes]`;
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, seen));

  const redacted = {};
  for (const [key, item] of Object.entries(value)) {
    Object.defineProperty(redacted, key, {
      value: SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitive(item, seen),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return redacted;
}

function canonicalize(value, seen = new WeakSet(), path = "$", state = { nodes: 0 }, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_CANONICAL_NODES) {
    throw new TypeError(`Approval input exceeds ${MAX_CANONICAL_NODES} canonical values.`);
  }
  if (depth > MAX_CANONICAL_DEPTH) {
    throw new TypeError(`Approval input exceeds maximum depth ${MAX_CANONICAL_DEPTH}.`);
  }
  if (typeof value === "string" && value.length > MAX_CANONICAL_STRING_LENGTH) {
    throw new TypeError(`Approval input string at '${path}' is too large.`);
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Approval input at '${path}' must contain only finite numbers.`);
    if (Object.is(value, -0)) {
      throw new TypeError(`Approval input at '${path}' cannot contain -0 because JSON does not preserve it.`);
    }
    return value;
  }
  if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) {
    throw new TypeError(`Approval input at '${path}' contains unsupported type '${typeof value}'.`);
  }
  if (value instanceof Date || value instanceof URL || Buffer.isBuffer(value)) {
    throw new TypeError(`Approval input at '${path}' must use JSON-safe values, not '${value.constructor.name}'.`);
  }
  if (seen.has(value)) throw new TypeError(`Approval input at '${path}' contains a cycle.`);
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_CANONICAL_COLLECTION_SIZE) {
      throw new TypeError(`Approval input array at '${path}' exceeds ${MAX_CANONICAL_COLLECTION_SIZE} items.`);
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) {
      throw new TypeError(`Approval input array at '${path}' cannot contain symbol keys.`);
    }
    const allowedKeys = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
    if (keys.some((key) => !allowedKeys.has(key))) {
      throw new TypeError(`Approval input array at '${path}' cannot contain extra properties.`);
    }
    return Array.from({ length: value.length }, (_, index) => {
      if (!Object.hasOwn(value, index)) {
        throw new TypeError(`Approval input array at '${path}' must be dense.`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new TypeError(`Approval input at '${path}[${index}]' must be an enumerable data property.`);
      }
      return canonicalize(descriptor.value, seen, `${path}[${index}]`, state, depth + 1);
    });
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype) {
    throw new TypeError(`Approval input at '${path}' must use plain JSON objects and arrays.`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length > MAX_CANONICAL_COLLECTION_SIZE) {
    throw new TypeError(`Approval input object at '${path}' exceeds ${MAX_CANONICAL_COLLECTION_SIZE} keys.`);
  }
  if (ownKeys.some((key) => typeof key !== "string")) {
    throw new TypeError(`Approval input at '${path}' cannot contain symbol keys.`);
  }
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new TypeError(`Approval input at '${path}.${key}' must be an enumerable data property.`);
    }
  }

  // A null-prototype result prevents keys such as __proto__ from mutating the
  // canonicalizer itself or disappearing from the serialized representation.
  const result = Object.create(null);
  for (const key of Object.keys(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new TypeError(`Approval input at '${path}.${key}' must be an enumerable data property.`);
    }
    result[key] = canonicalize(descriptor.value, seen, `${path}.${key}`, state, depth + 1);
  }
  return result;
}

export function hashValue(value) {
  const canonical = JSON.stringify(canonicalize(value));
  return createHash("sha256").update(canonical).digest("hex");
}
