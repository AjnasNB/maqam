#!/usr/bin/env node
import { startMaqamServer } from "../src/maqam/server.js";

function readPort(argv) {
  const index = argv.indexOf("--port");
  if (index === -1) return undefined;
  return Number(argv[index + 1]);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
Maqam

Usage:
  maqam [--port 8787]

Starts the local Maqam agent framework console.
`);
  process.exit(0);
}

startMaqamServer({ port: readPort(process.argv.slice(2)) });
