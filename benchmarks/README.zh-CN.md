# dislop 去 AI 味效果测试基准（`dislop-bench v2`）

[English](./README.md) · [离线基线报告](./REPORT.md) · [多角度模式库报告](./PATTERN-BENCHMARK.md) · [Agent Skill 评测报告](./SKILL-BENCHMARK.md) · [生态 Skill 对比实测（30 题）](./ECOSYSTEM-BENCHMARK.zh-CN.md) · [真实模型在线对比](./MODEL-COMPARISON.md)

这套基准用来回答两个硬问题，不靠主观感觉：

1. **检查准不准（`Suite A`，112 份核心样本 = 48 基准 + 16 `holdout-v1` + 48 `text-hard-v2`；另含 `PATTERN-BENCHMARK.md` 154 份多角度模式样本）**：在跨语种与避开禁用词的难例上，误报率是不是保持 `0.0%`，关键词共现、标点微节奏、叙事三明治、句首骨架复现与低突发性空话能不能稳稳抓出来，Node.js 与 Python 两个引擎的规则结果与 5 轴统计画像是不是 100% 一致。
2. **改完有没有真去 AI 味（`Suite B`，18 组任务 = 12 `revision-v1` + 6 `revision-hard-v2` × 3 组对照）**：把 18 组跨媒介与多段干净词表任务分别交给「模型原稿」「普通改写（换词/改口号）」和「按 dislop 规矩改写」，按 4 个正交维度打分（权重 `D1=45 / D2=20 / D3=25 / D4=10`）：多维确定性清零（45 分）、三阶结构味（20 分）、关键数字保真与正文完整度（25 分）以及独立统计节奏与具体度画像（10 分）。当前离线基线：`raw_ai` `60.8` → `naive_humanizer` `70.8` → `dislop_clean` `100.0`（`18/18` 全过）。

所有测试样本均为原创构造，按 `CC0-1.0` 公开，零网络依赖、零付费接口，任何人在断网环境下都能复现。

## 一键离线运行

```bash
# 运行全部 112 份核心检测样本 + 18 组改稿任务（含 Node/Python 规则与画像一致率核验）
node scripts/run_benchmark.mjs

# 在 CI 或改规则前做回归门禁（掉分直接退出码 1）
node scripts/run_benchmark.mjs --assert

# 重新生成 benchmarks/REPORT.md 与 benchmarks/results/latest.json
node scripts/run_benchmark.mjs --write-report

# 运行 154 样本多角度反模式基准与 53 模式结构校验
node scripts/pattern_lab.mjs verify
node scripts/pattern_lab.mjs assert

# 在 stealth-vapor-v1 与留出集上离线复测内置 14.6 KB Pocket ML 模型
PYTHONPATH=src python3 scripts/train_pocket_models.py --eval-only

# 运行 Agent Skill 离线断言与参考卡防泄漏检查
npm run bench:skill

# 跑 5 种离线技术范式对照实验（传统黑名单 / 纯统计 / 传统 NLP 机器学习 / 多维规则 / 混合画像）
PYTHONPATH=src python3 scripts/run_text_paradigm_experiments.py
```

## 评测你自己的模型、Prompt、Skill 或后台

把任意模型、Skill 或云端端点（例如 `无 Skill` vs `装 dislop Skill` vs `dislop-cloud /api/v1/deslop`）对 [datasets/revision-v1.json](./datasets/revision-v1.json)（12 题）与 [datasets/revision-hard-v2.json](./datasets/revision-hard-v2.json)（6 题，共 18 题）中 `source` 的输出保存为 `dislop.bench-run/1` JSON：

```json
{
  "schema": "dislop.bench-run/1",
  "label": "model-ab-test",
  "arms": {
    "baseline_no_skill": {
      "rev-zh-01-launch-note": "..."
    },
    "with_dislop_skill": {
      "rev-zh-01-launch-note": "..."
    }
  }
}
```

运行离线打分与生成盲评表：

```bash
# 输出各实验组的 0-100 综合分、确定性命中、三阶结构味与数字保真率
node scripts/run_benchmark.mjs --eval path/to/run.json

# 生成随机打乱顺序的 A/B 人工盲评表（blind-sheet.md）和独立答案映射（blind-key.json）
node scripts/run_benchmark.mjs --export-blind-sheet baseline_no_skill with_dislop_skill --input path/to/run.json
```

## 目录结构

- `datasets/detection-v1.json`：48 份跨媒介检测样本（中文工作文档、中文随笔、英文技术文档、英文随笔、HTML/CSS 界面、PPTX 幻灯片，含易误报干净样本与二阶口号陷阱）。
- `datasets/holdout-v1.json`：16 份真实对抗留出集（8 难正例 + 8 难负例）。
- `datasets/text-hard-v2.json`：48 份避开旧禁用词的纯文本对抗难例，覆盖关键词共现、标点微节奏、叙事三明治、句首骨架复现与低突发性空话。
- `datasets/pattern-challenge-v2.json`：62 份多角度模式挑战样本（33 正例 + 29 干净负例），覆盖全部 6 个维度。
- `datasets/holdout-v2.json`：28 份未见跨维度对抗留出样本（14 正例 + 14 干净负例）。
- `datasets/stealth-vapor-v1.json`：24 份同题配对 2–4 句隐蔽温吞水与真人朴实段落，用于评测内置 Pocket ML 模型。
- `datasets/revision-v1.json`：12 组端到端文案与设计去 AI 味对照任务。
- `datasets/revision-hard-v2.json`：6 组多段干净词表文本去 AI 味难例任务（3 中文 + 3 英文）。
- `datasets/skill-routing-v1.json`：32 条中英文 Skill 触发与参考卡路由评测用例。
- `datasets/skill-drafting-v1.json`：12 组带核验数字、边界词与方向对的零基起草任务。
- `datasets/skill-revision-ext-v1.json`：12 组扩展审校与干净原稿防误伤保真任务（含 `.docx`、温吞水、复盘与合规陷阱）。
- `datasets/skill-holdout-v1.json`：10 组近迁移留出测试任务，覆盖含修订标记 `.docx`、多页 `.pptx`、CLI 帮助文案、跨语种指令与随笔字数下限。
- `REPORT.md`：由 `scripts/run_benchmark.mjs` 自动生成的核心实测成绩单。
- `PATTERN-BENCHMARK.md`：由 `scripts/pattern_lab.mjs` 自动生成的 154 样本多角度反模式成绩单。
- `SKILL-BENCHMARK.md`：Agent Skill 四组对照评测报告（路由、起草、审校、保真、留出集与跨模型盲评）。
- `results/latest.json`：完整机器可读评分结果。
- `results/skill-benchmark-latest.json` 与 `results/skill-round-history.json`：脱敏后的 Skill 第 1–5 轮评测汇总。
