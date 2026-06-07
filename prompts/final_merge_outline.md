你必须返回合法 JSON。不要返回 Markdown。不要返回代码块。不要返回解释文字。

任务：把阶段 summaries 合并成最终小说知识库。最终大纲要像“小说百科”，不是解析日志。

解析模式：{{analysis_mode}}
当前已有最终大纲：{{existing_outline}}
阶段 summaries：{{stage_summaries}}

硬性规则：
1. 不要输出“第X批解析更新”“新增更新”等日志语言。
2. 世界观必须分类，不要把所有设定塞进世界背景。
3. 世界观每栏只保留关键内容，3-8 条以内，每条一句话。
4. social_structure 必须吸收组织体系、阶层、职业身份、协会/教会/政府/学院/贵族/邪教、社会规则。
5. power_system 必须吸收魔法、魔女等级、巫师/魔女能力、神明/眷属/收容物/血族、秘境、仪式、污染、梦境等机制。
6. protagonist_position 必须吸收主角身份、职业/等级/认证、经济状态、社会地位、所属组织或阵营。
7. 主角团必须包含真正主角。
8. 主角团只收同阵营、长期合作、稳定同行、队友/搭档/同盟、共同推进主线的角色。
9. 反派、敌人、委托人、监管者、阶段性角色、关系不稳定角色放入 supporting_characters。
10. 支线剧情要保留委托、调查、角色个人线、关系线、阵营线、经济线、考试/晋级线、案件线、电影/展览/工坊/家族事件、未回收伏笔等持续性事件线。
11. 不要重复同一设定、同一角色、同一事件、同一支线。
12. 没有出现的信息留空，不要编造。
13. 主线剧情和支线剧情必须覆盖输入 summaries 中最新章节范围，不要只总结前半段。
14. branch_events.title 不能为空，也不要返回“未命名支线”。如果没有正式名称，用“章节范围 + 事件关键词”生成简短标题。

输出 JSON：
{
  "worldbuilding": {
    "background": "",
    "social_structure": [],
    "power_system": [],
    "protagonist_position": "",
    "new_settings": []
  },
  "protagonist_group": [
    { "name": "", "identity": "", "social_class": "", "relationship_to_protagonist": "", "faction_relation": "", "gender": "", "hair_color": "", "eye_color": "", "body_type": "", "clothing_style": "", "appearance": "", "personality": [], "action_logic": [], "current_goal": "", "current_state": "", "speech_style": "", "quote_example": "" }
  ],
  "supporting_characters": [
    { "name": "", "identity": "", "relationship_to_protagonist": "", "faction": "", "current_role": "", "current_state": "", "is_dead": false, "death_info": "" }
  ],
  "main_events": [
    { "title": "", "chapter_range": "", "summary": "", "result": "", "related_characters": [], "conflict_summary": "" }
  ],
  "branch_events": [
    { "title": "", "chapter_range": "", "status": "new | progressing | paused | resolved", "summary": "", "related_characters": [] }
  ],
  "conflicts": [
    { "type": "protagonist | interpersonal | social | class | system | potential", "content": "", "related_main_event": "", "status": "active | resolved | potential" }
  ],
  "mindmap_suggestions": { "nodes": [], "edges": [] }
}
