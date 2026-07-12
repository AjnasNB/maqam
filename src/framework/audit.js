import { createHash } from "node:crypto";

const SENSITIVE_KEY = /(?:authorization|cookie|password|passwd|secret|credential|private[_-]?key|(?:api|access|refresh|auth)[_-]?token)/i;
const SECRET_PATTERNS = [
  /\bnpm_[A-Za-z0-9]{20,}\b/g,
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
];

export function redactText(value) {
  let text = String(value ?? "");
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
  if (value instanceof URL) return value.toString();
  if (Buffer.isBuffer(value)) return `[Binary ${value.byteLength} bytes]`;
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, seen));

  const redacted = {};
  for (const [key, item] of Object.entries(value)) {
    redacted[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitive(item, seen);
  }
  return redacted;
}

function canonicalize(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, seen));

  const result = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = canonicalize(value[key], seen);
  }
  return result;
}

export function hashValue(value) {
  const canonical = JSON.stringify(canonicalize(value));
  return createHash("sha256").update(canonical).digest("hex");
}
