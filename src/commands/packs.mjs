import { listBuiltinPackIds, loadSinglePack } from "../kernel/pack-loader.mjs";

/**
 * `dislop packs [--json]` — inspect built-in multi-level Packs via `pack.json` metadata
 * without importing `scripts/` or reading `prompts/`.
 */
export async function runPacksCommand(_positionals, flags, io = {}) {
  const { cwd = process.cwd(), stdout = process.stdout } = io;

  const ids = listBuiltinPackIds();
  const details = [];
  for (const id of ids) {
    const p = await loadSinglePack(id, { cwd });
    details.push({
      name: p.name,
      version: p.version,
      description: p.description,
      languages: p.languages || ["all"],
      formats: p.formats || ["all"],
      hasScripts: Boolean(p.hasScripts),
      hasPrompts: Boolean(p.hasPrompts),
      scriptFileCount: p.loadStats?.scriptFileCount ?? 0,
      promptFileCount: p.loadStats?.promptFileCount ?? 0,
    });
  }

  if (flags.json || flags.format === "json") {
    stdout.write(`${JSON.stringify({ packs: details }, null, 2)}\n`);
    return 0;
  }

  stdout.write("Built-in Packs (Layout: packs/<scope-or-lang>/<scenario>/{pack.json,scripts/,prompts/}):\n");
  for (const d of details) {
    const layers = [
      d.hasScripts ? `scripts(${d.scriptFileCount})` : null,
      d.hasPrompts ? `prompts(${d.promptFileCount})` : null,
    ]
      .filter(Boolean)
      .join(", ");
    stdout.write(`  - ${d.name} (v${d.version}) [${layers}]\n`);
    stdout.write(`    ${d.description}\n`);
  }
  return 0;
}
