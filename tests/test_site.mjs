#!/usr/bin/env node
// Deterministic offline verification tests for site/ and scripts/build_site.mjs.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import zlib from "node:zlib";
import { auditImageDocument, auditPdfDocument, auditText, resolveEffectivePack } from "../src/core.mjs";
import { parseBrowserImageBuffer, parseBrowserPdfBuffer } from "../site/engine/binary-browser.mjs";
import { auditPatterns } from "../site/engine/pattern-engine.mjs";
import { PATTERN_BANKS } from "../site/engine/patterns-data.mjs";
import { analyzeDocumentWithPocketModels, setPocketModelBundle } from "../site/engine/pocket-model.mjs";
import { POCKET_MODEL_BUNDLE } from "../site/engine/pocket-model-data.mjs";
import { PACKS_BY_ID, RULE_UI_META } from "../site/engine/packs-data.mjs";
import { AWESOME_DATA } from "../site/awesome/awesome-data.mjs";
setPocketModelBundle(POCKET_MODEL_BUNDLE);

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
assert.equal(totalRules, 53, `Expected 53 total rules, got ${totalRules}`);
assert.equal(tryRulesChecked, 44, `Expected 44 Try rules, got ${tryRulesChecked}`);

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
  assert.equal(list.length, 8, `Expected 8 specimens for ${lang}`);
  for (const sp of list) {
    specimenCount += 1;
    const pack = resolveEffectivePack(sp.pack, PACKS_BY_ID);
    const badRes = auditText(sp.bad, { filename: sp.filename, modality: sp.modality, pack });
    const trapRes = auditText(sp.trap, { filename: sp.filename, modality: sp.modality, pack });
    const goodRes = auditText(sp.good, { filename: sp.filename, modality: sp.modality, pack });
    assert.equal(goodRes.findings.length, 0, `Specimen ${lang}/${sp.id} good had ${goodRes.findings.length} findings`);
    if (sp.id === "stealth-vapor") {
      assert.equal(badRes.findings.length, 0, `Specimen ${lang}/stealth-vapor bad should have 0 deterministic findings`);
      const badMl = analyzeDocumentWithPocketModels(sp.bad);
      const trapMl = analyzeDocumentWithPocketModels(sp.trap);
      const goodMl = analyzeDocumentWithPocketModels(sp.good);
      assert.ok(badMl.documentProbability >= badMl.threshold, `Specimen ${lang}/stealth-vapor bad should trigger Pocket ML (${badMl.documentProbability})`);
      assert.ok(trapMl.documentProbability >= trapMl.threshold, `Specimen ${lang}/stealth-vapor trap should trigger Pocket ML (${trapMl.documentProbability})`);
      assert.ok(goodMl.documentProbability < 0.5, `Specimen ${lang}/stealth-vapor good should score clean on Pocket ML (${goodMl.documentProbability})`);
    } else if (sp.id === "clean-nearmiss") {
      assert.equal(badRes.findings.length, 0, `Specimen ${lang}/clean-nearmiss should have 0 findings`);
      assert.ok(trapRes.findings.length >= 1, `Specimen ${lang}/clean-nearmiss trap should still trigger AI slop`);
    } else {
      assert.ok(badRes.findings.length > 0, `Specimen ${lang}/${sp.id} bad draft should have >= 1 finding`);
      assert.ok(trapRes.findings.length >= 1, `Specimen ${lang}/${sp.id} trap should still trigger AI slop`);
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
assert.equal(AWESOME_DATA.entries.length, 90, "Expected 90 Awesome Anti-Slop entries");
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
assert.ok(indexHtml.includes('<html lang="zh-CN" data-static-lang="zh">'), "site/index.html static fallback should declare data-static-lang=zh");
assert.ok(awesomeHtml.includes('<html lang="zh-CN" data-static-lang="zh">'), "site/awesome/index.html static fallback should declare data-static-lang=zh");
assert.ok(indexHtml.includes('property="og:image" content="https://dislop.com/assets/og-card-zh.png"'));
const enIndexHtml = fs.readFileSync(path.join(SITE_DIR, "en", "index.html"), "utf8");
assert.ok(enIndexHtml.includes('property="og:image" content="https://dislop.com/assets/og-card.png"'));
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
for (const refFile of [
  "work-docs.md",
  "work-docs.zh-CN.md",
  "essay.md",
  "essay.zh-CN.md",
  "office.md",
  "office.zh-CN.md",
  "web-ui.md",
  "web-ui.zh-CN.md",
]) {
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
const jsonBlocksByBase = {};
for (const docPath of jsonDocPaths) {
  const txt = fs.readFileSync(docPath, "utf8");
  let countHere = 0;
  for (const m of txt.matchAll(/```json\n([\s\S]*?)```/g)) {
    checkedJsonBlocks += 1;
    countHere += 1;
    assert.doesNotThrow(() => JSON.parse(m[1]), `Invalid JSON code block in ${path.relative(ROOT, docPath)}`);
  }
  jsonBlocksByBase[path.basename(docPath)] = countHere;
}
assert.ok((jsonBlocksByBase["cli-and-hooks.md"] || 0) >= 1, "site/tools/cli-and-hooks.md should have >= 1 valid JSON block");
assert.ok((jsonBlocksByBase["mcp-sdk-api.md"] || 0) >= 1, "site/tools/mcp-sdk-api.md should have >= 1 valid JSON block");
const snippetsBlock = appSource.match(/const SNIPPETS_BY_LANG = \{[\s\S]*?\n\};/);
assert.ok(snippetsBlock, "Could not locate SNIPPETS_BY_LANG in site/app.js");
const snippetsByLang = new Function(`${snippetsBlock[0]}\nreturn SNIPPETS_BY_LANG;`)();
for (const lang of ["zh", "en"]) {
  for (const key of ["mcp", "cloud", "config"]) {
    checkedJsonBlocks += 1;
    assert.doesNotThrow(() => JSON.parse(snippetsByLang[lang][key]), `Invalid JSON snippet in site/app.js ${lang}.${key}`);
  }
}
assert.ok(checkedJsonBlocks >= 8, `Expected >= 8 validated JSON snippets, got ${checkedJsonBlocks}`);
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
assert.ok(sitemapXml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), "sitemap.xml missing urlset xmlns");
assert.ok(sitemapXml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'), "sitemap.xml missing xhtml xmlns");
assert.ok(sitemapXml.includes("<loc>https://dislop.com/</loc>"), "sitemap.xml missing root URL");
assert.ok(sitemapXml.includes("<loc>https://dislop.com/en/</loc>"), "sitemap.xml missing /en/ URL");
assert.ok(sitemapXml.includes("<loc>https://dislop.com/awesome/</loc>"), "sitemap.xml missing /awesome/ URL");
assert.ok(sitemapXml.includes("<loc>https://dislop.com/en/awesome/</loc>"), "sitemap.xml missing /en/awesome/ URL");
assert.ok(sitemapXml.includes("<loc>https://dislop.com/guides/</loc>"), "sitemap.xml missing /guides/ URL");
assert.ok(sitemapXml.includes("<loc>https://dislop.com/en/guides/</loc>"), "sitemap.xml missing /en/guides/ URL");
assert.equal(INVISIBLE_BIDI_RE.test(sitemapXml), false, "sitemap.xml contains invisible/bidi chars");
assert.equal(/&(?!amp;|lt;|gt;|quot;|apos;)/.test(sitemapXml), false, "sitemap.xml contains unescaped '&'");
const sitemapUrlCount = (sitemapXml.match(/<url>/g) || []).length;
assert.ok(sitemapUrlCount >= 50, `Expected >= 50 <url> entries in sitemap.xml, got ${sitemapUrlCount}`);

// 11. Verify animated demo GIFs, animated WebPs & reduced-motion posters exist in site/assets/demos/ and match HTML references
const DEMOS_DIR = path.join(SITE_DIR, "assets", "demos");
const demoSlugs = ["proof-cycle", "cli-check", "workbench-live", "ui-slop", "deck-office", "agent-workflow"];
for (const lang of ["zh", "en"]) {
  for (const slug of demoSlugs) {
    const gifPath = path.join(DEMOS_DIR, `${slug}-${lang}-v2.gif`);
    const webpPath = path.join(DEMOS_DIR, `${slug}-${lang}-v2.webp`);
    const posterPath = path.join(DEMOS_DIR, `${slug}-${lang}-v2-poster.png`);
    assert.ok(fs.existsSync(gifPath), `Missing demo GIF: ${path.relative(ROOT, gifPath)}`);
    assert.ok(fs.existsSync(webpPath), `Missing demo WebP: ${path.relative(ROOT, webpPath)}`);
    assert.ok(fs.existsSync(posterPath), `Missing demo poster: ${path.relative(ROOT, posterPath)}`);
    const gifBuf = fs.readFileSync(gifPath);
    assert.ok(gifBuf.subarray(0, 6).toString("ascii").startsWith("GIF8"), `Invalid GIF header on ${path.basename(gifPath)}`);
    assert.ok(gifBuf.length <= 600 * 1024, `Demo GIF exceeds 600 KB budget: ${path.basename(gifPath)} (${(gifBuf.length / 1024).toFixed(1)} KB)`);
    const webpBuf = fs.readFileSync(webpPath);
    assert.ok(
      webpBuf.subarray(0, 4).toString("ascii") === "RIFF" && webpBuf.subarray(8, 12).toString("ascii") === "WEBP",
      `Invalid WebP header on ${path.basename(webpPath)}`
    );
    assert.ok(webpBuf.length <= 320 * 1024, `Demo WebP exceeds 320 KB budget: ${path.basename(webpPath)} (${(webpBuf.length / 1024).toFixed(1)} KB)`);
    const posterBuf = fs.readFileSync(posterPath);
    assert.ok(
      posterBuf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
      `Invalid PNG header on ${path.basename(posterPath)}`
    );
    assert.ok(posterBuf.length <= 70 * 1024, `Demo poster exceeds 70 KB budget: ${path.basename(posterPath)}`);
  }
}
const demoCheckFiles = [indexHtml, fs.readFileSync(path.join(SITE_DIR, "en", "index.html"), "utf8")];
for (const baseDir of [path.join(SITE_DIR, "guides"), path.join(SITE_DIR, "en", "guides")]) {
  if (fs.existsSync(baseDir)) {
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const p = path.join(baseDir, entry.name, "index.html");
        if (fs.existsSync(p)) demoCheckFiles.push(fs.readFileSync(p, "utf8"));
      }
    }
  }
}
for (const docHtml of demoCheckFiles) {
  for (const m of docHtml.matchAll(/(?:\.\.?\/)+assets\/demos\/([A-Za-z0-9._-]+)/g)) {
    assert.ok(fs.existsSync(path.join(DEMOS_DIR, m[1])), `Broken demo asset reference assets/demos/${m[1]}`);
  }
}

// 12. Verify auto language detection (site/lang-init.js), hreflang, bilingual banners/OG cards & official slogans
const langInitPath = path.join(SITE_DIR, "lang-init.js");
assert.ok(fs.existsSync(langInitPath), "Missing site/lang-init.js");
assert.ok(indexHtml.includes('<script src="./lang-init.js"></script>'), "site/index.html must load ./lang-init.js synchronously");
assert.ok(awesomeHtml.includes('<script src="../lang-init.js"></script>'), "site/awesome/index.html must load ../lang-init.js synchronously");
for (const docHtml of [indexHtml, awesomeHtml]) {
  assert.ok(docHtml.includes('hreflang="zh-Hans"'), "Missing hreflang=zh-Hans");
  assert.ok(docHtml.includes('hreflang="en"'), "Missing hreflang=en");
  assert.ok(docHtml.includes('hreflang="x-default"'), "Missing hreflang=x-default");
}
for (const assetRel of [
  "assets/banner-zh-light.svg",
  "assets/banner-zh-dark.svg",
  "assets/og-card-zh.svg",
  "assets/og-card-zh.png",
  "site/assets/og-card-zh.png",
  "site/assets/og-card-zh.svg",
]) {
  assert.ok(fs.existsSync(path.join(ROOT, assetRel)), `Missing bilingual visual asset: ${assetRel}`);
}
const productBrief = fs.readFileSync(path.join(ROOT, "PRODUCT.md"), "utf8");
assert.ok(productBrief.includes("去 AI 味才是真正的生产力！"), "PRODUCT.md missing official ZH slogan");
assert.ok(productBrief.includes("Cutting AI slop is real productivity."), "PRODUCT.md missing official EN slogan");

const langInitSrc = fs.readFileSync(langInitPath, "utf8");
const fakeRoot = {
  lang: "zh-CN",
  attrs: { "data-static-lang": "zh" },
  getAttribute(k) { return this.attrs[k] ?? null; },
  setAttribute(k, v) { this.attrs[k] = String(v); },
  removeAttribute(k) { delete this.attrs[k]; },
};
const sandbox = {
  URLSearchParams,
  Intl,
  navigator: { languages: ["en-US", "zh-CN"], language: "en-US" },
  location: { search: "" },
  localStorage: { getItem: () => null },
  document: { documentElement: fakeRoot },
  setTimeout: () => 0,
};
sandbox.window = sandbox;
vm.runInNewContext(langInitSrc, sandbox);
const resolveLang = sandbox.__DISLOP_RESOLVE_LANG__;
assert.equal(typeof resolveLang, "function", "site/lang-init.js did not expose __DISLOP_RESOLVE_LANG__");
assert.equal(sandbox.__DISLOP_INIT_LANG__, "en", "Expected en-US browser to resolve to en");
assert.equal(fakeRoot.lang, "en", "Expected root lang attribute updated pre-paint to en");
assert.equal(fakeRoot.attrs["data-lang-hydrating"], "1", "Expected data-lang-hydrating=1 when browser != staticLang");

assert.equal(resolveLang({ search: "?lang=en", stored: "zh", languages: ["zh-CN"] }), "en");
assert.equal(resolveLang({ search: "?lang=zh", stored: "en", languages: ["en-US"] }), "zh");
assert.equal(resolveLang({ search: "", stored: "zh", languages: ["en-US"] }), "zh");
assert.equal(resolveLang({ search: "", stored: null, languages: ["en-US", "zh-CN"] }), "en");
assert.equal(resolveLang({ search: "", stored: null, languages: ["zh-CN", "en-US"] }), "zh");
assert.equal(resolveLang({ search: "", stored: null, languages: ["zh-TW"] }), "zh");
assert.equal(resolveLang({ search: "", stored: null, languages: ["ja-JP", "en"] }), "en");
assert.equal(resolveLang({ search: "", stored: null, languages: ["fr-FR"] }), "en");
assert.equal(resolveLang({ search: "", stored: null, languages: [], language: "", intlLocale: "zh-Hans-CN" }), "zh");
assert.equal(resolveLang({ search: "", stored: null, languages: [], language: "", intlLocale: "en-GB" }), "en");

const awesomeSource = fs.readFileSync(path.join(SITE_DIR, "awesome", "awesome.js"), "utf8");
const applyI18nBeforeUserBranch = (appSource.split("function applyI18n")[1] || "").split("if (isUserSwitch)")[0] || "";
assert.equal(applyI18nBeforeUserBranch.includes('safeSetStorage("dislop-lang"'), false);
assert.equal(/function detectInitialLang[\s\S]*?safeSetStorage/.test(awesomeSource.split("let currentLang")[0] || ""), false);

// 13. Verify site/engine/* browser modules have zero node:* imports, binary parsers work offline, and Round 5 workbench regressions stay locked
const engineFiles = [
  "core.mjs",
  "binary-browser.mjs",
  "pattern-engine.mjs",
  "patterns-data.mjs",
  "packs-data.mjs",
  "pocket-model.mjs",
  "pocket-model-data.mjs",
];
for (const fname of engineFiles) {
  const fpath = path.join(SITE_DIR, "engine", fname);
  assert.ok(fs.existsSync(fpath), `Missing browser engine file: site/engine/${fname}`);
  const src = fs.readFileSync(fpath, "utf8");
  assert.equal(/["']node:[a-z0-9_/-]+["']/i.test(src), false, `site/engine/${fname} must not import node:* modules`);
}

function makePngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function buildSyntheticPurplePng() {
  const w = 64;
  const h = 64;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  const rawRows = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y += 1) {
    const rowOff = y * (1 + w * 3);
    rawRows[rowOff] = 0;
    for (let x = 0; x < w; x += 1) {
      rawRows[rowOff + 1 + x * 3] = 186;
      rawRows[rowOff + 2 + x * 3] = 52;
      rawRows[rowOff + 3 + x * 3] = 255;
    }
  }
  const idat = zlib.deflateSync(rawRows);
  const textMeta = Buffer.from("parameters\0Negative prompt: blurry Steps: 28, CFG scale: 7", "utf8");
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makePngChunk("IHDR", ihdr),
    makePngChunk("tEXt", textMeta),
    makePngChunk("IDAT", idat),
    makePngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const uiEffPack = resolveEffectivePack("deck-and-ui", PACKS_BY_ID);
const parsedImg = await parseBrowserImageBuffer(buildSyntheticPurplePng());
const imgAudit = auditImageDocument(parsedImg, { filename: "slop-poster.png", pack: uiEffPack });
assert.ok(imgAudit.findings.length >= 2, `Expected >= 2 image findings on purple PNG with metadata, got ${imgAudit.findings.length}`);

function buildMinimalPdf({ landscape = false, textOps = "", hasEncrypt = false, extraPageDict = "" } = {}) {
  const mediaBox = landscape ? "[0 0 792 612]" : "[0 0 612 792]";
  const objs = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox ${mediaBox} /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R ${extraPageDict}>>\nendobj\n`,
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(textOps, "latin1")} >>\nstream\n${textOps}\nendstream\nendobj\n`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objs) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += obj;
  }
  const xrefPos = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R ${hasEncrypt ? "/Encrypt << /V 2 >> " : ""}>>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const longUniformLine = Array.from({ length: 48 }, (_, i) => `item${i}`).join(" ");
const flatScalePdf = buildMinimalPdf({
  landscape: true,
  textOps: `BT /F1 12 Tf 72 520 Td (${longUniformLine}) Tj /F1 12 Tf 72 480 Td (a) Tj /F1 12 Tf 72 440 Td (b) Tj /F1 12 Tf 72 400 Td (c) Tj ET`,
});
const parsedFlatPdf = await parseBrowserPdfBuffer(flatScalePdf);
const flatPdfAudit = auditPdfDocument(parsedFlatPdf, { filename: "flat-deck.pdf", pack: uiEffPack });
assert.equal(flatPdfAudit.findings.some((f) => f.ruleId === "pdf-visual-layout-slop"), true, "Expected pdf-visual-layout-slop on flat-scale landscape PDF");

const encryptedPdf = await parseBrowserPdfBuffer(buildMinimalPdf({ hasEncrypt: true }));
const encPdfAudit = auditPdfDocument(encryptedPdf, { filename: "locked.pdf", pack: uiEffPack });
assert.equal(encPdfAudit.skipped.length, 1, "Expected encrypted PDF to be skipped");

const unreadablePdf = await parseBrowserPdfBuffer(buildMinimalPdf({ landscape: false, textOps: "" }));
const unreadablePdfAudit = auditPdfDocument(unreadablePdf, { filename: "unreadable.pdf", pack: uiEffPack });
assert.ok((unreadablePdfAudit.coverageWarnings || []).length >= 1, "Expected coverageWarnings for PDF with font dict and 0 extracted text");

const patBanksDir = path.join(ROOT, "patterns", "banks");
for (const fname of fs.readdirSync(patBanksDir).filter((f) => f.endsWith(".json"))) {
  const bank = JSON.parse(fs.readFileSync(path.join(patBanksDir, fname), "utf8"));
  const candidates = bank.ruleId ? [bank] : Object.values(bank).filter((v) => v && typeof v === "object" && v.ruleId);
  for (const item of candidates) {
    assert.ok(appSource.includes(`"${item.ruleId}"`), `PATTERN_PROBE_META in site/app.js missing ruleId ${item.ruleId}`);
  }
}
const patSampleRes = auditPatterns(
  "在当今快速发展的时代背景下，不可否认的是，这一方案扮演着重要角色，为后续落地奠定了坚实基础。\n",
  { filename: "calque.md", modality: "markdown", banks: PATTERN_BANKS }
);
assert.ok(patSampleRes.findings.some((f) => f.ruleId === "zh-ai-calque-cluster"), "Expected browser pattern-engine to fire zh-ai-calque-cluster");

const stylesCss = fs.readFileSync(path.join(SITE_DIR, "styles.css"), "utf8");
assert.ok(stylesCss.includes(".btn-primary:disabled"), "site/styles.css missing .btn-primary:disabled rule");
assert.ok(stylesCss.includes(".wb-mobile-privacy"), "site/styles.css missing .wb-mobile-privacy rule");
assert.ok(stylesCss.includes(".wb-applied-banner.is-error"), "site/styles.css missing .wb-applied-banner.is-error rule");
for (const legacyStr of ["AI 3rd-order", "Self-Healing Rewrite", "AI 一键去味", "ML alert"]) {
  assert.equal(appSource.includes(legacyStr), false, `site/app.js leaked banned legacy workbench label: ${legacyStr}`);
}
assert.equal(appSource.includes("resolveEffectivePack(packId, PACKS_BY_ID).rules"), true, "buildAgentFixBrief must use resolveEffectivePack");

// 14. Verify aggregated auth modal, GitHub/Google OAuth + OTP UI hooks, Account Hub, and removal of broken legacy register flow
assert.ok(indexHtml.includes('id="auth-modal-backdrop"'), "site/index.html missing #auth-modal-backdrop dialog");
assert.ok(indexHtml.includes('id="cloud-github-btn"'), "site/index.html missing #cloud-github-btn");
assert.ok(indexHtml.includes('id="cloud-google-btn"'), "site/index.html missing #cloud-google-btn");
assert.ok(stylesCss.includes(".auth-modal-backdrop"), "site/styles.css missing .auth-modal-backdrop rule");
assert.ok(appSource.includes("function openAuthModal("), "site/app.js missing openAuthModal()");
assert.ok(appSource.includes("function savePendingWorkbenchIntent("), "site/app.js missing savePendingWorkbenchIntent()");
assert.ok(appSource.includes("function consumePendingWorkbenchIntent("), "site/app.js missing consumePendingWorkbenchIntent()");
assert.ok(appSource.includes("async function renderAccountHub("), "site/app.js missing renderAccountHub()");
assert.ok(appSource.includes("/api/v1/auth/github/start"), "site/app.js missing GitHub OAuth start endpoint");
assert.equal(appSource.includes("/api/v1/auth/register"), false, "site/app.js must not call closed /api/v1/auth/register endpoint");

// 15. Verify SEO/GEO foundation: KB sources, 6 bilingual guides, rule wiki HTML, Atom feeds, JSON-LD, hreflang & link integrity
const kbPath = path.join(ROOT, "docs", "research", "content-kb", "sources.json");
assert.ok(fs.existsSync(kbPath), "Missing docs/research/content-kb/sources.json");
const kbRaw = fs.readFileSync(kbPath, "utf8");
assert.ok(Buffer.byteLength(kbRaw, "utf8") <= 80 * 1024, "sources.json exceeds 80 KB anti-bloat cap");
const kbData = JSON.parse(kbRaw);
assert.equal(kbData.schema, "dislop.kb/1", "Unexpected KB schema");
assert.ok(Array.isArray(kbData.categories) && kbData.categories.length >= 6, "Expected >= 6 KB categories");
assert.ok(Array.isArray(kbData.sources) && kbData.sources.length >= 40 && kbData.sources.length <= 120, "Expected 40..120 verified KB sources");
const kbCatSet = new Set(kbData.categories);
const kbIds = new Set();
const kbUrls = new Set();
for (const srcEntry of kbData.sources) {
  assert.ok(srcEntry.id && !kbIds.has(srcEntry.id), `Duplicate or missing KB id: ${srcEntry.id}`);
  kbIds.add(srcEntry.id);
  assert.ok(kbCatSet.has(srcEntry.category), `Unknown KB category ${srcEntry.category} on ${srcEntry.id}`);
  assert.match(String(srcEntry.verifiedAt || ""), /^\d{4}-\d{2}-\d{2}$/, `Invalid verifiedAt on ${srcEntry.id}`);
  assert.match(srcEntry.url, /^https:\/\//i, `Non-HTTPS KB source URL on ${srcEntry.id}`);
  const parsedUrl = new URL(srcEntry.url);
  const normUrl = `${parsedUrl.hostname.toLowerCase()}${parsedUrl.pathname.replace(/\/+$/, "")}${parsedUrl.search}`;
  assert.equal(kbUrls.has(normUrl), false, `Duplicate normalized URL in sources.json: ${srcEntry.url}`);
  kbUrls.add(normUrl);
}

const guidesDir = path.join(ROOT, "content", "guides");
for (const gf of fs.readdirSync(guidesDir).filter((f) => f.endsWith(".md"))) {
  const gText = fs.readFileSync(path.join(guidesDir, gf), "utf8");
  const m = gText.match(/^sources:\s*(\[[^\n]+\])/m);
  assert.ok(m, `Missing sources array in content/guides/${gf}`);
  for (const sid of JSON.parse(m[1])) {
    assert.ok(kbIds.has(sid), `Guide ${gf} references unknown KB id: ${sid}`);
  }
}

const pkgManifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const pyprojectText = fs.readFileSync(path.join(ROOT, "pyproject.toml"), "utf8");
assert.equal((pkgManifest.files || []).some((p) => p.includes("content/guides") || p.includes("content-kb")), false, "package.json must exclude KB/guides");
assert.equal(pyprojectText.includes("content/guides") || pyprojectText.includes("content-kb"), false, "pyproject.toml must exclude KB/guides");

const robotsText = fs.readFileSync(path.join(SITE_DIR, "robots.txt"), "utf8");
for (const bot of ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Disallow: /api/", "Disallow: /mcp"]) {
  assert.ok(robotsText.includes(bot), `site/robots.txt missing ${bot}`);
}

assert.ok(Buffer.byteLength(llmsTxt, "utf8") <= 2600, `site/llms.txt exceeds 2600-byte budget`);
for (const feedRel of ["feed.xml", "en/feed.xml"]) {
  const feedPath = path.join(SITE_DIR, feedRel);
  assert.ok(fs.existsSync(feedPath), `Missing Atom feed: site/${feedRel}`);
  const feedXml = fs.readFileSync(feedPath, "utf8");
  assert.ok(feedXml.includes('<feed xmlns="http://www.w3.org/2005/Atom">'), `${feedRel} missing Atom root`);
  assert.equal((feedXml.match(/<entry>/g) || []).length, 6, `${feedRel} should list 6 guide entries`);
}

function walkHtmlFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkHtmlFiles(p, out);
    else if (ent.isFile() && ent.name.endsWith(".html") && !ent.name.startsWith("google")) out.push(p);
  }
  return out;
}

const allSiteHtml = walkHtmlFiles(SITE_DIR);
assert.ok(allSiteHtml.length >= 115, `Expected >= 115 static HTML pages, got ${allSiteHtml.length}`);
const seenTitles = new Map();
const seenDescs = new Map();
const hreflangClusters = new Map();

for (const htmlFile of allSiteHtml) {
  const rel = path.relative(SITE_DIR, htmlFile).replace(/\\/g, "/");
  const doc = fs.readFileSync(htmlFile, "utf8");
  const isEnPage = rel.startsWith("en/");

  const titleMatch = doc.match(/<title>([\s\S]*?)<\/title>/i);
  assert.ok(titleMatch && titleMatch[1].trim(), `Missing <title> in ${rel}`);
  assert.equal(seenTitles.has(titleMatch[1].trim()), false, `Duplicate <title> in ${rel} and ${seenTitles.get(titleMatch[1].trim())}`);
  seenTitles.set(titleMatch[1].trim(), rel);

  const descMatch = doc.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  assert.ok(descMatch && descMatch[1].trim(), `Missing meta description in ${rel}`);
  assert.equal(seenDescs.has(descMatch[1].trim()), false, `Duplicate description in ${rel} and ${seenDescs.get(descMatch[1].trim())}`);
  seenDescs.set(descMatch[1].trim(), rel);

  assert.equal((doc.match(/<h1\b/gi) || []).length, 1, `Expected single <h1> in ${rel}`);

  const canonMatch = doc.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i);
  assert.ok(canonMatch, `Missing canonical in ${rel}`);
  const expectedCanon = `https://dislop.com/${rel.replace(/index\.html$/, "")}`;
  assert.equal(canonMatch[1], expectedCanon, `Canonical mismatch in ${rel}`);
  assert.equal(canonMatch[1].includes("?lang="), false, `Canonical must not include ?lang= in ${rel}`);

  const ldMatches = [...doc.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  assert.ok(ldMatches.length >= 1, `Missing JSON-LD in ${rel}`);
  for (const m of ldMatches) {
    const parsed = JSON.parse(m[1]);
    assert.equal(parsed["@context"], "https://schema.org", `Invalid @context in ${rel}`);
    assert.ok(Array.isArray(parsed["@graph"]) && parsed["@graph"].length >= 1, `Empty @graph in ${rel}`);
  }

  if (isEnPage) {
    assert.ok(doc.includes("https://dislop.com/assets/og-card.png"), `EN page missing og-card.png: ${rel}`);
    const stripped = doc.replace(/>中文<\/(?:a|button)>/g, "><").replace(/aria-label="切换为中文"/g, "");
    assert.equal(/[\u4E00-\u9FFF]/.test(stripped), false, `EN page leaked Chinese characters: ${rel}`);
  } else {
    assert.ok(doc.includes("https://dislop.com/assets/og-card-zh.png"), `ZH page missing og-card-zh.png: ${rel}`);
  }

  const zhAlt = doc.match(/<link\s+rel="alternate"\s+hreflang="zh-Hans"\s+href="([^"]*)"/i)?.[1];
  const enAlt = doc.match(/<link\s+rel="alternate"\s+hreflang="en"\s+href="([^"]*)"/i)?.[1];
  const defAlt = doc.match(/<link\s+rel="alternate"\s+hreflang="x-default"\s+href="([^"]*)"/i)?.[1];
  assert.ok(zhAlt && defAlt, `Missing hreflang zh-Hans/x-default in ${rel}`);
  if (enAlt) hreflangClusters.set(canonMatch[1], { zhAlt, enAlt, defAlt });

  const pageDir = path.dirname(htmlFile);
  for (const m of doc.matchAll(/\b(?:href|src)="([^"]+)"/gi)) {
    const raw = m[1].split("#")[0].split("?")[0];
    if (!raw || raw.startsWith("https://") || raw.startsWith("http://") || raw.startsWith("mailto:") || raw.startsWith("data:") || raw.startsWith("/api/") || raw === "/mcp") {
      continue;
    }
    let targetPath = raw.startsWith("/") ? path.join(SITE_DIR, raw.slice(1)) : path.resolve(pageDir, raw);
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      targetPath = path.join(targetPath, "index.html");
    }
    assert.ok(fs.existsSync(targetPath), `Broken internal link in ${rel}: ${m[1]}`);
  }
}

for (const [url, alts] of hreflangClusters.entries()) {
  const peerUrl = url === alts.zhAlt ? alts.enAlt : alts.zhAlt;
  const peer = hreflangClusters.get(peerUrl);
  assert.ok(peer && peer.zhAlt === alts.zhAlt && peer.enAlt === alts.enAlt && peer.defAlt === alts.defAlt, `Reciprocal hreflang mismatch for ${url}`);
}

// 16. Rule exemplar notes, share action bars, offline workbench share hashes & slop-sample form
for (const [ruleRel, ruleId] of [
  ["rules/negation-pivot-frame/index.html", "negation-pivot-frame"],
  ["en/rules/negation-pivot-frame/index.html", "negation-pivot-frame"],
  ["rules/zh-bureaucratic-padding/index.html", "zh-bureaucratic-padding"],
]) {
  const ruleDoc = fs.readFileSync(path.join(SITE_DIR, ruleRel), "utf8");
  assert.ok(ruleDoc.includes('class="rule-note"'), `Expected .rule-note in ${ruleRel}`);
  assert.ok(ruleDoc.includes('class="share-action-bar"'), `Expected .share-action-bar in ${ruleRel}`);
  assert.ok(ruleDoc.includes('data-copy-target="share-cite-payload"') && ruleDoc.includes('id="share-cite-payload"'), `Expected citation copy button in ${ruleRel}`);
  assert.ok(ruleDoc.includes(`#try=${ruleId}`), `Expected #try=${ruleId} link in ${ruleRel}`);
  assert.ok(ruleDoc.includes("template=slop_sample.yml"), `Expected slop_sample.yml link in ${ruleRel}`);
}

for (const guideRel of ["guides/remove-ai-slop-writing/index.html", "en/guides/remove-ai-slop-writing/index.html"]) {
  const guideDoc = fs.readFileSync(path.join(SITE_DIR, guideRel), "utf8");
  assert.ok(guideDoc.includes('class="share-action-bar"'), `Expected .share-action-bar in ${guideRel}`);
  assert.ok(guideDoc.includes('data-copy-target="share-cite-payload"') && guideDoc.includes('id="share-cite-payload"'), `Expected citation copy button in ${guideRel}`);
}

const wbHtml = fs.readFileSync(path.join(SITE_DIR, "index.html"), "utf8");
const wbApp = fs.readFileSync(path.join(SITE_DIR, "app.js"), "utf8");
assert.ok(wbHtml.includes('id="wb-share-link-btn"') && wbHtml.includes('data-i18n="wb.shareLink"'), "Expected #wb-share-link-btn in site/index.html");
for (const sym of ["encodeShareHash", "decodeShareHash", "#try=", "#share="]) {
  assert.ok(wbApp.includes(sym), `Expected ${sym} in site/app.js`);
}

const slopTpl = fs.readFileSync(path.join(ROOT, ".github/ISSUE_TEMPLATE/slop_sample.yml"), "utf8");
assert.ok(slopTpl.trim().length > 100 && /redact|private/i.test(slopTpl), "Expected .github/ISSUE_TEMPLATE/slop_sample.yml with redaction reminder");

console.log(
  `dislop site-test: ok (${totalRules} rules, ${tryRulesChecked} Try demos, ${specimenCount} ZH/EN specimens + 2 hero proofs + 6 cases, ` +
    `${catalog.resources.length} catalog resources, ${sitemapUrlCount} sitemap URLs, ${allSiteHtml.length} static HTML pages, ${demoSlugs.length * 2} demo GIFs, ${checkedJsonBlocks} valid JSON configs, ${htmlI18nKeys.length} bilingual i18n keys, CSS braces balanced, ${AWESOME_DATA.entries.length} Awesome entries & WCAG AA passed)`
);
