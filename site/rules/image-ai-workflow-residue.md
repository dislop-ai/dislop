---
content-type: reference-data
ruleId: image-ai-workflow-residue
pack: deck-and-ui
tier: taste
severity: warning
family: graphic/image-residue
---

# Rule: `image-ai-workflow-residue`

- Pack: [`deck-and-ui`](../packs/deck-and-ui.md) · Tier: `taste` · Severity: `warning`
- Modalities: `image`
- Human anchor: https://dislop.com/#rule-image-ai-workflow-residue

## What It Catches
- EN: Raster image embeds unstripped AI generation prompt/workflow parameters (warning) or explicit synthetic provenance tags (info — retain required legal disclosures).
- ZH: 图片文件内嵌了未清理的生成提示词/工作流参数（提醒），或带有显式 AI 生成来源标识（提示：合规场景请保留法定标识，重点复核成图质感）。

## Deletion Test
- EN: Strip accidental raw prompt/seed workflow JSON before shipping assets; keep legally required C2PA or IPTC `trainedAlgorithmicMedia` disclosures intact.
- ZH: 交付前清理意外残留的提示词与工作流 JSON；属于法规要求的 C2PA 或 `trainedAlgorithmicMedia` 标识请勿私自剥除，仅作质感复核。

## Exemplar (Reference Data)

```text
bad:  PNG tEXt chunk `parameters`: `masterpiece, neon glow\nNegative prompt: blurry\nSteps: 28, Sampler: Euler a, CFG scale: 7`
trap: Stripping legal C2PA / `trainedAlgorithmicMedia` provenance tags instead of inspecting or re-shooting the asset
good: Clean PNG/JPEG export with raw prompt/node-graph chunks removed and natural photographic or editorial raster assets
```
