import path from "node:path";
import { DislopConfigError } from "./config.mjs";
import { parseDocumentFile } from "./document-model.mjs";
import { applyDualFactGate } from "./fact-gate.mjs";
import { resolveActivePacks, runDeterministicPackChecks } from "./pack-loader.mjs";
import {
  assemblePromptPayload,
  collectPackPromptRules,
  normalizeLlmResponseItems,
} from "./prompt-assembler.mjs";
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

  const seen = new Set();
  const deduped = [];

  for (const item of rawItems) {
    if (item.kind === "suggestion") {
      const pRank = SUGGESTION_PRIORITY_RANK[item.priority] ?? 2;
      if (pRank > maxSuggestionRank) continue;
    }

    const dedupeKey = `${item.targetId || `line:${item.line || 0}:${item.originalQuote}`}::${item.ruleId}`;
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

/**
 * Execute Steps 2-6 of the 7-Step Kernel Pipeline for a single target file.
 * Enforces lazy stage-gated loading:
 * - Step 3 imports `scripts/` ONLY for admitted Packs with `hasScripts`.
 * - Step 4 reads/compiles `prompts/` ONLY when `!config.noLlm` AND `route.execute` is active!
 */
export async function runDocumentPipeline({
  filePath,
  config,
  route,
  voiceProfile = null,
  cwd = process.cwd(),
}) {
  // Step 2: Document Parsing & Physical Coordinate Modeling
  let doc;
  try {
    doc = parseDocumentFile(filePath);
  } catch (err) {
    throw new DislopConfigError(err.message);
  }

  const diagnosticLang = config.lang && config.lang !== "auto" ? config.lang : doc.language;

  // Step 3: Zero-Import Metadata Admission + Lazy `scripts/` Execution
  let activePacks;
  try {
    activePacks = await resolveActivePacks(doc, {
      packSpecifiers: config.packs,
      cwd,
    });
  } catch (err) {
    throw new DislopConfigError(err.message);
  }

  const deterministicItems = await runDeterministicPackChecks(doc, activePacks, {
    diagnosticLang,
    cwd,
  });

  // Step 4: Lazy `prompts/` Loading & 3-Tier LLM Evaluation (ONLY when an LLM route is active!)
  const anyPackHasPrompts = activePacks.some((p) => p.hasPrompts);
  let llmItems = [];
  let documentToneAnchor = "";
  let engineUsed = "deterministic";
  let routeHint = null;

  if (!config.noLlm && anyPackHasPrompts && doc.segments.length > 0) {
    if (route && typeof route.execute === "function") {
      // Lazily read & compile `prompts/*.md` now that we know an LLM call will actually run
      const { rules: promptRules, roleHints } = await collectPackPromptRules(doc, activePacks, {
        diagnosticLang,
        cwd,
      });

      if (promptRules.length > 0) {
        engineUsed = route.engineLabel;
        const chunks = buildSlidingWindowChunks(doc, {
          maxInputTokens: route.maxInputTokens || 12000,
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
            const rawResponse = await route.execute(payload, doc, promptRules);
            const normalized = normalizeLlmResponseItems(rawResponse, {
              doc,
              chunkSegments: chunk.segments,
              promptRules,
            });
            if (!documentToneAnchor && normalized.documentToneAnchor) {
              documentToneAnchor = normalized.documentToneAnchor;
            }
            llmItems.push(...normalized.items);
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

  const orderedItems = finalizeReportItems(gatedItems, doc, { level: config.level || "all" });
  const summary = computeSummaryCounts(orderedItems);
  const relDisplayPath = path.relative(cwd, path.resolve(cwd, filePath)) || filePath;

  const report = {
    schema: "dislop.report/1",
    file: relDisplayPath.replace(/\\/g, "/"),
    language: doc.language,
    engine: engineUsed,
    mountedPacks: activePacks.map((p) => p.name),
    documentToneAnchor,
    summary,
    items: orderedItems.map(serializeCleanReportItem),
  };

  return {
    doc,
    activePacks,
    report,
    items: orderedItems,
    routeHint,
  };
}

export function arbitrateExitCode(reports) {
  for (const r of reports) {
    if ((r.summary?.defects?.error || 0) > 0) {
      return 1;
    }
  }
  return 0;
}
