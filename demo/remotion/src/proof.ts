export type Scope = {
  readonly runId: string;
  readonly toolName: string;
  readonly inputHash: string;
};

export type RequestStep = {
  readonly id: "request";
  readonly status: string;
  readonly code: "APPROVAL_REQUIRED";
  readonly approvalId: string;
  readonly action: string;
  readonly approvalStatus: string;
  readonly scope: Scope;
  readonly executions: number;
  readonly fileExists: boolean;
};

export type AlteredStep = {
  readonly id: "altered_input";
  readonly status: string;
  readonly code: "APPROVAL_SCOPE_MISMATCH";
  readonly message: string;
  readonly executions: number;
  readonly fileExists: boolean;
};

export type ExactStep = {
  readonly id: "exact_input";
  readonly status: string;
  readonly code: null;
  readonly executions: number;
  readonly approvalConsumptions: number;
  readonly result: {
    readonly path: string;
    readonly bytes: number;
    readonly contentHash: string;
    readonly verified: boolean;
    readonly evidenceId: string;
    readonly claimId: string;
  };
  readonly file: {
    readonly path: string;
    readonly content: string;
    readonly verified: boolean;
  };
};

export type ReplayStep = {
  readonly id: "replay";
  readonly status: string;
  readonly code: "APPROVAL_INVALID";
  readonly message: string;
  readonly executions: number;
  readonly fileUnchanged: boolean;
};

export type DemoProof = {
  readonly schemaVersion: number;
  readonly demo: string;
  readonly status: string;
  readonly description: string;
  readonly approvedInput: { readonly path: string; readonly content: string };
  readonly alteredInput: { readonly path: string; readonly content: string };
  readonly steps: readonly [RequestStep, AlteredStep, ExactStep, ReplayStep];
  readonly approval: {
    readonly approvalId: string;
    readonly status: string;
    readonly action: string;
    readonly reusable: boolean;
    readonly scope: Scope;
    readonly decision: {
      readonly decidedBy: string;
      readonly note: string;
      readonly decidedAt: string;
    };
    readonly consumptions: readonly {
      readonly consumedAt: string;
      readonly consumedBy: string;
      readonly runId: string;
      readonly toolName: string;
    }[];
  };
  readonly evidence: {
    readonly evidence: readonly {
      readonly evidenceId: string;
      readonly runId: string;
      readonly taskId: string;
      readonly sourceType: string;
      readonly source: string;
      readonly retrievedAt: string;
      readonly excerpt: string;
      readonly hash: string;
      readonly tool: string;
      readonly confidence: number;
    }[];
    readonly claims: readonly {
      readonly claimId: string;
      readonly runId: string;
      readonly taskId: string;
      readonly text: string;
      readonly evidenceIds: readonly string[];
      readonly confidence: number;
    }[];
    readonly unsupportedClaims: readonly unknown[];
  };
  readonly trace: readonly {
    readonly status: string;
    readonly code: string | null;
    readonly approvalIds: readonly string[];
  }[];
  readonly summary: {
    readonly executions: number;
    readonly approvalConsumptions: number;
    readonly evidenceRecords: number;
    readonly claims: number;
    readonly unsupportedClaims: number;
  };
  readonly cleanup: { readonly temporaryWorkspaceRemoved: boolean };
};

export const isDemoProof = (value: unknown): value is DemoProof => {
  if (!value || typeof value !== "object") return false;
  const proof = value as Partial<DemoProof>;
  const [request, altered, exact, replay] = proof.steps ?? [];

  return (
    proof.schemaVersion === 1 &&
    proof.status === "passed" &&
    Array.isArray(proof.steps) &&
    proof.steps.length === 4 &&
    proof.approvedInput?.content === "Maqam exact approval verified." &&
    request?.code === "APPROVAL_REQUIRED" &&
    request.scope?.inputHash ===
      "495c908d2223178a336fe0a91434df93fafa05d72d077878543eaf3a6a0d291a" &&
    request.executions === 0 &&
    altered?.code === "APPROVAL_SCOPE_MISMATCH" &&
    altered.executions === 0 &&
    altered.fileExists === false &&
    exact?.status === "completed" &&
    exact.executions === 1 &&
    exact.approvalConsumptions === 1 &&
    exact.result?.bytes === 30 &&
    exact.result.contentHash ===
      "sha256:aeb981e669beb745001e7ecffe5291d36cce4add894a120c9089133ee197815b" &&
    exact.file?.verified === true &&
    replay?.code === "APPROVAL_INVALID" &&
    replay.executions === 1 &&
    replay.fileUnchanged === true &&
    proof.evidence?.evidence?.[0]?.hash ===
      "sha256:2c4d8758516bba3a5564a983e512dc111703011e3aeee67584a4f0ee2d1f6cab" &&
    proof.evidence?.claims?.[0]?.evidenceIds?.[0] === "ev_1" &&
    proof.summary?.executions === 1 &&
    proof.summary.unsupportedClaims === 0 &&
    proof.cleanup?.temporaryWorkspaceRemoved === true
  );
};
