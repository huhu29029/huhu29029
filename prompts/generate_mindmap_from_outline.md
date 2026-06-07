你必须返回合法 JSON。不要返回 Markdown。不要返回代码块。不要返回解释文字。

任务：根据当前小说文字大纲生成思维导图节点与关联线。

生成原则：
1. 不要生成重复节点。同一事件、同一角色、同一世界观设定只生成一个节点。
2. 不要凭空生成大纲中没有的信息。
3. 信息不足时少生成节点，不要为了填满数量而编造。
4. 主线事件按剧情顺序连接。
5. 支线事件连接到相关主线事件。
6. 矛盾节点连接到相关主线事件或角色。
7. 伏笔节点连接到首次出现或对应回收事件。
8. 反转节点连接到被反转的事件或角色。
9. node_type 必须使用英文枚举，不要返回中文类型。

生成方式：
{{generation_mode}}

数据来源：
{{source_names}}

当前文字大纲：
{{outline_text}}

当前已有思维导图：
{{existing_mindmap}}

输出 JSON：
{
  "nodes": [
    {
      "node_type": "world",
      "title": "",
      "description": "",
      "importance": "medium",
      "related_chapter_range": "",
      "group": ""
    }
  ],
  "edges": [
    {
      "source_title": "",
      "target_title": "",
      "edge_type": "related",
      "label": ""
    }
  ],
  "layout_hints": {
    "main_axis": [],
    "upper_lane": [],
    "lower_lane": [],
    "side_lane": []
  }
}

node_type 只能使用：
world, protagonist_group, protagonist, supporting_character, main_plot, branch_plot, foreshadowing, twist, conflict

edge_type 只能使用：
related, causes, reveals, conflicts, supports, belongs_to, leads_to

大致思维导图限制：
主线最多 8 个，支线最多 6 个，矛盾最多 5 个，世界观最多 4 个，主角团最多 1 个，总节点尽量 20 个以内。

详细思维导图限制：
主线最多 12 个，支线最多 16 个，矛盾最多 10 个，世界观最多 8 个，主角团成员最多 12 个，配角最多 20 个，伏笔最多 12 个，反转最多 8 个，总节点尽量 60 个以内。
