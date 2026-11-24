#!/usr/bin/env node
/**
 * Synchronize and validate all multi-surface distribution manifests from a single source of truth.
 *
 * Usage:
 *   node scripts/sync_manifests.mjs                  # Write/update manifests (default channel: github)
 *   node scripts/sync_manifests.mjs --check          # Verify all manifests match SSOT and pass schema guards
 *   node scripts/sync_manifests.mjs --channel registry  # Switch .mcp.json / mcp.json to published npm `dislop@<version>`
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const channelIdx = args.indexOf("--channel");
const explicitChannel = channelIdx >= 0 ? args[channelIdx + 1] : null;

const coreMjs = fs.readFileSync(path.join(ROOT, "src", "core.mjs"), "utf8");
const pyEngine = fs.readFileSync(path.join(ROOT, "src", "dislop", "engine.py"), "utf8");
const jsVerMatch = coreMjs.match(/export const ENGINE_VERSION = "([^"]+)";/);
const pyVerMatch = pyEngine.match(/ENGINE_VERSION = "([^"]+)"/);

assert.ok(jsVerMatch, "Could not extract ENGINE_VERSION from src/core.mjs");
assert.ok(pyVerMatch, "Could not extract ENGINE_VERSION from src/dislop/engine.py");
assert.equal(
  jsVerMatch[1],
  pyVerMatch[1],
  `Engine version mismatch: src/core.mjs (${jsVerMatch[1]}) !== src/dislop/engine.py (${pyVerMatch[1]})`
);

const VERSION = jsVerMatch[1];

// Default to published npm/PyPI registry coordinates now that `dislop` is live on npmjs.org and PyPI
const channel = explicitChannel || "registry";
assert.ok(channel === "github" || channel === "registry", `Invalid --channel '${channel}' (expected github or registry)`);

const npxPackageSpec = channel === "registry" ? `dislop@${VERSION}` : "github:dislop-ai/dislop";

const META = {
  name: "dislop",
  mcpName: "io.github.dislop-ai/dislop",
  version: VERSION,
  homepage: "https://dislop.com",
  privacyUrl: "https://dislop.com/privacy.md",
  remoteMcpUrl: "https://dislop.com/mcp",
  repoUrl: "https://github.com/dislop-ai/dislop",
  author: {
    name: "dislop-ai",
    url: "https://dislop.com",
  },
  license: "Apache-2.0",
  brandColor: "#F04438",
  shortSubtitle: "Linter for AI Slop",
  serverDescription: "Cutting AI slop is real productivity. Linter for AI Slop in docs, web UI & slides (Cloud MCP).",
  pluginDescription:
    "Cutting AI slop is real productivity. Linter for AI Slop with vetted rules (7 packs, 53 rules, 65 patterns) across pure-doc Skill, offline CLI, and Official Cloud MCP.",
  keywords: [
    "anti-slop",
    "de-slop",
    "ai-slop",
    "humanizer",
    "writing",
    "linter",
    "proofreading",
    "mcp",
    "agent-skill",
    "docx",
    "pptx",
  ],
  defaultPrompts: [
    "Check my draft for AI slop, replacement slogans, and template UI while keeping every number and qualifier intact.",
    "Audit docs/ and slides for AI artifacts, clichés, and rhythm monotony with dislop.",
    "Review this HTML/JSX page with the deck-and-ui pack for dead links, neon gradients, and pill soup.",
  ],
};

// Schema invariants enforced at build/CI time
assert.ok(
  META.serverDescription.length <= 100,
  `server.json description exceeds 100-char MCP Registry cap (${META.serverDescription.length} chars)`
);
assert.ok(
  META.shortSubtitle.length <= 30,
  `OpenAI interface.shortDescription exceeds 30-char cap (${META.shortSubtitle.length} chars)`
);

const remoteHttpServerEntry = {
  type: "http",
  url: META.remoteMcpUrl,
};

const targets = [
  {
    rel: ".mcp.json",
    content:
      JSON.stringify(
        {
          mcpServers: {
            dislop: remoteHttpServerEntry,
          },
        },
        null,
        2
      ) + "\n",
  },
  {
    rel: "mcp.json",
    content:
      JSON.stringify(
        {
          $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
          mcpServers: {
            dislop: remoteHttpServerEntry,
          },
        },
        null,
        2
      ) + "\n",
  },
  {
    // Strictly closed top-level schema per https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
    rel: "plugin.json",
    content:
      JSON.stringify(
        {
          $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
          name: META.name,
          version: META.version,
          description: META.pluginDescription,
          author: META.author,
          homepage: META.homepage,
          repository: META.repoUrl,
          license: META.license,
          keywords: META.keywords,
          extensions: {
            "com.openai": {
              interface: {
                displayName: "dislop",
                shortDescription: META.shortSubtitle,
                longDescription: META.pluginDescription,
                developerName: META.author.name,
                category: "Productivity",
                capabilities: ["Interactive", "Read"],
                defaultPrompt: META.defaultPrompts[0],
              },
            },
          },
        },
        null,
        2
      ) + "\n",
  },
  {
    rel: ".codex-plugin/plugin.json",
    content:
      JSON.stringify(
        {
          name: META.name,
          version: META.version,
          description: META.pluginDescription,
          author: META.author,
          homepage: META.homepage,
          repository: META.repoUrl,
          license: META.license,
          keywords: META.keywords,
          skills: "./skills/",
          mcpServers: "./.mcp.json",
          interface: {
            displayName: "dislop",
            shortDescription: META.shortSubtitle,
            longDescription: META.pluginDescription,
            developerName: META.author.name,
            category: "Productivity",
            capabilities: ["Interactive", "Read"],
            websiteURL: META.homepage,
            privacyPolicyURL: META.privacyUrl,
            composerIcon: "./assets/logo.svg",
            logo: "./assets/logo.svg",
            logoDark: "./assets/logo.svg",
            defaultPrompt: META.defaultPrompts,
            brandColor: META.brandColor,
            screenshots: [],
          },
        },
        null,
        2
      ) + "\n",
  },
  {
    rel: ".agents/plugins/marketplace.json",
    content:
      JSON.stringify(
        {
          name: "dislop-ai",
          interface: {
            displayName: "dislop Official Plugins",
          },
          plugins: [
            {
              name: META.name,
              source: {
                source: "local",
                path: ".",
              },
              policy: {
                installation: "AVAILABLE",
                authentication: "ON_INSTALL",
              },
              category: "Productivity",
            },
          ],
        },
        null,
        2
      ) + "\n",
  },
  {
    rel: ".claude-plugin/plugin.json",
    content:
      JSON.stringify(
        {
          name: META.name,
          version: META.version,
          description: META.pluginDescription,
          author: META.author,
          homepage: META.homepage,
          privacyPolicyUrl: META.privacyUrl,
          repository: META.repoUrl,
          license: META.license,
          keywords: ["anti-slop", "de-slop", "writing", "linter", "mcp", "skill"],
          skills: "./skills/",
          mcpServers: "./.mcp.json",
        },
        null,
        2
      ) + "\n",
  },
  {
    rel: ".claude-plugin/marketplace.json",
    content:
      JSON.stringify(
        {
          name: "dislop-ai",
          owner: {
            name: "dislop-ai",
            url: "https://github.com/dislop-ai",
          },
          metadata: {
            description: "Official dislop plugin marketplace: pure-doc Agent Skill and Official Cloud MCP.",
            version: META.version,
          },
          plugins: [
            {
              name: META.name,
              source: "./",
              description: META.pluginDescription,
              version: META.version,
              author: META.author,
              homepage: META.homepage,
              repository: META.repoUrl,
              license: META.license,
              keywords: ["anti-slop", "writing", "ui", "mcp", "skill"],
            },
          ],
        },
        null,
        2
      ) + "\n",
  },
  {
    rel: "gemini-extension.json",
    content:
      JSON.stringify(
        {
          name: META.name,
          version: META.version,
          description: META.pluginDescription,
          mcpServers: {
            dislop: {
              httpUrl: META.remoteMcpUrl,
            },
          },
        },
        null,
        2
      ) + "\n",
  },
  {
    rel: "server.json",
    content:
      JSON.stringify(
        {
          $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
          name: META.mcpName,
          title: "dislop",
          description: META.serverDescription,
          version: META.version,
          websiteUrl: META.homepage,
          icons: [
            {
              src: "https://dislop.com/assets/logo.svg",
              mimeType: "image/svg+xml",
            },
          ],
          repository: {
            url: META.repoUrl,
            source: "github",
          },
          remotes: [
            {
              type: "streamable-http",
              url: META.remoteMcpUrl,
            },
          ],
        },
        null,
        2
      ) + "\n",
  },
  {
    rel: "skills/dislop/agents/openai.yaml",
    content: [
      "interface:",
      '  display_name: "dislop"',
      '  short_description: "Cutting AI slop is real productivity — Linter for AI Slop"',
      `  default_prompt: "Use $dislop to check my draft for AI slop, replacement slogans, and template UI while keeping every number, link, and qualifier intact."`,
      "policy:",
      "  allow_implicit_invocation: true",
      "",
    ].join("\n"),
  },
  {
    rel: ".cursor-plugin/plugin.json",
    content:
      JSON.stringify(
        {
          name: META.name,
          version: META.version,
          description: META.pluginDescription,
          author: META.author,
          homepage: META.homepage,
          repository: META.repoUrl,
          license: META.license,
          keywords: META.keywords,
          logo: "./assets/logo.svg",
          skills: "./skills/",
          mcpServers: "./.mcp.json",
        },
        null,
        2
      ) + "\n",
  },
  {
    rel: "integrations/antigravity/plugin.json",
    content:
      JSON.stringify(
        {
          name: META.name,
          displayName: META.name,
          version: META.version,
          description: META.pluginDescription,
          logo: "assets/logo.svg",
          author: META.author,
          homepage: META.homepage,
          repository: META.repoUrl,
          suggestedPrompts: META.defaultPrompts,
        },
        null,
        2
      ) + "\n",
  },
  {
    rel: "integrations/antigravity/mcp_config.json",
    content:
      JSON.stringify(
        {
          mcpServers: {
            dislop: {
              serverUrl: META.remoteMcpUrl,
            },
          },
        },
        null,
        2
      ) + "\n",
  },
];

// Validate package.json, pyproject.toml, SKILL.md, and integrations/vscode/package.json version lockstep
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const pyproject = fs.readFileSync(path.join(ROOT, "pyproject.toml"), "utf8");
const skillMd = fs.readFileSync(path.join(ROOT, "skills", "dislop", "SKILL.md"), "utf8");
const vscodePkgPath = path.join(ROOT, "integrations", "vscode", "package.json");
const vscodePkg = fs.existsSync(vscodePkgPath) ? JSON.parse(fs.readFileSync(vscodePkgPath, "utf8")) : null;
const herdrPath = path.join(ROOT, "integrations", "herdr", "herdr-plugin.toml");
const herdrToml = fs.existsSync(herdrPath) ? fs.readFileSync(herdrPath, "utf8") : null;
const herdrVer = herdrToml ? herdrToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1] : null;

// Keep integrations/antigravity/skills/dislop/ mirrored byte-for-byte from skills/dislop/
function walkRelativeFiles(baseDir, prefix = "") {
  const out = [];
  for (const ent of fs.readdirSync(path.join(baseDir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...walkRelativeFiles(baseDir, rel));
    else if (ent.isFile()) out.push(rel);
  }
  return out.sort();
}
const rootSkillDir = path.join(ROOT, "skills", "dislop");
const rootSkillFiles = new Set(walkRelativeFiles(rootSkillDir));
const openaiYamlTarget = targets.find((t) => t.rel === "skills/dislop/agents/openai.yaml");
for (const subRel of [...rootSkillFiles].sort()) {
  targets.push({
    rel: `integrations/antigravity/skills/dislop/${subRel}`,
    content:
      subRel === "agents/openai.yaml" && openaiYamlTarget
        ? openaiYamlTarget.content
        : fs.readFileSync(path.join(rootSkillDir, subRel), "utf8"),
  });
}

const antigravitySkillDir = path.join(ROOT, "integrations", "antigravity", "skills", "dislop");
const staleMirrorFiles = fs.existsSync(antigravitySkillDir)
  ? walkRelativeFiles(antigravitySkillDir).filter((rel) => !rootSkillFiles.has(rel))
  : [];

const pyProjVer = pyproject.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const skillVer = skillMd.match(/^version:\s*([^\s]+)/m)?.[1];

const driftErrors = [];
if (pkgJson.version !== VERSION) {
  driftErrors.push(`package.json version (${pkgJson.version}) !== ENGINE_VERSION (${VERSION})`);
}
if (pkgJson.mcpName !== META.mcpName) {
  driftErrors.push(`package.json mcpName (${pkgJson.mcpName}) !== ${META.mcpName}`);
}
if (pyProjVer !== VERSION) {
  driftErrors.push(`pyproject.toml version (${pyProjVer}) !== ENGINE_VERSION (${VERSION})`);
}
if (skillVer !== VERSION) {
  driftErrors.push(`skills/dislop/SKILL.md version (${skillVer}) !== ENGINE_VERSION (${VERSION})`);
}
if (vscodePkg && vscodePkg.version !== VERSION) {
  driftErrors.push(`integrations/vscode/package.json version (${vscodePkg.version}) !== ENGINE_VERSION (${VERSION})`);
}
if (herdrToml && herdrVer !== VERSION) {
  driftErrors.push(`integrations/herdr/herdr-plugin.toml version (${herdrVer}) !== ENGINE_VERSION (${VERSION})`);
}

// Closed top-level schema check on portable plugin.json
const ALLOWED_AGENT_PLUGIN_KEYS = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);
const portableManifest = JSON.parse(targets.find((t) => t.rel === "plugin.json").content);
for (const k of Object.keys(portableManifest)) {
  if (!ALLOWED_AGENT_PLUGIN_KEYS.has(k)) {
    driftErrors.push(`plugin.json contains disallowed top-level key '${k}' under agent-plugins.org/1.0.0`);
  }
}

for (const staleRel of staleMirrorFiles) {
  if (checkOnly) {
    driftErrors.push(`Stale mirror file: integrations/antigravity/skills/dislop/${staleRel} (run 'node scripts/sync_manifests.mjs' to clean)`);
  } else {
    fs.rmSync(path.join(antigravitySkillDir, staleRel), { force: true });
  }
}

for (const t of targets) {
  const fullPath = path.join(ROOT, t.rel);
  if (checkOnly) {
    if (!fs.existsSync(fullPath)) {
      driftErrors.push(`Missing manifest: ${t.rel}`);
      continue;
    }
    const existing = fs.readFileSync(fullPath, "utf8");
    if (existing !== t.content) {
      driftErrors.push(`Out-of-sync manifest: ${t.rel} (run 'node scripts/sync_manifests.mjs' to update)`);
    }
  } else {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, t.content, "utf8");
  }
}

if (driftErrors.length > 0) {
  console.error("dislop manifest check failed:");
  for (const e of driftErrors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `dislop manifests ${checkOnly ? "verified" : "synced"}: v${VERSION} (${targets.length} manifests, channel=${channel})`
);
