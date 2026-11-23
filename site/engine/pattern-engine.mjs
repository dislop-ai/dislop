/**
 * dislop AI-Slop Pattern Library Multi-Angle Detection Engine (zero external dependencies).
 * Data-driven from `patterns/banks/*.json`.
 * Mirrors `src/dislop/pattern_engine.py` with 100% deterministic parity.
 */
import {
  buildLineStarts,
  buildZones,
  deriveFixStrategy,
  detectModality,
  fnv1aHex,
  isAllowedMatch,
  isSentenceBreakAt,
  offsetToLineCol,
  parseSuppressions,
  sliceCodepoints,
  stripParentheticals,
} from "./core.mjs";

export const PATTERN_ENGINE_VERSION = "1.0.0";

const TEXT_MODALITIES = new Set(["markdown", "text", "html", "docx"]);
const UI_MODALITIES = new Set(["html", "css", "jsx"]);

function blankPreserveLines(s) {
  return s.replace(/[^\r\n]/g, " ");
}

function maskUiMarkup(rawText) {
  return String(rawText || "")
    .replace(/\uFEFF/g, " ")
    .replace(/<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->/gi, blankPreserveLines)
    .replace(/<!--[\s\S]*?-->/g, blankPreserveLines)
    .replace(/\/\*[\s\S]*?\*\//g, blankPreserveLines)
    .replace(/<(script|code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, blankPreserveLines);
}

// ---------- Shared Linguistic Measurement Helpers ----------

function stripFormattedNumbersAndCode(s) {
  return String(s || "")
    .replace(/\d{1,3}(?:,\d{3})+/g, "0")
    .replace(/`[^`\n]+`/g, "CODE");
}

export function detectPrimaryLang(s) {
  const cjk = (s.match(/[\u4e00-\u9fff]/gu) || []).length;
  const enWords = s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
  return cjk >= enWords * 2 ? "zh" : "en";
}

export function measureUnits(text, lang) {
  const clean = stripFormattedNumbersAndCode(text).replace(/[.!?。！？]+$/u, "").trim();
  const cjk = (clean.match(/[\u4e00-\u9fff]/gu) || []).length;
  const enWords = clean.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  return lang === "zh" ? cjk + Math.round(enWords * 1.5) : enWords + Math.round(cjk * 0.6);
}

function isSkippableProseBlock(trimmed) {
  return !trimmed || /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>)/.test(trimmed);
}

function iterProseParagraphs(proseText) {
  const out = [];
  const re = /[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g;
  let m;
  while ((m = re.exec(proseText)) !== null) {
    const raw = m[0];
    const trimmed = raw.trim();
    const firstNonWs = raw.search(/\S/);
    out.push({
      raw,
      trimmed,
      index: m.index + (firstNonWs >= 0 ? firstNonWs : 0),
      blockStart: m.index,
      skippable: isSkippableProseBlock(trimmed),
    });
  }
  return out;
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makePatternFinding({
  ruleId,
  dimension,
  detectionAngle,
  severity = "info",
  filename,
  modality,
  line = 1,
  col = 1,
  location = null,
  match,
  metric = "",
  message,
  deletionTest = null,
}) {
  const loc = location || `${line}:${col}`;
  const cleanMatch = sliceCodepoints(String(match || "").replace(/\s+/g, " ").trim(), 140);
  const fp = `${ruleId}:${fnv1aHex(`${ruleId}|${cleanMatch.toLowerCase()}|${loc}`)}`;
  return {
    fingerprint: fp,
    ruleId,
    source: "pattern-library",
    dimension,
    detectionAngle,
    severity,
    fixStrategy: deriveFixStrategy({ id: ruleId, severity }),
    file: filename,
    modality,
    location: loc,
    line,
    col,
    match: cleanMatch,
    metric,
    message,
    ...(deletionTest ? { deletionTest } : {}),
  };
}

function iterSentenceSpansInPara(rawPara) {
  const spans = [];
  let start = 0;
  for (let i = 0; i < rawPara.length; i += 1) {
    if (rawPara[i] === "\n") {
      start = i + 1;
      continue;
    }
    if (isSentenceBreakAt(rawPara, i)) {
      const text = rawPara.slice(start, i + 1);
      if (text.trim().length > 0) {
        spans.push({ text, index: start });
      }
      start = i + 1;
    }
  }
  return spans;
}

// ---------- Angle: Rhythm & Cadence Statistics ----------

function probeCommaChain(proseText, rawText, cfg) {
  const hits = [];
  for (const para of iterProseParagraphs(proseText)) {
    if (para.skippable) continue;
    for (const sm of iterSentenceSpansInPara(para.raw)) {
      const sent = sm.text;
      const normalized = stripFormattedNumbersAndCode(sent);
      const lang = detectPrimaryLang(normalized);
      const noParens = stripParentheticals(normalized);
      const commas = noParens.match(/[，,]/g) || [];
      if (commas.length < (cfg.minCommas || 5)) continue;

      const clauses = noParens
        .split(/[，,]/)
        .map((c) => c.trim())
        .filter(Boolean);
      const langCfg = lang === "zh" ? cfg.zh : cfg.en;
      const lens = clauses.map((c) => measureUnits(c, lang));
      const longClauses = lens.filter((n) => n >= langCfg.minClauseUnits).length;
      const avgUnits = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);

      if (longClauses >= (cfg.minLongClauses || 4) && avgUnits >= langCfg.minAvgClauseUnits) {
        const leadWs = sent.search(/\S/);
        const startOffset = para.blockStart + sm.index + (leadWs >= 0 ? leadWs : 0);
        const rawSlice = rawText.slice(startOffset, startOffset + sent.trim().length);
        const linkCount = (rawSlice.match(/\]\(/g) || []).length;
        if (linkCount > (cfg.maxMarkdownLinks ?? 2)) continue;
        hits.push({
          index: startOffset,
          length: sent.trim().length,
          metric: `lang=${lang}, commas=${commas.length}, avgUnits=${avgUnits.toFixed(1)}`,
        });
      }
    }
  }
  return hits;
}

function probeSentenceLengthMonotony(proseText, cfg) {
  const hits = [];
  for (const para of iterProseParagraphs(proseText)) {
    if (para.skippable) continue;
    const lang = detectPrimaryLang(para.trimmed);
    const lengths = [];
    for (const sm of iterSentenceSpansInPara(para.raw)) {
      const u = measureUnits(sm.text, lang);
      if (u >= (cfg.minSentenceUnits || 4)) lengths.push(u);
    }
    if (lengths.length < (cfg.minSentences || 5)) continue;
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const minMean = lang === "zh" ? cfg.minMeanUnitsZh || 14 : cfg.minMeanUnitsEn || 10;
    if (mean < minMean) continue;
    const variance = lengths.reduce((acc, x) => acc + (x - mean) ** 2, 0) / lengths.length;
    const cv = Math.sqrt(variance) / mean;
    if (cv < (cfg.maxCv || 0.16)) {
      hits.push({
        index: para.index,
        length: Math.min(para.trimmed.length, 100),
        metric: `lang=${lang}, sentences=${lengths.length}, mean=${mean.toFixed(1)}, cv=${cv.toFixed(3)}`,
      });
    }
  }
  return hits;
}

function extractSentenceOpener(sentence, lang, cfg) {
  const clean = sentence.trim().replace(/^["'“‘(（]+/, "");
  if (!clean) return "";
  if (lang === "zh") {
    const m = clean.match(/^([\u4e00-\u9fff]{2,3})/);
    if (!m) return "";
    return m[1].slice(0, cfg.minOpenerCharsZh || 2);
  }
  const words = clean
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const need = cfg.minOpenerWordsEn || 2;
  if (words.length < need + 1) return "";
  return words.slice(0, need).join(" ");
}

function probeOpenerAnaphora(proseText, cfg) {
  const hits = [];
  const minRun = cfg.minConsecutive || 4;
  for (const para of iterProseParagraphs(proseText)) {
    if (para.skippable) continue;
    const lang = detectPrimaryLang(para.trimmed);
    const sentences = [];
    for (const sm of iterSentenceSpansInPara(para.raw)) {
      const s = sm.text.trim();
      const opener = extractSentenceOpener(s, lang, cfg);
      const lead = sm.text.search(/\S/);
      sentences.push({
        opener,
        start: para.blockStart + sm.index + (lead >= 0 ? lead : 0),
        end: para.blockStart + sm.index + (lead >= 0 ? lead : 0) + s.length,
      });
    }
    let runKey = "";
    let runStart = 0;
    let runLen = 0;
    for (let i = 0; i <= sentences.length; i += 1) {
      const cur = sentences[i];
      if (cur && cur.opener && cur.opener === runKey) {
        runLen += 1;
      } else {
        if (runLen >= minRun && runKey) {
          const first = sentences[runStart];
          const last = sentences[i - 1];
          hits.push({
            index: first.start,
            length: Math.min(120, last.end - first.start),
            metric: `opener="${runKey}", consecutive=${runLen}`,
          });
        }
        runKey = cur?.opener || "";
        runStart = i;
        runLen = runKey ? 1 : 0;
      }
    }
  }
  return hits;
}

function probeInlineBoldSaturation(proseText, rawText, cfg) {
  const hits = [];
  const minSpans = cfg.minBoldSpans || 4;
  for (const para of iterProseParagraphs(proseText)) {
    if (para.skippable) continue;
    const rawSlice = rawText.slice(para.blockStart, para.blockStart + para.raw.length);
    // Only inspect genuine markdown prose paragraphs (skip lines that are mostly list/table)
    if (/^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>)/m.test(rawSlice)) continue;
    const boldMatches = [];
    const boldRe = /\*\*([^*\n`]{1,40})\*\*/g;
    let bm;
    while ((bm = boldRe.exec(rawSlice)) !== null) {
      // Ensure this span isn't inside masked code zone
      const proseSpan = para.raw.slice(bm.index, bm.index + bm[0].length);
      if (proseSpan.trim().length > 0) {
        boldMatches.push({ index: para.blockStart + bm.index, length: bm[0].length });
      }
    }
    if (boldMatches.length < minSpans) continue;
    const lang = detectPrimaryLang(para.trimmed);
    const plainLen =
      lang === "zh"
        ? (para.trimmed.match(/[\u4e00-\u9fff]/gu) || []).length
        : para.trimmed.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
    const ratio = plainLen / boldMatches.length;
    const maxPerBold = lang === "zh" ? cfg.maxCjkPerBoldZh || 55 : cfg.maxWordsPerBoldEn || 28;
    if (ratio <= maxPerBold) {
      hits.push({
        index: boldMatches[0].index,
        length: Math.min(100, para.trimmed.length),
        metric: `lang=${lang}, boldSpans=${boldMatches.length}, unitsPerBold=${ratio.toFixed(1)}`,
      });
    }
  }
  return hits;
}

function probeParagraphLengthUniformity(proseText, cfg) {
  const paras = iterProseParagraphs(proseText).filter((p) => !p.skippable);
  if (paras.length < (cfg.minParagraphs || 5)) return [];
  const lang = detectPrimaryLang(proseText);
  const scored = paras
    .map((p) => ({ para: p, units: measureUnits(p.trimmed, lang) }))
    .filter((x) => x.units >= 15);
  if (scored.length < (cfg.minParagraphs || 5)) return [];
  const mean = scored.reduce((a, x) => a + x.units, 0) / scored.length;
  if (mean < (cfg.minMeanUnits || 35)) return [];
  const variance = scored.reduce((acc, x) => acc + (x.units - mean) ** 2, 0) / scored.length;
  const cv = Math.sqrt(variance) / mean;
  if (cv < (cfg.maxCv || 0.13)) {
    return [
      {
        index: scored[0].para.index,
        length: Math.min(100, scored[0].para.trimmed.length),
        metric: `lang=${lang}, paragraphs=${scored.length}, mean=${mean.toFixed(1)}, cv=${cv.toFixed(3)}`,
      },
    ];
  }
  return [];
}

// ---------- Angle: Discourse Signpost Cluster ----------

function probeDiscourseMarkerCluster(proseText, cfg) {
  const hits = [];
  const zhAlts = (cfg.zhLeadMarkers || []).map(escapeRegExp).join("|");
  const enAlts = (cfg.enLeadMarkers || []).map(escapeRegExp).join("|");
  const zhLeadRe = zhAlts ? new RegExp(`^(?:${zhAlts})[，,：:\\s]`, "u") : null;
  const enLeadRe = enAlts ? new RegExp(`^(?:${enAlts})[,\\s]`, "i") : null;
  const zhInnerRe = zhAlts ? new RegExp(`(?:^|[。！？；\\n]\\s*)(?:${zhAlts})[，,：:]`, "gu") : null;
  const enInnerRe = enAlts ? new RegExp(`(?:^|[.!?;]\\s+)(?:${enAlts}),`, "gi") : null;

  const paras = iterProseParagraphs(proseText).map((p) => {
    if (p.skippable) return { ...p, isMarked: false };
    const isMarked = Boolean((zhLeadRe && zhLeadRe.test(p.trimmed)) || (enLeadRe && enLeadRe.test(p.trimmed)));
    return { ...p, isMarked };
  });

  const minParas = cfg.minConsecutiveParagraphs || 3;
  let runStart = -1;
  let runCount = 0;
  for (let i = 0; i <= paras.length; i += 1) {
    const cur = paras[i];
    if (cur && cur.isMarked) {
      if (runCount === 0) runStart = i;
      runCount += 1;
    } else {
      if (runCount >= minParas) {
        const first = paras[runStart];
        hits.push({
          index: first.index,
          length: Math.min(80, first.trimmed.length),
          metric: `consecutiveMarkedParagraphs=${runCount}`,
        });
      }
      runCount = 0;
    }
  }

  const minInPara = cfg.minMarkersInParagraph || 3;
  for (const p of paras) {
    if (p.skippable) continue;
    const zhHits = zhInnerRe ? (p.trimmed.match(zhInnerRe) || []).length : 0;
    const enHits = enInnerRe ? (p.trimmed.match(enInnerRe) || []).length : 0;
    const total = zhHits + enHits;
    if (total >= minInPara && !hits.some((h) => h.index === p.index)) {
      hits.push({
        index: p.index,
        length: Math.min(80, p.trimmed.length),
        metric: `markersInParagraph=${total}`,
      });
    }
  }
  return hits;
}

// ---------- Angle: Weighted Lexical & Calque Cluster ----------

function probeLexicalCluster(proseText, cfg) {
  const hits = [];
  const compiled = (cfg.signals || []).map((s) => ({
    id: s.id,
    weight: Number(s.weight ?? 1.0),
    re: new RegExp(s.pattern, "iu"),
  }));
  const minDistinct = cfg.minDistinctHits || 2;
  const minScore = cfg.minWeightedScore ?? minDistinct;

  for (const para of iterProseParagraphs(proseText)) {
    if (para.skippable) continue;
    const matched = [];
    let score = 0;
    let firstIdx = -1;
    let firstLen = 0;
    for (const sig of compiled) {
      const m = sig.re.exec(para.raw);
      if (m) {
        matched.push(sig.id);
        score += sig.weight;
        const absIdx = para.blockStart + m.index;
        if (firstIdx === -1 || absIdx < firstIdx) {
          firstIdx = absIdx;
          firstLen = m[0].length;
        }
      }
    }
    if (matched.length >= minDistinct && score >= minScore && firstIdx !== -1) {
      hits.push({
        index: firstIdx,
        length: Math.max(firstLen, Math.min(100, para.trimmed.length)),
        metric: `signals=${matched.length}, score=${score.toFixed(1)}, ids=${matched.slice(0, 4).join("+")}`,
      });
    }
  }
  return hits;
}

// ---------- Angle: Syntactic & Rhetorical Frames ----------

function isInsideQuotation(text, start, end) {
  const before = text.slice(Math.max(0, start - 32), start);
  const after = text.slice(end, Math.min(text.length, end + 16));
  const openZh = (before.match(/“/g) || []).length - (before.match(/”/g) || []).length;
  if (openZh > 0 && /”/.test(after)) return true;
  const openCorner = (before.match(/「/g) || []).length - (before.match(/」/g) || []).length;
  if (openCorner > 0 && /」/.test(after)) return true;
  if (/(?:例如|比如|如)\s*[“"「]?$/.test(before)) return true;
  return false;
}

function probeProseRegexPatterns(proseText, patterns = [], { skipQuoted = false } = {}) {
  const hits = [];
  const compiled = patterns.map((p) => new RegExp(p, "giu"));
  for (const para of iterProseParagraphs(proseText)) {
    if (para.skippable) continue;
    for (const re of compiled) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(para.raw)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex += 1;
          continue;
        }
        let idx = para.blockStart + m.index;
        let len = m[0].length;
        const lead = m[0].match(/^[.!?。！？\s]+/);
        if (lead && lead[0].length < len) {
          idx += lead[0].length;
          len -= lead[0].length;
        }
        if (skipQuoted && isInsideQuotation(proseText, idx, idx + len)) {
          continue;
        }
        hits.push({ index: idx, length: len, metric: `matchedLen=${len}` });
      }
    }
  }
  // Deduplicate overlapping hits
  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  const dedup = [];
  for (const h of hits) {
    const prev = dedup[dedup.length - 1];
    if (prev && h.index < prev.index + prev.length) continue;
    dedup.push(h);
  }
  return dedup;
}

// ---------- Angle: Visual / UI & PPTX Structural Templates ----------

function probeUiPatternCount(rawText, cfg) {
  const clean = maskUiMarkup(rawText);
  const re = new RegExp(cfg.pattern, "gi");
  const exemptRe = cfg.exemptPattern ? new RegExp(cfg.exemptPattern, "i") : null;
  const lookbehind = cfg.exemptLookbehindChars || 48;
  const matches = [];
  let m;
  while ((m = re.exec(clean)) !== null) {
    if (exemptRe) {
      const before = clean.slice(Math.max(0, m.index - lookbehind), m.index);
      if (exemptRe.test(before)) continue;
    }
    matches.push({ index: m.index, length: m[0].length });
  }
  const minOcc = cfg.minOccurrences || 3;
  if (matches.length >= minOcc) {
    return [{ index: matches[0].index, length: matches[0].length, metric: `occurrences=${matches.length}` }];
  }
  return [];
}

function decodeXmlSimple(s) {
  return String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function resolveOrderedSlides(entries) {
  const presXml = entries["ppt/presentation.xml"] || "";
  const presRels = entries["ppt/_rels/presentation.xml.rels"] || "";
  const relMap = new Map();
  const relRe =
    /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"|<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*\bId="([^"]+)"/g;
  let rm;
  while ((rm = relRe.exec(presRels)) !== null) {
    const id = rm[1] || rm[4];
    const rawTarget = (rm[2] || rm[3] || "").replace(/^\/+/, "").replace(/^\.\.\//, "ppt/");
    const target = rawTarget.startsWith("ppt/") ? rawTarget : `ppt/${rawTarget}`;
    relMap.set(id, target);
  }
  const ordered = [];
  const sldIdRe = /<p:sldId\b[^>]*\br:id="([^"]+)"/g;
  let sm;
  while ((sm = sldIdRe.exec(presXml)) !== null) {
    const target = relMap.get(sm[1]);
    if (target && entries[target]) ordered.push(target);
  }
  if (ordered.length === 0) {
    const fallback = Object.keys(entries)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    ordered.push(...fallback);
  }
  return ordered;
}

function probePptxLayoutMonotony(ooxmlEntries, cfg) {
  if (!ooxmlEntries || typeof ooxmlEntries !== "object") return [];
  const slides = resolveOrderedSlides(ooxmlEntries);
  const contentSlides = [];
  const minWords = cfg.minSlideLatinWords || 12;
  const minCjk = cfg.minSlideCjkChars || 25;

  slides.forEach((entryKey, idx) => {
    const slideNum = idx + 1;
    const xml = String(ooxmlEntries[entryKey] || "");
    if (/<p:sld\b[^>]*\bshow="0"/.test(xml)) return;

    const textParts = [];
    let bodyTextShapes = 0;
    let hasBullets = false;
    const spRe = /<p:sp\b[\s\S]*?<\/p:sp>/g;
    let spm;
    while ((spm = spRe.exec(xml)) !== null) {
      const sp = spm[0];
      const isTitle = /<p:ph\b[^>]*\btype="(?:title|ctrTitle)"/.test(sp);
      const isFooter = /<p:ph\b[^>]*\btype="(?:sldNum|ftr|dt)"/.test(sp);
      if (isFooter) continue;
      const runs = [];
      const tRe = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
      let tm;
      while ((tm = tRe.exec(sp)) !== null) {
        runs.push(decodeXmlSimple(tm[1]));
      }
      const joined = runs.join("").trim();
      if (!joined) continue;
      textParts.push(joined);
      if (!isTitle) {
        bodyTextShapes += 1;
        if (/<a:buChar\b|<a:buAutoNum\b/.test(sp)) hasBullets = true;
      }
    }
    const full = textParts.join(" ");
    const cjk = (full.match(/[\u4e00-\u9fff]/gu) || []).length;
    const latin = full.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
    const hasVisual = /<c:chart\b|<a:tbl\b|<p:pic\b/.test(xml);
    if (!hasVisual && latin < minWords && cjk < minCjk) return;

    const isPlainBulletOnly = !hasVisual && hasBullets && bodyTextShapes <= 1;
    contentSlides.push({ slideNum, isPlainBulletOnly });
  });

  if (contentSlides.length < (cfg.minContentSlides || 5)) return [];
  const needRun = cfg.minConsecutivePlainBulletSlides || 4;
  let run = 0;
  for (const s of contentSlides) {
    if (s.isPlainBulletOnly) {
      run += 1;
      if (run === needRun) {
        return [
          {
            slideNum: s.slideNum,
            match: `${needRun}+ consecutive plain-bullet slides (out of ${contentSlides.length} content slides)`,
            metric: `contentSlides=${contentSlides.length}, consecutivePlainBullet=${run}`,
          },
        ];
      }
    } else {
      run = 0;
    }
  }
  return [];
}

// ---------- Angle: Multi-Dimension Composite Stealth-Slop Fusion ----------

function countConcreteFacts(rawSlice, factRes) {
  let count = 0;
  for (const re of factRes) {
    re.lastIndex = 0;
    const m = rawSlice.match(re);
    if (m) count += m.length;
  }
  return count;
}

function probeCompositeMultiSignal(proseText, rawText, banks, existingFindings) {
  const comp = banks["composite-fusion"];
  if (!comp) return [];
  const lex = banks["lexical-signals"] || {};
  const dr = banks["discourse-rhythm"] || {};

  const lexSignals = [
    ...(lex.zhCalqueCluster?.signals || []),
    ...(lex.enPhraseCluster?.signals || []),
  ].map((s) => ({ id: s.id, re: new RegExp(s.pattern, "iu") }));

  const zhAlts = (dr.discourseMarkers?.zhLeadMarkers || []).map(escapeRegExp).join("|");
  const enAlts = (dr.discourseMarkers?.enLeadMarkers || []).map(escapeRegExp).join("|");
  const discZhRe = zhAlts ? new RegExp(`(?:^|[。！？；\\n]\\s*)(?:${zhAlts})[，,：:]`, "gu") : null;
  const discEnRe = enAlts ? new RegExp(`(?:^|[.!?;\\n]\\s*)(?:${enAlts})[,\\s]`, "gi") : null;

  const framingRes = (comp.weakFramingPatterns || []).map((p) => new RegExp(p, "iu"));
  const factRes = (comp.concreteFactPatterns || []).map((p) => new RegExp(p, "giu"));

  const lineStarts = buildLineStarts(rawText);
  const existingLines = new Set(existingFindings.map((f) => f.line));
  const minDims = comp.minDistinctDimensions || 3;
  const maxFacts = comp.maxFactSignals ?? 1;
  const hits = [];

  for (const para of iterProseParagraphs(proseText)) {
    if (para.skippable) continue;
    const { line: paraLine } = offsetToLineCol(rawText, lineStarts, para.index);
    if (existingLines.has(paraLine)) continue;

    const rawSlice = rawText.slice(para.blockStart, para.blockStart + para.raw.length);
    const factCount = countConcreteFacts(rawSlice, factRes);
    if (factCount > maxFacts) continue;

    const activeDims = [];

    // 1. Weak lexical signal (even 1 hit below cluster threshold)
    const lexMatched = lexSignals.filter((s) => s.re.test(para.raw)).map((s) => s.id);
    if (lexMatched.length >= 1) activeDims.push(`lexical(${lexMatched[0]})`);

    // 2. Weak discourse signpost (even 1-2 hits below 3-hit cluster threshold)
    const discHits =
      (discZhRe ? (para.trimmed.match(discZhRe) || []).length : 0) +
      (discEnRe ? (para.trimmed.match(discEnRe) || []).length : 0);
    if (discHits >= 1) activeDims.push(`discourse(${discHits})`);

    // 3. Weak abstract framing cue
    const framingHit = framingRes.some((re) => re.test(para.raw));
    if (framingHit) activeDims.push("framing");

    // 4. Weak cadence signal (4+ commas in one sentence OR 3+ bold spans OR flat >=4 sentences)
    const sents = para.raw.match(/[^.!?。！？\n]+[.!?。！？]/gu) || [];
    const hasMildComma = sents.some((s) => (stripFormattedNumbersAndCode(s).match(/[，,]/g) || []).length >= 4);
    const hasMildBold = (rawSlice.match(/\*\*[^*\n`]{1,40}\*\*/g) || []).length >= 3;
    if (hasMildComma || hasMildBold) activeDims.push("cadence");

    if (activeDims.length >= minDims) {
      hits.push({
        index: para.index,
        length: Math.min(110, para.trimmed.length),
        metric: `dims=${activeDims.length} [${activeDims.join("+")}], facts=${factCount}`,
      });
    }
  }
  return hits;
}

function probeUiGen2TastefulSlop(rawText, cfg) {
  const clean = maskUiMarkup(rawText);
  const minSignals = cfg.minSignals || 2;
  const signals = [];
  let firstHit = null;

  // Signal 1: Warm cream ground + terracotta/clay accent
  const creamMatch = clean.match(/#(?:faf8f5|f7f5f0|fbf9f6|f5f2eb|f9f6f0|fdfbf7|f4efe6)\b|\bbg-(?:stone|amber)-50\b/i);
  const terraMatch = clean.match(/#(?:c45a3b|d97757|b85038|c85a32|c2410c|b45309)\b|\bterracotta\b|\b(?:text|bg)-orange-700\b/i);
  if (creamMatch && terraMatch) {
    signals.push("cream-terracotta");
    firstHit = { index: creamMatch.index, length: creamMatch[0].length };
  }

  // Signal 2: Serif italic accent word inside display heading
  const italicMatch = clean.match(/<h[1-3]\b[^>]*>[\s\S]{0,160}<(?:em|i|span[^>]*\bitalic\b)[^>]*>[^<]{2,40}<\/(?:em|i|span)>/i);
  if (italicMatch) {
    signals.push("serif-italic-headline");
    if (!firstHit) firstHit = { index: italicMatch.index, length: Math.min(80, italicMatch[0].length) };
  }

  // Signal 3: Inter default font stack
  const interMatch = clean.match(/font-family\s*:[^;\n]{0,80}['"]?Inter['"]?|font-\[\s*['"]?Inter['"]?\s*\]/i);
  if (interMatch) {
    signals.push("inter-default");
    if (!firstHit) firstHit = { index: interMatch.index, length: interMatch[0].length };
  }

  // Signal 4: Tracked uppercase eyebrow + rounded-2xl / shadow-xl combo
  const eyebrowMatch = clean.match(/\b(?:tracking-(?:widest|wider|\[0\.[12]\d*em\])[^"'\n>]{0,40}\buppercase\b|\buppercase[^"'\n>]{0,40}\btracking-(?:widest|wider|\[0\.[12]\d*em\]))|letter-spacing\s*:\s*0\.[1-3]\d*em[^;]{0,60}text-transform\s*:\s*uppercase/i);
  const shellMatch = /\b(?:rounded-2xl|rounded-3xl|shadow-xl|shadow-lg)\b/.test(clean);
  if (eyebrowMatch && shellMatch) {
    signals.push("tracked-eyebrow-shell");
    if (!firstHit) firstHit = { index: eyebrowMatch.index, length: eyebrowMatch[0].length };
  }

  if (signals.length >= minSignals && firstHit) {
    return [{ ...firstHit, metric: `gen2Signals=${signals.length} [${signals.join("+")}]` }];
  }
  return [];
}

// ---------- Main Pattern Library Multi-Angle Auditor ----------

export function auditPatterns(text, { filename = "<memory>", modality = null, banks = {}, angles = null, ooxml = null, config = {} } = {}) {
  const mod = modality || detectModality(filename) || "markdown";
  const lineStarts = buildLineStarts(text);
  const zones = buildZones(text, mod, {
    proseFences: config?.proseFences,
    maskBlockquotes: config?.maskBlockquotes,
  });
  const { byTargetLine } = parseSuppressions(text);
  const allowList = config?.allow || [];
  const ruleOverrides = config?.rules || {};
  const allowAngle = (a) => !angles || angles.includes(a);
  const findings = [];

  const isRuleSuppressedOrOff = (ruleId, line, rawMatch) => {
    const ov = ruleOverrides[ruleId];
    if (ov === "off" || ov === false) return true;
    if (rawMatch && isAllowedMatch(rawMatch, allowList)) return true;
    const sups = byTargetLine.get(line) || [];
    for (const sup of sups) {
      if (sup.ruleIds.includes("all") || sup.ruleIds.includes("*") || sup.ruleIds.includes(ruleId)) {
        return true;
      }
    }
    return false;
  };

  const resolveSeverity = (ruleId, baseSev) => {
    const ov = ruleOverrides[ruleId];
    if (ov === "error" || ov === "warning" || ov === "info") return ov;
    return baseSev || "info";
  };

  const emitHits = (ruleMeta, hits, message, deletionTest = null) => {
    if (ruleOverrides[ruleMeta.ruleId] === "off" || ruleOverrides[ruleMeta.ruleId] === false) return;
    for (const h of hits) {
      const rawMatch = text.slice(h.index, h.index + h.length);
      const { line, col } = offsetToLineCol(text, lineStarts, h.index);
      if (isRuleSuppressedOrOff(ruleMeta.ruleId, line, rawMatch)) continue;
      findings.push(
        makePatternFinding({
          ruleId: ruleMeta.ruleId,
          dimension: ruleMeta.dimension,
          detectionAngle: ruleMeta.detectionAngle,
          severity: resolveSeverity(ruleMeta.ruleId, ruleMeta.severity),
          filename,
          modality: mod,
          line,
          col,
          match: rawMatch,
          metric: h.metric || "",
          message,
          deletionTest,
        })
      );
    }
  };

  const dr = banks["discourse-rhythm"];
  if (dr && TEXT_MODALITIES.has(mod)) {
    if (allowAngle("rhythm-statistics")) {
      if (dr.commaChain) {
        emitHits(dr.commaChain, probeCommaChain(zones.prose, text, dr.commaChain), {
          en: "Single sentence chains 5+ comma-separated clauses in a flat cadence.",
          zh: "单句连续串联 5 个及以上逗号分句，形成平铺拖沓的逗号链节奏。",
        }, {
          en: "Split into 2–3 shorter sentences at causal or chronological boundaries without dropping numbers.",
          zh: "按因果或时间停顿拆成 2 到 3 句，保留全部条件与数字，删掉多余顺承逗号。",
        });
      }
      if (dr.sentenceLengthMonotony) {
        emitHits(dr.sentenceLengthMonotony, probeSentenceLengthMonotony(zones.prose, dr.sentenceLengthMonotony), {
          en: "Paragraph exhibits metronome sentence-length uniformity (CV < 0.16 across >= 5 sentences).",
          zh: "段落内连续 5 句以上句长高度均一（CV < 0.16），呈现节拍器生成韵律。",
        }, {
          en: "Merge related clauses or cut one sentence short to create natural length contrast.",
          zh: "把相邻因果合并成长句，并收短关键结论句，拉开长短句起伏。",
        });
      }
      if (dr.openerAnaphora) {
        emitHits(dr.openerAnaphora, probeOpenerAnaphora(zones.prose, dr.openerAnaphora), {
          en: "4+ consecutive prose sentences open with the identical mechanical prefix.",
          zh: "段落内连续 4 句及以上使用完全相同的机械句首开头。",
        }, {
          en: "Vary sentence openings or move shared context into one topic sentence or clean list.",
          zh: "改写句首起笔，或把并列动作收拢成一句话或真实列表。",
        });
      }
      if (dr.inlineBoldSaturation && (mod === "markdown" || mod === "text")) {
        emitHits(dr.inlineBoldSaturation, probeInlineBoldSaturation(zones.prose, text, dr.inlineBoldSaturation), {
          en: "Dense inline `**bold**` highlight confetti inside a normal prose paragraph.",
          zh: "普通自然段内高密度堆砌 `**加粗词**` 高亮，呈现助手式排版噪点。",
        }, {
          en: "Unbold inline phrases and keep emphasis only on 1 genuine key decision or caveat.",
          zh: "去掉多余行内加粗，仅保留最关键的一处结论或风险提示。",
        });
      }
      if (dr.paragraphLengthUniformity) {
        emitHits(dr.paragraphLengthUniformity, probeParagraphLengthUniformity(zones.prose, dr.paragraphLengthUniformity), {
          en: "Long document allocates nearly identical word budgets across >= 5 consecutive paragraphs.",
          zh: "连续 5 段及以上正文自然段字数高度均一（CV < 0.13），呈现均匀切块模板感。",
        }, {
          en: "Combine two thin subsections or expand the load-bearing section with concrete details.",
          zh: "合并偏薄的过渡段落，把篇幅集中到真正有数据或机制的核心段落。",
        });
      }
    }
    if (allowAngle("discourse-structure") && dr.discourseMarkers) {
      emitHits(dr.discourseMarkers, probeDiscourseMarkerCluster(zones.prose, dr.discourseMarkers), {
        en: "Mechanical transition signposts stacked across consecutive paragraphs or sentences.",
        zh: "连续段落或句子堆砌机械过渡路标词（如“首先/其次/此外/最后”或连续“Furthermore/Moreover/Additionally”）。",
      }, {
        en: "Delete additive signposts (`Moreover`, `Furthermore`) and connect steps by causal order.",
        zh: "删掉“首先/其次/此外/最后”一类空路标词，直接按动作先后或因果衔接。",
      });
    }
  }

  const lex = banks["lexical-signals"];
  if (lex && TEXT_MODALITIES.has(mod) && allowAngle("lexicon-cluster")) {
    if (lex.zhCalqueCluster) {
      emitHits(lex.zhCalqueCluster, probeLexicalCluster(zones.prose, lex.zhCalqueCluster), {
        en: "Chinese AI translation-calque and hollow-connector cluster inside one paragraph.",
        zh: "单段内聚集多处中文 AI 翻译腔或空洞连接套语（如“在……的背景下/不可否认的是/扮演着重要角色”）。",
      }, {
        en: "Cut hollow wrappers (`undeniably`, `plays a vital role`) and state the subject and action directly.",
        zh: "直接删掉“不可否认/扮演着角色/奠定基础”等空架子，主语紧接具体动作与结果。",
      });
    }
    if (lex.enPhraseCluster) {
      emitHits(lex.enPhraseCluster, probeLexicalCluster(zones.prose, lex.enPhraseCluster), {
        en: "Dense cluster of empirically over-represented English AI vocabulary in one paragraph.",
        zh: "单段内高频聚集多个大模型超额偏好英文词组（如 `meticulous`/`pivotal`/`holistic`/`foster`/`underscore`）。",
      }, {
        en: "Swap abstract buzzwords (`foster`, `pivotal`, `seamless`) for plain verbs and concrete facts.",
        zh: "把虚浮高频词换成直白动词与可验证指标，不用靠叠词制造分量。",
      });
    }
  }

  const syn = banks["syntactic-frames"];
  if (syn && TEXT_MODALITIES.has(mod) && allowAngle("syntactic-frame")) {
    if (syn.concessionSymmetry) {
      const pats = [...(syn.concessionSymmetry.enPatterns || []), ...(syn.concessionSymmetry.zhPatterns || [])];
      emitHits(syn.concessionSymmetry, probeProseRegexPatterns(zones.prose, pats), {
        en: "Formulaic both-sides concession frame ('While X presents challenges, it also offers tremendous opportunities').",
        zh: "模板化两面平衡让步句式（“虽然……面临挑战，但也带来了巨大机遇”）。",
      }, {
        en: "Drop the both-sides cushion and state a clear recommendation with exact boundary conditions.",
        zh: "撤掉“有利有弊/既要又要”的端水套壳，直接给出明确判断或写清触发阈值。",
      });
    }
    if (syn.pullQuoteCloser) {
      emitHits(
        syn.pullQuoteCloser,
        probeProseRegexPatterns(zones.prose, syn.pullQuoteCloser.patterns || [], {
          skipQuoted: Boolean(syn.pullQuoteCloser.skipQuoted),
        }),
        {
          en: "Poster-style pull-quote punchline closer.",
          zh: "段尾硬加广告卡片式金句收尾（如“笔一直在你手里”“这才是……真正的温度”）。",
        },
        {
          en: "Cut the bumper-sticker sign-off and end on the last concrete fact or next action.",
          zh: "删掉结尾口号金句，让文章停在最后一条具体事实或下一步动作上。",
        }
      );
    }
    if (syn.rhetoricalSelfQa) {
      emitHits(syn.rhetoricalSelfQa, probeProseRegexPatterns(zones.prose, syn.rhetoricalSelfQa.patterns || []), {
        en: "Staged rhetorical self-Q&A transition ('Why does this matter? Because...', '这意味着什么？意味着……').",
        zh: "正文内使用主持词式自问自答过渡句（如“这意味着什么？意味着……”“结果呢？……”）。",
      }, {
        en: "Remove the staged question and state the consequence in one direct declarative sentence.",
        zh: "去掉“为什么重要？因为……”问答腔，用一句直白陈述句直接交代原因或后果。",
      });
    }
  }

  const vd = banks["visual-deck"];
  if (vd && allowAngle("visual-markup-ooxml")) {
    if (UI_MODALITIES.has(mod)) {
      if (vd.glassmorphismOveruse) {
        emitHits(vd.glassmorphismOveruse, probeUiPatternCount(text, vd.glassmorphismOveruse), {
          en: "Repeated `backdrop-blur` translucent panels (>= 3 per view) mimic default AI glassmorphism templates.",
          zh: "单视图重复堆砌 3 处及以上 `backdrop-blur` 毛玻璃半透明面板，呈现典型生成式模板特征。",
        }, {
          en: "Replace stacked blur cards with crisp 1px borders and solid surface contrast.",
          zh: "撤掉满屏毛玻璃半透明层，改用清晰 1px 边框与实体背景区分层级。",
        });
      }
      if (vd.accentStripeCard) {
        emitHits(vd.accentStripeCard, probeUiPatternCount(text, vd.accentStripeCard), {
          en: "Repeated thick left accent-stripe cards (`border-l-4` / `border-left: >=4px solid`, >= 3 per view) signal boilerplate dashboards.",
          zh: "单视图堆叠 3 处及以上左侧粗彩条卡片（`border-l-4` / `border-left: >=4px solid`），呈现典型 AI 后台面板套路。",
        }, {
          en: "Drop thick decorative side stripes and rely on alignment, spacing, and typography scale.",
          zh: "去掉卡片左侧装饰粗彩条，靠留白对齐和字阶主次划分模块。",
        });
      }
      if (vd.gen2TastefulSlop) {
        emitHits(vd.gen2TastefulSlop, probeUiGen2TastefulSlop(text, vd.gen2TastefulSlop), {
          en: "Second-generation 'tasteful' AI UI template cluster (>= 2 of warm-cream/terracotta, serif-italic headline accent, Inter stack, tracked-uppercase eyebrow).",
          zh: "第二代“伪人文精致模板”组合特征（同时命中暖米白+陶土红配色、标题斜体强调词、Inter 默认字体或宽字距全大写眉题中 2 项及以上）。",
        }, {
          en: "Cut generic template chrome (uppercase kickers, italic buzzword spans) and keep layout purposeful.",
          zh: "删掉宽字距全大写眉题和标题斜体装点，用项目真实品牌字体与克制版式。",
        });
      }
    }
    if (mod === "pptx" && ooxml && vd.pptxLayoutMonotony && ruleOverrides[vd.pptxLayoutMonotony.ruleId] !== "off" && ruleOverrides[vd.pptxLayoutMonotony.ruleId] !== false) {
      const slideHits = probePptxLayoutMonotony(ooxml, vd.pptxLayoutMonotony);
      for (const sh of slideHits) {
        if (isRuleSuppressedOrOff(vd.pptxLayoutMonotony.ruleId, sh.slideNum, sh.match)) continue;
        findings.push(
          makePatternFinding({
            ruleId: vd.pptxLayoutMonotony.ruleId,
            dimension: vd.pptxLayoutMonotony.dimension,
            detectionAngle: vd.pptxLayoutMonotony.detectionAngle,
            severity: resolveSeverity(vd.pptxLayoutMonotony.ruleId, vd.pptxLayoutMonotony.severity),
            filename,
            modality: mod,
            line: sh.slideNum,
            col: 1,
            location: `slide ${sh.slideNum}`,
            match: sh.match,
            metric: sh.metric,
            message: {
              en: "4+ consecutive content slides share the identical plain-bullet layout with no table, chart, or diagram.",
              zh: "连续 4 页及以上正文幻灯片均退化为纯字要点列表页（无图表、表格或配图），版式过于单调。",
            },
            deletionTest: {
              en: "Turn data points into a comparison table or chart, or pair one claim with concrete visual evidence.",
              zh: "把连续文字清单改排成对比表格、结构图或数据卡片，打破连页纯字版式。",
            },
          })
        );
      }
    }
  }

  const comp = banks["composite-fusion"];
  if (comp && TEXT_MODALITIES.has(mod) && allowAngle("composite-cooccurrence")) {
    emitHits(comp, probeCompositeMultiSignal(zones.prose, text, banks, findings), {
      en: "Multiple sub-threshold AI signals (lexical + discourse + framing/cadence) co-occur in one low-fact paragraph.",
      zh: "同一低事实段落内叠加多个跨维度弱 AI 味信号（套词 + 过渡路标 + 抽象框架/节奏），虽未单点越线但整体 AI 腔明显。",
    }, {
      en: "Trim empty framing phrases and anchor the paragraph in at least one metric, file, date, or concrete decision.",
      zh: "删掉空泛套词与过渡壳，至少补进一条实测指标、文件名、日期或明确取舍结论。",
    });
  }

  findings.sort((a, b) => (a.line || 0) - (b.line || 0) || (a.col || 0) - (b.col || 0) || a.ruleId.localeCompare(b.ruleId));
  return { version: PATTERN_ENGINE_VERSION, findings };
}

export function analyzePatternProfile(text, options = {}) {
  const res = auditPatterns(text, options);
  const byDimension = {};
  const byAngle = {};
  for (const f of res.findings) {
    byDimension[f.dimension] = (byDimension[f.dimension] || 0) + 1;
    byAngle[f.detectionAngle] = (byAngle[f.detectionAngle] || 0) + 1;
  }
  return {
    version: PATTERN_ENGINE_VERSION,
    findingCount: res.findings.length,
    activeDimensions: Object.keys(byDimension).sort(),
    byDimension,
    byAngle,
    findings: res.findings,
  };
}
