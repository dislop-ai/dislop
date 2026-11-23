# Daily Updates & Multi-Surface Release Guide

[简体中文](./releasing.zh-CN.md)

`dislop` releases through one zero-dependency script (`scripts/release.mjs`), one GitHub Actions workflow (`.github/workflows/release.yml`), and Agent-driven checks.

---

## Pick the Shortest Track for Your Change

Before starting or wrapping up a batch of work, check live alignment across every public outlet in one command:

```bash
npm run release:status
```

In about 1.5 seconds, `release:status` checks local `HEAD`, the latest GitHub Release (including `.vsix`), and the repository/org profiles. It also queries `https://dislop.com` (`/catalog.json` and `/api/health`), `npm`, `PyPI`, and the Official MCP Registry, marking each surface `[OK]` or `[LAG]`.

Choose one of three tracks based on what actually changed:

| Track | When to Use | Exact Flow |
|---|---|---|
| **Track 1: Site, Copy, Docs, or Awesome List Refresh** | Only `site/`, `docs/`, `awesome/`, or `ROADMAP` changed (no edits under `src/`, `bin/`, `packs/`, `patterns/`, `skills/`, or `integrations/`) | **Do not bump package versions or publish to registries.** Edit source files (never hand-edit generated `site/` outputs), pass `npm run release:check`, push `main`, sync the static site directory, and verify `HTTP 200` via `npm run release:status`. |
| **Track 2: Patch Release `0.Y.Z`** | Rule false-positive/recall fixes, CLI/MCP bug fixes, manifest tweaks, or editor bundle fixes | Add at least 1 `hit` and 1 `clean` fixture in the affected `pack.json`, document `[0.Y.Z]` in `CHANGELOG.md`, run `npm run release -- 0.Y.Z [--deploy] --commit --tag --push`, then verify all outlets match via `npm run release:status` and close linked Issues. Keep official social accounts quiet on routine patches. |
| **Track 3: Feature or Milestone Release `0.(Y+1).0`** | New rule packs, new detection angles, major features, or milestone wrap-ups | Run Track 2, plus update the GitHub repository description (`gh repo edit`), `dislop-ai/.github` org profile, `ROADMAP.md` / `ROADMAP.zh-CN.md` checkboxes, and the completed GitHub Milestone. Let the Agent draft an official `@dislop_ai` specimen post only when user-facing capability meaningfully changed. |

### Parallel Multi-Agent Worktree Safety

When multiple contributors or Agent sessions share a local checkout (`git status --short` shows uncommitted files from another task), never run `git add -A` or `release --commit` directly in the dirty checkout. Stage and commit only your own paths first, then cut the release from a temporary detached worktree:

```bash
git worktree add --detach /tmp/dislop-rel HEAD
(cd /tmp/dislop-rel && npm run release -- 0.6.2 --commit --tag --push)
git worktree remove /tmp/dislop-rel
git fetch origin && git merge --ff-only origin/main
```

Maintainers with a local Git-ignored `.private/deploy.local.sh` hook can pass `--deploy` to sync the hosted cloud engine (including its `package.json` version), deploy static `site/`, and verify `https://dislop.com/llms.txt` and `/api/health` in the same step.

---

## Keeping Every Public Outlet Consistent

In-repo versions and counts are enforced deterministically by `release:check`, while external profiles and announcements are synced deliberately on Track 3 releases:

### Group 1: Auto-Synced on Git Tag or `main` Push

| Surface | Setup Status | Hard Rules & Gotchas | How Updates Ship |
|---|---|---|---|
| **GitHub Releases & Action** | Root `action.yml` and archive builder live | `action.yml` must keep a globally unique `name` and `branding` block | Pushing `v*.*.*` extracts `CHANGELOG.md` notes and uploads `.tgz`, `.whl`, `.tar.gz`, and `dislop-<ver>.vsix` |
| **`skills.sh` Leaderboard** | Indexed via `npx skills add dislop-ai/dislop` | Reads `skills/dislop/SKILL.md` on `main` (`<= 2.5 KB` body, relative `./references/*.md`); keep internal maintainer skills out of tracked `skills/` so end-user skill lists stay clean | Live as soon as `main` updates |
| **Gemini CLI Extension Gallery** | Repo topic `gemini-cli-extension` configured | Requires valid root `gemini-extension.json` plus a tagged GitHub Release for Google's daily crawler | Auto-indexed within 24h of each `v*.*.*` tag |
| **Anthropic & OpenAI Plugin Directories** | `.claude-plugin/`, `plugin.json`, and `agents/openai.yaml` CI-locked (manual directory submissions deferred) | Root `plugin.json` enforces closed `agent-plugins.org/1.0.0` top-level keys and `shortDescription <= 30` chars; `.gitignore` must allow `.agents/plugins/marketplace.json` | Clients pull updates from GitHub Releases |
| **`pre-commit` Hooks** | `.pre-commit-hooks.yaml` live | Users pin `rev: vX.Y.Z` tags; never delete or move published tags | Users run `pre-commit autoupdate` |

### Group 2: Automated via GitHub Actions OIDC on `v*.*.*` Tags

| Surface | Auth & Binding Status | Hard Rules & Gotchas | How Updates Ship |
|---|---|---|---|
| **npm (`dislop`, Live)** | Published on `npmjs.org` with manifests on `--channel registry`; bind Trusted Publisher (`dislop-ai` / `dislop` / `release.yml`) at `npmjs.com/package/dislop/access` with `NPM_OIDC_ENABLED=true` | Never inject an empty `NODE_AUTH_TOKEN` during OIDC (`release.yml` strips placeholder `.npmrc`); `publish-npm` exits `0` cleanly if the version is already published so `publish-mcp-registry` can proceed; keep `"mcpName": "io.github.dislop-ai/dislop"` | `publish-npm` job publishes with OIDC provenance on every `v*.*.*` tag |
| **PyPI (`dislop`, Live)** | Trusted Publisher bound (`dislop-ai` / `dislop` / `release.yml` / Environment `pypi`) with `PYPI_OIDC_ENABLED=true` | `README.md` must keep `<!-- mcp-name: io.github.dislop-ai/dislop -->` for MCP Registry PyPI ownership verification; `skip-existing: true` keeps re-runs idempotent | `publish-pypi` job builds and publishes on every `v*.*.*` tag |
| **Official MCP Registry (`io.github.dislop-ai/dislop`, Live)** | Active on `registry.modelcontextprotocol.io` via `mcp-publisher login github-oidc` | **Must run after matching npm and PyPI versions succeed** (`needs: [publish-npm, publish-pypi]`); `server.json` `description` must be `<= 100` chars and `version` must strictly increase | `publish-mcp-registry` job publishes local `stdio` and remote `https://dislop.com/mcp` entries |
| **VS Code Marketplace & Open VSX** | `integrations/vscode/` ships `.vscodeignore` and copies `LICENSE` at build time, attaching a zero-warning `.vsix` to every GitHub Release | `vsce` rejects relative SVGs and non-HTTPS images in extension READMEs; add `VSCE_PAT` and `OVSX_PAT` secrets when ready to push directly to both stores | `publish-editor-extensions` job builds, tests, uploads `.vsix`, and publishes when store tokens exist |

### Group 3: Website, Cloud, GitHub Board, and Official Social Account

- **Website & Cloud lockstep (`dislop.com`)**: `scripts/build_site.mjs` compiles `site/`, `/llms.txt`, `/catalog.json`, `/robots.txt`, and `/sitemap.xml` from one source; `sync_core.mjs` copies `src/core.mjs` and `packs/` while locking the cloud `package.json` version to `ENGINE_VERSION` so `/api/health` never drifts from the static site.
- **GitHub About, Org Profile & Issues**: Whenever pack, rule, pattern, or Awesome counts change, `release:check` blocks stale counts inside the repository; also update the GitHub repo description and `dislop-ai/.github/profile/README.md` (passing `dislop check --fail-on info` before pushing). Keep day-to-day progress in GitHub Issues only, checking off `ROADMAP*.md` and closing Milestones at release time.
- **Official `@dislop_ai` account (judgment over bots)**: Never wire an unreviewed CI webhook to auto-post on every Git tag. Stay silent on patch releases; for meaningful feature or benchmark releases, draft a concrete before/after post following [Brand & Voice Guide](./brand-and-voice-guide.md) (`<= 240` chars with zero links + native specimen image in the root post, install commands and links in reply 1, verified with `dislop check - --fail-on info`).

---

## Offline Gates Enforced by `npm run release:check`

All preflight gates run 100% offline in sequence and abort on the first failure:

1. **Manifest & version lockstep** (`sync_manifests.mjs --check`): Locks versions and field caps across both runtimes, `package.json`, `pyproject.toml`, `SKILL.md`, `integrations/vscode`, `herdr`, and 19 synced manifests.
2. **Cross-surface facts & `CHANGELOG` guard**: Computes live pack, rule, pattern, and Awesome counts from source files, blocks stale numbers across `README*.md`, `ROADMAP*.md`, `docs/architecture*.md`, and `sync_manifests.mjs`, verifies `CHANGELOG.md` has a non-empty `## [<version>]` section, and prevents regressions back to `github:dislop-ai/dislop`.
3. **Secret, path & registry marker scan**: Blocks live credentials, workstation home paths, internal scheme URIs, private files, and missing `mcp-name` markers.
4. **Site build & WCAG checks** (`build_site.mjs` + `test_site.mjs`): Validates `JSON.parse()` on every config block, `/robots.txt` and `/sitemap.xml`, strict EN/ZH separation, and WCAG AA contrast.
5. **Dual-runtime fixtures, pattern library, Pocket ML & benchmarks**: Runs 160 Node/Python fixture assertions, the 154-sample pattern benchmark, 14.6 KB Pocket ML parity, `dislop-bench v2` (112 detection samples + 18 revision tasks), and 27 Python `unittest` tests.
6. **Self-dogfooding**: Runs `--fail-on warning` repo-wide and `--fail-on info` across `site/`, `docs/research/`, `docs/releasing*.md`, `skills/`, and `ROADMAP*`.
7. **Artifact smoke builds & strict plugin validators**: Verifies `npm pack` (`<= 300 KB`), `uv build`, `claude plugin validate`, `agy plugin validate integrations/antigravity --strict`, and VS Code extension unit tests.

---

## Recovering Cleanly from Partial Release Failures

- **One registry lagged or timed out**: Run `npm run release:status` to see which outlet shows `[LAG]`, then re-run failed jobs in GitHub Actions (every publish job is idempotent and skips versions already live).
- **Bug found right after tagging**: Because npm, PyPI, and the Official MCP Registry forbid overwriting a published version, never delete or move a published `v*.*.*` tag. Ship the fix as the next patch version (`0.6.2`).
