/**
 * dislop core engine (zero Node.js or DOM globals).
 * Shared identically by Node CLI, Node MCP server, and Browser Workbench (`site/`).
 */

export const ENGINE_VERSION = "0.7.0";

export const SEVERITY_RANK = {
  info: 1,
  warning: 2,
  error: 3,
  never: 99,
};

const EXT_TO_MODALITY = {
  ".md": "markdown",
  ".mdx": "markdown",
  ".txt": "text",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".jsx": "jsx",
  ".tsx": "jsx",
  ".svg": "svg",
  ".docx": "docx",
  ".pptx": "pptx",
};

export function detectModality(filename = "") {
  if (!filename || filename === "<memory>") return "markdown";
  const base = String(filename).split(/[\\/]/).pop().toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  return EXT_TO_MODALITY[base.slice(dot)] || null;
}

export function defaultPackForModality(modality) {
  if (modality === "html" || modality === "css" || modality === "jsx" || modality === "svg" || modality === "pptx") {
    return "deck-and-ui";
  }
  return "business-brief";
}

export function resolveEffectivePack(packId, packsById, config = {}) {
  const target = packsById[packId];
  if (!target) {
    const available = Object.keys(packsById).sort().join(", ");
    throw new Error(`Unknown Taste Pack '${packId}'. Available packs: ${available}`);
  }
  const chain = [];
  const visited = new Set();
  function collect(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const p = packsById[id];
    if (!p) return;
    for (const parentId of p.extends || []) {
      collect(parentId);
    }
    chain.push(p);
  }
  collect(packId);

  const mergedThresholds = {};
  const rulesById = new Map();
  for (const p of chain) {
    Object.assign(mergedThresholds, p.thresholds || {});
    for (const rule of p.rules || []) {
      const override = config?.rules?.[rule.id];
      if (override === "off" && rule.tier !== "invariant") {
        rulesById.delete(rule.id);
        continue;
      }
      const effectiveRule = { ...rule };
      if (typeof override === "string" && SEVERITY_RANK[override] && rule.tier !== "invariant") {
        effectiveRule.severity = override;
      }
      rulesById.set(rule.id, effectiveRule);
    }
  }

  if (Array.isArray(config?.forbid) && config.forbid.length > 0) {
    rulesById.set("local-custom-forbid", {
      id: "local-custom-forbid",
      tier: "invariant",
      severity: "error",
      family: "hygiene/forbid",
      probe: "regex",
      zones: ["raw"],
      modalities: ["markdown", "text", "html", "css", "jsx", "svg", "docx", "pptx", "pdf"],
      patterns: config.forbid,
      message: {
        en: "Matched forbidden pattern from local `.dislop.local.json` policy.",
        zh: "命中本地 `.dislop.local.json` 私有禁止词规则。",
      },
      deletionTest: {
        en: "Remove or de-identify the forbidden private term before committing.",
        zh: "提交前删除或脱敏该私有敏感词。",
      },
      exemplar: null,
    });
  }

  return {
    ...target,
    thresholds: mergedThresholds,
    rules: Array.from(rulesById.values()),
  };
}

const UTF8_ENCODER = new TextEncoder();

export function fnv1aHex(input) {
  const bytes = UTF8_ENCODER.encode(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function preserveLinesBlank(segment) {
  return segment.replace(/[^\r\n]/g, " ");
}

export function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

export function offsetToLineCol(text, lineStarts, offset, cpPrefix = null) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineStarts[mid] <= offset) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const lineIdx = Math.max(0, hi);
  const lineStart = lineStarts[lineIdx];
  // Unified Unicode codepoint column (1-based) so Node, Browser, and Python agree on emoji/CJK
  const col = cpPrefix
    ? cpPrefix[offset] - cpPrefix[lineStart] + 1
    : Array.from(text.slice(lineStart, offset)).length + 1;
  return { line: lineIdx + 1, col };
}

function buildCodePointPrefix(text) {
  const prefix = new Int32Array(text.length + 1);
  let cp = 0;
  for (let i = 0; i < text.length; i += 1) {
    prefix[i] = cp;
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const c2 = text.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        i += 1;
        prefix[i] = cp;
      }
    }
    cp += 1;
  }
  prefix[text.length] = cp;
  return prefix;
}

function isSentenceBreakAt(text, idx) {
  const ch = text[idx];
  if (!ch || !/[\n.!?。！？]/.test(ch)) return false;
  if (ch !== ".") return true;
  const prev = idx > 0 ? text[idx - 1] : "";
  const next = idx + 1 < text.length ? text[idx + 1] : "";
  if (/\d/.test(prev) && /\d/.test(next)) return false;
  const beforeWord = text.slice(Math.max(0, idx - 6), idx);
  if (/(?:^|\s)(?:vs|v|approx|e\.g|i\.e)$/i.test(beforeWord)) return false;
  return true;
}

function enclosingSentence(text, start, end) {
  let left = start;
  while (left > 0 && !isSentenceBreakAt(text, left - 1)) {
    left -= 1;
  }
  let right = end;
  while (right < text.length && !isSentenceBreakAt(text, right)) {
    right += 1;
  }
  if (right < text.length && /[.!?。！？]/.test(text[right])) {
    right += 1;
  }
  return text.slice(left, right).trim().slice(0, 240);
}

/**
 * Parse inline suppressions:
 * <!-- dislop-ignore-next-line rule-id -- reason -->
 * /* dislop-ignore-next-line rule-id -- reason *\/
 */
export function parseSuppressions(text) {
  const lines = text.split(/\r?\n/);
  const byTargetLine = new Map();
  const directives = [];
  const patterns = [
    /<!--\s*dislop-(?:ignore|disable)-next-line\s+([a-z0-9_*, -]+?)\s*--\s*(.+?)\s*-->/i,
    /\/\*\s*dislop-(?:ignore|disable)-next-line\s+([a-z0-9_*, -]+?)\s*--\s*(.+?)\s*\*\//i,
  ];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const pat of patterns) {
      const m = line.match(pat);
      if (m) {
        const ruleIds = m[1]
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const reason = m[2].trim();
        let targetLine = i + 2;
        while (targetLine <= lines.length && lines[targetLine - 1].trim() === "") {
          targetLine += 1;
        }
        const entry = {
          directiveLine: i + 1,
          targetLine,
          ruleIds,
          reason,
          used: false,
        };
        directives.push(entry);
        if (!byTargetLine.has(targetLine)) {
          byTargetLine.set(targetLine, []);
        }
        byTargetLine.get(targetLine).push(entry);
      }
    }
  }
  return { byTargetLine, directives };
}

/**
 * Build length-preserving masked views so character offsets match raw text 1:1.
 */
export function buildZones(rawText, modality) {
  const normText = String(rawText || "").replace(/\uFEFF/g, " ");
  // Raw zone masks only inline dislop-ignore comment directives themselves
  const raw = normText
    .replace(/<!--\s*dislop-[\s\S]*?-->/gi, preserveLinesBlank)
    .replace(/\/\*\s*dislop-[\s\S]*?\*\//gi, preserveLinesBlank);

  // Mask quote-specimen blocks BEFORE masking general HTML comments/directives
  let uiText = normText.replace(
    /<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->/gi,
    preserveLinesBlank
  );
  // Mask HTML comments (including dislop directives), script, style, code, pre, del, kbd
  uiText = uiText
    .replace(/<!--[\s\S]*?-->/g, preserveLinesBlank)
    .replace(/\/\*\s*dislop-[\s\S]*?\*\//gi, preserveLinesBlank)
    .replace(/<(script|style|code|pre|del|kbd)\b[^>]*>[\s\S]*?<\/\1>/gi, preserveLinesBlank);

  let prose = uiText;
  if (modality === "markdown" || modality === "text") {
    // YAML frontmatter
    prose = prose.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/, preserveLinesBlank);
    // Fenced code blocks (closed pairs first, then any unclosed trailing fence)
    prose = prose.replace(/```[\s\S]*?```/g, preserveLinesBlank);
    prose = prose.replace(/~~~[\s\S]*?~~~/g, preserveLinesBlank);
    prose = prose.replace(/^[ \t]*```[\s\S]*$/m, preserveLinesBlank);
    prose = prose.replace(/^[ \t]*~~~[\s\S]*$/m, preserveLinesBlank);
    // Inline code spans & strikethrough
    prose = prose.replace(/`[^`\n]+`/g, preserveLinesBlank);
    prose = prose.replace(/~~[^~\n]+~~/g, preserveLinesBlank);
    // Blockquotes (quoted external material)
    prose = prose.replace(/^[ \t]*>.*$/gm, preserveLinesBlank);
    // Markdown link targets ](url) while keeping visible [label]
    prose = prose.replace(/\]\([^)\n]+\)/g, (m) => "]" + preserveLinesBlank(m.slice(1)));
  } else if (modality === "html" || modality === "jsx" || modality === "svg") {
    // Strip tags in prose zone while preserving inner text offsets
    prose = prose.replace(/<[^>]+>/g, preserveLinesBlank);
  }
  // Mask bare URLs in prose
  prose = prose.replace(/https?:\/\/[^\s)>"'`]+/g, preserveLinesBlank);

  if (modality === "html" || modality === "jsx" || modality === "svg") {
    uiText = uiText.replace(/<[^>]+>/g, (tag) => {
      return preserveLinesBlank(tag);
    });
  }

  return { raw, prose, "ui-text": uiText };
}

function isAllowedMatch(matchText, allowList = []) {
  if (!allowList || allowList.length === 0) return false;
  const lower = matchText.toLowerCase();
  return allowList.some((item) => lower.includes(String(item).toLowerCase()));
}

// ---------- Structural Prose Probes ----------

function probeNegationPivot(proseText, rawText) {
  const hits = [];
  // Chinese: 这不是/这绝非/并非只是/不仅仅是 A，而是/更是 B / 与其说 A，不如说 B
  const zhRegex = /(?:(?:这|那|它)?(?:(?:并)?不(?:是|只是|仅仅?是)|绝非|并非(?:只是)?)|与其说是?)([^，。！？；\n]{1,22})[，,；—]+\s*(?:而是|更是|不如说是?)([^。！？；\n]{1,28})/gu;
  const zhRhetoricalHead = /^(?:(?:这|那|它)|绝非|并非|与其|并?不(?:只是|仅仅?是))/;
  const zhFactualRootCause = /(?:报错|故障|原因|超时|磁盘|内存|耗尽|端口|进程|导致|因为|[A-Za-z_][A-Za-z0-9_-]{2,})/;
  let m;
  while ((m = zhRegex.exec(proseText)) !== null) {
    const clauseA = (m[1] || "").trim();
    const clauseB = (m[2] || "").trim();
    const rawSlice = rawText.slice(m.index, m.index + m[0].length);
    const contextBefore = rawText.slice(Math.max(0, m.index - 12), m.index);
    const bothHaveConcrete =
      (/\d/.test(clauseA) && /\d/.test(clauseB)) ||
      /`/.test(rawSlice) ||
      /\.[a-z]{2,4}\b/i.test(rawSlice) ||
      /(?:第一次|第二次|站台|号楼|排第|星期|周[一二三四五六日天])/.test(rawSlice);
    if (bothHaveConcrete || clauseB.length > 26 || !clauseA || !clauseB) {
      continue;
    }
    if (!zhRhetoricalHead.test(m[0]) && zhFactualRootCause.test(contextBefore + rawSlice)) {
      continue;
    }
    hits.push({ index: m.index, length: m[0].length });
  }

  // English: (It/This/That/subject) isn't/wasn't (just) X — it's Y / This isn't a X (. / —) it's Y
  const enRegex = /\b(?:(?:(?:it|this|that)(?:'s| is| was)|they(?:'re| are))\s+not|(?:(?:it|this|that|they)\s+)?(?:isn't|wasn't|aren't|is not|was not|are not))\s+(?:just|merely|simply|only)\s+([^.;!?\n—–]{2,50}?)(?:[,;—–-]\s*(?:but|it(?:'s| is| was)|that(?:'s| is| was)|they(?:'re| are))\s+)([^.!?\n]{2,70})|\b(?:It|This|That)\s+(?:isn't|wasn't|is not|was not)\s+(?:a\s+|an\s+|just\s+)?([A-Za-z][A-Za-z0-9 -]{1,32}?)\s*(?:[.!]\s+|[—–-]\s*)(?:it's|it is|it was|that's)\s+([^.!?\n]{2,70})/giu;
  while ((m = enRegex.exec(proseText)) !== null) {
    const clauseA = m[1] || m[3] || "";
    const clauseB = m[2] || m[4] || "";
    const rawSlice = rawText.slice(m.index, m.index + m[0].length);
    if ((/\d/.test(clauseA) && /\d/.test(clauseB)) || /`/.test(rawSlice) || /\.[a-z]{2,4}\b/i.test(rawSlice)) {
      continue;
    }
    hits.push({ index: m.index, length: m[0].length });
  }
  return hits;
}

function probeStaccatoRun(proseText) {
  const hits = [];
  // Inspect paragraph by paragraph
  const paraRegex = /[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g;
  let pm;
  while ((pm = paraRegex.exec(proseText)) !== null) {
    const para = pm[0];
    const trimmed = para.trim();
    if (!trimmed) continue;
    // Skip headings, lists, tables
    if (/^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\|)/.test(trimmed)) continue;

    // Collect sentences with offsets inside paragraph
    const sentRegex = /[^.!?。！？\n]+[.!?。！？]/gu;
    const sentences = [];
    let sm;
    while ((sm = sentRegex.exec(para)) !== null) {
      const s = sm[0].trim();
      if (!s) continue;
      const body = s.replace(/[.!?。！？]+$/u, "").trim();
      if (!body) continue;
      const cjkCount = (body.match(/[\u4e00-\u9fff]/gu) || []).length;
      const enWords = body.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
      const isShort =
        (cjkCount >= 2 && cjkCount <= 6 && enWords <= 1 && !/[，,：:；;]/.test(body)) ||
        (cjkCount === 0 && enWords >= 2 && enWords <= 4 && !/[,:;]/.test(body));
      sentences.push({
        start: pm.index + sm.index + sm[0].indexOf(s),
        end: pm.index + sm.index + sm[0].indexOf(s) + s.length,
        isShort,
      });
    }

    let runStart = -1;
    let runCount = 0;
    for (let i = 0; i <= sentences.length; i += 1) {
      const cur = sentences[i];
      if (cur && cur.isShort) {
        if (runCount === 0) runStart = i;
        runCount += 1;
      } else {
        if (runCount >= 3) {
          const first = sentences[runStart];
          const last = sentences[i - 1];
          hits.push({ index: first.start, length: last.end - first.start });
        }
        runCount = 0;
      }
    }
  }
  return hits;
}

function probeZhFourCharTriad(proseText) {
  const hits = [];
  const triadRegex = /(?:^|[，。！？；：、“‘（\s]|(?:实现|具备|坚持|保持|做到|形成|打造|追求|提供|确保|了|是|的|以|向|为))([\u4e00-\u9fff]{4})[、，,]\s*([\u4e00-\u9fff]{4})[、，,]\s*([\u4e00-\u9fff]{4})(?=$|[，。！？；：、”’）\s]|[的地等])/gu;
  const entitySuffix = /(?:大学|学院|学校|公司|集团|银行|医院|中心|委员|政府|部门|机场|车站|高速|铁路|[省市区县镇乡])$/u;
  const brokenSlice = /[的了在或与及把被]/u;
  let m;
  while ((m = triadRegex.exec(proseText)) !== null) {
    const items = [m[1], m[2], m[3]];
    if (items.some((w) => entitySuffix.test(w) || brokenSlice.test(w))) continue;
    const triadStr = `${m[1]}${proseText.slice(m.index).match(/[、，,]/)[0]}${m[2]}`;
    const startOffset = m.index + m[0].indexOf(m[1]);
    const prevChar = startOffset > 0 ? proseText[startOffset - 1] : "";
    if (prevChar === "《") continue;
    void triadStr;
    hits.push({ index: startOffset, length: m.index + m[0].length - startOffset });
  }
  return hits;
}

function probeUnsourcedAttribution(proseText, rawText) {
  const hits = [];
  const attrRegex = /\b(?:[Ss]tudies|[Rr]esearch|[Ii]ndustry\s+research|[Ee]xperts|[Dd]ata)\s+(?:shows?|suggests?|indicates?|proves?)\b|(?:研究|数据|专家|业内人士|行业报告)(?:表明|显示|指出|认为)[，,]?/gu;
  let m;
  while ((m = attrRegex.exec(proseText)) !== null) {
    // Inspect enclosing + lookahead window in rawText for citation markers, links, years, or《report》
    const winStart = Math.max(0, m.index - 30);
    const winEnd = Math.min(rawText.length, m.index + 180);
    const windowRaw = rawText.slice(winStart, winEnd);
    const hasSource =
      /\[\^?\d+\]/.test(windowRaw) ||
      /\]\([^)]+\)/.test(windowRaw) ||
      /https?:\/\//.test(windowRaw) ||
      /\([^()\n]{2,40},\s*(?:19|20)\d{2}[a-z]?\)/.test(windowRaw) ||
      /《[^》\n]{2,30}》/.test(windowRaw) ||
      /(?:见|参见|详见)\s*\[/.test(windowRaw);
    if (!hasSource) {
      hits.push({ index: m.index, length: m[0].length });
    }
  }
  return hits;
}

function probeBoldLeadListWall(proseText, rawText, minRun = 4) {
  const hits = [];
  const lines = rawText.split(/\r?\n/);
  let offset = 0;
  let runStartOffset = 0;
  let runEndOffset = 0;
  let runCount = 0;

  for (let i = 0; i <= lines.length; i += 1) {
    const line = i < lines.length ? lines[i] : "";
    const proseLine = i < lines.length ? proseText.slice(offset, offset + line.length) : "";
    const isBullet =
      proseLine.trim().length > 0 &&
      /^\s*(?:[-*+]|\d+[.)])\s+\*\*([^*\n`]{2,36})\*\*\s*[:：—-]/.test(line);
    if (isBullet) {
      if (runCount === 0) runStartOffset = offset + line.search(/\S/);
      runCount += 1;
      runEndOffset = offset + line.length;
    } else if (i === lines.length || line.trim() !== "") {
      if (runCount >= minRun) {
        hits.push({ index: runStartOffset, length: runEndOffset - runStartOffset });
      }
      runCount = 0;
    }
    offset += line.length + 1;
  }
  return hits;
}

function probeEmDashDensity(proseText, maxPer300 = 4) {
  const hits = [];
  const paraRegex = /[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g;
  let pm;
  while ((pm = paraRegex.exec(proseText)) !== null) {
    const para = pm[0];
    if (/^\s*\|/.test(para)) continue;
    // Normalize Chinese `——` as ONE logical dash
    const normalized = para.replace(/——/g, "—");
    const dashes = (normalized.match(/—/g) || []).length;
    if (dashes < 5) continue;
    const cjk = (normalized.match(/[\u4e00-\u9fff]/gu) || []).length;
    const enWords = normalized.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
    const units = Math.max(1, enWords + cjk * 0.6);
    const density = (dashes / units) * 300;
    if (density > maxPer300) {
      const firstDash = para.indexOf("—");
      hits.push({ index: pm.index + Math.max(0, firstDash), length: Math.min(para.length, 48) });
    }
  }
  return hits;
}

function probeZhHalfwidthPunctuation(proseText) {
  const hits = [];
  const re = /[\u4e00-\u9fff][,;:!?][\u4e00-\u9fff]/gu;
  let m;
  while ((m = re.exec(proseText)) !== null) {
    hits.push({ index: m.index, length: m[0].length });
  }
  return hits;
}

// ---------- Multi-Angle Text Anti-Slop Probes & Stylometric Profile ----------

const ZH_SUBTLE_MARKERS = [
  "有效推动", "持续优化", "显著提升", "进一步助力", "助力", "精细化运营",
  "深度融合", "充分释放", "创新潜能", "高度敏捷", "决策支撑体系", "复杂多变",
  "整体服务质量", "品牌竞争力", "协同效率", "交互体验", "核心竞争力",
  "新篇章", "新台阶", "新阶段", "充分保障", "轻量化交互", "一线响应速度",
  "不可逆转", "集体记忆", "呼吸感", "宏大叙事", "触手可及",
];

const EN_SUBTLE_MARKERS = [
  "leverages", "leverage", "leveraging", "seamlessly", "streamline", "streamlines",
  "foster", "fostering", "robust", "empowers", "empower", "stakeholders",
  "navigate", "comprehensive", "harnesses", "harness", "elevate", "pivotal",
  "transformative", "transformative outcomes", "pivotal alignment", "transparent alignment",
  "resilience", "synergy", "holistic", "ecosystem", "actionable", "unparalleled",
];

const ZH_DISCOURSE_MARKERS = [
  "此外", "与此同时", "不仅如此", "总而言之", "综上所述", "换言之",
  "进一步来看", "诚然", "综合来看", "归根结底",
];

const EN_DISCOURSE_MARKERS = [
  "furthermore", "moreover", "additionally", "consequently",
  "in conclusion", "notably", "at the same time",
];

function escapeRegexLiteral(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAsciiPhraseRegex(phrase, flags = "i") {
  const body = String(phrase)
    .trim()
    .split(/\s+/)
    .map(escapeRegexLiteral)
    .join("\\s+");
  return new RegExp(`(?<![A-Za-z0-9_])${body}(?![A-Za-z0-9_])`, flags);
}

function clipCodepoints(str, maxLen = 140) {
  const cps = Array.from(String(str || ""));
  return cps.length <= maxLen ? cps.join("") : cps.slice(0, maxLen).join("");
}

function roundNonNeg(val, digits = 2) {
  const factor = 10 ** digits;
  return Math.floor(Math.max(0, val) * factor + 0.5) / factor;
}

// Integer tenths (CJK=6 tenths, EN word=10 tenths) so JS & Python never drift on 0.6 float sums
function countTextUnitsTenths(s) {
  const cjk = (s.match(/[\u4e00-\u9fff]/gu) || []).length;
  const en = (s.match(/[A-Za-z0-9]+/g) || []).length;
  return cjk * 6 + en * 10;
}

function countTextUnits(s) {
  return countTextUnitsTenths(s) / 10;
}

function countConcretenessAnchors(rawSlice) {
  // Strip HTML comments before counting concrete anchors
  const s = String(rawSlice || "").replace(/<!--[\s\S]*?-->/g, " ");
  let count = 0;
  count += (s.match(/(?<![A-Za-z0-9_])\d+(?:[.,:]\d+)?%?(?![A-Za-z0-9_])/g) || []).length;
  count += (s.match(/`[^`\n]+`/g) || []).length;
  count += (s.match(/[/\\][A-Za-z0-9._-]+\.[a-z]{1,5}(?![A-Za-z0-9_])/gi) || []).length;
  count += (s.match(/(?<![A-Za-z0-9_])(?:PR\s*#?\d+|v\d+\.\d+|HTTP\s*\d{3}|UTC|Q[1-4])(?![A-Za-z0-9_])/g) || []).length;
  count += (
    s.match(
      /(?:[一二三四五六七八九十两百千万]+[天月年次个张条座块斤米秒分时]|周[一二三四五六日天]|昨天|昨晚|今早|上周|下周|去年|前年|清晨|傍晚|凌晨|午后|十月|十一月|十二月)/gu
    ) || []
  ).length;
  return count;
}

function isStructuredLine(trimmedLine) {
  return /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>)/.test(trimmedLine);
}

/**
 * Linear O(n) prose paragraph extractor that cleanly separates Markdown headings/lists/tables
 * from immediately-following prose lines while preserving exact offsets in `rawText`.
 */
function extractProseParagraphs(proseText, rawText) {
  const paras = [];
  const n = proseText.length;
  let pos = 0;
  let curStart = -1;
  let curEnd = -1;

  function flush() {
    if (curStart === -1 || curEnd <= curStart) {
      curStart = -1;
      curEnd = -1;
      return;
    }
    const text = proseText.slice(curStart, curEnd);
    const trimmed = text.trim();
    if (trimmed) {
      const lead = text.indexOf(trimmed);
      const start = curStart + Math.max(0, lead);
      const rawSlice = rawText.slice(curStart, curEnd);
      paras.push({ start, end: curEnd, base: curStart, text, trimmed, rawSlice });
    }
    curStart = -1;
    curEnd = -1;
  }

  while (pos <= n) {
    let nl = proseText.indexOf("\n", pos);
    const lineEnd = nl === -1 ? n : nl;
    const lineProse = proseText.slice(pos, lineEnd);
    const lineRaw = rawText.slice(pos, lineEnd);
    const trimProse = lineProse.trim();
    const trimRaw = lineRaw.trim();

    if (!trimProse || isStructuredLine(trimProse) || isStructuredLine(trimRaw)) {
      flush();
    } else {
      if (curStart === -1) curStart = pos;
      curEnd = lineEnd;
    }

    if (nl === -1) break;
    pos = nl + 1;
  }
  flush();
  return paras;
}

/**
 * Linear O(n) sentence splitter with exact source offsets — zero regex backtracking.
 */
function splitProseSentencesWithOffsets(para) {
  const out = [];
  const text = para.text;
  const base = para.base ?? (para.end - text.length);
  const n = text.length;
  let i = 0;
  const isEndPunct = (ch) => ch === "。" || ch === "！" || ch === "？" || ch === "." || ch === "!" || ch === "?";

  while (i < n) {
    while (i < n && (text[i] === "\n" || text[i] === "\r" || text[i] === " " || text[i] === "\t")) {
      i += 1;
    }
    if (i >= n) break;
    const segStart = i;
    while (i < n && text[i] !== "\n" && !isEndPunct(text[i])) {
      i += 1;
    }
    while (i < n && isEndPunct(text[i])) {
      i += 1;
    }
    let segEnd = i;
    while (segEnd > segStart && (text[segEnd - 1] === " " || text[segEnd - 1] === "\t" || text[segEnd - 1] === "\r")) {
      segEnd -= 1;
    }
    if (segEnd - segStart >= 3) {
      out.push({ start: base + segStart, end: base + segEnd, text: text.slice(segStart, segEnd) });
    }
    if (i < n && text[i] === "\n") i += 1;
  }
  return out;
}

function probeCooccurrenceSlopCluster(proseText, rawText) {
  const hits = [];
  const paras = extractProseParagraphs(proseText, rawText);
  const enSciRobustRe =
    /(?<![A-Za-z0-9_])(?:robust\s+(?:estimator|regression|standard|statistics|variance|backoff|retry|inference|control|error\s+handling|parser|parsing|validation|recovery|fallback)|comprehensive\s+test(?:s|\s+suite)?)(?![A-Za-z0-9_])/gi;
  for (const para of paras) {
    const found = new Map();
    const paraBase = para.base;
    for (const term of ZH_SUBTLE_MARKERS) {
      const idx = para.text.indexOf(term);
      if (idx !== -1) {
        if (term === "助力" && found.has("进一步助力")) continue;
        found.set(term, { start: paraBase + idx, end: paraBase + idx + term.length });
      }
    }
    const lowPara = para.text.toLowerCase().replace(enSciRobustRe, (m) => " ".repeat(m.length));
    for (const term of EN_SUBTLE_MARKERS) {
      const re = buildAsciiPhraseRegex(term, "i");
      const m = re.exec(lowPara);
      if (m) {
        const stem = term.replace(/(?:ing|es|s)$/, "");
        if (!found.has(`en:${stem}`)) {
          found.set(`en:${stem}`, { start: paraBase + m.index, end: paraBase + m.index + m[0].length });
        }
      }
    }
    const distinct = found.size;
    if (distinct < 2) continue;
    const unitsTenths = Math.max(10, countTextUnitsTenths(para.text));
    const concreteness = (countConcretenessAnchors(para.rawSlice) * 1000) / unitsTenths;
    if (distinct >= 3 || (distinct >= 2 && concreteness < 6.0)) {
      const spans = Array.from(found.values()).sort((a, b) => a.start - b.start);
      const first = spans[0].start;
      const last = spans[spans.length - 1].end;
      hits.push({ index: first, length: Math.min(140, Math.max(1, last - first)) });
    }
  }
  return hits;
}

function probeSemicolonTricolon(proseText, rawText) {
  const hits = [];
  const paras = extractProseParagraphs(proseText, rawText);
  const legalGuard = /(?<![A-Za-z0-9_])(?:shall|must|hereby|pursuant\s+to|provided\s+that)(?![A-Za-z0-9_])|(?:应当|须于|不得|依照)/i;
  for (const para of paras) {
    // Mask parenthetical citations/quotes at paragraph level so abbreviations like `et al.` never break parens
    const maskedPara = para.text
      .replace(/\([^)\n]*[;；][^)\n]*\)/g, (m) => " ".repeat(m.length))
      .replace(/（[^）\n]*[;；][^）\n]*）/g, (m) => " ".repeat(m.length))
      .replace(/“[^”\n]*[;；][^”\n]*”/g, (m) => " ".repeat(m.length))
      .replace(/"[^"\n]*[;；][^"\n]*"/g, (m) => " ".repeat(m.length));
    const maskedObj = { ...para, text: maskedPara };
    const sents = splitProseSentencesWithOffsets(maskedObj);
    for (const s of sents) {
      if (/[A-Za-z0-9_-]+\s*[:=]\s*[^;；\n]+[;；]/.test(s.text)) continue;
      if (/^[^;；。！？.!?\n]{2,32}[：:]/.test(s.text)) continue;
      if (legalGuard.test(s.text)) continue;
      const rawSent = rawText.slice(s.start, s.end);
      const techRefs = (rawSent.match(/`[^`\n]+`|\]\([^)\n]+\)/g) || []).length;
      if (techRefs >= 2) continue;
      const semis = (s.text.match(/[;；]/g) || []).length;
      if (semis >= 2) {
        hits.push({ index: s.start, length: Math.min(140, s.text.length) });
      }
    }
  }
  return hits;
}

function probeRhetoricalQaCadence(proseText, rawText) {
  const hits = [];
  // Run per prose paragraph so FAQ headings (`# Why...?`) followed by answers never false-trigger
  const paras = extractProseParagraphs(proseText, rawText);
  for (const para of paras) {
    const base = para.base;
    const text = para.text;
    const zhQa = /(?:为什么|为何)[^？?\n]{3,35}[？?]\s*(?:因为|原因(?:很|其实)?(?:简单|在于))/gu;
    let m;
    while ((m = zhQa.exec(text)) !== null) {
      const absIdx = base + m.index;
      const prev = absIdx > 0 ? rawText[absIdx - 1] : "";
      if (/[：:“"「『]/.test(prev)) continue;
      hits.push({ index: absIdx, length: m[0].length });
    }
    const zhPunch = /(?:^|[。！？\n]\s*)(?:结果呢|原因呢|真相呢|代价呢)[？?]/gu;
    while ((m = zhPunch.exec(text)) !== null) {
      const lead = m[0].match(/^[。！？\s]+/);
      const offset = lead ? lead[0].length : 0;
      hits.push({ index: base + m.index + offset, length: m[0].length - offset });
    }
    const enQa = /(?<![A-Za-z0-9_])Why\s+(?:do|does|did|is|are)\s+[^?\n]{6,80}\?\s*Because(?![A-Za-z0-9_])/giu;
    while ((m = enQa.exec(text)) !== null) {
      hits.push({ index: base + m.index, length: m[0].length });
    }
    const enPunch = /(?:^|[.!?]\s+)(?:The\s+(?:result|reason|catch|truth|reality|secret))\?\s+[A-Z]/gu;
    while ((m = enPunch.exec(text)) !== null) {
      const lead = m[0].match(/^[.!?\s]+/);
      const offset = lead ? lead[0].length : 0;
      hits.push({ index: base + m.index + offset, length: m[0].length - offset });
    }
  }
  return hits;
}

function probeCommaChainRunon(proseText, rawText) {
  const hits = [];
  const paras = extractProseParagraphs(proseText, rawText);
  for (const para of paras) {
    const sents = splitProseSentencesWithOffsets(para);
    for (const s of sents) {
      // Strip numeric thousands separators (1,200) and parenthetical lists before counting commas
      const cleaned = s.text
        .replace(/(\d),(\d{3})(?!\d)/g, "$1$2")
        .replace(/\([^)\n]{1,60}\)/g, " ")
        .replace(/（[^）\n]{1,60}）/g, " ");
      const commas = (cleaned.match(/[，,]/g) || []).length;
      if (commas < 5) continue;
      const parts = cleaned.split(/[，,]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 6) continue;
      // Distinguish genuine multi-clause run-ons from short noun-phrase enumerations ("a, b, c, d, e, and f")
      let clauseParts = 0;
      for (const p of parts) {
        const cjk = (p.match(/[\u4e00-\u9fff]/gu) || []).length;
        const enWords = (p.match(/[A-Za-z]+/g) || []).length;
        const hasGerundOrVerb = /\b[a-z]{3,}ing\b/i.test(p);
        if (cjk >= 6 || enWords >= 4 || (enWords >= 3 && hasGerundOrVerb)) clauseParts += 1;
      }
      if (clauseParts < 5) continue;
      hits.push({ index: s.start, length: Math.min(140, s.text.length) });
    }
  }
  return hits;
}

function probeNarrativeSandwichFrame(proseText, rawText) {
  const hits = [];
  const patterns = [
    /(?:^|\n\s*)(?:随着[^，。\n]{2,18}(?:飞速|快速|不断|持续)(?:发展|深入|演进|推进)|在(?:当今|快节奏的)[^，。\n]{2,16}(?:时代|生活|社会)中?)/gu,
    /(?:^|\n\s*)(?:As\s+(?:organizations|teams|companies|distributed\s+teams)\s+(?:navigate|scale|adapt)[^,.\n]{2,60}|In\s+an\s+era\s+(?:defined\s+by|of|where)[^,.\n]{2,60})/giu,
    /(?:展望未来[，,]|携手[^，。！？\n]{1,16}(?:开启|迈向)[^。！？\n]{2,20}|必将迎来[^。！？\n]{2,16}|值得每一个[^。！？\n]{2,16}深思)/gu,
    /\b(?:Looking\s+ahead,|Moving\s+forward,)[^.!?\n]{5,120}(?:well-positioned\s+to\s+thrive|vital\s+role|essential\s+for|year\s+ahead|remind\s+us)\b/giu,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(proseText)) !== null) {
      const lead = m[0].match(/^\s+/);
      const off = lead ? lead[0].length : 0;
      hits.push({ index: m.index + off, length: m[0].length - off });
    }
  }

  // Discourse-marker cluster: >= 3 distinct/repeated stock transitions in prose
  const discHits = [];
  const paras = extractProseParagraphs(proseText, rawText);
  for (const para of paras) {
    const paraBase = para.base;
    for (const marker of ZH_DISCOURSE_MARKERS) {
      let pos = 0;
      while ((pos = para.text.indexOf(marker, pos)) !== -1) {
        discHits.push({ index: paraBase + pos, length: marker.length });
        pos += marker.length;
      }
    }
    const low = para.text.toLowerCase();
    for (const marker of EN_DISCOURSE_MARKERS) {
      const re = buildAsciiPhraseRegex(marker, "gi");
      let m;
      while ((m = re.exec(low)) !== null) {
        discHits.push({ index: paraBase + m.index, length: m[0].length });
      }
    }
  }
  if (discHits.length >= 3) {
    discHits.sort((a, b) => a.index - b.index);
    const first = discHits[0];
    const third = discHits[2];
    hits.push({
      index: first.index,
      length: Math.min(140, Math.max(first.length, third.index + third.length - first.index)),
    });
  }
  return hits;
}

function classifyOpenerSkeleton(text, explicitOnly = false) {
  const s = text.trim();
  // Skip key-value metadata lines like "Atomic card: [...]" or "来源：..."
  if (/^[A-Za-z][A-Za-z0-9 _-]{1,28}:\s/.test(s) || /^[\u4e00-\u9fff]{2,8}：/.test(s)) {
    return null;
  }
  if (/^在[\u4e00-\u9fff]{2,6}方面[，,]/.test(s)) return "ZH_ZAI_X_FANGMIAN";
  if (/^(?:首先|其次|再次|最后)[，,]/.test(s)) return "ZH_ORDINAL_STEP";
  if (/^By\s+[a-z]+ing\b/i.test(s)) return "EN_BY_GERUND";
  if (/^(?:First|Second|Third|Fourth|Finally|Lastly),\s+/i.test(s)) return "EN_ORDINAL_STEP";
  if (explicitOnly) return null;
  if (s.length < 24) return null;
  const enPre = s.match(/^([A-Za-z]+\s+[A-Za-z]+)\b/);
  if (enPre) {
    const low = enPre[1].toLowerCase();
    // Skip very generic determiner pairs like "in the", "of the", "it is"
    if (!/^(?:in the|on the|at the|of the|to the|it is|this is|there is|we have|we are|the [a-z]+)$/.test(low)) {
      return `EN_PRE:${low}`;
    }
    return null;
  }
  const zhPre = s.match(/^([\u4e00-\u9fff]{3})/);
  if (zhPre) return `ZH_PRE:${zhPre[1]}`;
  return null;
}

function hasRepeatedPostOrdinalStem(items) {
  const stems = new Map();
  for (const it of items) {
    const rest = it.text
      .replace(/^(?:首先|其次|再次|最后|First|Second|Third|Fourth|Finally|Lastly)[，,]\s*/i, "")
      .trim();
    const mEn = rest.match(/^([A-Za-z]+(?:\s+[A-Za-z-]+){0,2})/);
    const mZh = rest.match(/^([\u4e00-\u9fff]{2,4})/);
    const key = mEn ? `en:${mEn[1].toLowerCase()}` : mZh ? `zh:${mZh[1]}` : null;
    if (!key) continue;
    stems.set(key, (stems.get(key) || 0) + 1);
    if (stems.get(key) >= 2) return true;
  }
  return false;
}

function probeTemplateSkeletonEcho(proseText, rawText) {
  const hits = [];
  const paras = extractProseParagraphs(proseText, rawText);

  function checkItems(items, explicitOnly, insideSinglePara) {
    const groups = new Map();
    for (const item of items) {
      const skel = classifyOpenerSkeleton(item.text, explicitOnly);
      if (!skel) continue;
      if (!groups.has(skel)) groups.set(skel, []);
      groups.get(skel).push(item);
    }
    for (const [skel, matched] of groups.entries()) {
      if (matched.length >= 3) {
        if (
          insideSinglePara &&
          (skel === "EN_ORDINAL_STEP" || skel === "ZH_ORDINAL_STEP") &&
          !hasRepeatedPostOrdinalStem(matched)
        ) {
          continue;
        }
        hits.push({ index: matched[0].start, length: Math.min(120, matched[0].text.length) });
        return true;
      }
    }
    return false;
  }

  if (paras.length >= 3) {
    if (checkItems(paras.map((p) => ({ start: p.start, text: p.trimmed })), false, false)) {
      return hits;
    }
  }
  const allSents = [];
  for (const para of paras) {
    for (const s of splitProseSentencesWithOffsets(para)) {
      allSents.push(s);
    }
  }
  if (allSents.length >= 3) {
    checkItems(allSents, true, true);
  }
  return hits;
}

function probeLowBurstinessVapor(proseText, rawText) {
  const paras = extractProseParagraphs(proseText, rawText);
  if (paras.length === 0) return [];
  const sents = [];
  for (const para of paras) {
    for (const s of splitProseSentencesWithOffsets(para)) {
      const u = countTextUnitsTenths(s.text);
      if (u > 0) sents.push({ ...s, tenths: u });
    }
  }
  if (sents.length < 5) return [];
  const sumTenths = sents.reduce((a, b) => a + b.tenths, 0);
  const meanTenths = sumTenths / sents.length;
  if (meanTenths <= 0) return [];
  const varianceTenths = sents.reduce((a, b) => a + (b.tenths - meanTenths) ** 2, 0) / sents.length;
  const cv = Math.sqrt(varianceTenths) / meanTenths;
  const totalTenths = Math.max(10, sumTenths);
  const totalAnchors = paras.reduce((acc, p) => acc + countConcretenessAnchors(p.rawSlice), 0);
  const concreteness = (totalAnchors * 1000) / totalTenths;
  if (cv < 0.24 && concreteness < 1.5) {
    return [{ index: paras[0].start, length: Math.min(80, paras[0].trimmed.length) }];
  }
  return [];
}

/**
 * Compute an explainable 5-axis offline statistical & structural text profile.
 * Zero external dependencies; identical math in `src/core.mjs` and `src/dislop/engine.py`.
 */
export function analyzeTextProfile(text, { modality = "markdown" } = {}) {
  // Normalize CRLF -> LF for statistical calculations so Node and Python agree on Windows files
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const zones = buildZones(raw, modality);
  const prose = zones.prose || "";
  const paras = extractProseParagraphs(prose, raw);
  const sents = [];
  for (const para of paras) {
    for (const s of splitProseSentencesWithOffsets(para)) {
      const u = countTextUnitsTenths(s.text);
      if (u > 0) sents.push({ ...s, tenths: u });
    }
  }

  const nSents = sents.length;
  let meanLen = 0;
  let cv = 0;
  let adjContrast = 0;
  if (nSents >= 2) {
    const sumTenths = sents.reduce((a, b) => a + b.tenths, 0);
    const meanTenths = sumTenths / nSents;
    meanLen = meanTenths / 10;
    const varianceTenths = sents.reduce((a, b) => a + (b.tenths - meanTenths) ** 2, 0) / nSents;
    cv = meanTenths > 0 ? Math.sqrt(varianceTenths) / meanTenths : 0;
    let diffSumTenths = 0;
    for (let i = 1; i < nSents; i += 1) diffSumTenths += Math.abs(sents[i].tenths - sents[i - 1].tenths);
    adjContrast = meanTenths > 0 ? (diffSumTenths / (nSents - 1)) / meanTenths : 0;
  } else if (nSents === 1) {
    meanLen = sents[0].tenths / 10;
  }

  const joinedProse = paras.map((p) => p.trimmed).join("\n");
  const totalTenths = Math.max(10, countTextUnitsTenths(joinedProse));
  const totalUnits = totalTenths / 10;

  // Lexical diversity (TTR + Moving-Average TTR window 25 step 5) + bigram echo + char Shannon entropy
  const tokens = (joinedProse.toLowerCase().match(/[\u4e00-\u9fff]|[a-z]{2,}/gu) || []);
  const nTok = tokens.length;
  const ttr = nTok > 0 ? new Set(tokens).size / nTok : 0;
  let mattr = ttr;
  const win = 25;
  if (nTok > win) {
    let sum = 0;
    let steps = 0;
    for (let i = 0; i <= nTok - win; i += 5) {
      sum += new Set(tokens.slice(i, i + win)).size / win;
      steps += 1;
    }
    mattr = steps > 0 ? sum / steps : ttr;
  }
  let bigramEcho = 0;
  if (nTok >= 2) {
    const bSet = new Set();
    for (let i = 0; i < nTok - 1; i += 1) bSet.add(`${tokens[i]}|${tokens[i + 1]}`);
    bigramEcho = 1 - bSet.size / (nTok - 1);
  }
  let charEntropy = 0;
  const chars = Array.from(joinedProse);
  if (chars.length > 0) {
    const counts = new Map();
    for (const ch of chars) counts.set(ch, (counts.get(ch) || 0) + 1);
    for (const c of counts.values()) {
      const p = c / chars.length;
      charEntropy -= p * Math.log2(p);
    }
  }

  const anchorCount = paras.reduce((acc, p) => acc + countConcretenessAnchors(p.rawSlice), 0);
  const concretenessPer100 = (anchorCount / totalUnits) * 100;

  // Punctuation
  const emDashes = (joinedProse.replace(/——/g, "—").match(/—/g) || []).length;
  const emDashPer300 = (emDashes / totalUnits) * 300;
  let maxSemi = 0;
  let maxComma = 0;
  for (const s of sents) {
    const sc = (s.text.replace(/\([^)\n]*[;；][^)\n]*\)/g, " ").match(/[;；]/g) || []).length;
    const cc = (s.text.replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/\([^)\n]{1,60}\)/g, " ").match(/[，,]/g) || []).length;
    if (sc > maxSemi) maxSemi = sc;
    if (cc > maxComma) maxComma = cc;
  }

  const coocHits = probeCooccurrenceSlopCluster(prose, raw).length;
  const semiHits = probeSemicolonTricolon(prose, raw).length;
  const rhetQaCount = probeRhetoricalQaCadence(prose, raw).length;
  const commaHits = probeCommaChainRunon(prose, raw).length;
  const skelHits = probeTemplateSkeletonEcho(prose, raw).length;
  const narrativeHits = probeNarrativeSandwichFrame(prose, raw).length;
  const vaporHits = probeLowBurstinessVapor(prose, raw).length;

  // Transparent, non-black-box telemetry score (0-100)
  const signals = [];
  let riskScore = 0;
  if (coocHits > 0) { riskScore += 28; signals.push("cooccurrence-slop-cluster"); }
  if (semiHits > 0) { riskScore += 24; signals.push("semicolon-tricolon"); }
  if (rhetQaCount > 0) { riskScore += 24; signals.push("rhetorical-qa-cadence"); }
  if (commaHits > 0) { riskScore += 18; signals.push("comma-chain-runon"); }
  if (narrativeHits > 0) { riskScore += 26; signals.push("narrative-sandwich-frame"); }
  if (skelHits > 0) { riskScore += 26; signals.push("template-skeleton-echo"); }
  if (vaporHits > 0) { riskScore += 24; signals.push("low-burstiness-vapor"); }
  else if (nSents >= 5 && cv < 0.24) { riskScore += 10; signals.push("flat-sentence-rhythm"); }
  if (nSents >= 3 && anchorCount === 0) { riskScore += 10; signals.push("zero-concrete-anchors"); }
  if (emDashPer300 > 4 && emDashes >= 5) { riskScore += 12; signals.push("high-em-dash-density"); }
  riskScore = Math.min(100, riskScore);

  const burstinessStatus = nSents < 3 ? "short" : cv < 0.24 ? "flat" : cv >= 0.35 ? "varied" : "moderate";
  const concretenessStatus = concretenessPer100 >= 4.0 ? "grounded" : concretenessPer100 >= 1.5 ? "moderate" : "vapor";
  const riskLevel = riskScore >= 45 ? "high" : riskScore >= 20 ? "medium" : "low";

  return {
    schema: "dislop.text-profile/1",
    sentenceCount: nSents,
    paragraphCount: paras.length,
    unitCount: roundNonNeg(totalUnits, 1),
    burstiness: {
      meanLength: roundNonNeg(meanLen, 1),
      cv: roundNonNeg(cv, 2),
      adjacentContrast: roundNonNeg(adjContrast, 2),
      status: burstinessStatus,
    },
    lexical: {
      ttr: roundNonNeg(ttr, 2),
      mattr: roundNonNeg(mattr, 2),
      bigramEcho: roundNonNeg(bigramEcho, 2),
      charEntropy: roundNonNeg(charEntropy, 2),
      cooccurrenceClusters: coocHits,
    },
    concreteness: {
      anchorCount,
      per100Units: roundNonNeg(concretenessPer100, 1),
      status: concretenessStatus,
    },
    punctuation: {
      emDashPer300: roundNonNeg(emDashPer300, 1),
      maxSemicolonsInSentence: maxSemi,
      maxCommasInSentence: maxComma,
      rhetoricalQaCount: rhetQaCount,
    },
    structure: {
      skeletonEchoHits: skelHits,
      narrativeFrameHits: narrativeHits,
      lowBurstinessVapor: vaporHits > 0,
    },
    telemetryRisk: {
      score: riskScore,
      level: riskLevel,
      signals,
    },
  };
}

// ---------- UI, CSS, HTML & SVG Probes ----------

function parseColorRgb(raw) {
  if (!raw) return null;
  const val = raw.trim().toLowerCase();
  const hex6 = val.match(/^#([0-9a-f]{6})$/i);
  if (hex6) {
    const n = parseInt(hex6[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const hex3 = val.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const [r, g, b] = hex3[1].split("").map((c) => parseInt(c + c, 16));
    return [r, g, b];
  }
  const rgb = val.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  if (val === "white") return [255, 255, 255];
  if (val === "black") return [0, 0, 0];
  return null;
}

function rgbToHsl([r, g, b]) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function probeUiDeadControl(rawText) {
  const clean = rawText
    .replace(/<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->/gi, preserveLinesBlank)
    .replace(/<!--[\s\S]*?-->/g, preserveLinesBlank)
    .replace(/<(script|style|code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, preserveLinesBlank);

  const hits = [];
  // 1. Dead anchors: <a href="#"> / href="" / href="javascript:..." without click handler
  const anchorRe = /<a\b([^>]*)>/gi;
  let m;
  while ((m = anchorRe.exec(clean)) !== null) {
    const attrs = m[1] || "";
    const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const href = hrefMatch ? (hrefMatch[1] ?? hrefMatch[2] ?? "").trim() : null;
    const hasHandler = /\b(?:onClick|onclick|@click|hx-get|hx-post)\b/.test(attrs);
    if (!hasHandler && (href === "#" || href === "" || (href && /^javascript:/i.test(href)))) {
      hits.push({ index: m.index, length: m[0].length, severity: "error" });
    }
  }

  // 2. Empty or unexplained static disabled <button>
  const btnRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  while ((m = btnRe.exec(clean)) !== null) {
    const attrs = m[1] || "";
    const inner = (m[2] || "").replace(/<[^>]+>/g, "").trim();
    const hasLabel = inner.length > 0 || /\b(?:aria-label|aria-labelledby|title)\s*=\s*["'][^"']+["']/i.test(attrs);
    if (!hasLabel && !/\{\.\.\./.test(attrs)) {
      hits.push({ index: m.index, length: m[0].length, severity: "error" });
      continue;
    }
    const staticDisabled = /\bdisabled(?:\s*=\s*(?:""|"disabled"|'disabled'|\{true\}))?(?=[\s/>]|$)/i.test(attrs);
    const hasReason = /\b(?:title|aria-describedby|data-allow-disabled)\b/i.test(attrs);
    if (staticDisabled && !hasReason) {
      hits.push({ index: m.index, length: m[0].length, severity: "warning" });
    }
  }
  return hits;
}

function probeUiAiGradient(rawText) {
  const clean = rawText
    .replace(/<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->/gi, preserveLinesBlank)
    .replace(/<!--[\s\S]*?-->/g, preserveLinesBlank)
    .replace(/\/\*[\s\S]*?\*\//g, preserveLinesBlank)
    .replace(/<(script|code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, preserveLinesBlank);

  const hits = [];
  // 1. Tailwind purple/indigo/violet + pink/fuchsia/purple gradient or gradient-clipped text
  const twRe = /\b(?:from-(?:indigo|purple|violet)-\d{2,3}[^"'\n>]{0,60}(?:to|via)-(?:purple|pink|fuchsia|violet)-\d{2,3}|bg-clip-text\s+text-transparent|text-transparent\s+bg-clip-text)\b/gi;
  let m;
  while ((m = twRe.exec(clean)) !== null) {
    hits.push({ index: m.index, length: m[0].length });
  }

  // 2. CSS gradient with purple-pink hex stops or background-clip: text
  const cssGradRe = /(?:linear|radial)-gradient\(([^)]+)\)/gi;
  while ((m = cssGradRe.exec(clean)) !== null) {
    const hexes = m[1].match(/#[0-9a-fA-F]{3,6}\b/g) || [];
    let purplePinkStops = 0;
    for (const hx of hexes) {
      const rgb = parseColorRgb(hx);
      if (!rgb) continue;
      const [h, s] = rgbToHsl(rgb);
      if (h >= 245 && h <= 345 && s >= 45) purplePinkStops += 1;
    }
    const nearSlice = clean.slice(m.index, Math.min(clean.length, m.index + m[0].length + 120));
    const isClipText = /background-clip\s*:\s*text/i.test(nearSlice);
    if (purplePinkStops >= 2 || isClipText) {
      hits.push({ index: m.index, length: m[0].length });
    }
  }
  return hits;
}

function probeUiPillSoup(rawText, maxPills = 6) {
  const clean = rawText
    .replace(/<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->/gi, preserveLinesBlank)
    .replace(/<!--[\s\S]*?-->/g, preserveLinesBlank)
    .replace(/<(script|style|code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, preserveLinesBlank);

  const pillRe = /<([a-z0-9]+)\b([^>]*(?:\brounded-full\b|border-radius\s*:\s*999\d*px)[^>]*)>([^<]{1,48})<\/\1>/gi;
  const matches = [];
  let m;
  while ((m = pillRe.exec(clean)) !== null) {
    const attrs = m[2] || "";
    const text = (m[3] || "").trim();
    if (!text) continue;
    // Exempt square dots/avatars (`w-6 h-6`, `size-2`)
    if (/\bsize-\d/.test(attrs)) continue;
    const wh = attrs.match(/\bw-(\d+)\b.*\bh-(\d+)\b/);
    if (wh && wh[1] === wh[2]) continue;
    matches.push({ index: m.index, length: m[0].length });
  }
  if (matches.length > maxPills) {
    return [matches[0]];
  }
  return [];
}

function probeUiBoxInBox(rawText) {
  const clean = rawText
    .replace(/<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->/gi, preserveLinesBlank)
    .replace(/<!--[\s\S]*?-->/g, preserveLinesBlank)
    .replace(/<(script|style|code|pre|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, preserveLinesBlank);

  const tokenRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*?)(\/?)>/g;
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
  const stack = [];
  const hits = [];
  let m;
  while ((m = tokenRe.exec(clean)) !== null) {
    const full = m[0];
    const tag = m[1].toLowerCase();
    const attrs = m[2] || "";
    const selfClose = m[3] === "/" || voidTags.has(tag);
    if (full.startsWith("</")) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const hasBorderOrShadow = /\b(?:border(?:-[a-z0-9]+)?| ring-1|shadow(?:-[a-z]+)?)\b|border\s*:/i.test(attrs) && !/\bborder-(?:t|b|l|r|0|none)\b/.test(attrs);
    const hasRadius = /\brounded(?:-[a-z0-9]+)?\b|border-radius\s*:/i.test(attrs) && !/\brounded-none\b/.test(attrs);
    const hasPad = /\bp[xy]?-\d|padding\s*:/i.test(attrs);
    const isBox = hasBorderOrShadow && hasRadius && hasPad;
    const boxDepth = (stack.length > 0 ? stack[stack.length - 1].boxDepth : 0) + (isBox ? 1 : 0);

    if (isBox && boxDepth >= 3 && hits.length === 0) {
      hits.push({ index: m.index, length: full.length });
    }
    if (!selfClose) {
      stack.push({ tag, boxDepth });
    }
  }
  return hits;
}

function normalizeAsciiDigits(str) {
  return String(str || "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function hasMultiplierBaseline(sentence) {
  const s = normalizeAsciiDigits(sentence);
  if (/\bfrom\s+\S+[\s\S]{0,36}\bto\s+\S*\d/i.test(s)) return true;
  if (/\b(?:vs\.?|compared\s+(?:to|with))\s+\S*\d/i.test(s)) return true;
  if (/(?:从|由)\s*\d[\s\S]{0,28}(?:到|至|升至|降至|压到|降到|缩短至)\s*\d/.test(s)) return true;
  const measured =
    s.match(
      /(?<![A-Za-z0-9_])\d[\d,.]*\s*(?:%|(?:milliseconds?|ms|minutes?|mins?|seconds?|secs?|s|hours?|hrs?|KB|MB|GB|TB|QPS|TPS|RPS)\b|秒|分钟|小时|毫秒|万|亿|元|美元)/gi
    ) || [];
  return measured.length >= 2;
}

function probeUnanchoredMultiplier(zoneText, rawText) {
  const normZone = normalizeAsciiDigits(zoneText);
  const hits = [];
  const patterns = [
    /\b(?:\d+(?:\.\d+)?x)\s+(?:faster|more\s+efficient|higher\s+(?:productivity|throughput|conversion)|lower\s+cost|cheaper|speedup)\b/gi,
    /(?:效率|性能|速度|产能|转化率|吞吐量)(?:提升|提高|加快|翻了?|暴涨)(?:了?\s*)?(?:数倍|十倍|百倍|几十倍|好几倍|\d+(?:\.\d+)?\s*倍)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(normZone)) !== null) {
      const sent = enclosingSentence(rawText, m.index, m.index + m[0].length);
      if (hasMultiplierBaseline(sent)) continue;
      hits.push({ index: m.index, length: m[0].length });
    }
  }
  return hits;
}

// ---------- Core Text Auditor ----------

export function auditText(text, { filename = "<memory>", modality = null, pack, config = {}, allowSyntheticFixtures = false } = {}) {
  const mod = modality || detectModality(filename) || "markdown";
  const lineStarts = buildLineStarts(text);
  const zones = buildZones(text, mod);
  const { byTargetLine, directives } = parseSuppressions(text);
  const allowList = config?.allow || [];
  const cpPrefix = /[\uD800-\uDBFF]/.test(text) ? buildCodePointPrefix(text) : null;
  const findings = [];

  for (const rule of pack.rules || []) {
    if (rule.modalities && !rule.modalities.includes(mod)) continue;

    // Synthetic Office/PDF fixture tokens ONLY during `dislop pack-test`
    if (allowSyntheticFixtures && (text.startsWith("DOCX_") || text.startsWith("PPTX_"))) {
      const synthHits = evaluateSyntheticBinaryFixture(text, rule, pack.thresholds || {});
      for (const h of synthHits) {
        findings.push(makeFinding({ rule, filename, modality: mod, location: h.location, match: h.match, sentence: text, span: { start: 0, end: text.length } }));
      }
      continue;
    }

    let rawHits = [];
    const primaryZoneName = (rule.zones && rule.zones[0]) || "prose";
    const zoneText = zones[primaryZoneName] ?? zones.prose;

    if (rule.probe === "regex") {
      for (const pattern of rule.patterns || []) {
        const re = new RegExp(pattern, "gimu");
        let m;
        while ((m = re.exec(zoneText)) !== null) {
          if (m[0].length === 0) {
            re.lastIndex += 1;
            continue;
          }
          let idx = m.index;
          let len = m[0].length;
          if (primaryZoneName === "prose") {
            const lead = m[0].match(/^[.!?。！？\s]+/);
            if (lead && lead[0].length < len) {
              idx += lead[0].length;
              len -= lead[0].length;
            }
          }
          while (len > 1 && text.charCodeAt(idx) === 0xfeff) {
            idx += 1;
            len -= 1;
          }
          if (
            rule.id === "unfilled-placeholder" &&
            text[idx] === "[" &&
            text[idx + len - 1] === "]" &&
            /^(?:\(|\[|:)/.test(text.slice(idx + len))
          ) {
            continue;
          }
          rawHits.push({ index: idx, length: len });
        }
      }
    } else if (rule.probe === "negation-pivot") {
      rawHits = probeNegationPivot(zoneText, text);
    } else if (rule.probe === "staccato-run") {
      rawHits = probeStaccatoRun(zoneText);
    } else if (rule.probe === "zh-four-char-triad") {
      rawHits = probeZhFourCharTriad(zoneText);
    } else if (rule.probe === "unsourced-attribution") {
      rawHits = probeUnsourcedAttribution(zoneText, text);
    } else if (rule.probe === "bold-lead-list-wall") {
      rawHits = probeBoldLeadListWall(zoneText, text, pack.thresholds?.boldLeadListRun || 4);
    } else if (rule.probe === "em-dash-density") {
      rawHits = probeEmDashDensity(zoneText, pack.thresholds?.maxEmDashesPer300Words || 4);
    } else if (rule.probe === "zh-halfwidth-punctuation") {
      rawHits = probeZhHalfwidthPunctuation(zoneText);
    } else if (rule.probe === "cooccurrence-slop-cluster") {
      rawHits = probeCooccurrenceSlopCluster(zoneText, text);
    } else if (rule.probe === "semicolon-tricolon") {
      rawHits = probeSemicolonTricolon(zoneText, text);
    } else if (rule.probe === "rhetorical-qa-cadence") {
      rawHits = probeRhetoricalQaCadence(zoneText, text);
    } else if (rule.probe === "comma-chain-runon") {
      rawHits = probeCommaChainRunon(zoneText, text);
    } else if (rule.probe === "narrative-sandwich-frame") {
      rawHits = probeNarrativeSandwichFrame(zoneText, text);
    } else if (rule.probe === "template-skeleton-echo") {
      rawHits = probeTemplateSkeletonEcho(zoneText, text);
    } else if (rule.probe === "low-burstiness-vapor") {
      rawHits = probeLowBurstinessVapor(zoneText, text);
    } else if (rule.probe === "unanchored-multiplier") {
      rawHits = probeUnanchoredMultiplier(zoneText, text);
    } else if (rule.probe === "ui-dead-control") {
      rawHits = probeUiDeadControl(text);
    } else if (rule.probe === "ui-ai-gradient") {
      rawHits = probeUiAiGradient(text);
    } else if (rule.probe === "ui-pill-soup") {
      rawHits = probeUiPillSoup(text, pack.thresholds?.maxPillsPerFile || 6);
    } else if (rule.probe === "ui-box-in-box") {
      rawHits = probeUiBoxInBox(text);
    }

    // Sort and deduplicate overlapping spans emitted by multiple patterns of the same rule
    rawHits.sort((a, b) => a.index - b.index || b.length - a.length);
    const dedupHits = [];
    for (const h of rawHits) {
      const prev = dedupHits[dedupHits.length - 1];
      if (prev && h.index < prev.index + prev.length) continue;
      dedupHits.push(h);
    }

    for (const hit of dedupHits) {
      const start = hit.index;
      const end = hit.index + hit.length;
      const matchedRaw = text.slice(start, end);
      if (isAllowedMatch(matchedRaw, allowList)) continue;

      const { line, col } = offsetToLineCol(text, lineStarts, start, cpPrefix);
      const lineSuppressions = byTargetLine.get(line) || [];
      let suppressed = false;
      for (const sup of lineSuppressions) {
        if (sup.ruleIds.includes("all") || sup.ruleIds.includes("*") || sup.ruleIds.includes(rule.id)) {
          sup.used = true;
          suppressed = true;
        }
      }
      if (suppressed) continue;

      const sentence = enclosingSentence(text, start, end);
      const cpStart = cpPrefix ? cpPrefix[start] : start;
      const cpEnd = cpPrefix ? cpPrefix[end] : end;
      findings.push(
        makeFinding({
          rule: hit.severity ? { ...rule, severity: hit.severity } : rule,
          filename,
          modality: mod,
          location: `${line}:${col}`,
          line,
          col,
          span: { start: cpStart, end: cpEnd },
          match: clipCodepoints(matchedRaw.replace(/\s+/g, " ").trim(), 140),
          sentence,
        })
      );
    }
  }

  const unusedSuppressions = directives
    .filter((d) => !d.used)
    .map((d) => ({
      file: filename,
      line: d.directiveLine,
      ruleIds: d.ruleIds,
      reason: d.reason,
    }));

  findings.sort((a, b) => (a.line || 0) - (b.line || 0) || (a.col || 0) - (b.col || 0));
  return { findings, unusedSuppressions };
}

function evaluateSyntheticBinaryFixture(fixture, rule, thresholds) {
  if (rule.probe === "office-markdown-leak" && fixture.startsWith("DOCX_RAW_MARKDOWN:")) {
    return [{ location: "para 1", match: "**Key Milestone**" }];
  }
  if (rule.probe === "slide-word-wall" && fixture.startsWith("PPTX_WORD_WALL:")) {
    const count = Number(fixture.split(":")[1] || 0);
    if (count > (thresholds.maxSlideWords || 120)) return [{ location: "slide 1", match: `${count} words` }];
  }
  if (rule.probe === "slide-bullet-overload" && fixture.startsWith("PPTX_BULLETS:")) {
    const count = Number(fixture.split(":")[1] || 0);
    if (count > (thresholds.maxSlideBullets || 6)) return [{ location: "slide 1", match: `${count} bullets` }];
  }
  if (rule.probe === "slide-autofit-shrink" && fixture.startsWith("PPTX_AUTOFIT:")) {
    const scale = Number(fixture.split(":")[1] || 100000);
    if (scale < (thresholds.minAutofitScale || 80000)) return [{ location: "slide 1", match: `fontScale=${scale}` }];
  }
  if (rule.probe === "slide-weak-topic-title" && fixture.startsWith("PPTX_WEAK_TITLE:")) {
    return [{ location: "slide 1", match: fixture.split(":")[1] }];
  }
  if (rule.probe === "pptx-layout-monotony" && fixture.startsWith("PPTX_MONOTONY:")) {
    const run = Number(fixture.split(":")[1] || 0);
    if (run >= (thresholds.maxIdenticalSlideRun || 4)) {
      return [{ location: `slide ${run}`, match: `${run} consecutive identical slide layouts` }];
    }
  }
  return [];
}

export function makeFinding({ rule, filename, modality, location, line = 1, col = 1, span = null, match, sentence = "" }) {
  const normMatch = String(match || "").toLowerCase().trim();
  const normSent = String(sentence || normMatch).toLowerCase().replace(/\s+/g, " ").trim();
  const fingerprint = `${rule.id}:${fnv1aHex(`${rule.id}|${normMatch}|${normSent}`)}`;
  return {
    fingerprint,
    ruleId: rule.id,
    tier: rule.tier || "taste",
    severity: rule.severity || "warning",
    family: rule.family || "general",
    file: filename,
    modality,
    location,
    line,
    col,
    span,
    match,
    message: rule.message,
    deletionTest: rule.deletionTest || null,
    exemplar: rule.exemplar || null,
  };
}

// ---------- Structured DOCX / PPTX Document Auditor ----------

function decodeXmlEntities(str) {
  return String(str).replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|lt|gt|quot|apos|amp);/g, (m, dec, hex) => {
    if (dec) {
      const cp = Number(dec);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    if (hex) {
      const cp = parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    if (m === "&lt;") return "<";
    if (m === "&gt;") return ">";
    if (m === "&quot;") return '"';
    if (m === "&apos;") return "'";
    return "&";
  });
}

/**
 * Audit an already-extracted map of archive entries `{ [entryPath]: string }` for `.docx` or `.pptx`.
 * Shared between Node (`zlib.inflateRawSync`) and Browser (`DecompressionStream('deflate-raw')`).
 */
export function auditOoxmlEntries(entries, { filename, modality, pack, config = {} }) {
  const findings = [];
  const skipped = [];
  const rulesById = new Map((pack.rules || []).map((r) => [r.id, r]));

  if (modality === "docx") {
    const docXml = entries["word/document.xml"];
    if (!docXml) {
      return { findings, skipped: [{ file: filename, reason: "Missing word/document.xml inside DOCX archive" }] };
    }

    // Extract paragraphs joining <w:t> runs cleanly while excluding <w:delText>
    const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
    let pm;
    let paraIndex = 0;
    const mdLeakRule = rulesById.get("markdown-leak");
    while ((pm = paraRe.exec(docXml)) !== null) {
      const pBody = pm[1].replace(/<w:del\b[\s\S]*?<\/w:del>/g, "");
      const runs = [];
      const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
      let tm;
      while ((tm = tRe.exec(pBody)) !== null) {
        runs.push(decodeXmlEntities(tm[1]));
      }
      const paraText = runs.join("").trim();
      if (!paraText) continue;
      paraIndex += 1;

      if (mdLeakRule && (/\*\*[^*\n]{1,80}\*\*/.test(paraText) || /^#{1,6}\s+\S/.test(paraText))) {
        findings.push(makeFinding({ rule: mdLeakRule, filename, modality, location: `para ${paraIndex}`, line: paraIndex, match: paraText.slice(0, 100) }));
      }

      const sub = auditText(paraText, { filename, modality: "markdown", pack, config });
      for (const f of sub.findings) {
        if (f.ruleId === "markdown-leak") continue;
        findings.push({ ...f, modality: "docx", location: `para ${paraIndex}`, line: paraIndex });
      }
    }
    return { findings, skipped };
  }

  if (modality === "pptx") {
    const presXml = entries["ppt/presentation.xml"] || "";
    const presRels = entries["ppt/_rels/presentation.xml.rels"] || "";

    // Resolve presentation slide order via p:sldIdLst -> r:id -> Target
    const relMap = new Map();
    const relRe = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"|<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*\bId="([^"]+)"/g;
    let rm;
    while ((rm = relRe.exec(presRels)) !== null) {
      const id = rm[1] || rm[4];
      const rawTarget = (rm[2] || rm[3] || "").replace(/^\/+/, "").replace(/^\.\.\//, "ppt/");
      const target = rawTarget.startsWith("ppt/") ? rawTarget : `ppt/${rawTarget}`;
      relMap.set(id, target);
    }

    const orderedSlides = [];
    const sldIdRe = /<p:sldId\b[^>]*\br:id="([^"]+)"/g;
    let sm;
    while ((sm = sldIdRe.exec(presXml)) !== null) {
      const target = relMap.get(sm[1]);
      if (target && entries[target]) orderedSlides.push(target);
    }
    if (orderedSlides.length === 0) {
      const fallback = Object.keys(entries)
        .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
        .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
      orderedSlides.push(...fallback);
    }
    if (orderedSlides.length === 0) {
      return { findings, skipped: [{ file: filename, reason: "Missing ppt/slides/*.xml inside PPTX archive" }] };
    }

    const mdLeakRule = rulesById.get("markdown-leak");
    const wordWallRule = rulesById.get("slide-word-wall");
    const bulletRule = rulesById.get("slide-bullet-overload");
    const autofitRule = rulesById.get("slide-autofit-shrink");
    const weakTitleRule = rulesById.get("slide-weak-topic-title");
    const processTitleRule = rulesById.get("slide-process-not-finding-title");
    const monotonyRule = rulesById.get("pptx-layout-monotony");
    const thresholds = pack.thresholds || {};
    let prevLayoutSig = null;
    let layoutRunCount = 0;

    orderedSlides.forEach((slideEntry, idx) => {
      const slideNum = idx + 1;
      const xml = entries[slideEntry];
      const isHidden = /<p:sld\b[^>]*\bshow="(?:0|false)"/i.test(xml);
      if (isHidden) {
        skipped.push({ file: `${filename}#slide-${slideNum}`, reason: "Hidden slide (show=0) skipped for density rules" });
      }

      // Autofit shrink check
      if (autofitRule && !isHidden) {
        const afMatch = xml.match(/<a:normAutofit\b[^>]*\bfontScale="(\d+)"/);
        if (afMatch && Number(afMatch[1]) < (thresholds.minAutofitScale || 80000)) {
          const pct = Math.round(Number(afMatch[1]) / 1000);
          findings.push(makeFinding({ rule: autofitRule, filename, modality, location: `slide ${slideNum}`, line: slideNum, match: `normAutofit fontScale=${pct}%` }));
        }
      }

      // Inspect shapes (<p:sp>) for title, bullets, and joined paragraphs
      const spRe = /<p:sp\b[\s\S]*?<\/p:sp>/g;
      const slideParagraphs = [];
      let titleText = "";
      let bulletCount = 0;
      let nonFooterSpCount = 0;
      let spm;
      while ((spm = spRe.exec(xml)) !== null) {
        const sp = spm[0];
        const isTitle = /<p:ph\b[^>]*\btype="(?:title|ctrTitle)"/.test(sp);
        const isFooterOrNum = /<p:ph\b[^>]*\btype="(?:sldNum|ftr|dt)"/.test(sp);
        if (!isFooterOrNum) nonFooterSpCount += 1;
        const paras = [];
        const apRe = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
        let apm;
        while ((apm = apRe.exec(sp)) !== null) {
          const pInner = apm[1];
          const runs = [];
          const atRe = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
          let atm;
          while ((atm = atRe.exec(pInner)) !== null) {
            runs.push(decodeXmlEntities(atm[1]));
          }
          const joined = runs.join("").trim();
          if (!joined) continue;
          paras.push(joined);
          if (!isTitle && !isFooterOrNum && (/<a:buChar\b|<a:buAutoNum\b/.test(pInner) || (!/<a:buNone\b/.test(pInner) && paras.length > 1))) {
            if (/<a:buChar\b|<a:buAutoNum\b/.test(pInner)) bulletCount += 1;
          }
        }
        if (paras.length === 0) continue;
        if (isTitle && !titleText) titleText = paras.join(" ");
        if (!isFooterOrNum) slideParagraphs.push(...paras);
      }

      const fullSlideText = slideParagraphs.join("\n");
      if (mdLeakRule && (/\*\*[^*\n]{1,80}\*\*/.test(fullSlideText) || /^#{1,6}\s+\S/m.test(fullSlideText))) {
        findings.push(makeFinding({ rule: mdLeakRule, filename, modality, location: `slide ${slideNum}`, line: slideNum, match: fullSlideText.slice(0, 90) }));
      }

      if (!isHidden) {
        const cjkChars = (fullSlideText.match(/[\u4e00-\u9fff]/gu) || []).length;
        const latinWords = fullSlideText.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
        const maxWords = thresholds.maxSlideWords || 120;
        const maxZh = thresholds.maxSlideCharsZh || 280;
        if (wordWallRule && (latinWords > maxWords || cjkChars > maxZh)) {
          findings.push(makeFinding({ rule: wordWallRule, filename, modality, location: `slide ${slideNum}`, line: slideNum, match: `${latinWords} words / ${cjkChars} CJK chars` }));
        }
        if (bulletRule && bulletCount > (thresholds.maxSlideBullets || 6)) {
          findings.push(makeFinding({ rule: bulletRule, filename, modality, location: `slide ${slideNum}`, line: slideNum, match: `${bulletCount} bullet items` }));
        }
        if (weakTitleRule && titleText && (latinWords > 25 || cjkChars > 50)) {
          if (/^(?:overview|background|agenda|summary|introduction|context|背景|项目背景|概述|数据概述|总结|目录)$/i.test(titleText.trim())) {
            findings.push(makeFinding({ rule: weakTitleRule, filename, modality, location: `slide ${slideNum}`, line: slideNum, match: `Title: "${titleText.trim()}"` }));
          }
        }
        if (processTitleRule && titleText) {
          const tt = titleText.trim().replace(/\s*#+\s*$/, "").trim();
          if (
            /^(?:Analysis\s+of|Overview\s+of|Update\s+on|Discussion\s+of|Deep\s+Dive\s+into|Thoughts\s+on)\s+\S[^\n#]{1,64}$/i.test(tt) ||
            /^(?:关于[^\n#]{2,36}的(?:分析(?:汇报|报告)?|汇报|思考|探讨|情况(?:说明|汇报)?)|[^\n#]{2,24}(?:阶段性进展汇报|情况分析汇报))$/.test(tt)
          ) {
            findings.push(makeFinding({ rule: processTitleRule, filename, modality, location: `slide ${slideNum}`, line: slideNum, match: `Title: "${tt}"` }));
          }
        }
        if (monotonyRule) {
          const hasDataGraphic = /<c:chart\b|<a:tbl\b/.test(xml);
          const picCount = (xml.match(/<p:pic\b/g) || []).length;
          const bulletBucket = bulletCount === 0 ? 0 : bulletCount <= 3 ? 1 : 2;
          const offs = [...xml.matchAll(/<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/g)]
            .slice(0, 6)
            .map((m) => `${Math.round(Number(m[1]) / 914400)},${Math.round(Number(m[2]) / 914400)}`)
            .join(";");
          const geomPart = offs ? `|g:${offs}` : "";
          const sig =
            !hasDataGraphic && nonFooterSpCount >= 2 && (latinWords > 8 || cjkChars > 16)
              ? `sp:${nonFooterSpCount}|b:${bulletBucket}|p:${picCount}${geomPart}`
              : null;
          if (sig && sig === prevLayoutSig) {
            layoutRunCount += 1;
          } else {
            prevLayoutSig = sig;
            layoutRunCount = sig ? 1 : 0;
          }
          if (layoutRunCount === (thresholds.maxIdenticalSlideRun || 4)) {
            findings.push(
              makeFinding({
                rule: monotonyRule,
                filename,
                modality,
                location: `slide ${slideNum}`,
                line: slideNum,
                match: `${layoutRunCount} consecutive identical slide layouts (${sig})`,
              })
            );
          }
        }
      }

      // Run text/invariant rules on slide text (hidden slides keep only core error checks)
      const sub = auditText(fullSlideText, { filename, modality: "markdown", pack, config });
      for (const f of sub.findings) {
        if (isHidden && f.severity !== "error") continue;
        findings.push({ ...f, modality: "pptx", location: `slide ${slideNum}`, line: slideNum });
      }
    });

    return { findings, skipped };
  }

  return { findings, skipped };
}

// ---------- Output Formatters (text, json, sarif, github, md) ----------

function escapeGithubProp(val) {
  return String(val ?? "")
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

function escapeGithubData(val) {
  return String(val ?? "")
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

export function formatReport(report, format = "text", lang = "en") {
  const { findings, checkedCount, skipped = [], unusedSuppressions = [] } = report;
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }
  if (format === "sarif") {
    return JSON.stringify(buildSarif(report, lang), null, 2);
  }
  if (format === "github") {
    const lines = findings.map((f) => {
      const level = f.severity === "error" ? "error" : f.severity === "warning" ? "warning" : "notice";
      const msg = (f.message?.[lang] || f.message?.en || "").replace(/\r?\n/g, " ");
      return `::${level} file=${escapeGithubProp(f.file)},line=${f.line || 1},col=${f.col || 1},title=${escapeGithubProp(f.ruleId)}::${escapeGithubData(`${msg} (${f.match})`)}`;
    });
    return lines.join("\n");
  }
  if (format === "md") {
    const rows = [
      `| Severity | File | Location | Rule | Match | Guidance |`,
      `|---|---|---|---|---|---|`,
      ...findings.map(
        (f) =>
          `| \`${f.severity}\` | \`${f.file}\` | \`${f.location}\` | \`${f.ruleId}\` | \`${String(f.match).replace(/\|/g, "\\|")}\` | ${f.message?.[lang] || f.message?.en || ""} |`
      ),
    ];
    return rows.join("\n");
  }

  // Default human text format
  const out = [];
  const skipNote = skipped.length > 0 ? `, ${skipped.length} skipped` : "";
  if (findings.length === 0 && unusedSuppressions.length === 0) {
    out.push(
      lang === "zh"
        ? `dislop: 未发现已知模式（已检 ${checkedCount} 项${skipped.length > 0 ? `，跳过 ${skipped.length} 项` : ""}，0 处命中）`
        : `dislop: no known patterns found (${checkedCount} checked${skipNote}, 0 findings)`
    );
  } else {
    out.push(`dislop: ${findings.length} finding(s) across ${checkedCount} checked file(s)${skipNote}`);
    for (const f of findings) {
      const msg = f.message?.[lang] || f.message?.en || "";
      out.push(`  [${f.severity.toUpperCase()}] ${f.file}:${f.location}  ${f.ruleId}`);
      out.push(`    match: "${f.match}"`);
      out.push(`    why:   ${msg}`);
      if (f.deletionTest) {
        out.push(`    test:  ${f.deletionTest[lang] || f.deletionTest.en}`);
      }
    }
    for (const u of unusedSuppressions) {
      out.push(`  [UNUSED] ${u.file}:${u.line}  stale dislop-ignore (${u.ruleIds.join(", ")})`);
    }
  }
  for (const s of skipped) {
    out.push(`  [SKIP] ${s.file} — ${s.reason}`);
  }
  if (report.profiles && report.profiles.length > 0) {
    for (const item of report.profiles) {
      const p = item.profile;
      const sigs = p.telemetryRisk.signals.length > 0 ? p.telemetryRisk.signals.join(", ") : "none";
      out.push(
        `  [PROFILE] ${item.file}  risk=${p.telemetryRisk.score}/100 (${p.telemetryRisk.level}) | burstiness_cv=${p.burstiness.cv} (${p.burstiness.status}) | concreteness=${p.concreteness.per100Units}/100u (${p.concreteness.status}) | mattr=${p.lexical.mattr} | entropy=${p.lexical.charEntropy} | signals=${sigs}`
      );
    }
  }
  return out.join("\n");
}

function buildSarif(report, lang = "en") {
  const rulesMap = new Map();
  for (const f of report.findings) {
    if (!rulesMap.has(f.ruleId)) {
      rulesMap.set(f.ruleId, {
        id: f.ruleId,
        shortDescription: { text: f.message?.[lang] || f.message?.en || f.ruleId },
        help: {
          text: f.deletionTest?.[lang] || f.deletionTest?.en || f.message?.en || f.ruleId,
        },
        helpUri: `https://dislop.com/#rule-${f.ruleId}`,
        defaultConfiguration: {
          level: f.severity === "error" ? "error" : f.severity === "warning" ? "warning" : "note",
        },
      });
    }
  }
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "dislop",
            version: ENGINE_VERSION,
            informationUri: "https://dislop.com",
            rules: Array.from(rulesMap.values()),
          },
        },
        results: report.findings.map((f) => ({
          ruleId: f.ruleId,
          level: f.severity === "error" ? "error" : f.severity === "warning" ? "warning" : "note",
          message: {
            text: `${f.message?.[lang] || f.message?.en} — "${f.match}"`,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: String(f.file).replace(/^\.\//, "") },
                region: {
                  startLine: Math.max(1, f.line || 1),
                  startColumn: Math.max(1, f.col || 1),
                },
              },
            },
          ],
          partialFingerprints: {
            primaryLocationLineHash: f.fingerprint,
          },
        })),
      },
    ],
  };
}

// ---------- Anti-Pattern Catalog & Query Engine (dislop.catalog/1) ----------

export const FAMILY_TO_CATEGORY = {
  "hygiene/": "delivery-hygiene",
  "office/": "office-structure",
  "lexicon/": "language-lexicon",
  "frame/": "language-template",
  "rhythm/": "language-rhythm",
  "punctuation/": "language-punctuation",
  "structure/": "discourse-structure",
  "statistics/": "statistical-rhythm",
  "evidence/": "evidence-rigor",
  "deck/": "deck-layout",
  "ui/": "ui-design",
  "composite/": "composite-signal",
};

export function inferRuleCategory(family = "") {
  for (const [prefix, cat] of Object.entries(FAMILY_TO_CATEGORY)) {
    if (String(family).startsWith(prefix)) return cat;
  }
  return "general";
}

export function inferRuleLanguages(ruleId = "") {
  const id = String(ruleId);
  if (id.startsWith("zh-")) return ["zh"];
  if (id.startsWith("en-")) return ["en"];
  return ["en", "zh"];
}

export function buildCatalog(packsById, patternByRuleId = null) {
  const orderedPackIds = Object.keys(packsById).sort((a, b) => {
    const order = [
      "core",
      "business-brief",
      "engineering-spec",
      "regulated-comms",
      "literary-essay",
      "deck-and-ui",
      "executive-deck",
    ];
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  const entries = [];
  const seenRuleIds = new Set();
  for (const pid of orderedPackIds) {
    const pack = packsById[pid];
    if (!pack) continue;
    for (const rule of pack.rules || []) {
      seenRuleIds.add(rule.id);
      const pat = patternByRuleId && patternByRuleId[rule.id] ? patternByRuleId[rule.id] : null;
      const category = rule.category || pat?.category || inferRuleCategory(rule.family || "");
      const languages = rule.languages || pat?.languages || inferRuleLanguages(rule.id);
      const tags = Array.from(new Set([...(rule.tags || []), ...(pat?.tags || [])]));
      const evidenceLevel = rule.evidenceLevel || pat?.evidenceLevel || (rule.tier === "invariant" ? "objective-invariant" : "editorial-consensus");
      entries.push({
        id: rule.id,
        packId: pack.id,
        tier: rule.tier || pack.tier || "taste",
        severity: rule.severity || "warning",
        family: rule.family || "general",
        category,
        dimension: pat?.dimension || null,
        detectionAngle: pat?.detectionAngle || rule.probe || "regex",
        languages,
        tags,
        evidenceLevel,
        modelTendencies: rule.modelTendencies || pat?.modelTendencies || [],
        probe: rule.probe || "regex",
        modalities: rule.modalities || pack.modalities || [],
        message: rule.message || { en: "", zh: "" },
        deletionTest: rule.deletionTest || null,
        exemplar: rule.exemplar || null,
        anchorUrl: `https://dislop.com/#rule-${rule.id}`,
      });
    }
  }
  if (patternByRuleId) {
    for (const rid of Object.keys(patternByRuleId).sort()) {
      if (seenRuleIds.has(rid)) continue;
      const pat = patternByRuleId[rid];
      if (!pat || pat.status !== "active-bank") continue;
      const guardsText = Array.isArray(pat.falsePositiveGuards) ? pat.falsePositiveGuards.join(" ") : "";
      entries.push({
        id: rid,
        packId: pat.packId || "pattern-bank",
        tier: "taste",
        severity: pat.severityDefault || "info",
        family: pat.dimension ? `${pat.dimension}/${rid}` : "pattern-bank",
        category: pat.category || "general",
        dimension: pat.dimension || null,
        detectionAngle: pat.detectionAngle || "pattern-bank",
        languages: pat.languages || inferRuleLanguages(rid),
        tags: [...(pat.tags || [])],
        evidenceLevel: pat.evidenceLevel || "empirical-corpus",
        modelTendencies: pat.modelTendencies || [],
        probe: pat.detectionAngle || "pattern-bank",
        modalities: pat.modalities || ["markdown", "text"],
        message: pat.mechanism || pat.name || { en: "", zh: "" },
        deletionTest: guardsText ? { en: guardsText, zh: guardsText } : null,
        exemplar: pat.exemplar || null,
        anchorUrl: `https://dislop.com/patterns/#${rid}`,
      });
    }
  }
  return entries;
}

export function queryCatalog(entries, filters = {}) {
  const q = String(filters.query || "").trim().toLowerCase();
  const terms = q ? q.split(/\s+/).filter(Boolean) : [];
  const includeExemplars = filters.includeExemplars !== false;
  const limit = Number.isInteger(filters.limit) && filters.limit > 0 ? filters.limit : null;

  const matched = entries.filter((e) => {
    if (filters.pack && e.packId !== filters.pack) return false;
    if (filters.tier && e.tier !== filters.tier) return false;
    if (filters.severity && e.severity !== filters.severity) return false;
    if (filters.category && e.category !== filters.category) return false;
    if (filters.dimension && e.dimension !== filters.dimension) return false;
    if (filters.family && !String(e.family).toLowerCase().startsWith(String(filters.family).toLowerCase())) return false;
    if (filters.modality && !(e.modalities || []).includes(filters.modality)) return false;
    if (terms.length > 0) {
      const haystack = [
        e.id,
        e.packId,
        e.family,
        e.category,
        e.dimension || "",
        e.detectionAngle || "",
        (e.tags || []).join(" "),
        e.message?.en || "",
        e.message?.zh || "",
        e.deletionTest?.en || "",
        e.deletionTest?.zh || "",
        e.exemplar?.bad || "",
        e.exemplar?.trap || "",
        e.exemplar?.good || "",
      ]
        .join("\n")
        .toLowerCase();
      if (!terms.every((t) => haystack.includes(t))) return false;
    }
    return true;
  });

  const facets = { pack: {}, category: {}, severity: {} };
  for (const item of matched) {
    facets.pack[item.packId] = (facets.pack[item.packId] || 0) + 1;
    facets.category[item.category] = (facets.category[item.category] || 0) + 1;
    facets.severity[item.severity] = (facets.severity[item.severity] || 0) + 1;
  }

  const sliced = limit ? matched.slice(0, limit) : matched;
  const items = includeExemplars
    ? sliced
    : sliced.map(({ exemplar, ...rest }) => rest);

  return {
    schema: "dislop.catalog/1",
    total: entries.length,
    matched: matched.length,
    facets,
    items,
  };
}

// ---------- Zero-Entropy Fact-Lock Ledger (`dislop.fact-ledger/1`) & Stet Spans ----------

const FACT_QUALIFIER_PATTERNS = [
  { group: "max_inc", re: /^(?:up\s+to|no\s+more\s+than|at\s+most|within|max(?:imum)?(?:\s+of)?|<=|≤)\s*/i },
  { group: "max_lt", re: /^(?:under|below|less\s+than|fewer\s+than|<)\s*/i },
  { group: "max_inc", re: /^(?:最多|不超过|不高于|至多|以内|上限(?:为)?)\s*/ },
  { group: "max_lt", re: /^(?:低于|小于|少于|不到)\s*/ },
  { group: "min_inc", re: /^(?:at\s+least|no\s+less\s+than|no\s+fewer\s+than|minimum\s+of|>=|≥)\s*/i },
  { group: "min_gt", re: /^(?:more\s+than|greater\s+than|over|above|>)\s*/i },
  { group: "min_inc", re: /^(?:至少|不少于|不低于|下限(?:为)?)\s*/ },
  { group: "min_gt", re: /^(?:超过|高于|大于)\s*/ },
  { group: "approx", re: /^(?:approx(?:imately)?\.?|roughly|about|around|~|≈)\s*/i },
  { group: "approx", re: /^(?:约|大约|近)\s*/ },
  { group: "asof", re: /^(?:as\s+of|since|until)\s+/i },
  { group: "asof", re: /^(?:截至|截止到?)\s*/ },
];

const FACT_SUFFIX_QUALIFIERS = [
  { group: "max_inc", re: /^\s*(?:以内|以下|上限)/ },
  { group: "min_inc", re: /^\s*(?:以上|起)/ },
  { group: "approx", re: /^\s*(?:左右)/ },
];

const UNIT_CANON_MAP = {
  ms: "ms",
  millisecond: "ms",
  milliseconds: "ms",
  毫秒: "ms",
  s: "s",
  sec: "s",
  secs: "s",
  second: "s",
  seconds: "s",
  秒: "s",
  min: "min",
  mins: "min",
  minute: "min",
  minutes: "min",
  分钟: "min",
  hr: "h",
  hrs: "h",
  hour: "h",
  hours: "h",
  小时: "h",
  day: "d",
  days: "d",
  天: "d",
  month: "mo",
  months: "mo",
  个月: "mo",
  year: "yr",
  years: "yr",
  年: "yr",
  row: "row",
  rows: "row",
  行: "row",
  美元: "$",
  元: "cny",
};

function canonicalizeNumericToken(token) {
  const clean = token.replace(/,/g, "").trim();
  if (/^[+-]?v\d+(?:\.\d+){1,3}$/i.test(clean)) {
    return clean.toLowerCase();
  }
  if (/^(?:Q[1-4]|P(?:50|90|95|99))$/i.test(clean)) {
    return clean.toUpperCase();
  }
  let sign = "";
  let rest = clean;
  if (rest.startsWith("+") || rest.startsWith("-")) {
    sign = rest[0];
    rest = rest.slice(1).trim();
  }
  let curr = "";
  if (/^[$€¥£]/.test(rest)) {
    curr = rest[0] === "¥" ? "cny" : rest[0];
    rest = rest.slice(1).trim();
  }
  const nm = rest.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!nm) return `${sign}${curr}${rest.toLowerCase()}`;
  const numPart = nm[1];
  const rawUnit = nm[2].trim();
  const normUnit = rawUnit ? UNIT_CANON_MAP[rawUnit.toLowerCase()] || UNIT_CANON_MAP[rawUnit] || rawUnit.toLowerCase() : "";
  return `${sign}${curr}${numPart}${normUnit}`;
}

function blankMarkupForFactScan(raw, modality) {
  let s = String(raw || "");
  s = s.replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length));
  if (modality === "css") return " ".repeat(s.length);
  if (modality === "html" || modality === "jsx" || modality === "svg" || /<[a-zA-Z][^>]*>/.test(s)) {
    s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (m) => " ".repeat(m.length));
    s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => " ".repeat(m.length));
    s = s.replace(/<[^>]+>/g, (m) => " ".repeat(m.length));
  }
  return s;
}

export function extractProtectedFacts(text, { modality = "markdown" } = {}) {
  const raw = String(text || "");
  if (!raw.trim() || modality === "css") return [];
  const lineStarts = buildLineStarts(raw);
  const items = [];
  const occupied = [];

  const overlaps = (start, end) => occupied.some(([a, b]) => start < b && end > a);
  const claim = (item) => {
    if (overlaps(item.span.start, item.span.end)) return;
    occupied.push([item.span.start, item.span.end]);
    const { line, col } = offsetToLineCol(raw, lineStarts, item.span.start);
    items.push({ ...item, line, col });
  };

  const withoutFences = raw.replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length));

  // 1. Inline code spans
  const codeRe = /`([^`\n]{2,80})`/g;
  let m;
  while ((m = codeRe.exec(withoutFences)) !== null) {
    const inner = m[1].trim();
    if (!inner) continue;
    claim({
      kind: "code",
      raw: m[0],
      canonical: inner,
      qualifier: null,
      span: { start: m.index, end: m.index + m[0].length },
    });
  }

  // 2. Explicit URLs and real HTML hrefs
  const urlRe = /\bhttps?:\/\/[^\s)>\]"']+/gi;
  while ((m = urlRe.exec(withoutFences)) !== null) {
    const cleaned = m[0].replace(/[.,;!?。，；！？]+$/, "");
    claim({
      kind: "url",
      raw: cleaned,
      canonical: cleaned,
      qualifier: null,
      span: { start: m.index, end: m.index + cleaned.length },
    });
  }
  if (modality === "html" || modality === "jsx") {
    const hrefRe = /\bhref=["']([^"'#\s][^"']*?)["']/gi;
    while ((m = hrefRe.exec(raw)) !== null) {
      const target = m[1].trim();
      if (/^javascript:/i.test(target)) continue;
      const valStart = m.index + m[0].indexOf(target);
      claim({
        kind: "url",
        raw: target,
        canonical: target,
        qualifier: null,
        span: { start: valStart, end: valStart + target.length },
      });
    }
  }

  // 3. Numbers, units, versions, and bounding qualifiers in visible prose
  const proseScan = blankMarkupForFactScan(raw, modality);
  const chars = proseScan.split("");
  for (const [s, e] of occupied) {
    for (let i = s; i < e && i < chars.length; i += 1) chars[i] = " ";
  }
  const cleanScan = chars.join("");

  const numRe = /(?<![A-Za-z0-9_])(?:v\d+(?:\.\d+){1,3}(?![A-Za-z0-9_.])|\d+(?:\.\d+){2,3}(?![A-Za-z0-9_.])|Q[1-4](?![A-Za-z0-9_])|P(?:50|90|95|99)(?![A-Za-z0-9_])|(?:(?<![A-Za-z0-9_.-])[+-])?[$€¥£]\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmMbB](?![A-Za-z0-9_])|万|亿)?|(?:(?<![A-Za-z0-9_.-])[+-])?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|(?:milliseconds?|ms|minutes?|mins?|seconds?|secs?|s|hours?|hrs?|days?|months?|years?|KB|MB|GB|TB|QPS|TPS|RPS|fps|px|rows?)(?![A-Za-z0-9_])|倍|秒|分钟|小时|天|个月|年|万|亿|元|美元|次|个|条|份|页|行|人|席))?)/g;

  while ((m = numRe.exec(cleanScan)) !== null) {
    const numStart = m.index;
    const numEnd = m.index + m[0].length;
    const token = m[0].trim();

    // Ignore numbered list markers like `1. ` or `2) ` strictly at the start of a line
    const lineStartIdx = cleanScan.lastIndexOf("\n", numStart - 1) + 1;
    const isLineLead = cleanScan.slice(lineStartIdx, numStart).trim() === "";
    const afterSlice = cleanScan.slice(numEnd, numEnd + 2);
    if (isLineLead && /^\d+$/.test(token) && /^[.)、](?:\s|$)/.test(afterSlice)) {
      continue;
    }

    const lookbehindStart = Math.max(0, numStart - 24);
    const prefixWindow = cleanScan.slice(lookbehindStart, numStart);
    let qualifier = null;
    let spanStart = numStart;
    let spanEnd = numEnd;

    for (const qp of FACT_QUALIFIER_PATTERNS) {
      for (let offset = 0; offset < prefixWindow.length; offset += 1) {
        const sub = prefixWindow.slice(offset);
        const qm = sub.match(qp.re);
        if (qm && qm[0].length === sub.length) {
          qualifier = qp.group;
          spanStart = lookbehindStart + offset;
          break;
        }
      }
      if (qualifier) break;
    }

    if (!qualifier) {
      const suffixWindow = cleanScan.slice(numEnd, Math.min(cleanScan.length, numEnd + 6));
      for (const sp of FACT_SUFFIX_QUALIFIERS) {
        const sm = suffixWindow.match(sp.re);
        if (sm) {
          qualifier = sp.group;
          spanEnd = numEnd + sm[0].length;
          break;
        }
      }
    }

    const canonical = canonicalizeNumericToken(token);

    claim({
      kind: qualifier ? "qualified-number" : "number",
      raw: raw.slice(spanStart, spanEnd).trim(),
      canonical,
      qualifier,
      span: { start: spanStart, end: spanEnd },
    });
  }

  items.sort((a, b) => a.span.start - b.span.start);
  return items;
}

export function verifyRevision(beforeText, afterText, { modality = "markdown", allowAdded = false } = {}) {
  const beforeFacts = extractProtectedFacts(beforeText, { modality });
  const afterFacts = extractProtectedFacts(afterText, { modality });
  const pool = afterFacts.map((f) => ({ ...f, used: false }));
  const preserved = [];
  const missing = [];
  const qualifierDropped = [];

  for (const bf of beforeFacts) {
    const isNum = bf.kind === "number" || bf.kind === "qualified-number";
    const matchIdx = pool.findIndex(
      (af) =>
        !af.used &&
        (isNum ? af.kind === "number" || af.kind === "qualified-number" : af.kind === bf.kind) &&
        af.canonical === bf.canonical &&
        (!bf.qualifier || af.qualifier === bf.qualifier)
    );
    if (matchIdx !== -1) {
      pool[matchIdx].used = true;
      preserved.push({
        before: bf.raw,
        after: pool[matchIdx].raw,
        kind: bf.kind,
        canonical: bf.canonical,
        qualifier: bf.qualifier,
      });
      continue;
    }

    if (bf.qualifier) {
      const bareIdx = pool.findIndex(
        (af) =>
          !af.used &&
          (af.kind === "number" || af.kind === "qualified-number") &&
          af.canonical === bf.canonical
      );
      if (bareIdx !== -1) {
        pool[bareIdx].used = true;
        qualifierDropped.push({
          before: bf.raw,
          after: pool[bareIdx].raw,
          canonical: bf.canonical,
          expectedQualifier: bf.qualifier,
          actualQualifier: pool[bareIdx].qualifier,
        });
        continue;
      }
    }

    missing.push({
      raw: bf.raw,
      kind: bf.kind,
      canonical: bf.canonical,
      qualifier: bf.qualifier,
      line: bf.line,
      col: bf.col,
    });
  }

  const addedNumbers = pool
    .filter((af) => !af.used && (af.kind === "number" || af.kind === "qualified-number"))
    .map((af) => ({ raw: af.raw, canonical: af.canonical, line: af.line, col: af.col }));

  const hasDrift = missing.length > 0 || qualifierDropped.length > 0 || (!allowAdded && addedNumbers.length > 0);
  return {
    schema: "dislop.fact-ledger/1",
    status: hasDrift ? "drifted" : "preserved",
    totalProtected: beforeFacts.length,
    retainedCount: preserved.length,
    retentionRate: beforeFacts.length === 0 ? 1 : Number((preserved.length / beforeFacts.length).toFixed(4)),
    preserved,
    missing,
    qualifierDropped,
    addedNumbers,
  };
}

// ---------- Offline Deterministic Voice Profile (`dislop.voice/1`) ----------

function roundHalfUp1(v) {
  return Math.floor(Number(v) * 10 + 0.5) / 10;
}

export function extractVoiceProfileOffline(samples, { lang = "auto" } = {}) {
  const cleanSamples = (Array.isArray(samples) ? samples : [samples])
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const combined = cleanSamples.join("\n\n");
  const cjkCount = (combined.match(/[\u4e00-\u9fff]/gu) || []).length;
  const latinWords = (combined.match(/[A-Za-z]{2,}/g) || []).length;
  const resolvedLang = lang === "zh" || lang === "en" ? lang : cjkCount >= latinWords ? "zh" : "en";

  const prof = analyzeTextProfile(combined, { modality: "markdown" });
  const meanLen = prof.burstiness.meanLength;
  const cv = prof.burstiness.cv;
  const conc = prof.concreteness.per100Units;
  const emDash = prof.punctuation.emDashPer300;
  const minBand = roundHalfUp1(Math.max(4, meanLen * 0.65));
  const maxBand = roundHalfUp1(Math.max(minBand + 6, meanLen * 1.45));

  let tone;
  const sentenceHabits = [];
  const preferredPatterns = [];
  const avoidPatterns = [];

  if (resolvedLang === "zh") {
    tone =
      conc >= 4
        ? "直接、重实据的平实技术/工作表达，优先给数字与具体对象"
        : "克制、自然的白话叙述，少修饰词与铺垫帽";
    sentenceHabits.push(
      cv >= 0.35
        ? `长短句自然错落（平均句长 ${meanLen}，起伏系数 ${cv}）`
        : `句幅平稳克制（目标句长区间 ${minBand}–${maxBand}）`
    );
    sentenceHabits.push(
      emDash <= 1
        ? "几乎不用破折号插话，靠逗号与句号自然断句"
        : `适度使用破折号补充限定（约 ${emDash}/300 词单元）`
    );
    preferredPatterns.push(
      conc >= 3 ? "每段保留可核对的数字、时间或配置锚点" : "第一句直接交代动作主体与结论",
      "条件与数字紧贴写出，不拆成排比口号"
    );
    avoidPatterns.push("开头寒暄与宏大时代背景铺垫", "“不是 A，而是 B”反转与三段对称分号句");
  } else {
    tone =
      conc >= 4
        ? "Direct, evidence-dense maker prose grounded in numbers and concrete nouns"
        : "Plain, conversational prose with minimal throat-clearing or hype";
    sentenceHabits.push(
      cv >= 0.35
        ? `Varied sentence cadence (mean ${meanLen} units, CV ${cv})`
        : `Steady sentence cadence (target band ${minBand}–${maxBand} units)`
    );
    sentenceHabits.push(
      emDash <= 1
        ? "Minimal em-dash interruptions; relies on periods and plain clauses"
        : `Moderate parenthetical em-dashes (~${emDash} per 300 units)`
    );
    preferredPatterns.push(
      conc >= 3 ? "Anchor claims with specific metrics, versions, or file paths" : "Lead paragraphs with concrete subjects and active verbs",
      "Keep bounding qualifiers ('up to', 'at least') attached to numbers"
    );
    avoidPatterns.push("Throat-clearing openers and 'Looking ahead' closers", "'Not X, but Y' pivots and 3-part semicolon pitches");
  }

  return {
    schema: "dislop.voice/1",
    mode: "offline-deterministic",
    lang: resolvedLang,
    stylometrics: {
      sampleCount: cleanSamples.length,
      sentenceCount: prof.sentenceCount,
      meanLength: meanLen,
      lengthCV: cv,
      targetLengthBand: [minBand, maxBand],
      concretenessPer100: conc,
      mattr: prof.lexical.mattr,
      emDashPer300: emDash,
      maxSemicolonsInSentence: prof.punctuation.maxSemicolonsInSentence,
    },
    profile: {
      tone,
      sentenceHabits,
      preferredPatterns,
      avoidPatterns,
    },
  };
}
