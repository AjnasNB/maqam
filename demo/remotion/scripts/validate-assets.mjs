import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "..");
const repositoryDirectory = resolve(projectDirectory, "..", "..");
const publicDirectory = resolve(projectDirectory, "public");

const proof = JSON.parse(await readFile(resolve(publicDirectory, "demo-proof.json"), "utf8"));
const benchmark = JSON.parse(await readFile(resolve(publicDirectory, "benchmark-proof.json"), "utf8"));
const captions = JSON.parse(await readFile(resolve(publicDirectory, "captions.json"), "utf8"));
const audio = await readFile(resolve(publicDirectory, "voiceover.wav"));
const metadata = JSON.parse(await readFile(resolve(publicDirectory, "voiceover-metadata.json"), "utf8"));
const performanceReport = JSON.parse(
  await readFile(
    resolve(repositoryDirectory, "benchmarks/results/2026-07-16-mges-performance-windows-node24.json"),
    "utf8",
  ),
);
const conformanceReport = JSON.parse(
  await readFile(
    resolve(repositoryDirectory, "benchmarks/results/2026-07-16-mges-conformance-windows-node24.json"),
    "utf8",
  ),
);

const [request, altered, exact, replay] = proof.steps ?? [];
const expected = {
  inputHash: "495c908d2223178a336fe0a91434df93fafa05d72d077878543eaf3a6a0d291a",
  contentHash: "sha256:aeb981e669beb745001e7ecffe5291d36cce4add894a120c9089133ee197815b",
  evidenceHash: "sha256:2c4d8758516bba3a5564a983e512dc111703011e3aeee67584a4f0ee2d1f6cab",
};

const waveDurationMs = (buffer) => {
  if (
    buffer.length <= 44 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("voiceover.wav is not a non-empty RIFF/WAVE asset.");
  }

  let byteRate = null;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + size > buffer.length) {
      throw new Error(`voiceover.wav has a truncated ${id} chunk.`);
    }
    if (id === "fmt " && size >= 12) byteRate = buffer.readUInt32LE(dataOffset + 8);
    if (id === "data") dataBytes += size;
    offset = dataOffset + size + (size % 2);
  }
  if (!Number.isFinite(byteRate) || byteRate <= 0 || dataBytes <= 0) {
    throw new Error("voiceover.wav is missing a valid format or data chunk.");
  }
  return (dataBytes / byteRate) * 1000;
};

if (
  proof.schemaVersion !== 1 ||
  proof.status !== "passed" ||
  proof.approvedInput?.content !== "Maqam exact approval verified." ||
  request?.scope?.inputHash !== expected.inputHash ||
  request?.code !== "APPROVAL_REQUIRED" ||
  request?.executions !== 0 ||
  altered?.code !== "APPROVAL_SCOPE_MISMATCH" ||
  altered?.executions !== 0 ||
  altered?.fileExists !== false ||
  exact?.status !== "completed" ||
  exact?.executions !== 1 ||
  exact?.approvalConsumptions !== 1 ||
  exact?.result?.bytes !== 30 ||
  exact?.result?.contentHash !== expected.contentHash ||
  exact?.file?.verified !== true ||
  replay?.code !== "APPROVAL_INVALID" ||
  replay?.executions !== 1 ||
  replay?.fileUnchanged !== true ||
  proof.evidence?.evidence?.[0]?.hash !== expected.evidenceHash ||
  proof.evidence?.claims?.[0]?.evidenceIds?.[0] !== "ev_1" ||
  proof.summary?.unsupportedClaims !== 0 ||
  proof.cleanup?.temporaryWorkspaceRemoved !== true
) {
  throw new Error("demo-proof.json does not match the reviewed deterministic Maqam proof.");
}

const governed = performanceReport.results?.governed;
const interval = governed?.bootstrapMedian95Interval;
const checks = performanceReport.quality?.checks ?? [];
const conformance = conformanceReport.summary;
if (
  benchmark.schema !== "maqam.demo.benchmark/v1" ||
  benchmark.suite?.name !== "Maqam Governance Evaluation Suite" ||
  benchmark.suite?.version !== "1.0.0" ||
  benchmark.suite?.externallyStandardized !== false ||
  benchmark.suite?.externallyCertified !== false ||
  performanceReport.schema !== "maqam.benchmark.performance/v1" ||
  conformanceReport.schema !== "maqam.benchmark.conformance/v1" ||
  benchmark.performance?.publicationCandidate !== performanceReport.quality?.publicationCandidate ||
  benchmark.performance?.governedMedianMicrosecondsPerCall !== governed?.medianMicrosecondsPerOperation ||
  benchmark.performance?.interval95LowMicrosecondsPerCall !== interval?.lowMicrosecondsPerOperation ||
  benchmark.performance?.interval95HighMicrosecondsPerCall !== interval?.highMicrosecondsPerOperation ||
  benchmark.performance?.samplesPerVariant !== performanceReport.methodology?.samplesPerVariant ||
  benchmark.performance?.qualityChecksPassed !== checks.filter((check) => check.passed).length ||
  benchmark.performance?.qualityChecksTotal !== checks.length ||
  benchmark.performance?.artifact !== "benchmarks/results/2026-07-16-mges-performance-windows-node24.json" ||
  benchmark.performance?.measuredAt !== performanceReport.measuredAt ||
  benchmark.performance?.sourceFingerprint !== performanceReport.sourceFingerprint?.combined ||
  benchmark.performance?.repositoryCommit !== (performanceReport.repository?.commit ?? null) ||
  benchmark.performance?.workingTreeDirty !== (performanceReport.repository?.workingTreeDirty ?? null) ||
  benchmark.conformance?.passed !== conformance?.passed ||
  benchmark.conformance?.total !== conformance?.total ||
  benchmark.conformance?.failed !== conformance?.failed ||
  benchmark.conformance?.allPassed !== conformance?.allPassed ||
  benchmark.conformance?.artifact !== "benchmarks/results/2026-07-16-mges-conformance-windows-node24.json" ||
  benchmark.conformance?.measuredAt !== conformanceReport.measuredAt ||
  benchmark.conformance?.sourceFingerprint !== conformanceReport.sourceFingerprint?.combined ||
  benchmark.conformance?.repositoryCommit !== (conformanceReport.repository?.commit ?? null) ||
  benchmark.conformance?.workingTreeDirty !== (conformanceReport.repository?.workingTreeDirty ?? null) ||
  benchmark.environment?.node !== performanceReport.environment?.runtime?.node ||
  benchmark.environment?.platform !== performanceReport.environment?.operatingSystem?.platform ||
  benchmark.environment?.architecture !== performanceReport.environment?.operatingSystem?.architecture ||
  benchmark.environment?.processor !== performanceReport.environment?.processor?.model ||
  !benchmark.caveat?.includes("not an industry standard") ||
  !benchmark.caveat?.includes("certification")
) {
  throw new Error("benchmark-proof.json is stale or does not match the reviewed MGES artifacts.");
}

if (!Array.isArray(captions) || captions.length === 0) {
  throw new Error("captions.json must contain Caption objects.");
}

for (const [index, caption] of captions.entries()) {
  if (
    typeof caption.text !== "string" ||
    typeof caption.startMs !== "number" ||
    typeof caption.endMs !== "number" ||
    caption.startMs < 0 ||
    caption.endMs <= caption.startMs ||
    caption.endMs > 60000 ||
    caption.timestampMs !== null ||
    caption.confidence !== null ||
    (index > 0 && caption.startMs < captions[index - 1].startMs)
  ) {
    throw new Error(`captions.json has an invalid Caption at index ${index}.`);
  }
}

const actualAudioDurationMs = waveDurationMs(audio);

if (
  metadata.provider !== "Microsoft System.Speech (local Windows SAPI)" ||
  metadata.cloudServiceUsed !== false ||
  !Number.isFinite(metadata.durationMs) ||
  metadata.durationMs > 59800 ||
  actualAudioDurationMs > 59800 ||
  Math.abs(actualAudioDurationMs - metadata.durationMs) > 2
) {
  throw new Error(
    `voiceover metadata (${metadata.durationMs} ms) does not match the local SAPI WAVE (${actualAudioDurationMs.toFixed(3)} ms).`,
  );
}

const performanceReleaseBaseline =
  benchmark.performance.publicationCandidate && benchmark.performance.workingTreeDirty === false;
const conformanceReleaseBaseline =
  benchmark.conformance.allPassed && benchmark.conformance.workingTreeDirty === false;
process.stdout.write(
  `Assets valid: CLI proof passed, MGES performance release baseline ${performanceReleaseBaseline ? "PASS" : "REVIEW"}, MGES conformance release baseline ${conformanceReleaseBaseline ? "PASS" : "REVIEW"} (${conformance.passed}/${conformance.total}), ${captions.length} captions, ${metadata.durationMs} ms local voiceover.\n`,
);
