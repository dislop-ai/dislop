#!/usr/bin/env node
/**
 * Zero-dependency bundler for the dislop VS Code & Open VSX extension (desktop + web).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXT_ROOT, "..", "..");

function loadPacksWithoutFixtures() {
  const packsDir = path.join(REPO_ROOT, "packs");
  const out = {};
  for (const entry of fs.readdirSync(packsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const p = path.join(packsDir, entry.name, "pack.json");
    if (!fs.existsSync(p)) continue;
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    out[raw.id] = {
      ...raw,
      rules: (raw.rules || []).map((rule) => {
        const clone = { ...rule };
        delete clone.fixtures;
        return clone;
      }),
    };
  }
  return out;
}

function stripEsmModuleSyntax(source, { exportSymbolMap = false } = {}) {
  let code = source.replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?\s*\n?/gm, "");
  code = code.replace(/^export\s+(?=(?:async\s+)?function\b|const\b|let\b|var\b|class\b)/gm, "");
  if (exportSymbolMap) {
    code = `${code}\nmodule.exports = { activate, deactivate };\n`;
  }
  return code;
}

function buildBundle({ isWeb, packs, coreCode, diagCode, extCode }) {
  const wrappedExt = stripEsmModuleSyntax(extCode, { exportSymbolMap: true });
  return [
    `"use strict";`,
    `const vscode = require("vscode");`,
    `const __DISLOP_IS_WEB__ = ${JSON.stringify(Boolean(isWeb))};`,
    `const __DISLOP_PACKS__ = ${JSON.stringify(packs)};`,
    "",
    "// --- src/core.mjs ---",
    stripEsmModuleSyntax(coreCode),
    "",
    "// --- integrations/vscode/src/diagnostics.mjs ---",
    stripEsmModuleSyntax(diagCode),
    "",
    "// --- integrations/vscode/src/extension.mjs ---",
    wrappedExt,
  ].join("\n");
}

function main() {
  const packs = loadPacksWithoutFixtures();
  const coreCode = fs.readFileSync(path.join(REPO_ROOT, "src", "core.mjs"), "utf8");
  const diagCode = fs.readFileSync(path.join(EXT_ROOT, "src", "diagnostics.mjs"), "utf8");
  const extCode = fs.readFileSync(path.join(EXT_ROOT, "src", "extension.mjs"), "utf8");

  const distDir = path.join(EXT_ROOT, "dist");
  const webDistDir = path.join(distDir, "web");
  fs.mkdirSync(webDistDir, { recursive: true });

  const desktopBundle = buildBundle({ isWeb: false, packs, coreCode, diagCode, extCode });
  const webBundle = buildBundle({ isWeb: true, packs, coreCode, diagCode, extCode });

  const desktopPath = path.join(distDir, "extension.js");
  const webPath = path.join(webDistDir, "extension.js");
  fs.writeFileSync(desktopPath, desktopBundle, "utf8");
  fs.writeFileSync(webPath, webBundle, "utf8");
  fs.copyFileSync(path.join(REPO_ROOT, "LICENSE"), path.join(EXT_ROOT, "LICENSE"));

  const desktopKb = Buffer.byteLength(desktopBundle, "utf8") / 1024;
  const webKb = Buffer.byteLength(webBundle, "utf8") / 1024;
  assert.ok(desktopKb < 350, `Desktop bundle too large: ${desktopKb.toFixed(1)} KB >= 350 KB`);
  assert.ok(webKb < 350, `Web bundle too large: ${webKb.toFixed(1)} KB >= 350 KB`);

  console.log(
    `Built VS Code bundles: dist/extension.js (${desktopKb.toFixed(1)} KB), dist/web/extension.js (${webKb.toFixed(1)} KB)`
  );
}

main();
