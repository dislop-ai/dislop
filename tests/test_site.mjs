#!/usr/bin/env node
// Deterministic offline verification tests for site/ and scripts/build_site.mjs.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditText, resolveEffectivePack } from "../src/core.mjs";
import { PACKS_BY_ID, RULE_UI_META } from "../site/engine/packs-data.mjs";
import { AWESOME_DATA } from "../site/awesome/awesome-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site");

const INVISIBLE_BIDI_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/;

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function parseHex(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function relativeLuminance([r, g, b]) {
  const chan = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

function contrastRatio(rgbA, rgbB) {
  const l1 = relativeLuminance(rgbA);
  const l2 = relativeLuminance(rgbB);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// 1. Verify packs-data.mjs ships zero raw fixtures arrays & all 36 Try rules trigger cleanly
let totalRules = 0;
let tryRulesChecked = 0;
const textMods = new Set(["markdown", "text", "html", "css", "jsx", "svg"]);

for (const [pid, pack] of Object.entries(PACKS_BY_ID)) {
  for (const rule of pack.rules || []) {
    totalRules += 1;
    assert.equal("fixtures" in rule, false, `packs-data.mjs leaked fixtures on ${pid}/${rule.id}`);
    const mods = rule.modalities || [];
    if (rule.exemplar && mods.some((m) => textMods.has(m))) {
      tryRulesChecked += 1;
      let modality = "markdown";
      let ext = "md";
      if (mods.includes("css") && !mods.includes("markdown")) {
        modality = "css";
        ext = "css";
      } else if (mods.includes("svg") && !mods.includes("markdown") && !mods.includes("html")) {
        modality = "svg";
        ext = "svg";
      } else if (mods.includes("html") && !mods.includes("markdown")) {
        modality = "html";
        ext = "html";
      }
      const targetPack =
        pid === "core" ? (modality === "html" || modality === "css" || modality === "svg" ? "deck-and-ui" : "business-brief") : pid;
      const effPack = resolveEffectivePack(targetPack, PACKS_BY_ID);
      let sample = rule.exemplar.bad;
      let res = auditText(sample, { filename: `${rule.id}.${ext}`, modality, pack: effPack });
      if (!res.findings.some((f) => f.ruleId === rule.id) && rule.demo?.bad) {
        sample = rule.demo.bad;
        res = auditText(sample, { filename: `${rule.id}.${ext}`, modality, pack: effPack });
      }
      assert.equal(
        res.findings.some((f) => f.ruleId === rule.id),
        true,
        `Try rule ${rule.id} did not trigger itself in browser workbench sample`
      );
    }

    // Verify complete RULE_UI_META coverage & strict EN/ZH exemplar purity
    const meta = RULE_UI_META[rule.id];
    assert.ok(meta, `Missing RULE_UI_META entry for rule ${pid}/${rule.id}`);
    assert.ok(meta.title?.zh && meta.title.zh !== rule.id, `Raw slug or missing ZH title for ${rule.id}`);
    assert.ok(meta.title?.en, `Missing EN title for ${rule.id}`);
    if (meta.lang !== "zh" && rule.exemplar) {
      const enEx = meta.enEx || rule.exemplar;
      assert.equal(
        /[\u4E00-\u9FFF]/.test([enEx.bad, enEx.trap, enEx.good].filter(Boolean).join(" ")),
        false,
        `EN exemplar for ${rule.id} leaked Chinese characters`
      );
    }
  }
}
assert.equal(totalRules, 42, `Expected 42 total rules, got ${totalRules}`);
assert.equal(tryRulesChecked, 36, `Expected 36 Try rules, got ${tryRulesChecked}`);

// 2. Verify Hero Proof Cards (ZH + EN) and all 14 language-pure specimens (7 ZH + 7 EN)
const appSource = fs.readFileSync(path.join(SITE_DIR, "app.js"), "utf8");
const heroBlock = appSource.match(/const HERO_PROOF_BY_LANG = \{[\s\S]*?\n\};/);
const specimenBlock = appSource.match(/const SPECIMENS_BY_LANG = \{[\s\S]*?\n\};/);
assert.ok(heroBlock, "Could not locate HERO_PROOF_BY_LANG in site/app.js");
assert.ok(specimenBlock, "Could not locate SPECIMENS_BY_LANG in site/app.js");
const { heroProof, specimensByLang } = new Function(`${heroBlock[0]}\n${specimenBlock[0]}\nreturn { heroProof: HERO_PROOF_BY_LANG, specimensByLang: SPECIMENS_BY_LANG };`)();

for (const lang of ["zh", "en"]) {
  const hp = heroProof[lang];
  const pack = resolveEffectivePack(hp.pack, PACKS_BY_ID);
  const badRes = auditText(hp.bad, { filename: hp.filename, modality: hp.modality, pack });
  const trapRes = auditText(hp.trap, { filename: hp.filename, modality: hp.modality, pack });
  const goodRes = auditText(hp.good, { filename: hp.filename, modality: hp.modality, pack });
  assert.ok(badRes.findings.length >= 3, `Hero proof (${lang}) bad should have >= 3 findings`);
  assert.ok(trapRes.findings.length >= 1, `Hero proof (${lang}) trap should still trigger 2nd-order slop`);
  assert.equal(goodRes.findings.length, 0, `Hero proof (${lang}) good had ${goodRes.findings.length} findings`);
  if (lang === "en") {
    assert.equal(/[\u4E00-\u9FFF]/.test(hp.bad + hp.good + hp.trap), false, "English hero proof leaked Chinese characters");
  }
}

let specimenCount = 0;
for (const lang of ["zh", "en"]) {
  const list = specimensByLang[lang];
  assert.equal(list.length, 7, `Expected 7 specimens for ${lang}`);
  for (const sp of list) {
    specimenCount += 1;
    const pack = resolveEffectivePack(sp.pack, PACKS_BY_ID);
    const badRes = auditText(sp.bad, { filename: sp.filename, modality: sp.modality, pack });
    const trapRes = auditText(sp.trap, { filename: sp.filename, modality: sp.modality, pack });
    const goodRes = auditText(sp.good, { filename: sp.filename, modality: sp.modality, pack });
    assert.equal(goodRes.findings.length, 0, `Specimen ${lang}/${sp.id} good had ${goodRes.findings.length} findings`);
    assert.ok(trapRes.findings.length >= 1, `Specimen ${lang}/${sp.id} trap should still trigger AI slop`);
    if (sp.id === "clean-nearmiss") {
      assert.equal(badRes.findings.length, 0, `Specimen ${lang}/clean-nearmiss should have 0 findings`);
    } else {
      assert.ok(badRes.findings.length > 0, `Specimen ${lang}/${sp.id} bad draft should have >= 1 finding`);
    }
    if (lang === "en") {
      assert.equal(/[\u4E00-\u9FFF]/.test(sp.bad + sp.good + sp.trap), false, `EN specimen ${sp.id} leaked Chinese chars`);
    }
  }
}

// 3. Verify catalog.json hashes, byte lengths, and zero hidden chars/comments
const catalogStr = fs.readFileSync(path.join(SITE_DIR, "catalog.json"), "utf8");
const catalog = JSON.parse(catalogStr);
assert.equal(catalog.schema, "dislop.catalog/1");
assert.ok(catalog.resources.length >= 50, "Expected >= 50 catalog resources");

for (const res of catalog.resources) {
  const diskPath = path.join(SITE_DIR, res.path.replace(/^\//, ""));
  assert.ok(fs.existsSync(diskPath), `Missing catalog resource on disk: ${res.path}`);
  const body = fs.readFileSync(diskPath, "utf8");
  assert.equal(Buffer.byteLength(body, "utf8"), res.bytes, `Byte mismatch for ${res.path}`);
  assert.equal(sha256(body), res.sha256, `SHA-256 mismatch for ${res.path}`);
  assert.equal(INVISIBLE_BIDI_RE.test(body), false, `Invisible/bidi char found in ${res.path}`);
  assert.equal(body.includes("<!--"), false, `HTML comment found in agent resource ${res.path}`);
}

// 4. Verify Awesome Anti-Slop data, pure-EN README.md & pure-ZH README.zh-CN.md
assert.equal(AWESOME_DATA.entries.length, 87, "Expected 87 Awesome Anti-Slop entries");
assert.ok(fs.existsSync(path.join(ROOT, "awesome", "README.md")), "Missing top-level awesome/README.md");
assert.ok(fs.existsSync(path.join(ROOT, "awesome", "README.zh-CN.md")), "Missing top-level awesome/README.zh-CN.md");
assert.ok(fs.existsSync(path.join(SITE_DIR, "awesome", "index.html")), "Missing site/awesome/index.html");

const awesomeReadmeEn = fs.readFileSync(path.join(ROOT, "awesome", "README.md"), "utf8");
const awesomeReadmeZh = fs.readFileSync(path.join(ROOT, "awesome", "README.zh-CN.md"), "utf8");
assert.ok(awesomeReadmeEn.includes("https://dislop.com/awesome/"), "awesome/README.md missing interactive web link");
assert.ok(awesomeReadmeEn.includes("## Contents"), "awesome/README.md missing Contents TOC");
assert.ok(awesomeReadmeZh.includes("## 目录"), "awesome/README.zh-CN.md missing TOC");
// Strip the single language-switch link ("简体中文") and verify zero Chinese prose leaks into English awesome/README.md
const awesomeEnBodyOnly = awesomeReadmeEn.replace('<a href="./README.zh-CN.md">简体中文</a>', "");
assert.equal(/[\u4E00-\u9FFF]/.test(awesomeEnBodyOnly), false, "English awesome/README.md leaked Chinese text");

for (const entry of AWESOME_DATA.entries) {
  assert.match(entry.url, /^https:\/\//i, `Non-HTTPS URL in awesome entry ${entry.id}: ${entry.url}`);
  assert.ok(entry.summaryEn && !/[\u4E00-\u9FFF]/.test(entry.summaryEn), `Missing or non-English summaryEn on ${entry.id}`);
  if (entry.homepage) {
    assert.match(entry.homepage, /^https:\/\//i, `Non-HTTPS homepage in awesome entry ${entry.id}: ${entry.homepage}`);
  }
  assert.equal(INVISIBLE_BIDI_RE.test(JSON.stringify(entry)), false, `Invisible/bidi char in awesome entry ${entry.id}`);
  assert.ok(awesomeReadmeEn.includes(entry.url), `awesome/README.md missing entry URL: ${entry.url}`);
  assert.ok(awesomeReadmeZh.includes(entry.url), `awesome/README.zh-CN.md missing entry URL: ${entry.url}`);
}

// 5. Verify WCAG 2.2 AA contrast of CSS text & control-border tokens in site/styles.css
const css = fs.readFileSync(path.join(SITE_DIR, "styles.css"), "utf8");
const lightTokens = {
  sheet: "#FFFFFF",
  raised: "#ECEEE9",
  inset: "#F1F3F0",
  ink: "#14171A",
  ink2: "#474C55",
  ink3: "#5E646E",
  err: "#B42318",
  warn: "#1B52B0",
  ok: "#1E6B47",
  ctrl: "#767C85",
};
const darkTokens = {
  sheet: "#15181C",
  raised: "#1D2127",
  inset: "#0A0C0E",
  ink: "#ECEEF0",
  ink2: "#A6ACB5",
  ink3: "#8C939E",
  err: "#FF7A6B",
  warn: "#85B4FF",
  ok: "#6CD49B",
  ctrl: "#6F7784",
};
assert.ok(css.includes(`--control-border: ${lightTokens.ctrl};`), "Missing light --control-border token");
assert.ok(css.includes(`--control-border: ${darkTokens.ctrl};`), "Missing dark --control-border token");

for (const [mode, t] of [
  ["light", lightTokens],
  ["dark", darkTokens],
]) {
  for (const fg of [t.ink, t.ink2, t.ink3, t.err, t.warn, t.ok]) {
    assert.ok(
      contrastRatio(parseHex(fg), parseHex(t.sheet)) >= 4.5,
      `${mode} text token ${fg} on sheet failed 4.5:1`
    );
  }
  for (const bg of [t.sheet, t.raised, t.inset]) {
    assert.ok(
      contrastRatio(parseHex(t.ctrl), parseHex(bg)) >= 3.0,
      `${mode} --control-border ${t.ctrl} on ${bg} failed 3.0:1 WCAG non-text contrast`
    );
  }
}

// 6. Verify default Chinese HTML, brand baseline tokens, 2-mark system, and OG card assets
assert.ok(css.includes("--pen: #F04438;"), "Missing master Vermilion --pen token in site/styles.css");
assert.ok(css.includes("border-bottom: 2px solid var(--mark-error);"), "Missing solid error underline in site/styles.css");
assert.ok(css.includes("border-bottom: 1.5px dashed var(--mark-warn);"), "Missing dashed warning underline in site/styles.css");
assert.equal(css.includes("--mark-stet"), false, "site/styles.css must not define removed --mark-stet token");
assert.equal(css.includes(".mark-stet"), false, "site/styles.css must not define removed .mark-stet rule");
assert.equal(css.includes(".fact-lock-bar"), false, "site/styles.css must not define removed .fact-lock-bar rule");
assert.equal(css.includes(".verify-banner"), false, "site/styles.css must not define dead .verify-banner rule");
assert.ok(fs.existsSync(path.join(SITE_DIR, "methodology", "brand-and-voice.md")), "Missing site/methodology/brand-and-voice.md");
assert.ok(fs.existsSync(path.join(ROOT, "ROADMAP.md")), "Missing root ROADMAP.md");
assert.ok(fs.existsSync(path.join(ROOT, "ROADMAP.zh-CN.md")), "Missing root ROADMAP.zh-CN.md");
assert.ok(fs.existsSync(path.join(SITE_DIR, "roadmap.md")), "Missing site/roadmap.md");
assert.ok(fs.existsSync(path.join(SITE_DIR, "roadmap.zh-CN.md")), "Missing site/roadmap.zh-CN.md");
assert.ok(fs.existsSync(path.join(SITE_DIR, "assets", "og-card.png")), "Missing site/assets/og-card.png");
assert.ok(fs.existsSync(path.join(SITE_DIR, "assets", "og-card.svg")), "Missing site/assets/og-card.svg");

const indexHtml = fs.readFileSync(path.join(SITE_DIR, "index.html"), "utf8");
const awesomeHtml = fs.readFileSync(path.join(SITE_DIR, "awesome", "index.html"), "utf8");
const llmsTxt = fs.readFileSync(path.join(SITE_DIR, "llms.txt"), "utf8");
assert.ok(indexHtml.includes('<html lang="zh-CN">'), "site/index.html should default to zh-CN");
assert.ok(awesomeHtml.includes('<html lang="zh-CN">'), "site/awesome/index.html should default to zh-CN");
assert.ok(indexHtml.includes('property="og:image" content="https://dislop.com/assets/og-card.png"'));
assert.equal(indexHtml.includes('data-theme="light"'), false, "index.html should not force data-theme=light before hydration");
assert.equal(/^[ \t]+$/m.test(indexHtml), false, "index.html contains whitespace-only lines");
assert.equal(indexHtml.includes("NaN KB"), false, "index.html contains NaN KB in endpoints ledger");
assert.equal(indexHtml.includes("undefined tok"), false, "index.html contains undefined tok in endpoints ledger");
assert.equal(indexHtml.includes("dislop_verify"), false, "site/index.html must not reference dislop_verify");
assert.equal(indexHtml.includes("dislop verify"), false, "site/index.html must not reference dislop verify");
assert.equal(indexHtml.includes("fact-lock-bar"), false, "site/index.html must not contain #fact-lock-bar");
assert.equal(indexHtml.includes("mark-stet"), false, "site/index.html must not contain mark-stet");
assert.equal(llmsTxt.includes("dislop_verify"), false, "site/llms.txt must not reference dislop_verify");
assert.equal(llmsTxt.includes("dislop verify"), false, "site/llms.txt must not reference dislop verify");
assert.equal(llmsTxt.includes("fact-lock-bar"), false, "site/llms.txt must not reference fact-lock-bar");
assert.equal(appSource.includes("verifyRevision"), false, "site/app.js must not import or call verifyRevision");
assert.equal(appSource.includes("fact-lock-bar"), false, "site/app.js must not reference fact-lock-bar");
assert.equal(appSource.includes("mark-stet"), false, "site/app.js must not render mark-stet spans");
assert.equal(appSource.includes("rulesById"), false, "site/app.js must look up rules via pack.rules, not pack.rulesById");
assert.equal(appSource.includes("f.column"), false, "site/app.js must use f.col, not f.column");
assert.equal(appSource.includes("f.snippet"), false, "site/app.js must use f.match, not f.snippet");

// 7. Verify Agent Plugin, Codex, Gemini CLI & MCP Registry manifests plus Cases language purity
const pluginJson = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
const marketplaceJson = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"));
const portablePluginJson = JSON.parse(fs.readFileSync(path.join(ROOT, "plugin.json"), "utf8"));
const portableMcpJson = JSON.parse(fs.readFileSync(path.join(ROOT, "mcp.json"), "utf8"));
const codexPluginJson = JSON.parse(fs.readFileSync(path.join(ROOT, ".codex-plugin", "plugin.json"), "utf8"));
const codexMarketplaceJson = JSON.parse(fs.readFileSync(path.join(ROOT, ".agents", "plugins", "marketplace.json"), "utf8"));
const geminiExtensionJson = JSON.parse(fs.readFileSync(path.join(ROOT, "gemini-extension.json"), "utf8"));
const serverJson = JSON.parse(fs.readFileSync(path.join(ROOT, "server.json"), "utf8"));
const mcpJson = JSON.parse(fs.readFileSync(path.join(ROOT, ".mcp.json"), "utf8"));
assert.equal(pluginJson.name, "dislop", "plugin.json name should be dislop");
assert.equal(pluginJson.skills, "./skills/", "plugin.json should point to ./skills/");
assert.equal(pluginJson.mcpServers, "./.mcp.json", "plugin.json should point to ./.mcp.json");
assert.equal(marketplaceJson.plugins?.[0]?.name, "dislop", "marketplace.json should list dislop plugin");
assert.equal(portablePluginJson.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
assert.equal("skills" in portablePluginJson, false, "portable plugin.json must not include top-level skills");
assert.equal("mcpServers" in portablePluginJson, false, "portable plugin.json must not include top-level mcpServers");
assert.equal(portableMcpJson.mcpServers?.dislop?.url, "https://dislop.com/mcp", "mcp.json should point to Official Cloud MCP");
assert.equal(codexPluginJson.name, "dislop", ".codex-plugin/plugin.json name should be dislop");
assert.equal(codexMarketplaceJson.plugins?.[0]?.name, "dislop", ".agents/plugins/marketplace.json should list dislop");
assert.equal(geminiExtensionJson.name, "dislop", "gemini-extension.json name should be dislop");
assert.equal(geminiExtensionJson.mcpServers?.dislop?.httpUrl, "https://dislop.com/mcp", "gemini-extension.json should point to Official Cloud MCP");
assert.equal(serverJson.remotes?.[0]?.type, "streamable-http", "server.json should declare remote streamable-http MCP");
assert.equal(serverJson.remotes?.[0]?.url, "https://dislop.com/mcp", "server.json remote URL should point to dislop.com/mcp");
assert.ok(fs.existsSync(path.join(ROOT, "skills", "dislop", "agents", "openai.yaml")), "Missing skills/dislop/agents/openai.yaml");
assert.ok(fs.existsSync(path.join(ROOT, "action.yml")), "Missing root GitHub Action action.yml");
assert.ok(fs.existsSync(path.join(ROOT, ".pre-commit-hooks.yaml")), "Missing .pre-commit-hooks.yaml");
assert.equal(mcpJson.mcpServers?.dislop?.url, "https://dislop.com/mcp", ".mcp.json should point to Official Cloud MCP");
for (const refFile of ["business-and-rfc.md", "editorial-and-essay.md", "web-ui-and-deck.md", "regulated-and-precision.md"]) {
  assert.ok(fs.existsSync(path.join(ROOT, "skills", "dislop", "references", refFile)), `Missing local Skill reference ${refFile}`);
  assert.ok(fs.existsSync(path.join(SITE_DIR, "tools", "references", refFile)), `Missing compiled site Skill reference ${refFile}`);
}

const casesBlock = appSource.match(/const CASES_BY_LANG = \{[\s\S]*?\n\};/);
assert.ok(casesBlock, "Could not locate CASES_BY_LANG in site/app.js");
const casesByLang = new Function(`${casesBlock[0]}\nreturn CASES_BY_LANG;`)();
assert.equal(casesByLang.zh.length, 3, "Expected 3 ZH showcase cases");
assert.equal(casesByLang.en.length, 3, "Expected 3 EN showcase cases");
assert.equal(/[\u4E00-\u9FFF]/.test(JSON.stringify(casesByLang.en)), false, "English showcase cases leaked Chinese chars");

// 8. Verify every fenced ```json block in Agent docs & copyable JSON snippets in site/app.js parses cleanly
const jsonDocPaths = [
  ...fs.readdirSync(path.join(SITE_DIR, "tools")).filter((f) => f.endsWith(".md")).map((f) => path.join(SITE_DIR, "tools", f)),
  ...fs.readdirSync(path.join(SITE_DIR, "tasks")).filter((f) => f.endsWith(".md")).map((f) => path.join(SITE_DIR, "tasks", f)),
  path.join(ROOT, "skills", "dislop", "SKILL.md"),
];
let checkedJsonBlocks = 0;
for (const docPath of jsonDocPaths) {
  const txt = fs.readFileSync(docPath, "utf8");
  for (const m of txt.matchAll(/```json\n([\s\S]*?)```/g)) {
    checkedJsonBlocks += 1;
    assert.doesNotThrow(() => JSON.parse(m[1]), `Invalid JSON code block in ${path.relative(ROOT, docPath)}`);
  }
}
const snippetsBlock = appSource.match(/const SNIPPETS_BY_LANG = \{[\s\S]*?\n\};/);
assert.ok(snippetsBlock, "Could not locate SNIPPETS_BY_LANG in site/app.js");
const snippetsByLang = new Function(`${snippetsBlock[0]}\nreturn SNIPPETS_BY_LANG;`)();
for (const lang of ["zh", "en"]) {
  for (const key of ["mcp", "cloud", "config"]) {
    checkedJsonBlocks += 1;
    assert.doesNotThrow(() => JSON.parse(snippetsByLang[lang][key]), `Invalid JSON snippet in site/app.js ${lang}.${key}`);
  }
}
assert.ok(checkedJsonBlocks >= 10, `Expected >= 10 validated JSON snippets, got ${checkedJsonBlocks}`);
assert.ok(fs.existsSync(path.join(SITE_DIR, "privacy.md")), "Missing site/privacy.md");

// 9. Verify CSS brace balance (blocks early-closed @media queries) and complete data-i18n coverage
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
let braceDepth = 0;
for (let i = 0; i < cssNoComments.length; i += 1) {
  const ch = cssNoComments[i];
  if (ch === "{") braceDepth += 1;
  else if (ch === "}") {
    braceDepth -= 1;
    assert.ok(braceDepth >= 0, `Unmatched closing '}' in site/styles.css around char ${i}`);
  }
}
assert.equal(braceDepth, 0, `Unclosed '{' in site/styles.css (remaining depth: ${braceDepth})`);

const i18nBlock = appSource.match(/const I18N = \{[\s\S]*?\n\};/);
assert.ok(i18nBlock, "Could not locate I18N in site/app.js");
const i18nDict = new Function(`${i18nBlock[0]}\nreturn I18N;`)();
const htmlI18nKeys = [...new Set([...indexHtml.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]))];
for (const key of htmlI18nKeys) {
  assert.ok(key in i18nDict.zh, `Missing ZH I18N key for data-i18n="${key}"`);
  assert.ok(key in i18nDict.en, `Missing EN I18N key for data-i18n="${key}"`);
}
const htmlIds = new Set([...indexHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
for (const m of indexHtml.matchAll(/href="#([^"]+)"/g)) {
  assert.ok(htmlIds.has(m[1]), `Broken internal anchor href="#${m[1]}" in site/index.html`);
}

// 10. Verify robots.txt and sitemap.xml crawlability assets
const robotsTxt = fs.readFileSync(path.join(SITE_DIR, "robots.txt"), "utf8");
assert.ok(robotsTxt.includes("Sitemap: https://dislop.com/sitemap.xml"), "robots.txt missing Sitemap directive");
assert.ok(robotsTxt.includes("Disallow: /api/"), "robots.txt missing Disallow: /api/");
assert.ok(robotsTxt.includes("Disallow: /mcp"), "robots.txt missing Disallow: /mcp");

const sitemapXml = fs.readFileSync(path.join(SITE_DIR, "sitemap.xml"), "utf8");
assert.ok(sitemapXml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), "sitemap.xml missing urlset root");
assert.ok(sitemapXml.includes("<loc>https://dislop.com/</loc>"), "sitemap.xml missing root URL");
assert.ok(sitemapXml.includes("<loc>https://dislop.com/awesome/</loc>"), "sitemap.xml missing /awesome/ URL");
assert.equal(INVISIBLE_BIDI_RE.test(sitemapXml), false, "sitemap.xml contains invisible/bidi chars");
assert.equal(/&(?!amp;|lt;|gt;|quot;|apos;)/.test(sitemapXml), false, "sitemap.xml contains unescaped '&'");
const sitemapUrlCount = (sitemapXml.match(/<url>/g) || []).length;
assert.ok(sitemapUrlCount >= 50, `Expected >= 50 <url> entries in sitemap.xml, got ${sitemapUrlCount}`);

// 11. Verify animated demo GIFs & reduced-motion posters exist in site/assets/demos/ and match HTML references
const DEMOS_DIR = path.join(SITE_DIR, "assets", "demos");
const demoSlugs = ["proof-cycle", "cli-check", "workbench-live", "ui-slop"];
for (const lang of ["zh", "en"]) {
  for (const slug of demoSlugs) {
    const gifPath = path.join(DEMOS_DIR, `${slug}-${lang}-v1.gif`);
    const posterPath = path.join(DEMOS_DIR, `${slug}-${lang}-v1-poster.png`);
    assert.ok(fs.existsSync(gifPath), `Missing demo GIF: ${path.relative(ROOT, gifPath)}`);
    assert.ok(fs.existsSync(posterPath), `Missing demo poster: ${path.relative(ROOT, posterPath)}`);
    const gifBuf = fs.readFileSync(gifPath);
    assert.ok(gifBuf.subarray(0, 6).toString("ascii").startsWith("GIF8"), `Invalid GIF header on ${path.basename(gifPath)}`);
    assert.ok(gifBuf.length <= 600 * 1024, `Demo GIF exceeds 600 KB budget: ${path.basename(gifPath)} (${(gifBuf.length / 1024).toFixed(1)} KB)`);
    assert.ok(fs.statSync(posterPath).size <= 70 * 1024, `Demo poster exceeds 70 KB budget: ${path.basename(posterPath)}`);
  }
}
for (const m of indexHtml.matchAll(/\.\/assets\/demos\/([A-Za-z0-9._-]+)/g)) {
  assert.ok(fs.existsSync(path.join(DEMOS_DIR, m[1])), `Broken demo asset reference ./assets/demos/${m[1]} in site/index.html`);
}

console.log(
  `dislop site-test: ok (${totalRules} rules, ${tryRulesChecked} Try demos, ${specimenCount} ZH/EN specimens + 2 hero proofs + 6 cases, ` +
    `${catalog.resources.length} catalog resources, ${sitemapUrlCount} sitemap URLs, ${demoSlugs.length * 2} demo GIFs, ${checkedJsonBlocks} valid JSON configs, ${htmlI18nKeys.length} bilingual i18n keys, CSS braces balanced, ${AWESOME_DATA.entries.length} Awesome entries & WCAG AA passed)`
);
