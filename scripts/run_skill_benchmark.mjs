#!/usr/bin/env node
/**
 * dislop-skill-bench v1 — End-to-end Skill evaluator & cross-vendor blind packet generator.
 *
 * Measures 4 orthogonal tracks:
 *   1. Routing & Trigger Precision (30 tasks: 19 true triggers + 11 non-slop controls, Wilson 95% CI)
 *   2. Green-Field Drafting (12 tasks: bare facts -> draft, fact-atom recall, non-fabrication, anti-slop)
 *   3. Extended Revision & Do-No-Harm (12 extended tasks + 18 Suite B tasks = 30 tasks, including split-run
 *      .docx XML, stealth vapor, regulated qualifier polarity, and 6 clean-preservation Do-No-Harm cases)
 *   4. Token Economy & Anonymized Position-Swapped Blind Pairwise Export
 *
 * Usage:
 *   DISLOP_TEST_MODE=1 node scripts/run_skill_benchmark.mjs --assert
 *   node scripts/run_skill_benchmark.mjs --dry-run --models gemini-3.5-flash,qwen3.8-flash
 *   node scripts/run_skill_benchmark.mjs --live --arms no_skill,skill_v0,skill_cand --models gemini-3.5-flash,qwen3.8-flash --out <file>
 *   node scripts/run_skill_benchmark.mjs --eval <results.json>
 *   node scripts/run_skill_benchmark.mjs --blind-export skill_v0 skill_cand --input <results.json> --out <dir>
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENGINE_VERSION,
  analyzeTextProfile,
  auditOoxmlEntries,
  auditText,
  detectModality,
  extractProtectedFacts,
  resolveEffectivePack,
  verifyRevision,
} from "../src/core.mjs";
import { auditPatterns } from "../src/pattern-engine.mjs";
import { analyzeDocumentWithPocketModels } from "../src/pocket-model.mjs";
import { runThirdOrderProbes } from "./probes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BENCH_DIR = path.join(ROOT, "benchmarks");
const DATASETS_DIR = path.join(BENCH_DIR, "datasets");
const CANDIDATES_PATH = path.join(BENCH_DIR, "models", "candidates.json");

// ---------- Load Packs & Pattern Banks ----------

export function loadPacksById() {
  const packsDir = path.join(ROOT, "packs");
  const out = {};
  for (const entry of fs.readdirSync(packsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const p = path.join(packsDir, entry.name, "pack.json");
    if (fs.existsSync(p)) {
      const m = JSON.parse(fs.readFileSync(p, "utf8"));
      out[m.id] = m;
    }
  }
  return out;
}

export function loadPatternBanks() {
  const bankDir = path.join(ROOT, "patterns", "banks");
  const out = {};
  if (!fs.existsSync(bankDir)) return out;
  for (const entry of fs.readdirSync(bankDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(path.join(bankDir, entry.name), "utf8"));
    out[data.id || entry.name.replace(/\.json$/, "")] = data;
  }
  return out;
}

const PACKS_BY_ID = loadPacksById();
const PATTERN_BANKS = loadPatternBanks();

// ---------- Network Circuit Breaker ----------

export function assertLiveNetworkAllowed() {
  if (process.env.DISLOP_TEST_MODE === "1" || process.env.NODE_TEST_CONTEXT) {
    throw new Error("Live skill benchmark network calls are blocked in test mode (DISLOP_TEST_MODE=1).");
  }
}

// ---------- OOXML Plain Text Extraction (Run-Concatenated, Paragraph-Separated) ----------

export function extractOoxmlPlainText(payload, modality) {
  if (modality !== "pptx" && modality !== "docx") return String(payload || "");
  if (typeof payload === "string") return payload;
  const map = payload && typeof payload === "object" ? payload : {};
  const paras = [];
  const pTag = modality === "docx" ? "w:p" : "a:p";
  const tTag = modality === "docx" ? "w:t" : "a:t";
  const pRe = new RegExp(`<${pTag}(?:\\s[^>]*[^/])?>([\\s\\S]*?)<\\/${pTag}>`, "g");
  const tRe = new RegExp(`<${tTag}(?:\\s[^>]*[^/])?>([\\s\\S]*?)<\\/${tTag}>`, "g");
  const decodeXml = (s) =>
    s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");

  for (const [k, xml] of Object.entries(map).sort(([a], [b]) => a.localeCompare(b))) {
    if (modality === "pptx" && !/^ppt\/slides\/slide\d+\.xml$/i.test(k)) continue;
    if (modality === "docx" && k !== "word/document.xml") continue;
    const rawXml = String(xml || "");
    const pMatches = [...rawXml.matchAll(pRe)];
    if (pMatches.length > 0) {
      for (const pm of pMatches) {
        const runs = [...pm[1].matchAll(tRe)].map((tm) => decodeXml(tm[1]));
        const joined = runs.join("");
        if (joined.trim()) paras.push(joined);
      }
    } else {
      const runs = [...rawXml.matchAll(tRe)].map((tm) => decodeXml(tm[1]));
      if (runs.length > 0) paras.push(runs.join(""));
    }
  }
  return paras.join("\n");
}

// ---------- Spelled Number Normalization & Direction Reversal Probes ----------

const ZH_DIGIT_MAP = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

export function chineseNumeralToInt(str) {
  const s = String(str || "").trim();
  if (!s) return null;
  if (/^[零〇一二两三四五六七八九]+$/.test(s)) {
    return Number(Array.from(s).map((c) => ZH_DIGIT_MAP[c]).join(""));
  }
  const m = s.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/);
  if (m) {
    const tens = m[1] ? ZH_DIGIT_MAP[m[1]] : 1;
    const ones = m[2] ? ZH_DIGIT_MAP[m[2]] : 0;
    return tens * 10 + ones;
  }
  const m2 = s.match(/^([一二两三四五六七八九])百(?:([零一二两三四五六七八九])?十?([一二三四五六七八九])?)?$/);
  if (m2) {
    const hundreds = ZH_DIGIT_MAP[m2[1]] * 100;
    if (!m2[2] && !m2[3]) return hundreds;
    if (s.includes("十")) {
      const tens = m2[2] && m2[2] !== "零" ? ZH_DIGIT_MAP[m2[2]] * 10 : 10;
      const ones = m2[3] ? ZH_DIGIT_MAP[m2[3]] : 0;
      return hundreds + tens + ones;
    }
    const last = m2[3] || m2[2];
    return hundreds + (last && last !== "零" ? ZH_DIGIT_MAP[last] : 0);
  }
  return null;
}

const EN_WORD_NUMS = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15",
  sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19",
  twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60",
  seventy: "70", eighty: "80", ninety: "90",
};

export function normalizeSpelledNumbers(text) {
  let out = String(text || "");
  // Chinese spoken clock time like 4点20分 -> 4:20
  out = out.replace(/(\d{1,2})点(\d{1,2})分?/g, "$1:$2");
  // English hyphenated compound numbers: twenty-four -> 24
  out = out.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[-\s](one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_, t, o) => String(Number(EN_WORD_NUMS[t.toLowerCase()]) + Number(EN_WORD_NUMS[o.toLowerCase()]))
  );
  // Single English number words
  out = out.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi,
    (m) => EN_WORD_NUMS[m.toLowerCase()] || m
  );
  // Chinese numeral quantities followed by common units/nouns (avoid idioms like "三步" vs "一再"/"万一")
  out = out.replace(
    /([一二两三四五六七八九十百]{1,4})(?=\s*(?:个|次|步|条|项|年|月|天|小时|分钟|分|秒|倍|成|%|人|家|台|座|节|名|套|张|份|页|行))/g,
    (full, numStr) => {
      const val = chineseNumeralToInt(numStr);
      return val === null ? full : String(val);
    }
  );
  return out;
}

export function checkDirectionPairs(text, directionPairs = []) {
  if (!directionPairs || directionPairs.length === 0) return { ok: true, reversed: [] };
  const norm = normalizeSpelledNumbers(String(text || "")).replace(/,/g, "");
  const reversed = [];
  for (const [beforeVal, afterVal] of directionPairs) {
    const bEsc = String(beforeVal).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const aEsc = String(afterVal).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Flag explicit reversal patterns: from <after> to <before>, or 从 <after> 到/降到/升至 <before>
    const revEn = new RegExp(`\\bfrom\\s+${aEsc}[^.\\n]{0,24}?\\bto\\s+${bEsc}\\b`, "i");
    const revZh = new RegExp(`从\\s*${aEsc}[^。！？\\n]{0,16}?(?:降到|降至|降到|升到|升至|到|至|变成)\\s*${bEsc}`);
    if (revEn.test(norm) || revZh.test(norm)) {
      reversed.push([beforeVal, afterVal]);
    }
  }
  return { ok: reversed.length === 0, reversed };
}

// ---------- Hidden Benchmark-Only Anti-Synonym Slop Probes (Anti-Goodhart) ----------

const HIDDEN_PROBES = [
  {
    id: "hidden-synonym-pivot",
    test: (s) =>
      /(?:\bnot\s+merely\b[^.\n]{2,60}\b(?:rather|instead|but)\b|\bless\s+(?:about|of)\s+[^.\n]{2,40},\s+more\s+(?:about|of)\b|与其说是[^，。]{2,30}不如说是|并非仅仅[^，。]{2,30}而是)/i.test(
        s
      ),
  },
  {
    id: "hidden-zh-padding-synonym",
    test: (s) =>
      /(?:不言而喻|显而易见|毫无疑问的是|换言之，?这|归根结底|总而言之，?正是|为[^，。]{2,18}注入(?:了)?(?:强大|全新)?动力|开启了?[^，。]{2,14}新篇章)/.test(
        s
      ),
  },
  {
    id: "hidden-en-hype-synonym",
    test: (s) =>
      /\b(?:paradigm\s+shift|usher\s+in\s+a\s+new\s+era|redefine\s+how\s+teams|at\s+the\s+forefront\s+of|testament\s+to|unlocks?\s+unprecedented)\b/i.test(
        s
      ),
  },
  {
    id: "hidden-ui-beige-template",
    test: (s, mod) =>
      (mod === "html" || mod === "jsx" || mod === "css") &&
      /#F7F5F0/i.test(s) &&
      /(?:grid-cols-3|repeat\(3)/i.test(s),
  },
];

export function runHiddenSlopProbes(plainText, modality = "markdown") {
  const hits = [];
  for (const hp of HIDDEN_PROBES) {
    if (hp.test(plainText, modality)) hits.push(hp.id);
  }
  return hits;
}

// ---------- Language Purity Check ----------

export function checkLanguagePurity(plainText, expectedLang, modality = "markdown") {
  if (!expectedLang) return { ok: true, reason: null };
  // Strip code blocks, inline code, HTML/XML tags, URLs, and standard uppercase acronyms
  let cleaned = String(plainText || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
  if (modality === "html" || modality === "css") {
    // Only check visible inner text roughly (already stripped tags above)
    cleaned = cleaned.replace(/\{[^}]*\}/g, " ");
  }
  if (expectedLang === "en") {
    const cjk = (cleaned.match(/[\u4e00-\u9fff]/gu) || []).length;
    if (cjk > 0) return { ok: false, reason: `English output leaked ${cjk} Chinese chars` };
  } else if (expectedLang === "zh") {
    // Allow technical abbreviations, product names, identifiers, units, HTTP, SLA, AES, TLS, FIFO, W-TinyLFU, etc.
    // Flag multi-word lowercase English prose runs (>= 4 consecutive lowercase words) inside ZH prose.
    const longEnRun = cleaned.match(/\b[a-z]{2,}(?:\s+[a-z]{2,}){3,}\b/g);
    if (longEnRun && longEnRun.length > 0) {
      return { ok: false, reason: `Chinese output contains English prose run: "${longEnRun[0].slice(0, 50)}"` };
    }
  }
  return { ok: true, reason: null };
}

// ---------- Clean-Preservation Edit Restraint & Token Overlap ----------

function tokenizeForOverlap(s) {
  return String(s || "")
    .toLowerCase()
    .match(/[\u4e00-\u9fff]|[a-z0-9_.-]+/g) || [];
}

export function measureEditSimilarity(sourceText, candText) {
  const a = Array.from(String(sourceText || "").replace(/\s+/g, " ").trim());
  const b = Array.from(String(candText || "").replace(/\s+/g, " ").trim());
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return 1;
  if (n === 0 || m === 0) return 0;
  // Space-optimized Levenshtein distance for order-sensitive character edit similarity
  let prev = new Array(m + 1);
  let curr = new Array(m + 1);
  for (let j = 0; j <= m; j += 1) prev[j] = j;
  for (let i = 1; i <= n; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= m; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  const dist = prev[m];
  return Number(Math.max(0, 1 - dist / Math.max(n, m)).toFixed(3));
}

export function isBalancedOoxml(xmlString) {
  const s = String(xmlString || "");
  if (!/<w:document\b[\s\S]*<\/w:document>/i.test(s) && !/<p:sld\b[\s\S]*<\/p:sld>/i.test(s)) {
    return false;
  }
  const stack = [];
  const tagRe = /<\/?([A-Za-z0-9_]+:[A-Za-z0-9_]+)([^>]*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(s)) !== null) {
    const full = m[0];
    const tag = m[1];
    const selfClose = m[3] === "/";
    if (full.startsWith("</")) {
      if (stack.length === 0 || stack[stack.length - 1] !== tag) return false;
      stack.pop();
    } else if (!selfClose) {
      stack.push(tag);
    }
  }
  return stack.length === 0;
}

export function checkVerbatimBindingsForbidden(task, plainCand, rawCand = plainCand) {
  const issues = [];
  const rawStr = String(rawCand || plainCand || "");
  const plainStr = String(plainCand || "");
  for (const v of task.verbatim || []) {
    const target = v.startsWith("<") ? rawStr : plainStr;
    if (!target.includes(v)) {
      issues.push(`missing_verbatim:${v}`);
    }
  }
  // Group contiguous bullet/table/paragraph blocks so multi-line bullets work without leaking across owners
  const blockUnits = [];
  let cur = [];
  for (const line of plainStr.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) {
      if (cur.length) {
        blockUnits.push(cur.join(" "));
        cur = [];
      }
      continue;
    }
    if (/^(?:[-*•]|\d+[.)]|#{1,4}\s|\|)/.test(t) && cur.length > 0) {
      blockUnits.push(cur.join(" "));
      cur = [t];
    } else {
      cur.push(t);
    }
  }
  if (cur.length) blockUnits.push(cur.join(" "));
  const fallbackLines = plainStr.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const units = [...new Set([...blockUnits, ...fallbackLines])];
  for (const group of task.bindings || []) {
    const ok = units.some((u) => group.every((tok) => u.includes(tok)));
    if (!ok) issues.push(`unbound:${group.join("+")}`);
  }
  for (const pat of task.forbidden || []) {
    const re = new RegExp(pat, "i");
    const m = plainStr.match(re);
    if (m) issues.push(`forbidden:${m[0]}`);
  }
  if (task.minChars) {
    const len = plainStr.replace(/\s+/g, "").length;
    if (len < task.minChars) issues.push(`length_short:${len}<${task.minChars}`);
  }
  if (task.minWords) {
    const words = plainStr.trim().split(/\s+/).filter(Boolean).length;
    if (words < task.minWords) issues.push(`length_short:${words}w<${task.minWords}w`);
  }
  if (task.maxWords) {
    const words = plainStr.trim().split(/\s+/).filter(Boolean).length;
    if (words > task.maxWords) issues.push(`length_long:${words}w>${task.maxWords}w`);
  }
  return issues;
}

export function checkCardContamination(skillDir, datasets) {
  const refsDir = path.join(skillDir, "references");
  const filesToScan = [];
  const skillPath = path.join(skillDir, "SKILL.md");
  if (fs.existsSync(skillPath)) filesToScan.push(["SKILL.md", fs.readFileSync(skillPath, "utf8")]);
  if (fs.existsSync(refsDir)) {
    for (const fname of fs.readdirSync(refsDir).sort()) {
      if (fname.endsWith(".md")) filesToScan.push([fname, fs.readFileSync(path.join(refsDir, fname), "utf8")]);
    }
  }
  const srcCorpus = [];
  for (const ds of datasets) {
    for (const item of ds) {
      if (item.sourceFacts) srcCorpus.push(String(item.sourceFacts));
      if (item.instruction) srcCorpus.push(String(item.instruction));
      if (typeof item.source === "string") srcCorpus.push(item.source);
      else if (item.source && typeof item.source === "object") {
        srcCorpus.push(extractOoxmlPlainText(item.source, item.modality || "docx"));
      }
    }
  }
  const normCorpus = srcCorpus.map((s) => s.toLowerCase().replace(/\s+/g, " ").trim());
  const leaks = [];
  for (const [fname, raw] of filesToScan) {
    const cleaned = raw
      .replace(/^---[\s\S]*?---/, "")
      .replace(/`+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const cleanedLower = cleaned.toLowerCase();
    // 1. Check 8-char CJK windows (>= 6 CJK chars) across full file
    const chars = Array.from(cleanedLower);
    for (let i = 0; i <= chars.length - 8; i += 1) {
      const gram = chars.slice(i, i + 8).join("");
      const cjkCount = (gram.match(/[\u4e00-\u9fff]/g) || []).length;
      if (cjkCount < 6) continue;
      if (normCorpus.some((s) => s.includes(gram))) {
        leaks.push(`${fname} overlaps dataset (ZH) on "${gram}"`);
        break;
      }
    }
    // 2. Check 5-word English phrases (>= 24 chars) across full file
    const words = cleanedLower.replace(/[^a-z0-9'.-]+/g, " ").trim().split(/\s+/);
    for (let i = 0; i <= words.length - 5; i += 1) {
      const phrase = words.slice(i, i + 5).join(" ");
      if (phrase.length < 24) continue;
      if (normCorpus.some((s) => s.includes(phrase))) {
        leaks.push(`${fname} overlaps dataset (EN) on "${phrase}"`);
        break;
      }
    }
    if (leaks.length >= 8) return leaks;
  }
  return leaks;
}

export function measureTokenRetention(sourceText, candText) {
  const srcToks = tokenizeForOverlap(sourceText);
  const candToks = tokenizeForOverlap(candText);
  if (srcToks.length === 0) return { overlap: 1, lenRatio: 1, editSim: 1 };
  const candCounts = new Map();
  for (const t of candToks) candCounts.set(t, (candCounts.get(t) || 0) + 1);
  let matched = 0;
  for (const t of srcToks) {
    const left = candCounts.get(t) || 0;
    if (left > 0) {
      matched += 1;
      candCounts.set(t, left - 1);
    }
  }
  const overlap = matched / srcToks.length;
  const lenRatio = candToks.length / srcToks.length;
  const editSim = measureEditSimilarity(sourceText, candText);
  return { overlap: Number(overlap.toFixed(3)), lenRatio: Number(lenRatio.toFixed(3)), editSim };
}

// ---------- Fact-Atom Recall for Green-Field Drafting ----------

const QUAL_MATCH_PATTERNS = {
  min_inc: /(?:at\s+least|no\s+less\s+than|no\s+fewer\s+than|minimum\s+of|>=|≥|不低于|不少于|至少|以上)/i,
  max_inc: /(?:up\s+to|no\s+more\s+than|at\s+most|within|max(?:imum)?|<=|≤|最多|不超过|不高于|至多|以内|以下)/i,
  min_gt: /(?:more\s+than|greater\s+than|larger\s+than|over|above|>|超过|高于|大于|以上)/i,
  max_lt: /(?:under|below|less\s+than|fewer\s+than|<|低于|小于|少于|不到)/i,
  approx: /(?:approx(?:imately)?|roughly|about|around|~|≈|约|大约|近|左右)/i,
};

function stripHtmlStyleForFactScan(raw, modality) {
  let s = String(raw || "");
  if (modality === "html" || modality === "jsx" || modality === "svg") {
    s = s.replace(/<style\b[^>]*>[\s\S]*?(?:<\/style>|$)/gi, " ");
    s = s.replace(/<script\b[^>]*>[\s\S]*?(?:<\/script>|$)/gi, " ");
    s = s.replace(/\sstyle=(["'])[\s\S]*?\1/gi, " ");
  }
  return s;
}

export function evaluateDraftFactAtoms(task, candidateText) {
  const atoms = task.factAtoms || [];
  const rawForScan = stripHtmlStyleForFactScan(candidateText, task.modality || "markdown");
  const normCand = normalizeSpelledNumbers(rawForScan).replace(/,/g, "");
  const missingAtoms = [];
  const qualifierDrift = [];

  for (const atom of atoms) {
    if (!atom.required) continue;
    const val = normalizeSpelledNumbers(String(atom.value)).replace(/,/g, "");
    const esc = val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const isNumericVal = /^\d+(?:\.\d+)?%?$/.test(val);
    const valRe = isNumericVal
      ? new RegExp(`(?<![0-9.])${esc}(?!\\d|\\.\\d)`, "i")
      : new RegExp(`(?<![A-Za-z0-9.])${esc}(?![A-Za-z0-9]|\\.\\d)`, "i");
    const m = normCand.match(valRe);
    if (!m) {
      missingAtoms.push(atom.id);
      continue;
    }
    if (atom.qualifier && QUAL_MATCH_PATTERNS[atom.qualifier]) {
      // Check window around all occurrences of val
      let foundQual = false;
      const globalRe = isNumericVal
        ? new RegExp(`(?<![0-9.])${esc}(?!\\d|\\.\\d)`, "gi")
        : new RegExp(`(?<![A-Za-z0-9.])${esc}(?![A-Za-z0-9]|\\.\\d)`, "gi");
      for (const hit of normCand.matchAll(globalRe)) {
        const start = Math.max(0, hit.index - 24);
        const end = Math.min(normCand.length, hit.index + hit[0].length + 12);
        const win = normCand.slice(start, end);
        if (QUAL_MATCH_PATTERNS[atom.qualifier].test(win)) {
          foundQual = true;
          break;
        }
      }
      if (!foundQual) qualifierDrift.push(`${atom.id}(expected ${atom.qualifier})`);
    }
  }

  // Check for invented numbers not grounded in sourceFacts (allow derived diffs/ratios, step list numbers, dates/times in sourceFacts)
  const srcFactsFacts = extractProtectedFacts(normalizeSpelledNumbers(task.sourceFacts || ""), { modality: "markdown" });
  const candFacts = extractProtectedFacts(normCand, { modality: task.modality || "markdown" });
  const srcCanon = new Set(srcFactsFacts.map((f) => f.canonical));
  const srcBareNums = new Set(
    (normalizeSpelledNumbers(task.sourceFacts || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/g) || [])
  );
  // Also allow numbers derivable as |a-b| or a/b from source numbers
  const numArr = [...srcBareNums].map(Number).filter((n) => Number.isFinite(n));
  const derivedSet = new Set();
  for (let i = 0; i < numArr.length; i += 1) {
    for (let j = i + 1; j < numArr.length; j += 1) {
      derivedSet.add(String(Number(Math.abs(numArr[i] - numArr[j]).toFixed(2))));
      if (numArr[j] !== 0) derivedSet.add(String(Number((numArr[i] / numArr[j]).toFixed(1))));
      if (numArr[i] !== 0) derivedSet.add(String(Number((numArr[j] / numArr[i]).toFixed(1))));
    }
  }
  const invented = [];
  for (const cf of candFacts) {
    if (cf.kind !== "number" && cf.kind !== "qualified-number") continue;
    const bare = (cf.canonical.match(/\d+(?:\.\d+)?/) || [""])[0];
    if (!bare) continue;
    if (srcCanon.has(cf.canonical) || srcBareNums.has(bare) || derivedSet.has(bare)) continue;
    // Allow 1-2-3-4-5 small list counts if present as pure ordinals, already filtered at line start, or structural 1..4 in slide bullets
    if (/^[1-4]$/.test(bare) && task.modality === "markdown") continue;
    invented.push(cf.raw);
  }

  const totalReq = atoms.filter((a) => a.required).length || 1;
  const retained = totalReq - missingAtoms.length - qualifierDrift.length;
  return {
    ok: missingAtoms.length === 0 && qualifierDrift.length === 0 && invented.length === 0,
    retentionRate: Math.max(0, retained / totalReq),
    missingAtoms,
    qualifierDrift,
    invented,
  };
}

// ---------- Unified Candidate Scorer (Veto-First + 5 Orthogonal Dimensions) ----------

export function scoreSkillOutput(task, candidatePayload, { mode = "revision" } = {}) {
  const modality = task.modality || detectModality(task.filename || "draft.md") || "markdown";
  const pack = resolveEffectivePack(task.pack || "business-brief", PACKS_BY_ID);
  const isOoxml = modality === "pptx" || modality === "docx";

  let res;
  let plainCand;
  let plainSrc;
  if (isOoxml) {
    let entries = candidatePayload;
    if (typeof candidatePayload === "string") {
      // If model returned raw XML string for word/document.xml, wrap it back into entry map
      const targetKey = modality === "docx" ? "word/document.xml" : "ppt/slides/slide1.xml";
      entries = { ...(typeof task.source === "object" ? task.source : {}), [targetKey]: candidatePayload };
    }
    res = auditOoxmlEntries(entries || {}, {
      filename: task.filename || `sample.${modality}`,
      modality,
      pack,
    });
    plainCand = extractOoxmlPlainText(entries, modality);
    plainSrc = extractOoxmlPlainText(task.source || task.sourceFacts || "", modality);
  } else {
    plainCand = String(candidatePayload || "");
    plainSrc = String(task.source || task.sourceFacts || "");
    res = auditText(plainCand, {
      filename: task.filename || "draft.md",
      modality,
      pack,
    });
  }

  const findings = res.findings || [];
  const coreErrors = findings.filter((f) => f.severity === "error").length;

  // Relative-to-source style findings on drafting: count excess occurrences above sourceFacts instead of hiding entire ruleIds
  let styleFindingsList = findings.filter((f) => f.severity !== "error");
  if (mode === "drafting" && plainSrc) {
    const srcAudit = auditText(plainSrc, { filename: task.filename || "draft.md", modality, pack });
    const srcCounts = new Map();
    for (const f of srcAudit.findings || []) {
      srcCounts.set(f.ruleId, (srcCounts.get(f.ruleId) || 0) + 1);
    }
    styleFindingsList = styleFindingsList.filter((f) => {
      const rem = srcCounts.get(f.ruleId) || 0;
      if (rem > 0) {
        srcCounts.set(f.ruleId, rem - 1);
        return false;
      }
      return true;
    });
  }
  const styleFindings = styleFindingsList.length;

  const patternRes =
    modality === "markdown" || modality === "text" || modality === "html" || modality === "css" || modality === "jsx"
      ? auditPatterns(plainCand, { filename: task.filename || "draft.md", modality, banks: PATTERN_BANKS })
      : { findings: [] };
  const patternFindings = patternRes.findings || [];

  // Run 3rd-order probes on extracted plain text for OOXML too so docx/pptx prose is scanned
  const thirdOrderMod = isOoxml ? "markdown" : modality;
  const thirdOrderHits = runThirdOrderProbes(plainCand, { modality: thirdOrderMod, lang: task.lang });
  const hiddenHits = runHiddenSlopProbes(plainCand, modality);
  const langCheck = checkLanguagePurity(plainCand, task.lang, modality);
  const dirCheck = checkDirectionPairs(plainCand, task.directionPairs || []);
  const rawCandStr = typeof candidatePayload === "string" ? candidatePayload : JSON.stringify(candidatePayload || "");
  const vbfIssues = checkVerbatimBindingsForbidden(task, plainCand, rawCandStr);

  // Fact checking: Drafting uses factAtoms; Revision uses fixed verifyRevision (run-concatenated OOXML)
  let factOk = true;
  let factRetentionRate = 1;
  let factIssues = [];
  if (mode === "drafting") {
    const df = evaluateDraftFactAtoms(task, plainCand);
    factOk = df.ok && dirCheck.ok;
    factRetentionRate = df.retentionRate;
    if (df.missingAtoms.length) factIssues.push(`missing:${df.missingAtoms.join(",")}`);
    if (df.qualifierDrift.length) factIssues.push(`qDrift:${df.qualifierDrift.join(",")}`);
    if (df.invented.length) factIssues.push(`invented:${df.invented.join(",")}`);
    if (!dirCheck.ok) factIssues.push(`reversed:${JSON.stringify(dirCheck.reversed)}`);
  } else {
    const normSrc = normalizeSpelledNumbers(plainSrc);
    const normCand = normalizeSpelledNumbers(plainCand);
    const scanMod = isOoxml ? "markdown" : modality;
    const vr = verifyRevision(plainSrc, plainCand, { modality: scanMod, allowAdded: false });
    const vrNorm = verifyRevision(normSrc, normCand, { modality: scanMod, allowAdded: false });
    const bestVr = vr.retentionRate >= vrNorm.retentionRate ? vr : vrNorm;

    const allowedRemoved = new Set((task.allowedRemovedNumbers || []).map((x) => String(x).replace(/,/g, "").toLowerCase()));
    const beforeFactObjs = extractProtectedFacts(normSrc, { modality: scanMod });
    const beforeBareSet = new Set(
      beforeFactObjs
        .map((f) => (f.canonical.match(/\d+(?:\.\d+)?/) || [""])[0])
        .filter(Boolean)
    );
    const beforeCanonSet = new Set(beforeFactObjs.map((f) => f.canonical));

    const realMissing = bestVr.missing.filter((m) => {
      const bare = (m.canonical.match(/\d+(?:\.\d+)?/) || [""])[0];
      return !allowedRemoved.has(m.raw.toLowerCase()) && !allowedRemoved.has(m.canonical.toLowerCase()) && !allowedRemoved.has(bare);
    });
    const realAdded = bestVr.addedNumbers.filter((a) => {
      const bare = (a.canonical.match(/\d+(?:\.\d+)?/) || [""])[0];
      return !beforeCanonSet.has(a.canonical) && !beforeBareSet.has(bare);
    });

    const totalRealFacts = Math.max(1, beforeFactObjs.length - allowedRemoved.size);
    const retainedReal = Math.max(0, totalRealFacts - realMissing.length - bestVr.qualifierDropped.length);
    factRetentionRate = Math.min(1, retainedReal / totalRealFacts);
    factOk = realMissing.length === 0 && bestVr.qualifierDropped.length === 0 && realAdded.length === 0 && dirCheck.ok;
    if (realMissing.length) factIssues.push(`missing:${realMissing.map((m) => m.raw).join(",")}`);
    if (bestVr.qualifierDropped.length) factIssues.push(`qDrop:${bestVr.qualifierDropped.map((q) => q.before).join(",")}`);
    if (realAdded.length) factIssues.push(`invented:${realAdded.map((a) => a.raw).join(",")}`);
    if (!dirCheck.ok) factIssues.push(`reversed:${JSON.stringify(dirCheck.reversed)}`);
  }

  // Degenerate / tool-echo / broken output guard
  const trimmedPlain = plainCand.trim();
  const rawTrimmed = typeof candidatePayload === "string" ? candidatePayload.trim() : trimmedPlain;
  const isToolEcho =
    (trimmedPlain.length > 0 &&
      trimmedPlain.length < 90 &&
      /^(?:npx\s+|dislop(?:_check|_review|\s+check)\b|#?\s*\.?\/references\/)/i.test(trimmedPlain)) ||
    (rawTrimmed.length > 0 &&
      rawTrimmed.length < 90 &&
      /^(?:npx\s+|dislop(?:_check|_review|\s+check)\b|#?\s*\.?\/references\/)/i.test(rawTrimmed));
  const isEmpty = trimmedPlain.length < 8;
  let brokenOoxml = false;
  if (isOoxml && (modality === "docx" || modality === "pptx")) {
    if (typeof candidatePayload === "string") {
      brokenOoxml = !isBalancedOoxml(candidatePayload);
    } else if (candidatePayload && typeof candidatePayload === "object") {
      const targetXmls = Object.entries(candidatePayload)
        .filter(([k]) => (modality === "docx" ? k === "word/document.xml" : /^ppt\/slides\/slide\d+\.xml$/i.test(k)))
        .map(([, v]) => v);
      brokenOoxml = targetXmls.length === 0 || targetXmls.some((x) => !isBalancedOoxml(x));
    }
  }
  const brokenHtml =
    modality === "html" && (!/<[a-z][\s\S]*>/i.test(plainCand) || (/<style\b/i.test(plainCand) && !/<\/style>/i.test(plainCand)));

  const isPreserve = task.kind === "preserve";
  const overlapStats = measureTokenRetention(plainSrc, plainCand);
  const isTextMod = modality === "markdown" || modality === "text";
  const profile = isTextMod && !isEmpty ? analyzeTextProfile(plainCand, { modality }) : null;
  const pocket =
    isTextMod && !isEmpty && plainCand.trim().length >= 30
      ? analyzeDocumentWithPocketModels(plainCand)
      : null;

  // Veto rules (mirroring Opus's veto-first evaluation)
  const vetoes = [];
  if (isToolEcho) vetoes.push("V_TOOL_ECHO");
  if (isEmpty || brokenOoxml || brokenHtml) vetoes.push("V_BROKEN_FORMAT");
  if (!factOk || vbfIssues.some((x) => x.startsWith("missing_verbatim:") || x.startsWith("unbound:"))) {
    vetoes.push("V_FACT");
  }
  if (vbfIssues.some((x) => x.startsWith("length_"))) vetoes.push("V_LENGTH");
  if (vbfIssues.some((x) => x.startsWith("forbidden:"))) vetoes.push("V_FORBIDDEN");
  if (!langCheck.ok) vetoes.push("V_LANG_MIX");
  if (hiddenHits.length > 0 || thirdOrderHits.length > 0) vetoes.push("V_2ND_3RD_SLOP");
  if (isPreserve && (overlapStats.editSim < 0.8 || overlapStats.lenRatio < 0.75 || overlapStats.lenRatio > 1.25 || findings.length > 0)) {
    vetoes.push("V_OVEREDIT_CLEAN");
  }
  if (
    !isPreserve &&
    !isToolEcho &&
    mode === "revision" &&
    task.modality === "markdown" &&
    (overlapStats.lenRatio < 0.18 || (overlapStats.lenRatio < 0.25 && (!factOk || overlapStats.overlap < 0.28)))
  ) {
    vetoes.push("V_DEGENERATE_COMPRESSION");
  }

  // Component scores (0-100); zero out catastrophic tool-echo or broken formats
  const catastrophic = isEmpty || isToolEcho || brokenOoxml || brokenHtml;
  const d1 = catastrophic ? 0 : Math.max(0, 35 - coreErrors * 25 - styleFindings * 10 - patternFindings.length * 4);
  const d2 = catastrophic ? 0 : Math.max(0, 20 - thirdOrderHits.length * 10 - hiddenHits.length * 10);
  const d3Penalty = vbfIssues.length * 6;
  const d3 = catastrophic ? 0 : Math.max(0, Math.round(factRetentionRate * 25) - (factOk ? 0 : 12) - d3Penalty);
  let d4 = 10;
  if (catastrophic) d4 = 0;
  else if (profile) {
    if (profile.sentenceCount >= 5 && profile.burstiness.status === "flat") d4 -= 4;
    if (profile.structure.lowBurstinessVapor) d4 -= 4;
    if (profile.sentenceCount >= 3 && profile.concreteness.anchorCount === 0) d4 -= 4;
    if (pocket && pocket.documentProbability >= 0.78) d4 -= 3;
    d4 = Math.max(0, d4);
  }
  let d5 = 10;
  if (catastrophic) d5 = 0;
  else if (isPreserve) {
    d5 = overlapStats.editSim >= 0.9 && overlapStats.lenRatio >= 0.85 && overlapStats.lenRatio <= 1.15 ? 10
      : overlapStats.editSim >= 0.8 ? 6 : 0;
  } else if (!langCheck.ok || overlapStats.lenRatio < 0.18 || vbfIssues.some((x) => x.startsWith("forbidden:"))) {
    d5 = 0;
  }

  const composite = catastrophic ? 0 : d1 + d2 + d3 + d4 + d5;
  const allClear = vetoes.length === 0 && coreErrors === 0 && styleFindings === 0 && patternFindings.length === 0 && d4 >= 8;

  return {
    taskId: task.id,
    mode,
    kind: task.kind || mode,
    split: task.split || "core",
    lang: task.lang,
    modality,
    vetoes,
    passedNoVeto: vetoes.length === 0,
    allClear,
    scores: { d1, d2, d3, d4, d5, composite },
    coreErrors,
    styleFindings,
    patternCount: patternFindings.length,
    detRuleIds: [...new Set([...findings.map((f) => f.ruleId), ...patternFindings.map((f) => f.ruleId)])],
    thirdOrderProbes: thirdOrderHits.map((h) => h.probeId),
    hiddenProbes: hiddenHits,
    factRetentionRate: Number(factRetentionRate.toFixed(3)),
    factIssues: [...factIssues, ...vbfIssues],
    langPurityOk: langCheck.ok,
    overlapStats,
    pocketProb: pocket ? pocket.documentProbability : null,
  };
}

// ---------- Wilson Score Interval & Token Economy Helpers ----------

export function wilsonCI(successes, total, z = 1.96) {
  if (total <= 0) return { rate: 0, low: 0, high: 0 };
  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return {
    rate: Number((p * 100).toFixed(1)),
    low: Number((Math.max(0, center - half) * 100).toFixed(1)),
    high: Number((Math.min(1, center + half) * 100).toFixed(1)),
  };
}

export function estimateTokens(text) {
  const s = String(text || "");
  const cjk = (s.match(/[\u4e00-\u9fff]/gu) || []).length;
  const nonCjkBytes = Buffer.byteLength(s.replace(/[\u4e00-\u9fff]/gu, ""), "utf8");
  return Math.ceil(cjk * 1.4 + nonCjkBytes / 4);
}

export function loadSkillPackage(skillDir) {
  const skillPath = path.join(skillDir, "SKILL.md");
  assert.ok(fs.existsSync(skillPath), `Missing SKILL.md in ${skillDir}`);
  const raw = fs.readFileSync(skillPath, "utf8");
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  assert.ok(fmMatch, `Invalid YAML frontmatter in ${skillPath}`);
  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() || "dislop";
  const desc = (frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim() || "").replace(/^["']|["']$/g, "");
  const refsDir = path.join(skillDir, "references");
  const refs = {};
  if (fs.existsSync(refsDir)) {
    for (const f of fs.readdirSync(refsDir).sort()) {
      if (f.endsWith(".md")) refs[f] = fs.readFileSync(path.join(refsDir, f), "utf8");
    }
  }
  const refTokens = Object.values(refs).map(estimateTokens);
  return {
    dir: skillDir,
    raw,
    frontmatter,
    name,
    description: desc,
    body,
    refs,
    stats: {
      frontmatterBytes: Buffer.byteLength(frontmatter, "utf8"),
      frontmatterTokens: estimateTokens(frontmatter),
      bodyBytes: Buffer.byteLength(body, "utf8"),
      bodyTokens: estimateTokens(body),
      refCount: Object.keys(refs).length,
      avgRefTokens: refTokens.length ? Math.round(refTokens.reduce((a, b) => a + b, 0) / refTokens.length) : 0,
      maxRefTokens: refTokens.length ? Math.max(...refTokens) : 0,
      refTokensByFile: Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, estimateTokens(v)])),
    },
  };
}

// ---------- Progressive Disclosure Ref Matching ----------

const REF_GROUP_COMPAT = {
  "en-work-docs": ["work-docs.md", "business-and-rfc.md", "regulated-and-precision.md"],
  "en-essay": ["essay.md", "editorial-and-essay.md"],
  "en-office": ["office.md", "web-ui-and-deck.md"],
  "en-web-ui": ["web-ui.md", "web-ui-and-deck.md"],
  "zh-work-docs": ["work-docs.zh-CN.md", "work-docs.md", "business-and-rfc.md"],
  "zh-essay": ["essay.zh-CN.md", "essay.md", "editorial-and-essay.md"],
  "zh-office": ["office.zh-CN.md", "office.md", "web-ui-and-deck.md"],
  "zh-web-ui": ["web-ui.zh-CN.md", "web-ui.md", "web-ui-and-deck.md"],
};

export function selectReferenceForTask(skillPkg, task) {
  const refNames = Object.keys(skillPkg.refs);
  const isZh = task.lang === "zh";
  const mod = task.modality || "markdown";
  const domain = task.domain || "";
  const pack = task.pack || "";

  let preferred = [];
  if (mod === "html" || mod === "css" || mod === "jsx" || domain === "web-ui") {
    preferred = isZh ? ["web-ui.zh-CN.md", "web-ui.md", "web-ui-and-deck.md"] : ["web-ui.md", "web-ui-and-deck.md"];
  } else if (mod === "docx" || mod === "pptx" || domain === "docx-doc" || domain === "pptx-deck" || pack === "executive-deck") {
    preferred = isZh ? ["office.zh-CN.md", "office.md", "web-ui-and-deck.md"] : ["office.md", "web-ui-and-deck.md"];
  } else if (pack === "literary-essay" || domain.includes("essay")) {
    preferred = isZh ? ["essay.zh-CN.md", "essay.md", "editorial-and-essay.md"] : ["essay.md", "editorial-and-essay.md"];
  } else if (pack === "regulated-comms") {
    preferred = isZh ? ["work-docs.zh-CN.md", "regulated-and-precision.md"] : ["work-docs.md", "regulated-and-precision.md"];
  } else {
    preferred = isZh ? ["work-docs.zh-CN.md", "work-docs.md", "business-and-rfc.md"] : ["work-docs.md", "business-and-rfc.md"];
  }

  for (const cand of preferred) {
    if (refNames.includes(cand)) return cand;
  }
  return refNames[0] || null;
}

// ---------- Dataset Loaders ----------

export function loadAllSkillBenchData() {
  const routing = JSON.parse(fs.readFileSync(path.join(DATASETS_DIR, "skill-routing-v1.json"), "utf8"));
  const drafting = JSON.parse(fs.readFileSync(path.join(DATASETS_DIR, "skill-drafting-v1.json"), "utf8"));
  const revExt = JSON.parse(fs.readFileSync(path.join(DATASETS_DIR, "skill-revision-ext-v1.json"), "utf8"));
  const revHard = JSON.parse(fs.readFileSync(path.join(DATASETS_DIR, "revision-hard-v2.json"), "utf8"));
  const holdoutPath = path.join(DATASETS_DIR, "skill-holdout-v1.json");
  const holdout = fs.existsSync(holdoutPath) ? JSON.parse(fs.readFileSync(holdoutPath, "utf8")) : { tasks: [] };
  return {
    routingCases: routing.cases || [],
    draftingTasks: (drafting.tasks || []).map((t) => ({ ...t, split: "core" })),
    revisionTasks: [
      ...(revExt.tasks || []).map((t) => ({ ...t, split: "core" })),
      ...(revHard.tasks || []).map((t) => ({ ...t, kind: "revise", split: "core" })),
    ],
    holdoutTasks: (holdout.tasks || []).map((t) => ({ ...t, split: "holdout" })),
  };
}

// ---------- Live Model Client & Prompts ----------

function stripOutputWrapper(raw) {
  let s = String(raw || "").trim();
  const thinkEnd = s.lastIndexOf("</think>");
  if (thinkEnd !== -1) s = s.slice(thinkEnd + 8).trim();
  s = s.replace(/^```(?:html|xml|markdown|md|json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return s;
}

function resolveApiKey(spec) {
  for (const k of spec.envKeys || []) {
    if (process.env[k]) return process.env[k];
  }
  return "";
}

function estimateUsd(spec, usage) {
  return ((usage.promptTokens || 0) * (spec.pricing?.inputPer1M || 0) +
    (usage.completionTokens || 0) * (spec.pricing?.outputPer1M || 0)) / 1_000_000;
}

async function callChat(spec, apiKey, messages, maxTokens = 2048) {
  assertLiveNetworkAllowed();
  const url = `${spec.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const t0 = performance.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 180_000);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: spec.id,
          temperature: 0.2,
          max_tokens: spec.thinking ? Math.max(maxTokens, 16384) : maxTokens,
          ...(spec.provider === "dashscope" && spec.thinking === false ? { enable_thinking: false } : {}),
          messages,
        }),
      });
      const rawBody = await resp.text();
      if ((resp.status === 429 || resp.status === 503 || resp.status >= 500) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${rawBody.slice(0, 160)}`);
      const data = JSON.parse(rawBody);
      const choice = data?.choices?.[0];
      return {
        text: stripOutputWrapper(choice?.message?.content || ""),
        finishReason: choice?.finish_reason || "stop",
        latencyMs: Math.round(performance.now() - t0),
        usage: {
          promptTokens: Number(data?.usage?.prompt_tokens || 0),
          completionTokens: Number(data?.usage?.completion_tokens || 0),
        },
      };
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error("Chat call failed");
}

async function runRoutingCase(spec, apiKey, skillPkg, rc) {
  const refList = Object.keys(skillPkg.refs).join(", ");
  const sysPrompt =
    "You are an AI agent deciding whether to invoke an installed skill for the user's request.\n" +
    `Installed skill:\n- name: ${skillPkg.name}\n- description: ${skillPkg.description}\n\n` +
    "Reply ONLY with valid JSON: {\"trigger\": true|false, \"reason\": \"short phrase\"}. " +
    "Trigger ONLY when the skill description matches the task.";
  const r1 = await callChat(spec, apiKey, [
    { role: "system", content: sysPrompt },
    { role: "user", content: rc.prompt },
  ], 512);

  let triggered = false;
  try {
    const parsed = JSON.parse(r1.text);
    triggered = Boolean(parsed.trigger);
  } catch {
    triggered = /"trigger"\s*:\s*true/i.test(r1.text);
  }

  let selectedRef = "none";
  let usage = { ...r1.usage };
  if (triggered) {
    const routePrompt =
      `You activated skill '${skillPkg.name}'. Available reference files: ${refList}.\n` +
      `Skill instructions:\n${skillPkg.body}\n\n` +
      "Select the SINGLE best reference file from the list above for this user request. " +
      'Reply ONLY with JSON: {"ref": "<filename-from-list-or-none>"}.';
    const r2 = await callChat(spec, apiKey, [
      { role: "system", content: routePrompt },
      { role: "user", content: rc.prompt },
    ], 512);
    usage.promptTokens += r2.usage.promptTokens;
    usage.completionTokens += r2.usage.completionTokens;
    try {
      const p2 = JSON.parse(r2.text);
      selectedRef = String(p2.ref || "none").replace(/^.*references\//, "").trim();
    } catch {
      const m = r2.text.match(/([a-z0-9-]+\.(?:zh-CN\.)?md)/i);
      if (m) selectedRef = m[1];
    }
  }

  const allowedRefs = REF_GROUP_COMPAT[rc.expectedRefGroup] || [];
  const exactExpectedRef = allowedRefs.find((r) => r in skillPkg.refs) || null;
  const refCorrect = !rc.shouldTrigger ? !triggered : triggered && (exactExpectedRef ? selectedRef === exactExpectedRef : true);

  return {
    caseId: rc.id,
    lang: rc.lang,
    shouldTrigger: rc.shouldTrigger,
    triggered,
    triggerCorrect: triggered === rc.shouldTrigger,
    expectedRef: exactExpectedRef,
    selectedRef,
    refCorrect,
    usage,
  };
}

function buildTaskUserPrompt(task, mode) {
  if (mode === "drafting") {
    return (
      `Facts:\n${task.sourceFacts}\n\n` +
      `Task:\n${task.instruction}\n\n` +
      "Return ONLY the final deliverable with zero commentary or wrapper text."
    );
  }
  const srcStr = typeof task.source === "object" ? JSON.stringify(task.source) : String(task.source);
  const inst = task.instruction || (
    task.lang === "zh"
      ? "请按要求审校并输出最终结果，保留全部原始事实、数字和限定词，只返回最终成品不要加解释。"
      : "Review and revise if needed while preserving all original facts, numbers, and qualifiers. Return ONLY the final output with no commentary."
  );
  return `Input (${task.filename}):\n${srcStr}\n\nTask:\n${inst}\n\nReturn ONLY the final deliverable with zero commentary.`;
}

function unwrapOoxmlCandidate(candidate, modality) {
  if ((modality !== "docx" && modality !== "pptx") || typeof candidate !== "string") return candidate;
  const trimmed = candidate.trim();
  if (!trimmed.startsWith("{")) return candidate;
  try {
    const obj = JSON.parse(trimmed);
    if (modality === "docx" && obj["word/document.xml"]) return obj["word/document.xml"];
    if (modality === "pptx" && Object.keys(obj).some((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))) {
      return obj;
    }
  } catch {}
  return candidate;
}

async function runGenerationTask(spec, apiKey, arm, skillPkg, task, mode) {
  const userContent = buildTaskUserPrompt(task, mode);
  const messages = [];
  let selectedRef = null;
  let routeTokens = { promptTokens: 0, completionTokens: 0 };

  if (arm !== "no_skill") {
    const refList = Object.keys(skillPkg.refs);
    if (task.modelChosenRef && refList.length > 0) {
      const routePrompt =
        `You activated skill '${skillPkg.name}'. Available reference files: ${refList.join(", ")}.\n` +
        `Skill instructions:\n${skillPkg.body}\n\n` +
        "Select the SINGLE best reference file for this task. Reply ONLY with JSON: {\"ref\": \"<filename>\"}.";
      const rt = await callChat(spec, apiKey, [
        { role: "system", content: routePrompt },
        { role: "user", content: userContent.slice(0, 1200) },
      ], 256);
      routeTokens = rt.usage;
      try {
        const parsed = JSON.parse(rt.text);
        const picked = String(parsed.ref || "").replace(/^.*references\//, "").trim();
        if (picked in skillPkg.refs) selectedRef = picked;
      } catch {
        const m = rt.text.match(/([a-z0-9-]+\.(?:zh-CN\.)?md)/i);
        if (m && m[1] in skillPkg.refs) selectedRef = m[1];
      }
    }
    if (!selectedRef) selectedRef = selectReferenceForTask(skillPkg, task);
    const refContent = selectedRef ? skillPkg.refs[selectedRef] : "";
    const sys = [
      `Follow the '${skillPkg.name}' skill instructions strictly:`,
      skillPkg.body,
      refContent ? `\n--- Loaded Reference (${selectedRef}) ---\n${refContent}` : "",
    ].join("\n\n");
    messages.push({ role: "system", content: sys });
  }
  messages.push({ role: "user", content: userContent });

  const pass1 = await callChat(spec, apiKey, messages, 2400);
  let candidate = unwrapOoxmlCandidate(pass1.text, task.modality);

  let totalUsage = {
    promptTokens: pass1.usage.promptTokens + routeTokens.promptTokens,
    completionTokens: pass1.usage.completionTokens + routeTokens.completionTokens,
  };
  let totalMs = pass1.latencyMs;
  let repaired = false;

  if (arm === "skill_cli") {
    const sc1 = scoreSkillOutput(task, candidate, { mode });
    // Honest CLI simulation: feed ONLY real `dislop check` / `verifyRevision` (in revision mode) findings; never leak oracle factAtoms or hidden probes!
    const cliRevFacts = mode === "revision"
      ? sc1.factIssues.filter((f) => f.startsWith("missing:") || f.startsWith("qDrop:") || f.startsWith("invented:"))
      : [];
    if (sc1.detRuleIds.length > 0 || cliRevFacts.length > 0) {
      const diag = [
        ...sc1.detRuleIds.map((r) => `rule:${r}`),
        ...cliRevFacts.map((f) => `fact:${f}`),
      ].join("; ");
      const repairMsg = [
        ...messages,
        { role: "assistant", content: pass1.text },
        {
          role: "user",
          content:
            `Local dislop check reported: ${diag}.\n` +
            "Fix ONLY those issues while preserving every number, qualifier, and clean sentence intact. Return ONLY the final output.",
        },
      ];
      const pass2 = await callChat(spec, apiKey, repairMsg, 2400);
      totalUsage.promptTokens += pass2.usage.promptTokens;
      totalUsage.completionTokens += pass2.usage.completionTokens;
      totalMs += pass2.latencyMs;
      repaired = true;
      const cand2 = unwrapOoxmlCandidate(pass2.text, task.modality);
      const sc2 = scoreSkillOutput(task, cand2, { mode });
      if (sc2.passedNoVeto && (!sc1.passedNoVeto || sc2.scores.composite >= sc1.scores.composite)) {
        candidate = cand2;
      }
    }
  }

  const scored = scoreSkillOutput(task, candidate, { mode });
  return {
    taskId: task.id,
    mode,
    selectedRef,
    repaired,
    finishReason: pass1.finishReason,
    latencyMs: totalMs,
    usage: totalUsage,
    output: candidate,
    ...scored,
  };
}

// ---------- Aggregation & Reporting ----------

export function summarizeArmRun(armName, routingRecords = [], genRecords = [], skillStats = null) {
  const rtPos = routingRecords.filter((r) => r.shouldTrigger);
  const rtNeg = routingRecords.filter((r) => !r.shouldTrigger);
  const tp = rtPos.filter((r) => r.triggered).length;
  const fn = rtPos.length - tp;
  const fp = rtNeg.filter((r) => r.triggered).length;
  const tn = rtNeg.length - fp;
  const prec = tp + fp > 0 ? tp / (tp + fp) : 1;
  const rec = tp + fn > 0 ? tp / (tp + fn) : 1;
  const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;
  const refHits = rtPos.filter((r) => r.refCorrect).length;

  const summarizeSubset = (rows) => {
    if (rows.length === 0) return null;
    const avg = (fn) => Number((rows.reduce((a, x) => a + fn(x), 0) / rows.length).toFixed(1));
    const noVeto = rows.filter((x) => x.passedNoVeto).length;
    const clear = rows.filter((x) => x.allClear).length;
    return {
      count: rows.length,
      avgComposite: avg((x) => x.scores.composite),
      avgD1: avg((x) => x.scores.d1),
      avgD2: avg((x) => x.scores.d2),
      avgD3: avg((x) => x.scores.d3),
      avgD4: avg((x) => x.scores.d4),
      avgD5: avg((x) => x.scores.d5),
      noVetoCount: noVeto,
      noVetoRate: Number(((noVeto / rows.length) * 100).toFixed(1)),
      allClearCount: clear,
      allClearRate: Number(((clear / rows.length) * 100).toFixed(1)),
      factCleanCount: rows.filter((x) => x.factIssues.length === 0).length,
      totalDetAndPatternHits: rows.reduce((a, x) => a + x.coreErrors + x.styleFindings + x.patternCount, 0),
      totalHiddenOr3rdHits: rows.reduce((a, x) => a + x.thirdOrderProbes.length + x.hiddenProbes.length, 0),
    };
  };

  return {
    arm: armName,
    skillStats,
    routing: routingRecords.length
      ? {
          total: routingRecords.length,
          tp, fp, tn, fn,
          precision: Number((prec * 100).toFixed(1)),
          recall: Number((rec * 100).toFixed(1)),
          f1: Number((f1 * 100).toFixed(1)),
          triggerAccuracyCI: wilsonCI(tp + tn, routingRecords.length),
          posRefAccuracy: Number(((refHits / Math.max(1, rtPos.length)) * 100).toFixed(1)),
          negFPR: Number(((fp / Math.max(1, rtNeg.length)) * 100).toFixed(1)),
        }
      : null,
    drafting: summarizeSubset(genRecords.filter((r) => r.mode === "drafting")),
    revision: summarizeSubset(genRecords.filter((r) => r.mode === "revision" && r.kind !== "preserve")),
    preserve: summarizeSubset(genRecords.filter((r) => r.kind === "preserve")),
    holdout: summarizeSubset(genRecords.filter((r) => r.split === "holdout")),
    overallGen: summarizeSubset(genRecords),
  };
}

// ---------- Blind Pairwise Export (Position-Swapped Anti-Bias) ----------

function seededRand(seed = 20261122) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function exportBlindPacket(resultsData, armA, armB, outDir, { doubleSwap = false, swapRatio = 0.25, maxTasks = 0 } = {}) {
  const { draftingTasks, revisionTasks, holdoutTasks } = loadAllSkillBenchData();
  const taskMap = new Map([...draftingTasks, ...revisionTasks, ...holdoutTasks].map((t) => [t.id, t]));
  const byModelArm = new Map();
  for (const entry of resultsData.runs || []) {
    byModelArm.set(`${entry.model}::${entry.arm}`, entry);
  }

  const models = [...new Set((resultsData.runs || []).map((r) => r.model))];
  const rand = seededRand(20261122);
  const keyItems = [];
  let skippedTies = 0;
  const packetLines = [
    "# Blind Cross-Vendor Evaluation Packet",
    "",
    "You are an independent blind judge. You do NOT know which system (`A` or `B`) produced each candidate.",
    "Score each candidate using the 6-dimension rubric (1–5; F weighted ×2) and check Vetoes V1–V10 FIRST.",
    "Every score <= 2 or Veto MUST quote the exact offending span.",
    "",
    "## Vetoes (Any triggered veto loses against a clean candidate)",
    "- V1: Changed number, unit, date, reversed bound/polarity, or reversed direction (from X to Y).",
    "- V2: Invented ungrounded fact (number, entity, evidence source like 'load tests show', completion status, or non-fiction scene detail).",
    "- V3: Reversed meaning or modal strength drift ('may cut' -> 'cuts', 'target' -> 'result').",
    "- V4: Dropped core fact atom or collapsed required prose into telegraphic bullets.",
    "- V5: Introduced new AI slop ('not X — it's Y', staccato slogan triplets, moralizing closer, rhetorical self-Q&A).",
    "- V6: Modified verbatim spans (quotes, inline code, identifiers, URLs, standard headings).",
    "- V7: Wrong language or EN/ZH mixing.",
    "- V8: Violated explicit user instruction.",
    "- V9: Broken XML/HTML or removed working link / unexplained disabled button.",
    "- V10: On `preserve` (Do-No-Harm) tasks, rewrote > 20% of clean prose unnecessarily.",
    "",
  ];

  let pairCounter = 0;
  for (const model of models) {
    const runA = byModelArm.get(`${model}::${armA}`);
    const runB = byModelArm.get(`${model}::${armB}`);
    if (!runA || !runB) continue;
    const mapA = new Map((runA.genRecords || []).map((r) => [r.taskId, r]));
    const mapB = new Map((runB.genRecords || []).map((r) => [r.taskId, r]));

    // Exclude verbatim identical outputs (recorded as automatic Ties)
    const nonTieEntries = [];
    for (const [tid, recA] of mapA.entries()) {
      const recB = mapB.get(tid);
      if (!recB || !taskMap.has(tid)) continue;
      if (String(recA.output || "").trim() === String(recB.output || "").trim()) {
        skippedTies += 1;
        continue;
      }
      nonTieEntries.push([tid, recA]);
    }

    let entries = nonTieEntries;
    if (maxTasks > 0 && entries.length > maxTasks) {
      // Seeded stratified sampling across buckets: lang x (drafting / office-ui / stealth-rev / preserve / holdout)
      const buckets = new Map();
      for (const item of entries) {
        const t = taskMap.get(item[0]);
        const bucketKey = `${t.lang}:${t.split === "holdout" ? "holdout" : t.kind === "preserve" ? "preserve" : (t.modality === "html" || t.modality === "docx" || t.modality === "pptx") ? "office-ui" : t.sourceFacts ? "draft" : "rev"}`;
        if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
        buckets.get(bucketKey).push(item);
      }
      for (const arr of buckets.values()) {
        arr.sort(() => rand() - 0.5);
      }
      const bucketKeys = [...buckets.keys()].sort();
      const picked = [];
      let round = 0;
      while (picked.length < maxTasks) {
        let added = false;
        for (const bk of bucketKeys) {
          const arr = buckets.get(bk);
          if (round < arr.length && picked.length < maxTasks) {
            picked.push(arr[round]);
            added = true;
          }
        }
        if (!added) break;
        round += 1;
      }
      entries = picked;
    }

    for (let idx = 0; idx < entries.length; idx += 1) {
      const [taskId, recA] = entries[idx];
      const recB = mapB.get(taskId);
      const task = taskMap.get(taskId);
      const forwardFirst = rand() >= 0.5;
      const doSwap = doubleSwap || (swapRatio > 0 && idx % Math.max(1, Math.round(1 / swapRatio)) === 0);
      const orientations = doSwap
        ? [forwardFirst ? "AB" : "BA", forwardFirst ? "BA" : "AB"]
        : [forwardFirst ? "AB" : "BA"];

      for (const orient of orientations) {
        pairCounter += 1;
        const pid = `P${String(pairCounter).padStart(3, "0")}`;
        const candA = orient === "AB" ? recA.output : recB.output;
        const candB = orient === "AB" ? recB.output : recA.output;
        keyItems.push({
          pairId: pid,
          model,
          taskId,
          orientation: orient,
          candidateA_arm: orient === "AB" ? armA : armB,
          candidateB_arm: orient === "AB" ? armB : armA,
        });
        const srcBlock = task.sourceFacts
          ? `Source Facts:\n${task.sourceFacts}`
          : `Source Input:\n${typeof task.source === "object" ? JSON.stringify(task.source) : task.source}`;
        packetLines.push(
          `---`,
          `### ${pid} | task=${taskId} | kind=${task.kind || "draft"} | lang=${task.lang} | modality=${task.modality}`,
          "",
          srcBlock,
          "",
          `Instruction:\n${task.instruction || "Revise only AI slop while keeping facts exact."}`,
          "",
          "#### Candidate A",
          "```text",
          candA,
          "```",
          "",
          "#### Candidate B",
          "```text",
          candB,
          "```",
          ""
        );
      }
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  const packetPath = path.join(outDir, "blind-packet.md");
  const keyPath = path.join(outDir, "blind-key.json");
  fs.writeFileSync(packetPath, packetLines.join("\n"), "utf8");
  fs.writeFileSync(keyPath, JSON.stringify({ schema: "dislop.blind-key/2", armA, armB, skippedTies, pairs: keyItems }, null, 2) + "\n", "utf8");
  return { packetPath, keyPath, pairCount: keyItems.length, skippedTies };
}

// ---------- Offline Assertion Self-Test Suite ----------

export function runOfflineAssertions() {
  // 1. Validate datasets exist and match expected structure
  const data = loadAllSkillBenchData();
  assert.ok(data.routingCases.length >= 30, `Expected >= 30 routing cases, got ${data.routingCases.length}`);
  assert.ok(data.draftingTasks.length >= 12, `Expected >= 12 drafting tasks, got ${data.draftingTasks.length}`);
  assert.ok(data.revisionTasks.length >= 18, `Expected >= 18 revision tasks, got ${data.revisionTasks.length}`);
  const preserveCount = data.revisionTasks.filter((t) => t.kind === "preserve").length;
  assert.ok(preserveCount >= 6, `Expected >= 6 clean-preservation tasks, got ${preserveCount}`);
  for (const dt of data.draftingTasks) {
    assert.ok(Array.isArray(dt.factAtoms) && dt.factAtoms.length >= 3, `Drafting task ${dt.id} missing factAtoms`);
  }

  // 2. Test OOXML multi-run concatenation (no false space splitting 99. + 995%)
  const splitDocx = {
    "word/document.xml": "<w:document><w:body><w:p><w:r><w:t>一致率不低于 99.</w:t></w:r><w:r><w:t>995%。</w:t></w:r></w:p></w:body></w:document>",
  };
  const extracted = extractOoxmlPlainText(splitDocx, "docx");
  assert.equal(extracted, "一致率不低于 99.995%。");

  // 3. Test polarity reversal & direction reversal vetoes
  const polTask = data.revisionTasks.find((t) => t.id === "rx-zh-01-docx-xml");
  const reversedPolXml = "<w:document><w:body><w:p><w:r><w:t>单集群支持 6000 QPS，一致率低于 99.995%，迁移停机最多 30 秒。</w:t></w:r></w:p></w:body></w:document>";
  const scPol = scoreSkillOutput(polTask, reversedPolXml, { mode: "revision" });
  assert.ok(scPol.vetoes.includes("V_FACT"), `Expected V_FACT on polarity reversal, got ${scPol.vetoes}`);

  const dirTask = data.draftingTasks.find((t) => t.id === "dr-zh-01-release-brief");
  const reversedDirText = "结算导出任务队列 v2.4 单次最多导出 500000 行，大商户 P95 从 3 分钟升到 14 分钟，小商户不超过 40 秒，90 天以上归档表走工单。";
  const scDir = scoreSkillOutput(dirTask, reversedDirText, { mode: "drafting" });
  assert.ok(scDir.vetoes.includes("V_FACT"), `Expected V_FACT on direction reversal, got ${scDir.vetoes}`);

  // 4. Test clean drafting fact-atom recall (with attached units like 1500ms, 10TB, 2.8s, 4点20分) & Chinese numeral normalization
  assert.equal(chineseNumeralToInt("十五"), 15);
  assert.equal(chineseNumeralToInt("三"), 3);
  assert.ok(normalizeSpelledNumbers("twenty-four hours and 三步").includes("24 hours and 3步"));
  const postDraft = data.draftingTasks.find((t) => t.id === "dr-zh-02-postmortem");
  const postSample = "11 月 18 日 14:10-14:34，华东 2 个可用区返回 HTTP 502，持续 24 分钟，约 12000 次请求失败。发布 `auth-edge` 时把 Redis 超时从 1500ms 误填成 15ms。下周一前张工给 `deploy/check_env.py` 加 200ms 下限校验，周三前李工接入灰度 5xx > 1% 自动回滚。";
  assert.equal(evaluateDraftFactAtoms(postDraft, postSample).ok, true);
  const rfcDraft = data.draftingTasks.find((t) => t.id === "dr-en-01-rfc-memo");
  const rfcSample = "`billing-webhook` caused 14% duplicates. Switch to backoff capped at 8s with max 4 attempts and per-tenant queue depth <= 2000. `scripts/replay_503.py` cut duplicates to 0 across 10,000 events.";
  assert.equal(evaluateDraftFactAtoms(rfcDraft, rfcSample).ok, true);
  const uiDraft = data.draftingTasks.find((t) => t.id === "dr-zh-05-ui-card");
  const uiSample = `<div class="panel"><style>.panel{max-width:840px;padding:24px;}</style><h2>队列监控面板</h2><p>在线节点 12 个 · P99 延迟 38 ms · 今日拦截空链接 4 处</p><a href="./reports/daily.html">导出</a><button disabled title="夜间维护 02:00-03:00">清理归档</button></div>`;
  assert.equal(evaluateDraftFactAtoms(uiDraft, uiSample).ok, true);

  // 4b. Test allowedRemovedNumbers + repeated existing number in revision mode
  const regExt = data.revisionTasks.find((t) => t.id === "rx-en-03-regulated-trap");
  const regClean = "Backups use AES-256 encryption, carry no less than 99.95% monthly uptime SLA, and cutover pauses run up to 90 seconds across 6 clusters.";
  assert.equal(scoreSkillOutput(regExt, regClean, { mode: "revision" }).factIssues.length, 0);
  const engExt = data.revisionTasks.find((t) => t.id === "rx-zh-03-eng-postmortem");
  const engClean = "昨晚 22:14 网关超时导致 3 台实例打满 512 个连接。待确认：22:14 时 3 台实例的连接池超时原因及未释放路径。";
  assert.equal(scoreSkillOutput(engExt, engClean, { mode: "revision" }).factIssues.length, 0);

  // 5. Test Do-No-Harm veto on clean preservation (including order-sensitive shuffle detection!)
  const cleanTask = data.revisionTasks.find((t) => t.id === "rx-zh-04-clean-preserve-tech");
  const untouched = scoreSkillOutput(cleanTask, cleanTask.source, { mode: "revision" });
  assert.equal(untouched.passedNoVeto, true, `Clean source failed own check: ${JSON.stringify(untouched)}`);
  assert.equal(untouched.scores.d5, 10);
  const overEdited = scoreSkillOutput(cleanTask, "本地缓存已更新：14.2 GB 变 9.6 GB，不超过 35 ms，周二 1 次 8 秒。", { mode: "revision" });
  assert.ok(overEdited.vetoes.includes("V_OVEREDIT_CLEAN"), "Expected V_OVEREDIT_CLEAN on telegraphic rewrite of clean prose");
  const shuffledEssay = data.revisionTasks.find((t) => t.id === "rx-zh-05-clean-preserve-essay");
  const shuffledCand = "还是花 8 块钱买了一个揣进外套兜里，一路烫着手走回小区。我摸了摸口袋没带纸巾。铁桶盖子一掀全是白气，卖烤红薯的三轮车停在报刊亭后头，出地铁口的时候雨刚停。";
  assert.ok(scoreSkillOutput(shuffledEssay, shuffledCand, { mode: "revision" }).vetoes.includes("V_OVEREDIT_CLEAN"), "Expected V_OVEREDIT_CLEAN on shuffled clean prose");

  // 5b. Test XML balance, self-closing tags/entities, multi-line bindings, tool-echo veto, and card contamination
  assert.equal(isBalancedOoxml("<w:document><w:body><w:p><w:r><w:t>ok</w:r></w:t></w:p></w:body></w:document>"), false);
  assert.equal(isBalancedOoxml("<w:document><w:body><w14:p><w:r><w:t>ok</w:t></w:r></w14:p></w:body></w:document>"), true);
  assert.equal(
    extractOoxmlPlainText({ "word/document.xml": "<w:document><w:body><w:p><w:r><w:t/></w:r><w:r><w:t>A &amp; B</w:t></w:r></w:p></w:body></w:document>" }, "docx"),
    "A & B"
  );
  const docxSemicolon = "<w:document><w:body><w:p><w:r><w:t>Fast queue; safe queue; clean queue.</w:t></w:r></w:p></w:body></w:document>";
  assert.ok(scoreSkillOutput(polTask, docxSemicolon, { mode: "revision" }).vetoes.includes("V_2ND_3RD_SLOP"));
  assert.ok(scoreSkillOutput(postDraft, postSample.replace("张工", "王工"), { mode: "drafting" }).vetoes.includes("V_FACT"));
  assert.ok(scoreSkillOutput(postDraft, postSample.replace("周一前", "本周一前"), { mode: "drafting" }).vetoes.includes("V_FORBIDDEN"));
  const echoScore = scoreSkillOutput(polTask, "dislop_check", { mode: "revision" });
  assert.ok(echoScore.vetoes.includes("V_TOOL_ECHO") && echoScore.scores.composite === 0);
  const hoMultiLine = data.holdoutTasks.find((t) => t.id === "ho-en-02-cli-help");
  assert.ok(hoMultiLine && data.holdoutTasks.length >= 10, `Expected >= 10 holdout tasks, got ${data.holdoutTasks.length}`);
  const cardLeaks = checkCardContamination(path.join(ROOT, "skills", "dislop"), [data.draftingTasks, data.revisionTasks, data.holdoutTasks]);
  assert.deepEqual(cardLeaks, [], `Reference card exemplar contaminated with dataset: ${cardLeaks.join("; ")}`);

  // 6. Test hidden anti-synonym probe & language mixing veto
  const synHits = runHiddenSlopProbes("与其说是技术升级不如说是开启了协作新篇章。", "markdown");
  assert.ok(synHits.length >= 1, "Expected hidden synonym probe to trigger");
  assert.equal(checkLanguagePurity("This English sentence leaked 中文.", "en").ok, false);
  assert.equal(checkLanguagePurity("这是一段中文，包含 AES-256 与 TLS 1.3。", "zh").ok, true);

  // 7. Test Wilson CI & Skill package loader
  const ci = wilsonCI(28, 30);
  assert.ok(ci.rate > 90 && ci.low < ci.rate && ci.high > ci.rate);
  const pkg = loadSkillPackage(path.join(ROOT, "skills", "dislop"));
  assert.ok(pkg.body.length > 100 && pkg.stats.refCount >= 4);

  // 8. Test network circuit breaker
  const prev = process.env.DISLOP_TEST_MODE;
  process.env.DISLOP_TEST_MODE = "1";
  try {
    assert.throws(() => assertLiveNetworkAllowed(), /DISLOP_TEST_MODE=1/);
  } finally {
    if (prev === undefined) delete process.env.DISLOP_TEST_MODE;
    else process.env.DISLOP_TEST_MODE = prev;
  }

  console.log(
    `dislop-skill-bench --assert: ok (routing=${data.routingCases.length}, drafting=${data.draftingTasks.length}, ` +
      `revision=${data.revisionTasks.length} incl. ${preserveCount} Do-No-Harm; SKILL body=${pkg.stats.bodyBytes}B / ~${pkg.stats.bodyTokens}tok)`
  );
}

// ---------- CLI Entry ----------

async function runWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function parseArgs(argv) {
  const opts = {
    assertMode: argv.includes("--assert"),
    dryRun: argv.includes("--dry-run"),
    live: argv.includes("--live"),
    doubleSwap: argv.includes("--double-swap"),
    evalPath: null,
    rescorePath: null,
    blindArgs: null,
    inputPath: null,
    outPath: null,
    v0Dir: null,
    candDir: path.join(ROOT, "skills", "dislop"),
    models: [],
    arms: ["no_skill", "skill_v0"],
    tracks: ["routing", "drafting", "revision", "holdout"],
    repeats: 1,
    concurrency: 4,
    maxTasks: 0,
    maxUsd: 1.5,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--models" && argv[i + 1]) opts.models.push(...argv[++i].split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--arms" && argv[i + 1]) opts.arms = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--tracks" && argv[i + 1]) opts.tracks = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--repeats" && argv[i + 1]) opts.repeats = Math.max(1, Number(argv[++i]) || 1);
    else if (a === "--concurrency" && argv[i + 1]) opts.concurrency = Math.max(1, Math.min(8, Number(argv[++i]) || 4));
    else if (a === "--max-tasks" && argv[i + 1]) opts.maxTasks = Math.max(0, Number(argv[++i]) || 0);
    else if (a === "--max-usd" && argv[i + 1]) opts.maxUsd = Math.max(0.05, Number(argv[++i]) || 1.5);
    else if (a === "--out" && argv[i + 1]) opts.outPath = path.resolve(process.cwd(), argv[++i]);
    else if (a === "--v0-dir" && argv[i + 1]) opts.v0Dir = path.resolve(process.cwd(), argv[++i]);
    else if (a === "--cand-dir" && argv[i + 1]) opts.candDir = path.resolve(process.cwd(), argv[++i]);
    else if (a === "--eval" && argv[i + 1]) opts.evalPath = path.resolve(process.cwd(), argv[++i]);
    else if (a === "--rescore" && argv[i + 1]) opts.rescorePath = path.resolve(process.cwd(), argv[++i]);
    else if (a === "--input" && argv[i + 1]) opts.inputPath = path.resolve(process.cwd(), argv[++i]);
    else if (a === "--blind-export" && argv[i + 1] && argv[i + 2]) {
      opts.blindArgs = [argv[++i], argv[++i]];
    }
  }
  return opts;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.assertMode) {
    runOfflineAssertions();
    return;
  }
  if (opts.evalPath) {
    const raw = JSON.parse(fs.readFileSync(opts.evalPath, "utf8"));
    const summaries = (raw.runs || []).map((r) => summarizeArmRun(r.arm, r.routingRecords, r.genRecords, r.skillStats));
    console.log(JSON.stringify({ schema: "dislop.skill-bench-eval/1", summaries }, null, 2));
    return;
  }
  if (opts.rescorePath) {
    const raw = JSON.parse(fs.readFileSync(opts.rescorePath, "utf8"));
    const { draftingTasks, revisionTasks, holdoutTasks } = loadAllSkillBenchData();
    const taskMap = new Map([...draftingTasks, ...revisionTasks, ...holdoutTasks].map((t) => [t.id, t]));
    const rescoredRuns = (raw.runs || []).map((r) => {
      const genRecords = (r.genRecords || []).map((g) => {
        const task = taskMap.get(g.taskId);
        if (!task) return g;
        const sc = scoreSkillOutput(task, g.output, { mode: g.mode });
        return { ...g, ...sc };
      });
      const summary = summarizeArmRun(r.arm, r.routingRecords, genRecords, r.skillStats);
      return { ...r, genRecords, summary };
    });
    const outObj = { ...raw, runs: rescoredRuns };
    if (opts.outPath) fs.writeFileSync(opts.outPath, JSON.stringify(outObj, null, 2) + "\n", "utf8");
    console.log(JSON.stringify({ spentUsd: outObj.spentUsd, summaries: rescoredRuns.map((r) => ({ model: r.model, ...r.summary })) }, null, 2));
    return;
  }
  if (opts.blindArgs) {
    assert.ok(opts.inputPath && fs.existsSync(opts.inputPath), "Missing --input <results.json> for --blind-export");
    const raw = JSON.parse(fs.readFileSync(opts.inputPath, "utf8"));
    const outDir = opts.outPath || path.join(ROOT, "benchmarks", "results", "blind-tmp");
    const info = exportBlindPacket(raw, opts.blindArgs[0], opts.blindArgs[1], outDir, {
      doubleSwap: opts.doubleSwap,
      swapRatio: 0.25,
      maxTasks: opts.maxTasks,
    });
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  const registry = JSON.parse(fs.readFileSync(CANDIDATES_PATH, "utf8"));
  const selectedModels = (registry.candidates || []).filter((c) =>
    opts.models.length ? opts.models.includes(c.id) : ["gemini-3.5-flash", "qwen3.8-flash"].includes(c.id)
  );
  const data = loadAllSkillBenchData();

  if (opts.dryRun || !opts.live) {
    const routingCalls = opts.tracks.includes("routing") ? data.routingCases.length * opts.repeats : 0;
    const draftCalls = opts.tracks.includes("drafting") ? data.draftingTasks.length : 0;
    const revCalls = opts.tracks.includes("revision") ? data.revisionTasks.length : 0;
    const holdoutCalls = opts.tracks.includes("holdout") ? data.holdoutTasks.length : 0;
    console.log(
      JSON.stringify(
        {
          schema: "dislop.skill-bench-plan/1",
          dryRun: true,
          engineVersion: ENGINE_VERSION,
          models: selectedModels.map((m) => ({ id: m.id, hasKey: Boolean(resolveApiKey(m)) })),
          arms: opts.arms,
          tracks: opts.tracks,
          counts: { routing: routingCalls, drafting: draftCalls, revision: revCalls, holdout: holdoutCalls },
          maxUsd: opts.maxUsd,
        },
        null,
        2
      )
    );
    return;
  }

  assertLiveNetworkAllowed();
  const skillCache = {};
  if (opts.arms.includes("skill_v0")) {
    assert.ok(opts.v0Dir && fs.existsSync(opts.v0Dir), "Missing --v0-dir for skill_v0 arm");
    skillCache.skill_v0 = loadSkillPackage(opts.v0Dir);
  }
  if (opts.arms.includes("skill_cand") || opts.arms.includes("skill_cli")) {
    const pkg = loadSkillPackage(opts.candDir);
    skillCache.skill_cand = pkg;
    skillCache.skill_cli = pkg;
  }

  let spentUsd = 0;
  const runs = [];

  for (const spec of selectedModels) {
    const apiKey = resolveApiKey(spec);
    if (!apiKey) throw new Error(`Missing API key env var for ${spec.id}`);

    for (const arm of opts.arms) {
      const skillPkg = arm === "no_skill" ? null : skillCache[arm];
      const routingRecords = [];
      const genRecords = [];

      const effConc = spec.provider === "dashscope" ? 1 : opts.concurrency;
      if (opts.tracks.includes("routing") && arm !== "no_skill" && arm !== "skill_cli") {
        const routingWork = [];
        for (let rep = 0; rep < opts.repeats; rep += 1) {
          for (const rc of data.routingCases) routingWork.push({ rep: rep + 1, rc });
        }
        const rr = await runWithConcurrency(routingWork, effConc, async ({ rep, rc }) => {
          if (spentUsd >= opts.maxUsd) throw new Error(`Budget cap reached ($${spentUsd.toFixed(4)} >= $${opts.maxUsd})`);
          const res = await runRoutingCase(spec, apiKey, skillPkg, rc);
          spentUsd += estimateUsd(spec, res.usage);
          return { repeat: rep, ...res };
        });
        routingRecords.push(...rr);
      }

      if (opts.tracks.includes("drafting")) {
        const dr = await runWithConcurrency(data.draftingTasks, effConc, async (dt) => {
          if (spentUsd >= opts.maxUsd) throw new Error(`Budget cap reached ($${spentUsd.toFixed(4)} >= $${opts.maxUsd})`);
          const res = await runGenerationTask(spec, apiKey, arm, skillPkg, dt, "drafting");
          spentUsd += estimateUsd(spec, res.usage);
          return res;
        });
        genRecords.push(...dr);
      }

      if (opts.tracks.includes("revision")) {
        const rv = await runWithConcurrency(data.revisionTasks, effConc, async (rt) => {
          if (spentUsd >= opts.maxUsd) throw new Error(`Budget cap reached ($${spentUsd.toFixed(4)} >= $${opts.maxUsd})`);
          const res = await runGenerationTask(spec, apiKey, arm, skillPkg, rt, "revision");
          spentUsd += estimateUsd(spec, res.usage);
          return res;
        });
        genRecords.push(...rv);
      }

      if (opts.tracks.includes("holdout") && data.holdoutTasks.length > 0) {
        const ho = await runWithConcurrency(data.holdoutTasks, effConc, async (ht) => {
          if (spentUsd >= opts.maxUsd) throw new Error(`Budget cap reached ($${spentUsd.toFixed(4)} >= $${opts.maxUsd})`);
          const res = await runGenerationTask(spec, apiKey, arm, skillPkg, ht, ht.mode || "revision");
          spentUsd += estimateUsd(spec, res.usage);
          return res;
        });
        genRecords.push(...ho);
      }

      const summary = summarizeArmRun(arm, routingRecords, genRecords, skillPkg ? skillPkg.stats : null);
      console.error(
        `[${spec.id} :: ${arm}] ` +
          (summary.routing ? `RouteF1=${summary.routing.f1}% RefAcc=${summary.routing.posRefAccuracy}% NegFPR=${summary.routing.negFPR}% | ` : "") +
          (summary.drafting ? `Draft=${summary.drafting.avgComposite} (NoVeto=${summary.drafting.noVetoRate}%) | ` : "") +
          (summary.revision ? `Rev=${summary.revision.avgComposite} (NoVeto=${summary.revision.noVetoRate}%) | ` : "") +
          (summary.preserve ? `Keep=${summary.preserve.avgComposite} (NoVeto=${summary.preserve.noVetoRate}%)` : "")
      );
      runs.push({
        model: spec.id,
        arm,
        skillStats: skillPkg ? skillPkg.stats : null,
        summary,
        routingRecords,
        genRecords,
      });
      if (opts.outPath) {
        fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
        fs.writeFileSync(
          opts.outPath,
          JSON.stringify({ schema: "dislop.skill-bench-run/1", engineVersion: ENGINE_VERSION, spentUsd: Number(spentUsd.toFixed(5)), runs }, null, 2) + "\n",
          "utf8"
        );
      }
    }
  }

  const outObj = {
    schema: "dislop.skill-bench-run/1",
    engineVersion: ENGINE_VERSION,
    spentUsd: Number(spentUsd.toFixed(5)),
    runs,
  };
  if (opts.outPath) {
    fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
    fs.writeFileSync(opts.outPath, JSON.stringify(outObj, null, 2) + "\n", "utf8");
  }
  console.log(JSON.stringify({ spentUsd: outObj.spentUsd, summaries: runs.map((r) => ({ model: r.model, ...r.summary })) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Skill benchmark failed:", err.message);
    process.exit(1);
  });
}
