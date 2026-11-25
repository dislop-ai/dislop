import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { decodeXmlEntities } from "./document-model.mjs";
import { readZipArchive, repackZipArchive } from "./ooxml-binary.mjs";

export function escapeXmlText(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function detectEol(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Expand a deleted `[start, end]` span slightly to consume orphaned adjacent single space
 * or empty list/heading lines so sentence deletion leaves clean typography.
 */
function adjustTextSpanForDeletion(source, start, end) {
  let s = start;
  let e = end;

  // Check if deleting this span leaves the rest of the line empty (or an empty list marker like `- `)
  let lineStart = source.lastIndexOf("\n", s - 1);
  lineStart = lineStart === -1 ? 0 : lineStart + 1;
  let lineEnd = source.indexOf("\n", e);
  const rawLineEnd = lineEnd === -1 ? source.length : lineEnd + 1;
  if (lineEnd === -1) lineEnd = source.length;
  const contentLineEnd = lineEnd > lineStart && source[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;

  const prefix = source.slice(lineStart, s);
  const suffix = source.slice(e, contentLineEnd);

  if (/^\s*(?:(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?|>\s+|#{1,6}\s+)?$/.test(prefix) && /^\s*$/.test(suffix)) {
    return { start: lineStart, end: rawLineEnd };
  }

  // Mid-line sentence deletion: eat trailing horizontal whitespace first, otherwise leading horizontal whitespace
  if (e < contentLineEnd && /[ \t]/.test(source[e])) {
    while (e < contentLineEnd && /[ \t]/.test(source[e])) e += 1;
  } else if (s > lineStart && /[ \t]/.test(source[s - 1])) {
    while (s > lineStart && /[ \t]/.test(source[s - 1])) s -= 1;
  }

  return { start: s, end: e };
}

function normalizePostPatchWhitespace(patched, eol) {
  const lf = patched.replace(/\r\n/g, "\n");
  const cleaned = lf
    // Strip orphaned leading comma/semicolon after sentence/clause deletion on a line
    .replace(/(^|\n)([ \t]*)[,;:，；：]+[ \t]*/g, "$1$2")
    // Collapse 3+ consecutive blank lines into a single blank line (2 newlines)
    .replace(/\n{3,}/g, "\n\n");
  return eol === "\r\n" ? cleaned.replace(/\n/g, "\r\n") : cleaned;
}

function resolveLocatorForPatch(doc, patch) {
  if (patch.locator) return patch.locator;
  if (!patch.targetId) return null;
  const seg = doc.segments.find((s) => s.id === patch.targetId);
  if (seg?.locator) {
    // If patch specifies originalQuote that is a substring inside the segment, narrow to exact quote if unique
    if (patch.originalQuote && patch.originalQuote !== seg.text && seg.locator.kind !== "ooxml-span") {
      const idx = seg.text.indexOf(patch.originalQuote);
      if (idx !== -1 && seg.text.indexOf(patch.originalQuote, idx + 1) === -1) {
        return {
          ...seg.locator,
          start: seg.locator.start + idx,
          end: seg.locator.start + idx + patch.originalQuote.length,
        };
      }
    }
    return seg.locator;
  }
  const para = doc.paragraphs?.find((p) => p.id === patch.targetId);
  return para?.locator || null;
}

/**
 * Apply accepted patches (`Array<{ targetId?, locator?, originalQuote?, replacement: string }>`)
 * to an in-memory UTF-8 text/markup document string.
 */
export function applyPatchesToText(sourceText, doc, patches) {
  if (!patches || patches.length === 0) return sourceText;
  const eol = detectEol(sourceText);

  const resolved = [];
  for (const patch of patches) {
    const loc = resolveLocatorForPatch(doc, patch);
    if (!loc || (loc.kind !== "text-span" && loc.kind !== "html-span")) continue;
    const replacement = String(patch.replacement ?? "");
    const span =
      replacement === "" && loc.kind === "text-span"
        ? adjustTextSpanForDeletion(sourceText, loc.start, loc.end)
        : { start: loc.start, end: loc.end };
    resolved.push({
      start: span.start,
      end: span.end,
      replacement,
    });
  }

  if (resolved.length === 0) return sourceText;

  // Sort in descending offset order and skip overlapping edits cleanly
  resolved.sort((a, b) => b.start - a.start || b.end - a.end);

  let out = sourceText;
  let minAppliedStart = Infinity;
  for (const edit of resolved) {
    if (edit.end > minAppliedStart) continue; // overlap guard
    out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end);
    minAppliedStart = edit.start;
  }

  return normalizePostPatchWhitespace(out, eol);
}

function patchSingleOoxmlParagraphXml(pXml, nsPrefix, charEdits) {
  const rTagRe = nsPrefix === "w" ? /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g : /<a:r\b[^>]*>[\s\S]*?<\/a:r>/g;
  const rPrTagRe = nsPrefix === "w" ? /<w:rPr\b[\s\S]*?<\/w:rPr>/ : /<a:rPr\b[\s\S]*?(?:\/>|<\/a:rPr>)/;
  const tTagRe = nsPrefix === "w" ? /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g : /<a:t(?:\s+[^>]*)?>([\s\S]*?)<\/a:t>/g;

  // Extract full text and preserve first run's rPr formatting
  let firstRPr = "";
  const rMatch = rTagRe.exec(pXml);
  if (rMatch) {
    const rPrMatch = rMatch[0].match(rPrTagRe);
    if (rPrMatch) firstRPr = rPrMatch[0];
  }

  const pieces = [];
  let tm;
  while ((tm = tTagRe.exec(pXml)) !== null) {
    pieces.push(decodeXmlEntities(tm[1]));
  }
  let fullText = pieces.join("");

  // Apply edits in descending charStart order
  const sorted = [...charEdits].sort((a, b) => b.charStart - a.charStart);
  let minStart = Infinity;
  for (const ed of sorted) {
    if (ed.charEnd > minStart) continue;
    let s = ed.charStart;
    let e = ed.charEnd;
    if (ed.replacement === "") {
      if (e < fullText.length && fullText[e] === " ") e += 1;
      else if (s > 0 && fullText[s - 1] === " ") s -= 1;
    }
    fullText = fullText.slice(0, s) + ed.replacement + fullText.slice(e);
    minStart = s;
  }

  const pPrRe = nsPrefix === "w" ? /<w:pPr\b[\s\S]*?<\/w:pPr>/ : /<a:pPr\b[\s\S]*?(?:\/>|<\/a:pPr>)/;
  const openTagMatch = pXml.match(/^<(?:w|a):p\b[^>]*>/);
  const openTag = openTagMatch ? openTagMatch[0] : `<${nsPrefix}:p>`;
  const pPrMatch = pXml.match(pPrRe);
  const pPr = pPrMatch ? pPrMatch[0] : "";

  if (!fullText.trim()) {
    return `${openTag}${pPr}</${nsPrefix}:p>`;
  }

  const escaped = escapeXmlText(fullText);
  if (nsPrefix === "w") {
    return `${openTag}${pPr}<w:r>${firstRPr}<w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
  }
  return `${openTag}${pPr}<a:r>${firstRPr}<a:t>${escaped}</a:t></a:r></a:p>`;
}

/**
 * Apply accepted patches to an OOXML (`.docx` / `.pptx`) archive buffer, returning a new Buffer.
 */
export function applyPatchesToOoxmlBuffer(originalBuffer, doc, patches) {
  if (!patches || patches.length === 0) return originalBuffer;
  const { xmlEntries } = readZipArchive(originalBuffer);

  // Group edits by entryName -> paragraphOrd
  const byEntry = new Map();
  for (const patch of patches) {
    const loc = resolveLocatorForPatch(doc, patch);
    if (!loc || loc.kind !== "ooxml-span") continue;
    let entryGroup = byEntry.get(loc.entryName);
    if (!entryGroup) {
      entryGroup = { nsPrefix: loc.nsPrefix, byPara: new Map() };
      byEntry.set(loc.entryName, entryGroup);
    }
    let paraEdits = entryGroup.byPara.get(loc.paragraphOrd);
    if (!paraEdits) {
      paraEdits = [];
      entryGroup.byPara.set(loc.paragraphOrd, paraEdits);
    }
    paraEdits.push({
      charStart: loc.charStart,
      charEnd: loc.charEnd,
      replacement: String(patch.replacement ?? ""),
    });
  }

  if (byEntry.size === 0) return originalBuffer;

  const updatedXml = {};
  for (const [entryName, group] of byEntry.entries()) {
    const xml = xmlEntries[entryName];
    if (!xml) continue;
    const pTagRe =
      group.nsPrefix === "w" ? /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g : /<a:p\b[^>]*>[\s\S]*?<\/a:p>/g;
    let pOrd = 0;
    updatedXml[entryName] = xml.replace(pTagRe, (pXml) => {
      const idx = pOrd;
      pOrd += 1;
      const edits = group.byPara.get(idx);
      if (!edits || edits.length === 0) return pXml;
      return patchSingleOoxmlParagraphXml(pXml, group.nsPrefix, edits);
    });
  }

  return repackZipArchive(originalBuffer, updatedXml);
}

/**
 * Render a compact unified diff preview between `beforeText` and `afterText`.
 */
export function renderUnifiedDiff(filePath, beforeText, afterText) {
  if (beforeText === afterText) return "";
  const aLines = beforeText.replace(/\r\n/g, "\n").split("\n");
  const bLines = afterText.replace(/\r\n/g, "\n").split("\n");

  const out = [`--- a/${filePath}`, `+++ b/${filePath}`];
  const maxLen = Math.max(aLines.length, bLines.length);
  let i = 0;
  while (i < maxLen) {
    if (aLines[i] === bLines[i]) {
      i += 1;
      continue;
    }
    const start = Math.max(0, i - 1);
    let endA = i;
    let endB = i;
    while (endA < aLines.length || endB < bLines.length) {
      if (endA < aLines.length && endB < bLines.length && aLines[endA] === bLines[endB]) break;
      if (endA < aLines.length) endA += 1;
      if (endB < bLines.length) endB += 1;
    }
    out.push(`@@ -${start + 1},${endA - start} +${start + 1},${endB - start} @@`);
    if (start < i) out.push(` ${aLines[start]}`);
    for (let k = i; k < endA; k += 1) {
      if (aLines[k] !== undefined) out.push(`-${aLines[k]}`);
    }
    for (let k = i; k < endB; k += 1) {
      if (bLines[k] !== undefined) out.push(`+${bLines[k]}`);
    }
    i = Math.max(endA, endB);
  }
  return out.join("\n");
}

/**
 * Apply patches to `doc.filePath` (supporting `--dry-run` and `--backup` atomic temp-file rename).
 */
export function patchDocumentOnDisk(doc, patches, { dryRun = false, backup = false } = {}) {
  if (!patches || patches.length === 0) {
    return { modified: false, diff: "" };
  }

  const filePath = doc.filePath;
  if (doc.format === "docx" || doc.format === "pptx") {
    const origBuf = fs.readFileSync(filePath);
    const nextBuf = applyPatchesToOoxmlBuffer(origBuf, doc, patches);
    if (origBuf.equals(nextBuf)) {
      return { modified: false, diff: "" };
    }
    const diffSummary = patches
      .map(
        (p) =>
          `--- a/${filePath} [${p.targetId || "ooxml"}]\n+++ b/${filePath} [${p.targetId || "ooxml"}]\n-${p.originalQuote || ""}\n+${p.replacement || "(deleted)"}`,
      )
      .join("\n");
    if (!dryRun) {
      atomicWriteBuffer(filePath, nextBuf, { backup });
    }
    return { modified: true, diff: diffSummary };
  }

  const origText = fs.readFileSync(filePath, "utf8");
  const nextText = applyPatchesToText(origText, doc, patches);
  if (origText === nextText) {
    return { modified: false, diff: "" };
  }

  const diff = renderUnifiedDiff(filePath, origText, nextText);
  if (!dryRun) {
    atomicWriteBuffer(filePath, Buffer.from(nextText, "utf8"), { backup });
  }
  return { modified: true, diff };
}

function atomicWriteBuffer(filePath, buffer, { backup = false } = {}) {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  const mode = fs.existsSync(resolved) ? fs.statSync(resolved).mode : 0o644;

  if (backup && fs.existsSync(resolved)) {
    fs.copyFileSync(resolved, `${resolved}.bak`);
  }

  const tmpName = `.dislop-tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  const tmpPath = path.join(dir, tmpName);
  try {
    fs.writeFileSync(tmpPath, buffer, { mode });
    fs.renameSync(tmpPath, resolved);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore cleanup failure
      }
    }
    throw err;
  }
}
