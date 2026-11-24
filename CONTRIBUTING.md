# Contributing to `dislop`

Thank you for helping keep `dislop` accurate, low-noise, and zero-dependency. `dislop` follows an **English (Global) first** baseline across rules, schemas, primary visual assets, and canonical documentation (`*.md`), paired with native Chinese counterparts (`*.zh-CN.md` and `/zh/`) authored without word-for-word translation or language mixing. Before picking up a larger change, check [ROADMAP.md](./ROADMAP.md) ([Chinese](./ROADMAP.zh-CN.md)) for active tracks and open design questions, and read [docs/brand-and-voice-guide.md](./docs/brand-and-voice-guide.md) before editing visitor-facing copy.

## 1. Rule Design Checklist

Every new or updated rule in `packs/<pack-id>/pack.json` must include:

1. **Clear Tier Placement**:
   - Put clear AI delivery artifacts (stray chatbot greetings, unfilled placeholders, unrendered Markdown in Office files, dead `#` links, and unexplained disabled buttons) in `packs/core/pack.json` (`tier: "invariant"`, `severity: "error"`).
   - Put scenario-specific prose, layout, or slide signals in a scenario pack (`tier: "taste"`, `severity: "warning"` or `"info"`).
2. **Portable, Bounded Patterns**:
   - Regex patterns must run identically in JavaScript (`new RegExp(pat, "gimu")`) and Python (`re.compile(pat, re.I | re.M)`).
   - Never use unbounded `.*` across sentences; bound gaps explicitly (e.g., `[^.!?\n]{1,40}`).
3. **Bilingual Check Question & Fact-Preserving Exemplar**:
   - Provide `deletionTest.en` and `deletionTest.zh`.
   - Provide `exemplar.bad`, `exemplar.trap` (the second-order cliché to avoid), `exemplar.good`, and `exemplar.source`.
   - `exemplar.good` must preserve every number, qualifier, and concrete entity from `exemplar.bad` without inventing new facts.
4. **Automated Positive & Negative Fixtures**:
   - Add at least one triggering string in `fixtures.hit` and at least one realistic near-miss in `fixtures.clean`.

## 2. Licensing, DCO & Official Service Boundary

- **Original & Licensed Material**: Never include real workstation usernames, internal hostnames, private repository references, or proprietary customer material in code, fixtures, prompts, or commit messages. All fixtures, prompts, and exemplars must be original work or explicitly licensed open/public-domain material.
- **Developer Certificate of Origin (DCO)**: Sign off commits with `git commit -s` (`Signed-off-by: Name <email>`) to confirm you have the right to submit the contribution under the repository's [Apache-2.0 License](./LICENSE).
- **Use in the Official Service**: Under Apache-2.0, merged rules, references, and prompts may also be evaluated and deployed in the official hosted `dislop.com` service once they pass evaluation checks.
- **Name & Official Service Notice**: You are free to fork, modify, and self-host this open-source repository under Apache-2.0, which does not grant trademark rights. Third-party forks or hosted deployments must not present themselves as the official `dislop` service.

## 3. GitHub Workflow & Collaboration

- **Discussions vs. Issues vs. Roadmap**: Open design questions live in [GitHub Discussions](https://github.com/dislop-ai/dislop/discussions) before coding. Concrete work, false positives, and Awesome submissions live in [Issues](https://github.com/dislop-ai/dislop/issues) (one issue per deliverable). [ROADMAP.md](./ROADMAP.md) stays a milestone overview updated on releases rather than on every commit.
- **Small fixes vs. Pull Requests**: Maintainers may fast-forward push tiny fixes and releases to `main`. Feature work, rule changes, and cross-file edits use short topic branches (`feat/...`, `fix/...`, `docs/...`) with `Closes #<number>` in the PR body so merged PRs close issues and delete branches automatically, while `.github/CODEOWNERS` routes review requests.
- **Minimal metadata**: New issues only need a clear title and one `track:*` or `area:*` label (`rules`, `voice-copy`, `site`, `mcp-cli`). Reserve `priority: high` for the 2–3 active focus items.

## 4. Local Verification & Releases

Run the full preflight check from the repository root before opening a PR (takes ~15s):

```bash
npm run release:check
```

Under the hood, `release:check` runs manifest lockstep checks (`scripts/sync_manifests.mjs --check`), open-source secret/path hygiene scans, `scripts/build_site.mjs`, and `tests/test_site.mjs`. It also runs Node and Python `pack-test`, all 4 Python unittest suites (34 tests), repo self-dogfooding (`dislop check . --fail-on warning`), and archive build smoke checks. For maintainer version bumps and multi-platform publishing rules, see [docs/releasing.md](./docs/releasing.md) ([Chinese](./docs/releasing.zh-CN.md)).
