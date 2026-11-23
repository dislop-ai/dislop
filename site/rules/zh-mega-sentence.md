---
content-type: reference-data
ruleId: zh-mega-sentence
pack: business-brief
tier: taste
severity: warning
family: rhythm/mega-sentence
---

# Rule: `zh-mega-sentence`

- Pack: [`business-brief`](../packs/business-brief.md) · Tier: `taste` · Severity: `warning`
- Modalities: `markdown, text, html, docx`
- Human anchor: https://dislop.com/#rule-zh-mega-sentence

## What It Catches
- EN: Single Chinese prose sentence exceeds 180 CJK characters (or 120+ CJK with 180+ total chars) without breaking.
- ZH: 中文单句一逗到底超过 180 个汉字（或 >= 120 汉字且总长超 180 字），阅读负担重，呈大模型长从句生成特征。

## Deletion Test
- EN: Split at the natural clause shift using periods so each sentence carries one main subject and action.
- ZH: 按事件或条件转换处切成句号短句，每句只交代一个主动作或边界条件。

## Exemplar (Reference Data)

```text
bad:  我们在周一完成双集群流量切分后观察到 orders-worker-service-cluster-01 核心交易接口延迟上升三毫秒但考虑到异步日志落盘能够避免主线程在高峰期被磁盘刷写操作阻塞并且可在节点异常重启后完整保留上下文追踪链路以便值班同学快速排查请求参数与调用栈因此决定保留当前配置并在周四晚低峰期继续观察四十八小时以确认内存缓冲池没有缓慢泄漏或堆积风险。
trap: 切双集群。延迟微升。观察两天。
good: 周一完成双集群切分后延迟升了 3ms，但异步落盘可防阻塞并保链路。团队周四再复查 48 小时内存占用。
```
