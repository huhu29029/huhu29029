export type Project = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type Chapter = {
  id: string;
  projectId: string;
  title: string;
  chapterIndex: number;
  content: string;
  wordCount: number;
};

export type CharacterState = "active" | "missing" | "dead" | "unknown";

export type Character = {
  id: string;
  projectId: string;
  name: string;
  role?: string;
  currentState: CharacterState;
  lastSeenChapterId?: string;
  notes?: string;
};

export type PlotThread = {
  id: string;
  projectId: string;
  title: string;
  status: "open" | "resolved" | "dropped";
  notes?: string;
};
