# dislop for Antigravity

Cutting AI slop is real productivity. `dislop` checks Markdown, HTML/CSS/JSX, `.docx`, and `.pptx` files for AI filler, broken UI scaffolding, and rhythm monotony offline.

![dislop coding agent workflow: loading SKILL.md, PR diff gate exit 1, and dislop verify passing](https://dislop.com/assets/demos/agent-workflow-en-v2.gif)

## Included

- Skill (`skills/dislop/SKILL.md`) and 4 progressive reference cards under `skills/dislop/references/`.
- Remote MCP config pointing to Official Cloud MCP (`https://dislop.com/mcp`). Offline checks run through the local CLI (`npx dislop check .` / `uvx dislop check .`).

## Validation

```bash
agy plugin validate integrations/antigravity --strict
```
