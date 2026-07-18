import {
  deepFreezeSnapshot,
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "../framework/boundary.js";
import {
  defineResearchSourceAdapter,
  describeResearchSourceAdapter,
  researchSourceIdentifier
} from "./source-adapter.js";
import { normalizeResearchDocuments } from "./research-document.js";
import {
  classifyResearchSourceError,
  ResearchSourceAuthenticationRequiredError,
  ResearchSourceToolCallerRequiredError,
  ResearchSourceUnavailableError
} from "./source-error.js";
import { runResearchSourceDoctor } from "./source-doctor.js";

const REGISTRY_OPTION_KEYS = new Set(["adapters", "preferences", "clock", "toolCaller"]);
const ROUTE_KEYS = new Set(["channel", "input", "backendPreference", "allowAuthenticated"]);
const TOOL_CALLER_KEYS = new Set(["call"]);
const ROUTE_CONTEXT_KEYS = new Set([
  "runId", "taskId", "goal", "limits", "signal", "authorizedOrigins",
  "authorizationScope", "approvalId", "approvalIds", "requestedBy",
  "approvalEvidence", "evidence", "evidenceLedger", "approvals", "tools",
  "outputs", "trace"
]);
const CONTEXT_GOAL_KEYS = new Set([
  "runId", "objective", "allowedTools", "allowedOrigins", "budget", "approvalId",
  "approvalIds", "requestedBy", "approvalEvidence"
]);
const LIST_KEYS = new Set(["channel"]);
const DOCTOR_KEYS = new Set(["channel", "adapterIds", "timeoutMs", "signal"]);
const MAX_ADAPTERS = 10_000;
const MAX_PREFERENCES = 10_000;

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function contextStringArray(value, label) {
  const items = snapshotOwnDataArray(value, {
    label,
    maximumLength: MAX_PREFERENCES
  });
  for (let index = 0; index < items.length; index += 1) {
    items[index] = nonEmptyString(items[index], `${label}[${index}]`);
  }
  return snapshotJsonValue(items, { label, freeze: true });
}

function contextJsonObject(value, label) {
  const result = snapshotJsonValue(value, {
    label,
    maximumDepth: 100,
    maximumNodes: 100_000,
    maximumCollectionSize: 100_000,
    maximumStringLength: 5_000_000,
    allowNullPrototype: true,
    freeze: true
  });
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    throw new TypeError(`${label} must be a plain JSON object.`);
  }
  return result;
}

function contextGoal(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Research source route context.goal must be a plain JSON object.");
  }
  const goal = snapshotOwnDataRecord(value, {
    label: "Research source route context.goal",
    recognizedKeys: CONTEXT_GOAL_KEYS,
    rejectUnknown: false
  });
  for (const key of ["runId", "objective", "approvalId", "requestedBy"]) {
    if (goal[key] !== undefined) {
      goal[key] = nonEmptyString(goal[key], `Research source route context.goal.${key}`);
    }
  }
  for (const key of ["allowedTools", "allowedOrigins", "approvalIds", "approvalEvidence"]) {
    if (goal[key] !== undefined) {
      goal[key] = contextStringArray(
        goal[key],
        `Research source route context.goal.${key}`
      );
    }
  }
  if (goal.budget !== undefined) {
    goal.budget = contextJsonObject(
      goal.budget,
      "Research source route context.goal.budget"
    );
  }
  return contextJsonObject(goal, "Research source route context.goal");
}

function contextAuthorizationScope(value) {
  const scope = snapshotOwnDataRecord(value, {
    label: "Research source route context.authorizationScope",
    recognizedKeys: new Set(["allowedOrigins", "originsExplicit", "originsUnrestricted"])
  });
  for (const key of ["allowedOrigins", "originsExplicit", "originsUnrestricted"]) {
    if (!Object.hasOwn(scope, key)) {
      throw new TypeError(`Research source route context.authorizationScope requires ${key}.`);
    }
  }
  scope.allowedOrigins = contextStringArray(
    scope.allowedOrigins,
    "Research source route context.authorizationScope.allowedOrigins"
  );
  for (const key of ["originsExplicit", "originsUnrestricted"]) {
    if (typeof scope[key] !== "boolean") {
      throw new TypeError(`Research source route context.authorizationScope.${key} must be a boolean.`);
    }
  }
  return Object.freeze(scope);
}

function backendList(value, label) {
  const backends = snapshotOwnDataArray(value, {
    label,
    maximumLength: MAX_PREFERENCES
  });
  const observed = new Set();
  for (let index = 0; index < backends.length; index += 1) {
    backends[index] = researchSourceIdentifier(backends[index], `${label}[${index}]`);
    if (observed.has(backends[index])) {
      throw new TypeError(`${label} contains duplicate adapter '${backends[index]}'.`);
    }
    observed.add(backends[index]);
  }
  return backends;
}

function snapshotPreferences(value) {
  const preferences = snapshotJsonValue(value, {
    label: "Research source preferences",
    maximumDepth: 5,
    maximumNodes: 20_000,
    maximumCollectionSize: MAX_PREFERENCES,
    maximumStringLength: 200,
    allowNullPrototype: true
  });
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
    throw new TypeError("Research source preferences must be a plain object.");
  }
  const normalized = Object.create(null);
  for (const channel of Object.keys(preferences)) {
    const safeChannel = researchSourceIdentifier(channel, "Research source preference channel");
    normalized[safeChannel] = backendList(
      preferences[channel],
      `Research source preferences.${safeChannel}`
    );
  }
  return normalized;
}

function normalizeClock(value) {
  if (value === undefined) return () => new Date();
  if (typeof value !== "function") throw new TypeError("Research source registry clock must be a function.");
  return value;
}

export function defineResearchToolCaller(value) {
  const caller = snapshotOwnDataRecord(value, {
    label: "Research source ToolCaller",
    recognizedKeys: TOOL_CALLER_KEYS
  });
  if (!Object.hasOwn(caller, "call") || typeof caller.call !== "function") {
    throw new TypeError("Research source ToolCaller requires an own call function.");
  }
  const result = Object.create(null);
  Object.defineProperty(result, "call", {
    value: caller.call,
    enumerable: true,
    configurable: false,
    writable: false
  });
  return Object.freeze(result);
}

function snapshotRouteContext(value) {
  const context = snapshotOwnDataRecord(value, {
    label: "Research source route context",
    recognizedKeys: ROUTE_CONTEXT_KEYS,
    rejectUnknown: false
  });
  for (const key of ["runId", "taskId", "requestedBy"]) {
    if (context[key] !== undefined) {
      context[key] = nonEmptyString(context[key], `Research source route context.${key}`);
    }
  }
  if (context.approvalId !== undefined && context.approvalId !== null) {
    context.approvalId = nonEmptyString(
      context.approvalId,
      "Research source route context.approvalId"
    );
  }
  for (const key of ["authorizedOrigins", "approvalIds", "approvalEvidence"]) {
    if (context[key] !== undefined) {
      context[key] = contextStringArray(
        context[key],
        `Research source route context.${key}`
      );
    }
  }
  if (context.goal !== undefined && context.goal !== null) {
    context.goal = contextGoal(context.goal);
  }
  if (context.limits !== undefined && context.limits !== null) {
    context.limits = contextJsonObject(context.limits, "Research source route context.limits");
  }
  if (context.authorizationScope !== undefined && context.authorizationScope !== null) {
    context.authorizationScope = contextAuthorizationScope(context.authorizationScope);
  }
  if (context.signal !== undefined && !(context.signal instanceof AbortSignal)) {
    throw new TypeError("Research source route context.signal must be an AbortSignal.");
  }
  if (context.outputs !== undefined) {
    context.outputs = contextJsonObject(context.outputs, "Research source route context.outputs");
  }
  for (const key of ["approvals", "trace"]) {
    if (context[key] !== undefined && !Array.isArray(context[key])) {
      throw new TypeError(`Research source route context.${key} must be an array.`);
    }
  }
  for (const key of ["evidence", "evidenceLedger", "tools"]) {
    if (context[key] !== undefined && context[key] !== null
      && (typeof context[key] !== "object" && typeof context[key] !== "function")) {
      throw new TypeError(`Research source route context.${key} must be an object or null.`);
    }
  }
  return Object.freeze(context);
}

function observedTimestamp(clock) {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("Research source registry clock must return a valid Date.");
  }
  return value.toISOString();
}

function normalizeRouteRequest(value) {
  const request = snapshotOwnDataRecord(value, {
    label: "Research source route request",
    recognizedKeys: ROUTE_KEYS
  });
  if (!Object.hasOwn(request, "channel")) {
    throw new TypeError("Research source route request requires channel.");
  }
  if (request.allowAuthenticated !== undefined && typeof request.allowAuthenticated !== "boolean") {
    throw new TypeError("Research source route request allowAuthenticated must be a boolean.");
  }
  const input = snapshotJsonValue(request.input === undefined ? {} : request.input, {
    label: "Research source route input",
    maximumDepth: 100,
    maximumNodes: 100_000,
    maximumCollectionSize: 100_000,
    maximumStringLength: 5_000_000,
    allowNullPrototype: true,
    freeze: true
  });
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Research source route input must be a plain JSON object.");
  }
  return {
    channel: researchSourceIdentifier(request.channel, "Research source route request channel"),
    input,
    backendPreference: request.backendPreference === undefined
      ? null
      : backendList(request.backendPreference, "Research source route backendPreference"),
    allowAuthenticated: request.allowAuthenticated === true
  };
}

function gatewayCompatibleJson(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(gatewayCompatibleJson);
  const result = {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(result, key, {
      value: gatewayCompatibleJson(value[key]),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return result;
}

function completedAttempt(adapter) {
  return snapshotJsonValue({
    adapterId: adapter.id,
    toolName: adapter.toolName,
    status: "completed"
  }, {
    label: "Research source completed attempt",
    allowNullPrototype: true,
    freeze: true
  });
}

function failedAttempt(adapter, error) {
  const classification = classifyResearchSourceError(error);
  return snapshotJsonValue({
    adapterId: adapter.id,
    toolName: adapter.toolName,
    status: classification.kind,
    classification
  }, {
    label: "Research source failed attempt",
    allowNullPrototype: true,
    freeze: true,
    rejectRepeatedReferences: false
  });
}

export class ResearchSourceRegistry {
  #entries = new Map();
  #toolNames = new Set();
  #preferences;
  #clock;
  #toolCaller;
  #registrationIndex = 0;

  constructor(options = {}) {
    const input = snapshotOwnDataRecord(options, {
      label: "ResearchSourceRegistry options",
      recognizedKeys: REGISTRY_OPTION_KEYS
    });
    this.#preferences = snapshotPreferences(
      input.preferences === undefined ? {} : input.preferences
    );
    this.#clock = normalizeClock(input.clock);
    this.#toolCaller = input.toolCaller === undefined
      ? null
      : defineResearchToolCaller(input.toolCaller);
    const adapters = snapshotOwnDataArray(input.adapters === undefined ? [] : input.adapters, {
      label: "ResearchSourceRegistry options.adapters",
      maximumLength: MAX_ADAPTERS
    });
    for (const adapter of adapters) this.register(adapter);
    this.#validateConfiguredPreferences();
  }

  register(value) {
    if (this.#entries.size >= MAX_ADAPTERS) {
      throw new TypeError(`ResearchSourceRegistry cannot exceed ${MAX_ADAPTERS} adapters.`);
    }
    const adapter = defineResearchSourceAdapter(value);
    if (this.#entries.has(adapter.id)) {
      throw new TypeError(`Research source adapter '${adapter.id}' is already registered.`);
    }
    if (this.#toolNames.has(adapter.toolName)) {
      throw new TypeError(`Research source tool '${adapter.toolName}' is already registered by another adapter.`);
    }
    this.#entries.set(adapter.id, {
      adapter,
      index: this.#registrationIndex
    });
    this.#toolNames.add(adapter.toolName);
    this.#registrationIndex += 1;
    return describeResearchSourceAdapter(adapter);
  }

  get(id) {
    id = researchSourceIdentifier(id, "Research source adapter id");
    const entry = this.#entries.get(id);
    return entry ? describeResearchSourceAdapter(entry.adapter) : null;
  }

  list(options = {}) {
    const query = snapshotOwnDataRecord(options, {
      label: "Research source list options",
      recognizedKeys: LIST_KEYS
    });
    const channel = query.channel === undefined
      ? null
      : researchSourceIdentifier(query.channel, "Research source list channel");
    return snapshotJsonValue(
      this.#orderedEntries(channel).map(({ adapter }) => describeResearchSourceAdapter(adapter)),
      {
        label: "Research source adapter list",
        allowNullPrototype: true,
        freeze: true,
        rejectRepeatedReferences: false
      }
    );
  }

  resolve(channel, options = {}) {
    channel = researchSourceIdentifier(channel, "Research source channel");
    const query = snapshotOwnDataRecord(options, {
      label: "Research source resolve options",
      recognizedKeys: new Set(["backendPreference"])
    });
    const preference = query.backendPreference === undefined
      ? null
      : backendList(query.backendPreference, "Research source resolve backendPreference");
    return snapshotJsonValue(
      this.#selectEntries(channel, preference).map(({ adapter }) => describeResearchSourceAdapter(adapter)),
      {
        label: "Resolved research source adapters",
        allowNullPrototype: true,
        freeze: true,
        rejectRepeatedReferences: false
      }
    );
  }

  async route(value, context = {}) {
    if (this.#toolCaller === null) {
      throw new ResearchSourceToolCallerRequiredError(
        "Governed research routing requires a ToolCaller. Pass an own bound call function as options.toolCaller.",
        { details: { requiredOption: "toolCaller", directAlternative: "routeUngoverned" } }
      );
    }
    const safeContext = snapshotRouteContext(context);
    return this.#route(value, {
      mode: "tool-caller",
      invoke: (adapter, input) => this.#toolCaller.call(adapter.toolName, input, safeContext)
    });
  }

  async routeUngoverned(value) {
    return this.#route(value, {
      mode: "explicitly-ungoverned-direct",
      invoke: (adapter, input, adapterContext) => {
        if (adapter.read === null) {
          throw new ResearchSourceUnavailableError(
            `Research source adapter '${adapter.id}' has no direct read implementation.`,
            { details: { adapterId: adapter.id, toolName: adapter.toolName } }
          );
        }
        return adapter.read(input, adapterContext);
      }
    });
  }

  async #route(value, { mode, invoke }) {
    const request = normalizeRouteRequest(value);
    const executionInput = mode === "tool-caller"
      ? deepFreezeSnapshot(gatewayCompatibleJson(request.input))
      : request.input;
    const entries = this.#selectEntries(request.channel, request.backendPreference);
    if (entries.length === 0) {
      throw new ResearchSourceUnavailableError(
        `No research source adapter is registered for channel '${request.channel}'.`,
        { details: { channel: request.channel, attempts: [] } }
      );
    }

    const attempts = [];
    for (const { adapter } of entries) {
      if (adapter.authentication === "required" && !request.allowAuthenticated) {
        throw new ResearchSourceAuthenticationRequiredError(
          `Research source adapter '${adapter.id}' requires explicit authenticated routing.`,
          {
            details: {
              adapterId: adapter.id,
              channel: adapter.channel,
              toolName: adapter.toolName,
              attempts,
              requiredOption: "allowAuthenticated"
            }
          }
        );
      }

      try {
        const adapterContext = snapshotJsonValue({
          adapter: describeResearchSourceAdapter(adapter)
        }, {
          label: "Research source adapter context",
          allowNullPrototype: true,
          freeze: true,
          rejectRepeatedReferences: false
        });
        const rawDocuments = await invoke(adapter, executionInput, adapterContext);
        const retrievedAt = observedTimestamp(this.#clock);
        const documents = normalizeResearchDocuments(rawDocuments, {
          adapterId: adapter.id,
          channel: adapter.channel,
          retrievedAt
        });
        attempts.push(completedAttempt(adapter));
        return snapshotJsonValue({
          adapter: describeResearchSourceAdapter(adapter),
          documents,
          attempts,
          governance: {
            mode,
            toolName: adapter.toolName
          }
        }, {
          label: "Research source route result",
          allowNullPrototype: true,
          freeze: true,
          rejectRepeatedReferences: false
        });
      } catch (error) {
        const classification = classifyResearchSourceError(error);
        if (classification.kind !== "unavailable") throw error;
        attempts.push(failedAttempt(adapter, error));
      }
    }

    throw new ResearchSourceUnavailableError(
      `Every research source adapter for channel '${request.channel}' failed.`,
      { details: { channel: request.channel, attempts } }
    );
  }

  async doctor(options = {}) {
    const query = snapshotOwnDataRecord(options, {
      label: "Research source doctor options",
      recognizedKeys: DOCTOR_KEYS
    });
    const channel = query.channel === undefined
      ? null
      : researchSourceIdentifier(query.channel, "Research source doctor channel");
    const adapterIds = query.adapterIds === undefined
      ? null
      : backendList(query.adapterIds, "Research source doctor adapterIds");
    let entries = this.#orderedEntries(channel);
    if (adapterIds) {
      const selected = new Set(adapterIds);
      for (const adapterId of adapterIds) {
        const entry = this.#entries.get(adapterId);
        if (!entry || (channel !== null && entry.adapter.channel !== channel)) {
          throw new TypeError(`Research source doctor adapter '${adapterId}' is not registered in the selected scope.`);
        }
      }
      entries = entries.filter(({ adapter }) => selected.has(adapter.id));
    }
    return runResearchSourceDoctor(entries.map(({ adapter }) => adapter), {
      timeoutMs: query.timeoutMs,
      signal: query.signal
    });
  }

  #orderedEntries(channel) {
    return [...this.#entries.values()]
      .filter(({ adapter }) => channel === null || adapter.channel === channel)
      .sort((left, right) => (
        left.adapter.priority - right.adapter.priority
        || left.index - right.index
        || left.adapter.id.localeCompare(right.adapter.id)
      ));
  }

  #selectEntries(channel, explicitPreference) {
    const entries = this.#orderedEntries(channel);
    const preference = explicitPreference ?? this.#preferences[channel] ?? [];
    if (preference.length === 0) return entries;
    const byId = new Map(entries.map((entry) => [entry.adapter.id, entry]));
    for (const adapterId of preference) {
      if (!byId.has(adapterId)) {
        throw new TypeError(
          `Research source preference '${adapterId}' is not registered for channel '${channel}'.`
        );
      }
    }
    const preferred = preference.map((adapterId) => byId.get(adapterId));
    const selected = new Set(preference);
    return [...preferred, ...entries.filter(({ adapter }) => !selected.has(adapter.id))];
  }

  #validateConfiguredPreferences() {
    for (const [channel, preference] of Object.entries(this.#preferences)) {
      this.#selectEntries(channel, preference);
    }
  }
}
