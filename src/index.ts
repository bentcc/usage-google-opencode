#!/usr/bin/env node

import { runCli } from "./cli.js";

// Handle graceful shutdown
let isShuttingDown = false;

process.on("SIGINT", () => {
  if (!isShuttingDown) {
    isShuttingDown = true;
    console.log("\nInterrupted - cleaning up...");
    process.exit(130); // Standard exit code for SIGINT
  }
});

process.on("SIGTERM", () => {
  if (!isShuttingDown) {
    isShuttingDown = true;
    console.log("\nTerminated - cleaning up...");
    process.exit(143); // Standard exit code for SIGTERM
  }
});

const res = await runCli(process.argv.slice(2));

if (res.stdout) process.stdout.write(res.stdout);
if (res.stderr) process.stderr.write(res.stderr);
process.exitCode = res.exitCode;
