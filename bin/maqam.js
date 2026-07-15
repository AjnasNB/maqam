#!/usr/bin/env node
import { startMaqamServer } from "../src/maqam/server.js";

function readArgs(argv) {
  const options = { allowedOrigins: [], allowedHosts: [], allowedUiOrigins: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--port") options.port = Number(argv[++index]);
    else if (argument === "--host") options.host = argv[++index];
    else if (argument === "--allowed-origin") options.allowedOrigins.push(argv[++index]);
    else if (argument === "--allowed-ui-origin") options.allowedUiOrigins.push(argv[++index]);
    else if (argument === "--allowed-host") options.allowedHosts.push(argv[++index]);
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

Options:
  --port <number>                 Listen port. Default: 8787
  --host <host>                   Bind host. Default: 127.0.0.1
  --allowed-origin <origin>       Server-side crawl origin allowlist; repeatable
  --allowed-ui-origin <origin>    Browser API CORS allowlist; repeatable, exact origins only
  --allowed-host <host>           HTTP Host allowlist for non-loopback binding; repeatable
  --allow-private-networks        Trusted startup opt-in for loopback/private crawl targets
  --allow-cross-origin-crawls     Permit cross-origin links within --allowed-origin entries
  --help                          Show this help

Non-loopback binding also requires MAQAM_API_TOKEN. The token is never accepted as a command-line argument.
`);
}

try {
  const options = readArgs(process.argv.slice(2));
  if (options.help) usage();
  else {
    const server = startMaqamServer(options);
    server.once("error", (error) => {
      process.stderr.write(`${error.message || String(error)}\n`);
      process.exitCode = 1;
    });
  }
} catch (error) {
  process.stderr.write(`${error.message || String(error)}\n`);
  process.exitCode = 1;
}
