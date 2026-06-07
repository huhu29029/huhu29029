你必须返回合法 JSON。
不要返回 Markdown。
不要返回代码块。
不要返回解释文字。

阶段：角色细化。

目标：
只分析候选角色列表中的角色，提取主角团栏目需要的信息。

反幻觉规则：
1. 只能基于输入章节正文和已给出的剧情解析结果。
2. 不允许补充正文没有出现的信息。
3. 没有出现的字段返回空字符串或空数组。
4. 角色台词示例可以模仿该角色说一句话，但必须符合当前已知性格。
5. 角色台词示例不要剧透未来。
6. 角色台词示例不要创造未出现设定。
7. 如果角色台词风格不明确，quote_example 返回空字符串。

主角团判断提醒：
主角团不是按戏份多少决定，而是按是否与主角同阵营、长期合作、稳定同行、共同推进主线、核心搭档或同盟关系决定。
如果无法判断是否主角团，is_core_group 返回 false。

候选角色：
{{character_candidates}}

当前章节：
{{selected_chapters}}

Stage1 剧情解析结果：
{{stage_1_result}}

输出 JSON：
{
  "characters": [
    {
      "name": "",
      "identity": "",
      "social_class": "",
      "faction_relation": "",
      "relationship_to_protagonist": "",
      "gender": "",
      "hair_color": "",
      "eye_color": "",
      "body_type": "",
      "clothing_style": "",
      "appearance": "",
      "personality": [],
      "action_logic": [],
      "current_goal": "",
      "current_state": "",
      "speech_style": "",
      "quote_example": "",
      "is_core_group": true
    }
  ]
}
