import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "..");
const maqamDirectory = resolve(projectDirectory, "..", "..");
const workspaceDirectory = resolve(maqamDirectory, "..");
const productLoopDirectory = resolve(workspaceDirectory, "ajnas-product-loop");
const publicDirectory = resolve(projectDirectory, "public");

const read = (base, path) => readFile(resolve(base, path), "utf8");
const git = (directory, args) => {
  const result = spawnSync("git", args, { cwd: directory, encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${directory}.`);
  return result.stdout.trim();
};
const fingerprint = (entries) =>
  createHash("sha256")
    .update(entries.map(([path, content]) => `${path}\0${content.length}\0${content}`).join("\0"))
    .digest("hex");

const productLoopFiles = await Promise.all(
  [
    "package.json",
    "productloop-os/package.json",
    "productloop-os/src/composition.ts",
    "productloop-os/src/adapters.ts",
    "docs/architecture.md",
    "docs/security-boundaries.md",
  ].map(async (path) => [path, await read(productLoopDirectory, path)]),
);
const productLoopRoot = JSON.parse(productLoopFiles[0][1]);
const umbrella = JSON.parse(productLoopFiles[1][1]);
const composition = productLoopFiles[2][1];
const adapters = productLoopFiles[3][1];
const expectedAjnasModules = [
  "ajnas-runtime",
  "ajnas-policy",
  "ajnas-approvals",
  "ajnas-provenance",
  "ajnas-evals",
  "ajnas-connectors",
  "ajnas-skills-registry",
  "ajnas-browser-research",
];
for (const dependency of ["maqam", ...expectedAjnasModules]) {
  if (!umbrella.dependencies?.[dependency]) {
    throw new Error(`ProductLoop umbrella is missing dependency '${dependency}'.`);
  }
}
if (
  productLoopRoot.workspaces?.length !== 9 ||
  !composition.includes('defaultEffect: "deny"') ||
  !composition.includes("maqamGateway") ||
  !adapters.includes("createMaqamCrawlerTool") ||
  !adapters.includes('risk: "high"')
) {
  throw new Error("ProductLoop source no longer matches the narrated composition facts.");
}

const productLoopFacts = {
  schema: "productloop.video.facts/v1",
  source: {
    repository: "https://github.com/AjnasNB/productloop-os",
    commit: git(productLoopDirectory, ["rev-parse", "HEAD"]),
    workingTreeDirty: git(productLoopDirectory, ["status", "--porcelain"]) !== "",
    fingerprint: fingerprint(productLoopFiles),
  },
  umbrellaVersion: umbrella.version,
  modules: ["maqam", ...expectedAjnasModules],
  claims: {
    defaultDenyComposition: true,
    explicitMaqamCrawlerAdapter: true,
    maqamCrawlerRisk: "high",
    automaticToolRegistration: false,
    sharedDistributedTransaction: false,
    bundledModelOrLiveBrowser: false,
  },
};

const maqamFiles = await Promise.all(
  [
    "package.json",
    "src/index.js",
    "src/crawler/security.js",
    "src/framework/tool-gateway.js",
    "test/crawler-security.test.js",
    "test/crawler-limits.test.js",
  ].map(async (path) => [path, await read(maqamDirectory, path)]),
);
const maqamPackage = JSON.parse(maqamFiles[0][1]);
const crawlerSource = maqamFiles[1][1];
const crawlerSecurity = maqamFiles[2][1];
if (
  !crawlerSource.includes('effects: ["network:read"]') ||
  !crawlerSource.includes("obeyRobots: input.obeyRobots !== false") ||
  !crawlerSource.includes("page.contentHash") ||
  !crawlerSource.includes("redirectChain") ||
  !crawlerSecurity.includes("withPinnedFetch")
) {
  throw new Error("Maqam source no longer matches the narrated crawler facts.");
}
const crawlerFacts = {
  schema: "maqam.crawler.video.facts/v1",
  source: {
    repository: "https://github.com/AjnasNB/maqam",
    commit: git(maqamDirectory, ["rev-parse", "HEAD"]),
    workingTreeDirty: git(maqamDirectory, ["status", "--porcelain"]) !== "",
    fingerprint: fingerprint(maqamFiles),
  },
  packageVersion: maqamPackage.version,
  claims: {
    transport: "http-html",
    browserJavaScriptExecution: false,
    robotsDefault: true,
    sameOriginDefault: true,
    publicNetworkDefault: true,
    redirectValidation: true,
    dnsPinning: true,
    contentHash: "sha256",
    governedEffect: "network:read",
  },
};

await Promise.all([
  writeFile(
    resolve(publicDirectory, "productloop-facts.json"),
    `${JSON.stringify(productLoopFacts, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    resolve(publicDirectory, "crawler-facts.json"),
    `${JSON.stringify(crawlerFacts, null, 2)}\n`,
    "utf8",
  ),
]);
process.stdout.write(
  `Generated source-fingerprinted facts for ProductLoop ${umbrella.version} and Maqam ${maqamPackage.version}.\n`,
);
