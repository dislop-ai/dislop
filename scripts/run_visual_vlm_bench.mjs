#!/usr/bin/env node
/**
 * 3-Arm Visual Anti-Slop Benchmark (`visual-vlm-v1`):
 *   Arm A: Zero-dependency static dislop core + --patterns
 *   Arm B: Bare VLM prompt (no rubric, no static evidence)
 *   Arm C: Calibrated Rubric + Deterministic Static Evidence VLM
 *
 * Usage:
 *   node scripts/run_visual_vlm_bench.mjs --dry-run
 *   ~/.local/bin/with-api --keys GEMINI_API_KEY -- node scripts/run_visual_vlm_bench.mjs --models gemini-3.1-flash-lite,gemini-4-hydrogen --repeats 2
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import {
  auditImageDocument,
  auditPdfDocument,
  auditText,
  resolveEffectivePack,
} from "../src/core.mjs";
import { parseImageBuffer, parsePdfBuffer } from "../src/binary-node.mjs";
import { auditPatterns } from "../src/pattern-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATASET_PATH = path.join(ROOT, "benchmarks", "datasets", "visual-vlm-v1.json");
const DEFAULT_OUT = path.join(ROOT, "benchmarks", "results", "visual-vlm-benchmark-latest.json");

export function assertLiveNetworkAllowed() {
  if (process.env.DISLOP_TEST_MODE === "1" || process.env.NODE_TEST_CONTEXT) {
    throw new Error("Live VLM benchmark network calls are blocked in test mode (DISLOP_TEST_MODE=1).");
  }
}

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    smoke: false,
    models: ["gemini-3.1-flash-lite"],
    repeats: 2,
    threshold: 50,
    out: DEFAULT_OUT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--smoke") opts.smoke = true;
    else if (a === "--models" && argv[i + 1]) {
      opts.models = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--repeats" && argv[i + 1]) {
      opts.repeats = Math.max(1, Math.min(5, Number(argv[++i]) || 2));
    } else if (a === "--threshold" && argv[i + 1]) {
      opts.threshold = Math.max(1, Math.min(99, Number(argv[++i]) || 50));
    } else if (a === "--out" && argv[i + 1]) {
      opts.out = path.resolve(process.cwd(), argv[++i]);
    }
  }
  return opts;
}

function loadPacksAndBanks() {
  const packs = {};
  for (const ent of fs.readdirSync(path.join(ROOT, "packs"), { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const p = path.join(ROOT, "packs", ent.name, "pack.json");
    if (fs.existsSync(p)) {
      const d = JSON.parse(fs.readFileSync(p, "utf8"));
      packs[d.id] = d;
    }
  }
  const banks = {};
  for (const ent of fs.readdirSync(path.join(ROOT, "patterns", "banks"), { withFileTypes: true })) {
    if (ent.isFile() && ent.name.endsWith(".json")) {
      const d = JSON.parse(fs.readFileSync(path.join(ROOT, "patterns", "banks", ent.name), "utf8"));
      banks[d.id || ent.name.replace(/\.json$/, "")] = d;
    }
  }
  return { packs, banks };
}

function pdfEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function synthesizePdf(spec) {
  const objs = [];
  const addObj = (dict, streamBuf = null) => {
    const num = objs.length + 1;
    objs.push({ num, dict, streamBuf });
    return num;
  };
  const catNum = addObj("");
  const pagesNum = addObj("");
  const fontNum = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageNums = [];

  for (const p of spec.pages || []) {
    const ops = [];
    for (const r of p.rects || []) {
      const c = r.rgb || [0.95, 0.95, 0.95];
      ops.push(`${c[0]} ${c[1]} ${c[2]} rg ${r.x} ${r.y} ${r.w} ${r.h} re f`);
    }
    for (const l of p.lines || []) {
      const c = l.rgb || [0.7, 0.7, 0.7];
      ops.push(`${l.width || 1} w ${c[0]} ${c[1]} ${c[2]} RG ${l.x1} ${l.y1} m ${l.x2} ${l.y2} l S`);
    }
    for (const run of p.fontRuns || []) {
      const c = run.rgb || [0.1, 0.1, 0.1];
      ops.push(`BT ${c[0]} ${c[1]} ${c[2]} rg /F1 ${run.size || 12} Tf 1 0 0 1 ${run.x || 48} ${run.y || 480} Tm (${pdfEscape(run.text || "")}) Tj ET`);
    }
    const streamPayload = deflateSync(Buffer.from(ops.join("\n") + "\n", "latin1"));
    const contentNum = addObj(`<< /Filter /FlateDecode /Length ${streamPayload.length} >>`, streamPayload);
    const w = p.width || 960;
    const h = p.height || 540;
    pageNums.push(
      addObj(`<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 ${fontNum} 0 R >> >> /Contents ${contentNum} 0 R >>`)
    );
  }
  objs[catNum - 1].dict = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
  objs[pagesNum - 1].dict = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNums.length} >>`;
  const parts = [Buffer.from("%PDF-1.4\n", "latin1")];
  for (const o of objs) {
    if (o.streamBuf) {
      parts.push(Buffer.from(`${o.num} 0 obj\n${o.dict}\nstream\n`, "latin1"), o.streamBuf, Buffer.from("\nendstream\nendobj\n", "latin1"));
    } else {
      parts.push(Buffer.from(`${o.num} 0 obj\n${o.dict}\nendobj\n`, "latin1"));
    }
  }
  parts.push(Buffer.from(`trailer\n<< /Root ${catNum} 0 R >>\n%%EOF\n`, "latin1"));
  return Buffer.concat(parts);
}

function renderCasesToPng(cases, tmpDir) {
  const jobs = [];
  const artifacts = new Map();

  for (const c of cases) {
    const outPng = path.join(tmpDir, `${c.id}.png`);
    if (c.assetPath) {
      artifacts.set(c.id, { pngPath: path.join(ROOT, c.assetPath), rawPdfBuf: null });
    } else if (c.html || c.svg) {
      const htmlPath = path.join(tmpDir, `${c.id}.html`);
      const doc = c.html
        ? c.html
        : `<!doctype html><html><body style="margin:0;padding:0;background:#fff">${c.svg}</body></html>`;
      fs.writeFileSync(htmlPath, doc, "utf8");
      jobs.push({
        id: c.id,
        htmlUrl: `file://${htmlPath}`,
        outPng,
        width: c.viewport?.width || 1280,
        height: c.viewport?.height || 800,
      });
      artifacts.set(c.id, { pngPath: outPng, rawPdfBuf: null });
    } else if (c.pdfSpec) {
      const pdfBuf = synthesizePdf(c.pdfSpec);
      const pdfPath = path.join(tmpDir, `${c.id}.pdf`);
      const outPrefix = path.join(tmpDir, c.id);
      fs.writeFileSync(pdfPath, pdfBuf);
      const res = spawnSync("pdftoppm", ["-png", "-r", "150", "-singlefile", pdfPath, outPrefix], { encoding: "utf8" });
      if (res.status !== 0 || !fs.existsSync(outPng)) {
        throw new Error(`pdftoppm failed for ${c.id}: ${res.stderr || res.stdout}`);
      }
      artifacts.set(c.id, { pngPath: outPng, rawPdfBuf: pdfBuf });
    }
  }

  if (jobs.length > 0) {
    const manifestPath = path.join(tmpDir, "render-jobs.json");
    fs.writeFileSync(manifestPath, JSON.stringify({ jobs }), "utf8");
    const pyScript = [
      "import json, sys",
      "from playwright.sync_api import sync_playwright",
      "jobs = json.load(open(sys.argv[1]))['jobs']",
      "with sync_playwright() as p:",
      "    b = p.chromium.launch()",
      "    page = b.new_page()",
      "    for j in jobs:",
      "        page.set_viewport_size({'width': j['width'], 'height': j['height']})",
      "        page.goto(j['htmlUrl'])",
      "        page.wait_for_timeout(80)",
      "        page.screenshot(path=j['outPng'])",
      "    b.close()",
    ].join("\n");
    const res = spawnSync("python3", ["-c", pyScript, manifestPath], { encoding: "utf8" });
    if (res.status !== 0) {
      throw new Error(`Playwright batch render failed: ${res.stderr || res.stdout}`);
    }
  }

  return artifacts;
}

function runArmA(c, pngBuf, rawPdfBuf, packs, banks) {
  let findings = [];
  const pack = resolveEffectivePack("deck-and-ui", packs);
  if (c.kind === "poster" || c.assetPath) {
    findings = auditImageDocument(parseImageBuffer(pngBuf), { filename: c.filename, pack }).findings || [];
  } else if (c.pdfSpec) {
    findings = auditPdfDocument(parsePdfBuffer(rawPdfBuf), { filename: c.filename, pack }).findings || [];
  } else if (c.svg) {
    const r1 = auditText(c.svg, { filename: c.filename, modality: "svg", pack });
    const r2 = auditPatterns(c.svg, { filename: c.filename, modality: "svg", banks });
    findings = [...r1.findings, ...r2.findings];
  } else if (c.html) {
    const r1 = auditText(c.html, { filename: c.filename, modality: "html", pack });
    const r2 = auditPatterns(c.html, { filename: c.filename, modality: "html", banks });
    findings = [...r1.findings, ...r2.findings];
  }
  const ruleIds = [...new Set(findings.map((f) => f.ruleId))];
  return {
    findingCount: findings.length,
    ruleIds,
    detected: findings.length > 0,
    staticSummary: { findingCount: findings.length, ruleIds },
  };
}

function buildArmBPrompt(c) {
  return [
    `Inspect this rendered ${c.targetType} screenshot (${c.filename}).`,
    "Rate whether it shows AI-generated design slop or poor layout quality from 0 (completely clean, human-crafted) to 100 (heavy AI template/visual slop).",
    'Output strict JSON only: {"visualSlopScore": 0, "level": "low|medium|high", "verdict": "one short sentence"}',
  ].join("\n");
}

function buildArmCPrompt(c, armA) {
  return [
    `You are dislop's multimodal visual anti-slop auditor inspecting a rendered ${c.targetType} (${c.filename}).`,
    "Score 0-100 across 5 visual dimensions: (1) template cliché, (2) hierarchy & density, (3) chrome & decorative bloat, (4) diagram/slide craft, (5) contrast & legibility.",
    "Flag BOTH obvious Gen-1 slop (neon purple-pink gradients, blur orbs, pill/emoji badge soup, word walls, overlapping labels) AND subtle Gen-2 / layout slop: warm cream #FAF8F5 + terracotta + serif-italic + tracked uppercase + numbered 01/02/03 cards; symmetrical empty 3-pillar boilerplate slides; competing identical primary CTA buttons in one toolbar; unreadable faint micro-labels; inconsistent padding; meaningless flat chart bars; or floating decorative blobs.",
    'Calibrate strictly against false positives: crisp minimal changelogs/status UIs with tabular numbers, single-column warm-paper editorial essays without marketing cards, clean executive data tables, portrait technical memos, and aligned monochrome diagrams MUST score <= 25 ("low").',
    `Deterministic pre-scan signals from local static rules: ${JSON.stringify(armA.staticSummary)}. Note: findingCount=0 only clears syntax/metadata defects and does NOT prove good layout or aesthetics.`,
    'Output strict JSON only: {"visualSlopScore": 0, "level": "low|medium|high", "verdict": "one concrete sentence naming visual evidence", "issues": ["short issue strings"]}',
  ].join("\n");
}

function parseVlmJson(rawText) {
  const clean = String(rawText || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  const obj = JSON.parse(s !== -1 && e > s ? clean.slice(s, e + 1) : clean);
  if (typeof obj.visualSlopScore !== "number" || !Number.isFinite(obj.visualSlopScore)) {
    throw new Error(`Missing visualSlopScore in VLM JSON: ${clean.slice(0, 140)}`);
  }
  return {
    visualSlopScore: Math.max(0, Math.min(100, Math.round(obj.visualSlopScore))),
    level: ["low", "medium", "high"].includes(obj.level) ? obj.level : obj.visualSlopScore >= 70 ? "high" : obj.visualSlopScore >= 40 ? "medium" : "low",
    verdict: String(obj.verdict || "").trim().slice(0, 180),
  };
}

async function callGeminiVision({ model, prompt, base64Png, apiKey }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const t0 = performance.now();
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/png", data: base64Png } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(45000),
  });
  const latencyMs = Math.round(performance.now() - t0);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Gemini HTTP ${resp.status} (${model}): ${data?.error?.message || "request failed"}`);
  }
  const cand = data?.candidates?.[0];
  const textParts = (cand?.content?.parts || []).filter((p) => typeof p.text === "string").map((p) => p.text).join("");
  if (!textParts) {
    throw new Error(`Empty response from ${model} (finishReason=${cand?.finishReason || "unknown"})`);
  }
  const parsed = parseVlmJson(textParts);
  const usage = data?.usageMetadata || {};
  return {
    ...parsed,
    latencyMs,
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
  };
}

function summarizeArm(records, threshold) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let sbHit = 0;
  let sbTotal = 0;
  const slopScores = [];
  const cleanScores = [];
  const latList = [];
  let totalTokens = 0;

  for (const r of records) {
    const pos = typeof r.visualSlopScore === "number" ? r.visualSlopScore >= threshold : Boolean(r.detected);
    if (r.label === "slop") {
      if (pos) tp += 1;
      else fn += 1;
      if (r.staticBlind) {
        sbTotal += 1;
        if (pos) sbHit += 1;
      }
      if (typeof r.visualSlopScore === "number") slopScores.push(r.visualSlopScore);
    } else {
      if (pos) fp += 1;
      else tn += 1;
      if (typeof r.visualSlopScore === "number") cleanScores.push(r.visualSlopScore);
    }
    if (typeof r.latencyMs === "number") latList.push(r.latencyMs);
    totalTokens += (r.inputTokens || 0) + (r.outputTokens || 0);
  }

  const p = tp + fp > 0 ? tp / (tp + fp) : 1;
  const rec = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = p + rec > 0 ? (2 * p * rec) / (p + rec) : 0;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
  const mean = (arr) => (arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null);
  const meanSlop = mean(slopScores);
  const meanClean = mean(cleanScores);

  return {
    total: records.length,
    tp,
    fp,
    tn,
    fn,
    precision: Number((p * 100).toFixed(1)),
    recall: Number((rec * 100).toFixed(1)),
    f1: Number((f1 * 100).toFixed(1)),
    fpr: Number((fpr * 100).toFixed(1)),
    staticBlindRecall: sbTotal > 0 ? Number(((sbHit / sbTotal) * 100).toFixed(1)) : null,
    meanSlopScore: meanSlop,
    meanCleanScore: meanClean,
    scoreGap: meanSlop !== null && meanClean !== null ? Number((meanSlop - meanClean).toFixed(1)) : null,
    avgLatencyMs: latList.length ? Math.round(latList.reduce((a, b) => a + b, 0) / latList.length) : 0,
    totalTokens,
  };
}

function computeRepeatMad(runs) {
  const byCase = new Map();
  for (const r of runs) {
    const arr = byCase.get(r.id) || [];
    arr.push(r.visualSlopScore);
    byCase.set(r.id, arr);
  }
  const diffs = [];
  for (const scores of byCase.values()) {
    if (scores.length >= 2) {
      const m = scores.reduce((a, b) => a + b, 0) / scores.length;
      for (const s of scores) diffs.push(Math.abs(s - m));
    }
  }
  return diffs.length ? Number((diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2)) : 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, "utf8"));
  const cases = opts.smoke
    ? dataset.cases.filter((c) => ["vlm-web-slop-subtle-layout", "vlm-web-clean-warm-essay"].includes(c.id))
    : dataset.cases;

  const { packs, banks } = loadPacksAndBanks();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dislop-vlm-"));

  try {
    const artifacts = renderCasesToPng(cases, tmpDir);
    const armAResults = new Map();
    const armARecords = [];
    const imagePayloads = new Map();

    for (const c of cases) {
      const art = artifacts.get(c.id);
      const pngBuf = fs.readFileSync(art.pngPath);
      imagePayloads.set(c.id, { base64Png: pngBuf.toString("base64"), bytes: pngBuf.length });
      const armA = runArmA(c, pngBuf, art.rawPdfBuf, packs, banks);
      armAResults.set(c.id, armA);
      armARecords.push({ id: c.id, label: c.label, staticBlind: Boolean(c.staticBlind), ...armA });
    }

    const armASummary = summarizeArm(armARecords, opts.threshold);
    console.log(`visual-vlm-v1 (${cases.length} rendered PNGs):`);
    console.log(
      `  armA_static_only         P=${armASummary.precision}% R=${armASummary.recall}% F1=${armASummary.f1}% FPR=${armASummary.fpr}% staticBlindR=${armASummary.staticBlindRecall ?? "n/a"}%`
    );

    if (opts.dryRun) {
      for (const r of armARecords) {
        const exp = r.label === "slop" && !r.staticBlind;
        const okMark = r.label === "slop" ? (r.staticBlind ? (!r.detected ? "blind-ok" : "UNEXPECTED-HIT") : r.detected ? "hit-ok" : "MISS") : !r.detected ? "clean-ok" : "FP";
        console.log(`    ${r.id.padEnd(28)} [${okMark}] bytes=${imagePayloads.get(r.id).bytes} rules=${r.ruleIds.join(",") || "none"}`);
      }
      return;
    }

    assertLiveNetworkAllowed();
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY / GOOGLE_API_KEY. Run via ~/.local/bin/with-api --keys GEMINI_API_KEY -- ...");
    }

    const modelsReport = {};
    for (const model of opts.models) {
      const bareRuns = [];
      const rubricRuns = [];
      for (let rep = 1; rep <= opts.repeats; rep += 1) {
        for (const c of cases) {
          const img = imagePayloads.get(c.id);
          const armA = armAResults.get(c.id);
          const bOut = await callGeminiVision({
            model,
            prompt: buildArmBPrompt(c),
            base64Png: img.base64Png,
            apiKey,
          });
          bareRuns.push({ repeat: rep, id: c.id, label: c.label, staticBlind: Boolean(c.staticBlind), group: c.group, ...bOut });

          const cOut = await callGeminiVision({
            model,
            prompt: buildArmCPrompt(c, armA),
            base64Png: img.base64Png,
            apiKey,
          });
          rubricRuns.push({ repeat: rep, id: c.id, label: c.label, staticBlind: Boolean(c.staticBlind), group: c.group, ...cOut });
        }
      }

      const armBSum = { ...summarizeArm(bareRuns, opts.threshold), repeatMad: computeRepeatMad(bareRuns) };
      const armCSum = { ...summarizeArm(rubricRuns, opts.threshold), repeatMad: computeRepeatMad(rubricRuns) };
      modelsReport[model] = { armB_vlm_bare: armBSum, armC_vlm_rubric_evidence: armCSum, bareRuns, rubricRuns };

      console.log(`  [${model} x${opts.repeats}]`);
      console.log(
        `    armB_vlm_bare          P=${armBSum.precision}% R=${armBSum.recall}% F1=${armBSum.f1}% FPR=${armBSum.fpr}% staticBlindR=${armBSum.staticBlindRecall ?? "n/a"}% gap=${armBSum.scoreGap} mad=${armBSum.repeatMad}`
      );
      console.log(
        `    armC_rubric_evidence   P=${armCSum.precision}% R=${armCSum.recall}% F1=${armCSum.f1}% FPR=${armCSum.fpr}% staticBlindR=${armCSum.staticBlindRecall ?? "n/a"}% gap=${armCSum.scoreGap} mad=${armCSum.repeatMad}`
      );
    }

    const outDoc = {
      schema: "dislop.visual-vlm-bench-result/1",
      generatedAt: new Date().toISOString(),
      dataset: "benchmarks/datasets/visual-vlm-v1.json",
      totalCases: cases.length,
      repeats: opts.repeats,
      threshold: opts.threshold,
      armA_static_only: { summary: armASummary, cases: armARecords },
      models: modelsReport,
    };
    if (!opts.smoke) {
      fs.mkdirSync(path.dirname(opts.out), { recursive: true });
      fs.writeFileSync(opts.out, JSON.stringify(outDoc, null, 2) + "\n", "utf8");
      console.log(`Saved ${path.relative(ROOT, opts.out)}`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
