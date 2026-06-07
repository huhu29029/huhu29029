import type { Chapter, Character, PlotThread, Project, Volume } from "../types/domain";

export const demoProject: Project = {
  id: "project-demo",
  title: "示例长篇项目",
  category: "玄幻小说",
  description: "用于展示软件骨架的本地项目",
  coverPath: undefined,
  createdAt: "2026-05-26T00:00:00.000Z",
  updatedAt: "2026-05-26T00:00:00.000Z",
  lastEditedAt: "2026-05-26T00:00:00.000Z"
};

export const demoVolumes: Volume[] = [
  {
    id: "volume-001",
    projectId: demoProject.id,
    title: "第一卷",
    sortOrder: 0,
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z"
  }
];

export const demoChapters: Chapter[] = [
  {
    id: "chapter-001",
    projectId: demoProject.id,
    volumeId: demoVolumes[0].id,
    title: "第一章",
    content: "这里是章节正文区。",
    sortOrder: 0,
    wordCount: 9,
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z"
  }
];

export const demoCharacters: Character[] = [
  {
    id: "character-001",
    projectId: demoProject.id,
    name: "林昀",
    role: "主角",
    currentState: "active",
    lastSeenChapterId: "chapter-001",
    notes: "等待后续角色状态模块维护。"
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
