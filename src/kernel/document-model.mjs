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
  if (cjkCount >= 6 || (nonWs > 0 && cjkCount / nonWs >= 0.12)) {
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
          /^(?:Certainly|Sure|Of course|Absolutely|Great|Awesome|Great question)$/i.test(leadIn) &&
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
    { pattern: "atx-heading", re: /(?:^|\n)\s*#{1,6}\s+\S[^\n]{1,120}/g },
    { pattern: "markdown-link", re: /\[[^\]\n]{1,80}\]\(https?:\/\/[^)\s]+\)/g },
    { pattern: "code-fence", re: /```[\s\S]*?```|```[a-zA-Z0-9_-]*/g },
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

  // 2. Mask fenced code blocks ``` or ~~~
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

    // Mask HTML comments
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
    rawBlocks.push(currentLines);
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
    // Table separator rows |---|---|
    if ((format === "md" || format === "mdx") && /^\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(trimmed)) {
      flushCurrent();
      continue;
    }
    // Horizontal rules
    if ((format === "md" || format === "mdx") && /^(?:---+|\*\*\*+|___+)$/.test(trimmed)) {
      flushCurrent();
      continue;
    }
    // Headings & list items each form clean standalone addressable blocks
    if (
      (format === "md" || format === "mdx") &&
      (/^\s*#{1,6}\s+/.test(ln.text) || /^\s*(?:[-*+]|\d+\.)\s+/.test(ln.text))
    ) {
      flushCurrent();
      rawBlocks.push([ln]);
      continue;
    }
    currentLines.push(ln);
  }
  flushCurrent();

  const segments = [];
  const paragraphs = [];
  let pCounter = 0;

  for (const blk of rawBlocks) {
    const blkStart = blk[0].start;
    const blkEnd = blk[blk.length - 1].end;
    let bodyStart = blkStart;
    const firstText = blk[0].text;

    if (format === "md" || format === "mdx") {
      const headingPrefix = firstText.match(/^(\s*#{1,6}\s+)/);
      const listPrefix = !headingPrefix ? firstText.match(/^(\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?)/) : null;
      const quotePrefix = !headingPrefix && !listPrefix && blk.length === 1 ? firstText.match(/^(\s*>\s+)/) : null;
      const prefix = headingPrefix?.[1] || listPrefix?.[1] || quotePrefix?.[1] || "";
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

    const mdLinkRe = /!?\[([^\]\n]*)\]\(([^)\n]*)\)/g;
    let lm;
    while ((lm = mdLinkRe.exec(rawText)) !== null) {
      if (inlineCodeMask[lm.index]) continue;
      const rawUrl = lm[2].trim().replace(/\s+["'][^"']*["']$/, "");
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

function collectUiSignals(rawSource, format) {
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

  const blobRe = /\bblur-3xl\b[^\n"']{0,80}\b(?:opacity-(?:20|30|40)|animate-pulse|rounded-full)\b/gi;
  while ((m = blobRe.exec(rawSource)) !== null) {
    glowBlobs.push({ text: m[0], offset: m.index });
  }

  const pillRe = /<(?:span|div)\b[^>]*class(?:Name)?=["'][^"']*\brounded-full\b[^"']*["'][^>]*>[^<]{1,40}<\/(?:span|div)>/gi;
  while ((m = pillRe.exec(rawSource)) !== null) {
    pillBadges.push({ text: m[0], offset: m.index });
  }

  const btnRe = /<button\b([^>]*\bdisabled\b[^>]*)>([\s\S]*?)<\/button>/gi;
  while ((m = btnRe.exec(rawSource)) !== null) {
    const attrs = m[1];
    if (!/\b(?:title|aria-label|aria-describedby)=/i.test(attrs)) {
      disabledButtonsWithoutTitle.push({ text: m[0], offset: m.index });
    }
  }

  if (format === "svg" && /<svg\b/i.test(rawSource)) {
    const svgOpen = rawSource.match(/<svg\b[^>]*>/i);
    if (svgOpen && !/\bviewBox\s*=/i.test(svgOpen[0])) {
      missingSvgViewBox = true;
    }
  }

  return {
    purplePinkGradients,
    glowBlobs,
    pillBadges,
    disabledButtonsWithoutTitle,
    missingSvgViewBox,
  };
}

function parseMarkupOrStylesheet(rawText, filePath, format) {
  const lineStarts = buildLineTable(rawText);
  const uiSignals = collectUiSignals(rawText, format);
  const links = [];
  const codeBlocks = [];
  const rawFormattingLeaks = [];
  const segments = [];
  const paragraphs = [];

  if (format === "css") {
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
  const masked = new Uint8Array(len);

  const maskRegex = (re) => {
    let m;
    while ((m = re.exec(rawText)) !== null) {
      masked.fill(1, m.index, m.index + m[0].length);
    }
  };

  maskRegex(/<!--[\s\S]*?-->/g);
  maskRegex(/\{\/\*[\s\S]*?\*\/\}/g);
  maskRegex(/<script\b[^>]*>[\s\S]*?<\/script>/gi);
  maskRegex(/<style\b[^>]*>[\s\S]*?<\/style>/gi);
  maskRegex(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi);
  maskRegex(/<code\b[^>]*>[\s\S]*?<\/code>/gi);

  // Extract <a ... href="..."> links
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let am;
  while ((am = anchorRe.exec(rawText)) !== null) {
    if (masked[am.index]) continue;
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

  // Extract visible leaf text nodes inside prose/UI elements (matching tag-free bodies keeps 1:1 byte offsets)
  const blockTagRe =
    /<(p|h[1-6]|li|blockquote|figcaption|td|th|button|label|text|span|a)\b[^>]*>([^<{}]+)<\/\1>/gi;
  let bm;
  let bCounter = 0;

  while ((bm = blockTagRe.exec(rawText)) !== null) {
    if (masked[bm.index]) continue;
    const innerOffset = bm.index + bm[0].indexOf(">") + 1;
    const cleanSlice = bm[2];
    if (!cleanSlice.trim()) continue;

    bCounter += 1;
    const blockId = `B${bCounter}`;
    const sentenceSpans = splitParagraphIntoSentences(cleanSlice);
    if (sentenceSpans.length === 0) continue;

    const segIds = [];
    let sCounter = 0;
    for (const sp of sentenceSpans) {
      sCounter += 1;
      const absStart = innerOffset + sp.relStart;
      const absEnd = innerOffset + sp.relEnd;
      const line = offsetToLine(lineStarts, absStart);
      const id = `${blockId}-S${sCounter}`;
      const locator = { kind: "html-span", start: absStart, end: absEnd };
      segIds.push(id);
      segments.push({
        id,
        paragraphId: blockId,
        line,
        text: decodeXmlEntities(sp.text),
        locator,
      });

      const leaks = detectRawMarkdownLeaksInRun(sp.text, id, line, locator);
      rawFormattingLeaks.push(...leaks);
    }

    paragraphs.push({
      id: blockId,
      line: offsetToLine(lineStarts, innerOffset),
      text: decodeXmlEntities(cleanSlice.trim()),
      segmentIds: segIds,
      locator: { kind: "html-span", start: innerOffset, end: innerOffset + cleanSlice.length },
    });
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
  for (let idx = 0; idx < slideNames.length; idx += 1) {
    const entryName = slideNames[idx];
    const xml = xmlEntries[entryName];
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
      index: idx + 1,
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
        slideCount: slideNames.length,
        slides: slideMetrics,
      },
    },
  };
}

/**
 * Parse any supported file on disk into a unified `DocumentModel`.
 */
export function parseDocumentFile(filePath, explicitFormat = null) {
  const format = explicitFormat || detectFormatFromPath(filePath);
  if (!format) {
    throw new Error(`Unsupported file extension for '${filePath}'`);
  }

  if (format === "docx" || format === "pptx") {
    const buf = fs.readFileSync(filePath);
    return parseOoxmlDocument(buf, filePath, format);
  }

  if (["png", "jpg", "jpeg", "webp", "gif"].includes(format)) {
    const buf = fs.readFileSync(filePath);
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
    const buf = fs.readFileSync(filePath);
    const pdfInfo = inspectPdfBuffer(buf);
    const tempDoc = parseMarkdownOrText(pdfInfo.extractedText, filePath, "txt");
    // Clear patch locators on PDF segments so PDF findings stay read-only/manual
    const pdfSegments = tempDoc.segments.map((s) => ({
      ...s,
      locator: { kind: "pdf-readonly" },
    }));
    return {
      filePath,
      format: "pdf",
      modality: "presentation",
      language: tempDoc.language,
      segments: pdfSegments,
      paragraphs: [],
      artifacts: {
        links: [],
        codeBlocks: [],
        rawFormattingLeaks: [],
        mediaSignals: {
          encrypted: pdfInfo.encrypted,
          pageCount: pdfInfo.pageCount,
        },
      },
    };
  }

  const buf = fs.readFileSync(filePath);
  // Reject binary NUL bytes in supposed UTF-8 text files
  if (buf.includes(0)) {
    throw new Error(`Binary or non-UTF-8 file cannot be parsed as ${format}: '${filePath}'`);
  }
  const rawText = buf.toString("utf8");
  return parseDocumentText(rawText, filePath, format);
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
