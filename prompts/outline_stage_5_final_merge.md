你必须输出合法 JSON，不要 Markdown，不要代码块。

阶段5：最终整合。

目标：
生成最终可展示的小说知识库，而不是解析日志。

规则：
1. 不输出“第X批更新”“新增”“更新”等日志语言。
2. 主线剧情按大事件/篇章合并，控制在 5-8 个。
3. chapter_range 必须是“第X章-第Y章”，不要只写数字。
4. 主角团只包含同阵营、长期合作、共同推进主线、稳定同行、核心搭档/队友/同盟。
5. 配角保留简洁状态，死亡角色写 death_info。
6. 外貌、性格、台词示例没有出现就留空，不要编造。
7. 矛盾冲突必须基于主线大事件，resolved 不展示。

已有知识库：
{{existing_knowledge_base}}

阶段1：
{{stage_1_result}}

阶段2：
{{stage_2_result}}

阶段3：
{{stage_3_result}}

阶段4：
{{stage_4_result}}

输出最终 GenerateOutlineResult JSON。
