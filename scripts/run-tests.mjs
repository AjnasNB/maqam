import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const testDirectory = resolve("test");

async function collectTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTests(path));
      continue;
    }
    if (entry.isFile() && /\.test\.(?:c|m)?js$/u.test(entry.name)) {
      files.push(path);
    }
  }

  return files.sort();
}

const testFiles = await collectTests(testDirectory);
if (testFiles.length === 0) {
  throw new Error(`No root tests found under ${testDirectory}.`);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit"
});

if (result.error) throw result.error;
if (result.signal) {
  process.kill(process.pid, result.signal);
}
process.exitCode = result.status ?? 1;
