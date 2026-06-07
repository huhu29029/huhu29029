你必须返回合法 JSON。不要返回 Markdown。不要返回代码块。不要返回解释文字。

阶段 3：角色细化。只分析候选角色。外貌没有出现就留空，不允许编造发色、瞳色、身材。

候选角色：{{character_candidates}}
章节正文：{{selected_chapters}}

输出 JSON：
{
  "characters": [
    {
      "name": "",
      "gender": "",
      "hair_color": "",
      "eye_color": "",
      "body_type": "",
      "clothing_habit": "",
      "appearance_features": "",
      "personality": [],
      "action_logic": [],
      "current_goal": "",
      "current_status": "",
      "speech_style": "",
      "sample_line": ""
    }
  ]
}
