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
 * Tier 3 Managed Local Small Model adapter (loopback OpenAI-compatible runtime).
 */
export async function invokeLocalModelProvider({
  localModel,
  payload,
  timeoutMs = 60000,
  fetchImpl = globalThis.fetch,
}) {
  return invokeOpenAiCompatProvider({
    provider: localModel,
    payload,
    timeoutMs,
    fetchImpl,
  });
}
