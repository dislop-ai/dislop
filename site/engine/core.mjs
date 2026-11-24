/**
 * dislop core engine (zero Node.js or DOM globals).
 * Shared identically by Node CLI, Node MCP server, and Browser Workbench (`site/`).
 */

export const ENGINE_VERSION = "0.9.1";

export const SEVERITY_RANK = {
  info: 1,
  warning: 2,
  error: 3,
  never: 99,
};

export const VALID_REGISTERS = Object.freeze([
  "unspecified",
  "official",
  "casual",
  "argumentative",
  "technical",
  "marketing",
  "narrative",
]);

const VALID_REGISTER_SET = new Set(VALID_REGISTERS);

function expandBraces(pattern) {
  const m = String(pattern || "").match(/\{([^{}]+)\}/);
  if (!m) return [String(pattern || "")];
  const prefix = pattern.slice(0, m.index);
  const suffix = pattern.slice(m.index + m[0].length);
  return m[1].split(",").flatMap((part) => expandBraces(prefix + part.trim() + suffix));
}

function globToRegExp(glob) {
  const norm = String(glob || "").replace(/\\/g, "/").replace(/^\.\//, "");
  let rx = "^";
  for (let i = 0; i < norm.length; i += 1) {
    const ch = norm[i];
    if (ch === "*" && norm[i + 1] === "*") {
      if (norm[i + 2] === "/") {
        rx += "(?:.+/)?";
        i += 2;
      } else {
        rx += ".*";
        i += 1;
      }
    } else if (ch === "*") {
      rx += "[^/]*";
    } else if (ch === "?") {
      rx += "[^/]";
    } else if ("+.^$|()[]{}".includes(ch)) {
      rx += "\\" + ch;
    } else {
      rx += ch;
    }
  }
  rx += "$";
  return new RegExp(rx);
}

export function matchesAnyGlob(relPosix, globs = []) {
  const clean = String(relPosix || "").replace(/\\/g, "/").replace(/^\.\//, "");
  return (globs || []).flatMap(expandBraces).some((g) => globToRegExp(g).test(clean));
}

export function validateConfig(config) {
  if (config === null || config === undefined) return config;
  if (typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Invalid config: expected JSON object");
  }
  if (config.failOn !== undefined && config.failOn !== null) {
    if (typeof config.failOn !== "string" || !SEVERITY_RANK[config.failOn]) {
      throw new Error("Invalid config 'failOn': expected error, warning, info, or never");
    }
  }
  if (config.register !== undefined && config.register !== null) {
    if (typeof config.register !== "string") {
      throw new Error("Invalid config 'register': expected string");
    }
    const norm = config.register.trim().toLowerCase();
    if (norm !== "" && !VALID_REGISTER_SET.has(norm)) {
      throw new Error(`Invalid config register '${config.register}' (expected ${VALID_REGISTERS.join(", ")})`);
    }
  }
  if (config.overrides !== undefined && config.overrides !== null) {
    if (!Array.isArray(config.overrides)) {
      throw new Error("Invalid config 'overrides': expected array");
    }
    for (const ov of config.overrides) {
      if (!ov || typeof ov !== "object" || Array.isArray(ov)) {
        throw new Error("Invalid config 'overrides' item: expected object");
      }
      if (ov.register !== undefined && ov.register !== null) {
        if (typeof ov.register !== "string") {
          throw new Error("Invalid config override 'register': expected string");
        }
        const ovNorm = ov.register.trim().toLowerCase();
        if (ovNorm !== "" && !VALID_REGISTER_SET.has(ovNorm)) {
          throw new Error(`Invalid config override register '${ov.register}' (expected ${VALID_REGISTERS.join(", ")})`);
        }
      }
    }
  }
  return config;
}

export function parseFrontMatterRegister(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const fm = stripped.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?=\r?\n|$)/);
  if (!fm) return null;
  let genericReg = null;
  const lines = fm[1].split(/\r?\n/);
  for (const rawLine of lines) {
    // Only top-level unindented YAML keys (skips nested mappings and indented block scalars)
    const m = rawLine.match(/^(dislop_register|register):[ \t]*(.*?)[ \t]*(?:#.*)?$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    let rawVal = (m[2] || "").trim();
    if (
      (rawVal.startsWith('"') && rawVal.endsWith('"') && rawVal.length >= 2) ||
      (rawVal.startsWith("'") && rawVal.endsWith("'") && rawVal.length >= 2)
    ) {
      rawVal = rawVal.slice(1, -1).trim();
    }
    const val = rawVal.toLowerCase();
    if (key === "dislop_register") {
      if (!val || !VALID_REGISTER_SET.has(val)) {
        throw new Error(
          `Invalid dislop_register '${rawVal}' in frontmatter (expected ${VALID_REGISTERS.join(", ")})`
        );
      }
      return val;
    }
    if (genericReg === null && VALID_REGISTER_SET.has(val)) {
      genericReg = val;
    }
  }
  return genericReg;
}

export function resolveRegister(text = "", { filename = "<memory>", flagRegister = null, config = {} } = {}) {
  validateConfig(config);
  if (flagRegister !== null && flagRegister !== undefined) {
    if (typeof flagRegister !== "string") {
      throw new Error(`Invalid --register (expected string: auto, ${VALID_REGISTERS.join(", ")})`);
    }
    if (flagRegister.trim() !== "") {
      const norm = flagRegister.trim().toLowerCase();
      if (norm !== "auto") {
        if (!VALID_REGISTER_SET.has(norm)) {
          throw new Error(`Invalid --register '${flagRegister}' (expected auto, ${VALID_REGISTERS.join(", ")})`);
        }
        return { register: norm, registerSource: "flag" };
      }
    }
  }

  const mod = detectModality(filename);
  if (mod === null || mod === "markdown" || mod === "text") {
    const fmReg = parseFrontMatterRegister(text);
    if (fmReg) {
      return { register: fmReg, registerSource: "frontmatter" };
    }
  }

  const rel = String(filename || "").replace(/\\/g, "/").replace(/^\.\//, "");
  for (const ov of config?.overrides || []) {
    if (!ov || !ov.register) continue;
    const ovReg = ov.register.trim().toLowerCase();
    if (!ovReg) continue;
    const patterns = Array.isArray(ov.files) ? ov.files : ov.files ? [ov.files] : [];
    if (patterns.length > 0 && matchesAnyGlob(rel, patterns)) {
      return { register: ovReg, registerSource: "config" };
    }
  }

  if (config?.register && config.register.trim() !== "") {
    return { register: config.register.trim().toLowerCase(), registerSource: "config" };
  }

  return { register: "unspecified", registerSource: "default" };
}

export function applyRegisterOverride(rule, register = "unspecified", config = {}) {
  if (!register || register === "unspecified" || rule.tier === "invariant") {
    return { skip: false, rule, registerAdjusted: false };
  }
  const userRuleOverride = config?.rules?.[rule.id];
  if (typeof userRuleOverride === "string" && SEVERITY_RANK[userRuleOverride]) {
    return { skip: false, rule, registerAdjusted: false };
  }
  const ov = rule.registerOverrides?.[register];
  if (!ov) {
    return { skip: false, rule, registerAdjusted: false };
  }
  if (ov.action === "skip") {
    return { skip: true, rule: null, registerAdjusted: true };
  }
  const effective = {
    ...rule,
    ...(ov.severity && SEVERITY_RANK[ov.severity] ? { severity: ov.severity } : {}),
    ...(ov.message ? { message: ov.message } : {}),
    ...(ov.deletionTest ? { deletionTest: ov.deletionTest } : {}),
    ...(ov.revisionKind ? { revisionKind: ov.revisionKind } : {}),
    ...(ov.revisionScope ? { revisionScope: ov.revisionScope } : {}),
    ...(ov.revisionAvoid ? { revisionAvoid: ov.revisionAvoid } : {}),
  };
  return { skip: false, rule: effective, registerAdjusted: true };
}

export const SCENARIO_STRATEGIES = Object.freeze({
  technical: {
    id: "technical",
    label: { en: "Engineering Spec & RFC", zh: "研发文档与复盘" },
    cut: {
      en: "Remove marketing hype, code-diff parroting, hollow 'not human error' excuses, and ownerless action items.",
      zh: "删掉营销形容词、纯复述 Diff 的句子、“并非单纯人为失误”套话和无责任人的待办项。",
    },
    protect: {
      en: "Keep uniform constraint lists, semicolon preconditions, CLI/code identifiers, exact thresholds, and parameter tables intact.",
      zh: "保留等长的约束条款、分号并列前置条件、代码/命令标识、阈值数字与参数表，不强求文学长短句起伏。",
    },
    avoid: {
      en: "Do not alter code identifiers, weaken numeric bounds, or add casual chatter.",
      zh: "绝不改写代码标识、放宽数值边界，也不要为了所谓人味掺入随口聊天腔。",
    },
  },
  official: {
    id: "official",
    label: { en: "Official & Regulated Notice", zh: "公文、合规与正式通告" },
    cut: {
      en: "Strip unsubstantiated superlatives, unanchored multipliers, AI chat greetings, and empty slogans lacking a referent.",
      zh: "删掉无证据绝对化承诺、悬空倍数、AI 寒暄壳，以及没有具体指代的空洞口号。",
    },
    protect: {
      en: "Preserve formal institutional phrasing, numbered clauses, legal disclaimers, and scope qualifiers ('only if', 'unless').",
      zh: "保留规范书面措辞、条款编号、责任边界、法律免责与限定条件（如“仅限”“除非”）。",
    },
    avoid: {
      en: "Do not rewrite formal clauses into casual slang or invent unverified compliance guarantees.",
      zh: "不要把正式条款改成轻浮口语，也绝不补写未核实的合规承诺。",
    },
  },
  argumentative: {
    id: "argumentative",
    label: { en: "Business Brief & Essay-Argument", zh: "工作简报与观点长文" },
    cut: {
      en: "Cut macro-trend openers, buzzword clusters, 3-part balanced semicolon pitches, 'Not X, but Y' slogans, and unsourced claims.",
      zh: "切掉宏观趋势开场、热词共现、三段对称分号推销句、“不是 A 而是 B”金句和无出处背书。",
    },
    protect: {
      en: "Keep upfront conclusions, concrete metrics, genuine trade-off contrasts, and named internal data sources.",
      zh: "保留前置结论与关键数字、带真实动作的取舍对比，以及具名后台/实测数据来源。",
    },
    avoid: {
      en: "Do not trade one slogan for another aphorism or add macro sign-offs ('Looking ahead').",
      zh: "不要把一种套话换成另一句金句，更别在结尾补写“展望未来”式拔高。",
    },
  },
  narrative: {
    id: "narrative",
    label: { en: "Literary Essay & Column", zh: "随笔、专栏与叙事非虚构" },
    cut: {
      en: "Strip moralizing endings, stock AI metaphors, stiff translationese, mechanical Q&A transitions, and halfwidth CJK punctuation.",
      zh: "删掉结尾强行升华、陈旧 AI 意象、生硬欧化翻译腔、机械设问过渡与中文里的半角标点。",
    },
    protect: {
      en: "Preserve sensory details, dialogue, author rhythm contrast, deliberate short dramatic beats, and natural flowing sentences.",
      zh: "保留现场细节、人物原话、个人节奏起伏、有意的短句停顿和通顺的流水长句。",
    },
    avoid: {
      en: "Do not flatten personal prose into technical bullet points or invent scenes missing from the notes.",
      zh: "不要把个人叙述改呆板成工程条目，也绝不外编素材里没有的细节。",
    },
  },
  casual: {
    id: "casual",
    label: { en: "Conversational & Personal Post", zh: "口语帖、闲置转卖与社区分享" },
    cut: {
      en: "Remove scripted influencer clichés, customer-service filler wrappers, chatbot openings, and injected corporate jargon.",
      zh: "去掉网红脚本腔、刻意客服套话、AI 开场白和硬塞进去的企业黑话。",
    },
    protect: {
      en: "Preserve first-person spoken phrasing, conversational cadence, and recurring shop or shipping policy lines verbatim.",
      zh: "保留第一人称口语词、日常停顿节奏，以及固定交易/发货规则短句。",
    },
    avoid: {
      en: "Do not inflate spoken wording into stiff bookish prose or cycle synonyms on recurring policy lines.",
      zh: "绝不为了规避重复把口语改成生硬书面腔（如把“自己收的”改成“仅出/略有/旨在”），也无需同义词轮换。",
    },
  },
  marketing: {
    id: "marketing",
    label: { en: "Product & Launch Copy", zh: "产品介绍与发布文案" },
    cut: {
      en: "Remove generic AI SaaS hype ('unleash', 'supercharge', 'new era'), empty triads, and unverified speed/quality claims.",
      zh: "删掉千篇一律的 AI 营销大词（赋能/颠覆/新纪元）、空洞三段排比和无基准夸大宣称。",
    },
    protect: {
      en: "Keep concrete product mechanisms, intentional punchy benefit lines, and verified user counts or benchmarks.",
      zh: "保留具体产品机制、有实质信息的短促利益点，以及实测或真实用户数字。",
    },
    avoid: {
      en: "Do not invent customer metrics or pad short benefits into abstract manifesto paragraphs.",
      zh: "不编造用户数据，不把短促清楚的功能点抻成长段虚词。",
    },
  },
  "deck-ui": {
    id: "deck-ui",
    label: { en: "Slides, PDF & Web UI", zh: "PPT、海报与网页界面" },
    cut: {
      en: "Cut vague topic slide titles, >120-word slide walls, dead '#' links, purple-pink gradients, pill soup, and nested boxes.",
      zh: "去掉空泛主题式标题、整屏文字墙、空 '#' 链接、紫粉霓虹渐变、胶囊标签墙和多层套盒。",
    },
    protect: {
      en: "Keep action-takeaway titles, concise UI slot copy, real interactive routes, and single-screen hierarchy.",
      zh: "保留直接说结论的标题、简短清晰的界面词条、真实跳转路径与单屏层级结构。",
    },
    avoid: {
      en: "Never expand microcopy past its container slot or add decorative 'AI-Powered' badges.",
      zh: "界面短文案改写长度不得超过原位置容量，不加装饰性 AI 标签。",
    },
  },
});

const PACK_DEFAULT_STRATEGY = Object.freeze({
  "engineering-spec": "technical",
  "regulated-comms": "official",
  "literary-essay": "narrative",
  "deck-and-ui": "deck-ui",
  "executive-deck": "deck-ui",
  "business-brief": "argumentative",
  core: "argumentative",
});

export function getScenarioStrategy({ packId = "business-brief", register = "unspecified" } = {}) {
  const regNorm = String(register || "").trim().toLowerCase();
  if (regNorm && regNorm !== "unspecified" && regNorm !== "auto" && SCENARIO_STRATEGIES[regNorm]) {
    return SCENARIO_STRATEGIES[regNorm];
  }
  const key = PACK_DEFAULT_STRATEGY[packId] || "argumentative";
  return SCENARIO_STRATEGIES[key] || SCENARIO_STRATEGIES.argumentative;
}

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
  ".pdf": "pdf",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
};

export function detectModality(filename = "") {
  if (!filename || filename === "<memory>") return "markdown";
  const base = String(filename).split(/[\\/]/).pop().toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  return EXT_TO_MODALITY[base.slice(dot)] || null;
}

export function defaultPackForModality(modality) {
  if (
    modality === "html" ||
    modality === "css" ||
    modality === "jsx" ||
    modality === "svg" ||
    modality === "pptx" ||
    modality === "pdf" ||
    modality === "image"
  ) {
    return "deck-and-ui";
  }
  return "business-brief";
}

export function codePointLength(str) {
  let count = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const c2 = s.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) i += 1;
    }
    count += 1;
  }
  return count;
}

export function sliceCodepoints(str, maxCp) {
  const s = String(str || "");
  if (maxCp <= 0) return "";
  let count = 0;
  let i = 0;
  while (i < s.length && count < maxCp) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const c2 = s.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) i += 2;
      else i += 1;
    } else {
      i += 1;
    }
    count += 1;
  }
  return s.slice(0, i);
}

export function isLongFormHtmlDocument(rawHtml) {
  const raw = String(rawHtml || "");
  if (!raw.trim()) return false;
  if (/(?:class\s*=\s*["'][^"']*\b(?:reveal|slides)\b|data-slide\b)/i.test(raw)) return false;
  const slideCls = raw.match(/class\s*=\s*["'][^"']*\bslide\b/gi) || [];
  if (slideCls.length >= 2) return false;
  const zones = buildZones(raw, "html");
  const visible = zones.proseLogical ?? zones.prose;
  const cjkChars = (visible.match(/[\u4e00-\u9fff]/gu) || []).length;
  const enWords = visible.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  if (cjkChars >= 600 || enWords >= 250) return true;
  const blocks = visible.split(/\n+| {5,}/).map((b) => b.trim()).filter(Boolean);
  let substantialBlocks = 0;
  for (const blk of blocks) {
    const blkCjk = (blk.match(/[\u4e00-\u9fff]/gu) || []).length;
    const blkEn = blk.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
    if (blkCjk >= 20 || blkEn >= 14) substantialBlocks += 1;
    if (substantialBlocks >= 2) return true;
  }
  return false;
}

export function hasEmbeddedUiMarkup(rawMarkdown) {
  let s = maskMarkdownFences(String(rawMarkdown || ""), new Set());
  s = s.replace(/`[^`\n]+`/g, " ");
  const uiTags = s.match(/<(?:(?:div|section|article|header|nav|button)\b[^>]*(?:class(?:Name)?=|style=)|a\b[^>]*(?:class(?:Name)?=|style=|href=["'](?:#|javascript:|\s*["']))|svg\b[^>]*>)/gi) || [];
  return uiTags.length >= 2;
}

export function computeRulesetHash(pack) {
  const parts = (pack?.rules || [])
    .map((r) => `${r.id}:${r.severity || "warning"}`)
    .sort()
    .join("|");
  return fnv1aHex(`${ENGINE_VERSION}|${pack?.id || ""}|${parts}`);
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

export function isSentenceBreakAt(text, idx) {
  const ch = text[idx];
  if (!ch || !/[\n.!?。！？]/.test(ch)) return false;
  if (ch !== ".") return true;
  const prev = idx > 0 ? text[idx - 1] : "";
  const next = idx + 1 < text.length ? text[idx + 1] : "";
  if (/[0-9]/.test(prev) && /[0-9]/.test(next)) return false;
  if (/[A-Za-z0-9_-]/.test(prev) && /[a-z0-9]/.test(next)) return false;
  const beforeWord = text.slice(Math.max(0, idx - 6), idx);
  if (/(?:^|\s)(?:vs|v|approx|e\.g|i\.e)$/i.test(beforeWord)) return false;
  return true;
}

function buildSentenceBreakIndices(text) {
  const breaks = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\n" || ch === "." || ch === "!" || ch === "?" || ch === "。" || ch === "！" || ch === "？") {
      if (isSentenceBreakAt(text, i)) breaks.push(i);
    }
  }
  return breaks;
}

function enclosingSentence(text, start, end, breakIndices = null) {
  let left = 0;
  let right = text.length;
  if (Array.isArray(breakIndices) && breakIndices.length > 0) {
    // Upper bound for last break strictly before `start`
    let lo = 0;
    let hi = breakIndices.length - 1;
    let prevBreak = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (breakIndices[mid] < start) {
        prevBreak = breakIndices[mid];
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (prevBreak !== -1) left = prevBreak + 1;

    // Lower bound for first break >= end
    lo = 0;
    hi = breakIndices.length - 1;
    let nextBreak = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (breakIndices[mid] >= end) {
        nextBreak = breakIndices[mid];
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    if (nextBreak !== -1) right = nextBreak;
  } else {
    left = start;
    while (left > 0 && !isSentenceBreakAt(text, left - 1)) {
      left -= 1;
    }
    right = end;
    while (right < text.length && !isSentenceBreakAt(text, right)) {
      right += 1;
    }
  }
  if (right < text.length && /[.!?。！？]/.test(text[right])) {
    right += 1;
  }
  return sliceCodepoints(text.slice(left, right).trim(), 240);
}

function enclosingSentenceUnclipped(text, start, end) {
  const lineStart = Math.max(0, text.lastIndexOf("\n", Math.max(0, start - 1)) + 1);
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = text.length;
  const lineText = text.slice(lineStart, lineEnd);
  const codeRanges = [];
  const codeRe = /`[^`\n]+`/g;
  let cm;
  while ((cm = codeRe.exec(lineText)) !== null) {
    codeRanges.push([lineStart + cm.index, lineStart + cm.index + cm[0].length]);
  }
  const inBackticks = (idx) => codeRanges.some(([s, e]) => idx >= s && idx < e);
  let left = start;
  while (left > lineStart && (inBackticks(left - 1) || !isSentenceBreakAt(text, left - 1))) {
    left -= 1;
  }
  let right = end;
  while (right < lineEnd && (inBackticks(right) || !isSentenceBreakAt(text, right))) {
    right += 1;
  }
  if (right < lineEnd && !inBackticks(right) && /[.!?。！？]/.test(text[right])) {
    right += 1;
  }
  return text.slice(left, right).trim();
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

const HTML_ENTITY_NAMED = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

const HTML_ENTITY_RE = /&(?:#([0-9]+)|#x([0-9a-fA-F]+)|lt|gt|amp|quot|apos|nbsp|mdash|ndash|hellip);/gi;

function decodeEntityToken(m, dec, hex) {
  if (dec) {
    const cp = Number(dec);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : " ";
  }
  if (hex) {
    const cp = parseInt(hex, 16);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : " ";
  }
  return HTML_ENTITY_NAMED[m.slice(1, -1).toLowerCase()] || null;
}

function decodeHtmlEntitiesPreservingLength(str) {
  return String(str).replace(HTML_ENTITY_RE, (m, dec, hex) => {
    const ch = decodeEntityToken(m, dec, hex);
    if (!ch) return m;
    if (ch.length <= m.length) return ch + " ".repeat(m.length - ch.length);
    return sliceCodepoints(ch, 1) + " ".repeat(Math.max(0, m.length - sliceCodepoints(ch, 1).length));
  });
}

function decodeHtmlWithOffsetMap(str) {
  const s = String(str || "");
  if (!s.includes("&")) return null;
  let out = "";
  const mapStarts = [];
  const mapEnds = [];
  let last = 0;
  let matchedAny = false;
  HTML_ENTITY_RE.lastIndex = 0;
  let m;
  while ((m = HTML_ENTITY_RE.exec(s)) !== null) {
    for (let k = last; k < m.index; k += 1) {
      out += s[k];
      mapStarts.push(k);
      mapEnds.push(k + 1);
    }
    const ch = decodeEntityToken(m[0], m[1], m[2]);
    if (ch !== null) {
      matchedAny = true;
      for (let u = 0; u < ch.length; u += 1) {
        out += ch[u];
        mapStarts.push(m.index);
        mapEnds.push(m.index + m[0].length);
      }
    } else {
      for (let k = m.index; k < m.index + m[0].length; k += 1) {
        out += s[k];
        mapStarts.push(k);
        mapEnds.push(k + 1);
      }
    }
    last = m.index + m[0].length;
  }
  if (!matchedAny) return null;
  for (let k = last; k < s.length; k += 1) {
    out += s[k];
    mapStarts.push(k);
    mapEnds.push(k + 1);
  }
  return { text: out, mapStarts, mapEnds };
}

function maskMarkdownFences(text, proseFenceSet) {
  const lines = text.split("\n");
  const out = [];
  let fenceChar = null;
  let fenceLen = 0;
  let keepBody = false;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const noCr = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const cr = rawLine.endsWith("\r") ? "\r" : "";
    const trimmed = noCr.trim();

    if (!fenceChar) {
      const m = noCr.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
      if (m) {
        fenceChar = m[1][0];
        fenceLen = m[1].length;
        const lang = m[2].trim().split(/\s+/)[0].toLowerCase();
        keepBody = proseFenceSet.size > 0 && proseFenceSet.has(lang);
        out.push(" ".repeat(noCr.length) + cr);
        continue;
      }
      out.push(rawLine);
    } else {
      const closeRe = new RegExp(`^[ \\t]*${fenceChar}{${fenceLen},}[ \\t]*$`);
      if (closeRe.test(trimmed)) {
        fenceChar = null;
        fenceLen = 0;
        keepBody = false;
        out.push(" ".repeat(noCr.length) + cr);
      } else if (keepBody) {
        out.push(rawLine);
      } else {
        out.push(" ".repeat(noCr.length) + cr);
      }
    }
  }
  return out.join("\n");
}

const HTML_BLOCK_BREAK_TAG_RE = /^<\/(?:p|div|li|td|th|tr|h[1-6]|section|article|header|footer|aside|blockquote|dt|dd|button|title)\b|^<br\b/i;

/**
 * Build length-preserving masked views so character offsets match raw text 1:1.
 */
export function buildZones(rawText, modality, options = {}) {
  const normText = String(rawText || "").replace(/\uFEFF/g, " ");
  const proseFenceSet = new Set(
    Array.isArray(options?.proseFences)
      ? options.proseFences.map((s) => String(s || "").trim().toLowerCase()).filter(Boolean)
      : []
  );
  const maskBlockquotes = options?.maskBlockquotes !== false;

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
    // Fenced code blocks (supports optional proseFences allowlist)
    prose = maskMarkdownFences(prose, proseFenceSet);
    // Inline code spans & strikethrough
    prose = prose.replace(/`[^`\n]+`/g, preserveLinesBlank);
    prose = prose.replace(/~~[^~\n]+~~/g, preserveLinesBlank);
    // Blockquotes (quoted external material)
    if (maskBlockquotes) {
      prose = prose.replace(/^[ \t]*>.*$/gm, preserveLinesBlank);
    } else {
      prose = prose.replace(/^[ \t]*(?:>[ \t]?)+/gm, preserveLinesBlank);
    }
    // Markdown link targets ](url) while keeping visible [label] and opening `(` for link lookahead
    prose = prose.replace(/\]\([^)\n]+\)/g, (m) => "](" + preserveLinesBlank(m.slice(2)));
  }
  let proseLogical = null;
  let proseMap = null;
  if (modality === "html" || modality === "jsx" || modality === "svg") {
    // Strip tags in prose zone while preserving offsets and inserting newlines at block boundaries
    prose = prose.replace(/<[^>]+>/g, (tag) => {
      if (HTML_BLOCK_BREAK_TAG_RE.test(tag) && tag.length >= 1) {
        return preserveLinesBlank(tag.slice(0, -1)) + "\n";
      }
      return preserveLinesBlank(tag);
    });
    const decoded = decodeHtmlWithOffsetMap(prose);
    if (decoded) {
      proseLogical = decoded.text.replace(/https?:\/\/[^\s)>"'`]+/g, (u) => " ".repeat(u.length));
      proseMap = { starts: decoded.mapStarts, ends: decoded.mapEnds };
    }
    prose = decodeHtmlEntitiesPreservingLength(prose);
  }
  // Mask bare URLs in prose
  prose = prose.replace(/https?:\/\/[^\s)>"'`]+/g, preserveLinesBlank);

  if (modality === "html" || modality === "jsx" || modality === "svg") {
    uiText = uiText.replace(/<[^>]+>/g, (tag) => preserveLinesBlank(tag));
    uiText = decodeHtmlEntitiesPreservingLength(uiText);
  }

  return { raw, prose, proseLogical, proseMap, "ui-text": uiText };
}

export function isAllowedMatch(matchText, allowList = []) {
  if (!allowList || allowList.length === 0) return false;
  const lower = matchText.toLowerCase();
  return allowList.some((item) => lower.includes(String(item).toLowerCase()));
}

// ---------- Structural Prose Probes ----------

function probeNegationPivot(proseText, rawText) {
  const hits = [];
  const checkConcreteZh = (clauseA, clauseB, rawSlice) =>
    (/\d/.test(clauseA) && /\d/.test(clauseB)) ||
    /`/.test(rawSlice) ||
    /\.[a-z]{2,4}\b/i.test(rawSlice) ||
    /(?:第一次|第二次|站台|号楼|排第|星期|周[一二三四五六日天])/.test(rawSlice);

  // Chinese 3-part: (这/那/它)(既)不是 A，也不是 B，而是/更是 C
  const zhTripleRegex = /(?:(?:这|那|它)?(?:既)?(?:并)?不(?:是|只是|仅仅?是)|绝非|并非(?:只是)?)([^，。！？；\n]{1,22})[，,；—]+\s*也(?:并)?不(?:是|只是|仅仅?是)([^，。！？；\n]{1,22})[，,；—]+\s*(?:而是|更是)([^。！？；\n]{1,28})/gu;
  // Chinese 2-part: 不是/绝非/并非/与其说/不仅(让/使/能/可以/在于/停留在)/不在(于)/不(搞/做/靠) A，而是/更是/不如说/而是在(于) B
  const zhRegex = /(?:(?:这|那|它)?(?:(?:并)?不(?:是|只是|仅仅?是|仅(?:让|使|能|可以|在于|停留在)|在(?:于)?|搞|做|靠)|绝非|并非(?:只是)?)|与其说是?)([^，。！？；\n]{1,22})[，,；—]+\s*(?:而(?:是在(?:于)?|是|靠)|更(?:是|能|在于|让|使)|不如说是?)([^。！？；\n]{1,28})/gu;
  const zhRhetoricalHead = /^(?:(?:这|那|它)|绝非|并非|与其|并?不(?:只是|仅仅?是|仅(?:让|使|能|可以|在于|停留在)|在(?:于)?|搞|做|靠))/;
  const zhFactualRootCause = /(?:报错|故障|原因|超时|磁盘|内存|耗尽|端口|进程|导致|因为|[A-Za-z_][A-Za-z0-9_-]{2,})/;
  const coveredSpans = [];

  let m;
  while ((m = zhTripleRegex.exec(proseText)) !== null) {
    const clauseA = (m[1] || "").trim();
    const clauseB = (m[2] || "").trim();
    const clauseC = (m[3] || "").trim();
    const rawSlice = rawText.slice(m.index, m.index + m[0].length);
    if (checkConcreteZh(clauseA + clauseB, clauseC, rawSlice) || clauseC.length > 26 || !clauseA || !clauseB || !clauseC) {
      continue;
    }
    coveredSpans.push([m.index, m.index + m[0].length]);
    hits.push({ index: m.index, length: m[0].length });
  }

  while ((m = zhRegex.exec(proseText)) !== null) {
    if (coveredSpans.some(([s, e]) => m.index >= s && m.index < e)) continue;
    const clauseA = (m[1] || "").trim();
    const clauseB = (m[2] || "").trim();
    const rawSlice = rawText.slice(m.index, m.index + m[0].length);
    const contextBefore = rawText.slice(Math.max(0, m.index - 12), m.index);
    if (checkConcreteZh(clauseA, clauseB, rawSlice) || clauseB.length > 26 || !clauseA || !clauseB) {
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
    const rawPara = pm[0];
    const para = rawPara.replace(/!\[[^\]]*\](?:\([ \t]*|\[[^\]]*\])?/g, (m) => m.replace(/[^\r\n]/g, " "));
    const trimmed = para.trim();
    if (!trimmed) continue;
    // Skip headings, lists, and tables
    if (/^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\|)/.test(trimmed)) continue;

    // Collect sentences with offsets inside paragraph using decimal/version-safe boundary checks
    const sentences = [];
    let i = 0;
    const n = para.length;
    while (i < n) {
      while (i < n && /[\s\r\n]/.test(para[i])) i += 1;
      if (i >= n) break;
      const segStart = i;
      while (i < n && para[i] !== "\n" && !(isSentenceBreakAt(para, i) && para[i] !== "\n")) {
        i += 1;
      }
      if (i >= n || para[i] === "\n") {
        // Non-terminated line fragment breaks any staccato run
        sentences.push({ start: pm.index + segStart, end: pm.index + i, isShort: false });
        if (i < n && para[i] === "\n") i += 1;
        continue;
      }
      while (i < n && /[.!?。！？]/.test(para[i])) i += 1;
      const s = para.slice(segStart, i).trim();
      const body = s.replace(/[.!?。！？]+$/u, "").trim();
      if (body) {
        const cjkCount = (body.match(/[\u4e00-\u9fff]/gu) || []).length;
        const enWords = body.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
        const isShort =
          (cjkCount >= 2 && cjkCount <= 6 && enWords <= 1 && !/[，,：:；;]/.test(body)) ||
          (cjkCount === 0 && enWords >= 2 && enWords <= 4 && !/[,:;]/.test(body));
        const leadInSeg = para.slice(segStart, i).indexOf(s);
        const start = pm.index + segStart + Math.max(0, leadInSeg);
        sentences.push({ start, end: start + s.length, isShort });
      }
    }

    let runStart = -1;
    let runCount = 0;
    for (let k = 0; k <= sentences.length; k += 1) {
      const cur = sentences[k];
      if (cur && cur.isShort) {
        if (runCount === 0) runStart = k;
        runCount += 1;
      } else {
        if (runCount >= 3) {
          const first = sentences[runStart];
          const last = sentences[k - 1];
          hits.push({ index: first.start, length: last.end - first.start });
        }
        runCount = 0;
      }
    }
  }
  return hits;
}

const ZH_TRIAD_SLOGAN_ROOTS = /(?:高效|精准|全面|智能|可靠|协同|赋能|闭环|引领|抓手|稳健|灵活|深度|多元|生态|敏捷|极致|易用|统筹|兼顾|推进|提质|增效|创新|优质|卓越|无缝|安全|稳定|科学|规范|统一|便捷|智慧|领先|透明|可控|弹性|全方位|立体)/u;

function probeZhFourCharTriad(proseText) {
  const hits = [];
  const triadRegex = /(?:^|[，。！？；：、“‘（\s]|(?:实现|具备|坚持|保持|做到|形成|打造|追求|提供|确保|了|是|的|以|向|为))([\u4e00-\u9fff]{4})[、，,·・]\s*([\u4e00-\u9fff]{4})[、，,·・]\s*([\u4e00-\u9fff]{4})(?=$|[，。！？；：、”’）\s·・]|[的地等])/gu;
  const entitySuffix = /(?:大学|学院|学校|公司|集团|银行|医院|中心|委员|政府|部门|机场|车站|高速|铁路|[省市区县镇乡]|编号|日期|时间|记录|清单|台账|出处|明细|汇总|报表|状态|字段|开关|配置|步骤|检查|规则|目录|路径|文档|手册|模板|脚本|接口|模块|节点|日志|指标|参数|列表|表格|工作表|表|拓扑|矩阵|样例|资产|结果|组合|读取|创建|输入|输出|去重|占用|冲回)$/u;
  const brokenSlice = /[的了在或与及把被]/u;
  let m;
  while ((m = triadRegex.exec(proseText)) !== null) {
    const items = [m[1], m[2], m[3]];
    if (items.some((w) => entitySuffix.test(w) || brokenSlice.test(w))) continue;
    const startOffset = m.index + m[0].indexOf(m[1]);
    const endOffset = m.index + m[0].length;
    const prevChar = startOffset > 0 ? proseText[startOffset - 1] : "";
    if (prevChar === "《") continue;
    const before = proseText.slice(Math.max(0, startOffset - 24), startOffset);
    const after = proseText.slice(endOffset, Math.min(proseText.length, endOffset + 24));
    // Exempt 4+ item enumerations
    if (/[\u4e00-\u9fff]{4}\s*[、，,·・]\s*$/.test(before) || /^\s*[、，,·・]\s*[\u4e00-\u9fff]{4}/.test(after)) {
      continue;
    }
    // Exempt explicit technical/field enumeration context
    if (/(?:包括|包含|涵盖|设有|分为|列出|涉及|字段为|表名为|包含如下)[：:]?\s*$/.test(before) && /^\s*等/.test(after)) {
      continue;
    }
    const sloganMatches = items.filter((w) => ZH_TRIAD_SLOGAN_ROOTS.test(w)).length;
    if (sloganMatches < 2) continue;
    hits.push({ index: startOffset, length: endOffset - startOffset });
  }
  return hits;
}

function probeUnsourcedAttribution(proseText, rawText) {
  const hits = [];
  const attrRegex = /\b(?:[Ss]tudies|[Rr]esearch|[Ii]ndustry\s+research|[Ee]xperts|[Dd]ata)\s+(?:shows?|suggests?|indicates?|proves?)\b|(?:研究|数据|专家|业内人士|行业报告)(?:表明|显示|指出|认为)[，,]?/gu;
  let m;
  while ((m = attrRegex.exec(proseText)) !== null) {
    // Grounded internal operational data: e.g. "客服后台明细数据显示近7天平均响应时长为 98分12秒。"
    if (m[0].startsWith("数据")) {
      const preClause = proseText.slice(Math.max(0, m.index - 24), m.index);
      const afterSlice = rawText.slice(m.index, Math.min(rawText.length, m.index + 80));
      if (
        /(?:客服|监控|日志|后台|明细|台账|实测|压测|统计|灰度|线上|本地|内部|本次|本期|本轮|订单|系统|埋点|审计|抽样)[\u4e00-\u9fffA-Za-z0-9_-]{0,12}$/.test(
          preClause
        ) &&
        /\d/.test(afterSlice)
      ) {
        continue;
      }
    }
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
  const rawLines = rawText.split("\n");
  let offset = 0;
  let runStartOffset = 0;
  let runEndOffset = 0;
  let runCount = 0;

  for (let i = 0; i <= rawLines.length; i += 1) {
    const rawLine = i < rawLines.length ? rawLines[i] : "";
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const proseLine = i < rawLines.length ? proseText.slice(offset, offset + line.length) : "";
    const isBullet =
      proseLine.trim().length > 0 &&
      /^\s*(?:[-*+]|\d+[.)])\s+\*\*([^*\n`]{2,36})\*\*\s*[:：—-]/.test(line);
    if (isBullet) {
      if (runCount === 0) runStartOffset = offset + line.search(/\S/);
      runCount += 1;
      runEndOffset = offset + line.length;
    } else if (i === rawLines.length || line.trim() !== "") {
      if (runCount >= minRun) {
        hits.push({ index: runStartOffset, length: runEndOffset - runStartOffset });
      }
      runCount = 0;
    }
    offset += rawLine.length + 1;
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
  "leverages", "leverage", "leveraging", "seamless", "seamlessly", "streamline", "streamlines",
  "foster", "fostering", "robust", "empowers", "empower", "stakeholders",
  "navigate", "comprehensive", "harnesses", "harness", "elevate", "pivotal",
  "transformative", "transformative outcomes", "pivotal alignment", "transparent alignment",
  "resilience", "synergy", "holistic", "ecosystem", "actionable", "unparalleled",
  "effortless", "effortlessly", "blazing-fast", "blazing fast", "lightning-fast", "lightning fast",
  "supercharge", "supercharges", "cutting-edge", "next-gen", "next-generation",
];

function normalizeEnMarkerStem(term) {
  const norm = String(term || "").toLowerCase().replace(/\s+/g, "-");
  if (norm === "next-generation") return "next-gen";
  if (norm.endsWith("lessly")) return norm.slice(0, -2);
  if (norm.endsWith("less")) return norm;
  return norm.replace(/(?:ing|es|s)$/, "");
}

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

export function stripParentheticals(str) {
  const out = [];
  let depth = 0;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (ch === "(" || ch === "（") {
      depth += 1;
      out.push(" ");
    } else if ((ch === ")" || ch === "）") && depth > 0) {
      depth -= 1;
      out.push(" ");
    } else if (depth > 0 && ch !== "\n" && ch !== "\r") {
      out.push(" ");
    } else {
      out.push(ch);
    }
  }
  return out.join("");
}

function countConcretenessAnchors(rawSlice) {
  // Strip HTML comments before counting concrete anchors
  const s = String(rawSlice || "").replace(/<!--[\s\S]*?-->/g, " ");
  let count = 0;
  count += (s.match(/(?<![A-Za-z0-9_])\d+(?:[.,:]\d+)?%?(?![A-Za-z0-9_])/g) || []).length;
  count += (s.match(/(?<![A-Za-z0-9_])[A-Z]{1,4}-?\d{1,3}(?![A-Za-z0-9_])/g) || []).length;
  count += (s.match(/`[^`\n]+`/g) || []).length;
  count += (s.match(/[/\\][A-Za-z0-9._-]+\.[a-z]{1,5}(?![A-Za-z0-9_])/gi) || []).length;
  count += (s.match(/(?<![A-Za-z0-9_])(?:PR\s*#?\d+|v\d+\.\d+|HTTP\s*\d{3}|UTC|Q[1-4])(?![A-Za-z0-9_])/g) || []).length;
  count += (
    s.match(
      /(?:[一二三四五六七八九十两百千万]+[天月年次个张条座块斤米秒分时人颗枚格炉瓶对]|周[一二三四五六日天]|昨天|昨晚|今早|上周|下周|去年|前年|清晨|傍晚|凌晨|午后|十月|十一月|十二月)/gu
    ) || []
  ).length;
  count += (s.match(/《[^》\n]{1,32}》/gu) || []).length;
  count += (s.match(/[「『“"][\u4e00-\u9fffA-Za-z0-9_/-]{1,16}[」』”"]/gu) || []).length;
  count += (s.match(/(?:点击|打开|勾选|切换|输入|选择|保存|导出|上传|下载|复制|粘贴|刷新|重启|执行|登录|填写|核对)/gu) || []).length;
  return count;
}

function isStructuredLine(trimmedLine) {
  return /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>)/.test(trimmedLine);
}

/**
 * Extract substantive Markdown list items and explanatory table cells with exact source offsets.
 */
function extractStructuredProseBlocks(proseText, rawText) {
  const items = [];
  let pos = 0;
  const n = proseText.length;
  while (pos <= n) {
    const nl = proseText.indexOf("\n", pos);
    const lineEnd = nl === -1 ? n : nl;
    const lineProse = proseText.slice(pos, lineEnd);
    const lineRaw = rawText.slice(pos, lineEnd);
    const listMatch = lineProse.match(/^(\s*(?:[-*+]|\d+[.)])\s+)(.+)$/);
    if (listMatch) {
      const bodyStart = pos + listMatch[1].length;
      const bodyText = listMatch[2];
      const trimmed = bodyText.trim();
      const cjk = (trimmed.match(/[\u4e00-\u9fff]/gu) || []).length;
      const en = trimmed.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
      if (cjk >= 24 || en >= 15) {
        items.push({
          start: bodyStart + Math.max(0, bodyText.indexOf(trimmed)),
          end: lineEnd,
          base: bodyStart,
          text: bodyText,
          trimmed,
          rawSlice: rawText.slice(bodyStart, lineEnd),
          isListItem: true,
          isTableCell: false,
        });
      }
    } else if (/^\s*\|/.test(lineRaw) && !/^\s*\|[\s:|-]+\|?\s*$/.test(lineRaw)) {
      let cellPos = 0;
      while (cellPos < lineProse.length) {
        const pipeIdx = lineProse.indexOf("|", cellPos);
        if (pipeIdx === -1) break;
        const nextPipe = lineProse.indexOf("|", pipeIdx + 1);
        if (nextPipe === -1) break;
        const cellRaw = lineProse.slice(pipeIdx + 1, nextPipe);
        const trimmed = cellRaw.trim();
        const cjk = (trimmed.match(/[\u4e00-\u9fff]/gu) || []).length;
        const en = trimmed.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
        if (cjk >= 15 || en >= 10) {
          const base = pos + pipeIdx + 1;
          items.push({
            start: base + Math.max(0, cellRaw.indexOf(trimmed)),
            end: pos + nextPipe,
            base,
            text: cellRaw,
            trimmed,
            rawSlice: rawText.slice(base, pos + nextPipe),
            isListItem: false,
            isTableCell: true,
          });
        }
        cellPos = nextPipe;
      }
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return items;
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
 * Linear O(n) sentence splitter with exact source offsets — decimal/version-safe & zero backtracking.
 */
function splitProseSentencesWithOffsets(para) {
  const out = [];
  const text = para.text;
  const base = para.base ?? (para.end - text.length);
  const n = text.length;
  let i = 0;

  while (i < n) {
    while (i < n && (text[i] === "\n" || text[i] === "\r" || text[i] === " " || text[i] === "\t")) {
      i += 1;
    }
    if (i >= n) break;
    const segStart = i;
    const startedBold = text.slice(segStart, segStart + 2) === "**";
    while (i < n && !(isSentenceBreakAt(text, i))) {
      i += 1;
    }
    while (i < n && text[i] !== "\n" && isSentenceBreakAt(text, i)) {
      i += 1;
    }
    if (startedBold && text.slice(i, i + 2) === "**") {
      i += 2;
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
  const blocks = [...extractProseParagraphs(proseText, rawText), ...extractStructuredProseBlocks(proseText, rawText)];
  const enSciRobustRe =
    /(?<![A-Za-z0-9_])(?:robust\s+(?:estimator|regression|standard|statistics|variance|backoff|retry|inference|control|error\s+handling|parser|parsing|validation|recovery|fallback)|comprehensive\s+test(?:s|\s+suite)?)(?![A-Za-z0-9_])/gi;
  for (const para of blocks) {
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
        const stem = normalizeEnMarkerStem(term);
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

function hasIsomorphicClauseHead(clauses) {
  const leadVerbs = /^(?:把|将|通过|让|使|对|按|负责|支持|提供|确保|实现|帮助|提升|优化|构建|打造)/u;
  const keys = [];
  for (const cl of clauses) {
    const t = cl.trim().replace(/^[\s*"“「『(（]+/, "");
    if (!t) continue;
    const vm = t.match(leadVerbs);
    if (vm) {
      keys.push(`zhv:${vm[0]}`);
      continue;
    }
    const zhm = t.match(/^[\u4e00-\u9fff]{2}/u);
    if (zhm) {
      keys.push(`zh2:${zhm[0]}`);
      continue;
    }
    const enm = t.match(/^([A-Za-z]{2,})/);
    if (enm) keys.push(`en:${enm[1].toLowerCase()}`);
  }
  const counts = new Map();
  for (const k of keys) {
    counts.set(k, (counts.get(k) || 0) + 1);
    if (counts.get(k) >= 2) return true;
  }
  return false;
}

function probeSemicolonTricolon(proseText, rawText) {
  const hits = [];
  const blocks = [
    ...extractProseParagraphs(proseText, rawText),
    ...extractStructuredProseBlocks(proseText, rawText).filter((b) => b.isListItem),
  ];
  const legalGuard = /(?<![A-Za-z0-9_])(?:shall|must|hereby|pursuant\s+to|provided\s+that)(?![A-Za-z0-9_])|(?:应当|须于|不得|依照)/i;
  const checklistLeadRe = /^\s*(?:\d+[.)、）]|[（(]\d+[)）]|第[一二三四五六七八九十\d]+[步项条点]|先|随后|接着|然后|最后|若|如果|当|检查\s*\d|步骤\s*\d|step\s*\d|first\b|then\b|finally\b)/i;

  for (const para of blocks) {
    const maskedPara = para.text
      .replace(/&(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]{1,24});/g, (m) => " ".repeat(m.length))
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
      const techRefs = (rawSent.match(/`[^`\n]+`|\]\([^)\n]+\)|<code\b[^>]*>[\s\S]*?<\/code>/gi) || []).length;
      if (techRefs >= 2) continue;
      const clauses = s.text.split(/[;；]/).map((c) => c.trim()).filter(Boolean);
      if (clauses.length < 3) continue;
      // Exempt step-by-step checklists or temporal progressions
      const checklistCount = clauses.filter((c) => checklistLeadRe.test(c)).length;
      if (checklistCount >= 2) continue;
      if (/^先/.test(clauses[0]) && clauses.some((c) => /^(?:再|随后|接着|然后|最后)/.test(c))) continue;

      const lens = clauses.map((c) => Math.max(10, countTextUnitsTenths(c)));
      const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
      const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 1.0;
      const iso = hasIsomorphicClauseHead(clauses);
      if (
        !iso &&
        /(?:依赖|共用|失联|期间|否则|除非|仅在|禁止|不新写|不写入|不触发|幂等|持久化)/.test(s.text)
      ) {
        continue;
      }
      if (cv < 0.28 || (cv < 0.40 && iso)) {
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
  const blocks = [
    ...extractProseParagraphs(proseText, rawText),
    ...extractStructuredProseBlocks(proseText, rawText).filter((b) => b.isListItem),
  ];
  for (const para of blocks) {
    const sents = splitProseSentencesWithOffsets(para);
    for (const s of sents) {
      if (para.isListItem && /`[^`\n]+`/.test(rawText.slice(s.start, s.start + s.text.length))) continue;
      // Strip numeric thousands separators (1,200) and nested parenthetical lists before counting commas
      const cleaned = stripParentheticals(s.text.replace(/(\d),(\d{3})(?!\d)/g, "$1$2"));
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
  // Skip key-value metadata lines ("Atomic card: [...]", "来源：...") and numbered card headers ("控制栓 01 ...")
  if (
    /^[A-Za-z][A-Za-z0-9 _-]{1,28}:\s/.test(s) ||
    /^[\u4e00-\u9fff]{2,8}：/.test(s) ||
    /^[\u4e00-\u9fffA-Za-z0-9_-]{2,10}\s*0?\d+(?:\s|$|[·：:.-])/.test(s)
  ) {
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

  // Sliding window of 5 adjacent paragraphs so distant unrelated sections never collide
  if (paras.length >= 3) {
    const paraItems = paras.map((p) => ({ start: p.start, text: p.trimmed }));
    if (paraItems.length <= 5) {
      if (checkItems(paraItems, false, false)) return hits;
    } else {
      for (let w = 0; w <= paraItems.length - 5; w += 1) {
        if (checkItems(paraItems.slice(w, w + 5), false, false)) return hits;
      }
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

const ZH_AI_SLOP_JARGON_TERMS = [
  "全闭环", "形成闭环", "商业闭环", "深度赋能", "全面赋能", "价值跃迁", "范式跃迁", "范式转移",
  "底层逻辑", "顶层设计", "多维协同", "生态共赢", "无缝衔接", "无缝融合", "丝滑", "满血",
  "降维打击", "一剑封喉", "一步到位", "心智占领", "颗粒度对齐", "铁律", "彻底根治",
  "重塑格局", "破局", "降本增效", "护城河", "天花板", "深水区", "王炸", "硬核",
  "暴雷", "翻车", "崩塌", "雕花", "破框", "无缝", "跃迁",
];
const ZH_INDUSTRY_AMBIGUOUS_TERMS = [
  "闭环", "收口", "兜底", "打通", "落盘", "拉齐", "死线", "根治",
];
const ZH_DEV_ZERO_RE = /零(?:幻觉|侵入|摩擦|失误|死角|妥协|门槛|负担|缺陷|暴雷|翻车)/gu;
const ZH_DEV_HUA_RE = /(?:体系|精细|常态|全链路|数智|智能|生态|矩阵|范式|极致|平台|中台)化/gu;
const ZH_DEV_STORAGE_RE = /WAL|fsync|快照|持久化|落盘到\s*[A-Za-z0-9_./-]+|写入(?:磁盘|日志|文件)|事务日志/i;
const ZH_DEV_HARDWARE_CTRL_RE = /(?:位置|速度|电流|力矩|伺服|PID|反馈|外环|内环)闭环|编码器|控制柜/;
const ZH_DEV_GROUNDED_FILE_RE = /`[^`\n]+`|[A-Za-z0-9_/-]+\.(?:py|js|ts|mjs|go|rs|sql|json|yaml|yml|log|md)\b/i;

function probeZhDevJargon(proseText, rawText) {
  const hits = [];
  const blocks = [
    ...extractProseParagraphs(proseText, rawText),
    ...extractStructuredProseBlocks(proseText, rawText).filter((b) => b.isTableCell),
  ];
  for (const para of blocks) {
    const aiSlopHits = new Map();
    const industryHits = new Map();
    const base = para.base;
    const ctxSlice = para.rawSlice || para.text;
    const isStorageCtx = ZH_DEV_STORAGE_RE.test(ctxSlice);
    const isHardwareCtrl = ZH_DEV_HARDWARE_CTRL_RE.test(ctxSlice);

    for (const term of ZH_AI_SLOP_JARGON_TERMS) {
      const idx = para.text.indexOf(term);
      if (idx !== -1 && !aiSlopHits.has(term)) {
        aiSlopHits.set(term, { start: base + idx, end: base + idx + term.length });
      }
    }
    let m;
    ZH_DEV_ZERO_RE.lastIndex = 0;
    while ((m = ZH_DEV_ZERO_RE.exec(para.text)) !== null) {
      if (!aiSlopHits.has(m[0])) aiSlopHits.set(m[0], { start: base + m.index, end: base + m.index + m[0].length });
    }
    ZH_DEV_HUA_RE.lastIndex = 0;
    while ((m = ZH_DEV_HUA_RE.exec(para.text)) !== null) {
      if (!aiSlopHits.has(m[0])) aiSlopHits.set(m[0], { start: base + m.index, end: base + m.index + m[0].length });
    }

    for (const term of ZH_INDUSTRY_AMBIGUOUS_TERMS) {
      if (term === "落盘" && isStorageCtx) continue;
      if (term === "闭环" && isHardwareCtrl) continue;
      let coveredByAiTerm = false;
      for (const aiKey of aiSlopHits.keys()) {
        if (aiKey.includes(term)) {
          coveredByAiTerm = true;
          break;
        }
      }
      if (coveredByAiTerm) continue;
      const idx = para.text.indexOf(term);
      if (idx !== -1 && !industryHits.has(term)) {
        industryHits.set(term, { start: base + idx, end: base + idx + term.length });
      }
    }

    const groundedDomain =
      countConcretenessAnchors(ctxSlice) >= 2 || ZH_DEV_GROUNDED_FILE_RE.test(ctxSlice);
    let activeSpans = null;
    if (groundedDomain) {
      if (aiSlopHits.size >= 3) {
        activeSpans = Array.from(aiSlopHits.values());
      }
    } else if (aiSlopHits.size >= 1 && aiSlopHits.size + industryHits.size >= 3) {
      activeSpans = [...aiSlopHits.values(), ...industryHits.values()];
    }

    if (activeSpans && activeSpans.length > 0) {
      activeSpans.sort((a, b) => a.start - b.start);
      const first = activeSpans[0].start;
      const last = activeSpans[activeSpans.length - 1].end;
      hits.push({ index: first, length: Math.min(140, Math.max(1, last - first)) });
    }
  }
  return hits;
}

const ZH_EXCLAMATION_HYPE_RE = /(?:太棒了|千万不要|一定要|震撼|重磅|惊艳|必看|立即开启|彻底告别|强力推荐|绝对不能|不可错过)/;

function probeZhExclamation(proseText, rawText) {
  const allMarks = [];
  const hypeHits = [];
  const paras = extractProseParagraphs(proseText, rawText);
  for (const para of paras) {
    const trimP = para.trimmed;
    const paraCjk = (trimP.match(/[\u4e00-\u9fff]/gu) || []).length;
    // Exempt short standalone taglines (< 20 CJK chars) and example prompt lines
    if (paraCjk < 20) continue;
    if (/^(?:示例|例句|提示词|prompt)(?:[\s:：]|$)/i.test(trimP)) continue;
    // Mask quoted speech & parenthetical asides inside paragraph
    const masked = stripParentheticals(
      para.text
        .replace(/“[^”\n]*”/g, (m) => " ".repeat(m.length))
        .replace(/「[^」\n]*」/g, (m) => " ".repeat(m.length))
        .replace(/"[^"\n]*"/g, (m) => " ".repeat(m.length))
    );
    const maskedPara = { ...para, text: masked };
    for (const s of splitProseSentencesWithOffsets(maskedPara)) {
      const re = /[\u4e00-\u9fff][！!]/gu;
      let m;
      while ((m = re.exec(s.text)) !== null) {
        const hit = { index: s.start + m.index, length: m[0].length };
        allMarks.push(hit);
        if (ZH_EXCLAMATION_HYPE_RE.test(s.text)) {
          hypeHits.push(hit);
        }
      }
    }
  }
  if (allMarks.length >= 2) return allMarks;
  return hypeHits;
}

function probeZhMegaSentence(proseText, rawText) {
  const hits = [];
  const paras = extractProseParagraphs(proseText, rawText);
  for (const para of paras) {
    const paraCjk = (para.text.match(/[\u4e00-\u9fff]/gu) || []).length;
    const paraSemis = (para.text.match(/[;；]/g) || []).length;
    const sents = splitProseSentencesWithOffsets(para);
    let sentHit = false;
    for (const s of sents) {
      const sCjk = (s.text.match(/[\u4e00-\u9fff]/gu) || []).length;
      const visibleCompactedLen = codePointLength(s.text.replace(/[ \t]{2,}/g, " ").trim());
      if (sCjk > 180 || (sCjk >= 120 && visibleCompactedLen > 180)) {
        hits.push({ index: s.start, length: Math.min(140, s.text.length) });
        sentHit = true;
      }
    }
    if (!sentHit && paraCjk > 600 && paraSemis >= 3) {
      hits.push({ index: para.start, length: Math.min(140, para.trimmed.length) });
    }
  }
  return hits;
}

const UNSOURCED_STAT_MEASUREMENT_RE =
  /(?:从|由)\s*\d[\d.,]*\S{0,8}(?:到|至|降到|降至|升至|压缩至|缩减至)\s*\d|\bfrom\s+\d[\d.,]*\S{0,8}\s+to\s+\d|(?<![A-Za-z0-9_])(?:n\s*=\s*\d+|benchmark|dataset|sample|audit|log|metric|F1|FPR|Recall|Precision|p95|p99|SLA|SLO|RPO|RTO|uptime|availability|contract|CPU|RAM|memory|disk|coverage|confidence|threshold|CI|eval)(?![A-Za-z0-9_])|(?:实测|压测|基准|抽样|样本|日志|监控|报表|账单|测试集|留出集|置信|阈值|覆盖率|分位|召回|误报|命中|耗时|延迟|错误率|成功率|一致率|配额|折扣|比例|占比|权重|可用率|可用性|增长率|合同|协议|条款)/i;

const UNSOURCED_STAT_DIRECTIVE_RE =
  /^\s*(?:Set|Configure|Keep|Ensure|Allow|Leave|Pass|Use|Pick|Select|Adjust|Limit|Clamp|Require|设置|保持|确保|调整|限制|允许|预留)\b|(?:must|should|need\s+to)\s+be\s+(?:at\s+least|no\s+more\s+than|under|over)\b/i;

function probeUnsourcedStatistic(proseText, rawText, proseMap = null) {
  const hits = [];
  const patterns = [
    /(?:高达|多达|超过|近|约|至少|足足|整整|提升(?:了)?|提高(?:了)?|降低(?:了)?|减少(?:了)?|节省(?:了)?|缩短(?:了)?|增长(?:了)?|暴涨(?:了)?)\s*\d+(?:\.\d+)?%/gu,
    /\b(?:up\s+to|over|nearly|more\s+than|at\s+least|as\s+much\s+as|by)\s+\d+(?:\.\d+)?%/giu,
  ];
  const breaks = buildSentenceBreakIndices(proseText);
  for (const re of patterns) {
    let m;
    while ((m = re.exec(proseText)) !== null) {
      // Bound check to the enclosing sentence in proseText + corresponding raw slice
      let left = 0;
      let right = proseText.length;
      for (let bIdx = breaks.length - 1; bIdx >= 0; bIdx -= 1) {
        if (breaks[bIdx] < m.index) {
          left = breaks[bIdx] + 1;
          break;
        }
      }
      for (let bIdx = 0; bIdx < breaks.length; bIdx += 1) {
        if (breaks[bIdx] >= m.index + m[0].length) {
          right = breaks[bIdx] + 1;
          break;
        }
      }
      const sentProse = proseText.slice(left, right);
      if (UNSOURCED_STAT_DIRECTIVE_RE.test(sentProse) && !/(?:提升|提高|降低|减少|节省|缩短|增长|暴涨|faster|improve|reduce|save)/i.test(sentProse)) {
        continue;
      }
      const rawStart = proseMap ? proseMap.starts[left] ?? left : left;
      const rawEnd = proseMap ? proseMap.ends[Math.max(left, right - 1)] ?? right : right;
      const win = `${sentProse}\n${rawText.slice(rawStart, rawEnd)}`;
      const hasSource =
        /\[\^?\d+\]/.test(win) ||
        /\]\([^)]+\)/.test(win) ||
        /https?:\/\//.test(win) ||
        /\([^()\n]{2,40},\s*(?:19|20)\d{2}[a-z]?\)/.test(win) ||
        /《[^》\n]{2,30}》/.test(win) ||
        /(?:见|参见|详见)\s*\[/.test(win) ||
        UNSOURCED_STAT_MEASUREMENT_RE.test(win);
      if (!hasSource) {
        hits.push({ index: m.index, length: m[0].length });
      }
    }
  }
  return hits;
}

/**
 * Compute an explainable 5-axis offline statistical & structural text profile.
 * Zero external dependencies; identical math in `src/core.mjs` and `src/dislop/engine.py`.
 */
export function analyzeTextProfile(text, { modality = "markdown", config = {} } = {}) {
  // Normalize CRLF -> LF for statistical calculations so Node and Python agree on Windows files
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const zones = buildZones(raw, modality, {
    proseFences: config?.proseFences,
    maskBlockquotes: config?.maskBlockquotes,
  });
  const prose = zones.proseLogical ?? zones.prose ?? "";
  const rawForProbes = zones.proseLogical ? prose : raw;
  const paras = extractProseParagraphs(prose, rawForProbes);
  const structBlocks = extractStructuredProseBlocks(prose, rawForProbes);
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

  const totalRawChars = codePointLength(raw.replace(/\s+/g, ""));
  const scannedChars =
    paras.reduce((acc, p) => acc + codePointLength(p.trimmed.replace(/\s+/g, "")), 0) +
    structBlocks.reduce((acc, b) => acc + codePointLength(b.trimmed.replace(/\s+/g, "")), 0);
  const proseCoverage =
    totalRawChars > 0 ? roundNonNeg(Math.min(1, scannedChars / totalRawChars), 2) : 1;

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
    const sc = (
      s.text
        .replace(/\([^)\n]*[;；][^)\n]*\)/g, " ")
        .replace(/（[^）\n]*[;；][^）\n]*）/g, " ")
        .match(/[;；]/g) || []
    ).length;
    const cc = (stripParentheticals(s.text.replace(/(\d),(\d{3})(?!\d)/g, "$1$2")).match(/[，,]/g) || []).length;
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
    proseCoverage,
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
      termConsistencySafe: concretenessStatus === "grounded" && coocHits === 0 && skelHits === 0,
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
    const staticDisabled = /(?<![A-Za-z0-9_-])disabled(?:\s*=\s*(?:""|"disabled"|'disabled'|"true"|'true'|\{true\}))?(?=[\s/>]|$)/i.test(attrs);
    const hasReason = /(?<![A-Za-z0-9_-])(?:title|aria-describedby|data-allow-disabled)\s*=/i.test(attrs);
    const isPagerAction =
      /(?:^|[\s_-])(?:prev|previous|next|first|last|pager|pagination|page-\d|step-\d|go\s+back|back\s+(?:page|to)|forward)(?=[\s_-]|$)|上一页|下一页|首页|末页|上一步|下一步/i.test(
        `${attrs.replace(/\bdata-[a-z0-9_-]*title\s*=\s*["'][^"']*["']/gi, "")} ${inner}`
      );
    const beforeTagCtx = clean.slice(Math.max(0, m.index - 220), m.index);
    const inPaginationContainer = /<(?:nav|div|ul|section)\b[^>]*\b(?:aria-label\s*=\s*["'][^"']*pagination|class(?:Name)?\s*=\s*["'][^"']*(?:pagination|pager))/i.test(beforeTagCtx) && !/<\/(?:nav|ul)\b/i.test(beforeTagCtx);
    const isPagerOrStepper = isPagerAction || inPaginationContainer;
    if (staticDisabled && !hasReason && !isPagerOrStepper) {
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
      if (h >= 235 && h <= 345 && s >= 45) purplePinkStops += 1;
    }
    const nearSlice = clean.slice(m.index, Math.min(clean.length, m.index + m[0].length + 120));
    const isClipText = /background-clip\s*:\s*text/i.test(nearSlice);
    if (purplePinkStops >= 2 || isClipText) {
      hits.push({ index: m.index, length: m[0].length });
    }
  }

  // 3. SVG <linearGradient> / <radialGradient> with >= 2 purple/indigo/pink stops
  const svgGradRe = /<(linearGradient|radialGradient)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  while ((m = svgGradRe.exec(clean)) !== null) {
    const body = m[2] || "";
    const colorTokens = body.match(/#[0-9a-fA-F]{3,6}\b|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)/gi) || [];
    let purplePinkStops = 0;
    for (const tok of colorTokens) {
      const rgb = parseColorRgb(tok);
      if (!rgb) continue;
      const [h, s] = rgbToHsl(rgb);
      if (h >= 235 && h <= 345 && s >= 45) purplePinkStops += 1;
    }
    if (purplePinkStops >= 2) {
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

  // Also detect pill-shaped <rect> elements inside inline <svg> posters/diagrams
  const svgRe = /<svg\b[^>]*>([\s\S]*?)<\/svg>/gi;
  while ((m = svgRe.exec(clean)) !== null) {
    const svgStart = m.index;
    const svgChunk = m[0];
    const rectRe = /<rect\b([^>]*)\/?>/gi;
    let rm;
    while ((rm = rectRe.exec(svgChunk)) !== null) {
      const attrs = rm[1] || "";
      const wm = attrs.match(/(?<![A-Za-z0-9_-])width\s*=\s*["']?(\d+(?:\.\d+)?)/i);
      const hm = attrs.match(/(?<![A-Za-z0-9_-])height\s*=\s*["']?(\d+(?:\.\d+)?)/i);
      const rxm = attrs.match(/(?<![A-Za-z0-9_-])r[xy]\s*=\s*["']?(\d+(?:\.\d+)?)/i);
      if (!wm || !hm || !rxm) continue;
      const w = Number(wm[1]);
      const h = Number(hm[1]);
      const rx = Number(rxm[1]);
      if (w >= 36 && h >= 14 && h <= 44 && w >= h * 1.5 && rx >= h * 0.35) {
        matches.push({ index: svgStart + rm.index, length: rm[0].length });
      }
    }
  }

  if (matches.length > maxPills) {
    matches.sort((a, b) => a.index - b.index);
    return [matches[0]];
  }
  return [];
}

function extractCssBoxClasses(rawText) {
  const boxClasses = new Set();
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let sm;
  while ((sm = styleRe.exec(rawText)) !== null) {
    const css = sm[1] || "";
    const ruleRe = /([^{}]+)\{([^{}]+)\}/g;
    let rm;
    while ((rm = ruleRe.exec(css)) !== null) {
      const sel = rm[1] || "";
      const decl = rm[2] || "";
      const hasBorderOrShadow =
        /(?:^|[;\s])(?:border|box-shadow)\s*:\s*(?!none\b|0\b)/i.test(decl) &&
        !/(?:^|[;\s])border\s*:\s*(?:none|0)\b/i.test(decl);
      const hasRadius = /(?:^|[;\s])border-radius\s*:\s*(?!0(?:px)?\b)/i.test(decl);
      const hasPad = /(?:^|[;\s])padding(?:-(?:top|right|bottom|left|inline|block))?\s*:\s*(?!0(?:px)?\b)/i.test(decl);
      if (hasBorderOrShadow && hasRadius && hasPad) {
        for (const clsMatch of sel.matchAll(/\.([A-Za-z_-][A-Za-z0-9_-]*)/g)) {
          boxClasses.add(clsMatch[1]);
        }
      }
    }
  }
  return boxClasses;
}

function probeUiBoxInBox(rawText) {
  const boxCssClasses = extractCssBoxClasses(rawText);
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
    const clsAttr = attrs.match(/\bclass(?:Name)?\s*=\s*["']([^"']+)["']/i);
    const hasCssBox = clsAttr ? clsAttr[1].split(/\s+/).some((c) => boxCssClasses.has(c)) : false;
    const hasBorderOrShadow =
      (/\b(?:border(?:-[a-z0-9]+)?|ring-1|shadow(?:-[a-z]+)?)\b|border\s*:/i.test(attrs)) &&
      !/\bborder-(?:t|b|l|r|0|none)\b/i.test(attrs);
    const hasRadius = /\brounded(?:-[a-z0-9]+)?\b|border-radius\s*:/i.test(attrs) && !/\brounded-none\b/.test(attrs);
    const hasPad = /\bp[xy]?-\d|padding\s*:/i.test(attrs);
    const isBox = hasCssBox || (hasBorderOrShadow && hasRadius && hasPad);
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

function maskUiVisualMarkup(rawText) {
  return String(rawText || "")
    .replace(/<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->/gi, preserveLinesBlank)
    .replace(/<!--[\s\S]*?-->/g, preserveLinesBlank)
    .replace(/\/\*[\s\S]*?\*\//g, preserveLinesBlank)
    .replace(/<(script|code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, preserveLinesBlank);
}

function probeUiGlowBlobChrome(rawText) {
  const clean = maskUiVisualMarkup(rawText);
  const hits = [];
  const seen = new Set();
  const pushHit = (index, length) => {
    const key = `${index}:${length}`;
    if (!seen.has(key)) {
      seen.add(key);
      hits.push({ index, length });
    }
  };

  // 1. Tailwind ambient blur orbs (blur-3xl / blur-[>=40px]) with rounded-full / neon tint / radial-gradient
  const tagBlurRe = /<[a-zA-Z][a-zA-Z0-9-]*\b[^>]*\b(?:blur-3xl|blur-\[(\d+)px\])[^>]*>/gi;
  let m;
  while ((m = tagBlurRe.exec(clean)) !== null) {
    const px = m[1] ? Number(m[1]) : 64;
    if (px < 40) continue;
    const tag = m[0];
    if (/\b(?:rounded-full|indigo-|purple-|violet-|pink-|fuchsia-|cyan-)\b|radial-gradient/i.test(tag)) {
      pushHit(m.index, tag.length);
    }
  }

  // 2. CSS filter: blur(>=40px) paired with circular / radial-gradient / neon tint
  const cssBlurRe = /filter\s*:\s*blur\(\s*(\d+)px\s*\)/gi;
  while ((m = cssBlurRe.exec(clean)) !== null) {
    if (Number(m[1]) < 40) continue;
    const winStart = Math.max(0, m.index - 220);
    const winEnd = Math.min(clean.length, m.index + m[0].length + 220);
    const ctx = clean.slice(winStart, winEnd);
    if (/border-radius\s*:\s*(?:50%|999\d*px)|radial-gradient|#[0-9a-fA-F]{6}/i.test(ctx)) {
      pushHit(m.index, m[0].length);
    }
  }

  // 3. Neon colored shadow glow (Tailwind or CSS box-shadow)
  const twShadowRe = /\bshadow-(?:indigo|purple|violet|pink|fuchsia|cyan)-[45]00(?:\/\d+)?\b/gi;
  while ((m = twShadowRe.exec(clean)) !== null) {
    pushHit(m.index, m[0].length);
  }
  const cssShadowRe = /box-shadow\s*:[^;\n]{0,160}/gi;
  while ((m = cssShadowRe.exec(clean)) !== null) {
    const decl = m[0];
    if (!/\b(?:1[5-9]|[2-9]\d)px\b/.test(decl)) continue;
    const colMatches = decl.match(/#[0-9a-fA-F]{3,6}\b|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}[^)]*\)/gi) || [];
    for (const cTok of colMatches) {
      const rgbMatch = cTok.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
      const rgb = rgbMatch ? [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])] : parseColorRgb(cTok);
      if (!rgb) continue;
      const [h, s] = rgbToHsl(rgb);
      if (s >= 55 && ((h >= 175 && h <= 210) || (h >= 245 && h <= 345))) {
        pushHit(m.index, decl.length);
        break;
      }
    }
  }

  // 4. Pulsing badge dot (`animate-ping` in `rounded-full`)
  const pingRe = /<[^>]*\banimate-ping\b[^>]*>/gi;
  while ((m = pingRe.exec(clean)) !== null) {
    const ctx = clean.slice(Math.max(0, m.index - 140), Math.min(clean.length, m.index + m[0].length + 140));
    if (/\brounded-full\b/.test(ctx)) {
      pushHit(m.index, m[0].length);
    }
  }

  // 5. SVG excessive glow / drop-shadow filters
  const svgRe = /<svg\b[^>]*>[\s\S]*?<\/svg>/gi;
  while ((m = svgRe.exec(clean)) !== null) {
    const svgBody = m[0];
    const blurTags = svgBody.match(/<(?:feGaussianBlur|feDropShadow)\b/gi) || [];
    const heavyBlur = /<(?:feGaussianBlur|feDropShadow)\b[^>]*\bstdDeviation\s*=\s*["']\s*(?:[89]|\d{2,})(?:\.\d+)?/i.test(svgBody);
    if (blurTags.length >= 2 || heavyBlur) {
      const firstFilter = svgBody.match(/<(?:feGaussianBlur|feDropShadow)\b[^>]*>/i);
      const idx = firstFilter ? m.index + svgBody.indexOf(firstFilter[0]) : m.index;
      const len = firstFilter ? firstFilter[0].length : 32;
      pushHit(idx, len);
    }
  }

  return hits;
}

function probeUiEmojiIconChrome(rawText) {
  const clean = maskUiVisualMarkup(rawText).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, preserveLinesBlank);
  const emojiClass = "[\\u{1F680}\\u2728\\u26A1\\u{1F525}\\u{1F4A1}\\u{1F3AF}\\u{1F6E1}\\u2699\\u{1F4C8}\\u{1F916}\\u{1F48E}\\u{1F31F}\\u{1F3A8}\\u{1F512}\\u{1F4CA}\\u{1F9E0}\\u{1F310}\\u{1F389}]\\uFE0F?";
  const tagRe = new RegExp(`<(h[1-4]|button|a|span|div|text)\\b[^>]*>[^<]{0,90}${emojiClass}[^<]{0,90}<\\/\\1>`, "giu");
  const matches = [];
  let m;
  while ((m = tagRe.exec(clean)) !== null) {
    matches.push({ index: m.index, length: m[0].length });
  }
  if (matches.length >= 3) {
    return [matches[0]];
  }
  return [];
}

function probeUiTemplateCardGrid(rawText) {
  const clean = maskUiVisualMarkup(rawText)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, preserveLinesBlank)
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, preserveLinesBlank);
  const hits = [];

  // 1. >= 3 tinted rounded-square icon tiles
  const tileRe = /<(div|span)\b([^>]*)>/gi;
  const tileHits = [];
  let m;
  while ((m = tileRe.exec(clean)) !== null) {
    const attrs = m[2] || "";
    const hasRound = /\brounded-(?:lg|xl|2xl)\b/.test(attrs);
    const hasSize =
      /\bsize-(?:8|9|10|11|12|14|16)\b/.test(attrs) ||
      (/\bw-(?:8|9|10|11|12|14|16)\b/.test(attrs) && /\bh-(?:8|9|10|11|12|14|16)\b/.test(attrs));
    const hasTint = /\bbg-(?:indigo|purple|violet|blue|pink|fuchsia|emerald|teal|cyan|amber|orange|rose)-(?:50|100|400\/\d+|500\/\d+|900\/\d+|950\/\d+)\b/.test(attrs);
    if (hasRound && hasSize && hasTint) {
      tileHits.push({ index: m.index, length: m[0].length });
    }
  }
  if (tileHits.length >= 3) {
    hits.push(tileHits[0]);
  }

  // 2. Fake macOS 3-dot traffic-light window chrome
  const dotRe = /<(?:span|div)\b[^>]*\brounded-full\b[^>]*\bbg-(red|rose|yellow|amber|green|emerald)-\d{2,3}\b[^>]*>(?:\s*<\/(?:span|div)>)?/gi;
  const dots = [];
  while ((m = dotRe.exec(clean)) !== null) {
    dots.push({ index: m.index, length: m[0].length, color: m[1].toLowerCase() });
  }
  for (let i = 0; i + 2 < dots.length; i += 1) {
    const a = dots[i];
    const b = dots[i + 1];
    const c = dots[i + 2];
    if (
      (a.color === "red" || a.color === "rose") &&
      (b.color === "yellow" || b.color === "amber") &&
      (c.color === "green" || c.color === "emerald") &&
      c.index - a.index <= 280
    ) {
      hits.push({ index: a.index, length: Math.min(120, c.index + c.length - a.index) });
      break;
    }
  }

  // 3. Sequential standalone zero-padded eyebrow kickers (`01`, `02`, `03`)
  // Exempt semantic ordered lists / navigation (`<ol>`, `role="list"`, `<nav>`) via tag nesting stack
  const VOID_HTML_TAGS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
  ]);
  const listAncestryRanges = [];
  const listTagStack = [];
  const tokListRe = /<\/?([a-zA-Z0-9-]+)\b([^>]*)\/?>/g;
  while ((m = tokListRe.exec(clean)) !== null) {
    const full = m[0];
    const tag = m[1].toLowerCase();
    const attrs = m[2] || "";
    const selfClose = full.endsWith("/>") || VOID_HTML_TAGS.has(tag);
    if (full.startsWith("</")) {
      for (let i = listTagStack.length - 1; i >= 0; i -= 1) {
        if (listTagStack[i].tag === tag) {
          const popped = listTagStack.splice(i);
          for (const item of popped) {
            if (item.isList) listAncestryRanges.push([item.start, m.index + full.length]);
          }
          break;
        }
      }
      continue;
    }
    const isListContainer =
      tag === "ol" ||
      tag === "nav" ||
      /(?<![A-Za-z0-9_-])role\s*=\s*["']list["']/i.test(attrs);
    if (!selfClose) {
      listTagStack.push({ tag, isList: isListContainer, start: m.index });
    }
  }
  for (const item of listTagStack) {
    if (item.isList) listAncestryRanges.push([item.start, clean.length]);
  }
  const inSemanticList = (idx) => listAncestryRanges.some(([s, e]) => idx >= s && idx <= e);

  const numTagRe = /<(span|div|p)\b[^>]*>\s*(0[1-9])\s*<\/\1>/gi;
  const seqTags = [];
  while ((m = numTagRe.exec(clean)) !== null) {
    if (inSemanticList(m.index)) continue;
    seqTags.push({ index: m.index, length: m[0].length, num: m[2] });
  }
  const seqNums = new Set(seqTags.map((t) => t.num));
  if (seqTags.length >= 3 && seqNums.has("01") && seqNums.has("02") && seqNums.has("03")) {
    hits.push({ index: seqTags[0].index, length: seqTags[0].length });
  }

  return hits;
}

function probeSvgLayoutSlop(rawText) {
  const clean = maskUiVisualMarkup(rawText).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, preserveLinesBlank);
  const hits = [];

  // 1. Non-icon <svg> missing viewBox
  const svgOpenRe = /<svg\b([^>]*)>/gi;
  let m;
  while ((m = svgOpenRe.exec(clean)) !== null) {
    const attrs = m[1] || "";
    if (/\bviewBox\s*=/i.test(attrs)) continue;
    const wm = attrs.match(/\bwidth\s*=\s*["']?(\d+(?:\.\d+)?)/i);
    const hm = attrs.match(/\bheight\s*=\s*["']?(\d+(?:\.\d+)?)/i);
    if (wm && hm && Number(wm[1]) >= 120 && Number(hm[1]) >= 80) {
      hits.push({ index: m.index, length: m[0].length });
    }
  }

  // 2. Overlapping <text x="..." y="..."> coordinates within the same <g> transform scope
  const svgTokRe = /<\/?(?:g|text)\b[^>]*>|[^<]+/gi;
  const gStack = [];
  const textsByGroup = new Map();
  let inText = false;
  let curTextInfo = null;
  let curTextBody = "";
  while ((m = svgTokRe.exec(clean)) !== null) {
    const tok = m[0];
    if (/^<g\b/i.test(tok)) {
      const tr = tok.match(/\btransform\s*=\s*["']([^"']+)["']/i);
      gStack.push(tr ? tr[1].trim() : "");
      continue;
    }
    if (/^<\/g>/i.test(tok)) {
      if (gStack.length > 0) gStack.pop();
      continue;
    }
    if (/^<text\b/i.test(tok)) {
      const xm = tok.match(/\bx\s*=\s*["']?(-?\d+(?:\.\d+)?)/i);
      const ym = tok.match(/\by\s*=\s*["']?(-?\d+(?:\.\d+)?)/i);
      if (xm && ym && !/\/>$/.test(tok)) {
        inText = true;
        curTextBody = "";
        curTextInfo = {
          index: m.index,
          length: tok.length,
          x: Number(xm[1]),
          y: Number(ym[1]),
          groupKey: gStack.filter(Boolean).join("|") || "root",
        };
      }
      continue;
    }
    if (/^<\/text>/i.test(tok)) {
      if (inText && curTextInfo && curTextBody.trim().length > 0) {
        const list = textsByGroup.get(curTextInfo.groupKey) || [];
        list.push(curTextInfo);
        textsByGroup.set(curTextInfo.groupKey, list);
      }
      inText = false;
      curTextInfo = null;
      continue;
    }
    if (inText) {
      curTextBody += tok.replace(/<[^>]+>/g, "");
    }
  }
  for (const list of textsByGroup.values()) {
    let foundOverlap = false;
    for (let i = 0; i < list.length && !foundOverlap; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (Math.abs(list[i].x - list[j].x) < 8 && Math.abs(list[i].y - list[j].y) < 8) {
          hits.push({ index: list[j].index, length: list[j].length });
          foundOverlap = true;
          break;
        }
      }
    }
  }

  // 3. >= 2 orphaned unused id="..." entries inside <defs>
  const defsRe = /<defs\b[^>]*>([\s\S]*?)<\/defs>/gi;
  while ((m = defsRe.exec(clean)) !== null) {
    const defsBody = m[1] || "";
    const outsideDefs = clean.slice(0, m.index) + clean.slice(m.index + m[0].length);
    const idMatches = [...defsBody.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)];
    let orphanCount = 0;
    for (const im of idMatches) {
      const defId = im[1];
      const escaped = defId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const usedRe = new RegExp(`#${escaped}(?![A-Za-z0-9_-])`);
      if (!usedRe.test(outsideDefs) && !usedRe.test(defsBody.replace(im[0], ""))) {
        orphanCount += 1;
      }
    }
    if (orphanCount >= 2) {
      hits.push({ index: m.index, length: Math.min(80, m[0].length) });
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

const META_MENTION_GUARD_RULES = new Set([
  "unsubstantiated-superlative",
  "reg-unsubstantiated-superlative",
  "false-certainty",
  "overclaiming",
  "unanchored-multiplier",
  "unsourced-attribution",
]);

function isMetaMentionHit(clauseSource, start, end, rule, breakIndices = null) {
  const fam = String(rule.family || "");
  const unprefixedId = String(rule.id || "").replace(/^(?:reg|eng|biz|ess|lit|exec|ui)-/, "");
  if (
    rule.category !== "lexicon" &&
    !fam.startsWith("lexicon/") &&
    !META_MENTION_GUARD_RULES.has(rule.id) &&
    !META_MENTION_GUARD_RULES.has(unprefixedId)
  ) {
    return false;
  }
  const s = String(clauseSource || "");
  let left = s.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  let right = s.indexOf("\n", end);
  if (right === -1) right = s.length;
  if (Array.isArray(breakIndices) && breakIndices.length > 0) {
    for (let bIdx = breakIndices.length - 1; bIdx >= 0; bIdx -= 1) {
      if (breakIndices[bIdx] < start) {
        left = Math.max(left, breakIndices[bIdx] + 1);
        break;
      }
    }
    for (let bIdx = 0; bIdx < breakIndices.length; bIdx += 1) {
      if (breakIndices[bIdx] >= end) {
        right = Math.min(right, breakIndices[bIdx]);
        break;
      }
    }
  } else {
    let p = start;
    while (p > left && !isSentenceBreakAt(s, p - 1)) p -= 1;
    left = p;
    p = end;
    while (p < right && !isSentenceBreakAt(s, p)) p += 1;
    right = p;
  }
  const clause = s.slice(left, right);

  const hasMetaCue =
    /(?:禁用|禁词|忌用|黑词|黑话|套话|套词|违禁|回避|勿用|避免(?:使用)?|替换为|改为|改成|改写|反例|原句|例句|示例|(?:这类|这种|这几个|等)(?:词|套话|套词|表达|说法)|(?:最好|尽量|切忌|千万)?(?:别用|不要用|少用|慎用|不用)|forbidden|banned|avoid|do\s+not\s+use|replace\s+with|instead\s+of|(?:phrases?|terms?|words?)\s+(?:like|such\s+as)|anti-pattern|clich[eé]|slop|buzzwords?|jargon|filler)/i.test(
      clause
    ) || /(?:^|\b)(?:FORBIDDEN|BANNED|DISALLOWED|BLOCKLIST|STOP_WORDS)\s*[:=]/i.test(clause);
  if (!hasMetaCue) return false;

  const quotePairs = [
    ['"', '"'],
    ["“", "”"],
    ["‘", "’"],
    ["「", "」"],
    ["『", "』"],
    ["`", "`"],
    ["'", "'"],
  ];
  const relStart = start - left;
  const relEnd = end - left;
  for (const [openQ, closeQ] of quotePairs) {
    const qOpen = clause.lastIndexOf(openQ, Math.max(0, relStart));
    if (qOpen === -1 || relStart - qOpen > 24) continue;
    const qClose = clause.indexOf(closeQ, relEnd);
    if (qClose === -1) continue;
    if (qClose - qOpen <= 48) {
      return true;
    }
  }
  return false;
}

function cleanMatchExcerpt(matchedRaw, modality, primaryZoneName) {
  let out = String(matchedRaw || "");
  if (primaryZoneName === "prose" && (modality === "html" || modality === "jsx" || modality === "svg")) {
    const noTags = out.replace(/<[^>]+>/g, " ");
    const decoded = noTags.replace(HTML_ENTITY_RE, (m, dec, hex) => decodeEntityToken(m, dec, hex) || m);
    const stripped = decodeXmlEntities(decoded).replace(/\s+/g, " ").trim();
    if (stripped) out = stripped;
  } else {
    out = out.replace(/\s+/g, " ").trim();
  }
  if (/^\*\*[^*]+$/.test(out)) out = out.slice(2).trim();
  if (/^[^*]+\*\*$/.test(out)) out = out.slice(0, -2).trim();
  return clipCodepoints(out, 140);
}

export function auditText(text, { filename = "<memory>", modality = null, pack, config = {}, allowSyntheticFixtures = false, register = null } = {}) {
  const mod = modality || detectModality(filename) || "markdown";
  const lineStarts = buildLineStarts(text);
  const zones = buildZones(text, mod, {
    proseFences: config?.proseFences,
    maskBlockquotes: config?.maskBlockquotes,
  });
  const { byTargetLine, directives } = parseSuppressions(text);
  const allowList = config?.allow || [];
  const cpPrefix = /[\uD800-\uDFFF]/.test(text) ? buildCodePointPrefix(text) : null;
  const textBreaks = buildSentenceBreakIndices(text);
  const rawProseMaskBreaks = zones.prose ? buildSentenceBreakIndices(zones.prose) : textBreaks;
  const regInfo = resolveRegister(text, { filename, flagRegister: register, config });
  const allowHtmlRulesInMixedMd = mod === "markdown" && hasEmbeddedUiMarkup(text);
  const mdUiZone = allowHtmlRulesInMixedMd ? maskMarkdownFences(text, new Set()).replace(/`[^`\n]+`/g, (m) => " ".repeat(m.length)) : null;
  const findings = [];

  for (const baseRule of pack.rules || []) {
    const directModMatch = !baseRule.modalities || baseRule.modalities.includes(mod);
    const mixedUiRule = !directModMatch && allowHtmlRulesInMixedMd && baseRule.modalities.includes("html");
    if (!directModMatch && !mixedUiRule) continue;

    const regApplied = applyRegisterOverride(baseRule, regInfo.register, config);
    if (regApplied.skip) {
      for (const d of directives) {
        if (!d.used && d.ruleIds.includes(baseRule.id)) {
          d.used = true;
        }
      }
      continue;
    }
    const rule = regApplied.rule;
    const registerAdjusted = regApplied.registerAdjusted;

    // Synthetic Office/Image/PDF fixture tokens ONLY during `dislop pack-test`
    if (
      allowSyntheticFixtures &&
      (text.startsWith("DOCX_") || text.startsWith("PPTX_") || text.startsWith("IMG_") || text.startsWith("PDF_"))
    ) {
      const synthHits = evaluateSyntheticBinaryFixture(text, rule, pack.thresholds || {});
      for (const h of synthHits) {
        findings.push(
          makeFinding({
            rule: h.severity ? { ...rule, severity: h.severity } : rule,
            filename,
            modality: mod,
            location: h.location,
            match: h.match,
            sentence: text,
            span: { start: 0, end: text.length },
            registerAdjusted,
          })
        );
      }
      continue;
    }

    let rawHits = [];
    const primaryZoneName = (rule.zones && rule.zones[0]) || "prose";
    const useLogicalProse = !mixedUiRule && primaryZoneName === "prose" && zones.proseLogical && zones.proseMap;
    const zoneText = mixedUiRule ? mdUiZone : (useLogicalProse ? zones.proseLogical : (zones[primaryZoneName] ?? zones.prose));
    const rawForProbes = useLogicalProse ? zoneText : text;

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
          while (len > 1 && zoneText.charCodeAt(idx) === 0xfeff) {
            idx += 1;
            len -= 1;
          }
          if (
            rule.id === "unfilled-placeholder" &&
            zoneText[idx] === "[" &&
            zoneText[idx + len - 1] === "]" &&
            /^(?:\(|\[|:)/.test(zoneText.slice(idx + len))
          ) {
            continue;
          }
          rawHits.push({ index: idx, length: len });
        }
      }
    } else if (rule.probe === "negation-pivot") {
      rawHits = probeNegationPivot(zoneText, rawForProbes);
    } else if (rule.probe === "staccato-run") {
      rawHits = probeStaccatoRun(zoneText, rawForProbes);
    } else if (rule.probe === "zh-four-char-triad") {
      rawHits = probeZhFourCharTriad(zoneText);
    } else if (rule.probe === "unsourced-attribution") {
      rawHits = probeUnsourcedAttribution(zoneText, rawForProbes);
    } else if (rule.probe === "bold-lead-list-wall") {
      rawHits = probeBoldLeadListWall(zoneText, rawForProbes, pack.thresholds?.boldLeadListRun || 4);
    } else if (rule.probe === "em-dash-density") {
      rawHits = probeEmDashDensity(zoneText, pack.thresholds?.maxEmDashesPer300Words || 4);
    } else if (rule.probe === "zh-halfwidth-punctuation") {
      rawHits = probeZhHalfwidthPunctuation(zoneText);
    } else if (rule.probe === "cooccurrence-slop-cluster") {
      rawHits = probeCooccurrenceSlopCluster(zoneText, rawForProbes);
    } else if (rule.probe === "semicolon-tricolon") {
      rawHits = probeSemicolonTricolon(zoneText, rawForProbes);
    } else if (rule.probe === "rhetorical-qa-cadence") {
      rawHits = probeRhetoricalQaCadence(zoneText, rawForProbes);
    } else if (rule.probe === "comma-chain-runon") {
      rawHits = probeCommaChainRunon(zoneText, rawForProbes);
    } else if (rule.probe === "narrative-sandwich-frame") {
      rawHits = probeNarrativeSandwichFrame(zoneText, rawForProbes);
    } else if (rule.probe === "template-skeleton-echo") {
      rawHits = probeTemplateSkeletonEcho(zoneText, rawForProbes);
    } else if (rule.probe === "low-burstiness-vapor") {
      rawHits = probeLowBurstinessVapor(zoneText, rawForProbes);
    } else if (rule.probe === "unanchored-multiplier") {
      rawHits = probeUnanchoredMultiplier(zoneText, rawForProbes);
    } else if (rule.probe === "zh-dev-jargon") {
      rawHits = probeZhDevJargon(zoneText, rawForProbes);
    } else if (rule.probe === "zh-exclamation") {
      rawHits = probeZhExclamation(zoneText, rawForProbes);
    } else if (rule.probe === "zh-mega-sentence") {
      rawHits = probeZhMegaSentence(zoneText, rawForProbes);
    } else if (rule.probe === "unsourced-statistic") {
      rawHits = probeUnsourcedStatistic(zoneText, text, useLogicalProse ? zones.proseMap : null);
    } else if (rule.probe === "ui-dead-control") {
      rawHits = probeUiDeadControl(text);
    } else if (rule.probe === "ui-ai-gradient") {
      rawHits = probeUiAiGradient(text);
    } else if (rule.probe === "ui-pill-soup") {
      rawHits = probeUiPillSoup(text, pack.thresholds?.maxPillsPerFile || 6);
    } else if (rule.probe === "ui-box-in-box") {
      rawHits = probeUiBoxInBox(text);
    } else if (rule.probe === "ui-glow-blob-chrome") {
      rawHits = probeUiGlowBlobChrome(text);
    } else if (rule.probe === "ui-emoji-icon-chrome") {
      rawHits = probeUiEmojiIconChrome(text);
    } else if (rule.probe === "ui-template-card-grid") {
      rawHits = probeUiTemplateCardGrid(text);
    } else if (rule.probe === "svg-layout-slop") {
      rawHits = probeSvgLayoutSlop(text);
    }

    // Sort and deduplicate overlapping spans emitted by multiple patterns of the same rule
    if (useLogicalProse) {
      rawHits = rawHits.map((h) => {
        const sIdx = zones.proseMap.starts[h.index] ?? h.index;
        const eIdx = zones.proseMap.ends[Math.max(h.index, h.index + h.length - 1)] ?? h.index + h.length;
        return { ...h, index: sIdx, length: Math.max(1, eIdx - sIdx) };
      });
    }
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
      const matchedDisplay = cleanMatchExcerpt(matchedRaw, mod, primaryZoneName);
      if (isAllowedMatch(matchedRaw, allowList) || isAllowedMatch(matchedDisplay, allowList)) continue;
      const mentionSrc = primaryZoneName === "prose" ? zones.prose : text;
      const mentionBreaks = primaryZoneName === "prose" ? rawProseMaskBreaks : textBreaks;
      if (isMetaMentionHit(mentionSrc, start, end, rule, mentionBreaks)) continue;

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

      const sentence = enclosingSentence(text, start, end, textBreaks);
      const keepSentence = enclosingSentenceUnclipped(text, start, end);
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
          match: cleanMatchExcerpt(matchedRaw, mod, primaryZoneName),
          sentence,
          keepSentence,
          registerAdjusted,
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
  const jargonRanges = findings
    .filter((f) => f.ruleId === "zh-dev-jargon" && f.span)
    .map((f) => f.span);
  const filteredFindings = jargonRanges.length > 0
    ? findings.filter(
        (f) =>
          f.ruleId !== "zh-bureaucratic-padding" ||
          !f.span ||
          !jargonRanges.some((j) => f.span.start >= j.start - 2 && f.span.end <= j.end + 2)
      )
    : findings;
  return { findings: filteredFindings, unusedSuppressions };
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
  if (rule.probe === "image-ai-workflow-residue") {
    if (fixture.startsWith("IMG_WORKFLOW:")) {
      return [{ location: "metadata", match: fixture.slice("IMG_WORKFLOW:".length), severity: "warning" }];
    }
    if (fixture.startsWith("IMG_PROVENANCE:")) {
      return [{ location: "metadata", match: fixture.slice("IMG_PROVENANCE:".length), severity: "info" }];
    }
  }
  if (rule.probe === "image-ai-palette-slop") {
    if (fixture.startsWith("IMG_NEON_PALETTE:") || fixture.startsWith("IMG_PLASTIC:")) {
      return [{ location: "pixels", match: fixture.split(":")[1] || "synthetic-palette" }];
    }
  }
  if (rule.probe === "pdf-visual-layout-slop") {
    if (
      fixture.startsWith("PDF_RASTER_DECK:") ||
      fixture.startsWith("PDF_FLAT_TYPE:") ||
      fixture.startsWith("PDF_MONOTONY:")
    ) {
      return [{ location: "page 1", match: fixture.split(":")[1] || "pdf-layout" }];
    }
  }
  return [];
}

const DELETE_STRATEGY_IDS = new Set([
  "chatbot-artifact",
  "markdown-leak",
  "ui-prompt-echo-badge",
  "ui-dead-control",
  "throat-clearing-opener",
  "closing-platitude",
]);

const NEED_SOURCE_STRATEGY_IDS = new Set([
  "unfilled-placeholder",
  "unsourced-attribution",
  "unsourced-statistic",
  "reg-unsubstantiated-superlative",
  "reg-unqualified-guarantee",
]);

export function deriveFixStrategy(rule) {
  if (rule?.fixStrategy) return rule.fixStrategy;
  const id = String(rule?.id || rule?.ruleId || "").trim();
  const fam = String(rule?.family || "").trim();
  if (DELETE_STRATEGY_IDS.has(id) || fam === "hygiene/chat-residue") return "delete";
  if (
    NEED_SOURCE_STRATEGY_IDS.has(id) ||
    fam.startsWith("evidence/") ||
    fam.startsWith("hygiene/placeholder")
  ) {
    return "need-source";
  }
  if (
    id.startsWith("ui-") ||
    id.startsWith("slide-") ||
    id.startsWith("pdf-") ||
    id.startsWith("img-") ||
    id.startsWith("docx-") ||
    fam.startsWith("design/") ||
    fam.startsWith("visual/")
  ) {
    return "unwrap-layout";
  }
  return "rephrase";
}

const HIGH_CONF_PROBES = new Set([
  "office-markdown-leak",
  "ui-dead-control",
  "slide-word-wall",
  "slide-bullet-overload",
  "slide-autofit-shrink",
  "zh-halfwidth-punctuation",
]);
const HIGH_CONF_RULES = new Set(["unfilled-placeholder", "chatbot-artifact", "local-custom-forbid"]);
const LOW_CONF_RULES = new Set(["pocket-stealth-vapor", "low-burstiness-vapor"]);
const DELETE_KIND_RULES = new Set([
  "en-throat-clearing-opener",
  "zh-bureaucratic-padding",
  "zh-essay-moralizing-ending",
  "en-essay-moralizing-ending",
  "chatbot-artifact",
]);
const RESTRUCTURE_PROBES = new Set([
  "staccato-run",
  "bold-lead-list-wall",
  "semicolon-tricolon",
  "rhetorical-qa-cadence",
  "comma-chain-runon",
  "narrative-sandwich-frame",
  "template-skeleton-echo",
  "low-burstiness-vapor",
  "slide-word-wall",
  "slide-bullet-overload",
  "slide-autofit-shrink",
  "pptx-layout-monotony",
  "ui-box-in-box",
  "ui-pill-soup",
  "ui-dead-control",
]);
const DOCUMENT_SCOPE_PROBES = new Set(["template-skeleton-echo", "low-burstiness-vapor", "em-dash-density"]);
const DOCUMENT_SCOPE_RULES = new Set([
  "pptx-layout-monotony",
  "low-burstiness-vapor",
  "template-skeleton-echo",
  "excessive-em-dash-density",
]);
const PARAGRAPH_SCOPE_PROBES = new Set(["bold-lead-list-wall", "narrative-sandwich-frame", "staccato-run"]);
const SPAN_SCOPE_RULES = new Set([
  "unfilled-placeholder",
  "local-custom-forbid",
  "zh-halfwidth-punctuation",
  "en-cliche-lexicon",
  "reg-unsubstantiated-superlative",
]);

export function computeFindingConfidence({ ruleId, tier = "taste", severity = "warning", probe = "", registerAdjusted = false }) {
  if (tier === "invariant" || HIGH_CONF_PROBES.has(probe) || HIGH_CONF_RULES.has(ruleId)) {
    return "high";
  }
  if (severity === "info" || LOW_CONF_RULES.has(ruleId) || registerAdjusted) {
    return "low";
  }
  return "medium";
}

export function buildFindingRevision({
  ruleId = "",
  tier = "taste",
  family = "",
  probe = "",
  modality = "markdown",
  message = null,
  deletionTest = null,
  sentence = "",
  revisionKind = null,
  revisionScope = null,
  revisionAvoid = null,
  fixStrategy = null,
}) {
  let kind = revisionKind || "rewrite";
  if (!revisionKind) {
    if (DELETE_KIND_RULES.has(ruleId)) {
      kind = "delete";
    } else if (
      RESTRUCTURE_PROBES.has(probe) ||
      ruleId === "pocket-stealth-vapor" ||
      String(family).startsWith("layout/") ||
      String(family).startsWith("ui/") ||
      String(family).startsWith("statistics/")
    ) {
      kind = "restructure";
    }
  }

  let scope = revisionScope || "sentence";
  if (!revisionScope) {
    if (DOCUMENT_SCOPE_PROBES.has(probe) || DOCUMENT_SCOPE_RULES.has(ruleId)) {
      scope = "document";
    } else if (
      (modality === "html" || modality === "jsx" || modality === "css" || modality === "svg" || modality === "pptx" || modality === "docx") &&
      (String(probe).startsWith("ui-") ||
        String(probe).startsWith("slide-") ||
        probe === "office-markdown-leak" ||
        probe === "pptx-layout-monotony" ||
        ruleId === "ui-prompt-echo-badge" ||
        ruleId === "markdown-leak")
    ) {
      scope = "element";
    } else if (ruleId === "pocket-stealth-vapor" || PARAGRAPH_SCOPE_PROBES.has(probe)) {
      scope = "paragraph";
    } else if (SPAN_SCOPE_RULES.has(ruleId)) {
      scope = "span";
    }
  }

  const effStrategy = fixStrategy || deriveFixStrategy({ id: ruleId, family });
  let repairTier = "guarded-fix";
  if (effStrategy === "need-source" || kind === "ask" || DOCUMENT_SCOPE_PROBES.has(probe) || DOCUMENT_SCOPE_RULES.has(ruleId)) {
    repairTier = "diagnostic-only";
  } else if (tier === "invariant" && (effStrategy === "delete" || ruleId === "markdown-leak")) {
    repairTier = "safe-fix";
  }
  const doNotAutoEdit = repairTier === "diagnostic-only";

  const instrSrc = deletionTest || message || {};
  const instruction = {
    en: String(instrSrc.en || message?.en || ""),
    zh: String(instrSrc.zh || message?.zh || instrSrc.en || message?.en || ""),
  };

  const keep = [];
  if (sentence && modality !== "css") {
    const seen = new Set();
    for (const fact of extractProtectedFacts(sentence, { modality, keepMode: true })) {
      const r = String(fact.raw || "").trim();
      if (!r || seen.has(r)) continue;
      seen.add(r);
      keep.push(r);
      if (keep.length >= 20) break;
    }
  }

  let avoid;
  if (revisionAvoid && (revisionAvoid.en || revisionAvoid.zh)) {
    avoid = {
      en: String(revisionAvoid.en || revisionAvoid.zh || ""),
      zh: String(revisionAvoid.zh || revisionAvoid.en || ""),
    };
  } else if (probe === "negation-pivot" || String(ruleId).includes("negation-pivot")) {
    avoid = {
      en: "Do not trade one 'Not X, but Y' slogan for a shorter aphorism or staccato tagline.",
      zh: "不要把“不是 A，而是 B”的套话置换成另一句短金句或断句口号。",
    };
  } else if (kind === "delete") {
    avoid = {
      en: "Do not rephrase the filler wrapper; delete it while keeping every concrete number, date, and name in the sentence.",
      zh: "不要把废话外壳换个说法留着，直接删掉并完整保留句中的数字、时间和实体名。",
    };
  } else if (kind === "restructure") {
    avoid = {
      en: "Do not compress away concrete facts or invent new numbers while fixing cadence or layout.",
      zh: "调整结构与节奏时不要删掉具体事实，也不要凭空编造原文没有的数字。",
    };
  } else {
    avoid = {
      en: "Do not invent unstated numbers, alter inequality bounds, or swap in another cliche phrase.",
      zh: "改写时不要编造未给出的指标、更改数值边界，或换成另一种高频套话。",
    };
  }

  return { kind, scope, repairTier, doNotAutoEdit, instruction, keep, mustPreserve: keep, avoid };
}

export function makeFinding({
  rule,
  filename,
  modality,
  location,
  line = 1,
  col = 1,
  span = null,
  match,
  sentence = "",
  keepSentence = null,
  registerAdjusted = false,
}) {
  const normMatch = String(match || "").toLowerCase().trim();
  const normSent = String(sentence || normMatch).toLowerCase().replace(/\s+/g, " ").trim();
  const fingerprint = `${rule.id}:${fnv1aHex(`${rule.id}|${normMatch}|${normSent}`)}`;
  const tier = rule.tier || "taste";
  const severity = rule.severity || "warning";
  const family = rule.family || "general";
  const probe = rule.probe || "";
  const fixStrategy = deriveFixStrategy(rule);
  const confidence = computeFindingConfidence({ ruleId: rule.id, tier, severity, probe, registerAdjusted });
  const revision = buildFindingRevision({
    ruleId: rule.id,
    tier,
    family,
    probe,
    modality,
    message: rule.message,
    deletionTest: rule.deletionTest || null,
    sentence: keepSentence !== null && keepSentence !== undefined ? keepSentence : sentence,
    revisionKind: rule.revisionKind || null,
    revisionScope: rule.revisionScope || null,
    revisionAvoid: rule.revisionAvoid || null,
    fixStrategy,
  });
  return {
    fingerprint,
    ruleId: rule.id,
    tier,
    severity,
    confidence,
    fixStrategy,
    family,
    file: filename,
    modality,
    location,
    line,
    col,
    span,
    match,
    message: rule.message,
    deletionTest: rule.deletionTest || null,
    revision,
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
export function auditOoxmlEntries(entries, { filename, modality, pack, config = {}, register = null }) {
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

      if (mdLeakRule && (/\*\*[^*\n]{1,80}\*\*/.test(paraText) || /^#{1,6}[ \t]+\S/.test(paraText))) {
        findings.push(makeFinding({ rule: mdLeakRule, filename, modality, location: `para ${paraIndex}`, line: paraIndex, match: paraText.slice(0, 100) }));
      }

      const sub = auditText(paraText, { filename, modality: "markdown", pack, config, register });
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
      if (mdLeakRule && (/\*\*[^*\n]{1,80}\*\*/.test(fullSlideText) || /^#{1,6}[ \t]+\S/m.test(fullSlideText))) {
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
      const sub = auditText(fullSlideText, { filename, modality: "markdown", pack, config, register });
      for (const f of sub.findings) {
        if (isHidden && f.severity !== "error") continue;
        findings.push({ ...f, modality: "pptx", location: `slide ${slideNum}`, line: slideNum });
      }
    });

    return { findings, skipped };
  }

  return { findings, skipped };
}

/**
 * Audit parsed PNG/JPEG/WebP metadata & pixel heuristics for AI workflow leaks and template palette/plastic slop.
 */
export function auditImageDocument(parsedImage, { filename, pack, config = {} } = {}) {
  const findings = [];
  const skipped = [];
  if (!parsedImage || !parsedImage.format) {
    return { findings, skipped: [{ file: filename, reason: "Unparseable image metadata" }] };
  }
  const allowList = config?.allow || [];
  const rulesById = new Map((pack.rules || []).map((r) => [r.id, r]));

  const wfRule = rulesById.get("image-ai-workflow-residue");
  if (wfRule) {
    const metaTexts = parsedImage.metadataTexts || [];
    const workflowMatches = [];
    const provenanceMatches = [];
    for (const item of metaTexts) {
      const key = String(item.key || "").trim();
      const val = String(item.value || "");
      const combined = `${key}: ${val}`;
      if (isAllowedMatch(combined, allowList)) continue;
      if (
        /^(?:parameters|prompt|workflow|generation_data)$/i.test(key) ||
        /(?:Negative prompt:|Steps:\s*\d+\s*,\s*Sampler:|CFG scale:\s*\d|"class_type"\s*:\s*"(?:KSampler|CheckpointLoaderSimple|CLIPTextEncode)")/i.test(val)
      ) {
        workflowMatches.push(clipCodepoints(`${key || "chunk"}: ${val.replace(/\s+/g, " ").trim()}`, 120));
      } else if (
        /(?:trainedAlgorithmicMedia|c2pa|Midjourney|DALL-E|Adobe Firefly|Stable Diffusion|ComfyUI|AUTOMATIC1111|Flux\.1|Ideogram|Recraft)/i.test(combined)
      ) {
        provenanceMatches.push(clipCodepoints(`${key || "tag"}: ${val.replace(/\s+/g, " ").trim()}`, 120));
      }
    }
    if (workflowMatches.length > 0) {
      findings.push(
        makeFinding({
          rule: { ...wfRule, severity: "warning" },
          filename,
          modality: "image",
          location: "metadata",
          line: 1,
          match: workflowMatches[0],
        })
      );
    } else if (parsedImage.hasC2pa || provenanceMatches.length > 0) {
      findings.push(
        makeFinding({
          rule: { ...wfRule, severity: "info" },
          filename,
          modality: "image",
          location: "metadata",
          line: 1,
          match: provenanceMatches[0] || "C2PA / AI provenance manifest present",
        })
      );
    }
  }

  const palRule = rulesById.get("image-ai-palette-slop");
  const pm = parsedImage.pixelMetrics;
  if (palRule && pm && parsedImage.width >= 64 && parsedImage.height >= 64) {
    const isNeonPurple =
      (pm.neonPurpleRatio >= 0.16 && pm.neutralRatio < 0.75) ||
      (pm.darkBgRatio >= 0.35 && pm.neonPurpleRatio + pm.neonCyanRatio >= 0.14 && pm.neonPurpleRatio >= 0.06);
    const isPlastic = pm.highSatRatio >= 0.38 && pm.smoothHighSatRatio >= 0.65;
    if (isNeonPurple || isPlastic) {
      const reasons = [];
      if (isNeonPurple) {
        reasons.push(`neonPurple=${Math.round(pm.neonPurpleRatio * 100)}%`);
        if (pm.darkBgRatio >= 0.35) reasons.push(`darkBg=${Math.round(pm.darkBgRatio * 100)}%`);
      }
      if (isPlastic) {
        reasons.push(`highSat=${Math.round(pm.highSatRatio * 100)}%`);
        reasons.push(`smooth=${Math.round(pm.smoothHighSatRatio * 100)}%`);
      }
      findings.push(
        makeFinding({
          rule: palRule,
          filename,
          modality: "image",
          location: "pixels",
          line: 1,
          match: `${parsedImage.width}x${parsedImage.height} (${reasons.join(", ")})`,
        })
      );
    }
  }

  return { findings, skipped };
}

/**
 * Audit parsed PDF visual layout, landscape slide density, RGB shading slop, and embedded text artifacts.
 */
export function auditPdfDocument(parsedPdf, { filename, pack, config = {}, register = null } = {}) {
  const findings = [];
  const skipped = [];
  if (!parsedPdf) {
    return { findings, skipped: [{ file: filename, reason: "Unparseable PDF file" }] };
  }
  if (parsedPdf.encrypted) {
    return { findings, skipped: [{ file: filename, reason: "Encrypted PDF cannot be audited offline" }] };
  }
  const pages = parsedPdf.pages || [];
  if (pages.length === 0) {
    return { findings, skipped: [{ file: filename, reason: "Missing page objects inside PDF" }] };
  }

  const rulesById = new Map((pack.rules || []).map((r) => [r.id, r]));
  const thresholds = pack.thresholds || {};
  const mdLeakRule = rulesById.get("markdown-leak");
  const wordWallRule = rulesById.get("slide-word-wall");
  const gradientRule = rulesById.get("ui-ai-gradient");
  const pdfLayoutRule = rulesById.get("pdf-visual-layout-slop");

  let rasterOnlyLandscapeCount = 0;
  let prevSig = null;
  let monoRun = 0;
  let monoEmitted = false;

  for (const p of pages) {
    const pageNum = p.pageNum || 1;
    const text = p.text || "";
    const cjkChars = (text.match(/[\u4e00-\u9fff]/gu) || []).length;
    const latinWords = text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

    if (mdLeakRule && (/\*\*[^*\n]{1,80}\*\*/.test(text) || /^#{1,6}[ \t]+\S/m.test(text))) {
      findings.push(
        makeFinding({
          rule: mdLeakRule,
          filename,
          modality: "pdf",
          location: `page ${pageNum}`,
          line: pageNum,
          match: clipCodepoints(text.replace(/\s+/g, " ").trim(), 100),
        })
      );
    }

    if (p.isLandscape && wordWallRule) {
      const maxWords = thresholds.maxSlideWords || 120;
      const maxZh = thresholds.maxSlideCharsZh || 280;
      if (latinWords > maxWords || cjkChars > maxZh) {
        findings.push(
          makeFinding({
            rule: wordWallRule,
            filename,
            modality: "pdf",
            location: `page ${pageNum}`,
            line: pageNum,
            match: `${latinWords} words / ${cjkChars} CJK chars`,
          })
        );
      }
    }

    if (gradientRule && Array.isArray(p.rgbColors) && p.rgbColors.length > 0) {
      const purpleKeys = new Set();
      for (const rgb of p.rgbColors) {
        const [h, s] = rgbToHsl(rgb);
        if (h >= 235 && h <= 345 && s >= 45) {
          purpleKeys.add(`${Math.floor(rgb[0] / 16)},${Math.floor(rgb[1] / 16)},${Math.floor(rgb[2] / 16)}`);
        }
      }
      if (purpleKeys.size >= 2) {
        findings.push(
          makeFinding({
            rule: gradientRule,
            filename,
            modality: "pdf",
            location: `page ${pageNum}`,
            line: pageNum,
            match: `${purpleKeys.size} neon purple-pink RGB fills/shadings`,
          })
        );
      }
    }

    if (pdfLayoutRule) {
      if (p.isLandscape && (p.textOpCount || 0) === 0 && (p.imageCount || 0) >= 1) {
        rasterOnlyLandscapeCount += 1;
      }

      if (p.isLandscape && (latinWords >= 40 || cjkChars >= 90) && Array.isArray(p.fontSizes) && p.fontSizes.length >= 4) {
        let minF = p.fontSizes[0];
        let maxF = p.fontSizes[0];
        for (let fi = 1; fi < p.fontSizes.length; fi += 1) {
          const fv = p.fontSizes[fi];
          if (fv < minF) minF = fv;
          if (fv > maxF) maxF = fv;
        }
        if (minF > 0 && (maxF / minF < 1.2 || (p.width >= 500 && minF < 9.5))) {
          findings.push(
            makeFinding({
              rule: pdfLayoutRule,
              filename,
              modality: "pdf",
              location: `page ${pageNum}`,
              line: pageNum,
              match: `font hierarchy collapsed (min=${minF}pt, max=${maxF}pt, words=${latinWords})`,
            })
          );
        }
      }

      if (pages.length >= 5) {
        const isPlainTextSlide =
          p.isLandscape &&
          (p.imageCount || 0) === 0 &&
          (latinWords > 8 || cjkChars > 16) &&
          Array.isArray(p.fontSizes) &&
          p.fontSizes.length > 0;
        let pMin = Infinity;
        let pMax = -Infinity;
        if (isPlainTextSlide) {
          for (const fv of p.fontSizes) {
            if (fv < pMin) pMin = fv;
            if (fv > pMax) pMax = fv;
          }
        }
        const sig = isPlainTextSlide
          ? `f:${Math.floor(pMin + 0.5)}-${Math.floor(pMax + 0.5)}|w:${latinWords >= 25 || cjkChars >= 50 ? 2 : 1}`
          : null;
        if (sig && sig === prevSig) {
          monoRun += 1;
        } else {
          prevSig = sig;
          monoRun = sig ? 1 : 0;
        }
        if (!monoEmitted && monoRun >= (thresholds.maxIdenticalSlideRun || 4)) {
          monoEmitted = true;
          findings.push(
            makeFinding({
              rule: pdfLayoutRule,
              filename,
              modality: "pdf",
              location: `page ${pageNum}`,
              line: pageNum,
              match: `${monoRun} consecutive identical plain-text landscape PDF pages (${sig})`,
            })
          );
        }
      }
    }

    if (text.trim()) {
      const sub = auditText(text, { filename, modality: "markdown", pack, config, register });
      for (const f of sub.findings) {
        if (f.ruleId === "markdown-leak") continue;
        findings.push({ ...f, modality: "pdf", location: `page ${pageNum}`, line: pageNum });
      }
    }
  }

  if (pdfLayoutRule && pages.length >= 2 && rasterOnlyLandscapeCount >= 2) {
    findings.push(
      makeFinding({
        rule: pdfLayoutRule,
        filename,
        modality: "pdf",
        location: "page 1",
        line: 1,
        match: `${rasterOnlyLandscapeCount} raster-only landscape pages with zero selectable text`,
      })
    );
  }

  const coverageWarnings = [];
  const unreadablePages = [];
  for (const p of pages) {
    const emptyText = !(p.text || "").trim();
    const isRasterSlide = p.isLandscape && (p.textOpCount || 0) === 0 && (p.imageCount || 0) >= 1;
    if (emptyText && !isRasterSlide && (p.hasFonts || parsedPdf.hasFonts || parsedPdf.hasCompressedStreams || (p.fontSizes?.length || 0) > 0)) {
      unreadablePages.push(p.pageNum || 1);
    }
  }
  if (unreadablePages.length > 0 && !(rasterOnlyLandscapeCount >= 2 && unreadablePages.length === pages.length)) {
    coverageWarnings.push({
      file: filename,
      code: "unreadable-pdf-text",
      pages: unreadablePages,
      message: `PDF contains fonts or streams on page(s) ${unreadablePages.join(", ")} with 0 selectable characters extracted; inspect visually or via pdftotext.`,
    });
  }

  findings.sort((a, b) => (a.line || 0) - (b.line || 0) || (a.col || 0) - (b.col || 0));
  return { findings, skipped, coverageWarnings };
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

export function ruleDocUrl(item, lang = "en") {
  const ruleId = String(item?.ruleId || item?.id || "");
  const source = item?.source || "";
  const packId = item?.packId || "";
  const isZh = lang === "zh" || ruleId.startsWith("zh-");
  const base = isZh ? "https://dislop.com/zh/rules/" : "https://dislop.com/rules/";
  if (!ruleId || source === "pattern-library" || packId === "pocket-model") {
    return base;
  }
  return `${base}${ruleId}/`;
}

function cleanAgentText(s, maxLen) {
  return clipCodepoints(String(s || "").replace(/\s+/g, " ").trim(), maxLen);
}

function localizeSkipReason(reason, lang = "en") {
  const r = String(reason || "");
  if (lang !== "zh") return r;
  const m = r.match(/^Unsupported file extension '(.*)'$/);
  if (m) return `不支持的文件扩展名 '${m[1]}'`;
  if (r === "File not found") return "文件不存在";
  if (r.startsWith("Non-UTF-8 text encoding")) return "非 UTF-8 编码文本，请转换为 UTF-8 后检查";
  if (r.startsWith("File exceeds 25 MB")) return "文件超过 25 MB 单文件检查上限";
  if (r === "Missing word/document.xml inside DOCX archive") return "DOCX 归档缺少正文文件 word/document.xml";
  if (r === "Missing ppt/slides/*.xml inside PPTX archive") return "PPTX 归档缺少幻灯片文件 ppt/slides/*.xml";
  if (r.startsWith("Uninspectable ")) return `无法解析的文档归档：${r.replace(/^Uninspectable\s+/, "")}`;
  return r;
}

export function formatAgentReport(report, lang = "en", options = {}) {
  const { findings = [], checkedCount = 0, skipped = [], unusedSuppressions = [] } = report;
  const quiet = Boolean(options?.quiet);
  const failOn = options?.failOn || "error";
  const minRank = SEVERITY_RANK[failOn] || SEVERITY_RANK.error;
  const visible = quiet
    ? findings.filter((f) => (SEVERITY_RANK[f.severity] || 1) >= minRank)
    : findings;

  if (quiet && visible.length === 0 && unusedSuppressions.length === 0 && skipped.length === 0) {
    return "";
  }

  const out = [];
  const ver = report.version || ENGINE_VERSION;
  if (visible.length === 0 && unusedSuppressions.length === 0 && skipped.length > 0) {
    out.push(
      lang === "zh"
        ? `dislop ${ver}: 未完成（已检 ${checkedCount} 项、跳过 ${skipped.length} 项）`
        : `dislop ${ver}: skipped (checked=${checkedCount}, skipped=${skipped.length})`
    );
  } else if (visible.length === 0 && unusedSuppressions.length === 0) {
    if (!quiet) {
      out.push(
        lang === "zh"
          ? `dislop ${ver}: 通过（已检 ${checkedCount} 项、0 处命中）`
          : `dislop ${ver}: ok (checked=${checkedCount}, findings=0)`
      );
    }
  } else {
    const errCount = visible.filter((f) => f.severity === "error").length;
    const warnCount = visible.filter((f) => f.severity === "warning").length;
    const infoCount = visible.filter((f) => f.severity === "info").length;
    const reg = report.context?.register || "unspecified";
    const regSource = report.context?.registerSource || "default";

    if (lang === "zh") {
      const regZhMap = {
        unspecified: "未指定",
        official: "公文",
        casual: "随笔/口语",
        argumentative: "议论",
        technical: "技术文档",
        marketing: "营销",
        narrative: "叙事",
        mixed: "混合",
      };
      const srcZhMap = { flag: "参数", frontmatter: "前言", config: "配置", default: "默认", mixed: "多来源" };
      out.push(
        `dislop ${ver}: 已检=${checkedCount} 问题=${visible.length}（硬伤=${errCount}、提醒=${warnCount}、提示=${infoCount}） 语体=${regZhMap[reg] || reg}·${srcZhMap[regSource] || regSource}`
      );
    } else {
      out.push(
        `dislop ${ver}: checked=${checkedCount} findings=${visible.length} (error=${errCount}, warning=${warnCount}, info=${infoCount}) register=${reg}(${regSource})`
      );
    }

    const sorted = [...visible].sort((a, b) => {
      const rDiff = (SEVERITY_RANK[b.severity] || 1) - (SEVERITY_RANK[a.severity] || 1);
      if (rDiff !== 0) return rDiff;
      const fa = String(a.file || "");
      const fb = String(b.file || "");
      if (fa !== fb) return fa < fb ? -1 : 1;
      const lDiff = (a.line || 0) - (b.line || 0);
      if (lDiff !== 0) return lDiff;
      const cDiff = (a.col || 0) - (b.col || 0);
      if (cDiff !== 0) return cDiff;
      const ra = String(a.ruleId || "");
      const rb = String(b.ruleId || "");
      return ra === rb ? 0 : ra < rb ? -1 : 1;
    });

    const AGENT_MAX = 30;
    const shown = sorted.slice(0, AGENT_MAX);
    const sevZhMap = { error: "硬伤", warning: "提醒", info: "提示" };
    const confZhMap = { high: "高", medium: "中", low: "低" };
    const kindZhMap = { delete: "删减", rewrite: "改写", restructure: "重构" };
    const scopeZhMap = { span: "片段", sentence: "句级", paragraph: "段级", document: "全文", element: "元素" };

    for (const f of shown) {
      const rev = f.revision || {};
      const conf = f.confidence || "medium";
      const kind = rev.kind || "rewrite";
      const scope = rev.scope || "sentence";
      const instrSrc =
        rev.instruction?.[lang] ||
        rev.instruction?.en ||
        f.deletionTest?.[lang] ||
        f.deletionTest?.en ||
        f.message?.[lang] ||
        f.message?.en ||
        "";
      const keepArr = Array.isArray(rev.keep) ? rev.keep : [];
      if (lang === "zh") {
        const keepPart = keepArr.length > 0 ? ` | 保留=${keepArr.join("、")}` : "";
        out.push(
          `[${sevZhMap[f.severity] || f.severity}] ${f.file}:${f.location} ${f.ruleId} 置信=${confZhMap[conf] || conf} ${kindZhMap[kind] || kind}/${scopeZhMap[scope] || scope} | 原文="${cleanAgentText(f.match, 90)}" | 改法="${cleanAgentText(instrSrc, 140)}"${keepPart}`
        );
      } else {
        const keepPart = keepArr.length > 0 ? ` | keep=${keepArr.join(", ")}` : "";
        out.push(
          `[${f.severity}] ${f.file}:${f.location} ${f.ruleId} conf=${conf} ${kind}/${scope} | match="${cleanAgentText(f.match, 90)}" | fix="${cleanAgentText(instrSrc, 140)}"${keepPart}`
        );
      }
    }

    if (sorted.length > AGENT_MAX) {
      const overflow = sorted.length - AGENT_MAX;
      out.push(
        lang === "zh"
          ? `... 另有 ${overflow} 处命中（完整列表请加 --format json）`
          : `... +${overflow} more findings (use --format json for full list)`
      );
    }

    for (const u of unusedSuppressions) {
      out.push(
        lang === "zh"
          ? `[失效豁免] ${u.file}:${u.line} 规则=${u.ruleIds.join(",")}`
          : `[unused-ignore] ${u.file}:${u.line} rules=${u.ruleIds.join(",")}`
      );
    }
  }

  for (const s of skipped) {
    const locReason = localizeSkipReason(s.reason, lang);
    out.push(lang === "zh" ? `[跳过] ${s.file} 原因=${locReason}` : `[skip] ${s.file} reason=${locReason}`);
  }

  if (!quiet && report.profiles && report.profiles.length > 0) {
    for (const item of report.profiles) {
      const p = item.profile;
      out.push(
        lang === "zh"
          ? `[画像] ${item.file} 风险=${p.telemetryRisk.score}/100 句长变异=${p.burstiness.cv} 锚点=${p.concreteness.per100Units}`
          : `[profile] ${item.file} risk=${p.telemetryRisk.score}/100 cv=${p.burstiness.cv} anchors=${p.concreteness.per100Units}`
      );
    }
  }

  return out.join("\n");
}

export function formatReport(report, format = "text", lang = "en", options = {}) {
  const { findings, checkedCount, skipped = [], unusedSuppressions = [], coverageWarnings = [], changedFilter = false } = report;
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
      return `::${level} file=${escapeGithubProp(f.file)},line=${f.line || 1},col=${f.col || 1},title=${escapeGithubProp(f.ruleId)}::${escapeGithubData(`${msg} (${f.match}) — ${ruleDocUrl(f, lang)}`)}`;
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
  if (format === "agent") {
    return formatAgentReport(report, lang, options);
  }

  // Default human text format
  const quiet = Boolean(options?.quiet);
  const failOn = options?.failOn || "error";
  const minRank = SEVERITY_RANK[failOn] || SEVERITY_RANK.error;
  const visibleFindings = quiet
    ? findings.filter((f) => (SEVERITY_RANK[f.severity] || 1) >= minRank)
    : findings;

  if (quiet && visibleFindings.length === 0 && unusedSuppressions.length === 0 && skipped.length === 0 && coverageWarnings.length === 0) {
    return "";
  }

  const isReview = report.schema === "dislop.review/1";
  const out = [];
  const skipNote = skipped.length > 0 ? `, ${skipped.length} skipped` : "";
  const zhSkip = skipped.length > 0 ? `，跳过 ${skipped.length} 项` : "";
  if (changedFilter && checkedCount === 0 && skipped.length === 0 && visibleFindings.length === 0 && coverageWarnings.length === 0) {
    if (!quiet) {
      out.push(
        lang === "zh"
          ? "dislop: --changed 未匹配到可检查的变更文件（已检 0 项，0 处命中）"
          : "dislop: --changed matched 0 inspectable files (0 checked, 0 findings)"
      );
    }
  } else if (visibleFindings.length === 0 && unusedSuppressions.length === 0) {
    if (!quiet) {
      const fileLabel = checkedCount === 1 ? "1 file" : `${checkedCount} files`;
      if (isReview) {
        out.push(
          lang === "zh"
            ? `dislop review: 未标出 AI 味问题（已审 ${checkedCount} 项${zhSkip}，0 处命中）`
            : `dislop review: no AI-flavor issues flagged (${fileLabel} reviewed${skipNote}, 0 findings)`
        );
      } else {
        out.push(
          lang === "zh"
            ? `dislop: 未发现已知模式（已检 ${checkedCount} 项${zhSkip}，0 处命中）`
            : `dislop: no known patterns found (${fileLabel} checked${skipNote}, 0 findings)`
        );
      }
    }
  } else {
    const isZh = lang === "zh";
    const errCount = visibleFindings.filter((f) => f.severity === "error").length;
    const warnCount = visibleFindings.filter((f) => f.severity === "warning").length;
    const infoCount = visibleFindings.filter((f) => f.severity === "info").length;
    if (isZh) {
      const zhParts = [];
      if (errCount > 0) zhParts.push(`${errCount} 处硬伤`);
      if (warnCount > 0) zhParts.push(`${warnCount} 处提醒`);
      if (infoCount > 0) zhParts.push(`${infoCount} 处提示`);
      const detail = zhParts.length > 0 ? `（${zhParts.join("、")}）` : "";
      const headNoun =
        visibleFindings.length > 0
          ? `发现 ${visibleFindings.length} 处问题${detail}`
          : `发现 ${unusedSuppressions.length} 处失效豁免`;
      out.push(`${isReview ? "dislop review" : "dislop"}: ${headNoun}，${isReview ? "已审" : "已检"} ${checkedCount} 项${zhSkip}`);
    } else {
      const enParts = [];
      if (errCount > 0) enParts.push(`${errCount} ${errCount === 1 ? "error" : "errors"}`);
      if (warnCount > 0) enParts.push(`${warnCount} ${warnCount === 1 ? "warning" : "warnings"}`);
      if (infoCount > 0) enParts.push(`${infoCount} info`);
      const breakdown = enParts.length > 0 ? ` (${enParts.join(", ")})` : "";
      const fLabel =
        visibleFindings.length > 0
          ? `${visibleFindings.length} ${visibleFindings.length === 1 ? "finding" : "findings"}${breakdown}`
          : `${unusedSuppressions.length} stale ${unusedSuppressions.length === 1 ? "suppression" : "suppressions"}`;
      const cLabel = checkedCount === 1 ? "1 file" : `${checkedCount} files`;
      out.push(`${isReview ? "dislop review" : "dislop"}: ${fLabel} across ${cLabel}${skipNote}`);
    }
    const stratLabelsZh = { delete: "删掉", "need-source": "补出处", "unwrap-layout": "去套壳", rephrase: "改写" };
    const seenRuleIds = new Set();
    const ruleCounts = new Map();
    for (const f of visibleFindings) {
      ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) || 0) + 1);
      const strat = f.fixStrategy || deriveFixStrategy({ id: f.ruleId, family: f.family });
      const tag = isZh ? stratLabelsZh[strat] || "改写" : strat;
      if (isZh) {
        const sevZh = f.severity === "error" ? "硬伤" : f.severity === "warning" ? "提醒" : "提示";
        out.push(`  [${sevZh}] ${f.file}:${f.location}  ${f.ruleId} [${tag}]`);
        out.push(`    原文: "${f.match}"`);
      } else {
        out.push(`  [${f.severity.toUpperCase()}] ${f.file}:${f.location}  ${f.ruleId} [${tag}]`);
        out.push(`    match: "${f.match}"`);
      }
      if (!seenRuleIds.has(f.ruleId)) {
        seenRuleIds.add(f.ruleId);
        const msg = f.message?.[lang] || f.message?.en || "";
        const testTxt = f.deletionTest ? f.deletionTest[lang] || f.deletionTest.en || "" : "";
        if (msg) {
          out.push(isZh ? `    原因: ${msg}` : `    why:   ${msg}`);
        }
        if (testTxt && testTxt !== msg) {
          out.push(isZh ? `    改法: ${testTxt}` : `    fix:   ${testTxt}`);
        }
      }
    }
    for (const u of unusedSuppressions) {
      out.push(
        isZh
          ? `  [失效豁免] ${u.file}:${u.line}  未命中的 dislop-ignore (${u.ruleIds.join(", ")})`
          : `  [UNUSED] ${u.file}:${u.line}  stale dislop-ignore (${u.ruleIds.join(", ")})`
      );
    }
    if (visibleFindings.length >= 4 || (checkedCount >= 2 && visibleFindings.length > 0)) {
      const topStr = Array.from(ruleCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([rid, cnt]) => `${rid}×${cnt}`)
        .join(", ");
      out.push(isZh ? `  按规则分布: ${topStr}` : `  Top rules: ${topStr}`);
      out.push(isZh ? "  下一步: 改完可跑 dislop verify --git HEAD <文件>" : "  Next: verify edits with dislop verify --git HEAD <file>");
    }
  }
  for (const s of skipped) {
    const locReason = localizeSkipReason(s.reason, lang);
    out.push(lang === "zh" ? `  [跳过] ${s.file} — ${locReason}` : `  [SKIP] ${s.file} — ${locReason}`);
  }
  for (const w of coverageWarnings) {
    out.push(lang === "zh" ? `  [覆盖提示] ${w.file} — ${w.message}` : `  [COVERAGE] ${w.file} — ${w.message}`);
  }
  if (!quiet && report.profiles && report.profiles.length > 0) {
    const levelZhMap = { low: "低", medium: "中", high: "高" };
    const statusZhMap = { varied: "有起伏", flat: "偏平", short: "偏短", grounded: "具体", moderate: "一般", vapor: "偏虚", ok: "正常" };
    const signalZhMap = {
      "cooccurrence-slop-cluster": "弱套词共现",
      "semicolon-tricolon": "分号三段排比",
      "rhetorical-qa-cadence": "自问自答设问",
      "comma-chain-runon": "多逗号连环句",
      "narrative-sandwich-frame": "三明治叙事壳",
      "template-skeleton-echo": "句首骨架复用",
      "low-burstiness-vapor": "句长齐平空话",
      "flat-sentence-rhythm": "句长偏平",
      "zero-concrete-anchors": "缺乏具体锚点",
      "high-em-dash-density": "破折号过密",
    };
    for (const item of report.profiles) {
      const p = item.profile;
      const sigs = p.telemetryRisk.signals.length > 0 ? p.telemetryRisk.signals.join(", ") : "none";
      if (lang === "zh") {
        const sigsZh =
          p.telemetryRisk.signals.length > 0
            ? p.telemetryRisk.signals.map((s) => signalZhMap[s] || s).join("、")
            : "无";
        out.push(
          `  [统计] ${item.file}  风险=${p.telemetryRisk.score}/100（${levelZhMap[p.telemetryRisk.level] || p.telemetryRisk.level}） | 句长变异=${p.burstiness.cv}（${statusZhMap[p.burstiness.status] || p.burstiness.status}） | 具体锚点=${p.concreteness.per100Units}/100字（${statusZhMap[p.concreteness.status] || p.concreteness.status}） | 词汇丰富度=${p.lexical.mattr} | 字符熵=${p.lexical.charEntropy} | 信号=${sigsZh}`
        );
      } else {
        out.push(
          `  [PROFILE] ${item.file}  risk=${p.telemetryRisk.score}/100 (${p.telemetryRisk.level}) | burstiness_cv=${p.burstiness.cv} (${p.burstiness.status}) | concreteness=${p.concreteness.per100Units}/100u (${p.concreteness.status}) | mattr=${p.lexical.mattr} | entropy=${p.lexical.charEntropy} | signals=${sigs}`
        );
      }
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
        helpUri: ruleDocUrl(f, lang),
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
  "graphic/": "graphic-layout",
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
        anchorUrl: ruleDocUrl({ ruleId: rule.id }, "en"),
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
  { group: "min_inc", re: /^(?:no\s+less\s+than|no\s+fewer\s+than|at\s+least|minimum\s+of|>=|≥)\s*/i },
  { group: "min_inc", re: /^(?:不低于|不少于|不小于|不得低于|不得少于|至少|最少|最低|起码|下限(?:为)?)\s*/ },
  { group: "max_inc", re: /^(?:no\s+more\s+than|up\s+to|at\s+most|within|inside(?:\s+of)?|max(?:imum)?(?:\s+of)?|<=|≤)\s*/i },
  { group: "max_inc", re: /^(?:不超过|不高于|不大于|不多于|不得超过|不得高于|最多|至多|最高|以内|上限(?:为)?)\s*/ },
  { group: "max_lt", re: /^(?:under|below|less\s+than|fewer\s+than|<)\s*/i },
  { group: "max_lt", re: /^(?:低于|小于|少于|不到)\s*/ },
  { group: "min_gt", re: /^(?:more\s+than|greater\s+than|over|above|>)\s*/i },
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

function normalizeFactScanText(raw) {
  let out = "";
  const s = String(raw || "");
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code >= 0xff10 && code <= 0xff19) {
      out += String.fromCharCode(code - 0xff10 + 48);
    } else if (code === 0xff05) {
      out += "%";
    } else if (code === 0x2212) {
      out += "-";
    } else {
      out += s[i];
    }
  }
  return out;
}

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
  const nm = rest.match(/^(\d+(?:\.\d+)?)[\s-]*(.*)$/);
  if (!nm) return `${sign}${curr}${rest.toLowerCase()}`;
  const numPart = nm[1];
  const rawUnit = nm[2].trim();
  const normUnit = rawUnit
    ? UNIT_CANON_MAP[rawUnit.toLowerCase()] || UNIT_CANON_MAP[rawUnit] || ZH_UNIT_CANON[rawUnit] || rawUnit.toLowerCase()
    : "";
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

const ZH_NUM_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const ZH_UNIT_CANON = {
  个: "个",
  条: "条",
  项: "项",
  次: "次",
  份: "份",
  页: "页",
  行: "行",
  人: "人",
  家: "家",
  位: "人",
  名: "人",
  台: "台",
  套: "套",
  批: "批",
  种: "种",
  轮: "轮",
  层: "层",
  步: "步",
  篇: "篇",
  节: "节",
  章: "章",
};

function parseChineseNumeral(zhStr) {
  const s = String(zhStr || "").trim();
  if (!s) return null;
  if (s.startsWith("万") || s.startsWith("亿")) return null;
  if (/^[零〇一二两三四五六七八九]+$/.test(s) && s.length === 1) {
    return ZH_NUM_DIGIT[s];
  }
  let total = 0;
  let section = 0;
  let num = 0;
  for (const ch of s) {
    if (ch in ZH_NUM_DIGIT) {
      num = ZH_NUM_DIGIT[ch];
    } else if (ch === "十") {
      section += (num === 0 ? 1 : num) * 10;
      num = 0;
    } else if (ch === "百") {
      section += (num === 0 ? 1 : num) * 100;
      num = 0;
    } else if (ch === "千") {
      section += (num === 0 ? 1 : num) * 1000;
      num = 0;
    } else if (ch === "万") {
      if (section + num === 0) return null;
      total += (section + num) * 10000;
      section = 0;
      num = 0;
    } else if (ch === "亿") {
      if (section + num === 0) return null;
      total += (section + num) * 100000000;
      section = 0;
      num = 0;
    } else {
      return null;
    }
  }
  const val = total + section + num;
  return val >= 0 ? val : null;
}

function canonicalizeDateToken(rawDate) {
  const s = String(rawDate || "").trim();
  let m = s.match(/^((?:19|20)\d{2})[-/.年]\s*(0?[1-9]|1[0-2])[-/.月]\s*(0?[1-9]|[12]\d|3[01])\s*[日号]?$/);
  if (m) {
    return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
  }
  m = s.match(/^(0?[1-9]|[12]\d|3[01])[/.](0?[1-9]|[12]\d|3[01])[/.]((?:19|20)\d{2})$/);
  if (m) {
    return `${String(Number(m[1])).padStart(2, "0")}/${String(Number(m[2])).padStart(2, "0")}/${m[3]}`;
  }
  m = s.match(/^(0?[1-9]|1[0-2])[/.月]\s*(0?[1-9]|[12]\d|3[01])\s*[日号]?$/);
  if (m) {
    return `${String(Number(m[1])).padStart(2, "0")}/${String(Number(m[2])).padStart(2, "0")}`;
  }
  return s;
}

function extractLeadingQualifier(cleanScan, numStart, lookbackChars = 24) {
  const lookbehindStart = Math.max(0, numStart - lookbackChars);
  const prefixWindow = cleanScan.slice(lookbehindStart, numStart);
  let qualifier = null;
  let spanStart = numStart;
  let bestMatchLen = 0;
  for (const qp of FACT_QUALIFIER_PATTERNS) {
    for (let offset = 0; offset < prefixWindow.length; offset += 1) {
      const sub = prefixWindow.slice(offset);
      const qm = sub.match(qp.re);
      if (qm && qm[0].length === sub.length && qm[0].length > bestMatchLen) {
        bestMatchLen = qm[0].length;
        qualifier = qp.group;
        spanStart = lookbehindStart + offset;
      }
    }
  }
  return { qualifier, spanStart };
}

export function extractProtectedFacts(text, { modality = "markdown", keepMode = false } = {}) {
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
  const urlRe = /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/gi;
  while ((m = urlRe.exec(withoutFences)) !== null) {
    const cleaned = m[0].replace(/[.,;!?)]+$/, "");
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

  // 3. Atomic ratios/dates/times and numbers/units/versions in visible prose (1:1 normalized digits/minus)
  const proseScan = normalizeFactScanText(blankMarkupForFactScan(raw, modality));
  const maskOccupied = () => {
    const chars = proseScan.split("");
    for (const [s, e] of occupied) {
      for (let i = s; i < e && i < chars.length; i += 1) chars[i] = " ";
    }
    return chars.join("");
  };

  const applyTrailingQual = (scanStr, spanEnd, initialQual) => {
    if (initialQual) return { qualifier: initialQual, spanEnd };
    const suffixWindow = scanStr.slice(spanEnd, Math.min(scanStr.length, spanEnd + 6));
    const suffixList = keepMode
      ? [{ group: "max_inc", re: /^\s*(?:以内|内|以下|上限)/ }, ...FACT_SUFFIX_QUALIFIERS.slice(1)]
      : FACT_SUFFIX_QUALIFIERS;
    for (const sp of suffixList) {
      const sm = suffixWindow.match(sp.re);
      if (sm) {
        return { qualifier: sp.group, spanEnd: spanEnd + sm[0].length };
      }
    }
    return { qualifier: null, spanEnd };
  };

  if (keepMode) {
    const cleanKeepDates = maskOccupied();
    const keepDatePatterns = [
      /\b\d{4}-\d{1,2}-\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?Z?)?\b/g,
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?\b/gi,
      /\d{4}\s*年(?:\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*[日号])?)?/g,
    ];
    for (const dp of keepDatePatterns) {
      while ((m = dp.exec(cleanKeepDates)) !== null) {
        const cleaned = raw.slice(m.index, m.index + m[0].length).trim();
        claim({
          kind: "date",
          raw: cleaned,
          canonical: cleaned,
          qualifier: null,
          span: { start: m.index, end: m.index + m[0].length },
        });
      }
    }
  }

  // 3a. Atomic ratios (`3:1`, context-ratio `1/2`), dates (`2026-11-23.`, `05/06/2024`, `11/20`, `11月20日`), and clock times (`10:30`)
  let cleanScan = maskOccupied();
  const slashRatioRe = /(?<![A-Za-z0-9_.])(\d+)\/(\d+)(?![A-Za-z0-9_./])/g;
  while ((m = slashRatioRe.exec(cleanScan)) !== null) {
    const pre = cleanScan.slice(Math.max(0, m.index - 18), m.index);
    if (/(?:比例|比值|比率|系数|概率|胜率|占比|ratio|fraction|odds|chance)/i.test(pre)) {
      const { qualifier: preQual, spanStart } = extractLeadingQualifier(cleanScan, m.index);
      const { qualifier, spanEnd } = applyTrailingQual(cleanScan, m.index + m[0].length, preQual);
      claim({
        kind: qualifier ? "qualified-number" : "number",
        raw: raw.slice(spanStart, spanEnd).trim(),
        canonical: m[0].trim(),
        qualifier,
        span: { start: spanStart, end: spanEnd },
      });
    }
  }

  cleanScan = maskOccupied();
  const dateTimeRe =
    /(?:(?<![A-Za-z0-9_.])(?:19|20)\d{2}[-/.年]\s*(?:0?[1-9]|1[0-2])[-/.月]\s*(?:0?[1-9]|[12]\d|3[01])\s*[日号]?(?!(?:\.[0-9]|[A-Za-z0-9_/-]))|(?<![A-Za-z0-9_.])(?:0?[1-9]|[12]\d|3[01])[/.](?:0?[1-9]|[12]\d|3[01])[/.](?:19|20)\d{2}(?!(?:\.[0-9]|[A-Za-z0-9_/-]))|(?<![A-Za-z0-9_.])(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])(?!(?:\.[0-9]|[A-Za-z0-9_./]))|(?:0?[1-9]|1[0-2])\s*月\s*(?:0?[1-9]|[12]\d|3[01])\s*[日号]|(?<![A-Za-z0-9_:])(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?![A-Za-z0-9_:]))/g;
  while ((m = dateTimeRe.exec(cleanScan)) !== null) {
    const dtStart = m.index;
    const dtEnd = m.index + m[0].length;
    const { qualifier, spanStart } = extractLeadingQualifier(cleanScan, dtStart);
    const canonical = /:/.test(m[0]) ? m[0].trim() : canonicalizeDateToken(m[0]);
    claim({
      kind: "date",
      raw: raw.slice(spanStart, dtEnd).trim(),
      canonical,
      qualifier,
      span: { start: spanStart, end: dtEnd },
    });
  }

  // Non-clock ratios like `3:1` or `16:9`
  cleanScan = maskOccupied();
  const colonRatioRe = /(?<![A-Za-z0-9_:])(\d+:\d+)(?![A-Za-z0-9_:])/g;
  while ((m = colonRatioRe.exec(cleanScan)) !== null) {
    const { qualifier: preQual, spanStart } = extractLeadingQualifier(cleanScan, m.index);
    const { qualifier, spanEnd } = applyTrailingQual(cleanScan, m.index + m[0].length, preQual);
    claim({
      kind: qualifier ? "qualified-number" : "number",
      raw: raw.slice(spanStart, spanEnd).trim(),
      canonical: m[1],
      qualifier,
      span: { start: spanStart, end: spanEnd },
    });
  }

  // 3b. Constrained Chinese numerals with classifiers / `零`+risk-noun
  cleanScan = maskOccupied();
  const zhCountRe =
    /(?:(?:(共|共计|合计|至少|不超过|不少于|不小于|不高于|不低于|超过|低于|多于|少于|仅|约|大约)\s*)?([一二两三四五六七八九十百千万亿零〇]+)(个月|[个条项次份页行人家位名台套批种轮层步篇章节]))|(?<![0-9])(?:零|0)\s*(误差|漏报|误报|残留|依赖|新增|故障|容忍|阻塞|中断|风险)/g;
  while ((m = zhCountRe.exec(cleanScan)) !== null) {
    if (m[2]) {
      const lead = m[1] || "";
      const numStr = m[2];
      const unitStr = m[3];
      // Require an explicit quantifier when numeral is bare "一" to skip idioms like "一个问题" / "一步到位"
      if (numStr === "一" && !lead) continue;
      const val = parseChineseNumeral(numStr);
      if (val === null) continue;
      const unitCanon = UNIT_CANON_MAP[unitStr] || ZH_UNIT_CANON[unitStr] || unitStr;
      const numStart = m.index + (lead ? m[0].indexOf(numStr) : 0);
      const { qualifier: preQual, spanStart } = extractLeadingQualifier(cleanScan, numStart);
      const { qualifier, spanEnd } = applyTrailingQual(cleanScan, m.index + m[0].length, preQual);
      claim({
        kind: qualifier ? "qualified-number" : "number",
        raw: raw.slice(spanStart, spanEnd).trim(),
        canonical: `${val}${unitCanon}`,
        qualifier,
        span: { start: spanStart, end: spanEnd },
      });
    } else if (m[4]) {
      const zeroStart = cleanScan.indexOf("0", m.index) === m.index || cleanScan.indexOf("零", m.index) === m.index ? m.index : m.index;
      const { qualifier: preQual, spanStart } = extractLeadingQualifier(cleanScan, zeroStart);
      const { qualifier, spanEnd } = applyTrailingQual(cleanScan, m.index + m[0].length, preQual);
      claim({
        kind: qualifier ? "qualified-number" : "number",
        raw: raw.slice(spanStart, spanEnd).trim(),
        canonical: `0${m[4]}`,
        qualifier,
        span: { start: spanStart, end: spanEnd },
      });
    }
  }

  // 3c. Arabic numbers, units, versions, and bounding qualifiers in visible prose
  cleanScan = maskOccupied();
  const numRe = keepMode
    ? /(?<![A-Za-z0-9_])(?:v\d+(?:\.\d+){1,3}(?![A-Za-z0-9_.])|\d+(?:\.\d+){2,3}(?![A-Za-z0-9_.])|Q[1-4](?![A-Za-z0-9_])|P(?:50|90|95|99)(?![A-Za-z0-9_])|(?:(?<![A-Za-z0-9_.-])[+-])?[$€¥£]\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s?[kKmMbB](?![A-Za-z0-9_])|万元|亿元|万|亿)?|(?:(?<![A-Za-z0-9_.-])[+-])?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:(?:x|×)(?![A-Za-z0-9_])|[\s-]?(?:milliseconds?|ms|microseconds?|us|µs|minutes?|mins?|seconds?|secs?|hours?|hrs?|days?|weeks?|months?|years?|KB|MB|GB|TB|PB|QPS|TPS|RPS|fps|px|rows?|items?|files?)(?![A-Za-z0-9_])|\s?(?:%|requests?\/s|req\/s|s(?![A-Za-z0-9_])|毫秒|微秒|秒钟|分钟|小时|个月|万元|亿元|万美元|美元|欧元|日元|千瓦时|倍|秒|天|年|万|亿|元|次|个|条|项|份|页|行|人|家|位|名|台|套|批|种|轮|层|步|篇|章|节))?)/g
    : /(?<![A-Za-z0-9_])(?:v\d+(?:\.\d+){1,3}(?![A-Za-z0-9_.])|\d+(?:\.\d+){2,3}(?![A-Za-z0-9_.])|Q[1-4](?![A-Za-z0-9_])|P(?:50|90|95|99)(?![A-Za-z0-9_])|(?:(?<![A-Za-z0-9_.-])[+-])?[$€¥£]\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s?[kKmMbB](?![A-Za-z0-9_])|万|亿)?|(?:(?<![A-Za-z0-9_.-])[+-])?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[\s-]?(?:milliseconds?|ms|minutes?|mins?|seconds?|secs?|hours?|hrs?|days?|months?|years?|KB|MB|GB|TB|QPS|TPS|RPS|fps|px|rows?)(?![A-Za-z0-9_])|\s?(?:%|s(?![A-Za-z0-9_])|个月|倍|秒|分钟|小时|天|年|万|亿|元|美元|次|个|条|项|份|页|行|人|家|位|名|台|套|批|种|轮|层|步|篇|章|节))?)/g;

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

    const { qualifier: preQual, spanStart } = extractLeadingQualifier(cleanScan, numStart);
    const { qualifier, spanEnd } = applyTrailingQual(cleanScan, numEnd, preQual);

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
  const unmatchedIndices = [];

  // Pass 1: exact (kind-compatible, canonical, qualifier) matches first so bare or mis-ordered tokens cannot steal qualified matches
  for (let i = 0; i < beforeFacts.length; i += 1) {
    const bf = beforeFacts[i];
    const isNum = bf.kind === "number" || bf.kind === "qualified-number";
    const matchIdx = pool.findIndex(
      (af) =>
        !af.used &&
        (isNum ? af.kind === "number" || af.kind === "qualified-number" : af.kind === bf.kind) &&
        af.canonical === bf.canonical &&
        (af.qualifier || null) === (bf.qualifier || null)
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
    } else {
      unmatchedIndices.push(i);
    }
  }

  // Pass 2: remaining items catch mismatched, dropped, or newly added qualifiers
  for (const idx of unmatchedIndices) {
    const bf = beforeFacts[idx];
    const isNum = bf.kind === "number" || bf.kind === "qualified-number";
    const bareIdx = pool.findIndex(
      (af) =>
        !af.used &&
        (isNum ? af.kind === "number" || af.kind === "qualified-number" : af.kind === bf.kind) &&
        af.canonical === bf.canonical
    );
    if (bareIdx !== -1 && (bf.qualifier || pool[bareIdx].qualifier)) {
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

    const dupPreserved = preserved.find(
      (p) =>
        (isNum ? p.kind === "number" || p.kind === "qualified-number" : p.kind === bf.kind) &&
        p.canonical === bf.canonical &&
        (p.qualifier || null) === (bf.qualifier || null)
    );
    if (dupPreserved) {
      preserved.push({
        before: bf.raw,
        after: dupPreserved.after,
        kind: bf.kind,
        canonical: bf.canonical,
        qualifier: bf.qualifier,
      });
      continue;
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

export function verifyRevisionBundle(
  beforeText,
  afterText,
  {
    filename = "<memory>",
    modality = null,
    pack = null,
    config = {},
    register = null,
    keepTerms = [],
    allowAdded = false,
    strict = false,
  } = {}
) {
  const bef = String(beforeText || "");
  const aft = String(afterText || "");
  const mod = modality || detectModality(filename) || "markdown";
  const regInfo = resolveRegister(bef, { filename, flagRegister: register, config });
  const effRegister = regInfo.register;
  const factLedger = verifyRevision(bef, aft, { allowAdded });

  const requested = [];
  const seenKeep = new Set();
  for (const t of Array.isArray(keepTerms) ? keepTerms : []) {
    const clean = String(t || "").trim();
    if (!clean || seenKeep.has(clean)) continue;
    seenKeep.add(clean);
    requested.push(clean);
  }
  const aftLower = aft.toLowerCase();
  const kept = [];
  const missing = [];
  for (const term of requested) {
    const isAscii = /^[A-Za-z0-9 _.-]+$/.test(term);
    const present = isAscii ? aftLower.includes(term.toLowerCase()) : aft.includes(term);
    if (present) kept.push(term);
    else missing.push(term);
  }
  const keepTermsCheck = { requested, kept, missing };

  let findingsDelta = null;
  if (pack) {
    const beforeRes = auditText(bef, { filename, modality: mod, pack, config, register: effRegister });
    const afterRes = auditText(aft, { filename, modality: mod, pack, config, register: effRegister });
    const beforeCounts = new Map();
    const afterCounts = new Map();
    const findingKey = (f) => `${f.ruleId}|${f.match || ""}`;
    for (const f of beforeRes.findings) {
      const k = findingKey(f);
      beforeCounts.set(k, (beforeCounts.get(k) || 0) + 1);
    }
    for (const f of afterRes.findings) {
      const k = findingKey(f);
      afterCounts.set(k, (afterCounts.get(k) || 0) + 1);
    }
    let resolvedCount = 0;
    for (const [k, bc] of beforeCounts.entries()) {
      const ac = afterCounts.get(k) || 0;
      if (bc > ac) resolvedCount += bc - ac;
    }
    const seenAfter = new Map();
    const introduced = [];
    for (const f of afterRes.findings) {
      const k = findingKey(f);
      const nth = (seenAfter.get(k) || 0) + 1;
      seenAfter.set(k, nth);
      if (nth > (beforeCounts.get(k) || 0)) {
        introduced.push({
          ruleId: f.ruleId,
          severity: f.severity,
          fixStrategy: f.fixStrategy,
          line: f.line,
          col: f.col,
          match: f.match,
        });
      }
    }
    findingsDelta = {
      beforeCount: beforeRes.findings.length,
      afterCount: afterRes.findings.length,
      resolvedCount,
      introduced,
      introducedErrors: introduced.filter((x) => x.severity === "error").length,
    };
  }

  const beforeChars = codePointLength(bef.trim());
  const afterChars = codePointLength(aft.trim());
  const ratio = beforeChars === 0 ? 1 : Number((afterChars / beforeChars).toFixed(4));
  let lengthStatus = "ok";
  if (beforeChars >= 120 && ratio < 0.5) {
    lengthStatus = "over-compressed";
  } else if (beforeChars >= 60 && beforeChars <= 160 && ratio > 1.8) {
    lengthStatus = "over-expanded";
  }
  const lengthCheck = {
    beforeChars,
    afterChars,
    ratio,
    status: lengthStatus,
  };

  // Built-in anti-degradation guardrails: protect author voice, cadence, information density, and modality precision
  const beforeProf = analyzeTextProfile(bef, { modality: mod, config });
  const afterProf = analyzeTextProfile(aft, { modality: mod, config });
  const degWarnings = [];

  const countPersp = (s) =>
    (s.match(/(?:我|我们|咱们|你|你们)/g) || []).length +
    (s.match(/\b(?:I|we|my|our|you|your)\b/gi) || []).length;
  const beforePersp = countPersp(bef);
  const afterPersp = countPersp(aft);
  const perspectivePreserved = !(beforePersp >= 2 && afterPersp === 0);
  if (!perspectivePreserved) {
    degWarnings.push({
      code: "voice-perspective-erased",
      severity: "warning",
      message: {
        en: "Original author perspective (first/second person) was erased into impersonal prose.",
        zh: "原文的第一/第二人称作者视角被完全抹平，改成了冰冷的第三方腔。",
      },
    });
  }

  if (
    effRegister !== "technical" &&
    effRegister !== "official" &&
    beforeProf.sentenceCount >= 4 &&
    afterProf.sentenceCount >= 4 &&
    beforeProf.burstiness.cv >= 0.32 &&
    afterProf.burstiness.cv < 0.22 &&
    beforeProf.burstiness.cv - afterProf.burstiness.cv >= 0.12
  ) {
    degWarnings.push({
      code: "cadence-flattened",
      severity: "warning",
      message: {
        en: "Sentence rhythm was flattened into uniform cadence, losing the original phrasing variation.",
        zh: "原文错落的句长节奏被压平变呆板，丢失了自然的表达起伏。",
      },
    });
  }

  const CASUAL_MARKER_RE = /(?:自己收|只出|咱们|大伙|顺手|包邮|私聊|闲置|\b(?:folks|gonna|wanna|my own)\b)/gi;
  const STIFF_BOOKISH_RE = /(?:旨在|谨此|兹有|切勿|务必|仅出|略有|偶见|赋能|抓手|闭环|\b(?:thereof|herein|pursuant to|endeavor to|facilitate)\b)/gi;
  const SLANG_DRIFT_RE = /(?:家人们|绝绝子|咱就是说|尊嘟假嘟|\b(?:no cap|frfr|lowkey)\b)/gi;
  const befCasualHits = (bef.match(CASUAL_MARKER_RE) || []).length;
  const befStiffSet = new Set((bef.match(STIFF_BOOKISH_RE) || []).map((x) => x.toLowerCase()));
  const aftNewStiff = (aft.match(STIFF_BOOKISH_RE) || []).filter((x) => !befStiffSet.has(x.toLowerCase()));
  const isCasualRegister = effRegister === "casual" || (befCasualHits >= 2 && befStiffSet.size === 0);
  if (isCasualRegister && aftNewStiff.length >= 2) {
    degWarnings.push({
      code: "register-drift",
      severity: "warning",
      message: {
        en: "Conversational wording drifted into stiff bookish/bureaucratic prose instead of keeping the original casual voice.",
        zh: "口语/个人表达被改写成生硬书面或公文腔，丢掉了原本的自然口吻。",
      },
    });
  } else if (
    (effRegister === "official" || effRegister === "technical" || pack?.id === "regulated-comms" || pack?.id === "engineering-spec") &&
    !SLANG_DRIFT_RE.test(bef)
  ) {
    SLANG_DRIFT_RE.lastIndex = 0;
    if (SLANG_DRIFT_RE.test(aft)) {
      degWarnings.push({
        code: "register-drift",
        severity: "warning",
        message: {
          en: "Formal/technical draft drifted into fake-casual internet slang.",
          zh: "正式或技术文本中混入了轻浮网络口水词，与当前写作场景不符。",
        },
      });
    }
  }

  if (
    beforeProf.concreteness.anchorCount >= 3 &&
    afterProf.concreteness.anchorCount < beforeProf.concreteness.anchorCount * 0.7
  ) {
    degWarnings.push({
      code: "information-loss",
      severity: "warning",
      message: {
        en: "Concrete facts, metrics, paths, or examples dropped by >30%, reducing information density.",
        zh: "具体数字、路径、时间或实例锚点流失超过 30%，信息量受损。",
      },
    });
  }

  const modalityBuckets = [
    ["estimate", /(?:预计|约|大约|估算|大概|\b(?:projected|estimated|approx(?:imately)?|roughly|target)\b)/i],
    ["condition", /(?:仅在|除非|前提是|当且仅当|\b(?:only when|unless|provided that|if and only if)\b)/i],
    ["unverified", /(?:暂未|尚未|待确认|待验证|\b(?:pending|unverified|not yet)\b)/i],
    ["measured", /(?:实测|压测|基准测试|\b(?:measured|benchmarked|observed)\b)/i],
  ];
  const modalityDrifts = [];
  for (const [bName, bRe] of modalityBuckets) {
    if (bRe.test(bef) && !bRe.test(aft)) {
      modalityDrifts.push(bName);
    }
  }
  if (modalityDrifts.length > 0) {
    const joinedDrifts = modalityDrifts.join(", ");
    degWarnings.push({
      code: "modality-drifted",
      severity: "error",
      message: {
        en: `Precision/modality qualifiers dropped (${joinedDrifts}); revision may overclaim or lose scope bounds.`,
        zh: `边界或模态限定词丢失（${joinedDrifts}），改稿可能导致表述失准或过度承诺。`,
      },
    });
  }

  if (findingsDelta && findingsDelta.introduced.length > 0) {
    degWarnings.push({
      code: "secondary-slop-introduced",
      severity: findingsDelta.introducedErrors > 0 ? "error" : "warning",
      message: {
        en: "Revision introduced new AI-slop pattern(s) not present in the original.",
        zh: "改稿新引入了原文原本没有的 AI 套路或残留问题。",
      },
    });
  }

  if (lengthStatus === "over-compressed") {
    degWarnings.push({
      code: "over-compressed",
      severity: "warning",
      message: {
        en: "Revision shrank below 50% of original length; verify no substance or nuance was stripped.",
        zh: "改稿篇幅被压缩至原文 50% 以下，请核对是否误删干货或细节。",
      },
    });
  } else if (lengthStatus === "over-expanded") {
    degWarnings.push({
      code: "over-expanded",
      severity: "warning",
      message: {
        en: "Short UI/label copy expanded above 180% of original length; check layout overflow risk.",
        zh: "短文案被扩写超过原文 180%，注意检查界面换行或卡片溢出。",
      },
    });
  }

  const antiDegradation = {
    status: degWarnings.length === 0 ? "preserved" : "degraded",
    warnings: degWarnings,
    metrics: {
      beforeCv: beforeProf.burstiness.cv,
      afterCv: afterProf.burstiness.cv,
      beforeAnchors: beforeProf.concreteness.anchorCount,
      afterAnchors: afterProf.concreteness.anchorCount,
      perspectivePreserved,
      modalityDrifts,
      secondarySlopCount: findingsDelta ? findingsDelta.introduced.length : 0,
    },
  };

  const hardPass =
    factLedger.status === "preserved" &&
    keepTermsCheck.missing.length === 0 &&
    modalityDrifts.length === 0 &&
    (findingsDelta ? findingsDelta.introducedErrors === 0 : true);
  const ok = hardPass && (!strict || degWarnings.length === 0);

  return {
    schema: "dislop.verify/1",
    ok,
    status: ok ? "passed" : "failed",
    factLedger,
    keepTerms: keepTermsCheck,
    lengthCheck,
    antiDegradation,
    ...(findingsDelta ? { findingsDelta } : {}),
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
