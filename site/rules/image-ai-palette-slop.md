---
content-type: reference-data
ruleId: image-ai-palette-slop
pack: deck-and-ui
tier: taste
severity: info
family: graphic/image-aesthetics
---

# Rule: `image-ai-palette-slop`

- Pack: [`deck-and-ui`](../packs/deck-and-ui.md) · Tier: `taste` · Severity: `info`
- Modalities: `image`
- Human anchor: https://dislop.com/#rule-image-ai-palette-slop

## What It Catches
- EN: PNG pixel profile matches default AI-slop aesthetics: dominant neon purple-indigo-pink palette or hyper-saturated airbrushed plastic sheen.
- ZH: PNG 像素分布呈现典型生成式视觉套路：高占比蓝紫霓虹主色，或大面积高饱和光滑`塑料感`涂抹。

## Deletion Test
- EN: Review the rendered image for plastic skin/surfaces or generic neon-purple backdrops; re-grade toward natural micro-contrast and restrained accents.
- ZH: 人工复核图片是否存在塑料反光质感或默认黑底蓝紫霓虹，改用自然材质细节与克制配色。

## Exemplar (Reference Data)

```text
bad:  1024x1024 dark-mode hero PNG with 42% #0B0B14 dark backdrop and 28% glowing #7C3AED/#EC4899 purple-pink pixels
trap: 1024x1024 PNG pushing every surface to 92% saturation with airbrushed zero-texture gradients
good: 1024x1024 PNG on #F6F7F5 paper ground with crisp ink typography and <= 5% single vermilion accent
```
