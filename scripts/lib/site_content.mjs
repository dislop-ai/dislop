// Zero-dependency SEO/GEO content, JSON-LD, bilingual HTML shell, and guide/rule compiler.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEMOS_MANIFEST_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "media",
  "demos.manifest.json"
);

const PACKAGE_VERSION = (() => {
  try {
    const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
    return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "";
  } catch {
    return "";
  }
})();

export const GITHUB_MARK_SVG =
  '<svg class="gh-mark" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

// Masthead pieces shared by every static page (home, /en/, guides, rules, /awesome/)
export function renderBrandLockup({ lang, depthPrefix, homeHref, version = PACKAGE_VERSION, metaI18nKey = "" }) {
  const isEn = lang === "en";
  const metaLabel = isEn ? "AI slop linter" : "AI 味检查";
  const i18nAttr = metaI18nKey ? ` data-i18n="${escapeHtml(metaI18nKey)}"` : "";
  return `<a class="brand-lockup" href="${escapeHtml(homeHref)}">
        <img src="${depthPrefix}assets/logo.svg" width="30" height="30" alt="">
        <span class="brand-wordmark">dislop</span>
        <span class="brand-meta"><span${i18nAttr}>${metaLabel}</span> · <span class="brand-ver">v${escapeHtml(version)}</span></span>
      </a>`;
}

export function renderGithubCtrl({ i18nKey = "" } = {}) {
  const i18nAttr = i18nKey ? ` data-i18n="${escapeHtml(i18nKey)}"` : "";
  return `<a href="https://github.com/dislop-ai/dislop" target="_blank" rel="noopener" class="ctrl-btn gh-ctrl">${GITHUB_MARK_SVG}<span class="gh-ctrl-label"${i18nAttr}>GitHub ★</span></a>`;
}

export function renderStaticAccountCtrl({ lang, depthPrefix, i18nKey = "" }) {
  const isEn = lang === "en";
  const href = isEn ? `${depthPrefix}#cloud-token-box` : `${depthPrefix}zh/#cloud-token-box`;
  const label = isEn ? "Sign in" : "登录";
  const i18nAttr = i18nKey ? ` data-i18n="${escapeHtml(i18nKey)}"` : "";
  return `<a href="${escapeHtml(href)}" class="ctrl-btn topbar-acct-btn" data-static-acct${i18nAttr}>${label}</a>`;
}

// The six primary links, identical in order and wording on every page
export function renderPrimaryNavLinks({ lang, depthPrefix, activeNav = "", ids = {}, withI18n = false }) {
  const isEn = lang === "en";
  const idAttr = (key) => (ids[key] ? ` id="${escapeHtml(ids[key])}"` : "");
  const cur = (key) => (activeNav === key ? ' aria-current="page"' : "");
  const items = isEn
    ? [
        ["workbench", `${depthPrefix}#workbench`, "Workbench"],
        ["surfaces", `${depthPrefix}#surfaces`, "Setup"],
        ["cases", `${depthPrefix}#cases`, "Cases"],
        ["guides", `${depthPrefix}guides/`, "Guides"],
        ["rules", `${depthPrefix}rules/`, "Rules"],
        ["awesome", `${depthPrefix}awesome/`, "Directory"],
      ]
    : [
        ["workbench", `${depthPrefix}zh/#workbench`, "工作台"],
        ["surfaces", `${depthPrefix}zh/#surfaces`, "接入"],
        ["cases", `${depthPrefix}zh/#cases`, "案例"],
        ["guides", `${depthPrefix}zh/guides/`, "指南"],
        ["rules", `${depthPrefix}zh/rules/`, "规则"],
        ["awesome", `${depthPrefix}zh/awesome/`, "工具清单"],
      ];
  return items
    .map(([key, href, label]) => {
      const i18nAttr = withI18n ? ` data-i18n="nav.${key}"` : "";
      return `        <a href="${escapeHtml(href)}"${idAttr(key)}${cur(key)}${i18nAttr}>${label}</a>`;
    })
    .join("\n");
}

export function loadDemosManifest() {
  if (!fs.existsSync(DEMOS_MANIFEST_PATH)) return { version: "v2", scenes: [] };
  return JSON.parse(fs.readFileSync(DEMOS_MANIFEST_PATH, "utf8"));
}

export function renderDemoFigureHtml({
  scene,
  lang,
  depthPrefix = "./",
  cardClass = "demo-card",
  altOverride = "",
  withId = false,
  stripIndex = false,
}) {
  const manifest = loadDemosManifest();
  const version = manifest.version || "v2";
  const isEn = lang === "en";
  const meta = scene?.[lang] || {};
  const slug = scene.slug;
  const alt = altOverride || meta.alt || meta.title || slug;
  const posterSrc = `${depthPrefix}assets/demos/${slug}-${lang}-${version}-poster.png`;
  const webpSrc = `${depthPrefix}assets/demos/${slug}-${lang}-${version}.webp`;
  const gifSrc = `${depthPrefix}assets/demos/${slug}-${lang}-${version}.gif`;
  const pauseAria = isEn ? "Pause animation" : "暂停画面";
  const rawTitle = meta.title || slug;
  const title = stripIndex ? rawTitle.replace(/^\d+\.\s+/, "") : rawTitle;
  const idAttr = withId ? ` id="demo-card-${escapeHtml(slug)}"` : "";
  return `<figure class="${escapeHtml(cardClass)}"${idAttr} data-demo-card="${escapeHtml(slug)}" data-demo-prefix="${escapeHtml(depthPrefix)}" data-demo-lang="${escapeHtml(lang)}" data-demo-ver="${escapeHtml(version)}">
          <div class="demo-media">
            <button type="button" class="demo-media-surface" data-demo-toggle="${escapeHtml(slug)}" aria-pressed="false" aria-label="${escapeHtml(pauseAria)}">
              <picture>
                <source media="(prefers-reduced-motion: reduce)" srcset="${escapeHtml(posterSrc)}" data-demo-poster="${escapeHtml(slug)}">
                <source type="image/webp" srcset="${escapeHtml(webpSrc)}" data-demo-webp="${escapeHtml(slug)}">
                <img src="${escapeHtml(gifSrc)}" alt="${escapeHtml(alt)}" width="${Number(scene.width)}" height="${Number(scene.height)}" loading="lazy" decoding="async" data-demo-gif="${escapeHtml(slug)}">
              </picture>
            </button>
          </div>
          <figcaption class="demo-caption">
            <div class="demo-cap-head">
              <strong class="demo-cap-title">${escapeHtml(title)}</strong>
            </div>
            ${meta.desc ? `<span class="demo-cap-desc">${escapeHtml(meta.desc)}</span>` : ""}
          </figcaption>
        </figure>`;
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sanitizePublicExemplar(str) {
  if (!str) return "";
  return String(str)
    .replace(/file:\/\/\/Users\/[A-Za-z0-9._-]+\//g, "file:///Users/example/")
    .replace(/(?<![A-Za-z0-9_])\/Users\/(?!example\/)[A-Za-z0-9._-]+\//g, "/Users/example/");
}

export function formatRuleProseHtml(str) {
  return escapeHtml(str)
    .replace(/'(AI-Powered|Zero Hallucination|Overview|Background|studies show|AI 强力驱动|零幻觉保证)'/g, "<code>$1</code>")
    .replace(/[“「](AI 强力驱动|零幻觉保证)[”」]/g, "<code>$1</code>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function sanitizeEnglishRuleProse(str) {
  return String(str ?? "")
    .replace(/\s*\/\s*'不是 A，而是 B'/g, "")
    .replace(/,\s*'业内人士指出'/g, "")
    .replace(/,\s*'提升 X%',\s*'高达 X%'/g, "")
    .replace(/,\s*'背景'/g, "")
    .replace(/,\s*'在……方面，'/g, "")
    .replace(/\s+or\s+'助力'/g, "");
}

function renderShareActionBar({ isEn, tryHref, tryLabel, citeMarkdown }) {
  const copyLabel = isEn ? "Copy PR / chat citation" : "复制引用（PR / 群聊）";
  const sampleLabel = isEn ? "Submit slop sample" : "投稿翻车样本";
  const starLabel = isEn ? "Star on GitHub ★" : "GitHub 收藏 ★";
  return `<div class="share-action-bar">
          <a class="btn-primary" style="min-height:32px;padding:6px 12px;font-size:0.8rem;" href="${escapeHtml(tryHref)}">${escapeHtml(tryLabel)}</a>
          <button type="button" class="ctrl-btn" data-copy-target="share-cite-payload">${escapeHtml(copyLabel)}</button><code id="share-cite-payload" hidden>${escapeHtml(citeMarkdown)}</code>
          <a class="ctrl-btn" style="text-decoration:none;display:inline-flex;align-items:center;" href="https://github.com/dislop-ai/dislop/issues/new?template=slop_sample.yml" target="_blank" rel="noopener">${escapeHtml(sampleLabel)}</a>
          <a class="share-gh-link" href="https://github.com/dislop-ai/dislop" target="_blank" rel="noopener">${escapeHtml(starLabel)}</a>
        </div>`;
}

export function renderJsonLdScript(graphItems) {
  const payload = {
    "@context": "https://schema.org",
    "@graph": graphItems,
  };
  const safeJson = JSON.stringify(payload, null, 2).replace(/</g, "\\u003c");
  return `  <script type="application/ld+json">\n${safeJson}\n  </script>`;
}

export function loadKnowledgeBase(rootDir) {
  const kbPath = path.join(rootDir, "docs", "research", "content-kb", "sources.json");
  if (!fs.existsSync(kbPath)) {
    throw new Error(`Missing knowledge base index: ${kbPath}`);
  }
  const kb = JSON.parse(fs.readFileSync(kbPath, "utf8"));
  if (kb.schema !== "dislop.kb/1" || !Array.isArray(kb.sources)) {
    throw new Error(`Invalid knowledge base schema in ${kbPath}`);
  }
  const byId = new Map();
  for (const s of kb.sources) {
    if (!s.id || !s.title || !/^https:\/\//i.test(String(s.url || ""))) {
      throw new Error(`Invalid KB source entry: ${JSON.stringify(s)}`);
    }
    byId.set(s.id, s);
  }
  return { raw: kb, byId };
}

function parseScalar(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  if (s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (/^\d+$/.test(s)) return Number(s);
  if (s === "true") return true;
  if (s === "false") return false;
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      return JSON.parse(s);
    } catch {
      return s
        .slice(1, -1)
        .split(",")
        .map((x) => parseScalar(x))
        .filter((x) => x !== "");
    }
  }
  return s;
}

export function parseGuideFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  if (!raw.startsWith("---\n")) {
    throw new Error(`Guide missing YAML frontmatter: ${filePath}`);
  }
  const endIdx = raw.indexOf("\n---\n", 4);
  if (endIdx === -1) {
    throw new Error(`Guide missing closing frontmatter delimiter: ${filePath}`);
  }
  const yamlText = raw.slice(4, endIdx);
  const body = raw.slice(endIdx + 5).trim();

  const meta = {};
  const lines = yamlText.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
    if (!kv) {
      throw new Error(`Unsupported frontmatter syntax in ${filePath}: ${line}`);
    }
    const key = kv[1];
    const rest = (kv[2] ?? "").trim();
    if (rest) {
      meta[key] = parseScalar(rest);
      i += 1;
      continue;
    }
    // Block array: either `- item` or `- q: ...` / `  a: ...`
    const items = [];
    i += 1;
    while (i < lines.length && (/^\s+-/.test(lines[i]) || /^\s{2,}[A-Za-z0-9_]+:/.test(lines[i]) || !lines[i].trim())) {
      const cur = lines[i];
      if (!cur.trim()) {
        i += 1;
        continue;
      }
      const itemKv = cur.match(/^\s+-\s+([A-Za-z0-9_]+):\s*(.*)$/);
      if (itemKv) {
        const obj = { [itemKv[1]]: parseScalar(itemKv[2]) };
        i += 1;
        while (i < lines.length && /^\s{2,}[A-Za-z0-9_]+:/.test(lines[i]) && !/^\s+-/.test(lines[i])) {
          const sub = lines[i].match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
          if (sub) obj[sub[1]] = parseScalar(sub[2]);
          i += 1;
        }
        items.push(obj);
        continue;
      }
      const plainItem = cur.match(/^\s+-\s+(.*)$/);
      if (plainItem) {
        items.push(parseScalar(plainItem[1]));
        i += 1;
        continue;
      }
      break;
    }
    meta[key] = items;
  }

  for (const req of ["slug", "lang", "title", "navTitle", "description", "category", "published", "updated"]) {
    if (!meta[req]) {
      throw new Error(`Guide ${filePath} missing required frontmatter field: ${req}`);
    }
  }
  return { meta, body, filePath };
}

export function loadGuides(rootDir, kbById, packsById) {
  const guidesDir = path.join(rootDir, "content", "guides");
  if (!fs.existsSync(guidesDir)) return [];
  const files = fs.readdirSync(guidesDir).filter((f) => f.endsWith(".md")).sort();
  const bySlug = new Map();
  const ruleIds = new Set();
  for (const pack of Object.values(packsById)) {
    for (const r of pack.rules || []) ruleIds.add(r.id);
  }

  for (const fname of files) {
    const parsed = parseGuideFile(path.join(guidesDir, fname));
    const { slug, lang } = parsed.meta;
    if (lang !== "zh" && lang !== "en") {
      throw new Error(`Unsupported guide lang "${lang}" in ${fname}`);
    }
    if (lang === "en" && /[\u4E00-\u9FFF]/.test(JSON.stringify(parsed.meta) + parsed.body)) {
      throw new Error(`English guide ${fname} leaked Chinese characters`);
    }
    for (const sid of parsed.meta.sources || []) {
      if (!kbById.has(sid)) {
        throw new Error(`Guide ${fname} references unknown KB source "${sid}"`);
      }
    }
    for (const rid of parsed.meta.relatedRules || []) {
      if (!ruleIds.has(rid)) {
        throw new Error(`Guide ${fname} references unknown ruleId "${rid}"`);
      }
    }
    if (!bySlug.has(slug)) bySlug.set(slug, { slug });
    bySlug.get(slug)[lang] = parsed;
  }

  const pairs = [...bySlug.values()];
  for (const pair of pairs) {
    if (!pair.zh || !pair.en) {
      throw new Error(`Guide "${pair.slug}" must have both .zh-CN.md and .en.md files`);
    }
  }
  return pairs;
}

function slugifyHeading(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-") || "section";
}

function renderInlineMd(rawText) {
  const escaped = escapeHtml(rawText);
  // Protect inline code spans first
  const codeSlots = [];
  const withCodePlaceholders = escaped.replace(/`([^`]+)`/g, (_, code) => {
    const idx = codeSlots.length;
    codeSlots.push(`<code>${code}</code>`);
    return `\u0000CODE${idx}\u0000`;
  });

  const formatted = withCodePlaceholders
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const cleanHref = href.replace(/&amp;/g, "&");
      const isExternal = /^https?:\/\//i.test(cleanHref);
      const attrs = isExternal ? ` href="${cleanHref}" target="_blank" rel="noopener"` : ` href="${cleanHref}"`;
      return `<a${attrs}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return formatted.replace(/\u0000CODE(\d+)\u0000/g, (_, idx) => codeSlots[Number(idx)]);
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function renderMarkdownToHtml(mdBody, opts = {}) {
  const lines = String(mdBody || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const toc = [];
  const seenIds = new Set();
  const demoLang = opts.lang === "en" ? "en" : "zh";
  const depthPrefix = opts.depthPrefix || "./";
  const manifest = opts.demoManifest || loadDemosManifest();
  const scenesBySlug = new Map((manifest.scenes || []).map((s) => [s.slug, s]));
  let i = 0;

  function uniqueId(title) {
    let base = slugifyHeading(title);
    let candidate = base;
    let n = 2;
    while (seenIds.has(candidate)) {
      candidate = `${base}-${n}`;
      n += 1;
    }
    seenIds.add(candidate);
    return candidate;
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Fenced code block
    const fence = line.match(/^```([A-Za-z0-9_-]*)\s*$/);
    if (fence) {
      const langTag = fence[1] || "";
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      const codeText = codeLines.join("\n");
      const isExampleText = /(?:^|\n)(?:bad|trap|原句|换了种 AI 味)\s*:/i.test(codeText);
      const preHtml = `<pre><code${langTag ? ` class="language-${escapeHtml(langTag)}"` : ""}>${escapeHtml(codeText)}</code></pre>`;
      if (isExampleText) {
        out.push(`<!-- dislop-quote-start -->\n${preHtml}\n<!-- dislop-quote-end -->`);
      } else {
        out.push(preHtml);
      }
      continue;
    }

    // Headings (H2 / H3)
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      const title = h2[1].trim();
      const id = uniqueId(title);
      toc.push({ id, title });
      out.push(`<h2 id="${escapeHtml(id)}">${renderInlineMd(title)}</h2>`);
      i += 1;
      continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      const title = h3[1].trim();
      const id = uniqueId(title);
      out.push(`<h3 id="${escapeHtml(id)}">${renderInlineMd(title)}</h3>`);
      i += 1;
      continue;
    }

    // Markdown table
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const headers = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      const headHtml = headers.map((h) => `<th>${renderInlineMd(h)}</th>`).join("");
      const bodyHtml = rows
        .map((r) => `<tr>${headers.map((_, idx) => `<td>${renderInlineMd(r[idx] || "")}</td>`).join("")}</tr>`)
        .join("\n");
      out.push(`<div class="table-scroll" tabindex="0"><table><thead><tr>${headHtml}</tr></thead><tbody>\n${bodyHtml}\n</tbody></table></div>`);
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      const quoteText = quoteLines.join(" ").trim();
      out.push(`<blockquote><p>${renderInlineMd(quoteText)}</p></blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${renderInlineMd(lines[i].replace(/^[-*]\s+/, ""))}</li>`);
        i += 1;
      }
      out.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInlineMd(lines[i].replace(/^\d+\.\s+/, ""))}</li>`);
        i += 1;
      }
      out.push(`<ol>\n${items.join("\n")}\n</ol>`);
      continue;
    }

    // Standalone demo embed: ![alt](demo:<slug>)
    const demoEmbed = line.trim().match(/^!\[([^\]]*)\]\(demo:([a-z0-9-]+)\)$/);
    if (demoEmbed) {
      const altText = demoEmbed[1].trim();
      const slug = demoEmbed[2].trim();
      const scene = scenesBySlug.get(slug);
      if (scene) {
        out.push(
          renderDemoFigureHtml({
            scene,
            lang: demoLang,
            depthPrefix,
            cardClass: "guide-demo",
            altOverride: altText,
          })
        );
        i += 1;
        continue;
      }
    }

    // Paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(?:```|##\s|###\s|>|[-*]\s|\d+\.\s|\|)/.test(lines[i])
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    if (paraLines.length > 0) {
      out.push(`<p>${renderInlineMd(paraLines.join(" "))}</p>`);
    } else {
      i += 1;
    }
  }

  return { html: out.join("\n\n"), toc };
}

export function renderHomeJsonLd({ lang, baseUrl, version, ruleCount, awesomeCount, guideCount }) {
  const isEn = lang === "en";
  const pageUrl = isEn ? `${baseUrl}/` : `${baseUrl}/zh/`;
  const cardImg = `${baseUrl}/assets/${isEn ? "og-card.png" : "og-card-zh.png"}`;
  const orgLogoObj = {
    "@type": "ImageObject",
    url: `${baseUrl}/assets/logo-400.png`,
    width: 400,
    height: 400,
  };
  return renderJsonLdScript([
    {
      "@type": "Organization",
      "@id": `${baseUrl}/#organization`,
      name: "dislop",
      url: `${baseUrl}/`,
      logo: orgLogoObj,
      sameAs: [
        "https://github.com/dislop-ai",
        "https://github.com/dislop-ai/dislop",
        "https://www.npmjs.com/package/dislop",
        "https://pypi.org/project/dislop/",
        "https://x.com/dislop_ai",
        "https://glama.ai/mcp/servers/dislop-ai/dislop",
        "https://glama.ai/mcp/connectors/io.github.dislop-ai/dislop",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${pageUrl}#website`,
      url: pageUrl,
      name: isEn ? "dislop — Cutting AI slop is real productivity." : "dislop — 去 AI 味才是真正的生产力！",
      inLanguage: isEn ? "en" : "zh-CN",
      publisher: { "@id": `${baseUrl}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: "dislop",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Linux, Windows, Web",
      softwareVersion: version,
      url: pageUrl,
      image: cardImg,
      installUrl: "https://www.npmjs.com/package/dislop",
      codeRepository: "https://github.com/dislop-ai/dislop",
      softwareHelp: `${baseUrl}/llms.txt`,
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      description: isEn
        ? `Dedicated linter for AI slop across docs, web UI, Word, and PowerPoint (${ruleCount} built-in rules, 7 scenario packs, ${awesomeCount} curated anti-slop tools, ${guideCount} guides).`
        : `专用的 AI 味检查工具，内置 7 套场景包 ${ruleCount} 条规则与 ${awesomeCount} 条核验工具清单，支持本地离线检查文档、网页和 Word/PPT。`,
      featureList: isEn
        ? [
            "Deterministic linter with 53 rules across Markdown, HTML, CSS, JSX, SVG, Word (.docx), PowerPoint (.pptx), and PDF",
            "Revision verifier checking numbers, units, dates, and protected terms against the original draft",
            "Offline local CLI, editor extensions, pure-Markdown Agent Skills, and stdio MCP",
            "Hosted Streamable HTTP MCP at https://dislop.com/mcp with multimodal visual layout review",
          ]
        : [
            "内置 53 条离线确定性规则，覆盖 Markdown、网页界面、Word、PPT 和 PDF",
            "改后核验保留数字、单位、日期和关键词，并防改过头",
            "支持本地 CLI、编辑器插件、纯 Markdown Skill 与本地 stdio MCP",
            "可选连接 https://dislop.com/mcp 远程 MCP 进行多模态视觉版式审校",
          ],
      offers: [
        { "@type": "Offer", name: isEn ? "Open-Source CLI & Skill" : "开源本地 CLI 与 Skill", price: "0", priceCurrency: "USD" },
        { "@type": "Offer", name: isEn ? "Cloud Free (30 credits/mo)" : "云端免费版（每月 30 额度）", price: "0", priceCurrency: "USD" },
        { "@type": "Offer", name: isEn ? "Cloud PAYGO (500 credits)" : "按量加油包（500 额度）", price: "10", priceCurrency: "USD" },
        { "@type": "Offer", name: isEn ? "Cloud Pro (1,500 credits/mo)" : "云端 Pro（每月 1,500 额度）", price: "9", priceCurrency: "USD" },
        { "@type": "Offer", name: isEn ? "Cloud Team (5,000 credits/mo)" : "团队版（每月 5,000 额度）", price: "29", priceCurrency: "USD" },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: isEn
        ? [
            {
              "@type": "Question",
              name: "Does dislop upload my drafts when checking locally?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. The pure-Markdown Skill, local CLI, editor plugins, and the default browser workbench run completely offline with zero uploads.",
              },
            },
            {
              "@type": "Question",
              name: "How is dislop different from a probabilistic AI text detector?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "AI detectors output a single probability score without telling you what to fix. dislop flags concrete defects—leftover greetings, unfilled placeholders, second-order slogans, AI UI gradients, and dense PPTX slides—with line numbers and edit checks.",
              },
            },
            {
              "@type": "Question",
              name: "Which coding and office agents can connect to dislop?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Claude Code, Codex, Cursor, Windsurf, Antigravity, GitHub Actions, and any client supporting Agent Skills or Streamable HTTP MCP at https://dislop.com/mcp.",
              },
            },
          ]
        : [
            {
              "@type": "Question",
              name: "用 dislop 检查稿子会上传内容吗？",
              acceptedAnswer: {
                "@type": "Answer",
                text: "不会。纯文档 Skill、本地 CLI、编辑器插件和网页工作台默认本地检查全部离线运行，不上传稿件；只有登录后主动点击云端审校或使用远程 MCP 时才走付费版模型接口，且不存草稿。",
              },
            },
            {
              "@type": "Question",
              name: "dislop 和概率型 AI 文本检测器有什么区别？",
              acceptedAnswer: {
                "@type": "Answer",
                text: "概率型检测器只给出一个猜测百分比，不告诉你要改哪里。dislop 按 53 条可核验规则直接标出 AI 寒暄、占位符、公文黑话、紫粉渐变和 PPT 字墙，并给出行号和改法。",
              },
            },
            {
              "@type": "Question",
              name: "支持哪些 Agent 和编辑器？",
              acceptedAnswer: {
                "@type": "Answer",
                text: "支持 Claude Code、Codex、Cursor、Windsurf、Antigravity、WorkBuddy、GitHub Actions，以及任何支持 Agent Skills 或远程 MCP（https://dislop.com/mcp）的客户端。",
              },
            },
          ],
    },
  ]);
}

export function renderAwesomeJsonLd({ lang, baseUrl, entries }) {
  const isEn = lang === "en";
  const pageUrl = isEn ? `${baseUrl}/awesome/` : `${baseUrl}/zh/awesome/`;
  const homeUrl = isEn ? `${baseUrl}/` : `${baseUrl}/zh/`;
  return renderJsonLdScript([
    {
      "@type": "CollectionPage",
      "@id": pageUrl,
      url: pageUrl,
      name: isEn ? `Awesome Anti-Slop (${entries.length} Entries)` : `去 AI 味工具清单 · Awesome Anti-Slop（${entries.length} 条）`,
      inLanguage: isEn ? "en" : "zh-CN",
      description: isEn
        ? `${entries.length} checked tools, linters, style guides, UI rules, PR policies, and papers in English and Chinese.`
        : `整理了 ${entries.length} 个中英文去 AI 味工具、检查器、写作规范、网页设计指南和论文，支持标签页内离线筛选。`,
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "dislop", item: homeUrl },
        { "@type": "ListItem", position: 2, name: isEn ? "Awesome Anti-Slop" : "工具清单", item: pageUrl },
      ],
    },
    {
      "@type": "ItemList",
      numberOfItems: entries.length,
      itemListElement: entries.slice(0, 30).map((e, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: isEn ? e.nameEn || e.name : e.name,
        url: e.url,
      })),
    },
  ]);
}

export function renderAwesomeTriageHtml({ lang, depthPrefix }) {
  if (lang === "en") {
    return `      <div class="awesome-triage-grid" aria-label="How to pick a tool">
        <div class="awesome-triage-cell">
          <h2 data-i18n="triage.h1">Catch hard bugs locally or in CI</h2>
          <p data-i18n="triage.p1">Start with deterministic linters (dislop, Vale, textlint) that flag exact lines with zero LLM calls.</p>
          <a href="${depthPrefix}guides/linter-vs-detector-vs-skill/" id="triage-link-1" data-i18n="triage.a1">Compare linters vs. skills →</a>
        </div>
        <div class="awesome-triage-cell">
          <h2 data-i18n="triage.h2">Steer your agent before it drafts</h2>
          <p data-i18n="triage.p2">Load a Markdown Skill such as Humanizer or stop-slop into your agent, then verify the final draft locally.</p>
          <a href="${depthPrefix}guides/remove-ai-slop-writing/" id="triage-link-2" data-i18n="triage.a2">Read the writing guide →</a>
        </div>
        <div class="awesome-triage-cell">
          <h2 data-i18n="triage.h3">Clean up template web UI and slides</h2>
          <p data-i18n="triage.p3">Pair frontend-design or Impeccable with dislop UI and PPTX rules to strip gradients, dead links, and word walls.</p>
          <a href="${depthPrefix}guides/fix-ai-slop-web-ui/" id="triage-link-3" data-i18n="triage.a3">Read the web UI guide →</a>
        </div>
      </div>`;
  }
  return `      <div class="awesome-triage-grid" aria-label="按场景选工具">
        <div class="awesome-triage-cell">
          <h2 data-i18n="triage.h1">想在本地或 CI 里自动拦截硬伤</h2>
          <p data-i18n="triage.p1">优先用确定性检查工具（dislop、Vale、textlint），按规则直出精确行号，不花模型额度。</p>
          <a href="${depthPrefix}zh/guides/linter-vs-detector-vs-skill/" id="triage-link-1" data-i18n="triage.a1">看检查器与检测器对比 →</a>
        </div>
        <div class="awesome-triage-cell">
          <h2 data-i18n="triage.h2">想让 Agent 动笔前先避开套话</h2>
          <p data-i18n="triage.p2">在编码或写作工具里挂载 Humanizer-zh、stop-slop 等纯文档 Skill，写完再跑一遍本地检查。</p>
          <a href="${depthPrefix}zh/guides/remove-ai-slop-writing/" id="triage-link-2" data-i18n="triage.a2">看中文写作去味指南 →</a>
        </div>
        <div class="awesome-triage-cell">
          <h2 data-i18n="triage.h3">要排查网页模板味或 PPT 排版</h2>
          <p data-i18n="triage.p3">把 frontend-design、Impeccable 和 dislop 网页/PPT 规则配在一起，清掉紫粉渐变、空链接和字墙。</p>
          <a href="${depthPrefix}zh/guides/fix-ai-slop-web-ui/" id="triage-link-3" data-i18n="triage.a3">看前端与 PPT 排查教程 →</a>
        </div>
      </div>`;
}

export function renderColophon({ lang, depthPrefix, homeHref, guidesHref, rulesHref, awesomeHref, ids = {} }) {
  const isEn = lang === "en";
  const idAttr = (key) => (ids[key] ? ` id="${escapeHtml(ids[key])}"` : "");
  const roadmapHref = isEn
    ? "https://github.com/dislop-ai/dislop/blob/main/ROADMAP.md"
    : "https://github.com/dislop-ai/dislop/blob/main/ROADMAP.zh-CN.md";
  return `    <footer class="colophon">
      <div class="colophon-note">
        <a class="colophon-brand" href="${escapeHtml(homeHref)}"${idAttr("home")}><img src="${depthPrefix}assets/logo.svg" width="20" height="20" alt="">dislop</a>
        <span>${isEn ? "This site passes dislop check site/ with 0 issues." : "这个页面自己也跑过 dislop check site/，0 处问题。"}</span>
        <span>${isEn ? `For agents, start at <a href="${depthPrefix}llms.txt">/llms.txt</a>.` : `给 Agent 读的话，从 <a href="${depthPrefix}llms.txt">/llms.txt</a> 开始。`}</span>
      </div>
      <nav class="colophon-groups" aria-label="${isEn ? "Footer" : "页脚导航"}">
        <div class="colophon-group">
          <span class="colophon-group-title">${isEn ? "Resources" : "资料"}</span>
          <a href="${escapeHtml(guidesHref)}">${isEn ? "Guides" : "实用指南"}</a>
          <a href="${escapeHtml(rulesHref)}">${isEn ? "All rules" : "全部规则"}</a>
          <a href="${escapeHtml(awesomeHref)}">${isEn ? "Awesome list" : "工具清单"}</a>
          <a href="${depthPrefix}llms.txt">llms.txt</a>
        </div>
        <div class="colophon-group">
          <span class="colophon-group-title">${isEn ? "Project" : "项目"}</span>
          <a href="${roadmapHref}" target="_blank" rel="noopener">${isEn ? "Roadmap" : "路线图"}</a>
          <a href="${depthPrefix}methodology/brand-and-voice.md">${isEn ? "Voice guide" : "文案基准"}</a>
          <a href="${depthPrefix}methodology/design-system.md">${isEn ? "Design tokens" : "视觉规范"}</a>
          <a href="${depthPrefix}privacy.md">${isEn ? "Privacy" : "隐私与数据边界"}</a>
        </div>
        <div class="colophon-group">
          <span class="colophon-group-title">${isEn ? "Elsewhere" : "外部链接"}</span>
          <a href="https://github.com/dislop-ai/dislop" target="_blank" rel="noopener"${idAttr("github")}>GitHub (Apache-2.0)</a>
          <a href="https://www.npmjs.com/package/dislop" target="_blank" rel="noopener">npm</a>
          <a href="https://pypi.org/project/dislop/" target="_blank" rel="noopener">PyPI</a>
          <a href="https://x.com/dislop_ai" target="_blank" rel="noopener">X (@dislop_ai)</a>
        </div>
      </nav>
    </footer>`;
}

export function renderRedirectStubHtml({ targetUrl, targetRelHref, title = "Moved — dislop" }) {
  return `<!DOCTYPE html>
<html lang="en" data-redirect-stub="1">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, follow">
  <meta http-equiv="refresh" content="0; url=${escapeHtml(targetRelHref)}">
  <link rel="canonical" href="${escapeHtml(targetUrl)}">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <p>This page moved to <a href="${escapeHtml(targetRelHref)}">${escapeHtml(targetUrl)}</a>.</p>
</body>
</html>
`;
}

function renderStaticShell({
  lang,
  baseUrl,
  depthPrefix,
  title,
  description,
  canonicalPath,
  altPath,
  ogType = "website",
  ogImage,
  jsonLdScript,
  feedPath,
  mdAltHref,
  activeNav,
  mainHtml,
  extraScripts = [],
}) {
  const isEn = lang === "en";
  const homeHref = isEn ? `${depthPrefix}` : `${depthPrefix}zh/`;
  const guidesHref = isEn ? `${depthPrefix}guides/` : `${depthPrefix}zh/guides/`;
  const awesomeHref = isEn ? `${depthPrefix}awesome/` : `${depthPrefix}zh/awesome/`;
  const rulesHref = isEn ? `${depthPrefix}rules/` : `${depthPrefix}zh/rules/`;
  const switchHref = altPath
    ? altPath === "/"
      ? `${depthPrefix}`
      : altPath.startsWith("/")
        ? `${depthPrefix}${altPath.slice(1)}`
        : altPath
    : `${depthPrefix}rules/`;
  const canonicalUrl = `${baseUrl}${canonicalPath}`;
  const zhUrl = isEn ? (altPath ? `${baseUrl}${altPath}` : canonicalUrl) : canonicalUrl;
  const enUrl = isEn ? canonicalUrl : (altPath ? `${baseUrl}${altPath}` : canonicalUrl);

  const langAttr = isEn ? "en" : "zh-CN";
  const altLinkHtml = altPath
    ? `  <link rel="alternate" hreflang="en" href="${escapeHtml(enUrl)}">\n  <link rel="alternate" hreflang="zh-Hans" href="${escapeHtml(zhUrl)}">\n  <link rel="alternate" hreflang="x-default" href="${escapeHtml(enUrl)}">`
    : `  <link rel="alternate" hreflang="zh-Hans" href="${escapeHtml(canonicalUrl)}">\n  <link rel="alternate" hreflang="x-default" href="${escapeHtml(canonicalUrl)}">`;

  return `<!DOCTYPE html>
<html lang="${langAttr}" data-static-lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta property="og:site_name" content="dislop">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${baseUrl}/assets/${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@dislop_ai">
  <meta name="twitter:creator" content="@dislop_ai">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${baseUrl}/assets/${ogImage}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
${altLinkHtml}
  <script src="${depthPrefix}lang-init.js"></script>
  <link rel="alternate" type="application/atom+xml" href="${depthPrefix}${feedPath}" title="${isEn ? "dislop Guides (EN)" : "dislop 实用指南（中文）"}">
${mdAltHref ? `  <link rel="alternate" type="text/markdown" href="${escapeHtml(mdAltHref)}" title="Markdown Mirror">\n` : ""}  <link rel="alternate" type="text/plain" href="${depthPrefix}llms.txt" title="LLMs Resource Index">
  <link rel="ai-catalog" href="/.well-known/ai-catalog.json">
  <link rel="icon" type="image/svg+xml" href="${depthPrefix}assets/logo.svg">
  <link rel="stylesheet" href="${depthPrefix}styles.css">
${jsonLdScript}
</head>
<body>
  <a class="skip-link" href="#main-content">${isEn ? "Skip to main content" : "跳至正文"}</a>
  <div class="rail-shell">
    <header class="topbar band-rule">
      ${renderBrandLockup({ lang, depthPrefix, homeHref })}

      <nav class="nav-links" aria-label="${isEn ? "Main navigation" : "主导航"}">
${renderPrimaryNavLinks({ lang, depthPrefix, activeNav })}
      </nav>

      <div class="top-controls">
        ${renderStaticAccountCtrl({ lang, depthPrefix })}
        ${renderGithubCtrl()}
        <a href="${escapeHtml(switchHref)}" data-lang-switch="${isEn ? "zh" : "en"}" class="ctrl-btn" aria-label="${isEn ? "切换为中文" : "Switch to English"}">${isEn ? "中文" : "EN"}</a>
        <button type="button" id="theme-toggle" class="ctrl-btn" aria-label="${isEn ? "Toggle color theme" : "切换浅深色主题"}">${isEn ? "Dark" : "深色"}</button>
      </div>
    </header>

    <main id="main-content">
${mainHtml}
    </main>

${renderColophon({ lang, depthPrefix, homeHref, guidesHref, rulesHref, awesomeHref })}
  </div>
  <script defer src="${depthPrefix}static-ui.js"></script>
${extraScripts.map((s) => `  <script type="module" src="${s}"></script>`).join("\n")}
</body>
</html>
`;
}

const HERO_PEN_PATH = "M4 26H314C321.9 26 327.5 20.6 327.5 13.6C327.5 8.4 323.9 5 319.4 5C314.6 5 311.4 8.75 311.4 14.15C311.4 22.85 318.1 31.6 328.3 35.8";

export function renderHeroPenSvg() {
  return `<svg class="hero-pen-svg" viewBox="0 0 340 40" preserveAspectRatio="none" focusable="false">
                <path class="hero-pen-path" d="${HERO_PEN_PATH}"/>
              </svg>`;
}

// Stable IDs on the /awesome/ and /zh/awesome/ mastheads so site/awesome/awesome.js can retarget links
export const AWESOME_NAV_IDS = {
  workbench: "awesome-home-link",
  surfaces: "awesome-surfaces-link",
  cases: "awesome-cases-link",
  guides: "awesome-guides-link",
  rules: "awesome-rules-link",
};

export function buildAwesomePageHtml({ lang, baseUrl, version = PACKAGE_VERSION, snapshotDate, radarData, githubSectionMeta }) {
  const isEn = lang === "en";
  const depthPrefix = isEn ? "../" : "../../";
  const homeHref = isEn ? "../" : "../";
  const canonicalUrl = isEn ? `${baseUrl}/awesome/` : `${baseUrl}/zh/awesome/`;
  const mdHref = isEn ? "./index.md" : "../../awesome/index.md";
  const jsonHref = isEn ? "./index.json" : "../../awesome/index.json";
  const feedHref = "../feed.xml";
  const awesomeJsSrc = isEn ? "./awesome.js" : "../../awesome/awesome.js";
  const ghHref = isEn
    ? "https://github.com/dislop-ai/dislop/tree/main/awesome"
    : "https://github.com/dislop-ai/dislop/blob/main/awesome/README.zh-CN.md";

  const sectionOptions = [
    isEn
      ? `<option value="all">All topics (${radarData.entries.length})</option>`
      : `<option value="all">全部类别（${radarData.entries.length}）</option>`,
    ...githubSectionMeta.map((sec) => {
      const cnt = radarData.entries.filter((e) => e.section === sec.id).length;
      return isEn
        ? `<option value="${sec.id}">${escapeHtml(sec.headingEn)} (${cnt})</option>`
        : `<option value="${sec.id}">${escapeHtml(sec.headingZh)}（${cnt}）</option>`;
    }),
  ].join("\n          ");

  const rowsHtml = radarData.entries
    .map((e) => {
      const secObj = githubSectionMeta.find((s) => s.id === e.section);
      const secLabel = secObj ? (isEn ? secObj.headingEn : secObj.headingZh) : e.section;
      const isContrast = e.section === "contrast-and-detection";
      const displayName = isEn ? e.nameEn || e.name : e.name;
      const displaySummary = isEn ? e.summaryEn || e.summary : e.summary;
      const metaParts = [];
      if (typeof e.stars === "number") metaParts.push(`${e.stars.toLocaleString("en-US")}★`);
      if (e.pushedAt) metaParts.push(e.pushedAt);
      if (e.license && e.license !== "NOASSERTION") metaParts.push(e.license);
      if (e.archived) metaParts.push(isEn ? "archived" : "已归档");
      const detBadge = e.hasDeterministicCheck
        ? isEn
          ? ' · <span style="color:var(--ink-2);font-weight:600;">automated check</span>'
          : ' · <span style="color:var(--ink-2);font-weight:600;">自动检查</span>'
        : "";
      return `<tr>
              <td><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener"><strong>${escapeHtml(displayName)}</strong></a>${
        e.repo ? `<div style="font-family:var(--font-mono);font-size:0.73rem;color:var(--ink-3);margin-top:2px;">${escapeHtml(e.repo)}</div>` : ""
      }<div style="font-size:0.74rem;color:${isContrast ? "var(--mark-error)" : "var(--ink-3)"};margin-top:4px;">${escapeHtml(secLabel)}${detBadge}</div></td>
              <td>${escapeHtml(displaySummary)}</td>
              <td style="font-family:var(--font-mono);font-size:0.74rem;white-space:nowrap;text-align:right;">${escapeHtml(metaParts.join(" · ") || "—")}</td>
            </tr>`;
    })
    .join("\n");

  const triageHtml = renderAwesomeTriageHtml({ lang, depthPrefix });
  const titleText = isEn
    ? `Awesome Anti-Slop (${radarData.entries.length} Entries) — dislop`
    : `去 AI 味工具清单 · Awesome Anti-Slop（${radarData.entries.length} 条）— dislop`;
  const descText = isEn
    ? `${radarData.entries.length} verified anti-slop tools, deterministic linters, writing guides, UI design rules, and papers in English and Chinese. Filter offline in this tab.`
    : `去 AI 味才是真正的生产力！整理了 ${radarData.entries.length} 个中英文去 AI 味工具、检查器、写作规范、网页设计指南和论文，链接和仓库信息已核验，可在网页里筛选。`;
  const ogTitle = isEn
    ? `Awesome Anti-Slop (${radarData.entries.length} Entries) — dislop`
    : `Awesome Anti-Slop — ${radarData.entries.length} 个去 AI 味工具与资料`;
  const ogDesc = isEn
    ? "Curated directory of anti-slop linters, writing skills, UI rules, PR policies, and research papers."
    : "去 AI 味才是真正的生产力！中英文去 AI 味工具、检查器、写作与设计规范、代码 PR 治理和论文清单，可在网页里筛选。";
  const ogImg = isEn ? "og-card.png" : "og-card-zh.png";

  return `<!DOCTYPE html>
<html lang="${isEn ? "en" : "zh-CN"}" data-static-lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(titleText)}</title>
  <meta name="description" content="${escapeHtml(descText)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="dislop">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(ogDesc)}">
  <meta property="og:image" content="${baseUrl}/assets/${ogImg}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@dislop_ai">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(ogDesc)}">
  <meta name="twitter:image" content="${baseUrl}/assets/${ogImg}">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="alternate" hreflang="en" href="${baseUrl}/awesome/">
  <link rel="alternate" hreflang="zh-Hans" href="${baseUrl}/zh/awesome/">
  <link rel="alternate" hreflang="x-default" href="${baseUrl}/awesome/">
  <script src="${depthPrefix}lang-init.js"></script>
  <link rel="alternate" type="application/atom+xml" href="${feedHref}" title="${isEn ? "dislop Guides (EN)" : "dislop 实用指南（中文）"}">
  <link rel="alternate" type="text/markdown" href="${mdHref}" title="Awesome Anti-Slop Markdown Directory">
  <link rel="alternate" type="application/json" href="${jsonHref}" title="Awesome Anti-Slop JSON (${radarData.schema})">
  <link rel="alternate" type="text/plain" href="${depthPrefix}llms.txt" title="LLMs Resource Index">
  <link rel="icon" type="image/svg+xml" href="${depthPrefix}assets/logo.svg">
  <link rel="stylesheet" href="${depthPrefix}styles.css">
${renderAwesomeJsonLd({ lang, baseUrl, entries: radarData.entries })}
</head>
<body>
  <a class="skip-link" href="#main-content" data-i18n="nav.skip">${isEn ? "Skip to main content" : "跳至正文"}</a>
  <div class="rail-shell">
    <header class="topbar band-rule">
      ${renderBrandLockup({ lang, depthPrefix, homeHref, version, metaI18nKey: "nav.brandMeta" })}

      <nav class="nav-links" aria-label="${isEn ? "Main navigation" : "主导航"}">
${renderPrimaryNavLinks({ lang, depthPrefix, activeNav: "awesome", ids: AWESOME_NAV_IDS, withI18n: true })}
      </nav>

      <div class="top-controls">
        ${renderStaticAccountCtrl({ lang, depthPrefix, i18nKey: "nav.signIn" })}
        ${renderGithubCtrl({ i18nKey: "nav.github" })}
        <button type="button" id="lang-toggle" class="ctrl-btn" aria-label="${isEn ? "切换为中文" : "Switch to English"}">${isEn ? "中文" : "EN"}</button>
        <button type="button" id="theme-toggle" class="ctrl-btn" aria-label="${isEn ? "Toggle color theme" : "切换浅深色主题"}">${isEn ? "Dark" : "深色"}</button>
      </div>
    </header>

    <main id="main-content">
    <section class="section-block band-rule">
      <h1 class="lead-heading" style="max-width:24ch;" data-i18n="awesome.heading">${isEn ? "Awesome Anti-Slop" : "去 AI 味工具清单"}</h1>
      <p class="section-desc" data-i18n="awesome.sub">
        ${isEn
          ? `${radarData.entries.length} tools, linters, style guides, UI rules, and papers in English and Chinese, including established projects like Vale and Impeccable. Filter by topic or show only automated tools. Links and GitHub snapshots checked on ${snapshotDate}.`
          : `一共整理了 ${radarData.entries.length} 个中英文工具、检查器、写作规范、网页设计指南和论文，包括 Vale、Impeccable 这类常用项目。可以按类别找，也可以只看能自动检查的工具。链接和 GitHub 状态核验于 ${snapshotDate}。`}
      </p>
      <div class="page-export-strip">
        <span data-i18n="awesome.exportLabel">${isEn ? "For agents and scripts:" : "给 Agent 或脚本读："}</span>
        <a href="${jsonHref}">index.json</a>
        <a href="${mdHref}">index.md</a>
        <a href="${ghHref}" target="_blank" rel="noopener" id="awesome-gh-nav">GitHub</a>
      </div>

${triageHtml}

      <div class="catalog-controls" style="margin-top:24px;">
        <input type="search" id="awesome-search" class="search-input" placeholder="${isEn ? "Search name, repo, or what it does..." : "搜项目名、仓库或用途…"}" aria-label="${isEn ? "Search directory" : "搜索工具清单"}">
        <select id="awesome-section" class="filter-select" aria-label="${isEn ? "Filter by topic" : "按类别筛选"}">
          ${sectionOptions}
        </select>
        <select id="awesome-locale" class="filter-select" aria-label="${isEn ? "Filter by locale" : "按语种筛选"}">
          <option value="all" data-i18n="awesome.allLocales">${isEn ? "All locales" : "全部语种"}</option>
          ${radarData.taxonomy.locales.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("")}
        </select>
        <button type="button" id="awesome-det-btn" class="ctrl-btn" aria-pressed="false" data-i18n="awesome.detOnly">${isEn ? "Automated checks only" : "只看能自动检查"}</button>
        <button type="button" id="awesome-reset-btn" class="ctrl-btn" data-i18n="awesome.reset">${isEn ? "Reset" : "重置"}</button>
      </div>

      <div class="filter-bar" style="margin-top:10px;">
        <span class="catalog-count" id="awesome-count" aria-live="polite">${radarData.entries.length} / ${radarData.entries.length} ${isEn ? "entries" : "条"}</span>
        <span style="font-size:0.78rem;color:var(--ink-3);" data-i18n="awesome.snapNote">${isEn ? `Checked ${snapshotDate} · Filters offline in this tab` : `核验日期 ${snapshotDate} · 标签页内筛选`}</span>
      </div>

      <div class="table-scroll" tabindex="0" role="region" aria-label="${isEn ? "Awesome Anti-Slop table" : "工具清单表格"}">
        <table class="radar-table">
          <thead>
            <tr>
              <th data-i18n="awesome.colName">${isEn ? "Project &amp; topic" : "项目与类别"}</th>
              <th data-i18n="awesome.colSummary">${isEn ? "What it does" : "做什么的"}</th>
              <th style="text-align:right;" data-i18n="awesome.colMeta">${isEn ? "Stars · last push" : "星标 · 最近更新"}</th>
            </tr>
          </thead>
          <tbody id="awesome-tbody">
${rowsHtml}
          </tbody>
        </table>
      </div>

      <div class="contrast-notice" data-i18n="awesome.contrastNote">
        ${isEn
          ? "Note: Contrast Watch lists probabilistic AI-text detectors and bypass tools for reference only. dislop flags AI slop in writing and design; it is not for evading disclosure policies."
          : "说明：「检测与规避研究（仅供对照）」收录概率型 AI 文本检测器和规避工具，只作对照参考。dislop 只清理文案和设计里的 AI 味，不用于规避披露规则。"}
      </div>
    </section>
    </main>

    <footer class="colophon">
      <div>
        <span data-i18n="footer.snapshot">${isEn ? `Checked ${snapshotDate} · Runs offline with no outbound requests` : `核验日期：${snapshotDate} · 离线运行，不发外网请求`}</span>
      </div>
      <div class="colophon-links">
        <a href="${homeHref}" id="awesome-foot-home" data-i18n="footer.home">${isEn ? "Back to dislop" : "返回首页"}</a>
        <a href="${jsonHref}" data-i18n="footer.json">${isEn ? "JSON" : "JSON 数据"}</a>
        <a href="${mdHref}">Markdown</a>
        <a href="${depthPrefix}llms.txt">llms.txt</a>
        <a href="${ghHref}" target="_blank" rel="noopener" id="awesome-gh-foot">GitHub</a>
        <a href="https://x.com/dislop_ai" target="_blank" rel="noopener">X (@dislop_ai)</a>
      </div>
    </footer>
  </div>

  <script type="module" src="${awesomeJsSrc}"></script>
</body>
</html>
`;
}

export function buildGuidesAndRulesPages({
  siteDir,
  baseUrl,
  version,
  snapshotDate,
  packDates = {},
  packsById,
  packOrder,
  allRules,
  ruleUiMeta,
  kbById,
  guides,
  registerResource,
}) {
  const htmlSitemapPairs = [];
  const standaloneHtmlUrls = [];
  const maxGuideDate = guides.reduce((acc, pair) => {
    for (const d of [pair.en?.meta?.updated, pair.zh?.meta?.updated]) {
      if (d && d > acc) acc = d;
    }
    return acc;
  }, snapshotDate);
  const maxPackDate = Object.values(packDates).reduce((acc, d) => (d && d > acc ? d : acc), snapshotDate);
  const zhRulePackLabels = {
    core: "交付底线",
    "business-brief": "工作文档",
    "engineering-spec": "研发文档与复盘",
    "regulated-comms": "对外合规",
    "literary-essay": "随笔长文",
    "deck-and-ui": "PPT 和网页",
    "executive-deck": "管理汇报",
  };

  function writeHtml(relPath, content) {
    const fullPath = path.join(siteDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf8");
  }

  // 1. Guides Index (/guides/ = EN, /zh/guides/ = ZH)
  for (const lang of ["en", "zh"]) {
    const isEn = lang === "en";
    const depthPrefix = isEn ? "../" : "../../";
    const cardsHtml = guides
      .map((pair) => {
        const g = pair[lang].meta;
        return `          <article class="guide-card">
            <div class="guide-card-cat">${escapeHtml(g.category)} · ${escapeHtml(String(g.readingMinutes || 5))} ${isEn ? "min read" : "分钟"}</div>
            <h2><a href="./${escapeHtml(g.slug)}/">${escapeHtml(g.title)}</a></h2>
            <p>${escapeHtml(g.description)}</p>
            <div class="guide-card-foot"><a href="./${escapeHtml(g.slug)}/">${isEn ? "Read guide →" : "阅读指南 →"}</a><span>${isEn ? "Updated" : "更新于"} ${escapeHtml(g.updated)}</span></div>
          </article>`;
      })
      .join("\n");

    const mainHtml = `    <section class="section-block">
      <nav class="breadcrumbs" aria-label="${isEn ? "Breadcrumb" : "面包屑导航"}">
        <a href="../">dislop</a> / <span aria-current="page">${isEn ? "Guides" : "实用指南"}</span>
      </nav>
      <h1 class="lead-heading" style="max-width:26ch;">${isEn ? "Anti-slop guides &amp; tutorials" : "去 AI 味实用指南与教程"}</h1>
      <p class="section-desc">
        ${isEn
          ? "Field guides covering prose, web UI, PowerPoint decks, agent setups, and linter selection—each grounded in verifiable sources and runnable commands."
          : "覆盖文稿写作、前端界面、PPT 与 Word 排版、Agent 接入和工具选型的实操教程。每篇都带正反句对照、可直接运行的命令和一手出处。"}
      </p>
      <div class="guide-grid">
${cardsHtml}
      </div>
    </section>`;

    const pageUrl = isEn ? `${baseUrl}/guides/` : `${baseUrl}/zh/guides/`;
    const homeUrl = isEn ? `${baseUrl}/` : `${baseUrl}/zh/`;
    const jsonLd = renderJsonLdScript([
      {
        "@type": "CollectionPage",
        "@id": pageUrl,
        url: pageUrl,
        name: isEn ? "Anti-Slop Guides & Tutorials — dislop" : "去 AI 味实用指南与教程 — dislop",
        inLanguage: isEn ? "en" : "zh-CN",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "dislop", item: homeUrl },
          { "@type": "ListItem", position: 2, name: isEn ? "Guides" : "实用指南", item: pageUrl },
        ],
      },
      {
        "@type": "ItemList",
        numberOfItems: guides.length,
        itemListElement: guides.map((pair, idx) => ({
          "@type": "ListItem",
          position: idx + 1,
          name: pair[lang].meta.title,
          url: `${pageUrl}${pair[lang].meta.slug}/`,
        })),
      },
    ]);

    writeHtml(
      isEn ? "guides/index.html" : "zh/guides/index.html",
      renderStaticShell({
        lang,
        baseUrl,
        depthPrefix,
        title: isEn ? "Anti-Slop Guides & Tutorials — dislop" : "去 AI 味实用指南与教程 — dislop",
        description: isEn
          ? "Practical guides to catch and fix AI slop in prose, web UI, PowerPoint decks, and coding agent workflows."
          : "覆盖中文写作、前端页面、Word/PPT 排版与 Claude Code / Codex / Cursor 接入的去 AI 味实用教程。",
        canonicalPath: isEn ? "/guides/" : "/zh/guides/",
        altPath: isEn ? "/zh/guides/" : "/guides/",
        ogImage: isEn ? "og-card.png" : "og-card-zh.png",
        jsonLdScript: jsonLd,
        feedPath: isEn ? "feed.xml" : "zh/feed.xml",
        activeNav: "guides",
        mainHtml,
      })
    );
  }
  htmlSitemapPairs.push({
    en: "/guides/",
    zh: "/zh/guides/",
    lastmodEn: maxGuideDate,
    lastmodZh: maxGuideDate,
  });

  // 2. Individual Guide Articles (/guides/<slug>/ = EN, /zh/guides/<slug>/ = ZH)
  const guidePairBySlug = new Map(guides.map((p) => [p.slug, p]));
  for (const pair of guides) {
    for (const lang of ["en", "zh"]) {
      const isEn = lang === "en";
      const depthPrefix = isEn ? "../../" : "../../../";
      const g = pair[lang];
      const m = g.meta;
      const { html: bodyHtml, toc } = renderMarkdownToHtml(g.body, { lang, depthPrefix });

      const tocHtml = toc.length > 0
        ? `        <aside class="toc-rail" aria-label="${isEn ? "On this page" : "本文目录"}">
          <h2 class="toc-rail-title">${isEn ? "On this page" : "本文目录"}</h2>
          <ol>
${toc.map((t) => `            <li><a href="#${escapeHtml(t.id)}">${escapeHtml(t.title)}</a></li>`).join("\n")}
          </ol>
        </aside>`
        : "";

      const faqList = Array.isArray(m.faqs) ? m.faqs : [];
      const faqHtml = faqList.length > 0
        ? `<h2 id="faq">${isEn ? "Frequently asked questions" : "常见问题"}</h2>
        <div class="faq-list">
${faqList
  .map(
    (f) => `          <div class="faq-item">
            <h3>${renderInlineMd(f.q)}</h3>
            <p>${renderInlineMd(f.a)}</p>
          </div>`
  )
  .join("\n")}
        </div>`
        : "";

      const relRules = (m.relatedRules || [])
        .map((rid) => {
          const rMeta = ruleUiMeta[rid];
          const rTitle = isEn ? (rMeta?.title?.en || rid) : (rMeta?.title?.zh || rid);
          const ruleLangPrefix = !isEn || rMeta?.lang === "zh" ? "zh/" : "";
          return `<a class="related-link-chip" href="${depthPrefix}${ruleLangPrefix}rules/${escapeHtml(rid)}/"><code>${escapeHtml(rid)}</code> · ${escapeHtml(rTitle)}</a>`;
        })
        .join("\n");

      const relGuides = (m.relatedGuides || [])
        .map((gSlug) => {
          const target = guidePairBySlug.get(gSlug)?.[lang]?.meta;
          if (!target) return "";
          return `<a class="related-link-chip" href="../${escapeHtml(gSlug)}/">${escapeHtml(target.navTitle || target.title)}</a>`;
        })
        .filter(Boolean)
        .join("\n");

      const sourceObjs = (m.sources || []).map((sid) => kbById.get(sid)).filter(Boolean);
      const sourcesHtml = sourceObjs.length > 0
        ? `<h2 id="sources">${isEn ? "Verified references" : "参考与一手出处"}</h2>
        <ul>
${sourceObjs
  .map((s) => `          <li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a> — ${escapeHtml(s.keyFact)}</li>`)
  .join("\n")}
        </ul>`
        : "";

      const pageUrl = `${baseUrl}${isEn ? `/guides/${m.slug}/` : `/zh/guides/${m.slug}/`}`;
      const citeLine = `[${m.title}](${pageUrl}) — ${m.description}`;
      const actionBarHtml = renderShareActionBar({
        isEn,
        tryHref: `${depthPrefix}${isEn ? "" : "zh/"}#workbench`,
        tryLabel: isEn ? "Try in workbench →" : "去工作台试查 →",
        citeMarkdown: citeLine,
      });

      const mainHtml = `    <section class="section-block">
      <nav class="breadcrumbs" aria-label="${isEn ? "Breadcrumb" : "面包屑导航"}">
        <a href="${depthPrefix}${isEn ? "" : "zh/"}">dislop</a> / <a href="../">${isEn ? "Guides" : "实用指南"}</a> / <span aria-current="page">${escapeHtml(m.navTitle)}</span>
      </nav>

      <article>
        <header>
          <h1 class="lead-heading" style="max-width:30ch;">${escapeHtml(m.title)}</h1>
          <div class="article-meta">
            <span>${escapeHtml(m.category)}</span>
            <span>${isEn ? `Updated ${m.updated}` : `更新于 ${m.updated}`}</span>
            <span>${escapeHtml(String(m.readingMinutes || 5))} ${isEn ? "min read" : "分钟阅读"}</span>
            <a href="./index.md">Markdown</a>
          </div>
          <div class="answer-box">
            <div class="answer-box-label">${isEn ? "In short" : "先说结论"}</div>
            <p>${renderInlineMd(m.summary || m.description)}</p>
          </div>
        </header>

        <div class="article-shell">
          <div class="article-prose">
${bodyHtml}
${faqHtml}
${relRules ? `<h2 id="related-rules">${isEn ? "Matching deterministic rules" : "对应的自动检查规则"}</h2>\n<div class="related-strip">\n${relRules}\n</div>` : ""}
${relGuides ? `<h2 id="next-guides">${isEn ? "Next guides" : "延伸阅读"}</h2>\n<div class="related-strip">\n${relGuides}\n</div>` : ""}
${sourcesHtml}
${actionBarHtml}
          </div>
${tocHtml}
        </div>
      </article>
    </section>`;
      const guidesUrl = `${baseUrl}${isEn ? "/guides/" : "/zh/guides/"}`;
      const homeUrl = `${baseUrl}${isEn ? "/" : "/zh/"}`;
      const graph = [
        {
          "@type": "TechArticle",
          "@id": pageUrl,
          url: pageUrl,
          headline: m.title,
          description: m.description,
          inLanguage: isEn ? "en" : "zh-CN",
          datePublished: m.published,
          dateModified: m.updated,
          author: { "@type": "Organization", name: "dislop", url: `${baseUrl}/` },
          publisher: { "@type": "Organization", name: "dislop", url: `${baseUrl}/` },
          image: `${baseUrl}/assets/${isEn ? "og-card.png" : "og-card-zh.png"}`,
          citation: sourceObjs.map((s) => s.url),
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "dislop", item: homeUrl },
            { "@type": "ListItem", position: 2, name: isEn ? "Guides" : "实用指南", item: guidesUrl },
            { "@type": "ListItem", position: 3, name: m.navTitle, item: pageUrl },
          ],
        },
      ];
      if (faqList.length > 0) {
        graph.push({
          "@type": "FAQPage",
          mainEntity: faqList.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        });
      }

      const relDir = isEn ? `guides/${m.slug}` : `zh/guides/${m.slug}`;
      writeHtml(
        `${relDir}/index.html`,
        renderStaticShell({
          lang,
          baseUrl,
          depthPrefix,
          title: `${m.title} — dislop`,
          description: m.description,
          canonicalPath: `/${relDir}/`,
          altPath: isEn ? `/zh/guides/${m.slug}/` : `/guides/${m.slug}/`,
          ogType: "article",
          ogImage: isEn ? "og-card.png" : "og-card-zh.png",
          jsonLdScript: renderJsonLdScript(graph),
          feedPath: isEn ? "feed.xml" : "zh/feed.xml",
          mdAltHref: "./index.md",
          activeNav: "guides",
          mainHtml,
        })
      );

      // Register pure Markdown mirror in catalog.json
      const sourceText = sourceObjs.length
        ? `\n\n## ${isEn ? "References" : "参考出处"}\n\n${sourceObjs.map((s) => `- [${s.title}](${s.url}): ${s.keyFact}`).join("\n")}`
        : "";
      const faqMd = faqList.length
        ? `\n\n## ${isEn ? "FAQ" : "常见问题"}\n\n${faqList.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}`
        : "";
      registerResource({
        id: `guide-${m.slug}-${lang}`,
        pillar: "methodology",
        kind: "guide",
        titleEn: isEn ? m.title : pair.en.meta.title,
        titleZh: isEn ? pair.zh.meta.title : m.title,
        relPath: `${relDir}/index.md`,
        modalities: ["markdown", "text", "html", "docx", "pptx"],
        languages: [lang],
        packs: ["core"],
        relatedTools: ["cli", "skill", "mcp"],
        content: `---\ncontent-type: reference-data\nlang: ${lang}\nupdated: ${m.updated}\nversion: ${version}\n---\n\n# ${m.title}\n\n> ${m.summary || m.description}\n\n${g.body}${faqMd}${sourceText}\n`,
      });
    }
    htmlSitemapPairs.push({
      en: `/guides/${pair.slug}/`,
      zh: `/zh/guides/${pair.slug}/`,
      lastmodEn: pair.en.meta.updated || snapshotDate,
      lastmodZh: pair.zh.meta.updated || snapshotDate,
    });
  }

  // 3. Rules Directory Index (/rules/ = EN, /zh/rules/ = ZH)
  for (const lang of ["en", "zh"]) {
    const isEn = lang === "en";
    const depthPrefix = isEn ? "../" : "../../";
    const visibleRulesCount = allRules.filter(({ rule: r }) => !isEn || ruleUiMeta[r.id]?.lang !== "zh").length;
    const packSections = packOrder
      .map((pid) => {
        const pack = packsById[pid];
        if (!pack) return "";
        const visibleRules = (pack.rules || []).filter((r) => !isEn || ruleUiMeta[r.id]?.lang !== "zh");
        if (visibleRules.length === 0) return "";
        const rows = visibleRules
          .map((r) => {
            const uiMeta = ruleUiMeta[r.id];
            const rTitle = isEn ? (uiMeta?.title?.en || r.id) : (uiMeta?.title?.zh || r.id);
            const rMsg = isEn ? sanitizeEnglishRuleProse(r.message.en) : (r.message.zh || r.message.en);
            const sevCls = r.severity === "error" ? "sev-error" : r.severity === "info" ? "sev-info" : "sev-warning";
            const sevLabel = isEn
              ? (r.severity === "error" ? "hard bug" : r.severity === "warning" ? "warning" : "info")
              : (r.severity === "error" ? "硬伤" : r.severity === "warning" ? "提醒" : "轻提示");
            return `            <tr>
              <td><a href="./${escapeHtml(r.id)}/"><strong>${escapeHtml(rTitle)}</strong></a><div style="margin-top:2px;"><code>${escapeHtml(r.id)}</code></div></td>
              <td><span class="sev-tag ${sevCls}">${sevLabel}</span></td>
              <td><code>${escapeHtml((r.modalities || []).join(", "))}</code></td>
              <td>${formatRuleProseHtml(rMsg)}</td>
            </tr>`;
          })
          .join("\n");
        const pLabel = isEn ? pack.name.en : (zhRulePackLabels[pid] || pack.name.zh);
        const pSummary = isEn ? pack.summary.en : (pack.summary.zh || pack.summary.en);
        return `      <section class="section-block band-rule" id="pack-${escapeHtml(pid)}">
        <h2 class="section-title">${escapeHtml(pLabel)} <code>${escapeHtml(pid)}</code></h2>
        <p class="section-desc">${formatRuleProseHtml(pSummary)}</p>
        <div class="table-scroll" tabindex="0">
          <table class="rules-table">
            <thead>
              <tr><th>${isEn ? "Rule" : "规则"}</th><th>${isEn ? "Level" : "级别"}</th><th>${isEn ? "Formats" : "格式"}</th><th>${isEn ? "What it catches" : "查什么"}</th></tr>
            </thead>
            <tbody>
${rows}
            </tbody>
          </table>
        </div>
      </section>`;
      })
      .filter(Boolean)
      .join("\n");

    const mainHtml = `    <section class="section-block band-rule">
      <nav class="breadcrumbs" aria-label="${isEn ? "Breadcrumb" : "面包屑导航"}">
        <a href="../">dislop</a> / <span aria-current="page">${isEn ? "Rules" : "规则百科"}</span>
      </nav>
      <h1 class="lead-heading" style="max-width:26ch;">${isEn ? "English and cross-language rules" : "内置去 AI 味规则明细"}</h1>
      <p class="section-desc">
        ${isEn
          ? `${visibleRulesCount} deterministic rules ship inside the offline CLI and browser workbench across ${packOrder.length} scenario packs, each with a check question and before / still-AI / clean examples.`
          : `7 套场景包一共内置 ${allRules.length} 条规则，CLI、插件和浏览器工作台都离线自带。点开任意一条都能看判断方法、正反句对照和命令行用法。`}
      </p>
    </section>
${packSections}`;

    const pageUrl = isEn ? `${baseUrl}/rules/` : `${baseUrl}/zh/rules/`;
    const homeUrl = isEn ? `${baseUrl}/` : `${baseUrl}/zh/`;
    const jsonLd = renderJsonLdScript([
      {
        "@type": "CollectionPage",
        "@id": pageUrl,
        url: pageUrl,
        name: isEn ? `All ${visibleRulesCount} Anti-Slop Rules — dislop` : `全部 ${allRules.length} 条去 AI 味规则 — dislop`,
        inLanguage: isEn ? "en" : "zh-CN",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "dislop", item: homeUrl },
          { "@type": "ListItem", position: 2, name: isEn ? "Rules" : "规则百科", item: pageUrl },
        ],
      },
    ]);

    writeHtml(
      isEn ? "rules/index.html" : "zh/rules/index.html",
      renderStaticShell({
        lang,
        baseUrl,
        depthPrefix,
        title: isEn ? `All ${visibleRulesCount} Anti-Slop Rules — dislop` : `全部 ${allRules.length} 条去 AI 味规则 — dislop`,
        description: isEn
          ? `Reference index of ${visibleRulesCount} deterministic anti-slop rules across 7 packs with check questions and clean rewrite examples.`
          : `全部 ${allRules.length} 条去 AI 味内置规则的中文说明、判断方法与原句改写对照。`,
        canonicalPath: isEn ? "/rules/" : "/zh/rules/",
        altPath: isEn ? "/zh/rules/" : "/rules/",
        ogImage: isEn ? "og-card.png" : "og-card-zh.png",
        jsonLdScript: jsonLd,
        feedPath: isEn ? "feed.xml" : "zh/feed.xml",
        activeNav: "rules",
        mainHtml,
      })
    );
  }
  htmlSitemapPairs.push({
    en: "/rules/",
    zh: "/zh/rules/",
    lastmodEn: maxPackDate,
    lastmodZh: maxPackDate,
  });

  // 4. Individual Rule Detail HTML Pages (/rules/<id>/ = EN, /zh/rules/<id>/ = ZH)
  for (const { packId, pack, rule: r } of allRules) {
    const uiMeta = ruleUiMeta[r.id] || { lang: "both", title: { zh: r.id, en: r.id } };
    const isZhOnlyRule = uiMeta.lang === "zh";
    const matchingGuides = guides.filter((p) => (p.en.meta.relatedRules || []).includes(r.id));
    const targetLangs = isZhOnlyRule ? ["zh"] : ["en", "zh"];

    for (const lang of targetLangs) {
      const isEn = lang === "en";
      const depthPrefix = isEn ? "../../" : "../../../";
      const siblingRules = (pack.rules || [])
        .filter((sr) => sr.id !== r.id && (!isEn || ruleUiMeta[sr.id]?.lang !== "zh"))
        .slice(0, 8);
      const rTitle = isEn ? (uiMeta.title?.en || r.id) : (uiMeta.title?.zh || r.id);
      const packName = isEn ? pack.name.en : (zhRulePackLabels[packId] || pack.name.zh);
      const msg = isEn ? sanitizeEnglishRuleProse(r.message.en) : (r.message.zh || r.message.en);
      const delTest = isEn ? sanitizeEnglishRuleProse(r.deletionTest.en) : (r.deletionTest.zh || r.deletionTest.en);
      const ex = isEn ? (uiMeta.enEx || r.exemplar) : (uiMeta.zhEx || r.exemplar);

      const exHtml = ex
        ? `<!-- dislop-quote-start -->
        <div class="rule-contrast-grid">
          <div class="rule-contrast-cell is-bad">
            <div class="rule-contrast-label">${isEn ? "Original (flagged)" : "原句（会标出问题）"}</div>
            <pre><code>${escapeHtml(sanitizePublicExemplar(ex.bad))}</code></pre>
          </div>
${ex.trap ? `          <div class="rule-contrast-cell is-trap">
            <div class="rule-contrast-label">${isEn ? "Still sounds like AI" : "换了种 AI 味"}</div>
            <pre><code>${escapeHtml(sanitizePublicExemplar(ex.trap))}</code></pre>
          </div>\n` : ""}          <div class="rule-contrast-cell is-good">
            <div class="rule-contrast-label">${isEn ? "Clean version" : "改干净的版本"}</div>
            <pre><code>${escapeHtml(sanitizePublicExemplar(ex.good))}</code></pre>
          </div>
        </div>
        <!-- dislop-quote-end -->`
        : "";

      const siblingHtml = siblingRules
        .map((sr) => {
          const sTitle = isEn ? (ruleUiMeta[sr.id]?.title?.en || sr.id) : (ruleUiMeta[sr.id]?.title?.zh || sr.id);
          return `<a class="related-link-chip" href="../${escapeHtml(sr.id)}/"><code>${escapeHtml(sr.id)}</code> · ${escapeHtml(sTitle)}</a>`;
        })
        .join("\n");

      const guideLinksHtml = matchingGuides
        .map((p) => {
          const gm = p[lang].meta;
          return `<a class="related-link-chip" href="${depthPrefix}${isEn ? "" : "zh/"}guides/${escapeHtml(gm.slug)}/">${escapeHtml(gm.navTitle)}</a>`;
        })
        .join("\n");

      const exNote = isEn
        ? sanitizeEnglishRuleProse(r.exemplar?.note?.en || "")
        : (r.exemplar?.note?.zh || r.exemplar?.note?.en || "");
      const exNoteHtml = exNote ? `<p class="rule-note"><strong>${isEn ? "Edit note:" : "改法要点："}</strong> ${formatRuleProseHtml(exNote)}</p>` : "";

      const textModalities = new Set(["markdown", "text", "html", "css", "jsx", "svg"]);
      const canTryRule = Boolean(r.exemplar && (r.modalities || []).some((m) => textModalities.has(m)));
      const pageUrl = `${baseUrl}${isEn ? `/rules/${r.id}/` : `/zh/rules/${r.id}/`}`;
      const cleanOneLineMsg = msg.replace(/\s+/g, " ").trim();
      const citeLine = isEn
        ? `[\`${r.id}\`](${pageUrl}): ${cleanOneLineMsg}`
        : `[\`${r.id}\`](${pageUrl})：${cleanOneLineMsg}`;
      const homeBaseHref = `${depthPrefix}${isEn ? "" : "zh/"}`;
      const actionBarHtml = renderShareActionBar({
        isEn,
        tryHref: canTryRule ? `${homeBaseHref}#try=${encodeURIComponent(r.id)}` : `${homeBaseHref}#workbench`,
        tryLabel: canTryRule
          ? (isEn ? "Try this rule in workbench →" : "在工作台试试这条规则 →")
          : (isEn ? "Open workbench →" : "打开在线工作台 →"),
        citeMarkdown: citeLine,
      });

      const mdCardHref = `${depthPrefix}rules/${escapeHtml(r.id)}.md`;
      const sevCls = r.severity === "error" ? "sev-error" : r.severity === "info" ? "sev-info" : "sev-warning";
      const sevLabel = isEn
        ? (r.severity === "error" ? "hard bug" : r.severity === "warning" ? "warning" : "info")
        : (r.severity === "error" ? "硬伤" : r.severity === "warning" ? "提醒" : "轻提示");
      const mainHtml = `    <section class="section-block">
      <nav class="breadcrumbs" aria-label="${isEn ? "Breadcrumb" : "面包屑导航"}">
        <a href="${homeBaseHref}">dislop</a> / <a href="../">${isEn ? "Rules" : "规则百科"}</a> / <span aria-current="page"><code>${escapeHtml(r.id)}</code></span>
      </nav>

      <article class="article-prose">
        <header>
          <h1 class="lead-heading" style="max-width:28ch;">${escapeHtml(rTitle)}</h1>
          <div class="article-meta">
            <span><code>${escapeHtml(r.id)}</code></span>
            <span>${escapeHtml(packName)} (<code>${escapeHtml(packId)}</code>)</span>
            <span class="sev-tag ${sevCls}">${sevLabel}</span>
            <span><code>${escapeHtml((r.modalities || []).join(", "))}</code></span>
            <a href="${mdCardHref}">${isEn ? "Markdown card" : "Markdown 规则卡"}</a>
          </div>
          <div class="answer-box">
            <div class="answer-box-label">${isEn ? "How to judge" : "判断方法"}</div>
            <p>${formatRuleProseHtml(delTest)}</p>
          </div>
        </header>

        <h2>${isEn ? "What this rule catches" : "这条规则查什么"}</h2>
        <p>${formatRuleProseHtml(msg)}</p>

        ${exHtml ? `<h2>${isEn ? "Before and after examples" : "原句与改法对照"}</h2>\n${exHtml}\n${exNoteHtml}` : ""}

        <h2>${isEn ? "Run locally via CLI" : "命令行单独查看或检查"}</h2>
        <pre><code>npx --yes dislop explain ${escapeHtml(r.id)}
npx --yes dislop check . --pack ${escapeHtml(packId)}</code></pre>

        ${guideLinksHtml ? `<h2>${isEn ? "Related guides" : "相关教程"}</h2>\n<div class="related-strip">\n${guideLinksHtml}\n</div>` : ""}
        ${siblingHtml ? `<h2>${isEn ? `Other rules in ${packId}` : `同场景其他规则（${packId}）`}</h2>\n<div class="related-strip">\n${siblingHtml}\n</div>` : ""}
        ${actionBarHtml}
      </article>
    </section>`;
      const rulesIndexUrl = `${baseUrl}${isEn ? "/rules/" : "/zh/rules/"}`;
      const homeUrl = `${baseUrl}${isEn ? "/" : "/zh/"}`;
      const ruleDate = packDates[packId] || snapshotDate;
      const jsonLd = renderJsonLdScript([
        {
          "@type": "TechArticle",
          "@id": pageUrl,
          mainEntityOfPage: pageUrl,
          url: pageUrl,
          headline: `${rTitle} (${r.id})`,
          description: delTest,
          inLanguage: isEn ? "en" : "zh-CN",
          dateModified: ruleDate,
          image: `${baseUrl}/assets/${isEn ? "og-card.png" : "og-card-zh.png"}`,
          author: { "@type": "Organization", "@id": `${baseUrl}/#organization`, name: "dislop", url: `${baseUrl}/` },
          publisher: {
            "@type": "Organization",
            "@id": `${baseUrl}/#organization`,
            name: "dislop",
            url: `${baseUrl}/`,
            logo: {
              "@type": "ImageObject",
              url: `${baseUrl}/assets/logo-400.png`,
              width: 400,
              height: 400,
            },
          },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "dislop", item: homeUrl },
            { "@type": "ListItem", position: 2, name: isEn ? "Rules" : "规则百科", item: rulesIndexUrl },
            { "@type": "ListItem", position: 3, name: r.id, item: pageUrl },
          ],
        },
      ]);

      const relDir = isEn ? `rules/${r.id}` : `zh/rules/${r.id}`;
      writeHtml(
        `${relDir}/index.html`,
        renderStaticShell({
          lang,
          baseUrl,
          depthPrefix,
          title: `${rTitle} (${r.id}) — dislop`,
          description: `${rTitle}: ${msg}`,
          canonicalPath: `/${relDir}/`,
          altPath: isZhOnlyRule ? null : (isEn ? `/zh/rules/${r.id}/` : `/rules/${r.id}/`),
          ogType: "article",
          ogImage: isEn ? "og-card.png" : "og-card-zh.png",
          jsonLdScript: jsonLd,
          feedPath: isEn ? "feed.xml" : "zh/feed.xml",
          mdAltHref: mdCardHref,
          activeNav: "rules",
          mainHtml,
        })
      );
    }
    const ruleDate = packDates[packId] || snapshotDate;
    if (isZhOnlyRule) {
      standaloneHtmlUrls.push([`${baseUrl}/zh/rules/${r.id}/`, ruleDate]);
      writeHtml(
        `rules/${r.id}/index.html`,
        renderRedirectStubHtml({
          targetUrl: `${baseUrl}/zh/rules/${r.id}/`,
          targetRelHref: `../../zh/rules/${r.id}/`,
          title: `${uiMeta.title?.zh || r.id} (${r.id}) — dislop`,
        })
      );
    } else {
      htmlSitemapPairs.push({
        en: `/rules/${r.id}/`,
        zh: `/zh/rules/${r.id}/`,
        lastmodEn: ruleDate,
        lastmodZh: ruleDate,
      });
      writeHtml(
        `en/rules/${r.id}/index.html`,
        renderRedirectStubHtml({
          targetUrl: `${baseUrl}/rules/${r.id}/`,
          targetRelHref: `../../../rules/${r.id}/`,
          title: `${uiMeta.title?.en || r.id} (${r.id}) — dislop`,
        })
      );
    }
  }

  // 5. Legacy /en/** static redirect stubs (complementing Nginx 301 rules for local/static servers)
  writeHtml(
    "en/index.html",
    renderRedirectStubHtml({
      targetUrl: `${baseUrl}/`,
      targetRelHref: "../",
      title: "dislop — Moved to /",
    })
  );
  writeHtml(
    "en/awesome/index.html",
    renderRedirectStubHtml({
      targetUrl: `${baseUrl}/awesome/`,
      targetRelHref: "../../awesome/",
      title: "Awesome Anti-Slop — Moved to /awesome/",
    })
  );
  writeHtml(
    "en/guides/index.html",
    renderRedirectStubHtml({
      targetUrl: `${baseUrl}/guides/`,
      targetRelHref: "../../guides/",
      title: "Guides — Moved to /guides/",
    })
  );
  for (const pair of guides) {
    writeHtml(
      `en/guides/${pair.slug}/index.html`,
      renderRedirectStubHtml({
        targetUrl: `${baseUrl}/guides/${pair.slug}/`,
        targetRelHref: `../../../guides/${pair.slug}/`,
        title: `${pair.en.meta.title} — Moved`,
      })
    );
  }
  writeHtml(
    "en/rules/index.html",
    renderRedirectStubHtml({
      targetUrl: `${baseUrl}/rules/`,
      targetRelHref: "../../rules/",
      title: "Rules — Moved to /rules/",
    })
  );

  // 6. Bilingual Atom Feeds (/feed.xml = EN, /zh/feed.xml = ZH)
  function escapeXml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  for (const lang of ["en", "zh"]) {
    const isEn = lang === "en";
    const feedUrl = `${baseUrl}${isEn ? "/feed.xml" : "/zh/feed.xml"}`;
    const guidesUrl = `${baseUrl}${isEn ? "/guides/" : "/zh/guides/"}`;
    const entriesXml = guides
      .map((pair) => {
        const m = pair[lang].meta;
        const entryUrl = `${baseUrl}${isEn ? `/guides/${m.slug}/` : `/zh/guides/${m.slug}/`}`;
        return `  <entry>
    <title>${escapeXml(m.title)}</title>
    <link href="${escapeXml(entryUrl)}"/>
    <id>${escapeXml(entryUrl)}</id>
    <updated>${escapeXml(m.updated)}T00:00:00Z</updated>
    <summary>${escapeXml(m.summary || m.description)}</summary>
  </entry>`;
      })
      .join("\n");

    const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${isEn ? "dislop Guides (EN)" : "dislop 实用指南（中文）"}</title>
  <link href="${escapeXml(feedUrl)}" rel="self"/>
  <link href="${escapeXml(guidesUrl)}"/>
  <updated>${escapeXml(snapshotDate)}T00:00:00Z</updated>
  <id>${escapeXml(feedUrl)}</id>
${entriesXml}
</feed>
`;
    writeHtml(isEn ? "feed.xml" : "zh/feed.xml", feedXml);
  }

  return { htmlSitemapPairs, standaloneHtmlUrls };
}
