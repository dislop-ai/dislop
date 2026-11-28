import fs from "node:fs";
import path from "node:path";
import { inspectImageBuffer, inspectPdfBuffer, readZipArchive } from "./ooxml-binary.mjs";

const EXT_TO_FORMAT = Object.freeze({
  ".md": "md",
  ".markdown": "md",
  ".mdx": "mdx",
  ".txt": "txt",
  ".text": "txt",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".jsx": "jsx",
  ".tsx": "tsx",
  ".svg": "svg",
  ".docx": "docx",
  ".pptx": "pptx",
  ".pdf": "pdf",
  ".png": "png",
  ".jpg": "jpg",
  ".jpeg": "jpeg",
  ".webp": "webp",
  ".gif": "gif",
});

const FORMAT_TO_MODALITY = Object.freeze({
  md: "prose",
  mdx: "prose",
  txt: "prose",
  html: "markup",
  jsx: "markup",
  tsx: "markup",
  css: "stylesheet",
  svg: "vector",
  docx: "document",
  pptx: "presentation",
  pdf: "presentation",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
});

const ABBREVIATIONS = new Set([
  "e.g",
  "i.e",
  "vs",
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "fig",
  "eq",
  "no",
  "vol",
  "inc",
  "ltd",
  "co",
  "corp",
  "etc",
  "approx",
  "est",
]);

export function detectFormatFromPath(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  return EXT_TO_FORMAT[ext] || null;
}

export function detectDocumentLanguage(text) {
  const sample = String(text || "");
  const cjkMatches = sample.match(/[\u4e00-\u9fff]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonWs = sample.replace(/\s+/g, "").length;
  if (nonWs === 0) return "en";
  const ratio = cjkCount / nonWs;
  if (ratio >= 0.12 || (cjkCount >= 6 && ratio >= 0.04)) {
    return "zh";
  }
  return "en";
}

export function buildLineTable(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

export function offsetToLine(lineStarts, offset) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineStarts[mid] <= offset) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, hi) + 1;
}

export function decodeXmlEntities(str) {
  return String(str || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&");
}

/**
 * Split a prose slice into sentence spans `[{ relStart, relEnd, text }]` while protecting
 * inline code spans, Markdown links, decimals, and common English abbreviations.
 */
export function splitParagraphIntoSentences(slice) {
  const len = slice.length;
  const protectedMask = new Uint8Array(len);

  // Protect inline code `...`
  const codeRe = /`+[^`]+`+/g;
  let m;
  while ((m = codeRe.exec(slice)) !== null) {
    protectedMask.fill(1, m.index, m.index + m[0].length);
  }

  // Protect Markdown links [label](url) and raw URLs
  const linkRe = /\[[^\]]*\]\([^)\n]*\)|https?:\/\/[^\s)>\]]+/g;
  while ((m = linkRe.exec(slice)) !== null) {
    protectedMask.fill(1, m.index, m.index + m[0].length);
  }

  const spans = [];
  let sentStart = 0;

  const pushSpan = (rawStart, rawEnd) => {
    let s = rawStart;
    let e = rawEnd;
    while (s < e && /\s/.test(slice[s])) s += 1;
    while (e > s && /\s/.test(slice[e - 1])) e -= 1;
    if (e > s) {
      spans.push({
        relStart: s,
        relEnd: e,
        text: slice.slice(s, e),
      });
    }
  };

  for (let i = 0; i < len; i += 1) {
    if (protectedMask[i]) continue;
    const ch = slice[i];

    // CJK sentence-ending punctuation
    if (ch === "\u3002" || ch === "\uff01" || ch === "\uff1f") {
      if (ch === "\uff01") {
        const leadInZh = slice.slice(sentStart, i).trim();
        if (/^(?:\u597d\u7684|\u5f53\u7136|\u5f53\u7136\u53ef\u4ee5|\u6ca1\u95ee\u9898)$/.test(leadInZh) && i + 1 < len) {
          continue;
        }
      }
      let endIdx = i + 1;
      while (endIdx < len && /[\u201d\u2019\u300d\u300f\uff09\u300b"'\]\uff09]/.test(slice[endIdx])) endIdx += 1;
      pushSpan(sentStart, endIdx);
      sentStart = endIdx;
      i = endIdx - 1;
      continue;
    }

    // ASCII sentence-ending punctuation
    if (ch === "." || ch === "!" || ch === "?") {
      if (ch === "!") {
        const leadIn = slice.slice(sentStart, i).trim();
        if (
          /^(?:Certainly|Sure|Of course|Absolutely|Great|Awesome|Great question|Happy to help|Glad to help)$/i.test(
            leadIn,
          ) &&
          i + 1 < len &&
          /\s/.test(slice[i + 1])
        ) {
          continue;
        }
      }
      if (ch === ".") {
        // Ellipsis ...
        if (slice[i + 1] === "." || (i > 0 && slice[i - 1] === ".")) continue;
        // Decimal number 3.14 or version v1.2
        if (i > 0 && /\d/.test(slice[i - 1]) && i + 1 < len && /\d/.test(slice[i + 1])) continue;
        // Check preceding word for abbreviations
        const before = slice.slice(Math.max(0, i - 12), i);
        const wordMatch = before.match(/([A-Za-z]+(?:\.[A-Za-z]+)*)$/);
        if (wordMatch) {
          const word = wordMatch[1].toLowerCase();
          if (ABBREVIATIONS.has(word) || (word.length === 1 && /[A-Z]/.test(wordMatch[1]))) {
            continue;
          }
        }
      }

      let endIdx = i + 1;
      while (endIdx < len && /["')\]”’]/.test(slice[endIdx])) endIdx += 1;
      if (endIdx < len && !/\s/.test(slice[endIdx])) continue;

      pushSpan(sentStart, endIdx);
      sentStart = endIdx;
      i = endIdx - 1;
    }
  }

  if (sentStart < len) {
    pushSpan(sentStart, len);
  }
  return spans;
}

function detectRawMarkdownLeaksInRun(text, segmentId, line, locator) {
  const leaks = [];
  const rules = [
    { pattern: "bold-asterisks", re: /\*\*[^*\n]{2,120}\*\*/g },
    { pattern: "atx-heading", re: /(?:^|\n)\s*#{2,6}\s+\S[^\n]{1,120}/g },
    { pattern: "markdown-link", re: /\[[^\]\n]{1,80}\]\(https?:\/\/[^)\s]+\)/g },
    {
      pattern: "code-fence",
      re: /(?:^|\n)[ \t]*```[a-zA-Z0-9_+-]*[ \t]*(?:\r?\n|$)|```[a-zA-Z0-9_+-]*\r?\n[\s\S]*?```/g,
    },
  ];
  for (const { pattern, re } of rules) {
    let m;
    while ((m = re.exec(text)) !== null) {
      leaks.push({
        pattern,
        text: m[0],
        segmentId,
        ...(line !== undefined ? { line } : {}),
        ...(locator ? { locator } : {}),
      });
    }
  }
  return leaks;
}

function applySuppressionDirectives(rawText, masked) {
  let m;
  const blockDirectiveRe =
    /<!--\s*dislop-(?:ignore|quote|disable)-start\s*-->[\s\S]*?<!--\s*dislop-(?:ignore|quote|disable)-end\s*-->/gi;
  while ((m = blockDirectiveRe.exec(rawText)) !== null) {
    masked.fill(1, m.index, m.index + m[0].length);
  }
  const nextLineDirectiveRe =
    /<!--\s*dislop-(?:ignore|disable)(?:-next-line)?\s*-->[ \t]*\r?\n[^\r\n]*/gi;
  while ((m = nextLineDirectiveRe.exec(rawText)) !== null) {
    masked.fill(1, m.index, m.index + m[0].length);
  }
}

function splitMarkdownTableRow(rowText, rowStart) {
  const cells = [];
  let inCode = false;
  let cellStart = 0;
  const len = rowText.length;
  for (let i = 0; i < len; i += 1) {
    const ch = rowText[i];
    if (ch === "`") {
      inCode = !inCode;
      continue;
    }
    if (ch === "\\" && i + 1 < len) {
      i += 1;
      continue;
    }
    if (!inCode && ch === "|") {
      const rawCell = rowText.slice(cellStart, i);
      const lead = rawCell.match(/^\s*/)[0].length;
      const trail = rawCell.match(/\s*$/)[0].length;
      const s = rowStart + cellStart + lead;
      const e = rowStart + i - trail;
      if (e > s) cells.push({ start: s, end: e, text: rowText.slice(cellStart + lead, i - trail) });
      cellStart = i + 1;
    }
  }
  if (cellStart < len) {
    const rawCell = rowText.slice(cellStart);
    const lead = rawCell.match(/^\s*/)[0].length;
    const trail = rawCell.match(/\s*$/)[0].length;
    const s = rowStart + cellStart + lead;
    const e = rowStart + len - trail;
    if (e > s) cells.push({ start: s, end: e, text: rowText.slice(cellStart + lead, len - trail) });
  }
  return cells;
}

function parseMarkdownOrText(rawText, filePath, format) {
  const lineStarts = buildLineTable(rawText);
  const len = rawText.length;
  const masked = new Uint8Array(len);
  const codeBlocks = [];
  const links = [];
  const rawFormattingLeaks = [];

  // 1. Mask YAML frontmatter at byte 0
  if (format === "md" || format === "mdx") {
    const fmMatch = rawText.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
    if (fmMatch) {
      masked.fill(1, 0, fmMatch[0].length);
    }
  }

  // 2. Mask fenced code blocks ``` or ~~~ and HTML/suppression comments
  if (format === "md" || format === "mdx") {
    const fenceRe = /(^[ \t]*(`{3,}|~{3,})([^\r\n]*)\r?\n)([\s\S]*?)(^[ \t]*\2[ \t]*(?:\r?\n|$))/gm;
    let m;
    while ((m = fenceRe.exec(rawText)) !== null) {
      masked.fill(1, m.index, m.index + m[0].length);
      codeBlocks.push({
        lang: m[3].trim(),
        content: m[4],
        line: offsetToLine(lineStarts, m.index),
      });
    }

    applySuppressionDirectives(rawText, masked);

    const commentRe = /<!--[\s\S]*?-->/g;
    while ((m = commentRe.exec(rawText)) !== null) {
      masked.fill(1, m.index, m.index + m[0].length);
    }
  }

  // 3. Mask MDX top-level import/export statements
  if (format === "mdx") {
    const mdxImportRe = /^(?:import|export)\s+[^\r\n]+(?:\r?\n|$)/gm;
    let m;
    while ((m = mdxImportRe.exec(rawText)) !== null) {
      if (!masked[m.index]) masked.fill(1, m.index, m.index + m[0].length);
    }
  }

  // 4. Scan lines into logical paragraphs
  const lines = [];
  let cursor = 0;
  while (cursor <= len) {
    const nl = rawText.indexOf("\n", cursor);
    const lineEnd = nl === -1 ? len : nl;
    const contentEnd = lineEnd > cursor && rawText[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;
    lines.push({
      start: cursor,
      end: contentEnd,
      rawEnd: nl === -1 ? len : nl + 1,
      lineNumber: lines.length + 1,
      text: rawText.slice(cursor, contentEnd),
    });
    if (nl === -1) break;
    cursor = nl + 1;
  }

  const rawBlocks = [];
  let currentLines = [];

  const flushCurrent = () => {
    if (currentLines.length === 0) return;
    rawBlocks.push({ kind: "prose", lines: currentLines });
    currentLines = [];
  };

  for (const ln of lines) {
    if (ln.start < len && masked[ln.start]) {
      flushCurrent();
      continue;
    }
    const trimmed = ln.text.trim();
    if (!trimmed) {
      flushCurrent();
      continue;
    }
    // Mask Markdown blockquotes (> ...) so quoted external copy never triggers author-prose warnings
    if ((format === "md" || format === "mdx") && /^\s*>/.test(ln.text)) {
      flushCurrent();
      masked.fill(1, ln.start, ln.rawEnd);
      continue;
    }
    // Table separator rows |---|---|
    if ((format === "md" || format === "mdx") && /^\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(trimmed)) {
      flushCurrent();
      continue;
    }
    // Pipe table rows | a | b |
    if ((format === "md" || format === "mdx") && /^\s*\|.*\|\s*$/.test(ln.text)) {
      flushCurrent();
      rawBlocks.push({ kind: "table-row", lines: [ln] });
      continue;
    }
    // Horizontal rules
    if ((format === "md" || format === "mdx") && /^(?:---+|\*\*\*+|___+)$/.test(trimmed)) {
      flushCurrent();
      continue;
    }
    // Headings & list items each form clean standalone addressable blocks
    if ((format === "md" || format === "mdx") && /^\s*#{1,6}\s+/.test(ln.text)) {
      flushCurrent();
      rawBlocks.push({ kind: "heading", lines: [ln] });
      continue;
    }
    if ((format === "md" || format === "mdx") && /^\s*(?:[-*+]|\d+\.|[\u2460-\u2473])\s+/.test(ln.text)) {
      flushCurrent();
      rawBlocks.push({ kind: "list-item", lines: [ln] });
      continue;
    }
    currentLines.push(ln);
  }
  flushCurrent();

  const segments = [];
  const paragraphs = [];
  let pCounter = 0;

  for (const blockEntry of rawBlocks) {
    const blk = blockEntry.lines;
    const blkStart = blk[0].start;
    const blkEnd = blk[blk.length - 1].end;

    if (blockEntry.kind === "table-row") {
      const cells = splitMarkdownTableRow(blk[0].text, blkStart);
      for (const cell of cells) {
        pCounter += 1;
        const paragraphId = `P${pCounter}`;
        const sentenceSpans = splitParagraphIntoSentences(cell.text);
        if (sentenceSpans.length === 0) continue;
        const segIds = [];
        let sCounter = 0;
        for (const sp of sentenceSpans) {
          sCounter += 1;
          const absStart = cell.start + sp.relStart;
          const absEnd = cell.start + sp.relEnd;
          const id = `${paragraphId}-S${sCounter}`;
          segIds.push(id);
          segments.push({
            id,
            paragraphId,
            blockKind: "table-cell",
            line: offsetToLine(lineStarts, absStart),
            text: sp.text,
            locator: {
              kind: "text-span",
              start: absStart,
              end: absEnd,
              lineStart: blkStart,
              lineEnd: blk[0].rawEnd,
            },
          });
        }
        paragraphs.push({
          id: paragraphId,
          blockKind: "table-cell",
          line: offsetToLine(lineStarts, cell.start),
          text: cell.text,
          segmentIds: segIds,
          locator: {
            kind: "text-span",
            start: cell.start,
            end: cell.end,
            lineStart: blkStart,
            lineEnd: blk[0].rawEnd,
          },
        });
      }
      continue;
    }

    let bodyStart = blkStart;
    const firstText = blk[0].text;
    let blockKind = blockEntry.kind === "prose" ? "paragraph" : blockEntry.kind;

    if (format === "md" || format === "mdx") {
      const headingPrefix = firstText.match(/^(\s*#{1,6}\s+)/);
      const listPrefix = !headingPrefix
        ? firstText.match(/^(\s*(?:[-*+]|\d+\.|[\u2460-\u2473])\s+(?:\[[ xX]\]\s+)?)/)
        : null;
      const prefix = headingPrefix?.[1] || listPrefix?.[1] || "";
      bodyStart += prefix.length;
    }

    const slice = rawText.slice(bodyStart, blkEnd);
    if (!slice.trim()) continue;

    pCounter += 1;
    const paragraphId = `P${pCounter}`;
    const sentenceSpans = splitParagraphIntoSentences(slice);
    if (sentenceSpans.length === 0) continue;

    const segIds = [];
    let sCounter = 0;
    for (const sp of sentenceSpans) {
      sCounter += 1;
      const absStart = bodyStart + sp.relStart;
      const absEnd = bodyStart + sp.relEnd;
      const segLine = offsetToLine(lineStarts, absStart);
      const id = `${paragraphId}-S${sCounter}`;
      segIds.push(id);
      segments.push({
        id,
        paragraphId,
        blockKind,
        line: segLine,
        text: sp.text,
        locator: {
          kind: "text-span",
          start: absStart,
          end: absEnd,
          lineStart: blkStart,
          lineEnd: blk[blk.length - 1].rawEnd,
        },
      });
    }

    paragraphs.push({
      id: paragraphId,
      blockKind,
      line: offsetToLine(lineStarts, bodyStart),
      text: slice,
      segmentIds: segIds,
      locator: {
        kind: "text-span",
        start: bodyStart,
        end: blkEnd,
        lineStart: blkStart,
        lineEnd: blk[blk.length - 1].rawEnd,
      },
    });
  }

  // 5. Extract Markdown links outside masked regions & inline code
  if (format === "md" || format === "mdx") {
    const inlineCodeMask = new Uint8Array(masked);
    const icRe = /`+[^`]+`+/g;
    let im;
    while ((im = icRe.exec(rawText)) !== null) {
      inlineCodeMask.fill(1, im.index, im.index + im[0].length);
    }

    const mdLinkRe = /!?\[([^\]\n]*)\]\((<[^>\n]*>|[^)\n]*)\)/g;
    let lm;
    while ((lm = mdLinkRe.exec(rawText)) !== null) {
      if (inlineCodeMask[lm.index]) continue;
      let rawUrl = lm[2].trim().replace(/\s+["'][^"']*["']$/, "");
      const angleMatch = rawUrl.match(/^<([\s\S]*)>$/);
      if (angleMatch) rawUrl = angleMatch[1].trim();
      const line = offsetToLine(lineStarts, lm.index);
      const seg = segments.find(
        (s) => s.locator.start <= lm.index && s.locator.end >= lm.index + lm[0].length,
      );
      links.push({
        url: rawUrl,
        label: lm[1],
        raw: lm[0],
        ...(seg ? { segmentId: seg.id } : {}),
        line,
        locator: { kind: "text-span", start: lm.index, end: lm.index + lm[0].length },
      });
    }
  }

  const proseCorpus = segments.map((s) => s.text).join("\n") || rawText;
  return {
    filePath,
    format,
    modality: FORMAT_TO_MODALITY[format] || "prose",
    language: detectDocumentLanguage(proseCorpus),
    segments,
    paragraphs,
    artifacts: {
      links,
      codeBlocks,
      rawFormattingLeaks,
    },
  };
}

function parseLengthPx(rawVal) {
  if (!rawVal) return null;
  const m = String(rawVal).trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
  return m ? Number(m[1]) : null;
}

function parseButtonAttributes(attrs) {
  const list = [];
  let i = 0;
  const len = attrs.length;
  while (i < len) {
    while (i < len && /\s/.test(attrs[i])) i += 1;
    if (i >= len || attrs[i] === "/") break;
    const nameStart = i;
    while (i < len && !/[\s=/>]/.test(attrs[i])) i += 1;
    const name = attrs.slice(nameStart, i);
    if (!name) {
      i += 1;
      continue;
    }
    while (i < len && /\s/.test(attrs[i])) i += 1;
    let rawValue = null;
    if (i < len && attrs[i] === "=") {
      i += 1;
      while (i < len && /\s/.test(attrs[i])) i += 1;
      if (i < len && (attrs[i] === '"' || attrs[i] === "'")) {
        const q = attrs[i];
        const vStart = i;
        i += 1;
        while (i < len && attrs[i] !== q) {
          if (attrs[i] === "\\" && i + 1 < len) i += 2;
          else i += 1;
        }
        if (i < len) i += 1;
        rawValue = attrs.slice(vStart, i);
      } else if (i < len && attrs[i] === "{") {
        const vStart = i;
        let depth = 0;
        let innerQ = null;
        while (i < len) {
          const ch = attrs[i];
          if (innerQ) {
            if (ch === "\\" && i + 1 < len) {
              i += 2;
              continue;
            }
            if (ch === innerQ) innerQ = null;
          } else {
            if (ch === '"' || ch === "'" || ch === "`") innerQ = ch;
            else if (ch === "{") depth += 1;
            else if (ch === "}") {
              depth -= 1;
              if (depth === 0) {
                i += 1;
                break;
              }
            }
          }
          i += 1;
        }
        rawValue = attrs.slice(vStart, i);
      } else {
        const vStart = i;
        while (i < len && !/[\s>]/.test(attrs[i])) i += 1;
        rawValue = attrs.slice(vStart, i);
      }
    }
    list.push({ name, lowerName: name.toLowerCase(), rawValue });
  }
  return list;
}

function unquoteAttrValue(rawValue) {
  if (!rawValue) return "";
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1);
  }
  return rawValue;
}

function extractButtonElements(rawSource) {
  const buttons = [];
  const openRe = /<button(?=[\s>/])/gi;
  const closeRe = /<\/button>/gi;
  let noMoreClose = false;
  let openMatch;
  while ((openMatch = openRe.exec(rawSource)) !== null) {
    const start = openMatch.index;
    let i = start + 7;
    let quote = null;
    let braceDepth = 0;
    let tagEnd = -1;
    while (i < rawSource.length) {
      const ch = rawSource[i];
      if (quote) {
        if (ch === "\\" && i + 1 < rawSource.length) {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
      } else {
        if (ch === '"' || ch === "'" || ch === "`") quote = ch;
        else if (ch === "{") braceDepth += 1;
        else if (ch === "}" && braceDepth > 0) braceDepth -= 1;
        else if (ch === ">" && braceDepth === 0) {
          tagEnd = i;
          break;
        }
      }
      i += 1;
    }
    if (tagEnd === -1) break;
    const attrs = rawSource.slice(start + 7, tagEnd);
    if (attrs.trimEnd().endsWith("/")) {
      openRe.lastIndex = tagEnd + 1;
      continue;
    }
    if (noMoreClose) {
      openRe.lastIndex = tagEnd + 1;
      continue;
    }
    closeRe.lastIndex = tagEnd + 1;
    const closeMatch = closeRe.exec(rawSource);
    if (!closeMatch) {
      noMoreClose = true;
      openRe.lastIndex = tagEnd + 1;
      continue;
    }
    const closeIdx = closeMatch.index;
    buttons.push({
      attrs,
      innerHtml: rawSource.slice(tagEnd + 1, closeIdx),
      fullText: rawSource.slice(start, closeIdx + 9),
      offset: start,
    });
    openRe.lastIndex = closeIdx + 9;
  }
  return buttons;
}

function collectUiSignals(rawSource, format, scriptText = "") {
  const purplePinkGradients = [];
  const glowBlobs = [];
  const pillBadges = [];
  const disabledButtonsWithoutTitle = [];
  let missingSvgViewBox = false;

  const gradRe =
    /(?:from-(?:purple|indigo|violet|fuchsia)-\d{2,3}[^\n"']{0,60}(?:via|to)-(?:pink|purple|fuchsia|indigo|cyan)-\d{2,3}|linear-gradient\([^)]*(?:#(?:8b5cf6|a855f7|ec4899|6366f1|d946ef)|purple|violet|magenta)[^)]*\))/gi;
  let m;
  while ((m = gradRe.exec(rawSource)) !== null) {
    purplePinkGradients.push({ text: m[0], offset: m.index });
  }

  // SVG purple-pink gradients
  const svgGradRe = /<(?:linearGradient|radialGradient)\b[\s\S]*?<\/(?:linearGradient|radialGradient)>/gi;
  while ((m = svgGradRe.exec(rawSource)) !== null) {
    const block = m[0];
    const hasPurpleStop = /#(?:8b5cf6|a855f7|6366f1|7c3aed)\b/i.test(block);
    const hasPinkOrCyanStop = /#(?:ec4899|d946ef|f43f5e|06b6d4)\b/i.test(block);
    if (hasPurpleStop && hasPinkOrCyanStop) {
      purplePinkGradients.push({ text: block.slice(0, 120), offset: m.index });
    }
  }

  const blobRe = /\bblur-3xl\b[^\n"']{0,80}\b(?:opacity-(?:20|30|40)|animate-pulse|rounded-full)\b/gi;
  while ((m = blobRe.exec(rawSource)) !== null) {
    glowBlobs.push({ text: m[0], offset: m.index });
  }

  const cssBlurRe = /filter\s*:\s*blur\(\s*(?:[4-9]\d|\d{3,})px\s*\)/gi;
  while ((m = cssBlurRe.exec(rawSource)) !== null) {
    glowBlobs.push({ text: m[0], offset: m.index });
  }

  const svgBlurRe = /<feGaussianBlur\b[^>]*\bstdDeviation\s*=\s*["']?(?:1[2-9]|[2-9]\d|\d{3,})\b[^>]*>/gi;
  while ((m = svgBlurRe.exec(rawSource)) !== null) {
    glowBlobs.push({ text: m[0], offset: m.index });
  }

  const pillRe =
    /<(?:span|div)\b([^>]*class(?:Name)?=["'][^"']*\brounded-full\b[^"']*["'][^>]*)>([^<]{1,40})<\/(?:span|div)>/gi;
  while ((m = pillRe.exec(rawSource)) !== null) {
    const classMatch = m[1].match(/\bclass(?:Name)?=["']([^"']*)["']/i);
    const cls = classMatch ? classMatch[1] : "";
    const inner = m[2].trim();
    const isSquareAvatar =
      /\bw-(\d+(?:\.\d+)?)\b[^\n"']*\bh-\1\b/.test(cls) ||
      /\bh-(\d+(?:\.\d+)?)\b[^\n"']*\bw-\1\b/.test(cls) ||
      /\bsize-\d+\b/.test(cls);
    if (!inner || isSquareAvatar || /^[A-Z]{1,2}$/.test(inner)) {
      continue;
    }
    pillBadges.push({ text: m[0], offset: m.index });
  }

  for (const btn of extractButtonElements(rawSource)) {
    const attrList = parseButtonAttributes(btn.attrs);
    if (
      attrList.some(
        (a) => a.lowerName === "title" || a.lowerName === "aria-label" || a.lowerName === "aria-describedby",
      )
    ) {
      continue;
    }
    const disabledAttr = attrList.find((a) => a.lowerName === "disabled");
    if (!disabledAttr) continue;
    if (disabledAttr.rawValue && disabledAttr.rawValue.startsWith("{") && disabledAttr.rawValue.endsWith("}")) {
      if (disabledAttr.rawValue.slice(1, -1).trim() !== "true") continue;
    }
    if (
      format === "html" &&
      attrList.some((a) => a.lowerName === "onclick" || a.lowerName === "@click" || a.lowerName === "v-on:click")
    ) {
      continue;
    }
    const innerText = btn.innerHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const isLoadingLabel =
      /(?:\.\.\.|\u2026|\b(?:loading|pending|preparing|initializing|saving|submitting|connecting|please wait)\b|\u51c6\u5907\u4e2d|\u52a0\u8f7d\u4e2d|\u5904\u7406\u4e2d|\u751f\u6210\u4e2d|\u8bf7\u7a0d\u5019)/i.test(
        innerText,
      );
    if (isLoadingLabel) continue;
    const idAttr = attrList.find((a) => a.lowerName === "id");
    const btnId = idAttr ? unquoteAttrValue(idAttr.rawValue) : "";
    if (btnId && scriptText) {
      const escId = btnId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escId}\\b`).test(scriptText)) continue;
    }
    if (
      scriptText &&
      attrList.some((a) => {
        if (!a.lowerName.startsWith("data-")) return false;
        const escData = a.lowerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(?<![A-Za-z0-9_-])${escData}(?![A-Za-z0-9_-])`).test(scriptText);
      })
    ) {
      continue;
    }
    disabledButtonsWithoutTitle.push({ text: btn.fullText, offset: btn.offset });
  }

  if (format === "svg" && /<svg\b/i.test(rawSource)) {
    const svgOpen = rawSource.match(/<svg\b[^>]*>/i);
    if (svgOpen && !/\bviewBox\s*=/i.test(svgOpen[0])) {
      const wMatch = svgOpen[0].match(/\bwidth\s*=\s*["']([^"']+)["']/i);
      const hMatch = svgOpen[0].match(/\bheight\s*=\s*["']([^"']+)["']/i);
      const wPx = parseLengthPx(wMatch?.[1]);
      const hPx = parseLengthPx(hMatch?.[1]);
      const isSmallIcon = wPx !== null && hPx !== null && wPx <= 48 && hPx <= 48;
      if (!isSmallIcon) {
        missingSvgViewBox = true;
      }
    }
  }

  const backdropBlurMatches = rawSource.match(
    /\bbackdrop-blur(?:-(?:sm|md|lg|xl|2xl|3xl))?\b|backdrop-filter\s*:\s*blur\(/gi,
  );
  const backdropBlurCount = backdropBlurMatches ? backdropBlurMatches.length : 0;

  return {
    purplePinkGradients,
    glowBlobs,
    pillBadges,
    disabledButtonsWithoutTitle,
    missingSvgViewBox,
    backdropBlurCount,
  };
}

const HTML_VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const PROSE_ELEMENT_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "figcaption",
  "td",
  "th",
  "dt",
  "dd",
  "summary",
  "blockquote",
  "button",
  "label",
  "text",
  "div",
  "span",
  "a",
]);

function maskElementsByAttr(rawText, masked, attrRe) {
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/g;
  const ignoreStack = [];
  let m;
  while ((m = tagRe.exec(rawText)) !== null) {
    const isClose = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = m[3] || "";
    const selfClose = /\/\s*$/.test(attrs) || HTML_VOID_TAGS.has(tag);

    if (!isClose) {
      if (selfClose) {
        if (attrRe.test(attrs)) masked.fill(1, m.index, m.index + m[0].length);
      } else {
        ignoreStack.push({ tag, start: m.index, ignored: attrRe.test(attrs) });
      }
    } else {
      for (let i = ignoreStack.length - 1; i >= 0; i -= 1) {
        if (ignoreStack[i].tag === tag) {
          const popped = ignoreStack.splice(i, ignoreStack.length - i)[0];
          if (popped.ignored) {
            masked.fill(1, popped.start, m.index + m[0].length);
          }
          break;
        }
      }
    }
  }
}

function collectHtmlProseBlocks(rawText, proseMask) {
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/g;
  const stack = [];
  const candidates = [];
  let m;

  while ((m = tagRe.exec(rawText)) !== null) {
    if (proseMask[m.index]) continue;
    const isClose = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = m[3] || "";
    const selfClose = /\/\s*$/.test(attrs) || HTML_VOID_TAGS.has(tag);

    if (!isClose) {
      if (!selfClose) {
        stack.push({ tag, openStart: m.index, innerStart: m.index + m[0].length });
      }
      continue;
    }

    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].tag === tag) {
        const popped = stack.splice(i, stack.length - i)[0];
        if (!PROSE_ELEMENT_TAGS.has(tag)) break;
        const innerEnd = m.index;
        const rawInner = rawText.slice(popped.innerStart, innerEnd);
        if (!rawInner.trim()) break;

        const hasNestedBlock =
          /<(?:div|section|article|main|header|footer|nav|aside|ul|ol|dl|table|thead|tbody|tr|p|h[1-6]|li|blockquote|pre|figure|figcaption|form|svg)\b/i.test(
            rawInner,
          );
        const hasNestedInlineContainer = /<(?:td|th|dt|dd|summary|button|label|text|span|a)\b/i.test(rawInner);

        if (tag === "div" && (hasNestedBlock || hasNestedInlineContainer)) break;
        if ((tag === "span" || tag === "a") && (hasNestedBlock || hasNestedInlineContainer)) break;
        if (hasNestedBlock) break;

        candidates.push({
          tag,
          openStart: popped.openStart,
          innerStart: popped.innerStart,
          innerEnd,
          rawInner,
          inTableCell: stack.some((s) => s.tag === "td" || s.tag === "th"),
        });
        break;
      }
    }
  }

  candidates.sort((a, b) => a.innerStart - b.innerStart);
  const filtered = [];
  for (const cand of candidates) {
    if (cand.tag === "span" || cand.tag === "a") {
      const insideEmitted = filtered.some(
        (p) => cand.openStart >= p.innerStart && cand.innerEnd <= p.innerEnd,
      );
      if (insideEmitted) continue;
    }
    filtered.push(cand);
  }
  return filtered;
}

function normalizeHtmlInnerToPieces(rawInner, innerOffset) {
  // Split on <br> tags into logical line pieces while keeping rough source offsets
  const brSplitRe = /<br\s*\/?>/gi;
  const parts = [];
  let lastIdx = 0;
  let bm;
  while ((bm = brSplitRe.exec(rawInner)) !== null) {
    parts.push({ raw: rawInner.slice(lastIdx, bm.index), offset: innerOffset + lastIdx });
    lastIdx = bm.index + bm[0].length;
  }
  parts.push({ raw: rawInner.slice(lastIdx), offset: innerOffset + lastIdx });

  const out = [];
  for (const part of parts) {
    const raw = part.raw;
    if (!raw.trim()) continue;
    // Convert inline <code>...</code> to backtick spans so maskInlineCode protects them
    const withInlineCode = raw
      .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, body) => `\`${decodeXmlEntities(body).trim()}\``)
      .replace(/<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s+[^>]*)?>/g, "")
      .replace(/(?<!\{)\{[^{}\n]{1,120}\}(?!\})/g, "");
    const decoded = decodeXmlEntities(withInlineCode);
    if (!decoded.trim()) continue;
    out.push({
      rawPart: raw,
      partOffset: part.offset,
      text: decoded,
      exactOneToOne: raw === decoded,
    });
  }
  return out;
}

function parseMarkupOrStylesheet(rawText, filePath, format) {
  const lineStarts = buildLineTable(rawText);
  const links = [];
  const codeBlocks = [];
  const rawFormattingLeaks = [];
  const segments = [];
  const paragraphs = [];

  if (format === "css") {
    const uiSignals = collectUiSignals(rawText, format);
    return {
      filePath,
      format,
      modality: "stylesheet",
      language: "en",
      segments,
      paragraphs,
      artifacts: {
        links,
        codeBlocks,
        rawFormattingLeaks,
        uiSignals,
      },
    };
  }

  const len = rawText.length;
  const nonUiMask = new Uint8Array(len);

  const maskRegexOn = (targetMask, re) => {
    let m;
    while ((m = re.exec(rawText)) !== null) {
      targetMask.fill(1, m.index, m.index + m[0].length);
    }
  };

  const scriptBodies = [];
  for (const sm of rawText.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (sm[1]) scriptBodies.push(sm[1]);
  }
  const scriptText = scriptBodies.join("\n");

  applySuppressionDirectives(rawText, nonUiMask);
  maskRegexOn(nonUiMask, /<!--[\s\S]*?-->/g);
  maskRegexOn(nonUiMask, /\{\/\*[\s\S]*?\*\/\}/g);
  maskRegexOn(nonUiMask, /<script\b[^>]*>[\s\S]*?<\/script>/gi);
  maskRegexOn(nonUiMask, /<pre\b[^>]*>[\s\S]*?<\/pre>/gi);
  maskRegexOn(nonUiMask, /<code\b[^>]*>[\s\S]*?<\/code>/gi);
  maskRegexOn(nonUiMask, /<samp\b[^>]*>[\s\S]*?<\/samp>/gi);
  maskRegexOn(nonUiMask, /<kbd\b[^>]*>[\s\S]*?<\/kbd>/gi);
  maskRegexOn(nonUiMask, /<del\b[^>]*>[\s\S]*?<\/del>/gi);
  maskRegexOn(nonUiMask, /<template\b[^>]*>[\s\S]*?<\/template>/gi);
  maskRegexOn(nonUiMask, /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi);
  maskElementsByAttr(rawText, nonUiMask, /\bdata-dislop-ignore\b/i);

  const maskedUiSource = Array.from(rawText)
    .map((ch, idx) => (nonUiMask[idx] ? (ch === "\n" ? "\n" : " ") : ch))
    .join("");
  const uiSignals = collectUiSignals(maskedUiSource, format, scriptText);

  const proseMask = new Uint8Array(nonUiMask);
  maskRegexOn(proseMask, /<style\b[^>]*>[\s\S]*?<\/style>/gi);

  // Separate mask for nested inline exclusions inside prose blocks (without masking <code>)
  const inlineIgnoreMask = new Uint8Array(len);
  applySuppressionDirectives(rawText, inlineIgnoreMask);
  maskRegexOn(inlineIgnoreMask, /<!--[\s\S]*?-->/g);
  maskRegexOn(inlineIgnoreMask, /\{\/\*[\s\S]*?\*\/\}/g);
  maskRegexOn(inlineIgnoreMask, /<del\b[^>]*>[\s\S]*?<\/del>/gi);
  maskElementsByAttr(rawText, inlineIgnoreMask, /\bdata-dislop-ignore\b/i);

  // Extract <a ... href="..."> links outside masked regions
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let am;
  while ((am = anchorRe.exec(rawText)) !== null) {
    if (nonUiMask[am.index]) continue;
    const hrefMatch = am[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (hrefMatch) {
      const url = hrefMatch[1] ?? hrefMatch[2] ?? "";
      links.push({
        url,
        label: am[2].replace(/<[^>]+>/g, "").trim(),
        raw: am[0],
        line: offsetToLine(lineStarts, am.index),
        locator: { kind: "html-span", start: am.index, end: am.index + am[0].length },
      });
    }
  }

  const blocks = collectHtmlProseBlocks(rawText, proseMask);
  let bCounter = 0;

  for (const blk of blocks) {
    const strippedInner = Array.from(blk.rawInner)
      .map((ch, idx) => (inlineIgnoreMask[blk.innerStart + idx] ? (ch === "\n" ? "\n" : " ") : ch))
      .join("");
    const pieces = normalizeHtmlInnerToPieces(strippedInner, blk.innerStart);
    if (pieces.length === 0) continue;

    let blockKind = "paragraph";
    if (/^h[1-6]$/.test(blk.tag)) blockKind = "heading";
    else if (blk.tag === "li") blockKind = "list-item";
    else if (blk.tag === "td" || blk.tag === "th") blockKind = "table-cell";
    else if (blk.tag === "button" || blk.tag === "label" || blk.tag === "a") blockKind = "ui-control";
    const inTableCell = blk.tag === "td" || blk.tag === "th" || Boolean(blk.inTableCell);

    for (const piece of pieces) {
      const cleanSlice = piece.text;
      bCounter += 1;
      const blockId = `B${bCounter}`;
      const sentenceSpans = splitParagraphIntoSentences(cleanSlice);
      if (sentenceSpans.length === 0) continue;

      const segIds = [];
      let sCounter = 0;
      for (const sp of sentenceSpans) {
        sCounter += 1;
        let absStart = piece.partOffset + sp.relStart;
        let absEnd = piece.partOffset + sp.relEnd;
        let locatorKind = "html-readonly";

        if (piece.exactOneToOne && rawText.slice(absStart, absEnd) === sp.text) {
          locatorKind = "html-span";
        } else {
          const idx = piece.rawPart.indexOf(sp.text);
          if (idx !== -1 && piece.rawPart.indexOf(sp.text, idx + 1) === -1) {
            absStart = piece.partOffset + idx;
            absEnd = absStart + sp.text.length;
            locatorKind = "html-span";
          }
        }

        const line = offsetToLine(lineStarts, absStart);
        const id = `${blockId}-S${sCounter}`;
        const locator = { kind: locatorKind, start: absStart, end: absEnd };
        segIds.push(id);
        segments.push({
          id,
          paragraphId: blockId,
          blockKind,
          ...(inTableCell ? { inTableCell: true } : {}),
          line,
          text: sp.text,
          locator,
        });

        const maskedForLeakCheck = sp.text.replace(/`+[^`]+`+/g, (cm) => " ".repeat(cm.length));
        const leaks = detectRawMarkdownLeaksInRun(maskedForLeakCheck, id, line, locator);
        rawFormattingLeaks.push(...leaks);
      }

      paragraphs.push({
        id: blockId,
        blockKind,
        line: offsetToLine(lineStarts, piece.partOffset),
        text: cleanSlice.trim(),
        segmentIds: segIds,
        locator: {
          kind: piece.exactOneToOne ? "html-span" : "html-readonly",
          start: piece.partOffset,
          end: piece.partOffset + piece.rawPart.length,
        },
      });
    }
  }

  const proseCorpus = segments.map((s) => s.text).join("\n");
  return {
    filePath,
    format,
    modality: FORMAT_TO_MODALITY[format] || "markup",
    language: proseCorpus ? detectDocumentLanguage(proseCorpus) : "en",
    segments,
    paragraphs,
    artifacts: {
      links,
      codeBlocks,
      rawFormattingLeaks,
      uiSignals,
    },
  };
}

function parseOoxmlParagraphsFromXml(xml, entryName, nsPrefix, bCounterStart) {
  const pTagRe = nsPrefix === "w" ? /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g : /<a:p\b[^>]*>[\s\S]*?<\/a:p>/g;
  const tTagRe = nsPrefix === "w" ? /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g : /<a:t(?:\s+[^>]*)?>([\s\S]*?)<\/a:t>/g;

  const segments = [];
  const paragraphs = [];
  const leaks = [];
  let bCounter = bCounterStart;
  let pOrd = 0;
  let pm;

  while ((pm = pTagRe.exec(xml)) !== null) {
    const pXml = pm[0];
    const pIdx = pOrd;
    pOrd += 1;

    const runTexts = [];
    let tm;
    tTagRe.lastIndex = 0;
    while ((tm = tTagRe.exec(pXml)) !== null) {
      runTexts.push(decodeXmlEntities(tm[1]));
    }
    const joined = runTexts.join("");
    if (!joined.trim()) continue;

    bCounter += 1;
    const blockId = `B${bCounter}`;
    const sentenceSpans = splitParagraphIntoSentences(joined);
    if (sentenceSpans.length === 0) continue;

    const segIds = [];
    let sCounter = 0;
    for (const sp of sentenceSpans) {
      sCounter += 1;
      const id = `${blockId}-S${sCounter}`;
      const locator = {
        kind: "ooxml-span",
        entryName,
        nsPrefix,
        paragraphOrd: pIdx,
        charStart: sp.relStart,
        charEnd: sp.relEnd,
      };
      segIds.push(id);
      segments.push({
        id,
        paragraphId: blockId,
        text: sp.text,
        locator,
      });
      leaks.push(...detectRawMarkdownLeaksInRun(sp.text, id, undefined, locator));
    }

    paragraphs.push({
      id: blockId,
      text: joined,
      segmentIds: segIds,
      locator: {
        kind: "ooxml-span",
        entryName,
        nsPrefix,
        paragraphOrd: pIdx,
        charStart: 0,
        charEnd: joined.length,
      },
    });
  }

  return { segments, paragraphs, leaks, nextBCounter: bCounter };
}

function parseRelsHyperlinks(relsXml) {
  const links = [];
  if (!relsXml) return links;
  const relRe = /<Relationship\b([^>]*?)\/?>/gi;
  let m;
  while ((m = relRe.exec(relsXml)) !== null) {
    const attrs = m[1];
    if (!/Type="[^"]*\/hyperlink"/i.test(attrs)) continue;
    const targetMatch = attrs.match(/\bTarget="([^"]*)"/i);
    if (targetMatch) {
      const url = decodeXmlEntities(targetMatch[1]);
      links.push({ url, raw: m[0] });
    }
  }
  return links;
}

function resolvePptxSlideOrder(xmlEntries) {
  const presXml = xmlEntries["ppt/presentation.xml"];
  const presRels = xmlEntries["ppt/_rels/presentation.xml.rels"];
  if (presXml && presRels) {
    const ridToTarget = new Map();
    const relRe = /<Relationship\b([^>]*?)\/?>/gi;
    let m;
    while ((m = relRe.exec(presRels)) !== null) {
      const idMatch = m[1].match(/\bId="([^"]+)"/i);
      const targetMatch = m[1].match(/\bTarget="([^"]+)"/i);
      if (idMatch && targetMatch) {
        const clean = targetMatch[1].replace(/^\/+/, "");
        const full = clean.startsWith("ppt/") ? clean : `ppt/${clean}`;
        ridToTarget.set(idMatch[1], full);
      }
    }
    const ordered = [];
    const sldIdRe = /<p:sldId\b[^>]*\br:id="([^"]+)"/gi;
    while ((m = sldIdRe.exec(presXml)) !== null) {
      const target = ridToTarget.get(m[1]);
      if (target && xmlEntries[target]) ordered.push(target);
    }
    if (ordered.length > 0) return ordered;
  }

  return Object.keys(xmlEntries)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)\.xml$/)[1], 10);
      const nb = parseInt(b.match(/(\d+)\.xml$/)[1], 10);
      return na - nb;
    });
}

function parseOoxmlDocument(buffer, filePath, format) {
  const { xmlEntries } = readZipArchive(buffer);
  const segments = [];
  const paragraphs = [];
  const rawFormattingLeaks = [];
  const links = [];
  let bCounter = 0;

  if (format === "docx") {
    const docXml = xmlEntries["word/document.xml"];
    if (!docXml) {
      throw new Error("Invalid .docx archive: missing word/document.xml");
    }
    const res = parseOoxmlParagraphsFromXml(docXml, "word/document.xml", "w", bCounter);
    segments.push(...res.segments);
    paragraphs.push(...res.paragraphs);
    rawFormattingLeaks.push(...res.leaks);
    links.push(...parseRelsHyperlinks(xmlEntries["word/_rels/document.xml.rels"]));

    const corpus = segments.map((s) => s.text).join("\n");
    return {
      filePath,
      format: "docx",
      modality: "document",
      language: detectDocumentLanguage(corpus),
      segments,
      paragraphs,
      artifacts: {
        links,
        codeBlocks: [],
        rawFormattingLeaks,
      },
    };
  }

  // format === "pptx"
  const slideNames = resolvePptxSlideOrder(xmlEntries);
  if (slideNames.length === 0) {
    throw new Error("Invalid .pptx archive: no slide XML entries found");
  }

  const slideMetrics = [];
  let visibleSlideCount = 0;
  for (let idx = 0; idx < slideNames.length; idx += 1) {
    const entryName = slideNames[idx];
    const xml = xmlEntries[entryName];
    if (/<p:sld\b[^>]*\bshow\s*=\s*["'](?:0|false)["']/i.test(xml)) {
      continue;
    }
    visibleSlideCount += 1;
    const startSegIdx = segments.length;
    const res = parseOoxmlParagraphsFromXml(xml, entryName, "a", bCounter);
    bCounter = res.nextBCounter;
    segments.push(...res.segments);
    paragraphs.push(...res.paragraphs);
    rawFormattingLeaks.push(...res.leaks);

    const slideBasename = path.basename(entryName);
    const relsName = `ppt/slides/_rels/${slideBasename}.rels`;
    links.push(...parseRelsHyperlinks(xmlEntries[relsName]));

    const slideText = res.paragraphs.map((p) => p.text).join(" ");
    const words = slideText.trim() ? slideText.trim().split(/\s+/).length : 0;
    const cjkCount = (slideText.match(/[\u4e00-\u9fff]/g) || []).length;
    const bulletMatches = xml.match(/<a:bu(?:Char|AutoNum)\b/g);
    const bulletCount = bulletMatches ? bulletMatches.length : 0;
    const autofitMatch = xml.match(/<a:normAutofit\b[^>]*\bfontScale="(\d+)"/i);
    const autofitFontScale = autofitMatch ? parseInt(autofitMatch[1], 10) / 1000 : 100;
    const firstSegmentId = segments[startSegIdx]?.id || null;

    slideMetrics.push({
      index: visibleSlideCount,
      entryName,
      firstSegmentId,
      title: res.paragraphs[0]?.text || "",
      wordCount: words,
      cjkCount,
      bulletCount,
      autofitFontScale,
    });
  }

  const corpus = segments.map((s) => s.text).join("\n");
  return {
    filePath,
    format: "pptx",
    modality: "presentation",
    language: detectDocumentLanguage(corpus),
    segments,
    paragraphs,
    artifacts: {
      links,
      codeBlocks: [],
      rawFormattingLeaks,
      deckSignals: {
        slideCount: visibleSlideCount,
        slides: slideMetrics,
      },
    },
  };
}

/**
 * Parse any supported buffer into a unified `DocumentModel` (for both disk reads and binary-safe stdin).
 */
export function parseDocumentBuffer(buf, filePath = "untitled.md", explicitFormat = null) {
  const format = explicitFormat || detectFormatFromPath(filePath);
  if (!format) {
    throw new Error(`Unsupported file extension for '${filePath}'`);
  }

  if (format === "docx" || format === "pptx") {
    return parseOoxmlDocument(buf, filePath, format);
  }

  if (["png", "jpg", "jpeg", "webp", "gif"].includes(format)) {
    const mediaSignals = inspectImageBuffer(buf, format);
    return {
      filePath,
      format,
      modality: "image",
      language: "en",
      segments: [],
      paragraphs: [],
      artifacts: {
        links: [],
        codeBlocks: [],
        rawFormattingLeaks: [],
        mediaSignals,
      },
    };
  }

  if (format === "pdf") {
    const pdfInfo = inspectPdfBuffer(buf);
    const pages = pdfInfo.pages || [];
    const segments = [];
    const paragraphs = [];
    const rawFormattingLeaks = [];
    let pCounter = 0;

    for (const page of pages) {
      if (!page.text || !page.text.trim()) continue;
      const pageDoc = parseMarkdownOrText(page.text, filePath, "txt");
      const pageIdOffset = pCounter;
      for (const seg of pageDoc.segments) {
        const pNum = parseInt(seg.paragraphId.slice(1), 10) + pageIdOffset;
        const sNum = seg.id.split("-")[1];
        const id = `P${pNum}-${sNum}`;
        const locator = { kind: "pdf-readonly", page: page.index };
        segments.push({
          ...seg,
          id,
          paragraphId: `P${pNum}`,
          line: page.index,
          locator,
        });
      }
      for (const para of pageDoc.paragraphs) {
        const pNum = parseInt(para.id.slice(1), 10) + pageIdOffset;
        paragraphs.push({
          ...para,
          id: `P${pNum}`,
          line: page.index,
          segmentIds: para.segmentIds.map((sid) => {
            const sNum = sid.split("-")[1];
            return `P${pNum}-${sNum}`;
          }),
          locator: { kind: "pdf-readonly", page: page.index },
        });
      }
      pCounter += pageDoc.paragraphs.length;

      if (page.nonMonoText && page.nonMonoText.trim()) {
        const nonMonoDoc = parseMarkdownOrText(page.nonMonoText, filePath, "txt");
        for (const seg of nonMonoDoc.segments) {
          rawFormattingLeaks.push(
            ...detectRawMarkdownLeaksInRun(seg.text, null, page.index, {
              kind: "pdf-readonly",
              page: page.index,
            }),
          );
        }
      }
    }

    const landscapeSlidePages = pages.filter((p) => p.width > p.height * 1.25);
    const wordCounts = landscapeSlidePages.map((p) => p.wordCount).sort((a, b) => a - b);
    const cjkCounts = landscapeSlidePages.map((p) => p.cjkCount).sort((a, b) => a - b);
    const medianWords = wordCounts.length ? wordCounts[Math.floor(wordCounts.length / 2)] : 0;
    const medianCjk = cjkCounts.length ? cjkCounts[Math.floor(cjkCounts.length / 2)] : 0;
    const isSlideDeckPdf =
      pages.length >= 2 &&
      landscapeSlidePages.length >= Math.ceil(pages.length * 0.7) &&
      medianWords <= 180 &&
      medianCjk <= 420;

    const corpus = segments.map((s) => s.text).join("\n");
    return {
      filePath,
      format: "pdf",
      modality: "presentation",
      language: corpus ? detectDocumentLanguage(corpus) : "en",
      segments,
      paragraphs,
      artifacts: {
        links: pdfInfo.links || [],
        codeBlocks: [],
        rawFormattingLeaks,
        ...(isSlideDeckPdf
          ? {
              deckSignals: {
                slideCount: pages.length,
                slides: pages.map((p) => ({
                  index: p.index,
                  firstSegmentId: segments.find((s) => s.line === p.index)?.id || null,
                  title: (p.text.split("\n")[0] || "").slice(0, 80),
                  wordCount: p.wordCount,
                  cjkCount: p.cjkCount,
                  bulletCount: 0,
                  autofitFontScale: 100,
                })),
              },
            }
          : {}),
        mediaSignals: {
          encrypted: pdfInfo.encrypted,
          pageCount: pdfInfo.pageCount,
        },
      },
    };
  }

  if (buf.includes(0)) {
    throw new Error(`Binary or non-UTF-8 file cannot be parsed as ${format}: '${filePath}'`);
  }
  const rawText = buf.toString("utf8");
  return parseDocumentText(rawText, filePath, format);
}

/**
 * Parse any supported file on disk into a unified `DocumentModel`.
 */
export function parseDocumentFile(filePath, explicitFormat = null) {
  const format = explicitFormat || detectFormatFromPath(filePath);
  if (!format) {
    throw new Error(`Unsupported file extension for '${filePath}'`);
  }
  const buf = fs.readFileSync(filePath);
  return parseDocumentBuffer(buf, filePath, format);
}

/**
 * Parse an in-memory UTF-8 text document into a `DocumentModel`.
 */
export function parseDocumentText(rawText, filePath = "untitled.md", explicitFormat = null) {
  const format = explicitFormat || detectFormatFromPath(filePath) || "md";
  if (["html", "jsx", "tsx", "svg", "css"].includes(format)) {
    return parseMarkupOrStylesheet(rawText, filePath, format);
  }
  return parseMarkdownOrText(rawText, filePath, format);
}

export function formatDisplayCoordinate(targetId, line) {
  if (!targetId) return line ? `[L${line}]` : "[doc]";
  return line ? `[${targetId}|L${line}]` : `[${targetId}]`;
}
