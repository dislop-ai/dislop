import fs from "node:fs";
import path from "node:path";
import { invokeOpenAiCompatProvider } from "./openai-compat.mjs";

export const LOCAL_MODEL_CATALOG = Object.freeze({
  "qwen2.5-1.5b-instruct": {
    name: "qwen2.5-1.5b-instruct",
    ollamaTag: "qwen2.5:1.5b",
    sizeLabel: "1.0 GB",
    maxInputTokens: 6000,
    description: "Fast lightweight local model for basic semantic anti-slop checks.",
  },
  "qwen2.5-7b-instruct": {
    name: "qwen2.5-7b-instruct",
    ollamaTag: "qwen2.5:7b",
    sizeLabel: "4.7 GB",
    maxInputTokens: 12000,
    description: "Balanced local model for bilingual EN/ZH editorial suggestions.",
  },
});

export const OLLAMA_INSTALL_HINT =
  "Install Ollama from https://ollama.com (e.g., 'brew install ollama' on macOS), start 'ollama serve', then run 'dislop model pull qwen2.5-1.5b-instruct'.";

/**
 * Fast zero-subprocess check for whether the `ollama` CLI binary is installed locally.
 */
export function detectOllamaBinary(env = process.env) {
  if (env.DISLOP_ASSUME_NO_OLLAMA === "1") {
    return { installed: false, binaryPath: null };
  }
  if (env.DISLOP_OLLAMA_BIN !== undefined) {
    const custom = String(env.DISLOP_OLLAMA_BIN).trim();
    if (custom && fs.existsSync(custom)) {
      return { installed: true, binaryPath: custom };
    }
    return { installed: false, binaryPath: null };
  }

  const isWin = process.platform === "win32";
  const binNames = isWin ? ["ollama.exe", "ollama.cmd", "ollama"] : ["ollama"];
  const pathDirs = String(env.PATH || "")
    .split(path.delimiter)
    .map((p) => p.trim())
    .filter(Boolean);
  const fallbackDirs = isWin ? [] : ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];

  for (const dir of [...pathDirs, ...fallbackDirs]) {
    for (const name of binNames) {
      const candidate = path.join(dir, name);
      try {
        if (fs.statSync(candidate).isFile()) {
          return { installed: true, binaryPath: candidate };
        }
      } catch {
        // continue scanning
      }
    }
  }

  return { installed: false, binaryPath: null };
}

export function readInstalledModelsManifest(modelsDir) {
  const manifestPath = path.join(modelsDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return { activeModel: null, installed: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return {
      activeModel: raw.activeModel || null,
      installed: raw.installed && typeof raw.installed === "object" ? raw.installed : {},
    };
  } catch {
    return { activeModel: null, installed: {} };
  }
}

export function resolveInstalledLocalModel(config, env = process.env) {
  const manifest = readInstalledModelsManifest(config.modelsDir);
  const activeKey =
    manifest.activeModel && manifest.installed[manifest.activeModel]
      ? manifest.activeModel
      : Object.keys(manifest.installed)[0] || null;

  if (!activeKey) return null;
  const entry = manifest.installed[activeKey];
  const baseUrl =
    env.DISLOP_LOCAL_MODEL_URL || entry.baseUrl || "http://127.0.0.1:11434/v1";

  return {
    tier: "local",
    name: activeKey,
    protocol: "openai",
    baseUrl,
    apiKey: entry.apiKey || "local",
    model: entry.runtimeModel || entry.ollamaTag || activeKey,
    structuredOutput: "json_object",
    maxInputTokens: entry.maxInputTokens || 8000,
  };
}

/**
 * Tier 3 Managed Local Small Model adapter (loopback OpenAI-compatible runtime via Ollama).
 */
export async function invokeLocalModelProvider({
  localModel,
  payload,
  timeoutMs = 60000,
  fetchImpl = globalThis.fetch,
  env = process.env,
}) {
  try {
    return await invokeOpenAiCompatProvider({
      provider: localModel,
      payload,
      timeoutMs,
      fetchImpl,
    });
  } catch (err) {
    if (!err?.authError && /Unable to reach provider/i.test(String(err?.message || ""))) {
      const ollama = detectOllamaBinary(env);
      if (!ollama.installed) {
        const missingErr = new Error(
          `Ollama is missing on this machine (required for Tier 3 '--engine local'). ${OLLAMA_INSTALL_HINT}`,
        );
        missingErr.ollamaMissing = true;
        throw missingErr;
      }
      const stoppedErr = new Error(
        `${err.message}. Ensure the local Ollama server is running ('ollama serve' or open the Ollama app) and that '${localModel.model}' has been pulled ('dislop model pull ${localModel.name}').`,
      );
      stoppedErr.ollamaUnreachable = true;
      throw stoppedErr;
    }
    throw err;
  }
}
