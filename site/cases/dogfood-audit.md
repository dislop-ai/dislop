---
content-type: reference-data
version: 0.8.0
---

# Repository Self-Dogfooding Audit

Every Markdown document, SVG brand asset, and HTML/CSS file in `dislop` runs through `dislop check . --fail-on warning` in CI, and `site/` plus `docs/` pass `--fail-on info` across both Node.js and Python runtimes.

## English Contrast

```text
bad:  Certainly! In today's fast-paced AI landscape, dislop isn't just a linter — it's a game-changer for quality. Signals drop. Bugs ship. Trust dies. Studies show 80% of teams struggle with slop.
good: dislop checks AI-written Markdown, HTML/CSS/JSX, Word, and PowerPoint files for chat wrappers, unfilled placeholders, prose clichés, crowded slides, and default AI UI templates.
```

## Chinese Contrast

```text
bad:  好的，以下是为您撰写的介绍：值得注意的是，dislop 不仅仅是一款检查工具，更是高质量交付的底气。它以确定性规则为重要抓手，全面赋能内容团队实现精准高效、安全可靠、灵活易用的审校闭环。
good: dislop 把靠谱的写作规矩、网页和 PPT 设计原则、离线检查工具和 90 条精选资源收在一起，覆盖 Markdown、Word、PPT、PDF、图片和网页。
```
