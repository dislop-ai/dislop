import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  VALID_ACTION_TYPES,
  VALID_DEFECT_SEVERITIES,
  VALID_FIX_SAFETIES,
  VALID_SUGGESTION_PRIORITIES,
  definePack,
  definePackScripts,
} from "../sdk/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BUILTIN_PACKS_ROOT = path.resolve(__dirname, "..", "..", "packs");

const SHORTHAND_ALIASES = Object.freeze({
  "prose-en": "en/prose",
  "prose-zh": "zh/prose",
  "artifact-qa-en": "en/artifact-qa",
  "artifact-qa-zh": "zh/artifact-qa",
  "web-ui-en": "en/web-ui",
  "web-ui-zh": "zh/web-ui",
  "slide-deck-en": "en/slide-deck",
  "slide-deck-zh": "zh/slide-deck",
});

function parseInlineArray(raw) {
  const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function unquoteYamlScalar(raw) {
  return String(raw || "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

/**
 * Parse a Markdown prompt file (`prompts/*.md` or `<name>.pack.md`) into `{ meta, roleHint, rules }`.
 */
export function parseMarkdownPromptContent(markdownText, sourcePath = "rules.md") {
  const normalized = String(markdownText || "").replace(/\r\n/g, "\n");
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  let fmLines = [];
  let body = normalized.trim();
  if (fmMatch) {
    fmLines = fmMatch[1].split("\n");
    body = fmMatch[2].trim();
  }

  let name = path
    .basename(sourcePath)
    .replace(/\.pack\.md$/i, "")
    .replace(/\.md$/i, "");
  let version = "0.1.0";
  let description = "";
  let roleHint = "";
  let languages;
  let formats;
  let modalities;
  const frontmatterRules = [];

  let inRulesList = false;
  let currentRule = null;

  for (const rawLine of fmLines) {
    const line = rawLine.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;

    if (inRulesList) {
      const itemStart = line.match(/^\s*-\s+([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
      if (itemStart) {
        if (currentRule) frontmatterRules.push(currentRule);
        currentRule = { [itemStart[1]]: unquoteYamlScalar(itemStart[2]) };
        continue;
      }
      const itemProp = line.match(/^\s{2,}([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
      if (itemProp && currentRule) {
        currentRule[itemProp[1]] = unquoteYamlScalar(itemProp[2]);
        continue;
      }
      if (!/^\s/.test(line)) {
        if (currentRule) {
          frontmatterRules.push(currentRule);
          currentRule = null;
        }
        inRulesList = false;
      }
    }

    const kv = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const [, key, val] = kv;
    if (key === "rules" && !val.trim()) {
      inRulesList = true;
      continue;
    }
    if (key === "name" && val.trim()) name = unquoteYamlScalar(val);
    else if (key === "version" && val.trim()) version = unquoteYamlScalar(val);
    else if (key === "description" && val.trim()) description = unquoteYamlScalar(val);
    else if (key === "roleHint" && val.trim()) roleHint = unquoteYamlScalar(val);
    else if (key === "languages") languages = parseInlineArray(val);
    else if (key === "formats") formats = parseInlineArray(val);
    else if (key === "modalities") modalities = parseInlineArray(val);
  }
  if (currentRule) frontmatterRules.push(currentRule);

  const bodyMap = new Map();
  const bodyOrdered = [];
  const ruleLineRe = /^(?:\d+\.|[-*+])\s+\*\*([a-zA-Z0-9._-]+)\*\*\s*:\s*(.+)$/gm;
  let m;
  while ((m = ruleLineRe.exec(body)) !== null) {
    const id = m[1].trim();
    const instruction = m[2].trim();
    bodyMap.set(id, instruction);
    bodyOrdered.push({ id, instruction });
  }

  const compiledRules = [];
  if (frontmatterRules.length > 0) {
    for (const r of frontmatterRules) {
      const ruleId = r.id || r.ruleId;
      if (!ruleId) continue;
      const priority = VALID_SUGGESTION_PRIORITIES.includes(r.priority) ? r.priority : "moderate";
      const instruction = r.instruction || bodyMap.get(ruleId) || body;
      compiledRules.push({
        ruleId,
        defaultPriority: priority,
        instruction,
      });
    }
  } else if (bodyOrdered.length > 0) {
    for (const r of bodyOrdered) {
      compiledRules.push({
        ruleId: r.id,
        defaultPriority: "moderate",
        instruction: r.instruction,
      });
    }
  } else if (body) {
    compiledRules.push({
      ruleId: "general",
      defaultPriority: "moderate",
      instruction: body,
    });
  }

  return {
    meta: { name, version, description, languages, formats, modalities },
    roleHint,
    rules: compiledRules,
  };
}

/**
 * Compile a standalone single-file `<name>.pack.md` into a Pack handle.
 */
export function compileMarkdownPack(markdownText, sourcePath = "custom.pack.md") {
  const normalized = String(markdownText || "").replace(/\r\n/g, "\n");
  if (!/^---\n[\s\S]*?\n---/.test(normalized)) {
    throw new Error(`Invalid Markdown Pack '${sourcePath}': missing YAML frontmatter block (--- ... ---)`);
  }
  const parsed = parseMarkdownPromptContent(normalized, sourcePath);
  const pack = definePack({
    name: parsed.meta.name,
    version: parsed.meta.version,
    description:
      parsed.meta.description || `Declarative Markdown Prompt Pack (${path.basename(sourcePath)})`,
    ...(parsed.meta.languages ? { languages: parsed.meta.languages } : {}),
    ...(parsed.meta.formats ? { formats: parsed.meta.formats } : {}),
    ...(parsed.meta.modalities ? { modalities: parsed.meta.modalities } : {}),
    resolvePrompt(doc) {
      return {
        ...(parsed.roleHint ? { roleHint: interpolateRoleHint(parsed.roleHint, doc) } : {}),
        rules: parsed.rules,
      };
    },
  });
  return wrapEagerPackAsLazyHandle(pack);
}

/**
 * Interpolate lightweight document telemetry placeholders (`{{uiSummary}}`, `{{deckSummary}}`)
 * inside Markdown prompt `roleHint` strings so `prompts/*.md` stays 100% pure Markdown.
 */
export function interpolateRoleHint(template, doc) {
  if (!template || !template.includes("{{")) return template;
  return template
    .replace(/\{\{\s*uiSummary\s*\}\}/g, () => {
      const ui = doc?.artifacts?.uiSignals || {};
      return `UI telemetry: pillBadges=${(ui.pillBadges || []).length}, gradients=${(ui.purplePinkGradients || []).length}, links=${(doc?.artifacts?.links || []).length}.`;
    })
    .replace(/\{\{\s*deckSummary\s*\}\}/g, () => {
      const slides = doc?.artifacts?.deckSignals?.slides || [];
      if (slides.length === 0) return "";
      return `Deck structure (${slides.length} slides): ${slides
        .slice(0, 15)
        .map((s) => `S${s.index}("${String(s.title || "").slice(0, 40)}", words=${s.wordCount}, bullets=${s.bulletCount})`)
        .join("; ")}.`;
    })
    .replace(/\{\{\s*slideCount\s*\}\}/g, () => {
      const c = doc?.artifacts?.deckSignals?.slideCount;
      return c ? String(c) : "0";
    })
    .trim();
}

function listFilesWithExt(dirPath, extRegex) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isFile() && extRegex.test(e.name))
    .map((e) => path.join(dirPath, e.name))
    .sort();
}

/**
 * Create a lazy stage-gated Pack Handle for a separated Pack directory:
 *   `<packDir>/pack.json`
 *   `<packDir>/scripts/*.mjs`   (imported ONLY when deterministic checks or verifyFix run)
 *   `<packDir>/prompts/*.md`    (read & compiled ONLY when an LLM route is active)
 */
export function createDirectoryPackHandle(packDir) {
  const manifestPath = path.join(packDir, "pack.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Pack directory '${packDir}' is missing pack.json`);
  }
  const rawManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const name = String(rawManifest.name || "").trim();
  if (!name) {
    throw new Error(`Invalid pack.json in '${packDir}': missing 'name'`);
  }

  const version = String(rawManifest.version || "1.0.0").trim();
  const description = String(rawManifest.description || "").trim();
  const languages = Array.isArray(rawManifest.languages)
    ? Object.freeze(rawManifest.languages.map((l) => String(l).trim().toLowerCase()).filter(Boolean))
    : null;
  const formats = Array.isArray(rawManifest.formats)
    ? Object.freeze(
        rawManifest.formats.map((f) => String(f).trim().toLowerCase().replace(/^\./, "")).filter(Boolean),
      )
    : null;
  const modalities = Array.isArray(rawManifest.modalities)
    ? Object.freeze(rawManifest.modalities.map((m) => String(m).trim().toLowerCase()).filter(Boolean))
    : null;

  const scriptsDir = path.join(packDir, "scripts");
  const promptsDir = path.join(packDir, "prompts");

  const scriptFiles = listFilesWithExt(scriptsDir, /\.(?:mjs|js)$/i);
  const promptFiles = listFilesWithExt(promptsDir, /\.md$/i);

  const loadStats = {
    scriptsLoaded: false,
    promptsLoaded: false,
    scriptFileCount: scriptFiles.length,
    promptFileCount: promptFiles.length,
  };

  let cachedScriptsPromise = null;
  let cachedPromptsPromise = null;

  return Object.freeze({
    __dislopPack: true,
    __lazyPackHandle: true,
    packDir,
    name,
    version,
    description,
    languages,
    formats,
    modalities,
    hasScripts: scriptFiles.length > 0,
    hasPrompts: promptFiles.length > 0,
    loadStats,

    async loadScripts() {
      if (scriptFiles.length === 0) return [];
      if (!cachedScriptsPromise) {
        cachedScriptsPromise = (async () => {
          const modules = [];
          for (const sf of scriptFiles) {
            const mod = await import(pathToFileURL(sf).href);
            const exported = mod.default || mod;
            const normalized = exported?.__dislopPackScripts
              ? exported
              : definePackScripts({
                  appliesTo: exported?.appliesTo || mod.appliesTo,
                  check: exported?.check || mod.check,
                  verifyFix: exported?.verifyFix || mod.verifyFix,
                });
            modules.push(normalized);
          }
          loadStats.scriptsLoaded = true;
          return modules;
        })();
      }
      return cachedScriptsPromise;
    },

    async loadPrompts() {
      if (promptFiles.length === 0) return [];
      if (!cachedPromptsPromise) {
        cachedPromptsPromise = (async () => {
          const parsedPrompts = promptFiles.map((pf) => {
            const raw = fs.readFileSync(pf, "utf8");
            return parseMarkdownPromptContent(raw, pf);
          });
          loadStats.promptsLoaded = true;
          return parsedPrompts;
        })();
      }
      return cachedPromptsPromise;
    },
  });
}

/**
 * Wrap an in-memory programmatic `definePack()` object in the same `LazyPackHandle` interface.
 */
export function wrapEagerPackAsLazyHandle(pack) {
  if (pack?.__lazyPackHandle) return pack;
  const validated = pack?.__dislopPack ? pack : definePack(pack);

  const loadStats = {
    scriptsLoaded: false,
    promptsLoaded: false,
    scriptFileCount: validated.check || validated.verifyFix ? 1 : 0,
    promptFileCount: validated.resolvePrompt ? 1 : 0,
  };

  return Object.freeze({
    __dislopPack: true,
    __lazyPackHandle: true,
    name: validated.name,
    version: validated.version,
    description: validated.description,
    languages: validated.languages,
    formats: validated.formats,
    modalities: validated.modalities,
    appliesTo: validated.appliesTo || null,
    hasScripts: Boolean(validated.check || validated.verifyFix),
    hasPrompts: Boolean(validated.resolvePrompt),
    loadStats,

    async loadScripts() {
      loadStats.scriptsLoaded = true;
      if (!validated.check && !validated.verifyFix && !validated.appliesTo) return [];
      return [
        {
          appliesTo: validated.appliesTo || null,
          check: validated.check || null,
          verifyFix: validated.verifyFix || null,
        },
      ];
    },

    async loadPrompts(doc, ctx) {
      loadStats.promptsLoaded = true;
      if (typeof validated.resolvePrompt !== "function") return [];
      const res = validated.resolvePrompt(doc, ctx);
      if (!res || !Array.isArray(res.rules)) return [];
      return [{ roleHint: res.roleHint || "", rules: res.rules }];
    },
  });
}

function isSeparatedPackDirectory(dirPath) {
  return fs.existsSync(path.join(dirPath, "pack.json"));
}

/**
 * Enumerate all built-in Packs under `packs/<scope-or-lang>/<scenario>/` by reading `pack.json` only.
 */
export function listBuiltinPackIds(packsRoot = BUILTIN_PACKS_ROOT) {
  if (!fs.existsSync(packsRoot)) return [];
  const results = [];
  for (const level1 of fs.readdirSync(packsRoot, { withFileTypes: true })) {
    if (!level1.isDirectory()) continue;
    const level1Dir = path.join(packsRoot, level1.name);
    for (const level2 of fs.readdirSync(level1Dir, { withFileTypes: true })) {
      if (!level2.isDirectory()) continue;
      const packDir = path.join(level1Dir, level2.name);
      if (
        isSeparatedPackDirectory(packDir) ||
        fs.existsSync(path.join(packDir, "index.mjs")) ||
        fs.existsSync(path.join(packDir, "pack.md"))
      ) {
        results.push(`${level1.name}/${level2.name}`);
      }
    }
  }
  return results.sort();
}

async function loadFromFilesystemEntry(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    if (isSeparatedPackDirectory(targetPath)) {
      return createDirectoryPackHandle(targetPath);
    }
    const candidates = ["index.mjs", "index.js", "pack.md"].map((f) => path.join(targetPath, f));
    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) {
      throw new Error(`Pack directory '${targetPath}' is missing pack.json, index.mjs, or pack.md`);
    }
    return loadFromFilesystemEntry(found);
  }

  if (/\.md$/i.test(targetPath)) {
    return compileMarkdownPack(fs.readFileSync(targetPath, "utf8"), targetPath);
  }
  if (path.basename(targetPath) === "pack.json") {
    return createDirectoryPackHandle(path.dirname(targetPath));
  }

  const mod = await import(pathToFileURL(targetPath).href);
  const candidate = mod.default || mod.pack;
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`Pack module '${targetPath}' does not export a default definePack() object`);
  }
  return wrapEagerPackAsLazyHandle(candidate);
}

/**
 * Resolve a single Pack specifier into a `LazyPackHandle` WITHOUT importing `scripts/` or reading `prompts/`
 * when the pack is a separated Pack directory (`pack.json`).
 */
export async function loadSinglePack(
  specifier,
  { docLanguage = "en", cwd = process.cwd(), packsRoot = BUILTIN_PACKS_ROOT } = {},
) {
  if (specifier && typeof specifier === "object") {
    return wrapEagerPackAsLazyHandle(specifier);
  }
  const raw = String(specifier || "").trim();
  if (!raw) {
    throw new Error("Empty Pack specifier");
  }

  const looksLikePath =
    raw.startsWith("./") ||
    raw.startsWith("../") ||
    path.isAbsolute(raw) ||
    /\.(?:mjs|js|md|json)$/i.test(raw);
  if (looksLikePath) {
    const abs = path.resolve(cwd, raw);
    if (!fs.existsSync(abs)) {
      throw new Error(`Pack path not found: '${raw}' (resolved to '${abs}')`);
    }
    return loadFromFilesystemEntry(abs);
  }

  let normalizedId = SHORTHAND_ALIASES[raw] || raw;
  if (!normalizedId.includes("/")) {
    const langDir = path.join(packsRoot, docLanguage, normalizedId);
    const commonDir = path.join(packsRoot, "common", normalizedId);
    if (fs.existsSync(langDir)) {
      normalizedId = `${docLanguage}/${normalizedId}`;
    } else if (fs.existsSync(commonDir)) {
      normalizedId = `common/${normalizedId}`;
    }
  }

  const builtinDir = path.join(packsRoot, ...normalizedId.split("/"));
  if (fs.existsSync(builtinDir) && fs.statSync(builtinDir).isDirectory()) {
    return loadFromFilesystemEntry(builtinDir);
  }

  // Installed npm package fallback
  try {
    const req = createRequire(path.join(cwd, "package.json"));
    const pkgEntry = req.resolve(raw);
    const pkgDir = path.dirname(pkgEntry);
    if (isSeparatedPackDirectory(pkgDir)) {
      return createDirectoryPackHandle(pkgDir);
    }
    return loadFromFilesystemEntry(pkgEntry);
  } catch {
    throw new Error(
      `Unknown Pack '${raw}'. Built-in packs: ${listBuiltinPackIds(packsRoot).join(", ")}`,
    );
  }
}

function builtinPackExists(packsRoot, id) {
  const dir = path.join(packsRoot, ...id.split("/"));
  return (
    isSeparatedPackDirectory(dir) ||
    fs.existsSync(path.join(dir, "index.mjs")) ||
    fs.existsSync(path.join(dir, "pack.md"))
  );
}

/**
 * Determine default Pack specifiers for a `DocumentModel` when no custom `--pack` was given.
 */
export function defaultPackSpecifiersForDoc(doc, packsRoot = BUILTIN_PACKS_ROOT) {
  const lang = doc.language === "zh" ? "zh" : "en";
  const specs = ["common/artifact-qa"];

  const pushIfBuiltinExists = (id) => {
    if (builtinPackExists(packsRoot, id)) specs.push(id);
  };

  if (doc.segments.length > 0) {
    pushIfBuiltinExists(`${lang}/artifact-qa`);
  }

  if (["html", "css", "jsx", "tsx", "svg"].includes(doc.format)) {
    specs.push("common/web-ui");
    if (doc.segments.length > 0) {
      pushIfBuiltinExists(`${lang}/web-ui`);
    }
  }

  if (["pptx", "pdf", "png", "jpg", "jpeg", "webp", "gif"].includes(doc.format)) {
    specs.push("common/slide-deck");
    if (doc.segments.length > 0) {
      pushIfBuiltinExists(`${lang}/slide-deck`);
    }
  }

  if (doc.segments.length > 0) {
    pushIfBuiltinExists(`${lang}/prose`);
  }

  return specs;
}

function expandScenarioShorthands(rawSpecs, docLanguage, packsRoot) {
  const expanded = [];
  for (const spec of rawSpecs) {
    if (typeof spec !== "string") {
      expanded.push(spec);
      continue;
    }
    const trimmed = spec.trim();
    const looksLikePath =
      trimmed.startsWith("./") ||
      trimmed.startsWith("../") ||
      path.isAbsolute(trimmed) ||
      /\.(?:mjs|js|md|json)$/i.test(trimmed);

    if (looksLikePath || trimmed.includes("/") || SHORTHAND_ALIASES[trimmed]) {
      expanded.push(trimmed);
      continue;
    }

    const commonId = `common/${trimmed}`;
    const langId = `${docLanguage}/${trimmed}`;
    const hasCommon = builtinPackExists(packsRoot, commonId);
    const hasLang = builtinPackExists(packsRoot, langId);

    if (hasCommon && hasLang) {
      expanded.push(commonId, langId);
    } else {
      expanded.push(trimmed);
    }
  }
  return expanded;
}

export function packMetadataAppliesToDoc(pack, doc) {
  if (pack.languages && pack.languages.length > 0 && !pack.languages.includes(doc.language)) {
    return false;
  }
  if (pack.formats && pack.formats.length > 0 && !pack.formats.includes(doc.format)) {
    return false;
  }
  if (pack.modalities && pack.modalities.length > 0 && !pack.modalities.includes(doc.modality)) {
    return false;
  }
  if (typeof pack.appliesTo === "function") {
    return Boolean(pack.appliesTo(doc));
  }
  return true;
}

/**
 * Resolve and filter active Packs for `doc` using `pack.json` metadata ONLY
 * (zero `scripts/` imports and zero `prompts/` reads during admission!).
 */
export async function resolveActivePacks(
  doc,
  { packSpecifiers = null, cwd = process.cwd(), packsRoot = BUILTIN_PACKS_ROOT } = {},
) {
  const requested =
    packSpecifiers && packSpecifiers.length > 0
      ? expandScenarioShorthands(packSpecifiers, doc.language, packsRoot)
      : defaultPackSpecifiersForDoc(doc, packsRoot);

  const loaded = [];
  const seenNames = new Set();
  for (const spec of requested) {
    const pack = await loadSinglePack(spec, { docLanguage: doc.language, cwd, packsRoot });
    if (seenNames.has(pack.name)) continue;
    seenNames.add(pack.name);
    if (packMetadataAppliesToDoc(pack, doc)) {
      loaded.push(pack);
    }
  }
  return loaded;
}

export function qualifyRuleId(packName, ruleId) {
  const cleanRule = String(ruleId || "rule").trim();
  if (cleanRule.startsWith(`${packName}/`)) return cleanRule;
  return `${packName}/${cleanRule}`;
}

/**
 * Lazily import `scripts/` ONLY for admitted Packs that declare `hasScripts`,
 * and execute `check(doc, ctx)` in parallel. Never touches `prompts/`.
 */
export async function runDeterministicPackChecks(
  doc,
  activePacks,
  { diagnosticLang = doc.language, cwd = process.cwd() } = {},
) {
  const items = [];

  await Promise.all(
    activePacks.map(async (pack) => {
      if (!pack.hasScripts) return;
      const scriptModules = await pack.loadScripts();
      if (scriptModules.length === 0) return;

      const localItems = [];
      const ctx = Object.freeze({
        diagnosticLang,
        cwd,
        reportDefect(input) {
          if (!input || typeof input !== "object") return;
          const severity = VALID_DEFECT_SEVERITIES.includes(input.severity) ? input.severity : "error";
          const fixSafety = VALID_FIX_SAFETIES.includes(input.fixSafety) ? input.fixSafety : "manual";
          const suggestedReplacement = String(input.suggestedReplacement ?? "");
          const actionType = VALID_ACTION_TYPES.includes(input.actionType)
            ? input.actionType
            : fixSafety !== "manual" && suggestedReplacement === ""
              ? "delete"
              : suggestedReplacement
                ? "replace"
                : "prompt";

          const seg = input.targetId ? doc.segments.find((s) => s.id === input.targetId) : null;
          localItems.push({
            kind: "defect",
            pack: pack.name,
            ruleId: qualifyRuleId(pack.name, input.ruleId),
            targetId: input.targetId || null,
            ...(input.line ?? seg?.line ? { line: input.line ?? seg?.line } : {}),
            severity,
            fixSafety,
            actionType,
            originalQuote: String(input.originalQuote ?? seg?.text ?? ""),
            suggestedReplacement,
            reason: String(input.reason || "Objective artifact defect."),
            ...(input.rewritePrompt ? { rewritePrompt: String(input.rewritePrompt) } : {}),
            ...(input.locator ? { _locator: input.locator } : {}),
          });
        },
        reportSuggestion(input) {
          if (!input || typeof input !== "object") return;
          const priority = VALID_SUGGESTION_PRIORITIES.includes(input.priority)
            ? input.priority
            : "moderate";
          const fixSafety = VALID_FIX_SAFETIES.includes(input.fixSafety) ? input.fixSafety : "review";
          const suggestedReplacement = String(input.suggestedReplacement ?? "");
          const actionType = VALID_ACTION_TYPES.includes(input.actionType)
            ? input.actionType
            : fixSafety !== "manual" && suggestedReplacement === ""
              ? "delete"
              : suggestedReplacement
                ? "replace"
                : "prompt";

          const seg = input.targetId ? doc.segments.find((s) => s.id === input.targetId) : null;
          localItems.push({
            kind: "suggestion",
            pack: pack.name,
            ruleId: qualifyRuleId(pack.name, input.ruleId),
            targetId: input.targetId || null,
            ...(input.line ?? seg?.line ? { line: input.line ?? seg?.line } : {}),
            priority,
            fixSafety,
            actionType,
            originalQuote: String(input.originalQuote ?? seg?.text ?? ""),
            suggestedReplacement,
            reason: String(input.reason || "Editorial improvement suggestion."),
            ...(input.rewritePrompt ? { rewritePrompt: String(input.rewritePrompt) } : {}),
            ...(input.locator ? { _locator: input.locator } : {}),
          });
        },
      });

      for (const sm of scriptModules) {
        if (typeof sm.appliesTo === "function" && !sm.appliesTo(doc)) continue;
        if (typeof sm.check === "function") {
          await sm.check(doc, ctx);
        }
      }
      items.push(...localItems);
    }),
  );

  return items;
}
