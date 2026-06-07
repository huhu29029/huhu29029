# Novel Memory Engine

Novel Memory Engine 是一个本地优先的长篇小说结构与正文管理软件。当前阶段聚焦最小可用写作闭环：书架、书籍创建、卷/章节管理、正文编辑、自动保存、本地导入导出，以及人工维护的小说大纲页面。

当前不接入 AI，不实现云同步、登录、支付或多人协作。

## 技术栈

- React + TypeScript
- Vite
- Tauri 2
- SQLite
- Rust + rusqlite

## 环境要求

- Node.js 18 或更高版本
- npm
- Rust stable toolchain
- Tauri 对应平台依赖

Windows 通常还需要 Microsoft C++ Build Tools。

## 安装

```bash
npm install
```

## 开发运行

```bash
npm run tauri:dev
```

也可以单独运行前端开发服务器：

```bash
npm run dev
```

## 构建

```bash
npm run build
npm run tauri build
```

## 当前功能

- 书架首页与书籍卡片
- 创建、修改、删除书籍
- 设置书籍分类、简介和本地封面
- 从书架进入指定书籍编辑器
- 新建卷、新建章节
- 双击重命名卷和章节
- 正文编辑中 800ms 自动保存
- 当前章节字数统计
- 章节树选择模式
- 批量选择章节或卷
- 批量删除章节或卷
- 导入 `.txt` 和 `.docx`
- 导出 `.txt` 和 `.docx`
- 小说大纲页面：文字大纲分页、思维导图节点、本地保存
- AI 基础设施：DeepSeek 设置、连接测试、Prompt 文件、单章节摘要预览与保存、AI usage/task 日志

## AI 设置与章节摘要

进入书籍编辑器后，左侧“功能”区域点击“AI 设置”。

- Provider 当前支持 DeepSeek，其他供应商为后续预留。
- Base URL 默认 `https://api.deepseek.com`。
- Model 默认 `deepseek-chat`。
- API Key 只保存在本地 SQLite，不上传服务器。
- “测试连接”会发送一条简短消息验证 DeepSeek 是否可用。

章节摘要入口在正文编辑顶部的“生成章节摘要”。流程为：读取 `prompts/summarize_chapter.md`，填入当前章节正文，调用 DeepSeek，使用 zod 校验 JSON，弹出预览，确认后写入 `chapter_summaries`。如果未配置 API Key，会走本地 Mock 流程，便于测试 UI 和数据库写入。

## 小说大纲

进入书籍编辑器后，左侧“功能”区域可在“正文编辑”和“小说大纲”之间切换。

文字大纲分页包括：

- 世界观
- 主要人物
- 主要角色
- 主线剧情
- 支线剧情

思维导图节点类型包括：

- 世界观
- 主要人物
- 主要角色
- 主线剧情
- 支线剧情
- 伏笔
- 反转

“解析正文”和“由文字生成导图”当前只提供交互入口，后续接入 AI 后再执行真实解析。

## 导入说明

点击左侧工具栏的“导入”，可选择 `.txt` 或 `.docx`。

基础识别规则：

- 卷名：`第一卷`、`第二卷`、`第1卷`
- 章节：`第一章`、`第二章`、`第1章`、`第一回`、`Chapter 1`
- 标题需要独立成行或独立段落
- 标题后的内容会归入该章节，直到下一个章节标题
- 未识别到章节时，会以文件名创建单章

docx 当前只保留结构化文本：卷名、章节名、正文段落。不保留字体、字号、缩进等复杂排版。

## 导出说明

点击左侧工具栏的“导出”。

导出范围：

- 有选中章节或卷时，优先导出选中内容
- 未选中内容时，导出当前章节
- 勾选整卷时导出该卷下全部章节
- 勾选多个卷可导出多卷内容

保存文件时可选择 `.txt` 或 `.docx`。docx 导出中，卷名写为一级标题，章节名写为二级标题，正文按段落写入。

## 数据库

应用启动时会在 Tauri app data 目录创建本地 SQLite 数据库：

```text
novel_memory_engine.sqlite3
```

核心表包括：

- projects
- volumes
- chapters
- chapter_summaries
- global_outlines
- characters
- plot_threads
- foreshadowing
- consistency_issues
- outline_text_sections
- outline_mind_nodes
- outline_mind_edges
- ai_settings
- ai_usage_logs
- ai_tasks

## 当前阶段边界

本阶段不做：

- AI 自动分章
- AI 摘要
- AI 续写
- epub/PDF 导入
- 云同步
- 登录
- 支付
- 多人协作
- 拖拽排序
- 复杂富文本
