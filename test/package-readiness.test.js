import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const usageGuide = readFileSync(new URL("../docs/usage.md", import.meta.url), "utf8");

test("package metadata is ready for Maqam npm publishing", () => {
  assert.equal(packageJson.name, "maqam");
  assert.equal(packageJson.version, "0.1.3");
  assert.equal(packageJson.license, "MIT");
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.bin.maqam, "bin/maqam.js");
  assert.equal(packageJson.bin["maqam-crawl"], "bin/ajnas-crawl.js");
  assert.equal(packageJson.repository.url, "git+https://github.com/AjnasNB/maqam.git");
  assert.equal(packageJson.publishConfig.access, "public");
  assert.ok(packageJson.files.includes("app/"));
  assert.ok(packageJson.files.includes("src/"));
  assert.ok(packageJson.files.includes("docs/usage.md"));
  assert.ok(packageJson.keywords.includes("agent-framework"));
  assert.ok(packageJson.keywords.includes("governance"));
});

test("public docs and brand assets match Maqam identity", () => {
  assert.match(readme, /^# Maqam/m);
  assert.match(readme, /maqam-readme-hero\.png/);
  assert.match(readme, /maqam-system-map\.svg/);
  assert.match(readme, /Full documentation/);
  assert.match(readme, /npm install -g maqam/);
  assert.match(readme, /MIT/);
  assert.match(usageGuide, /^# Maqam Usage Guide/m);
  assert.match(usageGuide, /AgentRuntime/);
  assert.match(usageGuide, /PolicyEngine/);
  assert.match(usageGuide, /Control Any Agent/);
  assert.match(usageGuide, /createAgentTool/);
  assert.ok(existsSync(new URL("../app/assets/maqam-logo.svg", import.meta.url)));
  assert.ok(existsSync(new URL("../app/assets/maqam-brand-board.png", import.meta.url)));
  assert.ok(existsSync(new URL("../app/assets/maqam-readme-hero.png", import.meta.url)));
  assert.ok(existsSync(new URL("../app/assets/maqam-system-map.svg", import.meta.url)));
});
