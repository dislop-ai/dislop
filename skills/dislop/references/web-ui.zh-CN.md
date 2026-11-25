# 网页界面、前端组件与界面文案

适用范围：HTML、CSS、JSX/TSX 组件、状态看板与浏览器界面文案。
检查命令：`dislop check <dir> --pack web-ui --format agent`

## 常见问题与改法

1. **清零死控件（`ui-dead-control`，硬伤）**：禁止输出 `<a href="#">`、空链接或没有原因说明的 `<button disabled>`。链接只填需求或代码库里真实存在的路径；未实现的功能直接删掉按钮，或用可见说明文字配 `aria-describedby` 写清禁用原因。
2. **去掉第一代默认 AI 模板（`ui-ai-gradient`、`ui-pill-soup`、`ui-box-in-box`、`ui-prompt-echo-badge`）**：不用蓝紫粉霓虹渐变、文字渐变标题、单屏超过 6 个圆角胶囊标签、三层套盒边框，以及 `AI 强力驱动`、`零幻觉保证` 徽章。
3. **别退回第二代替代模板（`ui-glassmorphism-overuse`、`ui-accent-stripe-card`）**：不要把紫粉渐变换成满屏半透明毛玻璃卡片、粗左侧彩条 `border-l-4`，或暖米白三栏图标卡片。
4. **用克制的版面结构呈现数据**：用 `1px` 细线、清晰字号层级与 `tabular-nums` 等宽数字对齐指标，保持按钮与面板克制圆角（`0–6px`）。要求输出片段时直接给组件片段，不要擅自套整页 `<!DOCTYPE html>` 壳；改旧页面时保留本来正常的布局，不无故重做。
5. **界面文案直说数字和路径**：只写需求给出的文案标签、计数、状态与真实路径，不塞宣传口号，不自己编维护时间或导出文件名。
6. **区分网页组件与海报/信息图/流程图/条漫**：单张海报或信息图不是演示文稿，不要建议“挪进演讲备注”；流程图里的开放连线和反馈回流箭头是结构关系，不要误判成多层套盒或建议删线；刻意设计的暖宣纸、暗底配色与漫画气泡予以保留。

## 三段对照

- **原稿**：``<div class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"><span>AI 强力驱动</span><h2>3 座东侧大棚待通风</h2><a href="#">下载日志</a></div>``
- **改过头**：``<div class="backdrop-blur-md bg-white/30 border-l-4 border-purple-500"><span class="rounded-full">实时可信</span><a href="#">下载日志</a></div>``
- **改干净**：``<section class="panel"><h2>3 座东侧大棚待通风</h2></section>``

## 这些别删

- 原页面里真实可用的 `href` 路径、指定文案、指标数字与单位。
- 说明禁用原因的可见文字以及 `aria-describedby`、`title` 等可访问性属性。
