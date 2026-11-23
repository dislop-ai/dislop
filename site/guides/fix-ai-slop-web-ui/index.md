---
content-type: reference-data
lang: zh
updated: 2026-11-23
version: 0.8.2
---

# Vibe Coding 前端页面怎么去 AI 味：告别紫粉渐变、卡片套卡片和假按钮

> AI 写的网页一眼像模板，主要是因为“紫粉霓虹渐变 + 满屏胶囊标签 + 框套框 + 假窗口三点 + 点不动的 href=\"#\" 按钮”。改回干净工程界面的做法是用 1px 细线网格、单色字体层次和确定性静态检查。

让 Coding Agent 从零搭一个官网或控制台，十次里有八次会吐出同一套界面：黑底或纯白底上面飘着紫粉光晕球、大字号紫粉渐变标题、假装是 macOS 窗口的红黄绿三点、三张一模一样的马卡龙图标卡片，以及点下去毫无反应的 `href="#"` 按钮。

Anthropic 官方的 `frontend-design`（198,134 星）和 `pbakaus/impeccable`（114,155 星）之所以在开发者社区流行，就是因为大家已经看腻了这套默认的“AI SaaS 模板脸”。

## 1. 最先暴露“AI 写的” 7 个页面特征

| 规则 ID | 页面里长什么样 | 为什么影响使用 | 干净改法 |
|---|---|---|---|
| `ui-dead-control` | `<a href="#">下载报告</a>` 或空按钮、莫名 `disabled` | 属于功能硬伤，点不动会让用户以为页面坏了 | 接上真实链接/交互，没做的功能直接删掉按钮 |
| `ui-ai-gradient` | `from-indigo-500 via-purple-500 to-pink-500` 文字渐变 | 强烈预设模板味，还经常压低对比度 | 退回高对比度实色正文，只在品牌局部留单一强调色 |
| `ui-pill-soup` | 一张卡片里挤 8 个 `rounded-full` 胶囊徽章 | 视觉噪音大，真正重要的状态反而看不出 | 普通属性写成 ` · ` 分隔的轻文本，只保留 1 个异常状态标签 |
| `ui-box-in-box` | 连续三层 `border rounded-xl p-6` 套盒子 | 挤窄移动端有效宽度，层层边框像套娃 | 用 `1px` 细线网格、对齐和背景明度阶梯分层次 |
| `ui-prompt-echo-badge` | 页面印着 `AI 强力驱动` `零幻觉保证` 标牌 | 把写给模型的口号印到用户界面上，没说具体功能 | 改成实际动作或边界说明，如“本地离线运行 · 不上传” |
| `ui-glow-blob-chrome` | `blur-3xl` 霓虹光晕球和闪烁 `animate-ping` 圆点 | 干扰阅读，增加 GPU 合成开销 | 去掉无功能光晕，用静态结构留白代替 |
| `ui-template-card-grid` | `01`/`02`/`03` 编号眉题 + 假窗口三点 + 通用 Emoji 图标 | 每一行都要贴火箭和闪电，结构高度雷同 | 用直接的小标题和真实截屏/交互样本取代假窗口和 Emoji |

## 2. 一组真实代码改法对照

```text
bad:
<div class="border rounded-xl p-6 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
  <span class="rounded-full px-3 py-1">AI 强力驱动</span>
  <h3>🚀 极速上线</h3>
  <a href="#">查看完整报告</a>
</div>

good:
<section class="surface-sheet">
  <span class="section-meta">本地离线检查</span>
  <h3>50 毫秒完成本地检查</h3>
  <a href="./report.html">查看完整报告</a>
</section>
```

对于内联 SVG 图解，还常出现两个漏掉的工程细节：大画布没写 `viewBox`（窄屏直接被截断）、或者两个 `<text>` 坐标挤在一起重叠。检查器会在交付前直接标出具体行号。

![网页组件模板味排查：标出紫粉渐变、胶囊标签墙与空链接，改为 1px 白底版式](demo:ui-slop)

## 3. 在项目里建立“不靠 AI 模板”的视觉底线

1. **先把设计边界写进代码仓**：参考 `Norm (Zurich)`、`Fonts In Use` 和中文排印站点 `The Type` 的规律——用冷中性纸面背景、不超过 2 种字族（正文字体 + 等宽代码字体）、1px 实线分隔和明确的 WCAG 对比度（正文 >= `4.5:1`，控件边框 >= `3.0:1`）。
2. **禁止外链字体和无关装饰脚本**：静态页面只用系统字体栈和本地静态资源，既快又符合离线安全基线。
3. **把静态检查挂进构建和 CI**：

```bash
# 对网站或前端目录跑严格检查（发现警告即拦截）
npx --yes dislop check site/ --pack deck-and-ui --fail-on warning
```

如果你手头已经有 HTML、CSS、JSX 或 SVG 文件，也可以直接拖进官网首页的工作台，不用传到服务器，当前标签页里就能标出全部模板问题。

## 常见问题

### 为什么用 Tailwind 写出来的页面老是带紫粉渐变和发光阴影？

因为多数通用模型在“现代科技感 SaaS”提示下默认复用 indigo/purple/pink 渐变、blur-3xl 背景光晕球和彩色圆角方块图标，这正是开源社区重点治理的视觉平均值。

### 前端静态检查工具能抓出哪些 AI 网页毛病？

不需要启动浏览器，仅扫 HTML/CSS/JSX/SVG 源码就能精确抓住 href=\"#\" 空链接、未说明原因的 disabled 按钮、紫粉渐变类名、单个视图超过 6 个胶囊标签、三层嵌套边框盒，以及 SVG 缺少 viewBox 或文字重叠。

### 不用紫粉模板之后，去哪里找干净不老套的排版参考？

可以参考瑞士印刷与字体网站（如 Norm Zurich、Fonts In Use、Stiftung Buchkunst）和中文排印站点 The Type，用明确的字号阶梯、1px 分界线和局部强调色撑起结构，不靠发光和圆角堆装饰。

## 参考出处

- [anthropics/skills — frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design): 198,134 repo stars (2026-11-21 snapshot); warns coding agents against generic SaaS palettes, purple gradients, and default AI card grids.
- [pbakaus/impeccable: Design rules & /audit workflow for AI-built UI](https://github.com/pbakaus/impeccable): 114,155 stars (2026-11-21 snapshot); packages frontend anti-slop design rules, 7 domain references, and commands like /audit and /polish.
- [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill): 152,711 stars (2026-11-21 snapshot); supplies pre-built palette, font, and layout constraints for AI coding tools.
- [Norm (Zurich) — Modular Graphic Systems](https://www.norm.to): Independent Swiss studio demonstrating modular grids, restrained micro-typography, and zero-ornament structure.
- [Fonts In Use](https://fontsinuse.com): Indexed archive of real-world type pairings across print, signage, and web interfaces instead of generic SaaS defaults.
- [The Type — Chinese & Multilingual Typography Critique](https://www.thetype.com): Documents Chinese punctuation spacing, mixed-script kerning, and editorial layout discipline for longform Chinese pages and slides.
