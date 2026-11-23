# `dislop` 动画 GIF 与 WebP 制作托管指引

[English](./gif-production-guide.md)

这份指引用于制作符合 `dislop` 视觉基调的演示动画，服务 GitHub README、官方网站、实用指南、接入手册和社交媒体配图。品牌配色、字体与对比度基准见 [design-system.zh-CN.md](./design-system.zh-CN.md)，表达口径见 [brand-and-voice-guide.zh-CN.md](./brand-and-voice-guide.zh-CN.md)，工具选型见 [X 平台热门动画库与 GIF 方案调研](./research/x-animation-and-gif-tooling-2026.zh-CN.md)，编码实测对照见 [动画编码对照实验报告](./research/gif-encoding-experiments-2026.zh-CN.md)。

---

## 1. 品牌动效原则与禁用清单

`dislop` 的视觉核心是**印刷校样单配朱红手批记号**，动画本身也是在帮读者看清问题和改法，不靠炫技撑场面。

### 颜色与字体直接复用全站令牌

| 类别 | 具体令牌与要求 |
|---|---|
| 浅色纸面画布 | 外框 `--stage` `#F6F7F5`，主校样栏 `--sheet` `#FFFFFF`，`1px` 分界线 `--rule` `#D5D7D2`，主墨字 `--ink` `#14171A`，辅助说明 `--ink-2` `#474C55`，行号 `--ink-3` `#5E646E` |
| 深色终端画布 | 主面板 `#15181C`，内槽 `#0A0C0E`，边线 `#2A2F37`，正文 `#ECEEF0`，次级文字 `#A6ACB5` |
| 语义标线与状态色 | 朱红粗笔画 `--pen` `#F04438`（浅色字 `#B42318` / 深色字 `#FF7A6B`）配 `2px solid` 实线专标 `error` 硬伤；群青 `#1B52B0`（深色 `#85B4FF`）配 `1.5px dashed` 虚线专标 `warning` / `info` 套话提醒；绿色 `#1E6B47`（深色 `#6CD49B`）只用于 `0 findings` 改好通过态 |
| 零外域字体 | HTML 渲染模板使用系统字体栈（无衬线 `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", sans-serif`，校样衬线 `Georgia, "Noto Serif CJK SC", "Songti SC", serif`，等宽 `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`），严禁请求外部字体 CDN |

### 动效里不能出现的东西

| 禁止项 | 为什么不行 | 正确替代写法 |
|---|---|---|
| 紫粉霓虹渐变、弥散发光阴影、玻璃拟态 | 属于第一代生成式 AI 默认模板，违背 `dislop` 自身去模板规范 | 纯色纸面 `#FFFFFF` / `#F6F7F5` 配 `1px solid #D5D7D2` 标尺线 |
| 角落小标、`01 / INTRO` 章节号、macOS 红黄绿三点装饰 | 属于 AI 幻灯片常见页面边角料，挤占正文读数空间 | 顶部只留一条 `1px` 细栏放文件名、规则计数或退出码 |
| 逐字打字机 + 闪烁光标大段敲字 | 拖慢读稿节奏，强迫观众等模型假装打字 | 原文整段 180ms 利落入画，把动画时间留给红蓝标线和改写对比 |
| `scale(0)` 弹跳、夸张弹簧过冲、全程晃动元素 | 显得轻浮，还会导致 GIF 帧差变大、体积飙升 | 位移与透明度只用 `180–280ms` `ease-out`，其余时间画面保持完全静止 |
| 伪造规则 ID、虚构终端输出或编造数字 | 违背实测与诚实边界 | 每次改词先跑真实 `node bin/dislop.mjs check` 核对规则名、行列号与指标 |

---

## 2. 六大对外场景规格表（`v2` 清单）

所有场景统一在 [scripts/media/demos.manifest.json](../scripts/media/demos.manifest.json)（`dislop.demos/2`）声明，面向中英文两套受众**严格分开出图**（`-zh-v2` 与 `-en-v2`），中文图里不夹英文例句，英文图里不出现汉字。旧版 `-v1` 成品保留在磁盘上，确保已发布的外链不断裂。

| 场景 Slug | 分辨率 | 帧率 / 时长 | 画面类别 | 体积上限（GIF / WebP / 海报） | 分发位置 |
|---|---|---|---|---|---|
| `proof-cycle` | `960×500` | `16 fps` / `6.8s` | `flat-paper` | `450 / 240 / 45 KB` | 首页、`/en/`、README、VS Code 市场、指南 |
| `cli-check` | `920×460` | `15 fps` / `6.4s` | `dark-terminal` | `350 / 200 / 45 KB` | 首页、`/en/`、README、Agent/CI 教程 |
| `workbench-live` | `1140×640` | `12 fps` / `6.8s` | `live-dom` | `550 / 300 / 65 KB` | 首页、`/en/`、README、中文/英文写作指南 |
| `ui-slop` | `960×500` | `16 fps` / `6.8s` | `flat-paper` | `480 / 260 / 50 KB` | 首页、`/en/`、README、前端去模板指南 |
| `deck-office` | `960×500` | `16 fps` / `6.8s` | `flat-paper` | `480 / 260 / 50 KB` | 首页、`/en/`、README、PPT/Word 排查指南 |
| `agent-workflow` | `960×500` | `16 fps` / `6.8s` | `dark-terminal` | `420 / 240 / 50 KB` | 首页、`/en/`、README、Antigravity 插件、Agent/CI 教程 |

每个场景同时输出三份同源静态资源，在官网与指南页通过 `<picture>` 渐进式分发：

1. `<source media="(prefers-reduced-motion: reduce)" srcset="...-poster.png">` — 系统开启减弱动效时直接显示静态高清帧；
2. `<source type="image/webp" srcset="...webp">` — 现代浏览器优先加载无损动态 WebP（纯纸面场景 `100.0%` 背景纯净度、零色阶噪点）；
3. `<img src="...gif" loading="lazy" decoding="async">` — 兼容 GitHub README、插件市场与旧环境。

---

## 3. 确定性制作、压制与编码实验命令

仓库内置零额外 npm 依赖的渲染脚本 [scripts/media/render_gifs.py](../scripts/media/render_gifs.py)，通过本机 Playwright Chromium 按虚拟时钟 `window.__renderAt(t)` 逐帧导出 PNG（或托管本地 `site/` 实录鼠标轨迹与真实 DOM），同步输出 `.gif`、`.webp` 与 `-poster.png`：

```bash
# 一键重渲染全套 6 场景 12 组中英成品及 6 帧 QA 拼图
npm run media:render

# 自动化执行 G0-G5 六项硬门禁核验（头信息、尺寸、真实 CLI 一致性、纸面纯净度、尾帧停留）
npm run media:verify

# 复现 7 条动画编码管线对照实验（输出体积、PSNR、纸面纯净度与耗时）
npm run media:bench

# 按需导出 X（@dislop_ai）发帖用的 1080x600 H.264 MP4（不进仓库目录）
python3 scripts/media/render_gifs.py --social-dir /tmp/dislop-social
```

### 按画面材质分流编码参数（实测结论）

1. **平面校样与深色终端（`flat-paper` / `dark-terminal`）**：
   - WebP：`img2webp -loop 0 -lossless -m 4`（按同帧去重合并时长，`35–198 KB`，`99.9 dB` 无损还原且纸面纯净度 `100.0%`）。
   - GIF：FFmpeg `palettegen=max_colors=96:stats_mode=diff` 配 `paletteuse=dither=none:diff_mode=rectangle`，再用 `gifsicle -O3 --lossy=20`（严禁开 `bayer` 抖动，实测会破坏白底纯净度并让体积涨约 `30%`）。
2. **真机网页工作台录屏（`live-dom`）**：
   - WebP：`img2webp -loop 0 -lossy -q 84 -m 4`；
   - GIF：`max_colors=128` 配轻度 `bayer:bayer_scale=3` 与 `gifsicle -O3 --lossy=15`。

---

## 4. 发图前必须通过的 6 条硬门禁（`npm run media:verify`）

每次新增或更新演示动画，除了人工复看 `render_gifs.py` 生成的 6 帧 Contact Sheet 拼图，还必须通过 [verify_demos.py](../scripts/media/verify_demos.py) 自动校验：

| 门禁 | 核对项 | 合格线 |
|---|---|---|
| G0 | 首帧可用与无限循环 | GIF 头部为 `GIF89a` 且带 `NETSCAPE2.0` 循环扩展；WebP 带 `ANIM` 动画块；第 0 帧非空白纯色 |
| G1 | 多格式尺寸对齐 | `.gif`、`.webp`、`-poster.png` 像素宽高与 `demos.manifest.json` 完全一致 |
| G2 | 真实引擎零编造 | 脚本在渲染期直接调用 `node bin/dislop.mjs check` 提取规则 ID、行列号与退出码，`verify_demos.py` 复跑验真 |
| G3 | 体积与纸面纯净度 | 平面场景解码帧外框纸白 `#FFFFFF` / `#F6F7F5` 纯净度 `>= 99.0%`；单文件严格低于清单体积上限 |
| G4 | 终态留停可读性 | GIF 末尾 `>= 1.5s` 帧差保持稳定（平均像素差 `<= 1.0`），让读者有时间读完通过结论 |
| G5 | 中英严格隔离与降级 | 中文页只引 `-zh-v2`，英文页与编辑器市场只引 `-en-v2`；英文元数据零汉字；网页端全部支持定格、重播与放大查看 |

---

## 5. 图床与托管架构约定

公开物料里的动画同时服务 `dislop.com` 官网、`/guides/` 指南、GitHub README 与外部插件市场（如 VS Code Marketplace 要求绝对 HTTPS GIF 地址），按四条规矩管理：

1. **源码入仓，成品按规模分治**。核心 6 场景 12 组资源（`assets/demos/*-v2.{gif,webp}` 与 `*-poster.png`）保留在仓内以便 CI 校验与离线构建；`package.json` 的 `files` 与 `pyproject.toml` 均只收录 `assets/logo.svg`，对 npm tarball 与 PyPI Wheel 体积增量为 **0 字节**。
2. **官网同源直出**。构建时 `scripts/build_site.mjs` 将 `.gif`、`.webp` 与 `.png` 同步至 `site/assets/demos/`，保持 `CSP: img-src 'self' data:` 零放宽，不引入第三方图床追踪。
3. **版本化文件名配长期不可变缓存**。所有上线图片采用 `-v1`、`-v2` 不可变命名，覆盖更新时递增版本号。静态站点服务器对 `/assets/demos/*` 下发 `Cache-Control: public, max-age=31536000, immutable`。
4. **指南文章零样板嵌入**。在 `content/guides/*.md` 里只需写 `![说明文字](demo:<slug>)`，编译脚本自动按文章语种拼出带静态海报、WebP、GIF、定格与放大控件的完整 `<figure>` 节点。
