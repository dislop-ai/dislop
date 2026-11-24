# 日常更新与多出口发布规范

[English](./releasing.md)

`dislop` 的日常更新和发版只靠一套零依赖脚本（`scripts/release.mjs`）、一条 GitHub Actions 流水线（`.github/workflows/release.yml`）和 Agent 的现场判断配合完成。不引入额外发版框架，也不把每次微调都跑成重型全平台发包。

---

## 按改动范围分三档推进

动手或收尾前先跑一条命令看清各对外出口是否对齐：

```bash
npm run release:status
```

这条命令会在 1 到 2 秒内并行查询本机 `HEAD`、GitHub 最新 Release（含 `.vsix` 资产）、仓库简介与 `dislop-ai/.github` 主页、官网 `https://dislop.com` 的 `/catalog.json` 和 `/api/health` 接口、`npm`、`PyPI` 以及官方 MCP Registry，直接标出 `[OK]` 或 `[LAG]`。

确认现场后，按本次实际改动走最短路径：

| 档位 | 适用场景 | 执行步骤 |
|---|---|---|
| **第 1 档：官网、文案或工具清单日常更新** | 只改了 `site/`、`docs/`、`awesome/` 或 `ROADMAP`，未改动 `src/`、`bin/`、`packs/`、`patterns/`、`skills/` 与 `integrations/` | **不升版本号，不发 npm / PyPI 包。** 改完源文件后跑 `npm run release:check`，直推 `main` 并同步官网静态目录，最后跑 `npm run release:status` 确认线上 `HTTP 200`。 |
| **第 2 档：补丁发版 `0.Y.Z`** | 修规则误报或漏检、CLI/MCP 参数小修、插件清单或编辑器扩展修补 | 补齐对应 `pack.json` 的 `hit` / `clean` 样本，在 `CHANGELOG.md` 写清 `[0.Y.Z]` 变更，执行 `npm run release -- 0.Y.Z [--deploy] --commit --tag --push`，等 Actions 跑完后用 `npm run release:status` 核验各注册表同号，关闭关联 Issue。官方社媒账号保持静默。 |
| **第 3 档：特性或里程碑发版 `0.(Y+1).0`** | 新增场景规则包、新增检测维度、重大功能上线或里程碑收口 | 完成第 2 档全部动作后，同步更新 GitHub 仓库简介（`gh repo edit`）、`dislop-ai/.github` 组织主页、`ROADMAP.zh-CN.md` 与 `ROADMAP.md` 勾选并关闭到期 Milestone，再由 Agent 按内容价值拟定官方号对比案例帖。 |

### 多会话同仓防踩踏

如果多名开发者或多个 Agent 会话正在同一本地目录并行工作（`git status --short` 里有不属于本任务的未提交文件），不要直接运行带 `git add -A` 的 `release --commit`。先只 `git add` 本任务修改的路径完成提交，然后拉一个临时干净 Worktree 执行发版与推送：

```bash
git worktree add --detach /tmp/dislop-rel HEAD
(cd /tmp/dislop-rel && npm run release -- 0.6.2 --commit --tag --push)
git worktree remove /tmp/dislop-rel
git fetch origin && git merge --ff-only origin/main
```

本机配了 Git 忽略的 `.private/deploy.local.sh` 时，加上 `--deploy` 会在本地预检通过后自动同步闭源云端规则副本、更新云端版本号并校验 `https://dislop.com/llms.txt` 与 `/api/health` 返回 `HTTP 200`。

---

## 各对外出口怎么保持一致

仓库内的数字和版本号靠确定性脚本锁死，仓库外的展示窗口由 Agent 在第 3 档发版时按需同步：

### 第一组：打 Git Tag 自动同步（日常 0 手工操作）

| 对外出口 | 已完成的基础配置 | 平台规则与常见坑 | 更新机制 |
|---|---|---|---|
| **GitHub Releases & Action** | 根仓 `action.yml` 与 Release 打包已就绪 | `action.yml` 名称须全局唯一并保留 `branding` | 推送 `v*.*.*` Tag 后自动提取 `CHANGELOG.md` 创建 Release，挂载 `.tgz`、`.whl`、`.tar.gz` 与 `dislop-<ver>.vsix` |
| **`skills.sh` 技能榜** | 首次 `npx skills add` 已完成索引 | 读取 `main` 分支 `skills/dislop/SKILL.md`，正文保持在 `2.5 KB` 内，子参考卡走相对路径 `./references/*.md`；仓库根目录不放面向内部维护者的公开 Skill 以免污染用户安装列表 | 合并 `main` 即更新 |
| **Gemini CLI 扩展画廊** | 仓库已绑 `gemini-cli-extension` Topic | 根目录保留合法 `gemini-extension.json`，且必须有正式 Git Tag / Release 才会被官方每日爬虫抓取 | 推送 `v*.*.*` Tag 后 24 小时内自动收录更新 |
| **Claude 与 OpenAI 插件目录** | 仓内 `.claude-plugin/`、`plugin.json` 与 `agents/openai.yaml` 已锁死校验（外部商店按计划待人工资质提审） | `plugin.json` 严格执行 `agent-plugins.org/1.0.0` 封闭顶层字段，`shortDescription` 硬上限 `30` 字符；`.gitignore` 须放行 `.agents/plugins/marketplace.json` | 仓库发布新版本后客户端自动拉取升级 |
| **`pre-commit` 钩子生态** | 根仓 `.pre-commit-hooks.yaml` 已上线 | 外部仓库锁的是 Git Tag（`rev: vX.Y.Z`），不能删改已发布 Tag | 用户执行 `pre-commit autoupdate` 升级 |

### 第二组：GitHub Actions OIDC 自动发包

| 对外出口 | 认证与绑定状态 | 平台规则与常见坑 | 更新机制 |
|---|---|---|---|
| **npm（`dislop`，已在架）** | 已在 `npmjs.org` 发布 `dislop` 并将默认清单切至 `--channel registry`；在 `npmjs.com/package/dislop/access` 绑定 Trusted Publisher（`dislop-ai` / `dislop` / `release.yml`）并开启 `NPM_OIDC_ENABLED=true` 免长期密钥 | 启用 OIDC 时严禁注入空的 `NODE_AUTH_TOKEN`（`release.yml` 已自动清理）；若同版本已由终端先行发布，`publish-npm` 会幂等跳过并放行下游 MCP Registry；`package.json` 须保留 `"mcpName": "io.github.dislop-ai/dislop"` | 推送 `v*.*.*` Tag 后 `publish-npm` 自动签名发布 |
| **PyPI（`dislop`，已在架）** | 已绑定 GitHub OIDC Trusted Publisher（`dislop-ai` / `dislop` / `release.yml` / Environment `pypi`）且已开启 `PYPI_OIDC_ENABLED=true` | `README.md` 末尾须保留 `<!-- mcp-name: io.github.dislop-ai/dislop -->` 供下游 MCP Registry 校验归属；已开启 `skip-existing: true` 支持幂等重跑 | 推送 `v*.*.*` Tag 后 `publish-pypi` 自动构建并发布 |
| **Official MCP Registry（`io.github.dislop-ai/dislop`，已在架）** | 已通过 `mcp-publisher login github-oidc` 在 `registry.modelcontextprotocol.io` 激活 | **必须在同版本 npm 与 PyPI 都上架成功后再跑**（`needs: [publish-npm, publish-pypi]`）；`server.json` 的 `description` 硬上限 `100` 字符，且版本号须严格递增 | 推送 `v*.*.*` Tag 后自动推送本地 `stdio` 与远程 `https://dislop.com/mcp` 双入口 |
| **VS Code Marketplace & Open VSX** | `integrations/vscode/` 已内置 `.vscodeignore` 与构建期 `LICENSE` 同步，每次发版自动生成零警告 `.vsix` 挂入 GitHub Release | `vsce` 禁止扩展 `README.md` 引用相对路径 SVG 或非 HTTPS 图片；后续配好 `VSCE_PAT` 与 `OVSX_PAT` 即可自动直推双商店 | 推送 `v*.*.*` Tag 后 `publish-editor-extensions` 自动打包并按密钥状态发布 |

### 第三组：官网、云端、GitHub 看板与官方号联动

- **官网与云端同号（`dislop.com`）**：`scripts/build_site.mjs` 同源生成 `site/`、`/llms.txt`、`/catalog.json`、`/robots.txt` 与 `/sitemap.xml`；闭源云端同步脚本 `sync_core.mjs` 在复制 `src/core.mjs` 与 `packs/` 时会自动把云端 `package.json` 版本号对齐到 `ENGINE_VERSION`，确保 `https://dislop.com/api/health` 与静态站永不分叉。
- **GitHub 简介、组织主页与看板**：当包数、规则数、模式数或工具数变化时，除了仓库内的 `README*.md`、`ROADMAP*.md` 与 `docs/architecture*.md`（漏改会被 `release:check` 直接拦下），顺手更新仓库简介与 `dislop-ai/.github/profile/README.md`（推送前跑 `dislop check --fail-on info`）。日常任务状态只维护在 GitHub Issues，发版收口时再统一勾选 `ROADMAP*.md` 并关闭到期 Milestone。
- **官方号（`@dislop_ai`）保持纯英文按价值发声**：不要接死板的“每次打 Tag 自动发推”机器人。`@dislop_ai` 固定为 100% 纯英文账号（不混发中文帖）；补丁修修补补一律静默，只有当新版本带来直观的前后改稿对比、新文件格式支持或基准实测突破时，再由 Agent 按 [Voice, Copy, and Visual Guide](./brand-and-voice-guide.md) 拟英文稿（首句落具体原文或数字，主帖 240 字符内不放外链并配对比图卡，1 楼放安装命令与 `https://dislop.com/`，全文过 `dislop check - --fail-on info`），检查发帖间隔后经受控入口发布。

---

## `npm run release:check` 自动守住的离线门禁

发版前一条命令串行跑完，全部离线执行，任何一步报错立刻中止：

1. **清单与版本号同源锁死**（`sync_manifests.mjs --check`）：核对双端内核、`package.json`、`pyproject.toml`、`SKILL.md`、`integrations/vscode`、`herdr` 及 19 份同步清单版本与字段长度限制完全一致。
2. **跨文档核心数字与 `CHANGELOG` 校验**：自动统计真实的规则包数、规则数、反模式数与工具清单条目数，核对 `README*.md`、`ROADMAP*.md`、`docs/architecture*.md` 与插件简介无陈旧数字，且 `CHANGELOG.md` 已写好当前版本小节、无回退 `github:dislop-ai/dislop` 临时坐标。
3. **开源脱敏与凭据扫描**：扫描全部跟踪与未忽略文件，拦截密钥、本机用户路径、内部协议链接、私密目录与遗漏 `mcp-name` 标记。
4. **官网与工具清单编译及静态断言**（`build_site.mjs` + `test_site.mjs`）：校验全部配置块 `JSON.parse()`、`/robots.txt` 与 `/sitemap.xml`、中英文零混排及对比度。
5. **双端规则夹具、模式库、轻量模型与基准回归**：跑通 Node/Python 双端 160 项夹具断言、154 样本模式基准、14.6 KB 模型一致性、`dislop-bench v2`（112 检测样本 + 18 改稿任务）及 27 项 Python `unittest`。
6. **全仓去 AI 味自查**：全仓跑 `--fail-on warning`，官网、研究文档、发版指南、Skill 与路线图跑 `--fail-on info`。
7. **真实打包与插件严格校验**：实打 `npm pack`（`<= 300 KB`）、`uv build` 构建 Wheel、`claude plugin validate`、`agy plugin validate integrations/antigravity --strict` 以及 VS Code 扩展单测。

---

## 常见异常怎么处理

- **某个外部注册表暂未完成（例如 npm 尚未绑 OIDC 或偶发超时）**：先跑 `npm run release:status` 看清具体是哪一项标了 `[LAG]`。只需补推滞后的那一项或在 GitHub Actions 页面点 **Re-run failed jobs**，其余已成功的平台都做了幂等跳过，不会报错也不会重复上传。
- **刚打完 Tag 发现小问题**：npm、PyPI 和官方 MCP Registry 都不允许覆盖已发布的同版本号。不要删线上已发布的 Git Tag，修好后直接发下一个补丁号（例如 `0.6.2`）即可。
