import fs from "node:fs";
import {
  DislopConfigError,
  isInteractiveHumanTty,
  readJsonFileStrict,
  resolveLayeredConfig,
  writeJsonFileSecure,
} from "../kernel/config.mjs";
import { expandTargetInputs } from "../kernel/file-discovery.mjs";
import { extractVoiceProfile } from "../kernel/voice-profile.mjs";
import { resolveExecutionRoute } from "../runtime/router.mjs";

/**
 * `dislop voice <extract|show|clear> [files/globs...]`
 */
export async function runVoiceCommand(positionals, flags, io = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
    fetchImpl = globalThis.fetch,
  } = io;

  const action = positionals[0] || "show";
  const targets = positionals.slice(1);
  const config = resolveLayeredConfig({ cwd, env, cliFlags: flags });
  const cachePath = config.voice.cachePath;

  if (action === "show") {
    if (!fs.existsSync(cachePath)) {
      stdout.write(`No cached voice profile at ${cachePath}. Run 'dislop voice extract <files...>'.\n`);
      return 0;
    }
    const profile = readJsonFileStrict(cachePath);
    if (flags.json || flags.format === "json") {
      stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
    } else {
      stdout.write(`Voice Profile (${cachePath}):\n`);
      stdout.write(`  Language   : ${profile.language}\n`);
      stdout.write(`  Summary    : ${profile.summary}\n`);
      stdout.write(`  Anchors    : ${(profile.voiceAnchors || []).join("; ") || "(none)"}\n`);
      stdout.write(`  Connectors : ${(profile.preferredConnectors || []).join(", ") || "(none)"}\n`);
    }
    return 0;
  }

  if (action === "clear") {
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      stdout.write(`Cleared voice profile at ${cachePath}\n`);
    } else {
      stdout.write("No cached voice profile to clear.\n");
    }
    return 0;
  }

  if (action === "extract") {
    const fileInputs = targets.length > 0 ? targets : config.voice.referenceFiles;
    if (!fileInputs || fileInputs.length === 0) {
      throw new DislopConfigError(
        "Usage: dislop voice extract <files/globs...> (no reference files provided)",
      );
    }
    const resolvedFiles = expandTargetInputs(fileInputs, { cwd });
    const isTty = isInteractiveHumanTty({ stdin, stdout, env });
    const route = await resolveExecutionRoute({ config, isTty, env, stdin, stderr, fetchImpl });
    const profile = await extractVoiceProfile(resolvedFiles, { route });
    writeJsonFileSecure(cachePath, profile, { mode: 0o600 });

    if (flags.json || flags.format === "json") {
      stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
    } else {
      stdout.write(`Saved personal voice profile to ${cachePath} (${resolvedFiles.length} file(s)).\n`);
      stdout.write(`  Summary: ${profile.summary}\n`);
    }
    return 0;
  }

  throw new DislopConfigError(
    `Unknown 'dislop voice' subcommand '${action}' (expected extract, show, or clear)`,
  );
}
