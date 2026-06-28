function normalizeSkill(input) {
  if (!input?.id || !input?.name || !input?.version) {
    throw new TypeError("Skill requires id, name, and version.");
  }
  return {
    id: input.id,
    name: input.name,
    version: input.version,
    triggers: input.triggers || [],
    capabilities: input.capabilities || [],
    trustLevel: input.trustLevel || "community",
    evalScore: Number.isFinite(Number(input.evalScore)) ? Number(input.evalScore) : 0,
    metadata: input.metadata || {}
  };
}

function containsAny(text, values) {
  const haystack = text.toLowerCase();
  return values.some((value) => haystack.includes(String(value).toLowerCase()));
}

export class SkillRegistry {
  constructor() {
    this.skills = new Map();
  }

  register(input) {
    const skill = normalizeSkill(input);
    this.skills.set(skill.id, skill);
    return skill;
  }

  get(id) {
    return this.skills.get(id) || null;
  }

  list() {
    return [...this.skills.values()];
  }

  find(query = {}) {
    const text = query.text || "";
    const requiredCapabilities = query.capabilities || [];
    return this.list()
      .filter((skill) => {
        const triggerMatch = !text || containsAny(text, skill.triggers);
        const capabilityMatch = requiredCapabilities.every((capability) => skill.capabilities.includes(capability));
        return triggerMatch && capabilityMatch;
      })
      .sort((a, b) => b.evalScore - a.evalScore || a.id.localeCompare(b.id));
  }
}
