const DEFAULT_MAX_DEPTH = 100;
const DEFAULT_MAX_NODES = 100_000;
const DEFAULT_MAX_COLLECTION_SIZE = 100_000;
const DEFAULT_MAX_STRING_LENGTH = 1_000_000;

// Arrays used at security boundaries must not inherit later Object.prototype
// pollution, but should retain the standard Array methods and iterator. Copy
// the pristine Array.prototype surface onto an isolated null-prototype object.
const SAFE_ARRAY_PROTOTYPE = Object.create(null);
Object.defineProperties(
  SAFE_ARRAY_PROTOTYPE,
  Object.getOwnPropertyDescriptors(Array.prototype)
);
Object.freeze(SAFE_ARRAY_PROTOTYPE);

function asRecognizedKeySet(keys) {
  if (keys instanceof Set) return keys;
  if (Array.isArray(keys)) return new Set(keys);
  throw new TypeError("recognizedKeys must be an array or Set.");
}

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

export function snapshotOwnDataRecord(value, {
  label = "Value",
  recognizedKeys,
  rejectUnknown = true,
  requireEnumerable = true
} = {}) {
  assertRecord(value, label);
  const allowed = asRecognizedKeySet(recognizedKeys);
  const descriptors = Object.getOwnPropertyDescriptors(value);

  for (const key of allowed) {
    if (typeof key !== "string") throw new TypeError(`${label} recognized keys must be strings.`);
    const descriptor = Object.hasOwn(descriptors, key) ? descriptors[key] : null;
    if (!descriptor && key in value) {
      throw new TypeError(`Inherited ${label} field '${key}' is not allowed.`);
    }
    if (descriptor && (!Object.hasOwn(descriptor, "value")
      || (requireEnumerable && !descriptor.enumerable))) {
      throw new TypeError(`${label} field '${key}' must be an own${requireEnumerable ? " enumerable" : ""} data property.`);
    }
  }

  const snapshot = Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    const printableKey = typeof key === "symbol" ? key.toString() : key;
    if (typeof key !== "string" || (rejectUnknown && !allowed.has(key))) {
      throw new TypeError(`Unknown ${label} field '${printableKey}'.`);
    }
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || (requireEnumerable && !descriptor.enumerable)) {
      throw new TypeError(`${label} field '${key}' must be an own${requireEnumerable ? " enumerable" : ""} data property.`);
    }
    Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return snapshot;
}

export function snapshotOwnDataArray(value, {
  label = "Value",
  maximumLength = DEFAULT_MAX_COLLECTION_SIZE
} = {}) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  if (value.length > maximumLength) {
    throw new TypeError(`${label} cannot exceed ${maximumLength} items.`);
  }
  const keys = Reflect.ownKeys(value);
  const allowedKeys = new Set([
    "length",
    ...Array.from({ length: value.length }, (_, index) => String(index))
  ]);
  if (keys.some((key) => typeof key !== "string" || !allowedKeys.has(key))) {
    throw new TypeError(`${label} must be dense and cannot contain extra or symbol properties.`);
  }

  const snapshot = new Array(value.length);
  Object.setPrototypeOf(snapshot, SAFE_ARRAY_PROTOTYPE);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(
        `${label} must be dense; ${label}[${index}] must be an own enumerable data property.`
      );
    }
    snapshot[index] = descriptor.value;
  }
  return snapshot;
}

export function snapshotJsonValue(value, {
  label = "JSON value",
  maximumDepth = DEFAULT_MAX_DEPTH,
  maximumNodes = DEFAULT_MAX_NODES,
  maximumCollectionSize = DEFAULT_MAX_COLLECTION_SIZE,
  maximumStringLength = DEFAULT_MAX_STRING_LENGTH,
  allowNullPrototype = true,
  sortKeys = false,
  freeze = false,
  rejectRepeatedReferences = true
} = {}) {
  const seen = new WeakSet();
  const state = { nodes: 0 };

  const visit = (current, path, depth) => {
    state.nodes += 1;
    if (state.nodes > maximumNodes) throw new TypeError(`${label} exceeds ${maximumNodes} values.`);
    if (depth > maximumDepth) throw new TypeError(`${label} exceeds maximum depth ${maximumDepth}.`);
    if (current === null || typeof current === "boolean") return current;
    if (typeof current === "string") {
      if (current.length > maximumStringLength) {
        throw new TypeError(`${label} string at '${path}' is too large.`);
      }
      return current;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw new TypeError(`${label} at '${path}' must contain only finite numbers.`);
      if (Object.is(current, -0)) throw new TypeError(`${label} at '${path}' cannot contain -0.`);
      return current;
    }
    if (typeof current !== "object") {
      throw new TypeError(`${label} at '${path}' contains unsupported type '${typeof current}'.`);
    }
    if (seen.has(current)) {
      throw new TypeError(`${label} at '${path}' contains a cycle or repeated reference.`);
    }
    seen.add(current);

    if (Array.isArray(current)) {
      const source = snapshotOwnDataArray(current, {
        label: `${label} at '${path}'`,
        maximumLength: maximumCollectionSize
      });
      const result = new Array(source.length);
      Object.setPrototypeOf(result, SAFE_ARRAY_PROTOTYPE);
      for (let index = 0; index < source.length; index += 1) {
        result[index] = visit(source[index], `${path}[${index}]`, depth + 1);
      }
      if (freeze) Object.freeze(result);
      if (!rejectRepeatedReferences) seen.delete(current);
      return result;
    }

    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && !(allowNullPrototype && prototype === null)) {
      throw new TypeError(`${label} at '${path}' must use plain JSON objects and arrays.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(current);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length > maximumCollectionSize) {
      throw new TypeError(`${label} object at '${path}' exceeds ${maximumCollectionSize} keys.`);
    }
    if (keys.some((key) => typeof key !== "string")) {
      throw new TypeError(`${label} object at '${path}' cannot contain symbol keys.`);
    }
    const orderedKeys = sortKeys ? [...keys].sort() : keys;
    const result = Object.create(null);
    for (const key of orderedKeys) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
        throw new TypeError(`${label} at '${path}.${key}' must be an own enumerable data property.`);
      }
      Object.defineProperty(result, key, {
        value: visit(descriptor.value, `${path}.${key}`, depth + 1),
        enumerable: true,
        configurable: !freeze,
        writable: !freeze
      });
    }
    if (freeze) Object.freeze(result);
    if (!rejectRepeatedReferences) seen.delete(current);
    return result;
  };

  return visit(value, "$", 0);
}

export function deepFreezeSnapshot(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length" && Array.isArray(value)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, "value")) {
      deepFreezeSnapshot(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

export function ownDataValue(record, key, {
  label = "Value",
  required = false,
  requireEnumerable = true
} = {}) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) {
    if (required) throw new TypeError(`${label} is missing '${key}'.`);
    if (key in record) throw new TypeError(`Inherited ${label} field '${key}' is not allowed.`);
    return undefined;
  }
  if (!Object.hasOwn(descriptor, "value") || (requireEnumerable && !descriptor.enumerable)) {
    throw new TypeError(`${label} field '${key}' must be an own${requireEnumerable ? " enumerable" : ""} data property.`);
  }
  return descriptor.value;
}

export { SAFE_ARRAY_PROTOTYPE };
