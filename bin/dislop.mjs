#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ENGINE_VERSION,
  SEVERITY_RANK,
  VALID_REGISTERS,
  fnv1aHex,
  codePointLength,
  detectModality,
  defaultPackForModality,
  isLongFormHtmlDocument,
  hasEmbeddedUiMarkup,
  deriveFixStrategy,
  computeRulesetHash,
  validateConfig,
  resolveRegister,
  applyRegisterOverride,
  getScenarioStrategy,
  computeFindingConfidence,
  buildFindingRevision,
  resolveEffectivePack,
  buildZones,
  auditText,
  auditOoxmlEntries,
  auditImageDocument,
  auditPdfDocument,
  analyzeTextProfile,
  verifyRevision,
  verifyRevisionBundle,
  formatReport,
  buildCatalog,
  queryCatalog,
  extractVoiceProfileOffline,
} from "../src/core.mjs";
import { analyzePatternProfile, auditPatterns } from "../src/pattern-engine.mjs";
import {
  analyzeDocumentWithPocketModels,
  predictPackWithPocketRouter,
} from "../src/pocket-model.mjs";
import {
  LOCAL_MODEL_TIERS,
  buildModelStatusReport,
  installOptionalModel,
  importLocalModelFile,
  removeInstalledModel,
  runLocalDeslop,
} from "../src/local-model.mjs";
import { parseImageBuffer, parsePdfBuffer, readZipXmlEntries } from "../src/binary-node.mjs";
import {
  resolveProviderConfig,
  inspectByokEnvStatus,
  extractOoxmlReviewText,
  chunkTextByParagraphs,
  buildReviewPrompt,
  runReviewRequest,
  validateAndNormalizeReviewResponse,
  assertLoopbackEndpoint,
  scrubSecrets,
  pingEndpointHealth,
} from "../src/review-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const PACKS_DIR = path.join(REPO_ROOT, "packs");
const PATTERNS_DIR = path.join(REPO_ROOT, "patterns");

const DEFAULT_IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
]);

function loadAllPacks(customPacksDir = PACKS_DIR) {
  const packs = {};
  if (!fs.existsSync(customPacksDir)) return packs;
  for (const entry of fs.readdirSync(customPacksDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(customPacksDir, entry.name, "pack.json");
    if (fs.existsSync(manifestPath)) {
      const data = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      packs[data.id] = data;
    }
  }
  return packs;
}

function loadPatternLibrary(customPatternsDir = PATTERNS_DIR) {
  const dimDir = path.join(customPatternsDir, "dimensions");
  const byRuleId = {};
  if (!fs.existsSync(dimDir)) return byRuleId;
  for (const entry of fs.readdirSync(dimDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dimDir, entry.name), "utf8"));
    const dim = data.dimension || null;
    for (const pat of data.patterns || []) {
      if (pat.ruleId) {
        byRuleId[pat.ruleId] = { dimension: dim, ...pat };
      }
    }
  }
  return byRuleId;
}

function getUserConfigDir() {
  if (process.env.DISLOP_CONFIG_HOME) {
    return path.resolve(process.env.DISLOP_CONFIG_HOME);
  }
  const base = process.env.XDG_CONFIG_HOME ? path.resolve(process.env.XDG_CONFIG_HOME) : path.join(os.homedir(), ".config");
  return path.join(base, "dislop");
}

function shouldSkipUserConfig(cwd, explicitConfigPath = null) {
  if (explicitConfigPath || process.env.DISLOP_NO_USER_CONFIG === "1") return true;
  const isSelfRepo =
    fs.existsSync(path.join(cwd, "packs", "core", "pack.json")) &&
    fs.existsSync(path.join(cwd, "src", "core.mjs"));
  return isSelfRepo && !process.env.DISLOP_CONFIG_HOME;
}

function mergeConfigLayers(base, layer) {
  if (!layer || typeof layer !== "object") return base;
  return {
    ...base,
    ...layer,
    rules: { ...(base.rules || {}), ...(layer.rules || {}) },
    allow: [...(base.allow || []), ...(layer.allow || [])],
    ignore: [...(base.ignore || []), ...(layer.ignore || [])],
    forbid: [...(base.forbid || []), ...(layer.forbid || [])],
    overrides: [...(base.overrides || []), ...(layer.overrides || [])],
    proseFences: [...(base.proseFences || []), ...(layer.proseFences || [])],
    ...(layer.maskBlockquotes !== undefined ? { maskBlockquotes: layer.maskBlockquotes } : {}),
  };
}

class ConfigError extends Error {}

function readConfigJson(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new ConfigError(`cannot read config '${filePath}': ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`invalid config '${filePath}': ${err.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigError(`invalid config '${filePath}': expected a JSON object`);
  }
  return parsed;
}

function loadConfig(cwd = process.cwd(), explicitConfigPath = null) {
  let base = {};
  if (!shouldSkipUserConfig(cwd, explicitConfigPath)) {
    const userCfgPath = path.join(getUserConfigDir(), "config.json");
    if (fs.existsSync(userCfgPath)) {
      base = mergeConfigLayers(base, readConfigJson(userCfgPath));
    }
  }
  if (explicitConfigPath) {
    const resolved = path.resolve(cwd, explicitConfigPath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new ConfigError(`config file not found: ${explicitConfigPath}`);
    }
    base = mergeConfigLayers(base, readConfigJson(resolved));
  } else {
    const candidates = [
      path.join(cwd, ".dislop.json"),
      path.join(cwd, "dislop.json"),
      path.join(cwd, ".disloprc.json"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        base = mergeConfigLayers(base, readConfigJson(candidate));
        break;
      }
    }
  }

  const localPath = path.join(cwd, ".dislop.local.json");
  if (fs.existsSync(localPath)) {
    base = mergeConfigLayers(base, readConfigJson(localPath));
  }
  try {
    return validateConfig(base);
  } catch (err) {
    throw new ConfigError(err.message);
  }
}

function loadConfigOrExit(cwd = process.cwd(), explicitConfigPath = null) {
  try {
    return loadConfig(cwd, explicitConfigPath);
  } catch (err) {
    console.error(`dislop: ${err.message}`);
    process.exit(2);
  }
}

function summarizeReportContext(regPairs = [], flagRegister = null) {
  if (flagRegister && String(flagRegister).trim().toLowerCase() !== "auto") {
    return { register: String(flagRegister).trim().toLowerCase(), registerSource: "flag" };
  }
  if (!regPairs || regPairs.length === 0) {
    return { register: "unspecified", registerSource: "default" };
  }
  const regs = new Set(regPairs.map((r) => r.register));
  const srcs = new Set(regPairs.map((r) => r.registerSource));
  if (regs.size === 1) {
    const register = regPairs[0].register;
    const registerSource = srcs.size === 1 ? regPairs[0].registerSource : "mixed";
    return { register, registerSource };
  }
  return { register: "mixed", registerSource: "mixed" };
}

function discoverVoiceCard(cwd = process.cwd()) {
  const candidates = [
    ["local", path.join(cwd, ".dislop.local", "voice.json")],
    ["project", path.join(cwd, ".dislop", "voice.json")],
  ];
  if (!shouldSkipUserConfig(cwd, null)) {
    candidates.push(["user", path.join(getUserConfigDir(), "voice.json")]);
  }
  for (const [scope, p] of candidates) {
    if (fs.existsSync(p)) {
      try {
        const card = JSON.parse(fs.readFileSync(p, "utf8"));
        if (card && typeof card === "object" && !Array.isArray(card)) {
          return { found: true, scope, card };
        }
      } catch {
        // ignore unreadable voice card
      }
    }
  }
  return { found: false, scope: null, card: null };
}

function expandBraces(pattern) {
  const m = pattern.match(/\{([^{}]+)\}/);
  if (!m) return [pattern];
  const prefix = pattern.slice(0, m.index);
  const suffix = pattern.slice(m.index + m[0].length);
  return m[1].split(",").flatMap((part) => expandBraces(prefix + part.trim() + suffix));
}

function globToRegExp(glob) {
  const norm = glob.replace(/\\/g, "/").replace(/^\.\//, "");
  let rx = "^";
  for (let i = 0; i < norm.length; i += 1) {
    const ch = norm[i];
    if (ch === "*" && norm[i + 1] === "*") {
      if (norm[i + 2] === "/") {
        rx += "(?:.+/)?";
        i += 2;
      } else {
        rx += ".*";
        i += 1;
      }
    } else if (ch === "*") {
      rx += "[^/]*";
    } else if (ch === "?") {
      rx += "[^/]";
    } else if ("+.^$|()[]{}".includes(ch)) {
      rx += "\\" + ch;
    } else {
      rx += ch;
    }
  }
  rx += "$";
  return new RegExp(rx);
}

function matchesAnyGlob(relPosix, globs = []) {
  const clean = relPosix.replace(/^\.\//, "");
  return globs.flatMap(expandBraces).some((g) => globToRegExp(g).test(clean));
}

function resolveConfigForFile(relPosix, config = {}) {
  let merged = {
    ...config,
    rules: { ...(config.rules || {}) },
    allow: [...(config.allow || [])],
    forbid: [...(config.forbid || [])],
    proseFences: [...(config.proseFences || [])],
  };
  for (const ov of config?.overrides || []) {
    const patterns = Array.isArray(ov.files) ? ov.files : [ov.files];
    if (!matchesAnyGlob(relPosix, patterns)) continue;
    merged = {
      ...merged,
      ...(ov.pack ? { pack: ov.pack } : {}),
      rules: { ...merged.rules, ...(ov.rules || {}) },
      allow: [...merged.allow, ...(ov.allow || [])],
      forbid: [...merged.forbid, ...(ov.forbid || [])],
      proseFences: [...merged.proseFences, ...(ov.proseFences || [])],
      ...(ov.maskBlockquotes !== undefined ? { maskBlockquotes: ov.maskBlockquotes } : {}),
    };
  }
  return merged;
}

function mergePacks(primaryPack, extraPack) {
  const byId = new Map();
  for (const r of extraPack.rules || []) byId.set(r.id, r);
  for (const r of primaryPack.rules || []) byId.set(r.id, r);
  return {
    ...extraPack,
    ...primaryPack,
    id: `${primaryPack.id}+${extraPack.id}`,
    thresholds: { ...(extraPack.thresholds || {}), ...(primaryPack.thresholds || {}) },
    rules: Array.from(byId.values()),
  };
}

function pickPackForFile(relPosix, modality, explicitPack, config) {
  if (explicitPack && explicitPack !== "auto") return explicitPack;
  const resolvedCfg = resolveConfigForFile(relPosix, config);
  if (resolvedCfg?.pack && explicitPack !== "auto") return resolvedCfg.pack;
  return defaultPackForModality(modality);
}

function decodeUtf8Strict(buffer) {
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  return decoder.decode(buffer);
}

function collectFiles(targetPaths, cwd, config, explicitTargets = true) {
  const realCwd = fs.existsSync(cwd) ? fs.realpathSync(cwd) : cwd;
  const files = [];
  const skipped = [];
  const ignoreGlobs = config?.ignore || [];

  // When running inside the dislop repo itself without custom config, skip intentional bad-example dirs
  const isSelfRepo =
    fs.existsSync(path.join(realCwd, "packs", "core", "pack.json")) &&
    fs.existsSync(path.join(realCwd, "src", "core.mjs"));
  const effectiveIgnores = isSelfRepo && ignoreGlobs.length === 0
    ? ["packs/**", "tests/**", "scratch/**"]
    : ignoreGlobs;

  function walk(absPath, explicit) {
    if (!fs.existsSync(absPath)) {
      throw new Error(`Target path not found: ${absPath}`);
    }
    const canonicalPath = fs.realpathSync(absPath);
    const stat = fs.statSync(canonicalPath);
    const rawRel = path.relative(realCwd, canonicalPath);
    const rel =
      !rawRel || rawRel === "."
        ? path.basename(canonicalPath)
        : rawRel === ".." || rawRel.startsWith(`..${path.sep}`) || path.isAbsolute(rawRel)
          ? path.basename(canonicalPath)
          : rawRel.split(path.sep).join("/");

    if (!explicit && matchesAnyGlob(rel, effectiveIgnores)) {
      return;
    }

    if (stat.isDirectory()) {
      const entries = fs
        .readdirSync(canonicalPath, { withFileTypes: true })
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const entry of entries) {
        if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
        walk(path.join(canonicalPath, entry.name), false);
      }
      return;
    }

    if (!stat.isFile()) return;
    const mod = detectModality(canonicalPath);
    if (!mod) {
      if (explicit) {
        skipped.push({ file: rel, reason: `Unsupported file extension '${path.extname(canonicalPath) || "(none)"}'` });
      }
      return;
    }
    files.push({ absPath: canonicalPath, rel, modality: mod, explicit });
  }

  for (const t of targetPaths) {
    walk(path.resolve(realCwd, t), explicitTargets);
  }
  return { files, skipped };
}

const PROSE_ML_MODALITIES = new Set(["markdown", "text", "html", "svg"]);

function buildCodepointLineStarts(text) {
  const starts = [0];
  let cpIdx = 0;
  for (const ch of String(text || "")) {
    cpIdx += 1;
    if (ch === "\n") starts.push(cpIdx);
  }
  return starts;
}

function cpOffsetToLine(cpStarts, cpOff) {
  let lo = 0;
  let hi = cpStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cpStarts[mid] <= cpOff) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, hi) + 1;
}

function unquoteGitPath(rawPath) {
  const s = String(rawPath || "");
  if (s.length < 2 || !s.startsWith('"') || !s.endsWith('"')) return s;
  const inner = s.slice(1, -1);
  const bytes = [];
  const pushStr = (str) => {
    for (const b of Buffer.from(str, "utf8")) bytes.push(b);
  };
  const escMap = { a: "\x07", b: "\x08", f: "\x0c", n: "\n", r: "\r", t: "\t", v: "\x0b", "\\": "\\", '"': '"' };
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch !== "\\") {
      pushStr(ch);
      continue;
    }
    if (i + 1 >= inner.length) {
      bytes.push(0x5c);
      break;
    }
    const next = inner[i + 1];
    if (/[0-7]{3}/.test(inner.slice(i + 1, i + 4))) {
      bytes.push(parseInt(inner.slice(i + 1, i + 4), 8));
      i += 3;
    } else if (next in escMap) {
      pushStr(escMap[next]);
      i += 1;
    } else {
      pushStr(next);
      i += 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function getChangedLineMap(cwd, gitRef, staged = false) {
  const args = staged
    ? [
        "-c", "core.quotepath=off",
        "-c", "diff.interHunkContext=0",
        "diff", "--cached",
        "--no-ext-diff", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", "--relative",
        "-U0", "--no-color", "--",
      ]
    : [
        "-c", "core.quotepath=off",
        "-c", "diff.interHunkContext=0",
        "diff",
        "--no-ext-diff", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", "--relative",
        "-U0", "--no-color", gitRef || "HEAD", "--",
      ];
  const diffOut = execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const changed = new Map(); // relPath -> Set<line> | "ALL"
  let currentFile = null;
  let inHunk = false;

  for (const line of diffOut.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      inHunk = false;
      currentFile = null;
    } else if (!inHunk && (line.startsWith("+++ b/") || line.startsWith('+++ "b/'))) {
      const target = unquoteGitPath(line.slice(4));
      if (target.startsWith("b/")) {
        currentFile = target.slice(2);
        if (!changed.has(currentFile)) changed.set(currentFile, new Set());
      }
    } else if (!inHunk && line.startsWith("Binary files ")) {
      const bm = line.match(/^Binary files .* and (b\/.+|"b\/.+") differ$/);
      if (bm) {
        const binTarget = unquoteGitPath(bm[1]);
        if (binTarget.startsWith("b/")) {
          changed.set(binTarget.slice(2), "ALL");
        }
      }
    } else if (line.startsWith("@@ ") && currentFile) {
      inHunk = true;
      const m = line.match(/\+(\d+)(?:,(\d+))?/);
      if (m) {
        const start = Number(m[1]);
        const count = m[2] !== undefined ? Number(m[2]) : 1;
        if (count === 0) continue;
        const set = changed.get(currentFile);
        if (set instanceof Set) {
          for (let k = 0; k < count; k += 1) {
            set.add(start + k);
          }
        }
      }
    }
  }
  return changed;
}

function filterDriversWithProfile(drivers, profile) {
  if (!Array.isArray(drivers) || !profile) return drivers || [];
  return drivers.filter((d) => {
    const feat = String(d.feature || "");
    if (profile.concreteness?.status === "grounded" && feat.includes("concreteness")) {
      return false;
    }
    if (profile.burstiness?.status === "varied" && feat.includes("sent_cv")) {
      return false;
    }
    return true;
  });
}

function buildPocketMlFindings(text, filename, existingFindings, threshold = null, { profile = null, modality = null, register = "unspecified" } = {}) {
  if (register === "technical") {
    return { doc: { documentProbability: 0, paragraphs: [], flaggedCount: 0 }, findings: [] };
  }
  const doc = analyzeDocumentWithPocketModels(text, { threshold });
  const extras = [];
  const textLines = String(text || "").split(/\r?\n/);
  for (const p of doc.paragraphs) {
    if (!p.flagged) continue;
    const overlapsExisting = existingFindings.some(
      (f) => f.line >= p.startLine && f.line <= p.endLine
    );
    if (overlapsExisting) continue;
    const pct = Math.round(p.slopProbability * 100);
    const activeDrivers = filterDriversWithProfile(p.topDrivers, profile);
    const drvEn = activeDrivers.map((d) => d.reason.en).join("; ") || "uniform abstract phrasing";
    const drvZh = activeDrivers.map((d) => d.reason.zh).join("、") || "句式与用词高度均质";
    const loc = String(p.startLine);
    const cleanExcerpt = String(p.excerpt || "");
    const fullPara = textLines.slice(Math.max(0, p.startLine - 1), p.endLine).join("\n") || cleanExcerpt;
    const fp = `pocket-stealth-vapor:${fnv1aHex(`pocket-stealth-vapor|${cleanExcerpt.toLowerCase()}|${loc}`)}`;
    const msgObj = {
      en: `Paragraph reads as predictable low-concreteness AI filler (${pct}% pocket-ML score: ${drvEn}).`,
      zh: `段落呈高度可预测、低事实密度的温吞水套话（内置模型评分 ${pct}%：${drvZh}）。`,
    };
    const delObj = {
      en: "Cut this paragraph or replace abstract cushion wrappers with one concrete event, number, file path, or direct action.",
      zh: "删掉整段空泛铺垫，或把抽象缓冲外壳直接换成具体事件、数字、文件路径或明确动作。",
    };
    const effMod = modality || detectModality(filename) || "markdown";
    extras.push({
      fingerprint: fp,
      ruleId: "pocket-stealth-vapor",
      packId: "pocket-model",
      severity: "warning",
      confidence: computeFindingConfidence({ ruleId: "pocket-stealth-vapor", tier: "taste", severity: "warning" }),
      tier: "taste",
      fixStrategy: "rephrase",
      family: "rhythm/pocket-stealth-vapor",
      category: "statistical-vapor",
      modality: effMod,
      file: filename,
      location: loc,
      line: p.startLine,
      col: 1,
      endLine: p.endLine,
      match: cleanExcerpt,
      excerpt: cleanExcerpt,
      mlProbability: p.slopProbability,
      message: msgObj,
      deletionTest: delObj,
      revision: buildFindingRevision({
        ruleId: "pocket-stealth-vapor",
        tier: "taste",
        family: "rhythm/pocket-stealth-vapor",
        modality: effMod,
        message: msgObj,
        deletionTest: delObj,
        sentence: fullPara,
        fixStrategy: "rephrase",
      }),
    });
  }
  return { doc, findings: extras };
}

function summarizePocketForProfile(text) {
  const doc = analyzeDocumentWithPocketModels(text);
  return {
    documentProbability: doc.documentProbability,
    band: doc.wholeTextScore.band,
    recommendedPack: doc.packRouter.recommendedPack,
    flaggedCount: doc.flaggedCount,
  };
}

function lookupRuleAcrossPacks(packs, pack, ruleId) {
  const inPack = (pack?.rules || []).find((r) => r.id === ruleId);
  if (inPack) return inPack;
  for (const p of Object.values(packs || {})) {
    const found = (p?.rules || []).find((r) => r.id === ruleId);
    if (found) return found;
  }
  return null;
}

function mergePatternBankFindings(existingFindings, patFindings, { packs = null, pack = null, register = "unspecified", config = {} } = {}) {
  const seen = new Set(existingFindings.map((f) => `${f.ruleId}:${f.line}`));
  const out = [...existingFindings];
  for (const pf of patFindings || []) {
    const key = `${pf.ruleId}:${pf.line}`;
    if (seen.has(key)) continue;
    const ruleRef = lookupRuleAcrossPacks(packs, pack, pf.ruleId);
    let registerAdjusted = false;
    let effSev = pf.severity || "info";
    let effMsg = pf.message;
    let effDel = pf.deletionTest || ruleRef?.deletionTest || null;
    if (ruleRef) {
      const regApplied = applyRegisterOverride(ruleRef, register, config);
      if (regApplied.skip) continue;
      if (regApplied.registerAdjusted) {
        registerAdjusted = true;
        effSev = regApplied.rule.severity || effSev;
        if (regApplied.rule.message) effMsg = regApplied.rule.message;
        if (regApplied.rule.deletionTest) effDel = regApplied.rule.deletionTest;
      }
    }
    seen.add(key);
    const fam = pf.family || (pf.dimension ? `${pf.dimension}/${pf.ruleId}` : "pattern-bank");
    const mod = pf.modality || "markdown";
    const revScope =
      ruleRef?.revisionScope ||
      (pf.ruleId === "low-burstiness-vapor" ? "paragraph" : null);
    const fixStrat = pf.fixStrategy || deriveFixStrategy({ id: pf.ruleId, family: fam });
    out.push({
      ...pf,
      severity: effSev,
      fixStrategy: fixStrat,
      message: effMsg,
      ...(effDel ? { deletionTest: effDel } : {}),
      confidence: pf.confidence || computeFindingConfidence({ ruleId: pf.ruleId, tier: pf.tier || "taste", severity: effSev, registerAdjusted }),
      revision:
        pf.revision ||
        buildFindingRevision({
          ruleId: pf.ruleId,
          tier: pf.tier || "taste",
          family: fam,
          modality: mod,
          message: effMsg,
          deletionTest: effDel,
          sentence: String(pf.match || ""),
          revisionKind: ruleRef?.revisionKind || null,
          revisionScope: revScope,
          revisionAvoid: ruleRef?.revisionAvoid || null,
          fixStrategy: fixStrat,
        }),
    });
  }
  return out;
}

function collectTextCoverageWarnings(text, modality, rel, profile) {
  const warnings = [];
  if (
    modality === "html" &&
    /<script\b[^>]*\btype\s*=\s*(?:"application\/json"|'application\/json'|application\/json(?=[\s>]))/i.test(text)
  ) {
    const zones = buildZones(text, "html");
    if (codePointLength(zones.prose.replace(/\s+/g, "")) < 120) {
      warnings.push({
        file: rel,
        code: "spa-json-shell",
        message: "HTML appears to be an SPA shell with <script type=\"application/json\"> data and <120 visible prose chars; inspect JSON payload or rendered DOM.",
      });
      return warnings;
    }
  }
  const textCpLen = codePointLength(text);
  if ((modality === "markdown" || modality === "text" || modality === "html") && textCpLen >= 2000 && profile && profile.proseCoverage < 0.15) {
    if (modality === "html") {
      warnings.push({
        file: rel,
        code: "low-prose-coverage",
        message: `Extracted prose covers only ${Math.round(profile.proseCoverage * 100)}% of file (${textCpLen} chars); check fenced blocks/markup if unexpected.`,
      });
      return warnings;
    }
    const nonEmptyLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const tableOrLinkLines = nonEmptyLines.filter((l) => /^\s*(?:\||[-*+]\s+\[)/.test(l)).length;
    if (nonEmptyLines.length > 0 && tableOrLinkLines / nonEmptyLines.length < 0.5) {
      warnings.push({
        file: rel,
        code: "low-prose-coverage",
        message: `Extracted prose covers only ${Math.round(profile.proseCoverage * 100)}% of file (${textCpLen} chars); check fenced blocks/markup if unexpected.`,
      });
    }
  }
  return warnings;
}

function selectPackWithConfidenceFloor(routeRes) {
  const rec = routeRes?.recommendedPack || "business-brief";
  const conf = Number(routeRes?.confidence || 0);
  if (rec === "business-brief") return { packId: "business-brief", packSource: "auto-pocket-router" };
  if (rec === "deck-and-ui" && conf >= 0.6) return { packId: "deck-and-ui", packSource: "auto-pocket-router" };
  if (rec !== "deck-and-ui" && conf >= 0.65) return { packId: rec, packSource: "auto-pocket-router" };
  return { packId: "business-brief", packSource: "auto-default-fallback" };
}

function resolveTextPackAndSource(text, rel, modality, explicitPack, fileConfig, packs) {
  let pack;
  let effectivePack;
  let packSource;
  if (explicitPack && explicitPack !== "auto") {
    pack = resolveEffectivePack(explicitPack, packs, fileConfig);
    effectivePack = explicitPack;
    packSource = "cli-flag";
  } else if (explicitPack === "auto" && (modality === "markdown" || modality === "text")) {
    const sel = selectPackWithConfidenceFloor(predictPackWithPocketRouter(text));
    const routed = sel.packId;
    if (modality === "markdown" && hasEmbeddedUiMarkup(text)) {
      let prosePackId = routed;
      if (prosePackId === "deck-and-ui") {
        const stripped = text.replace(/<[^>]+>/g, " ");
        const strippedCjk = (stripped.match(/[\u4e00-\u9fff]/gu) || []).length;
        const strippedWords = stripped.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
        if (strippedCjk >= 20 || strippedWords >= 12) {
          const rerouted = selectPackWithConfidenceFloor(predictPackWithPocketRouter(stripped)).packId;
          prosePackId = rerouted === "deck-and-ui" ? "business-brief" : rerouted;
        }
      }
      if (prosePackId !== "deck-and-ui") {
        const prosePack = resolveEffectivePack(prosePackId, packs, fileConfig);
        const uiPack = resolveEffectivePack("deck-and-ui", packs, fileConfig);
        pack = mergePacks(prosePack, uiPack);
        effectivePack = `${prosePackId}+deck-and-ui`;
        packSource = "auto-mixed-ui";
      } else {
        pack = resolveEffectivePack(routed, packs, fileConfig);
        effectivePack = routed;
        packSource = sel.packSource;
      }
    } else {
      pack = resolveEffectivePack(routed, packs, fileConfig);
      effectivePack = routed;
      packSource = sel.packSource;
    }
  } else if (explicitPack === "auto" && modality === "html" && isLongFormHtmlDocument(text)) {
    const biz = resolveEffectivePack("business-brief", packs, fileConfig);
    const ui = resolveEffectivePack("deck-and-ui", packs, fileConfig);
    pack = mergePacks(biz, ui);
    effectivePack = "business-brief+deck-and-ui";
    packSource = "auto-html-longform";
  } else {
    const packId = pickPackForFile(rel, modality, explicitPack, fileConfig);
    pack = resolveEffectivePack(packId, packs, fileConfig);
    effectivePack = packId;
    packSource = explicitPack === "auto" ? "auto-modality" : fileConfig.pack ? "config" : "default-modality";
  }
  return { pack, effectivePack, packSource };
}

function inspectSingleFile({ absPath, rel, modality }, packs, explicitPack, config, { includeMl = false, includePatterns = false, includeProfile = false, banks = null, register = null } = {}) {
  const stat = fs.statSync(absPath);
  if (stat.size > 25 * 1024 * 1024) {
    return {
      checked: false,
      findings: [],
      unusedSuppressions: [],
      coverageWarnings: [],
      skipped: [{ file: rel, reason: "File exceeds 25 MB single-file inspection cap" }],
    };
  }

  const fileConfig = resolveConfigForFile(rel, config);
  const buf = fs.readFileSync(absPath);

  if (modality === "docx" || modality === "pptx") {
    const packId = pickPackForFile(rel, modality, explicitPack, fileConfig);
    const pack = resolveEffectivePack(packId, packs, fileConfig);
    const packSource = explicitPack && explicitPack !== "auto" ? "cli-flag" : explicitPack === "auto" ? "auto-modality" : fileConfig.pack ? "config" : "default-modality";
    const regInfo = resolveRegister("", { filename: rel, flagRegister: register, config: fileConfig });
    try {
      const entries = readZipXmlEntries(buf);
      const res = auditOoxmlEntries(entries, { filename: rel, modality, pack, config: fileConfig, register });
      const missingCorePart = res.skipped.some((s) => s.file === rel);
      let findings = res.findings;
      if (includePatterns && !missingCorePart) {
        const patRes = auditPatterns("", { filename: rel, modality, banks: banks || loadPatternBanks(), ooxml: entries, config: fileConfig });
        findings = mergePatternBankFindings(findings, patRes.findings, { packs, pack, register: regInfo.register, config: fileConfig });
      }
      return {
        checked: !missingCorePart,
        findings,
        unusedSuppressions: [],
        coverageWarnings: [],
        skipped: res.skipped,
        effectivePack: packId,
        packSource,
        rulesetHash: computeRulesetHash(pack),
        register: regInfo.register,
        registerSource: regInfo.registerSource,
      };
    } catch (err) {
      return {
        checked: false,
        findings: [],
        unusedSuppressions: [],
        coverageWarnings: [],
        skipped: [{ file: rel, reason: `Uninspectable ${modality.toUpperCase()} archive: ${err.message}` }],
      };
    }
  }

  if (modality === "image") {
    const packId = pickPackForFile(rel, modality, explicitPack, fileConfig);
    const pack = resolveEffectivePack(packId, packs, fileConfig);
    const packSource = explicitPack && explicitPack !== "auto" ? "cli-flag" : explicitPack === "auto" ? "auto-modality" : fileConfig.pack ? "config" : "default-modality";
    const regInfo = resolveRegister("", { filename: rel, flagRegister: register, config: fileConfig });
    try {
      const parsed = parseImageBuffer(buf);
      const res = auditImageDocument(parsed, { filename: rel, pack, config: fileConfig });
      return {
        checked: true,
        findings: res.findings,
        unusedSuppressions: [],
        coverageWarnings: [],
        skipped: res.skipped,
        effectivePack: packId,
        packSource,
        rulesetHash: computeRulesetHash(pack),
        register: regInfo.register,
        registerSource: regInfo.registerSource,
      };
    } catch (err) {
      return {
        checked: false,
        findings: [],
        unusedSuppressions: [],
        coverageWarnings: [],
        skipped: [{ file: rel, reason: `Uninspectable image: ${err.message}` }],
      };
    }
  }

  if (modality === "pdf") {
    const regInfo = resolveRegister("", { filename: rel, flagRegister: register, config: fileConfig });
    try {
      const parsed = parsePdfBuffer(buf);
      let pack;
      let effectivePack;
      let packSource;
      if (explicitPack && explicitPack !== "auto") {
        pack = resolveEffectivePack(explicitPack, packs, fileConfig);
        effectivePack = explicitPack;
        packSource = "cli-flag";
      } else if (explicitPack === "auto") {
        const pages = parsed?.pages || [];
        const landscapeCount = pages.filter((p) => p.isLandscape).length;
        const portraitCount = pages.length - landscapeCount;
        if (pages.length > 0 && portraitCount >= landscapeCount) {
          pack = mergePacks(
            resolveEffectivePack("business-brief", packs, fileConfig),
            resolveEffectivePack("deck-and-ui", packs, fileConfig)
          );
          effectivePack = "business-brief+deck-and-ui";
          packSource = "auto-pdf-portrait";
        } else {
          pack = resolveEffectivePack("deck-and-ui", packs, fileConfig);
          effectivePack = "deck-and-ui";
          packSource = "auto-pdf-landscape";
        }
      } else {
        const packId = pickPackForFile(rel, modality, explicitPack, fileConfig);
        pack = resolveEffectivePack(packId, packs, fileConfig);
        effectivePack = packId;
        packSource = fileConfig.pack ? "config" : "default-modality";
      }
      const res = auditPdfDocument(parsed, { filename: rel, pack, config: fileConfig, register });
      const uninspectable = res.skipped.some((s) => s.file === rel);
      return {
        checked: !uninspectable,
        findings: res.findings,
        unusedSuppressions: [],
        coverageWarnings: res.coverageWarnings || [],
        skipped: res.skipped,
        effectivePack,
        packSource,
        rulesetHash: computeRulesetHash(pack),
        register: regInfo.register,
        registerSource: regInfo.registerSource,
      };
    } catch (err) {
      return {
        checked: false,
        findings: [],
        unusedSuppressions: [],
        coverageWarnings: [],
        skipped: [{ file: rel, reason: `Uninspectable PDF: ${err.message}` }],
      };
    }
  }

  let text;
  try {
    text = decodeUtf8Strict(buf);
  } catch {
    return {
      checked: false,
      findings: [],
      unusedSuppressions: [],
      coverageWarnings: [],
      skipped: [{ file: rel, reason: "Non-UTF-8 text encoding; convert to UTF-8 to inspect" }],
    };
  }

  const { pack, effectivePack, packSource } = resolveTextPackAndSource(text, rel, modality, explicitPack, fileConfig, packs);
  const regInfo = resolveRegister(text, { filename: rel, flagRegister: register, config: fileConfig });

  const res = auditText(text, { filename: rel, modality, pack, config: fileConfig, register });
  let findings = res.findings;
  if (includePatterns) {
    const patRes = auditPatterns(text, { filename: rel, modality, banks: banks || loadPatternBanks(), config: fileConfig });
    findings = mergePatternBankFindings(findings, patRes.findings, { packs, pack, register: regInfo.register, config: fileConfig });
  }

  let profileObj = null;
  let mlInput = null;
  if (PROSE_ML_MODALITIES.has(modality) && (includeMl || includeProfile || text.length >= 2000 || modality === "html")) {
    profileObj = analyzeTextProfile(text, { modality, config: fileConfig });
    if (includeMl) {
      mlInput = modality === "html" || modality === "svg" ? buildZones(text, modality, fileConfig).prose : text;
      const mlRes = buildPocketMlFindings(mlInput, rel, findings, null, { profile: profileObj, modality, register: regInfo.register });
      findings = [...findings, ...mlRes.findings];
    }
  }

  const coverageWarnings = collectTextCoverageWarnings(text, modality, rel, profileObj);
  let profileItem = null;
  if (includeProfile && PROSE_ML_MODALITIES.has(modality)) {
    const pocketSrc = mlInput ?? (modality === "html" || modality === "svg" ? buildZones(text, modality, fileConfig).prose : text);
    profileItem = {
      file: rel,
      profile: profileObj || analyzeTextProfile(text, { modality, config: fileConfig }),
      pocketModel: summarizePocketForProfile(pocketSrc),
    };
  }

  return {
    checked: true,
    findings,
    unusedSuppressions: res.unusedSuppressions,
    coverageWarnings,
    skipped: [],
    effectivePack,
    packSource,
    rulesetHash: computeRulesetHash(pack),
    register: regInfo.register,
    registerSource: regInfo.registerSource,
    profileItem,
    _cpLineStarts: buildCodepointLineStarts(text),
  };
}

// ---------- Subcommands ----------

const COMMAND_SPECS = {
  check: {
    bools: ["json", "staged", "report-unused", "profile", "ml", "patterns", "deep", "compact", "quiet", "help", "version"],
    strings: ["pack", "register", "config", "fail-on", "format", "changed", "stdin-filename", "lang", "rule"],
    optionalStrings: ["changed"],
    shortBools: { q: "quiet", h: "help", v: "version" },
    shortStrings: {},
    usage:
      "dislop check [paths... | -] [--pack <id|auto>] [--register <id|auto>] [--deep] [--compact] [--profile] [--ml] [--patterns]\n" +
      "             [--fail-on error|warning|info|never] [--format text|json|agent|sarif|github|md]\n" +
      "             [--changed [ref] | --staged] [--rule <id,...>] [--stdin-filename <name>]\n" +
      "             [--report-unused] [--config <path>] [-q|--quiet] [--lang en|zh]",
    summary: "Audit files, directories, or stdin for AI artifacts, clichés, and template layouts (0 network calls).",
    examples: [
      "dislop check .",
      "dislop check draft.md --deep --lang zh",
      "dislop check draft.md --register argumentative --format agent",
      "dislop check --changed=origin/main --format github",
    ],
  },
  verify: {
    bools: ["allow-added", "strict", "staged", "json", "help", "version"],
    strings: ["pack", "register", "git", "keep", "format", "lang", "stdin-filename", "config"],
    optionalStrings: ["git"],
    shortBools: { h: "help", v: "version" },
    shortStrings: {},
    usage: "dislop verify (<before> <after> | --git [ref] <file>) [--keep a,b] [--pack <id|auto>] [--register <name>] [--allow-added] [--strict] [--lang en|zh] [--json]",
    summary: "Verify a revised draft retains numbers, qualifiers, keep terms, and introduces zero new AI slop.",
    examples: [
      "dislop verify --git HEAD draft.md",
      "dislop verify before.md after.md --keep latency,SLA --strict --json",
    ],
  },
  explain: {
    bools: ["json", "help", "version"],
    strings: ["lang", "format"],
    optionalStrings: [],
    shortBools: { h: "help", v: "version" },
    shortStrings: {},
    usage: "dislop explain <rule-id> [--lang en|zh] [--format text|json] [--json]",
    summary: "Show rationale, deletion test, and bad/trap/good examples for a rule or pattern ID.",
    examples: ["dislop explain negation-pivot-frame --lang zh", "dislop explain chatbot-artifact --json"],
  },
  packs: {
    bools: ["json", "help", "version"],
    strings: ["format"],
    optionalStrings: [],
    shortBools: { h: "help", v: "version" },
    shortStrings: {},
    usage: "dislop packs [--format text|json] [--json]",
    summary: "List bundled rule packs and supported file types.",
    examples: ["dislop packs", "dislop packs --json"],
  },
  catalog: {
    bools: ["json", "no-exemplars", "help", "version"],
    strings: ["query", "pack", "category", "dimension", "family", "modality", "severity", "tier", "lang", "format", "limit"],
    optionalStrings: [],
    shortBools: { h: "help", v: "version" },
    shortStrings: {},
    usage:
      "dislop catalog [query] [--pack <id>] [--category <cat>] [--dimension <dim>] [--family <prefix>]\n" +
      "               [--modality <mod>] [--severity <sev>] [--tier invariant|taste] [--limit <n>]\n" +
      "               [--no-exemplars] [--format text|json|md] [--lang en|zh]",
    summary: "Search and filter dislop's 53-rule AI-slop catalog.",
    examples: ["dislop catalog negation --lang zh", "dislop catalog --pack deck-and-ui --format md"],
  },
  patterns: {
    bools: ["json", "help", "version"],
    strings: ["stdin-filename", "angle", "lang", "format"],
    optionalStrings: [],
    shortBools: { h: "help", v: "version" },
    shortStrings: {},
    usage: "dislop patterns [file | -] [--stdin-filename <name>] [--angle <a,b>] [--lang en|zh] [--json]",
    summary: "Run multi-angle extended pattern-bank scan and profile.",
    examples: ["dislop patterns draft.md --lang zh", "cat draft.md | dislop patterns - --json"],
  },
  voice: {
    bools: ["json", "help", "version"],
    strings: ["output", "lang", "format"],
    optionalStrings: [],
    shortBools: { h: "help", v: "version" },
    shortStrings: { o: "output" },
    usage: "dislop voice [paths... | -] [--output|-o <voice.json>] [--lang auto|en|zh] [--json]",
    summary: "Extract an offline deterministic dislop.voice/1 writing profile (0 network calls).",
    examples: ["dislop voice notes/*.md -o voice.json", "dislop voice essays.md --lang zh --json"],
  },
  model: {
    bools: ["force", "dry-run", "yes", "no-copy", "allow-lan", "no-loopback", "json", "help", "version"],
    strings: ["tier", "provider", "sha256", "cache-dir", "threshold", "stdin-filename", "pack", "config", "endpoint", "model", "output", "format", "lang"],
    optionalStrings: [],
    shortBools: { h: "help", v: "version" },
    shortStrings: { o: "output" },
    usage: "dislop model [status|score|install|import|remove|deslop] [target] [--tier <t>] [--lang en|zh] [--json]",
    summary: "Inspect bundled 14.6 KB Pocket ML, hardware fit, and manage optional local models.",
    examples: ["dislop model status --lang zh", "dislop model score draft.md --json"],
  },
  setup: {
    bools: ["force", "dry-run", "yes", "json", "help", "version"],
    strings: ["tier", "provider", "cache-dir", "format", "lang"],
    optionalStrings: [],
    shortBools: { h: "help", v: "version" },
    shortStrings: {},
    usage: "dislop setup [--tier auto|none|fast|balanced|quality] [--dry-run] [--force] [--lang en|zh]",
    summary: "Interactive or flag-driven optional local GGUF model setup.",
    examples: ["dislop setup --dry-run", "dislop setup --tier fast --yes"],
  },
  deslop: {
    bools: ["local", "allow-lan", "json", "help", "version"],
    strings: ["pack", "register", "config", "stdin-filename", "endpoint", "model", "output", "format", "lang"],
    optionalStrings: [],
    shortBools: { h: "help", v: "version" },
    shortStrings: { o: "output" },
    usage: "dislop deslop [file | -] --local [--pack <id|auto>] [--register <name>] [--endpoint <url>] [--model <id>] [--output|-o <file>] [--json]",
    summary: "Fact-locked paragraph cleanup using a local loopback model (--local).",
    examples: ["dislop deslop draft.md --local -o clean.md"],
  },
  resources: {
    bools: ["json", "help", "version"],
    strings: ["format"],
    optionalStrings: [],
    shortBools: { h: "help", v: "version" },
    shortStrings: {},
    usage: "dislop resources [--format text|json] [--json]",
    summary: "Show bundled offline packs, static agent links, and Official Cloud MCP details.",
    examples: ["dislop resources", "dislop resources --json"],
  },
  "pack-test": {
    bools: ["help", "version"],
    strings: [],
    optionalStrings: [],
    shortBools: { h: "help", v: "version" },
    shortStrings: {},
    usage: "dislop pack-test",
    summary: "Validate Pack Schema v2 manifests and embedded hit/clean fixture assertions.",
    examples: ["dislop pack-test"],
  },
  init: {
    bools: ["help", "version"],
    strings: [],
    optionalStrings: [],
    shortBools: { h: "help", v: "version" },
    shortStrings: {},
    usage: "dislop init",
    summary: "Create starter .dislop.json config and ensure .dislop.local.json is gitignored.",
    examples: ["dislop init"],
  },
  review: {
    bools: ["offline", "compact", "dry-run", "print-prompt", "yes", "include-notes", "include-hidden", "json", "help", "version"],
    strings: ["endpoint", "api-key-env", "provider", "model", "base-url", "pack", "register", "format", "lang", "fail-on", "timeout", "max-chunks", "stdin-filename", "config"],
    optionalStrings: [],
    shortBools: { y: "yes", h: "help", v: "version" },
    shortStrings: {},
    usage:
      "dislop review [file | -] [--offline | --endpoint <url> | --provider openai|gemini|openrouter|compatible|local]\n" +
      "             [--model <id>] [--base-url <url>] [--pack <id|auto>] [--register <id|auto>]\n" +
      "             [--dry-run] [--print-prompt] [--yes] [--format text|json|agent] [--lang en|zh]",
    summary: "Multi-layer editorial review (offline rubric preflight or explicit opt-in BYOK LLM review).",
    examples: [
      "dislop review draft.md --offline --lang zh",
      "dislop review draft.md --provider openai --dry-run",
      "dislop review draft.md --provider gemini --model gemini-3.1-flash-lite-preview --yes",
    ],
  },
  doctor: {
    bools: ["online", "no-loopback", "json", "help", "version"],
    strings: ["cache-dir", "format", "lang"],
    optionalStrings: [],
    shortBools: { h: "help", v: "version" },
    shortStrings: {},
    usage: "dislop doctor [--online] [--no-loopback] [--lang en|zh] [--json]",
    summary: "Check 3-layer readiness (Skill, Local CLI + Pocket ML + local runners, BYOK review env, and optional --online Cloud MCP ping).",
    examples: ["dislop doctor", "dislop doctor --lang zh --json", "dislop doctor --online"],
  },
};
COMMAND_SPECS.search = COMMAND_SPECS.catalog;

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function closestFlagSuggestion(unknown, knownFlags) {
  let best = null;
  let bestDist = 4;
  for (const cand of knownFlags) {
    const d = levenshtein(unknown, cand);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best ? ` Did you mean '--${best}'?` : "";
}

function printSubcommandHelp(cmdName) {
  const spec = COMMAND_SPECS[cmdName];
  if (!spec) {
    printHelp();
    return;
  }
  console.log(`dislop ${cmdName} — ${spec.summary}\n`);
  console.log(`Usage:\n  ${spec.usage}`);
  if (spec.examples?.length) {
    console.log(`\nExamples:\n${spec.examples.map((ex) => `  ${ex}`).join("\n")}`);
  }
}

function shouldUseColor() {
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true;
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") return false;
  return Boolean(process.stdout.isTTY);
}

function colorizeTextReport(text, useColor) {
  if (!useColor || !text) return text;
  const RESET = "\x1b[0m";
  const RED = "\x1b[31m";
  const YELLOW = "\x1b[33m";
  const CYAN = "\x1b[36m";
  const DIM = "\x1b[2m";
  const GREEN = "\x1b[32m";
  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("  [ERROR]") || line.startsWith("  [硬伤]")) {
        return line.replace(/^(\s*\[(?:ERROR|硬伤)\])/, `${RED}$1${RESET}`);
      }
      if (line.startsWith("  [WARNING]") || line.startsWith("  [提醒]")) {
        return line.replace(/^(\s*\[(?:WARNING|提醒)\])/, `${YELLOW}$1${RESET}`);
      }
      if (line.startsWith("  [INFO]") || line.startsWith("  [提示]")) {
        return line.replace(/^(\s*\[(?:INFO|提示)\])/, `${CYAN}$1${RESET}`);
      }
      if (
        line.startsWith("  [SKIP]") ||
        line.startsWith("  [跳过]") ||
        line.startsWith("  [UNUSED]") ||
        line.startsWith("  [失效豁免]") ||
        line.startsWith("  [COVERAGE]") ||
        line.startsWith("  [覆盖提示]")
      ) {
        return `${DIM}${line}${RESET}`;
      }
      if (line.startsWith("dislop: no known patterns found") || line.startsWith("dislop: 未发现已知模式")) {
        return `${GREEN}${line}${RESET}`;
      }
      return line;
    })
    .join("\n");
}

function parseFlags(args, cmdName = null) {
  const spec = cmdName ? COMMAND_SPECS[cmdName] : null;
  const boolSet = new Set(spec ? spec.bools : [
    "json", "staged", "report-unused", "no-loopback", "help", "version", "mcp",
    "no-exemplars", "profile", "ml", "patterns", "deep", "compact", "quiet", "force",
    "dry-run", "yes", "no-copy", "local", "allow-lan", "offline", "allow-added", "strict",
  ]);
  const stringSet = spec ? new Set(spec.strings) : null;
  const optionalSet = new Set(spec ? spec.optionalStrings : ["changed", "git"]);
  const shortBools = spec ? spec.shortBools : { h: "help", v: "version", q: "quiet" };
  const shortStrings = spec ? spec.shortStrings : { o: "output" };
  const allKnown = spec ? [...spec.bools, ...spec.strings] : [];

  for (const a of args) {
    if (a === "--") break;
    if (a === "-h" || a === "--help") {
      return { flags: { help: true }, positional: [] };
    }
  }

  const flags = {};
  const positional = [];
  let endOfFlags = false;
  const cwd = process.cwd();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (endOfFlags) {
      positional.push(arg);
      continue;
    }
    if (arg === "--") {
      endOfFlags = true;
      continue;
    }
    if (arg === "-") {
      positional.push("-");
      continue;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const key = eq !== -1 ? arg.slice(2, eq) : arg.slice(2);
      if (spec && !boolSet.has(key) && !stringSet.has(key)) {
        const hint = closestFlagSuggestion(key, allKnown);
        console.error(`dislop ${cmdName}: unknown flag '--${key}'.${hint} Run 'dislop ${cmdName} --help'.`);
        process.exit(2);
      }
      if (eq !== -1) {
        const val = arg.slice(eq + 1);
        if (boolSet.has(key)) {
          const low = val.trim().toLowerCase();
          if (low === "true" || low === "1" || low === "yes") flags[key] = true;
          else if (low === "false" || low === "0" || low === "no") flags[key] = false;
          else {
            console.error(`dislop: flag '--${key}' does not accept value '${val}'`);
            process.exit(2);
          }
        } else if (optionalSet.has(key) && val === "") {
          flags[key] = "HEAD";
        } else {
          flags[key] = val;
        }
      } else if (boolSet.has(key)) {
        flags[key] = true;
      } else if (optionalSet.has(key)) {
        const next = args[i + 1];
        if (i + 1 >= args.length || next === "-" || next.startsWith("-")) {
          flags[key] = "HEAD";
        } else if ((key === "changed" || key === "git") && fs.existsSync(path.resolve(cwd, next))) {
          flags[key] = "HEAD";
        } else {
          flags[key] = next;
          i += 1;
        }
      } else if (i + 1 < args.length) {
        const next = args[i + 1];
        if (next.length > 1 && next.startsWith("-")) {
          console.error(`dislop: flag '--${key}' requires a value (got '${next}')`);
          process.exit(2);
        }
        flags[key] = next;
        i += 1;
      } else {
        console.error(`dislop: flag '--${key}' requires a value`);
        process.exit(2);
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      const eq = arg.indexOf("=");
      const shortKey = eq !== -1 ? arg.slice(1, eq) : arg.slice(1);
      if (shortBools[shortKey] && eq === -1) {
        flags[shortBools[shortKey]] = true;
      } else if (shortStrings[shortKey]) {
        if (eq !== -1) {
          flags[shortStrings[shortKey]] = arg.slice(eq + 1);
        } else if (i + 1 < args.length) {
          const next = args[i + 1];
          if (next.length > 1 && next.startsWith("-")) {
            console.error(`dislop: flag '-${shortKey}' requires a value (got '${next}')`);
            process.exit(2);
          }
          flags[shortStrings[shortKey]] = next;
          i += 1;
        } else {
          console.error(`dislop: flag '-${shortKey}' requires a value`);
          process.exit(2);
        }
      } else if (shortKey.length > 1 && eq === -1 && [...shortKey].every((ch) => shortBools[ch])) {
        for (const ch of shortKey) flags[shortBools[ch]] = true;
      } else {
        console.error(`dislop${cmdName ? ` ${cmdName}` : ""}: unknown flag '${arg}'. Run 'dislop${cmdName ? ` ${cmdName}` : ""} --help'.`);
        process.exit(2);
      }
    } else {
      positional.push(arg);
    }
  }
  if (!spec && flags.help) {
    printHelp();
    process.exit(0);
  }
  return { flags, positional };
}

function readStdinTextChecked(cmdLabel = "check") {
  const buf = fs.readFileSync(0);
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    console.error(`dislop ${cmdLabel}: stdin looks like binary ZIP/OOXML (.docx/.pptx); pass the file path instead (e.g., 'dislop ${cmdLabel} deck.pptx').`);
    process.exit(2);
  }
  try {
    return decodeUtf8Strict(buf);
  } catch {
    console.error(`dislop ${cmdLabel}: stdin is not valid UTF-8 text; convert to UTF-8 or pass a supported file path.`);
    process.exit(2);
  }
}

function detectStdinFilename(rawText, explicitName) {
  if (explicitName) return explicitName;
  const head = String(rawText || "").replace(/^\ufeff/, "").trimStart().slice(0, 128).toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) {
    return "stdin.html";
  }
  return "stdin.md";
}

function collectKnownRuleIds(packs, banks = null) {
  const known = new Set(["pocket-stealth-vapor"]);
  for (const p of Object.values(packs || {})) {
    for (const r of p.rules || []) {
      if (r.id) known.add(r.id);
    }
  }
  const loadedBanks = banks || loadPatternBanks();
  for (const bank of Object.values(loadedBanks || {})) {
    for (const pat of bank.patterns || []) {
      if (pat.ruleId) known.add(pat.ruleId);
    }
  }
  const patLib = loadPatternLibrary();
  for (const rid of Object.keys(patLib)) known.add(rid);
  return known;
}

function assertTextOrJsonFormat(format) {
  if (!["text", "json"].includes(format)) {
    console.error(`dislop: invalid --format '${format}' (expected text or json)`);
    process.exit(2);
  }
}

function applyCompactReport(report) {
  const ruleMeta = {};
  const compactFindings = [];
  for (const f of report.findings || []) {
    const rid = f.ruleId;
    const strategy = f.fixStrategy || deriveFixStrategy({ id: rid, family: f.family });
    if (!ruleMeta[rid]) {
      ruleMeta[rid] = {
        tier: f.tier || "taste",
        family: f.family || "general",
        fixStrategy: strategy,
        message: f.message,
        ...(f.deletionTest ? { deletionTest: f.deletionTest } : {}),
      };
    }
    compactFindings.push({
      fingerprint: f.fingerprint,
      ruleId: rid,
      severity: f.severity,
      fixStrategy: strategy,
      file: f.file,
      modality: f.modality,
      location: f.location,
      line: f.line,
      col: f.col,
      ...(f.span ? { span: f.span } : {}),
      match: f.match,
    });
  }
  return {
    ...report,
    compact: true,
    ruleMeta,
    findings: compactFindings,
  };
}

function runCheck(args, packs) {
  const { flags, positional } = parseFlags(args, "check");
  if (flags.help) {
    printSubcommandHelp("check");
    return;
  }
  const cwd = process.cwd();
  const config = loadConfigOrExit(cwd, flags.config || null);
  const format = flags.json ? "json" : flags.format || "text";
  const failOn = flags["fail-on"] || config.failOn || "error";
  const lang = flags.lang || "en";
  if (!["en", "zh"].includes(lang)) {
    console.error(`dislop: invalid --lang '${lang}' (expected en or zh)`);
    process.exit(2);
  }
  const reportUnused = Boolean(flags["report-unused"]);
  const quiet = Boolean(flags.quiet);
  const useColor = format === "text" && shouldUseColor();
  const includeProfile = Boolean(flags.profile || flags.deep);
  const includeMl = Boolean(flags.ml || flags.deep);
  const includePatterns = Boolean(flags.patterns || flags.deep);
  const compactJson = Boolean(flags.compact && format === "json");
  const banks = includePatterns ? loadPatternBanks() : null;

  const validFormats = new Set(["text", "json", "agent", "sarif", "github", "md"]);
  if (!validFormats.has(format)) {
    console.error(`dislop: invalid --format '${format}' (expected text, json, agent, sarif, github, or md)`);
    process.exit(2);
  }
  if (!SEVERITY_RANK[failOn]) {
    console.error(`dislop: invalid --fail-on '${failOn}' (expected error, warning, info, or never)`);
    process.exit(2);
  }

  let flagRegister = null;
  if (flags.register !== undefined) {
    const norm = String(flags.register).trim().toLowerCase();
    if (!norm || (norm !== "auto" && !VALID_REGISTERS.includes(norm))) {
      console.error(`dislop: invalid --register '${flags.register}' (expected auto, ${VALID_REGISTERS.join(", ")})`);
      process.exit(2);
    }
    flagRegister = norm;
  }

  let ruleFilter = null;
  if (flags.rule !== undefined) {
    const requested = String(flags.rule)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (requested.length === 0) {
      console.error("dislop check: '--rule' requires at least one rule ID");
      process.exit(2);
    }
    const known = collectKnownRuleIds(packs, banks);
    const unknown = requested.filter((r) => !known.has(r));
    if (unknown.length > 0) {
      console.error(`dislop check: unknown rule ID(s): ${unknown.join(", ")}. Run 'dislop catalog' to list valid rule IDs.`);
      process.exit(2);
    }
    ruleFilter = new Set(requested);
  }

  if (flags.pack && flags.pack !== "auto" && !packs[flags.pack]) {
    console.error(`dislop: unknown pack '${flags.pack}' (available: auto, ${Object.keys(packs).join(", ")})`);
    process.exit(2);
  }

  // Stdin mode
  if (positional.includes("-")) {
    const stdinText = readStdinTextChecked("check");
    const filename = detectStdinFilename(stdinText, flags["stdin-filename"]);
    const modality = detectModality(filename) || "markdown";
    const fileConfig = resolveConfigForFile(filename, config);
    let resolved;
    let regInfo;
    try {
      resolved = resolveTextPackAndSource(stdinText, filename, modality, flags.pack || null, fileConfig, packs);
      regInfo = resolveRegister(stdinText, { filename, flagRegister, config: fileConfig });
    } catch (err) {
      console.error(`dislop: ${err.message}`);
      process.exit(2);
    }
    const { pack, effectivePack, packSource } = resolved;
    const res = auditText(stdinText, { filename, modality, pack, config: fileConfig, register: flagRegister });
    let findings = res.findings;
    if (includePatterns) {
      const patRes = auditPatterns(stdinText, { filename, modality, banks, config: fileConfig });
      findings = mergePatternBankFindings(findings, patRes.findings, {
        packs,
        pack,
        register: regInfo.register,
        config: fileConfig,
      });
    }
    let profileObj = null;
    let mlInput = null;
    if (PROSE_ML_MODALITIES.has(modality) && (includeMl || includeProfile || stdinText.length >= 2000 || modality === "html")) {
      profileObj = analyzeTextProfile(stdinText, { modality, config: fileConfig });
      if (includeMl) {
        mlInput = modality === "html" || modality === "svg" ? buildZones(stdinText, modality, fileConfig).prose : stdinText;
        findings = [
          ...findings,
          ...buildPocketMlFindings(mlInput, filename, findings, null, {
            profile: profileObj,
            modality,
            register: regInfo.register,
          }).findings,
        ];
      }
    }
    if (ruleFilter) {
      findings = findings.filter((f) => ruleFilter.has(f.ruleId));
    }
    const triggered =
      findings.some((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[failOn]) ||
      (reportUnused && res.unusedSuppressions.length > 0);
    const outFindings = quiet
      ? findings.filter((f) => (SEVERITY_RANK[f.severity] || 1) >= SEVERITY_RANK[failOn])
      : findings;
    const coverageWarnings = collectTextCoverageWarnings(stdinText, modality, filename, profileObj);
    const pocketSrc = includeProfile && PROSE_ML_MODALITIES.has(modality)
      ? mlInput ?? (modality === "html" || modality === "svg" ? buildZones(stdinText, modality, fileConfig).prose : stdinText)
      : null;
    const report = {
      version: ENGINE_VERSION,
      context: { register: regInfo.register, registerSource: regInfo.registerSource },
      rulesetHash: computeRulesetHash(pack),
      effectivePack,
      packSource,
      changedFilter: false,
      files: [{ file: filename, modality, effectivePack, packSource }],
      checkedCount: 1,
      skipped: [],
      coverageWarnings,
      findings: outFindings,
      unusedSuppressions: reportUnused ? res.unusedSuppressions : [],
      ...(includeProfile && PROSE_ML_MODALITIES.has(modality)
        ? {
            profiles: [
              {
                file: filename,
                profile: profileObj || analyzeTextProfile(stdinText, { modality, config: fileConfig }),
                pocketModel: summarizePocketForProfile(pocketSrc),
              },
            ],
          }
        : {}),
    };
    const outReport = compactJson ? applyCompactReport(report) : report;
    const rendered = colorizeTextReport(formatReport(outReport, format, lang, { quiet, failOn }), useColor);
    if (rendered) console.log(rendered);
    if (useColor && !quiet && format === "text" && findings.length === 0 && (!reportUnused || res.unusedSuppressions.length === 0) && !includeMl && !includePatterns) {
      console.log(lang === "zh" ? "  提示: 可加 --deep 启用统计画像与内置隐蔽套话模型。" : "  hint: run with --deep to enable rhythm telemetry and Pocket ML scoring.");
    }
    process.exitCode = triggered ? 1 : 0;
    return;
  }

  let changedMap = null;
  if (flags.changed || flags.staged) {
    try {
      changedMap = getChangedLineMap(cwd, typeof flags.changed === "string" ? flags.changed : "HEAD", Boolean(flags.staged));
    } catch (err) {
      console.error(`dislop: failed to read git diff: ${err.message}`);
      process.exit(2);
    }
  }

  const targets = positional.length > 0 ? positional : changedMap ? Array.from(changedMap.keys()).filter((p) => fs.existsSync(path.join(cwd, p))) : ["."];
  let collected;
  try {
    collected = collectFiles(targets, cwd, config, positional.length > 0);
  } catch (err) {
    console.error(`dislop: ${err.message}`);
    process.exit(2);
  }

  const allFindings = [];
  const allSkipped = [...collected.skipped];
  const allCoverageWarnings = [];
  const allUnused = [];
  const allProfiles = [];
  const fileMeta = [];
  const seenHashes = new Set();
  const seenPacks = new Set();
  const seenSources = new Set();
  const regPairs = [];
  let checkedCount = 0;
  let explicitUninspectable = collected.skipped.length > 0;

  for (const item of collected.files) {
    if (changedMap && !changedMap.has(item.rel)) continue;
    let res;
    try {
      res = inspectSingleFile(item, packs, flags.pack || null, config, {
        includeMl,
        includePatterns,
        includeProfile,
        banks,
        register: flagRegister,
      });
    } catch (err) {
      console.error(`dislop: ${err.message}`);
      process.exit(2);
    }
    if (res.checked) {
      checkedCount += 1;
      if (res.register) regPairs.push({ register: res.register, registerSource: res.registerSource || "default" });
      if (res.effectivePack) seenPacks.add(res.effectivePack);
      if (res.packSource) seenSources.add(res.packSource);
      if (res.rulesetHash) seenHashes.add(res.rulesetHash);
      fileMeta.push({
        file: item.rel,
        modality: item.modality,
        effectivePack: res.effectivePack || null,
        packSource: res.packSource || null,
      });
      if (res.profileItem) {
        allProfiles.push(res.profileItem);
      }
    } else if (item.explicit) {
      explicitUninspectable = true;
    }
    let fileFindings = res.findings;
    if (changedMap && changedMap.has(item.rel)) {
      const allowedLines = changedMap.get(item.rel);
      if (allowedLines instanceof Set) {
        fileFindings = fileFindings.filter((f) => {
          const startLine = Number.isInteger(f.line) ? f.line : 1;
          let endLine = Number.isInteger(f.endLine) && f.endLine >= startLine ? f.endLine : startLine;
          if (!Number.isInteger(f.endLine) && f.span && Number.isInteger(f.span.end) && res._cpLineStarts) {
            const endOff = Math.max(f.span.start || 0, f.span.end - 1);
            endLine = Math.max(startLine, cpOffsetToLine(res._cpLineStarts, endOff));
          }
          for (let ln = startLine; ln <= endLine; ln += 1) {
            if (allowedLines.has(ln)) return true;
          }
          return false;
        });
      }
    }
    if (ruleFilter) {
      fileFindings = fileFindings.filter((f) => ruleFilter.has(f.ruleId));
    }
    allFindings.push(...fileFindings);
    allSkipped.push(...res.skipped);
    if (res.coverageWarnings && res.coverageWarnings.length > 0) {
      allCoverageWarnings.push(...res.coverageWarnings);
    }
    if (reportUnused) {
      allUnused.push(...res.unusedSuppressions);
    }
  }

  const shouldFail =
    allFindings.some((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[failOn]) ||
    (reportUnused && allUnused.length > 0);
  const outFindings = quiet
    ? allFindings.filter((f) => (SEVERITY_RANK[f.severity] || 1) >= SEVERITY_RANK[failOn])
    : allFindings;

  const report = {
    version: ENGINE_VERSION,
    context: summarizeReportContext(regPairs, flagRegister),
    rulesetHash: seenHashes.size === 1 ? Array.from(seenHashes)[0] : seenHashes.size > 1 ? fnv1aHex(Array.from(seenHashes).sort().join("|")) : null,
    effectivePack: seenPacks.size === 1 ? Array.from(seenPacks)[0] : seenPacks.size > 1 ? "mixed" : flags.pack || null,
    packSource: seenSources.size === 1 ? Array.from(seenSources)[0] : seenSources.size > 1 ? "mixed" : null,
    changedFilter: Boolean(flags.changed || flags.staged),
    files: fileMeta,
    checkedCount,
    skipped: allSkipped,
    coverageWarnings: allCoverageWarnings,
    findings: outFindings,
    unusedSuppressions: allUnused,
    ...(allProfiles.length > 0 ? { profiles: allProfiles } : {}),
  };

  const outReport = compactJson ? applyCompactReport(report) : report;
  const rendered = colorizeTextReport(formatReport(outReport, format, lang, { quiet, failOn }), useColor);
  if (rendered) console.log(rendered);
  if (useColor && !quiet && format === "text" && allFindings.length === 0 && allUnused.length === 0 && !includeMl && !includePatterns && checkedCount > 0) {
    console.log(lang === "zh" ? "  提示: 可加 --deep 启用统计画像与内置隐蔽套话模型。" : "  hint: run with --deep to enable rhythm telemetry and Pocket ML scoring.");
  }

  if (explicitUninspectable || (checkedCount === 0 && allSkipped.length > 0)) {
    process.exitCode = 2;
    return;
  }
  process.exitCode = shouldFail ? 1 : 0;
}

const POCKET_STEALTH_VAPOR_RULE = {
  id: "pocket-stealth-vapor",
  tier: "taste",
  severity: "warning",
  category: "statistical-vapor",
  dimension: "discourse-rhythm",
  family: "rhythm/pocket-stealth-vapor",
  modalities: ["markdown", "text"],
  tags: ["pocket-ml", "stealth-vapor", "low-concreteness", "flat-cadence"],
  message: {
    en: "Paragraph scores above the bundled 15 KB Pocket ML threshold for low-concreteness, uniform-cadence AI filler despite avoiding banned buzzwords.",
    zh: "段落虽避开了禁用热词表，但在句长节奏、抽象名词化与低事实密度上命中内置 15 KB 轻量集成模型的温吞水套话阈值。",
  },
  deletionTest: {
    en: "Cut this paragraph or replace abstract cushion wrappers with one concrete event, number, file path, or direct action.",
    zh: "删掉整段空泛铺垫，或把抽象缓冲外壳直接换成具体事件、数字、文件路径或明确动作。",
  },
  exemplar: {
    bad: "During ongoing collaboration, maintaining a steady rhythm across teams helps surface operational observations early while supporting long-term alignment.",
    trap: "This isn't about more meetings — it's about radical operational clarity.",
    good: "We post a 3-line status update in #release every Tuesday at 10:00 so blockers surface before Thursday's cut.",
    source: "Original constructed example (Apache-2.0)",
  },
};

function runExplain(args, packs, patternByRuleId) {
  const { flags, positional } = parseFlags(args, "explain");
  if (flags.help) {
    printSubcommandHelp("explain");
    return;
  }
  const format = flags.json ? "json" : flags.format || "text";
  assertTextOrJsonFormat(format);
  const ruleId = positional[0];
  if (!ruleId) {
    console.error("Usage: dislop explain <rule-id> [--lang en|zh] [--json]");
    process.exit(2);
  }
  const lang = flags.lang || "en";
  for (const pack of Object.values(packs)) {
    const rule = (pack.rules || []).find((r) => r.id === ruleId);
    if (rule) {
      if (format === "json") {
        console.log(JSON.stringify({ packId: pack.id, ...rule }, null, 2));
        process.exit(0);
      }
      console.log(`${rule.id}  [${rule.tier} / ${rule.severity}]  (pack: ${pack.id})`);
      console.log(`Modalities: ${(rule.modalities || []).join(", ")}`);
      console.log(`Why:        ${rule.message?.[lang] || rule.message?.en}`);
      if (rule.deletionTest) {
        console.log(`Test:       ${rule.deletionTest[lang] || rule.deletionTest.en}`);
      }
      if (rule.exemplar) {
        console.log(`\nBefore (bad):  ${rule.exemplar.bad}`);
        if (rule.exemplar.trap) {
          console.log(`Trap (avoid):  ${rule.exemplar.trap}`);
        }
        console.log(`After (good):  ${rule.exemplar.good}`);
        if (rule.exemplar.note) {
          console.log(`Note:          ${rule.exemplar.note[lang] || rule.exemplar.note.en}`);
        }
      }
      process.exit(0);
    }
  }
  const pat = patternByRuleId && patternByRuleId[ruleId];
  if (pat) {
    const sev = pat.severityDefault || "info";
    const packId = pat.packId || "pattern-bank";
    const msg = pat.mechanism || pat.name || { en: "", zh: "" };
    const guards = Array.isArray(pat.falsePositiveGuards) ? pat.falsePositiveGuards.join(" ") : "";
    const synth = {
      packId,
      id: ruleId,
      tier: "taste",
      severity: sev,
      category: pat.category || "general",
      dimension: pat.dimension || null,
      modalities: pat.modalities || ["markdown", "text"],
      tags: pat.tags || [],
      message: msg,
      ...(guards ? { deletionTest: { en: guards, zh: guards } } : {}),
      ...(pat.exemplar ? { exemplar: pat.exemplar } : {}),
    };
    if (format === "json") {
      console.log(JSON.stringify(synth, null, 2));
      process.exit(0);
    }
    console.log(`${synth.id}  [${synth.tier} / ${synth.severity}]  (pack: ${packId})`);
    console.log(`Modalities: ${synth.modalities.join(", ")}`);
    console.log(`Why:        ${msg[lang] || msg.en}`);
    if (guards) console.log(`Guards:     ${guards}`);
    if (pat.exemplar) {
      console.log(`\nBefore (bad):  ${pat.exemplar.bad}`);
      if (pat.exemplar.trap) console.log(`Trap (avoid):  ${pat.exemplar.trap}`);
      console.log(`After (good):  ${pat.exemplar.good}`);
    }
    process.exit(0);
  }
  if (ruleId === "pocket-stealth-vapor") {
    const r = POCKET_STEALTH_VAPOR_RULE;
    if (format === "json") {
      console.log(JSON.stringify({ packId: "pocket-model", ...r }, null, 2));
      process.exit(0);
    }
    console.log(`${r.id}  [${r.tier} / ${r.severity}]  (pack: pocket-model)`);
    console.log(`Modalities: ${r.modalities.join(", ")}`);
    console.log(`Why:        ${r.message[lang] || r.message.en}`);
    console.log(`Test:       ${r.deletionTest[lang] || r.deletionTest.en}`);
    console.log(`\nBefore (bad):  ${r.exemplar.bad}`);
    console.log(`Trap (avoid):  ${r.exemplar.trap}`);
    console.log(`After (good):  ${r.exemplar.good}`);
    process.exit(0);
  }
  console.error(`dislop: unknown rule '${ruleId}'`);
  process.exit(2);
}

function runPacks(args, packs) {
  const { flags } = parseFlags(args, "packs");
  if (flags.help) {
    printSubcommandHelp("packs");
    return;
  }
  const format = flags.json ? "json" : flags.format || "text";
  assertTextOrJsonFormat(format);
  const list = Object.values(packs).map((p) => ({
    id: p.id,
    version: p.version,
    tier: p.tier,
    extends: p.extends || [],
    name: p.name,
    modalities: p.modalities,
    ruleCount: (p.rules || []).length,
    summary: p.summary,
  }));
  if (format === "json") {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  for (const p of list) {
    console.log(`${p.id.padEnd(18)} [${p.tier}] (${p.ruleCount} rules) — ${p.name.en} / ${p.name.zh}`);
    console.log(`  modalities: ${p.modalities.join(", ")}`);
  }
}

const VALID_MODALITIES = new Set(["markdown", "text", "html", "css", "jsx", "svg", "docx", "pptx", "pdf", "image"]);
const VALID_SEVERITIES = new Set(["error", "warning", "info"]);
const VALID_TIERS = new Set(["invariant", "taste"]);

function runCatalog(args, packs, patternByRuleId) {
  const { flags, positional } = parseFlags(args, "catalog");
  if (flags.help) {
    printSubcommandHelp("catalog");
    return;
  }
  const format = flags.json ? "json" : flags.format || "text";
  const lang = flags.lang || "en";
  if (!["text", "json", "md"].includes(format)) {
    console.error(`dislop: invalid --format '${format}' (expected text, json, or md)`);
    process.exit(2);
  }
  if (flags.severity && !VALID_SEVERITIES.has(flags.severity)) {
    console.error(`dislop: invalid --severity '${flags.severity}' (expected error, warning, or info)`);
    process.exit(2);
  }
  if (flags.modality && !VALID_MODALITIES.has(flags.modality)) {
    console.error(`dislop: invalid --modality '${flags.modality}'`);
    process.exit(2);
  }
  if (flags.tier && !VALID_TIERS.has(flags.tier)) {
    console.error(`dislop: invalid --tier '${flags.tier}' (expected invariant or taste)`);
    process.exit(2);
  }

  const query = flags.query || positional.join(" ").trim() || "";
  const limit = flags.limit ? Number(flags.limit) : null;
  const entries = buildCatalog(packs, patternByRuleId);
  const result = queryCatalog(entries, {
    query,
    pack: flags.pack || null,
    category: flags.category || null,
    dimension: flags.dimension || null,
    family: flags.family || null,
    modality: flags.modality || null,
    severity: flags.severity || null,
    tier: flags.tier || null,
    includeExemplars: flags["no-exemplars"] ? false : true,
    limit: Number.isInteger(limit) && limit > 0 ? limit : null,
  });

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (format === "md") {
    const rows = [
      "| Rule | Pack | Severity | Category | Modalities | Description |",
      "|---|---|---|---|---|---|",
      ...result.items.map((item) => {
        const msg = (item.message?.[lang] || item.message?.en || "").replace(/\|/g, "\\|");
        return `| \`${item.id}\` | \`${item.packId}\` | \`${item.severity}\` | \`${item.category}\` | ${(item.modalities || []).join(", ")} | ${msg} |`;
      }),
    ];
    console.log(rows.join("\n"));
    return;
  }

  console.log(`dislop catalog: ${result.matched} / ${result.total} rule(s) matched`);
  for (const item of result.items) {
    const msg = item.message?.[lang] || item.message?.en || "";
    console.log(`  [${item.severity.padEnd(7)}] ${item.id.padEnd(30)} (${item.packId} · ${item.category}) — ${msg}`);
  }
}

function runPackTest(args, packs) {
  const { flags } = parseFlags(args, "pack-test");
  if (flags.help) {
    printSubcommandHelp("pack-test");
    return;
  }
  const errors = [];
  let assertions = 0;

  for (const pack of Object.values(packs)) {
    if (pack.schema !== "dislop.pack/2") {
      errors.push(`${pack.id}: expected schema 'dislop.pack/2'`);
    }
    const effective = resolveEffectivePack(pack.id, packs, {});
    for (const rule of pack.rules || []) {
      if (!rule.deletionTest?.en || !rule.deletionTest?.zh) {
        errors.push(`${pack.id}/${rule.id}: missing bilingual deletionTest`);
      }
      if (!rule.exemplar?.bad || !rule.exemplar?.good || !rule.exemplar?.source) {
        errors.push(`${pack.id}/${rule.id}: missing exemplar (bad/good/source)`);
      }
      const hits = rule.fixtures?.hit || [];
      const cleans = rule.fixtures?.clean || [];
      if (hits.length === 0 || cleans.length === 0) {
        errors.push(`${pack.id}/${rule.id}: requires at least 1 hit and 1 clean fixture`);
      }
      const sampleMod = (rule.modalities && rule.modalities[0]) || "markdown";
      for (const h of hits) {
        assertions += 1;
        const res = auditText(h, { filename: `fixture.${sampleMod}`, modality: sampleMod, pack: effective, allowSyntheticFixtures: true });
        if (!res.findings.some((f) => f.ruleId === rule.id)) {
          errors.push(`${pack.id}/${rule.id}: hit fixture did NOT trigger rule: ${JSON.stringify(h)}`);
        }
      }
      for (const c of cleans) {
        assertions += 1;
        const res = auditText(c, { filename: `fixture.${sampleMod}`, modality: sampleMod, pack: effective, allowSyntheticFixtures: true });
        if (res.findings.some((f) => f.ruleId === rule.id)) {
          errors.push(`${pack.id}/${rule.id}: clean fixture FALSELY triggered rule: ${JSON.stringify(c)}`);
        }
      }
      // Lint regex patterns against unbounded `.*`
      for (const pat of rule.patterns || []) {
        if (/\.\*/.test(pat)) {
          errors.push(`${pack.id}/${rule.id}: unbounded '.*' forbidden in portable pack regex: ${pat}`);
        }
      }
      // Validate registerOverrides + fixtures.register
      if (rule.registerOverrides) {
        if (rule.tier === "invariant") {
          errors.push(`${pack.id}/${rule.id}: invariant rules cannot define registerOverrides`);
        }
        const ovEntries = Object.entries(rule.registerOverrides);
        for (const [rk, rov] of ovEntries) {
          if (!VALID_REGISTERS.includes(rk) || rk === "unspecified") {
            errors.push(`${pack.id}/${rule.id}: invalid registerOverrides key '${rk}'`);
          }
          if (rov?.severity && SEVERITY_RANK[rov.severity] > SEVERITY_RANK[rule.severity]) {
            errors.push(`${pack.id}/${rule.id}: registerOverrides['${rk}'] cannot raise severity above '${rule.severity}'`);
          }
        }
        const regFixtures = rule.fixtures?.register || [];
        if (regFixtures.length === 0) {
          errors.push(`${pack.id}/${rule.id}: registerOverrides requires at least 1 fixtures.register assertion`);
        }
        for (const rf of regFixtures) {
          assertions += 1;
          const res = auditText(rf.text, {
            filename: `fixture.${sampleMod}`,
            modality: sampleMod,
            pack: effective,
            allowSyntheticFixtures: true,
            register: rf.register,
          });
          const hit = res.findings.find((f) => f.ruleId === rule.id);
          if (rf.expect === "skip") {
            if (hit) errors.push(`${pack.id}/${rule.id}: expected register '${rf.register}' to skip`);
          } else if (!hit || hit.severity !== rf.expect) {
            errors.push(`${pack.id}/${rule.id}: register '${rf.register}' expected '${rf.expect}', got '${hit?.severity || "none"}'`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`dislop pack-test: FAILED (${errors.length} error(s) across ${assertions} assertions)`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`dislop pack-test: ok (${Object.keys(packs).length} packs, ${assertions} fixture assertions passed)`);
}

function runInit(args = []) {
  const { flags } = parseFlags(args, "init");
  if (flags.help) {
    printSubcommandHelp("init");
    return;
  }
  const cwd = process.cwd();
  const cfgPath = path.join(cwd, ".dislop.json");
  if (!fs.existsSync(cfgPath)) {
    const starter = {
      failOn: "error",
      ignore: ["vendor/**", "dist/**"],
      overrides: [{ files: ["docs/**/*.md"], pack: "business-brief" }],
      allow: [],
      rules: {},
    };
    fs.writeFileSync(cfgPath, JSON.stringify(starter, null, 2) + "\n", "utf8");
    console.log(`Created ${cfgPath}`);
  } else {
    console.log(`${cfgPath} already exists`);
  }

  const giPath = path.join(cwd, ".gitignore");
  const localEntry = ".dislop.local.json";
  if (fs.existsSync(giPath)) {
    const cur = fs.readFileSync(giPath, "utf8");
    if (!cur.split(/\r?\n/).includes(localEntry)) {
      fs.writeFileSync(giPath, cur.replace(/\s*$/, "\n") + localEntry + "\n", "utf8");
      console.log(`Added ${localEntry} to .gitignore`);
    }
  } else if (fs.existsSync(path.join(cwd, ".git"))) {
    fs.writeFileSync(giPath, localEntry + "\n", "utf8");
    console.log(`Created .gitignore with ${localEntry}`);
  }
}

// ---------- MCP Stdio Server ----------

function runMcpServer(packs, patternByRuleId) {
  const cwd = process.cwd();
  const catalogEntries = buildCatalog(packs, patternByRuleId);
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  function send(msg) {
    process.stdout.write(JSON.stringify(msg) + "\n");
  }

  function toolResult(id, payload, isError = false) {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        isError,
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      },
    });
  }

  function formatRuleForExplain(rule, packId, lang) {
    const cleanLang = lang === "en" || lang === "zh" ? lang : null;
    const localizeObj = (obj) => {
      if (!obj || typeof obj !== "object") return obj;
      if (!cleanLang) return obj;
      return { [cleanLang]: obj[cleanLang] || obj.en || "" };
    };
    const out = {
      packId,
      id: rule.id,
      tier: rule.tier,
      severity: rule.severity,
      ...(rule.category ? { category: rule.category } : {}),
      ...(rule.family ? { family: rule.family } : {}),
      modalities: rule.modalities || [],
      ...(Array.isArray(rule.tags) ? { tags: rule.tags } : {}),
      message: localizeObj(rule.message),
      deletionTest: localizeObj(rule.deletionTest),
    };
    if (rule.exemplar) {
      out.exemplar = {
        ...rule.exemplar,
        ...(rule.exemplar.note ? { note: localizeObj(rule.exemplar.note) } : {}),
      };
    }
    return out;
  }

  function formatFindingsForMcp(findings, verbosity, lang) {
    const cleanLang = lang === "en" || lang === "zh" ? lang : null;
    const localizeObj = (obj) => {
      if (!obj || typeof obj !== "object" || !cleanLang) return obj;
      return { [cleanLang]: obj[cleanLang] || obj.en || "" };
    };
    const localizeRevision = (rev) => {
      if (!rev || typeof rev !== "object") return null;
      if (!cleanLang) return rev;
      return {
        ...rev,
        instruction: localizeObj(rev.instruction),
        avoid: localizeObj(rev.avoid),
      };
    };
    if (verbosity === "full") {
      if (!cleanLang) return findings;
      return findings.map((f) => ({
        ...f,
        message: localizeObj(f.message),
        deletionTest: localizeObj(f.deletionTest),
        revision: localizeRevision(f.revision),
      }));
    }
    return findings.map((f) => ({
      fingerprint: f.fingerprint,
      ruleId: f.ruleId,
      tier: f.tier ?? "taste",
      severity: f.severity,
      confidence: f.confidence || "medium",
      fixStrategy: f.fixStrategy || deriveFixStrategy({ id: f.ruleId, family: f.family }),
      family: f.family ?? (f.dimension ? `${f.dimension}/${f.ruleId}` : null),
      file: f.file,
      modality: f.modality,
      location: f.location,
      line: f.line,
      col: f.col,
      match: f.match,
      message: localizeObj(f.message),
      deletionTest: f.deletionTest ? localizeObj(f.deletionTest) : null,
      revision: localizeRevision(f.revision),
    }));
  }

  const tools = [
    {
      name: "dislop_check",
      description:
        "Check a draft (`text` or workspace-relative `path`) for AI-generation artifacts, clichés, and template slop across Markdown, HTML/CSS/JSX/SVG, PNG/JPEG/WebP, Word (.docx), PowerPoint (.pptx), and PDF. Edit only the flagged spans using `fixStrategy`, then run `dislop_verify`.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Draft text to inspect in memory" },
          path: { type: "string", description: "Workspace-relative file path (.md, .html, .css, .jsx, .svg, .png, .jpg, .jpeg, .webp, .docx, .pptx, .pdf)" },
          pack: { type: "string", description: "Style pack ID (auto, business-brief, engineering-spec, regulated-comms, literary-essay, deck-and-ui, executive-deck)" },
          register: { type: "string", enum: ["auto", ...VALID_REGISTERS], description: "Optional writing register override (auto, unspecified, official, casual, argumentative, technical, marketing, narrative)" },
          filename: { type: "string", description: "Virtual filename hint when inspecting `text`" },
          profile: { type: "boolean", description: "Include 5-axis rhythm & concreteness telemetry on text/markdown (default true)" },
          deep: { type: "boolean", description: "Enable thorough inspection (Pocket ML + extended 6-dimension pattern bank)" },
          ml: { type: "boolean", description: "Enable bundled 15 KB Pocket ML stealth-vapor paragraph detection (default false)" },
          patterns: { type: "boolean", description: "Include extended 6-dimension pattern-bank probes (default false)" },
          verbosity: { type: "string", enum: ["compact", "full"], description: "Default compact (omits per-hit exemplars to save context tokens; pass full to inline exemplars)" },
          lang: { type: "string", enum: ["en", "zh"], description: "Optional single-locale filter for finding messages" },
        },
      },
    },
    {
      name: "dislop_verify",
      description:
        "Verify a revised draft against its original text (or Git baseline for workspace `path`): checks numbers/qualifiers, required `keep` terms, newly introduced AI slop, length bounds, and anti-degradation guardrails (author perspective, cadence, info density, modality).",
      inputSchema: {
        type: "object",
        properties: {
          before: { type: "string", description: "Original text before revision (required unless `path` is provided)" },
          after: { type: "string", description: "Revised text after revision (required unless `path` is provided)" },
          path: { type: "string", description: "Workspace-relative file path to compare working tree against `gitRef`" },
          gitRef: { type: "string", description: "Git ref baseline when `path` is given (default HEAD)" },
          filename: { type: "string", description: "Optional virtual filename hint when passing `before`/`after`" },
          pack: { type: "string", description: "Optional pack ID or 'auto' to also verify findingsDelta" },
          register: { type: "string", enum: ["auto", ...VALID_REGISTERS], description: "Optional writing register override (auto, unspecified, official, casual, argumentative, technical, marketing, narrative)" },
          keep: { type: "array", items: { type: "string" }, description: "Protected terms/concepts that must stay intact in the revision" },
          allowAdded: { type: "boolean", description: "Allow new numbers not present in original (default false)" },
          strict: { type: "boolean", description: "Fail `ok` on any anti-degradation warning in addition to hard fact/error checks" },
        },
      },
    },
    {
      name: "dislop_rules",
      description: "Unified rule lookup: pass `ruleId` to explain a rule, filters (`query`/`pack`/`dimension`) to search, or empty object to list all packs.",
      inputSchema: {
        type: "object",
        properties: {
          ruleId: { type: "string", description: "Optional rule ID to explain with before/trap/after examples" },
          query: { type: "string", description: "Optional keyword search query" },
          pack: { type: "string" },
          category: { type: "string" },
          dimension: { type: "string" },
          family: { type: "string" },
          modality: { type: "string" },
          severity: { type: "string", enum: ["error", "warning", "info"] },
          tier: { type: "string", enum: ["invariant", "taste"] },
          lang: { type: "string", enum: ["en", "zh"] },
          includeExemplars: { type: "boolean" },
          limit: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
    },
    {
      name: "dislop_voice_extract",
      description:
        "Extract a deterministic offline `dislop.voice/1` personal style card from 1-15 clean author samples (0 network calls, 0 uploads).",
      inputSchema: {
        type: "object",
        properties: {
          samples: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 15,
            description: "1 to 15 clean sample passages written by the author",
          },
          lang: { type: "string", enum: ["auto", "en", "zh"] },
        },
        required: ["samples"],
      },
    },
    {
      name: "dislop_model_score",
      description:
        "Run the bundled zero-dependency 15 KB Pocket ML ensemble (`pocket-slop-v1`) + 5-domain pack router on `text` to detect clean-wordlist stealth AI vapor paragraphs and explain top contributing signals (0 network calls).",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Draft text to score with bundled Pocket ML" },
          threshold: { type: "number", description: "Optional paragraph flag threshold (0..1)" },
        },
        required: ["text"],
      },
    },
    {
      name: "dislop_model_status",
      description:
        "Inspect bundled models, installed optional model weights, hardware memory budget, and recommended optional local model tier.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ];

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let req;
    try {
      req = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (!req || typeof req !== "object" || Array.isArray(req)) {
      send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid Request: expected JSON-RPC object" },
      });
      return;
    }
    const { id, method } = req;
    if (id === undefined || id === null) return;
    const rawParams = req.params;
    if (rawParams !== undefined && (!rawParams || typeof rawParams !== "object" || Array.isArray(rawParams))) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32600, message: "Invalid Request: params must be an object" },
      });
      return;
    }
    const params = rawParams || {};

    if (method === "initialize") {
      const clientVersion = params.protocolVersion || "2024-11-05";
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: clientVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "dislop", version: ENGINE_VERSION },
        },
      });
      return;
    }

    if (method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
      return;
    }

    if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools } });
      return;
    }

    if (method === "tools/call") {
      const name = params.name;
      const rawArgs = params.arguments;
      if (rawArgs !== undefined && (!rawArgs || typeof rawArgs !== "object" || Array.isArray(rawArgs))) {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Invalid params: arguments must be an object" },
        });
        return;
      }
      const args = rawArgs || {};
      try {
        const resolveWorkspaceFileMcp = (relOrAbsPath) => {
          const realCwd = fs.realpathSync(cwd);
          const resolved = path.resolve(cwd, relOrAbsPath);
          if (!fs.existsSync(resolved)) {
            const lexReal = path.relative(realCwd, path.resolve(realCwd, relOrAbsPath));
            const lexCwd = path.relative(path.resolve(cwd), resolved);
            const escapesBoth =
              (lexReal === ".." || lexReal.startsWith(`..${path.sep}`) || path.isAbsolute(lexReal)) &&
              (lexCwd === ".." || lexCwd.startsWith(`..${path.sep}`) || path.isAbsolute(lexCwd));
            return {
              error: escapesBoth
                ? "Path must stay within the current workspace directory."
                : `File not found: ${relOrAbsPath}`,
            };
          }
          if (!fs.statSync(resolved).isFile()) {
            return { error: `File not found: ${relOrAbsPath}` };
          }
          const realTarget = fs.realpathSync(resolved);
          const rel = path.relative(realCwd, realTarget);
          if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
            return { error: "Path must stay within the current workspace directory." };
          }
          return { realTarget, posixRel: rel.split(path.sep).join("/") };
        };

        const resolveExplainById = (ruleId, langArg) => {
          for (const p of Object.values(packs)) {
            const rule = (p.rules || []).find((r) => r.id === ruleId);
            if (rule) return formatRuleForExplain(rule, p.id, langArg);
          }
          const pat = patternByRuleId && patternByRuleId[ruleId];
          if (pat) {
            const guards = Array.isArray(pat.falsePositiveGuards) ? pat.falsePositiveGuards.join(" ") : "";
            const synthRule = {
              id: ruleId,
              tier: "taste",
              severity: pat.severityDefault || "info",
              category: pat.category || "general",
              family: pat.dimension ? `${pat.dimension}/${ruleId}` : "pattern-bank",
              modalities: pat.modalities || ["markdown", "text"],
              tags: pat.tags || [],
              message: pat.mechanism || pat.name || { en: "", zh: "" },
              ...(guards ? { deletionTest: { en: guards, zh: guards } } : {}),
              ...(pat.exemplar ? { exemplar: pat.exemplar } : {}),
            };
            return formatRuleForExplain(synthRule, pat.packId || "pattern-bank", langArg);
          }
          if (ruleId === "pocket-stealth-vapor") {
            return formatRuleForExplain(POCKET_STEALTH_VAPOR_RULE, "pocket-model", langArg);
          }
          return null;
        };

        if (name === "dislop_rules") {
          if (args.ruleId) {
            const explained = resolveExplainById(args.ruleId, args.lang);
            if (explained) toolResult(id, explained);
            else toolResult(id, { error: `Unknown ruleId '${args.ruleId}'` }, true);
            return;
          }
          const hasFilter = Boolean(
            args.query || args.pack || args.category || args.dimension || args.family || args.modality || args.severity || args.tier
          );
          if (hasFilter) {
            const result = queryCatalog(catalogEntries, {
              query: args.query || "",
              pack: args.pack || null,
              category: args.category || null,
              dimension: args.dimension || null,
              family: args.family || null,
              modality: args.modality || null,
              severity: args.severity || null,
              tier: args.tier || null,
              includeExemplars: args.includeExemplars !== false,
              limit: Number.isInteger(args.limit) && args.limit > 0 ? args.limit : null,
            });
            toolResult(id, result);
            return;
          }
          const list = Object.values(packs).map((p) => ({
            id: p.id,
            tier: p.tier,
            name: p.name,
            modalities: p.modalities,
            ruleCount: (p.rules || []).length,
            summary: p.summary,
          }));
          toolResult(id, { packs: list });
          return;
        }

        if (name === "dislop_verify") {
          const liveConfig = loadConfig(cwd);
          const hasBefore = typeof args.before === "string";
          const hasAfter = typeof args.after === "string";
          const hasPath = typeof args.path === "string" && args.path.trim().length > 0;
          let beforeText;
          let afterText;
          let fn = args.filename || "draft.md";
          if (hasPath) {
            const ws = resolveWorkspaceFileMcp(args.path);
            if (ws.error) {
              toolResult(id, { error: ws.error }, true);
              return;
            }
            fn = ws.posixRel;
            afterText = decodeUtf8Strict(fs.readFileSync(ws.realTarget));
            beforeText = readGitBaselineForFile(ws.realTarget, typeof args.gitRef === "string" && args.gitRef.trim() ? args.gitRef.trim() : "HEAD");
          } else if (hasBefore && hasAfter) {
            beforeText = args.before;
            afterText = args.after;
          } else {
            toolResult(id, { error: "Provide both `before` and `after` strings, or a workspace `path`." }, true);
            return;
          }
          const mod = detectModality(fn) || "markdown";
          const fileCfg = resolveConfigForFile(fn, liveConfig);
          let argRegister = null;
          if (args.register !== undefined) {
            if (typeof args.register !== "string") {
              toolResult(id, { error: `Invalid register (expected string: auto, ${VALID_REGISTERS.join(", ")})` }, true);
              return;
            }
            const normReg = args.register.trim().toLowerCase();
            if (!normReg || (normReg !== "auto" && !VALID_REGISTERS.includes(normReg))) {
              toolResult(id, { error: `Invalid register '${args.register}' (expected auto, ${VALID_REGISTERS.join(", ")})` }, true);
              return;
            }
            argRegister = normReg;
          }
          const packRes = resolveTextPackAndSource(afterText, fn, mod, args.pack || "auto", fileCfg, packs);
          const keepTerms = Array.isArray(args.keep)
            ? args.keep
            : typeof args.keep === "string"
              ? args.keep.split(",").map((x) => x.trim()).filter(Boolean)
              : [];
          const out = verifyRevisionBundle(beforeText, afterText, {
            filename: fn,
            modality: mod,
            pack: packRes.pack,
            config: fileCfg,
            register: argRegister,
            keepTerms,
            allowAdded: Boolean(args.allowAdded),
            strict: Boolean(args.strict),
          });
          out.effectivePack = packRes.effectivePack;
          out.packSource = packRes.packSource;
          toolResult(id, out);
          return;
        }

        if (name === "dislop_packs") {
          const list = Object.values(packs).map((p) => ({
            id: p.id,
            tier: p.tier,
            name: p.name,
            modalities: p.modalities,
            ruleCount: (p.rules || []).length,
            summary: p.summary,
          }));
          toolResult(id, { packs: list });
          return;
        }

        if (name === "dislop_catalog") {
          const result = queryCatalog(catalogEntries, {
            query: args.query || "",
            pack: args.pack || null,
            category: args.category || null,
            dimension: args.dimension || null,
            family: args.family || null,
            modality: args.modality || null,
            severity: args.severity || null,
            tier: args.tier || null,
            includeExemplars: args.includeExemplars !== false,
            limit: Number.isInteger(args.limit) && args.limit > 0 ? args.limit : null,
          });
          toolResult(id, result);
          return;
        }

        if (name === "dislop_explain") {
          if (!args.ruleId) {
            toolResult(id, { error: "Missing required argument `ruleId`" }, true);
            return;
          }
          for (const p of Object.values(packs)) {
            const rule = (p.rules || []).find((r) => r.id === args.ruleId);
            if (rule) {
              toolResult(id, formatRuleForExplain(rule, p.id, args.lang));
              return;
            }
          }
          const pat = patternByRuleId && patternByRuleId[args.ruleId];
          if (pat) {
            const guards = Array.isArray(pat.falsePositiveGuards) ? pat.falsePositiveGuards.join(" ") : "";
            const synthRule = {
              id: args.ruleId,
              tier: "taste",
              severity: pat.severityDefault || "info",
              category: pat.category || "general",
              family: pat.dimension ? `${pat.dimension}/${args.ruleId}` : "pattern-bank",
              modalities: pat.modalities || ["markdown", "text"],
              tags: pat.tags || [],
              message: pat.mechanism || pat.name || { en: "", zh: "" },
              ...(guards ? { deletionTest: { en: guards, zh: guards } } : {}),
              ...(pat.exemplar ? { exemplar: pat.exemplar } : {}),
            };
            toolResult(id, formatRuleForExplain(synthRule, pat.packId || "pattern-bank", args.lang));
            return;
          }
          if (args.ruleId === "pocket-stealth-vapor") {
            toolResult(id, formatRuleForExplain(POCKET_STEALTH_VAPOR_RULE, "pocket-model", args.lang));
            return;
          }
          toolResult(id, { error: `Unknown ruleId '${args.ruleId}'` }, true);
          return;
        }

        if (name === "dislop_check") {
          const hasText = typeof args.text === "string";
          const hasPath = typeof args.path === "string" && args.path.trim().length > 0;
          if (hasText === hasPath) {
            toolResult(
              id,
              { error: "Provide exactly one of `text` (in-memory string) or `path` (workspace file path)." },
              true
            );
            return;
          }

          const liveConfig = loadConfig(cwd);
          const verbosity = args.verbosity === "full" ? "full" : "compact";
          const includeMl = Boolean(args.ml || args.deep);
          const includePatterns = Boolean(args.patterns || args.deep);
          const wantProfile = args.profile !== false;
          const banks = includePatterns ? loadPatternBanks() : null;
          let argRegister = null;
          if (args.register !== undefined && args.register !== null) {
            if (typeof args.register !== "string") {
              toolResult(
                id,
                { error: `Invalid register (expected string: auto, ${VALID_REGISTERS.join(", ")})` },
                true
              );
              return;
            }
            const rawReg = args.register;
            const normReg = rawReg.trim().toLowerCase();
            if (!normReg || (normReg !== "auto" && !VALID_REGISTERS.includes(normReg))) {
              toolResult(
                id,
                { error: `Invalid register '${rawReg}' (expected auto, ${VALID_REGISTERS.join(", ")})` },
                true
              );
              return;
            }
            argRegister = normReg;
          }

          if (hasText) {
            const fn = args.filename || "draft.md";
            const mod = detectModality(fn) || "markdown";
            const fileCfg = resolveConfigForFile(fn, liveConfig);
            const { pack, effectivePack, packSource } = resolveTextPackAndSource(args.text, fn, mod, args.pack || null, fileCfg, packs);
            const regInfo = resolveRegister(args.text, { filename: fn, flagRegister: argRegister, config: fileCfg });
            const res = auditText(args.text, { filename: fn, modality: mod, pack, config: fileCfg, register: argRegister });
            let findings = res.findings;
            if (includePatterns) {
              findings = mergePatternBankFindings(
                findings,
                auditPatterns(args.text, { filename: fn, modality: mod, banks, config: fileCfg }).findings,
                { packs, pack, register: regInfo.register, config: fileCfg }
              );
            }
            const needsCoverageProfile = codePointLength(args.text) >= 2000 || mod === "html";
            const profile = PROSE_ML_MODALITIES.has(mod) && (wantProfile || includeMl || needsCoverageProfile)
              ? analyzeTextProfile(args.text, { modality: mod, config: fileCfg })
              : null;
            if (includeMl && PROSE_ML_MODALITIES.has(mod)) {
              const mlSrc = mod === "html" || mod === "svg" ? buildZones(args.text, mod, fileCfg).prose : args.text;
              findings = [
                ...findings,
                ...buildPocketMlFindings(mlSrc, fn, findings, null, {
                  profile,
                  modality: mod,
                  register: regInfo.register,
                }).findings,
              ];
            }
            const formatted = formatFindingsForMcp(findings, verbosity, args.lang);
            toolResult(id, {
              pack: effectivePack,
              packSource,
              rulesetHash: computeRulesetHash(pack),
              modality: mod,
              context: { register: regInfo.register, registerSource: regInfo.registerSource },
              checked: true,
              skipped: [],
              coverageWarnings: collectTextCoverageWarnings(args.text, mod, fn, profile),
              count: formatted.length,
              findings: formatted,
              ...(verbosity === "compact" && formatted.length > 0
                ? { explainHint: "Call dislop_explain(ruleId) for before/trap/after examples." }
                : {}),
              ...(wantProfile && profile ? { profile } : {}),
            });
            return;
          }

          const realCwd = fs.realpathSync(cwd);
          const resolved = path.resolve(cwd, args.path);
          if (!fs.existsSync(resolved)) {
            const lexReal = path.relative(realCwd, path.resolve(realCwd, args.path));
            const lexCwd = path.relative(path.resolve(cwd), resolved);
            const escapesBoth =
              (lexReal === ".." || lexReal.startsWith(`..${path.sep}`) || path.isAbsolute(lexReal)) &&
              (lexCwd === ".." || lexCwd.startsWith(`..${path.sep}`) || path.isAbsolute(lexCwd));
            toolResult(
              id,
              {
                error: escapesBoth
                  ? "Path must stay within the current workspace directory."
                  : `File not found: ${args.path}`,
              },
              true
            );
            return;
          }
          if (!fs.statSync(resolved).isFile()) {
            toolResult(id, { error: `File not found: ${args.path}` }, true);
            return;
          }
          const realTarget = fs.realpathSync(resolved);
          const rel = path.relative(realCwd, realTarget);
          if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
            toolResult(id, { error: "Path must stay within the current workspace directory." }, true);
            return;
          }
          const mod = detectModality(realTarget);
          if (!mod) {
            toolResult(id, { error: `Unsupported file extension for '${args.path}'` }, true);
            return;
          }
          const posixRel = rel.split(path.sep).join("/");
          const res = inspectSingleFile(
            { absPath: realTarget, rel: posixRel, modality: mod },
            packs,
            args.pack || null,
            liveConfig,
            { includeMl, includePatterns, includeProfile: wantProfile, banks, register: argRegister }
          );
          const profile = res.profileItem ? res.profileItem.profile : null;
          const formatted = formatFindingsForMcp(res.findings, verbosity, args.lang);
          toolResult(id, {
            pack: res.effectivePack || pickPackForFile(posixRel, mod, args.pack || null, liveConfig),
            packSource: res.packSource || null,
            rulesetHash: res.rulesetHash || null,
            modality: mod,
            context: { register: res.register || "unspecified", registerSource: res.registerSource || "default" },
            checked: res.checked,
            skipped: res.skipped,
            coverageWarnings: res.coverageWarnings || [],
            count: formatted.length,
            findings: formatted,
            ...(verbosity === "compact" && formatted.length > 0
              ? { explainHint: "Call dislop_explain(ruleId) for before/trap/after examples." }
              : {}),
            ...(profile ? { profile } : {}),
          });
          return;
        }

        if (name === "dislop_voice_extract_offline" || name === "dislop_voice_extract") {
          if (!Array.isArray(args.samples) || args.samples.length === 0) {
            toolResult(id, { error: "Non-empty `samples` string array is required." }, true);
            return;
          }
          if (args.samples.length > 15) {
            toolResult(id, { error: "Provide at most 15 sample passages per call." }, true);
            return;
          }
          if (args.samples.some((s) => typeof s !== "string")) {
            toolResult(id, { error: "Every element in `samples` must be a string." }, true);
            return;
          }
          const nonBlankSamples = args.samples.map((s) => s.trim()).filter(Boolean);
          if (nonBlankSamples.length === 0) {
            toolResult(id, { error: "At least one non-empty sample passage is required." }, true);
            return;
          }
          const voice = extractVoiceProfileOffline(nonBlankSamples, { lang: args.lang || "auto" });
          toolResult(id, voice);
          return;
        }

        if (name === "dislop_model_score") {
          if (typeof args.text !== "string") {
            toolResult(id, { error: "Required string argument `text` missing." }, true);
            return;
          }
          if (args.threshold !== undefined && args.threshold !== null) {
            if (typeof args.threshold !== "number" || !Number.isFinite(args.threshold) || args.threshold < 0 || args.threshold > 1) {
              toolResult(id, { error: "`threshold` must be a number between 0 and 1." }, true);
              return;
            }
          }
          const thr = typeof args.threshold === "number" ? args.threshold : null;
          toolResult(id, analyzeDocumentWithPocketModels(args.text, { threshold: thr }));
          return;
        }

        if (name === "dislop_model_status") {
          let rulesCount = 0;
          for (const p of Object.values(packs)) rulesCount += (p.rules || []).length;
          buildModelStatusReport({
            packsCount: Object.keys(packs).length,
            rulesCount,
            probeLoopback: false,
          })
            .then((st) => toolResult(id, st))
            .catch((e) => toolResult(id, { error: e.message }, true));
          return;
        }

        toolResult(id, { error: `Unknown tool '${name}'` }, true);
      } catch (err) {
        toolResult(id, { error: err.message }, true);
      }
      return;
    }

    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  });
}

function runResources(rest, packs) {
  const { flags } = parseFlags(rest, "resources");
  if (flags.help) {
    printSubcommandHelp("resources");
    return;
  }
  const format = flags.json ? "json" : flags.format || "text";
  assertTextOrJsonFormat(format);
  const asJson = format === "json";
  const payload = {
    schema: "dislop.resources/1",
    offlineCheck: true,
    note: "'dislop check' runs 100% locally with zero network requests and zero file uploads.",
    bundledPacks: Object.keys(packs).sort(),
    staticResources: {
      llmsIndex: "https://dislop.com/llms.txt",
      catalog: "https://dislop.com/catalog.json",
      awesomeIndex: "https://dislop.com/awesome/index.json",
      mcpServerCard: "https://dislop.com/.well-known/mcp/server-card.json",
      agentSkillsIndex: "https://dislop.com/.well-known/agent-skills/index.json",
      tasks: [
        "https://dislop.com/tasks/business-doc.md",
        "https://dislop.com/tasks/web-and-deck.md",
        "https://dislop.com/tasks/editorial-writing.md",
        "https://dislop.com/tasks/pre-release-gate.md",
      ],
      ruleTemplate: "https://dislop.com/rules/<rule-id>.md",
    },
    optionalCloudMcp: {
      url: "https://dislop.com/mcp",
      oauthMetadata: "https://dislop.com/.well-known/oauth-protected-resource/mcp",
      pricingAndFreeToken: "https://dislop.com/#pricing",
      freeToolsNoLogin: ["dislop_check", "dislop_verify", "dislop_rules"],
      tools: [
        "dislop_check",
        "dislop_verify",
        "dislop_rules",
        "dislop_review",
        "dislop_deslop",
        "dislop_office",
        "dislop_visual_review",
        "dislop_voice_extract",
        "dislop_voice_manage",
        "dislop_account",
      ],
    },
  };
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`dislop v${ENGINE_VERSION} resources (dislop check makes 0 network requests)`);
  console.log(`\nBundled offline packs: ${payload.bundledPacks.join(", ")}`);
  console.log(`\nFree read-only static resources (dislop.com):`);
  console.log(`  - Agent index : ${payload.staticResources.llmsIndex}`);
  console.log(`  - Full catalog: ${payload.staticResources.catalog}`);
  console.log(`  - Awesome 90  : ${payload.staticResources.awesomeIndex}`);
  console.log(`  - MCP card    : ${payload.staticResources.mcpServerCard}`);
  console.log(`  - Skills index: ${payload.staticResources.agentSkillsIndex}`);
  console.log(`  - Rule card   : ${payload.staticResources.ruleTemplate}`);
  console.log(`\nOptional hosted Cloud Remote MCP (0-credit check/verify/rules need no login; 30 free credits/mo after sign-in):`);
  console.log(`  - Endpoint    : ${payload.optionalCloudMcp.url}`);
  console.log(`  - Free token  : ${payload.optionalCloudMcp.pricingAndFreeToken}`);
}

function loadPatternBanks(customPatternsDir = PATTERNS_DIR) {
  const bankDir = path.join(customPatternsDir, "banks");
  const out = {};
  if (!fs.existsSync(bankDir)) return out;
  for (const entry of fs.readdirSync(bankDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(path.join(bankDir, entry.name), "utf8"));
    out[data.id || entry.name.replace(/\.json$/, "")] = data;
  }
  return out;
}

function runPatterns(args) {
  const { flags, positional } = parseFlags(args, "patterns");
  if (flags.help) {
    printSubcommandHelp("patterns");
    return;
  }
  const format = flags.json ? "json" : flags.format || "text";
  assertTextOrJsonFormat(format);
  const lang = flags.lang || "en";
  const banks = loadPatternBanks();
  const angles = flags.angle ? String(flags.angle).split(",").map((s) => s.trim()).filter(Boolean) : null;

  let text = "";
  let filename = flags["stdin-filename"] || "stdin.md";
  let modality = detectModality(filename) || "markdown";
  let ooxml = null;

  if (positional.length === 0 || positional[0] === "-") {
    text = fs.readFileSync(0, "utf8");
  } else {
    const abs = path.resolve(process.cwd(), positional[0]);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      console.error(`dislop: file not found: ${positional[0]}`);
      process.exit(2);
    }
    filename = positional[0];
    const detected = detectModality(abs);
    if (!detected) {
      console.error(`dislop: unsupported file extension for '${positional[0]}'`);
      process.exit(2);
    }
    modality = detected;
    if (modality === "pdf" || modality === "image") {
      console.error(`dislop: unsupported modality '${modality}' for patterns (use 'dislop check' for PDF and image files)`);
      process.exit(2);
    }
    const buf = fs.readFileSync(abs);
    try {
      if (modality === "pptx" || modality === "docx") {
        ooxml = readZipXmlEntries(buf);
      } else {
        text = decodeUtf8Strict(buf);
      }
    } catch (err) {
      console.error(`dislop: uninspectable ${modality.toUpperCase()} file '${positional[0]}': ${err.message}`);
      process.exit(2);
    }
  }

  const profile = analyzePatternProfile(text, { filename, modality, banks, angles, ooxml });
  if (format === "json") {
    console.log(JSON.stringify(profile, null, 2));
    return;
  }
  if (profile.findingCount === 0) {
    console.log(`dislop patterns: ok (${filename}, 0 pattern findings)`);
    return;
  }
  console.log(`dislop patterns: ${profile.findingCount} finding(s) in ${filename} (dimensions: ${profile.activeDimensions.join(", ")})`);
  for (const f of profile.findings) {
    const msg = f.message?.[lang] || f.message?.en || "";
    console.log(`  [${f.severity.toUpperCase()}] ${f.file}:${f.location}  ${f.ruleId}  (${f.detectionAngle}${f.metric ? ` · ${f.metric}` : ""})`);
    console.log(`    match: "${f.match}"`);
    console.log(`    why:   ${msg}`);
  }
}

function runVoice(args) {
  const { flags, positional } = parseFlags(args, "voice");
  if (flags.help) {
    printSubcommandHelp("voice");
    return;
  }
  const format = flags.json ? "json" : flags.format || "text";
  assertTextOrJsonFormat(format);
  const lang = flags.lang || "auto";
  const samples = [];

  if (positional.length === 0 || positional[0] === "-") {
    const raw = fs.readFileSync(0, "utf8");
    samples.push(...raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean));
  } else {
    for (const p of positional) {
      const abs = path.resolve(process.cwd(), p);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        console.error(`dislop: file not found: ${p}`);
        process.exit(2);
      }
      samples.push(decodeUtf8Strict(fs.readFileSync(abs)));
    }
  }
  if (samples.length === 0) {
    console.error("dislop voice: provide at least one non-empty sample file or stdin text");
    process.exit(2);
  }

  const result = extractVoiceProfileOffline(samples, { lang });
  if (flags.output) {
    const outAbs = path.resolve(process.cwd(), String(flags.output));
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, JSON.stringify(result, null, 2) + "\n", "utf8");
  }
  if (flags.json || flags.format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const s = result.stylometrics;
  console.log(`dislop voice (${result.mode}, 0 network calls)`);
  console.log(`  samples=${s.sampleCount} · sentences=${s.sentenceCount} · mean=${s.meanLength} · cv=${s.lengthCV} · band=[${s.targetLengthBand.join(", ")}]`);
  console.log(`  tone: ${result.profile.tone}`);
  for (const h of result.profile.sentenceHabits) {
    console.log(`  - ${h}`);
  }
}

async function promptInteractiveTier(defaultTier, lang) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const q =
    lang === "zh"
      ? `\n请选择要选装的本地模型档位 [none / fast / balanced / quality]（回车默认 ${defaultTier}）：`
      : `\nChoose optional local model tier [none / fast / balanced / quality] (Enter for '${defaultTier}'): `;
  return new Promise((resolve) => {
    rl.question(q, (ans) => {
      rl.close();
      const val = String(ans || "").trim().toLowerCase();
      resolve(val || defaultTier);
    });
  });
}

async function runLocalDeslopCli(target, flags, packs) {
  const lang = flags.lang || "en";
  let rawText = "";
  let filename = flags["stdin-filename"] || "draft.md";
  if (!target || target === "-") {
    rawText = fs.readFileSync(0, "utf8");
  } else {
    const abs = path.resolve(process.cwd(), target);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      console.error(`dislop: file not found: ${target}`);
      process.exit(2);
    }
    filename = path.basename(abs);
    rawText = decodeUtf8Strict(fs.readFileSync(abs));
  }
  const modality = detectModality(filename) || "markdown";
  const config = loadConfig(process.cwd(), flags.config || null);
  let flagRegister = null;
  if (flags.register !== undefined) {
    const norm = String(flags.register).trim().toLowerCase();
    if (!norm || (norm !== "auto" && !VALID_REGISTERS.includes(norm))) {
      console.error(`dislop: invalid --register '${flags.register}' (expected auto, ${VALID_REGISTERS.join(", ")})`);
      process.exit(2);
    }
    flagRegister = norm;
  }
  const fileCfg = resolveConfigForFile(filename, config);
  const regInfo = resolveRegister(rawText, { filename, flagRegister, config: fileCfg });
  const explicitPack =
    flags.pack === "auto"
      ? predictPackWithPocketRouter(rawText).recommendedPack
      : flags.pack || null;
  const packId = pickPackForFile(filename, modality, explicitPack, config);
  const pack = resolveEffectivePack(packId, packs, config);

  let res;
  try {
    res = await runLocalDeslop({
      text: rawText,
      pack,
      modality,
      register: regInfo.register,
      endpoint: flags.endpoint || null,
      model: flags.model || null,
      allowLan: Boolean(flags["allow-lan"]),
    });
  } catch (err) {
    console.error(`dislop: ${err.message}`);
    process.exit(2);
  }

  if (!res.ok) {
    if (flags.json || flags.format === "json") {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.error(`dislop: ${res.error}`);
    }
    process.exit(2);
  }

  if (flags.output) {
    const outAbs = path.resolve(process.cwd(), String(flags.output));
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, res.text, "utf8");
  }

  if (flags.json || flags.format === "json") {
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (!flags.output) {
    process.stdout.write(res.text.endsWith("\n") ? res.text : res.text + "\n");
  } else if (lang === "zh") {
    console.log(
      `dislop 本地改写完成（${res.model}）：改写 ${res.rewrittenParagraphs} 段，保留原段 ${res.keptOriginalParagraphs} 段，事实核验 ${res.factLedgerOk ? "通过" : "未通过"} -> ${flags.output}`
    );
  } else {
    console.log(
      `dislop local deslop (${res.model}): rewrote ${res.rewrittenParagraphs} paragraph(s), kept ${res.keptOriginalParagraphs} untouched, fact ledger ${res.factLedgerOk ? "ok" : "drifted"} -> ${flags.output}`
    );
  }
}

async function runModel(args, packs, cmdAlias = "model") {
  const { flags, positional } = parseFlags(args, cmdAlias);
  if (flags.help) {
    printSubcommandHelp(cmdAlias);
    return;
  }
  const action = positional[0] || "status";
  const validActions = new Set(["status", "recommend", "score", "install", "setup", "import", "remove", "rm", "deslop"]);
  if (!validActions.has(action)) {
    console.error(
      `dislop model: unknown action '${action}' (expected status, recommend, score, install, setup, import, remove, or deslop)`
    );
    process.exit(2);
  }
  const restPos = positional.slice(1);
  const lang = flags.lang || "en";
  const asJson = Boolean(flags.json || flags.format === "json");

  if (action === "score") {
    const target = restPos[0] || "-";
    let threshold = null;
    if (flags.threshold !== undefined) {
      threshold = Number(flags.threshold);
      if (typeof flags.threshold === "boolean" || String(flags.threshold).trim() === "" || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
        console.error(`dislop model score: invalid --threshold '${flags.threshold}' (expected a number between 0 and 1)`);
        process.exit(2);
      }
    }
    let rawText = "";
    let label = flags["stdin-filename"] || "stdin.md";
    if (target === "-") {
      rawText = fs.readFileSync(0, "utf8");
    } else {
      const abs = path.resolve(process.cwd(), target);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        console.error(`dislop model score: file not found: ${target}`);
        process.exit(2);
      }
      label = target;
      rawText = decodeUtf8Strict(fs.readFileSync(abs));
    }
    const result = analyzeDocumentWithPocketModels(rawText, { threshold });
    if (asJson) {
      console.log(JSON.stringify({ file: label, ...result }, null, 2));
      return;
    }
    const pct = Math.round(result.documentProbability * 100);
    if (lang === "zh") {
      console.log(`dislop 内置传统模型评分（pocket-slop-v1 · 0 联网）：${label}`);
      console.log(
        `  文档最高温吞水概率 : ${pct}%（阈值 ${Math.round(result.threshold * 100)}% · 命中段落 ${result.flaggedCount}/${result.paragraphs.length}）`
      );
      console.log(
        `  自动判别场景包     : ${result.packRouter.recommendedPack}（置信度 ${Math.round(result.packRouter.confidence * 100)}%）`
      );
      for (const p of result.paragraphs) {
        const mark = p.flagged ? "[提醒]" : "[正常]";
        const drv = p.topDrivers.map((d) => d.reason.zh).join("、");
        console.log(`  ${mark} 第 ${p.startLine}-${p.endLine} 行 (${Math.round(p.slopProbability * 100)}%)${drv ? `：${drv}` : ""}`);
      }
    } else {
      console.log(`dislop bundled Pocket ML score (pocket-slop-v1 · 0 network calls): ${label}`);
      console.log(
        `  Max paragraph slop : ${pct}% (threshold ${Math.round(result.threshold * 100)}% · flagged ${result.flaggedCount}/${result.paragraphs.length})`
      );
      console.log(
        `  Recommended pack   : ${result.packRouter.recommendedPack} (confidence ${Math.round(result.packRouter.confidence * 100)}%)`
      );
      for (const p of result.paragraphs) {
        const mark = p.flagged ? "[FLAG]" : "[OK]  ";
        const drv = p.topDrivers.map((d) => d.reason.en).join("; ");
        console.log(`  ${mark} lines ${p.startLine}-${p.endLine} (${Math.round(p.slopProbability * 100)}%)${drv ? ` — ${drv}` : ""}`);
      }
    }
    return;
  }

  if ( action === "install" || action === "setup" ) {
    let rulesCount = 0;
    for (const p of Object.values(packs)) rulesCount += (p.rules || []).length;
    const status = await buildModelStatusReport({
      packsCount: Object.keys(packs).length,
      rulesCount,
      probeLoopback: false,
      cacheDir: flags["cache-dir"] || null,
    });
    let chosenTier = flags.tier || null;
    if (!chosenTier) {
      if (action === "setup" && process.stdin.isTTY && !flags.yes && !asJson && !flags["dry-run"]) {
        if (lang === "zh") {
          console.log(`dislop 模型选装向导（内置 15 KB 传统集成模型已就绪）`);
          console.log(`  硬件检测：${status.hardware.platform}/${status.hardware.arch} · ${status.hardware.totalMemoryGb} GB 内存 · 推荐档位 ${status.recommendation.tier}`);
          for (const t of Object.values(LOCAL_MODEL_TIERS)) {
            console.log(`  - ${t.tier.padEnd(9)} (${String(t.approxDownloadMb).padStart(4)} MB): ${t.summary.zh}`);
          }
        } else {
          console.log(`dislop optional model setup (bundled 15 KB Pocket ML is already active)`);
          console.log(`  Hardware: ${status.hardware.platform}/${status.hardware.arch} · ${status.hardware.totalMemoryGb} GB RAM · recommended '${status.recommendation.tier}'`);
          for (const t of Object.values(LOCAL_MODEL_TIERS)) {
            console.log(`  - ${t.tier.padEnd(9)} (${String(t.approxDownloadMb).padStart(4)} MB): ${t.summary.en}`);
          }
        }
        chosenTier = await promptInteractiveTier(status.recommendation.tier, lang);
      } else {
        chosenTier = restPos[0] || "auto";
      }
    }

    const res = installOptionalModel({
      tier: chosenTier,
      provider: flags.provider || "ollama",
      force: Boolean(flags.force),
      dryRun: Boolean(flags["dry-run"]),
      cacheDir: flags["cache-dir"] || null,
    });

    if (asJson) {
      console.log(JSON.stringify(res, null, 2));
      if (!res.ok) process.exit(res.blockedByHardware ? 1 : 2);
      return;
    }

    if (!res.ok) {
      const msg = res.warning?.[lang] || res.message?.[lang] || res.warning?.en || res.message?.en || res.error;
      console.error(`dislop model install: ${msg}`);
      process.exit(res.blockedByHardware ? 1 : 2);
    }
    if (res.dryRun) {
      console.log(
        lang === "zh"
          ? `dislop 选装预检通过：档位 ${res.tier} (${res.modelId || res.provider}, 约 ${res.approxDownloadMb || 0} MB) -> ${res.command || res.modelCacheDir}`
          : `dislop install dry-run passed: tier '${res.tier}' (${res.modelId || res.provider}, ~${res.approxDownloadMb || 0} MB) -> ${res.command || res.modelCacheDir}`
      );
      return;
    }
    const doneMsg = res.message?.[lang] || res.message?.en || `Installed tier '${res.tier}' (${res.modelId}).`;
    console.log(doneMsg);
    return;
  }

  if (action === "import") {
    const fileArg = restPos[0];
    if (!fileArg) {
      console.error("Usage: dislop model import <file.gguf|file.onnx> [--tier <tier>] [--sha256 <hex>] [--no-copy] [--json]");
      process.exit(2);
    }
    const res = importLocalModelFile({
      filePath: fileArg,
      tier: flags.tier || "custom",
      expectedSha256: flags.sha256 || null,
      copyFile: !flags["no-copy"],
      cacheDir: flags["cache-dir"] || null,
    });
    if (asJson) {
      console.log(JSON.stringify(res, null, 2));
      if (!res.ok) process.exit(2);
      return;
    }
    if (!res.ok) {
      console.error(`dislop model import: ${res.error}`);
      process.exit(2);
    }
    console.log(`Imported ${res.imported.id} (tier=${res.imported.tier}, sha256=${res.imported.sha256.slice(0, 12)}…) -> ${res.imported.path}`);
    return;
  }

  if (action === "remove" || action === "rm") {
    const target = restPos[0] || flags.tier;
    const res = removeInstalledModel({ target, cacheDir: flags["cache-dir"] || null });
    if (asJson) {
      console.log(JSON.stringify(res, null, 2));
      if (!res.ok) process.exit(1);
      return;
    }
    if (!res.ok) {
      console.error(`dislop model remove: ${res.error || `no cached model matched '${target}'`}`);
      process.exit(1);
    }
    console.log(`Removed ${res.removedCount} cached model entry(s).`);
    return;
  }

  if (action === "deslop") {
    await runLocalDeslopCli(restPos[0] || "-", flags, packs);
    return;
  }

  let rulesCount = 0;
  for (const p of Object.values(packs)) rulesCount += (p.rules || []).length;
  const report = await buildModelStatusReport({
    packsCount: Object.keys(packs).length,
    rulesCount,
    probeLoopback: !flags["no-loopback"],
    cacheDir: flags["cache-dir"] || null,
  });

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const hw = report.hardware;
  const rec = report.recommendation;
  const bm = report.bundledModels?.[0];
  if (lang === "zh") {
    console.log(`dislop 本地引擎、随包传统模型与选装小模型状态（检查全程 0 联网）`);
    console.log(`  内置确定性引擎 : 已就绪（${report.builtinDeterministic.bundledPacks} 套规则包 / ${report.builtinDeterministic.bundledRules} 条规则全量内置）`);
    if (bm) {
      console.log(`  随包传统模型   : 已内置 ${bm.id}（约 ${bm.approxGzipKb} KB gz · 含隐蔽水文集成评分与场景自动路由）`);
    }
    console.log(`  当前机器硬件   : ${hw.platform}/${hw.arch} · ${hw.totalMemoryGb} GB 内存${hw.freeDiskGb !== null ? ` · 剩余磁盘 ${hw.freeDiskGb} GB` : ""}`);
    console.log(`  可选生成小模型 : ${rec.tier}${rec.modelId ? ` (${rec.modelId}, 约 ${rec.approxDownloadMb} MB)` : "（无需额外下载）"}`);
    console.log(`  说明           : ${rec.reason.zh}`);
    if (rec.installHint) console.log(`  按需选装命令   : ${rec.installHint}`);
    if (report.installedModels.length > 0) {
      console.log(`  已装本地权重   : ${report.installedModels.map((m) => `${m.id}[${m.tier}]`).join(", ")}`);
    }
    if (report.localRunners.length > 0) {
      for (const r of report.localRunners) {
        console.log(`  已发现本地服务 : ${r.kind} (${r.endpoint}) -> ${r.models.join(", ") || "无已装模型"}`);
      }
    }
  } else {
    console.log(`dislop local engine, bundled ML & optional model status (0 external network calls)`);
    console.log(`  Built-in engine : ready (${report.builtinDeterministic.bundledPacks} packs / ${report.builtinDeterministic.bundledRules} rules bundled offline)`);
    if (bm) {
      console.log(`  Bundled ML      : ready (${bm.id}, ~${bm.approxGzipKb} KB gz · paragraph slop ensemble + domain router)`);
    }
    console.log(`  Hardware        : ${hw.platform}/${hw.arch} · ${hw.totalMemoryGb} GB RAM${hw.freeDiskGb !== null ? ` · ${hw.freeDiskGb} GB free disk` : ""}`);
    console.log(`  Recommended SLM : ${rec.tier}${rec.modelId ? ` (${rec.modelId}, ~${rec.approxDownloadMb} MB)` : " (no extra download needed)"}`);
    console.log(`  Reason          : ${rec.reason.en}`);
    if (rec.installHint) console.log(`  Optional install: ${rec.installHint}`);
    if (report.installedModels.length > 0) {
      console.log(`  Cached weights  : ${report.installedModels.map((m) => `${m.id}[${m.tier}]`).join(", ")}`);
    }
    if (report.localRunners.length > 0) {
      for (const r of report.localRunners) {
        console.log(`  Active loopback : ${r.kind} (${r.endpoint}) -> ${r.models.join(", ") || "no models loaded"}`);
      }
    }
  }
}

function readGitBaselineForFile(absFile, gitRef = "HEAD") {
  const fileDir = path.dirname(absFile);
  const topLevel = execFileSync("git", ["-c", "core.quotepath=off", "rev-parse", "--show-toplevel"], {
    cwd: fileDir,
    encoding: "utf8",
  }).trim();
  const realFile = fs.realpathSync(absFile);
  const realTop = fs.realpathSync(topLevel);
  const relPosix = path.relative(realTop, realFile).split(path.sep).join("/");
  return execFileSync("git", ["-c", "core.quotepath=off", "show", `${gitRef}:${relPosix}`], {
    cwd: realTop,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function runVerify(args, packs) {
  const { flags, positional } = parseFlags(args, "verify");
  if (flags.help) {
    printSubcommandHelp("verify");
    return;
  }
  const cwd = process.cwd();
  const format = flags.json ? "json" : flags.format || "text";
  assertTextOrJsonFormat(format);
  const lang = flags.lang || "en";
  if (!["en", "zh"].includes(lang)) {
    console.error(`dislop: invalid --lang '${lang}' (expected en or zh)`);
    process.exit(2);
  }
  const allowAdded = Boolean(flags["allow-added"]);
  const strict = Boolean(flags.strict);
  let flagRegister = null;
  if (flags.register !== undefined) {
    const norm = String(flags.register).trim().toLowerCase();
    if (!norm || (norm !== "auto" && !VALID_REGISTERS.includes(norm))) {
      console.error(`dislop: invalid --register '${flags.register}' (expected auto, ${VALID_REGISTERS.join(", ")})`);
      process.exit(2);
    }
    flagRegister = norm;
  }
  const keepRaw = typeof flags.keep === "string" ? flags.keep : "";
  const keepTerms = keepRaw ? keepRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const config = loadConfigOrExit(cwd, flags.config || null);

  let beforeText;
  let afterText;
  let label;
  if (flags.git !== undefined) {
    let gitRef = "HEAD";
    let targetPath;
    if (flags.git === true) {
      targetPath = positional[0];
    } else if (positional.length === 0) {
      targetPath = String(flags.git);
    } else {
      gitRef = String(flags.git);
      targetPath = positional[0];
    }
    if (!targetPath) {
      console.error("Usage: dislop verify --git [ref] <file> [--keep a,b] [--pack <id|auto>] [--strict] [--json]");
      process.exit(2);
    }
    const absTarget = path.resolve(cwd, targetPath);
    if (!fs.existsSync(absTarget) || !fs.statSync(absTarget).isFile()) {
      console.error(`dislop: file not found: ${targetPath}`);
      process.exit(2);
    }
    label = targetPath;
    afterText = decodeUtf8Strict(fs.readFileSync(absTarget));
    try {
      beforeText = readGitBaselineForFile(absTarget, gitRef);
    } catch (err) {
      console.error(`dislop verify: failed to read '${gitRef}' baseline for '${targetPath}': ${err.message}`);
      process.exit(2);
    }
  } else {
    if (positional.length < 2) {
      console.error("Usage: dislop verify <before-file> <after-file> [--keep a,b] [--pack <id|auto>] [--strict] [--json]");
      process.exit(2);
    }
    const beforeAbs = path.resolve(cwd, positional[0]);
    const afterAbs = path.resolve(cwd, positional[1]);
    for (const [p, rawArg] of [[beforeAbs, positional[0]], [afterAbs, positional[1]]]) {
      if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
        console.error(`dislop: file not found: ${rawArg}`);
        process.exit(2);
      }
    }
    label = positional[1];
    beforeText = decodeUtf8Strict(fs.readFileSync(beforeAbs));
    afterText = decodeUtf8Strict(fs.readFileSync(afterAbs));
  }

  const mod = detectModality(label) || "markdown";
  const fileCfg = resolveConfigForFile(label, config);
  let resolvedPack;
  try {
    resolvedPack = resolveTextPackAndSource(afterText, label, mod, flags.pack || "auto", fileCfg, packs);
  } catch (err) {
    console.error(`dislop: ${err.message}`);
    process.exit(2);
  }
  const result = verifyRevisionBundle(beforeText, afterText, {
    filename: label,
    modality: mod,
    pack: resolvedPack.pack,
    config: fileCfg,
    register: flagRegister,
    keepTerms,
    allowAdded,
    strict,
  });
  result.effectivePack = resolvedPack.effectivePack;
  result.packSource = resolvedPack.packSource;

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const fl = result.factLedger;
    const lc = result.lengthCheck;
    const ad = result.antiDegradation;
    if (lang === "zh") {
      console.log(`dislop verify (${label}): ${result.ok ? "通过 (PASSED)" : "未通过 (FAILED)"}`);
      console.log(`  事实账本  : ${fl.status}（保留 ${fl.retainedCount}/${fl.totalProtected}，丢失 ${fl.missing.length}，限定词降级 ${fl.qualifierDropped.length}）`);
      if (result.keepTerms.requested.length > 0) {
        console.log(`  关键词保留: 保留 ${result.keepTerms.kept.length}/${result.keepTerms.requested.length}${result.keepTerms.missing.length ? `（缺失：${result.keepTerms.missing.join(", ")}）` : ""}`);
      }
      if (result.findingsDelta) {
        console.log(`  AI味变化  : ${result.findingsDelta.beforeCount} -> ${result.findingsDelta.afterCount}（消解 ${result.findingsDelta.resolvedCount}，新引入 ${result.findingsDelta.introduced.length}）`);
      }
      console.log(`  篇幅比例  : ${lc.beforeChars} -> ${lc.afterChars} 字（${lc.ratio}x · ${lc.status}）`);
      console.log(`  反退化校验: ${ad.status}`);
      for (const w of ad.warnings) {
        console.log(`    - [${w.severity.toUpperCase()}] ${w.code}: ${w.message.zh}`);
      }
    } else {
      console.log(`dislop verify (${label}): ${result.status.toUpperCase()}`);
      console.log(`  Fact ledger   : ${fl.status} (${fl.retainedCount}/${fl.totalProtected} retained, ${fl.missing.length} missing, ${fl.qualifierDropped.length} qualifier dropped)`);
      if (result.keepTerms.requested.length > 0) {
        console.log(`  Keep terms    : ${result.keepTerms.kept.length}/${result.keepTerms.requested.length} kept${result.keepTerms.missing.length ? ` (missing: ${result.keepTerms.missing.join(", ")})` : ""}`);
      }
      if (result.findingsDelta) {
        console.log(`  Findings delta: ${result.findingsDelta.beforeCount} -> ${result.findingsDelta.afterCount} (${result.findingsDelta.resolvedCount} resolved, ${result.findingsDelta.introduced.length} introduced)`);
      }
      console.log(`  Length ratio  : ${lc.beforeChars} -> ${lc.afterChars} chars (${lc.ratio}x · ${lc.status})`);
      console.log(`  Anti-degrade  : ${ad.status}`);
      for (const w of ad.warnings) {
        console.log(`    - [${w.severity.toUpperCase()}] ${w.code}: ${w.message.en}`);
      }
    }
  }
  process.exitCode = result.ok ? 0 : 1;
}

const REVIEW_RESLOP_ZH_RE = /(?:全闭环|闭环|严禁|杜绝|赋能|抓手|家人们|绝绝子|其实吧|咱就是说|不是[^。\n]{1,30}而是)/g;
const REVIEW_RESLOP_EN_RE = /\b(?:not\s+just\b[^.\n]{1,35}\bbut\b|game[- ]changing|seamless|delve\s+into|tapestry|let\s+that\s+sink\s+in)\b/gi;
const VALID_TIC_LAYERS = new Set(["lexical", "syntactic", "rhythm", "cognitive-framing", "rhetorical-stance", "visual", "artifact"]);

function loadAiTicRubric(customPatternsDir = PATTERNS_DIR) {
  const p = path.join(customPatternsDir, "ai-tic-rubric.json");
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  } catch {}
  return { layers: [], antiDegradationPrinciples: { en: [], zh: [] } };
}

function mapFindingToTicLayer(finding) {
  const rid = String(finding?.ruleId || "");
  const dim = String(finding?.dimension || "");
  const fam = String(finding?.family || "");
  if (rid.startsWith("core/") || fam.startsWith("hygiene/") || fam.startsWith("office/") || dim === "artifacts") return "artifact";
  if (rid.startsWith("ui-") || rid.startsWith("pptx-") || fam.startsWith("deck/") || fam.startsWith("ui/") || dim === "visual-and-deck") return "visual";
  if (
    dim === "rhythm" ||
    fam.startsWith("rhythm/") ||
    fam.startsWith("punctuation/") ||
    ["low-burstiness-vapor", "comma-chain-runon", "opener-anaphora-monotony", "inline-bold-saturation", "paragraph-length-uniformity", "semicolon-tricolon", "em-dash-cluster", "en-dash-overuse", "bold-lead-list-wall"].includes(rid)
  ) {
    return "rhythm";
  }
  if (
    dim === "syntactic" ||
    fam.startsWith("frame/") ||
    ["negation-pivot", "staccato-slogan-run", "zh-four-char-triad", "concession-symmetry-frame", "rhetorical-qa-cadence", "pull-quote-closer", "template-skeleton-echo"].includes(rid)
  ) {
    return "syntactic";
  }
  if (
    ["macro-trend-opener", "moralizing-ending", "narrative-sandwich", "unsourced-attribution", "unsubstantiated-superlative", "composite-multi-signal"].includes(rid) ||
    fam.startsWith("evidence/")
  ) {
    return "cognitive-framing";
  }
  if (["throat-clearing-opener", "sycophancy-residue", "hedge-cluster", "discourse-marker-cluster"].includes(rid) || dim === "discourse") {
    return "rhetorical-stance";
  }
  return "lexical";
}

function buildCrossCheckSummary({ ruleFindings, patternFindings, profile, mlFindings, mergedFindings, modality }) {
  const signalsPresent = [];
  if (ruleFindings.length > 0) signalsPresent.push("rules");
  if (patternFindings.length > 0) signalsPresent.push("patterns");
  if (profile && ((profile.telemetryRisk?.score || 0) >= 15 || profile.structure?.lowBurstinessVapor)) {
    signalsPresent.push("profile");
  }
  if (mlFindings.length > 0) signalsPresent.push("pocket-ml");

  const layerCounts = {};
  for (const f of mergedFindings) {
    const layer = mapFindingToTicLayer(f);
    layerCounts[layer] = (layerCounts[layer] || 0) + 1;
  }

  const proseMods = new Set(["markdown", "text", "html", "svg"]);
  const hasSubtleProse = Boolean(proseMods.has(modality) && profile && (profile.sentenceCount || 0) >= 3);
  const suspectedSubtleLayers = hasSubtleProse && (signalsPresent.length > 0 || ruleFindings.length === 0)
    ? ["cognitive-framing", "rhetorical-stance"]
    : [];
  const llmRecommended = Boolean(
    hasSubtleProse && ((profile.telemetryRisk?.score || 0) >= 15 || mlFindings.length > 0 || ruleFindings.length === 0)
  );

  return {
    signalsPresent,
    multiSignalConfirmed: signalsPresent.length >= 2,
    layerCounts,
    suspectedSubtleLayers,
    llmRecommended,
  };
}

function findingsToReviewIssues(findings, lang = "en") {
  return findings.map((f) => {
    const strategy = f.fixStrategy || deriveFixStrategy({ id: f.ruleId, family: f.family });
    const action = strategy === "delete" ? "edit" : strategy === "need-source" ? "ask" : "rewrite";
    const why = (f.message?.[lang] || f.message?.en || f.ruleId || "").trim();
    const guidance = (f.deletionTest?.[lang] || f.deletionTest?.en || why).trim();
    return {
      source: f.source || "rule",
      ruleId: f.ruleId,
      ticLayer: mapFindingToTicLayer(f),
      severity: f.severity,
      fixStrategy: strategy,
      action,
      line: f.line || 1,
      col: f.col || 1,
      quote: f.match || "",
      why,
      ...(action === "edit"
        ? { replacement: "" }
        : action === "ask"
          ? { question: guidance }
          : { instruction: guidance }),
    };
  });
}

function groundByokLlmIssues(rawIssues, sourceText, lineStarts) {
  if (!Array.isArray(rawIssues)) return [];
  const src = String(sourceText || "");
  const out = [];
  for (const iss of rawIssues) {
    if (!iss || typeof iss !== "object") continue;
    const q = String(iss.quote || "").trim();
    if (!q) continue;
    const idx = src.indexOf(q);
    if (idx === -1) continue;
    let action = ["edit", "replace", "delete", "rewrite", "ask"].includes(iss.action) ? iss.action : "rewrite";
    if (action === "replace" || action === "delete") action = "edit";
    const rep = action === "edit" ? String(iss.replacement ?? "") : "";
    if (action === "edit" || iss.replacement) {
      let introducedSlop = false;
      const qLower = q.toLowerCase();
      for (const m of String(iss.replacement || "").matchAll(REVIEW_RESLOP_ZH_RE)) {
        if (!q.includes(m[0])) {
          introducedSlop = true;
          break;
        }
      }
      if (!introducedSlop) {
        for (const m of String(iss.replacement || "").matchAll(REVIEW_RESLOP_EN_RE)) {
          if (!qLower.includes(m[0].toLowerCase())) {
            introducedSlop = true;
            break;
          }
        }
      }
      if (introducedSlop) continue;
    }
    let finalInstruction = String(iss.instruction || iss.why || "").trim();
    if (action === "edit") {
      const vr = verifyRevision(q, rep);
      if (vr.status !== "preserved") {
        action = "rewrite";
        if (!finalInstruction) finalInstruction = String(iss.why || "Keep all numbers and qualifiers intact while removing filler.");
      }
    }
    const lc = lineStarts ? (() => {
      let lo = 0; let hi = lineStarts.length - 1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (lineStarts[mid] <= idx) lo = mid + 1; else hi = mid - 1; }
      const li = Math.max(0, hi);
      return { line: li + 1, col: idx - lineStarts[li] + 1 };
    })() : { line: 1, col: 1 };
    out.push({
      source: "byok-llm",
      ruleId: null,
      ...(VALID_TIC_LAYERS.has(iss.ticLayer) ? { ticLayer: iss.ticLayer } : {}),
      severity: ["error", "warning", "info"].includes(iss.severity) ? iss.severity : "warning",
      fixStrategy: action === "edit" ? (rep === "" ? "delete" : "rephrase") : action === "ask" ? "need-source" : "rephrase",
      action,
      line: lc.line,
      col: lc.col,
      quote: q,
      why: String(iss.why || "").trim(),
      ...(action === "edit"
        ? { replacement: rep }
        : action === "ask"
          ? { question: String(iss.question || finalInstruction).trim() }
          : { instruction: finalInstruction }),
    });
    if (out.length >= 16) break;
  }
  return out;
}

function buildRubricPromptDigest(rubric, lang = "en") {
  const isZh = lang === "zh";
  const layers = Array.isArray(rubric?.layers) ? rubric.layers : [];
  if (layers.length === 0) return "";
  return layers
    .map((layer) => {
      const name = layer.name?.[isZh ? "zh" : "en"] || layer.id;
      const prompt = layer.llmCheckPrompt?.[isZh ? "zh" : "en"] || "";
      const guards = (layer.falsePositiveGuards?.[isZh ? "zh" : "en"] || []).slice(0, 1).join("; ");
      return `- [${layer.id}] ${name}: ${prompt}${guards ? ` (Guard: ${guards})` : ""}`;
    })
    .join("\n");
}

async function runRubricReview(flags, positional, packs) {
  const cwd = process.cwd();
  const format = flags.json ? "json" : flags.format || "text";
  assertTextOrJsonFormat(format);
  const lang = flags.lang || "en";
  const config = loadConfigOrExit(cwd, flags.config || null);
  const voiceInfo = discoverVoiceCard(cwd);
  const rubric = loadAiTicRubric();
  const target = positional[0] || "-";

  let text;
  let label;
  if (target === "-") {
    text = readStdinTextChecked("review");
    label = detectStdinFilename(text, flags["stdin-filename"]);
  } else {
    const abs = path.resolve(cwd, target);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      console.error(`dislop: file not found: ${target}`);
      process.exit(2);
    }
    label = target;
    text = decodeUtf8Strict(fs.readFileSync(abs));
  }

  const mod = detectModality(label) || "markdown";
  const fileCfg = resolveConfigForFile(label, config);
  let flagRegister = null;
  if (flags.register !== undefined) {
    const norm = String(flags.register).trim().toLowerCase();
    if (!norm || (norm !== "auto" && !VALID_REGISTERS.includes(norm))) {
      console.error(`dislop: invalid --register '${flags.register}' (expected auto, ${VALID_REGISTERS.join(", ")})`);
      process.exit(2);
    }
    flagRegister = norm;
  }
  const regInfo = resolveRegister(text, { filename: label, flagRegister, config: fileCfg });
  const packRes = resolveTextPackAndSource(text, label, mod, flags.pack || "auto", fileCfg, packs);
  const strategy = getScenarioStrategy({ packId: packRes.effectivePack, register: regInfo.register });
  const auditRes = auditText(text, { filename: label, modality: mod, pack: packRes.pack, config: fileCfg, register: regInfo.register });
  const ruleFindings = auditRes.findings;
  const patRes = auditPatterns(text, { filename: label, modality: mod, banks: loadPatternBanks(), config: fileCfg });
  const patternFindings = patRes.findings;
  let findings = mergePatternBankFindings(ruleFindings, patternFindings);
  const profile = PROSE_ML_MODALITIES.has(mod) ? analyzeTextProfile(text, { modality: mod, config: fileCfg }) : null;
  let mlFindings = [];
  if (PROSE_ML_MODALITIES.has(mod)) {
    const mlSrc = mod === "html" || mod === "svg" ? buildZones(text, mod, fileCfg).prose : text;
    mlFindings = buildPocketMlFindings(mlSrc, label, findings, null, { profile, modality: mod }).findings;
    findings = [...findings, ...mlFindings];
  }
  const crossCheck = buildCrossCheckSummary({
    ruleFindings,
    patternFindings,
    profile,
    mlFindings,
    mergedFindings: findings,
    modality: mod,
  });

  const detIssues = findingsToReviewIssues(findings, lang);
  let issues = [...detIssues];
  let mode = "offline-deterministic";
  let summary =
    issues.length === 0
      ? lang === "zh" ? "未发现确定性 AI 味或硬伤问题。" : "No deterministic AI-slop issues detected."
      : lang === "zh" ? `发现 ${issues.length} 处多信号审校建议（覆盖 ${crossCheck.signalsPresent.join("+") || "rules"}，改后可用 dislop verify 校验）。` : `Found ${issues.length} multi-signal review item(s) across ${crossCheck.signalsPresent.join("+") || "rules"}.`;

  const endpoint = flags.offline
    ? ""
    : String(flags.endpoint || process.env.DISLOP_REVIEW_ENDPOINT || process.env.OPENAI_BASE_URL || "").trim();
  const keyEnvName = flags["api-key-env"]
    ? String(flags["api-key-env"])
    : process.env.DISLOP_REVIEW_API_KEY
      ? "DISLOP_REVIEW_API_KEY"
      : process.env.OPENAI_API_KEY
        ? "OPENAI_API_KEY"
        : "";
  const apiKey = keyEnvName ? String(process.env[keyEnvName] || "") : "";

  if (!flags.offline && endpoint && apiKey) {
    let u;
    try {
      u = new URL(endpoint);
    } catch {
      console.error(`dislop review: invalid endpoint URL '${endpoint}'`);
      process.exit(2);
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      console.error(`dislop review: endpoint must use http or https scheme`);
      process.exit(2);
    }
    if (process.env.DISLOP_TEST_MODE === "1" && !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname)) {
      console.error("dislop review: live BYOK requests are blocked when DISLOP_TEST_MODE=1");
      process.exit(2);
    }
    const chatUrl = endpoint.endsWith("/chat/completions") ? endpoint : `${endpoint.replace(/\/+$/, "")}/chat/completions`;
    const modelId = String(flags.model || process.env.DISLOP_REVIEW_MODEL || "gpt-4o-mini");
    const stratTag = lang === "zh" ? "zh" : "en";
    const sysPrompt =
      lang === "zh"
        ? `你是 dislop 审校助手，请结合五层 AI 口癖准则与当前写作场景（${strategy.label.zh}）交叉核对确定性预检与统计信号。本场景清理重点：${strategy.cut.zh}；必须保留：${strategy.protect.zh}；严禁改偏：${strategy.avoid.zh}。只输出 JSON：{"summary":"...","issues":[{"quote":"原文原样片段","ticLayer":"lexical|syntactic|rhythm|cognitive-framing|rhetorical-stance|visual|artifact","action":"edit|rewrite|ask","severity":"error|warning|info","why":"原因","replacement":"仅edit填","instruction":"仅rewrite填","question":"仅ask填"}]}。硬规则：1) 保留作者原有视角、自然句长起伏、个性化表达与带事实锚点的行业术语，禁止改写成死板说教、廉价“装人味”口水词（家人们/其实吧/绝绝子）或删减干货；2) quote 必须一字不差从原文复制；3) 禁止引入全闭环/闭环/赋能/抓手/不是A而是B等新套词；4) 绝不改丢数字或范围限定词（预计/仅在/除非/待确认）。`
        : `You are dislop's multi-layer AI-tic reviewer tuned for ${strategy.label.en} (${strategy.id}). Cut: ${strategy.cut.en} Protect: ${strategy.protect.en} Avoid: ${strategy.avoid.en} Cross-check deterministic findings and telemetry against the 5-layer rubric. Output strict JSON only: {"summary":"...","issues":[{"quote":"exact verbatim substring","ticLayer":"lexical|syntactic|rhythm|cognitive-framing|rhetorical-stance|visual|artifact","action":"edit|rewrite|ask","severity":"error|warning|info","why":"reason","replacement":"for edit","instruction":"for rewrite","question":"for ask"}]}. Rules: 1) preserve author voice, perspective, rhythm contrast, vivid phrasing, grounded domain terms, and modality qualifiers; never suggest cheesy fake-human slang; 2) quote MUST match verbatim; 3) never introduce filler slogans; 4) keep every number and unit intact.`;
    const rubricDigest = buildRubricPromptDigest(rubric, lang);
    const userPrompt = [
      `Modality: ${mod} | Pack: ${packRes.effectivePack} | Register: ${regInfo.register} | Scenario: ${strategy.id}`,
      `Scenario Strategy (${strategy.label[stratTag]}): cut=[${strategy.cut[stratTag]}] protect=[${strategy.protect[stratTag]}] avoid=[${strategy.avoid[stratTag]}]`,
      ...(rubricDigest ? [`5-Layer AI-Tic Rubric:\n${rubricDigest}`] : []),
      `Local Cross-Check Signals: ${JSON.stringify(crossCheck)}`,
      ...(voiceInfo.found && voiceInfo.card?.profile ? [`Author style card (${voiceInfo.scope}): ${JSON.stringify(voiceInfo.card.profile)}`] : []),
      `Deterministic findings: ${JSON.stringify(detIssues.slice(0, 12).map((x) => ({ ruleId: x.ruleId, ticLayer: x.ticLayer, quote: x.quote, fixStrategy: x.fixStrategy })))}`,
      `Draft:\n${text}`,
    ].join("\n\n");
    try {
      const resp = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          temperature: 0.2,
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const rawContent = String(data?.choices?.[0]?.message?.content || "").trim();
      const jsonBody = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(jsonBody);
      const lineStarts = [0];
      for (let i = 0; i < text.length; i += 1) {
        if (text[i] === "\n") lineStarts.push(i + 1);
      }
      const detQuotes = new Set(detIssues.map((d) => d.quote).filter(Boolean));
      const llmGrounded = groundByokLlmIssues(parsed?.issues, text, lineStarts).filter((i) => !detQuotes.has(i.quote));
      issues = [...detIssues, ...llmGrounded];
      mode = "byok-llm";
      if (typeof parsed?.summary === "string" && parsed.summary.trim()) {
        summary = parsed.summary.trim();
      }
    } catch (err) {
      console.error(`dislop review: endpoint call failed (${err.message})`);
      process.exit(2);
    }
  }

  const out = {
    schema: "dislop.review/1",
    mode,
    file: label,
    modality: mod,
    effectivePack: packRes.effectivePack,
    packSource: packRes.packSource,
    register: regInfo.register,
    scenarioStrategy: strategy.id,
    crossCheck,
    rubricLayers: (rubric.layers || []).map((l) => l.id),
    voiceCard: { found: voiceInfo.found, scope: voiceInfo.scope },
    ...(profile ? { profile } : {}),
    summary,
    issues,
  };

  if (format === "json") {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  const isZh = lang === "zh";
  const stratLabelsZh = { delete: "删掉", "need-source": "补出处", "unwrap-layout": "去套壳", rephrase: "改写" };
  const actLabelsZh = { edit: "修改", rewrite: "改写", ask: "核实" };
  const modeLabelZh = mode === "byok-llm" ? "本地+BYOK联合审校" : "四路离线核对";
  const vcNote = voiceInfo.found ? (isZh ? ` · 个人文风:${voiceInfo.scope}` : ` · voice:${voiceInfo.scope}`) : "";
  const layerStr = Object.entries(crossCheck.layerCounts)
    .map(([k, v]) => `${k}×${v}`)
    .join(", ") || (isZh ? "无明确命中" : "none");
  const sigStr = crossCheck.signalsPresent.join("+") || "rules";
  console.log(`dislop review (${label} · ${isZh ? modeLabelZh : mode} · ${packRes.effectivePack}${vcNote})`);
  console.log(isZh ? `  摘要    : ${summary}` : `  summary : ${summary}`);
  console.log(isZh ? `  信号分布: ${sigStr} | 层级: ${layerStr}` : `  signals : ${sigStr} | layers: ${layerStr}`);
  for (const iss of issues) {
    const tag = isZh ? stratLabelsZh[iss.fixStrategy] || iss.fixStrategy : iss.fixStrategy;
    const act = isZh ? actLabelsZh[iss.action] || iss.action : iss.action;
    const layerTag = iss.ticLayer ? ` · ${iss.ticLayer}` : "";
    console.log(`  [${String(iss.severity).toUpperCase()}] ${iss.line}:${iss.col} ${act} (${tag}${layerTag}) "${iss.quote}"`);
    console.log(isZh ? `    原因: ${iss.why}` : `    why: ${iss.why}`);
    if (iss.action === "edit") {
      console.log(isZh ? `    替换: ${JSON.stringify(iss.replacement)}` : `    rep: ${JSON.stringify(iss.replacement)}`);
    } else if (iss.action === "ask") {
      console.log(isZh ? `    追问: ${iss.question}` : `    ask: ${iss.question}`);
    } else if (iss.instruction && iss.instruction !== iss.why) {
      console.log(isZh ? `    改法: ${iss.instruction}` : `    how: ${iss.instruction}`);
    }
  }
  if (mode === "offline-deterministic" && crossCheck.llmRecommended) {
    console.log(
      isZh
        ? "  深查提示: 思维“端水”(cognitive-framing)与说教角度(rhetorical-stance)可配 --endpoint 或云端 dislop_review 联合复核。"
        : "  tip: Pass --endpoint (or use Cloud dislop_review) for LLM semantic cross-check on cognitive-framing and rhetorical-stance."
    );
  }
}

async function runProviderReview(flags, positional, packs) {
  if (positional.length > 1) {
    console.error("dislop review: inspect one file or '-' stdin per invocation.");
    process.exit(2);
  }
  const target = positional[0] || "-";
  const cwd = process.cwd();
  const config = loadConfigOrExit(cwd, flags.config || null);
  const lang = flags.lang || "en";
  if (!["en", "zh"].includes(lang)) {
    console.error(`dislop: invalid --lang '${lang}' (expected en or zh)`);
    process.exit(2);
  }
  const format = flags.json ? "json" : flags.format || "text";
  if (!["text", "json", "agent"].includes(format)) {
    console.error(`dislop review: invalid --format '${format}' (expected text, json, or agent)`);
    process.exit(2);
  }
  const failOn = flags["fail-on"] || "warning";
  if (!SEVERITY_RANK[failOn]) {
    console.error(`dislop review: invalid --fail-on '${failOn}' (expected error, warning, info, or never)`);
    process.exit(2);
  }
  let timeoutMs = 30000;
  if (flags.timeout !== undefined) {
    const rawT = String(flags.timeout).trim();
    if (!/^\d+$/.test(rawT)) {
      console.error("dislop review: --timeout must be an integer between 1000 and 120000 ms");
      process.exit(2);
    }
    timeoutMs = Number(rawT);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
      console.error("dislop review: --timeout must be between 1000 and 120000 ms");
      process.exit(2);
    }
  }
  let maxChunks = 20;
  if (flags["max-chunks"] !== undefined) {
    const rawC = String(flags["max-chunks"]).trim();
    if (!/^\d+$/.test(rawC)) {
      console.error("dislop review: --max-chunks must be an integer between 1 and 100");
      process.exit(2);
    }
    maxChunks = Number(rawC);
    if (!Number.isSafeInteger(maxChunks) || maxChunks < 1 || maxChunks > 100) {
      console.error("dislop review: --max-chunks must be between 1 and 100");
      process.exit(2);
    }
  }

  let rawText = "";
  let filename = "stdin.md";
  let modality = "markdown";
  if (target === "-") {
    rawText = readStdinTextChecked("review");
    filename = detectStdinFilename(rawText, flags["stdin-filename"]);
    modality = detectModality(filename) || "markdown";
    if (flags["stdin-filename"] && (modality === "docx" || modality === "pptx" || modality === "pdf")) {
      console.error(`dislop review: '--stdin-filename' cannot treat stdin as binary '${modality}'; pass the file path directly.`);
      process.exit(2);
    }
  } else {
    const absPath = path.resolve(cwd, target);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      console.error(`dislop review: file not found: ${target}`);
      process.exit(2);
    }
    const rel = path.relative(cwd, absPath);
    filename =
      rel && !rel.startsWith("..") && !path.isAbsolute(rel)
        ? rel.split(path.sep).join("/")
        : path.basename(absPath);
    modality = detectModality(absPath);
    if (!modality) {
      console.error(`dislop review: unsupported file type '${path.extname(absPath) || "(none)"}'`);
      process.exit(2);
    }
    const buf = fs.readFileSync(absPath);
    if (modality === "docx" || modality === "pptx") {
      try {
        const entries = readZipXmlEntries(buf);
        rawText = extractOoxmlReviewText(entries, modality, {
          includeNotes: Boolean(flags["include-notes"]),
          includeHidden: Boolean(flags["include-hidden"]),
        });
      } catch (err) {
        console.error(`dislop review: ${err.message}`);
        process.exit(2);
      }
    } else {
      try {
        rawText = decodeUtf8Strict(buf);
      } catch {
        console.error(`dislop review: '${target}' is not valid UTF-8 text`);
        process.exit(2);
      }
    }
  }
  filename = String(filename).replace(/[\r\n]+/g, " ").trim() || "draft.md";

  if (!rawText.trim()) {
    console.error("dislop review: extracted draft text is empty");
    process.exit(2);
  }

  const flagRegister = flags.register !== undefined ? String(flags.register).trim().toLowerCase() : null;
  let regInfo;
  try {
    regInfo = resolveRegister(rawText, {
      filename,
      flagRegister,
      config,
    });
  } catch (err) {
    console.error(`dislop review: ${err.message}`);
    process.exit(2);
  }

  const packFlag = flags.pack === "auto" && (modality === "markdown" || modality === "text")
    ? predictPackWithPocketRouter(rawText).recommendedPack
    : flags.pack === "auto"
      ? null
      : flags.pack || null;
  const packId = pickPackForFile(filename, modality, packFlag, config);
  if (!packs[packId]) {
    console.error(`dislop review: unknown pack '${packId}'`);
    process.exit(2);
  }

  let prov;
  const isDryRun = Boolean(flags["dry-run"]);
  const isPrintPrompt = Boolean(flags["print-prompt"]);
  try {
    prov = resolveProviderConfig({
      provider: flags.provider || process.env.DISLOP_REVIEW_PROVIDER || "openai",
      model: flags.model || null,
      baseUrl: flags["base-url"] || null,
      allowMissingKey: isDryRun || isPrintPrompt,
      env: process.env,
    });
  } catch (err) {
    console.error(`dislop review: ${err.message}`);
    process.exit(2);
  }

  let chunks;
  try {
    chunks = chunkTextByParagraphs(rawText, 10000, { maxChunks });
  } catch (err) {
    console.error(`dislop review: ${err.message}`);
    process.exit(2);
  }

  const firstPrompt = buildReviewPrompt({
    chunkText: chunks[0].text,
    filename,
    modality,
    packId,
    register: regInfo.register,
    lang,
  });
  const totalBytes = Buffer.byteLength(rawText, "utf8");
  const consentMode = prov.isLocal
    ? "local-loopback"
    : flags.yes
      ? "--yes"
      : process.env.DISLOP_ALLOW_REMOTE === "1"
        ? "DISLOP_ALLOW_REMOTE=1"
        : "required";

  if (isPrintPrompt) {
    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            schema: "dislop.review-prompt/1",
            provider: prov.provider,
            host: prov.host,
            model: prov.model,
            chunks: chunks.length,
            bytes: totalBytes,
            delimiter: firstPrompt.delimiter,
            systemPrompt: firstPrompt.systemPrompt,
            userPrompt: firstPrompt.userPrompt,
          },
          null,
          2
        )
      );
    } else {
      console.log(`=== SYSTEM PROMPT ===\n${firstPrompt.systemPrompt}\n\n=== USER PROMPT (chunk 1/${chunks.length}) ===\n${firstPrompt.userPrompt}`);
    }
    return;
  }

  if (isDryRun) {
    const dryPayload = {
      schema: "dislop.review-dry-run/1",
      provider: prov.provider,
      host: prov.host,
      endpointUrl: prov.safeUrl,
      model: prov.model,
      consent: consentMode,
      keyPresent: Boolean(prov.apiKey),
      keySource: prov.keySource,
      headers: {
        "content-type": "application/json",
        ...(prov.apiKey ? { authorization: "Bearer <REDACTED>" } : {}),
      },
      file: filename,
      modality,
      pack: packId,
      context: regInfo,
      chunks: chunks.length,
      bytes: totalBytes,
      requestBody: {
        model: prov.model,
        temperature: 0,
        messages: [
          { role: "system", content: firstPrompt.systemPrompt },
          { role: "user", content: firstPrompt.userPrompt },
        ],
      },
    };
    if (format === "json") {
      console.log(JSON.stringify(dryPayload, null, 2));
    } else if (lang === "zh") {
      console.log(`dislop review 演练（0 次网络请求）`);
      console.log(`  目标接口 : ${prov.safeUrl} (provider=${prov.provider}, model=${prov.model}, consent=${consentMode})`);
      console.log(`  鉴权来源 : ${prov.apiKey ? `环境变量 ${prov.keySource}（已脱敏）` : "未设置 / 本地免密钥"}`);
      console.log(`  待审文稿 : ${filename}（${totalBytes} 字节，${chunks.length} 段，语域=${regInfo.register}）`);
      console.log(`  分隔标记 : ${firstPrompt.delimiter}`);
    } else {
      console.log(`dislop review dry-run: 0 network calls made`);
      console.log(`  destination : ${prov.safeUrl} (provider=${prov.provider}, model=${prov.model}, consent=${consentMode})`);
      console.log(`  auth        : ${prov.apiKey ? `env ${prov.keySource} (redacted)` : "none/unset"}`);
      console.log(`  draft       : ${filename} (${totalBytes} bytes, ${chunks.length} chunk(s), register=${regInfo.register})`);
      console.log(`  delimiter   : ${firstPrompt.delimiter}`);
    }
    return;
  }

  if (!prov.isLocal && Array.isArray(config?.forbid) && config.forbid.length > 0) {
    const hitLocs = [];
    for (const pat of config.forbid) {
      let re;
      try {
        re = new RegExp(pat, "gimu");
      } catch (err) {
        console.error(`dislop review: invalid .dislop.local.json forbid regex: ${err.message}`);
        process.exit(2);
      }
      if (re.test(filename)) {
        hitLocs.push("filename");
      }
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(rawText)) !== null) {
        const lineNum = rawText.slice(0, m.index).split("\n").length;
        hitLocs.push(String(lineNum));
        if (hitLocs.length >= 20) break;
        if (m[0].length === 0) {
          if (re.lastIndex >= rawText.length) break;
          const cp = rawText.codePointAt(m.index);
          re.lastIndex = m.index + (cp !== undefined && cp > 0xffff ? 2 : 1);
        }
      }
    }
    if (hitLocs.length > 0) {
      const uniqueLocs = Array.from(new Set(hitLocs)).slice(0, 5).join(", ");
      console.error(
        `dislop review: refusing remote upload — matched ${hitLocs.length} local '.dislop.local.json' forbid policy hit(s) (${uniqueLocs}).`
      );
      process.exit(2);
    }
  }

  if (prov.isLocal) {
    try {
      await assertLoopbackEndpoint(prov.hostname);
    } catch (err) {
      console.error(`dislop review: ${scrubSecrets(err.message, prov.apiKey ? [prov.apiKey] : [])}`);
      process.exit(2);
    }
  } else if (!flags.yes && process.env.DISLOP_ALLOW_REMOTE !== "1") {
    console.error(
      `dislop review: refusing remote upload without explicit confirmation (--yes or DISLOP_ALLOW_REMOTE=1).\n` +
        `  target: host=${prov.host} provider=${prov.provider} model=${prov.model} file=${filename} bytes=${totalBytes} chunks=${chunks.length}`
    );
    process.exit(2);
  }

  console.error(
    `dislop review: sending to host=${prov.host} provider=${prov.provider} model=${prov.model} file=${filename} bytes=${totalBytes} chunks=${chunks.length} register=${regInfo.register}`
  );

  const allFindings = [];
  const seenFingerprints = new Set();
  const rejected = { ungroundedQuote: 0, inventedFact: 0, malformed: 0 };
  const summaries = [];
  const levels = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let hasUsage = false;
  const redactList = prov.apiKey ? [prov.apiKey] : [];

  for (const ch of chunks) {
    const prompt = ch.index === 0
      ? firstPrompt
      : buildReviewPrompt({
          chunkText: ch.text,
          filename,
          modality,
          packId,
          register: regInfo.register,
          lang,
        });
    try {
      const apiRes = await runReviewRequest({
        endpointUrl: prov.endpointUrl,
        isLocal: prov.isLocal,
        hostname: prov.hostname,
        model: prov.model,
        apiKey: prov.apiKey,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        timeoutMs,
      });
      if (apiRes.usage && typeof apiRes.usage === "object" && !Array.isArray(apiRes.usage)) {
        try {
          const MAX_TOK = 1_000_000_000;
          const safeCount = (v) => {
            if (typeof v === "number") {
              return Number.isSafeInteger(v) && v >= 0 && v <= MAX_TOK ? v : 0;
            }
            if (typeof v === "string") {
              const s = v.trim();
              if (/^\d{1,10}$/.test(s)) {
                const n = Number(s);
                return Number.isSafeInteger(n) && n <= MAX_TOK ? n : 0;
              }
            }
            return 0;
          };
          const pt = safeCount(apiRes.usage.prompt_tokens);
          const ct = safeCount(apiRes.usage.completion_tokens);
          const tt = safeCount(apiRes.usage.total_tokens);
          hasUsage = true;
          promptTokens += pt;
          completionTokens += ct;
          totalTokens += tt;
        } catch {}
      }
      const norm = validateAndNormalizeReviewResponse({
        rawContent: apiRes.content,
        chunkText: ch.text,
        fullText: rawText,
        chunkStartOffset: ch.startOffset,
        filename,
        modality,
        lang,
        redactSecrets: redactList,
      });
      for (const f of norm.findings) {
        if (!seenFingerprints.has(f.fingerprint)) {
          seenFingerprints.add(f.fingerprint);
          allFindings.push(f);
        }
      }
      rejected.ungroundedQuote += norm.rejected.ungroundedQuote;
      rejected.inventedFact += norm.rejected.inventedFact;
      rejected.malformed += norm.rejected.malformed;
      if (norm.summary) summaries.push(norm.summary);
      levels.push(norm.aiFlavorLevel);
    } catch (err) {
      console.error(`dislop review: chunk ${ch.index + 1}/${chunks.length} failed — ${scrubSecrets(err.message, redactList)}`);
      process.exit(2);
    }
  }

  const overallLevel = levels.includes("high") ? "high" : levels.includes("medium") ? "medium" : "low";
  const levelLabel = lang === "zh" ? ({ high: "高", medium: "中", low: "低" }[overallLevel] || overallLevel) : overallLevel;
  const summaryText = summaries.join(" ").trim();
  const usageSummary = hasUsage
    ? { promptTokens, completionTokens, totalTokens }
    : null;
  const report = {
    schema: "dislop.review/1",
    version: ENGINE_VERSION,
    provider: prov.provider,
    host: prov.host,
    model: prov.model,
    file: filename,
    pack: packId,
    lang,
    chunks: chunks.length,
    bytes: totalBytes,
    aiFlavorLevel: overallLevel,
    summary: summaryText,
    context: { register: regInfo.register, registerSource: regInfo.registerSource },
    checkedCount: 1,
    skipped: [],
    findings: allFindings,
    unusedSuppressions: [],
    rejected,
    usage: usageSummary,
  };

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const out = formatReport(report, format, lang, { failOn });
    console.log(out);
    if (format === "text" && summaryText) {
      console.log(lang === "zh" ? `  [综述 · ${levelLabel}] ${summaryText}` : `  [summary · ${overallLevel}] ${summaryText}`);
    }
    const rejTotal = rejected.ungroundedQuote + rejected.inventedFact + rejected.malformed;
    if (format === "text" && rejTotal > 0) {
      console.log(
        lang === "zh"
          ? `  [校验过滤] 已丢弃 ${rejTotal} 条未通过核验的建议（无原文引用=${rejected.ungroundedQuote}，编造事实=${rejected.inventedFact}，格式异常=${rejected.malformed}）`
          : `  [guard] filtered ${rejTotal} unverified suggestion(s) (ungrounded=${rejected.ungroundedQuote}, inventedFact=${rejected.inventedFact}, malformed=${rejected.malformed})`
      );
    }
  }
  const triggered = allFindings.some((f) => (SEVERITY_RANK[f.severity] || 1) >= SEVERITY_RANK[failOn]);
  process.exitCode = triggered ? 1 : 0;
}

async function runReview(args, packs) {
  for (const tok of args) {
    if (tok === "--api-key" || tok.startsWith("--api-key=") || tok === "--token" || tok.startsWith("--token=")) {
      console.error(
        "dislop review: passing --api-key or --token as CLI arguments is forbidden (exposed via process list); set DISLOP_REVIEW_API_KEY or the provider env var instead."
      );
      process.exit(2);
    }
  }
  const { flags, positional } = parseFlags(args, "review");
  if (flags.help) {
    printSubcommandHelp("review");
    return;
  }
  if (flags.offline || flags.endpoint || flags["api-key-env"]) {
    return await runRubricReview(flags, positional, packs);
  }
  return await runProviderReview(flags, positional, packs);
}

async function runDoctor(args, packs) {
  const { flags, positional } = parseFlags(args, "doctor");
  if (flags.help) {
    printSubcommandHelp("doctor");
    return;
  }
  if (positional.length > 0) {
    console.error(`dislop doctor: unexpected positional argument '${positional[0]}'.`);
    process.exit(2);
  }
  const lang = flags.lang || "en";
  if (!["en", "zh"].includes(lang)) {
    console.error(`dislop: invalid --lang '${lang}' (expected en or zh)`);
    process.exit(2);
  }
  const format = flags.json ? "json" : flags.format || "text";
  if (!["text", "json"].includes(format)) {
    console.error(`dislop doctor: invalid --format '${format}' (expected text or json)`);
    process.exit(2);
  }
  const cwd = process.cwd();
  let rulesCount = 0;
  for (const p of Object.values(packs)) rulesCount += (p.rules || []).length;
  const baseStatus = await buildModelStatusReport({
    packsCount: Object.keys(packs).length,
    rulesCount,
    probeLoopback: !flags["no-loopback"],
    cacheDir: flags["cache-dir"] || null,
  });

  const skillRel = "skills/dislop/SKILL.md";
  const workspaceReady = fs.existsSync(path.join(cwd, skillRel));
  const bundledReady = fs.existsSync(path.join(REPO_ROOT, skillRel));
  const skillReady = workspaceReady || bundledReady;
  const byokEnv = inspectByokEnvStatus(process.env);
  const cfgPathFound = [".dislop.json", "dislop.json", ".disloprc.json", ".dislop.local.json"].some((n) =>
    fs.existsSync(path.join(cwd, n))
  );
  let cfgValid = true;
  let cfgError = null;
  try {
    loadConfig(cwd, null);
  } catch (err) {
    cfgValid = false;
    cfgError = scrubSecrets(err.message);
  }

  let gitignoreLocalConfig = null;
  try {
    const g = spawnSync("git", ["check-ignore", "-q", ".dislop.local.json"], { cwd, encoding: "utf8", timeout: 2000 });
    if (g.status === 0) gitignoreLocalConfig = true;
    else if (g.status === 1) gitignoreLocalConfig = false;
  } catch {}

  const ping = flags.online
    ? await pingEndpointHealth("https://dislop.com/api/health")
    : { checked: false, ok: null, status: null, error: null };

  const report = {
    ...baseStatus,
    schema: "dislop.doctor/1",
    layers: {
      skill: { ready: skillReady, workspaceReady, bundledReady, path: skillRel },
      localCli: {
        ready: true,
        version: ENGINE_VERSION,
        packs: Object.keys(packs).length,
        rules: rulesCount,
        pocketMlReady: true,
        localRunnersCount: baseStatus.localRunners.length,
      },
      byokReview: byokEnv,
      officialCloudMcp: {
        url: "https://dislop.com/mcp",
        freeCreditsPerMonth: 30,
        ping,
      },
      config: {
        found: cfgPathFound,
        valid: cfgValid,
        error: cfgError,
        gitignoreLocalConfig,
      },
    },
  };

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    if (!cfgValid) process.exitCode = 2;
    return;
  }

  const configuredNames = Object.entries(byokEnv.providers)
    .filter(([, v]) => v.keyPresent)
    .map(([k, v]) => `${k}(${v.keySource})`);
  const hw = report.hardware;
  const rec = report.recommendation;
  if (lang === "zh") {
    const skillLabel = workspaceReady ? "已就绪（当前工作区）" : bundledReady ? "已就绪（安装包内置）" : "未找到";
    const pingLabel = ping.checked
      ? (ping.ok ? `在线连通 HTTP ${ping.status}` : `连通失败：${ping.error || `HTTP ${ping.status}`}`)
      : (ping.error ? `已拦截（${ping.error}）` : "未联网检测，可加 --online");
    console.log(`dislop doctor v${ENGINE_VERSION}（三层体检 · 默认 0 联网）`);
    console.log(`  1. 纯文档 Skill   : ${skillLabel} (${skillRel})`);
    console.log(`  2. 本地 CLI 引擎  : 已就绪（${Object.keys(packs).length} 套规则包 / ${rulesCount} 条规则 · 14.6 KB Pocket ML · ${baseStatus.localRunners.length} 个本地推理端）`);
    console.log(`     硬件与选装推荐 : ${hw.platform}/${hw.arch} · ${hw.totalMemoryGb} GB 内存 -> ${rec.tier}${rec.modelId ? ` (${rec.modelId})` : "（内置模型即可）"}`);
    console.log(`     BYOK 深度审校  : ${configuredNames.length > 0 ? `已配置 ${configuredNames.join("、")}` : "未配置密钥环境变量（仅按需 --yes 启用）"}`);
    console.log(`  3. 官方云端 MCP   : https://dislop.com/mcp（免费额度 30 次/月 · ${pingLabel}）`);
    console.log(`  配置与隐私边界    : 配置=${cfgPathFound ? (cfgValid ? "有效" : `异常：${cfgError}`) : "使用默认"} | .dislop.local.json 忽略=${gitignoreLocalConfig === true ? "已忽略" : gitignoreLocalConfig === false ? "未加入 .gitignore" : "非 git 仓库"}`);
  } else {
    const skillLabel = workspaceReady ? "ready (workspace)" : bundledReady ? "ready (bundled)" : "not found";
    const pingLabel = ping.checked
      ? (ping.ok ? `reachable HTTP ${ping.status}` : `unreachable: ${ping.error || `HTTP ${ping.status}`}`)
      : (ping.error ? `blocked (${ping.error})` : "offline (pass --online to ping)");
    console.log(`dislop doctor v${ENGINE_VERSION} (3-layer readiness · offline by default)`);
    console.log(`  1. Pure-doc Skill : ${skillLabel} (${skillRel})`);
    console.log(`  2. Local CLI/ML   : ready (${Object.keys(packs).length} packs / ${rulesCount} rules · 14.6 KB Pocket ML · ${baseStatus.localRunners.length} local runner(s))`);
    console.log(`     Hardware fit   : ${hw.platform}/${hw.arch} · ${hw.totalMemoryGb} GB RAM -> ${rec.tier}${rec.modelId ? ` (${rec.modelId})` : " (bundled only)"}`);
    console.log(`     BYOK review    : ${configuredNames.length > 0 ? `configured: ${configuredNames.join(", ")}` : "no API key env set (explicit opt-in only)"}`);
    console.log(`  3. Cloud MCP      : https://dislop.com/mcp (30 free/mo · ${pingLabel})`);
    console.log(`  Config & hygiene  : config=${cfgPathFound ? (cfgValid ? "valid" : `invalid (${cfgError})`) : "defaults"} | .dislop.local.json gitignored=${gitignoreLocalConfig === null ? "n/a" : String(gitignoreLocalConfig)}`);
  }
  if (!cfgValid) process.exitCode = 2;
}

function printHelp() {
  console.log(`dislop v${ENGINE_VERSION} — Cutting AI slop is real productivity. Linter for AI Slop in docs, web UI, and slides

Usage: dislop <command> [options]

Check & fix (local, 0 network calls):
  check [paths... | -]      Audit files or stdin [--pack <id|auto>] [--register <id|auto>] [--deep] [-q|--quiet]
                            [--fail-on error|warning|info|never] [--format text|json|agent|sarif|github|md]
                            [--changed [ref] | --staged] [--rule <id,...>] [--lang en|zh]
  verify <before> <after>   Verify edits retain numbers/qualifiers & --keep terms [--git [ref] <file>] [--strict]
  explain <rule-id>         Show rationale, deletion test, and bad/trap/good examples
  init                      Create starter .dislop.json and gitignore .dislop.local.json

Browse rules & style:
  catalog [query]           Search the 53-rule AI-slop catalog (alias: search)
  packs                     List bundled rule packs and supported formats
  patterns [file | -]       Run multi-angle extended pattern-bank scan
  voice [paths... | -]      Extract offline dislop.voice/1 writing profile

Agent & review:
  review [file | -]         Multi-layer review (--offline | --endpoint <url> | --provider openai|gemini|local)
  --mcp                     Run local stdio MCP server (7 offline tools)
  resources                 Show bundled packs, static agent links, and Official Cloud MCP

Diagnostics & optional local models:
  doctor [--online]         Check 3-layer readiness (Skill, Local CLI/ML, BYOK env, config, and optional Cloud ping)
  model [action]            Manage/score Pocket ML & optional local models (status|score|install|import|remove|deslop)
  pack-test                 Validate Pack Schema v2 manifests and embedded fixtures

Exit codes: 0 clean | 1 findings >= --fail-on | 2 usage, config, or unreadable file error
Example:    dislop check draft.md --deep --lang zh`);
}

async function main() {
  const argv = process.argv.slice(2);
  const packs = loadAllPacks();
  const patternByRuleId = loadPatternLibrary();

  if (argv.includes("--mcp")) {
    runMcpServer(packs, patternByRuleId);
    return;
  }
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help" || argv[0] === "help") {
    if (argv[0] === "help" && argv[1]) {
      if (COMMAND_SPECS[argv[1]]) {
        printSubcommandHelp(argv[1]);
        return;
      }
      console.error(`dislop: unknown command '${argv[1]}'. Run 'dislop --help' for usage.`);
      process.exit(2);
    }
    printHelp();
    return;
  }
  if (argv[0] === "-v" || argv[0] === "--version") {
    console.log(ENGINE_VERSION);
    return;
  }

  const cmd = argv[0];
  const rest = argv.slice(1);
  if (cmd === "check") return runCheck(rest, packs);
  if (cmd === "verify") return runVerify(rest, packs);
  if (cmd === "review") return await runReview(rest, packs);
  if (cmd === "voice") return runVoice(rest);
  if (cmd === "doctor") return await runDoctor(rest, packs);
  if (cmd === "model") return await runModel(rest, packs, "model");
  if (cmd === "setup") return await runModel(["setup", ...rest], packs, "setup");
  if (cmd === "deslop") {
    const { flags, positional } = parseFlags(rest, "deslop");
    if (flags.help) {
      printSubcommandHelp("deslop");
      return;
    }
    if (!flags.local) {
      console.error("dislop deslop: pass --local to run with a loopback local small model (0 external upload).");
      process.exit(2);
    }
    return await runLocalDeslopCli(positional[0] || "-", flags, packs);
  }
  if (cmd === "explain") return runExplain(rest, packs, patternByRuleId);
  if (cmd === "catalog" || cmd === "search") return runCatalog(rest, packs, patternByRuleId);
  if (cmd === "patterns") return runPatterns(rest);
  if (cmd === "packs") return runPacks(rest, packs);
  if (cmd === "resources") return runResources(rest, packs);
  if (cmd === "pack-test") return runPackTest(rest, packs);
  if (cmd === "init") return runInit(rest);

  console.error(`dislop: unknown command '${cmd}'. Run 'dislop --help' for usage.`);
  process.exit(2);
}

main();
