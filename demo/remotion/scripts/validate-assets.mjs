import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "..");
const publicDirectory = resolve(projectDirectory, "public");

const proof = JSON.parse(await readFile(resolve(publicDirectory, "demo-proof.json"), "utf8"));
const captions = JSON.parse(await readFile(resolve(publicDirectory, "captions.json"), "utf8"));
const audio = await readFile(resolve(publicDirectory, "voiceover.wav"));
const metadata = JSON.parse(await readFile(resolve(publicDirectory, "voiceover-metadata.json"), "utf8"));

const [request, altered, exact, replay] = proof.steps ?? [];
const expected = {
  inputHash: "495c908d2223178a336fe0a91434df93fafa05d72d077878543eaf3a6a0d291a",
  contentHash: "sha256:aeb981e669beb745001e7ecffe5291d36cce4add894a120c9089133ee197815b",
  evidenceHash: "sha256:2c4d8758516bba3a5564a983e512dc111703011e3aeee67584a4f0ee2d1f6cab",
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

if (
  audio.length <= 44 ||
  audio.toString("ascii", 0, 4) !== "RIFF" ||
  audio.toString("ascii", 8, 12) !== "WAVE"
) {
  throw new Error("voiceover.wav is not a non-empty RIFF/WAVE asset.");
}

if (
  metadata.provider !== "Microsoft System.Speech (local Windows SAPI)" ||
  metadata.cloudServiceUsed !== false ||
  !Number.isFinite(metadata.durationMs) ||
  metadata.durationMs > 59800
) {
  throw new Error("voiceover-metadata.json does not describe the expected local SAPI asset.");
}

process.stdout.write(
  `Assets valid: proof passed, ${captions.length} captions, ${metadata.durationMs} ms local voiceover.\n`,
);
