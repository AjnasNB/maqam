import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(projectDirectory, "out", "additional-screenshots");
await mkdir(outputDirectory, { recursive: true });

const stills = [
  { composition: "ProductLoopEcosystem55", frame: 75, file: "productloop-01-hook.png" },
  { composition: "ProductLoopEcosystem55", frame: 220, file: "productloop-02-modules.png" },
  { composition: "ProductLoopEcosystem55", frame: 580, file: "productloop-03-approval.png" },
  { composition: "ProductLoopEcosystem55", frame: 1160, file: "productloop-04-boundaries.png" },
  { composition: "ProductLoopEcosystem55", frame: 1450, file: "productloop-05-final.png" },
  { composition: "MaqamCrawlerResearch55", frame: 90, file: "crawler-01-hook.png" },
  { composition: "MaqamCrawlerResearch55", frame: 230, file: "crawler-02-limits.png" },
  { composition: "MaqamCrawlerResearch55", frame: 420, file: "crawler-03-network.png" },
  { composition: "MaqamCrawlerResearch55", frame: 850, file: "crawler-04-output.png" },
  { composition: "MaqamCrawlerResearch55", frame: 1220, file: "crawler-05-gateway.png" },
  { composition: "MaqamCrawlerResearch55", frame: 1480, file: "crawler-06-final.png" },
];
const cliPath = resolve(projectDirectory, "node_modules", "@remotion", "cli", "remotion-cli.js");

for (const still of stills) {
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "still",
      "src/index.ts",
      still.composition,
      resolve(outputDirectory, still.file),
      `--frame=${still.frame}`,
    ],
    { cwd: projectDirectory, stdio: "inherit", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Still render failed for ${still.file}.`);
}
