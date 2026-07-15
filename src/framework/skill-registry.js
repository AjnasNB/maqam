import {
  snapshotJsonValue,
  snapshotOwnDataArray,
  snapshotOwnDataRecord
} from "./boundary.js";

const MAX_SKILLS = 10_000;
const MAX_TEXT_LENGTH = 10_000;
const MAX_SKILL_STRING_LENGTH = 500;
const MAX_SKILL_LIST_LENGTH = 1_000;

function requiredString(value, label, maximumLength = MAX_SKILL_STRING_LENGTH) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  if (value.length > maximumLength) {
    throw new TypeError(`${label} cannot exceed ${maximumLength} characters.`);
  }
  return value;
}

function queryText(value, label) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string.`);
  if (value.length > MAX_TEXT_LENGTH) {
    throw new TypeError(`${label} cannot exceed ${MAX_TEXT_LENGTH} characters.`);
  }
  return value;
}

function stringArray(value, label) {
  const snapshot = snapshotOwnDataArray(value, {
    label,
    maximumLength: MAX_SKILL_LIST_LENGTH
  });
  for (let index = 0; index < snapshot.length; index += 1) {
    snapshot[index] = requiredString(snapshot[index], `${label}[${index}]`);
  }
  return snapshot;
}

function normalizeSkill(value) {
  const input = snapshotOwnDataRecord(value, {
    label: "Skill",
    recognizedKeys: [
      "id", "name", "version", "triggers", "capabilities", "trustLevel", "evalScore", "metadata"
    ]
  });
  for (const field of ["id", "name", "version"]) {
    if (!Object.hasOwn(input, field)) throw new TypeError(`Skill requires ${field}.`);
  }
  const evalScore = input.evalScore ?? 0;
  if (typeof evalScore !== "number" || !Number.isFinite(evalScore)) {
    throw new TypeError("Skill evalScore must be a finite number.");
  }

  return snapshotJsonValue({
    id: requiredString(input.id, "Skill id"),
    name: requiredString(input.name, "Skill name"),
    version: requiredString(input.version, "Skill version"),
    triggers: stringArray(input.triggers ?? [], "Skill triggers"),
    capabilities: stringArray(input.capabilities ?? [], "Skill capabilities"),
    trustLevel: requiredString(input.trustLevel ?? "community", "Skill trustLevel"),
    evalScore,
    metadata: snapshotJsonValue(input.metadata ?? {}, {
      label: "Skill metadata",
      maximumDepth: 30,
      maximumNodes: 10_000,
      maximumCollectionSize: 1_000,
      maximumStringLength: 100_000,
      allowNullPrototype: true
    })
  }, {
    label: "Skill record",
    allowNullPrototype: true,
    freeze: true
  });
}

function snapshotQuery(value, { selection = false } = {}) {
  const query = snapshotOwnDataRecord(value, {
    label: "Skill query",
    recognizedKeys: selection ? ["text", "trigger", "capabilities"] : ["text", "capabilities"]
  });
  for (const key of selection ? ["text", "trigger"] : ["text"]) {
    if (query[key] !== undefined) {
      query[key] = queryText(query[key], `Skill query ${key}`);
    }
  }
  query.capabilities = stringArray(query.capabilities ?? [], "Skill query capabilities");
  return query;
}

function containsAny(text, values) {
  const haystack = text.toLowerCase();
  return values.some((value) => haystack.includes(value.toLowerCase()));
}

function cloneRecord(value) {
  return snapshotJsonValue(value, {
    label: "Skill output",
    allowNullPrototype: true
  });
}

export class SkillRegistry {
  #skills = new Map();

  constructor(options = {}) {
    const safeOptions = snapshotOwnDataRecord(options, {
      label: "SkillRegistry options",
      recognizedKeys: ["skills"]
    });
    const skills = snapshotOwnDataArray(safeOptions.skills ?? [], {
      label: "SkillRegistry options.skills",
      maximumLength: MAX_SKILLS
    });
    for (const skill of skills) this.register(skill);
  }

  register(input) {
    if (this.#skills.size >= MAX_SKILLS) {
      throw new TypeError(`SkillRegistry cannot exceed ${MAX_SKILLS} skills.`);
    }
    const skill = normalizeSkill(input);
    if (this.#skills.has(skill.id)) {
      throw new TypeError(`Skill '${skill.id}' is already registered.`);
    }
    this.#skills.set(skill.id, skill);
    return cloneRecord(skill);
  }

  get(id) {
    id = requiredString(id, "Skill id");
    const skill = this.#skills.get(id);
    return skill ? cloneRecord(skill) : null;
  }

  list() {
    return snapshotJsonValue([...this.#skills.values()], {
      label: "Skill list",
      allowNullPrototype: true
    });
  }

  find(query = {}) {
    query = snapshotQuery(query);
    const text = query.text ?? "";
    const requiredCapabilities = query.capabilities;
    const matches = this.list()
      .filter((skill) => {
        const triggerMatch = !text || containsAny(text, skill.triggers);
        const capabilityMatch = requiredCapabilities.every((capability) => skill.capabilities.includes(capability));
        return triggerMatch && capabilityMatch;
      })
      .sort((a, b) => b.evalScore - a.evalScore || a.id.localeCompare(b.id));
    return snapshotJsonValue(matches, {
      label: "Skill matches",
      allowNullPrototype: true
    });
  }

  findByCapability(capability) {
    capability = requiredString(capability, "Skill capability");
    return this.find({ capabilities: [capability] });
  }

  select(query = {}) {
    query = snapshotQuery(query, { selection: true });
    return this.find({
      text: query.trigger ?? query.text ?? "",
      capabilities: query.capabilities
    });
  }
}
