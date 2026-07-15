import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "maqam-consumer-types-"));
const consumerDirectory = join(temporaryRoot, "consumer");
const npmCli = process.env.npm_execpath;
const tscPath = join(root, "node_modules", "typescript", "bin", "tsc");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.capture ? "pipe" : "inherit",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.${detail ? `\n${detail}` : ""}`);
  }
  return result.stdout || "";
}

function runNpm(args, options = {}) {
  if (!npmCli) throw new Error("Run this check through npm so npm_execpath is available.");
  return run(process.execPath, [npmCli, ...args], options);
}

try {
  const packed = JSON.parse(runNpm([
    "pack",
    "--json",
    "--ignore-scripts",
    "--dry-run=false",
    "--pack-destination",
    temporaryRoot
  ], { capture: true, env: { npm_config_dry_run: "false" } }));
  if (!Array.isArray(packed) || packed.length !== 1 || !packed[0].filename) {
    throw new Error("npm pack did not report exactly one Maqam artifact.");
  }

  await mkdir(consumerDirectory);
  const tarball = join(temporaryRoot, basename(packed[0].filename));
  await writeFile(join(consumerDirectory, "package.json"), JSON.stringify({
    name: "maqam-clean-consumer",
    private: true,
    type: "module"
  }, null, 2));
  await writeFile(join(consumerDirectory, "consumer.ts"), [
    "import { AgentRuntime, crawl } from \"maqam\";",
    "import { createMaqamServer } from \"maqam/server\";",
    "void AgentRuntime;",
    "void crawl;",
    "const server = createMaqamServer();",
    "server.close();",
    ""
  ].join("\n"));
  await writeFile(join(consumerDirectory, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2022",
      strict: true,
      noEmit: true,
      skipLibCheck: false
    },
    include: ["consumer.ts"]
  }, null, 2));

  runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--dry-run=false", tarball], {
    cwd: consumerDirectory,
    env: { npm_config_dry_run: "false" }
  });
  const installed = JSON.parse(await readFile(
    join(consumerDirectory, "node_modules", "maqam", "package.json"),
    "utf8"
  ));
  if (installed.version !== "0.2.2" || installed.dependencies?.["@types/node"] !== "^20.19.43") {
    throw new Error("The packed Maqam manifest does not expose the reviewed Node type dependency.");
  }
  run(process.execPath, [tscPath, "-p", join(consumerDirectory, "tsconfig.json")], {
    cwd: consumerDirectory
  });
  process.stdout.write("Clean Maqam consumer TypeScript compile passed.\n");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
