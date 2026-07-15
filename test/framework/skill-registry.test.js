import assert from "node:assert/strict";
import { test } from "node:test";
import { SkillRegistry } from "../../src/framework/skill-registry.js";

test("SkillRegistry validates and lists skills", () => {
  const registry = new SkillRegistry();
  registry.register({
    id: "oss-research",
    name: "OSS Research",
    version: "0.1.0",
    triggers: ["oss", "github"],
    capabilities: ["research"],
    trustLevel: "verified",
    evalScore: 0.82
  });

  assert.equal(registry.list().length, 1);
  assert.equal(registry.get("oss-research").name, "OSS Research");
});

test("SkillRegistry selects by trigger and capability score", () => {
  const registry = new SkillRegistry();
  registry.register({
    id: "low",
    name: "Low",
    version: "0.1.0",
    triggers: ["research"],
    capabilities: ["research"],
    evalScore: 0.2
  });
  registry.register({
    id: "high",
    name: "High",
    version: "0.1.0",
    triggers: ["agent framework"],
    capabilities: ["research", "synthesis"],
    evalScore: 0.9
  });

  const matches = registry.find({
    text: "Research agent framework projects",
    capabilities: ["research"]
  });

  assert.deepEqual(matches.map((skill) => skill.id), ["high", "low"]);
});

test("SkillRegistry snapshots registrations and keeps its storage private", () => {
  const input = {
    id: "safe",
    name: "Safe",
    version: "1.0.0",
    triggers: ["review"],
    capabilities: ["read"],
    metadata: { owner: "team" }
  };
  const registry = new SkillRegistry({ skills: [input] });

  input.name = "Mutated";
  input.triggers.push("publish");
  input.capabilities.push("write");
  input.metadata.owner = "attacker";
  registry.skills = new Map([["forged", {
    id: "forged",
    capabilities: ["publish"],
    trustLevel: "verified",
    evalScore: 999
  }]]);

  assert.equal(registry.get("safe").name, "Safe");
  assert.deepEqual([...registry.get("safe").triggers], ["review"]);
  assert.deepEqual([...registry.findByCapability("write")], []);
  assert.equal(registry.get("forged"), null);

  const returned = registry.get("safe");
  returned.metadata.owner = "changed-output";
  returned.capabilities.push("publish");
  assert.equal(registry.get("safe").metadata.owner, "team");
  assert.deepEqual([...registry.get("safe").capabilities], ["read"]);
});

test("SkillRegistry rejects inherited fields, accessors, coercion, duplicates, and unknown keys", () => {
  const previousCapabilities = Object.getOwnPropertyDescriptor(Object.prototype, "capabilities");
  try {
    Object.defineProperty(Object.prototype, "capabilities", {
      value: ["publish"],
      configurable: true
    });
    assert.throws(
      () => new SkillRegistry().register({ id: "inherited", name: "Inherited", version: "1.0.0" }),
      /Inherited Skill field 'capabilities'/
    );
  } finally {
    if (previousCapabilities) Object.defineProperty(Object.prototype, "capabilities", previousCapabilities);
    else delete Object.prototype.capabilities;
  }

  let getterCalls = 0;
  const accessor = { id: "accessor", name: "Accessor", version: "1.0.0" };
  Object.defineProperty(accessor, "trustLevel", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "verified";
    }
  });
  assert.throws(() => new SkillRegistry().register(accessor), /own enumerable data property/);
  assert.equal(getterCalls, 0);

  assert.throws(
    () => new SkillRegistry().register({ id: "score", name: "Score", version: "1", evalScore: "1" }),
    /finite number/
  );
  assert.throws(
    () => new SkillRegistry().register({ id: "unknown", name: "Unknown", version: "1", authorize: true }),
    /Unknown Skill field 'authorize'/
  );

  const registry = new SkillRegistry();
  registry.register({ id: "duplicate", name: "First", version: "1" });
  assert.throws(
    () => registry.register({ id: "duplicate", name: "Second", version: "2" }),
    /already registered/
  );
});

test("SkillRegistry queries reject inherited authority and accessors", () => {
  const registry = new SkillRegistry({
    skills: [{ id: "read", name: "Read", version: "1", capabilities: ["read"] }]
  });
  const previousCapabilities = Object.getOwnPropertyDescriptor(Object.prototype, "capabilities");
  try {
    Object.defineProperty(Object.prototype, "capabilities", {
      value: ["publish"],
      configurable: true
    });
    assert.throws(() => registry.find({ text: "" }), /Inherited Skill query field 'capabilities'/);
  } finally {
    if (previousCapabilities) Object.defineProperty(Object.prototype, "capabilities", previousCapabilities);
    else delete Object.prototype.capabilities;
  }

  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "trigger", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "read";
    }
  });
  assert.throws(() => registry.select(accessor), /own enumerable data property/);
  assert.equal(getterCalls, 0);
  assert.deepEqual(registry.select().map((skill) => skill.id), ["read"]);
});
