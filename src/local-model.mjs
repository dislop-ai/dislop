/**
 * Hardware-aware Local Model Manager & Loopback Self-Healing Runner (`dislop.local-model/1`).
 * Zero external dependencies:
 *   - Bundled Default: `pocket-slop-v1.json` (~15 KB gz, 0 network, <0.5 ms)
 *   - Optional Local SLMs (`fast` | `balanced` | `quality`): 0.6B / 1.7B / 4B GGUF tiers
 *     with hardware guardrails, SHA-256 confined import, loopback-only TLS/HTTP enforcement,
 *     and unit-aware `verifyRevision` fact-lock fallback.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { auditText, extractProtectedFacts, getScenarioStrategy, verifyRevision } from "./core.mjs";
import { loadPocketModelBundle, scorePocketSpan } from "./pocket-model.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_CANDIDATES = [
  path.resolve(__dirname, "..", "models", "manifest.json"),
  path.resolve(__dirname, "models", "manifest.json"),
];

const VALID_PROVIDERS = new Set(["ollama", "gguf"]);

export const LOCAL_MODEL_TIERS = {
  none: {
    tier: "none",
    kind: "bundled-only",
    modelId: null,
    approxDownloadMb: 0,
    minRamGb: 0,
    minFreeDiskGb: 0,
    license: "Apache-2.0",
    summary: {
      en: "Built-in deterministic engine + bundled 15 KB Pocket ML ensemble (all 7 rule packs + 53 patterns + 5-axis telemetry included, 0 MB extra download).",
      zh: "仅使用随包内置的确定性引擎与 15 KB 传统集成模型（含全部 7 套规则包、53 条模式与 5 轴统计，无需额外下载）。",
    },
    installHint: null,
  },
  fast: {
    tier: "fast",
    kind: "local-slm-gguf",
    modelId: "qwen3:0.6b",
    approxDownloadMb: 520,
    minRamGb: 8,
    minFreeDiskGb: 2.0,
    license: "Apache-2.0",
    summary: {
      en: "Compact 0.6B bilingual model (~520 MB) for grey-zone filler triage on 8 GB CPU machines.",
      zh: "轻量 0.6B 双语小模型（约 520 MB），适合 8 GB 内存笔记本做灰区空话辅助复核。",
    },
    installHint: "dislop model install --tier fast",
  },
  balanced: {
    tier: "balanced",
    kind: "local-slm-gguf",
    modelId: "qwen3:1.7b",
    approxDownloadMb: 1300,
    minRamGb: 8,
    minFreeDiskGb: 3.0,
    license: "Apache-2.0",
    summary: {
      en: "Balanced 1.7B bilingual model (~1.3 GB) for local structural review on 8 GB Apple Silicon or 16 GB RAM.",
      zh: "均衡 1.7B 双语小模型（约 1.3 GB），适合 8 GB Apple Silicon 或 16 GB 内存设备离线审校与锁数字改写。",
    },
    installHint: "dislop model install --tier balanced",
  },
  quality: {
    tier: "quality",
    kind: "local-slm-gguf",
    modelId: "qwen3:4b",
    approxDownloadMb: 2500,
    minRamGb: 16,
    minFreeDiskGb: 5.0,
    license: "Apache-2.0",
    summary: {
      en: "High-precision 4B bilingual model (~2.5 GB) for local review & fact-locked paragraph cleanup on >= 16 GB Apple Silicon / GPU.",
      zh: "高精度 4B 双语小模型（约 2.5 GB），适合 >= 16 GB Apple Silicon 或独显机器做本地深度审校与锁数字改写。",
    },
    installHint: "dislop model install --tier quality",
  },
};

export function loadModelsManifest() {
  for (const p of MANIFEST_CANDIDATES) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  }
  return { schema: "dislop.models-manifest/1", version: "1.0.0", bundled: [], optionalTiers: LOCAL_MODEL_TIERS };
}

export function getModelCacheDir(overrideDir = null) {
  if (overrideDir) return path.resolve(overrideDir);
  if (process.env.DISLOP_MODEL_DIR) return path.resolve(process.env.DISLOP_MODEL_DIR);
  if (process.platform === "linux" && process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, "dislop", "models");
  }
  return path.join(os.homedir(), ".cache", "dislop", "models");
}

function readRegistry(cacheDir) {
  const regPath = path.join(cacheDir, "registry.json");
  if (!fs.existsSync(regPath)) return { version: 1, models: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(regPath, "utf8"));
    return Array.isArray(parsed.models) ? parsed : { version: 1, models: [] };
  } catch {
    return { version: 1, models: [] };
  }
}

function writeRegistry(cacheDir, reg) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const realCache = fs.realpathSync(cacheDir);
  const regPath = path.join(realCache, "registry.json");
  if (fs.existsSync(regPath) && fs.lstatSync(regPath).isSymbolicLink()) {
    throw new Error("Refusing to write registry.json through a symbolic link.");
  }
  const tmpPath = path.join(realCache, `.registry.${crypto.randomBytes(6).toString("hex")}.tmp`);
  fs.writeFileSync(tmpPath, JSON.stringify(reg, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
  fs.renameSync(tmpPath, regPath);
}

export function listInstalledModels(cacheDir = null) {
  const dir = getModelCacheDir(cacheDir);
  const reg = readRegistry(dir);
  return reg.models.map((entry) => ({
    ...entry,
    exists: entry.provider === "ollama" ? true : Boolean(entry.path && fs.existsSync(entry.path)),
  }));
}

export function probeHardware(overrides = null) {
  if (overrides) {
    return { ...overrides };
  }
  const platform = os.platform();
  const arch = os.arch();
  const cpus = os.cpus() || [];
  const cpuModel = cpus[0]?.model ? String(cpus[0].model).trim() : "unknown";
  const cpuCount = cpus.length || 1;
  const totalMemoryGb = Number((os.totalmem() / 1024 ** 3).toFixed(1));
  const isCi = Boolean(process.env.CI && process.env.CI !== "0" && process.env.CI !== "false");
  const isAppleSilicon = platform === "darwin" && arch === "arm64";

  let freeDiskGb = null;
  try {
    if (typeof fs.statfsSync === "function") {
      const st = fs.statfsSync(os.homedir());
      freeDiskGb = Number(((Number(st.bavail) * Number(st.bsize)) / 1024 ** 3).toFixed(1));
    }
  } catch {
    freeDiskGb = null;
  }

  const usableModelMemoryGb = Number((totalMemoryGb * (isAppleSilicon ? 0.62 : 0.38)).toFixed(1));
  return {
    platform,
    arch,
    cpuModel,
    cpuCount,
    totalMemoryGb,
    usableModelMemoryGb,
    freeDiskGb,
    isAppleSilicon,
    isCi,
  };
}

export function recommendModelTier(hw) {
  if (hw.isCi || hw.totalMemoryGb < 8 || (hw.freeDiskGb !== null && hw.freeDiskGb < 2.0)) {
    const reasonEn = hw.isCi
      ? "CI environment detected; keep fast zero-download deterministic + bundled 15 KB Pocket ML checks."
      : hw.freeDiskGb !== null && hw.freeDiskGb < 2.0
        ? `Low free disk space (${hw.freeDiskGb} GB); skipping multi-hundred-MB model weights (bundled 15 KB Pocket ML is already active).`
        : `System RAM (${hw.totalMemoryGb} GB) is below 8 GB; built-in rules + 15 KB Pocket ML run in < 5ms with 0 extra memory.`;
    const reasonZh = hw.isCi
      ? "检测到 CI 流水线环境，直接使用内置规则引擎与 15 KB 传统集成模型最快最稳。"
      : hw.freeDiskGb !== null && hw.freeDiskGb < 2.0
        ? `剩余磁盘空间较少（${hw.freeDiskGb} GB），跳过百 MB 级模型下载（内置 15 KB 传统集成模型已就绪）。`
        : `当前内存（${hw.totalMemoryGb} GB）低于 8 GB，内置规则包与 15 KB 传统集成模型已可完整离线工作。`;
    return { ...LOCAL_MODEL_TIERS.none, reason: { en: reasonEn, zh: reasonZh } };
  }

  if (hw.isAppleSilicon && hw.totalMemoryGb >= 16 && (hw.freeDiskGb === null || hw.freeDiskGb >= 5.0)) {
    return {
      ...LOCAL_MODEL_TIERS.quality,
      reason: {
        en: `Apple Silicon with ${hw.totalMemoryGb} GB unified memory (~${hw.usableModelMemoryGb} GB model budget) comfortably runs 4B Q4_K_M locally.`,
        zh: `检测到 ${hw.totalMemoryGb} GB 统一内存的 Apple Silicon（可用模型预算约 ${hw.usableModelMemoryGb} GB），可流畅选装 4B 本地小模型。`,
      },
    };
  }

  if ((hw.isAppleSilicon && hw.totalMemoryGb >= 8) || hw.totalMemoryGb >= 16) {
    return {
      ...LOCAL_MODEL_TIERS.balanced,
      reason: {
        en: `${hw.totalMemoryGb} GB RAM fits the 1.7B Q4_K_M tier (~1.3 GB) without starving IDE/browser memory.`,
        zh: `${hw.totalMemoryGb} GB 内存适合选装 1.7B 均衡档（约 1.3 GB），兼顾响应速度与日常开发内存余量。`,
      },
    };
  }

  return {
    ...LOCAL_MODEL_TIERS.fast,
    reason: {
      en: `${hw.totalMemoryGb} GB CPU system matches the lightweight 0.6B tier (~520 MB).`,
      zh: `${hw.totalMemoryGb} GB 内存通用机型建议选装轻量 0.6B 档（约 520 MB），避免拖慢系统。`,
    },
  };
}

function probeLoopbackJson(port, urlPath, timeoutMs = 250) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: urlPath, timeout: timeoutMs, agent: false },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

export async function discoverLocalRunners({ timeoutMs = 250 } = {}) {
  const runners = [];
  const ollama = await probeLoopbackJson(11434, "/api/tags", timeoutMs);
  if (ollama && Array.isArray(ollama.models)) {
    runners.push({
      kind: "ollama",
      endpoint: "http://127.0.0.1:11434",
      models: ollama.models.map((m) => m.name).slice(0, 20),
    });
  }
  const llamaServer = await probeLoopbackJson(8080, "/v1/models", timeoutMs);
  if (llamaServer && Array.isArray(llamaServer.data)) {
    runners.push({
      kind: "openai-compatible-local",
      endpoint: "http://127.0.0.1:8080",
      models: llamaServer.data.map((m) => m.id).slice(0, 20),
    });
  }
  return runners;
}

export async function buildModelStatusReport({
  packsCount = 7,
  rulesCount = 42,
  probeLoopback = true,
  hwOverrides = null,
  cacheDir = null,
} = {}) {
  const hardware = probeHardware(hwOverrides);
  const recommendation = recommendModelTier(hardware);
  const localRunners = probeLoopback ? await discoverLocalRunners() : [];
  const bundle = loadPocketModelBundle();
  const manifest = loadModelsManifest();
  const resolvedCache = getModelCacheDir(cacheDir);
  const installedModels = listInstalledModels(resolvedCache);

  return {
    schema: "dislop.local-model/1",
    builtinDeterministic: {
      ready: true,
      bundledPacks: packsCount,
      bundledRules: rulesCount,
      networkCallsDuringCheck: 0,
    },
    bundledModels: [
      {
        id: "pocket-slop-v1",
        schema: bundle.schema,
        version: bundle.version,
        ready: true,
        approxGzipKb: manifest.bundled?.[0]?.approxGzipKb ?? 15,
        runtimeDeps: "none",
        heads: ["pocket-slop-ensemble", "pocket-pack-router"],
      },
    ],
    modelCacheDir: resolvedCache,
    installedModels,
    hardware,
    recommendation,
    localRunners,
  };
}

function hasOllamaCli() {
  try {
    const r = spawnSync("ollama", ["--version"], { encoding: "utf8", timeout: 2500 });
    return r.status === 0;
  } catch {
    return false;
  }
}

export function installOptionalModel({
  tier = "auto",
  provider = "ollama",
  force = false,
  dryRun = false,
  cacheDir = null,
  hwOverrides = null,
} = {}) {
  if (!VALID_PROVIDERS.has(provider)) {
    return {
      ok: false,
      error: `Unknown provider '${provider}'. Supported providers: ollama, gguf.`,
    };
  }
  const hw = probeHardware(hwOverrides);
  const rec = recommendModelTier(hw);
  const resolvedTierName = tier === "auto" ? rec.tier : tier;
  const spec = Object.hasOwn(LOCAL_MODEL_TIERS, resolvedTierName) ? LOCAL_MODEL_TIERS[resolvedTierName] : null;
  if (!spec) {
    return {
      ok: false,
      error: `Unknown model tier '${resolvedTierName}'. Choose one of: none, fast, balanced, quality, auto.`,
    };
  }

  const resolvedCache = getModelCacheDir(cacheDir);

  if (resolvedTierName === "none") {
    return {
      ok: true,
      action: "none",
      tier: "none",
      modelId: null,
      bundledReady: true,
      message: {
        en: "Built-in deterministic rules and bundled 15 KB Pocket ML suite are already installed and ready.",
        zh: "内置规则包与随包 15 KB 传统集成模型已就绪，无需额外下载大体积权重。",
      },
    };
  }

  const minRam = spec.minRamGb || 0;
  const minDisk = spec.minFreeDiskGb || 0;
  const ramTooLow = hw.totalMemoryGb < minRam;
  const diskTooLow = hw.freeDiskGb !== null && hw.freeDiskGb < minDisk;

  if ((ramTooLow || diskTooLow) && !force) {
    const reasonEn = ramTooLow
      ? `Tier '${resolvedTierName}' (~${spec.approxDownloadMb} MB) requires >= ${minRam} GB RAM, but this machine has ${hw.totalMemoryGb} GB.`
      : `Tier '${resolvedTierName}' requires >= ${minDisk} GB free disk, but only ${hw.freeDiskGb} GB is available.`;
    const reasonZh = ramTooLow
      ? `档位「${resolvedTierName}」（约 ${spec.approxDownloadMb} MB）建议至少 ${minRam} GB 内存，当前设备为 ${hw.totalMemoryGb} GB。`
      : `档位「${resolvedTierName}」需要至少 ${minDisk} GB 可用磁盘空间，当前仅剩 ${hw.freeDiskGb} GB。`;
    return {
      ok: false,
      blockedByHardware: true,
      tier: resolvedTierName,
      recommendedTier: rec.tier,
      warning: {
        en: `${reasonEn} Recommended tier: '${rec.tier}'. Pass --force to override.`,
        zh: `${reasonZh} 当前推荐档位：「${rec.tier}」。如仍需安装请加 --force。`,
      },
    };
  }

  const plannedCmd =
    provider === "gguf"
      ? `dislop model import <file.gguf> --tier ${resolvedTierName}`
      : `ollama pull ${spec.modelId}`;

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      tier: resolvedTierName,
      modelId: spec.modelId,
      provider,
      approxDownloadMb: spec.approxDownloadMb,
      modelCacheDir: resolvedCache,
      command: plannedCmd,
      hardwareCheck: ramTooLow || diskTooLow ? "forced-override" : "passed",
    };
  }

  if (provider === "gguf") {
    return {
      ok: false,
      missingWeights: true,
      tier: resolvedTierName,
      modelId: spec.modelId,
      message: {
        en: `Pass a local GGUF file to import with SHA-256 verification: 'dislop model import <file.gguf> --tier ${resolvedTierName}'.`,
        zh: `请指定本地 GGUF 权重文件执行离线校验导入：'dislop model import <file.gguf> --tier ${resolvedTierName}'。`,
      },
    };
  }

  if (!hasOllamaCli()) {
    return {
      ok: false,
      missingRunner: true,
      tier: resolvedTierName,
      modelId: spec.modelId,
      message: {
        en: `Local runner 'ollama' was not found in PATH. Install Ollama (https://ollama.com) or import an offline GGUF weight file via 'dislop model import <file.gguf> --tier ${resolvedTierName}'.`,
        zh: `未在 PATH 中检测到 ollama。可先安装 Ollama，或在内网离线环境通过 'dislop model import <file.gguf> --tier ${resolvedTierName}' 直接导入权重文件。`,
      },
    };
  }

  const pull = spawnSync("ollama", ["pull", spec.modelId], { stdio: "inherit" });
  if (pull.status !== 0) {
    return {
      ok: false,
      tier: resolvedTierName,
      modelId: spec.modelId,
      error: `ollama pull ${spec.modelId} exited with code ${pull.status}`,
    };
  }

  const reg = readRegistry(resolvedCache);
  reg.models = reg.models.filter((m) => !(m.tier === resolvedTierName && m.provider === "ollama"));
  reg.models.push({
    id: spec.modelId,
    tier: resolvedTierName,
    provider: "ollama",
    path: null,
    sizeBytes: spec.approxDownloadMb * 1024 * 1024,
    sha256: null,
    installedAt: new Date().toISOString(),
  });
  writeRegistry(resolvedCache, reg);

  return {
    ok: true,
    tier: resolvedTierName,
    modelId: spec.modelId,
    provider: "ollama",
    modelCacheDir: resolvedCache,
  };
}

function sha256FileSync(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(65536);
  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

export function importLocalModelFile({
  filePath,
  tier = "custom",
  expectedSha256 = null,
  copyFile = true,
  cacheDir = null,
} = {}) {
  const srcAbs = path.resolve(String(filePath || ""));
  if (!fs.existsSync(srcAbs) || !fs.statSync(srcAbs).isFile()) {
    return { ok: false, error: `Model file not found: ${filePath}` };
  }
  const fileName = path.basename(srcAbs);
  const ext = path.extname(fileName).toLowerCase();
  if (fileName.toLowerCase() === "registry.json" || ![".gguf", ".onnx", ".bin"].includes(ext)) {
    return { ok: false, error: `Unsupported model file '${fileName}' (expected .gguf, .onnx, or .bin).` };
  }

  const actualSha = sha256FileSync(srcAbs);
  if (expectedSha256 && actualSha.toLowerCase() !== String(expectedSha256).trim().toLowerCase()) {
    return {
      ok: false,
      reason: "sha256-mismatch",
      expectedSha256: String(expectedSha256).trim().toLowerCase(),
      actualSha256: actualSha,
      error: `SHA-256 mismatch for ${fileName}`,
    };
  }

  const resolvedCache = getModelCacheDir(cacheDir);
  fs.mkdirSync(resolvedCache, { recursive: true });
  const realCache = fs.realpathSync(resolvedCache);
  const destAbs = copyFile ? path.join(realCache, fileName) : fs.realpathSync(srcAbs);

  if (copyFile && fs.realpathSync(srcAbs) !== destAbs) {
    if (fs.existsSync(destAbs) && fs.lstatSync(destAbs).isSymbolicLink()) {
      return { ok: false, error: `Refusing to overwrite symbolic link in model cache: ${destAbs}` };
    }
    const nonce = crypto.randomBytes(6).toString("hex");
    const tmpDest = path.join(realCache, `.${fileName}.${nonce}.part`);
    fs.copyFileSync(srcAbs, tmpDest, fs.constants.COPYFILE_EXCL);
    fs.renameSync(tmpDest, destAbs);
  }

  const sizeBytes = fs.statSync(destAbs).size;
  const reg = readRegistry(realCache);
  reg.models = reg.models.filter((m) => m.id !== fileName && m.path !== destAbs);
  const entry = {
    id: fileName,
    tier,
    provider: ext === ".onnx" ? "onnx-file" : "gguf-file",
    path: destAbs,
    sizeBytes,
    sha256: actualSha,
    installedAt: new Date().toISOString(),
  };
  reg.models.push(entry);
  writeRegistry(realCache, reg);

  return {
    ok: true,
    modelCacheDir: realCache,
    imported: entry,
  };
}

export function removeInstalledModel({ target, cacheDir = null } = {}) {
  const resolvedCache = getModelCacheDir(cacheDir);
  if (!fs.existsSync(resolvedCache)) {
    return { ok: false, error: `No cached models found in ${resolvedCache}` };
  }
  const realCache = fs.realpathSync(resolvedCache);
  const reg = readRegistry(realCache);
  const key = String(target || "").trim();
  if (!key) {
    return { ok: false, error: "Specify a tier or model id to remove." };
  }
  const removed = [];
  const kept = [];
  for (const m of reg.models) {
    if (m.tier === key || m.id === key) {
      if (m.provider === "ollama" && m.id && hasOllamaCli()) {
        spawnSync("ollama", ["rm", m.id], { stdio: "ignore" });
      }
      if (m.path) {
        try {
          const parentDir = path.dirname(m.path);
          const baseName = path.basename(m.path);
          if (fs.existsSync(parentDir) && fs.realpathSync(parentDir) === realCache && baseName !== "registry.json") {
            const safeTarget = path.join(realCache, baseName);
            const st = fs.lstatSync(safeTarget);
            if (st.isFile() || st.isSymbolicLink()) {
              fs.unlinkSync(safeTarget);
            }
          }
        } catch {}
      }
      removed.push(m);
    } else {
      kept.push(m);
    }
  }
  writeRegistry(realCache, { version: 1, models: kept });
  return { ok: removed.length > 0, removedCount: removed.length, removed };
}

export function assertSafeLocalEndpoint(endpointUrl, { allowLan = false } = {}) {
  let parsed;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    throw new Error(`Invalid local model endpoint URL: ${endpointUrl}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol '${parsed.protocol}' for local model endpoint.`);
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!isLoopback && !allowLan) {
    throw new Error(
      `Refusing non-loopback endpoint '${host}' in --local mode (data must stay on 127.0.0.1). Pass --allow-lan only for trusted intranet servers.`
    );
  }
  return parsed;
}

function postJsonHttp(urlObj, payload, timeoutMs = 30000) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const isHttps = urlObj.protocol === "https:";
  const transport = isHttps ? https : http;
  const host = urlObj.hostname.replace(/^\[|\]$/g, "");
  const defaultPort = isHttps ? 443 : 80;
  const port = urlObj.port ? Number(urlObj.port) : defaultPort;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        hostname: host,
        port,
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
        },
        timeout: timeoutMs,
        agent: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Local runner HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error(`Invalid JSON from local runner: ${text.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Local model request timed out after ${timeoutMs}ms`));
    });
    req.on("error", (err) => reject(err));
    req.write(body);
    req.end();
  });
}

async function callLocalChatCompletion({ endpoint, kind, model, systemPrompt, userPrompt, timeoutMs = 30000, allowLan = false }) {
  const baseUrl = assertSafeLocalEndpoint(endpoint, { allowLan });
  if (kind === "ollama") {
    const target = new URL("/api/chat", baseUrl);
    const resp = await postJsonHttp(
      target,
      {
        model,
        stream: false,
        think: false,
        options: { temperature: 0.2, num_ctx: 4096 },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      },
      timeoutMs
    );
    return String(resp?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  }

  const target = new URL("/v1/chat/completions", baseUrl);
  const resp = await postJsonHttp(
    target,
    {
      model: model || "local-model",
      temperature: 0.2,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    },
    timeoutMs
  );
  return String(resp?.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

const UNIT_EXTRACT_RE = /([0-9][0-9,]*(?:\.[0-9]+)?)\s*(%|ms|sec|seconds?|s|mins?|minutes?|hrs?|hours?|days?|kb|mb|gb|tb|qps|tps|rps|fps|px|毫秒|秒|分钟|小时|个月|天|年|倍|万|亿|美元|元|次|个|条|份|页|行|人|席)/gi;

function canonicalizeUnit(u) {
  const low = String(u || "").toLowerCase();
  if (low === "s" || low === "sec" || low === "second" || low === "seconds" || low === "秒") return "s";
  if (low === "ms" || low === "毫秒") return "ms";
  if (low === "min" || low === "mins" || low === "minute" || low === "minutes" || low === "分钟") return "min";
  if (low === "hr" || low === "hrs" || low === "hour" || low === "hours" || low === "小时") return "h";
  if (low === "day" || low === "days" || low === "天") return "d";
  return low;
}

function extractNumberUnitMultiset(text) {
  const counts = new Map();
  const s = String(text || "");
  let m;
  UNIT_EXTRACT_RE.lastIndex = 0;
  while ((m = UNIT_EXTRACT_RE.exec(s)) !== null) {
    const num = m[1].replace(/,/g, "");
    const unit = canonicalizeUnit(m[2]);
    const key = `${num}:${unit}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function verifyFactsWithUnits(beforeText, afterText, { modality = "markdown" } = {}) {
  const ledger = verifyRevision(beforeText, afterText, { modality, allowAdded: false });
  const beforeUnits = extractNumberUnitMultiset(beforeText);
  const afterUnits = extractNumberUnitMultiset(afterText);
  const unitMismatches = [];
  for (const [k, cnt] of beforeUnits.entries()) {
    if ((afterUnits.get(k) || 0) < cnt) {
      unitMismatches.push(k);
    }
  }
  return {
    ok: ledger.status === "preserved" && unitMismatches.length === 0,
    ledger,
    unitMismatches,
  };
}

function buildParagraphDeslopPrompt(
  paragraph,
  findings,
  pocketScore,
  protectedFacts,
  repairFeedback = null,
  { packId = "business-brief", register = "unspecified" } = {}
) {
  const isZh = /[\u4e00-\u9fff]/.test(paragraph);
  const strategy = getScenarioStrategy({ packId, register });
  const lockedTokens = protectedFacts.map((f) => f.raw);
  const ruleNotes = findings.map((f) => `- ${f.ruleId}: ${(isZh ? f.message?.zh : f.message?.en) || f.ruleId}`);
  const mlNotes = (pocketScore.topDrivers || []).map(
    (d) => `- ${isZh ? d.reason.zh : d.reason.en}`
  );
  const diag = [...ruleNotes, ...mlNotes].slice(0, 5).join("\n");

  if (isZh) {
    const sys = [
      `你是贴合当前写作场景（${strategy.label.zh}）的审改编辑。`,
      `重点清除：${strategy.cut.zh}`,
      `必须保留：${strategy.protect.zh}`,
      `严禁改偏：${strategy.avoid.zh}`,
      "只输出改写后的纯正文段落，不加解释、不加引号、不加开头寒暄，严禁编造原句没有的数字，严禁篡改单位，严禁写成『不是……而是……』或三段分号排比。",
    ].join("\n");
    let usr = `请按「${strategy.label.zh}」场景要求改净下面段落，保留全部事实含义：\n\n【原段】\n${paragraph}\n`;
    if (diag) usr += `\n【检测到的问题】\n${diag}\n`;
    if (lockedTokens.length > 0) {
      usr += `\n【必须原样保留的数字、单位、限定词、代码与链接】\n${lockedTokens.join(" 、 ")}\n`;
    }
    if (repairFeedback) {
      usr += `\n【上一版改写未通过核验，请立即修正】\n${repairFeedback}\n`;
    }
    return { systemPrompt: sys, userPrompt: usr };
  }

  const sys = [
    `You are an editor tuned for ${strategy.label.en} (${strategy.id}).`,
    `Cut: ${strategy.cut.en}`,
    `Protect: ${strategy.protect.en}`,
    `Avoid: ${strategy.avoid.en}`,
    "Output ONLY the rewritten paragraph text—no preamble, no quotes, no invented numbers, no altered units, no semicolon tricolons, and no 'Not X, but Y' slogans.",
  ].join("\n");
  let usr = `Clean AI slop from this ${strategy.label.en} paragraph while preserving every fact:\n\n[Original]\n${paragraph}\n`;
  if (diag) usr += `\n[Detected issues]\n${diag}\n`;
  if (lockedTokens.length > 0) {
    usr += `\n[Must preserve verbatim (numbers, units, qualifiers, inline code, URLs)]\n${lockedTokens.join(" | ")}\n`;
  }
  if (repairFeedback) {
    usr += `\n[Previous rewrite failed verification — fix this]\n${repairFeedback}\n`;
  }
  return { systemPrompt: sys, userPrompt: usr };
}

function splitDocumentPreservingProtectedBlocks(raw) {
  const s = String(raw || "");
  const protectedBlockRe = /(<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->|```[\s\S]*?```|~~~[\s\S]*?~~~)/gi;
  const tokens = [];
  let lastIdx = 0;
  let m;
  while ((m = protectedBlockRe.exec(s)) !== null) {
    if (m.index > lastIdx) {
      tokens.push({ protected: false, text: s.slice(lastIdx, m.index) });
    }
    tokens.push({ protected: true, text: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < s.length) {
    tokens.push({ protected: false, text: s.slice(lastIdx) });
  }
  const segments = [];
  for (const t of tokens) {
    if (t.protected) {
      segments.push(t);
    } else {
      for (const part of t.text.split(/(\n\s*\n)/)) {
        if (!part) continue;
        segments.push({ protected: /^\n\s*\n$/.test(part), text: part });
      }
    }
  }
  return segments;
}

function resolvePreferredModelId(discoveredModels = [], cacheDir = null) {
  const installed = listInstalledModels(cacheDir).filter((m) => m.exists);
  for (const inst of installed) {
    if (discoveredModels.includes(inst.id)) return inst.id;
    const stem = inst.id.replace(/\.(?:gguf|bin|onnx)$/i, "").toLowerCase();
    const hit = discoveredModels.find((dm) => dm.toLowerCase().includes(stem));
    if (hit) return hit;
  }
  if (discoveredModels.length > 0) return discoveredModels[0];
  if (installed.length > 0) return installed[0].id;
  return "qwen3:1.7b";
}

export async function runLocalDeslop({
  text,
  pack,
  modality = "markdown",
  register = null,
  endpoint = null,
  runnerKind = null,
  model = null,
  allowLan = false,
  timeoutMs = 30000,
  cacheDir = null,
} = {}) {
  let resolvedEndpoint = endpoint || process.env.DISLOP_LOCAL_URL || null;
  let resolvedKind = runnerKind || null;
  let resolvedModel = model || process.env.DISLOP_LOCAL_MODEL || null;

  if (!resolvedEndpoint) {
    const discovered = await discoverLocalRunners({ timeoutMs: 400 });
    if (discovered.length === 0) {
      return {
        ok: false,
        error:
          "No active local model daemon found on 127.0.0.1:11434 (Ollama) or 127.0.0.1:8080 (llama-server). Run 'dislop model status' or 'dislop model install'.",
      };
    }
    resolvedEndpoint = discovered[0].endpoint;
    resolvedKind = discovered[0].kind;
    if (!resolvedModel) {
      resolvedModel = resolvePreferredModelId(discovered[0].models || [], cacheDir);
    }
  } else {
    if (!resolvedKind) {
      resolvedKind = resolvedEndpoint.includes(":11434") ? "ollama" : "openai-compatible-local";
    }
    if (!resolvedModel) {
      resolvedModel = resolvePreferredModelId([], cacheDir);
    }
  }

  assertSafeLocalEndpoint(resolvedEndpoint, { allowLan });

  const raw = String(text || "");
  const segments = splitDocumentPreservingProtectedBlocks(raw);
  const outSegments = [];
  const paragraphAudits = [];
  let rewrittenCount = 0;
  let fallbackCount = 0;

  for (const item of segments) {
    const seg = item.text;
    const trimmed = seg.trim();
    if (
      item.protected ||
      !trimmed ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("|") ||
      trimmed.startsWith("<!--")
    ) {
      outSegments.push(seg);
      continue;
    }

    const beforeAudit = auditText(seg, { filename: "draft.md", modality, pack, register });
    const beforePocket = scorePocketSpan(seg);
    const needsRewrite = beforeAudit.findings.length > 0 || (beforePocket.eligible && beforePocket.slopProbability >= 0.65);

    if (!needsRewrite) {
      outSegments.push(seg);
      continue;
    }

    const protectedFacts = extractProtectedFacts(seg, { modality });
    let accepted = null;
    let fallbackReason = null;
    let repairFeedback = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { systemPrompt, userPrompt } = buildParagraphDeslopPrompt(
        seg,
        beforeAudit.findings,
        beforePocket,
        protectedFacts,
        repairFeedback,
        { packId: pack?.id || "business-brief", register: register || "unspecified" }
      );
      const candidate = await callLocalChatCompletion({
        endpoint: resolvedEndpoint,
        kind: resolvedKind,
        model: resolvedModel,
        systemPrompt,
        userPrompt,
        timeoutMs,
        allowLan,
      });
      if (!candidate) {
        fallbackReason = "empty-model-response";
        continue;
      }

      const factCheck = verifyFactsWithUnits(seg, candidate, { modality });
      const afterAudit = auditText(candidate, { filename: "draft.md", modality, pack, register });
      const hardErrorsAfter = afterAudit.findings.filter((f) => f.severity === "error" || f.severity === "warning");
      const hardErrorsBefore = beforeAudit.findings.filter((f) => f.severity === "error" || f.severity === "warning");

      if (factCheck.ok && hardErrorsAfter.length <= hardErrorsBefore.length && hardErrorsAfter.length === 0) {
        accepted = candidate;
        break;
      }

      const reasons = [];
      if (!factCheck.ok) {
        const ledger = factCheck.ledger;
        const missing = [
          ...(ledger.missing || []).map((f) => f.raw),
          ...(ledger.qualifierDropped || []).map((f) => f.before),
          ...(ledger.addedNumbers || []).map((f) => `+${f.raw}`),
          ...factCheck.unitMismatches.map((u) => `unit:${u}`),
        ];
        reasons.push(`Fact verification failed (${missing.join(", ")})`);
      }
      if (hardErrorsAfter.length > 0) {
        reasons.push(`Residual slop rules triggered (${hardErrorsAfter.map((f) => f.ruleId).join(", ")})`);
      }
      fallbackReason = reasons.join("; ");
      repairFeedback = fallbackReason;
    }

    if (accepted !== null) {
      outSegments.push(accepted);
      rewrittenCount += 1;
      paragraphAudits.push({
        status: "rewritten",
        beforeFindings: beforeAudit.findings.length,
        beforePocketProb: beforePocket.slopProbability,
        afterPocketProb: scorePocketSpan(accepted).slopProbability,
      });
    } else {
      outSegments.push(seg);
      fallbackCount += 1;
      paragraphAudits.push({
        status: "kept-original",
        keptOriginal: true,
        fallbackReason: fallbackReason || "verification-failed",
      });
    }
  }

  let finalText = outSegments.join("");
  let finalCheck = verifyFactsWithUnits(raw, finalText, { modality });
  if (!finalCheck.ok) {
    finalText = raw;
    fallbackCount += rewrittenCount;
    rewrittenCount = 0;
    finalCheck = verifyFactsWithUnits(raw, finalText, { modality });
  }

  return {
    ok: true,
    endpoint: resolvedEndpoint,
    runnerKind: resolvedKind,
    model: resolvedModel,
    rewrittenParagraphs: rewrittenCount,
    keptOriginalParagraphs: fallbackCount,
    factLedgerOk: finalCheck.ok,
    paragraphs: paragraphAudits,
    text: finalText,
  };
}
