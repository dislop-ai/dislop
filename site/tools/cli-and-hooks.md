---
content-type: reference-data
version: 0.9.1
---

# CLI, Git Diff, Hooks & CI (`v0.9.1`)

## Node.js 20+ & Python 3.10+ (Shipped, Zero Dependencies)

```bash
# Check a folder (exits 1 on core AI artifact errors)
npx --yes dislop check .

# Check only modified git lines and output GitHub PR annotations or SARIF 2.1.0
npx --yes dislop check --changed origin/main --format github
npx --yes dislop check --changed origin/main --format sarif > dislop.sarif

# Inspect DOCX/PPTX with Python (published on PyPI)
uvx dislop check quarterly-review.pptx

# Explain a rule's check question and examples
npx --yes dislop explain negation-pivot-frame

# Check with 5-axis rhythm stats and bundled 14.6 KB Pocket ML
npx --yes dislop check draft.md --profile --ml

# Run extended 65-pattern catalog probes offline
npx --yes dislop patterns draft.md

# Extract an offline deterministic personal voice profile (0 network calls)
npx --yes dislop voice sample1.md sample2.md -o .dislop.local/voice.json

# Inspect hardware RAM/chip and optional local small-model tiers (never bloats install)
npx --yes dislop model status

# List bundled offline packs and optional read-only static / cloud URLs (check makes 0 network calls)
npx --yes dislop resources --json
```

## Exit Codes

- `0`: Checked cleanly with zero findings at or above `--fail-on`.
- `1`: Findings met or exceeded `--fail-on`.
- `2`: Invalid flags, missing path, or explicitly specified file was uninspectable (e.g., corrupted archive or non-UTF-8 file).

## Claude Code PostToolUse Hook Template (Fast Local Install Recommended)

Install once locally so hooks run offline with zero network fetch latency:

```bash
npm install -g dislop
# or Python 3.10+: pip install dislop
```

Note: `PostToolUse` fires **after** `Write`/`Edit` completes and receives tool context as JSON on stdin (`tool_input.file_path`). Parse and validate that path before invoking `dislop check`, and map CLI exit `1` to exit `2` to return structured post-write feedback to Claude Code:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node -e 'const fs=require(\"node:fs\"),cp=require(\"node:child_process\");const d=JSON.parse(fs.readFileSync(0,\"utf8\"));const f=d.tool_input&&d.tool_input.file_path;if(!f)process.exit(0);const r=cp.spawnSync(\"dislop\",[\"check\",f,\"--fail-on\",\"error\"],{stdio:\"inherit\"});process.exit(r.status===1?2:(r.status||0));'"
          }
        ]
      }
    ]
  }
}
```
