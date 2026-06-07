你必须返回合法 JSON。不要返回 Markdown。不要返回代码块。不要返回解释文字。

任务：把 chunk summaries 合并成分卷/阶段知识库。不要输出解析日志。

解析模式：{{analysis_mode}}
已有大纲：{{existing_outline}}
chunk summaries：{{chunk_summaries}}

要求：
1. 合并重复事件、角色、世界观设定和支线。
2. 世界观必须分类为 background/social_structure/power_system/protagonist_position/new_settings。
3. 主角团必须包含真正主角，且只保留同阵营/长期合作/稳定同行/同盟关系成员。
4. 反派和阶段性角色放入 supporting_characters。
5. 支线要保留有持续性、悬念、人物关系推进或后续回收价值的事件线。
6. 内容简洁，不要长篇说明。

输出 JSON：
{
  "volume_or_stage_title": "",
  "chapter_range": "",
  "main_events": [],
  "protagonist_group": [],
  "supporting_characters": [],
  "world_facts": [],
  "branch_plots": [],
  "conflicts": [],
  "foreshadowing": [],
  "twists": []
}
