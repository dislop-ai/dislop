import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class DislopConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "DislopConfigError";
    this.exitCode = 2;
  }
}

export function getDislopHomeDir(env = process.env) {
  if (env.DISLOP_CONFIG_DIR) {
    return path.resolve(env.DISLOP_CONFIG_DIR);
  }
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg) {
    return path.join(xdg, "dislop");
  }
  return path.join(os.homedir(), ".config", "dislop");
}

export function expandTilde(filePath, env = process.env) {
  const s = String(filePath || "");
  if (s === "~") return env.HOME || os.homedir();
  if (s.startsWith("~/") || s.startsWith("~\\")) {
    return path.join(env.HOME || os.homedir(), s.slice(2));
  }
  return s;
}

/**
 * Detect whether the current process is attached to an interactive human terminal
 * (false in pipes, CI runners, `TERM=dumb`, and known coding agent sandboxes).
 */
export function isInteractiveHumanTty({
  stdin = process.stdin,
  stdout = process.stdout,
  env = process.env,
} = {}) {
  if (env.DISLOP_FORCE_TTY === "1") return true;
  if (env.DISLOP_FORCE_NON_TTY === "1") return false;
  if (!stdin?.isTTY || !stdout?.isTTY) return false;
  if (env.CI && env.CI !== "0" && env.CI !== "false") return false;
  if (env.TERM === "dumb") return false;
  if (
    env.CLAUDECODE ||
    env.CODEX_SANDBOX ||
    env.CURSOR_AGENT ||
    env.ANTIGRAVITY_AGENT ||
    env.GITHUB_ACTIONS
  ) {
    return false;
  }
  return true;
}

export function readJsonFileStrict(filePath) {
  if (!fs.existsSync(filePath)) return null;
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new DislopConfigError(`Unable to read config file '${filePath}': ${err.message}`);
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("root value must be a JSON object");
    }
    return parsed;
  } catch (err) {
    throw new DislopConfigError(`Invalid JSON in '${filePath}': ${err.message}`);
  }
}

export function writeJsonFileSecure(filePath, data, { mode = 0o600 } = {}) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`);
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode });
  fs.renameSync(tmp, filePath);
}

const VALID_ROUTING_MODES = new Set(["local", "auto", "cloud", "byok"]);

/**
 * Resolve layered configuration:
 * `~/.config/dislop/config.json` <- `<cwd>/.dislop.json` <- `<cwd>/.dislop.local.json` <- CLI flags.
 */
export function resolveLayeredConfig({ cwd = process.cwd(), env = process.env, cliFlags = {} } = {}) {
  const homeDir = getDislopHomeDir(env);
  const userConfigPath = path.join(homeDir, "config.json");
  const projectConfigPath = path.join(cwd, ".dislop.json");
  const localConfigPath = path.join(cwd, ".dislop.local.json");

  const defaults = {
    routing: "local",
    activeProvider: null,
    approvedHosts: [],
    packs: null,
    lang: "auto",
    level: "all",
    voice: {
      referenceFiles: [],
      cachePath: path.join(homeDir, "voice.json"),
    },
    providers: {},
  };

  const layers = [
    { source: userConfigPath, data: readJsonFileStrict(userConfigPath) },
    { source: projectConfigPath, data: readJsonFileStrict(projectConfigPath) },
    { source: localConfigPath, data: readJsonFileStrict(localConfigPath) },
  ];

  const merged = structuredClone(defaults);
  const loadedSources = [];

  for (const layer of layers) {
    if (!layer.data) continue;
    loadedSources.push(layer.source);
    const d = layer.data;

    if (d.routing !== undefined) {
      if (!VALID_ROUTING_MODES.has(d.routing)) {
        throw new DislopConfigError(
          `Invalid 'routing' value '${d.routing}' in '${layer.source}' (expected local, auto, cloud, or byok)`,
        );
      }
      merged.routing = d.routing;
    }
    if (d.activeProvider !== undefined) {
      merged.activeProvider = d.activeProvider ? String(d.activeProvider) : null;
    }
    if (d.approvedHosts !== undefined) {
      if (!Array.isArray(d.approvedHosts)) {
        throw new DislopConfigError(`'approvedHosts' in '${layer.source}' must be an array`);
      }
      merged.approvedHosts = Array.from(new Set([...merged.approvedHosts, ...d.approvedHosts.map(String)]));
    }
    if (d.packs !== undefined) {
      if (!Array.isArray(d.packs)) {
        throw new DislopConfigError(`'packs' in '${layer.source}' must be an array`);
      }
      merged.packs = d.packs.map(String);
    }
    if (d.lang !== undefined) {
      merged.lang = String(d.lang);
    }
    if (d.level !== undefined) {
      merged.level = String(d.level);
    }
    if (d.voice && typeof d.voice === "object" && !Array.isArray(d.voice)) {
      if (Array.isArray(d.voice.referenceFiles)) {
        merged.voice.referenceFiles = d.voice.referenceFiles.map((f) =>
          path.resolve(path.dirname(layer.source), expandTilde(f, env)),
        );
      }
      if (d.voice.cachePath) {
        merged.voice.cachePath = path.resolve(cwd, expandTilde(d.voice.cachePath, env));
      }
    }
    if (d.providers && typeof d.providers === "object" && !Array.isArray(d.providers)) {
      for (const [provName, provCfg] of Object.entries(d.providers)) {
        if (!provCfg || typeof provCfg !== "object") continue;
        merged.providers[provName] = { ...merged.providers[provName], ...provCfg };
      }
    }
  }

  // Apply CLI flag overrides
  const explicitEngine = Boolean(cliFlags.engine);
  if (cliFlags.engine) {
    if (!VALID_ROUTING_MODES.has(cliFlags.engine)) {
      throw new DislopConfigError(
        `Invalid --engine '${cliFlags.engine}' (expected auto, cloud, byok, or local)`,
      );
    }
    merged.routing = cliFlags.engine;
  }
  if (cliFlags.provider) {
    merged.activeProvider = String(cliFlags.provider);
  }
  if (cliFlags.packs && cliFlags.packs.length > 0) {
    merged.packs = cliFlags.packs;
  }
  if (cliFlags.lang) {
    if (!["auto", "en", "zh"].includes(cliFlags.lang)) {
      throw new DislopConfigError(`Invalid --lang '${cliFlags.lang}' (expected auto, en, or zh)`);
    }
    merged.lang = cliFlags.lang;
  }
  if (cliFlags.level) {
    if (!["strong", "moderate", "hint", "all"].includes(cliFlags.level)) {
      throw new DislopConfigError(
        `Invalid --level '${cliFlags.level}' (expected strong, moderate, hint, or all)`,
      );
    }
    merged.level = cliFlags.level;
  }
  if (cliFlags.voiceFiles && cliFlags.voiceFiles.length > 0) {
    merged.voice.referenceFiles = cliFlags.voiceFiles.map((f) => path.resolve(cwd, expandTilde(f, env)));
  }

  return {
    ...merged,
    explicitEngine,
    noLlm: Boolean(cliFlags.noLlm),
    homeDir,
    userConfigPath,
    credentialsPath: path.join(homeDir, "credentials.json"),
    modelsDir: path.join(homeDir, "models"),
    loadedSources,
  };
}

export function computeFilesFingerprint(filePaths) {
  const hash = crypto.createHash("sha256");
  const sorted = [...filePaths].sort();
  for (const fp of sorted) {
    if (!fs.existsSync(fp)) continue;
    hash.update(fp);
    hash.update("\0");
    hash.update(fs.readFileSync(fp));
    hash.update("\0");
  }
  return hash.digest("hex");
}
