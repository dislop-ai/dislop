import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import {
  DislopConfigError,
  getDislopHomeDir,
  isInteractiveHumanTty,
  writeJsonFileSecure,
} from "../kernel/config.mjs";
import { DEFAULT_CLOUD_REVIEW_URL } from "../runtime/providers/cloud.mjs";

function promptTokenInteractive({ stdin = process.stdin, stderr = process.stderr } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stderr });
    rl.question(
      "Sign in at https://dislop.com to generate an API key (dslp_*), then paste token here: ",
      (answer) => {
        rl.close();
        resolve(String(answer || "").trim());
      },
    );
  });
}

/**
 * `dislop login [--token <token>] [--endpoint <url>]`
 */
export async function runLoginCommand(_positionals, flags, io = {}) {
  const {
    env = process.env,
    stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
  } = io;

  const homeDir = getDislopHomeDir(env);
  const credentialsPath = path.join(homeDir, "credentials.json");

  let token = flags.token ? String(flags.token).trim() : "";
  if (!token) {
    if (!isInteractiveHumanTty({ stdin, stdout, env })) {
      throw new DislopConfigError(
        "Non-interactive 'dislop login' requires --token <dslp_token>.",
      );
    }
    token = await promptTokenInteractive({ stdin, stderr });
  }

  if (!token) {
    throw new DislopConfigError("No token supplied; login aborted.");
  }

  const endpoint = flags.endpoint || DEFAULT_CLOUD_REVIEW_URL;
  writeJsonFileSecure(
    credentialsPath,
    {
      accessToken: token,
      endpoint,
      savedAt: new Date().toISOString(),
    },
    { mode: 0o600 },
  );

  stdout.write(`Saved Official Cloud credentials to ${credentialsPath}\n`);
  return 0;
}

/**
 * `dislop logout`
 */
export async function runLogoutCommand(_positionals, _flags, io = {}) {
  const { env = process.env, stdout = process.stdout } = io;
  const credentialsPath = path.join(getDislopHomeDir(env), "credentials.json");

  if (fs.existsSync(credentialsPath)) {
    fs.unlinkSync(credentialsPath);
    stdout.write(`Removed credentials at ${credentialsPath}\n`);
  } else {
    stdout.write("No active Official Cloud credentials found.\n");
  }
  return 0;
}
