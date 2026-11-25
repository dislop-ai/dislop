import { spawnSync } from "node:child_process";
import path from "node:path";
import { DislopConfigError, getDislopHomeDir, writeJsonFileSecure } from "../kernel/config.mjs";
import {
  LOCAL_MODEL_CATALOG,
  readInstalledModelsManifest,
} from "../runtime/providers/local-model.mjs";

/**
 * `dislop model <pull|list|rm> [name] [--endpoint <url>]`
 */
export async function runModelCommand(positionals, flags, io = {}) {
  const { env = process.env, stdout = process.stdout, stderr = process.stderr } = io;

  const action = positionals[0] || "list";
  const modelArg = positionals[1] || "";
  const modelsDir = path.join(getDislopHomeDir(env), "models");
  const manifestPath = path.join(modelsDir, "manifest.json");
  const manifest = readInstalledModelsManifest(modelsDir);

  if (action === "list") {
    const installedNames = Object.keys(manifest.installed);
    if (flags.json || flags.format === "json") {
      stdout.write(
        `${JSON.stringify(
          {
            activeModel: manifest.activeModel,
            installed: manifest.installed,
            catalog: LOCAL_MODEL_CATALOG,
          },
          null,
          2,
        )}\n`,
      );
      return 0;
    }

    stdout.write("Tier 3 Local Model Catalog:\n");
    for (const [id, spec] of Object.entries(LOCAL_MODEL_CATALOG)) {
      const isInstalled = Boolean(manifest.installed[id]);
      const isActive = manifest.activeModel === id;
      const badge = isActive ? "[active]" : isInstalled ? "[installed]" : "[available]";
      stdout.write(`  - ${id} (${spec.sizeLabel}) ${badge} — ${spec.description}\n`);
    }
    if (installedNames.length === 0) {
      stdout.write("\nRun 'dislop model pull qwen2.5-1.5b-instruct' to enable Tier 3 local semantic checks.\n");
    }
    return 0;
  }

  if (action === "pull") {
    const targetId = modelArg || "qwen2.5-1.5b-instruct";
    const catalogEntry = LOCAL_MODEL_CATALOG[targetId] || {
      name: targetId,
      ollamaTag: targetId,
      sizeLabel: "custom",
      maxInputTokens: 8000,
      description: "Custom local model",
    };

    const baseUrl = flags.endpoint || env.DISLOP_LOCAL_MODEL_URL || "http://127.0.0.1:11434/v1";

    // Attempt `ollama pull` when ollama CLI is present and not running in offline/mock test mode
    if (!env.DISLOP_SKIP_OLLAMA_PULL) {
      try {
        const probe = spawnSync("ollama", ["--version"], { stdio: "ignore" });
        if (probe.status === 0) {
          stderr.write(`Pulling '${catalogEntry.ollamaTag}' via local Ollama...\n`);
          spawnSync("ollama", ["pull", catalogEntry.ollamaTag], { stdio: "inherit" });
        }
      } catch {
        // ollama binary not installed; register manifest entry pointing to loopback endpoint
      }
    }

    manifest.installed[targetId] = {
      name: targetId,
      ollamaTag: catalogEntry.ollamaTag,
      runtimeModel: catalogEntry.ollamaTag,
      baseUrl,
      maxInputTokens: catalogEntry.maxInputTokens,
      installedAt: new Date().toISOString(),
    };
    manifest.activeModel = targetId;

    writeJsonFileSecure(manifestPath, manifest, { mode: 0o600 });
    stdout.write(`Registered active Tier 3 local model '${targetId}' -> ${baseUrl}\n`);
    return 0;
  }

  if (action === "rm" || action === "remove") {
    if (!modelArg) {
      throw new DislopConfigError("Usage: dislop model rm <model-name>");
    }
    if (!manifest.installed[modelArg]) {
      stdout.write(`Model '${modelArg}' is not installed.\n`);
      return 0;
    }
    delete manifest.installed[modelArg];
    if (manifest.activeModel === modelArg) {
      manifest.activeModel = Object.keys(manifest.installed)[0] || null;
    }
    writeJsonFileSecure(manifestPath, manifest, { mode: 0o600 });
    stdout.write(`Removed Tier 3 local model '${modelArg}'.\n`);
    return 0;
  }

  throw new DislopConfigError(
    `Unknown 'dislop model' subcommand '${action}' (expected list, pull, or rm)`,
  );
}
