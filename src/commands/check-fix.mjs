import { DislopConfigError, isInteractiveHumanTty, resolveLayeredConfig } from "../kernel/config.mjs";
import { expandTargetInputs } from "../kernel/file-discovery.mjs";
import { arbitrateExitCode, runDocumentPipeline } from "../kernel/pipeline.mjs";
import { resolveOrExtractVoiceProfile } from "../kernel/voice-profile.mjs";
import { runAutoFixOnDocumentResult } from "../runners/auto-fix.mjs";
import { runInteractiveTtySession } from "../runners/interactive-tty.mjs";
import { renderReports } from "../runners/reporters.mjs";
import { resolveExecutionRoute } from "../runtime/router.mjs";

const VALID_FORMATS = new Set(["text", "diff", "json", "agent", "sarif"]);

/**
 * `dislop check <files/globs...> [options]` — strictly read-only inspection.
 */
export async function runCheckCommand(targets, flags, io = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
    fetchImpl = globalThis.fetch,
    promptFn = null,
  } = io;

  const format = flags.json ? "json" : flags.format || "text";
  if (!VALID_FORMATS.has(format)) {
    throw new DislopConfigError(
      `Invalid --format '${format}' (expected text, diff, json, agent, or sarif)`,
    );
  }

  const files = expandTargetInputs(targets, { cwd });
  const isTty = isInteractiveHumanTty({ stdin, stdout, env });
  const config = resolveLayeredConfig({ cwd, env, cliFlags: flags });
  const route = await resolveExecutionRoute({
    config,
    isTty,
    env,
    stdin,
    stderr,
    fetchImpl,
    promptFn,
  });

  const voiceProfile = await resolveOrExtractVoiceProfile(config, { route });

  const results = [];
  let emittedHint = false;

  for (const filePath of files) {
    const res = await runDocumentPipeline({
      filePath,
      config,
      route,
      voiceProfile,
      cwd,
    });
    if (res.routeHint && !emittedHint) {
      stderr.write(`${res.routeHint}\n`);
      emittedHint = true;
    }
    results.push(res);
  }

  const uiLang =
    config.lang && config.lang !== "auto"
      ? config.lang
      : results[0]?.doc?.language || "en";

  const rendered = renderReports(results, format, { lang: uiLang });
  if (rendered) {
    stdout.write(rendered);
  }

  return arbitrateExitCode(results.map((r) => r.report));
}

/**
 * `dislop fix <files/globs...> [options]`
 * - With `--auto` / `--yes`: non-interactive batch application of `fixSafety === "safe"` items.
 * - Without `--auto`: interactive `git add -p` TTY hunk loop (`y/n/e/p/a/A/s/u/q`).
 */
export async function runFixCommand(targets, flags, io = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
    fetchImpl = globalThis.fetch,
    promptFn = null,
    keyReader = null,
    editorRunner = null,
    clipboardRunner = null,
  } = io;

  const isAuto = Boolean(flags.auto || flags.yes);
  const isTty = isInteractiveHumanTty({ stdin, stdout, env }) || Boolean(keyReader);

  if (!isAuto && !isTty) {
    throw new DislopConfigError(
      "Interactive 'dislop fix' requires an interactive terminal. Pass '--auto' to apply verified safe fixes in batch/CI/agent mode, or run 'dislop check' for read-only reports.",
    );
  }

  const files = expandTargetInputs(targets, { cwd });
  const config = resolveLayeredConfig({ cwd, env, cliFlags: flags });
  const route = await resolveExecutionRoute({
    config,
    isTty,
    env,
    stdin,
    stderr,
    fetchImpl,
    promptFn,
  });
  const voiceProfile = await resolveOrExtractVoiceProfile(config, { route });

  const results = [];
  let emittedHint = false;

  for (const filePath of files) {
    const docRes = await runDocumentPipeline({
      filePath,
      config,
      route,
      voiceProfile,
      cwd,
    });
    if (docRes.routeHint && !emittedHint) {
      stderr.write(`${docRes.routeHint}\n`);
      emittedHint = true;
    }

    if (isAuto) {
      const fixRes = runAutoFixOnDocumentResult(docRes, {
        dryRun: Boolean(flags.dryRun),
        backup: Boolean(flags.backup),
      });
      if (flags.dryRun && fixRes.diff && !flags.json) {
        stdout.write(`${fixRes.diff}\n`);
      } else if (!flags.json && flags.format !== "json") {
        stdout.write(
          `${docRes.report.file}: applied ${fixRes.appliedCount} safe fix(es); remaining defects=${docRes.report.summary.defects.error + docRes.report.summary.defects.warning}, suggestions=${docRes.report.summary.suggestions.strong + docRes.report.summary.suggestions.moderate + docRes.report.summary.suggestions.hint}\n`,
        );
      }
      results.push(docRes);
    } else {
      await runInteractiveTtySession(docRes, {
        stdin,
        stdout,
        env,
        dryRun: Boolean(flags.dryRun),
        backup: Boolean(flags.backup),
        keyReader,
        editorRunner,
        clipboardRunner,
      });
      results.push(docRes);
    }
  }

  if (flags.json || flags.format === "json") {
    stdout.write(renderReports(results, "json"));
  }

  return arbitrateExitCode(results.map((r) => r.report));
}
