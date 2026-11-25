import readline from "node:readline";
import { readJsonFileStrict, writeJsonFileSecure } from "../kernel/config.mjs";

export function isLoopbackHostname(hostname) {
  const h = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0";
}

export function extractHostname(baseUrl) {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function askYesNoLine(question, { stdin = process.stdin, stderr = process.stderr } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: stdin,
      output: stderr,
    });
    rl.question(question, (answer) => {
      rl.close();
      const normalized = String(answer || "").trim().toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}

/**
 * First-run privacy consent gate for ambient environment API keys (`privacy-gate.mjs`).
 * - Loopback endpoints (`127.0.0.1`, `localhost`) are always approved.
 * - Keys configured directly in `config.json` (or hosts already in `config.approvedHosts`) are approved.
 * - Explicit `--engine byok` CLI invocation counts as explicit user authorization for the run.
 * - Ambient env-only keys in TTY prompt once and persist `approvedHosts` in `~/.config/dislop/config.json`.
 * - Ambient env-only keys in Non-TTY never upload silently; skips Tier 2 with a `stderr` notice.
 */
export async function checkPrivacyConsent({
  provider,
  config,
  isTty,
  explicitByokFlag = false,
  stdin = process.stdin,
  stderr = process.stderr,
  promptFn = null,
}) {
  const host = extractHostname(provider.baseUrl);
  if (!host || isLoopbackHostname(host)) {
    return { approved: true, host };
  }

  // Pre-authorized host or explicit config-sourced provider (not ambient env discovery)
  if (!provider.fromAmbientEnv) {
    return { approved: true, host };
  }
  if ((config.approvedHosts || []).map((h) => h.toLowerCase()).includes(host)) {
    return { approved: true, host };
  }
  if (explicitByokFlag) {
    return { approved: true, host };
  }

  if (!isTty) {
    stderr.write(
      `[dislop] Skipping unapproved ambient key ${provider.envVarName} for '${host}' in non-interactive mode (pass --engine byok or add '${host}' to approvedHosts in config.json).\n`,
    );
    return { approved: false, host };
  }

  const question = `Detected ${provider.envVarName}. Allow dislop to send document text to ${host} for review? [y/N] `;
  const accepted = promptFn ? await promptFn(question, host) : await askYesNoLine(question, { stdin, stderr });

  if (!accepted) {
    return { approved: false, host };
  }

  // Persist host approval to user config.json
  try {
    const existing = readJsonFileStrict(config.userConfigPath) || {};
    const prevHosts = Array.isArray(existing.approvedHosts) ? existing.approvedHosts : [];
    const nextHosts = Array.from(new Set([...prevHosts, host]));
    writeJsonFileSecure(
      config.userConfigPath,
      { ...existing, approvedHosts: nextHosts },
      { mode: 0o600 },
    );
    config.approvedHosts = Array.from(new Set([...(config.approvedHosts || []), host]));
  } catch {
    // Even if disk persistence fails (e.g., read-only home), honor approval for current invocation
  }

  return { approved: true, host };
}
