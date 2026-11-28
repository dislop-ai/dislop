---
content-type: reference-data
version: 1.1.2
---

# CLI, Git Diff, Hooks & CI (`v1.1.2`)

## Node.js 20+ Micro-Kernel (Shipped, Zero Dependencies)

```bash
# Check a folder offline (Exits 1 on unresolved Defect: error; Suggestions Exit 0)
npx --yes dislop check .

# Deterministic check only, treating Defect: warning as CI blocking
npx --yes dislop check . --no-llm --fail-on warning

# Check only modified git lines or changed files since origin/main
npx --yes dislop check --changed
npx --yes dislop check --since origin/main --no-llm --format sarif > dislop.sarif

# Interactive git-add-p style hunk review, or auto-apply verified safe fixes
npx --yes dislop fix draft.md
npx --yes dislop fix draft.md --auto

# Deterministic Fact Gate comparing original vs. edited revision (or git HEAD)
npx --yes dislop verify before.md after.md
npx --yes dislop verify --git HEAD draft.md

# Inspect Packs, lint custom .pack.md before PR submission, and check routing readiness
npx --yes dislop packs list
npx --yes dislop packs lint ./my-pack.pack.md
npx --yes dislop doctor --json

# Extract a deterministic personal voice baseline offline (0 network calls)
npx --yes dislop voice extract sample1.md sample2.md
```

## Exit Codes

- `0`: Pass (zero unresolved `Defect` items at or above `--fail-on`; editorial `Suggestion`s never fail CI).
- `1`: Unresolved `Defect` met or exceeded `--fail-on`, Fact Gate failure in `dislop verify`, or manifest violation in `dislop packs lint`.
- `2`: Invalid flags, missing path, auth failure, missing Ollama on `dislop model pull`, or unreadable explicit file.

## Claude Code PostToolUse Hook Template (Global Install Recommended)

Install once globally so hooks run offline with zero network fetch latency:

```bash
npm install -g dislop
```

Note: `PostToolUse` fires **after** `Write`/`Edit` completes and receives tool context as JSON on stdin (`tool_input.file_path`). Parse and validate that path before invoking `dislop check --no-llm`, mapping CLI exit `1` to exit `2` to return structured post-write feedback to Claude Code:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node -e 'const fs=require(\"node:fs\"),cp=require(\"node:child_process\");const d=JSON.parse(fs.readFileSync(0,\"utf8\"));const f=d.tool_input&&d.tool_input.file_path;if(!f)process.exit(0);const r=cp.spawnSync(\"dislop\",[\"check\",f,\"--no-llm\",\"--fail-on\",\"error\"],{stdio:\"inherit\"});process.exit(r.status===1?2:(r.status||0));'"
          }
        ]
      }
    ]
  }
}
```
