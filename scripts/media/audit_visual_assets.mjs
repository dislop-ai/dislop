#!/usr/bin/env node
/**
 * 3-Layer Visual Dogfood Audit for dislop visual & animated deliverables:
 *   Layer 1: Offline deterministic `dislop` (`deck-and-ui` + `--patterns`) across
 *            `assets/` (Node & Python parity) + generated virtual-clock demo HTMLs.
 *   Layer 2: Playwright Chromium SVG `getBBox()` geometry, strike/underline alignment,
 *            inline phrase gap, CJK serif priority, and architectural `rx <= 4px` audit
 *            on `assets/banner-*.svg` and `assets/og-card*.svg`.
 *   Layer 3: Optional (`--vlm`) calibrated multimodal `Arm C` audit via Gemini Vision API
 *            on rendered banners, OG cards, demo posters, and quantized GIF end frames.
 *
 * Usage:
 *   node scripts/media/audit_visual_assets.mjs --assert
 *   ~/.local/bin/with-api --keys GEMINI_API_KEY -- node scripts/media/audit_visual_assets.mjs --vlm --model gemini-3.5-flash --assert
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditImageDocument,
  auditText,
  resolveEffectivePack,
} from "../../src/core.mjs";
import { parseImageBuffer } from "../../src/binary-node.mjs";
import { auditPatterns } from "../../src/pattern-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ASSETS_DIR = path.join(ROOT, "assets");
const DEFAULT_OUT = path.join(__dirname, "visual-dogfood-audit-latest.json");

const IMAGE_EXTS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const RASTER_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const BRAND_SVGS = [
  "assets/banner-light.svg",
  "assets/banner-dark.svg",
  "assets/banner-zh-light.svg",
  "assets/banner-zh-dark.svg",
  "assets/og-card.svg",
  "assets/og-card-zh.svg",
];

function assertLiveNetworkAllowed() {
  if (process.env.DISLOP_TEST_MODE === "1" || process.env.NODE_TEST_CONTEXT) {
    throw new Error("Live VLM audit network calls are blocked in test mode (DISLOP_TEST_MODE=1).");
  }
}

function parseArgs(argv) {
  const opts = {
    vlm: false,
    model: "gemini-3.5-flash",
    threshold: 40,
    assert: false,
    skipPy: false,
    concurrency: 4,
    out: DEFAULT_OUT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--vlm") opts.vlm = true;
    else if (a === "--assert") opts.assert = true;
    else if (a === "--skip-py") opts.skipPy = true;
    else if (a === "--model" && argv[i + 1]) opts.model = argv[++i];
    else if (a === "--threshold" && argv[i + 1]) {
      opts.threshold = Math.max(1, Math.min(99, Number(argv[++i]) || 40));
    } else if (a === "--concurrency" && argv[i + 1]) {
      opts.concurrency = Math.max(1, Math.min(8, Number(argv[++i]) || 4));
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

function walkFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkFiles(full, out);
    } else if (ent.isFile() && IMAGE_EXTS.has(path.extname(ent.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function runLayer1Assets(packs, banks, { skipPy }) {
  const effectivePack = resolveEffectivePack("deck-and-ui", packs);
  const files = walkFiles(ASSETS_DIR).sort();
  const nodeRecords = [];

  for (const absPath of files) {
    const rel = path.relative(ROOT, absPath).replace(/\\/g, "/");
    const ext = path.extname(absPath).toLowerCase();
    let findings = [];
    let metadata = null;
    if (ext === ".svg") {
      const raw = fs.readFileSync(absPath, "utf8");
      const r1 = auditText(raw, { filename: rel, modality: "svg", pack: effectivePack });
      const r2 = auditPatterns(raw, { filename: rel, modality: "svg", banks });
      findings = [...(r1.findings || []), ...(r2.findings || [])];
    } else if (RASTER_EXTS.has(ext)) {
      const parsed = parseImageBuffer(fs.readFileSync(absPath));
      metadata = {
        format: parsed.format,
        width: parsed.width,
        height: parsed.height,
        frameCount: parsed.frameCount || 1,
        pixelMetrics: parsed.pixelMetrics || null,
      };
      const res = auditImageDocument(parsed, { filename: rel, pack: effectivePack });
      findings = res.findings || [];
    }
    nodeRecords.push({
      file: rel,
      ext,
      findingCount: findings.length,
      findings: findings.map((f) => ({
        ruleId: f.ruleId,
        severity: f.severity,
        message: f.message,
      })),
      metadata,
    });
  }

  let pythonParity = { checked: false, matched: true, mismatches: [], pythonFilesCount: 0 };
  if (!skipPy) {
    const env = { ...process.env, PYTHONPATH: path.join(ROOT, "src") };
    const pyRes = spawnSync(
      "python3",
      ["-m", "dislop.cli", "check", "assets/", "--pack", "deck-and-ui", "--patterns", "--format", "json"],
      { cwd: ROOT, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
    );
    if (![0, 1].includes(pyRes.status)) {
      throw new Error(`Python CLI audit on assets/ failed (${pyRes.status}): ${pyRes.stderr || pyRes.stdout}`);
    }
    const pyData = JSON.parse(pyRes.stdout);
    const pyMap = new Map();
    for (const f of pyData.files || []) {
      const rel = path.relative(ROOT, path.resolve(ROOT, f.file)).replace(/\\/g, "/");
      const rules = [...new Set((f.findings || []).map((x) => x.ruleId))].sort();
      pyMap.set(rel, rules);
    }
    const mismatches = [];
    for (const rec of nodeRecords) {
      const nodeRules = [...new Set(rec.findings.map((x) => x.ruleId))].sort();
      const pyRules = pyMap.get(rec.file);
      if (!pyRules) {
        mismatches.push({ file: rec.file, reason: "missing_in_python", nodeRules });
      } else if (JSON.stringify(nodeRules) !== JSON.stringify(pyRules)) {
        mismatches.push({ file: rec.file, reason: "rule_mismatch", nodeRules, pyRules });
      }
    }
    pythonParity = {
      checked: true,
      matched: mismatches.length === 0,
      pythonFilesCount: pyMap.size,
      mismatches,
    };
  }

  const totalFindings = nodeRecords.reduce((acc, r) => acc + r.findingCount, 0);
  const flagged = nodeRecords.filter((r) => r.findingCount > 0);
  return {
    assetCount: nodeRecords.length,
    totalFindings,
    flaggedCount: flagged.length,
    flagged,
    pythonParity,
    assets: nodeRecords,
  };
}

function runLayer1DemoHtmls(packs, banks, tmpDir) {
  const htmlDir = path.join(tmpDir, "demo-htmls");
  fs.mkdirSync(htmlDir, { recursive: true });
  const pyEmit = [
    "import json, sys, pathlib",
    "sys.path.insert(0, sys.argv[1])",
    "import render_gifs",
    "manifest = json.loads(pathlib.Path(sys.argv[2]).read_text('utf-8'))",
    "out_dir = pathlib.Path(sys.argv[3])",
    "items = []",
    "for spec in manifest['scenes']:",
    "    if spec['kind'] != 'virtual-clock':",
    "        continue",
    "    slug = spec['slug']",
    "    builder = render_gifs.SCENE_BUILDERS[slug]",
    "    for lang in ('zh', 'en'):",
    "        html_text = builder(lang, duration=float(spec['duration']))",
    "        name = f'{slug}-{lang}-{manifest[\"version\"]}'",
    "        out_path = out_dir / f'{name}.html'",
    "        out_path.write_text(html_text, encoding='utf-8')",
    "        items.append({'name': name, 'slug': slug, 'lang': lang, 'path': str(out_path)})",
    "print(json.dumps(items))",
  ].join("\n");

  const res = spawnSync(
    "python3",
    ["-c", pyEmit, path.join(ROOT, "scripts", "media"), path.join(ROOT, "scripts", "media", "demos.manifest.json"), htmlDir],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (res.status !== 0) {
    throw new Error(`Failed emitting demo scene HTMLs: ${res.stderr || res.stdout}`);
  }
  const items = JSON.parse(res.stdout);
  const effectivePack = resolveEffectivePack("deck-and-ui", packs);
  const records = [];
  for (const item of items) {
    const html = fs.readFileSync(item.path, "utf8");
    const r1 = auditText(html, { filename: `${item.name}.html`, modality: "html", pack: effectivePack });
    const r2 = auditPatterns(html, { filename: `${item.name}.html`, modality: "html", banks });
    const findings = [...(r1.findings || []), ...(r2.findings || [])];
    records.push({
      name: item.name,
      slug: item.slug,
      lang: item.lang,
      findingCount: findings.length,
      findings: findings.map((f) => ({
        ruleId: f.ruleId,
        severity: f.severity,
        line: f.line,
        message: f.message,
      })),
    });
  }
  const totalFindings = records.reduce((acc, r) => acc + r.findingCount, 0);
  return {
    sceneHtmlCount: records.length,
    totalFindings,
    flagged: records.filter((r) => r.findingCount > 0),
    scenes: records,
  };
}

function runLayer2SvgGeometryAndRender(tmpDir) {
  const renderDir = path.join(tmpDir, "rendered-svgs");
  fs.mkdirSync(renderDir, { recursive: true });
  const specs = BRAND_SVGS.map((rel) => {
    const abs = path.join(ROOT, rel);
    const svgRaw = fs.readFileSync(abs, "utf8");
    const vbMatch = svgRaw.match(/viewBox=["']\s*0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*["']/i);
    const w = vbMatch ? Math.round(Number(vbMatch[1])) : 1200;
    const h = vbMatch ? Math.round(Number(vbMatch[2])) : 630;
    return {
      rel,
      slug: path.basename(rel, ".svg"),
      width: w,
      height: h,
      svgRaw,
      pngOut: path.join(renderDir, `${path.basename(rel, ".svg")}.png`),
    };
  });

  const manifestPath = path.join(tmpDir, "svg-audit-jobs.json");
  fs.writeFileSync(manifestPath, JSON.stringify(specs), "utf8");

  const pyInspect = String.raw`
import json, pathlib, sys
from playwright.sync_api import sync_playwright

specs = json.loads(pathlib.Path(sys.argv[1]).read_text("utf-8"))

JS_AUDIT = r"""(rel) => {
  const svg = document.querySelector('svg');
  if (!svg) return { defects: [{ ruleId: 'svg-missing-root', message: 'Missing root <svg>' }], stats: {} };
  const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : { width: 1200, height: 630 };
  const isZh = rel.includes('-zh');
  const defects = [];

  // 1. Architectural border radius audit on non-logo structural rects
  const rects = [...svg.querySelectorAll('rect')];
  const rectInfo = rects.map((r) => {
    const b = r.getBBox();
    const rx = parseFloat(r.getAttribute('rx') || '0');
    const ry = parseFloat(r.getAttribute('ry') || '0');
    const isLogoIcon = (b.width <= 64 && b.height <= 64 && Math.abs(b.width - b.height) < 1);
    const isTinyDot = (b.width <= 14 && b.height <= 14);
    const isHairline = (b.height <= 4 || b.width <= 4);
    return { x: b.x, y: b.y, w: b.width, h: b.height, rx, ry, isLogoIcon, isTinyDot, isHairline, fill: r.getAttribute('fill') || '' };
  });
  for (const r of rectInfo) {
    if (!r.isLogoIcon && !r.isTinyDot && !r.isHairline && (r.rx > 4 || r.ry > 4)) {
      defects.push({
        ruleId: 'svg-rounded-proof-card',
        severity: 'warning',
        message: 'Structural card rect uses rx=' + r.rx + ' (> 4px architectural grid limit) at (' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.w) + 'x' + Math.round(r.h) + ')'
      });
    }
  }

  // 2. Collect text & tspan boxes
  const hasCjk = (s) => /[\u4e00-\u9fff]/.test(s || '');
  const textEls = [...svg.querySelectorAll('text')];
  const textBoxes = [];
  for (const t of textEls) {
    const tspans = [...t.querySelectorAll('tspan')];
    const items = tspans.length > 0 ? tspans : [t];
    for (const node of items) {
      const str = (node.textContent || '').trim();
      if (!str) continue;
      let b;
      try { b = node.getBBox(); } catch (_) { continue; }
      const parentText = node.tagName.toLowerCase() === 'tspan' ? t : node;
      const ff = (node.getAttribute('font-family') || parentText.getAttribute('font-family') || svg.getAttribute('font-family') || '').trim();
      const fsAttr = parseFloat(node.getAttribute('font-size') || parentText.getAttribute('font-size') || '16');
      const fill = (node.getAttribute('fill') || parentText.getAttribute('fill') || '').toUpperCase();
      textBoxes.push({
        text: str,
        x: b.x,
        y: b.y,
        w: b.width,
        h: b.height,
        right: b.x + b.width,
        bottom: b.y + b.height,
        midY: b.y + b.height / 2,
        fontFamily: ff,
        fontSize: Number.isFinite(fsAttr) ? fsAttr : 16,
        fill,
        isCjk: hasCjk(str),
        isTspan: node.tagName.toLowerCase() === 'tspan',
        parentTextEl: parentText,
        isMono: /monospace|sfmono|menlo|consolas/i.test(ff),
      });
    }
  }

  // 3. CJK serif priority check on editorial/proof specimens (non-UI badge CJK lines using Georgia/Songti intent or specimen panels)
  const sansBeforeSerif = (ff) => {
    const low = ff.toLowerCase();
    if (!low) return false;
    const serifTokens = ['songti sc', 'noto serif cjk sc', 'stsong', 'source serif', 'georgia', 'serif'];
    const sansTokens = ['pingfang sc', 'hiragino sans', 'noto sans cjk', 'microsoft yahei', 'sans-serif', '-apple-system'];
    let firstSerif = Infinity;
    let firstSans = Infinity;
    for (const tk of serifTokens) {
      const idx = low.indexOf(tk);
      if (idx !== -1 && !(tk === 'serif' && low.slice(Math.max(0, idx - 5), idx) === 'sans-')) {
        firstSerif = Math.min(firstSerif, idx);
      }
    }
    for (const tk of sansTokens) {
      const idx = low.indexOf(tk);
      if (idx !== -1) firstSans = Math.min(firstSans, idx);
    }
    return firstSerif < Infinity && firstSans < firstSerif;
  };
  for (const tb of textBoxes) {
    if (tb.isCjk && sansBeforeSerif(tb.fontFamily)) {
      defects.push({
        ruleId: 'svg-cjk-sans-before-serif',
        severity: 'warning',
        message: 'CJK specimen "' + tb.text.slice(0, 18) + '" declares sans-serif before serif in font-family: ' + tb.fontFamily
      });
    }
  }

  // 4. Inline phrase gap check on same visual baseline (within +-3px y and height ~same)
  for (let i = 0; i < textBoxes.length; i++) {
    for (let j = i + 1; j < textBoxes.length; j++) {
      const a = textBoxes[i];
      const b = textBoxes[j];
      if (a.isTspan && b.isTspan) continue; // tspans in same <text> flow naturally
      if (Math.abs(a.midY - b.midY) > 4) continue;
      if (Math.abs(a.h - b.h) > 8) continue;
      const [left, right] = a.x <= b.x ? [a, b] : [b, a];
      const gap = right.x - left.right;
      // Only check adjacent inline fragments (< 140px apart, inside same panel)
      if (gap >= -6 && gap < 120) {
        if (gap < 2) {
          defects.push({
            ruleId: 'svg-inline-phrase-collision',
            severity: 'error',
            message: 'Text overlap/tight collision (' + Math.round(gap) + 'px) between "' + left.text.slice(0, 16) + '" and "' + right.text.slice(0, 16) + '"'
          });
        } else if (gap > 20 && !right.text.startsWith('http') && !right.text.startsWith('$') && !left.text.startsWith('$')) {
          defects.push({
            ruleId: 'svg-inline-phrase-gap',
            severity: 'warning',
            message: 'Wide inline gap (' + Math.round(gap) + 'px > 20px) between "' + left.text.slice(0, 16) + '" and "' + right.text.slice(0, 16) + '"'
          });
        }
      }
    }
  }

  // 5. Strike-through & underline overshoot check against paired text boxes
  const strokes = [...svg.querySelectorAll('line, path')];
  const strokeChecks = [];
  for (const el of strokes) {
    const stroke = (el.getAttribute('stroke') || '').toUpperCase();
    const isRed = stroke === '#F04438' || stroke === '#FF5F56' || stroke === '#EF4444';
    const isBlue = stroke === '#0F52BA' || stroke === '#60A5FA' || stroke === '#3B82F6';
    if (!isRed && !isBlue) continue;
    let b;
    try { b = el.getBBox(); } catch (_) { continue; }
    // Ignore tiny logo marks inside logo box (width <= 64 && height <= 64 and near logo origin)
    if (b.width <= 46 && (b.x < 160 && b.y < 140)) continue;
    const isStrike = isRed;
    const candidates = textBoxes.filter((tb) => {
      const horizOverlap = Math.min(tb.right, b.x + b.width) - Math.max(tb.x, b.x);
      if (horizOverlap <= 10) return false;
      if (isStrike) {
        return Math.abs((b.y + b.height / 2) - tb.midY) <= Math.max(10, tb.h * 0.55);
      }
      return b.y >= tb.midY - 2 && b.y <= tb.bottom + 14;
    });
    if (candidates.length === 0) continue;
    // Merge all text fragments on that target line that overlap the stroke horizontally
    const minLeft = Math.min(...candidates.map((c) => c.x));
    const maxRight = Math.max(...candidates.map((c) => c.right));
    const strokeLeft = b.x;
    const strokeRight = b.x + b.width;
    const leftOvershoot = minLeft - strokeLeft;
    const rightOvershoot = strokeRight - maxRight;
    const leftUndershoot = strokeLeft - minLeft;
    const rightUndershoot = maxRight - strokeRight;
    const label = candidates.map((c) => c.text).join(' ').slice(0, 32);
    strokeChecks.push({
      kind: isStrike ? 'strike' : 'underline',
      stroke,
      label,
      strokeX: [Math.round(strokeLeft), Math.round(strokeRight)],
      textX: [Math.round(minLeft), Math.round(maxRight)],
      leftOvershoot: Math.round(leftOvershoot),
      rightOvershoot: Math.round(rightOvershoot),
    });
    if (leftOvershoot > 14 || rightOvershoot > 14) {
      defects.push({
        ruleId: 'svg-annotation-overshoot',
        severity: 'warning',
        message: (isStrike ? 'Strike' : 'Underline') + ' overshoots "' + label + '" (left +' + Math.round(leftOvershoot) + 'px, right +' + Math.round(rightOvershoot) + 'px; stroke ' + Math.round(strokeLeft) + '..' + Math.round(strokeRight) + ' vs text ' + Math.round(minLeft) + '..' + Math.round(maxRight) + ')'
      });
    }
    if (candidates.length === 1 && (leftUndershoot > 18 || rightUndershoot > 18)) {
      // Only check undershoot when stroke clearly targets the whole phrase on an annotation line
      // (skip if intentionally marking first half, unless stroke ends far off within 18..90px? Actually check 22..80px? Better: skip partial phrase markers unless rightOvershoot)
    }
  }

  // 6. Card overflow check
  for (const r of rectInfo) {
    if (r.w < 200 || r.h < 80 || r.w >= vb.width - 10) continue;
    for (const tb of textBoxes) {
      const insideY = tb.midY >= r.y && tb.midY <= r.y + r.h;
      const startedInsideX = tb.x >= r.x - 2 && tb.x < r.x + r.w;
      if (insideY && startedInsideX && tb.right > r.x + r.w - 6) {
        defects.push({
          ruleId: 'svg-text-card-overflow',
          severity: 'error',
          message: 'Text "' + tb.text.slice(0, 20) + '" overflows card right edge (' + Math.round(tb.right) + ' > ' + Math.round(r.x + r.w - 6) + ')'
        });
      }
    }
  }

  return {
    viewBox: [vb.width, vb.height],
    defects,
    strokeChecks,
    textCount: textBoxes.length,
    rectCount: rects.length
  };
}"""

out = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(device_scale_factor=1)
    for spec in specs:
        w, h = int(spec["width"]), int(spec["height"])
        page.set_viewport_size({"width": w, "height": h})
        html = f"<!doctype html><html><body style='margin:0;padding:0;background:transparent'>{spec['svgRaw']}</body></html>"
        page.set_content(html, wait_until="load")
        page.wait_for_timeout(40)
        res = page.evaluate(JS_AUDIT, spec["rel"])
        page.screenshot(path=spec["pngOut"], omit_background=False)
        out.append({
            "file": spec["rel"],
            "slug": spec["slug"],
            "pngPath": spec["pngOut"],
            "width": w,
            "height": h,
            **res,
        })
    browser.close()

print(json.dumps(out))
`;

  const res = spawnSync("python3", ["-c", pyInspect, manifestPath], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`Playwright SVG geometry audit failed: ${res.stderr || res.stdout}`);
  }
  const results = JSON.parse(res.stdout);
  const totalDefects = results.reduce((acc, r) => acc + r.defects.length, 0);
  return {
    svgCount: results.length,
    totalDefects,
    svgs: results,
  };
}

function extractGifEndFrames(tmpDir) {
  const outDir = path.join(tmpDir, "gif-end-frames");
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, "scripts", "media", "demos.manifest.json"), "utf8")
  );
  const version = manifest.version || "v2";
  const jobs = [];
  for (const s of manifest.scenes || []) {
    for (const lang of ["zh", "en"]) {
      const name = `${s.slug}-${lang}-${version}`;
      const gifPath = path.join(ROOT, manifest.assetsDir || "assets/demos", `${name}.gif`);
      const posterPath = path.join(ROOT, manifest.assetsDir || "assets/demos", `${name}-poster.png`);
      const endPngPath = path.join(outDir, `${name}-end.png`);
      if (fs.existsSync(gifPath)) {
        jobs.push({ name, slug: s.slug, lang, gifPath, posterPath, endPngPath });
      }
    }
  }
  const pyExtract = [
    "import json, sys",
    "from PIL import Image",
    "jobs = json.loads(sys.argv[1])",
    "for j in jobs:",
    "    with Image.open(j['gifPath']) as im:",
    "        n = getattr(im, 'n_frames', 1)",
    "        im.seek(max(0, n - 1))",
    "        im.convert('RGB').save(j['endPngPath'], format='PNG')",
  ].join("\n");
  const res = spawnSync("python3", ["-c", pyExtract, JSON.stringify(jobs)], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(`Extracting GIF end frames failed: ${res.stderr || res.stdout}`);
  }
  return jobs;
}

function parseVlmJson(rawText) {
  const clean = String(rawText || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  const obj = JSON.parse(s !== -1 && e > s ? clean.slice(s, e + 1) : clean);
  if (typeof obj.visualSlopScore !== "number" || !Number.isFinite(obj.visualSlopScore)) {
    throw new Error(`Missing visualSlopScore in VLM JSON: ${clean.slice(0, 140)}`);
  }
  const issues = Array.isArray(obj.issues) ? obj.issues.map((x) => String(x).trim()).filter(Boolean) : [];
  return {
    visualSlopScore: Math.max(0, Math.min(100, Math.round(obj.visualSlopScore))),
    level: ["low", "medium", "high"].includes(obj.level)
      ? obj.level
      : obj.visualSlopScore >= 70
        ? "high"
        : obj.visualSlopScore >= 40
          ? "medium"
          : "low",
    verdict: String(obj.verdict || "").trim().slice(0, 220),
    issues,
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
  const textParts = (cand?.content?.parts || [])
    .filter((p) => typeof p.text === "string")
    .map((p) => p.text)
    .join("");
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

function buildDogfoodVlmPrompt(item) {
  return [
    `You are dislop's multimodal visual anti-slop auditor inspecting dislop's own ${item.kind} deliverable (${item.label}).`,
    "Score 0-100 across 5 visual dimensions: (1) AI template cliché, (2) hierarchy & alignment, (3) decorative/chrome bloat, (4) diagram/editorial typography craft (CJK serif vs sans, crisp strike/underline bounds, hairline precision), (5) contrast, legibility & color quantization cleanliness.",
    "Check carefully for: misaligned/overshooting strike or underline paths, mixed ZH/EN text leakage, clipped or overlapping labels, blurry GIF palette banding, weak contrast, bloated pill-badge walls, generic SaaS neon/purple glow, or awkward spacing gaps.",
    item.contextNote,
    `Deterministic static summary for this asset: ${JSON.stringify(item.staticSummary)}.`,
    'Output strict JSON only: {"visualSlopScore": 0, "level": "low|medium|high", "verdict": "one concrete sentence naming visual evidence", "issues": ["short issue strings"]}',
  ]
    .filter(Boolean)
    .join("\n");
}

async function runWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function runLayer3Vlm({ model, concurrency, threshold, layer2, tmpDir }) {
  assertLiveNetworkAllowed();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for --vlm. Run via: ~/.local/bin/with-api --keys GEMINI_API_KEY -- ...");
  }

  const targets = [];
  for (const svgRes of layer2.svgs) {
    targets.push({
      id: svgRes.slug,
      label: svgRes.file,
      kind: svgRes.slug.startsWith("og-") ? "OpenGraph social preview card (1200x630)" : "GitHub README brand banner (1280x360)",
      pngPath: svgRes.pngPath,
      contextNote: svgRes.slug.startsWith("banner") || svgRes.slug.startsWith("og-card")
        ? "Note: red strike-through / blue dashed underline mark intentional bad-vs-good copywriting specimens inside the product card. Judge whether those marks align cleanly with their text, whether fonts fit cleanly, and whether the overall graphic avoids AI template slop."
        : "",
      staticSummary: { svgDefects: svgRes.defects.map((d) => d.ruleId) },
    });
  }

  for (const ogRel of ["assets/og-card.png", "assets/og-card-zh.png"]) {
    const abs = path.join(ROOT, ogRel);
    if (fs.existsSync(abs)) {
      targets.push({
        id: `${path.basename(ogRel, ".png")}-png`,
        label: ogRel,
        kind: "rasterized OpenGraph card PNG (1200x630)",
        pngPath: abs,
        contextNote: "This is the rasterized OG card served for social link previews. Inspect crispness, font rendering, strike alignment, and visual restraint.",
        staticSummary: { file: ogRel },
      });
    }
  }

  const gifJobs = extractGifEndFrames(tmpDir);
  for (const job of gifJobs) {
    if (fs.existsSync(job.posterPath)) {
      targets.push({
        id: `${job.name}-poster`,
        label: `assets/demos/${job.name}-poster.png`,
        kind: "demo animation keyframe poster",
        pngPath: job.posterPath,
        contextNote: job.slug === "ui-slop"
          ? "Important context: this educational demo intentionally contrasts an annotated 'Before / AI Slop' mock panel (flagged by dislop red markers) against the repaired paper sheet / audit chrome. Do NOT penalize the explicitly labeled 'Before' slop sample itself; instead inspect dislop's tool frame, typography, layout clarity, contrast, and alignment."
          : "Inspect product UI legibility, spacing, tabular numbers, alignment, and absence of AI template bloat.",
        staticSummary: { scene: job.slug, lang: job.lang, frame: "poster" },
      });
    }
    if (fs.existsSync(job.endPngPath)) {
      targets.push({
        id: `${job.name}-gif-end`,
        label: `assets/demos/${job.name}.gif (final clean state)`,
        kind: "quantized GIF final clean frame",
        pngPath: job.endPngPath,
        contextNote: "This is the exact quantized final frame rendered from the shipped GIF in its clean/passed state. Inspect GIF palette artifacts/banding, contrast, alignment, legibility, and overall restraint.",
        staticSummary: { scene: job.slug, lang: job.lang, frame: "gif-end" },
      });
    }
  }

  const records = await runWithConcurrency(targets, concurrency, async (item) => {
    const base64Png = fs.readFileSync(item.pngPath).toString("base64");
    const prompt = buildDogfoodVlmPrompt(item);
    const out = await callGeminiVision({ model, prompt, base64Png, apiKey });
    return {
      id: item.id,
      label: item.label,
      kind: item.kind,
      ...out,
      passed: out.visualSlopScore < threshold,
    };
  });

  const scores = records.map((r) => r.visualSlopScore);
  const avgScore = scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0;
  const maxScore = scores.length ? Math.max(...scores) : 0;
  const flagged = records.filter((r) => !r.passed);
  return {
    model,
    threshold,
    totalAudited: records.length,
    avgVisualSlopScore: avgScore,
    maxVisualSlopScore: maxScore,
    flaggedCount: flagged.length,
    flagged,
    records,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { packs, banks } = loadPacksAndBanks();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dislop-visual-dogfood-"));

  try {
    const layer1Assets = runLayer1Assets(packs, banks, { skipPy: opts.skipPy });
    const layer1Demos = runLayer1DemoHtmls(packs, banks, tmpDir);
    const layer2Svg = runLayer2SvgGeometryAndRender(tmpDir);

    let layer3Vlm = null;
    if (opts.vlm) {
      layer3Vlm = await runLayer3Vlm({
        model: opts.model,
        concurrency: opts.concurrency,
        threshold: opts.threshold,
        layer2: layer2Svg,
        tmpDir,
      });
    }

    const report = {
      schema: "dislop.visual-dogfood-audit/1",
      generatedAt: new Date().toISOString(),
      layer1: {
        assets: layer1Assets,
        demoHtmls: layer1Demos,
      },
      layer2: {
        svgCount: layer2Svg.svgCount,
        totalDefects: layer2Svg.totalDefects,
        svgs: layer2Svg.svgs.map(({ pngPath, ...rest }) => rest),
      },
      layer3: layer3Vlm,
    };

    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, JSON.stringify(report, null, 2) + "\n", "utf8");

    console.log(
      `[Layer 1 assets] files=${layer1Assets.assetCount} findings=${layer1Assets.totalFindings} pyParity=${layer1Assets.pythonParity.checked ? (layer1Assets.pythonParity.matched ? "100%" : `MISMATCH(${layer1Assets.pythonParity.mismatches.length})`) : "skipped"}`
    );
    console.log(
      `[Layer 1 demos]  htmls=${layer1Demos.sceneHtmlCount} findings=${layer1Demos.totalFindings}`
    );
    for (const s of layer1Demos.flagged) {
      console.log(`  - ${s.name}: ${s.findings.map((f) => f.ruleId).join(", ")}`);
    }
    console.log(`[Layer 2 svg]    svgs=${layer2Svg.svgCount} defects=${layer2Svg.totalDefects}`);
    for (const svg of layer2Svg.svgs) {
      if (svg.defects.length > 0) {
        console.log(`  - ${svg.file}:`);
        for (const d of svg.defects) {
          console.log(`      [${d.ruleId}] ${d.message}`);
        }
      }
    }
    if (layer3Vlm) {
      console.log(
        `[Layer 3 vlm]    model=${layer3Vlm.model} audited=${layer3Vlm.totalAudited} avg=${layer3Vlm.avgVisualSlopScore} max=${layer3Vlm.maxVisualSlopScore} flagged(>=${layer3Vlm.threshold})=${layer3Vlm.flaggedCount}`
      );
      for (const r of layer3Vlm.records) {
        const tag = r.passed ? "PASS" : "FLAG";
        console.log(`  [${tag} ${String(r.visualSlopScore).padStart(2, "0")}] ${r.label} — ${r.verdict}`);
      }
    }
    console.log(`Saved audit report -> ${path.relative(ROOT, opts.out)}`);

    if (opts.assert) {
      const failures = [];
      if (layer1Assets.totalFindings > 0) failures.push(`Layer 1 assets findings=${layer1Assets.totalFindings}`);
      if (layer1Assets.pythonParity.checked && !layer1Assets.pythonParity.matched) {
        failures.push(`Node/Python assets parity mismatch=${layer1Assets.pythonParity.mismatches.length}`);
      }
      if (layer1Demos.totalFindings > 0) failures.push(`Layer 1 demo HTML findings=${layer1Demos.totalFindings}`);
      if (layer2Svg.totalDefects > 0) failures.push(`Layer 2 SVG geometry defects=${layer2Svg.totalDefects}`);
      if (layer3Vlm && layer3Vlm.flaggedCount > 0) {
        failures.push(`Layer 3 VLM flagged=${layer3Vlm.flaggedCount} (>=${opts.threshold})`);
      }
      if (failures.length > 0) {
        console.error(`[assert failed] ${failures.join("; ")}`);
        process.exit(1);
      }
      console.log("[assert ok] all visual dogfood audit gates passed");
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
