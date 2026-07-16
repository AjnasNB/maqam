import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(projectDirectory, "out", "screenshots");
await mkdir(outputDirectory, { recursive: true });

const stills = [
  { frame: 90, file: "policy-path.png" },
  { frame: 240, file: "pending-exact-approval.png" },
  { frame: 450, file: "01-scope-mismatch.png" },
  { frame: 660, file: "02-exact-execution.png" },
  { frame: 1090, file: "03-evidence-linked.png" },
];

const cliPath = resolve(projectDirectory, "node_modules", "@remotion", "cli", "remotion-cli.js");
for (const still of stills) {
  const output = resolve(outputDirectory, still.file);
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "still",
      "src/index.ts",
      "MaqamProof60",
      output,
      `--frame=${still.frame}`,
    ],
    { cwd: projectDirectory, stdio: "inherit", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Still render failed for frame ${still.frame}.`);
  }
}
