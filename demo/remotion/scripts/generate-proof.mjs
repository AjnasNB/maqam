import { mkdir, rename, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(projectDirectory, "..", "..");
const cliPath = resolve(repositoryDirectory, "bin", "maqam.js");
const publicDirectory = resolve(projectDirectory, "public");
const outputPath = resolve(publicDirectory, "demo-proof.json");
const temporaryPath = `${outputPath}.tmp`;

const command = spawnSync(
  process.execPath,
  [cliPath, "demo", "approval", "--json"],
  {
    cwd: repositoryDirectory,
    encoding: "utf8",
    windowsHide: true,
  },
);

if (command.error) throw command.error;
if (command.status !== 0) {
  throw new Error(command.stderr.trim() || `Maqam demo exited with ${command.status}.`);
}

const proof = JSON.parse(command.stdout);
const [request, altered, exact, replay] = proof.steps ?? [];

if (
  proof.schemaVersion !== 1 ||
  proof.status !== "passed" ||
  request?.code !== "APPROVAL_REQUIRED" ||
  altered?.code !== "APPROVAL_SCOPE_MISMATCH" ||
  exact?.status !== "completed" ||
  exact?.executions !== 1 ||
  exact?.approvalConsumptions !== 1 ||
  replay?.code !== "APPROVAL_INVALID" ||
  replay?.executions !== 1 ||
  proof.summary?.unsupportedClaims !== 0 ||
  proof.cleanup?.temporaryWorkspaceRemoved !== true
) {
  throw new Error("Maqam CLI returned a proof bundle that does not satisfy the demo invariants.");
}

await mkdir(publicDirectory, { recursive: true });
await writeFile(temporaryPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
await rename(temporaryPath, outputPath);
process.stdout.write(`Wrote verified proof to ${outputPath}\n`);
