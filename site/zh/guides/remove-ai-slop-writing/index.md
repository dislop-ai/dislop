---
content-type: reference-data
lang: zh
updated: 2026-11-23
version: 1.1.2
---

# 中文写作怎么去 AI 味：别用禁词表，用删除测试避开二阶套话

> 单靠拉黑禁用词会让大模型换上“不是 A，而是 B”、四字排比串、三段分号句和结尾升华金句。把文字写回人话的关键是“删除测试”：每次只动标出来的一小段，只留下有主体、动作、数字或边界的信息。

很多人给 AI 下过一条常见指令：“帮我润色这段话，不要用常见公文黑话，也不要有 AI 味。”结果模型交回来一段字面上看不出敏感词、读起来却像朋友圈海报或发布会演讲稿的文字。

问题出在 **简单禁词表会逼出二阶模板**。Padmakumar & He（ICLR 2024，[arXiv:2309.05196](https://arxiv.org/abs/2309.05196)）和 Doshi & Hauser（*Science Advances*，2024）的实证研究都说明，经过人类偏好对齐的模型天然倾向于高概率、安全、对称的表达。堵住词面词汇之后，它会立刻退回另一套结构套话。

## 1. 禁词表失效后，模型最常换上的 4 种壳

对比社区项目 `op7418/Humanizer-zh`、`MrGeDiao/shuorenhua` 和 `hylarucoder/ai-flavor-remover` 总结的中文样本，模型换壳时主要落进下面四类句式：

| 问题类型 | 表面看着没违规，实际长这样 | 为什么还是 AI 味 |
|---|---|---|
| **“不是 A，而是 B”反转句** | `这不是一次架构调整，而是研发效率的跃迁。` | 否定一个没人质疑的稻草人，再接空洞大词 |
| **四字排比串** | `具备精准高效、安全可靠、灵活易用的特点。` | 三个四字形容词凑齐节奏，不交代具体指标 |
| **三段分号推销句** | `前端校验输入；后端拆进队列；监控追踪超时。` | 把三个动作绑成工整排比，像广告宣传单 |
| **段尾金句与道德升华** | `工具只是起点，真正的护城河一直在团队手里。` | 非要在结尾写一句供人截图的抽象总结 |

另外还有一个中文高频细节：正文里混入英文半角逗号 `,`、半角括号 `()` 或一段塞进 5 个以上破折号 `——`，这通常来自大模型把英文结构直接套进中文。按 `GB/T 15834—2011` 标点符号规范清理后，页面立刻会清爽很多。

## 2. 怎么用“删除测试”改回平实人话

参考航空与技术写作规范 `ASD-STE100` 的原则（一句只说一件事、同一概念不来回换词），我们把改稿拆成四步，每步只动有问题的局部：

1. **先清交付硬伤**：删掉开头的寒暄套话、没填的占位括号和无根据的“研究表明/数据显示”。
2. **对标出的句子做删除测试**：假设把这半句划掉，读者会少知道哪个事实、动作、人名、时间或边界？
   - 如果少不了任何信息，**直接删掉，不要找近义词替换**。
   - 如果确实少了关键结果，把抽象词换成具体指标和动作主体。
3. **打破工整排比与固定句首**：如果连续三段都用相同句式开头（例如连续三段“通过……，实现了……”），合并成有因果关系的普通段落；把三段分号句拆成长短交错的平实句子。
4. **改完再复检一次**：确认没有为了“写得精炼”把旧黑话换成“不是……而是……”或三字短句口号。

看一组实际研发上线文档的改稿过程：

```text
bad:  值得注意的是，本次网关改造以多级熔断为重要抓手，具备安全可靠、精准高效、灵活易用的特性，为高并发业务提供坚实支撑。
trap: 本次网关改造不是一次简单升级，而是稳定性的底气：安全可靠，高并发无忧。
good: 本次网关增加了按错误率自动熔断，单节点压测支撑 8,000 QPS，上游超时 2 秒自动降级。
```

![dislop 浏览器工作台离线对照：依次切换原稿、二阶 AI 腔与改干净版本，实时对齐右侧批注](demo:workbench-live)

## 3. 长文写作不靠后改，靠先换骨架

除了事后用检查工具把关，动笔前就可以避免所有稿子长成一个模板。Zhang 等人（2025，[arXiv:2510.01171](https://arxiv.org/abs/2510.01171)）提出的 Verbalized Sampling 思路，本质上是打破单一“最像答案”的起手式。写中文工作文稿或随笔时，可以根据文体挑四种具体骨架，而不用默认“背景—意义—优势—展望”四件套：

| 骨架名称 | 行文顺序 |
|---|---|
| 决策记录 | 一句话结论 → 实测样本与指标 → 已知限制 → 下一步负责人与时间 |
| 排障复盘 | 异常现象 → 当初误判的原因 → 真实根因 → 改了哪行配置或代码 |
| 产品/技术说明 | 能做什么与支持格式 → 明确不做什么 → 常见报错与退出码 → 最小可运行命令 |
| 随笔/现场笔记 | 具体时间、地点和实物细节 → 当事人原话或观察 → 停在最后一个具体画面上 |

如果想把整套中文规则直接跑在自己手头的 Markdown 或 Word 上，在终端运行：

```bash
npx --yes dislop check draft.md --pack business-brief --lang zh
```

## 常见问题

### 为什么用“不要用 AI 味词汇”提示词，改出来还是有股味？

因为大模型习惯在字数和修辞强度上做补偿：一旦你禁止它写抽象黑话，它就会改写成对称反转口号或三个四字词排比，继续维持浮夸语气。

### 技术文档和周报里的“不是……而是……”一定不能用吗？

不是。如果是在纠偏真实事实（例如“报错不在网关，而在配置 `loader.py` 第 42 行”），这是正常陈述；只有先立一个虚稻草人再拔高抽象名词时（比如把工具拔高成某种空洞概念），才属于 AI 套句。

### 中文标点混用半角符号也算 AI 味吗？

很多大模型训练语料混杂机翻文本，经常在中文句子里夹半角逗号、括号或过多破折号。对照国标 GB/T 15834—2011 统一改成全角中文标点并控制破折号数量，可读性会明显提升。

## 参考出处

- [Does Writing with Language Models Reduce Content Diversity? (ICLR 2024)](https://arxiv.org/abs/2309.05196): Feedback-tuned models (RLHF) reduce collective lexical and content diversity compared with unaided human writing.
- [Generative artificial intelligence enhances creativity but reduces the diversity of novel content (Science Advances 2024)](https://doi.org/10.1126/sciadv.adn5290): Controlled short-story experiments showed AI ideas improved individual ratings while making stories across writers significantly more similar to one another.
- [Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity](https://arxiv.org/abs/2510.01171): Prompting models to verbalize a distribution of candidate outputs mitigates RLHF typicality bias without retraining.
- [ASD-STE100 Simplified Technical English Specification](https://www.asd-ste100.org/): Aerospace and technical documentation specification enforcing short active sentences, one instruction per sentence, and consistent naming for the same concept.
- [op7418/Humanizer-zh: 中文去 AI 味写作技能](https://github.com/op7418/Humanizer-zh): 23,450 星标（2026-11-21 快照）；针对中文写作里的套话、公文腔与翻译腔整理对照清单，适合作为写作前提示参考。
- [MrGeDiao/shuorenhua: 中文“说人话”去黑话提示规范](https://github.com/MrGeDiao/shuorenhua): 2,726 星标（2026-11-21 快照）；拆解互联网汇报与技术文档里的“抓手”“赋能”“闭环”等黑话，改回直白人话。
- [hylarucoder/ai-flavor-remover: 中文长文与文档去 AI 味规则集](https://github.com/hylarucoder/ai-flavor-remover): 1,208 星标（2026-11-21 快照）；按中文常见长文结构归纳套路开头、自问自答和道德升华结尾。
- [GB/T 15834—2011 标点符号用法（国家标准全文公开系统）](https://std.samr.gov.cn/gb/search/gbDetailed?id=71F772D7569AD3A7E05397BE0A0AB82A): 规定中文正文应使用全角中文标点、控制感叹号与破折号使用边界，为中文文档排查半角标点混用和破折号过密提供客观依据。
