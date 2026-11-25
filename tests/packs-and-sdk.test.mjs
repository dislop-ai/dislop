import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveLayeredConfig } from "../src/kernel/config.mjs";
import { parseDocumentFile, parseDocumentText } from "../src/kernel/document-model.mjs";
import { buildZipArchive } from "../src/kernel/ooxml-binary.mjs";
import {
  compileMarkdownPack,
  listBuiltinPackIds,
  loadSinglePack,
  resolveActivePacks,
  runDeterministicPackChecks,
} from "../src/kernel/pack-loader.mjs";
import { runDocumentPipeline } from "../src/kernel/pipeline.mjs";
import { collectPackPromptRules } from "../src/kernel/prompt-assembler.mjs";
import { definePack, definePackScripts } from "dislop/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

test("definePack & definePackScripts validate inputs and all 11 separated Packs resolve cleanly", async () => {
  assert.throws(() => definePack(null), TypeError);
  assert.throws(() => definePack({ name: "" }), TypeError);
  assert.throws(() => definePackScripts(null), TypeError);

  const ids = listBuiltinPackIds();
  assert.deepEqual(ids, [
    "common/artifact-qa",
    "common/slide-deck",
    "common/web-ui",
    "en/artifact-qa",
    "en/prose",
    "en/slide-deck",
    "en/web-ui",
    "zh/artifact-qa",
    "zh/prose",
    "zh/slide-deck",
    "zh/web-ui",
  ]);

  const enDoc = parseDocumentText("Queue depth stayed under 20ms.", "spec.md", "md");
  const enPacks = await resolveActivePacks(enDoc);
  assert.deepEqual(
    enPacks.map((p) => p.name),
    ["common/artifact-qa", "en/artifact-qa", "en/prose"],
  );

  // Verify EVERY built-in pack physically separates `pack.json`, `scripts/`, and `prompts/`
  for (const id of ids) {
    const packDir = path.join(REPO_ROOT, "packs", ...id.split("/"));
    assert.ok(fs.existsSync(path.join(packDir, "pack.json")), `${id} missing pack.json`);
    assert.ok(fs.existsSync(path.join(packDir, "scripts", "index.mjs")), `${id} missing scripts/index.mjs`);
    assert.ok(fs.existsSync(path.join(packDir, "prompts", "rules.md")), `${id} missing prompts/rules.md`);
    assert.equal(fs.existsSync(path.join(packDir, "index.mjs")), false, `${id} should not have monolithic index.mjs`);
  }
});

test("Stage-gated lazy loading: admission loads 0 files, deterministic runs load scripts/ ONLY (0 prompts/), and LLM runs load prompts/ on demand", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dislop-lazy-pack-"));
  try {
    // 1. Metadata admission (`loadSinglePack` / `resolveActivePacks`) touches NEITHER scripts/ NOR prompts/
    const handle = await loadSinglePack("en/web-ui");
    assert.equal(handle.hasScripts, true);
    assert.equal(handle.hasPrompts, true);
    assert.equal(handle.loadStats.scriptsLoaded, false);
    assert.equal(handle.loadStats.promptsLoaded, false);

    // 2. Deterministic pipeline (`--no-llm` or default `routing: "local"` without local LLM) loads `scripts/` ONLY
    const mdPath = path.join(tmpDir, "note.md");
    fs.writeFileSync(mdPath, "Queue latency stayed at 11ms.\n", "utf8");
    const detCfg = resolveLayeredConfig({
      cwd: tmpDir,
      env: { DISLOP_CONFIG_DIR: tmpDir },
      cliFlags: { noLlm: true },
    });
    const detRes = await runDocumentPipeline({
      filePath: mdPath,
      config: detCfg,
      route: { tier: "none", engineLabel: "deterministic", execute: null },
      cwd: tmpDir,
    });
    for (const p of detRes.activePacks) {
      assert.equal(p.loadStats.scriptsLoaded, true, `${p.name} scripts/ should load in Step 3`);
      assert.equal(p.loadStats.promptsLoaded, false, `${p.name} prompts/ MUST NOT load when LLM is inactive`);
    }

    // 3. Active LLM route triggers on-demand `prompts/` loading in Step 4
    const llmCfg = resolveLayeredConfig({
      cwd: tmpDir,
      env: { DISLOP_CONFIG_DIR: tmpDir },
      cliFlags: { engine: "byok" },
    });
    const llmRes = await runDocumentPipeline({
      filePath: mdPath,
      config: llmCfg,
      route: {
        tier: "byok",
        engineLabel: "byok:mock",
        maxInputTokens: 8000,
        execute: async () => ({ documentToneAnchor: "concise", items: [] }),
      },
      cwd: tmpDir,
    });
    for (const p of llmRes.activePacks) {
      assert.equal(p.loadStats.scriptsLoaded, true);
      assert.equal(p.loadStats.promptsLoaded, true, `${p.name} prompts/ should load when LLM route executes`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Declarative Markdown Pack (.pack.md) compiles frontmatter & rules into lazy prompt rules", async () => {
  const mdPack = [
    "---",
    "name: academic-en",
    "languages: [en]",
    "formats: [md, txt, docx]",
    "rules:",
    "  - id: throat-clearing",
    "    priority: strong",
    "  - id: vague-attribution",
    "    priority: moderate",
    "---",
    "",
    '1. **throat-clearing**: Fires when a paragraph opens with a meta-announcement ("In this section, we will discuss...") already covered by the heading. Fix suggestion: remove the meta-announcement.',
    '2. **vague-attribution**: Fires on unanchored claims ("Studies have shown") lacking a citation. Fix suggestion: cite the specific study or dataset.',
  ].join("\n");

  const pack = compileMarkdownPack(mdPack, "academic-en.pack.md");
  assert.equal(pack.name, "academic-en");
  assert.deepEqual(pack.languages, ["en"]);
  assert.deepEqual(pack.formats, ["md", "txt", "docx"]);

  const doc = parseDocumentText("Sample text.", "paper.md", "md");
  const { rules } = await collectPackPromptRules(doc, [pack]);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].ruleId, "academic-en/throat-clearing");
  assert.equal(rules[0].defaultPriority, "strong");
  assert.match(rules[1].instruction, /specific study or dataset/);
});

test("High-restraint en/prose + en/artifact-qa + common/artifact-qa catch defects & scaffolding without nagging on abstract verbs", async () => {
  const cleanDoc = parseDocumentText(
    "The new worker streamlines deployment latency across regions. Unfilled `[TODO]` tokens fail artifact checks.",
    "clean.md",
    "md",
  );
  const packs = await resolveActivePacks(cleanDoc);
  const cleanFindings = await runDeterministicPackChecks(cleanDoc, packs);
  assert.equal(cleanFindings.length, 0);

  const sloppyDoc = parseDocumentText(
    [
      "Certainly! Here is your release summary.",
      "",
      "It is worth noting that batch exports finish in 12 minutes for [TODO] rows at [Company Name].",
      "",
      "This isn't just a patch — it's a reliability milestone.",
    ].join("\n"),
    "sloppy.md",
    "md",
  );
  const sloppyFindings = await runDeterministicPackChecks(sloppyDoc, packs);
  const ruleIds = sloppyFindings.map((f) => f.ruleId);

  assert.ok(ruleIds.includes("en/artifact-qa/chatbot-artifact"));
  assert.ok(ruleIds.includes("en/artifact-qa/unfilled-placeholder"));
  assert.ok(ruleIds.includes("common/artifact-qa/unfilled-placeholder"));
  assert.ok(ruleIds.includes("en/prose/throat-clearing"));
  assert.ok(ruleIds.includes("en/prose/unprompted-negation"));
});

test("Separated scripts/ and prompts/ across web-ui and slide-deck (en & zh) execute checks and interpolate telemetry hints", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dislop-lang-packs-"));
  try {
    const enHtml = parseDocumentText(
      [
        `<section>`,
        `  <span>AI-Powered Analytics</span>`,
        `  <h1>Supercharge Your Workflow</h1>`,
        `  <p>Short description goes here</p>`,
        `  <h3>🚀 Fast Setup</h3>`,
        `  <h3>🔒 Strong Auth</h3>`,
        `  <h3>⚡ Live Sync</h3>`,
        `  <blockquote>This platform completely transformed how our team works.</blockquote>`,
        `</section>`,
      ].join("\n"),
      "landing-en.html",
      "html",
    );
    const enWebPacks = await resolveActivePacks(enHtml);
    const enWebFindings = await runDeterministicPackChecks(enHtml, enWebPacks);
    const enWebRuleIds = enWebFindings.map((f) => f.ruleId);
    assert.ok(enWebRuleIds.includes("en/web-ui/placeholder-ui-copy"));
    assert.ok(enWebRuleIds.includes("en/web-ui/prompt-echo-copy"));
    assert.ok(enWebRuleIds.includes("en/web-ui/emoji-feature-grid"));
    assert.ok(enWebRuleIds.includes("en/web-ui/synthetic-testimonial-cliche"));

    const enWebPrompts = await collectPackPromptRules(enHtml, enWebPacks);
    assert.ok(enWebPrompts.rules.some((r) => r.ruleId === "common/artifact-qa/unchosen-draft-options"));
    assert.ok(enWebPrompts.rules.some((r) => r.ruleId === "en/artifact-qa/implicit-assistant-framing"));
    assert.ok(enWebPrompts.rules.some((r) => r.ruleId === "common/web-ui/fabricated-stat-tile"));
    assert.ok(enWebPrompts.rules.some((r) => r.ruleId === "en/web-ui/redundant-feature-card-echo"));
    assert.ok(enWebPrompts.roleHints.some((h) => h.includes("UI telemetry:")));

    const zhPptxPath = path.join(tmpDir, "zh-deck.pptx");
    fs.writeFileSync(
      zhPptxPath,
      buildZipArchive({
        "ppt/slides/slide1.xml": [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:txBody>`,
          `<a:p><a:r><a:t>顶层设计与生态赋能</a:t></a:r></a:p>`,
          `<a:p><a:r><a:t>[配图建议：展示三季度系统吞吐对比柱状图]</a:t></a:r></a:p>`,
          `<a:p><a:r><a:t>单击此处添加副标题</a:t></a:r></a:p>`,
          `<a:p><a:r><a:t>携手并进，共创辉煌未来！</a:t></a:r></a:p>`,
          `</p:txBody></p:sld>`,
        ].join(""),
      }),
    );
    const zhPptxDoc = parseDocumentFile(zhPptxPath);
    const zhDeckPacks = await resolveActivePacks(zhPptxDoc);
    const zhDeckFindings = await runDeterministicPackChecks(zhPptxDoc, zhDeckPacks);
    const zhDeckRules = zhDeckFindings.map((f) => f.ruleId);
    assert.ok(zhDeckRules.includes("zh/slide-deck/buzzword-slide-headline"));
    assert.ok(zhDeckRules.includes("zh/slide-deck/leaked-slide-directive"));
    assert.ok(zhDeckRules.includes("zh/artifact-qa/unfilled-placeholder"));
    assert.ok(zhDeckRules.includes("zh/slide-deck/closing-slide-slogan"));

    const zhDeckPrompts = await collectPackPromptRules(zhPptxDoc, zhDeckPacks);
    assert.ok(zhDeckPrompts.rules.some((r) => r.ruleId === "common/slide-deck/repetitive-slide-skeleton"));
    assert.ok(zhDeckPrompts.rules.some((r) => r.ruleId === "zh/slide-deck/slide-prose-dump"));
    assert.ok(zhDeckPrompts.rules.some((r) => r.ruleId === "zh/artifact-qa/disguised-placeholder-prose"));
    assert.ok(zhDeckPrompts.roleHints.some((h) => h.includes("Deck structure (1 slides)")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Strict single-language separation across all pack.json, scripts/*.mjs, and prompts/*.md files", () => {
  const cjkRe = /[\u4e00-\u9fff]/;

  function scanDirNoCjk(relDir) {
    const absDir = path.join(REPO_ROOT, relDir);
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const full = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        scanDirNoCjk(path.join(relDir, entry.name));
      } else if (/\.(?:mjs|js|md|json)$/.test(entry.name)) {
        const content = fs.readFileSync(full, "utf8");
        assert.equal(
          cjkRe.test(content),
          false,
          `Found disallowed CJK character inside pure-English path '${path.join(relDir, entry.name)}'`,
        );
      }
    }
  }

  scanDirNoCjk("src");
  scanDirNoCjk("packs/common");
  scanDirNoCjk("packs/en");

  for (const topDoc of ["README.md", "PRODUCT.md", "AGENTS.md", "docs/MIGRATION-TODO.md"]) {
    const content = fs.readFileSync(path.join(REPO_ROOT, topDoc), "utf8");
    assert.equal(cjkRe.test(content), false, `${topDoc} must remain strictly English`);
  }

  for (const zhScenario of ["artifact-qa", "prose", "slide-deck", "web-ui"]) {
    for (const subFile of ["pack.json", "scripts/index.mjs", "prompts/rules.md"]) {
      const zhPath = path.join(REPO_ROOT, "packs", "zh", zhScenario, subFile);
      const zhContent = fs.readFileSync(zhPath, "utf8");
      assert.equal(cjkRe.test(zhContent), true, `packs/zh/${zhScenario}/${subFile} must contain native Chinese`);
    }
  }

  // Verify no Pack prompt file leaks internal kernel schema keys or boundary tags
  const leakedSchemaRe =
    /\b(?:actionType|fixSafety|suggestedReplacement|rewritePrompt|targetId|dislop\.report)\b|<\/?(?:pack_rules|untrusted_document|context_readonly)\b/i;
  for (const id of listBuiltinPackIds()) {
    const promptPath = path.join(REPO_ROOT, "packs", ...id.split("/"), "prompts", "rules.md");
    const promptText = fs.readFileSync(promptPath, "utf8");
    assert.equal(
      leakedSchemaRe.test(promptText),
      false,
      `Pack prompt '${id}/prompts/rules.md' must only describe triggers & fix suggestions without kernel schema keys`,
    );
  }
});
