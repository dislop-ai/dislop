# CLI 专项优化技术调研与实测记录（`v0.7.1` 分支基线）

本报告记录围绕 [PRODUCT.md](../../PRODUCT.md) 三层产品定位对 `dislop` 双运行时 CLI（`bin/dislop.mjs` 与 `src/dislop/`）开展的专项调研、设计实验与四轮收敛实测。

## 一、三层定位与 CLI 痛点诊断

对照 [PRODUCT.md](../../PRODUCT.md)（纯文档 `Skill` -> 零依赖本地 `CLI` + 按需自备密钥深审 -> 托管云端 MCP），改造前基线（`v0.7.1`、`697ea6a`）共有四处短板：

| 方面 | 基线短板 | 优化目标 |
|---|---|---|
| 命令契约与性能 | 未知参数缺少纠错提示、畸形配置抛栈、Python 扫描偏慢 | 严格参数校验与统一退出码 `2`，缓存正则编译提速 |
| 语域区分与 Agent 输出 | 技术、议论等文体共用提醒尺度，`json` 负载过大 | 支持 `--register` 与 `--format agent` 紧凑改法输出 |
| 自备密钥本地深审 | 缺少显式授权才发包的本地端 BYOK 深审子命令 | 新增 `--yes`/`--dry-run` 显式授权与原文事实核验 |
| 统一体检入口 | 无法一次离线盘点三层接入与 `.dislop.local.json` 边界 | 新增默认零联网的 `dislop doctor` |

## 二、四轮核心改动与安全边界

1. **严格解析、品牌文案对齐与 Python 正则编译提速（Round 1）**：
   - 在双端统一声明式严格参数表（拒绝未知长参并给出 Levenshtein 纠错提示、禁用缩写匹配）、`--changed` 路径与 Git 引用消歧、`--deep` / `-q` 静默门禁、`--rule` 合法性校验，以及 BOM 感知 HTML 识别与 ZIP/二进制标准输入拦截。
   - Python 引擎（`src/dislop/engine.py`）引入 `@functools.lru_cache` 缓存正反例编译与仅限 `prose` 区的 `^[^\S\r\n]*` 行首锚点归一化。
2. **显式语域调制、结构化改法提示与 `--format agent`（Round 2）**：
   - 支持 `--register <id|auto>` 与 YAML 前置元数据解析（显式优先级：`CLI 标志 > 前置元数据 > .dislop.json overrides[].register/register > unspecified`，不靠猜词自动切换）。
   - 在 `packs/business-brief/pack.json` 与 `packs/literary-essay/pack.json` 落地数据驱动 `registerOverrides`，并在每条命中补齐 `confidence` 与上下文锁定 `revision`（`kind`、`scope`、`instruction`、精确保留原文数字/日期/单位/代码的 `keep` 列表、`avoid`）。
   - 新增 `--format agent` 与 MCP `dislop_check` `register` 参数，省略冗长负向正反例，按严重度与行列稳定排序且默认封顶 30 条。
3. **显式授权 BYOK `dislop review` 与三层体检 `dislop doctor`（Round 3）**：
   - 在 `src/review-client.mjs` 与 `src/dislop/review_client.py` 实现零外部依赖的 `dislop review`（`dislop.review/1`），支持 `openai`、`gemini`、`openrouter`、`compatible` 与本机回环 `local` 五类端点。
   - **安全不变量**：远端必须传 `--yes` 或 `DISLOP_ALLOW_REMOTE=1`；`compatible` 仅认 `DISLOP_REVIEW_API_KEY`、`local` 仅认可选 `DISLOP_LOCAL_API_KEY`（绝不混用 `OPENAI_API_KEY`）；本地端点直连已验证回环 IP（支持 `::1 -> 127.0.0.1` 双栈回退、禁止 HTTP 重定向与系统代理、Python `_PinnedHTTPSConnection` 保留 TLS SNI 主机名校验）；远端发送前以不可被 `dislop-ignore` 豁免的规则扫描 `.dislop.local.json` 的 `forbid` 清单（含文件名、正文及零宽断言正则）；返回结果强制要求逐字原文引用、CSS 纳入事实保护范围、CRLF 分段精确定位行号，并核验 `summary` / `why` / `fix` 不含原稿不存在的数字、日期、URL 或代码标识；办公文档解析默认过滤 Word `<w:vanish>` 隐藏运行及嵌套文本框隐藏块、PowerPoint 隐藏页及演讲备注页码占位。
   - 新增 `dislop doctor`（默认零联网；仅 `--online` 且未处测试熔断时探测 `https://dislop.com/mcp` 对应健康端点）。

## 三、实测对照与基准数据

| 实验项 | 基线表现 | 优化后实测 | 说明与核验路径 |
|---|---|---|---|
| Python 全仓扫描耗时（`check .`） | `4,747.3 ms` | `814.3 ms` | 提速约 `5.8x`；`node check .` 保持 `725.3 ms`（`742.3 ms -> 725.3 ms`） |
| `--format agent` 输出体积（相对 `--format json`） | `5,797–7,078 B` | `724–899 B` | 三组样本（中文简报 `899 B`、英文 RFC `724 B`、前端 HTML `775 B`）平均缩减约 `89%` |
| 规则与模式基准（`dislop-bench v2`） | `42` 规则 / `164` 断言 | `42` 规则 / `172` 断言 / `53` 模式 | 112 样本核心集与 154 样本模式集准确率/召回率/F1 均为 `100.0%`、干净误报 `0.0%` |
| 轻量集成模型一致性（`test:models`） | `36/36` 精确对齐 | `36/36` 精确对齐 | `14.6 KB` gzip（`< 0.5 ms`），`stealth-vapor-v1` F1 `100.0%` |
| 在线 BYOK 实测抽检（`gemini-3.1-flash-lite-preview`） | — | 3 样本全通 | 中文商业简报 `rc=1`（4 命中 / 0 过滤）、英文 RFC `rc=1`（3 命中 / 0 过滤）、中文议论文 `--register argumentative` 降级后 `rc=0`（2 条低置信提示 / 0 过滤） |
| 打包体积与双端测试集 | `26` Python 单测 | `225.0 kB` · `54` Python 单测 | `npm pack --dry-run`（54 文件）低于 `250 KB` 门槛；Node 与 Python 自审均 0 命中 |

## 四、三角色黑盒走查结论

- **编码代理（Coding Agent）**：验证 `--format agent` 在中英文与不同 `--register` 下输出字节级一致；MCP `dislop_check` 返回精确 `context` 与紧凑 `revision`（不含 `exemplar`）；`review --dry-run --json` 明确展示 `consent` 字段且 URL 已剥离查询参数。
- **终端与 CI 开发者**：验证 `--changed HEAD -q --fail-on warning` 只扫描变更文件并按阈值静默或报错；`doctor --lang zh --json` 在测试熔断与常规环境准确反馈 3 层状态、`.dislop.local.json` 忽略情况与工作区/安装包内置 Skill 状态；错拼长参返回退出码 `2` 并给出建议。
- **办公文档作者（`.docx` / `.pptx`）**：验证带文本框、修订标记、隐藏 `<w:vanish>` 块、隐藏幻灯片与演讲备注的文档在本地与 `review --provider local --include-notes --lang zh` 下 Node 与 Python 逐字一致返回审校结果并过滤幻灯片页码字段。
