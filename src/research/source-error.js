import {
  ApprovalRequiredError,
  MaqamError,
  PolicyDeniedError,
  toErrorRecord
} from "../framework/errors.js";
import { snapshotJsonValue, snapshotOwnDataRecord } from "../framework/boundary.js";
import { redactSensitive, redactText } from "../framework/audit.js";

const FATAL_EXACT_CODES = new Set([
  "APPROVAL_REQUIRED",
  "CRAWLER_URL_BLOCKED",
  "GOAL_SCOPE_CONFLICT",
  "RESEARCH_AUTHENTICATION_REQUIRED",
  "RESEARCH_TOOL_CALLER_REQUIRED",
  "ROBOTS_DENIED"
]);
const FATAL_CODE_PREFIXES = [
  "APPROVAL_",
  "AUTHENTICATION_",
  "AUTHORIZATION_",
  "POLICY_",
  "SECURITY_",
  "TOOL_CALL_LIMIT_"
];

function ownString(value, key) {
  if ((!value || typeof value !== "object") && typeof value !== "function") return null;
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    return null;
  }
  return descriptor && Object.hasOwn(descriptor, "value")
    && typeof descriptor.value === "string"
    ? descriptor.value
    : null;
}

function optionsWithCode(options, defaultCode) {
  const input = snapshotOwnDataRecord(options, {
    label: "Research source error options",
    recognizedKeys: new Set(["cause", "code", "details"])
  });
  const result = Object.create(null);
  if (Object.hasOwn(input, "cause")) result.cause = input.cause;
  result.code = input.code || defaultCode;
  if (Object.hasOwn(input, "details")) result.details = input.details;
  return result;
}

export class ResearchSourceUnavailableError extends MaqamError {
  constructor(message, options = {}) {
    super(message, optionsWithCode(options, "RESEARCH_SOURCE_UNAVAILABLE"));
  }
}

export class ResearchSourceAuthenticationRequiredError extends MaqamError {
  constructor(message, options = {}) {
    super(message, optionsWithCode(options, "RESEARCH_AUTHENTICATION_REQUIRED"));
  }
}

export class ResearchSourceToolCallerRequiredError extends MaqamError {
  constructor(message, options = {}) {
    super(message, optionsWithCode(options, "RESEARCH_TOOL_CALLER_REQUIRED"));
  }
}

export function isFatalResearchSourceError(error) {
  if (error instanceof PolicyDeniedError || error instanceof ApprovalRequiredError
    || error instanceof ResearchSourceAuthenticationRequiredError
    || error instanceof ResearchSourceToolCallerRequiredError) {
    return true;
  }
  const code = ownString(error, "code");
  return Boolean(code && (
    FATAL_EXACT_CODES.has(code)
    || FATAL_CODE_PREFIXES.some((prefix) => code.startsWith(prefix))
  ));
}

/**
 * Produce a detached classification suitable for attempt logs and doctor
 * reports. No error getters, custom serializers, or inherited fields run.
 */
export function classifyResearchSourceError(error) {
  const code = ownString(error, "code") || "ERROR";
  const fatal = isFatalResearchSourceError(error);
  const unavailable = error instanceof ResearchSourceUnavailableError
    || code === "RESEARCH_SOURCE_UNAVAILABLE";
  const record = toErrorRecord(error);
  return snapshotJsonValue({
    kind: fatal ? "fatal" : unavailable ? "unavailable" : "failure",
    fatal,
    error: {
      name: record.name,
      code: record.code,
      message: redactText(record.message),
      details: redactSensitive(record.details)
    }
  }, {
    label: "Research source error classification",
    allowNullPrototype: true,
    freeze: true,
    rejectRepeatedReferences: false
  });
}
