const APPROVAL_STATUSES = new Set(["pending", "approved", "rejected"]);
const MAX_JSON_DEPTH = 100;
const MAX_JSON_NODES = 100_000;
const MAX_COLLECTION_SIZE = 100_000;
const MAX_STRING_LENGTH = 1_000_000;

function cloneJson(value, path = "$", seen = new WeakSet(), state = { nodes: 0 }, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES) throw new TypeError(`Approval JSON exceeds ${MAX_JSON_NODES} values.`);
  if (depth > MAX_JSON_DEPTH) throw new TypeError(`Approval JSON exceeds maximum depth ${MAX_JSON_DEPTH}.`);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) throw new TypeError(`Approval JSON string at '${path}' is too large.`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError(`Approval JSON number at '${path}' must be finite and cannot be -0.`);
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`Approval JSON at '${path}' contains unsupported type '${typeof value}'.`);
  }
  if (seen.has(value)) throw new TypeError(`Approval JSON at '${path}' contains a cycle or repeated reference.`);
  seen.add(value);

  if (Array.isArray(value)) {
    if (value.length > MAX_COLLECTION_SIZE) {
      throw new TypeError(`Approval JSON array at '${path}' exceeds ${MAX_COLLECTION_SIZE} items.`);
    }
    const keys = Reflect.ownKeys(value);
    const allowed = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
      throw new TypeError(`Approval JSON array at '${path}' contains extra or symbol properties.`);
    }
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new TypeError(`Approval JSON at '${path}[${index}]' must be a dense enumerable data property.`);
      }
      return cloneJson(descriptor.value, `${path}[${index}]`, seen, state, depth + 1);
    });
  }

  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`Approval JSON at '${path}' must use plain objects and arrays.`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_COLLECTION_SIZE) {
    throw new TypeError(`Approval JSON object at '${path}' exceeds ${MAX_COLLECTION_SIZE} keys.`);
  }
  if (keys.some((key) => typeof key !== "string")) {
    throw new TypeError(`Approval JSON object at '${path}' cannot contain symbol keys.`);
  }
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new TypeError(`Approval JSON at '${path}.${key}' must be an enumerable data property.`);
    }
    Object.defineProperty(result, key, {
      value: cloneJson(descriptor.value, `${path}.${key}`, seen, state, depth + 1),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return result;
}

function clone(value) {
  return cloneJson(value);
}

function requireRecord(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${path} must be a plain object.`);
  }
  return value;
}

function requireString(value, path, { nullable = false, empty = false } = {}) {
  if (nullable && value === null) return value;
  if (typeof value !== "string" || (!empty && value.trim() === "")) {
    throw new TypeError(`${path} must be ${nullable ? "null or " : ""}a${empty ? "" : " non-empty"} string.`);
  }
  return value;
}

function requireTimestamp(value, path) {
  requireString(value, path);
  if (!Number.isFinite(Date.parse(value))) throw new TypeError(`${path} must be a valid timestamp string.`);
  return value;
}

function requireRisk(value, path) {
  // Maqam 0.2.0 documented custom risk labels. Preserve that public surface
  // in this patch while still rejecting malformed persisted values.
  return requireString(value, path);
}

function validateConsumption(value, path) {
  requireRecord(value, path);
  requireTimestamp(value.consumedAt, `${path}.consumedAt`);
  requireString(value.consumedBy, `${path}.consumedBy`);
  requireString(value.runId, `${path}.runId`, { nullable: true });
  requireString(value.toolName, `${path}.toolName`, { nullable: true });
}

function validateDecision(value, path) {
  requireRecord(value, path);
  requireString(value.decidedBy, `${path}.decidedBy`);
  requireString(value.note, `${path}.note`, { empty: true });
  requireTimestamp(value.decidedAt, `${path}.decidedAt`);
}

function validateApprovalRecord(value, index) {
  const record = clone(value);
  const path = `approvals[${index}]`;
  requireRecord(record, path);
  if (!/^approval_[1-9]\d*$/.test(record.approvalId || "")) {
    throw new TypeError(`${path}.approvalId must match 'approval_<positive integer>'.`);
  }
  const approvalNumber = Number(record.approvalId.slice("approval_".length));
  if (!Number.isSafeInteger(approvalNumber) || approvalNumber >= Number.MAX_SAFE_INTEGER - 1) {
    throw new TypeError(`${path}.approvalId is outside the safe sequence range.`);
  }
  if (!APPROVAL_STATUSES.has(record.status)) {
    throw new TypeError(`${path}.status must be pending, approved, or rejected.`);
  }
  requireString(record.action, `${path}.action`);
  requireString(record.requestedBy, `${path}.requestedBy`);
  requireString(record.reason, `${path}.reason`);
  requireRisk(record.risk, `${path}.risk`);
  requireRecord(record.subject, `${path}.subject`);
  if (!Array.isArray(record.evidence)) throw new TypeError(`${path}.evidence must be an array.`);
  record.evidence.forEach((entry, evidenceIndex) => {
    requireString(entry, `${path}.evidence[${evidenceIndex}]`, { empty: true });
  });
  if (typeof record.reusable !== "boolean") throw new TypeError(`${path}.reusable must be a boolean.`);
  requireTimestamp(record.requestedAt, `${path}.requestedAt`);
  if (!Array.isArray(record.consumptions)) throw new TypeError(`${path}.consumptions must be an array.`);
  record.consumptions.forEach((consumption, consumptionIndex) => (
    validateConsumption(consumption, `${path}.consumptions[${consumptionIndex}]`)
  ));

  if (record.status === "pending") {
    if (record.decision !== undefined) throw new TypeError(`${path}.decision is not allowed while pending.`);
    if (record.consumptions.length) throw new TypeError(`${path} cannot be consumed while pending.`);
  } else {
    validateDecision(record.decision, `${path}.decision`);
    if (record.status === "rejected" && record.consumptions.length) {
      throw new TypeError(`${path} cannot be consumed after rejection.`);
    }
  }
  return record;
}

function validateApprovals(value) {
  if (!Array.isArray(value)) throw new TypeError("ApprovalQueue approvals must be an array.");
  if (value.length > MAX_COLLECTION_SIZE) throw new TypeError("ApprovalQueue contains too many approvals.");
  const approvals = value.map(validateApprovalRecord);
  const ids = new Set();
  for (const approval of approvals) {
    if (ids.has(approval.approvalId)) throw new TypeError(`Duplicate approval id '${approval.approvalId}'.`);
    ids.add(approval.approvalId);
  }
  return approvals;
}

function isoNow(clock) {
  return clock().toISOString();
}

function nextIdFromApprovals(approvals) {
  const highest = approvals.reduce((max, approval) => {
    const match = /^approval_(\d+)$/.exec(approval.approvalId || "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return highest + 1;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
  );
}

function sameSubject(left = {}, right = {}) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

export class ApprovalQueue {
  constructor(options = {}) {
    if (typeof options.clock !== "undefined" && typeof options.clock !== "function") {
      throw new TypeError("ApprovalQueue clock must be a function.");
    }
    this.clock = options.clock || (() => new Date());
    this.approvals = options.approvals === undefined ? [] : validateApprovals(options.approvals);
    const minimumNextId = nextIdFromApprovals(this.approvals);
    if (options.nextId !== undefined
      && (!Number.isSafeInteger(options.nextId)
        || options.nextId < minimumNextId
        || options.nextId >= Number.MAX_SAFE_INTEGER)) {
      throw new TypeError(`ApprovalQueue nextId must be an integer at least ${minimumNextId}.`);
    }
    this.nextId = options.nextId ?? minimumNextId;
  }

  requestApproval(input = {}) {
    const request = clone(input);
    requireRecord(request, "Approval request");
    const action = request.action ?? "unknown";
    const requestedBy = request.requestedBy ?? "system";
    const reason = request.reason ?? "Approval requested.";
    const risk = request.risk ?? "medium";
    requireString(action, "Approval request action");
    requireString(requestedBy, "Approval request requestedBy");
    requireString(reason, "Approval request reason");
    requireRisk(risk, "Approval request risk");
    if (request.reusable !== undefined && typeof request.reusable !== "boolean") {
      throw new TypeError("Approval request reusable must be a boolean.");
    }
    const subject = request.subject ?? {};
    const evidence = request.evidence ?? [];
    requireRecord(subject, "Approval request subject");
    if (!Array.isArray(evidence)) throw new TypeError("Approval request evidence must be an array.");
    evidence.forEach((entry, index) => {
      requireString(entry, `Approval request evidence[${index}]`, { empty: true });
    });
    const approval = {
      approvalId: `approval_${this.nextId}`,
      status: "pending",
      action,
      requestedBy,
      reason,
      risk,
      subject,
      evidence,
      reusable: request.reusable === true,
      consumptions: [],
      requestedAt: isoNow(this.clock)
    };

    this.nextId += 1;
    this.approvals.push(approval);
    return clone(approval);
  }

  get(approvalId) {
    const approval = this.approvals.find((item) => item.approvalId === approvalId);
    return approval ? clone(approval) : null;
  }

  pending() {
    return this.approvals
      .filter((approval) => approval.status === "pending")
      .map((approval) => clone(approval));
  }

  findMatching(input = {}) {
    const query = clone(input);
    requireRecord(query, "Approval query");
    const { action, status = "pending", subject = {} } = query;
    if (!APPROVAL_STATUSES.has(status)) throw new TypeError("Approval status is invalid.");
    const expectedSubject = subject;
    requireRecord(expectedSubject, "Approval subject");
    const approval = this.approvals.find((item) => (
      item.action === action
      && item.status === status
      && sameSubject(item.subject, expectedSubject)
    ));
    return approval ? clone(approval) : null;
  }

  approve(approvalId, decision = {}) {
    return this.#decide(approvalId, "approved", decision);
  }

  reject(approvalId, decision = {}) {
    return this.#decide(approvalId, "rejected", decision);
  }

  consume(approvalId, usage = {}) {
    return this.consumeMany([{ approvalId, usage }])[0];
  }

  consumeMany(requests = []) {
    if (!Array.isArray(requests) || requests.length === 0) return [];

    const safeRequests = clone(requests);

    const seen = new Set();
    const prepared = safeRequests.map((request) => {
      requireRecord(request, "Approval consumption request");
      const approvalId = request?.approvalId;
      if (!approvalId || seen.has(approvalId)) {
        throw new Error(`Approval consumption requires unique approval ids; received '${approvalId || "unknown"}'.`);
      }
      seen.add(approvalId);

      const index = this.approvals.findIndex((approval) => approval.approvalId === approvalId);
      if (index === -1) throw new Error(`Approval '${approvalId}' was not found.`);

      const current = this.approvals[index];
      if (current.status !== "approved") {
        throw new Error(`Approval '${approvalId}' is ${current.status}, not approved.`);
      }

      const consumptions = current.consumptions || [];
      if (!current.reusable && consumptions.length) {
        throw new Error(`Approval '${approvalId}' has already been consumed.`);
      }

      const usage = request.usage ?? {};
      requireRecord(usage, "Approval consumption usage");
      for (const [key, fallback] of [
        ["consumedBy", "tool-gateway"],
        ["runId", null],
        ["toolName", null]
      ]) {
        const value = usage[key] ?? fallback;
        if (key === "consumedBy") requireString(value, `Approval consumption ${key}`);
        else requireString(value, `Approval consumption ${key}`, { nullable: true });
      }

      return { index, current, usage };
    });

    const consumedAt = isoNow(this.clock);
    const updated = prepared.map(({ index, current, usage }) => {
      const approval = {
        ...current,
        consumptions: [
          ...(current.consumptions || []),
          {
            consumedAt,
            consumedBy: usage.consumedBy || "tool-gateway",
            runId: usage.runId || null,
            toolName: usage.toolName || null
          }
        ]
      };
      this.approvals[index] = approval;
      return clone(approval);
    });

    return updated;
  }

  #decide(approvalId, status, decision) {
    const index = this.approvals.findIndex((approval) => approval.approvalId === approvalId);
    if (index === -1) {
      throw new Error(`Approval '${approvalId}' was not found.`);
    }

    const current = this.approvals[index];
    if (current.status !== "pending") {
      throw new Error(`Approval '${approvalId}' is already ${current.status}.`);
    }

    const safeDecision = clone(decision);
    requireRecord(safeDecision, "Approval decision");
    const decidedBy = safeDecision.decidedBy ?? "system";
    const note = safeDecision.note ?? "";
    requireString(decidedBy, "Approval decision decidedBy");
    requireString(note, "Approval decision note", { empty: true });

    const updated = {
      ...current,
      status,
      decision: {
        decidedBy,
        note,
        decidedAt: isoNow(this.clock)
      }
    };

    this.approvals[index] = updated;
    return clone(updated);
  }

  toJSON() {
    return {
      approvals: clone(this.approvals),
      nextId: this.nextId
    };
  }

  static fromJSON(data = {}, options = {}) {
    const serialized = clone(data);
    requireRecord(serialized, "ApprovalQueue JSON");
    const unknownKeys = Reflect.ownKeys(serialized).filter((key) => !["approvals", "nextId"].includes(key));
    if (unknownKeys.length) throw new TypeError("ApprovalQueue JSON contains unknown fields.");
    const approvals = validateApprovals(serialized.approvals ?? []);
    const minimumNextId = nextIdFromApprovals(approvals);
    const nextId = serialized.nextId ?? minimumNextId;
    if (!Number.isSafeInteger(nextId) || nextId < minimumNextId || nextId >= Number.MAX_SAFE_INTEGER) {
      throw new TypeError(`ApprovalQueue nextId must be an integer at least ${minimumNextId}.`);
    }
    return new ApprovalQueue({
      ...options,
      approvals,
      nextId
    });
  }
}
