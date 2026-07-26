import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runYcWorkflow } from "./workflow.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = resolve(scriptDirectory, "..", "public");
const outputPath = resolve(publicDirectory, "workflow-proof.json");
const temporaryPath = `${outputPath}.tmp`;

const proof = await runYcWorkflow();
if (
  proof.status !== "passed"
  || proof.memory.store.verified !== true
  || proof.memory.coverage.status !== "direct"
  || proof.evidence.records !== 1
  || proof.approval.alteredInput.code !== "APPROVAL_SCOPE_MISMATCH"
  || proof.approval.exactInput.executions !== 1
  || proof.approval.exactInput.consumptionCount !== 1
  || proof.approval.replay.code !== "APPROVAL_INVALID"
  || proof.receipt.unsupportedClaims !== 0
) {
  throw new Error("The generated YC workflow proof failed its release assertions.");
}

await mkdir(publicDirectory, { recursive: true });
await writeFile(temporaryPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
await rename(temporaryPath, outputPath);
process.stdout.write(`Verified ${proof.run.id} and wrote ${outputPath}\n`);
