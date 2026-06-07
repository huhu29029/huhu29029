import type { Chapter, ImportChapterDraft, Project, Volume } from "../types/domain";
import { countWords } from "./text";

export type ParsedImportVolume = {
  title?: string;
  chapters: ImportChapterDraft[];
};

export type ExportVolumeDraft = {
  title: string;
  chapters: Array<{
    title: string;
    content: string;
  }>;
};

const volumeHeadingPattern = /^第\s*[零〇一二三四五六七八九十百千万两\d]+\s*卷\s*.*$/;
const chapterHeadingPattern =
  /^((第\s*[零〇一二三四五六七八九十百千万两\d]+\s*[章节回])|(Chapter\s+\d+))[\s:：、.-]*.*$/i;

export function splitTextIntoChapters(text: string, fallbackTitle: string): ImportChapterDraft[] {
  return splitParagraphsIntoVolumes(text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n"), fallbackTitle)
    .flatMap((volume) => volume.chapters);
}

export function splitParagraphsIntoVolumes(paragraphs: string[], fallbackTitle: string): ParsedImportVolume[] {
  const normalizedParagraphs = paragraphs.map((paragraph) => paragraph.replace(/\uFEFF/g, "").trim());
  const volumes: ParsedImportVolume[] = [];
  let currentVolume: ParsedImportVolume = { chapters: [] };
  let currentChapter: ImportChapterDraft | undefined;
  let currentContent: string[] = [];

  const finishChapter = () => {
    if (!currentChapter) {
      return;
    }

    const content = currentContent.join("\n").trim();
    currentVolume.chapters.push({
      ...currentChapter,
      content,
      wordCount: countWords(content)
    });
    currentChapter = undefined;
    currentContent = [];
  };

  const finishVolume = () => {
    finishChapter();
    if (currentVolume.title || currentVolume.chapters.length > 0) {
      volumes.push(currentVolume);
    }
    currentVolume = { chapters: [] };
  };

  for (const paragraph of normalizedParagraphs) {
    if (!paragraph) {
      if (currentChapter) {
        currentContent.push("");
      }
      continue;
    }

    if (isVolumeHeading(paragraph)) {
      finishVolume();
      currentVolume = { title: paragraph, chapters: [] };
      continue;
    }

    if (isChapterHeading(paragraph)) {
      finishChapter();
      currentChapter = {
        title: paragraph,
        content: "",
        wordCount: 0
      };
      continue;
    }

    if (currentChapter) {
      currentContent.push(paragraph);
    }
  }

  finishVolume();

  if (volumes.every((volume) => volume.chapters.length === 0)) {
    const content = normalizedParagraphs.join("\n").trim();
    return [
      {
        chapters: [
          {
            title: fallbackTitle || "未命名章节",
            content,
            wordCount: countWords(content)
          }
        ]
      }
    ];
  }

  return volumes.filter((volume) => volume.chapters.length > 0);
}

export function buildExportText(
  project: Project,
  volumes: Volume[],
  chapters: Chapter[],
  selectedVolumeIds: string[],
  selectedChapterIds: string[],
  currentChapterId?: string
) {
  const exportVolumes = buildExportVolumes(volumes, chapters, selectedVolumeIds, selectedChapterIds, currentChapterId);
  const parts: string[] = [];

  for (const volume of exportVolumes) {
    if (volume.title) {
      parts.push(`【${volume.title}】`);
      parts.push("");
    }
    parts.push(...volume.chapters.flatMap(formatChapterForExport));
  }

  return {
    content: parts.join("\n").trimEnd() + "\n",
    defaultFileName: getDefaultExportFileName(project, volumes, chapters, selectedVolumeIds, selectedChapterIds, currentChapterId, "txt")
  };
}

export function buildExportDocxVolumes(
  volumes: Volume[],
  chapters: Chapter[],
  selectedVolumeIds: string[],
  selectedChapterIds: string[],
  currentChapterId?: string
) {
  return buildExportVolumes(volumes, chapters, selectedVolumeIds, selectedChapterIds, currentChapterId);
}

export function getDefaultExportFileName(
  project: Project,
  volumes: Volume[],
  chapters: Chapter[],
  selectedVolumeIds: string[],
  selectedChapterIds: string[],
  currentChapterId: string | undefined,
  extension: "txt" | "docx"
) {
  if (selectedVolumeIds.length === 1 && selectedChapterIds.length === 0) {
    return `${sanitizeFileName(volumes.find((volume) => volume.id === selectedVolumeIds[0])?.title ?? "整卷导出")}.${extension}`;
  }

  if (selectedChapterIds.length === 1 && selectedVolumeIds.length === 0) {
    return `${sanitizeFileName(chapters.find((chapter) => chapter.id === selectedChapterIds[0])?.title ?? "章节导出")}.${extension}`;
  }

  if (selectedChapterIds.length > 1 || selectedVolumeIds.length > 1 || (selectedChapterIds.length > 0 && selectedVolumeIds.length > 0)) {
    return `选中章节导出.${extension}`;
  }

  if (currentChapterId) {
    return `${sanitizeFileName(chapters.find((chapter) => chapter.id === currentChapterId)?.title ?? "章节导出")}.${extension}`;
  }

  return `${sanitizeFileName(project.title)}.${extension}`;
}

export function getFileBaseName(path: string) {
  const fileName = path.split(/[\\/]/).pop() ?? "导入章节";
  return fileName.replace(/\.[^.]+$/, "");
}

export function getFileExtension(path: string) {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

export function sanitizeFileName(fileName: string) {
  const cleaned = fileName.replace(/[\\/:*?"<>|]/g, "_").trim();
  return cleaned || "小说导出";
}

function buildExportVolumes(
  volumes: Volume[],
  chapters: Chapter[],
  selectedVolumeIds: string[],
  selectedChapterIds: string[],
  currentChapterId?: string
): ExportVolumeDraft[] {
  const chapterIds = new Set(selectedChapterIds);
  const volumeIds = new Set(selectedVolumeIds);
  const hasSelection = chapterIds.size > 0 || volumeIds.size > 0;

  if (!hasSelection && currentChapterId) {
    chapterIds.add(currentChapterId);
  }

  const exportAll = !hasSelection && !currentChapterId;
  const selectedChapters = exportAll
    ? chapters
    : chapters.filter((chapter) => chapterIds.has(chapter.id) || volumeIds.has(chapter.volumeId));

  return volumes
    .map((volume) => ({
      title: volume.title,
      chapters: selectedChapters
        .filter((chapter) => chapter.volumeId === volume.id)
        .map((chapter) => ({ title: chapter.title, content: chapter.content }))
    }))
    .filter((volume) => volume.chapters.length > 0);
}

function isVolumeHeading(paragraph: string) {
  return volumeHeadingPattern.test(paragraph.trim());
}

function isChapterHeading(paragraph: string) {
  return chapterHeadingPattern.test(paragraph.trim());
}

function formatChapterForExport(chapter: { title: string; content: string }) {
  return [chapter.title, "", chapter.content.trim(), ""];
}
