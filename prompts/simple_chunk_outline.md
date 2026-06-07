你必须返回合法 JSON。不要返回 Markdown。不要返回代码块。不要返回解释文字。

任务：简单解析当前章节 chunk，提取用于小说百科的大纲信息。只基于输入正文和已有大纲，不允许编造，不允许续写。

章节范围：{{chapter_range}}

已有大纲：
{{existing_outline}}

章节正文：
{{selected_chapters}}

重点规则：
1. 世界观必须分类，不要全部塞进世界背景。
2. 社会结构提取组织体系、阶层结构、职业身份体系、协会/教会/政府/学院/贵族/邪教等组织关系、社会运行规则。
3. 力量体系提取魔法、魔女等级、巫师/魔女能力、神明/眷属/收容物/血族、秘境、仪式、污染、梦境等超凡机制。
4. 主角身份与阶层提取主角身份、职业、等级、认证、经济状态、社会地位、所属组织或阵营。
5. 主角团必须包含真正主角。主角团成员必须与主角同阵营、长期合作、稳定同行、队友/搭档/同盟，或共同推进主线。不要因为戏份多就加入主角团。
6. 反派、敌人、委托人、监管者、阶段性角色、关系不稳定角色放入 supporting_characters。
7. 支线剧情包括委托、调查、角色个人线、关系线、阵营线、经济线、考试/晋级线、案件线、电影/展览/工坊/家族事件、未回收伏笔。
8. 每条信息尽量一句话。没有出现的信息返回空字符串或空数组。
9. branch_plots.title 不能为空，也不要返回“未命名支线”。没有正式名称时，用“章节范围 + 事件关键词”生成标题。

输出 JSON：
{
  "chapter_range": "",
  "summary": "",
  "main_events": [
    { "title": "", "chapter_range": "", "summary": "", "result": "", "related_characters": [] }
  ],
  "protagonist_group_candidates": [
    { "name": "", "identity": "", "relationship_to_protagonist": "", "current_status": "", "reason_for_group_candidate": "", "camp_relation": "" }
  ],
  "supporting_characters": [
    { "name": "", "identity": "", "relationship_to_protagonist": "", "current_status": "", "is_dead": false, "death_info": "" }
  ],
  "world_facts": [
    { "title": "", "category": "background | social_structure | power_system | protagonist_position | organization | rule | hierarchy | magic | artifact | race | supernatural | economy | other", "content": "" }
  ],
  "branch_plots": [
    { "title": "", "chapter_range": "", "status": "new | progressing | paused | resolved", "summary": "", "related_characters": [], "need_follow_up": true }
  ],
  "conflicts": [
    { "type": "protagonist | interpersonal | social | class | system | potential", "content": "", "related_main_event": "", "status": "active | resolved | potential" }
  ]
}
