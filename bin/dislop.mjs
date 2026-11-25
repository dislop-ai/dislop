#!/usr/bin/env node
import { runCli } from "../src/cli-main.mjs";

const code = await runCli(process.argv.slice(2));
if (process.argv[2] !== "mcp") {
  process.exitCode = code;
}
