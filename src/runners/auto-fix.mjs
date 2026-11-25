import { computeSummaryCounts, serializeCleanReportItem } from "../kernel/pipeline.mjs";
import { patchDocumentOnDisk } from "../kernel/patcher.mjs";

/**
 * Batch Auto-Fix runner (`dislop fix --auto`):
 * Automatically applies ONLY verified `fixSafety === "safe"` items (`replace` or `delete`),
 * updating `report.summary` and `report.items` to reflect remaining unresolved findings.
 */
export function runAutoFixOnDocumentResult(docResult, { dryRun = false, backup = false } = {}) {
  const { doc, items, report } = docResult;

  const safeItems = items.filter(
    (item) =>
      item.fixSafety === "safe" &&
      (item.actionType === "delete" ||
        (item.actionType === "replace" && item.suggestedReplacement !== "")),
  );

  if (safeItems.length === 0) {
    return {
      appliedCount: 0,
      modified: false,
      diff: "",
      report,
    };
  }

  const patches = safeItems.map((item) => ({
    targetId: item.targetId,
    locator: item._locator || null,
    originalQuote: item.originalQuote,
    replacement: item.actionType === "delete" ? "" : item.suggestedReplacement,
  }));

  const patchRes = patchDocumentOnDisk(doc, patches, {
    dryRun,
    backup,
    displayPath: report.file,
  });

  if (patchRes.modified && !dryRun) {
    const appliedIds = new Set(safeItems.map((i) => i.id));
    for (const item of items) {
      if (appliedIds.has(item.id)) {
        item._applied = true;
      }
    }
    const remaining = items.filter((i) => !i._applied);
    report.summary = computeSummaryCounts(remaining);
    report.items = remaining.map(serializeCleanReportItem);
  }

  return {
    appliedCount: patchRes.modified ? safeItems.length : 0,
    modified: patchRes.modified,
    diff: patchRes.diff,
    report,
  };
}
