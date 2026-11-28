import fs from "node:fs";
import path from "node:path";
import { DislopConfigError } from "./config.mjs";
import { parseDocumentBuffer, parseDocumentFile, parseDocumentText } from "./document-model.mjs";
import { applyDualFactGate } from "./fact-gate.mjs";
import { compileIgnoreMatchers } from "./file-discovery.mjs";
import { resolveActivePacks, runDeterministicPackChecks } from "./pack-loader.mjs";
import {
  assemblePromptPayload,
  collectPackPromptRules,
  normalizeLlmResponseItems,
} from "./prompt-assembler.mjs";
import { DISLOP_VERSION } from "./version.mjs";
import { buildSlidingWindowChunks } from "../runtime/chunker.mjs";

const DEFECT_SEVERITY_RANK = Object.freeze({
  error: 1,
  warning: 2,
});

const SUGGESTION_PRIORITY_RANK = Object.freeze({
  strong: 1,
  moderate: 2,
  hint: 3,
});

const LEVEL_THRESHOLD_MAX_RANK = Object.freeze({
  strong: 1,
  moderate: 2,
  hint: 3,
  all: 3,
});

export function getItemTierKey(item) {
  if (item.kind === "defect") {
    return `defect:${item.severity || "error"}`;
  }
  return `suggestion:${item.priority || "moderate"}`;
}

function buildSegmentOrderMap(doc) {
  const map = new Map();
  doc.segments.forEach((seg, idx) => {
    map.set(seg.id, idx);
  });
  return map;
}

export function finalizeReportItems(rawItems, doc, { level = "all" } = {}) {
  const maxSuggestionRank = LEVEL_THRESHOLD_MAX_RANK[level] ?? 3;
  const segOrder = buildSegmentOrderMap(doc);
  const segById = new Map(doc.segments.map((s) => [s.id, s]));

  // Collect segments that already have a deterministic full-segment safe DELETE,
  // and (targetId, ruleId) pairs already reported deterministically.
  const fullyDeletedTargets = new Set();
  const deterministicTargetRules = new Set();
  for (const item of rawItems) {
    if (item._source !== "llm" && item.targetId && item.ruleId) {
      deterministicTargetRules.add(`${item.targetId}::${item.ruleId}`);
    }
    if (item.fixSafety === "safe" && item.actionType === "delete" && item.targetId) {
      const seg = segById.get(item.targetId);
      if (seg && String(item.originalQuote || "").trim() === seg.text.trim()) {
        fullyDeletedTargets.add(item.targetId);
      }
    }
  }

  const seen = new Set();
  const deduped = [];

  for (const item of rawItems) {
    if (item.kind === "suggestion") {
      if (item.fixSafety !== "safe" && item.targetId && fullyDeletedTargets.has(item.targetId)) {
        continue;
      }
      if (item._source === "llm" && item.targetId && deterministicTargetRules.has(`${item.targetId}::${item.ruleId}`)) {
        continue;
      }
      const pRank = SUGGESTION_PRIORITY_RANK[item.priority] ?? 2;
      if (pRank > maxSuggestionRank) continue;
    }

    const dedupeKey = `${item.targetId || `line:${item.line || 0}`}::${item.ruleId}::${item.originalQuote || ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    deduped.push(item);
  }

  deduped.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "defect" ? -1 : 1;
    }
    if (a.kind === "defect") {
      const sa = DEFECT_SEVERITY_RANK[a.severity] ?? 9;
      const sb = DEFECT_SEVERITY_RANK[b.severity] ?? 9;
      if (sa !== sb) return sa - sb;
    } else {
      const pa = SUGGESTION_PRIORITY_RANK[a.priority] ?? 9;
      const pb = SUGGESTION_PRIORITY_RANK[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
    }

    const ordA = a.targetId && segOrder.has(a.targetId) ? segOrder.get(a.targetId) : Number.MAX_SAFE_INTEGER;
    const ordB = b.targetId && segOrder.has(b.targetId) ? segOrder.get(b.targetId) : Number.MAX_SAFE_INTEGER;
    if (ordA !== ordB) return ordA - ordB;
    return (a.line || 0) - (b.line || 0);
  });

  return deduped.map((item, idx) => ({
    id: `item-${idx + 1}`,
    ...item,
  }));
}

export function computeSummaryCounts(items) {
  const summary = {
    defects: { error: 0, warning: 0 },
    suggestions: { strong: 0, moderate: 0, hint: 0 },
  };

  for (const item of items) {
    if (item._applied) continue;
    if (item.kind === "defect") {
      if (item.severity === "error") summary.defects.error += 1;
      else summary.defects.warning += 1;
    } else if (item.kind === "suggestion") {
      if (item.priority === "strong") summary.suggestions.strong += 1;
      else if (item.priority === "hint") summary.suggestions.hint += 1;
      else summary.suggestions.moderate += 1;
    }
  }

  return summary;
}

export function serializeCleanReportItem(item) {
  return {
    id: item.id,
    kind: item.kind,
    pack: item.pack,
    ruleId: item.ruleId,
    targetId: item.targetId,
    ...(item.line !== undefined ? { line: item.line } : {}),
    ...(item.kind === "defect" ? { severity: item.severity } : { priority: item.priority }),
    fixSafety: item.fixSafety,
    actionType: item.actionType,
    originalQuote: item.originalQuote,
    suggestedReplacement: item.suggestedReplacement,
    reason: item.reason,
    ...(item.rewritePrompt ? { rewritePrompt: item.rewritePrompt } : {}),
    ...(item.verificationNote ? { verificationNote: item.verificationNote } : {}),
  };
}

function resolveComparablePath(targetPath) {
  const abs = path.resolve(targetPath);
  if (fs.existsSync(abs)) {
    return fs.realpathSync(abs);
  }
  const parent = path.dirname(abs);
  if (fs.existsSync(parent)) {
    return path.join(fs.realpathSync(parent), path.basename(abs));
  }
  return abs;
}

function resolvePerFileSettings(filePath, cwd, config) {
  const realProjectBase = resolveComparablePath(config.projectDir || cwd);
  const realCwd = resolveComparablePath(cwd);
  const realTarget = resolveComparablePath(path.resolve(cwd, filePath));
  const relFromProject = path.relative(realProjectBase, realTarget).replace(/\\/g, "/");
  const relFromCwd = path.relative(realCwd, realTarget).replace(/\\/g, "/");

  let routing = config.routing || "local";
  let packs = config.packs || null;
  let packOrigin = config.packOrigin || "default";
  const extraPackSpecs =
    config.extraPackSpecs && config.extraPackSpecs.length > 0
      ? config.extraPackSpecs.map((x) => ({ ...x }))
      : (config.extraPacks || []).map((spec) => ({ spec, origin: config.packOrigin || "default" }));
  const rules = { ...(config.rules || {}) };
  let failOn = config.failOn || "error";
  let lang = config.lang || "auto";
  let level = config.level || "all";
  let ignored = false;
  let overrideLocal = false;

  for (const ov of config.overrides || []) {
    const matcher = compileIgnoreMatchers(ov.files || []);
    if (!matcher(relFromProject, false) && !matcher(relFromCwd, false)) continue;
    if (ov.ignore && ov.ignore.length > 0) {
      const ovIgnoreMatcher = compileIgnoreMatchers(ov.ignore);
      if (ovIgnoreMatcher(relFromProject, false) || ovIgnoreMatcher(relFromCwd, false)) {
        ignored = true;
      }
    }
    if (ov.routing !== undefined) {
      routing = ov.routing;
      overrideLocal = ov.routing === "local";
    }
    if (ov.packs !== undefined && packOrigin !== "cli") {
      packs = ov.packs;
      packOrigin = ov.origin || "project";
    }
    if (ov.extraPacks !== undefined) {
      for (const ep of ov.extraPacks) {
        const epOrigin = ov.origin || "project";
        const existing = extraPackSpecs.find((x) => x.spec === ep);
        if (!existing) {
          extraPackSpecs.push({ spec: ep, origin: epOrigin });
        } else if (epOrigin === "project" || epOrigin === "mcp") {
          existing.origin = epOrigin;
        }
      }
    }
    if (ov.rules) {
      Object.assign(rules, ov.rules);
    }
    if (ov.failOn !== undefined) failOn = ov.failOn;
    if (ov.lang !== undefined) lang = ov.lang;
    if (ov.level !== undefined) level = ov.level;
  }

  return {
    routing,
    packs,
    packOrigin,
    extraPackSpecs,
    rules,
    failOn,
    lang,
    level,
    ignored,
    overrideLocal,
    relFromProject,
    relFromCwd,
  };
}

function evaluateDeclarativeRules(doc, relPath, declarativeRules = []) {
  if (!declarativeRules || declarativeRules.length === 0) return [];
  const found = [];

  for (const rule of declarativeRules) {
    if (rule.formats && rule.formats.length > 0 && !rule.formats.includes(doc.format)) {
      continue;
    }
    if (rule.languages && rule.languages.length > 0 && !rule.languages.includes(doc.language)) {
      continue;
    }
    if (rule.files && rule.files.length > 0) {
      const matcher = compileIgnoreMatchers(rule.files);
      if (!matcher(relPath, false)) continue;
    }

    const matchers = [];
    if (rule.pattern) {
      const cleanFlags = `${rule.flags || "i"}`.replace(/g/g, "") + "g";
      matchers.push(new RegExp(rule.pattern, cleanFlags));
    }
    for (const term of rule.terms || []) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      matchers.push(new RegExp(escaped, `${rule.flags || "i"}`.replace(/g/g, "") + "g"));
    }

    for (const seg of doc.segments || []) {
      for (const rx of matchers) {
        rx.lastIndex = 0;
        const m = rx.exec(seg.text);
        if (!m) continue;
        const quote = m[0];
        const hasReplacement = rule.replacement !== undefined;
        found.push({
          kind: rule.kind,
          pack: "project/rules",
          ruleId: rule.id.includes("/") ? rule.id : `project/${rule.id}`,
          targetId: seg.id,
          ...(seg.line !== undefined ? { line: seg.line } : {}),
          ...(rule.kind === "defect" ? { severity: rule.severity } : { priority: rule.priority }),
          fixSafety: rule.fixSafety,
          actionType: rule.actionType || (hasReplacement ? (rule.replacement === "" ? "delete" : "replace") : "prompt"),
          originalQuote: quote,
          suggestedReplacement: hasReplacement ? rule.replacement : "",
          reason: rule.reason,
          locator: seg.locator || null,
        });
        break;
      }
    }
  }

  return found;
}

function applyRuleConfigOverrides(items, ruleOverrides = {}) {
  if (!ruleOverrides || Object.keys(ruleOverrides).length === 0) return items;
  const out = [];
  for (const item of items) {
    const bareId = item.ruleId.includes("/") ? item.ruleId.split("/").pop() : item.ruleId;
    const setting = ruleOverrides[item.ruleId] ?? ruleOverrides[bareId];
    if (setting === undefined) {
      out.push(item);
      continue;
    }
    const mode =
      typeof setting === "object"
        ? setting.enabled === false
          ? "off"
          : setting.severity || setting.level || "on"
        : String(setting);
    if (mode === "off") continue;
    const next = { ...item };
    if (next.kind === "defect" && (mode === "error" || mode === "warning")) {
      next.severity = mode;
    } else if (
      next.kind === "suggestion" &&
      (mode === "strong" || mode === "moderate" || mode === "hint")
    ) {
      next.priority = mode;
    }
    out.push(next);
  }
  return out;
}

/**
 * Execute Steps 2-6 of the 7-Step Kernel Pipeline for a single target file.
 * Enforces lazy stage-gated loading:
 * - Step 3 imports `scripts/` ONLY for admitted Packs with `hasScripts`.
 * - Step 4 reads/compiles `prompts/` ONLY when `!config.noLlm` AND `route.execute` is active!
 */
export async function runDocumentPipeline({
  filePath,
  textContent = null,
  bufferContent = null,
  config,
  route,
  voiceProfile = null,
  cwd = process.cwd(),
}) {
  const startedAt = Date.now();
  const effective = resolvePerFileSettings(filePath, cwd, config);
  const relDisplayPath = effective.relFromCwd || filePath;

  if (effective.ignored) {
    return {
      doc: null,
      activePacks: [],
      skippedByIgnore: true,
      effectiveFailOn: effective.failOn,
      report: null,
      items: [],
      routeHint: null,
      routeFallback: false,
      durationMs: Date.now() - startedAt,
    };
  }

  // Step 2: Document Parsing & Physical Coordinate Modeling
  let doc;
  try {
    doc =
      bufferContent !== null
        ? parseDocumentBuffer(bufferContent, filePath)
        : textContent !== null
          ? parseDocumentText(textContent, filePath)
          : parseDocumentFile(filePath);
  } catch (err) {
    throw new DislopConfigError(err.message);
  }

  const diagnosticLang = effective.lang && effective.lang !== "auto" ? effective.lang : doc.language;

  // Step 3: Zero-Import Metadata Admission + Lazy `scripts/` Execution
  // Always run deterministic Script Packs (even when `routing: "off"`, which disables LLM evaluation only)
  let activePacks;
  try {
    activePacks = await resolveActivePacks(doc, {
      packSpecifiers: effective.packs,
      extraPackSpecifiers: effective.extraPackSpecs,
      cwd,
      packOrigin: effective.packOrigin,
      projectDir: config.projectDir || cwd,
    });
  } catch (err) {
    throw new DislopConfigError(err.message);
  }

  const deterministicItems = [
    ...(await runDeterministicPackChecks(doc, activePacks, {
      diagnosticLang,
      cwd,
    })),
    ...evaluateDeclarativeRules(doc, effective.relFromProject, config.declarativeRules),
  ];

  // Step 4: Lazy `prompts/` Loading & 3-Tier LLM Evaluation (ONLY when an LLM route is active for this file!)
  const anyPackHasPrompts = activePacks.some((p) => p.hasPrompts);
  let llmItems = [];
  let documentToneAnchor = "";
  let engineUsed = "deterministic";
  let routeHint = null;

  const isRemoteRoute = Boolean(
    route && (route.tier === "cloud" || (route.tier === "byok" && !route.isLoopback)),
  );
  const suppressLlmForFile =
    Boolean(config.noLlm) ||
    effective.routing === "off" ||
    (effective.overrideLocal && isRemoteRoute);
  const fileRoute = suppressLlmForFile ? null : route;

  if (!suppressLlmForFile && anyPackHasPrompts && doc.segments.length > 0) {
    if (fileRoute && typeof fileRoute.execute === "function") {
      // Lazily read & compile `prompts/*.md` now that we know an LLM call will actually run
      const { rules: promptRules, roleHints } = await collectPackPromptRules(doc, activePacks, {
        diagnosticLang,
        cwd,
      });

      if (promptRules.length > 0) {
        engineUsed = fileRoute.engineLabel;
        const chunks = buildSlidingWindowChunks(doc, {
          maxInputTokens: fileRoute.maxInputTokens || 12000,
        });

        for (const chunk of chunks) {
          const payload = assemblePromptPayload({
            doc,
            promptRules,
            roleHints,
            voiceProfile,
            chunk,
            globalToneAnchor: documentToneAnchor || null,
            diagnosticLang,
          });

          try {
            const chunkDoc = {
              ...doc,
              filePath: path.basename(doc.filePath || "document"),
              segments: chunk.segments,
            };
            const rawResponse = await fileRoute.execute(payload, chunkDoc, promptRules);
            const normalized = normalizeLlmResponseItems(rawResponse, {
              doc,
              chunkSegments: chunk.segments,
              promptRules,
            });
            if (!documentToneAnchor && normalized.documentToneAnchor) {
              documentToneAnchor = normalized.documentToneAnchor;
            }
            llmItems.push(...normalized.items.map((item) => ({ ...item, _source: "llm" })));
          } catch (err) {
            if (err?.authError || config.explicitEngine) {
              throw new DislopConfigError(err.message);
            }
            engineUsed = "deterministic";
            routeHint = err?.ollamaMissing
              ? "💡 Ollama is missing on this machine; showing deterministic checks only. Install Ollama (https://ollama.com) for Tier 3 local LLM checks."
              : "💡 Local Ollama runtime unreachable (is 'ollama serve' running?); showing deterministic checks only.";
            llmItems = [];
            break;
          }
        }
      }
    } else if (route?.hint) {
      // Notice: `prompts/*.md` are NOT read at all when falling back to deterministic mode!
      routeHint = route.hint;
    }
  }

  // Step 5: Dual Post-LLM Fact Gate (lazily invokes `scripts/` `verifyFix` if present)
  const combinedRaw = [...deterministicItems, ...llmItems];
  const gatedItems = await applyDualFactGate(combinedRaw, doc, activePacks);
  const adjustedItems = applyRuleConfigOverrides(gatedItems, effective.rules);

  const orderedItems = finalizeReportItems(adjustedItems, doc, { level: effective.level || "all" });
  const summary = computeSummaryCounts(orderedItems);
  const coverage =
    doc.segments.length > 0
      ? { segmentCount: doc.segments.length, status: "inspected" }
      : {
          segmentCount: 0,
          status: "container-only",
          notice:
            "0 inspectable text segments extracted (visual-only or scanned file); container-level checks only.",
        };

  const report = {
    schema: "dislop.report/1",
    tool: { name: "dislop", version: DISLOP_VERSION },
    file: relDisplayPath.replace(/\\/g, "/"),
    language: doc.language,
    engine: engineUsed,
    mountedPacks: activePacks.map((p) => p.name),
    coverage,
    documentToneAnchor,
    summary,
    items: orderedItems.map(serializeCleanReportItem),
  };

  return {
    doc,
    activePacks,
    effectiveFailOn: effective.failOn,
    report,
    items: orderedItems,
    routeHint,
    routeFallback: Boolean(routeHint),
    durationMs: Date.now() - startedAt,
  };
}

export function arbitrateExitCode(entries, { failOn = "error", explicitFailOn = false } = {}) {
  for (const entry of entries) {
    const report = entry?.report || entry;
    const mode = explicitFailOn ? failOn : (entry?.effectiveFailOn || failOn || "error");
    if (mode === "none") continue;
    if ((report?.summary?.defects?.error || 0) > 0) {
      return 1;
    }
    if (mode === "warning" && (report?.summary?.defects?.warning || 0) > 0) {
      return 1;
    }
  }
  return 0;
}
