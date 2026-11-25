import fs from "node:fs";
import path from "node:path";
import { DislopConfigError } from "./config.mjs";
import { detectFormatFromPath } from "./document-model.mjs";

const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
]);

function expandBraces(pattern) {
  const m = String(pattern || "").match(/\{([^{}]+)\}/);
  if (!m) return [String(pattern || "")];
  const prefix = pattern.slice(0, m.index);
  const suffix = pattern.slice(m.index + m[0].length);
  return m[1].split(",").flatMap((part) => expandBraces(prefix + part.trim() + suffix));
}

function globToRegExp(glob) {
  const norm = String(glob || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
  let rx = "^";
  for (let i = 0; i < norm.length; i += 1) {
    const ch = norm[i];
    if (ch === "*" && norm[i + 1] === "*") {
      if (norm[i + 2] === "/") {
        rx += "(?:.+/)?";
        i += 2;
      } else {
        rx += ".*";
        i += 1;
      }
    } else if (ch === "*") {
      rx += "[^/]*";
    } else if (ch === "?") {
      rx += "[^/]";
    } else if ("+.^$|()[]{}".includes(ch)) {
      rx += `\\${ch}`;
    } else {
      rx += ch;
    }
  }
  rx += "$";
  return new RegExp(rx);
}

function walkDirectorySupportedFiles(rootDir, collector) {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue;
      walkDirectorySupportedFiles(path.join(rootDir, entry.name), collector);
    } else if (entry.isFile()) {
      const full = path.join(rootDir, entry.name);
      if (detectFormatFromPath(full)) {
        collector.push(full);
      }
    }
  }
}

function walkAllFilesRelative(baseDir, relPrefix, collector) {
  if (!fs.existsSync(baseDir)) return;
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const full = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue;
      walkAllFilesRelative(full, rel, collector);
    } else if (entry.isFile()) {
      collector.push({ rel, full });
    }
  }
}

function hasGlobMagic(input) {
  return /[*?{}]/.test(input);
}

/**
 * Expand positional file, directory, and glob targets into sorted absolute file paths.
 */
export function expandTargetInputs(inputs, { cwd = process.cwd() } = {}) {
  if (!inputs || inputs.length === 0) {
    throw new DislopConfigError("Missing target <files/globs...>. Example: dislop check README.md");
  }

  const found = new Set();

  for (const rawInput of inputs) {
    const input = String(rawInput || "").trim();
    if (!input) continue;

    if (!hasGlobMagic(input)) {
      const abs = path.resolve(cwd, input);
      if (!fs.existsSync(abs)) {
        throw new DislopConfigError(`Target path does not exist: '${input}'`);
      }
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        const dirFiles = [];
        walkDirectorySupportedFiles(abs, dirFiles);
        for (const f of dirFiles) found.add(f);
      } else if (stat.isFile()) {
        if (!detectFormatFromPath(abs)) {
          throw new DislopConfigError(`Unsupported file extension: '${input}'`);
        }
        found.add(abs);
      }
      continue;
    }

    // Glob pattern expansion
    const expandedPatterns = expandBraces(input);
    const regexes = expandedPatterns.map(globToRegExp);
    const candidates = [];
    walkAllFilesRelative(cwd, "", candidates);

    let matchedAny = false;
    for (const cand of candidates) {
      if (regexes.some((rx) => rx.test(cand.rel)) && detectFormatFromPath(cand.full)) {
        found.add(cand.full);
        matchedAny = true;
      }
    }
    if (!matchedAny) {
      throw new DislopConfigError(`Glob pattern matched no supported files: '${input}'`);
    }
  }

  return Array.from(found).sort();
}
