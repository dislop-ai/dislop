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

// The six primary links, identical in order and wording on every page
export function renderPrimaryNavLinks({ lang, depthPrefix, activeNav = "", ids = {}, withI18n = false }) {
  const isEn = lang === "en";
  const idAttr = (key) => (ids[key] ? ` id="${escapeHtml(ids[key])}"` : "");
  const cur = (key) => (activeNav === key ? ' aria-current="page"' : "");
  const items = isEn
    ? [
        ["workbench", `${depthPrefix}?lang=en#workbench`, "Workbench"],
        ["surfaces", `${depthPrefix}en/#surfaces`, "Setup"],
        ["cases", `${depthPrefix}?lang=en#cases`, "Cases"],
        ["guides", `${depthPrefix}en/guides/`, "Guides"],
        ["rules", `${depthPrefix}en/rules/`, "Rules"],
        ["awesome", `${depthPrefix}en/awesome/`, "Directory"],
      ]
    : [
        ["workbench", `${depthPrefix}#workbench`, "工作台"],
        ["surfaces", `${depthPrefix}#surfaces`, "接入"],
        ["cases", `${depthPrefix}#cases`, "案例"],
        ["guides", `${depthPrefix}guides/`, "指南"],
        ["rules", `${depthPrefix}rules/`, "规则"],
        ["awesome", `${depthPrefix}awesome/`, "工具清单"],
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
  withReplay = false,
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
  const pauseTxt = isEn ? "Pause" : "定格";
  const zoomTxt = isEn ? "Zoom" : "放大看";
  const replayTxt = isEn ? "Replay" : "重播";
  const rawTitle = meta.title || slug;
  const title = stripIndex ? rawTitle.replace(/^\d+\.\s+/, "") : rawTitle;
  const idAttr = withId ? ` id="demo-card-${escapeHtml(slug)}"` : "";
  return `<figure class="${escapeHtml(cardClass)}"${idAttr} data-demo-card="${escapeHtml(slug)}" data-demo-prefix="${escapeHtml(depthPrefix)}" data-demo-lang="${escapeHtml(lang)}" data-demo-ver="${escapeHtml(version)}">
          <div class="demo-media">
            <picture>
              <source media="(prefers-reduced-motion: reduce)" srcset="${escapeHtml(posterSrc)}" data-demo-poster="${escapeHtml(slug)}">
              <source type="image/webp" srcset="${escapeHtml(webpSrc)}" data-demo-webp="${escapeHtml(slug)}">
              <img src="${escapeHtml(gifSrc)}" alt="${escapeHtml(alt)}" width="${Number(scene.width)}" height="${Number(scene.height)}" loading="lazy" decoding="async" data-demo-gif="${escapeHtml(slug)}">
            </picture>
          </div>
          <figcaption class="demo-caption">
            <div class="demo-cap-head">
              <strong class="demo-cap-title">${escapeHtml(title)}</strong>
              ${meta.badge ? `<span class="demo-cap-badge">${escapeHtml(meta.badge)}</span>` : ""}
            </div>
            ${meta.desc ? `<span class="demo-cap-desc">${escapeHtml(meta.desc)}</span>` : ""}
            <div class="demo-card-actions">
              <button type="button" class="ctrl-btn ctrl-btn-sm" data-demo-toggle="${escapeHtml(slug)}" aria-pressed="false">${pauseTxt}</button>
              ${withReplay ? `<button type="button" class="ctrl-btn ctrl-btn-sm" data-demo-replay="${escapeHtml(slug)}">${replayTxt}</button>\n              ` : ""}<button type="button" class="ctrl-btn ctrl-btn-sm" data-demo-zoom="${escapeHtml(slug)}">${zoomTxt}</button>
            </div>
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
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
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
  const pageUrl = isEn ? `${baseUrl}/en/` : `${baseUrl}/`;
  return renderJsonLdScript([
    {
      "@type": "Organization",
      "@id": `${baseUrl}/#organization`,
      name: "dislop",
      url: `${baseUrl}/`,
      logo: `${baseUrl}/assets/logo.svg`,
      sameAs: [
        "https://github.com/dislop-ai",
        "https://github.com/dislop-ai/dislop",
        "https://www.npmjs.com/package/dislop",
        "https://pypi.org/project/dislop/",
        "https://x.com/dislop_ai",
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
      codeRepository: "https://github.com/dislop-ai/dislop",
      softwareHelp: `${baseUrl}/llms.txt`,
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      description: isEn
        ? `Dedicated linter for AI slop across docs, web UI, Word, and PowerPoint (${ruleCount} built-in rules, 7 scenario packs, ${awesomeCount} curated anti-slop tools, ${guideCount} guides).`
        : `专用的 AI 味检查工具，内置 7 套场景包 ${ruleCount} 条规则与 ${awesomeCount} 条核验工具清单，支持本地离线检查文档、网页和 Word/PPT。`,
      offers: [
        { "@type": "Offer", name: isEn ? "Open-Source CLI & Skill" : "开源本地 CLI 与 Skill", price: "0", priceCurrency: "USD" },
        { "@type": "Offer", name: isEn ? "Cloud Free (30 credits/mo)" : "云端免费版（每月 30 额度）", price: "0", priceCurrency: "USD" },
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
  const pageUrl = isEn ? `${baseUrl}/en/awesome/` : `${baseUrl}/awesome/`;
  const homeUrl = isEn ? `${baseUrl}/en/` : `${baseUrl}/`;
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
          <a href="${depthPrefix}en/guides/linter-vs-detector-vs-skill/" id="triage-link-1" data-i18n="triage.a1">Compare linters vs. skills →</a>
        </div>
        <div class="awesome-triage-cell">
          <h2 data-i18n="triage.h2">Steer your agent before it drafts</h2>
          <p data-i18n="triage.p2">Load a Markdown Skill such as Humanizer or stop-slop into your agent, then verify the final draft locally.</p>
          <a href="${depthPrefix}en/guides/remove-ai-slop-writing/" id="triage-link-2" data-i18n="triage.a2">Read the writing guide →</a>
        </div>
        <div class="awesome-triage-cell">
          <h2 data-i18n="triage.h3">Clean up template web UI and slides</h2>
          <p data-i18n="triage.p3">Pair frontend-design or Impeccable with dislop UI and PPTX rules to strip gradients, dead links, and word walls.</p>
          <a href="${depthPrefix}en/guides/fix-ai-slop-web-ui/" id="triage-link-3" data-i18n="triage.a3">Read the web UI guide →</a>
        </div>
      </div>`;
  }
  return `      <div class="awesome-triage-grid" aria-label="按场景选工具">
        <div class="awesome-triage-cell">
          <h2 data-i18n="triage.h1">想在本地或 CI 里自动拦截硬伤</h2>
          <p data-i18n="triage.p1">优先用确定性检查工具（dislop、Vale、textlint），按规则直出精确行号，不花模型额度。</p>
          <a href="${depthPrefix}guides/linter-vs-detector-vs-skill/" id="triage-link-1" data-i18n="triage.a1">看检查器与检测器对比 →</a>
        </div>
        <div class="awesome-triage-cell">
          <h2 data-i18n="triage.h2">想让 Agent 动笔前先避开套话</h2>
          <p data-i18n="triage.p2">在编码或写作工具里挂载 Humanizer-zh、stop-slop 等纯文档 Skill，写完再跑一遍本地检查。</p>
          <a href="${depthPrefix}guides/remove-ai-slop-writing/" id="triage-link-2" data-i18n="triage.a2">看中文写作去味指南 →</a>
        </div>
        <div class="awesome-triage-cell">
          <h2 data-i18n="triage.h3">要排查网页模板味或 PPT 排版</h2>
          <p data-i18n="triage.p3">把 frontend-design、Impeccable 和 dislop 网页/PPT 规则配在一起，清掉紫粉渐变、空链接和字墙。</p>
          <a href="${depthPrefix}guides/fix-ai-slop-web-ui/" id="triage-link-3" data-i18n="triage.a3">看前端与 PPT 排查教程 →</a>
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
  const homeHref = isEn ? `${depthPrefix}en/` : `${depthPrefix}`;
  const guidesHref = isEn ? `${depthPrefix}en/guides/` : `${depthPrefix}guides/`;
  const awesomeHref = isEn ? `${depthPrefix}en/awesome/` : `${depthPrefix}awesome/`;
  const rulesHref = isEn ? `${depthPrefix}en/rules/` : `${depthPrefix}rules/`;
  const switchHref = altPath ? (altPath.startsWith("/") ? `${depthPrefix}${altPath.slice(1)}` : altPath) : `${depthPrefix}en/rules/`;
  const canonicalUrl = `${baseUrl}${canonicalPath}`;
  const zhUrl = isEn ? (altPath ? `${baseUrl}${altPath}` : canonicalUrl) : canonicalUrl;
  const enUrl = isEn ? canonicalUrl : (altPath ? `${baseUrl}${altPath}` : canonicalUrl);

  const langAttr = isEn ? "en" : "zh-CN";
  const altLinkHtml = altPath
    ? isEn
      ? `  <link rel="alternate" hreflang="zh-Hans" href="${escapeHtml(zhUrl)}">\n  <link rel="alternate" hreflang="en" href="${escapeHtml(enUrl)}">\n  <link rel="alternate" hreflang="x-default" href="${escapeHtml(zhUrl)}">`
      : `  <link rel="alternate" hreflang="zh-Hans" href="${escapeHtml(zhUrl)}">\n  <link rel="alternate" hreflang="en" href="${escapeHtml(enUrl)}">\n  <link rel="alternate" hreflang="x-default" href="${escapeHtml(zhUrl)}">`
    : `  <link rel="alternate" hreflang="zh-Hans" href="${escapeHtml(canonicalUrl)}">\n  <link rel="alternate" hreflang="x-default" href="${escapeHtml(canonicalUrl)}">`;
  const effectiveSwitchHref =
    isEn && altPath === "/" ? `${depthPrefix}?lang=zh` : (altPath ? switchHref : `${depthPrefix}en/rules/`);

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
  <link rel="alternate" type="application/atom+xml" href="${depthPrefix}${feedPath}" title="${isEn ? "dislop Guides (EN)" : "dislop 实用指南（中文）"}">
${mdAltHref ? `  <link rel="alternate" type="text/markdown" href="${escapeHtml(mdAltHref)}" title="Markdown Mirror">\n` : ""}  <link rel="alternate" type="text/plain" href="${depthPrefix}llms.txt" title="LLMs Resource Index">
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
        ${renderGithubCtrl()}
        <a href="${escapeHtml(effectiveSwitchHref)}" class="ctrl-btn" aria-label="${isEn ? "切换为中文" : "Switch to English"}">${isEn ? "中文" : "EN"}</a>
        <button type="button" id="theme-toggle" class="ctrl-btn" aria-label="${isEn ? "Toggle color theme" : "切换浅深色主题"}">${isEn ? "Dark" : "深色"}</button>
      </div>
    </header>

    <main id="main-content">
${mainHtml}
    </main>

${renderColophon({ lang, depthPrefix, homeHref, guidesHref, rulesHref, awesomeHref })}
  </div>
  <dialog id="demo-lightbox" class="demo-lightbox" aria-labelledby="demo-lightbox-title">
    <div class="demo-lightbox-head">
      <strong id="demo-lightbox-title" class="demo-lightbox-title"></strong>
      <button type="button" id="demo-lightbox-close" class="ctrl-btn ctrl-btn-sm">${isEn ? "Close" : "关闭"}</button>
    </div>
    <div class="demo-lightbox-body">
      <img id="demo-lightbox-img" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="">
    </div>
  </dialog>
  <script defer src="${depthPrefix}static-ui.js"></script>
${extraScripts.map((s) => `  <script type="module" src="${s}"></script>`).join("\n")}
</body>
</html>
`;
}

const HERO_PEN_PATH = "M4 26H314C321.9 26 327.5 20.6 327.5 13.6C327.5 8.4 323.9 5 319.4 5C314.6 5 311.4 8.75 311.4 14.15C311.4 22.85 318.1 31.6 328.3 35.8";
const AGENT_MARK_PATH = "M2.2 14H12.3C16.7 14 19.8 10.9 19.8 7C19.8 4.1 17.8 2.2 15.3 2.2C12.6 2.2 10.8 4.3 10.8 7.3C10.8 12.2 14.6 17.1 20.3 19.4";
const EN_DEMO_TAB_LABELS = {
  "proof-cycle": "3-state proof",
  "cli-check": "CLI gate",
  "workbench-live": "Workbench",
  "ui-slop": "Web UI",
  "deck-office": "PPTX & DOCX",
  "agent-workflow": "Agent + CI",
};

export function renderHeroPenSvg() {
  return `<svg class="hero-pen-svg" viewBox="0 0 340 40" preserveAspectRatio="none" focusable="false">
                <path class="hero-pen-path" d="${HERO_PEN_PATH}"/>
              </svg>`;
}

export function buildEnglishHomeHtml({ baseUrl, version, snapshotDate, packsById, allRules, radarData, guides }) {
  const detCount = radarData.entries.filter((e) => e.hasDeterministicCheck).length;
  const packOrder = ["core", "business-brief", "engineering-spec", "regulated-comms", "literary-essay", "deck-and-ui", "executive-deck"];
  const scenes = loadDemosManifest().scenes || [];
  const demoTabsHtml = scenes
    .map((scene, idx) => {
      const slug = escapeHtml(scene.slug);
      const label = escapeHtml(EN_DEMO_TAB_LABELS[scene.slug] || scene.slug);
      return `          <button type="button" class="demo-tab" role="tab" id="demo-tab-${slug}" aria-selected="${idx === 0 ? "true" : "false"}" aria-controls="demo-card-${slug}"${idx === 0 ? "" : ' tabindex="-1"'} data-demo-select="${slug}">${label}</button>`;
    })
    .join("\n");
  const demoCardsHtml = scenes
    .map((scene) =>
      renderDemoFigureHtml({ scene, lang: "en", depthPrefix: "../", cardClass: "demo-card", withReplay: true, withId: true, stripIndex: true })
    )
    .join("\n\n");
  const guideItemsHtml = guides
    .map(({ en }) => {
      const m = en.meta;
      return `        <a class="guide-index-item" href="./guides/${escapeHtml(m.slug)}/" data-guide-slug="${escapeHtml(m.slug)}">
          <span class="guide-index-cat">${escapeHtml(m.category)} · ${escapeHtml(String(m.readingMinutes || 5))} min</span>
          <strong class="guide-index-title">${escapeHtml(m.title)}</strong>
          <span class="guide-index-desc">${escapeHtml(m.description)}</span>
        </a>`;
    })
    .join("\n");

  const packRowsHtml = packOrder
    .map((pid) => {
      const p = packsById[pid];
      if (!p) return "";
      const cnt = (p.rules || []).length;
      return `            <tr>
              <td><code>${escapeHtml(pid)}</code></td>
              <td><strong>${escapeHtml(p.name.en)}</strong></td>
              <td>${escapeHtml(p.summary.en)}</td>
              <td style="white-space:nowrap;">${cnt} rules</td>
            </tr>`;
    })
    .join("\n");

  const promptText =
    "Read https://dislop.com/llms.txt, evaluate which dislop setup fits my environment and project (Skill, offline CLI, or Cloud MCP), install and configure it, and run a first check on our files.";

  const mainHtml = `    <section id="top" class="band-rule">
      <div class="lead-band band-rule">
        <div class="lead-copy">
          <div>
            <!-- dislop-quote-start -->
            <div class="hero-strike-wrap" aria-hidden="true">
              <del class="hero-strike">Certainly! Here is your polished draft.</del>
              ${renderHeroPenSvg()}
            </div>
            <!-- dislop-quote-end -->
            <h1 class="lead-heading">Cutting AI slop is real productivity.</h1>
            <p class="lead-sub">A dedicated linter for AI slop. Flags leftover chat greetings, filler phrases, 'Not X, but Y' slogans, and stock template UI across docs, web pages, Word, and PowerPoint before you ship. Connects in one command and runs offline by default.</p>
          </div>

          <div class="hero-cta-row">
            <a href="../?lang=en#workbench" class="btn-primary">Try it in the workbench →</a>
            <a href="#surfaces" class="ctrl-btn">Add to your agent or editor</a>
          </div>

          <div class="hero-cli-inline hero-agent-card ink-stage">
            <div class="hero-agent-head">
              <svg class="hero-agent-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${AGENT_MARK_PATH}"/></svg>
              <span class="hero-cli-label">Agent prompt · auto-setup</span>
            </div>
            <div class="cmd-box is-prompt">
              <code id="en-hero-prompt">${escapeHtml(promptText)}</code>
              <button type="button" class="ctrl-btn is-ink-primary" data-copy-target="en-hero-prompt">Copy for agent</button>
            </div>
          </div>
        </div>

        <div class="hero-proof" aria-label="Three-state editing example">
          <div class="hero-proof-head">
            <div class="mode-tabs" role="tablist" aria-label="Switch example version" data-en-hero-tabs hidden>
              <button type="button" role="tab" id="en-hero-tab-bad" class="ctrl-btn is-active" aria-selected="true" aria-controls="en-hero-panel-bad" data-en-hero-state="bad">Original</button>
              <button type="button" role="tab" id="en-hero-tab-trap" class="ctrl-btn" aria-selected="false" aria-controls="en-hero-panel-trap" tabindex="-1" data-en-hero-state="trap">Still sounds like AI</button>
              <button type="button" role="tab" id="en-hero-tab-good" class="ctrl-btn" aria-selected="false" aria-controls="en-hero-panel-good" tabindex="-1" data-en-hero-state="good">Cleaned up</button>
            </div>
          </div>
          <div class="hero-slip">
            <div class="hero-slip-head" aria-hidden="true"><span>launch-note.md</span><span>business-brief</span></div>
            <!-- dislop-quote-start -->
            <div class="hero-proof-panel" id="en-hero-panel-bad" role="tabpanel" aria-labelledby="en-hero-tab-bad" data-en-hero-panel="bad">
              <p class="hero-panel-label">Original</p>
              <div class="hero-proof-stage"><span class="mark-span mark-error">Certainly! Here is</span> the launch note. <span class="mark-span mark-warn">It's worth noting that</span> CSV exports are a <span class="mark-span mark-warn">game-changer</span>, finishing in up to 12 minutes for workspaces above 500,000 rows.</div>
              <ul class="hero-proof-notes">
                <li><span class="hero-note-dot is-error"></span><span><strong>Red: </strong>Stray chat reply on line one. Delete it.</span></li>
                <li><span class="hero-note-dot is-warn"></span><span><strong>Blue: </strong>Filler opener and hype noun ('game-changer'). Say what changed instead.</span></li>
              </ul>
            </div>
            <div class="hero-proof-panel" id="en-hero-panel-trap" role="tabpanel" aria-labelledby="en-hero-tab-trap" data-en-hero-panel="trap">
              <p class="hero-panel-label">Still sounds like AI</p>
              <div class="hero-proof-stage">CSV exports finish in up to 12 minutes for workspaces above 500,000 rows. <span class="mark-span mark-warn">This isn't just an upgrade — it's a new standard</span>.</div>
              <div class="hero-proof-verdict is-rejected">Rejected: the buzzwords are gone, but a 'Not X, but Y' slogan took their place.</div>
            </div>
            <div class="hero-proof-panel" id="en-hero-panel-good" role="tabpanel" aria-labelledby="en-hero-tab-good" data-en-hero-panel="good">
              <p class="hero-panel-label">Cleaned up</p>
              <div class="hero-proof-stage">CSV exports finish in up to 12 minutes for workspaces above 500,000 rows.</div>
              <div class="hero-proof-verdict">0 issues. Chat wrapper and stock phrasing removed.</div>
            </div>
            <!-- dislop-quote-end -->
          </div>
          <div class="hero-proof-foot">
            <span>Same rule engine in the browser and the CLI</span>
            <a href="../?lang=en#workbench">Test your own draft →</a>
          </div>
        </div>
      </div>

      <div class="marks-strip" aria-label="Core capabilities">
        <div class="mark-pillar">
          <div class="mark-pillar-head"><h2 class="mark-pillar-title">Community rules and tools in one place</h2></div>
          <p class="mark-pillar-desc">Bundles ${allRules.length} rules, 12 extended pattern checks, and ${radarData.entries.length} curated anti-slop tools for docs, web UI, Word, and PowerPoint.</p>
        </div>
        <div class="mark-pillar">
          <div class="mark-pillar-head"><h2 class="mark-pillar-title">One command into agents and editors</h2></div>
          <p class="mark-pillar-desc">Works with Codex, Claude Code, Cursor, WorkBuddy, and GitHub Actions, in the terminal, the editor, or CI.</p>
        </div>
        <div class="mark-pillar">
          <div class="mark-pillar-head"><h2 class="mark-pillar-title">Drafts stay on your machine</h2></div>
          <p class="mark-pillar-desc">The Skill and CLI run offline with zero uploads. Switch the workbench or remote MCP to cloud mode when you want multi-model review.</p>
        </div>
      </div>
    </section>

    <section id="surfaces" class="section-block band-rule" aria-labelledby="en-surfaces-heading">
      <div class="surfaces-split">
        <div class="surfaces-intro">
          <h2 class="section-title" id="en-surfaces-heading">Three ways to run dislop: Skill, local CLI, and Cloud MCP</h2>
          <p class="section-desc">Pick the one that matches your tools. Each comes with a copy-ready config.</p>
          <ol class="setup-ledger">
            <li>
              <h3>Markdown-only Agent Skill</h3>
              <p>Writing and UI reference cards by genre, with no bundled scripts. Install it in Claude Code, Codex, Cursor, or Antigravity so the agent reads it before drafting and runs the local CLI afterward.</p>
            </li>
            <li>
              <h3>Open-source local CLI and plugins</h3>
              <p>Zero dependencies, under 250 KB, with all 7 scenario packs built in. Checks docs, Word, PowerPoint, and Git diffs offline in terminals, editors, and CI. You can also plug in your own model key.</p>
            </li>
            <li>
              <h3>Official Cloud MCP &amp; web workbench</h3>
              <p>Connect from Claude Cowork, WorkBuddy, Qwen, or your editor. Sign in for 30 free credits a month and get multi-model review by genre with concrete edits.</p>
              <span class="setup-ledger-url">https://dislop.com/mcp</span>
            </li>
            <li class="is-agent-note">
              <h3>Let your agent set it up</h3>
              <p>Send dislop.com/llms.txt to your agent. It picks the Skill, CLI, or remote MCP, installs it, and runs a first check on your files.</p>
            </li>
          </ol>
          <a href="./guides/agent-cli-mcp-tutorial/" class="surfaces-more">Full setup tutorial →</a>
        </div>

        <div class="code-panel ink-stage" id="cli-mcp">
          <div class="code-panel-head">
            <span class="terminal-title">quick-start.sh</span>
            <a href="../tools/index.md" class="terminal-link">tools/index.md</a>
          </div>
<pre class="terminal-plain"><span class="term-comment"># Markdown-only Agent Skill (no scripts)</span>
npx skills add dislop-ai/dislop

<span class="term-comment"># Offline CLI, Node or Python, all 7 packs, zero network</span>
npx --yes dislop check .
uvx dislop check .

<span class="term-comment"># Pull request gate on changed lines only</span>
npx --yes dislop check --changed origin/main --format github

<span class="term-comment"># Official Cloud MCP endpoint</span>
https://dislop.com/mcp</pre>
        </div>
      </div>
    </section>

    <section id="demos" class="section-block band-rule" aria-labelledby="en-demos-heading">
      <div class="section-header">
        <div>
          <h2 class="section-title" id="en-demos-heading">Six short clips: prose, CLI, workbench, web UI, decks, and agent CI</h2>
          <p class="section-desc">Each clip runs about 7 seconds and is recorded offline from the real rules. Pick a scene, then pause, replay, or zoom in.</p>
        </div>
        <a href="https://github.com/dislop-ai/dislop/blob/main/docs/gif-production-guide.md" target="_blank" rel="noopener">Animation &amp; GIF guide →</a>
      </div>
      <div class="demo-stage" data-demo-stage>
        <div class="demo-stage-rail" role="tablist" aria-label="Choose a demo scene" hidden>
${demoTabsHtml}
        </div>
        <div class="demos-grid">
${demoCardsHtml}
        </div>
      </div>
    </section>

    <section id="guides-home" class="section-block band-rule" aria-labelledby="en-guides-heading">
      <div class="section-header">
        <div>
          <h2 class="section-title" id="en-guides-heading">Six field guides: writing, web UI, decks, and setup</h2>
          <p class="section-desc">Each guide comes with copy-ready commands and before/after examples, grounded in public sources and real repository checks.</p>
        </div>
        <a href="./guides/">All guides →</a>
      </div>
      <div class="guides-index">
${guideItemsHtml}
      </div>
    </section>

    <section id="rules" class="section-block band-rule" aria-labelledby="en-rules-heading">
      <div class="section-header">
        <div>
          <h2 class="section-title" id="en-rules-heading">${allRules.length} built-in rules across 7 scenario packs</h2>
          <p class="section-desc">Each rule pairs a deterministic probe with a check question and before / still-AI / clean examples.</p>
        </div>
        <a href="./rules/">Browse English &amp; shared rules →</a>
      </div>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Scenario packs">
        <table class="matrix-table">
          <thead>
            <tr><th>Pack ID</th><th>Name</th><th>What it catches</th><th>Rules</th></tr>
          </thead>
          <tbody>
${packRowsHtml}
          </tbody>
        </table>
      </div>
    </section>

    <section id="awesome" class="section-block band-rule" aria-labelledby="en-awesome-heading">
      <div class="section-header">
        <div>
          <h2 class="section-title" id="en-awesome-heading">Awesome Anti-Slop: checked tools, guides, and papers</h2>
          <p class="section-desc">${radarData.entries.length} linters, writing skills, UI rules, PR policies, and papers, checked on ${escapeHtml(snapshotDate)}. ${detCount} of them run automated checks.</p>
        </div>
        <a href="./awesome/">Open the filterable list →</a>
      </div>
    </section>

    <section id="faq" class="section-block" aria-labelledby="en-faq-heading">
      <h2 class="section-title" id="en-faq-heading">Common questions</h2>
      <div class="faq-list">
        <div class="faq-item">
          <h3>Does dislop upload my drafts when checking locally?</h3>
          <p>No. The pure-Markdown Skill, local CLI, editor plugins, and the default browser workbench run offline with zero uploads. Only explicit Cloud MCP or signed-in cloud buttons call our paid Google Gemini API tier without storing drafts.</p>
        </div>
        <div class="faq-item">
          <h3>How is dislop different from an AI text detector?</h3>
          <p>Probabilistic detectors give a single guess percentage without saying what to fix. dislop flags exact lines—leftover chat greetings, unfilled placeholders, second-order slogans, AI gradients, and dense PPTX slides—with edit checks.</p>
        </div>
        <div class="faq-item">
          <h3>Which coding and office agents can connect to dislop?</h3>
          <p>Claude Code, Codex, Cursor, Windsurf, Antigravity, GitHub Actions, and any client supporting Agent Skills or Streamable HTTP MCP at <code>https://dislop.com/mcp</code>.</p>
        </div>
      </div>
    </section>`;

  return renderStaticShell({
    lang: "en",
    baseUrl,
    depthPrefix: "../",
    title: "dislop — Cutting AI slop is real productivity.",
    description: `Dedicated linter for AI slop in docs, web UI, Word, and PowerPoint. ${allRules.length} built-in rules, ${radarData.entries.length} curated tools, and offline CLI/Skill.`,
    canonicalPath: "/en/",
    altPath: "/",
    ogImage: "og-card.png",
    jsonLdScript: renderHomeJsonLd({
      lang: "en",
      baseUrl,
      version,
      ruleCount: allRules.length,
      awesomeCount: radarData.entries.length,
      guideCount: guides.length,
    }),
    feedPath: "en/feed.xml",
    mdAltHref: "../index.md",
    activeNav: "home",
    mainHtml,
  });
}

// Stable IDs on the /awesome/ masthead so site/awesome/awesome.js can retarget links on a language switch
export const AWESOME_NAV_IDS = {
  workbench: "awesome-home-link",
  surfaces: "awesome-surfaces-link",
  cases: "awesome-cases-link",
  guides: "awesome-guides-link",
  rules: "awesome-rules-link",
};

export function buildEnglishAwesomeHtml({ baseUrl, snapshotDate, radarData, githubSectionMeta }) {
  const sectionOptions = [
    `<option value="all">All topics (${radarData.entries.length})</option>`,
    ...githubSectionMeta.map((sec) => {
      const cnt = radarData.entries.filter((e) => e.section === sec.id).length;
      return `<option value="${sec.id}">${escapeHtml(sec.headingEn)} (${cnt})</option>`;
    }),
  ].join("\n          ");

  const rowsHtml = radarData.entries
    .map((e) => {
      const secObj = githubSectionMeta.find((s) => s.id === e.section);
      const secLabel = secObj ? secObj.headingEn : e.section;
      const isContrast = e.section === "contrast-and-detection";
      const displayName = e.nameEn || e.name;
      const displaySummary = e.summaryEn || e.summary;
      const metaParts = [];
      if (typeof e.stars === "number") metaParts.push(`${e.stars.toLocaleString("en-US")}★`);
      if (e.pushedAt) metaParts.push(e.pushedAt);
      if (e.license && e.license !== "NOASSERTION") metaParts.push(e.license);
      if (e.archived) metaParts.push("archived");
      return `<tr>
              <td><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener"><strong>${escapeHtml(displayName)}</strong></a>${
        e.repo ? `<div style="font-family:var(--font-mono);font-size:0.73rem;color:var(--ink-3);margin-top:2px;">${escapeHtml(e.repo)}</div>` : ""
      }<div style="font-size:0.74rem;color:${isContrast ? "var(--mark-error)" : "var(--ink-3)"};margin-top:4px;">${escapeHtml(secLabel)}${e.hasDeterministicCheck ? ' · <span style="color:var(--ink-2);font-weight:600;">automated check</span>' : ""}</div></td>
              <td>${escapeHtml(displaySummary)}</td>
              <td style="font-family:var(--font-mono);font-size:0.74rem;white-space:nowrap;text-align:right;">${escapeHtml(metaParts.join(" · ") || "—")}</td>
            </tr>`;
    })
    .join("\n");

  const triageHtml = renderAwesomeTriageHtml({ lang: "en", depthPrefix: "../../" });

  return `<!DOCTYPE html>
<html lang="en" data-static-lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <script src="../../lang-init.js"></script>
  <title>Awesome Anti-Slop (${radarData.entries.length} Entries) — dislop</title>
  <meta name="description" content="${radarData.entries.length} verified anti-slop tools, deterministic linters, writing guides, UI design rules, and papers in English and Chinese. Filter offline in this tab.">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="dislop">
  <meta property="og:url" content="${baseUrl}/en/awesome/">
  <meta property="og:title" content="Awesome Anti-Slop (${radarData.entries.length} Entries) — dislop">
  <meta property="og:description" content="Curated directory of anti-slop linters, writing skills, UI rules, PR policies, and research papers.">
  <meta property="og:image" content="${baseUrl}/assets/og-card.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@dislop_ai">
  <meta name="twitter:title" content="Awesome Anti-Slop (${radarData.entries.length} Entries) — dislop">
  <meta name="twitter:description" content="Curated directory of anti-slop linters, writing skills, UI rules, PR policies, and research papers.">
  <meta name="twitter:image" content="${baseUrl}/assets/og-card.png">
  <link rel="canonical" href="${baseUrl}/en/awesome/">
  <link rel="alternate" hreflang="zh-Hans" href="${baseUrl}/awesome/">
  <link rel="alternate" hreflang="en" href="${baseUrl}/en/awesome/">
  <link rel="alternate" hreflang="x-default" href="${baseUrl}/awesome/">
  <link rel="alternate" type="text/markdown" href="../../awesome/index.md" title="Awesome Anti-Slop Markdown Directory">
  <link rel="alternate" type="application/json" href="../../awesome/index.json" title="Awesome Anti-Slop JSON (${radarData.schema})">
  <link rel="alternate" type="text/plain" href="../../llms.txt" title="LLMs Resource Index">
  <link rel="icon" type="image/svg+xml" href="../../assets/logo.svg">
  <link rel="stylesheet" href="../../styles.css">
${renderAwesomeJsonLd({ lang: "en", baseUrl, entries: radarData.entries })}
</head>
<body>
  <a class="skip-link" href="#main-content" data-i18n="nav.skip">Skip to main content</a>
  <div class="rail-shell">
    <header class="topbar band-rule">
      ${renderBrandLockup({ lang: "en", depthPrefix: "../../", homeHref: "../", metaI18nKey: "nav.brandMeta" })}

      <nav class="nav-links" aria-label="Main navigation">
${renderPrimaryNavLinks({ lang: "en", depthPrefix: "../../", activeNav: "awesome", ids: AWESOME_NAV_IDS, withI18n: true })}
      </nav>

      <div class="top-controls">
        ${renderGithubCtrl({ i18nKey: "nav.github" })}
        <button type="button" id="lang-toggle" class="ctrl-btn" aria-label="切换为中文">中文</button>
        <button type="button" id="theme-toggle" class="ctrl-btn" aria-label="Toggle color theme">Dark</button>
      </div>
    </header>

    <main id="main-content">
    <section class="section-block band-rule">
      <h1 class="lead-heading" style="max-width:24ch;" data-i18n="awesome.heading">Awesome Anti-Slop</h1>
      <p class="section-desc" data-i18n="awesome.sub">
        ${radarData.entries.length} tools, linters, style guides, UI rules, and papers in English and Chinese, including established projects like Vale and Impeccable. Filter by topic or show only automated tools. Links and GitHub snapshots checked on ${snapshotDate}.
      </p>
      <div class="page-export-strip">
        <span data-i18n="awesome.exportLabel">For agents and scripts:</span>
        <a href="../../awesome/index.json">index.json</a>
        <a href="../../awesome/index.md">index.md</a>
        <a href="https://github.com/dislop-ai/dislop/tree/main/awesome" target="_blank" rel="noopener" id="awesome-gh-nav">GitHub</a>
      </div>

${triageHtml}

      <div class="catalog-controls" style="margin-top:24px;">
        <input type="search" id="awesome-search" class="search-input" placeholder="Search name, repo, or what it does..." aria-label="Search directory">
        <select id="awesome-section" class="filter-select" aria-label="Filter by topic">
          ${sectionOptions}
        </select>
        <select id="awesome-locale" class="filter-select" aria-label="Filter by locale">
          <option value="all" data-i18n="awesome.allLocales">All locales</option>
          ${radarData.taxonomy.locales.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("")}
        </select>
        <button type="button" id="awesome-det-btn" class="ctrl-btn" aria-pressed="false" data-i18n="awesome.detOnly">Automated checks only</button>
        <button type="button" id="awesome-reset-btn" class="ctrl-btn" data-i18n="awesome.reset">Reset</button>
      </div>

      <div class="filter-bar" style="margin-top:10px;">
        <span class="catalog-count" id="awesome-count" aria-live="polite">${radarData.entries.length} / ${radarData.entries.length} entries</span>
        <span style="font-size:0.78rem;color:var(--ink-3);" data-i18n="awesome.snapNote">Checked ${snapshotDate} · Filters offline in this tab</span>
      </div>

      <div class="table-scroll" tabindex="0" role="region" aria-label="Awesome Anti-Slop table">
        <table class="radar-table">
          <thead>
            <tr>
              <th data-i18n="awesome.colName">Project &amp; topic</th>
              <th data-i18n="awesome.colSummary">What it does</th>
              <th style="text-align:right;" data-i18n="awesome.colMeta">Stars · last push</th>
            </tr>
          </thead>
          <tbody id="awesome-tbody">
${rowsHtml}
          </tbody>
        </table>
      </div>

      <div class="contrast-notice" data-i18n="awesome.contrastNote">
        Note: Contrast Watch lists probabilistic AI-text detectors and bypass tools for reference only. dislop flags AI slop in writing and design; it is not for evading disclosure policies.
      </div>
    </section>
    </main>

    <footer class="colophon">
      <div>
        <span data-i18n="footer.snapshot">Checked ${snapshotDate} · Runs offline with no outbound requests</span>
      </div>
      <div class="colophon-links">
        <a href="../" id="awesome-foot-home" data-i18n="footer.home">Back to dislop</a>
        <a href="../../awesome/index.json" data-i18n="footer.json">JSON</a>
        <a href="../../awesome/index.md">Markdown</a>
        <a href="../../llms.txt">llms.txt</a>
        <a href="https://github.com/dislop-ai/dislop/tree/main/awesome" target="_blank" rel="noopener" id="awesome-gh-foot">GitHub</a>
        <a href="https://x.com/dislop_ai" target="_blank" rel="noopener">X (@dislop_ai)</a>
      </div>
    </footer>
  </div>

  <script type="module" src="../../awesome/awesome.js"></script>
</body>
</html>
`;
}

export function buildGuidesAndRulesPages({
  siteDir,
  baseUrl,
  version,
  snapshotDate,
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

  // 1. Guides Index (/guides/ & /en/guides/)
  for (const lang of ["zh", "en"]) {
    const isEn = lang === "en";
    const depthPrefix = isEn ? "../../" : "../";
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
        <a href="${isEn ? "../" : "../"}">dislop</a> / <span aria-current="page">${isEn ? "Guides" : "实用指南"}</span>
      </nav>
      <h1 class="lead-heading" style="max-width:26ch;">${isEn ? "Anti-slop guides &amp; tutorials" : "去 AI 味实用指南与教程"}</h1>
      <p class="section-desc">
        ${isEn
          ? "Six field guides covering prose, web UI, PowerPoint decks, agent setups, and linter selection—each grounded in verifiable sources and runnable commands."
          : "覆盖文稿写作、前端界面、PPT 与 Word 排版、Agent 接入和工具选型的 6 篇实操教程。每篇都带正反句对照、可直接运行的命令和一手出处。"}
      </p>
      <div class="guide-grid">
${cardsHtml}
      </div>
    </section>`;

    const pageUrl = isEn ? `${baseUrl}/en/guides/` : `${baseUrl}/guides/`;
    const homeUrl = isEn ? `${baseUrl}/en/` : `${baseUrl}/`;
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
      isEn ? "en/guides/index.html" : "guides/index.html",
      renderStaticShell({
        lang,
        baseUrl,
        depthPrefix,
        title: isEn ? "Anti-Slop Guides & Tutorials — dislop" : "去 AI 味实用指南与教程 — dislop",
        description: isEn
          ? "Practical guides to catch and fix AI slop in prose, web UI, PowerPoint decks, and coding agent workflows."
          : "覆盖中文写作、前端页面、Word/PPT 排版与 Claude Code / Codex / Cursor 接入的去 AI 味实用教程。",
        canonicalPath: isEn ? "/en/guides/" : "/guides/",
        altPath: isEn ? "/guides/" : "/en/guides/",
        ogImage: isEn ? "og-card.png" : "og-card-zh.png",
        jsonLdScript: jsonLd,
        feedPath: isEn ? "en/feed.xml" : "feed.xml",
        activeNav: "guides",
        mainHtml,
      })
    );
  }
  htmlSitemapPairs.push({ zh: "/guides/", en: "/en/guides/", prio: "0.9" });

  // 2. Individual Guide Articles (/guides/<slug>/ & /en/guides/<slug>/)
  const guidePairBySlug = new Map(guides.map((p) => [p.slug, p]));
  for (const pair of guides) {
    for (const lang of ["zh", "en"]) {
      const isEn = lang === "en";
      const depthPrefix = isEn ? "../../../" : "../../";
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
          return `<a class="related-link-chip" href="${depthPrefix}${isEn ? "en/" : ""}rules/${escapeHtml(rid)}/"><code>${escapeHtml(rid)}</code> · ${escapeHtml(rTitle)}</a>`;
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

      const pageUrl = `${baseUrl}${isEn ? `/en/guides/${m.slug}/` : `/guides/${m.slug}/`}`;
      const citeLine = `[${m.title}](${pageUrl}) — ${m.description}`;
      const actionBarHtml = renderShareActionBar({
        isEn,
        tryHref: `${depthPrefix}?lang=${lang}#workbench`,
        tryLabel: isEn ? "Try in workbench →" : "去工作台试查 →",
        citeMarkdown: citeLine,
      });

      const mainHtml = `    <section class="section-block">
      <nav class="breadcrumbs" aria-label="${isEn ? "Breadcrumb" : "面包屑导航"}">
        <a href="${depthPrefix}${isEn ? "en/" : ""}">dislop</a> / <a href="../">${isEn ? "Guides" : "实用指南"}</a> / <span aria-current="page">${escapeHtml(m.navTitle)}</span>
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
            <div class="answer-box-label">${isEn ? "DIRECT ANSWER" : "先说结论"}</div>
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
      const guidesUrl = `${baseUrl}${isEn ? "/en/guides/" : "/guides/"}`;
      const homeUrl = `${baseUrl}${isEn ? "/en/" : "/"}`;
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

      const relDir = isEn ? `en/guides/${m.slug}` : `guides/${m.slug}`;
      writeHtml(
        `${relDir}/index.html`,
        renderStaticShell({
          lang,
          baseUrl,
          depthPrefix,
          title: `${m.title} — dislop`,
          description: m.description,
          canonicalPath: `/${relDir}/`,
          altPath: isEn ? `/guides/${m.slug}/` : `/en/guides/${m.slug}/`,
          ogType: "article",
          ogImage: isEn ? "og-card.png" : "og-card-zh.png",
          jsonLdScript: renderJsonLdScript(graph),
          feedPath: isEn ? "en/feed.xml" : "feed.xml",
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
    htmlSitemapPairs.push({ zh: `/guides/${pair.slug}/`, en: `/en/guides/${pair.slug}/`, prio: "0.8" });
  }

  // 3. Rules Directory Index (/rules/ & /en/rules/)
  for (const lang of ["zh", "en"]) {
    const isEn = lang === "en";
    const depthPrefix = isEn ? "../../" : "../";
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
        <a href="${isEn ? "../" : "../"}">dislop</a> / <span aria-current="page">${isEn ? "Rules" : "规则百科"}</span>
      </nav>
      <h1 class="lead-heading" style="max-width:26ch;">${isEn ? `All ${visibleRulesCount} English &amp; cross-language rules` : `全部 ${allRules.length} 条内置去 AI 味规则`}</h1>
      <p class="section-desc">
        ${isEn
          ? `${visibleRulesCount} deterministic rules ship inside the offline CLI and browser workbench across ${packOrder.length} scenario packs, each with a Deletion Test question and Before / Fallback / Clean examples.`
          : `7 套场景包一共内置 ${allRules.length} 条规则，CLI、插件和浏览器工作台都离线自带。点开任意一条都能看判断方法、正反句对照和命令行用法。`}
      </p>
    </section>
${packSections}`;

    const pageUrl = isEn ? `${baseUrl}/en/rules/` : `${baseUrl}/rules/`;
    const homeUrl = isEn ? `${baseUrl}/en/` : `${baseUrl}/`;
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
      isEn ? "en/rules/index.html" : "rules/index.html",
      renderStaticShell({
        lang,
        baseUrl,
        depthPrefix,
        title: isEn ? `All ${visibleRulesCount} Anti-Slop Rules — dislop` : `全部 ${allRules.length} 条去 AI 味规则 — dislop`,
        description: isEn
          ? `Reference index of ${visibleRulesCount} deterministic anti-slop rules across 7 packs with check questions and clean rewrite examples.`
          : `全部 ${allRules.length} 条去 AI 味内置规则的中文说明、判断方法与原句改写对照。`,
        canonicalPath: isEn ? "/en/rules/" : "/rules/",
        altPath: isEn ? "/rules/" : "/en/rules/",
        ogImage: isEn ? "og-card.png" : "og-card-zh.png",
        jsonLdScript: jsonLd,
        feedPath: isEn ? "en/feed.xml" : "feed.xml",
        activeNav: "rules",
        mainHtml,
      })
    );
  }
  htmlSitemapPairs.push({ zh: "/rules/", en: "/en/rules/", prio: "0.8" });

  // 4. Individual Rule Detail HTML Pages (/rules/<id>/ & /en/rules/<id>/)
  for (const { packId, pack, rule: r } of allRules) {
    const uiMeta = ruleUiMeta[r.id] || { lang: "both", title: { zh: r.id, en: r.id } };
    const isZhOnlyRule = uiMeta.lang === "zh";
    if (isZhOnlyRule) {
      fs.rmSync(path.join(siteDir, "en", "rules", r.id), { recursive: true, force: true });
    }
    const matchingGuides = guides.filter((p) => (p.en.meta.relatedRules || []).includes(r.id));
    const targetLangs = isZhOnlyRule ? ["zh"] : ["zh", "en"];

    for (const lang of targetLangs) {
      const isEn = lang === "en";
      const depthPrefix = isEn ? "../../../" : "../../";
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
            <div class="rule-contrast-label">${isEn ? "Fallback trap (still sounds like AI)" : "换了种 AI 味"}</div>
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
          return `<a class="related-link-chip" href="${depthPrefix}${isEn ? "en/" : ""}guides/${escapeHtml(gm.slug)}/">${escapeHtml(gm.navTitle)}</a>`;
        })
        .join("\n");

      const exNote = isEn
        ? sanitizeEnglishRuleProse(r.exemplar?.note?.en || "")
        : (r.exemplar?.note?.zh || r.exemplar?.note?.en || "");
      const exNoteHtml = exNote ? `<p class="rule-note"><strong>${isEn ? "Edit note:" : "改法要点："}</strong> ${formatRuleProseHtml(exNote)}</p>` : "";

      const textModalities = new Set(["markdown", "text", "html", "css", "jsx", "svg"]);
      const canTryRule = Boolean(r.exemplar && (r.modalities || []).some((m) => textModalities.has(m)));
      const pageUrl = `${baseUrl}${isEn ? `/en/rules/${r.id}/` : `/rules/${r.id}/`}`;
      const cleanOneLineMsg = msg.replace(/\s+/g, " ").trim();
      const citeLine = isEn
        ? `[\`${r.id}\`](${pageUrl}): ${cleanOneLineMsg}`
        : `[\`${r.id}\`](${pageUrl})：${cleanOneLineMsg}`;
      const actionBarHtml = renderShareActionBar({
        isEn,
        tryHref: canTryRule ? `${depthPrefix}?lang=${lang}#try=${encodeURIComponent(r.id)}` : `${depthPrefix}?lang=${lang}#workbench`,
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
        <a href="${depthPrefix}${isEn ? "en/" : ""}">dislop</a> / <a href="../">${isEn ? "Rules" : "规则百科"}</a> / <span aria-current="page"><code>${escapeHtml(r.id)}</code></span>
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
      const rulesIndexUrl = `${baseUrl}${isEn ? "/en/rules/" : "/rules/"}`;
      const homeUrl = `${baseUrl}${isEn ? "/en/" : "/"}`;
      const jsonLd = renderJsonLdScript([
        {
          "@type": "TechArticle",
          "@id": pageUrl,
          url: pageUrl,
          headline: `${rTitle} (${r.id})`,
          description: delTest,
          inLanguage: isEn ? "en" : "zh-CN",
          dateModified: snapshotDate,
          author: { "@type": "Organization", name: "dislop", url: `${baseUrl}/` },
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

      const relDir = isEn ? `en/rules/${r.id}` : `rules/${r.id}`;
      writeHtml(
        `${relDir}/index.html`,
        renderStaticShell({
          lang,
          baseUrl,
          depthPrefix,
          title: `${rTitle} (${r.id}) — dislop`,
          description: `${rTitle}: ${msg}`,
          canonicalPath: `/${relDir}/`,
          altPath: isZhOnlyRule ? null : (isEn ? `/rules/${r.id}/` : `/en/rules/${r.id}/`),
          ogType: "article",
          ogImage: isEn ? "og-card.png" : "og-card-zh.png",
          jsonLdScript: jsonLd,
          feedPath: isEn ? "en/feed.xml" : "feed.xml",
          mdAltHref: mdCardHref,
          activeNav: "rules",
          mainHtml,
        })
      );
    }
    if (isZhOnlyRule) {
      standaloneHtmlUrls.push([`${baseUrl}/rules/${r.id}/`, "0.7"]);
    } else {
      htmlSitemapPairs.push({ zh: `/rules/${r.id}/`, en: `/en/rules/${r.id}/`, prio: "0.7" });
    }
  }

  // 5. Bilingual Atom Feeds (/feed.xml & /en/feed.xml)
  function escapeXml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  for (const lang of ["zh", "en"]) {
    const isEn = lang === "en";
    const feedUrl = `${baseUrl}${isEn ? "/en/feed.xml" : "/feed.xml"}`;
    const guidesUrl = `${baseUrl}${isEn ? "/en/guides/" : "/guides/"}`;
    const entriesXml = guides
      .map((pair) => {
        const m = pair[lang].meta;
        const entryUrl = `${baseUrl}${isEn ? `/en/guides/${m.slug}/` : `/guides/${m.slug}/`}`;
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
    writeHtml(isEn ? "en/feed.xml" : "feed.xml", feedXml);
  }

  return { htmlSitemapPairs, standaloneHtmlUrls };
}
