你必须返回合法 JSON。不要返回 Markdown。不要返回代码块。不要返回解释文字。

任务：Stage2 角色关系与主角团判定。

Stage1 结果：{{stage_1_result}}
章节正文：{{selected_chapters}}

主角团判定规则：
1. 必须识别真正主角，并把主角写入 protagonist_name。
2. 主角团必须包含真正主角。
3. 主角团成员必须满足：与主角同阵营、长期合作、稳定同行、队友/搭档/同盟关系，或共同推进主线。
4. 不能仅因戏份多加入主角团。
5. 反派、敌人、委托人、监管者、旁观者、阶段性角色、关系不稳定角色必须放入 supporting_characters。
6. 每个主角团成员必须说明 faction_relation 和 relationship_to_protagonist。

输出 JSON：
{
  "protagonist_name": "",
  "protagonist_group": [
    { "name": "", "identity": "", "relationship_to_protagonist": "", "faction_relation": "", "is_long_term_partner": true, "is_temporary_partner": false, "is_hostile": false, "reason": "" }
  ],
  "supporting_characters": [
    { "name": "", "identity": "", "relationship_to_protagonist": "", "faction": "", "current_status": "", "is_dead": false, "death_info": "", "is_hostile": false, "reason": "" }
  ]
}
