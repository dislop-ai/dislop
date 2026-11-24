import { AWESOME_DATA } from "./awesome-data.mjs";

const SECTION_LABELS = {
  "standards-research-policy": { zh: "标准、研究与平台政策", en: "Standards, Research, and Policy" },
  "prose-en-multilingual": { zh: "英文与多语种写作", en: "English and Multilingual Writing" },
  "prose-zh": { zh: "中文写作与去翻译腔", en: "Chinese Writing and Localization" },
  "deterministic-prose-linters": { zh: "确定性检查工具", en: "Deterministic Linters" },
  "ui-design-and-media": { zh: "前端界面、设计与图表", en: "UI, Design, and Diagrams" },
  "code-and-pr-governance": { zh: "代码与 PR 治理", en: "Code and PR Governance" },
  "awesome-and-registries": { zh: "目录与注册中心", en: "Awesome Lists and Registries" },
  "contrast-and-detection": { zh: "检测与规避研究（仅供对照）", en: "Contrast Watch (Reference Only)" },
};

const SNAPSHOT_DATE = AWESOME_DATA.snapshotDate || "2026-11-21";
const TOTAL_COUNT = (AWESOME_DATA.entries || []).length;

const I18N = {
  zh: {
    "page.title": `去 AI 味工具清单 · Awesome Anti-Slop（${TOTAL_COUNT} 条）— dislop`,
    "nav.skip": "跳至正文",
    "nav.signIn": "登录 · 30 免费额度",
    "nav.brandMeta": "AI 味检查",
    "nav.workbench": "工作台",
    "nav.surfaces": "接入",
    "nav.cases": "案例",
    "nav.guides": "指南",
    "nav.awesome": "工具清单",
    "nav.rules": "规则",
    "nav.github": "GitHub ★",
    "awesome.exportLabel": "给 Agent 或脚本读：",
    "triage.h1": "想在本地或 CI 里自动拦截硬伤",
    "triage.p1": "优先用确定性检查工具（dislop、Vale、textlint），按规则直出精确行号，不花模型额度。",
    "triage.a1": "看检查器与检测器对比 →",
    "triage.h2": "想让 Agent 动笔前先避开套话",
    "triage.p2": "在编码或写作工具里挂载 Humanizer-zh、stop-slop 等纯文档 Skill，写完再跑一遍本地检查。",
    "triage.a2": "看中文写作去味指南 →",
    "triage.h3": "要排查网页模板味或 PPT 排版",
    "triage.p3": "把 frontend-design、Impeccable 和 dislop 网页/PPT 规则配在一起，清掉紫粉渐变、空链接和字墙。",
    "triage.a3": "看前端与 PPT 排查教程 →",
    "awesome.heading": "去 AI 味工具清单",
    "awesome.sub":
      `一共整理了 ${TOTAL_COUNT} 个中英文工具、检查器、写作规范、网页设计指南和论文，包括 Vale、Impeccable 这类常用项目。可以按类别找，也可以只看能自动检查的工具。链接和 GitHub 状态核验于 ${SNAPSHOT_DATE}。`,
    "awesome.allSections": `全部类别（${TOTAL_COUNT}）`,
    "awesome.allLocales": "全部语种",
    "awesome.detOnly": "只看能自动检查",
    "awesome.reset": "重置",
    "awesome.snapNote": `核验日期 ${SNAPSHOT_DATE} · 标签页离线筛选`,
    "awesome.colName": "项目与类别",
    "awesome.colSummary": "做什么的",
    "awesome.colMeta": "星标 · 最近更新",
    "awesome.contrastNote":
      "说明：「检测与规避研究（仅供对照）」收录概率型 AI 文本检测器和规避工具，只作对照参考。dislop 只清理文案和设计里的 AI 味，不用于规避披露规则。",
    "footer.snapshot": `核验日期：${SNAPSHOT_DATE} · 离线运行，不发外网请求`,
    "footer.home": "返回首页",
    "footer.json": "JSON 数据",
    "theme.dark": "深色",
    "theme.light": "浅色",
  },
  en: {
    "page.title": `Awesome Anti-Slop (${TOTAL_COUNT} Entries) — dislop`,
    "nav.skip": "Skip to main content",
    "nav.signIn": "Sign in · 30 free",
    "nav.brandMeta": "AI slop linter",
    "nav.workbench": "Workbench",
    "nav.surfaces": "Setup",
    "nav.cases": "Cases",
    "nav.guides": "Guides",
    "nav.awesome": "Directory",
    "nav.rules": "Rules",
    "nav.github": "GitHub ★",
    "awesome.exportLabel": "For agents and scripts:",
    "triage.h1": "Catch hard bugs locally or in CI",
    "triage.p1": "Start with deterministic linters (dislop, Vale, textlint) that flag exact lines with zero LLM calls.",
    "triage.a1": "Compare linters vs. skills →",
    "triage.h2": "Steer your agent before it drafts",
    "triage.p2": "Load a Markdown Skill such as Humanizer or stop-slop into your agent, then verify the final draft locally.",
    "triage.a2": "Read the writing guide →",
    "triage.h3": "Clean up template web UI and slides",
    "triage.p3": "Pair frontend-design or Impeccable with dislop UI and PPTX rules to strip gradients, dead links, and word walls.",
    "triage.a3": "Read the web UI guide →",
    "awesome.heading": "Awesome Anti-Slop",
    "awesome.sub":
      `${TOTAL_COUNT} tools, linters, style guides, UI rules, and papers in English and Chinese, including established projects like Vale and Impeccable. Filter by topic or show only automated tools. Links and GitHub snapshots checked on ${SNAPSHOT_DATE}.`,
    "awesome.allSections": `All topics (${TOTAL_COUNT})`,
    "awesome.allLocales": "All locales",
    "awesome.detOnly": "Automated checks only",
    "awesome.reset": "Reset",
    "awesome.snapNote": `Checked ${SNAPSHOT_DATE} · Filters offline in this tab`,
    "awesome.colName": "Project & topic",
    "awesome.colSummary": "What it does",
    "awesome.colMeta": "Stars · last push",
    "awesome.contrastNote":
      "Note: Contrast Watch lists probabilistic AI-text detectors and bypass tools for reference only. dislop flags AI slop in writing and design; it is not for evading disclosure policies.",
    "footer.snapshot": `Checked ${SNAPSHOT_DATE} · Runs offline with no outbound requests`,
    "footer.home": "Back to dislop",
    "footer.json": "JSON",
    "theme.dark": "Dark",
    "theme.light": "Light",
  },
};

function safeGetStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore restricted/private-mode storage errors
  }
}

function detectInitialLang() {
  const staticLang =
    typeof document !== "undefined" && document.documentElement
      ? document.documentElement.getAttribute("data-static-lang")
      : "";
  if (staticLang === "en") {
    try {
      const q = new URLSearchParams(window.location.search).get("lang");
      if (q && /^zh\b/i.test(String(q).trim())) return "zh";
    } catch {
      // Ignore URL parse issues
    }
    return "en";
  }
  if (typeof window.__DISLOP_RESOLVE_LANG__ === "function") {
    let intlLocale = "";
    try {
      intlLocale = Intl.DateTimeFormat().resolvedOptions().locale || "";
    } catch {
      intlLocale = "";
    }
    return window.__DISLOP_RESOLVE_LANG__({
      search: window.location ? window.location.search : "",
      stored: safeGetStorage("dislop-lang"),
      languages: typeof navigator !== "undefined" ? navigator.languages : undefined,
      language: typeof navigator !== "undefined" ? navigator.language || "" : "",
      intlLocale,
    });
  }
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q) {
      const norm = String(q).trim().toLowerCase();
      if (/^zh\b/.test(norm)) return "zh";
      if (/^en\b/.test(norm)) return "en";
    }
  } catch {
    // Ignore URL parse issues
  }
  const saved = safeGetStorage("dislop-lang");
  if (saved === "en" || saved === "zh") return saved;
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const list = Array.isArray(nav.languages) && nav.languages.length > 0 ? nav.languages : nav.language ? [nav.language] : [];
  for (const raw of list) {
    const tag = String(raw || "").trim().toLowerCase();
    if (/^zh\b/.test(tag)) return "zh";
    if (/^en\b/.test(tag)) return "en";
  }
  if (list.length > 0) return "en";
  try {
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale || "";
    if (/^zh\b/i.test(intlLocale)) return "zh";
  } catch {
    // Ignore Intl errors
  }
  return "en";
}

let currentLang = detectInitialLang();
let currentTheme = "light";
let activeSection = "all";
let activeLocale = "all";
let deterministicOnly = false;
let searchQuery = "";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatStars(n) {
  if (typeof n !== "number") return "—";
  return `${n.toLocaleString("en-US")}★`;
}

function resetAllFilters() {
  activeSection = "all";
  activeLocale = "all";
  deterministicOnly = false;
  searchQuery = "";

  const searchEl = document.getElementById("awesome-search");
  if (searchEl) searchEl.value = "";
  const secEl = document.getElementById("awesome-section");
  if (secEl) secEl.value = "all";
  const locEl = document.getElementById("awesome-locale");
  if (locEl) locEl.value = "all";
  const detBtn = document.getElementById("awesome-det-btn");
  if (detBtn) {
    detBtn.setAttribute("aria-pressed", "false");
    detBtn.classList.remove("is-active");
  }
  renderTable();
}

function updateSectionSelectLabels() {
  const secEl = document.getElementById("awesome-section");
  if (!secEl) return;
  const entries = AWESOME_DATA.entries || [];
  for (const opt of secEl.options) {
    const val = opt.value;
    if (val === "all") {
      opt.textContent = I18N[currentLang]["awesome.allSections"];
    } else {
      const cnt = entries.filter((e) => e.section === val).length;
      const label = SECTION_LABELS[val]?.[currentLang] || val;
      opt.textContent = currentLang === "zh" ? `${label}（${cnt}）` : `${label} (${cnt})`;
    }
  }
}

function renderTable() {
  const tbody = document.getElementById("awesome-tbody");
  const countEl = document.getElementById("awesome-count");
  if (!tbody) return;

  const q = searchQuery.trim().toLowerCase();
  const entries = AWESOME_DATA.entries || [];
  const filtered = entries.filter((e) => {
    if (activeSection !== "all" && e.section !== activeSection) return false;
    if (activeLocale !== "all" && e.locale !== activeLocale) return false;
    if (deterministicOnly && !e.hasDeterministicCheck) return false;
    if (q) {
      const hay = [e.id, e.name, e.nameEn, e.repo, e.summary, e.summaryEn, e.modality, e.locale, e.section]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (countEl) {
    countEl.textContent =
      currentLang === "zh"
        ? `${filtered.length} / ${entries.length} 条`
        : `${filtered.length} / ${entries.length} entries`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="padding:20px;color:var(--ink-2);">${
      currentLang === "zh"
        ? '没有匹配的条目。<button type="button" class="ctrl-btn ctrl-btn-sm" id="empty-reset-btn" style="margin-left:8px;">重置筛选</button>'
        : 'No matching entries. <button type="button" class="ctrl-btn ctrl-btn-sm" id="empty-reset-btn" style="margin-left:8px;">Reset</button>'
    }</td></tr>`;
    const btn = document.getElementById("empty-reset-btn");
    if (btn) btn.addEventListener("click", resetAllFilters);
    return;
  }

  const autoTag = currentLang === "zh" ? "自动检查" : "automated check";
  const archivedTag = currentLang === "zh" ? "已归档" : "archived";

  tbody.innerHTML = filtered
    .map((e) => {
      const secLabel = SECTION_LABELS[e.section]?.[currentLang] || e.section;
      const isContrast = e.section === "contrast-and-detection";
      const displayName = currentLang === "en" ? e.nameEn || e.name : e.name;
      const displaySummary = currentLang === "en" ? e.summaryEn || e.summary : e.summary;
      const metaParts = [];
      if (typeof e.stars === "number") metaParts.push(formatStars(e.stars));
      if (e.pushedAt) metaParts.push(e.pushedAt);
      if (e.license && e.license !== "NOASSERTION") metaParts.push(e.license);
      if (e.archived) metaParts.push(archivedTag);

      return `<tr>
        <td><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener"><strong>${escapeHtml(displayName)}</strong></a>${
        e.repo ? `<div style="font-family:var(--font-mono);font-size:0.73rem;color:var(--ink-3);margin-top:2px;">${escapeHtml(e.repo)}</div>` : ""
      }<div style="font-size:0.74rem;color:${isContrast ? "var(--mark-error)" : "var(--ink-3)"};margin-top:4px;">${escapeHtml(secLabel)}${
        e.hasDeterministicCheck ? ` · <span style="color:var(--ink-2);font-weight:600;">${autoTag}</span>` : ""
      }</div></td>
        <td>${escapeHtml(displaySummary)}</td>
        <td style="font-family:var(--font-mono);font-size:0.74rem;white-space:nowrap;text-align:right;">${escapeHtml(metaParts.join(" · ") || "—")}</td>
      </tr>`;
    })
    .join("");
}

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  safeSetStorage("dislop-theme", theme);
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.textContent = theme === "dark" ? I18N[currentLang]["theme.light"] : I18N[currentLang]["theme.dark"];
  }
}

function applyLanguage(lang, isUserSwitch = false) {
  const isEnStaticPage = document.documentElement.getAttribute("data-static-lang") === "en";
  if (isUserSwitch) {
    safeSetStorage("dislop-lang", lang);
    if (isEnStaticPage && lang === "zh") {
      window.location.href = "../../awesome/?lang=zh";
      return;
    }
  }
  currentLang = lang;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = I18N[lang]["page.title"];

  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    if (I18N[lang][key] !== undefined) {
      el.textContent = I18N[lang][key];
    }
  }

  const rootPrefix = isEnStaticPage ? "../../" : "../";
  const langPrefix = lang === "en" ? `${rootPrefix}en/` : rootPrefix;
  const homeNav = document.getElementById("awesome-home-link");
  const surfacesNav = document.getElementById("awesome-surfaces-link");
  const casesNav = document.getElementById("awesome-cases-link");
  const guidesNav = document.getElementById("awesome-guides-link");
  const rulesNav = document.getElementById("awesome-rules-link");
  const footHome = document.getElementById("awesome-foot-home");
  // The live workbench and cases sit on the root page (?lang=en switches it); /en/ carries the static setup section
  const rootQuery = lang === "en" ? `${rootPrefix}?lang=en` : rootPrefix;
  if (homeNav) homeNav.href = `${rootQuery}#workbench`;
  if (surfacesNav) surfacesNav.href = `${langPrefix}#surfaces`;
  if (casesNav) casesNav.href = `${rootQuery}#cases`;
  if (footHome) footHome.href = langPrefix;
  const acctCtrl = document.querySelector("[data-static-acct]");
  if (acctCtrl) {
    acctCtrl.href = `${rootQuery}#cloud-token-box`;
    let signedIn = false;
    try {
      signedIn =
        /(?:^|;\s*)dslp_hint=1(?:;|$)/.test(document.cookie || "") ||
        Boolean(JSON.parse(safeGetStorage("dislop_cloud_account_v1") || "{}").token);
    } catch {
      signedIn = false;
    }
    if (signedIn) {
      acctCtrl.classList.add("is-signed-in");
      acctCtrl.textContent = lang === "en" ? "Account · Cloud" : "账号与额度";
    } else {
      acctCtrl.classList.remove("is-signed-in");
      acctCtrl.textContent = I18N[lang]["nav.signIn"];
    }
  }
  const mainNavEl = document.querySelector("nav.nav-links");
  if (mainNavEl) mainNavEl.setAttribute("aria-label", lang === "zh" ? "主导航" : "Main navigation");
  const langToggleBtn = document.getElementById("lang-toggle");
  if (langToggleBtn) langToggleBtn.setAttribute("lang", lang === "zh" ? "en" : "zh-CN");
  if (guidesNav) guidesNav.href = `${langPrefix}guides/`;
  if (rulesNav) rulesNav.href = `${langPrefix}rules/`;
  const t1 = document.getElementById("triage-link-1");
  const t2 = document.getElementById("triage-link-2");
  const t3 = document.getElementById("triage-link-3");
  if (t1) t1.href = `${langPrefix}guides/linter-vs-detector-vs-skill/`;
  if (t2) t2.href = `${langPrefix}guides/remove-ai-slop-writing/`;
  if (t3) t3.href = `${langPrefix}guides/fix-ai-slop-web-ui/`;

  const langBtn = document.getElementById("lang-toggle");
  if (langBtn) {
    langBtn.textContent = lang === "zh" ? "EN" : "中文";
    langBtn.setAttribute("aria-label", lang === "zh" ? "Switch to English" : "切换为中文");
  }

  const themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    themeBtn.textContent = currentTheme === "dark" ? I18N[lang]["theme.light"] : I18N[lang]["theme.dark"];
  }

  const searchEl = document.getElementById("awesome-search");
  if (searchEl) {
    searchEl.placeholder = lang === "zh" ? "搜项目名、仓库或用途…" : "Search name, repo, or what it does...";
  }

  const ghUrl =
    lang === "zh"
      ? "https://github.com/dislop-ai/dislop/blob/main/awesome/README.zh-CN.md"
      : "https://github.com/dislop-ai/dislop/tree/main/awesome";
  const ghNav = document.getElementById("awesome-gh-nav");
  const ghFoot = document.getElementById("awesome-gh-foot");
  if (ghNav) ghNav.href = ghUrl;
  if (ghFoot) ghFoot.href = ghUrl;

  updateSectionSelectLabels();
  renderTable();
  document.documentElement.removeAttribute("data-lang-hydrating");
}

function init() {
  const savedTheme = safeGetStorage("dislop-theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (prefersDark ? "dark" : "light"));

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    applyTheme(currentTheme === "dark" ? "light" : "dark");
  });

  document.getElementById("lang-toggle")?.addEventListener("click", () => {
    applyLanguage(currentLang === "zh" ? "en" : "zh", true);
  });

  document.getElementById("awesome-search")?.addEventListener("input", (e) => {
    searchQuery = e.target.value || "";
    renderTable();
  });

  document.getElementById("awesome-section")?.addEventListener("change", (e) => {
    activeSection = e.target.value || "all";
    renderTable();
  });

  document.getElementById("awesome-locale")?.addEventListener("change", (e) => {
    activeLocale = e.target.value || "all";
    renderTable();
  });

  document.getElementById("awesome-det-btn")?.addEventListener("click", (e) => {
    deterministicOnly = !deterministicOnly;
    e.currentTarget.setAttribute("aria-pressed", String(deterministicOnly));
    e.currentTarget.classList.toggle("is-active", deterministicOnly);
    renderTable();
  });

  document.getElementById("awesome-reset-btn")?.addEventListener("click", resetAllFilters);

  applyLanguage(currentLang);
}

init();
