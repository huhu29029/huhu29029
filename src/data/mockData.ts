import type { Chapter, Character, PlotThread, Project } from "../types/domain";

export const demoProject: Project = {
  id: "project-demo",
  title: "示例长篇项目",
  description: "用于展示软件骨架的本地项目",
  createdAt: "2026-05-26T00:00:00.000Z",
  updatedAt: "2026-05-26T00:00:00.000Z"
};

export const demoChapters: Chapter[] = [
  {
    id: "chapter-001",
    projectId: demoProject.id,
    title: "第一章 未命名的开端",
    chapterIndex: 1,
    content:
      "这里是章节正文区域。第一阶段不会接入 AI，也不会替作者续写正文；后续可以在这里承载导入后的章节文本、人工编辑内容和摘要跳转。",
    wordCount: 56
  },
  {
    id: "chapter-002",
    projectId: demoProject.id,
    title: "第二章 线索出现",
    chapterIndex: 2,
    content:
      "章节导航已经预留，后续可以接入自动分章、章节状态、摘要状态和一致性检查标记。",
    wordCount: 38
  }
];

export const demoCharacters: Character[] = [
  {
    id: "character-001",
    projectId: demoProject.id,
    name: "林昭",
    role: "主角",
    currentState: "active",
    lastSeenChapterId: "chapter-002",
    notes: "等待后续角色状态追踪模块维护。"
  },
  {
    id: "character-002",
    projectId: demoProject.id,
    name: "沈砚",
    role: "关键配角",
    currentState: "unknown",
    lastSeenChapterId: "chapter-001"
  }
];

export const demoPlotThreads: PlotThread[] = [
  {
    id: "thread-001",
    projectId: demoProject.id,
    title: "失踪信件的来源",
    status: "open",
    notes: "后续可关联伏笔、章节摘要和一致性问题。"
  }
];
