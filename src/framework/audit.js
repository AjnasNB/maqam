import { createHash } from "node:crypto";
import { snapshotJsonValue } from "./boundary.js";

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
  if (Array.isArray(value)) {
    const redacted = new Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) continue;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
        throw new TypeError(`Audit data at '$[${index}]' must be an enumerable data property.`);
      }
      redacted[index] = redactSensitive(descriptor.value, seen);
    }
    return redacted;
  }

  const redacted = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable) continue;
    if (!Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`Audit data at '$.${key}' must be an enumerable data property.`);
    }
    Object.defineProperty(redacted, key, {
      value: SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitive(descriptor.value, seen),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return redacted;
}

function canonicalize(value) {
  return snapshotJsonValue(value, {
    label: "Approval input",
    maximumDepth: MAX_CANONICAL_DEPTH,
    maximumNodes: MAX_CANONICAL_NODES,
    maximumCollectionSize: MAX_CANONICAL_COLLECTION_SIZE,
    maximumStringLength: MAX_CANONICAL_STRING_LENGTH,
    allowNullPrototype: false,
    sortKeys: true
  });
}

export function hashValue(value) {
  const canonical = JSON.stringify(canonicalize(value));
  return createHash("sha256").update(canonical).digest("hex");
}

export function snapshotHashedValue(value) {
  const snapshot = canonicalize(value);
  const canonical = JSON.stringify(snapshot);
  return {
    // The handler receives this exact detached, prototype-isolated structure.
    // Hashing and execution therefore cannot diverge through later prototype
    // pollution or caller mutation.
    snapshot,
    hash: createHash("sha256").update(canonical).digest("hex")
  };
}
