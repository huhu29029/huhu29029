你必须返回合法 JSON。不要返回 Markdown。不要返回代码块。不要返回解释文字。

任务：Stage4 世界观与矛盾提取。只基于正文、Stage1 事件和已有大纲。

Stage1 结果：{{stage_1_result}}
已有大纲：{{existing_outline}}
章节正文：{{selected_chapters}}

世界观规则：
1. 输出必须分类到 worldbuilding，不要全部写入 background。
2. background 只写时代、地域、基本世界环境，简短。
3. social_structure 写组织体系、阶层结构、职业身份体系、协会/教会/政府/学院/贵族/邪教等组织关系、社会运行规则。
4. power_system 写魔法体系、魔女等级、巫师/魔女能力、神明/眷属/收容物/血族、秘境、仪式、污染、梦境等超凡机制。
5. protagonist_position 写主角身份、职业/等级/认证、经济状态、社会地位、所属组织或阵营。
6. new_settings 只写新增或变化设定。
7. 每栏 3-8 条以内，每条一句话。没有出现就返回空。

矛盾规则：
1. 矛盾尽量基于主线大事件总结，不要硬凑碎片。
2. resolved 矛盾后续最终展示会移除；当前仍存在或潜在的写 active/potential。

输出 JSON：
{
  "worldbuilding": {
    "background": "",
    "social_structure": [],
    "power_system": [],
    "protagonist_position": "",
    "new_settings": []
  },
  "world_facts": [
    { "title": "", "category": "background | social_structure | power_system | protagonist_position | organization | rule | hierarchy | magic | artifact | race | supernatural | economy | other", "content": "" }
  ],
  "conflicts": [
    { "type": "protagonist | interpersonal | social | class | system | potential", "content": "", "related_main_event": "", "status": "active | resolved | potential" }
  ],
  "foreshadowing": [],
  "twists": []
}
