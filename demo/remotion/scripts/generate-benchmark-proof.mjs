import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "..");
const repositoryDirectory = resolve(projectDirectory, "..", "..");
const performancePath = resolve(
  repositoryDirectory,
  "benchmarks",
  "results",
  "2026-07-16-mges-performance-windows-node24.json",
);
const conformancePath = resolve(
  repositoryDirectory,
  "benchmarks",
  "results",
  "2026-07-16-mges-conformance-windows-node24.json",
);
const outputPath = resolve(projectDirectory, "public", "benchmark-proof.json");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const [performance, conformance] = await Promise.all([
  readJson(performancePath),
  readJson(conformancePath),
]);

if (
  performance.schema !== "maqam.benchmark.performance/v1" ||
  performance.suite?.name !== "Maqam Governance Evaluation Suite" ||
  performance.suite?.shortName !== "MGES" ||
  performance.suite?.version !== "1.0.0" ||
  performance.suite?.externallyStandardized !== false
) {
  throw new Error("Performance artifact is not the reviewed MGES v1 schema.");
}

if (
  conformance.schema !== "maqam.benchmark.conformance/v1" ||
  conformance.suite?.name !== "Maqam Governance Evaluation Suite" ||
  conformance.suite?.shortName !== "MGES" ||
  conformance.suite?.version !== "1.0.0" ||
  conformance.suite?.externallyStandardized !== false ||
  conformance.suite?.externallyCertified !== false
) {
  throw new Error("Conformance artifact is not the reviewed MGES v1 schema.");
}

const governed = performance.results?.governed;
const interval = governed?.bootstrapMedian95Interval;
const checks = performance.quality?.checks;
if (
  !Number.isFinite(governed?.medianMicrosecondsPerOperation) ||
  !Number.isFinite(interval?.lowMicrosecondsPerOperation) ||
  !Number.isFinite(interval?.highMicrosecondsPerOperation) ||
  !Array.isArray(checks) ||
  !checks.every((check) => typeof check?.passed === "boolean")
) {
  throw new Error("Performance artifact is missing its governed result or quality checks.");
}

const summary = conformance.summary;
if (
  !Number.isSafeInteger(summary?.total) ||
  !Number.isSafeInteger(summary?.passed) ||
  !Number.isSafeInteger(summary?.failed) ||
  summary.passed + summary.failed !== summary.total ||
  summary.allPassed !== (summary.failed === 0)
) {
  throw new Error("Conformance artifact has an invalid summary.");
}

const artifactPath = (absolutePath) =>
  relative(repositoryDirectory, absolutePath).split(sep).join("/");

const proof = {
  schema: "maqam.demo.benchmark/v1",
  suite: {
    name: "Maqam Governance Evaluation Suite",
    shortName: "MGES",
    version: "1.0.0",
    authority: "Maqam project-defined, reproducible evaluation suite",
    externallyStandardized: false,
    externallyCertified: false,
  },
  performance: {
    publicationCandidate: performance.quality.publicationCandidate,
    governedMedianMicrosecondsPerCall: governed.medianMicrosecondsPerOperation,
    interval95LowMicrosecondsPerCall: interval.lowMicrosecondsPerOperation,
    interval95HighMicrosecondsPerCall: interval.highMicrosecondsPerOperation,
    samplesPerVariant: performance.methodology.samplesPerVariant,
    qualityChecksPassed: checks.filter((check) => check.passed).length,
    qualityChecksTotal: checks.length,
    artifact: artifactPath(performancePath),
    measuredAt: performance.measuredAt,
    sourceFingerprint: performance.sourceFingerprint.combined,
    repositoryCommit: performance.repository?.commit ?? null,
    workingTreeDirty: performance.repository?.workingTreeDirty ?? null,
  },
  conformance: {
    passed: summary.passed,
    total: summary.total,
    failed: summary.failed,
    allPassed: summary.allPassed,
    artifact: artifactPath(conformancePath),
    measuredAt: conformance.measuredAt,
    sourceFingerprint: conformance.sourceFingerprint.combined,
    repositoryCommit: conformance.repository?.commit ?? null,
    workingTreeDirty: conformance.repository?.workingTreeDirty ?? null,
  },
  environment: {
    node: performance.environment.runtime.node,
    platform: performance.environment.operatingSystem.platform,
    architecture: performance.environment.operatingSystem.architecture,
    processor: performance.environment.processor.model,
  },
  method: [
    "fresh process per observation",
    "raw JSON and source fingerprints",
    "95% bootstrap interval",
    "runtime, OS, architecture, and CPU disclosed",
  ],
  caveat:
    "Project-defined and reproducible; not an industry standard, external certification, security score, competitor ranking, or production SLA.",
};

await writeFile(outputPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
const performanceReleaseBaseline =
  proof.performance.publicationCandidate && proof.performance.workingTreeDirty === false;
const conformanceReleaseBaseline =
  proof.conformance.allPassed && proof.conformance.workingTreeDirty === false;
process.stdout.write(
  `Generated ${outputPath}; performance release baseline ${performanceReleaseBaseline ? "PASS" : "REVIEW"}; conformance release baseline ${conformanceReleaseBaseline ? "PASS" : "REVIEW"} (${summary.passed}/${summary.total}).\n`,
);
