import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "../framework/boundary.js";
import { MaqamError } from "../framework/errors.js";
import {
  defineResearchSourceAdapter,
  describeResearchSourceAdapter
} from "./source-adapter.js";
import { classifyResearchSourceError } from "./source-error.js";

const CHECK_OPTION_KEYS = new Set(["timeoutMs", "signal"]);
const CHECK_RESULT_KEYS = new Set(["status", "message", "details"]);
const ADAPTER_CHECK_STATUSES = new Set(["ready", "degraded", "unavailable"]);
const REPORT_CHECK_STATUSES = new Set([
  "ready", "degraded", "unavailable", "blocked", "error"
]);
const MAX_ADAPTERS = 10_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_MESSAGE_LENGTH = 100_000;

function snapshotJsonObject(value, options) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${options.label} must be a plain JSON object.`);
  }
  return snapshotJsonValue(value, options);
}

function snapshotCheckOptions(value) {
  const options = snapshotOwnDataRecord(value, {
    label: "Research source check options",
    recognizedKeys: CHECK_OPTION_KEYS
  });
  const timeoutMs = options.timeoutMs === undefined ? 5_000 : options.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new TypeError(`Research source check timeoutMs must be a safe integer between 1 and ${MAX_TIMEOUT_MS}.`);
  }
  const signal = options.signal ?? null;
  if (signal !== null && !(signal instanceof AbortSignal)) {
    throw new TypeError("Research source check signal must be an AbortSignal or null.");
  }
  return { timeoutMs, signal };
}

function normalizeCheckResult(value, adapter) {
  const result = snapshotOwnDataRecord(value, {
    label: `Research source check result for '${adapter.id}'`,
    recognizedKeys: CHECK_RESULT_KEYS
  });
  if (!Object.hasOwn(result, "status") || !ADAPTER_CHECK_STATUSES.has(result.status)) {
    throw new TypeError(
      `Research source check result for '${adapter.id}' status must be ready, degraded, or unavailable.`
    );
  }
  if (result.message !== undefined
    && (typeof result.message !== "string" || result.message.length > MAX_MESSAGE_LENGTH)) {
    throw new TypeError(
      `Research source check result for '${adapter.id}' message must be a bounded string.`
    );
  }
  return snapshotJsonValue({
    adapter: describeResearchSourceAdapter(adapter),
    status: result.status,
    message: result.message ?? null,
    details: snapshotJsonObject(result.details === undefined ? {} : result.details, {
      label: `Research source check details for '${adapter.id}'`,
      maximumDepth: 30,
      maximumNodes: 100_000,
      maximumCollectionSize: 10_000,
      maximumStringLength: 1_000_000,
      allowNullPrototype: true,
      freeze: true
    }),
    error: null
  }, {
    label: `Normalized research source check result for '${adapter.id}'`,
    allowNullPrototype: true,
    freeze: true,
    rejectRepeatedReferences: false
  });
}

function unavailableCheck(adapter) {
  return snapshotJsonValue({
    adapter: describeResearchSourceAdapter(adapter),
    status: "unavailable",
    message: "No adapter check is registered. Maqam does not probe the source implicitly.",
    details: {},
    error: null
  }, {
    label: `Unavailable research source check for '${adapter.id}'`,
    allowNullPrototype: true,
    freeze: true,
    rejectRepeatedReferences: false
  });
}

function failedCheck(adapter, error) {
  const classification = classifyResearchSourceError(error);
  return snapshotJsonValue({
    adapter: describeResearchSourceAdapter(adapter),
    status: classification.fatal ? "blocked" : "error",
    message: classification.error.message,
    details: {},
    error: classification
  }, {
    label: `Failed research source check for '${adapter.id}'`,
    allowNullPrototype: true,
    freeze: true,
    rejectRepeatedReferences: false
  });
}

function checkAbortReason(signal) {
  if (signal.reason instanceof Error) return signal.reason;
  return new MaqamError("Research source check was aborted.", {
    code: "RESEARCH_SOURCE_CHECK_ABORTED"
  });
}

function linkedCheckController(parentSignal) {
  const controller = new AbortController();
  if (parentSignal === null) return { controller, cleanup: () => {} };
  const forwardAbort = () => controller.abort(checkAbortReason(parentSignal));
  if (parentSignal.aborted) {
    forwardAbort();
    return { controller, cleanup: () => {} };
  }
  parentSignal.addEventListener("abort", forwardAbort, { once: true });
  return {
    controller,
    cleanup: () => parentSignal.removeEventListener("abort", forwardAbort)
  };
}

async function withTimeout(operation, timeoutMs, adapterId, controller) {
  let timer;
  let onAbort;
  const { signal } = controller;
  if (signal.aborted) throw checkAbortReason(signal);
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        if (signal.aborted) throw checkAbortReason(signal);
        return operation();
      }),
      new Promise((_, reject) => {
        onAbort = () => reject(checkAbortReason(signal));
        signal.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => controller.abort(new MaqamError(
          `Check for research source adapter '${adapterId}' timed out.`,
          {
            code: "RESEARCH_SOURCE_CHECK_TIMEOUT",
            details: { adapterId, timeoutMs }
          }
        )), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Run one registered in-process check with timeout and error isolation. The
 * host owns the check function; Maqam cannot prove that it is offline or free
 * of external side effects.
 */
export async function checkResearchSourceAdapter(value, options = {}) {
  const adapter = defineResearchSourceAdapter(value);
  const config = snapshotCheckOptions(options);
  if (adapter.check === null) return unavailableCheck(adapter);
  const linked = linkedCheckController(config.signal);

  try {
    const context = Object.create(null);
    Object.defineProperties(context, {
      adapter: {
        value: describeResearchSourceAdapter(adapter),
        enumerable: true,
        configurable: false,
        writable: false
      },
      signal: {
        value: linked.controller.signal,
        enumerable: true,
        configurable: false,
        writable: false
      }
    });
    Object.freeze(context);
    const rawResult = await withTimeout(
      () => adapter.check(context),
      config.timeoutMs,
      adapter.id,
      linked.controller
    );
    return normalizeCheckResult(rawResult, adapter);
  } catch (error) {
    return failedCheck(adapter, error);
  } finally {
    linked.cleanup();
  }
}

/**
 * Run all checks independently. A broken or denied adapter is represented in
 * its own result and cannot suppress the remaining checks.
 */
export async function runResearchSourceDoctor(values, options = {}) {
  const adapters = snapshotOwnDataArray(values, {
    label: "Research source doctor adapters",
    maximumLength: MAX_ADAPTERS
  }).map(defineResearchSourceAdapter);
  const config = snapshotCheckOptions(options);
  const checks = await Promise.all(adapters.map((adapter) => (
    checkResearchSourceAdapter(adapter, config)
  )));
  const summary = {
    total: checks.length,
    ready: 0,
    degraded: 0,
    unavailable: 0,
    blocked: 0,
    error: 0
  };
  for (const check of checks) summary[check.status] += 1;
  const status = summary.total === 0
    ? "unavailable"
    : summary.blocked > 0
      ? "blocked"
      : summary.error > 0
        ? "error"
        : summary.degraded > 0
          ? "degraded"
          : summary.unavailable > 0
            ? "unavailable"
            : "ready";

  return snapshotJsonValue({ status, summary, checks }, {
    label: "Research source doctor report",
    allowNullPrototype: true,
    freeze: true,
    rejectRepeatedReferences: false
  });
}

export const RESEARCH_SOURCE_CHECK_STATUSES = Object.freeze([...REPORT_CHECK_STATUSES]);
