import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyBaselineFacts } from "../kernel/fact-gate.mjs";
import { patchDocumentOnDisk } from "../kernel/patcher.mjs";
import {
  computeSummaryCounts,
  getItemTierKey,
  serializeCleanReportItem,
} from "../kernel/pipeline.mjs";

function defaultClipboardCopy(text, platform = process.platform) {
  const candidates =
    platform === "darwin"
      ? [["pbcopy", []]]
      : platform === "win32"
        ? [["clip", []]]
        : [
            ["wl-copy", []],
            ["xclip", ["-selection", "clipboard"]],
            ["xsel", ["--clipboard", "--input"]],
          ];

  for (const [cmd, args] of candidates) {
    try {
      const res = spawnSync(cmd, args, { input: text, encoding: "utf8", stdio: ["pipe", "ignore", "ignore"] });
      if (res.status === 0) return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}

function defaultLaunchEditor(initialText, { env = process.env, platform = process.platform } = {}) {
  const editorCmd =
    env.VISUAL || env.EDITOR || (platform === "win32" ? "notepad" : "vi");
  const tmpFile = path.join(
    os.tmpdir(),
    `dislop-edit-${process.pid}-${crypto.randomBytes(4).toString("hex")}.md`,
  );
  fs.writeFileSync(tmpFile, initialText, "utf8");

  try {
    const parts = editorCmd.trim().split(/\s+/);
    const bin = parts[0];
    const args = [...parts.slice(1), tmpFile];
    const res = spawnSync(bin, args, { stdio: "inherit" });
    if (res.error || (res.status !== 0 && res.status !== null)) {
      return null;
    }
    return fs.readFileSync(tmpFile, "utf8");
  } finally {
    if (fs.existsSync(tmpFile)) {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore cleanup failure
      }
    }
  }
}

function createKeypressQueue(stdin) {
  const queue = [];
  let waiter = null;
  let closed = false;

  const pushChar = (ch) => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(ch);
    } else {
      queue.push(ch);
    }
  };

  const onData = (chunk) => {
    const str = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    for (const ch of str) {
      if (ch === "\u0003") {
        // Ctrl+C -> treat as quit without applying further
        pushChar("\u0003");
        continue;
      }
      if (ch === "\r" || ch === "\n" || ch === " " || ch === "\t") continue;
      pushChar(ch);
    }
  };

  const onEnd = () => {
    closed = true;
    if (waiter) {
      const w = waiter;
      waiter = null;
      w("q");
    }
  };

  const wasRaw = Boolean(stdin.isRaw);
  if (typeof stdin.setRawMode === "function" && stdin.isTTY) {
    stdin.setRawMode(true);
  }
  if (typeof stdin.resume === "function") {
    stdin.resume();
  }
  stdin.on("data", onData);
  stdin.on("end", onEnd);

  return {
    async nextKey() {
      if (queue.length > 0) return queue.shift();
      if (closed) return "q";
      return new Promise((resolve) => {
        waiter = resolve;
      });
    },
    dispose() {
      stdin.off("data", onData);
      stdin.off("end", onEnd);
      if (typeof stdin.setRawMode === "function" && stdin.isTTY) {
        stdin.setRawMode(wasRaw);
      }
      if (typeof stdin.pause === "function") {
        stdin.pause();
      }
    },
  };
}

function renderHunkBanner(item, index, total) {
  const kindLabel = item.kind.toUpperCase();
  const levelLabel = (item.kind === "defect" ? item.severity : item.priority).toUpperCase();
  const coordParts = [item.targetId, item.line ? `L${item.line}` : null].filter(Boolean).join(" | ");
  const coordDisplay = coordParts ? ` (${coordParts})` : "";

  const lines = [
    `\n── [${index + 1}/${total}] [${kindLabel} · ${levelLabel} · ${item.fixSafety}] ${item.ruleId}${coordDisplay} ──`,
    `Reason: ${item.reason}`,
  ];
  if (item.verificationNote) {
    lines.push(`Note  : ${item.verificationNote}`);
  }
  lines.push("");
  lines.push(`- ${item.originalQuote}`);
  if (item.actionType === "delete" && item.fixSafety !== "manual") {
    lines.push("+ (Delete sentence)");
  } else if (item.suggestedReplacement) {
    lines.push(`+ ${item.suggestedReplacement}`);
  } else if (item.rewritePrompt) {
    lines.push(`? Prompt: ${item.rewritePrompt}`);
  } else {
    lines.push("? (Manual edit required)");
  }
  lines.push("");
  lines.push(
    "Action: [y] accept  [n] skip  [e] edit ($EDITOR)  [p] copy rewrite prompt",
  );
  lines.push(
    "Batch : [a] accept remaining safe in tier  [A] accept all safe/review  [s] skip tier  [u] undo  [q] save & quit > ",
  );
  return lines.join("\n");
}

function canAutoAcceptItem(item) {
  if (item.fixSafety === "manual") return false;
  if (item.actionType === "delete") return Boolean(item.targetId || item._locator);
  if (item.actionType === "replace") {
    return Boolean(item.suggestedReplacement !== "" && (item.targetId || item._locator));
  }
  return false;
}

/**
 * Interactive TTY Hunk State Machine (`y/n/e/p/a/A/s/u/q`).
 */
export async function runInteractiveTtySession(
  docResult,
  {
    stdin = process.stdin,
    stdout = process.stdout,
    env = process.env,
    dryRun = false,
    backup = false,
    keyReader = null,
    editorRunner = null,
    clipboardRunner = null,
  } = {},
) {
  const { doc, items, report } = docResult;
  if (items.length === 0) {
    stdout.write(`${report.file}: clean (0 items)\n`);
    return { appliedCount: 0, modified: false, diff: "", report };
  }

  let reader = keyReader || createKeypressQueue(stdin);
  const ownedReader = !keyReader;

  // Map itemIndex -> decision `{ status: 'accepted' | 'skipped' | 'edited', patch?: Object }`
  let decisions = new Map();
  const undoStack = [];
  let idx = 0;

  const snapshotState = () => {
    undoStack.push({
      idx,
      decisions: new Map(decisions),
    });
  };

  try {
    while (idx < items.length) {
      const item = items[idx];
      stdout.write(renderHunkBanner(item, idx, items.length));

      const key = await reader.nextKey();
      stdout.write(`${key === "\u0003" ? "^C" : key}\n`);

      if (key === "\u0003") {
        // Abort immediately without saving
        return { appliedCount: 0, modified: false, diff: "", aborted: true, report };
      }

      if (key === "q") {
        break;
      }

      if (key === "u") {
        if (undoStack.length === 0) {
          stdout.write("  (Already at the first hunk; nothing to undo.)\n");
        } else {
          const prev = undoStack.pop();
          idx = prev.idx;
          decisions = prev.decisions;
          stdout.write(`  (Reverted back to hunk ${idx + 1}.)\n`);
        }
        continue;
      }

      if (key === "y") {
        if (!canAutoAcceptItem(item)) {
          stdout.write(
            "  Cannot auto-accept a 'manual' item without a verified replacement. Press [e] to edit or [p] to copy prompt.\n",
          );
          continue;
        }
        snapshotState();
        decisions.set(idx, {
          status: "accepted",
          patch: {
            targetId: item.targetId,
            locator: item._locator || null,
            originalQuote: item.originalQuote,
            replacement: item.actionType === "delete" ? "" : item.suggestedReplacement,
          },
        });
        idx += 1;
        continue;
      }

      if (key === "n") {
        snapshotState();
        decisions.set(idx, { status: "skipped" });
        idx += 1;
        continue;
      }

      if (key === "p") {
        const promptText =
          item.rewritePrompt ||
          `Revise "${item.originalQuote}" — ${item.reason}`;
        const copied = clipboardRunner
          ? await clipboardRunner(promptText)
          : defaultClipboardCopy(promptText);
        if (copied) {
          stdout.write("  Copied rewrite prompt to clipboard.\n");
        } else {
          stdout.write(`  Rewrite prompt:\n  ${promptText}\n`);
        }
        snapshotState();
        decisions.set(idx, { status: "skipped" });
        idx += 1;
        continue;
      }

      if (key === "e") {
        const seg = item.targetId ? doc.segments.find((s) => s.id === item.targetId) : null;
        const para = seg
          ? doc.paragraphs?.find((p) => p.id === seg.paragraphId)
          : null;
        const originalText = para ? para.text : item.originalQuote;
        const editTargetId = para ? para.id : item.targetId;

        if (!editTargetId && !item._locator) {
          stdout.write("  This item has no editable text span locator.\n");
          continue;
        }

        // Pause raw mode while spawning external interactive terminal editor, then resume cleanly
        if (ownedReader) reader.dispose();
        let editedRaw;
        try {
          editedRaw = editorRunner
            ? await editorRunner(originalText, item)
            : defaultLaunchEditor(originalText, { env });
        } finally {
          if (ownedReader) {
            reader = createKeypressQueue(stdin);
          }
        }

        if (editedRaw === null || editedRaw === undefined) {
          stdout.write("  Editor cancelled; keeping hunk undecided.\n");
          continue;
        }

        const trimmedEdited = String(editedRaw).replace(/\r?\n$/, "");
        if (trimmedEdited === originalText) {
          stdout.write("  No changes made in editor.\n");
          continue;
        }

        const factRes = verifyBaselineFacts(originalText, trimmedEdited);
        let keepManualEdit = true;
        if (!factRes.ok) {
          stdout.write(
            `  Fact check notice: ${factRes.summary}. Keep manual edit anyway? [y/N] `,
          );
          const confirmKey = await reader.nextKey();
          stdout.write(`${confirmKey}\n`);
          keepManualEdit = confirmKey.toLowerCase() === "y";
        }

        if (!keepManualEdit) {
          stdout.write("  Discarded manual edit.\n");
          continue;
        }

        snapshotState();
        decisions.set(idx, {
          status: "edited",
          patch: {
            targetId: editTargetId,
            locator: para ? para.locator : item._locator || null,
            originalQuote: originalText,
            replacement: trimmedEdited,
          },
        });
        idx += 1;
        continue;
      }

      if (key === "a") {
        snapshotState();
        const currentTier = getItemTierKey(item);
        let cursor = idx;
        while (cursor < items.length && getItemTierKey(items[cursor]) === currentTier) {
          const curItem = items[cursor];
          if (curItem.fixSafety === "safe" && canAutoAcceptItem(curItem)) {
            decisions.set(cursor, {
              status: "accepted",
              patch: {
                targetId: curItem.targetId,
                locator: curItem._locator || null,
                originalQuote: curItem.originalQuote,
                replacement:
                  curItem.actionType === "delete" ? "" : curItem.suggestedReplacement,
              },
            });
          } else {
            decisions.set(cursor, { status: "skipped" });
          }
          cursor += 1;
        }
        idx = cursor;
        continue;
      }

      if (key === "A") {
        snapshotState();
        for (let cursor = idx; cursor < items.length; cursor += 1) {
          const curItem = items[cursor];
          if (
            (curItem.fixSafety === "safe" || curItem.fixSafety === "review") &&
            canAutoAcceptItem(curItem)
          ) {
            decisions.set(cursor, {
              status: "accepted",
              patch: {
                targetId: curItem.targetId,
                locator: curItem._locator || null,
                originalQuote: curItem.originalQuote,
                replacement:
                  curItem.actionType === "delete" ? "" : curItem.suggestedReplacement,
              },
            });
          } else {
            decisions.set(cursor, { status: "skipped" });
          }
        }
        idx = items.length;
        continue;
      }

      if (key === "s") {
        snapshotState();
        const currentTier = getItemTierKey(item);
        let cursor = idx;
        while (cursor < items.length && getItemTierKey(items[cursor]) === currentTier) {
          decisions.set(cursor, { status: "skipped" });
          cursor += 1;
        }
        idx = cursor;
        continue;
      }

      stdout.write("  Unknown key. Choose one of [y, n, e, p, a, A, s, u, q].\n");
    }
  } finally {
    if (ownedReader) {
      reader.dispose();
    }
  }

  const patches = [];
  const appliedIndices = new Set();
  for (const [itemIdx, dec] of decisions.entries()) {
    if ((dec.status === "accepted" || dec.status === "edited") && dec.patch) {
      patches.push(dec.patch);
      appliedIndices.add(itemIdx);
    }
  }

  if (patches.length === 0) {
    stdout.write("\nNo edits accepted; file left unchanged.\n");
    return { appliedCount: 0, modified: false, diff: "", report };
  }

  const patchRes = patchDocumentOnDisk(doc, patches, { dryRun, backup });
  if (patchRes.modified && !dryRun) {
    for (const itemIdx of appliedIndices) {
      items[itemIdx]._applied = true;
    }
    const remaining = items.filter((i) => !i._applied);
    report.summary = computeSummaryCounts(remaining);
    report.items = remaining.map(serializeCleanReportItem);
    stdout.write(`\nSaved ${patches.length} change(s) to ${report.file}.\n`);
  } else if (dryRun && patchRes.diff) {
    stdout.write(`\n${patchRes.diff}\n`);
  }

  return {
    appliedCount: patchRes.modified ? patches.length : 0,
    modified: patchRes.modified,
    diff: patchRes.diff,
    report,
  };
}
