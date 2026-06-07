你必须返回合法 JSON。不要返回 Markdown。不要返回代码块。不要返回解释文字。

任务：详细解析 Stage1 剧情粗解析。只基于输入正文和已有大纲，不允许编造。

章节范围：{{chapter_range}}
已有大纲：{{existing_outline}}
章节正文：{{selected_chapters}}

要求：
1. 提取主线大事件，不要把每个小场景都拆成主线。
2. chapter_range 必须写成“第X章-第Y章”。
3. related_characters 必须尽量填写。
4. conflict_summary 必须基于事件冲突填写；没有明确冲突返回空字符串。
5. branch_candidates 要识别持续性支线：委托、调查、角色个人线、关系线、阵营线、经济线、考试/晋级线、案件线、电影/展览/工坊/家族事件、未回收伏笔。
6. branch_candidates 中每个支线必须有 title，不要返回“未命名支线”。没有正式名称时，用“章节范围 + 事件关键词”生成标题。

输出 JSON：
{
  "chapter_range": "",
  "main_events": [
    { "title": "", "chapters": [], "chapter_range": "", "summary": "", "protagonist_action": "", "plot_progress": "", "result": "", "related_characters": [], "conflict_summary": "", "importance": "high | medium | low" }
  ],
  "branch_candidates": [],
  "key_events": [],
  "open_questions": []
}
