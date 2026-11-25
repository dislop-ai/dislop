import fs from "node:fs";
import { DislopConfigError, readJsonFileStrict } from "../kernel/config.mjs";
import { checkPrivacyConsent, isLoopbackHostname, extractHostname } from "./privacy-gate.mjs";
import { invokeAnthropicProvider } from "./providers/anthropic.mjs";
import { invokeCloudProvider } from "./providers/cloud.mjs";
import { invokeGeminiProvider } from "./providers/gemini.mjs";
import {
  OLLAMA_INSTALL_HINT,
  detectOllamaBinary,
  invokeLocalModelProvider,
  resolveInstalledLocalModel,
} from "./providers/local-model.mjs";
import { invokeOpenAiCompatProvider } from "./providers/openai-compat.mjs";

const AMBIENT_ENV_CANDIDATES = [
  {
    name: "env-openai",
    protocol: "openai",
    envVarName: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    structuredOutput: "json_schema",
    maxInputTokens: 16000,
  },
  {
    name: "env-anthropic",
    protocol: "anthropic",
    envVarName: "ANTHROPIC_API_KEY",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-3-5-haiku-latest",
    structuredOutput: "json_object",
    maxInputTokens: 16000,
  },
  {
    name: "env-gemini",
    protocol: "gemini",
    envVarName: "GEMINI_API_KEY",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.5-flash",
    structuredOutput: "json_object",
    maxInputTokens: 24000,
  },
];

export const UPGRADE_TIER_HINT =
  "💡 Running local deterministic checks only. For deeper semantic de-slopping, run 'dislop login' (Cloud), pass '--engine auto' / '--engine byok', or run 'dislop model pull' (requires Ollama: https://ollama.com).";

export function loadCloudCredentials(credentialsPath) {
  if (!fs.existsSync(credentialsPath)) return null;
  try {
    const creds = readJsonFileStrict(credentialsPath);
    const token = creds?.accessToken || creds?.token || creds?.apiKey;
    if (!token) return null;
    if (creds.expiresAt && Number(creds.expiresAt) > 0 && Date.now() >= Number(creds.expiresAt)) {
      return null;
    }
    return creds;
  } catch {
    return null;
  }
}

export function resolveTier2ProviderCandidate(config, env = process.env) {
  const configured = config.providers || {};

  // 1. Named activeProvider from CLI `--provider` or `config.json`
  if (config.activeProvider) {
    const entry = configured[config.activeProvider];
    if (!entry) {
      throw new DislopConfigError(
        `Configured provider '${config.activeProvider}' not found in config.json providers.`,
      );
    }
    const apiKey = entry.apiKey || (entry.apiKeyEnv ? env[entry.apiKeyEnv] : "");
    const host = extractHostname(entry.baseUrl || "https://api.openai.com/v1");
    if (!apiKey && !isLoopbackHostname(host)) {
      return null;
    }
    return {
      name: config.activeProvider,
      protocol: entry.protocol || "openai",
      baseUrl: entry.baseUrl || "https://api.openai.com/v1",
      apiKey: apiKey || "",
      model: entry.model || "gpt-4o-mini",
      structuredOutput: entry.structuredOutput || "json_object",
      maxInputTokens: Number(entry.maxInputTokens) || 16000,
      fromAmbientEnv: false,
      envVarName: entry.apiKeyEnv || null,
    };
  }

  // 2. First usable provider entry in config.json
  for (const [name, entry] of Object.entries(configured)) {
    const apiKey = entry.apiKey || (entry.apiKeyEnv ? env[entry.apiKeyEnv] : "");
    const host = extractHostname(entry.baseUrl || "https://api.openai.com/v1");
    if (!apiKey && !isLoopbackHostname(host)) continue;
    return {
      name,
      protocol: entry.protocol || "openai",
      baseUrl: entry.baseUrl || "https://api.openai.com/v1",
      apiKey: apiKey || "",
      model: entry.model || "gpt-4o-mini",
      structuredOutput: entry.structuredOutput || "json_object",
      maxInputTokens: Number(entry.maxInputTokens) || 16000,
      fromAmbientEnv: false,
      envVarName: entry.apiKeyEnv || null,
    };
  }

  // 3. Ambient environment variable detection (subject to Privacy Consent Gate)
  for (const cand of AMBIENT_ENV_CANDIDATES) {
    const keyVal = env[cand.envVarName] || (cand.envVarName === "GEMINI_API_KEY" ? env.GOOGLE_API_KEY : "");
    if (keyVal && String(keyVal).trim()) {
      return {
        ...cand,
        apiKey: String(keyVal).trim(),
        fromAmbientEnv: true,
        envVarName: env[cand.envVarName] ? cand.envVarName : "GOOGLE_API_KEY",
      };
    }
  }

  return null;
}

/**
 * Resolve the active LLM execution route according to `config.routing`:
 * - `"local"` (default): Tier 3 local model if installed -> otherwise deterministic-only + upgrade hint (0 uploads).
 * - `"auto"`: Tier 1 Cloud -> Tier 2 BYOK/Loopback (with Privacy Gate) -> Tier 3 Local -> deterministic-only + hint.
 * - `"cloud"`: Tier 1 Cloud strictly (throws Exit Code 2 `DislopConfigError` if missing auth).
 * - `"byok"`: Tier 2 BYOK/Loopback strictly (throws Exit Code 2 `DislopConfigError` if missing provider/key).
 */
export async function resolveExecutionRoute({
  config,
  isTty,
  env = process.env,
  stdin = process.stdin,
  stderr = process.stderr,
  fetchImpl = globalThis.fetch,
  promptFn = null,
}) {
  if (config.noLlm) {
    return { tier: "none", engineLabel: "deterministic", maxInputTokens: 0, execute: null };
  }

  const mode = config.routing || "local";

  // Explicit Cloud
  if (mode === "cloud") {
    const creds = loadCloudCredentials(config.credentialsPath);
    if (!creds) {
      throw new DislopConfigError(
        "Engine 'cloud' requires authentication. Run 'dislop login' first.",
      );
    }
    return {
      tier: "cloud",
      engineLabel: "cloud:dislop",
      maxInputTokens: 20000,
      execute: (payload, doc, promptRules) =>
        invokeCloudProvider({ credentials: creds, payload, doc, promptRules, fetchImpl, env }),
    };
  }

  // Explicit BYOK
  if (mode === "byok") {
    const provider = resolveTier2ProviderCandidate(config, env);
    if (!provider) {
      throw new DislopConfigError(
        "Engine 'byok' requires a configured provider in config.json or an OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY environment variable.",
      );
    }
    await checkPrivacyConsent({
      provider,
      config,
      isTty,
      explicitByokFlag: Boolean(config.explicitEngine),
      stdin,
      stderr,
      promptFn,
    });
    return buildTier2Route(provider, fetchImpl);
  }

  // 3-Tier Cascade (`--engine auto` or `routing: "auto"`)
  if (mode === "auto") {
    const creds = loadCloudCredentials(config.credentialsPath);
    if (creds) {
      return {
        tier: "cloud",
        engineLabel: "cloud:dislop",
        maxInputTokens: 20000,
        execute: (payload, doc, promptRules) =>
          invokeCloudProvider({ credentials: creds, payload, doc, promptRules, fetchImpl, env }),
      };
    }

    const provider = resolveTier2ProviderCandidate(config, env);
    if (provider) {
      const consent = await checkPrivacyConsent({
        provider,
        config,
        isTty,
        explicitByokFlag: false,
        stdin,
        stderr,
        promptFn,
      });
      if (consent.approved) {
        return buildTier2Route(provider, fetchImpl);
      }
    }
  }

  // Default `"local"` mode (and Tier 3 fallback of `"auto"`): check installed local model
  const localModel = resolveInstalledLocalModel(config, env);
  if (localModel) {
    return {
      tier: "local",
      engineLabel: `local:${localModel.model}`,
      maxInputTokens: localModel.maxInputTokens || 8000,
      fallbackOnConnRefused: !config.explicitEngine,
      execute: (payload) => invokeLocalModelProvider({ localModel, payload, fetchImpl, env }),
    };
  }

  // Also allow loopback provider configured in `config.providers` when routing === "local"
  const maybeLoopback = resolveTier2ProviderCandidate(config, env);
  if (maybeLoopback && isLoopbackHostname(extractHostname(maybeLoopback.baseUrl))) {
    if (String(maybeLoopback.baseUrl).includes(":11434") || /ollama/i.test(maybeLoopback.name)) {
      return {
        tier: "local",
        engineLabel: `local:${maybeLoopback.model}`,
        maxInputTokens: maybeLoopback.maxInputTokens || 8000,
        fallbackOnConnRefused: !config.explicitEngine,
        execute: (payload) =>
          invokeLocalModelProvider({ localModel: maybeLoopback, payload, fetchImpl, env }),
      };
    }
    return buildTier2Route(maybeLoopback, fetchImpl, "local");
  }

  const ollama = detectOllamaBinary(env);
  let fallbackHint = UPGRADE_TIER_HINT;
  if (config.explicitEngine && mode === "local") {
    fallbackHint = ollama.installed
      ? "💡 No Tier 3 local model installed yet. Running deterministic Script Packs only — start 'ollama serve' and run 'dislop model pull qwen2.5-1.5b-instruct' to enable local LLM checks."
      : `💡 Ollama is missing on this machine (required for Tier 3 '--engine local' LLM checks). Running deterministic Script Packs only — ${OLLAMA_INSTALL_HINT}`;
  } else if (!ollama.installed) {
    fallbackHint =
      "💡 Running local deterministic checks only (Ollama is not installed for Tier 3 local LLM). For deeper semantic de-slopping, run 'dislop login' (Cloud), pass '--engine auto' / '--engine byok', or install Ollama (https://ollama.com) and run 'dislop model pull'.";
  }

  return {
    tier: "none",
    engineLabel: "deterministic",
    maxInputTokens: 0,
    hint: fallbackHint,
    execute: null,
  };
}

function buildTier2Route(provider, fetchImpl, labelPrefix = "byok") {
  const protocol = String(provider.protocol || "openai").toLowerCase();
  const engineLabel = `${labelPrefix}:${provider.model}`;
  const maxInputTokens = provider.maxInputTokens || 16000;

  if (protocol === "anthropic") {
    return {
      tier: labelPrefix,
      engineLabel,
      maxInputTokens,
      execute: (payload) => invokeAnthropicProvider({ provider, payload, fetchImpl }),
    };
  }
  if (protocol === "gemini") {
    return {
      tier: labelPrefix,
      engineLabel,
      maxInputTokens,
      execute: (payload) => invokeGeminiProvider({ provider, payload, fetchImpl }),
    };
  }
  return {
    tier: labelPrefix,
    engineLabel,
    maxInputTokens,
    execute: (payload) => invokeOpenAiCompatProvider({ provider, payload, fetchImpl }),
  };
}
