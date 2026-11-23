# `dislop` 动画编码对照实验报告（2026-11）

这份实验记录围绕 `dislop` 平面印刷校样界面与混合网页组件两种典型画面，对比 7 条动画编码管线在体积、画质（PSNR）、白纸底纯净度（Paper Purity）与耗时上的真实表现。所有数据均由 [bench_encoders.py](../../scripts/media/bench_encoders.py) 在同机同源帧序列上实测产出，原始记录保存在 [encoder-benchmark-latest.json](../../scripts/media/encoder-benchmark-latest.json)。

---

## 1. 实验设计：为什么专门测“白纸底纯净度”

多数视频编码评测只看 PSNR 或 VMAF，但面向开发者文档和官网演示图的平面校样 UI 有一个特殊痛点：大片 `#FFFFFF` 与 `#F6F7F5` 纯色纸面一旦经过时空抖动（dither）或有损色度子采样，肉眼就能看到细密麻点或边缘灰晕。

我们在实验里引入两项并列指标：

1. **平均 PSNR（dB）**：采样帧解码还原为 RGB 后，相对 1× 原生 Playwright PNG 真值帧的峰值信噪比（完全无损记为 `99.9 dB`）。
2. **纸面纯净度（Paper Purity %）**：统计真值帧里原本为纯白 `#FFFFFF` 或纸灰 `#F6F7F5` 的像素，经过编码再解码后依然保持原 RGB 值一字不差的比例。

测试对象覆盖两类典型镜头（均为 `960×500`、`16 fps`、`6.8s`、共 `109` 帧）：

- `proof-cycle-zh`：纯平面校样排版（大量纯白纸底、衬线中文字体、朱红实线与群青虚线）。
- `ui-slop-zh`：混合画面（前半段深色紫粉渐变 AI 模板卡片，后半段横推切换到纯白 `1px` 校样卡片）。

---

## 2. 七条编码管线实测数据

一键复现命令：`npm run media:bench`（或 `python3 scripts/media/bench_encoders.py`）。

| 场景 | 编码管线 | 关键参数 | 体积（KB） | PSNR（dB） | 纸面纯净度（%） | 耗时（s） |
|---|---|---|---:|---:|---:|---:|
| `proof-cycle-zh` | `gif-diff-none` | `palettegen=96:diff` + `dither=none` + `gifsicle --lossy=20` | **186.9** | 47.94 | **100.0** | 0.93 |
| `proof-cycle-zh` | `gif-full-sierra` | `palettegen=128:full` + `dither=sierra2_4a` + `--lossy=40` | 215.8 | 50.56 | 99.79 | 2.20 |
| `proof-cycle-zh` | `gif-diff-bayer3` | `palettegen=128:diff` + `dither=bayer:3` + `--lossy=20` | 242.7 | 39.95 | **38.66** | 1.10 |
| `proof-cycle-zh` | `gif-2x-lanczos-none` | 2× 超采样 PNG → Lanczos 缩至 1× → `96c diff` 无抖动 | 256.4 | 36.74 | 93.73 | 1.01 |
| `proof-cycle-zh` | `webp-anim-q84` | `img2webp -loop 0 -lossy -q 84 -m 4` | 174.9 | 39.87 | 45.93 | 1.04 |
| `proof-cycle-zh` | `webp-anim-lossless` | `img2webp -loop 0 -lossless -m 4` | **197.7** | **99.90** | **100.0** | 0.88 |
| `proof-cycle-zh` | `mp4-h264-crf22` | `ffmpeg libx264 yuv420p crf=22` | 105.8 | 38.83 | 49.20 | 0.34 |
| `ui-slop-zh` | `gif-diff-none` | `palettegen=96:diff` + `dither=none` + `gifsicle --lossy=20` | **145.1** | 41.36 | **100.0** | 0.76 |
| `ui-slop-zh` | `gif-full-sierra` | `palettegen=128:full` + `dither=sierra2_4a` + `--lossy=40` | 165.9 | 46.00 | 99.80 | 2.02 |
| `ui-slop-zh` | `gif-diff-bayer3` | `palettegen=128:diff` + `dither=bayer:3` + `--lossy=20` | 182.2 | 38.33 | **34.97** | 0.92 |
| `ui-slop-zh` | `gif-2x-lanczos-none` | 2× 超采样 PNG → Lanczos 缩至 1× → `96c diff` 无抖动 | 190.4 | 33.57 | 89.66 | 1.02 |
| `ui-slop-zh` | `webp-anim-q84` | `img2webp -loop 0 -lossy -q 84 -m 4` | 141.9 | 37.29 | 20.72 | 0.75 |
| `ui-slop-zh` | `webp-anim-lossless` | `img2webp -loop 0 -lossless -m 4` | **137.9** | **99.90** | **100.0** | 0.86 |
| `ui-slop-zh` | `mp4-h264-crf22` | `ffmpeg libx264 yuv420p crf=22` | 86.8 | 37.07 | 28.30 | 0.29 |

---

## 3. 四条可直接落地的工程结论

1. **平面校样与深色终端画面首选 `webp-anim-lossless` 配 `gif-diff-none` 回退**：
   在 `ui-slop-zh` 上，`img2webp -lossless`（`137.9 KB`）比有损 `q84`（`141.9 KB`）和 GIF（`145.1 KB`）都要小，同时达到 `99.9 dB` 无损还原与 `100.0%` 纸面纯净度；在 `proof-cycle-zh` 上，`197.7 KB` 的无损 WebP 只比无抖动 GIF 多 `10.8 KB`，却彻底消除了 96 色调色板对渐变或抗锯齿边缘的色阶取整。
2. **绝不在纯白纸面上开启 Bayer 有序抖动**：
   `gif-diff-bayer3` 把 `proof-cycle-zh` 和 `ui-slop-zh` 的纸面纯净度拉低到 `38.66%` 和 `34.97%`，同时把体积撑大了约 `26%–30%`（`242.7 KB` vs. `186.9 KB`），因为纯白底色被硬塞进了规则网格噪点。`bayer_scale=3` 只保留给全页工作台实录 `workbench-live` 这类含阴影与细密按钮灰度的画面。
3. **2× 超采样再缩 1× 对 96 色 GIF 反而负优化**：
   `gif-2x-lanczos-none` 的体积涨到 `256.4 KB` / `190.4 KB`，PSNR 却下降约 `8–11 dB`。原因在于 2× 下采样产生了更多中间灰度抗锯齿像素，挤占了 96 色共享调色板名额。直接按 `1:1` 像素 viewport 渲染是更稳的做法。
4. **社媒 MP4 与官网 `<picture>` 分工明确**：
   `mp4-h264-crf22`（`86.8–105.8 KB`）体积最小，但因 `yuv420p` 量化把白纸底压成 `28%–49%` 偏移灰底，更适合 X（Twitter）信息流视频转发（通过 `render_gifs.py --social-dir` 按需生成 `1080×600` MP4）；官网 `dislop.com` 与指南页用 `<picture>` 按顺序分发 **减动效静态 PNG → 无损动态 WebP → 无抖动 GIF**，兼顾原色保真、首屏轻量与 GitHub README 兼容。
