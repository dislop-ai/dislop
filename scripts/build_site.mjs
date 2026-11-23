#!/usr/bin/env node
// Zero-dependency static site & agent-docs compiler for site/.
// Inputs:
//   - src/core.mjs
//   - assets/logo.svg
//   - packs/*/pack.json
//   - docs/research/anti-slop-radar-index.json
//   - docs/research/positive-divergence/{verified-positive-sources,positive-design-card.example,voice-profile.example}.json
//
// Outputs:
//   - Human workbench & directory: site/index.html (pre-rendered), site/awesome/index.html, awesome/README.md, site/engine/*, site/assets/*
//   - Agent-native static service: site/llms.txt, site/llms-full.txt, site/catalog.json, site/index.md,
//     site/{methodology,cases,tools,tasks,packs,rules,awesome}/*.md, site/awesome/index.json
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AWESOME_NAV_IDS,
  buildEnglishAwesomeHtml,
  buildEnglishHomeHtml,
  buildGuidesAndRulesPages,
  loadGuides,
  loadKnowledgeBase,
  renderAwesomeJsonLd,
  renderAwesomeTriageHtml,
  renderBrandLockup,
  renderGithubCtrl,
  renderHomeJsonLd,
  renderPrimaryNavLinks,
} from "./lib/site_content.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site");
const ENGINE_OUT = path.join(SITE_DIR, "engine");
const ASSETS_OUT = path.join(SITE_DIR, "assets");
const AWESOME_OUT = path.join(SITE_DIR, "awesome");
const REPO_AWESOME_OUT = path.join(ROOT, "awesome");

const BASE_URL = "https://dislop.com";
const PACK_ORDER = [
  "core",
  "business-brief",
  "engineering-spec",
  "regulated-comms",
  "literary-essay",
  "deck-and-ui",
  "executive-deck",
];

// ---------- Helpers & Sanitizer ----------

function sha256Full(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function approxTokens(text) {
  const bytes = Buffer.byteLength(text, "utf8");
  return Math.max(20, Math.round(bytes / 4));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Sanitize illustrative local paths in public documentation & pre-rendered HTML
 * so published docs never contain personal-looking paths or trigger local-path-leak.
 */
function sanitizePublicExemplar(str) {
  if (!str) return "";
  return String(str)
    .replace(/file:\/\/\/Users\/[A-Za-z0-9._-]+\//g, "file:///Users/example/")
    .replace(/(?<![A-Za-z0-9_])\/Users\/(?!example\/)[A-Za-z0-9._-]+\//g, "/Users/example/");
}

/**
 * Format quoted anti-pattern phrases inside rule messages/summaries as inline code spans
 * so Markdown readers clearly distinguish literal quoted triggers from descriptive prose.
 */
function formatRuleProseHtml(str) {
  return escapeHtml(str)
    .replace(/'(AI-Powered|Zero Hallucination|Overview|Background|studies show|AI 强力驱动|零幻觉保证)'/g, "<code>$1</code>")
    .replace(/[“「](AI 强力驱动|零幻觉保证)[”」]/g, "<code>$1</code>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function formatRuleProseMd(str) {
  if (!str) return "";
  return String(str)
    .replace(/'(studies show|业内人士指出|Not X, but Y|不是 A，而是 B|AI-Powered|Zero Hallucination|Overview|Background|背景)'/g, "`$1`")
    .replace(/“([^”]{2,30})”/g, "`$1`");
}

/**
 * Strip HTML comments and invisible/bidi Unicode characters (including U+2066-U+2069 isolates)
 * to defend against indirect prompt injection (IPI).
 */
const INVISIBLE_BIDI_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

function stripInvisibleBidi(str) {
  return String(str ?? "").replace(INVISIBLE_BIDI_RE, "");
}

function assertSafeExternalUrl(url, label) {
  const s = String(url || "").trim();
  if (!/^https:\/\/[^\s"'<>]+$/i.test(s)) {
    throw new Error(`Unsafe or non-HTTPS external URL for ${label}: ${s}`);
  }
  return s;
}

function sanitizeJsonStrings(val) {
  if (typeof val === "string") return stripInvisibleBidi(val);
  if (Array.isArray(val)) return val.map(sanitizeJsonStrings);
  if (val && typeof val === "object") {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = sanitizeJsonStrings(v);
    }
    return out;
  }
  return val;
}

function sanitizeAgentText(text) {
  return String(text)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(INVISIBLE_BIDI_RE, "")
    .replace(/\r\n/g, "\n")
    .trimEnd() + "\n";
}

function writeCleanFile(relPath, content, { isAgentText = false } = {}) {
  const fullPath = path.join(SITE_DIR, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const finalContent = isAgentText ? sanitizeAgentText(content) : content;
  fs.writeFileSync(fullPath, finalContent, "utf8");
  return finalContent;
}

function replaceBuildBlock(html, markerName, replacement) {
  const startTag = `<!-- BUILD:${markerName} -->`;
  const endTag = `<!-- /BUILD:${markerName} -->`;
  const startIdx = html.indexOf(startTag);
  const endIdx = html.indexOf(endTag);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`Missing build marker <!-- BUILD:${markerName} --> in site/index.html`);
  }
  if (html.indexOf(startTag, startIdx + startTag.length) !== -1 || html.indexOf(endTag, endIdx + endTag.length) !== -1) {
    throw new Error(`Duplicate build marker <!-- BUILD:${markerName} --> in site/index.html`);
  }
  const before = html.slice(0, startIdx + startTag.length);
  const after = html.slice(endIdx);
  return `${before}\n${replacement}\n${after}`;
}

function fencedExemplar(ex) {
  if (!ex) return "";
  const lines = [
    "```text",
    `bad:  ${sanitizePublicExemplar(ex.bad)}`,
  ];
  if (ex.trap) {
    lines.push(`trap: ${sanitizePublicExemplar(ex.trap)}`);
  }
  lines.push(`good: ${sanitizePublicExemplar(ex.good)}`);
  lines.push("```");
  return lines.join("\n");
}

// ---------- Load SSOT Inputs ----------

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const VERSION = pkg.version || "0.6.0";

const packsDir = path.join(ROOT, "packs");
const packsById = {};
for (const entry of fs.readdirSync(packsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const p = path.join(packsDir, entry.name, "pack.json");
  if (fs.existsSync(p)) {
    const manifest = JSON.parse(fs.readFileSync(p, "utf8"));
    packsById[manifest.id] = manifest;
  }
}

const allRules = [];
for (const pid of PACK_ORDER) {
  const pack = packsById[pid];
  if (!pack) continue;
  for (const r of pack.rules || []) {
    allRules.push({ packId: pid, pack, rule: r });
  }
}

const radarData = sanitizeJsonStrings(
  JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "research", "anti-slop-radar-index.json"), "utf8"))
);
for (const entry of radarData.entries || []) {
  assertSafeExternalUrl(entry.url, `radar:${entry.id}:url`);
  if (entry.homepage) assertSafeExternalUrl(entry.homepage, `radar:${entry.id}:homepage`);
}
const SNAPSHOT_DATE = radarData.snapshotDate || "2026-11-21";

const positiveSources = sanitizeJsonStrings(
  JSON.parse(
    fs.readFileSync(path.join(ROOT, "docs", "research", "positive-divergence", "verified-positive-sources.json"), "utf8")
  )
);
for (const entry of positiveSources.entries || []) {
  assertSafeExternalUrl(entry.url, `positive:${entry.id}:url`);
}
const positiveDesignCard = sanitizeJsonStrings(
  JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "docs", "research", "positive-divergence", "positive-design-card.example.json"),
      "utf8"
    )
  )
);
const voiceProfileExample = sanitizeJsonStrings(
  JSON.parse(
    fs.readFileSync(path.join(ROOT, "docs", "research", "positive-divergence", "voice-profile.example.json"), "utf8")
  )
);
const canonicalSkillMd = fs.readFileSync(path.join(ROOT, "skills", "dislop", "SKILL.md"), "utf8");
const canonicalBrandMd = fs.readFileSync(path.join(ROOT, "docs", "brand-and-voice-guide.md"), "utf8");
const canonicalProductBriefMd = fs.readFileSync(path.join(ROOT, "PRODUCT.md"), "utf8");
const canonicalRoadmapEn = fs.readFileSync(path.join(ROOT, "ROADMAP.md"), "utf8");
const canonicalRoadmapZh = fs.readFileSync(path.join(ROOT, "ROADMAP.zh-CN.md"), "utf8");

// ---------- 1. Sync Core Engine, Brand Assets & JS Data Modules ----------

fs.mkdirSync(ENGINE_OUT, { recursive: true });
fs.mkdirSync(ASSETS_OUT, { recursive: true });
fs.mkdirSync(AWESOME_OUT, { recursive: true });
fs.mkdirSync(REPO_AWESOME_OUT, { recursive: true });

fs.copyFileSync(path.join(ROOT, "src", "core.mjs"), path.join(ENGINE_OUT, "core.mjs"));
fs.copyFileSync(path.join(ROOT, "src", "pattern-engine.mjs"), path.join(ENGINE_OUT, "pattern-engine.mjs"));

// Build browser-compatible pocket-model.mjs (strip node:* imports & filesystem loader; attach sets lazily)
const pocketModelSrc = fs
  .readFileSync(path.join(ROOT, "src", "pocket-model.mjs"), "utf8")
  .replace(
    /import fs from "node:fs";\s*import path from "node:path";\s*import \{ fileURLToPath \} from "node:url";[\s\S]*?export function loadPocketModelBundle[\s\S]*?\n\}\n/,
    `let _cachedBundle = null;

export function preparePocketModelBundle(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("dislop pocket model bundle must be passed in browser mode.");
  }
  if (!raw._enFuncSet) raw._enFuncSet = new Set(raw.enFuncWords || []);
  if (!raw._zhStructSet) raw._zhStructSet = new Set(Array.from(raw.zhStructChars || ""));
  return raw;
}

export function setPocketModelBundle(bundle) {
  _cachedBundle = preparePocketModelBundle(bundle);
  return _cachedBundle;
}

export function loadPocketModelBundle(customBundle = null) {
  if (customBundle && typeof customBundle === "object") return preparePocketModelBundle(customBundle);
  if (_cachedBundle) return _cachedBundle;
  throw new Error("dislop pocket model bundle not initialized.");
}
`
  )
  .replace(
    /export function extractPocketFeatures\(text, bundle\) \{\n/,
    `export function extractPocketFeatures(text, bundle) {\n  preparePocketModelBundle(bundle);\n`
  )
  .replace(
    /const bundle = customBundle \|\| loadPocketModelBundle\(\);/g,
    `const bundle = preparePocketModelBundle(customBundle || loadPocketModelBundle());`
  );
fs.writeFileSync(path.join(ENGINE_OUT, "pocket-model.mjs"), pocketModelSrc, "utf8");

// Compile patterns/banks/*.json into browser module
const banksDir = path.join(ROOT, "patterns", "banks");
const browserPatternBanks = {};
if (fs.existsSync(banksDir)) {
  for (const entry of fs.readdirSync(banksDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      const bankKey = entry.name.replace(/\.json$/, "");
      browserPatternBanks[bankKey] = JSON.parse(fs.readFileSync(path.join(banksDir, entry.name), "utf8"));
    }
  }
}
fs.writeFileSync(
  path.join(ENGINE_OUT, "patterns-data.mjs"),
  `// Auto-generated by scripts/build_site.mjs from patterns/banks/*.json — do not hand-edit.\nexport const PATTERN_BANKS = ${JSON.stringify(browserPatternBanks)};\n`,
  "utf8"
);

// Compile models/pocket-slop-v1.json into lazy-loadable browser module
const pocketModelJson = JSON.parse(fs.readFileSync(path.join(ROOT, "models", "pocket-slop-v1.json"), "utf8"));
fs.writeFileSync(
  path.join(ENGINE_OUT, "pocket-model-data.mjs"),
  `// Auto-generated by scripts/build_site.mjs from models/pocket-slop-v1.json — do not hand-edit.\nexport const POCKET_MODEL_BUNDLE = ${JSON.stringify(pocketModelJson)};\n`,
  "utf8"
);
fs.copyFileSync(path.join(ROOT, "assets", "logo.svg"), path.join(ASSETS_OUT, "logo.svg"));
fs.copyFileSync(path.join(ROOT, "assets", "og-card.svg"), path.join(ASSETS_OUT, "og-card.svg"));
fs.copyFileSync(path.join(ROOT, "assets", "og-card.png"), path.join(ASSETS_OUT, "og-card.png"));
fs.copyFileSync(path.join(ROOT, "assets", "og-card-zh.svg"), path.join(ASSETS_OUT, "og-card-zh.svg"));
fs.copyFileSync(path.join(ROOT, "assets", "og-card-zh.png"), path.join(ASSETS_OUT, "og-card-zh.png"));

const DEMOS_SRC = path.join(ROOT, "assets", "demos");
const DEMOS_OUT = path.join(ASSETS_OUT, "demos");
if (fs.existsSync(DEMOS_SRC)) {
  fs.mkdirSync(DEMOS_OUT, { recursive: true });
  for (const fname of fs.readdirSync(DEMOS_SRC)) {
    if (fname.endsWith(".gif") || fname.endsWith(".webp") || fname.endsWith(".png")) {
      fs.copyFileSync(path.join(DEMOS_SRC, fname), path.join(DEMOS_OUT, fname));
    }
  }
}

// Build browser packs bundle WITHOUT shipping bulk test fixtures; preserve only minimal
// sanitized demo samples for the rules whose exemplar.bad is prose rather than raw markup.
const DEMO_FALLBACK_RULES = new Set(["zh-essay-moralizing-ending", "ui-pill-soup"]);
const browserPacksById = {};
for (const [pid, pack] of Object.entries(packsById)) {
  browserPacksById[pid] = {
    ...pack,
    rules: (pack.rules || []).map((r) => {
      const { fixtures, ...rest } = r;
      const sanitizedEx = rest.exemplar
        ? {
            ...rest.exemplar,
            bad: sanitizePublicExemplar(rest.exemplar.bad),
            ...(rest.exemplar.trap ? { trap: sanitizePublicExemplar(rest.exemplar.trap) } : {}),
            good: sanitizePublicExemplar(rest.exemplar.good),
          }
        : undefined;
      const outRule = { ...rest, ...(sanitizedEx ? { exemplar: sanitizedEx } : {}) };
      if (DEMO_FALLBACK_RULES.has(r.id) && fixtures?.hit?.[0]) {
        outRule.demo = {
          bad: sanitizePublicExemplar(fixtures.hit[0]),
          ...(fixtures.clean?.[0] ? { good: sanitizePublicExemplar(fixtures.clean[0]) } : {}),
        };
      }
      return outRule;
    }),
  };
}

// Localized UI metadata & strictly language-pure exemplars for site/ (ZH shows only ZH examples; EN shows only EN examples).
const RULE_UI_META = {
  "unfilled-placeholder": {
    lang: "both",
    title: { zh: "忘了填的占位符", en: "Unfilled placeholder" },
    zhEx: {
      bad: "第三季度清分覆盖 14 条通道，p95 延迟见【待补充】。",
      trap: "第三季度清分在 14 条通道上表现大幅提升。",
      good: "第三季度清分覆盖 14 条通道（p95 延迟待压测签字后补齐）。",
    },
  },
  "chatbot-artifact": {
    lang: "both",
    title: { zh: "留在正文里的 AI 寒暄", en: "Chatbot greeting" },
    zhEx: {
      bad: "好的，以下是修改后的上线说明：集群 B 已于 02:00 UTC 完成迁移。",
      trap: "没问题，集群 B 已于 02:00 UTC 完成迁移。",
      good: "集群 B 已于 02:00 UTC 完成迁移。",
    },
  },
  "markdown-leak": {
    lang: "both",
    title: { zh: "没渲染的 Markdown 符号", en: "Raw Markdown in Office doc" },
    zhEx: {
      bad: "**核心节点**：周五前完成 v0.2 解析器上线。",
      good: "核心节点：周五前完成 v0.2 解析器上线（在 Word/PPT 里直接加粗）。",
    },
  },
  "ui-dead-control": {
    lang: "both",
    title: { zh: "点不动的假按钮或空链接", en: "Dead placeholder link or button" },
    zhEx: {
      bad: '<a href="#" class="btn">下载完整报告</a>',
      good: '<a href="./report.html" class="btn">下载完整报告</a>',
    },
  },
  "en-throat-clearing-opener": { lang: "en", title: { zh: "英文铺垫开场白", en: "Throat-clearing opener" } },
  "en-cliche-lexicon": { lang: "en", title: { zh: "英文高频套词", en: "Stock AI buzzword" } },
  "zh-bureaucratic-padding": { lang: "zh", title: { zh: "公文黑话与空泛词", en: "Chinese bureaucratic padding" } },
  "negation-pivot-frame": {
    lang: "both",
    title: { zh: "“不是 A，而是 B”套句", en: '"Not X, but Y" slogan frame' },
    enEx: {
      bad: "This isn't just a linter — it's a paradigm shift for your whole team.",
      trap: "Not a tool. A standard. A promise.",
      good: "The linter catches leaked paths, unfilled brackets, and dropped qualifiers before release.",
    },
  },
  "staccato-slogan-run": { lang: "en", title: { zh: "英文短句口号连发", en: "Staccato slogan chain" } },
  "zh-four-char-triad": { lang: "zh", title: { zh: "四字排比串", en: "Chinese four-character triad" } },
  "unsourced-attribution": {
    lang: "both",
    title: { zh: "没写明出处的“研究表明”", en: "Unsourced claim" },
    zhEx: {
      bad: "业内普遍认为，超过 70% 的演示文稿存在对比度问题。",
      trap: "专家指出，大部分演示文稿都看不清。",
      good: "2026 年 3 月抽查的 40 份内部简报里，有 28 份存在对比度不足。",
    },
  },
  "bold-lead-list-wall": {
    lang: "both",
    title: { zh: "满屏“加粗词 + 冒号”清单", en: "Bold-lead bullet wall" },
    zhEx: {
      bad: "- **速度**：本地运行很快。\n- **隐私**：不上传文件。\n- **准确**：只看确定规则。\n- **易用**：一行命令开跑。",
      good: "全部检查都在本地零依赖完成，不上传文件；终端里一行命令即可直接跑完。",
    },
  },
  "zh-essay-moralizing-ending": { lang: "zh", title: { zh: "段尾说教式升华", en: "Chinese moralizing ending" } },
  "en-essay-moralizing-ending": { lang: "en", title: { zh: "英文段尾升华", en: "Moralizing ending" } },
  "literary-negation-pivot": {
    lang: "both",
    title: { zh: "金句腔“不是……而是……”", en: 'Aphorism "not X, but Y"' },
    enEx: {
      bad: "His grandfather's plane wasn't a tool — it was a quiet testament to patience.",
      trap: "Wood remembers. Hands speak.",
      good: "His grandfather's beechwood plane had been sharpened until the iron was half its original length.",
    },
  },
  "excessive-em-dash-density": { lang: "en", title: { zh: "破折号太密", en: "Too many em-dashes" } },
  "zh-halfwidth-punctuation": { lang: "zh", title: { zh: "中文里混了半角标点", en: "Half-width punctuation in Chinese" } },
  "slide-word-wall": {
    lang: "both",
    title: { zh: "单页 PPT 字太多", en: "Slide word wall" },
    zhEx: {
      bad: "第 3 页塞了 340 字完整长段落解释数据迁移方案与回滚步骤。",
      good: "拆成 3 条要点（每条不超过 20 字），把详细回滚步骤移到演讲者备注。",
    },
  },
  "slide-bullet-overload": {
    lang: "both",
    title: { zh: "单页要点超过 6 条", en: "Too many bullets on one slide" },
    zhEx: {
      bad: "同一页 PPT 竖排堆了 9 条并列要点，同时讲定价、排期和风险。",
      good: "拆成「定价」和「排期与风险」两页，每页只留 3–4 条。",
    },
  },
  "slide-autofit-shrink": {
    lang: "both",
    title: { zh: "PPT 文字被硬缩太小", en: "Slide text auto-shrunk too small" },
    zhEx: {
      bad: "文本框触发自动缩排，字号被压缩到原来的 62.5%。",
      good: "删减约 40% 冗余文字，恢复原始正文字号。",
    },
  },
  "slide-weak-topic-title": {
    lang: "both",
    title: { zh: "幻灯片标题太泛", en: "Generic slide title" },
    zhEx: {
      bad: "标题只写「项目背景」（下方塞了 65 字讲购物车流失 38%）。",
      good: "标题直给结论：「结算页第 3 步造成 38% 购物车流失」。",
    },
  },
  "ui-ai-gradient": {
    lang: "both",
    title: { zh: "默认紫粉霓虹渐变", en: "Default purple-pink AI gradient" },
    zhEx: {
      bad: '<h1 class="bg-gradient-to-r from-indigo via-purple to-pink bg-clip-text text-transparent">智能工作流</h1>',
      good: '<h1 class="page-title">本地审校工作台</h1>',
    },
  },
  "ui-pill-soup": {
    lang: "both",
    title: { zh: "满屏胶囊小标签", en: "Pill-badge soup" },
    zhEx: {
      bad: "一张卡片上连排 8 个圆角胶囊标签：运行中、v2.4、专业版、AI 驱动、已验证、快速、安全、开源。",
      good: "只留 1 个状态文字，其余写成一行轻元数据。",
    },
  },
  "ui-box-in-box": {
    lang: "both",
    title: { zh: "框套框套框（三层套盒）", en: "Three-level nested boxes" },
    zhEx: {
      bad: '<div class="border rounded-xl p-6"><div class="border rounded-lg p-4"><div class="border rounded p-3">指标</div></div></div>',
      good: '<section class="metric-row"><h3>延迟</h3><p>18 毫秒</p></section>',
    },
  },
  "ui-prompt-echo-badge": {
    lang: "both",
    title: { zh: "把提示词印成了界面徽章", en: "Prompt-echo marketing badge" },
    zhEx: {
      bad: '<span class="eyebrow">AI-Powered · Zero Hallucination</span>',
      good: '<span class="section-meta">本地离线运行</span>',
    },
  },
  "ui-glow-blob-chrome": {
    lang: "both",
    title: { zh: "霓虹光晕球与闪烁圆点", en: "Ambient glow orbs & pulsing dots" },
    zhEx: {
      bad: '<div class="blur-3xl rounded-full bg-purple-500/30"></div><button class="shadow-indigo-500/50">启动</button>',
      good: '<section class="surface-sheet border"><button class="btn-primary">运行检查</button></section>',
    },
  },
  "ui-emoji-icon-chrome": {
    lang: "both",
    title: { zh: "界面标题堆砌通用 Emoji", en: "Decorative emoji UI chrome" },
    zhEx: {
      bad: "<h3>🚀 极速启动</h3><h3>⚡ 智能同步</h3><h3>🛡️ 安全加固</h3>",
      good: "<h3>50 毫秒本地检查</h3><h3>增量同步</h3><h3>离线零上传</h3>",
    },
  },
  "ui-template-card-grid": {
    lang: "both",
    title: { zh: "彩色图标方块与假窗口三点", en: "Icon-tile grid & fake window dots" },
    zhEx: {
      bad: '<div class="rounded-xl w-10 h-10 bg-indigo-50">A</div><div class="rounded-xl w-10 h-10 bg-purple-50">B</div><div class="rounded-xl w-10 h-10 bg-pink-50">C</div>',
      good: '<section class="grid"><div><h3>命令行</h3><p>本地检查文稿与幻灯片。</p></div></section>',
    },
  },
  "svg-layout-slop": {
    lang: "both",
    title: { zh: "SVG 缺 viewBox 或文字重叠", en: "SVG missing viewBox or text overlap" },
    zhEx: {
      bad: '<svg width="640" height="360"><text x="40" y="50">步骤一</text><text x="42" y="52">重叠字</text></svg>',
      good: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360"><text x="40" y="50">步骤一</text><text x="40" y="96">步骤二</text></svg>',
    },
  },
  "image-ai-workflow-residue": {
    lang: "both",
    title: { zh: "图片残留生成参数或来源标识", en: "Image AI workflow residue & provenance" },
    zhEx: {
      bad: "PNG 文本块残留 `Negative prompt: blurry\\nSteps: 28, CFG scale: 7` 生成参数。",
      good: "交付前剥除内部提示词与节点图 JSON，依法保留面向公众的来源声明。",
    },
  },
  "image-ai-palette-slop": {
    lang: "both",
    title: { zh: "PNG 霓虹紫粉或高饱和塑料质感", en: "PNG neon purple palette or plastic sheen" },
    zhEx: {
      bad: "暗底上高占比紫粉霓虹渐变，或缺乏自然微对比的光滑高饱和表面。",
      good: "克制底色配自然纹理细节，关键强调色控制在局部。",
    },
  },
  "pdf-visual-layout-slop": {
    lang: "both",
    title: { zh: "PDF 纯图幻灯片或字阶扁平", en: "PDF raster slides or flat typography" },
    zhEx: {
      bad: "连续多页横版 PDF 全是整页位图，或把正文缩到 8.5pt 挤满纯字页面。",
      good: "保留可选矢量文字，保持 1.2 倍以上标题正文字号阶梯并穿插图表。",
    },
  },
  "cooccurrence-slop-cluster": {
    lang: "both",
    title: { zh: "低事实段落堆叠空泛动词", en: "Buzzword cluster in fact-free paragraph" },
    enEx: {
      bad: "This workflow upgrade leverages cross-functional alignment to streamline daily operations, fostering robust collaboration across stakeholders.",
      trap: "Workflow upgrades aren't about process — they're about team velocity.",
      good: "Splitting triage into 3 priority queues cut median first-response time from 110s to 42s in week one.",
    },
  },
  "semicolon-tricolon": {
    lang: "both",
    title: { zh: "三段对称分号推销句", en: "Three-part balanced semicolon pitch" },
    enEx: {
      bad: "The client validates forms on input; the worker isolates slow jobs in queues; the dashboard tracks every timeout live.",
      trap: "Validate early. Queue smart. Track live.",
      good: "The client validates fields on input, slow jobs run in a separate queue, and requests over 5s trigger an on-call alert.",
    },
  },
  "rhetorical-qa-cadence": {
    lang: "both",
    title: { zh: "自问自答式营销设问", en: "Self-answered rhetorical Q&A" },
    zhEx: {
      bad: "为什么很多内部看板上线两周就没人打开？因为上面只有汇总虚荣数字而没有下一步动作。结果呢？业务每周一还是手动导表格。",
      trap: "看板失灵。数字堆砌。全靠导表。",
      good: "内部看板如果只摆汇总数字、不标异常订单，运营每周一还是得手动导出表格排查。",
    },
  },
  "comma-chain-runon": {
    lang: "both",
    title: { zh: "五连逗号一逗到底长句", en: "Five-comma run-on chain" },
    enEx: {
      bad: "By aligning cross-team priorities, defining milestone gates, refining review checklists, centralizing runbooks, expanding alert coverage, and automating rollbacks, we improved release stability.",
      trap: "Align teams. Define gates. Automate rollbacks.",
      good: "Fixing Tuesday design reviews and wiring HTTP 5xx auto-rollback cut post-release hotfixes by 40% this quarter.",
    },
  },
  "narrative-sandwich-frame": {
    lang: "both",
    title: { zh: "趋势帽开场与展望帽收尾", en: "Macro-trend opener or future-gazing closer" },
    enEx: {
      bad: "As organizations navigate rapid digital transformation, CI pipelines face new demands. Furthermore, static checks are growing. Moreover, docs matter. Additionally, workflows evolve. Looking ahead, teams that adapt will thrive.",
      trap: "Pipelines change. Checks grow. Teams adapt.",
      good: "Adding static doc checks to CI in November caught configuration typos 18 minutes earlier per PR; 4 more repos join next week.",
    },
  },
  "template-skeleton-echo": {
    lang: "both",
    title: { zh: "连续三段同构句首填表腔", en: "Repeated paragraph-opener skeleton" },
    enEx: {
      bad: "By standardizing log schemas, teams query events faster.\n\nBy automating nightly compaction, storage stays predictable.\n\nBy surfacing error budgets, on-call engineers spot regressions early.",
      trap: "Standardize logs. Compact nightly. Surface budgets.",
      good: "Standardized log schemas speed up ad-hoc queries, nightly compaction caps disk growth, and error-budget alerts catch regressions early.",
    },
  },
  "low-burstiness-vapor": {
    lang: "both",
    title: { zh: "句长齐平且缺具体事实", en: "Flat sentence rhythm with zero concrete facts" },
    enEx: {
      bad: "The platform focuses on improving overall developer productivity. System modules maintain clean architectural boundaries. Team workflows follow consistent operational standards. Product releases progress steadily toward core goals. Customer feedback reflects positive adoption trends.",
      trap: "Productivity rises. Boundaries hold. Releases ship.",
      good: "Cutting the home bundle from 420 KB to 145 KB dropped mobile first paint to 0.9s, and 3 backend engineers now rotate weekly via `ops/oncall.yaml`.",
    },
  },
  "zh-dev-jargon": {
    lang: "zh",
    title: { zh: "中文研发与产品自嗨黑话", en: "Chinese dev/product buzzword cluster" },
  },
  "zh-exclamation": {
    lang: "zh",
    title: { zh: "中文正文鸡血感叹号", en: "Chinese hype exclamation marks" },
  },
  "zh-mega-sentence": {
    lang: "zh",
    title: { zh: "中文超长一逗到底单句", en: "Chinese mega run-on sentence" },
  },
  "unsourced-statistic": {
    lang: "both",
    title: { zh: "无基线/出处的百分比宣称", en: "Unsourced percentage claim" },
    zhEx: {
      bad: "接入该工作流后，团队交付效率提升 45%，运营成本节省 30%。",
      trap: "效率暴涨。成本骤降。交付跃迁。",
      good: "在 12 个仓库的 112 份样本实测中，人工复核耗时从 18 分钟降到 10 分钟（按 CI 日志统计）。",
    },
  },
  "literary-semicolon-tricolon": {
    lang: "both",
    title: { zh: "散文三段分号排比腔", en: "Lyrical three-part semicolon balance" },
    enEx: {
      bad: "Water meets freshly ground beans; steam curls toward the kitchen ceiling; the first sip steadies a scattered morning.",
      trap: "Fresh beans. Curling steam. Steady morning.",
      good: "Boiling water hit the ground beans and sent steam up toward the low kitchen ceiling.",
    },
  },
  "literary-rhetorical-qa": {
    lang: "both",
    title: { zh: "随笔自问自答抒情腔", en: "Essay rhetorical self-Q&A" },
    zhEx: {
      bad: "早上六点半他照例冲了一壶手冲咖啡。为什么手冲咖啡总能让人安静下来？因为缓慢注水的节奏提醒我们停下脚步。",
      trap: "热水落下。香气升起。脚步放慢。",
      good: "早上六点半，他烧开水冲了一壶咖啡。",
    },
  },
  "literary-narrative-frame": {
    lang: "both",
    title: { zh: "随笔时代大帽子与升华尾", en: "Sweeping era opener in personal essay" },
    zhEx: {
      bad: "在当今被弹窗消息包围的快节奏时代里，七点前的巷子只有送奶车经过。未来，守住内心的片刻宁静依然是我们生活的必修课。",
      trap: "消息不断。奶车驶过。宁静仍在。",
      good: "早上七点前，巷子里只有送奶车经过。",
    },
  },
  "eng-pr-diff-parrot": {
    lang: "both",
    title: { zh: "空泛的 AI 提交摘要壳", en: "Empty AI PR diff summary" },
    enEx: {
      bad: "This PR updates the retry middleware to ensure a more seamless and resilient developer experience",
      trap: "This isn't a minor retry tweak — it's rock-solid resilience.",
      good: "Fixes #412: cap exponential backoff at 8s when upstream returns HTTP 503.",
    },
  },
  "eng-shallow-root-cause": {
    lang: "both",
    title: { zh: "复盘止步于“人为失误”", en: "Stop-thinking 'human error' root cause" },
    enEx: {
      bad: "Root cause: human error.",
      trap: "Root cause: engineer oversight during peak traffic.",
      good: "Root cause: deploy runner skipped schema validation when `--fast` was passed.",
    },
  },
  "eng-vague-action-item": {
    lang: "both",
    title: { zh: "无指标无负责人的改进项", en: "Unowned wishful action item" },
    enEx: {
      bad: "- [ ] Add more monitoring.",
      trap: "- [ ] Proactively strengthen observability across services.",
      good: "- [ ] Add P99 > 400ms alert on `checkout-api` (@payments-oncall, due 2026-11-30).",
    },
  },
  "slide-process-not-finding-title": {
    lang: "both",
    title: { zh: "汇报标题只写“关于……的分析”", en: "Process-label slide title instead of takeaway" },
    enEx: {
      bad: "## Analysis of Q3 Churn Drop (6.2% to 4.1%)",
      trap: "## Reimagining Customer Retention Excellence (6.2% to 4.1%)",
      good: "## Q3 Customer Churn Dropped from 6.2% to 4.1%",
    },
  },
  "pptx-layout-monotony": {
    lang: "both",
    title: { zh: "连续 4 页纯文字同版式 PPT", en: "4+ consecutive identical bullet slides" },
    zhEx: {
      bad: "第 2 至第 5 页连续使用完全相同的「标题 + 4 条纯文字要点」版式，无一页表格或图表。",
      trap: "第 2 至第 5 页保留同样的 4 条纯文字，只给每页贴了四个装饰图标。",
      good: "第 3 页改为四行区域延迟对照表，第 4 页改为周度错误率折线图。",
    },
  },
  "reg-unsubstantiated-superlative": {
    lang: "both",
    title: { zh: "绝对化承诺与极限合规词", en: "Unsubstantiated '100% / zero-risk' claim" },
    enEx: {
      bad: "Our AES-256 vault is 100% secure with a zero-risk migration (99.95% monthly SLA).",
      trap: "Our AES-256 vault is an unbreakable fortress for enterprise data (99.95% monthly SLA).",
      good: "Backups use AES-256 encryption at rest and carry a 99.95% monthly uptime SLA.",
    },
  },
  "reg-unanchored-multiplier": {
    lang: "both",
    title: { zh: "无基线的悬空倍数宣称", en: "Multiplier claim without baseline" },
    enEx: {
      bad: "Streaming batch export makes monthly statements 10x faster.",
      trap: "Streaming batch export transforms monthly statements at lightning speed.",
      good: "Streaming batch export writes rows directly without buffering the full table in memory.",
    },
  },
};

const packsModule = `// Auto-generated by scripts/build_site.mjs from packs/*/pack.json (test fixtures stripped) — do not hand-edit.\nexport const PACKS_BY_ID = ${JSON.stringify(browserPacksById, null, 2)};\nexport const RULE_UI_META = ${JSON.stringify(RULE_UI_META, null, 2)};\n`;
fs.writeFileSync(path.join(ENGINE_OUT, "packs-data.mjs"), packsModule, "utf8");

const awesomeModule = `// Auto-generated by scripts/build_site.mjs from docs/research/anti-slop-radar-index.json — do not hand-edit.\nexport const AWESOME_DATA = ${JSON.stringify(radarData, null, 2)};\n`;
fs.writeFileSync(path.join(AWESOME_OUT, "awesome-data.mjs"), awesomeModule, "utf8");

// ---------- 2. Compile Agent-Native Static Documents ----------

const catalogResources = [];
function registerResource({ id, pillar, kind, titleEn, titleZh, relPath, modalities, languages, packs = [], relatedTools = [], content }) {
  const written = writeCleanFile(relPath, content, { isAgentText: true });
  const bytes = Buffer.byteLength(written, "utf8");
  catalogResources.push({
    id,
    pillar,
    kind,
    title: { en: titleEn, zh: titleZh },
    path: `/${relPath}`,
    modalities,
    languages,
    packs,
    bytes,
    approxTokens: approxTokens(written),
    relatedTools,
    sha256: sha256Full(written),
  });
  return written;
}

// 2a. Homepage Pure Markdown Mirror (/index.md)
registerResource({
  id: "site-index",
  pillar: "methodology",
  kind: "site-mirror",
  titleEn: "dislop — Linter for AI Slop",
  titleZh: "dislop — AI 味检查工具",
  relPath: "index.md",
  modalities: ["markdown", "text", "html", "css", "jsx", "svg", "docx", "pptx", "pdf", "image"],
  languages: ["en", "zh"],
  packs: PACK_ORDER,
  relatedTools: ["browser-workbench", "skill", "plugin", "mcp", "cli"],
  content: `---
content-type: reference-data
version: ${VERSION}
snapshot: ${SNAPSHOT_DATE}
---

# dislop — Cutting AI slop is real productivity.

A dedicated linter for AI slop. It brings together vetted community rules, corpus findings, and 90 curated tools to help you (and your agent) catch and fix AI-sounding text and template layouts in docs, web UI, and slides. Connects in one command to coding agents (Codex, Claude Code, Antigravity, Cursor), office agents (Claude Cowork, WorkBuddy, Qwen), and editors, and can run completely offline locally.

- Product brief (EN/ZH): ${BASE_URL}/methodology/product-brief.md
- Runtime dependencies: 0 (pure-Markdown Skill and local CLI run offline with zero uploads)
- Live browser workbench: ${BASE_URL}/#workbench (offline local checks + sign-in Cloud MCP mode, \`CSP: connect-src 'self'\`)
- Official Cloud MCP: ${BASE_URL}/mcp (0-credit \`dislop_check\`/\`dislop_verify\`/\`dislop_rules\` without login; sign in via ${BASE_URL}/#pricing for 30 free monthly credits on AI tools)
- MCP Server Card: ${BASE_URL}/.well-known/mcp/server-card.json
- Agent Skills Index: ${BASE_URL}/.well-known/agent-skills/index.json
- Agent routing index: ${BASE_URL}/llms.txt
- Machine-readable catalog: ${BASE_URL}/catalog.json
- Awesome Anti-Slop (90 curated entries): ${BASE_URL}/awesome/

## Coverage & Honest Boundaries

| Target | Formats / Scope | Status |
|---|---|---|
| Writing, Specs, RFCs & Copy | \`.md\`, \`.mdx\`, \`.txt\` (EN & ZH, 7 built-in packs, 65 patterns across 6 dimensions) | LIVE \`v${VERSION}\` |
| Word, PowerPoint & Slides | \`.docx\`, \`.pptx\`, landscape \`.pdf\` (incl. layout monotony, raster decks & type scale) | LIVE \`v${VERSION}\` |
| Web UI, SVG & Images | \`.html\`, \`.css\`, \`.jsx\`, \`.tsx\`, \`.svg\`, \`.png\`, \`.jpg\`, \`.webp\` | LIVE \`v${VERSION}\` |
| Offline Voice & Pocket ML | \`dislop voice\` (\`dislop.voice/1\`) & 14.6 KB \`--ml\` stealth-vapor scorer | LIVE \`v${VERSION}\` |
| Optional Local Small Models | \`dislop model\` hardware-aware advisor (\`0.6B\` / \`1.7B\` / \`4B\`) | LIVE \`v${VERSION}\` |
| Git Diffs & PRs | \`--changed\` / \`--staged\` & SARIF 2.1.0 | LIVE (diff check) · Roadmap (code AST) |

## Rule Layers

1. **AI Delivery Artifacts (\`packs/core\`, \`error\`)**: stray chatbot wrappers, unfilled placeholders, raw Markdown pasted into Word/PPT/PDF, and dead \`href="#"\` placeholder controls.
2. **Built-in Scenario Packs (\`warning\` / \`info\`)**: \`business-brief\`, \`engineering-spec\`, \`regulated-comms\`, \`literary-essay\`, \`deck-and-ui\`, and \`executive-deck\` (${allRules.length} built-in pack rules across 7 bundled packs, plus 12 extended pattern-bank probes for 65 structured patterns across 6 dimensions), each pairing a check question with \`bad -> trap -> good\` examples.

## Resource Pillars

- [Methodology](./methodology/index.md): Deletion Test, anti-pattern map, positive divergence, and visual design system.
- [Cases](./cases/index.md): \`bad -> trap -> good\` revision contrasts, repository self-dogfooding audit, and 31 non-mainstream design references.
- [Tools](./tools/index.md): Browser workbench, canonical \`SKILL.md\`, Claude Code Plugin (\`.claude-plugin/\`), CLI, MCP, Hooks, and SDK.
- [Awesome Anti-Slop](./awesome/index.md): 90 verified anti-slop tools, standards, benchmarks, and policies (\`dislop.radar/2\`).
`,
});

// 2b. Methodology Pillar
registerResource({
  id: "methodology-index",
  pillar: "methodology",
  kind: "pillar-index",
  titleEn: "Methodology Index",
  titleZh: "方法论导航",
  relPath: "methodology/index.md",
  modalities: ["markdown", "text", "html", "css", "svg", "docx", "pptx"],
  languages: ["en", "zh"],
  packs: PACK_ORDER,
  relatedTools: ["skill", "plugin", "cli", "mcp"],
  content: `---
content-type: reference-data
version: ${VERSION}
---

# dislop Methodology

Read only the focused document matching your current task:

- [Product Brief (EN/ZH)](./product-brief.md): Core positioning, users (coding/office/general AI users and their agents), selling points, and one-sentence pitch.
- [Deletion Test & Anti-Slop Loop](./deletion-test.md): Why banning flat word lists causes second-order slogans, and how the \`prevent -> check -> clean up -> re-check\` loop works.
- [Cross-Modality Anti-Pattern Map](./anti-pattern-map.md): How dislop groups 65 anti-slop patterns across prose, Web UI, SVG, images, Word, PowerPoint, and PDF.
- [Positive Divergence & Personalization (Draft)](./positive-divergence.md): Keeping structure varied, \`dislop.voice/1\` offline stylometrics, and \`dislop.taste/1\` positive design cards.
- [Brand & Voice Guide](./brand-and-voice.md): Plain maker voice grounded in ASD-STE100 plain prose and our own copy before/after edits.
- [Visual & Typographic Design System](./design-system.md): Color, type, and grid tokens plus anti-template layout rules.
`,
});

registerResource({
  id: "methodology-deletion-test",
  pillar: "methodology",
  kind: "guide",
  titleEn: "Deletion Test & Anti-Slop Editing Loop",
  titleZh: "删除测试与去 AI 味改稿闭环",
  relPath: "methodology/deletion-test.md",
  modalities: ["markdown", "text", "docx", "pptx"],
  languages: ["en", "zh"],
  packs: ["core", "business-brief", "literary-essay"],
  relatedTools: ["skill", "cli", "mcp", "browser-workbench"],
  content: `---
content-type: reference-data
version: ${VERSION}
---

# Deletion Test & Anti-Slop Editing Loop

## Why Flat Banned-Word Lists Fail

1. **False positives on real domain nouns**: Flat word lists flag \`Delve\` (Go debugger), \`wool tapestry\`, or literal numeric corrections (\`重试窗口不是 5 秒，而是 60 秒\`).
2. **Second-order displacement**: When models lose stock adjectives, they pivot to structural templates such as binary contrast slogans (\`"It's not just X — it's Y"\`) or three-word staccato chains (\`"Signals drop. Photos vanish. Trust dies."\`).
3. **Third-order cadence slop**: Even with \`0\` linter findings, 3-part semicolon pitches, editorial roleplay, and pull-quote closers still sound synthetic.

## Four-Step Loop

1. **Step 1 — Prevent while drafting (\`SKILL.md\`)**:
   - Lead with a concrete fact, example, number, or command; avoid 3-part semicolon pitches, pull-quote closers, and default AI UI templates upfront.
2. **Step 2 — Deterministic Check (\`dislop check\` / \`dislop_check\`)**:
   - Resolve every \`packs/core\` \`error\` first (stray chat wrappers, unfilled placeholders, raw Markdown in Word/PPT, dead \`href="#"\` links).
   - Review style and template \`warning\` / \`info\` findings locally.
3. **Step 3 — Deletion Test**:
   - Apply each rule's check question to the flagged span only.
   - Ask what concrete mechanism, measurement, or boundary remains if the filler phrase is deleted.
   - Keep code blocks, inline code, URLs, and quoted primary sources intact; never invent facts or numbers.
4. **Step 4 — Re-Check**:
   - Run \`dislop check\` again to confirm no second-order slogan families (\`frame/negation-pivot\`, \`frame/staccato\`, \`frame/triad\`, \`frame/ending\`, \`frame/list-wall\`) were introduced during editing.
`,
});

registerResource({
  id: "methodology-anti-pattern-map",
  pillar: "methodology",
  kind: "guide",
  titleEn: "Cross-Modality Anti-Pattern Map",
  titleZh: "跨媒介反模式图谱",
  relPath: "methodology/anti-pattern-map.md",
  modalities: ["markdown", "text", "html", "css", "jsx", "svg", "docx", "pptx"],
  languages: ["en", "zh"],
  packs: PACK_ORDER,
  relatedTools: ["cli", "mcp"],
  content: `---
content-type: reference-data
version: ${VERSION}
---

# Cross-Modality Anti-Pattern Map

\`dislop\` ships 65 structured anti-slop patterns across 6 dimensions in \`v${VERSION}\` (${allRules.length} built-in pack rules across 7 packs + 12 extended pattern-bank probes), plus an offline 14.6 KB Pocket ML scorer (\`--ml\`) for uniform-cadence vapor prose.

| Category | What It Covers | Shipped \`v${VERSION}\` Offline Coverage |
|---|---|---|
| **AI Delivery Artifacts** | Obvious AI leftovers (\`severity: error\`) | \`packs/core\`: stray chatbot wrappers, unfilled placeholders, raw Markdown in DOCX/PPTX, dead \`href="#"\` placeholder controls |
| **Stock Lexicon & Default UI** | Filler words and default generator chrome | \`en-cliche-lexicon\`, \`en-throat-clearing-opener\`, \`zh-bureaucratic-padding\`, \`ui-ai-gradient\`, \`ui-pill-soup\`, \`ui-box-in-box\`, \`ui-prompt-echo-badge\`, plus pattern-bank probes \`ui-glassmorphism-overuse\` and \`ui-accent-stripe-card\` |
| **Cadence, Frames & Slide Layout** | Structural fallback after banning stock words | \`negation-pivot-frame\`, \`staccato-slogan-run\`, \`zh-four-char-triad\`, \`semicolon-tricolon\`, \`rhetorical-qa-cadence\`, \`comma-chain-runon\`, \`narrative-sandwich-frame\`, \`template-skeleton-echo\`, \`low-burstiness-vapor\`, \`zh/en-essay-moralizing-ending\`, \`bold-lead-list-wall\`, \`excessive-em-dash-density\`, \`zh-halfwidth-punctuation\`, slide word-walls/bullets/autofit/weak-titles, \`pptx-layout-monotony\`, and extended pattern-bank probes |
| **Domain Specs, Voice & Craft** | Engineering/regulated slop, personal cadence, and visual craft | \`engineering-spec\`, \`regulated-comms\`, and \`executive-deck\` packs; \`SKILL.md\` plain writing & UI rules; 31 print/type design references; \`dislop voice\` (\`dislop.voice/1\`) offline stylometrics; 14.6 KB \`--ml\` Pocket ML scorer; optional local small models (\`dislop model\`) |

## Coverage Honesty Principle

Uninspectable artifacts (corrupted archives, non-UTF-8 files) are reported explicitly as \`[SKIP]\` and exit \`2\` on single-file checks. \`dislop\` never reports an uninspected artifact as clean.
`,
});

registerResource({
  id: "methodology-positive-divergence",
  pillar: "methodology",
  kind: "guide",
  titleEn: "Positive Divergence & Personalization (Draft Protocols)",
  titleZh: "正向差异化与个性化协议（草案）",
  relPath: "methodology/positive-divergence.md",
  modalities: ["markdown", "text", "html", "css", "pptx"],
  languages: ["en", "zh"],
  packs: ["core", "business-brief", "literary-essay", "deck-and-ui"],
  relatedTools: ["browser-workbench", "skill"],
  content: `---
content-type: reference-data
version: ${VERSION}
status: draft-protocol
---

# Positive Divergence & Personalization (Draft Spec)

Empirical studies (Padmakumar & He, ICLR 2024; Doshi & Hauser, Science Advances 2024; Jiang et al., NeurIPS 2025 *Artificial Hivemind*) show post-trained LLMs exhibit both intra-model repetition and inter-model homogeneity. Swapping models or banning stock words alone pushes outputs toward safe statistical means or second-order templates.

## Three Practical Layers

1. **Clear hard leftovers first**: Strip obvious AI delivery artifacts (\`packs/core\`).
2. **Vary the structure**: Use Verbalized Sampling (Zhang et al., 2025) and distinct prose skeletons instead of one default summary template:
   - \`S1 Decision Ledger\`: 1-sentence conclusion -> measured sample & metrics -> explicit limitation -> concrete next action.
   - \`S2 Mechanism Teardown\`: observed anomaly -> flawed intuition -> underlying mechanism -> bounded fix.
   - \`S3 Field Note\`: time/place/physical detail -> direct quote or observation -> stop on final concrete image.
   - \`S4 Technical Spec\`: capability matrix -> explicit non-goals -> failure modes/exit codes -> minimal example.
3. **Check the finished draft**: Run \`dislop check\` to catch core errors, second-order slogan displacement, and cross-document template repetition.

## Draft Schemas (Zero-LLM Core)

- **\`dislop.voice/1\` (Local Voice Profile)**: Offline stylometric target bands computed from an author's own historical drafts (e.g., EN sentence-length CV \`[${voiceProfileExample.stylometricTargetBands.en.sentenceLengthCV.join(", ")}]\`, ZH sentence-length CV \`[${voiceProfileExample.stylometricTargetBands.zh.sentenceLengthCV.join(", ")}]\`, max em-dashes, private bans in \`.dislop.local/voice.json\`).
- **\`dislop.taste/1\` (Positive Design Card)**: Abstract grid ratios, typography role stacks, color budgets (e.g., \`maxBorderRadiusPx: ${positiveDesignCard.layout.borderRadiusPx.max}\`, \`externalFontCdnAllowed: ${positiveDesignCard.typography.externalFontCdnAllowed}\`), and static assertions derived from print, Swiss editorial, and independent foundry traditions without copying third-party DOM or CSS.
`,
});

registerResource({
  id: "methodology-product-brief",
  pillar: "methodology",
  kind: "guide",
  titleEn: "Product Brief (Positioning, Users & Pitch)",
  titleZh: "产品定义（定位、用户、卖点与一句话介绍）",
  relPath: "methodology/product-brief.md",
  modalities: ["markdown", "text", "html", "css", "jsx", "docx", "pptx"],
  languages: ["en", "zh"],
  packs: PACK_ORDER,
  relatedTools: ["browser-workbench", "skill", "plugin", "cli", "mcp"],
  content: `---
content-type: reference-data
version: ${VERSION}
---

${canonicalProductBriefMd.replace(/\(\.\/docs\/brand-and-voice-guide\.zh-CN\.md\)/g, "(./brand-and-voice.md)")}`,
});

registerResource({
  id: "methodology-brand-voice",
  pillar: "methodology",
  kind: "guide",
  titleEn: "Brand Identity, Voice & Design Style Guide",
  titleZh: "品牌风格、表达规范与设计基准",
  relPath: "methodology/brand-and-voice.md",
  modalities: ["markdown", "text", "html", "css", "svg"],
  languages: ["en", "zh"],
  packs: PACK_ORDER,
  relatedTools: ["browser-workbench", "cli"],
  content: `---
content-type: reference-data
version: ${VERSION}
---

${canonicalBrandMd
  .replace("[简体中文](./brand-and-voice-guide.zh-CN.md)\n\n", "")
  .replace(/\(\.\.\/assets\/logo\.svg\)/g, `(${BASE_URL}/assets/logo.svg)`)
  .replace(/\(\.\/design-system\.md\)/g, "(./design-system.md)")
  .replace(/\(\.\/brand\/voice\.json\)/g, `(https://github.com/dislop-ai/dislop/blob/main/docs/brand/voice.json)`)}`,
});

registerResource({
  id: "methodology-design-system",
  pillar: "methodology",
  kind: "guide",
  titleEn: "Visual & Typographic Design System (Galley Proof)",
  titleZh: "视觉与排版设计规范（印刷校样体系）",
  relPath: "methodology/design-system.md",
  modalities: ["html", "css", "jsx", "svg"],
  languages: ["en", "zh"],
  packs: ["core", "deck-and-ui"],
  relatedTools: ["browser-workbench", "cli"],
  content: `---
content-type: reference-data
version: ${VERSION}
---

# Architectural Galley Proof Design System

\`dislop\` rejects both Generator Default #1 (dark slate + indigo/purple/pink neon gradients + pill soup) and Generator Default #2 (warm cream \`#F7F5F0\` + stone + terracotta fallback).

## Verified Surface & Mark Tokens (WCAG 2.2 AA)

| Token | Role | Light | Dark | Dark Lightness / Contrast |
|---|---|---|---|---|
| \`--pen\` | Drawn strokes (\`>= 2.5px\`) & logo loop | \`#F04438\` | \`#F04438\` | \`L* = 55.0\` (\`4.8:1\` on tile / \`4.7:1\` dark sheet) |
| \`--stage\` | Outer margin / viewport ground | \`#F6F7F5\` | \`#0E1012\` | \`L* = 4.6\` |
| \`--sheet\` | Primary column | \`#FFFFFF\` | \`#15181C\` | \`L* = 8.1\` (> stage) |
| \`--raised\` | Controls & hover | \`#ECEEE9\` | \`#1D2127\` | \`L* = 12.6\` (> sheet) |
| \`--inset\` | Code / input well | \`#F1F3F0\` | \`#0A0C0E\` | \`L* = 3.2\` (recessed) |
| \`--control-border\` | Inputs, selects & buttons | \`#767C85\` | \`#6F7784\` | \`4.2:1\` light / \`3.9:1\` dark (WCAG >= 3:1) |
| \`--control-border-quiet\` | Quiet tier-3 controls | \`#888E97\` | \`#636A76\` | \`3.3:1\` light / \`3.3:1\` dark (WCAG >= 3:1) |
| \`--ink-stage\` | Charcoal stage: agent prompt, terminal, demo room | \`#14171A\` | \`#14171A\` | Text \`#ECEEF0\` \`15.5:1\`, muted \`#A6ACB5\` \`7.9:1\`, red text \`#FF7A6B\` \`7.1:1\` |
| \`--ink\` | Primary ink | \`#14171A\` | \`#ECEEF0\` | \`18.0:1\` light / \`15.3:1\` dark |
| \`--mark-error\` | Hard AI artifact (\`error\`) | \`#B42318\` | \`#FF7A6B\` | \`6.6:1\` / \`7.0:1\` (2px solid) |
| \`--mark-warn\` | Cliché / template warning (\`warning\` / \`info\`) | \`#1B52B0\` | \`#85B4FF\` | \`7.3:1\` / \`8.5:1\` (1.5px dashed) |
| \`--ok\` | Clean pass & active UI state | \`#1E6B47\` | \`#6CD49B\` | \`6.5:1\` / \`9.8:1\` |

## Structural Rules Enforced on \`site/\`

- Zero external font CDNs, analytics, or third-party requests (\`CSP: connect-src 'self'\`; offline checks stay 0-upload by default).
- Continuous \`1px\` structural rails (\`max-width: 1240px\`); \`0px\` shared cell radii, \`6px\` button radii (\`5px\` compact), \`4px\` input wells; zero \`rounded-full\` badge soup.
- Red text and underlines (\`--mark-error\`) are reserved for objective invariant defects; the brand \`--pen\` only draws strokes of \`>= 2.5px\` (logo, hero dele stroke, current-selection bar).
- Measure capped at \`65ch\` (Latin) / \`36\` Han chars; line height \`1.68\` EN / \`1.82\` ZH; \`tabular-nums\` on coordinates and metrics.
`,
});

// 2c. Cases Pillar
registerResource({
  id: "cases-index",
  pillar: "cases",
  kind: "pillar-index",
  titleEn: "Cases & Specimens Index",
  titleZh: "正反案例与标本导航",
  relPath: "cases/index.md",
  modalities: ["markdown", "text", "html", "css", "svg", "docx", "pptx", "pdf"],
  languages: ["en", "zh"],
  packs: PACK_ORDER,
  relatedTools: ["browser-workbench", "cli", "mcp"],
  content: `---
content-type: reference-data
version: ${VERSION}
---

# Cases & Specimens

- [Copy & Structural Contrasts (\`bad -> trap -> good\`)](./copy-contrasts.md): Selected rule exemplars across business briefs, literary essays, Office/PDF, and Web UI, plus positive S1/S2 prose specimens.
- [Repository Self-Dogfooding Audit](./dogfood-audit.md): Raw AI-sounding pitch copy vs. plain \`dislop\` copy verified at 0 findings.
- [Non-Mainstream Design & Print References](./ui-specimens.md): ${positiveSources.entries.length} verified typography, independent print, editorial, and academic references (checked ${SNAPSHOT_DATE}).
`,
});

const contrastSections = PACK_ORDER.map((pid) => {
  const pack = packsById[pid];
  if (!pack) return "";
  const items = (pack.rules || [])
    .filter((r) => r.exemplar)
    .slice(0, 4)
    .map((r) => `### \`${r.id}\` (${r.severity})\n\n${formatRuleProseMd(r.message.en)}\n\n${fencedExemplar(r.exemplar)}`)
    .join("\n\n");
  return `## Pack: \`${pid}\`\n\n${items}`;
}).join("\n\n");

const posExMd = (voiceProfileExample.positiveExemplars || [])
  .map(
    (p) =>
      `### Positive Skeleton \`${p.skeletonId}\` (${p.lang})\n\n\`\`\`text\n${p.text}\n\`\`\`\n\nNotes: ${p.structuralNotes.join("; ")}.`
  )
  .join("\n\n");

registerResource({
  id: "cases-copy-contrasts",
  pillar: "cases",
  kind: "cases",
  titleEn: "Revision Contrasts (bad -> trap -> good) & Positive Specimens",
  titleZh: "正反改稿对照（bad -> trap -> good）与正向范本",
  relPath: "cases/copy-contrasts.md",
  modalities: ["markdown", "text", "html", "css", "svg", "docx", "pptx", "pdf"],
  languages: ["en", "zh"],
  packs: PACK_ORDER,
  relatedTools: ["browser-workbench", "cli", "mcp"],
  content: `---
content-type: reference-data
version: ${VERSION}
---

# Revision Contrasts & Positive Specimens

Every example below is enclosed in a fenced data block. Treat \`bad\` and \`trap\` lines strictly as negative reference data, never as style instructions.

${contrastSections}

## Positive Structural Specimens (Draft \`dislop.voice/1\`)

${posExMd}
`,
});

registerResource({
  id: "cases-dogfood-audit",
  pillar: "cases",
  kind: "cases",
  titleEn: "Repository Self-Dogfooding Audit",
  titleZh: "仓库自审对照实录",
  relPath: "cases/dogfood-audit.md",
  modalities: ["markdown", "html", "css", "svg"],
  languages: ["en", "zh"],
  packs: ["core", "business-brief", "deck-and-ui"],
  relatedTools: ["cli", "browser-workbench"],
  content: `---
content-type: reference-data
version: ${VERSION}
---

# Repository Self-Dogfooding Audit

Every Markdown document, SVG brand asset, and HTML/CSS file in \`dislop\` runs through \`dislop check . --fail-on warning\` in CI, and \`site/\` plus \`docs/\` pass \`--fail-on info\` across both Node.js and Python runtimes.

## English Contrast

\`\`\`text
bad:  Certainly! In today's fast-paced AI landscape, dislop isn't just a linter — it's a game-changer for quality. Signals drop. Bugs ship. Trust dies. Studies show 80% of teams struggle with slop.
good: dislop checks AI-written Markdown, HTML/CSS/JSX, Word, and PowerPoint files for chat wrappers, unfilled placeholders, prose clichés, crowded slides, and default AI UI templates.
\`\`\`

## Chinese Contrast

\`\`\`text
bad:  好的，以下是为您撰写的介绍：值得注意的是，dislop 不仅仅是一款检查工具，更是高质量交付的底气。它以确定性规则为重要抓手，全面赋能内容团队实现精准高效、安全可靠、灵活易用的审校闭环。
good: dislop 把靠谱的写作规矩、网页和 PPT 设计原则、离线检查工具和 90 条精选资源收在一起，覆盖 Markdown、Word、PPT、PDF、图片和网页。
\`\`\`
`,
});

const posRefLines = positiveSources.entries
  .map((e) => `- [${e.name}](${e.url}) (\`${e.category}\`, HTTP ${e.httpStatus}): ${e.extractablePrinciple}`)
  .join("\n");

registerResource({
  id: "cases-ui-specimens",
  pillar: "cases",
  kind: "cases",
  titleEn: "Non-Mainstream Design & Print References (31 Verified)",
  titleZh: "非主流设计与印刷参考源（31 条实测核验）",
  relPath: "cases/ui-specimens.md",
  modalities: ["html", "css", "svg", "pptx"],
  languages: ["en", "zh"],
  packs: ["deck-and-ui"],
  relatedTools: ["browser-workbench"],
  content: `---
content-type: reference-data
version: ${VERSION}
snapshot: ${SNAPSHOT_DATE}
---

# Non-Mainstream Design, Typography & Academic References

Verified on ${SNAPSHOT_DATE}. Policy: ${positiveSources.compliancePolicy}

${posRefLines}
`,
});

// 2d. Tools Pillar
registerResource({
  id: "tools-index",
  pillar: "tools",
  kind: "pillar-index",
  titleEn: "Tools & Multi-Surface Integration Guide",
  titleZh: "工具与多形态渐进接入导航",
  relPath: "tools/index.md",
  modalities: ["markdown", "text", "html", "css", "jsx", "svg", "docx", "pptx"],
  languages: ["en", "zh"],
  packs: PACK_ORDER,
  relatedTools: ["browser-workbench", "skill", "plugin", "cli", "mcp"],
  content: `---
content-type: reference-data
version: ${VERSION}
---

# dislop Tools & Usage Options

## Agent Evaluation, Install & Rollout Workflow

Users often hand [\`https://dislop.com/llms.txt\`](../llms.txt) directly to their coding or office agent with a one-line prompt. Follow this three-step workflow:

1. **Evaluate host & deliverables**: Inspect the user's current environment (Claude Code, Codex, Cursor, Windsurf, Gemini CLI, OpenClaw, GitHub Actions, or browser chat) and existing project files (\`.md\`, \`.txt\`, \`.html\`, \`.jsx\`, \`.svg\`, \`.docx\`, \`.pptx\`, or \`.pdf\`). Pick the lightest surface from the table below (Skill for low-token guidance, local CLI for zero-network deterministic gating and CI, or Official Cloud MCP when deep LLM review or \`.docx\`/\`.pptx\` visual/structural audit is needed).
2. **Install & configure**:
   - Agent Skill: \`npx --yes skills add dislop-ai/dislop --skill dislop\` (or use plugin marketplaces for Claude Code / Codex / Gemini CLI).
   - Local CLI (zero network): \`npx --yes dislop init\` (writes \`.dislop.json\` config/hooks) or \`uvx dislop check .\`.
   - Cloud MCP (optional): configure \`${BASE_URL}/mcp\` (anonymous \`dislop_check\` / \`dislop_rules\` at 0 credits; OAuth 2.1 or free key for \`dislop_review\` / \`dislop_deslop\` / \`dislop_office\`).
3. **Run first check & report**: Run \`npx --yes dislop check <target> --pack auto --compact --json\` on real workspace files (or pass text/files through \`dislop_check\`), summarize concrete \`error\` and \`warning\` hits, and offer to clean them without inventing facts.

Pick the lightest surface that fits your workflow:

| Surface | Status | How to start |
|---|---|---|
| Zero-Install Prompt & Static Pages | Live | Hand [\`/llms.txt\`](../llms.txt) or [\`/catalog.json\`](../catalog.json) to any web-capable AI, or test drafts offline in the [Browser Workbench](${BASE_URL}/#workbench). |
| Agent Skill (Pure-Markdown References) | Live | Install [\`SKILL.md\`](./skill.md) + bundled \`references/*.md\` (0 scripts, 0 network calls) with \`npx skills add dislop-ai/dislop\` in Claude Code, Codex, Cursor, Windsurf, or Antigravity. |
| Local CLI & Offline Voice | Live | See [\`/tools/cli-and-hooks.md\`](./cli-and-hooks.md) for zero-network Node (\`npx\`), Python (\`uvx\`), all 7 built-in packs, 65 patterns, 14.6 KB \`--ml\`, and \`dislop voice\`. |
| Official Cloud MCP | Live | Connect \`${BASE_URL}/mcp\` for 0-credit \`dislop_check\`, \`dislop_verify\`, and \`dislop_rules\` without login, or sign in (OAuth 2.1 / free key from [\`/#pricing\`](${BASE_URL}/#pricing)) for 30 free monthly credits on \`dislop_review\`, \`dislop_deslop\`, \`dislop_office\`, and \`dislop_visual_review\`. |
| Claude Code Plugin | Live | Install pure-Markdown Skill + Official Cloud MCP in one step using \`.claude-plugin/marketplace.json\` (\`/plugin marketplace add dislop-ai/dislop\` then \`/plugin install dislop@dislop-ai\`; ~130 always-on tokens). |
| OpenAI Codex Plugin & Gemini CLI Extension | Live | Codex: \`codex plugin marketplace add dislop-ai/dislop\` then \`codex plugin add dislop@dislop-ai\`; Gemini CLI: \`gemini extensions install https://github.com/dislop-ai/dislop\`. |
| GitHub Action & pre-commit | Live | Gate modified PR lines with \`uses: dislop-ai/dislop@main\` (\`action.yml\`) or \`.pre-commit-hooks.yaml\`. |
| Official Cloud MCP, HTTP API & JS Export | Live | See [\`/tools/mcp-sdk-api.md\`](./mcp-sdk-api.md) for Official Cloud HTTP MCP, HTTP API, and \`src/core.mjs\`. |
`,
});

registerResource({
  id: "tools-skill",
  pillar: "tools",
  kind: "skill",
  titleEn: "dislop Agent Skill Workflow (SKILL.md)",
  titleZh: "dislop Agent 技能剧本（SKILL.md）",
  relPath: "tools/skill.md",
  modalities: ["markdown", "text", "html", "css", "jsx", "svg", "docx", "pptx", "pdf"],
  languages: ["en", "zh"],
  packs: PACK_ORDER,
  relatedTools: ["skill", "cli", "mcp"],
  content: canonicalSkillMd,
});

const SKILL_REFS = [
  { file: "work-docs.md", titleEn: "Skill Reference: Work Docs, Specs & Regulated Comms", titleZh: "Skill 参考卡（英文）：工作文档与对外通告" },
  { file: "work-docs.zh-CN.md", titleEn: "Skill Reference (ZH): Work Docs, Postmortems & Notices", titleZh: "Skill 参考卡（中文）：工作文档、研发复盘与通告" },
  { file: "essay.md", titleEn: "Skill Reference: Essays & Narrative Non-Fiction", titleZh: "Skill 参考卡（英文）：随笔与长文" },
  { file: "essay.zh-CN.md", titleEn: "Skill Reference (ZH): Essays & Long-Form Prose", titleZh: "Skill 参考卡（中文）：随笔、专栏与非虚构长文" },
  { file: "office.md", titleEn: "Skill Reference: Word (.docx) & PowerPoint (.pptx)", titleZh: "Skill 参考卡（英文）：Word 与演示文稿" },
  { file: "office.zh-CN.md", titleEn: "Skill Reference (ZH): Word (.docx) & PowerPoint (.pptx)", titleZh: "Skill 参考卡（中文）：Word 与演示文稿" },
  { file: "web-ui.md", titleEn: "Skill Reference: Web UI & Interface Copy", titleZh: "Skill 参考卡（英文）：网页界面与文案" },
  { file: "web-ui.zh-CN.md", titleEn: "Skill Reference (ZH): Web UI & Interface Copy", titleZh: "Skill 参考卡（中文）：网页界面与界面文案" },
];
const siteRefsOutDir = path.join(SITE_DIR, "tools", "references");
if (fs.existsSync(siteRefsOutDir)) {
  const validRefNames = new Set(SKILL_REFS.map((r) => r.file));
  for (const existingRef of fs.readdirSync(siteRefsOutDir)) {
    if (!validRefNames.has(existingRef)) {
      fs.rmSync(path.join(siteRefsOutDir, existingRef), { force: true });
    }
  }
}
for (const ref of SKILL_REFS) {
  const refPath = path.join(ROOT, "skills", "dislop", "references", ref.file);
  if (fs.existsSync(refPath)) {
    const isZhRef = ref.file.endsWith(".zh-CN.md");
    registerResource({
      id: `tools-skill-ref-${ref.file.replace(/\.md$/, "")}`,
      pillar: "tools",
      kind: "skill-reference",
      titleEn: ref.titleEn,
      titleZh: ref.titleZh,
      relPath: `tools/references/${ref.file}`,
      modalities: ["markdown", "text", "html", "css", "jsx", "docx", "pptx"],
      languages: [isZhRef ? "zh" : "en"],
      packs: PACK_ORDER,
      relatedTools: ["skill", "cli"],
      content: fs.readFileSync(refPath, "utf8"),
    });
  }
}

registerResource({
  id: "tools-prompts",
  pillar: "tools",
  kind: "prompts",
  titleEn: "Zero-Install Prompt Snippets for External Agents",
  titleZh: "零安装轻量审校提示片段",
  relPath: "tools/prompts.md",
  modalities: ["markdown", "text", "html", "css", "pptx"],
  languages: ["en", "zh"],
  packs: PACK_ORDER,
  relatedTools: ["browser-workbench", "skill"],
  content: `---
content-type: reference-data
version: ${VERSION}
---

# Zero-Install Audit Checklists (When Local CLI/MCP Is Unavailable)

## One-Line Agent Rollout Prompt

Paste either prompt into your own Agent so it reads [\`/llms.txt\`](../llms.txt), picks the right surface, installs or configures \`dislop\`, and runs a first check on your files:

\`\`\`text
Read https://dislop.com/llms.txt, evaluate which dislop setup fits my environment and project (Skill, offline CLI, or Cloud MCP), install and configure it, and run a first check on our files.
\`\`\`

\`\`\`text
请阅读 https://dislop.com/llms.txt，结合我当前的环境与项目内容评估最合适的 dislop 接入方式（Skill、本地 CLI 或远程 MCP），完成安装配置并拿现有文件试跑一次。
\`\`\`

## Prose & Technical Brief Checklist

\`\`\`text
1. Remove unfilled placeholders and chatbot wrappers.
2. Cut throat-clearing openers, stock promotional adjectives, and moralizing endings.
3. Do not replace cut filler with binary negation slogans ("Not X, but Y") or three-word staccato fragments.
4. Re-check the revised draft locally with: npx --yes dislop check draft.md
\`\`\`

## Web UI & Slide Deck Checklist

\`\`\`text
1. Verify zero dead controls (<a href="#"> or unexplained disabled buttons).
2. Avoid default purple-pink neon gradients, "AI-Powered" prompt-echo badges, pill-badge soup (> 6 pills per view), and 3-level nested bordered boxes.
3. Cap slide copy at <= 120 English words (<= 280 Chinese chars), <= 6 bullets, 100% font scale (no autofit shrink), and a conclusion title instead of "Overview".
\`\`\`
`,
});

registerResource({
  id: "tools-cli-hooks",
  pillar: "tools",
  kind: "guide",
  titleEn: "CLI, Git Diff, Hooks & GitHub Actions",
  titleZh: "CLI、Git 增量、Hooks 与 CI 接入",
  relPath: "tools/cli-and-hooks.md",
  modalities: ["markdown", "text", "html", "css", "jsx", "svg", "docx", "pptx"],
  languages: ["en", "zh"],
  packs: PACK_ORDER,
  relatedTools: ["cli"],
  content: `---
content-type: reference-data
version: ${VERSION}
---

# CLI, Git Diff, Hooks & CI (\`v${VERSION}\`)

## Node.js 20+ & Python 3.10+ (Shipped, Zero Dependencies)

\`\`\`bash
# Check a folder (exits 1 on core AI artifact errors)
npx --yes dislop check .

# Check only modified git lines and output GitHub PR annotations or SARIF 2.1.0
npx --yes dislop check --changed origin/main --format github
npx --yes dislop check --changed origin/main --format sarif > dislop.sarif

# Inspect DOCX/PPTX with Python (published on PyPI)
uvx dislop check quarterly-review.pptx

# Explain a rule's check question and examples
npx --yes dislop explain negation-pivot-frame

# Check with 5-axis rhythm stats and bundled 14.6 KB Pocket ML
npx --yes dislop check draft.md --profile --ml

# Run extended 65-pattern catalog probes offline
npx --yes dislop patterns draft.md

# Extract an offline deterministic personal voice profile (0 network calls)
npx --yes dislop voice sample1.md sample2.md -o .dislop.local/voice.json

# Inspect hardware RAM/chip and optional local small-model tiers (never bloats install)
npx --yes dislop model status

# List bundled offline packs and optional read-only static / cloud URLs (check makes 0 network calls)
npx --yes dislop resources --json
\`\`\`

## Exit Codes

- \`0\`: Checked cleanly with zero findings at or above \`--fail-on\`.
- \`1\`: Findings met or exceeded \`--fail-on\`.
- \`2\`: Invalid flags, missing path, or explicitly specified file was uninspectable (e.g., corrupted archive or non-UTF-8 file).

## Claude Code PostToolUse Hook Template (Fast Local Install Recommended)

Install once locally so hooks run offline with zero network fetch latency:

\`\`\`bash
npm install -g dislop
# or Python 3.10+: pip install dislop
\`\`\`

Note: \`PostToolUse\` fires **after** \`Write\`/\`Edit\` completes and receives tool context as JSON on stdin (\`tool_input.file_path\`). Parse and validate that path before invoking \`dislop check\`, and map CLI exit \`1\` to exit \`2\` to return structured post-write feedback to Claude Code:

\`\`\`json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node -e 'const fs=require(\\"node:fs\\"),cp=require(\\"node:child_process\\");const d=JSON.parse(fs.readFileSync(0,\\"utf8\\"));const f=d.tool_input&&d.tool_input.file_path;if(!f)process.exit(0);const r=cp.spawnSync(\\"dislop\\",[\\"check\\",f,\\"--fail-on\\",\\"error\\"],{stdio:\\"inherit\\"});process.exit(r.status===1?2:(r.status||0));'"
          }
        ]
      }
    ]
  }
}
\`\`\`
`,
});

registerResource({
  id: "tools-mcp-sdk-api",
  pillar: "tools",
  kind: "guide",
  titleEn: "Official Cloud MCP, HTTP API & JS Core",
  titleZh: "官方云端 MCP、HTTP API 与 JS 核心",
  relPath: "tools/mcp-sdk-api.md",
  modalities: ["markdown", "text", "html", "css", "jsx", "svg", "docx", "pptx", "pdf"],
  languages: ["en", "zh"],
  packs: PACK_ORDER,
  relatedTools: ["mcp", "cli"],
  content: `---
content-type: reference-data
version: ${VERSION}
---

# Official Cloud MCP, HTTP API & JS Core

## 1. Official Cloud HTTP MCP (Free 0-Credit Checks Without Login; 30 Free Credits/Month After Sign-In)

Connect directly to \`${BASE_URL}/mcp\` (auto-discovery metadata at [\`/.well-known/mcp/server-card.json\`](../.well-known/mcp/server-card.json) and OAuth 2.1 protected resource at \`${BASE_URL}/.well-known/oauth-protected-resource/mcp\`).

- **No login required**: \`dislop_check\`, \`dislop_verify\`, and \`dislop_rules\` run at 0 credits without an API key.
- **Sign in or OAuth 2.1**: Claim a free Bearer token (\`dslp_...\`) at \`${BASE_URL}/#cloud-token-box\` (or authorize via OAuth 2.1) for **30 free credits/month** on Cloud AI tools (paid-tier Google Gemini API; Google does not train on it, and we do not store drafts; see [\`/privacy.md\`](../privacy.md)).

### Claude Code
\`\`\`bash
claude mcp add --transport http dislop ${BASE_URL}/mcp
# Optional Bearer header if skipping OAuth: --header "Authorization: Bearer dslp_YOUR_FREE_TOKEN"
\`\`\`

### Cursor / Windsurf / Antigravity (\`mcp.json\`)
\`\`\`json
{
  "mcpServers": {
    "dislop": {
      "type": "http",
      "url": "${BASE_URL}/mcp",
      "headers": {
        "Authorization": "Bearer dslp_YOUR_FREE_TOKEN"
      }
    }
  }
}
\`\`\`

### Codex (\`~/.codex/config.toml\`)
\`\`\`toml
[mcp_servers.dislop]
url = "${BASE_URL}/mcp"
http_headers = { Authorization = "Bearer dslp_YOUR_FREE_TOKEN" }
\`\`\`

### Official Cloud MCP v2 Tools (10 Tools)

- **0 credits, no login required**:
  - \`dislop_check\`: Deterministic anti-slop check on passed \`text\` (note remote check accepts \`text\`, not local filesystem \`path\`).
  - \`dislop_verify\`: Fact ledger, keep-terms, and anti-degradation guardrails on a \`before\` / \`after\` revision pair.
  - \`dislop_rules\`: List available rule packs or explain a specific \`ruleId\` with examples.
- **Sign-in / OAuth 2.1 required (30 free credits/month)**:
  - \`dislop_review\` (1 credit): Genre-aware multi-model diagnosis returning anchored \`dislop.findings/1\` \`edit\` / \`rewrite\` / \`ask\` guidance.
  - \`dislop_deslop\` (2 credits): Self-healing LLM rewrite with deterministic and fact-ledger verification.
  - \`dislop_office\` (2 credits review / 3 credits deslop): Review or rewrite \`.docx\` / \`.pptx\` text segments without emitting binary base64.
  - \`dislop_visual_review\` (2 credits): Multimodal visual anti-slop screenshot audit for webpages, slides, posters, and print layouts.
  - \`dislop_voice_extract\` (2 credits): Extract a reusable \`dislop.voice/1\` style card from 1–5 human samples (\`save: true\` stores it to your account).
  - \`dislop_voice_manage\` (0 credits): List, view, or delete saved personal voice cards.
  - \`dislop_account\` (0 credits): Inspect active plan, remaining credits, and saved voice count.

## 2. Cloud HTTP API & JS Core Export

- Same-origin HTTP endpoints: \`GET /api/health\`, \`GET /api/v1/auth/session\`, \`POST /api/v1/auth/otp/request\`, \`POST /api/v1/auth/otp/verify\`, \`GET /api/v1/account/me\`, \`GET|POST /api/v1/account/keys\`, \`POST /api/v1/check\`, \`POST /api/v1/review\`, \`POST /api/v1/deslop\`, \`POST /api/v1/office/review\`, \`POST /api/v1/office/deslop\`, \`POST /api/v1/voice/extract\`, and \`POST /api/v1/waitlist\`.
- \`package.json\` exports the zero-I/O pure ES module \`src/core.mjs\` (\`auditText\`, \`auditOoxmlEntries\`, \`resolveEffectivePack\`).
- Note: existing local \`--mcp\` stdio code remains in the open-source CLI during real-world evaluation, while official manifests target \`${BASE_URL}/mcp\`.
`,
});

registerResource({
  id: "privacy-policy",
  pillar: "tools",
  kind: "guide",
  titleEn: "Privacy, Data Boundaries & Subprocessors",
  titleZh: "隐私与数据边界说明",
  relPath: "privacy.md",
  modalities: ["markdown", "text"],
  languages: ["en", "zh"],
  packs: [],
  relatedTools: ["browser-workbench", "cli", "mcp"],
  content: `---
content-type: reference-data
version: ${VERSION}
snapshot: ${SNAPSHOT_DATE}
---

# Privacy & Data Boundaries

\`dislop\` separates its **open-source offline tools** from its **optional hosted cloud service** so you always know whether text leaves your machine.

## 1. Open-Source Local Tools (Zero Uploads, Zero Telemetry)

- **Pure-Markdown Agent Skill (\`skills/dislop/\`, zero scripts)**, **Local CLI (\`dislop check\`, \`patterns\`, \`voice\`, \`explain\`, \`packs\`, \`catalog\`, \`resources\`)**, **Local Editor Plugins**, and the **local rule mode** in the browser workbench run on your machine with zero network calls.
- \`dislop check\`, \`dislop patterns\`, and \`dislop voice\` make zero network calls.
- \`dislop.com\` loads zero third-party fonts, analytics, or external scripts (\`Content-Security-Policy: connect-src 'self'\`).

## 2. Official Cloud MCP & Web AI (\`/api/v1/*\` & \`/mcp\`)

Data is sent to \`dislop.com\` **only** when you sign in and explicitly click a Cloud AI button in the workbench, manage keys or saved voice profiles, submit the early-access waitlist, or call an authenticated Official Cloud MCP tool:

- **Upstream Model Providers**: Paid-tier Google Gemini API (prompts and outputs are not used for model training; Google may retain prompts for a limited period for abuse monitoring under its API terms).
- **Zero Draft Storage**: Draft text and uploaded Office files are processed in memory; we do not store drafts, filenames, or log their text.
- **Sign-In Gate & Account Records**:
  - Cloud LLM endpoints require an authenticated browser session (Email 6-digit OTP or Google OAuth) or a \`dslp_*\` Bearer token / MCP OAuth 2.1 grant (30 free monthly credits; no unauthenticated anonymous LLM trials).
  - We store your email, optional Google subject ID, one-way **SHA-256 hashes** of API keys and sessions (never plaintext keys), any voice cards you explicitly save, and your monthly credit counter.
  - You can revoke individual keys, disconnect OAuth apps, or delete your account self-serve in the Account Hub (\`DELETE /api/v1/account\`).
- **Confidential Drafts**: Never send confidential, regulated, or unreleased source documents to any hosted cloud endpoint; use the local offline CLI or pure-Markdown Skill instead.

## 3. Contact & Security Disclosures

- **Support, account deletion & privacy inquiries**: \`hello@dislop.com\`
- **Vulnerability & security reports**: \`security@dislop.com\`
`,
});

// 2e. Pack Pure Markdown Views (/packs/<id>.md) — ZERO fixtures, ZERO raw regex patterns!
for (const pid of PACK_ORDER) {
  const pack = packsById[pid];
  if (!pack) continue;
  const rulesBody = (pack.rules || [])
    .map((r) => {
      const parts = [
        `## \`${r.id}\``,
        `- Tier: \`${r.tier}\` · Severity: \`${r.severity}\` · Family: \`${r.family}\``,
        `- Modalities: \`${(r.modalities || []).join(", ")}\``,
        `- EN: ${formatRuleProseMd(r.message.en)}`,
        `- ZH: ${formatRuleProseMd(r.message.zh)}`,
        `- Deletion Test (EN): ${formatRuleProseMd(r.deletionTest.en)}`,
        `- Deletion Test (ZH): ${formatRuleProseMd(r.deletionTest.zh)}`,
      ];
      if (r.exemplar) {
        parts.push("", fencedExemplar(r.exemplar));
      }
      parts.push("", `Atomic card: [${r.id}.md](../rules/${r.id}.md)`);
      return parts.join("\n");
    })
    .join("\n\n");

  registerResource({
    id: `pack-${pid}`,
    pillar: "methodology",
    kind: "pack",
    titleEn: `Pack: ${pack.name.en} (${(pack.rules || []).length} rules)`,
    titleZh: `规则包：${pack.name.zh}（${(pack.rules || []).length} 条）`,
    relPath: `packs/${pid}.md`,
    modalities: pack.modalities || [],
    languages: ["en", "zh"],
    packs: [pid],
    relatedTools: ["browser-workbench", "cli", "mcp"],
    content: `---
content-type: reference-data
pack: ${pid}
tier: ${pack.tier}
version: ${pack.version}
---

# Pack: \`${pid}\` — ${pack.name.en}

> ${formatRuleProseMd(pack.summary.en)}

${formatRuleProseMd(pack.summary.zh)}

${rulesBody}
`,
  });
}

// 2f. Atomic Rule Cards (/rules/<id>.md) — 42 compact cards (<= 1.6 KB each), ZERO fixtures, ZERO raw patterns!
for (const { packId, rule: r } of allRules) {
  const parts = [
    `---`,
    `content-type: reference-data`,
    `ruleId: ${r.id}`,
    `pack: ${packId}`,
    `tier: ${r.tier}`,
    `severity: ${r.severity}`,
    `family: ${r.family}`,
    `---`,
    ``,
    `# Rule: \`${r.id}\``,
    ``,
    `- Pack: [\`${packId}\`](../packs/${packId}.md) · Tier: \`${r.tier}\` · Severity: \`${r.severity}\``,
    `- Modalities: \`${(r.modalities || []).join(", ")}\``,
    `- Human anchor: ${BASE_URL}/#rule-${r.id}`,
    ``,
    `## What It Catches`,
    `- EN: ${formatRuleProseMd(r.message.en)}`,
    `- ZH: ${formatRuleProseMd(r.message.zh)}`,
    ``,
    `## Deletion Test`,
    `- EN: ${formatRuleProseMd(r.deletionTest.en)}`,
    `- ZH: ${formatRuleProseMd(r.deletionTest.zh)}`,
  ];
  if (r.exemplar) {
    parts.push("", "## Exemplar (Reference Data)", "", fencedExemplar(r.exemplar));
  }
  registerResource({
    id: `rule-${r.id}`,
    pillar: "cases",
    kind: "rule",
    titleEn: `Rule: ${r.id}`,
    titleZh: `规则：${r.id}`,
    relPath: `rules/${r.id}.md`,
    modalities: r.modalities || [],
    languages: r.id.startsWith("zh-") ? ["zh"] : r.id.startsWith("en-") ? ["en"] : ["en", "zh"],
    packs: [packId],
    relatedTools: ["browser-workbench", "cli", "mcp"],
    content: parts.join("\n"),
  });
}

// 2g. Task Bundles (/tasks/*.md) — ~1,000 tokens each, combining Methodology + Cases + Tools
function renderTaskRuleSummary(packIds) {
  const lines = [];
  for (const pid of packIds) {
    const pack = packsById[pid];
    if (!pack) continue;
    lines.push(`### Pack \`${pid}\``);
    for (const r of pack.rules || []) {
      lines.push(`- [\`${r.id}\`](../rules/${r.id}.md) (\`${r.severity}\`): ${formatRuleProseMd(r.message.en)}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

registerResource({
  id: "task-business-doc",
  pillar: "methodology",
  kind: "task-bundle",
  titleEn: "Task Bundle: Business Brief & Technical Proposal",
  titleZh: "任务组合：商业简报与技术方案审校",
  relPath: "tasks/business-doc.md",
  modalities: ["markdown", "text", "docx", "pptx"],
  languages: ["en", "zh"],
  packs: ["core", "business-brief"],
  relatedTools: ["browser-workbench", "skill", "cli", "mcp"],
  content: `---
content-type: reference-data
task: business-doc
version: ${VERSION}
---

# Task Bundle: Business Brief & Technical Proposal

Use this bundle when auditing or revising PRDs, architecture specs, memos, Word (\`.docx\`) reports, or bilingual executive briefs.

## 1. Core Principles

1. Clear all \`core\` AI artifact errors first (chatbot wrappers, unfilled placeholders, raw Markdown pasted into Word/PPT).
2. Apply each rule's check question to flagged prose phrases rather than swapping synonyms.
3. Avoid 2nd-order slogans (\`"Not X, but Y"\`, three-word staccato chains, 4-char Chinese slogan triads) and 3rd-order 3-part semicolon pitches.
4. Keep code spans, URLs, and quoted primary sources intact; never invent facts or numbers.

## 2. Active Rules

${renderTaskRuleSummary(["core", "business-brief"])}

## 3. Reference Contrast

${fencedExemplar(packsById["business-brief"].rules[2].exemplar)}

## 4. Deterministic Verification Command

\`\`\`bash
npx --yes dislop check brief.md --pack business-brief
\`\`\`

Deep dives: [Pack \`business-brief\`](../packs/business-brief.md) · [Deletion Test](../methodology/deletion-test.md) · [Skill](../tools/skill.md)
`,
});

registerResource({
  id: "task-web-and-deck",
  pillar: "methodology",
  kind: "task-bundle",
  titleEn: "Task Bundle: Web UI, SVG & Slide Decks",
  titleZh: "任务组合：前端 UI、SVG 与演示文稿审校",
  relPath: "tasks/web-and-deck.md",
  modalities: ["html", "css", "jsx", "svg", "pptx"],
  languages: ["en", "zh"],
  packs: ["core", "deck-and-ui"],
  relatedTools: ["browser-workbench", "skill", "cli", "mcp"],
  content: `---
content-type: reference-data
task: web-and-deck
version: ${VERSION}
---

# Task Bundle: Web UI, SVG & Slide Decks

Use this bundle when building or auditing HTML/CSS/JSX pages, SVG diagrams, or PowerPoint (\`.pptx\`) presentations.

## 1. Hard AI Artifact & Template Guards

1. Zero dead controls (\`<a href="#">\`, empty buttons, or unexplained \`<button disabled>\`).
2. Avoid purple-pink AI gradients, \`"AI-Powered"\` prompt-echo badges, pill-badge walls (\`> 6\` pills per view), and 3-level nested bordered boxes.
3. Keep PowerPoint slides readable: \`<= 120\` Latin words (\`<= 280\` Han chars), \`<= 6\` bullets, \`normAutofit >= 80%\`, and conclusion titles instead of \`"Overview"\`.

## 2. Active Rules

${renderTaskRuleSummary(["core", "deck-and-ui"])}

## 3. Reference Contrast

${fencedExemplar(packsById["deck-and-ui"].rules[4].exemplar)}

## 4. Deterministic Verification Command

\`\`\`bash
npx --yes dislop check site/ --pack deck-and-ui --fail-on warning
uvx dislop check deck.pptx
\`\`\`

Deep dives: [Pack \`deck-and-ui\`](../packs/deck-and-ui.md) · [Design System](../methodology/design-system.md) · [UI References](../cases/ui-specimens.md)
`,
});

registerResource({
  id: "task-editorial-writing",
  pillar: "methodology",
  kind: "task-bundle",
  titleEn: "Task Bundle: Editorial & Literary Writing",
  titleZh: "任务组合：散文随笔与非虚构长文审校",
  relPath: "tasks/editorial-writing.md",
  modalities: ["markdown", "text", "html", "docx"],
  languages: ["en", "zh"],
  packs: ["core", "literary-essay"],
  relatedTools: ["browser-workbench", "skill", "cli", "mcp"],
  content: `---
content-type: reference-data
task: editorial-writing
version: ${VERSION}
---

# Task Bundle: Editorial & Literary Writing

Use this bundle for longform essays, non-fiction reporting, and narrative drafts in English or Chinese.

## 1. Editorial Principles

1. Stop on the concrete physical detail or direct observation instead of adding a moralizing closing sentence.
2. Cut formulaic \`"Not X, but Y"\` / \`"不是 A，而是 B"\` aphorisms unless stating a literal factual correction.
3. Keep em-dash density restrained (\`<= 4\` per 300 words) and avoid half-width ASCII punctuation wedged between Chinese characters.
4. Preserve natural sentence-length burstiness rather than flattening every sentence to uniform length.

## 2. Active Rules

${renderTaskRuleSummary(["core", "literary-essay"])}

## 3. Reference Contrast

${fencedExemplar(packsById["literary-essay"].rules[0].exemplar)}

## 4. Deterministic Verification Command

\`\`\`bash
npx --yes dislop check essay.md --pack literary-essay --lang zh
\`\`\`

Deep dives: [Pack \`literary-essay\`](../packs/literary-essay.md) · [Positive Divergence](../methodology/positive-divergence.md)
`,
});

registerResource({
  id: "task-pre-release-gate",
  pillar: "tools",
  kind: "task-bundle",
  titleEn: "Task Bundle: Pre-Release Objective Gate & CI",
  titleZh: "任务组合：发布前客观质量门禁与 CI",
  relPath: "tasks/pre-release-gate.md",
  modalities: ["markdown", "text", "html", "css", "jsx", "svg", "docx", "pptx", "pdf"],
  languages: ["en", "zh"],
  packs: ["core"],
  relatedTools: ["cli", "mcp"],
  content: `---
content-type: reference-data
task: pre-release-gate
version: ${VERSION}
---

# Task Bundle: Pre-Release Objective Gate & CI

Use this bundle when gating pull requests, release docs, or agent-produced Office/PDF deliverables with zero subjective style noise.

## 1. Objective Invariants (\`packs/core\`, \`error\`)

${renderTaskRuleSummary(["core"])}

## 2. Incremental CI & Local Verification

\`\`\`bash
# Gate only git-changed lines against main (exit 1 on core error)
npx --yes dislop check --changed origin/main --fail-on error --format github

# Emit SARIF 2.1.0 for GitHub Code Scanning
npx --yes dislop check . --fail-on error --format sarif > dislop.sarif
\`\`\`

Deep dives: [Pack \`core\`](../packs/core.md) · [CLI & Hooks](../tools/cli-and-hooks.md) · [MCP & SDK](../tools/mcp-sdk-api.md)
`,
});

// 2h. Awesome Anti-Slop Static Outputs (/awesome/index.json, /awesome/index.md, /awesome/index.html + repo awesome/README.md)
const awesomeJsonStr = JSON.stringify(radarData, null, 2) + "\n";
fs.writeFileSync(path.join(AWESOME_OUT, "index.json"), awesomeJsonStr, "utf8");

const SECTION_META = [
  { id: "standards-research-policy", en: "Standards, Research & Policy", zh: "标准、研究与平台政策" },
  { id: "prose-en-multilingual", en: "Prose (EN & Multilingual)", zh: "英文与多语种写作" },
  { id: "prose-zh", en: "Chinese Writing & Localization", zh: "中文写作与去翻译腔" },
  { id: "deterministic-prose-linters", en: "Deterministic Linters", zh: "确定性检查工具" },
  { id: "ui-design-and-media", en: "UI, Design & Diagrams", zh: "前端 UI、设计与图表" },
  { id: "code-and-pr-governance", en: "Code & PR Governance", zh: "代码与 PR 治理" },
  { id: "contrast-and-detection", en: "Contrast Watch (Evasion / Detectors)", zh: "对照观察区（规避/检测）" },
  { id: "awesome-and-registries", en: "Awesome Lists & Registries", zh: "目录与注册中心" },
];

const awesomeMdSections = SECTION_META.map((sec) => {
  const items = radarData.entries.filter((e) => e.section === sec.id);
  const rows = items
    .map((e) => {
      const meta = [
        typeof e.stars === "number" ? `${e.stars}★` : null,
        e.pushedAt || null,
        e.modality,
        e.locale,
        e.hasDeterministicCheck ? "deterministic" : "prompt/policy",
      ]
        .filter(Boolean)
        .join(" · ");
      return `- [${e.name}](${e.url}) (${meta}): ${e.summary}`;
    })
    .join("\n");
  return `## ${sec.en} / ${sec.zh} (${items.length})\n\n${rows}`;
}).join("\n\n");

registerResource({
  id: "awesome-anti-slop-md",
  pillar: "cases",
  kind: "awesome",
  titleEn: `Awesome Anti-Slop (${radarData.entries.length} Curated Entries)`,
  titleZh: `去 AI 味精选清单 · Awesome Anti-Slop（${radarData.entries.length} 条实测核验）`,
  relPath: "awesome/index.md",
  modalities: ["prose", "ui-design", "diagram-media", "code-pr", "academic", "multi-modal"],
  languages: ["en", "zh"],
  packs: [],
  relatedTools: ["browser-workbench"],
  content: `---
content-type: reference-data
schema: ${radarData.schema}
snapshot: ${SNAPSHOT_DATE}
entries: ${radarData.entries.length}
---

# Awesome Anti-Slop (${radarData.entries.length} Curated Resources)

Verified on ${SNAPSHOT_DATE} via GitHub REST API and HTTP status checks. Machine-readable JSON: [\`/awesome/index.json\`](./index.json). Interactive filter page: [\`/awesome/\`](${BASE_URL}/awesome/).

> Neutrality boundary: \`contrast-and-detection\` isolates both probabilistic AI-text detectors (Fast-DetectGPT, Pangram) and adversarial evasion tools strictly for reference.

${awesomeMdSections}
`,
});

// Independently shareable top-level GitHub landing pages:
//   - awesome/README.md (100% pure English)
//   - awesome/README.zh-CN.md (100% pure Chinese)
const GITHUB_SECTION_META = [
  { id: "standards-research-policy", headingEn: "Standards, Research, and Policy", slugEn: "standards-research-and-policy", headingZh: "标准、研究与平台政策", slugZh: "标准研究与平台政策" },
  { id: "prose-en-multilingual", headingEn: "English and Multilingual Writing", slugEn: "english-and-multilingual-writing", headingZh: "英文与多语种写作", slugZh: "英文与多语种写作" },
  { id: "prose-zh", headingEn: "Chinese Writing and Localization", slugEn: "chinese-writing-and-localization", headingZh: "中文写作与去翻译腔", slugZh: "中文写作与去翻译腔" },
  { id: "deterministic-prose-linters", headingEn: "Deterministic Linters", slugEn: "deterministic-linters", headingZh: "确定性检查工具", slugZh: "确定性检查工具" },
  { id: "ui-design-and-media", headingEn: "UI, Design, and Diagrams", slugEn: "ui-design-and-diagrams", headingZh: "前端界面、设计与图表", slugZh: "前端界面设计与图表" },
  { id: "code-and-pr-governance", headingEn: "Code and PR Governance", slugEn: "code-and-pr-governance", headingZh: "代码与 PR 治理", slugZh: "代码与-pr-治理" },
  { id: "awesome-and-registries", headingEn: "Awesome Lists and Registries", slugEn: "awesome-lists-and-registries", headingZh: "目录与注册中心", slugZh: "目录与注册中心" },
  { id: "contrast-and-detection", headingEn: "Contrast Watch", slugEn: "contrast-watch", headingZh: "检测与规避研究（仅供对照）", slugZh: "检测与规避研究仅供对照" },
];

function escapeMdCell(str) {
  return String(str ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

const awesomeDetTotal = radarData.entries.filter((e) => e.hasDeterministicCheck).length;

const githubTocEn = GITHUB_SECTION_META.map((sec) => {
  const cnt = radarData.entries.filter((e) => e.section === sec.id).length;
  return `- [${sec.headingEn}](#${sec.slugEn}) (${cnt})`;
}).join("\n");

const githubTablesEn = GITHUB_SECTION_META.map((sec) => {
  const items = radarData.entries.filter((e) => e.section === sec.id);
  const note =
    sec.id === "contrast-and-detection"
      ? "\n\n> Listed strictly for reference: probabilistic AI-text detectors and adversarial bypass tools. `dislop` focuses on removing AI slop in writing and design rather than helping evade disclosure policies."
      : "";
  const rows = items
    .map((e) => {
      const snapParts = [];
      if (typeof e.stars === "number") snapParts.push(`${e.stars.toLocaleString("en-US")}★`);
      if (e.pushedAt) snapParts.push(e.pushedAt);
      if (e.archived) snapParts.push("archived");
      const snap = snapParts.join(" · ") || "—";
      const checkCol = e.hasDeterministicCheck ? "yes" : "no";
      const displayName = escapeMdCell(e.nameEn || e.name);
      const summary = escapeMdCell(formatRuleProseMd(e.summaryEn || e.summary));
      return `| [${displayName}](${e.url}) | \`${escapeMdCell(e.modality)}\` / \`${escapeMdCell(e.locale)}\` | ${checkCol} | ${snap} | ${summary} |`;
    })
    .join("\n");
  return `## ${sec.headingEn}\n\n${items.length} entries${note}\n\n| Resource | Topic / Locale | Automated check | Stars & last push | What it is |\n|---|---|---|---|---|\n${rows}`;
}).join("\n\n");

const repoAwesomeReadmeEn = `<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../assets/banner-dark.svg">
    <img src="../assets/banner-light.svg" alt="Awesome Anti-Slop — Cutting AI slop is real productivity." width="100%">
  </picture>
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="${BASE_URL}/awesome/">Filter at dislop.com/awesome</a> ·
  <a href="${BASE_URL}/#workbench">Try a draft</a> ·
  <a href="${BASE_URL}/awesome/index.json">JSON</a> ·
  <a href="../README.md">dislop repo</a>
</p>

# Awesome Anti-Slop

Cutting AI slop is real productivity. ${radarData.entries.length} tools, linters, style guides, UI rules, PR policies, and papers in English and Chinese, including established projects like Vale and Impeccable.

Every link, star count, and last-push date below was checked via GitHub API and HTTP status on \`${SNAPSHOT_DATE}\`. ${awesomeDetTotal} entries run automated checks without an LLM, and the tables note which. AI-text detectors and bypass tools sit apart in [Contrast Watch](#contrast-watch) at the bottom for reference only.

To filter the list in your browser, open [dislop.com/awesome](${BASE_URL}/awesome/). To give it to an agent, point it at [index.json](${BASE_URL}/awesome/index.json) or [index.md](${BASE_URL}/awesome/index.md). To add an entry, see [Suggest a resource](#suggest-a-resource).

## Contents

${githubTocEn}

${githubTablesEn}

## Suggest a resource

Open a pull request updating [docs/research/anti-slop-radar-index.json](../docs/research/anti-slop-radar-index.json) and run \`node scripts/build_site.mjs\`. Every entry needs a live HTTPS link, a topic, a locale, and one plain sentence saying what it does.

To check a local draft with dislop itself, see [the main README](../README.md) or run \`npx --yes dislop check .\`.
`;
fs.writeFileSync(path.join(REPO_AWESOME_OUT, "README.md"), sanitizeAgentText(repoAwesomeReadmeEn), "utf8");

const githubTocZh = GITHUB_SECTION_META.map((sec) => {
  const cnt = radarData.entries.filter((e) => e.section === sec.id).length;
  return `- [${sec.headingZh}](#${sec.slugZh})（${cnt}）`;
}).join("\n");

const githubTablesZh = GITHUB_SECTION_META.map((sec) => {
  const items = radarData.entries.filter((e) => e.section === sec.id);
  const note =
    sec.id === "contrast-and-detection"
      ? "\n\n> 以下仅作行业对照参考，集中收录概率型 AI 文本检测器与规避工具。`dislop` 专注清理文案和设计里的 AI 味，不用于规避披露规范。"
      : "";
  const rows = items
    .map((e) => {
      const snapParts = [];
      if (typeof e.stars === "number") snapParts.push(`${e.stars.toLocaleString("en-US")}★`);
      if (e.pushedAt) snapParts.push(e.pushedAt);
      if (e.archived) snapParts.push("已归档");
      const snap = snapParts.join(" · ") || "—";
      const checkCol = e.hasDeterministicCheck ? "自动检查" : "规范/提示";
      const summary = escapeMdCell(formatRuleProseMd(e.summary));
      return `| [${escapeMdCell(e.name)}](${e.url}) | \`${escapeMdCell(e.modality)}\` / \`${escapeMdCell(e.locale)}\` | ${checkCol} | ${snap} | ${summary} |`;
    })
    .join("\n");
  return `## ${sec.headingZh}\n\n共 ${items.length} 条${note}\n\n| 资源 | 类别 / 语种 | 检查方式 | 星标 · 最近更新 | 用途 |\n|---|---|---|---|---|\n${rows}`;
}).join("\n\n");

const repoAwesomeReadmeZh = `<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../assets/banner-zh-dark.svg">
    <img src="../assets/banner-zh-light.svg" alt="Awesome Anti-Slop — 去 AI 味才是真正的生产力！" width="100%">
  </picture>
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="${BASE_URL}/awesome/">在线筛选</a> ·
  <a href="${BASE_URL}/#workbench">试查一段稿子</a> ·
  <a href="${BASE_URL}/awesome/index.json">JSON 数据</a> ·
  <a href="../README.zh-CN.md">返回 dislop 主仓</a>
</p>

# Awesome Anti-Slop（去 AI 味工具清单）

去 AI 味才是真正的生产力！一共整理了 ${radarData.entries.length} 个中英文工具、检查器、写作规范、网页设计指南、代码 PR 治理规则和论文，包括 Vale、Impeccable 这类常用项目。

所有链接、GitHub 星标和最近更新时间都在 \`${SNAPSHOT_DATE}\` 核过一遍。其中 ${awesomeDetTotal} 个可以在本地跑自动检查，不依赖大模型。AI 文本检测器和规避工具单独放在最下面的[检测与规避研究](#检测与规避研究仅供对照)，只作对照参考。

想离线搜索筛选，可以打开 [dislop.com/awesome](${BASE_URL}/awesome/)。想给 Agent 读，直接用 [index.json](${BASE_URL}/awesome/index.json) 或 [index.md](${BASE_URL}/awesome/index.md)。补充新条目请看[提交新条目](#提交新条目)。

## 目录

${githubTocZh}

${githubTablesZh}

## 提交新条目

提 PR 更新 [docs/research/anti-slop-radar-index.json](../docs/research/anti-slop-radar-index.json)，然后跑一遍 \`node scripts/build_site.mjs\` 就行。每条需要可访问的 HTTPS 链接、类别、语种，以及一句说明它是做什么的。

想用 dislop 直接查自己手头的稿子，可以看[中文 README](../README.zh-CN.md)，或者命令行运行 \`npx --yes dislop check .\`。
`;
fs.writeFileSync(path.join(REPO_AWESOME_OUT, "README.zh-CN.md"), sanitizeAgentText(repoAwesomeReadmeZh), "utf8");

// Pre-render site/awesome/index.html in Chinese (default) with compact <select> + clean 3-column reading list
const awesomeSectionOptionsHtml = [
  `<option value="all">全部类别（${radarData.entries.length}）</option>`,
  ...GITHUB_SECTION_META.map((sec) => {
    const cnt = radarData.entries.filter((e) => e.section === sec.id).length;
    return `<option value="${sec.id}">${escapeHtml(sec.headingZh)}（${cnt}）</option>`;
  }),
].join("\n          ");

const awesomePreRenderedRows = radarData.entries
  .map((e) => {
    const secObj = GITHUB_SECTION_META.find((s) => s.id === e.section);
    const secLabel = secObj ? secObj.headingZh : e.section;
    const isContrast = e.section === "contrast-and-detection";
    const metaParts = [];
    if (typeof e.stars === "number") metaParts.push(`${e.stars.toLocaleString("en-US")}★`);
    if (e.pushedAt) metaParts.push(e.pushedAt);
    if (e.license && e.license !== "NOASSERTION") metaParts.push(e.license);
    if (e.archived) metaParts.push("已归档");
    return `<tr>
              <td><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener"><strong>${escapeHtml(e.name)}</strong></a>${
      e.repo ? `<div style="font-family:var(--font-mono);font-size:0.73rem;color:var(--ink-3);margin-top:2px;">${escapeHtml(e.repo)}</div>` : ""
    }<div style="font-size:0.74rem;color:${isContrast ? "var(--mark-error)" : "var(--ink-3)"};margin-top:4px;">${escapeHtml(secLabel)}${e.hasDeterministicCheck ? ' · <span style="color:var(--ink-2);font-weight:600;">自动检查</span>' : ""}</div></td>
              <td>${escapeHtml(e.summary)}</td>
              <td style="font-family:var(--font-mono);font-size:0.74rem;white-space:nowrap;text-align:right;">${escapeHtml(metaParts.join(" · ") || "—")}</td>
            </tr>`;
  })
  .join("\n");

const awesomeHtml = `<!DOCTYPE html>
<html lang="zh-CN" data-static-lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <script src="../lang-init.js"></script>
  <title>去 AI 味工具清单 · Awesome Anti-Slop（${radarData.entries.length} 条）— dislop</title>
  <meta name="description" content="去 AI 味才是真正的生产力！整理了 ${radarData.entries.length} 个中英文去 AI 味工具、检查器、写作规范、网页设计指南和论文，链接和仓库信息已核验，可在网页里筛选。">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="dislop">
  <meta property="og:url" content="https://dislop.com/awesome/">
  <meta property="og:title" content="Awesome Anti-Slop — ${radarData.entries.length} 个去 AI 味工具与资料">
  <meta property="og:description" content="去 AI 味才是真正的生产力！中英文去 AI 味工具、检查器、写作与设计规范、代码 PR 治理和论文清单，可在网页里筛选。">
  <meta property="og:image" content="https://dislop.com/assets/og-card-zh.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@dislop_ai">
  <meta name="twitter:title" content="Awesome Anti-Slop — ${radarData.entries.length} 个去 AI 味工具与资料">
  <meta name="twitter:description" content="去 AI 味才是真正的生产力！中英文去 AI 味工具、检查器、写作与设计规范、代码 PR 治理和论文清单。">
  <meta name="twitter:image" content="https://dislop.com/assets/og-card-zh.png">
  <link rel="canonical" href="https://dislop.com/awesome/">
  <link rel="alternate" hreflang="zh-Hans" href="https://dislop.com/awesome/">
  <link rel="alternate" hreflang="en" href="https://dislop.com/en/awesome/">
  <link rel="alternate" hreflang="x-default" href="https://dislop.com/awesome/">
  <link rel="alternate" type="application/atom+xml" href="../feed.xml" title="dislop 实用指南（中文）">
  <link rel="alternate" type="text/markdown" href="./index.md" title="Awesome Anti-Slop Markdown Directory">
  <link rel="alternate" type="application/json" href="./index.json" title="Awesome Anti-Slop JSON (${radarData.schema})">
  <link rel="alternate" type="text/plain" href="../llms.txt" title="LLMs Resource Index">
  <link rel="icon" type="image/svg+xml" href="../assets/logo.svg">
  <link rel="stylesheet" href="../styles.css">
${renderAwesomeJsonLd({ lang: "zh", baseUrl: BASE_URL, entries: radarData.entries })}
</head>
<body>
  <a class="skip-link" href="#main-content" data-i18n="nav.skip">跳至正文</a>
  <div class="rail-shell">
    <header class="topbar band-rule">
      ${renderBrandLockup({ lang: "zh", depthPrefix: "../", homeHref: "../", version: VERSION, metaI18nKey: "nav.brandMeta" })}

      <nav class="nav-links" aria-label="主导航">
${renderPrimaryNavLinks({ lang: "zh", depthPrefix: "../", activeNav: "awesome", ids: AWESOME_NAV_IDS, withI18n: true })}
      </nav>

      <div class="top-controls">
        ${renderGithubCtrl({ i18nKey: "nav.github" })}
        <button type="button" id="lang-toggle" class="ctrl-btn" aria-label="Switch to English">EN</button>
        <button type="button" id="theme-toggle" class="ctrl-btn" aria-label="切换浅深色主题">深色</button>
      </div>
    </header>

    <main id="main-content">
    <section class="section-block band-rule">
      <h1 class="lead-heading" style="max-width:24ch;" data-i18n="awesome.heading">去 AI 味工具清单</h1>
      <p class="section-desc" data-i18n="awesome.sub">
        一共整理了 ${radarData.entries.length} 个中英文工具、检查器、写作规范、网页设计指南和论文，包括 Vale、Impeccable 这类常用项目。可以按类别找，也可以只看能自动检查的工具。链接和 GitHub 状态核验于 ${SNAPSHOT_DATE}。
      </p>
      <div class="page-export-strip">
        <span data-i18n="awesome.exportLabel">给 Agent 或脚本读：</span>
        <a href="./index.json">index.json</a>
        <a href="./index.md">index.md</a>
        <a href="https://github.com/dislop-ai/dislop/blob/main/awesome/README.zh-CN.md" target="_blank" rel="noopener" id="awesome-gh-nav">GitHub</a>
      </div>

${renderAwesomeTriageHtml({ lang: "zh", depthPrefix: "../" })}

      <div class="catalog-controls" style="margin-top:24px;">
        <input type="search" id="awesome-search" class="search-input" placeholder="搜项目名、仓库或用途…" aria-label="搜索工具清单">
        <select id="awesome-section" class="filter-select" aria-label="按类别筛选">
          ${awesomeSectionOptionsHtml}
        </select>
        <select id="awesome-locale" class="filter-select" aria-label="按语种筛选">
          <option value="all" data-i18n="awesome.allLocales">全部语种</option>
          ${radarData.taxonomy.locales.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("")}
        </select>
        <button type="button" id="awesome-det-btn" class="ctrl-btn" aria-pressed="false" data-i18n="awesome.detOnly">只看能自动检查</button>
        <button type="button" id="awesome-reset-btn" class="ctrl-btn" data-i18n="awesome.reset">重置</button>
      </div>

      <div class="filter-bar" style="margin-top:10px;">
        <span class="catalog-count" id="awesome-count" aria-live="polite">${radarData.entries.length} / ${radarData.entries.length} 条</span>
        <span style="font-size:0.78rem;color:var(--ink-3);" data-i18n="awesome.snapNote">核验日期 ${SNAPSHOT_DATE} · 标签页内筛选</span>
      </div>

      <div class="table-scroll" tabindex="0" role="region" aria-label="工具清单表格">
        <table class="radar-table">
          <thead>
            <tr>
              <th data-i18n="awesome.colName">项目与类别</th>
              <th data-i18n="awesome.colSummary">做什么的</th>
              <th style="text-align:right;" data-i18n="awesome.colMeta">星标 · 最近更新</th>
            </tr>
          </thead>
          <tbody id="awesome-tbody">
${awesomePreRenderedRows}
          </tbody>
        </table>
      </div>

      <div class="contrast-notice" data-i18n="awesome.contrastNote">
        说明：「检测与规避研究（仅供对照）」收录概率型 AI 文本检测器和规避工具，只作对照参考。dislop 只清理文案和设计里的 AI 味，不用于规避披露规则。
      </div>
    </section>
    </main>

    <footer class="colophon">
      <div>
        <span data-i18n="footer.snapshot">核验日期：${SNAPSHOT_DATE} · 离线运行，不发外网请求</span>
      </div>
      <div class="colophon-links">
        <a href="../" id="awesome-foot-home" data-i18n="footer.home">返回首页</a>
        <a href="./index.json" data-i18n="footer.json">JSON 数据</a>
        <a href="./index.md">Markdown</a>
        <a href="../llms.txt">llms.txt</a>
        <a href="https://github.com/dislop-ai/dislop/blob/main/awesome/README.zh-CN.md" target="_blank" rel="noopener" id="awesome-gh-foot">GitHub</a>
        <a href="https://x.com/dislop_ai" target="_blank" rel="noopener">X (@dislop_ai)</a>
      </div>
    </footer>
  </div>

  <script type="module" src="./awesome.js"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(AWESOME_OUT, "index.html"), awesomeHtml, "utf8");

// 2h-ter. English Static Pages (/en/, /en/awesome/), Guides (/guides/, /en/guides/) & Rules Wiki (/rules/, /en/rules/)
const { raw: kbData, byId: kbById } = loadKnowledgeBase(ROOT);
const CONTENT_DATE = kbData.snapshotDate || SNAPSHOT_DATE;
const guides = loadGuides(ROOT, kbById, packsById);

const enAwesomeHtml = buildEnglishAwesomeHtml({
  baseUrl: BASE_URL,
  snapshotDate: SNAPSHOT_DATE,
  radarData,
  githubSectionMeta: GITHUB_SECTION_META,
});
fs.mkdirSync(path.join(SITE_DIR, "en", "awesome"), { recursive: true });
fs.writeFileSync(path.join(SITE_DIR, "en", "awesome", "index.html"), enAwesomeHtml, "utf8");

const enHomeHtml = buildEnglishHomeHtml({
  baseUrl: BASE_URL,
  version: VERSION,
  snapshotDate: SNAPSHOT_DATE,
  packsById,
  allRules,
  radarData,
  guides,
});
fs.mkdirSync(path.join(SITE_DIR, "en"), { recursive: true });
fs.writeFileSync(path.join(SITE_DIR, "en", "index.html"), enHomeHtml, "utf8");

const { htmlSitemapPairs, standaloneHtmlUrls } = buildGuidesAndRulesPages({
  siteDir: SITE_DIR,
  baseUrl: BASE_URL,
  version: VERSION,
  snapshotDate: CONTENT_DATE,
  packsById,
  packOrder: PACK_ORDER,
  allRules,
  ruleUiMeta: RULE_UI_META,
  kbById,
  guides,
  registerResource,
});

// 2h-bis. Collaboration Roadmap (/roadmap.md & /roadmap.zh-CN.md, compiled from root ROADMAP*.md)
registerResource({
  id: "roadmap-en",
  pillar: "methodology",
  kind: "guide",
  titleEn: "dislop Roadmap & Collaboration Tracks",
  titleZh: "dislop 路线图（英文）",
  relPath: "roadmap.md",
  modalities: ["markdown", "text", "html", "css", "jsx", "svg", "docx", "pptx", "pdf"],
  languages: ["en"],
  packs: PACK_ORDER,
  relatedTools: ["browser-workbench", "cli", "mcp", "skill"],
  content: `---
content-type: reference-data
version: ${VERSION}
snapshot: ${SNAPSHOT_DATE}
---

${canonicalRoadmapEn.replace("./ROADMAP.zh-CN.md", "./roadmap.zh-CN.md").replace(/\(\.\/(docs|scripts)\//g, "(https://github.com/dislop-ai/dislop/blob/main/$1/")}
`,
});
writeCleanFile(
  "roadmap.zh-CN.md",
  `---
content-type: reference-data
version: ${VERSION}
snapshot: ${SNAPSHOT_DATE}
---

${canonicalRoadmapZh.replace("./ROADMAP.md", "./roadmap.md").replace(/\(\.\/(docs|scripts)\//g, "(https://github.com/dislop-ai/dislop/blob/main/$1/")}
`,
  { isAgentText: true }
);

// 2i. /llms.txt (compact routing index, <= 2.6 KB)
const llmsTxt = writeCleanFile(
  "llms.txt",
  `# dislop

> Cutting AI slop is real productivity. Linter for AI Slop (7 packs, ${allRules.length} rules, 65 patterns, ${radarData.entries.length} tools) for agents and people.

## Quick Start & Agent Setup
1. Evaluate: inspect host (Claude Code, Codex, Cursor, Gemini CLI, or web) and deliverables; pick Skill, CLI, or MCP via [Tools & Setup](${BASE_URL}/tools/index.md).
2. Install: Skill \`npx --yes skills add dislop-ai/dislop --skill dislop\`; CLI \`npx --yes dislop init\` (Node 20+ / \`uvx dislop\`); Remote MCP \`${BASE_URL}/mcp\` (0 cr check, no login).
3. First check: \`npx --yes dislop check <path> --pack auto --compact --json\` (exit \`0\`/\`1\`/\`2\`), summarize hits, and offer to fix.

## Start by task
- [Brief](${BASE_URL}/tasks/business-doc.md): AI artifacts and \`business-brief\` rules.
- [Web & slides](${BASE_URL}/tasks/web-and-deck.md): \`deck-and-ui\` rules and tokens.
- [Essay](${BASE_URL}/tasks/editorial-writing.md): \`literary-essay\` rules and contrasts.
- [Pre-release gate](${BASE_URL}/tasks/pre-release-gate.md): Core \`error\` checks and CI diff gating.

## Browse by topic
- [Guides (EN & ZH)](${BASE_URL}/en/guides/): ${guides.length} tutorials (ZH at \`/guides/\`).
- [Product Brief](${BASE_URL}/methodology/product-brief.md): Positioning and user tiers.
- [Methodology](${BASE_URL}/methodology/index.md): Plain writing guide and visual tokens.
- [Cases & Refs](${BASE_URL}/cases/index.md): Contrasts and 31 design references.
- [Tools & Setup](${BASE_URL}/tools/index.md): Skill, CLI, Plugin, Cloud MCP.
- [Awesome Anti-Slop](${BASE_URL}/awesome/index.md): ${radarData.entries.length} tools & papers (\`/awesome/index.json\`).
- [Roadmap](${BASE_URL}/roadmap.md): Active tracks and collaboration.

## Machine index & discovery
- [MCP Server Card](${BASE_URL}/.well-known/mcp/server-card.json): \`/mcp\` discovery (10 tools).
- [Agent Skills Index](${BASE_URL}/.well-known/agent-skills/index.json): \`SKILL.md\` & card sha256.
- [JSON Catalog](${BASE_URL}/catalog.json): \`dislop.catalog/1\` manifest with sha256.
- [Agent Skill](${BASE_URL}/tools/skill.md): \`SKILL.md\` mirror (\`v${VERSION}\`).
- [Cloud MCP & API](${BASE_URL}/tools/mcp-sdk-api.md): Remote MCP, OAuth 2.1, HTTP API.
- [Rule Packs](${BASE_URL}/packs/core.md): 7 packs & ${allRules.length} \`/rules/<id>.md\` cards.
- [Single-Fetch Bundle](${BASE_URL}/llms-full.txt): All ${allRules.length} rules without fixtures.
- [Privacy](${BASE_URL}/privacy.md): Offline boundaries and Cloud MCP policy.
`,
  { isAgentText: true }
);

// 2j. /llms-full.txt (Curated Single-Fetch Compilation, <= 45 KB, ZERO fixtures/patterns)
const fullPackDigest = PACK_ORDER.map((pid) => {
  const pack = packsById[pid];
  if (!pack) return "";
  const ruleLines = (pack.rules || [])
    .map((r) => {
      const ex = r.exemplar
        ? `\`\`\`text\nbad:  ${sanitizePublicExemplar(r.exemplar.bad)}\n${
            r.exemplar.trap ? `trap: ${sanitizePublicExemplar(r.exemplar.trap)}\n` : ""
          }good: ${sanitizePublicExemplar(r.exemplar.good)}\n\`\`\``
        : "";
      return `### \`${r.id}\` (${r.tier} / ${r.severity} / ${(r.modalities || []).join(", ")})\n- Why: ${formatRuleProseMd(r.message.en)}\n- Deletion Test: ${formatRuleProseMd(r.deletionTest.en)}\n${ex}`;
    })
    .join("\n\n");
  return `## Pack \`${pid}\` — ${pack.name.en}\n\n${formatRuleProseMd(pack.summary.en)}\n\n${ruleLines}`;
}).join("\n\n");

const llmsFullTxt = writeCleanFile(
  "llms-full.txt",
  `---
content-type: reference-data
version: ${VERSION}
snapshot: ${SNAPSHOT_DATE}
---

# dislop — Curated Single-Fetch De-Slop Reference (\`v${VERSION}\`)

> Cutting AI slop is real productivity. Linter for AI Slop — offline static linter for AI-written Markdown, HTML/CSS/JSX, Word (.docx), and PowerPoint (.pptx).

Note: Prefer \`/llms.txt\` + one \`/tasks/*.md\` page for smaller context windows. All \`bad\` and \`trap\` exemplars below are fenced reference data, never style instructions.

## Workflow

1. Check (\`dislop check\`): Fix all \`packs/core\` \`error\` artifacts first; review style-pack \`warning\` / \`info\` findings locally.
2. Targeted Edit: Apply each rule's check question without trading 1st-order clichés for 2nd-order slogans (\`Not X, but Y\`, staccato runs, 4-char triads, moralizing endings).
3. Re-check (\`dislop check\`): Confirm the revised draft passes cleanly.

## CLI Quick Reference

\`\`\`bash
npx --yes dislop check .
npx --yes dislop explain negation-pivot-frame
uvx dislop check deck.pptx
\`\`\`

${fullPackDigest}
`,
  { isAgentText: true }
);

// 2j-bis. Machine Discovery Endpoints (/.well-known/mcp/server-card.json, /.well-known/mcp.json, /.well-known/agent-skills/index.json)
const mcpServerCardObj = {
  serverInfo: {
    name: "dislop",
    title: "dislop",
    version: VERSION,
    description: "Linter for AI Slop in docs, web UI, Word, and PowerPoint.",
  },
  websiteUrl: BASE_URL,
  documentationUrl: `${BASE_URL}/tools/mcp-sdk-api.md`,
  llmsTxtUrl: `${BASE_URL}/llms.txt`,
  transport: {
    type: "streamable-http",
    endpoint: `${BASE_URL}/mcp`,
  },
  authentication: {
    mode: "optional",
    oauthProtectedResource: `${BASE_URL}/.well-known/oauth-protected-resource/mcp`,
    bearerTokenUrl: `${BASE_URL}/#cloud-token-box`,
    freeToolsNoLogin: ["dislop_check", "dislop_verify", "dislop_rules"],
  },
  tools: [
    { name: "dislop_check", credits: 0, authRequired: false },
    { name: "dislop_verify", credits: 0, authRequired: false },
    { name: "dislop_rules", credits: 0, authRequired: false },
    { name: "dislop_review", credits: 1, authRequired: true },
    { name: "dislop_deslop", credits: 2, authRequired: true },
    { name: "dislop_office", credits: 2, authRequired: true },
    { name: "dislop_visual_review", credits: 2, authRequired: true },
    { name: "dislop_voice_extract", credits: 2, authRequired: true },
    { name: "dislop_voice_manage", credits: 0, authRequired: true },
    { name: "dislop_account", credits: 0, authRequired: true },
  ],
};
const mcpServerCardJsonStr = JSON.stringify(mcpServerCardObj, null, 2) + "\n";
fs.mkdirSync(path.join(SITE_DIR, ".well-known", "mcp"), { recursive: true });
fs.writeFileSync(path.join(SITE_DIR, ".well-known", "mcp", "server-card.json"), mcpServerCardJsonStr, "utf8");
fs.writeFileSync(path.join(SITE_DIR, ".well-known", "mcp.json"), mcpServerCardJsonStr, "utf8");

const skillDescMatch = canonicalSkillMd.match(/^description:\s*(.+)$/m);
const skillDescription = skillDescMatch
  ? skillDescMatch[1].trim().replace(/^["']|["']$/g, "")
  : "Pure-Markdown anti-slop reference cards for docs, essays, web UI, Word, and PowerPoint.";
const skillReferences = SKILL_REFS.map((ref) => {
  const refPath = path.join(ROOT, "skills", "dislop", "references", ref.file);
  if (!fs.existsSync(refPath)) return null;
  const refBody = fs.readFileSync(refPath, "utf8");
  return {
    name: ref.file.replace(/\.md$/, ""),
    url: `${BASE_URL}/tools/references/${ref.file}`,
    digest: `sha256:${crypto.createHash("sha256").update(refBody, "utf8").digest("hex")}`,
  };
}).filter(Boolean);

const agentSkillsIndexObj = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  version: VERSION,
  skills: [
    {
      name: "dislop",
      type: "skill-md",
      description: skillDescription,
      url: `${BASE_URL}/tools/skill.md`,
      digest: `sha256:${crypto.createHash("sha256").update(canonicalSkillMd, "utf8").digest("hex")}`,
      install: "npx --yes skills add dislop-ai/dislop --skill dislop",
      references: skillReferences,
    },
  ],
};
const agentSkillsIndexJsonStr = JSON.stringify(agentSkillsIndexObj, null, 2) + "\n";
fs.mkdirSync(path.join(SITE_DIR, ".well-known", "agent-skills"), { recursive: true });
fs.writeFileSync(path.join(SITE_DIR, ".well-known", "agent-skills", "index.json"), agentSkillsIndexJsonStr, "utf8");

// 2k. /catalog.json (schema: "dislop.catalog/1")
const catalogObj = {
  schema: "dislop.catalog/1",
  version: VERSION,
  snapshotDate: SNAPSHOT_DATE,
  baseUrl: BASE_URL,
  pillars: ["methodology", "cases", "tools"],
  discovery: {
    mcpServerCard: "/.well-known/mcp/server-card.json",
    mcpAlias: "/.well-known/mcp.json",
    agentSkillsIndex: "/.well-known/agent-skills/index.json",
    oauthProtectedResource: "/.well-known/oauth-protected-resource/mcp",
  },
  entryPoints: {
    llmsTxt: { path: "/llms.txt", bytes: Buffer.byteLength(llmsTxt, "utf8"), approxTokens: approxTokens(llmsTxt) },
    llmsFullTxt: {
      path: "/llms-full.txt",
      bytes: Buffer.byteLength(llmsFullTxt, "utf8"),
      approxTokens: approxTokens(llmsFullTxt),
    },
    awesomeJson: { path: "/awesome/index.json", entries: radarData.entries.length, schema: radarData.schema },
  },
  resources: catalogResources,
};
const catalogJsonStr = JSON.stringify(catalogObj, null, 2) + "\n";
fs.writeFileSync(path.join(SITE_DIR, "catalog.json"), catalogJsonStr, "utf8");

// 2l. Search & Crawlability files (/robots.txt & /sitemap.xml)
const searchBots = [
  "*",
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
];
const robotsTxt =
  searchBots
    .map(
      (ua) => `User-agent: ${ua}
Allow: /
Disallow: /api/
Disallow: /mcp`
    )
    .join("\n\n") +
  `

# Agent index: ${BASE_URL}/llms.txt
# MCP server card: ${BASE_URL}/.well-known/mcp/server-card.json
# Agent skills index: ${BASE_URL}/.well-known/agent-skills/index.json
Sitemap: ${BASE_URL}/sitemap.xml
`;
fs.writeFileSync(path.join(SITE_DIR, "robots.txt"), robotsTxt, "utf8");

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const bilingualPairs = [
  { zh: "/", en: "/en/", prio: "1.0" },
  { zh: "/awesome/", en: "/en/awesome/", prio: "0.9" },
  ...htmlSitemapPairs,
];

const sitemapEntries = new Map();
for (const pair of bilingualPairs) {
  const zhUrl = `${BASE_URL}${pair.zh}`;
  const enUrl = `${BASE_URL}${pair.en}`;
  const alts = [
    { hreflang: "zh-Hans", href: zhUrl },
    { hreflang: "en", href: enUrl },
    { hreflang: "x-default", href: zhUrl },
  ];
  sitemapEntries.set(zhUrl, { loc: zhUrl, lastmod: CONTENT_DATE, priority: pair.prio, alts });
  sitemapEntries.set(enUrl, { loc: enUrl, lastmod: CONTENT_DATE, priority: pair.prio, alts });
}

const standaloneUrls = [
  ...standaloneHtmlUrls,
  [`${BASE_URL}/llms.txt`, "0.8"],
  [`${BASE_URL}/llms-full.txt`, "0.7"],
  [`${BASE_URL}/feed.xml`, "0.6"],
  [`${BASE_URL}/en/feed.xml`, "0.6"],
  [`${BASE_URL}/roadmap.md`, "0.6"],
  [`${BASE_URL}/roadmap.zh-CN.md`, "0.6"],
  [`${BASE_URL}/privacy.md`, "0.5"],
];
for (const [loc, prio] of standaloneUrls) {
  sitemapEntries.set(loc, { loc, lastmod: CONTENT_DATE, priority: prio, alts: [] });
}
for (const res of catalogResources) {
  const fullUrl = `${BASE_URL}${res.path.startsWith("/") ? res.path : `/${res.path}`}`;
  if (!sitemapEntries.has(fullUrl)) {
    const prio = res.kind === "guide" || res.kind === "task" ? "0.7" : "0.6";
    sitemapEntries.set(fullUrl, { loc: fullUrl, lastmod: CONTENT_DATE, priority: prio, alts: [] });
  }
}

const sitemapUrls = [...sitemapEntries.values()].sort((a, b) => a.loc.localeCompare(b.loc));
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sitemapUrls
  .map((entry) => {
    const altLines = entry.alts
      .map(
        (alt) =>
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(alt.hreflang)}" href="${escapeXml(alt.href)}" />`
      )
      .join("\n");
    return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>\n    <priority>${entry.priority}</priority>${altLines ? `\n${altLines}` : ""}\n  </url>`;
  })
  .join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(SITE_DIR, "sitemap.xml"), sitemapXml, "utf8");

// ---------- 3. Pre-Render Static Content into site/index.html ----------

let indexHtml = fs.readFileSync(path.join(SITE_DIR, "index.html"), "utf8");
indexHtml = replaceBuildBlock(
  indexHtml,
  "SEO_JSONLD",
  renderHomeJsonLd({
    lang: "zh",
    baseUrl: BASE_URL,
    version: VERSION,
    ruleCount: allRules.length,
    awesomeCount: radarData.entries.length,
    guideCount: guides.length,
  })
);

// 3a. Pre-rendered Rules Table in default Chinese (en-only rules hidden on initial ZH load, preserving #rule-<id> anchors)
const textMods = new Set(["markdown", "text", "html", "css", "jsx", "svg"]);
const PACK_LABELS_ZH = {
  core: "交付底线",
  "business-brief": "工作文档",
  "engineering-spec": "研发文档与复盘",
  "regulated-comms": "对外合规",
  "literary-essay": "随笔长文",
  "deck-and-ui": "PPT 和网页",
  "executive-deck": "管理汇报",
};
const preRenderedRules = allRules
  .map(({ packId, rule: r }) => {
    const meta = RULE_UI_META[r.id] || { lang: "both", title: { zh: r.id, en: r.id } };
    const isEnOnly = meta.lang === "en";
    const sevCls = r.severity === "error" ? "sev-error" : r.severity === "info" ? "sev-info" : "sev-warning";
    const sevTextZh = r.severity === "error" ? "硬伤" : r.severity === "warning" ? "提醒" : "轻提示";
    const canTry = r.exemplar && (r.modalities || []).some((m) => textMods.has(m));
    const ex = isEnOnly ? r.exemplar : meta.zhEx || r.exemplar;
    const exLines = ex
      ? [
          `<div class="ex-stack">`,
          `                 <div class="ex-row-bad"><strong>原句：</strong> <code>${escapeHtml(sanitizePublicExemplar(ex.bad))}</code></div>`,
          ...(ex.trap
            ? [`                 <div class="ex-row-trap"><strong>换了种 AI 味：</strong> <code>${escapeHtml(sanitizePublicExemplar(ex.trap))}</code></div>`]
            : []),
          `                 <div class="ex-row-good"><strong>改好：</strong> <code>${escapeHtml(sanitizePublicExemplar(ex.good))}</code></div>`,
          `               </div>`,
        ].join("\n")
      : "—";
    const actionLines = [];
    if (canTry) {
      actionLines.push(
        `                  <button type="button" class="ctrl-btn ctrl-btn-sm sheet-btn" data-try-rule="${escapeHtml(r.id)}" aria-label="在工作台试试 ${escapeHtml(meta.title.zh)}">试试 ↑</button>`
      );
    }
    actionLines.push(
      `                  <a class="rule-md-link" href="./rules/${escapeHtml(r.id)}.md" aria-label="查看 ${escapeHtml(r.id)} 规则卡片">.md</a>`
    );
    return `            <tr id="rule-${escapeHtml(r.id)}" class="rule-row" data-rule-lang="${escapeHtml(meta.lang)}"${isEnOnly ? " hidden" : ""}>
              <td class="rule-id-cell">
                <strong>${escapeHtml(meta.title.zh)}</strong>
                <div style="margin-top:2px;"><code>${escapeHtml(r.id)}</code></div>
                <div class="rule-id-actions">
${actionLines.join("\n")}
                </div>
              </td>
              <td class="rule-pack-cell"><span class="rule-pack-name">${escapeHtml(PACK_LABELS_ZH[packId] || packId)}</span><span class="sev-tag ${sevCls}" style="font-size:0.75rem;">${sevTextZh}</span></td>
              <td><code>${escapeHtml((r.modalities || []).join(", "))}</code></td>
              <td><div>${formatRuleProseHtml(r.message.zh || r.message.en)}</div><div style="color:var(--ink-2);font-size:0.82rem;margin-top:4px;"><strong>判断方法：</strong>${formatRuleProseHtml(r.deletionTest.zh || r.deletionTest.en)}</div></td>
              <td>${exLines}</td>
            </tr>`;
  })
  .join("\n");

indexHtml = replaceBuildBlock(indexHtml, "RULES_TABLE", preRenderedRules);

// 3b. Pre-rendered Agent Endpoints Ledger (Chinese default)
const featuredEndpoints = [
  { path: "./llms.txt", label: "/llms.txt", i18nKey: "ep.llms", desc: "Agent 入口索引", bytes: Buffer.byteLength(llmsTxt, "utf8"), tok: approxTokens(llmsTxt) },
  { path: "./catalog.json", label: "/catalog.json", i18nKey: "ep.catalog", desc: "全部文档的 JSON 目录", bytes: Buffer.byteLength(catalogJsonStr, "utf8"), tok: approxTokens(catalogJsonStr) },
  { path: "./.well-known/mcp/server-card.json", label: "/.well-known/mcp/server-card.json", i18nKey: "ep.mcpCard", desc: "MCP 自动发现描述（10 个工具）", bytes: Buffer.byteLength(mcpServerCardJsonStr, "utf8"), tok: approxTokens(mcpServerCardJsonStr) },
  { path: "./.well-known/agent-skills/index.json", label: "/.well-known/agent-skills/index.json", i18nKey: "ep.skillsIdx", desc: "Agent Skills 索引与 SHA-256", bytes: Buffer.byteLength(agentSkillsIndexJsonStr, "utf8"), tok: approxTokens(agentSkillsIndexJsonStr) },
  { path: "./tasks/business-doc.md", label: "/tasks/business-doc.md", i18nKey: "ep.taskBiz", desc: "任务卡：工作文档与技术方案", resId: "task-business-doc" },
  { path: "./tasks/web-and-deck.md", label: "/tasks/web-and-deck.md", i18nKey: "ep.taskWeb", desc: "任务卡：网页与 PPT 模板味", resId: "task-web-and-deck" },
  { path: "./tasks/editorial-writing.md", label: "/tasks/editorial-writing.md", i18nKey: "ep.taskEdit", desc: "任务卡：随笔与长文", resId: "task-editorial-writing" },
  { path: "./tasks/pre-release-gate.md", label: "/tasks/pre-release-gate.md", i18nKey: "ep.taskGate", desc: "任务卡：发稿前 AI 残留硬伤检查", resId: "task-pre-release-gate" },
  { path: "./tools/skill.md", label: "/tools/skill.md", i18nKey: "ep.skill", desc: "跨宿主 Agent Skill", resId: "tools-skill" },
  { path: "./awesome/index.json", label: "/awesome/index.json", i18nKey: "ep.awesome", desc: `${radarData.entries.length} 条工具清单 JSON`, bytes: Buffer.byteLength(awesomeJsonStr, "utf8"), tok: approxTokens(awesomeJsonStr) },
  { path: "./methodology/product-brief.md", label: "/methodology/product-brief.md", i18nKey: "ep.brief", desc: "产品定义（定位 / 用户 / 卖点）", resId: "methodology-product-brief" },
  { path: "./methodology/brand-and-voice.md", label: "/methodology/brand-and-voice.md", i18nKey: "ep.method", desc: "文案与设计基准", resId: "methodology-brand-voice" },
  { path: "./llms-full.txt", label: "/llms-full.txt", i18nKey: "ep.full", desc: `单次拉取的全部 ${allRules.length} 条规则`, bytes: Buffer.byteLength(llmsFullTxt, "utf8"), tok: approxTokens(llmsFullTxt) },
];

const endpointsHtml = featuredEndpoints
  .map((ep) => {
    let bytes = ep.bytes;
    let tok = ep.tok;
    if (ep.resId) {
      const found = catalogResources.find((r) => r.id === ep.resId);
      if (!found) {
        throw new Error(`Unknown featuredEndpoint resId: ${ep.resId}`);
      }
      bytes = found.bytes;
      tok = found.approxTokens;
    }
    const kb = (bytes / 1024).toFixed(1);
    return `          <div class="endpoint-row">
            <div class="endpoint-main">
              <a class="endpoint-path" href="${ep.path}">${escapeHtml(ep.label)}</a>
              <div class="endpoint-desc" data-i18n="${ep.i18nKey}">${escapeHtml(ep.desc)}</div>
            </div>
            <span class="endpoint-meta">${kb} KB · ~${tok} tok</span>
          </div>`;
  })
  .join("\n");

indexHtml = replaceBuildBlock(indexHtml, "ENDPOINTS", endpointsHtml);

// 3c. Default Prompt snippet pre-rendered in Chinese
const defaultSnippet = `# 复制下面这句话发给你的 Agent（自动评估、安装并试跑）：
请阅读 https://dislop.com/llms.txt，结合我当前的环境与项目内容评估最合适的 dislop 接入方式（Skill、本地 CLI 或远程 MCP），完成安装配置并拿现有文件试跑一次。`;

indexHtml = replaceBuildBlock(indexHtml, "DEFAULT_SNIPPET", escapeHtml(defaultSnippet));

// 3d. Awesome live stats computed directly from SSOT (Chinese default, translated by app.js)
const detCount = radarData.entries.filter((e) => e.hasDeterministicCheck).length;
const zhCount = radarData.entries.filter((e) => e.locale === "zh" || e.locale === "multilingual").length;
const radarStatsHtml = `          <div class="stat-strip">
            <div class="stat-cell"><span class="stat-num">${radarData.entries.length}</span><span class="stat-label" data-i18n="stat.entries">条资料</span></div>
            <div class="stat-cell"><span class="stat-num">${radarData.taxonomy.sections.length}</span><span class="stat-label" data-i18n="stat.sections">个分类</span></div>
            <div class="stat-cell"><span class="stat-num">${detCount}</span><span class="stat-label" data-i18n="stat.det">个可自动检查</span></div>
            <div class="stat-cell"><span class="stat-num">${zhCount}</span><span class="stat-label" data-i18n="stat.zh">条中文 / 多语种</span></div>
          </div>`;

indexHtml = replaceBuildBlock(indexHtml, "RADAR_STATS", radarStatsHtml);

// 3e. Positive Non-Mainstream Design References compiled directly from verified-positive-sources.json (Chinese default, toggled by app.js)
const featuredPosIds = ["norm-zurich", "stiftung-buchkunst", "fonts-in-use", "dinamo", "the-type", "arena"];
const POS_ZH_NOTES = {
  "norm-zurich": "苏黎世独立设计事务所，用严格的模数网格排版。",
  "stiftung-buchkunst": "世界最美的书评选档案：看页边距、版心比例与长篇阅读怎么排得不挤。",
  "fonts-in-use": "真实印刷品与网页里的字体搭配库。",
  dinamo: "瑞士独立字厂，看可变字重与大号字阶怎么撑起实用界面。",
  "the-type": "中文排印评论，细聊标点挤压、混排细节与出版规范。",
  arena: "研究者自己攒的视觉线索库：旧印刷、路牌与独立小书。",
};
const featuredPos = featuredPosIds
  .map((id) => positiveSources.entries.find((e) => e.id === id))
  .filter(Boolean);

const posRefsHtml = `          <ul class="ref-list">
${featuredPos
  .map(
    (e) =>
      `            <li><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${escapeHtml(e.name)}</a><span class="ref-note" data-i18n="pos.${escapeHtml(e.id)}">${escapeHtml(POS_ZH_NOTES[e.id] || e.extractablePrinciple)}</span></li>`
  )
  .join("\n")}
          </ul>`;

indexHtml = replaceBuildBlock(indexHtml, "POSITIVE_REFS", posRefsHtml);

// 3f. Masthead version label follows package.json (static markup, rewritten on every build)
const brandVerRe = /<span class="brand-ver">v[^<]*<\/span>/;
if (!brandVerRe.test(indexHtml)) {
  throw new Error('Missing <span class="brand-ver"> masthead version label in site/index.html');
}
indexHtml = indexHtml.replace(brandVerRe, `<span class="brand-ver">v${VERSION}</span>`);

fs.writeFileSync(path.join(SITE_DIR, "index.html"), indexHtml, "utf8");

// ---------- 4. Build-Time Security, Budget & Link Assertions ----------

const errors = [];

// Every published guide must stay linked from the homepage guide index (copy lives in site/app.js I18N)
for (const g of guides) {
  if (!indexHtml.includes(`data-guide-slug="${g.slug}"`)) {
    errors.push(`site/index.html #guides-home is missing guide ${g.slug}`);
  }
}

const llmsBytes = Buffer.byteLength(llmsTxt, "utf8");
if (llmsBytes > 2600) {
  errors.push(`site/llms.txt exceeds 2600-byte budget (${llmsBytes} bytes)`);
}
const llmsFullBytes = Buffer.byteLength(llmsFullTxt, "utf8");
if (llmsFullBytes > 45000) {
  errors.push(`site/llms-full.txt exceeds 45000-byte budget (${llmsFullBytes} bytes)`);
}

// Verify zero fixtures.hit strings or raw regex patterns leaked into Agent endpoints
const forbiddenFixtureSamples = [
  "file:///Users/alice/Documents/spec.pdf",
  "PPTX_WORD_WALL:145",
  "DOCX_RAW_MARKDOWN:",
  "<!--",
];
for (const res of catalogResources) {
  const diskPath = path.join(SITE_DIR, res.path.replace(/^\//, ""));
  if (!fs.existsSync(diskPath)) {
    errors.push(`Missing catalog target on disk: ${res.path}`);
    continue;
  }
  const body = fs.readFileSync(diskPath, "utf8");
  if (res.kind === "rule" && Buffer.byteLength(body, "utf8") > 1800) {
    errors.push(`Atomic rule card ${res.path} exceeds 1800 bytes (${Buffer.byteLength(body, "utf8")} bytes)`);
  }
  if (INVISIBLE_BIDI_RE.test(body)) {
    INVISIBLE_BIDI_RE.lastIndex = 0;
    errors.push(`Hidden Unicode/bidi character detected in ${res.path}`);
  }
  INVISIBLE_BIDI_RE.lastIndex = 0;
  for (const leak of forbiddenFixtureSamples) {
    if (body.includes(leak)) {
      errors.push(`Forbidden fixture/comment marker "${leak}" leaked into ${res.path}`);
    }
  }
}

// Verify every dislop.com URL in llms.txt resolves to a file in site/ or known dynamic cloud route
const DYNAMIC_CLOUD_PATHS = new Set(["/mcp", "/api/health"]);
for (const m of llmsTxt.matchAll(/https:\/\/dislop\.com(\/[^\s)`]+)/g)) {
  if (DYNAMIC_CLOUD_PATHS.has(m[1])) continue;
  const target = m[1].split("#")[0].replace(/\/$/, "/index.html");
  const full = path.join(SITE_DIR, target.replace(/^\//, ""));
  if (!fs.existsSync(full)) {
    errors.push(`Broken URL in llms.txt: ${m[0]} (missing site${target})`);
  }
}

if (errors.length > 0) {
  console.error("Site build assertions failed:");
  for (const err of errors) console.error(" -", err);
  process.exit(1);
}

console.log(
  `Built static site & agent docs: core.mjs, logo.svg, og-card, ${Object.keys(packsById).length} packs (${allRules.length} rules), ` +
    `${radarData.entries.length} Awesome Anti-Slop entries, ${catalogResources.length} catalog resources, ` +
    `llms.txt (${llmsBytes} B), llms-full.txt (${llmsFullBytes} B).`
);
