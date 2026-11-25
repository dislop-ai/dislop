import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DislopConfigError } from "../kernel/config.mjs";
import { parseDocumentFile } from "../kernel/document-model.mjs";
import { verifyDocumentRevision } from "../kernel/fact-gate.mjs";

function extractComparableText(filePath) {
  const doc = parseDocumentFile(filePath);
  if (doc.segments.length > 0) {
    return doc.segments.map((s) => s.text).join("\n");
  }
  return fs.readFileSync(filePath, "utf8");
}

/**
 * `dislop verify <beforeFile> <afterFile> [--json]`
 * or `dislop verify --git [ref] <file> [--json]`
 */
export async function runVerifyCommand(positionals, flags, io = {}) {
  const { cwd = process.cwd(), stdout = process.stdout } = io;

  let beforeText = "";
  let afterText = "";
  let label = "";

  if (flags.git !== undefined && flags.git !== false) {
    const gitRef = typeof flags.git === "string" && flags.git.trim() ? flags.git.trim() : "HEAD";
    const targetArg = positionals[0];
    if (!targetArg) {
      throw new DislopConfigError(
        "Usage: dislop verify --git [ref] <file> (missing target file)",
      );
    }
    const absTarget = path.resolve(cwd, targetArg);
    if (!fs.existsSync(absTarget)) {
      throw new DislopConfigError(`Target file not found: '${targetArg}'`);
    }

    let repoRoot;
    try {
      repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: path.dirname(absTarget),
        encoding: "utf8",
      }).trim();
    } catch (err) {
      throw new DislopConfigError(`Unable to locate git repository for --git verify: ${err.message}`);
    }

    const relGitPath = path.relative(repoRoot, absTarget).replace(/\\/g, "/");
    try {
      beforeText = execFileSync("git", ["show", `${gitRef}:${relGitPath}`], {
        cwd: repoRoot,
        encoding: "utf8",
      });
    } catch (err) {
      throw new DislopConfigError(
        `Could not read '${relGitPath}' at git ref '${gitRef}': ${err.message}`,
      );
    }
    afterText = fs.readFileSync(absTarget, "utf8");
    label = `${gitRef}:${relGitPath} -> ${targetArg}`;
  } else {
    if (positionals.length < 2) {
      throw new DislopConfigError(
        "Usage: dislop verify <before-file> <after-file> (or dislop verify --git [ref] <file>)",
      );
    }
    const beforePath = path.resolve(cwd, positionals[0]);
    const afterPath = path.resolve(cwd, positionals[1]);
    if (!fs.existsSync(beforePath)) {
      throw new DislopConfigError(`Before file not found: '${positionals[0]}'`);
    }
    if (!fs.existsSync(afterPath)) {
      throw new DislopConfigError(`After file not found: '${positionals[1]}'`);
    }
    beforeText = extractComparableText(beforePath);
    afterText = extractComparableText(afterPath);
    label = `${positionals[0]} -> ${positionals[1]}`;
  }

  const verification = verifyDocumentRevision(beforeText, afterText);
  const payload = {
    schema: "dislop.verify/1",
    target: label,
    ...verification,
  };

  if (flags.json || flags.format === "json") {
    stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (verification.ok) {
    stdout.write(`PASS ${label}: all protected facts preserved; 0 second-order slop regressions.\n`);
  } else {
    stdout.write(`FAIL ${label}:\n`);
    for (const reason of verification.droppedFacts) {
      stdout.write(`  - Fact Gate: ${reason}\n`);
    }
    for (const reg of verification.regressions) {
      stdout.write(`  - Regression (${reg.id}): ${reg.message}\n`);
    }
  }

  return verification.ok ? 0 : 1;
}
