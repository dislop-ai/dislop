---
roleHint: "适用范围：中文商业汇报与技术演示幻灯片（检测页数：{{slideCount}}）。"
rules:
  - id: vague-slide-headline
    priority: strong
  - id: slide-prose-dump
    priority: strong
  - id: bullet-jargon-padding
    priority: moderate
  - id: unanchored-slide-multiplier
    priority: moderate
---

1. **vague-slide-headline**: 当内容页的要点已经给出明确的数据结果或业务决策，而该页标题仍是抽象口号或空泛目录词（如“多维赋能促增长”、“项目整体概况”）时触发。封面页与章节过渡页不触发。修改建议：基于当页既有事实，将标题提炼为一句话核心结论。
2. **slide-prose-dump**: 当幻灯片文本框直接照搬长篇书面报告段落、被铺垫从句和连接虚词淹没扫读重点时触发。修改建议：凝练掉过渡虚词以利投影扫读，同时完整保留所有原始数值、单位、主体与限定口径。
3. **bullet-jargon-padding**: 当同一页多条要点连续以“着力打造 / 全面筑牢 / 深度赋能 / 持续夯实”等重复公文套话前缀起头时触发。修改建议：去掉重复套话前缀，直接写出具体动作与量化结果。
4. **unanchored-slide-multiplier**: 当幻灯片中出现缺少对比基线或统计周期的悬空倍数与模糊增幅（如“效能提升数倍”、“响应速度大幅跃升”）时触发。修改建议：补充具体的对比基线与统计时间窗口。
