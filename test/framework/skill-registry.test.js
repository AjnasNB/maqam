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
