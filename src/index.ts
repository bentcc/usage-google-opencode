#!/usr/bin/env node

import { runCli } from "./cli.js";

const res = await runCli(process.argv.slice(2));

if (res.stdout) process.stdout.write(res.stdout);
if (res.stderr) process.stderr.write(res.stderr);
process.exitCode = res.exitCode;
