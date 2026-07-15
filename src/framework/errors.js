import {
  snapshotJsonValue,
  snapshotOwnDataRecord
} from "./boundary.js";

const ERROR_OPTION_KEYS = new Set(["cause", "code", "details"]);
const MAX_ERROR_STRING_LENGTH = 100_000;

function normalizeMessage(message) {
  if (typeof message !== "string") throw new TypeError("Framework error message must be a string.");
  if (message.length > MAX_ERROR_STRING_LENGTH) {
    throw new TypeError(`Framework error message cannot exceed ${MAX_ERROR_STRING_LENGTH} characters.`);
  }
  return message;
}

function snapshotDetails(details, { freeze = true } = {}) {
  if (details === undefined || details === null) {
    return snapshotJsonValue(Object.create(null), {
      label: "Error details",
      allowNullPrototype: true,
      freeze
    });
  }
  if (typeof details !== "object" || Array.isArray(details)) {
    throw new TypeError("Framework error details must be a plain object.");
  }
  return snapshotJsonValue(details, {
    label: "Error details",
    allowNullPrototype: true,
    freeze,
    rejectRepeatedReferences: false
  });
}

function normalizeOptions(options = {}) {
  const snapshot = snapshotOwnDataRecord(options, {
    label: "Framework error options",
    recognizedKeys: ERROR_OPTION_KEYS
  });
  const code = snapshot.code;
  if (code !== undefined
    && (typeof code !== "string" || code.trim() === "" || code.length > MAX_ERROR_STRING_LENGTH)) {
    throw new TypeError("Framework error code must be a non-empty bounded string.");
  }
  return {
    hasCause: Object.hasOwn(snapshot, "cause"),
    cause: snapshot.cause,
    code,
    details: snapshotDetails(snapshot.details)
  };
}

function optionsWithDefaultCode(options, defaultCode) {
  const normalized = normalizeOptions(options);
  return Object.assign(
    Object.create(null),
    normalized.hasCause ? { cause: normalized.cause } : {},
    {
      code: normalized.code || defaultCode,
      details: normalized.details
    }
  );
}

function ownDataValue(value, key) {
  try {
    if ((!value || typeof value !== "object") && typeof value !== "function") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function primitiveMessage(value) {
  try {
    if (value === null) return "null";
    if (["string", "number", "boolean", "bigint", "symbol", "undefined"].includes(typeof value)) {
      return String(value);
    }
  } catch {
    // Fall through to a constant message.
  }
  return "Unknown error.";
}

function detachedDetails(value) {
  try {
    if (value === undefined || value === null) return snapshotDetails(undefined, { freeze: false });
    if (typeof value !== "object" || Array.isArray(value)) {
      return snapshotJsonValue({ unavailable: "Non-object error details were omitted." }, {
        label: "Normalized error details",
        allowNullPrototype: true
      });
    }
    return snapshotJsonValue(value, {
      label: "Normalized error details",
      allowNullPrototype: true,
      rejectRepeatedReferences: false
    });
  } catch {
    try {
      return snapshotJsonValue({ unavailable: "Unsafe error details were omitted." }, {
        label: "Normalized error details fallback",
        allowNullPrototype: true
      });
    } catch {
      return Object.create(null);
    }
  }
}

export class AjnasFrameworkError extends Error {
  constructor(message, options = {}) {
    const safeMessage = normalizeMessage(message);
    const normalized = normalizeOptions(options);
    super(safeMessage, normalized.hasCause ? { cause: normalized.cause } : undefined);
    this.name = new.target.name;
    this.code = normalized.code || "AJNAS_FRAMEWORK_ERROR";
    this.details = normalized.details;
  }
}

export class MaqamError extends AjnasFrameworkError {
  constructor(message, options = {}) {
    super(message, optionsWithDefaultCode(options, "MAQAM_ERROR"));
  }
}

export class PolicyDeniedError extends MaqamError {
  constructor(message, options = {}) {
    super(message, optionsWithDefaultCode(options, "POLICY_DENIED"));
  }
}

export class ApprovalRequiredError extends MaqamError {
  constructor(message, options = {}) {
    super(message, optionsWithDefaultCode(options, "APPROVAL_REQUIRED"));
  }
}

export function toErrorRecord(error) {
  try {
    const ownName = ownDataValue(error, "name");
    const ownCode = ownDataValue(error, "code");
    const ownMessage = ownDataValue(error, "message");
    const details = ownDataValue(error, "details");
    const name = typeof ownName === "string" && ownName.trim() !== ""
      ? ownName.slice(0, MAX_ERROR_STRING_LENGTH)
      : "Error";
    const code = typeof ownCode === "string" && ownCode.trim() !== ""
      ? ownCode.slice(0, MAX_ERROR_STRING_LENGTH)
      : "ERROR";
    const message = typeof ownMessage === "string"
      ? ownMessage.slice(0, MAX_ERROR_STRING_LENGTH)
      : primitiveMessage(error);
    return Object.assign(Object.create(null), {
      name,
      code,
      message,
      details: detachedDetails(details)
    });
  } catch {
    return Object.assign(Object.create(null), {
      name: "Error",
      code: "ERROR",
      message: "Unknown error.",
      details: Object.create(null)
    });
  }
}
