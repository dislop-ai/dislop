#!/usr/bin/env node
/**
 * Visual / Web UI / SVG / Image / PDF Anti-Slop Benchmark & Ablation Harness.
 * Zero external dependencies. Evaluates 4 arms + PNG pixel threshold ablation + Node/Python parity.
 *
 * Usage:
 *   node scripts/run_visual_benchmark.mjs [--assert] [--json]
 */
import assert from "node:assert/strict";
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
const DATASET_PATH = path.join(ROOT, "benchmarks", "datasets", "visual-design-v1.json");
const OUT_PATH = path.join(ROOT, "benchmarks", "results", "visual-benchmark-latest.json");

// ---------- Deterministic Binary Fixture Synthesizers (PNG, JPEG, PDF) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, crcInput, crcBuf]);
}

function synthesizePng(spec) {
  const w = spec.width || 128;
  const h = spec.height || 128;
  const pat = spec.pattern || "solid";
  const rowBytes = 1 + w * 4;
  const raw = Buffer.alloc(h * rowBytes);

  for (let y = 0; y < h; y += 1) {
    const rowOff = y * rowBytes;
    raw[rowOff] = 0; // filter None
    for (let x = 0; x < w; x += 1) {
      const pOff = rowOff + 1 + x * 4;
      let r = 246;
      let g = 247;
      let b = 245;
      let a = 255;

      if (pat === "solid" && Array.isArray(spec.color)) {
        [r, g, b] = spec.color;
      } else if (pat === "dark-neon-purple") {
        if (y < h * 0.45) {
          r = 11; g = 11; b = 20;
        } else if (y < h * 0.80) {
          const t = (x + y) / (w + h);
          r = Math.round(124 + t * 112);
          g = Math.round(58 + t * 14);
          b = Math.round(237 - t * 84);
        } else {
          r = 6; g = 182; b = 212;
        }
      } else if (pat === "plastic-gradient") {
        // Smooth airbrushed hyper-saturated non-purple sweep (S >= 0.90, hue 5..45 deg, neighbor L1 diff < 8)
        const t = x / Math.max(1, w - 1);
        const v = y / Math.max(1, h - 1);
        r = 250;
        g = Math.round(25 + t * 145 + v * 30);
        b = 10;
      } else if (pat === "purple-pink-gradient") {
        const t = (x + y) / (w + h);
        r = Math.round(99 + t * 137);
        g = Math.round(102 - t * 30);
        b = Math.round(241 - t * 88);
      } else if (pat === "editorial-paper") {
        if (y >= 10 && y <= 14) {
          r = 240; g = 68; b = 56; // thin vermilion rule (<4%)
        } else if (x > 20 && x < 70 && y > 30 && y < 44) {
          r = 20; g = 23; b = 26;
        } else {
          r = 246; g = 247; b = 245;
        }
      } else if (pat === "clean-dark-ui") {
        if (y < 14 && x < 40) {
          r = 133; g = 180; b = 255;
        } else if (x > 16 && x < w - 16 && y > 20 && y < h - 20) {
          r = 21; g = 24; b = 28;
        } else {
          r = 14; g = 16; b = 18;
        }
      } else if (pat === "small-purple-logo") {
        if (x >= 10 && x < 34 && y >= 10 && y < 34) {
          r = 124; g = 58; b = 237; // ~3.5% area
        } else {
          r = 255; g = 255; b = 255;
        }
      } else if (pat === "textured-high-sat") {
        // High-frequency natural contrast alternation (S >= 0.90 everywhere, 4-neighbor L1 diff = 490 >> 18)
        if ((x + y) % 2 === 0) {
          r = 245; g = 10; b = 15;
        } else {
          r = 10; g = 235; b = 45;
        }
      } else if (pat === "transparent-mark") {
        if (x >= 48 && x < 80 && y >= 48 && y < 80) {
          r = 20; g = 23; b = 26; a = 255;
        } else {
          r = 0; g = 0; b = 0; a = 0;
        }
      }

      raw[pOff] = r;
      raw[pOff + 1] = g;
      raw[pOff + 2] = b;
      raw[pOff + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunks = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
  ];
  for (const tc of spec.textChunks || []) {
    chunks.push(pngChunk("tEXt", Buffer.concat([Buffer.from(tc.key, "latin1"), Buffer.from([0]), Buffer.from(tc.value, "latin1")])));
  }
  chunks.push(pngChunk("IDAT", deflateSync(raw)));
  chunks.push(pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function synthesizeJpeg(spec) {
  const w = spec.width || 128;
  const h = spec.height || 128;
  const parts = [Buffer.from([0xff, 0xd8])];

  if (spec.xmp) {
    const xmpPayload = Buffer.concat([Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1"), Buffer.from(spec.xmp, "utf8")]);
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(xmpPayload.length + 2, 0);
    parts.push(Buffer.from([0xff, 0xe1]), lenBuf, xmpPayload);
  }
  if (spec.exif) {
    const exifPayload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), Buffer.from(spec.exif, "latin1")]);
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(exifPayload.length + 2, 0);
    parts.push(Buffer.from([0xff, 0xe1]), lenBuf, exifPayload);
  }

  // SOF0 marker (width & height)
  const sof = Buffer.alloc(11);
  sof.writeUInt16BE(11, 0);
  sof[2] = 8;
  sof.writeUInt16BE(h, 3);
  sof.writeUInt16BE(w, 5);
  sof[7] = 3;
  sof[8] = 1; sof[9] = 0x11; sof[10] = 0;
  parts.push(Buffer.from([0xff, 0xc0]), sof);
  parts.push(Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

function pdfEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function encodeUtf16BeHex(s) {
  let out = "FEFF";
  for (let i = 0; i < s.length; i += 1) {
    out += s.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${out}>`;
}

function synthesizePdf(spec) {
  const pagesSpec = spec.pages || [{ width: 960, height: 540, fontRuns: [] }];
  const compress = Boolean(spec.compress);
  const objs = [];
  const addObj = (dict, streamBuf = null) => {
    const num = objs.length + 1;
    objs.push({ num, dict, streamBuf });
    return num;
  };

  const catalogNum = addObj("");
  const pagesNum = addObj("");
  const fontNum = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const imgNum = addObj("<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Length 30 >>", Buffer.alloc(30, 128));

  const pageNums = [];
  for (const p of pagesSpec) {
    const lines = [];
    for (const rgb of p.rgbFills || []) {
      lines.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg 0 0 100 100 re f`);
    }
    for (let k = 0; k < (p.imageOps || 0); k += 1) {
      lines.push("q 960 0 0 540 0 0 cm /Im0 Do Q");
    }
    if ((p.fontRuns || []).length > 0) {
      lines.push("BT");
      let y = (p.height || 540) - 48;
      for (const run of p.fontRuns) {
        const text = run.repeatWord
          ? Array.from({ length: run.repeatCount || 1 }, (_, idx) => `${run.repeatWord}${idx}`).join(" ")
          : run.text || "";
        lines.push(`/F1 ${run.size || 12} Tf`);
        lines.push(`48 ${y} Td`);
        if (p.utf16be) {
          lines.push(`${encodeUtf16BeHex(text)} Tj`);
        } else {
          lines.push(`(${pdfEscape(text)}) Tj`);
        }
        y -= 24;
      }
      lines.push("ET");
    }
    const rawStream = Buffer.from(lines.join("\n") + "\n", "latin1");
    const streamPayload = compress ? deflateSync(rawStream) : rawStream;
    const filterDecl = compress ? "/Filter /FlateDecode " : "";
    const contentNum = addObj(`<< ${filterDecl}/Length ${streamPayload.length} >>`, streamPayload);
    const w = p.width || 960;
    const h = p.height || 540;
    const pageNum = addObj(
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 ${fontNum} 0 R >> /XObject << /Im0 ${imgNum} 0 R >> >> /Contents ${contentNum} 0 R >>`
    );
    pageNums.push(pageNum);
  }

  objs[catalogNum - 1].dict = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
  objs[pagesNum - 1].dict = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNums.length} >>`;

  const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
  for (const o of objs) {
    if (o.streamBuf) {
      chunks.push(Buffer.from(`${o.num} 0 obj\n${o.dict}\nstream\n`, "latin1"));
      chunks.push(o.streamBuf);
      chunks.push(Buffer.from("\nendstream\nendobj\n", "latin1"));
    } else {
      chunks.push(Buffer.from(`${o.num} 0 obj\n${o.dict}\nendobj\n`, "latin1"));
    }
  }
  if (spec.encrypted) {
    const encNum = addObj("<< /Filter /Standard /V 2 /R 3 /Length 128 >>");
    chunks.push(Buffer.from(`${encNum} 0 obj\n<< /Filter /Standard /V 2 /R 3 /Length 128 >>\nendobj\n`, "latin1"));
    chunks.push(Buffer.from(`trailer\n<< /Root ${catalogNum} 0 R /Encrypt ${encNum} 0 R >>\n%%EOF\n`, "latin1"));
  } else {
    chunks.push(Buffer.from(`trailer\n<< /Root ${catalogNum} 0 R >>\n%%EOF\n`, "latin1"));
  }
  return Buffer.concat(chunks);
}

// ---------- Load Packs & Pattern Banks ----------

function loadAllPacks() {
  const packsDir = path.join(ROOT, "packs");
  const packs = {};
  for (const ent of fs.readdirSync(packsDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const p = path.join(packsDir, ent.name, "pack.json");
    if (fs.existsSync(p)) {
      const d = JSON.parse(fs.readFileSync(p, "utf8"));
      packs[d.id] = d;
    }
  }
  return packs;
}

function loadPatternBanks() {
  const bankDir = path.join(ROOT, "patterns", "banks");
  const banks = {};
  for (const ent of fs.readdirSync(bankDir, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.endsWith(".json")) {
      const d = JSON.parse(fs.readFileSync(path.join(bankDir, ent.name), "utf8"));
      banks[d.id || ent.name.replace(/\.json$/, "")] = d;
    }
  }
  return banks;
}

function scoreMetrics(rows) {
  let tp = 0; let fp = 0; let tn = 0; let fn = 0;
  for (const r of rows) {
    if (r.expected === "slop" && r.predicted) tp += 1;
    else if (r.expected === "slop" && !r.predicted) fn += 1;
    else if (r.expected === "clean" && r.predicted) fp += 1;
    else tn += 1;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
  return {
    total: rows.length,
    tp, fp, tn, fn,
    precision: Number((precision * 100).toFixed(1)),
    recall: Number((recall * 100).toFixed(1)),
    f1: Number((f1 * 100).toFixed(1)),
    fpr: Number((fpr * 100).toFixed(1)),
  };
}

function naiveRegexDetector(sample) {
  if (sample.modality === "image" || sample.modality === "pdf") return false;
  const text = sample.content || "";
  return /(?:from-indigo|bg-clip-text|href="#"|rounded-full|AI-Powered|blur-3xl|animate-ping|shadow-indigo|border-l-4|font-family[^;\n]*Inter|#FAF8F5|<svg|01|🚀|✨|⚡)/i.test(text);
}

const V071_BASELINE_RULES = new Set([
  "ui-dead-control",
  "ui-ai-gradient",
  "ui-pill-soup",
  "ui-box-in-box",
  "ui-prompt-echo-badge",
]);

function main() {
  const assertMode = process.argv.includes("--assert");
  const jsonMode = process.argv.includes("--json");
  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, "utf8"));
  const packs = loadAllPacks();
  const banks = loadPatternBanks();
  const deckPack = resolveEffectivePack("deck-and-ui", packs, {});

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dislop-visual-bench-"));
  const materialized = [];

  try {
    for (const s of dataset.samples) {
      let buf = null;
      let diskPath = null;
      if (s.imageSpec) {
        buf = s.imageSpec.format === "jpeg" ? synthesizeJpeg(s.imageSpec) : synthesizePng(s.imageSpec);
        diskPath = path.join(tmpDir, `${s.id}.${s.imageSpec.format === "jpeg" ? "jpg" : "png"}`);
        fs.writeFileSync(diskPath, buf);
      } else if (s.pdfSpec) {
        buf = synthesizePdf(s.pdfSpec);
        diskPath = path.join(tmpDir, `${s.id}.pdf`);
        fs.writeFileSync(diskPath, buf);
      }
      materialized.push({ ...s, buf, diskPath });
    }

    // Encrypted PDF honesty probe
    const encPdfPath = path.join(tmpDir, "encrypted-honest.pdf");
    fs.writeFileSync(encPdfPath, synthesizePdf({ encrypted: true, pages: [{ width: 960, height: 540, fontRuns: [{ size: 12, text: "hidden" }] }] }));

    const t0 = performance.now();
    const arm1Rows = [];
    const arm2Rows = [];
    const arm3Rows = [];
    const arm4Rows = [];
    const perSampleNode = [];

    for (const s of materialized) {
      let coreFindings = [];
      let patternFindings = [];
      let parsedImage = null;

      if (s.modality === "image") {
        parsedImage = parseImageBuffer(s.buf);
        coreFindings = auditImageDocument(parsedImage, { filename: s.filename, pack: deckPack }).findings;
      } else if (s.modality === "pdf") {
        const parsedPdf = parsePdfBuffer(s.buf);
        coreFindings = auditPdfDocument(parsedPdf, { filename: s.filename, pack: deckPack }).findings;
      } else {
        coreFindings = auditText(s.content, { filename: s.filename, modality: s.modality, pack: deckPack }).findings;
        patternFindings = auditPatterns(s.content, { filename: s.filename, modality: s.modality, banks }).findings;
      }

      const coreIds = Array.from(new Set(coreFindings.map((f) => f.ruleId))).sort();
      const fullIds = Array.from(new Set([...coreIds, ...patternFindings.map((f) => f.ruleId)])).sort();

      // Arm 1 simulates v0.7.1: only 5 UI rules on HTML/CSS/JSX (no SVG <linearGradient>, no image, no pdf)
      const v071Ids =
        s.modality === "html" || s.modality === "css" || s.modality === "jsx"
          ? coreIds.filter((id) => V071_BASELINE_RULES.has(id))
          : [];

      arm1Rows.push({ id: s.id, modality: s.modality, expected: s.expected, predicted: v071Ids.length > 0 });
      arm2Rows.push({ id: s.id, modality: s.modality, expected: s.expected, predicted: naiveRegexDetector(s) });
      arm3Rows.push({ id: s.id, modality: s.modality, expected: s.expected, predicted: coreIds.length > 0 });
      arm4Rows.push({ id: s.id, modality: s.modality, expected: s.expected, predicted: fullIds.length > 0 });

      perSampleNode.push({
        id: s.id,
        modality: s.modality,
        expected: s.expected,
        expectedRuleIds: s.expectedRuleIds,
        coreRuleIds: coreIds,
        fullRuleIds: fullIds,
        pixelMetrics: parsedImage?.pixelMetrics || null,
      });
    }
    const jsElapsedMs = Number((performance.now() - t0).toFixed(2));

    // Python parity run
    const pyScript = `
import json, sys, time
from pathlib import Path
from dislop.engine import load_all_packs, resolve_effective_pack, audit_text, parse_image_bytes, audit_image_document, parse_pdf_bytes, audit_pdf_document
from dislop.pattern_engine import load_pattern_banks, audit_patterns

manifest = json.loads(sys.stdin.read())
packs = load_all_packs()
banks = load_pattern_banks()
deck_pack = resolve_effective_pack("deck-and-ui", packs, {})
t0 = time.perf_counter()
out = {}
for s in manifest["samples"]:
    mod = s["modality"]
    if mod == "image":
        parsed = parse_image_bytes(Path(s["diskPath"]).read_bytes())
        core_f = audit_image_document(parsed, filename=s["filename"], pack=deck_pack)["findings"]
        pat_f = []
    elif mod == "pdf":
        parsed = parse_pdf_bytes(Path(s["diskPath"]).read_bytes())
        core_f = audit_pdf_document(parsed, filename=s["filename"], pack=deck_pack)["findings"]
        pat_f = []
    else:
        core_f = audit_text(s["content"], filename=s["filename"], modality=mod, pack=deck_pack)["findings"]
        pat_f = audit_patterns(s["content"], filename=s["filename"], modality=mod, banks=banks)["findings"]
    core_ids = sorted({f["ruleId"] for f in core_f})
    full_ids = sorted(set(core_ids) | {f["ruleId"] for f in pat_f})
    out[s["id"]] = {"coreRuleIds": core_ids, "fullRuleIds": full_ids}

enc = parse_pdf_bytes(Path(manifest["encryptedPdf"]).read_bytes())
enc_res = audit_pdf_document(enc, filename="encrypted-honest.pdf", pack=deck_pack)
elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
print(json.dumps({"results": out, "encryptedSkipped": len(enc_res["skipped"]) > 0, "elapsedMs": elapsed_ms}))
`;

    const pyManifest = {
      samples: materialized.map((s) => ({
        id: s.id,
        modality: s.modality,
        filename: s.filename,
        content: s.content || "",
        diskPath: s.diskPath,
      })),
      encryptedPdf: encPdfPath,
    };

    const pyProc = spawnSync("python3", ["-c", pyScript], {
      cwd: ROOT,
      env: { ...process.env, PYTHONPATH: path.join(ROOT, "src") },
      input: JSON.stringify(pyManifest),
      encoding: "utf8",
    });
    if (pyProc.status !== 0) {
      throw new Error(`Python benchmark parity run failed:\n${pyProc.stderr}`);
    }
    const pyData = JSON.parse(pyProc.stdout);

    let parityMatches = 0;
    const parityMismatches = [];
    for (const item of perSampleNode) {
      const pyRow = pyData.results[item.id];
      const sameCore = JSON.stringify(item.coreRuleIds) === JSON.stringify(pyRow.coreRuleIds);
      const sameFull = JSON.stringify(item.fullRuleIds) === JSON.stringify(pyRow.fullRuleIds);
      if (sameCore && sameFull) {
        parityMatches += 1;
      } else {
        parityMismatches.push({ id: item.id, node: item.fullRuleIds, python: pyRow.fullRuleIds });
      }
    }

    // Encrypted PDF check in Node
    const encNode = auditPdfDocument(parsePdfBuffer(fs.readFileSync(encPdfPath)), {
      filename: "encrypted-honest.pdf",
      pack: deckPack,
    });

    // PNG pixel threshold ablation sweep (12 dataset images + repo assets/ PNGs)
    const repoAssetPngs = [
      path.join(ROOT, "assets", "og-card.png"),
      ...fs.readdirSync(path.join(ROOT, "assets", "demos"))
        .filter((f) => f.endsWith("-poster.png"))
        .map((f) => path.join(ROOT, "assets", "demos", f)),
    ];
    const assetParsed = repoAssetPngs.map((p) => ({
      name: path.relative(ROOT, p),
      parsed: parseImageBuffer(fs.readFileSync(p)),
    }));
    const paletteEvalSet = materialized
      .filter((s) => s.modality === "image" && s.imageSpec?.format === "png")
      .map((s) => ({
        id: s.id,
        expectedPalette: s.expectedRuleIds.includes("image-ai-palette-slop"),
        parsed: parseImageBuffer(s.buf),
      }));

    const ablationSweep = [];
    const purpleGrid = [0.08, 0.12, 0.16, 0.22];
    const smoothGrid = [0.45, 0.55, 0.65, 0.75];
    for (const pThr of purpleGrid) {
      for (const sThr of smoothGrid) {
        const evalPng = (parsed) => {
          const pm = parsed.pixelMetrics;
          if (!pm) return false;
          const isNeon =
            (pm.neonPurpleRatio >= pThr && pm.neutralRatio < 0.75) ||
            (pm.darkBgRatio >= 0.35 && pm.neonPurpleRatio + pm.neonCyanRatio >= 0.14 && pm.neonPurpleRatio >= 0.06);
          const isPlastic = pm.highSatRatio >= 0.38 && pm.smoothHighSatRatio >= sThr;
          return isNeon || isPlastic;
        };
        const rows = paletteEvalSet.map((item) => ({
          expected: item.expectedPalette ? "slop" : "clean",
          predicted: evalPng(item.parsed),
        }));
        const assetFps = assetParsed.filter((a) => evalPng(a.parsed)).map((a) => a.name);
        ablationSweep.push({
          neonPurpleThreshold: pThr,
          smoothHighSatThreshold: sThr,
          ...scoreMetrics(rows),
          repoAssetFalsePositives: assetFps.length,
        });
      }
    }

    const modalities = ["html-css-jsx", "svg", "image", "pdf"];
    const mapMod = (m) => (m === "html" || m === "css" || m === "jsx" ? "html-css-jsx" : m);
    const byModality = {};
    for (const mg of modalities) {
      byModality[mg] = {
        arm1_v071_baseline: scoreMetrics(arm1Rows.filter((r) => mapMod(r.modality) === mg)),
        arm2_naive_regex: scoreMetrics(arm2Rows.filter((r) => mapMod(r.modality) === mg)),
        arm3_dislop_core: scoreMetrics(arm3Rows.filter((r) => mapMod(r.modality) === mg)),
        arm4_dislop_full_patterns: scoreMetrics(arm4Rows.filter((r) => mapMod(r.modality) === mg)),
      };
    }

    const summary = {
      schema: "dislop.visual-bench-result/1",
      dataset: path.relative(ROOT, DATASET_PATH),
      totalSamples: materialized.length,
      arms: {
        arm1_v071_baseline: scoreMetrics(arm1Rows),
        arm2_naive_regex: scoreMetrics(arm2Rows),
        arm3_dislop_core: scoreMetrics(arm3Rows),
        arm4_dislop_full_patterns: scoreMetrics(arm4Rows),
      },
      byModality,
      parity: {
        matched: parityMatches,
        total: materialized.length,
        ratePct: Number(((parityMatches / materialized.length) * 100).toFixed(1)),
        mismatches: parityMismatches,
        encryptedPdfSkippedHonest: encNode.skipped.length > 0 && pyData.encryptedSkipped,
      },
      latency: {
        nodeTotalMs: jsElapsedMs,
        nodePerItemMs: Number((jsElapsedMs / materialized.length).toFixed(2)),
        pythonTotalMs: pyData.elapsedMs,
        pythonPerItemMs: Number((pyData.elapsedMs / materialized.length).toFixed(2)),
      },
      pixelAblation: {
        selectedThresholds: { neonPurpleRatio: 0.16, smoothHighSatRatio: 0.65 },
        repoAssetPngCount: assetParsed.length,
        sweep: ablationSweep,
      },
      samples: perSampleNode,
    };

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2) + "\n", "utf8");

    if (jsonMode) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`dislop visual-bench (${summary.totalSamples} samples across Web/SVG/PNG+JPEG/PDF)`);
      for (const [k, v] of Object.entries(summary.arms)) {
        console.log(`  ${k.padEnd(28)} P=${v.precision}% R=${v.recall}% F1=${v.f1}% FPR=${v.fpr}% (TP=${v.tp} FP=${v.fp} TN=${v.tn} FN=${v.fn})`);
      }
      console.log(`  Node/Python parity: ${summary.parity.matched}/${summary.parity.total} (${summary.parity.ratePct}%), encrypted PDF honest skip=${summary.parity.encryptedPdfSkippedHonest}`);
      console.log(`  Throughput: Node ${summary.latency.nodeTotalMs}ms (${summary.latency.nodePerItemMs}ms/item), Python ${summary.latency.pythonTotalMs}ms (${summary.latency.pythonPerItemMs}ms/item)`);
    }

    if (assertMode) {
      assert.equal(summary.arms.arm3_dislop_core.fpr, 0, "Arm 3 core should have 0% FPR on hard negatives");
      assert.equal(summary.arms.arm4_dislop_full_patterns.f1, 100, "Arm 4 full+patterns should hit 100% F1 on visual-design-v1");
      assert.equal(summary.arms.arm4_dislop_full_patterns.fpr, 0, "Arm 4 full+patterns should have 0% FPR");
      assert.equal(summary.parity.matched, summary.parity.total, `Node/Python mismatches: ${JSON.stringify(parityMismatches)}`);
      assert.equal(summary.parity.encryptedPdfSkippedHonest, true, "Encrypted PDF must report skipped honestly");
      for (const s of perSampleNode) {
        if (s.expected === "slop") {
          for (const req of s.expectedRuleIds) {
            assert.ok(s.fullRuleIds.includes(req), `Sample ${s.id} missed expected rule ${req} (got ${s.fullRuleIds})`);
          }
        }
      }
      const chosen = ablationSweep.find((r) => r.neonPurpleThreshold === 0.16 && r.smoothHighSatThreshold === 0.65);
      assert.ok(chosen && chosen.f1 === 100 && chosen.repoAssetFalsePositives === 0, "Selected PNG pixel threshold must achieve 100% F1 with 0 repo asset FPs");
      console.log("  [assert ok] all visual benchmark gates passed");
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
