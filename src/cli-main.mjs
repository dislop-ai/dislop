import { parseArgs } from "node:util";
import { runCheckCommand, runFixCommand } from "./commands/check-fix.mjs";
import { runDoctorCommand } from "./commands/doctor.mjs";
import { runInitCommand } from "./commands/init.mjs";
import { runLoginCommand, runLogoutCommand } from "./commands/login.mjs";
import { runModelCommand } from "./commands/model.mjs";
import { runPacksCommand } from "./commands/packs.mjs";
import { runVerifyCommand } from "./commands/verify.mjs";
import { runVoiceCommand } from "./commands/voice.mjs";
import { DislopConfigError } from "./kernel/config.mjs";
import { startStdioMcpServer } from "./mcp/stdio-server.mjs";
import { detectOllamaBinary } from "./runtime/providers/local-model.mjs";

export const CLI_VERSION = "1.0.0";

export function buildHelpText(env = process.env) {
  const ollama = detectOllamaBinary(env);
  const ollamaStatusLine = ollama.installed
    ? `  Status: Ollama detected (${ollama.binaryPath}).`
    : "  Status: Ollama is MISSING on this machine — install from https://ollama.com (e.g., 'brew install ollama') before using Tier 3 local LLM checks or 'dislop model pull'.";

  return `dislop v${CLI_VERSION} — Pluggable Editorial & Artifact Linter (Node.js Micro-Kernel)

Usage:
  dislop check <files/globs...> [options]     Read-only Dual-Track audit (Defects & Suggestions)
  dislop fix <files/globs...> [options]       Interactive hunk review in TTY, or batch safe fixes (--auto)
  dislop verify <before> <after> [--json]     Verify edits preserved facts, units, links, and entities
  dislop verify --git [ref] <file> [--json]   Verify working-tree edits against a Git revision
  dislop init [--global] [--voice <glob>]     Initialize .dislop.json or ~/.config/dislop/config.json
  dislop login [--token <dslp_*>]             Save Official Cloud credentials (~/.config/dislop/credentials.json)
  dislop logout                               Remove saved Official Cloud credentials
  dislop voice <extract|show|clear> [files]   Manage personal voice baseline (voice.json)
  dislop model <list|pull|rm> [name]          Manage Tier 3 local models (requires Ollama)
  dislop packs [--json]                       List built-in multi-level Packs
  dislop doctor [--json]                      Inspect active routing tier, Ollama status, auth, config, and Packs
  dislop mcp                                  Start local stdio MCP server for coding & office agents

Options (check / fix):
  --auto, -y                                  (fix only) Apply verified fixSafety === "safe" items non-interactively
  --json                                      Emit pure dislop.report/1 JSON to stdout (diagnostics to stderr)
  --format <text|diff|json|agent|sarif>       Output format ('agent' = token-compact feed for AI agents)
  --pack <names/paths...>                     Mount specific Packs (comma-separated or repeated)
  --no-llm                                    Run deterministic Script Packs (pack.check) only
  --voice <files/globs...>                    Align review with hand-written voice reference files
  --level <strong|moderate|hint|all>          Filter Suggestion priority threshold (default: all)
  --engine <local|auto|cloud|byok>            Routing tier (default: local; Tier 3 local LLM requires Ollama)
  --provider <name>                           Select named provider from config.json
  --dry-run                                   Preview unified diff without modifying files on disk
  --backup                                    Create <file>.bak before atomic write
  --lang <auto|en|zh>                         Diagnostic language ('auto' matches target document language)
  --help, -h                                  Show this help message
  --version, -v                               Print version

Tier 3 Local LLM Prerequisite (Ollama):
  Tier 3 local semantic checks ('--engine local' & 'dislop model pull') require Ollama (https://ollama.com).
  Without Ollama or an installed local model, default 'local' routing runs offline deterministic Packs only.
  Setup: install Ollama ('brew install ollama'), start 'ollama serve', then run 'dislop model pull'.
${ollamaStatusLine}

Exit Codes:
  0  Pass (zero unresolved Defect: error items; prose Suggestions never fail CI)
  1  Unresolved Defect: error found (or Fact Gate failure in 'dislop verify')
  2  CLI usage, configuration, auth, missing Ollama on 'model pull', or unreadable file error
`;
}

function splitCommaValues(values) {
  if (!values) return [];
  const arr = Array.isArray(values) ? values : [values];
  return arr
    .flatMap((v) => String(v).split(","))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse CLI arguments and execute the requested `dislop` subcommand.
 * Returns integer process exit code (`0`, `1`, or `2`).
 */
export async function runCli(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;

  try {
    // Handle `--git` with optional ref value cleanly before `util.parseArgs`
    const normalizedArgv = [];
    for (let i = 0; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--git") {
        const next = argv[i + 1];
        // Heuristic: if only 1 positional remains after `next`, `next` is the git ref; otherwise `HEAD`
        const remainingNonFlags = argv.slice(i + 1).filter((a) => !a.startsWith("-"));
        if (next && !next.startsWith("-") && remainingNonFlags.length >= 2) {
          normalizedArgv.push(`--git=${next}`);
          i += 1;
        } else {
          normalizedArgv.push("--git=HEAD");
        }
      } else {
        normalizedArgv.push(arg);
      }
    }

    let parsed;
    try {
      parsed = parseArgs({
        args: normalizedArgv,
        allowPositionals: true,
        strict: true,
        options: {
          help: { type: "boolean", short: "h" },
          version: { type: "boolean", short: "v" },
          auto: { type: "boolean" },
          yes: { type: "boolean", short: "y" },
          json: { type: "boolean" },
          format: { type: "string" },
          pack: { type: "string", multiple: true },
          "no-llm": { type: "boolean" },
          voice: { type: "string", multiple: true },
          level: { type: "string" },
          engine: { type: "string" },
          provider: { type: "string" },
          "dry-run": { type: "boolean" },
          backup: { type: "boolean" },
          lang: { type: "string" },
          global: { type: "boolean" },
          force: { type: "boolean" },
          token: { type: "string" },
          endpoint: { type: "string" },
          git: { type: "string" },
        },
      });
    } catch (err) {
      throw new DislopConfigError(err.message);
    }

    const { values, positionals } = parsed;

    if (values.version) {
      stdout.write(`${CLI_VERSION}\n`);
      return 0;
    }

    if (values.help || positionals.length === 0) {
      stdout.write(buildHelpText(io.env || process.env));
      return positionals.length === 0 && !values.help ? 2 : 0;
    }

    const subcommand = positionals[0];
    const restPositionals = positionals.slice(1);

    const flags = {
      auto: Boolean(values.auto),
      yes: Boolean(values.yes),
      json: Boolean(values.json),
      format: values.format || null,
      packs: values.pack ? splitCommaValues(values.pack) : null,
      noLlm: Boolean(values["no-llm"]),
      voiceFiles: values.voice ? splitCommaValues(values.voice) : null,
      level: values.level || null,
      engine: values.engine || null,
      provider: values.provider || null,
      dryRun: Boolean(values["dry-run"]),
      backup: Boolean(values.backup),
      lang: values.lang || null,
      global: Boolean(values.global),
      force: Boolean(values.force),
      token: values.token || null,
      endpoint: values.endpoint || null,
      git: values.git,
    };

    switch (subcommand) {
      case "check":
        return await runCheckCommand(restPositionals, flags, io);
      case "fix":
        return await runFixCommand(restPositionals, flags, io);
      case "verify":
        return await runVerifyCommand(restPositionals, flags, io);
      case "init":
        return await runInitCommand(restPositionals, flags, io);
      case "login":
        return await runLoginCommand(restPositionals, flags, io);
      case "logout":
        return await runLogoutCommand(restPositionals, flags, io);
      case "voice":
        return await runVoiceCommand(restPositionals, flags, io);
      case "model":
        return await runModelCommand(restPositionals, flags, io);
      case "packs":
        return await runPacksCommand(restPositionals, flags, io);
      case "doctor":
        return await runDoctorCommand(restPositionals, flags, io);
      case "mcp":
        startStdioMcpServer(io);
        return 0;
      default:
        throw new DislopConfigError(
          `Unknown subcommand '${subcommand}'. Did you mean 'dislop check ${subcommand}' or 'dislop fix ${subcommand}'? Run 'dislop --help' for usage.`,
        );
    }
  } catch (err) {
    const code = err?.exitCode || 2;
    stderr.write(`dislop error: ${err?.message || String(err)}\n`);
    return code;
  }
}
