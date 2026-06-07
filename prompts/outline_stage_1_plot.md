你必须返回合法 JSON。
不要返回 Markdown。
不要返回代码块。
不要返回解释文字。

阶段：Stage1 剧情粗解析。

任务：
1. 提取本批主要事件。
2. 提取本批主线推进。
3. 提取可能支线。
4. 提取出现的重要角色。
5. 标记可能改变阵营关系的角色。
6. 标记关键事件。

反幻觉规则：
1. 只能基于输入章节正文和已有大纲。
2. 不允许补充原文没有出现的信息。
3. 不确定的信息返回空字符串或空数组。
4. 不要替作者续写剧情。
5. main_events 中每一项必须是对象，不能是字符串。
6. 如果只知道事件标题，也要返回完整对象，并把缺失字段填为空字符串或空数组。
7. 作者后记、创作说明、存稿说明、读者交流内容不是小说剧情，不要放入 main_events。

章节范围规则：
chapter_range 必须写成“第X章-第Y章”。
单章也要写成“第X章-第X章”。
不要只写数字，例如不要写“1-10”或“85”。

输出 JSON 格式：
{
  "main_events": [
    {
      "title": "",
      "chapters": [],
      "chapter_range": "",
      "summary": "",
      "protagonist_action": "",
      "plot_progress": "",
      "result": "",
      "related_characters": [],
      "conflict_summary": ""
    }
  ],
  "main_plot_progress": "",
  "branch_candidates": [
    {
      "title": "",
      "chapters": [],
      "status": "new",
      "summary": "",
      "related_characters": [],
      "need_follow_up": true
    }
  ],
  "important_characters": [],
  "faction_change_candidates": [],
  "key_event_markers": []
}

已有大纲：
{{existing_outline}}

当前批次章节：
{{selected_chapters}}
