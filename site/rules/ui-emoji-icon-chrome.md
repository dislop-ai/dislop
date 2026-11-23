---
content-type: reference-data
ruleId: ui-emoji-icon-chrome
pack: deck-and-ui
tier: taste
severity: warning
family: ui/slop-chrome
---

# Rule: `ui-emoji-icon-chrome`

- Pack: [`deck-and-ui`](../packs/deck-and-ui.md) · Tier: `taste` · Severity: `warning`
- Modalities: `html, jsx, svg`
- Human anchor: https://dislop.com/#rule-ui-emoji-icon-chrome

## What It Catches
- EN: Three or more decorative AI stock emojis (`🚀`, `✨`, `⚡`, `🛡️`) used as interface or heading icons.
- ZH: 在界面标题、按钮或卡片里堆砌 3 处及以上通用 Emoji（如 `🚀`、`✨`、`⚡`、`🛡️`）充当图标。

## Deletion Test
- EN: Strip decorative emojis from headings and controls; use plain typography or a consistent single-stroke SVG icon set.
- ZH: 删去标题与按钮里的装饰 Emoji，改用纯文字层级或统一线宽的单色矢量图标。

## Exemplar (Reference Data)

```text
bad:  <h3>🚀 Fast</h3><h3>⚡ Sync</h3><h3>🛡️ Safe</h3>
trap: <h3>🌟 Fast</h3><h3>💎 Sync</h3><h3>🎯 Safe</h3>
good: <h3>Sub-50 ms checks</h3><h3>Local sync</h3><h3>Offline by default</h3>
```
