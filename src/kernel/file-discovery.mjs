import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DislopConfigError } from "./config.mjs";
import { detectFormatFromPath } from "./document-model.mjs";

const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  ".dislop",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
]);

function resolveComparablePath(targetPath) {
  const abs = path.resolve(targetPath);
  if (fs.existsSync(abs)) {
    return fs.realpathSync(abs);
  }
  const parent = path.dirname(abs);
  if (fs.existsSync(parent)) {
    return path.join(fs.realpathSync(parent), path.basename(abs));
  }
  return abs;
}

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

export function compileIgnoreMatchers(ignorePatterns = []) {
  const fileRegexes = [];
  const dirPrefixes = [];

  for (const raw of ignorePatterns) {
    const clean = String(raw || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.\//, "");
    if (!clean) continue;

    for (const pattern of expandBraces(clean)) {
      if (pattern.endsWith("/**")) {
        const prefix = pattern.slice(0, -3).replace(/\/+$/, "");
        if (prefix) dirPrefixes.push(prefix);
      } else if (pattern.endsWith("/")) {
        const prefix = pattern.slice(0, -1);
        if (prefix) {
          dirPrefixes.push(prefix);
          fileRegexes.push(globToRegExp(`${prefix}/**`));
          continue;
        }
      }
      fileRegexes.push(globToRegExp(pattern));
    }
  }

  return (relPosix, isDirectory = false) => {
    const norm = String(relPosix || "").replace(/\\/g, "/").replace(/^\.\//, "");
    if (!norm) return false;
    if (dirPrefixes.some((p) => norm === p || norm.startsWith(`${p}/`))) {
      return true;
    }
    if (isDirectory) return false;
    return fileRegexes.some((rx) => rx.test(norm));
  };
}

function walkDirectorySupportedFiles(rootDir, ignoreRoot, isIgnored, collector) {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const full = path.join(rootDir, entry.name);
    const rel = path
      .relative(ignoreRoot, resolveComparablePath(full))
      .replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORED_DIRS.has(entry.name) || isIgnored(rel, true)) continue;
      walkDirectorySupportedFiles(full, ignoreRoot, isIgnored, collector);
    } else if (entry.isFile()) {
      if (isIgnored(rel, false)) continue;
      if (detectFormatFromPath(full)) {
        collector.push(full);
      }
    }
  }
}

function walkAllFilesRelative(baseDir, relPrefix, ignoreRoot, isIgnored, collector) {
  if (!fs.existsSync(baseDir)) return;
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const full = path.join(baseDir, entry.name);
    const relIgnore = path
      .relative(ignoreRoot, resolveComparablePath(full))
      .replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORED_DIRS.has(entry.name) || isIgnored(relIgnore, true)) continue;
      walkAllFilesRelative(full, rel, ignoreRoot, isIgnored, collector);
    } else if (entry.isFile()) {
      if (isIgnored(relIgnore, false)) continue;
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
export function expandTargetInputs(
  inputs,
  { cwd = process.cwd(), ignorePatterns = [], projectRoot = null } = {},
) {
  if (!inputs || inputs.length === 0) {
    throw new DislopConfigError("Missing target <files/globs...>. Example: dislop check README.md");
  }

  const ignoreRoot = resolveComparablePath(projectRoot || cwd);
  const isIgnored = compileIgnoreMatchers(ignorePatterns);
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
        walkDirectorySupportedFiles(abs, ignoreRoot, isIgnored, dirFiles);
        for (const f of dirFiles) found.add(f);
      } else if (stat.isFile()) {
        if (!detectFormatFromPath(abs)) {
          throw new DislopConfigError(`Unsupported file extension: '${input}'`);
        }
        const relIgnore = path
          .relative(ignoreRoot, resolveComparablePath(abs))
          .replace(/\\/g, "/");
        if (!isIgnored(relIgnore, false)) {
          found.add(abs);
        }
      }
      continue;
    }

    // Glob pattern expansion
    const expandedPatterns = expandBraces(input);
    const regexes = expandedPatterns.map(globToRegExp);
    const candidates = [];
    walkAllFilesRelative(cwd, "", ignoreRoot, isIgnored, candidates);

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

function splitNulBuffer(buf) {
  if (!buf || buf.length === 0) return [];
  return buf
    .toString("utf8")
    .split("\0")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Discover git-changed deliverable files (`--changed` or `--since <ref>`) using NUL-delimited output.
 */
export function discoverChangedFiles({
  cwd = process.cwd(),
  since = null,
  ignorePatterns = [],
  projectRoot = null,
} = {}) {
  let gitRoot;
  try {
    gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new DislopConfigError(
      `'--changed' / '--since' requires a git repository (not found from '${cwd}').`,
    );
  }

  const relCandidates = new Set();
  const collectGitZ = (args) => {
    const out = execFileSync("git", args, {
      cwd: gitRoot,
      encoding: null,
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const rel of splitNulBuffer(out)) {
      relCandidates.add(rel);
    }
  };

  if (since) {
    try {
      collectGitZ(["diff", "-z", "--name-only", "--diff-filter=ACMR", since]);
    } catch (err) {
      throw new DislopConfigError(`Invalid git ref '${since}' for --since: ${err.message}`);
    }
  } else {
    let hasHead = false;
    try {
      execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
        cwd: gitRoot,
        stdio: "ignore",
      });
      hasHead = true;
    } catch {
      hasHead = false;
    }
    if (hasHead) {
      collectGitZ(["diff", "-z", "--name-only", "--diff-filter=ACMR", "HEAD"]);
    } else {
      collectGitZ(["diff", "--cached", "-z", "--name-only", "--diff-filter=ACMR"]);
    }
  }
  collectGitZ(["ls-files", "-z", "--others", "--exclude-standard"]);

  const realGitRoot = resolveComparablePath(gitRoot);
  const ignoreRoot = resolveComparablePath(projectRoot || gitRoot);
  const isIgnored = compileIgnoreMatchers(ignorePatterns);
  const resolved = new Set();
  for (const rel of relCandidates) {
    const abs = path.resolve(realGitRoot, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const realAbs = resolveComparablePath(abs);
    const relFromRoot = path.relative(realGitRoot, realAbs).replace(/\\/g, "/");
    // Confine symlinked targets inside the canonical git repository root
    if (relFromRoot.startsWith("..") || path.isAbsolute(relFromRoot)) continue;
    if (!detectFormatFromPath(abs)) continue;
    if (
      rel.replace(/\\/g, "/").split("/").includes(".dislop") ||
      relFromRoot.split("/").includes(".dislop")
    ) {
      continue;
    }
    const relFromIgnore = path.relative(ignoreRoot, realAbs).replace(/\\/g, "/");
    if (isIgnored(relFromIgnore, false) || isIgnored(relFromRoot, false)) continue;
    resolved.add(abs);
  }

  return Array.from(resolved).sort();
}
