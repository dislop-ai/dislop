---
roleHint: "适用范围：中文网页界面微文案、首屏标语、操作按钮文案与落地页客户背书。"
rules:
  - id: prompt-echo-copy
    priority: strong
  - id: redundant-card-subcopy
    priority: moderate
  - id: verbose-cta-label
    priority: moderate
  - id: synthetic-social-proof
    priority: moderate
  - id: emoji-feature-grid
    priority: hint
---

1. **prompt-echo-copy**: 当首屏主副标题或徽章堆砌“开启新纪元”、“全方位赋能”、“一站式重塑”、“极智体验”等生成式营销套话，而未能说明产品实际用途时触发。修改建议：基于页面已有的具体功能，改用平实直白的语言写明支持的任务或使用效果。
2. **redundant-card-subcopy**: 当特性卡片正文只是把卡片小标题加几个修饰词重复一遍（例如标题“实时同步”，描述“为您带来无感的多端实时数据同步体验”）而无新增信息时触发。修改建议：去掉同义重复词，补充具体支持范围、工作机制或性能边界。
3. **verbose-cta-label**: 当按钮、导航或空状态控件使用冗长客套的助手腔句子（如“立即点击开启您的专属智能体验之旅”）、超出紧凑界面槽位时触发。修改建议：收敛为 2 至 6 字的明确动宾短语（如“免费试用”、“查看文档”）。
4. **synthetic-social-proof**: 当落地页出现无真实客户署名或无统计口径的模板化背书（如“已助力 10,000+ 行业领军企业降本增效”）时触发。已标明真实客户名称或统计来源的数据不触发。修改建议：补充真实署名案例与可核实口径，或移除模板背书。
5. **emoji-feature-grid**: 当多个特性卡片标题或导航入口依赖前置装饰性 Emoji 充当图标时触发。修改建议：移除标题前的装饰 Emoji，改用纯文字排版或统一图标组件。
