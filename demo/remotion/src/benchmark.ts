export type BenchmarkProof = {
  readonly schema: "maqam.demo.benchmark/v1";
  readonly suite: {
    readonly name: "Maqam Governance Evaluation Suite";
    readonly shortName: "MGES";
    readonly version: "1.0.0";
    readonly authority: string;
    readonly externallyStandardized: false;
    readonly externallyCertified: false;
  };
  readonly performance: {
    readonly publicationCandidate: boolean;
    readonly governedMedianMicrosecondsPerCall: number;
    readonly interval95LowMicrosecondsPerCall: number;
    readonly interval95HighMicrosecondsPerCall: number;
    readonly samplesPerVariant: number;
    readonly qualityChecksPassed: number;
    readonly qualityChecksTotal: number;
    readonly artifact: string;
    readonly measuredAt: string;
    readonly sourceFingerprint: string;
    readonly repositoryCommit: string | null;
    readonly workingTreeDirty: boolean | null;
  };
  readonly conformance: {
    readonly passed: number;
    readonly total: number;
    readonly failed: number;
    readonly allPassed: boolean;
    readonly artifact: string;
    readonly measuredAt: string;
    readonly sourceFingerprint: string;
    readonly repositoryCommit: string | null;
    readonly workingTreeDirty: boolean | null;
  };
  readonly environment: {
    readonly node: string;
    readonly platform: string;
    readonly architecture: string;
    readonly processor: string;
  };
  readonly method: readonly [string, string, string, string];
  readonly caveat: string;
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isBenchmarkProof = (value: unknown): value is BenchmarkProof => {
  if (!value || typeof value !== "object") return false;
  const proof = value as Partial<BenchmarkProof>;
  const performance = proof.performance;
  const conformance = proof.conformance;
  const environment = proof.environment;

  return (
    proof.schema === "maqam.demo.benchmark/v1" &&
    proof.suite?.name === "Maqam Governance Evaluation Suite" &&
    proof.suite.shortName === "MGES" &&
    proof.suite.version === "1.0.0" &&
    proof.suite.externallyStandardized === false &&
    proof.suite.externallyCertified === false &&
    typeof performance?.publicationCandidate === "boolean" &&
    finite(performance.governedMedianMicrosecondsPerCall) &&
    finite(performance.interval95LowMicrosecondsPerCall) &&
    finite(performance.interval95HighMicrosecondsPerCall) &&
    performance.interval95LowMicrosecondsPerCall <=
      performance.governedMedianMicrosecondsPerCall &&
    performance.governedMedianMicrosecondsPerCall <=
      performance.interval95HighMicrosecondsPerCall &&
    Number.isSafeInteger(performance.samplesPerVariant) &&
    performance.samplesPerVariant >= 2 &&
    Number.isSafeInteger(performance.qualityChecksPassed) &&
    Number.isSafeInteger(performance.qualityChecksTotal) &&
    performance.qualityChecksPassed >= 0 &&
    performance.qualityChecksPassed <= performance.qualityChecksTotal &&
    typeof performance.artifact === "string" &&
    performance.artifact.startsWith("benchmarks/results/") &&
    typeof performance.measuredAt === "string" &&
    typeof performance.sourceFingerprint === "string" &&
    performance.sourceFingerprint.length === 64 &&
    (performance.repositoryCommit === null ||
      (typeof performance.repositoryCommit === "string" &&
        /^[a-f0-9]{40}$/.test(performance.repositoryCommit))) &&
    (typeof performance.workingTreeDirty === "boolean" ||
      performance.workingTreeDirty === null) &&
    conformance !== undefined &&
    Number.isSafeInteger(conformance.passed) &&
    Number.isSafeInteger(conformance.total) &&
    Number.isSafeInteger(conformance.failed) &&
    conformance.total > 0 &&
    conformance.passed + conformance.failed === conformance.total &&
    conformance.allPassed === (conformance.failed === 0) &&
    typeof conformance.artifact === "string" &&
    conformance.artifact.startsWith("benchmarks/results/") &&
    typeof conformance.measuredAt === "string" &&
    typeof conformance.sourceFingerprint === "string" &&
    conformance.sourceFingerprint.length === 64 &&
    (conformance.repositoryCommit === null ||
      (typeof conformance.repositoryCommit === "string" &&
        /^[a-f0-9]{40}$/.test(conformance.repositoryCommit))) &&
    (typeof conformance.workingTreeDirty === "boolean" ||
      conformance.workingTreeDirty === null) &&
    typeof environment?.node === "string" &&
    typeof environment.platform === "string" &&
    typeof environment.architecture === "string" &&
    typeof environment.processor === "string" &&
    Array.isArray(proof.method) &&
    proof.method.length === 4 &&
    proof.method.every((entry) => typeof entry === "string" && entry.length > 0) &&
    typeof proof.caveat === "string" &&
    proof.caveat.includes("not an industry standard") &&
    proof.caveat.includes("certification")
  );
};
