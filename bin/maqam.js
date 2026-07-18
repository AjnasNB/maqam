#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { formatApprovalDemo, runApprovalDemo } from "../src/maqam/approval-demo.js";
import { startMaqamServer } from "../src/maqam/server.js";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function readDemoArgs(argv) {
  if (argv[0] !== "demo") return null;
  if (argv[1] === "--help" || argv[1] === "-h") return { help: true };
  if (argv[1] !== "approval") {
    throw new TypeError("Usage: maqam demo approval [--json]");
  }
  const options = { json: false, help: false };
  for (const argument of argv.slice(2)) {
    if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new TypeError(`Unknown demo option: ${argument}`);
  }
  return options;
}

function readArgs(argv) {
  const options = { allowedOrigins: [], allowedHosts: [], allowedUiOrigins: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--version" || argument === "-v") options.version = true;
    else if (argument === "--port") options.port = Number(argv[++index]);
    else if (argument === "--host") options.host = argv[++index];
    else if (argument === "--allowed-origin") options.allowedOrigins.push(argv[++index]);
    else if (argument === "--allowed-ui-origin") options.allowedUiOrigins.push(argv[++index]);
    else if (argument === "--allowed-host") options.allowedHosts.push(argv[++index]);
    else if (argument === "--yt-dlp-command") {
      const command = argv[++index];
      if (!command) throw new TypeError("--yt-dlp-command requires an absolute executable path.");
      options.ytDlpCommand = command;
    }
    else if (argument === "--allow-private-networks") options.allowPrivateNetworks = true;
    else if (argument === "--allow-cross-origin-crawls") options.allowCrossOriginCrawls = true;
    else throw new TypeError(`Unknown option: ${argument}`);
  }
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535)) {
    throw new TypeError("--port must be an integer from 0 to 65535.");
  }
  if (options.allowedOrigins.length === 0) delete options.allowedOrigins;
  if (options.allowedUiOrigins.length === 0) delete options.allowedUiOrigins;
  if (options.allowedHosts.length === 0) delete options.allowedHosts;
  return options;
}

function usage() {
  console.log(`
Maqam

Usage:
  maqam [options]
  maqam demo approval [--json]

Options:
  --port <number>                 Listen port. Default: 8787
  --host <host>                   Bind host. Default: 127.0.0.1
  --allowed-origin <origin>       Server-side crawl origin allowlist; repeatable
  --allowed-ui-origin <origin>    Browser API CORS allowlist; repeatable, exact origins only
  --allowed-host <host>           HTTP Host allowlist for non-loopback binding; repeatable
  --yt-dlp-command <absolute>     Enable public YouTube research with this reviewed executable
  --allow-private-networks        Trusted startup opt-in for loopback/private crawl targets
  --allow-cross-origin-crawls     Permit cross-origin links within --allowed-origin entries
  --version                       Print the installed Maqam version
  --help                          Show this help

Demo options:
  --json                          Emit deterministic machine-readable output

Non-loopback binding also requires MAQAM_API_TOKEN. The token is never accepted as a command-line argument.
MAQAM_YT_DLP_COMMAND may provide the same reviewed absolute executable path as --yt-dlp-command.
`);
}

try {
  const argv = process.argv.slice(2);
  const demo = readDemoArgs(argv);
  if (demo?.help) usage();
  else if (demo) {
    const report = await runApprovalDemo();
    process.stdout.write(`${demo.json ? JSON.stringify(report, null, 2) : formatApprovalDemo(report)}\n`);
  } else {
    const options = readArgs(argv);
    if (options.help) usage();
    else if (options.version) process.stdout.write(`${version}\n`);
    else {
      const server = startMaqamServer(options);
      server.once("error", (error) => {
        process.stderr.write(`${error.message || String(error)}\n`);
        process.exitCode = 1;
      });
    }
  }
} catch (error) {
  process.stderr.write(`${error.message || String(error)}\n`);
  process.exitCode = 1;
}
