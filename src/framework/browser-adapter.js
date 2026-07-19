import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { redactText } from "./audit.js";
import {
  deepFreezeSnapshot,
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./boundary.js";
import { MaqamError, PolicyDeniedError } from "./errors.js";
import { defineInternalGuardedTool } from "./tool-gateway.js";

const BROWSER_ADAPTER_SCHEMA_VERSION = "maqam.browser-adapter.v1";
const BROWSER_PLAN_SCHEMA_VERSION = "maqam.browser-plan.v1";
const BROWSER_RESULT_SCHEMA_VERSION = "maqam.browser-result.v1";
const BROWSER_DRIVER_EXECUTION_SCHEMA_VERSION = "maqam.browser-driver-execution.v1";

const DRIVER_METHODS = ["observe", "preview", "apply", "submit"];
const OPTION_KEYS = new Set(["driver", "allowedOrigins", "toolPrefix", "limits"]);
const LIMIT_KEYS = new Set(["maxElements", "maxTextChars", "maxOperations"]);
const TARGET_KEYS = new Set(["sessionId", "pageId", "origin", "revision"]);
const OBSERVE_INPUT_KEYS = new Set(["target", "maxElements"]);
const OBSERVATION_KEYS = new Set(["target", "url", "title", "elements"]);
const ELEMENT_KEYS = new Set(["elementId", "role", "name", "states"]);
const ELEMENT_STATE_KEYS = new Set([
  "disabled", "checked", "selected", "expanded", "required", "valuePresent"
]);
const PREVIEW_INPUT_KEYS = new Set(["target", "phase", "operations"]);
const PLAN_CORE_KEYS = new Set(["schemaVersion", "target", "phase", "operations"]);
const PLAN_KEYS = new Set([...PLAN_CORE_KEYS, "planHash", "planToken"]);
const MUTATION_INPUT_KEYS = new Set(["plan", "operationId"]);
const MUTATION_RESULT_KEYS = new Set(["operationId", "target", "effects"]);
const MUTATION_EFFECT_KEYS = new Set([
  "externalProtocol",
  "download",
  "filesystemRead",
  "filesystemWrite",
  "filePicker",
  "clipboardRead",
  "clipboardWrite",
  "permissionPrompt",
  "printDialog",
  "modalDialog"
]);
const PROHIBITED_BROWSER_EFFECTS = Object.freeze([
  "external-protocol",
  "download",
  "filesystem-read",
  "filesystem-write",
  "file-picker",
  "clipboard-read",
  "clipboard-write",
  "permission-prompt",
  "print-dialog",
  "modal-dialog"
]);

const APPLY_OPERATION_KEYS = Object.freeze({
  setValueRef: new Set(["kind", "elementId", "valueRef"]),
  selectOption: new Set(["kind", "elementId", "optionId"]),
  setChecked: new Set(["kind", "elementId", "checked"])
});
const SUBMIT_OPERATION_KEYS = Object.freeze({
  activate: new Set(["kind", "elementId", "expectedOrigin", "opensNewPage"]),
  submitForm: new Set(["kind", "elementId", "expectedOrigin", "opensNewPage"]),
  navigate: new Set(["kind", "url", "expectedOrigin", "opensNewPage"])
});

const DEFAULT_LIMITS = Object.freeze({
  maxElements: 200,
  maxTextChars: 20_000,
  maxOperations: 50
});
const LIMIT_CEILINGS = Object.freeze({
  maxElements: 1_000,
  maxTextChars: 100_000,
  maxOperations: 100
});
const MAX_ID_LENGTH = 256;
const MAX_URL_LENGTH = 8_192;
const MAX_STRUCTURAL_STRING_LENGTH = MAX_URL_LENGTH;
const MAX_PREFIX_LENGTH = 64;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SAFE_VALUE_REF = /^ref:[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SAFE_PREFIX = /^[a-z][a-z0-9.-]*$/;
const SAFE_ROLE = /^[a-z][a-z0-9_-]*$/;
const SAFE_PLAN_TOKEN = /^v1\.[A-Za-z0-9_-]{16,64}\.[A-Za-z0-9_-]{32,128}$/;
const SENSITIVE_URL_KEY = /(?:authorization|cookie|password|passwd|secret|credential|private[_-]?key|api[_-]?key|token|session[_-]?(?:id|key)|client[_-]?secret)/i;

function decodedText(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function containsRecognizedSecret(value) {
  const decoded = decodedText(value);
  return redactText(value) !== value || redactText(decoded) !== decoded;
}

function configRecord(value, recognizedKeys, label, { rejectUnknown = true } = {}) {
  return snapshotOwnDataRecord(value, { label, recognizedKeys, rejectUnknown });
}

function boundedString(value, label, maximumLength, { allowEmpty = false, pattern = null } = {}) {
  if (typeof value !== "string"
    || (!allowEmpty && value.trim() === "")
    || value.length > maximumLength
    || value.includes("\u0000")) {
    throw new TypeError(`${label} must be ${allowEmpty ? "a" : "a non-empty"} bounded string.`);
  }
  if (!allowEmpty && value !== value.trim()) {
    throw new TypeError(`${label} must not contain leading or trailing whitespace.`);
  }
  if (pattern && !pattern.test(value)) {
    throw new TypeError(`${label} contains unsupported characters.`);
  }
  return value;
}

function identifier(value, label) {
  return boundedString(value, label, MAX_ID_LENGTH, { pattern: SAFE_ID });
}

function valueReference(value, label) {
  return boundedString(value, label, MAX_ID_LENGTH, { pattern: SAFE_VALUE_REF });
}

function exactOrigin(value, label) {
  boundedString(value, label, MAX_URL_LENGTH);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an exact HTTP(S) origin.`);
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:")
    || url.username
    || url.password
    || url.origin !== value) {
    throw new TypeError(`${label} must be an exact canonical HTTP(S) origin without credentials.`);
  }
  return url.origin;
}

function browserUrl(value, label, { rejectSensitive = true } = {}) {
  boundedString(value, label, MAX_URL_LENGTH);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL.`);
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL without credentials.`);
  }
  for (const key of url.searchParams.keys()) {
    if (rejectSensitive && SENSITIVE_URL_KEY.test(key)) {
      throw new TypeError(`${label} cannot carry credentials or secrets in its query.`);
    }
  }
  if (rejectSensitive) {
    const components = [url.pathname, url.hash, ...url.searchParams.values()];
    if (components.some(containsRecognizedSecret)) {
      throw new TypeError(`${label} cannot carry a recognized credential or secret value.`);
    }
  }
  if (rejectSensitive && SENSITIVE_URL_KEY.test(url.hash)) {
    throw new TypeError(`${label} cannot carry credentials or secrets in its fragment.`);
  }
  return url.toString();
}

function observationUrl(value, label) {
  const normalized = browserUrl(value, label, { rejectSensitive: false });
  const url = new URL(normalized);
  for (const key of [...url.searchParams.keys()]) {
    url.searchParams.set(key, "[REDACTED]");
  }
  if (url.hash) url.hash = "#[REDACTED]";
  return redactText(url.toString());
}

function normalizeOrigins(value) {
  const values = snapshotOwnDataArray(value, {
    label: "Governed browser allowedOrigins",
    maximumLength: 1_000
  });
  if (values.length === 0) {
    throw new TypeError("Governed browser allowedOrigins must name at least one exact origin.");
  }
  return Object.freeze([...new Set(values.map((origin, index) => (
    exactOrigin(origin, `Governed browser allowedOrigins[${index}]`)
  ))) ]);
}

function normalizeLimits(value = {}) {
  const supplied = configRecord(value, LIMIT_KEYS, "Governed browser limits");
  const limits = { ...DEFAULT_LIMITS };
  for (const key of LIMIT_KEYS) {
    if (supplied[key] === undefined) continue;
    if (!Number.isSafeInteger(supplied[key]) || supplied[key] <= 0
      || supplied[key] > LIMIT_CEILINGS[key]) {
      throw new TypeError(
        `Governed browser limits.${key} must be a positive integer no greater than ${LIMIT_CEILINGS[key]}.`
      );
    }
    limits[key] = supplied[key];
  }
  return Object.freeze(limits);
}

function ownDriverMethods(driver) {
  if (!driver || (typeof driver !== "object" && typeof driver !== "function")) {
    throw new TypeError("Governed browser driver must be an object with four own data functions.");
  }
  const methods = Object.create(null);
  for (const method of DRIVER_METHODS) {
    const descriptor = Object.getOwnPropertyDescriptor(driver, method);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")
      || typeof descriptor.value !== "function") {
      throw new TypeError(
        `Governed browser driver.${method} must be an own enumerable data function; bind class methods explicitly.`
      );
    }
    methods[method] = descriptor.value.bind(driver);
  }
  return Object.freeze(methods);
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

function boundedSnapshot(value, label, limits, { freeze = false } = {}) {
  return snapshotJsonValue(value, {
    label,
    maximumDepth: 12,
    maximumNodes: Math.max(200, (limits.maxElements + limits.maxOperations) * 16),
    maximumCollectionSize: Math.max(limits.maxElements, limits.maxOperations, 32),
    maximumStringLength: MAX_STRUCTURAL_STRING_LENGTH,
    allowNullPrototype: true,
    freeze
  });
}

function publicJson(value, label, limits) {
  const safe = boundedSnapshot(value, label, limits);
  return deepFreezeSnapshot(JSON.parse(JSON.stringify(safe)));
}

function canonicalJson(value, label, limits) {
  return JSON.stringify(snapshotJsonValue(value, {
    label,
    maximumDepth: 12,
    maximumNodes: Math.max(200, (limits.maxElements + limits.maxOperations) * 16),
    maximumCollectionSize: Math.max(limits.maxElements, limits.maxOperations, 32),
    maximumStringLength: MAX_STRUCTURAL_STRING_LENGTH,
    allowNullPrototype: true,
    sortKeys: true
  }));
}

function planDigest(core, limits) {
  return createHash("sha256")
    .update(canonicalJson(core, "Governed browser plan", limits))
    .digest("hex");
}

function invalidInput(message = "Governed browser input is invalid.") {
  return new PolicyDeniedError(message, {
    code: "BROWSER_INPUT_INVALID",
    details: Object.create(null)
  });
}

function invalidOutput(method) {
  return new MaqamError(`The host browser driver returned an invalid ${method} result.`, {
    code: "BROWSER_DRIVER_OUTPUT_INVALID",
    details: { method }
  });
}

function previewRequired() {
  return new PolicyDeniedError("The exact browser plan was not issued by this adapter preview.", {
    code: "BROWSER_PREVIEW_REQUIRED",
    details: Object.create(null)
  });
}

function normalizeCallInput(normalizer) {
  try {
    return normalizer();
  } catch (error) {
    if (error instanceof PolicyDeniedError || error instanceof MaqamError) throw error;
    throw invalidInput();
  }
}

function normalizeDriverOutput(method, normalizer) {
  try {
    return normalizer();
  } catch (error) {
    if (error instanceof PolicyDeniedError || error instanceof MaqamError) throw error;
    throw invalidOutput(method);
  }
}

function normalizeTarget(value, label = "Browser target") {
  const target = configRecord(value, TARGET_KEYS, label);
  return Object.freeze(Object.assign(Object.create(null), {
    sessionId: identifier(target.sessionId, `${label}.sessionId`),
    pageId: identifier(target.pageId, `${label}.pageId`),
    origin: exactOrigin(target.origin, `${label}.origin`),
    revision: identifier(target.revision, `${label}.revision`)
  }));
}

function sameTarget(left, right) {
  return left.sessionId === right.sessionId
    && left.pageId === right.pageId
    && left.origin === right.origin
    && left.revision === right.revision;
}

function normalizeObserveInput(value, limits) {
  const input = configRecord(value, OBSERVE_INPUT_KEYS, "Browser observe input");
  const maxElements = input.maxElements === undefined ? limits.maxElements : input.maxElements;
  if (!Number.isSafeInteger(maxElements) || maxElements <= 0 || maxElements > limits.maxElements) {
    throw new TypeError("Browser observe input.maxElements exceeds the registered adapter limit.");
  }
  return Object.freeze(Object.assign(Object.create(null), {
    target: normalizeTarget(input.target, "Browser observe input.target"),
    maxElements
  }));
}

function normalizeElement(value, index) {
  const element = configRecord(value, ELEMENT_KEYS, `Browser observation elements[${index}]`);
  const statesInput = element.states === undefined
    ? Object.create(null)
    : configRecord(element.states, ELEMENT_STATE_KEYS, `Browser observation elements[${index}].states`);
  const states = Object.create(null);
  for (const key of ELEMENT_STATE_KEYS) {
    if (statesInput[key] === undefined) continue;
    if (typeof statesInput[key] !== "boolean") {
      throw new TypeError(`Browser observation elements[${index}].states.${key} must be a boolean.`);
    }
    states[key] = statesInput[key];
  }
  return Object.freeze(Object.assign(Object.create(null), {
    elementId: identifier(element.elementId, `Browser observation elements[${index}].elementId`),
    role: boundedString(
      element.role,
      `Browser observation elements[${index}].role`,
      64,
      { pattern: SAFE_ROLE }
    ),
    name: redactText(boundedString(
      element.name,
      `Browser observation elements[${index}].name`,
      4_096,
      { allowEmpty: true }
    )),
    states: Object.freeze(states)
  }));
}

function normalizeObservation(value, request, limits) {
  const safe = boundedSnapshot(value, "Browser observation", limits);
  const observation = configRecord(safe, OBSERVATION_KEYS, "Browser observation");
  const target = normalizeTarget(observation.target, "Browser observation.target");
  if (!sameTarget(target, request.target)) {
    throw new TypeError("Browser observation target does not match the exact requested target revision.");
  }
  const url = observationUrl(observation.url, "Browser observation.url");
  if (new URL(url).origin !== target.origin) {
    throw new TypeError("Browser observation URL origin does not match its target origin.");
  }
  const title = redactText(boundedString(
    observation.title,
    "Browser observation.title",
    4_096,
    { allowEmpty: true }
  ));
  const rawElements = snapshotOwnDataArray(observation.elements, {
    label: "Browser observation.elements",
    maximumLength: request.maxElements
  });
  const elements = rawElements.map((element, index) => normalizeElement(element, index));
  const ids = new Set();
  for (const element of elements) {
    if (ids.has(element.elementId)) {
      throw new TypeError("Browser observation element IDs must be unique.");
    }
    ids.add(element.elementId);
  }
  const textCharacters = url.length + title.length
    + elements.reduce((total, element) => total + element.role.length + element.name.length, 0);
  if (textCharacters > limits.maxTextChars) {
    throw new TypeError("Browser observation exceeds the registered text limit.");
  }
  return Object.freeze(Object.assign(Object.create(null), {
    target,
    url,
    title,
    elements: Object.freeze(elements)
  }));
}

function normalizeApplyOperation(value, index) {
  const discriminator = configRecord(
    value,
    new Set(["kind"]),
    `Browser apply operations[${index}]`,
    { rejectUnknown: false }
  );
  const keys = APPLY_OPERATION_KEYS[discriminator.kind];
  if (!keys) throw new TypeError("Browser apply operation kind is unsupported.");
  const operation = configRecord(value, keys, `Browser apply operations[${index}]`);
  const normalized = {
    kind: operation.kind,
    elementId: identifier(operation.elementId, `Browser apply operations[${index}].elementId`)
  };
  if (operation.kind === "setValueRef") {
    normalized.valueRef = valueReference(
      operation.valueRef,
      `Browser apply operations[${index}].valueRef`
    );
  } else if (operation.kind === "selectOption") {
    normalized.optionId = identifier(operation.optionId, `Browser apply operations[${index}].optionId`);
  } else {
    if (typeof operation.checked !== "boolean") {
      throw new TypeError(`Browser apply operations[${index}].checked must be a boolean.`);
    }
    normalized.checked = operation.checked;
  }
  return Object.freeze(Object.assign(Object.create(null), normalized));
}

function normalizeSubmitOperation(value, index) {
  const discriminator = configRecord(
    value,
    new Set(["kind"]),
    `Browser submit operations[${index}]`,
    { rejectUnknown: false }
  );
  const keys = SUBMIT_OPERATION_KEYS[discriminator.kind];
  if (!keys) throw new TypeError("Browser submit operation kind is unsupported.");
  const operation = configRecord(value, keys, `Browser submit operations[${index}]`);
  if (typeof operation.opensNewPage !== "boolean") {
    throw new TypeError(`Browser submit operations[${index}].opensNewPage must be a boolean.`);
  }
  const normalized = {
    kind: operation.kind,
    expectedOrigin: exactOrigin(
      operation.expectedOrigin,
      `Browser submit operations[${index}].expectedOrigin`
    ),
    opensNewPage: operation.opensNewPage
  };
  if (operation.kind === "navigate") {
    normalized.url = browserUrl(operation.url, `Browser submit operations[${index}].url`);
    if (new URL(normalized.url).origin !== normalized.expectedOrigin) {
      throw new TypeError("Browser navigate operation URL and expectedOrigin must match.");
    }
  } else {
    normalized.elementId = identifier(
      operation.elementId,
      `Browser submit operations[${index}].elementId`
    );
  }
  return Object.freeze(Object.assign(Object.create(null), normalized));
}

function normalizeOperations(value, phase, limits) {
  const operations = snapshotOwnDataArray(value, {
    label: `Browser ${phase} operations`,
    maximumLength: limits.maxOperations
  });
  if (operations.length === 0 || (phase === "submit" && operations.length !== 1)) {
    throw new TypeError(
      phase === "submit"
        ? "Browser submit plans must contain exactly one commit operation."
        : "Browser apply plans must contain at least one operation."
    );
  }
  const normalized = operations.map((operation, index) => (
    phase === "apply"
      ? normalizeApplyOperation(operation, index)
      : normalizeSubmitOperation(operation, index)
  ));
  return Object.freeze(normalized);
}

function normalizePreviewInput(value, limits) {
  const input = configRecord(value, PREVIEW_INPUT_KEYS, "Browser preview input");
  if (input.phase !== "apply" && input.phase !== "submit") {
    throw new TypeError("Browser preview input.phase must be 'apply' or 'submit'.");
  }
  return Object.freeze(Object.assign(Object.create(null), {
    target: normalizeTarget(input.target, "Browser preview input.target"),
    phase: input.phase,
    operations: normalizeOperations(input.operations, input.phase, limits)
  }));
}

function planCore(target, phase, operations) {
  return Object.freeze(Object.assign(Object.create(null), {
    schemaVersion: BROWSER_PLAN_SCHEMA_VERSION,
    target,
    phase,
    operations
  }));
}

function normalizePlanCore(value, limits, label = "Browser plan") {
  const safe = boundedSnapshot(value, label, limits);
  const core = configRecord(safe, PLAN_CORE_KEYS, label);
  if (core.schemaVersion !== BROWSER_PLAN_SCHEMA_VERSION) {
    throw new TypeError(`Browser plan schemaVersion must be '${BROWSER_PLAN_SCHEMA_VERSION}'.`);
  }
  if (core.phase !== "apply" && core.phase !== "submit") {
    throw new TypeError("Browser plan phase must be 'apply' or 'submit'.");
  }
  return planCore(
    normalizeTarget(core.target, `${label}.target`),
    core.phase,
    normalizeOperations(core.operations, core.phase, limits)
  );
}

function normalizePlan(value, limits) {
  const safe = boundedSnapshot(value, "Browser plan", limits);
  const plan = configRecord(safe, PLAN_KEYS, "Browser plan");
  const core = normalizePlanCore({
    schemaVersion: plan.schemaVersion,
    target: plan.target,
    phase: plan.phase,
    operations: plan.operations
  }, limits);
  if (typeof plan.planHash !== "string" || !/^[a-f0-9]{64}$/.test(plan.planHash)
    || planDigest(core, limits) !== plan.planHash) {
    throw new TypeError("Browser plan hash does not match its canonical contents.");
  }
  return Object.freeze(Object.assign(Object.create(null), {
    ...core,
    planHash: plan.planHash,
    planToken: boundedString(plan.planToken, "Browser plan.planToken", 256, {
      pattern: SAFE_PLAN_TOKEN
    })
  }));
}

function normalizeMutationInput(value, expectedPhase, limits) {
  const input = configRecord(value, MUTATION_INPUT_KEYS, `Browser ${expectedPhase} input`);
  const plan = normalizePlan(input.plan, limits);
  if (plan.phase !== expectedPhase) {
    throw new TypeError(`Browser ${expectedPhase} requires a ${expectedPhase} plan.`);
  }
  return Object.freeze(Object.assign(Object.create(null), {
    plan,
    operationId: identifier(input.operationId, `Browser ${expectedPhase} input.operationId`)
  }));
}

function normalizeMutationResult(value, request, method, limits) {
  const safe = boundedSnapshot(value, `Browser driver ${method} result`, limits);
  const result = configRecord(safe, MUTATION_RESULT_KEYS, `Browser driver ${method} result`);
  if (result.operationId !== request.operationId) {
    throw new TypeError(`Browser driver ${method} result operationId does not match the request.`);
  }
  const effects = configRecord(
    result.effects,
    MUTATION_EFFECT_KEYS,
    `Browser driver ${method} result.effects`
  );
  for (const key of MUTATION_EFFECT_KEYS) {
    if (effects[key] !== false) {
      throw new TypeError(
        `Browser driver ${method} result.effects.${key} must explicitly be false.`
      );
    }
  }
  const target = normalizeTarget(result.target, `Browser driver ${method} result.target`);
  const source = request.plan.target;
  if (target.sessionId !== source.sessionId) {
    throw new TypeError(`Browser driver ${method} cannot switch browser sessions.`);
  }
  if (method === "apply") {
    if (target.pageId !== source.pageId || target.origin !== source.origin) {
      throw new TypeError("Browser apply cannot switch pages or origins.");
    }
  } else {
    const operation = request.plan.operations[0];
    if (target.origin !== operation.expectedOrigin) {
      throw new TypeError("Browser submit result origin does not match the previewed origin.");
    }
    if (operation.opensNewPage ? target.pageId === source.pageId : target.pageId !== source.pageId) {
      throw new TypeError("Browser submit result page identity does not match opensNewPage.");
    }
  }
  return Object.freeze(Object.assign(Object.create(null), {
    operationId: request.operationId,
    target
  }));
}

function requireAuthorizedOrigin(receipt, configuredOrigins, origin) {
  const scope = receipt?.decision?.scope;
  if (!configuredOrigins.includes(origin)
    || scope?.originsExplicit !== true
    || !Array.isArray(scope.allowedOrigins)
    || !scope.allowedOrigins.includes(origin)) {
    throw new PolicyDeniedError("Browser origin is outside the explicit authorized scope.", {
      code: "BROWSER_ORIGIN_DENIED",
      details: { origin }
    });
  }
}

function requireOperationOrigins(receipt, configuredOrigins, request) {
  requireAuthorizedOrigin(receipt, configuredOrigins, request.target.origin);
  if (request.phase === "submit") {
    for (const operation of request.operations) {
      requireAuthorizedOrigin(receipt, configuredOrigins, operation.expectedOrigin);
    }
  }
}

function exactRequestOrigins(request) {
  const origins = [request.target.origin];
  if (request.phase === "submit") {
    for (const operation of request.operations) origins.push(operation.expectedOrigin);
  }
  return Object.freeze([...new Set(origins)]);
}

function requireApprovalAction(receipt, expectedAction) {
  const actions = receipt?.approvalActions;
  const ids = receipt?.approvalIds;
  const index = Array.isArray(actions) ? actions.indexOf(expectedAction) : -1;
  if (index < 0 || !Array.isArray(ids) || typeof ids[index] !== "string" || ids[index] === "") {
    throw new PolicyDeniedError(
      `Browser write requires exact consumed approval '${expectedAction}'.`,
      {
        code: "BROWSER_APPROVAL_REQUIRED",
        details: { requiredApproval: expectedAction }
      }
    );
  }
}

function signalFromContext(context) {
  const signal = context?.signal;
  if (signal === undefined || signal === null) return null;
  if (typeof AbortSignal === "undefined" || !(signal instanceof AbortSignal)) {
    throw invalidInput();
  }
  return signal;
}

function requireNotAborted(signal) {
  if (signal?.aborted) {
    throw new MaqamError("Governed browser execution was cancelled before driver dispatch.", {
      code: "BROWSER_EXECUTION_ABORTED",
      details: Object.create(null)
    });
  }
}

function driverExecution(receipt, context, configuredOrigins, request) {
  const scopeOrigins = Array.isArray(receipt?.decision?.scope?.allowedOrigins)
    ? receipt.decision.scope.allowedOrigins
    : [];
  const requestedOrigins = exactRequestOrigins(request);
  const authorizedOrigins = Object.freeze(
    requestedOrigins.filter((origin) => (
      configuredOrigins.includes(origin) && scopeOrigins.includes(origin)
    ))
  );
  const signal = signalFromContext(context);
  return Object.freeze(Object.assign(Object.create(null), {
    schemaVersion: BROWSER_DRIVER_EXECUTION_SCHEMA_VERSION,
    runId: receipt.runId,
    toolName: receipt.toolName,
    inputHash: receipt.inputHash,
    approvalIds: Object.freeze([...receipt.approvalIds]),
    approvalActions: Object.freeze([...receipt.approvalActions]),
    authorizedOrigins,
    prohibitedEffects: PROHIBITED_BROWSER_EFFECTS,
    signal
  }));
}

async function callDriver(methods, method, request, execution) {
  requireNotAborted(execution.signal);
  try {
    return await methods[method](request, execution);
  } catch (cause) {
    throw new MaqamError(`The host browser driver failed during ${method}.`, {
      code: "BROWSER_DRIVER_FAILED",
      cause,
      details: { method }
    });
  }
}

function validatePreviewResult(value, request, limits) {
  const core = normalizePlanCore(value, limits, "Browser driver preview result");
  const requestedCore = planCore(request.target, request.phase, request.operations);
  if (canonicalJson(core, "Browser driver preview result", limits)
    !== canonicalJson(requestedCore, "Browser preview request", limits)) {
    throw new TypeError("Browser driver preview result must preserve the exact target and operations.");
  }
  return core;
}

function browserMetadata(operation) {
  const table = {
    observe: { effects: ["browser:read"], risk: "low", readOnly: true },
    preview: { effects: ["browser:read"], risk: "low", readOnly: true },
    apply: {
      effects: ["browser:write", "browser:apply", "network:write"],
      risk: "high",
      readOnly: false
    },
    submit: {
      effects: ["browser:write", "browser:submit", "network:write"],
      risk: "critical",
      readOnly: false
    }
  };
  const selected = table[operation];
  return {
    effects: selected.effects,
    risk: selected.risk,
    browserAdapter: {
      schemaVersion: BROWSER_ADAPTER_SCHEMA_VERSION,
      operation,
      readOnly: selected.readOnly,
      prohibitedEffects: PROHIBITED_BROWSER_EFFECTS
    }
  };
}

/**
 * Register four structural browser tools around a host-owned driver.
 * Maqam does not create a browser, load a profile, acquire credentials,
 * translate natural-language instructions, or permit arbitrary script.
 */
export function registerGovernedBrowserTools(gateway, options) {
  options = configRecord(options, OPTION_KEYS, "Governed browser options");
  const methods = ownDriverMethods(options.driver);
  const configuredOrigins = normalizeOrigins(options.allowedOrigins);
  const limits = normalizeLimits(options.limits || {});
  const toolPrefix = options.toolPrefix === undefined
    ? "browser"
    : boundedString(options.toolPrefix, "Governed browser toolPrefix", MAX_PREFIX_LENGTH, {
      pattern: SAFE_PREFIX
    });
  const register = dataFunction(gateway, "registerGuardedTool", "ToolGateway-compatible object");
  const toolNames = Object.freeze({
    observe: `${toolPrefix}.observe`,
    preview: `${toolPrefix}.preview`,
    apply: `${toolPrefix}.apply`,
    submit: `${toolPrefix}.submit`
  });
  const registration = publicJson({
    schemaVersion: BROWSER_ADAPTER_SCHEMA_VERSION,
    toolNames,
    allowedOrigins: configuredOrigins,
    prohibitedEffects: PROHIBITED_BROWSER_EFFECTS,
    limits
  }, "Governed browser registration", {
    ...limits,
    maxElements: Math.max(limits.maxElements, configuredOrigins.length)
  });
  const planTokenKey = randomBytes(32);

  function planTokenPayload(runId, planHash, nonce) {
    return JSON.stringify([BROWSER_PLAN_SCHEMA_VERSION, runId, planHash, nonce]);
  }

  function signPlan(runId, planHash) {
    const nonce = randomBytes(18).toString("base64url");
    const signature = createHmac("sha256", planTokenKey)
      .update(planTokenPayload(runId, planHash, nonce))
      .digest("base64url");
    return `v1.${nonce}.${signature}`;
  }

  function verifyPlanToken(plan, runId) {
    const parts = plan.planToken.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") throw previewRequired();
    const expected = createHmac("sha256", planTokenKey)
      .update(planTokenPayload(runId, plan.planHash, parts[1]))
      .digest();
    let supplied;
    try {
      supplied = Buffer.from(parts[2], "base64url");
    } catch {
      throw previewRequired();
    }
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw previewRequired();
    }
  }

  function issuePlan(core, runId) {
    const planHash = planDigest(core, limits);
    const plan = publicJson(
      { ...core, planHash, planToken: signPlan(runId, planHash) },
      "Governed browser plan",
      limits
    );
    return plan;
  }

  function preAuthorizePlan(input, phase, context) {
    const request = normalizeCallInput(() => normalizeMutationInput(input, phase, limits));
    verifyPlanToken(request.plan, context.runId || "default");
  }

  register(toolNames.observe, (verifier) => async (input, context) => {
    const receipt = verifier.requireExecution(input, context);
    const request = normalizeCallInput(() => normalizeObserveInput(input, limits));
    requireAuthorizedOrigin(receipt, configuredOrigins, request.target.origin);
    const execution = driverExecution(receipt, context, configuredOrigins, request);
    const raw = await callDriver(methods, "observe", request, execution);
    const observation = normalizeDriverOutput("observe", () => (
      normalizeObservation(raw, request, limits)
    ));
    return publicJson(observation, "Governed browser observation result", limits);
  }, browserMetadata("observe"));

  register(toolNames.preview, (verifier) => async (input, context) => {
    const receipt = verifier.requireExecution(input, context);
    const request = normalizeCallInput(() => normalizePreviewInput(input, limits));
    requireOperationOrigins(receipt, configuredOrigins, request);
    const execution = driverExecution(receipt, context, configuredOrigins, request);
    const raw = await callDriver(methods, "preview", request, execution);
    const core = normalizeDriverOutput("preview", () => validatePreviewResult(raw, request, limits));
    return issuePlan(core, receipt.runId);
  }, browserMetadata("preview"));

  register(toolNames.apply, (verifier) => defineInternalGuardedTool(
    async function handler(input, context) {
      const receipt = verifier.requireExecution(input, context);
      const request = normalizeCallInput(() => normalizeMutationInput(input, "apply", limits));
      requireOperationOrigins(receipt, configuredOrigins, request.plan);
      requireApprovalAction(receipt, "effect:browser:apply");
      verifyPlanToken(request.plan, receipt.runId);
      const execution = driverExecution(receipt, context, configuredOrigins, request.plan);
      const raw = await callDriver(methods, "apply", request, execution);
      const mutation = normalizeDriverOutput("apply", () => (
        normalizeMutationResult(raw, request, "apply", limits)
      ));
      requireAuthorizedOrigin(receipt, configuredOrigins, mutation.target.origin);
      const observeRequest = Object.freeze(Object.assign(Object.create(null), {
        target: mutation.target,
        maxElements: limits.maxElements
      }));
      const observedRaw = await callDriver(methods, "observe", observeRequest, execution);
      const observation = normalizeDriverOutput("observe", () => (
        normalizeObservation(observedRaw, observeRequest, limits)
      ));
      return publicJson({
        schemaVersion: BROWSER_RESULT_SCHEMA_VERSION,
        status: "applied",
        operationId: request.operationId,
        planHash: request.plan.planHash,
        observation
      }, "Governed browser apply result", limits);
    },
    function validateInput(input, context) {
      preAuthorizePlan(input, "apply", context);
    }
  ), browserMetadata("apply"));

  register(toolNames.submit, (verifier) => defineInternalGuardedTool(
    async function handler(input, context) {
      const receipt = verifier.requireExecution(input, context);
      const request = normalizeCallInput(() => normalizeMutationInput(input, "submit", limits));
      requireOperationOrigins(receipt, configuredOrigins, request.plan);
      requireApprovalAction(receipt, "effect:browser:submit");
      verifyPlanToken(request.plan, receipt.runId);
      const execution = driverExecution(receipt, context, configuredOrigins, request.plan);
      const raw = await callDriver(methods, "submit", request, execution);
      const mutation = normalizeDriverOutput("submit", () => (
        normalizeMutationResult(raw, request, "submit", limits)
      ));
      requireAuthorizedOrigin(receipt, configuredOrigins, mutation.target.origin);
      const observeRequest = Object.freeze(Object.assign(Object.create(null), {
        target: mutation.target,
        maxElements: limits.maxElements
      }));
      const observedRaw = await callDriver(methods, "observe", observeRequest, execution);
      const observation = normalizeDriverOutput("observe", () => (
        normalizeObservation(observedRaw, observeRequest, limits)
      ));
      return publicJson({
        schemaVersion: BROWSER_RESULT_SCHEMA_VERSION,
        status: "submitted",
        operationId: request.operationId,
        planHash: request.plan.planHash,
        observation
      }, "Governed browser submit result", limits);
    },
    function validateInput(input, context) {
      preAuthorizePlan(input, "submit", context);
    }
  ), browserMetadata("submit"));

  return registration;
}

export {
  BROWSER_ADAPTER_SCHEMA_VERSION,
  BROWSER_DRIVER_EXECUTION_SCHEMA_VERSION,
  BROWSER_PLAN_SCHEMA_VERSION,
  BROWSER_RESULT_SCHEMA_VERSION
};
