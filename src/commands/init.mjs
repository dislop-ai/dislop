import fs from "node:fs";
import path from "node:path";
import { getDislopHomeDir, writeJsonFileSecure } from "../kernel/config.mjs";

/**
 * `dislop init [--global] [--voice <glob>] [--force]`
 */
export async function runInitCommand(_positionals, flags, io = {}) {
  const { cwd = process.cwd(), env = process.env, stdout = process.stdout } = io;

  const targetPath = flags.global
    ? path.join(getDislopHomeDir(env), "config.json")
    : path.join(cwd, ".dislop.json");

  if (fs.existsSync(targetPath) && !flags.force) {
    stdout.write(`Config already exists at ${targetPath} (pass --force to overwrite).\n`);
    return 0;
  }

  const voiceRefs = flags.voiceFiles && flags.voiceFiles.length > 0 ? flags.voiceFiles : [];

  const template = {
    routing: "local",
    approvedHosts: [],
    packs: ["artifact-qa", "web-ui", "slide-deck", "prose"],
    voice: {
      referenceFiles: voiceRefs,
    },
    providers: {
      "local-ollama": {
        protocol: "openai",
        baseUrl: "http://127.0.0.1:11434/v1",
        apiKey: "ollama",
        model: "qwen2.5:7b",
        structuredOutput: "json_object",
        maxInputTokens: 8000,
      },
    },
  };

  if (flags.global) {
    writeJsonFileSecure(targetPath, template, { mode: 0o600 });
  } else {
    fs.writeFileSync(targetPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
  }

  stdout.write(`Initialized dislop configuration at ${targetPath}\n`);
  return 0;
}
