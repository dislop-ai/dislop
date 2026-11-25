---
roleHint: "适用范围：绕过固定括号正则的中文对话交差痕迹、作者自留备忘指令与测试假名残留。"
rules:
  - id: implicit-assistant-framing
    priority: strong
  - id: disguised-placeholder-prose
    priority: strong
  - id: synthetic-example-entity
    priority: moderate
---

1. **implicit-assistant-framing**: 当句意面向提示词提问者而非最终读者、属于助手交差开场或客套收尾时触发（例如“根据您提供的会议纪要，现为您梳理如下：”、“以上文稿已按要求压减字数，供您审阅。”）。作者面向真实读者的正常第一人称引言不触发。修改建议：移除该交差过渡句，直接保留正文主体。
2. **disguised-placeholder-prose**: 当正文中混入写给作者自己的待办备忘而非成品叙述时触发（例如“此处后续补上法务确认后的违约金比例”、“这里需要贴一张压测监控截图”）。修改建议：发稿前补齐真实确认信息，或移除尚未定稿的占位句。
3. **synthetic-example-entity**: 当正式交付文稿（非接口教学示例）中出现未替换的“某某公司 / 某知名企业 / 张三李四 / 某部门”假名时触发。教学文档或测试规范中的有意示例不触发。修改建议：替换为真实的机构、项目或责任人名称。
