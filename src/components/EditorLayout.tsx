import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MockProvider } from "../ai/MockProvider";
import { createLLMProvider } from "../ai/providerFactory";
import {
  parseChapterSummaryJson,
  parseFullTextDetectionJson,
  parsePolishAnalysisJson,
  parsePolishReviewJson,
  parseWritingStyleProfileJson,
  type ChapterSummaryPayload,
  parseLiteraryImageSuggestionJson,
  type LiteraryImageSuggestionPayload,
  type FullTextDetectionResultPayload,
  type PolishAnalysisPayload,
  type PolishReviewResultPayload,
  type WritingStyleProfilePayload
} from "../ai/schemas";
import type { LLMProvider } from "../ai/types";
import {
  createAITask,
  createChapter,
  createImportVolume,
  createVolume,
  createVolumeWithTitle,
  deleteSelectedItems,
  finishAITask,
  getAISettings,
  getCorpusStyleProfileState,
  getEditorState,
  getOutlineState,
  importChapters,
  listAIPatternMemory,
  listCorpusStyleProfiles,
  listWritingStyleProfiles,
  logAIUsage,
  recommendStyleCorpus,
  readDocxFile,
  readPromptFile,
  readTextFile,
  renameChapter,
  renameVolume,
  saveChapterContent,
  saveChapterSummary,
  saveChapterVersion,
  saveWritingStyleProfile,
  searchStyleCorpus,
  writeDocxFile,
  writeTextFile,
  upsertAIPatternsFromReview
} from "../tauriApi";
import type { AIProviderStrategy, AISettings, AIPatternMemory, Chapter, CorpusStyleDimensionType, CorpusStyleProfile, CorpusStyleProfileState, EditorState, ImportChapterDraft, ReviewPatternInput, SaveStatus, StyleCorpusSearchResult, Volume, WritingStyleProfile } from "../types/domain";
import { getPolishPreset, polishPresets, type PolishPresetValue } from "../data/polishPresets";
import { aiPatternTypeLabel } from "../data/aiPatternTypeLabels";
import {
  buildExportDocxVolumes,
  buildExportText,
  getDefaultExportFileName,
  getFileBaseName,
  getFileExtension,
  sanitizeFileName,
  splitParagraphsIntoVolumes,
  splitTextIntoChapters
} from "../utils/novelText";
import { countWords, formatChapterContent } from "../utils/text";
import { AISettingsPage } from "./AISettingsPage";
import { ChapterEditor } from "./ChapterEditor";
import { ChapterSummaryPreviewModal } from "./ChapterSummaryPreviewModal";
import { CorpusStylePage } from "./CorpusStylePage";
import { EditorToolbar } from "./EditorToolbar";
import { MemoryLibraryPage } from "./MemoryLibraryPage";
import { OutlinePage } from "./OutlinePage";
import { SidebarVolumeTree } from "./SidebarVolumeTree";

type RenameTarget = {
  id: string;
  title: string;
  type: "volume" | "chapter";
};

type Workspace = "editor" | "outline" | "memory" | "corpusStyle" | "aiSettings";
type RuntimeProviderName = "deepseek" | "openai";
type StyleLearnScope = "current" | "recent3" | "manual" | "sample";
type PolishScope = "chapter" | "selection" | "paragraph";
type PolishStrategy = "deepseek" | "openai" | "openai_deepseek" | "deepseek_openai";
type PolishGoal = PolishPresetValue;
type StylePolishIntensity = "light" | "medium" | "high";
type StylePolishTendency = "cold" | "ornate" | "poetic" | "dark_humor" | "absurd" | "historical" | "gentle" | "oppressive" | "satirical" | "religious" | "gothic" | "custom";

const corpusStyleDefaultDimensions: CorpusStyleDimensionType[] = [
  "appearance",
  "action",
  "environment",
  "dialogue",
  "psychology",
  "paragraph",
  "rhetoric",
  "pacing",
  "setting_delivery",
  "vocabulary",
  "polish_rules"
];

type StyleLearnDialogState = {
  isOpen: boolean;
  scope: StyleLearnScope;
  profileName: string;
  strategy: AIProviderStrategy;
  selectedChapterIds: Set<string>;
};

type PolishDialogState = {
  isOpen: boolean;
  scope: PolishScope;
  targetWordCount: string;
  goal: PolishGoal;
  customInstruction: string;
  strategy: PolishStrategy;
  profileId: string;
  useCorpusStyleProfile: boolean;
  corpusStyleProfileId: string;
  corpusStyleDimensionTypes: CorpusStyleDimensionType[];
  includeChapter: boolean;
  includeRecent: boolean;
  includeCharacters: boolean;
  includeOutline: boolean;
  includeStyle: boolean;
};

type PolishPreviewState = {
  originalText: string;
  polishedText: string;
  analysis?: PolishAnalysisPayload;
  selectedAnalysisIssueIds: Set<string>;
  localAiPatternHits: LocalAiPatternHit[];
  diffSummary?: DiffSummary;
  firstDraft?: string;
  review?: PolishReviewResultPayload;
  reasoningItems?: Array<{ content: string; title: string }>;
  selectedSuggestionIds: Set<string>;
  manualRevisionInstruction: string;
  viewMode?: "side_by_side" | "diff" | "polished";
  highlightQuote?: string;
  scope: PolishScope;
  range: { end: number; start: number };
};

type DiffSummary = {
  added: number;
  removed: number;
  unchanged: number;
  changeRatio: number;
};

type LocalAiPatternHit = {
  quote: string;
  pattern_type: "repeated_emphasis_template" | "blunt_explanation_template" | "negation_pattern" | "light_action_template" | "object_description_template" | "ending_overextension" | "ai_wording_template" | "body_language" | "dialogue_interaction";
  reason: string;
  rewrite_advice: string;
};

type StylePolishDialogState = {
  isOpen: boolean;
  scope: PolishScope;
  targetWordCount: string;
  intensity: StylePolishIntensity;
  tendency: StylePolishTendency;
  customKeywords: string;
  customPrompt: string;
  useCorpus: boolean;
  useStyleProfile: boolean;
  strategy: PolishStrategy;
  profileId: string;
  corpusQuery: string;
  corpus: StyleCorpusSearchResult;
  selectedQuoteIds: Set<string>;
  selectedWorkIds: Set<string>;
  suggestions?: LiteraryImageSuggestionPayload;
};

type EditorLayoutProps = {
  projectId: string;
  onBackToShelf: () => void;
};

export function EditorLayout({ projectId, onBackToShelf }: EditorLayoutProps) {
  const [editorState, setEditorState] = useState<EditorState>();
  const [selectedVolumeId, setSelectedVolumeId] = useState<string>();
  const [selectedChapterId, setSelectedChapterId] = useState<string>();
  const [draftContent, setDraftContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [renameTarget, setRenameTarget] = useState<RenameTarget>();
  const [editingTitle, setEditingTitle] = useState("");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedVolumeIds, setSelectedVolumeIds] = useState<Set<string>>(() => new Set());
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(() => new Set());
  const [expandedVolumeIds, setExpandedVolumeIds] = useState<Set<string>>(() => new Set());
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>("editor");
  const [loadError, setLoadError] = useState<string>();
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryPreview, setSummaryPreview] = useState<ChapterSummaryPayload>();
  const [styleProfiles, setStyleProfiles] = useState<WritingStyleProfile[]>([]);
  const [corpusStyleProfiles, setCorpusStyleProfiles] = useState<CorpusStyleProfile[]>([]);
  const [styleDialog, setStyleDialog] = useState<StyleLearnDialogState>();
  const [stylePreview, setStylePreview] = useState<WritingStyleProfilePayload>();
  const [isLearningStyle, setIsLearningStyle] = useState(false);
  const [polishDialog, setPolishDialog] = useState<PolishDialogState>();
  const [polishPreview, setPolishPreview] = useState<PolishPreviewState>();
  const [stylePolishDialog, setStylePolishDialog] = useState<StylePolishDialogState>();
  const [isPolishing, setIsPolishing] = useState(false);
  const [isDetectingFullText, setIsDetectingFullText] = useState(false);
  const [fullTextDetectionPreview, setFullTextDetectionPreview] = useState<FullTextDetectionResultPayload>();
  const [editorSelection, setEditorSelection] = useState({ start: 0, end: 0 });
  const saveTimerRef = useRef<number>();
  const latestDraftRef = useRef("");
  const selectedChapterIdRef = useRef<string>();

  const volumes = editorState?.volumes ?? [];
  const chapters = editorState?.chapters ?? [];
  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === selectedChapterId),
    [chapters, selectedChapterId]
  );
  const currentWordCount = useMemo(() => countWords(draftContent), [draftContent]);
  const totalWordCount = useMemo(
    () =>
      chapters.reduce(
        (total, chapter) => total + countWords(chapter.id === selectedChapterId ? draftContent : chapter.content),
        0
      ),
    [chapters, draftContent, selectedChapterId]
  );
  const selectedCount = selectedVolumeIds.size + selectedChapterIds.size;

  const applyEditorState = useCallback((state: EditorState, preferredChapterId?: string) => {
    setEditorState(state);
    const nextChapter = state.chapters.find((chapter) => chapter.id === preferredChapterId) ?? state.chapters[0];
    const nextVolume = state.volumes.find((volume) => volume.id === nextChapter?.volumeId) ?? state.volumes[0];
    setSelectedVolumeId(nextVolume?.id);
    setSelectedChapterId(nextChapter?.id);
    if (nextVolume?.id) {
      setExpandedVolumeIds((current) => new Set(current).add(nextVolume.id));
    }
    selectedChapterIdRef.current = nextChapter?.id;
    setDraftContent(nextChapter?.content ?? "");
    latestDraftRef.current = nextChapter?.content ?? "";
    setSaveStatus("saved");
  }, []);

  const refreshChapterTree = useCallback(
    async (preferredChapterId?: string) => {
      const state = await getEditorState(projectId);
      applyEditorState(state, preferredChapterId);
      return state;
    },
    [applyEditorState, projectId]
  );

  const updateChapter = useCallback((chapter: Chapter) => {
    setEditorState((current) =>
      current
        ? { ...current, chapters: current.chapters.map((item) => (item.id === chapter.id ? chapter : item)) }
        : current
    );
  }, []);

  const flushSave = useCallback(async () => {
    const chapterId = selectedChapterIdRef.current;
    if (!chapterId) {
      return true;
    }

    window.clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    try {
      const content = latestDraftRef.current;
      const saved = await saveChapterContent(chapterId, content, countWords(content));
      setEditorState((current) =>
        current
          ? {
              ...current,
              chapters: current.chapters.map((chapter) =>
                chapter.id === saved.id
                  ? { ...chapter, content, wordCount: saved.wordCount, updatedAt: saved.updatedAt }
                  : chapter
              )
            }
          : current
      );
      setSaveStatus("saved");
      return true;
    } catch (error) {
      console.error(error);
      setSaveStatus("failed");
      return false;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    getEditorState(projectId)
      .then((state) => {
        if (isMounted) {
          applyEditorState(state);
        }
      })
      .catch((error) => {
        console.error(error);
        if (isMounted) {
          setLoadError(String(error));
        }
      });
    return () => {
      isMounted = false;
      window.clearTimeout(saveTimerRef.current);
    };
  }, [applyEditorState, projectId]);

  useEffect(() => {
    let isMounted = true;
    listWritingStyleProfiles(projectId)
      .then((profiles) => {
        if (isMounted) setStyleProfiles(profiles);
      })
      .catch((error) => console.error(error));
    listCorpusStyleProfiles(projectId)
      .then((profiles) => {
        if (isMounted) setCorpusStyleProfiles(profiles);
      })
      .catch((error) => console.error(error));
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const handleDraftChange = (content: string) => {
    setDraftContent(content);
    latestDraftRef.current = content;
    setSaveStatus("editing");
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void flushSave();
    }, 800);
  };

  const formatCurrentChapter = () => {
    if (!selectedChapter) {
      return;
    }
    const formatted = formatChapterContent(draftContent);
    if (formatted === draftContent) {
      return;
    }
    handleDraftChange(formatted);
  };

  const selectChapter = async (chapterId: string) => {
    if (chapterId === selectedChapterId) {
      return;
    }
    if (!(await flushSave())) {
      return;
    }
    const nextChapter = chapters.find((chapter) => chapter.id === chapterId);
    setSelectedChapterId(chapterId);
    selectedChapterIdRef.current = chapterId;
    setSelectedVolumeId(nextChapter?.volumeId);
    if (nextChapter?.volumeId) {
      setExpandedVolumeIds((current) => new Set(current).add(nextChapter.volumeId));
    }
    setDraftContent(nextChapter?.content ?? "");
    latestDraftRef.current = nextChapter?.content ?? "";
    setSaveStatus("saved");
  };

  const handleCreateVolume = async () => {
    if (!(await flushSave())) {
      return;
    }
    const volume = await createVolume(projectId);
    setEditorState((current) => (current ? { ...current, volumes: [...current.volumes, volume] } : current));
    setSelectedVolumeId(volume.id);
    setExpandedVolumeIds((current) => new Set(current).add(volume.id));
  };

  const handleCreateChapter = async () => {
    if (!(await flushSave())) {
      return;
    }
    const targetVolumeId = selectedVolumeId ?? volumes[0]?.id;
    if (!targetVolumeId) {
      window.alert("请先新建或选择一个卷");
      return;
    }
    const chapter = await createChapter(projectId, targetVolumeId);
    setEditorState((current) => (current ? { ...current, chapters: [...current.chapters, chapter] } : current));
    setSelectedVolumeId(targetVolumeId);
    setExpandedVolumeIds((current) => new Set(current).add(targetVolumeId));
    setSelectedChapterId(chapter.id);
    selectedChapterIdRef.current = chapter.id;
    setDraftContent(chapter.content);
    latestDraftRef.current = chapter.content;
    setSaveStatus("saved");
  };

  const importParsedVolumes = async (parsedVolumes: Array<{ title?: string; chapters: ImportChapterDraft[] }>) => {
    let state: EditorState | undefined;
    for (const parsedVolume of parsedVolumes) {
      const targetVolume = parsedVolume.title
        ? await createVolumeWithTitle(projectId, parsedVolume.title)
        : selectedVolumeId
          ? volumes.find((volume) => volume.id === selectedVolumeId) ?? (await createImportVolume(projectId))
          : await createImportVolume(projectId);
      state = await importChapters(projectId, targetVolume.id, parsedVolume.chapters);
    }
    return state ?? (await getEditorState(projectId));
  };

  const importNovelFromFile = async () => {
    if (!(await flushSave())) {
      window.alert("当前章节保存失败，已取消导入。");
      return;
    }
    const selectedPath = await open({
      multiple: false,
      filters: [{ name: "Novel document", extensions: ["txt", "docx"] }]
    });
    if (typeof selectedPath !== "string" || !window.confirm("将从该文件导入章节，是否继续？")) {
      return;
    }
    try {
      const baseName = getFileBaseName(selectedPath);
      const extension = getFileExtension(selectedPath);
      const previousChapterIds = new Set(chapters.map((chapter) => chapter.id));
      const state =
        extension === "docx"
          ? await importParsedVolumes(splitParagraphsIntoVolumes(await readDocxFile(selectedPath), baseName))
          : await importChapters(
              projectId,
              selectedVolumeId ?? (await createImportVolume(projectId)).id,
              splitTextIntoChapters(await readTextFile(selectedPath), baseName)
            );
      const firstImportedChapter = state.chapters.find((chapter) => !previousChapterIds.has(chapter.id));
      applyEditorState(state, firstImportedChapter?.id);
      window.alert(`已导入 ${state.chapters.filter((chapter) => !previousChapterIds.has(chapter.id)).length} 个章节`);
    } catch (error) {
      console.error(error);
      window.alert(`导入失败：${String(error)}`);
    }
  };

  const exportCurrentOrSelected = async () => {
    if (!(await flushSave())) {
      window.alert("当前章节保存失败，已取消导出。");
      return;
    }
    if (!editorState) {
      return;
    }
    const selectedVolumeIdList = Array.from(selectedVolumeIds);
    const selectedChapterIdList = Array.from(selectedChapterIds);
    const currentChapterForExport =
      selectedVolumeIdList.length === 0 && selectedChapterIdList.length === 0 ? selectedChapterId : undefined;
    const outputPath = await save({
      defaultPath: sanitizeFileName(
        getDefaultExportFileName(
          editorState.project,
          volumes,
          chapters,
          selectedVolumeIdList,
          selectedChapterIdList,
          currentChapterForExport,
          "docx"
        )
      ),
      filters: [
        { name: "Word document", extensions: ["docx"] },
        { name: "Text", extensions: ["txt"] }
      ]
    });
    if (!outputPath) {
      return;
    }
    try {
      if (getFileExtension(outputPath) === "docx") {
        const docxVolumes = buildExportDocxVolumes(
          volumes,
          chapters,
          selectedVolumeIdList,
          selectedChapterIdList,
          currentChapterForExport
        );
        if (docxVolumes.length === 0) {
          window.alert("没有可导出的章节");
          return;
        }
        await writeDocxFile(outputPath, docxVolumes);
      } else {
        const exportData = buildExportText(
          editorState.project,
          volumes,
          chapters,
          selectedVolumeIdList,
          selectedChapterIdList,
          currentChapterForExport
        );
        if (!exportData.content.trim()) {
          window.alert("没有可导出的章节");
          return;
        }
        await writeTextFile(outputPath, exportData.content);
      }
      window.alert("导出成功");
    } catch (error) {
      console.error(error);
      window.alert(`导出失败：${String(error)}`);
    }
  };

  const generateChapterSummary = async () => {
    if (!selectedChapter) {
      window.alert("请先选择章节");
      return;
    }
    if (!(await flushSave())) {
      window.alert("当前章节保存失败，已取消生成摘要。");
      return;
    }

    setIsGeneratingSummary(true);
    let taskId: string | undefined;
    try {
      const settings = await getAISettings();
      const prompt = (await readPromptFile("summarize_chapter.md")).replace(
        "{{chapter_content}}",
        latestDraftRef.current
      );
      const task = await createAITask(projectId, "summarize_chapter", prompt);
      taskId = task.id;
      const provider = settings.apiKey.trim() ? createLLMProvider(settings) : new MockProvider();
      const result = await provider.chatJson([
        {
          role: "system",
          content: "你是一个长篇小说分析助手。你必须返回合法 JSON，不要返回 Markdown、代码块或解释文字。"
        },
        { role: "user", content: prompt }
      ]);
      const parsed = parseChapterSummaryJson(result.content);
      await logAIUsage({
        projectId,
        featureName: "summarize_chapter",
        provider: settings.apiKey.trim() ? settings.provider : "Mock",
        model: settings.apiKey.trim() ? settings.model : "mock",
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        estimatedCost: 0
      });
      await finishAITask(task.id, "completed", result.content);
      setSummaryPreview(parsed);
    } catch (error) {
      if (taskId) {
        await finishAITask(taskId, "failed", String(error)).catch((finishError) => console.error(finishError));
      }
      window.alert(`生成章节摘要失败：${String(error)}`);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const confirmChapterSummary = async () => {
    if (!selectedChapter || !summaryPreview) {
      return;
    }
    await saveChapterSummary(selectedChapter.id, summaryPreview.chapter_summary);
    setSummaryPreview(undefined);
    window.alert("章节摘要已写入数据库");
  };

  const detectFullTextIssues = async () => {
    if (chapters.length === 0 || !editorState) {
      window.alert("当前项目没有可检测的章节");
      return;
    }
    if (!(await flushSave())) {
      window.alert("当前章节保存失败，已取消全文检测。");
      return;
    }

    setIsDetectingFullText(true);
    let taskId: string | undefined;
    try {
      const settings = await getAISettings();
      const providerContext = createProviderForFeature(settings, settings.reviewProvider ?? "deepseek");
      const chapterText = buildFullTextForDetection(volumes, chapters, selectedChapterId, latestDraftRef.current);
      const prompt = (await readPromptFile("detect_full_text_issues.md"))
        .replace("{{project_title}}", editorState.project.title)
        .replace("{{full_text}}", chapterText);
      const task = await createAITask(projectId, "detect_full_text_issues", prompt);
      taskId = task.id;
      const result = await providerContext.provider.chatJson([
        { role: "system", content: "你是小说全文质量检测助手。你必须返回合法 JSON，不要返回 Markdown 或解释文字。" },
        { role: "user", content: prompt }
      ]);
      const parsed = parseFullTextDetectionJson(result.content);
      await logAIUsage({
        projectId,
        featureName: "detect_full_text_issues",
        provider: providerContext.providerName,
        model: providerContext.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        estimatedCost: 0
      });
      await finishAITask(task.id, "success", result.content);
      setFullTextDetectionPreview(parsed);
    } catch (error) {
      if (taskId) {
        await finishAITask(taskId, "failed", String(error)).catch((finishError) => console.error(finishError));
      }
      window.alert(`AI 全文检测失败：${String(error)}`);
    } finally {
      setIsDetectingFullText(false);
    }
  };

  const openStyleLearnDialog = () => {
    const currentIndex = selectedChapter ? chapters.findIndex((chapter) => chapter.id === selectedChapter.id) : -1;
    const recentIds = currentIndex >= 0 ? chapters.slice(Math.max(0, currentIndex - 2), currentIndex + 1).map((chapter) => chapter.id) : [];
    setStyleDialog({ isOpen: true, scope: "recent3", profileName: "默认风格", strategy: "openai", selectedChapterIds: new Set(recentIds) });
    setStylePreview(undefined);
  };

  const startLearnWritingStyle = async () => {
    if (!styleDialog) return;
    const sourceChapters = pickStyleSourceChapters(styleDialog, chapters, selectedChapterId);
    if (sourceChapters.length === 0) {
      window.alert("没有可用于学习语言风格的章节");
      return;
    }
    setIsLearningStyle(true);
    let taskId: string | undefined;
    try {
      const settings = await getAISettings();
      const providerContext = createProviderForFeature(settings, settings.featureWritingStyleAnalysis ?? styleDialog.strategy);
      const prompt = (await readPromptFile("analyze_writing_style.md"))
        .replace("{{profile_name}}", styleDialog.profileName)
        .replace("{{selected_chapters}}", sourceChapters.map((chapter) => `【${chapter.title}】\n${truncateText(chapter.content, 6000)}`).join("\n\n"));
      const task = await createAITask(projectId, "writing_style_analysis", prompt);
      taskId = task.id;
      const result = await providerContext.provider.chatJson([
        { role: "system", content: "你是小说语言风格分析助手。你必须返回合法 JSON，不要返回 Markdown、代码块或解释文字。" },
        { role: "user", content: prompt }
      ]);
      const parsed = parseWritingStyleProfileJson(result.content);
      await logAIUsage({ projectId, featureName: "writing_style_analysis", provider: providerContext.providerName, model: providerContext.model, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, totalTokens: result.usage.totalTokens, estimatedCost: 0 });
      await finishAITask(task.id, "success", result.content);
      setStylePreview(parsed);
    } catch (error) {
      if (taskId) await finishAITask(taskId, "failed", String(error)).catch((finishError) => console.error(finishError));
      window.alert(`语言风格学习失败：${String(error)}`);
    } finally {
      setIsLearningStyle(false);
    }
  };

  const confirmSaveStyleProfile = async () => {
    if (!styleDialog || !stylePreview) return;
    const exists = styleProfiles.some((profile) => profile.profileName === styleDialog.profileName);
    const overwrite = exists ? window.confirm("是否覆盖已有风格配置？") : false;
    if (exists && !overwrite) return;
    const sourceChapters = pickStyleSourceChapters(styleDialog, chapters, selectedChapterId);
    const saved = await saveWritingStyleProfile({
      projectId,
      profileName: styleDialog.profileName,
      sourceChapterIds: sourceChapters.map((chapter) => chapter.id),
      dialogueStyle: stylePreview.dialogue_style,
      sceneDescriptionStyle: stylePreview.scene_description_style,
      sentenceStructureStyle: stylePreview.sentence_structure_style,
      emotionStyle: stylePreview.emotion_style,
      humorStyle: stylePreview.humor_style,
      tabooStyle: stylePreview.taboo_style,
      styleSummary: stylePreview.style_summary,
      exampleFeatures: stylePreview.example_features,
      overwrite
    });
    setStyleProfiles((current) => [saved, ...current.filter((profile) => profile.id !== saved.id)]);
    setStyleDialog(undefined);
    setStylePreview(undefined);
    window.alert("语言风格 Profile 已保存");
  };

  const openPolishDialog = async () => {
    const hasSelection = editorSelection.end > editorSelection.start;
    const settings = await getAISettings().catch(() => undefined);
    const latestCorpusProfiles = await listCorpusStyleProfiles(projectId).catch(() => corpusStyleProfiles);
    setCorpusStyleProfiles(latestCorpusProfiles);
    setPolishDialog({
      isOpen: true,
      scope: hasSelection ? "selection" : "chapter",
      targetWordCount: "",
      goal: "basic_narrative",
      customInstruction: "",
      strategy: defaultPolishStrategy(settings),
      profileId: styleProfiles[0]?.id ?? "",
      useCorpusStyleProfile: latestCorpusProfiles.length > 0,
      corpusStyleProfileId: latestCorpusProfiles[0]?.id ?? "",
      corpusStyleDimensionTypes: corpusStyleDefaultDimensions,
      includeChapter: true,
      includeRecent: true,
      includeCharacters: true,
      includeOutline: true,
      includeStyle: true
    });
  };

  const openStylePolishDialog = async () => {
    const hasSelection = editorSelection.end > editorSelection.start;
    const corpus = await searchStyleCorpus("").catch(() => ({ categories: [], works: [], quotes: [] }));
    const settings = await getAISettings().catch(() => undefined);
    setStylePolishDialog({
      isOpen: true,
      scope: hasSelection ? "selection" : "chapter",
      targetWordCount: "",
      intensity: "medium",
      tendency: "poetic",
      customKeywords: "",
      customPrompt: "",
      useCorpus: true,
      useStyleProfile: true,
      strategy: defaultPolishStrategy(settings),
      profileId: styleProfiles[0]?.id ?? "",
      corpusQuery: "",
      corpus,
      selectedQuoteIds: new Set(),
      selectedWorkIds: new Set()
    });
  };

  const searchCorpusForDialog = async (query: string) => {
    if (!stylePolishDialog) return;
    const corpus = await searchStyleCorpus(query);
    setStylePolishDialog({ ...stylePolishDialog, corpusQuery: query, corpus });
  };

  const recommendCorpusForCurrentText = async () => {
    if (!stylePolishDialog || !selectedChapter) return;
    const range = resolvePolishRange(stylePolishDialog.scope, latestDraftRef.current, editorSelection);
    const sourceText = latestDraftRef.current.slice(range.start, range.end);
    const keywords = extractLocalKeywords(`${sourceText} ${stylePolishDialog.customKeywords}`);
    const corpus = await recommendStyleCorpus(keywords);
    setStylePolishDialog({ ...stylePolishDialog, corpus, corpusQuery: keywords.join(" ") });
  };

  const generateLiterarySuggestions = async () => {
    if (!stylePolishDialog || !selectedChapter) return;
    const range = resolvePolishRange(stylePolishDialog.scope, latestDraftRef.current, editorSelection);
    const sourceText = latestDraftRef.current.slice(range.start, range.end);
    const settings = await getAISettings();
    const providerContext = createProviderForFeature(settings, settings.featureWritingStyleAnalysis ?? "openai");
    const corpusContext = formatCorpusContext(stylePolishDialog);
    const prompt = (await readPromptFile("literary_image_suggestions.md"))
      .replace("{{source_text}}", truncateText(sourceText, 5000))
      .replace("{{custom_keywords}}", stylePolishDialog.customKeywords)
      .replace("{{corpus_context}}", corpusContext);
    const task = await createAITask(projectId, "literary_image_suggestions", prompt);
    try {
      const result = await providerContext.provider.chatJson([
        { role: "system", content: "你是文学意象建议助手。你必须返回合法 JSON。" },
        { role: "user", content: prompt }
      ]);
      const parsed = parseLiteraryImageSuggestionJson(result.content);
      await logAIUsage({ projectId, featureName: "literary_image_suggestions", provider: providerContext.providerName, model: providerContext.model, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, totalTokens: result.usage.totalTokens, estimatedCost: 0 });
      await finishAITask(task.id, "success", result.content);
      setStylePolishDialog((current) => (current ? { ...current, suggestions: parsed } : current));
    } catch (error) {
      await finishAITask(task.id, "failed", String(error)).catch((finishError) => console.error(finishError));
      window.alert(`生成文学意象建议失败：${String(error)}`);
    }
  };

  const startStylePolish = async () => {
    if (!stylePolishDialog || !selectedChapter) return;
    if (!(await flushSave())) return;
    const range = resolvePolishRange(stylePolishDialog.scope, latestDraftRef.current, editorSelection);
    const sourceText = latestDraftRef.current.slice(range.start, range.end);
    if (!sourceText.trim()) {
      window.alert("没有可风格化润色的正文");
      return;
    }
    setIsPolishing(true);
    let taskId: string | undefined;
    try {
      const settings = await getAISettings();
      const primaryProviderName = stylePolishDialog.strategy === "openai" || stylePolishDialog.strategy === "openai_deepseek" ? "openai" : "deepseek";
      const primary = createProviderForFeature(settings, primaryProviderName, { model: settings.featurePolishModel ?? "deepseek-v4-flash" });
      const profile = styleProfiles.find((item) => item.id === stylePolishDialog.profileId);
      const analysisDialog: PolishDialogState = {
        isOpen: true,
        scope: stylePolishDialog.scope,
        targetWordCount: stylePolishDialog.targetWordCount,
        goal: "custom",
        customInstruction: stylePolishDialog.customPrompt,
        strategy: stylePolishDialog.strategy,
        profileId: stylePolishDialog.profileId,
        useCorpusStyleProfile: false,
        corpusStyleProfileId: "",
        corpusStyleDimensionTypes: corpusStyleDefaultDimensions,
        includeChapter: true,
        includeRecent: true,
        includeCharacters: true,
        includeOutline: true,
        includeStyle: stylePolishDialog.useStyleProfile
      };
      const context = await buildPolishContext(projectId, selectedChapter, chapters, profile, {
        isOpen: true,
        scope: stylePolishDialog.scope,
        targetWordCount: stylePolishDialog.targetWordCount,
        goal: "custom",
        customInstruction: stylePolishDialog.customPrompt,
        strategy: stylePolishDialog.strategy,
        profileId: stylePolishDialog.profileId,
        useCorpusStyleProfile: false,
        corpusStyleProfileId: "",
        corpusStyleDimensionTypes: corpusStyleDefaultDimensions,
        includeChapter: true,
        includeRecent: true,
        includeCharacters: true,
        includeOutline: true,
        includeStyle: stylePolishDialog.useStyleProfile
      });
      const analysisPrompt = fillAnalysisPrompt(await readPromptFile("analyze_text_before_polish.md"), analysisDialog, selectedChapter.title, sourceText, context);
      const analysisResult = await primary.provider.chatJson([
        { role: "system", content: "You are a novel polish analysis assistant. Return valid JSON only." },
        { role: "user", content: analysisPrompt }
      ]);
      const analysis = parsePolishAnalysisJson(analysisResult.content);
      const reasoningItemsSource: Array<{ content?: string; title: string }> = [{ title: "\u6da6\u8272\u5206\u6790", content: analysisResult.reasoningContent }];
      await logAIUsage({ projectId, featureName: "style_polish_analysis", provider: primary.providerName, model: primary.model, promptTokens: analysisResult.usage.promptTokens, completionTokens: analysisResult.usage.completionTokens, totalTokens: analysisResult.usage.totalTokens, estimatedCost: 0 });
      const prompt = fillStylePolishPrompt(await readPromptFile("style_polish_chapter.md"), stylePolishDialog, selectedChapter.title, sourceText, context, analysis);
      const task = await createAITask(projectId, "style_polish_chapter", prompt);
      taskId = task.id;
      const first = await primary.provider.chatText([
        { role: "system", content: "你是小说风格化润色助手。只输出润色后的正文，不要解释。" },
        { role: "user", content: prompt }
      ]);
      await logAIUsage({ projectId, featureName: "style_polish_chapter", provider: primary.providerName, model: primary.model, promptTokens: first.usage.promptTokens, completionTokens: first.usage.completionTokens, totalTokens: first.usage.totalTokens, estimatedCost: 0 });
      reasoningItemsSource.push({ title: "\u521d\u7a3f\u6da6\u8272", content: first.reasoningContent });
      const localAiPatternHits = precheckAiTastePatterns(first.content.trim());
      let review: PolishReviewResultPayload | undefined;
      if (stylePolishDialog.strategy === "openai_deepseek" || stylePolishDialog.strategy === "deepseek_openai") {
        const reviewerName = stylePolishDialog.strategy === "openai_deepseek" ? "deepseek" : "openai";
        const reviewer = createProviderForFeature(settings, reviewerName, { model: settings.featureReviewModel ?? "deepseek-v4-pro", thinkingEnabled: true });
        const reviewPrompt = fillReviewPrompt(await readPromptFile("review_polished_text.md"), {
          isOpen: true,
          scope: stylePolishDialog.scope,
          targetWordCount: stylePolishDialog.targetWordCount,
          goal: "custom",
          customInstruction: "检查版权风险、过度文艺、风格过载和角色口吻偏移。",
          strategy: stylePolishDialog.strategy,
          profileId: stylePolishDialog.profileId,
          useCorpusStyleProfile: false,
          corpusStyleProfileId: "",
          corpusStyleDimensionTypes: corpusStyleDefaultDimensions,
          includeChapter: true,
          includeRecent: true,
          includeCharacters: true,
          includeOutline: true,
          includeStyle: true
        }, sourceText, first.content.trim(), context, reviewerName, analysis, localAiPatternHits);
        const reviewResult = await reviewer.provider.chatJson([{ role: "system", content: "你是小说润色审查助手。你必须返回合法 JSON。" }, { role: "user", content: reviewPrompt }]);
        review = parsePolishReviewJson(reviewResult.content);
        reasoningItemsSource.push({ title: "AI \u4e92\u68c0", content: reviewResult.reasoningContent });
        await rememberReviewPatterns(projectId, review, reviewer.model);
        await logAIUsage({ projectId, featureName: "style_polish_review", provider: reviewer.providerName, model: reviewer.model, promptTokens: reviewResult.usage.promptTokens, completionTokens: reviewResult.usage.completionTokens, totalTokens: reviewResult.usage.totalTokens, estimatedCost: 0 });
      }
      await finishAITask(task.id, "success", JSON.stringify({ analysis, firstDraft: first.content, review, suggestions: stylePolishDialog.suggestions }));
      setPolishPreview({ originalText: sourceText, polishedText: first.content.trim(), analysis, selectedAnalysisIssueIds: new Set(analysis.issues.map((item) => item.id)), localAiPatternHits, diffSummary: summarizeDiff(sourceText, first.content.trim()), firstDraft: review ? first.content : undefined, review, reasoningItems: buildReasoningItems(settings, reasoningItemsSource), selectedSuggestionIds: new Set([...(review?.suggestions.map((item) => item.id) ?? []), ...localAiPatternHits.map((_, index) => localHitId(index))]), manualRevisionInstruction: "", scope: stylePolishDialog.scope, range });
      setPolishDialog(undefined);
    } catch (error) {
      if (taskId) await finishAITask(taskId, "failed", String(error)).catch((finishError) => console.error(finishError));
      window.alert(`风格化润色失败：${String(error)}`);
    } finally {
      setIsPolishing(false);
    }
  };

  const startPolish = async () => {
    if (!polishDialog || !selectedChapter) return;
    if (!(await flushSave())) {
      window.alert("当前章节保存失败，已取消润色");
      return;
    }
    const range = resolvePolishRange(polishDialog.scope, latestDraftRef.current, editorSelection);
    const sourceText = latestDraftRef.current.slice(range.start, range.end);
    if (!sourceText.trim()) {
      window.alert("没有可润色的正文");
      return;
    }
    setIsPolishing(true);
    let taskId: string | undefined;
    try {
      const settings = await getAISettings();
      const context = await buildPolishContext(projectId, selectedChapter, chapters, styleProfiles.find((profile) => profile.id === polishDialog.profileId), polishDialog);
      const task = await createAITask(projectId, "polish_chapter", JSON.stringify({ chapterId: selectedChapter.id, scope: polishDialog.scope, strategy: polishDialog.strategy }));
      taskId = task.id;
      const primaryProviderName = polishDialog.strategy === "openai" || polishDialog.strategy === "openai_deepseek" ? "openai" : "deepseek";
      const primary = createProviderForFeature(settings, primaryProviderName, { model: settings.featurePolishModel ?? "deepseek-v4-flash" });
      const analysisPrompt = fillAnalysisPrompt(await readPromptFile("analyze_text_before_polish.md"), polishDialog, selectedChapter.title, sourceText, context);
      const analysisResult = await primary.provider.chatJson([
        { role: "system", content: "You are a novel polish analysis assistant. Return valid JSON only." },
        { role: "user", content: analysisPrompt }
      ]);
      const analysis = parsePolishAnalysisJson(analysisResult.content);
      const reasoningItemsSource: Array<{ content?: string; title: string }> = [{ title: "\u6da6\u8272\u5206\u6790", content: analysisResult.reasoningContent }];
      await logAIUsage({ projectId, featureName: "polish_chapter_analysis", provider: primary.providerName, model: primary.model, promptTokens: analysisResult.usage.promptTokens, completionTokens: analysisResult.usage.completionTokens, totalTokens: analysisResult.usage.totalTokens, estimatedCost: 0 });
      const firstPrompt = fillPolishPrompt(await readPromptFile("polish_chapter.md"), polishDialog, selectedChapter.title, sourceText, context, analysis);
      const first = await primary.provider.chatText([{ role: "system", content: "你是小说文本润色助手。只输出润色后的正文，不要解释。" }, { role: "user", content: firstPrompt }]);
      await logAIUsage({ projectId, featureName: "polish_chapter_primary", provider: primary.providerName, model: primary.model, promptTokens: first.usage.promptTokens, completionTokens: first.usage.completionTokens, totalTokens: first.usage.totalTokens, estimatedCost: 0 });
      reasoningItemsSource.push({ title: "\u521d\u7a3f\u6da6\u8272", content: first.reasoningContent });
      const localAiPatternHits = precheckAiTastePatterns(first.content.trim());
      let review: PolishReviewResultPayload | undefined;
      if (polishDialog.strategy === "openai_deepseek" || polishDialog.strategy === "deepseek_openai") {
        const reviewProviderName = polishDialog.strategy === "openai_deepseek" ? "deepseek" : "openai";
        const reviewer = createProviderForFeature(settings, reviewProviderName, { model: settings.featureReviewModel ?? "deepseek-v4-pro", thinkingEnabled: true });
        const reviewPrompt = fillReviewPrompt(await readPromptFile("review_polished_text.md"), polishDialog, sourceText, first.content.trim(), context, reviewProviderName, analysis, localAiPatternHits);
        const reviewResult = await reviewer.provider.chatJson([{ role: "system", content: "你是小说润色审查助手。你必须返回合法 JSON。" }, { role: "user", content: reviewPrompt }]);
        review = parsePolishReviewJson(reviewResult.content);
        reasoningItemsSource.push({ title: "AI \u4e92\u68c0", content: reviewResult.reasoningContent });
        await rememberReviewPatterns(projectId, review, reviewer.model);
        await logAIUsage({ projectId, featureName: "polish_chapter_review", provider: reviewer.providerName, model: reviewer.model, promptTokens: reviewResult.usage.promptTokens, completionTokens: reviewResult.usage.completionTokens, totalTokens: reviewResult.usage.totalTokens, estimatedCost: 0 });
      }
      await finishAITask(task.id, "success", JSON.stringify({ analysis, firstDraft: first.content, review }));
      setPolishPreview({ originalText: sourceText, polishedText: first.content.trim(), analysis, selectedAnalysisIssueIds: new Set(analysis.issues.map((item) => item.id)), localAiPatternHits, diffSummary: summarizeDiff(sourceText, first.content.trim()), firstDraft: review ? first.content : undefined, review, reasoningItems: buildReasoningItems(settings, reasoningItemsSource), selectedSuggestionIds: new Set([...(review?.suggestions.map((item) => item.id) ?? []), ...localAiPatternHits.map((_, index) => localHitId(index))]), manualRevisionInstruction: "", scope: polishDialog.scope, range });
    } catch (error) {
      if (taskId) await finishAITask(taskId, "failed", String(error)).catch((finishError) => console.error(finishError));
      window.alert(`AI 润色失败：${String(error)}`);
    } finally {
      setIsPolishing(false);
    }
  };

  const revisePolishWithSelectedSuggestions = async () => {
    if (!polishDialog || !polishPreview || !selectedChapter || !polishPreview.review) return;
    setIsPolishing(true);
    try {
      const settings = await getAISettings();
      const primaryProviderName = polishDialog.strategy === "openai" || polishDialog.strategy === "openai_deepseek" ? "openai" : "deepseek";
      const primary = createProviderForFeature(settings, primaryProviderName, { model: settings.featurePolishModel ?? "deepseek-v4-flash" });
      const selectedSuggestions = polishPreview.review.suggestions.filter((suggestion) => polishPreview.selectedSuggestionIds.has(suggestion.id)).map((suggestion) => suggestion.recommended_prompt_addition || suggestion.content).filter(Boolean);
      const selectedLocalHits = polishPreview.localAiPatternHits.filter((_, index) => polishPreview.selectedSuggestionIds.has(localHitId(index)));
      const context = await buildPolishContext(projectId, selectedChapter, chapters, styleProfiles.find((profile) => profile.id === polishDialog.profileId), polishDialog);
      const selectedAnalysisIssues = polishPreview.analysis?.issues.filter((issue) => polishPreview.selectedAnalysisIssueIds.has(issue.id)) ?? [];
      const prompt = `${fillPolishPrompt(await readPromptFile("polish_chapter.md"), polishDialog, selectedChapter.title, polishPreview.originalText, context, polishPreview.analysis)}

请根据以下修改建议进行二次润色：
${selectedSuggestions.map((item) => `- ${item}`).join("\n")}

本地规则预检命中项：
${selectedLocalHits.map((item) => `- ${item.quote}: ${item.rewrite_advice}`).join("\n")}

请继续遵循以下已勾选的润色前分析问题：
${selectedAnalysisIssues.map((item) => `- ${item.original_quote}: ${item.rewrite_direction}`).join("\n")}

用户额外要求：
${polishPreview.manualRevisionInstruction}

上一版润色：
${polishPreview.polishedText}`;
      const result = await primary.provider.chatText([{ role: "system", content: "你是小说文本二次润色助手。只输出最终润色后的正文。" }, { role: "user", content: prompt }]);
      await logAIUsage({ projectId, featureName: "polish_chapter_revision", provider: primary.providerName, model: primary.model, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, totalTokens: result.usage.totalTokens, estimatedCost: 0 });
      setPolishPreview((current) => (current ? { ...current, polishedText: result.content.trim() } : current));
    } catch (error) {
      window.alert(`二次润色失败：${String(error)}`);
    } finally {
      setIsPolishing(false);
    }
  };

  const replaceWithPolishedText = async (mode: "selection" | "chapter") => {
    if (!selectedChapter || !polishPreview) return;
    const original = latestDraftRef.current;
    await saveChapterVersion(selectedChapter.id, "manual_backup", original, "AI 润色替换前自动备份");
    const nextContent = mode === "chapter" ? polishPreview.polishedText : original.slice(0, polishPreview.range.start) + polishPreview.polishedText + original.slice(polishPreview.range.end);
    handleDraftChange(nextContent);
    latestDraftRef.current = nextContent;
    await saveChapterVersion(selectedChapter.id, "ai_polished", polishPreview.polishedText, buildPolishVersionNote(polishPreview, polishDialog));
    await saveChapterContent(selectedChapter.id, nextContent, countWords(nextContent));
    setPolishPreview(undefined);
    setPolishDialog(undefined);
    setSaveStatus("saved");
    await refreshChapterTree(selectedChapter.id);
  };

  const savePolishedAsVersion = async () => {
    if (!selectedChapter || !polishPreview) return;
    await saveChapterVersion(selectedChapter.id, "ai_polished", polishPreview.polishedText, buildPolishVersionNote(polishPreview, polishDialog));
    window.alert("已保存为新版本");
  };

  const handleStartRename = (target: RenameTarget) => {
    setRenameTarget(target);
    setEditingTitle(target.title);
  };

  const handleRenameCommit = async () => {
    if (!renameTarget) {
      return;
    }
    const target = renameTarget;
    setRenameTarget(undefined);
    try {
      if (target.type === "volume") {
        const volume = await renameVolume(target.id, editingTitle);
        setEditorState((current) => replaceVolume(current, volume));
      } else {
        updateChapter(await renameChapter(target.id, editingTitle));
      }
    } catch (error) {
      console.error(error);
      setSaveStatus("failed");
    }
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode((current) => {
      if (current) {
        setSelectedVolumeIds(new Set());
        setSelectedChapterIds(new Set());
      }
      return !current;
    });
  };

  const toggleVolumeExpanded = (volumeId: string) => {
    setExpandedVolumeIds((current) => {
      const next = new Set(current);
      if (next.has(volumeId)) {
        next.delete(volumeId);
      } else {
        next.add(volumeId);
      }
      return next;
    });
  };

  const toggleVolumeSelection = (volumeId: string) => {
    const volumeChapterIds = chapters.filter((chapter) => chapter.volumeId === volumeId).map((chapter) => chapter.id);
    const shouldDeselect =
      selectedVolumeIds.has(volumeId) ||
      (volumeChapterIds.length > 0 && volumeChapterIds.every((chapterId) => selectedChapterIds.has(chapterId)));
    setSelectedVolumeIds((current) => {
      const next = new Set(current);
      if (shouldDeselect) {
        next.delete(volumeId);
      } else {
        next.add(volumeId);
      }
      return next;
    });
    setSelectedChapterIds((current) => {
      const next = new Set(current);
      for (const chapterId of volumeChapterIds) {
        if (shouldDeselect) {
          next.delete(chapterId);
        } else {
          next.add(chapterId);
        }
      }
      return next;
    });
  };

  const toggleChapterSelection = (chapterId: string) => {
    const chapter = chapters.find((item) => item.id === chapterId);
    setSelectedChapterIds((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
    if (chapter) {
      setSelectedVolumeIds((current) => {
        const next = new Set(current);
        next.delete(chapter.volumeId);
        return next;
      });
    }
  };

  const getSelectedChapterIds = () => {
    const ids = new Set(selectedChapterIds);
    for (const volumeId of selectedVolumeIds) {
      chapters.filter((chapter) => chapter.volumeId === volumeId).forEach((chapter) => ids.add(chapter.id));
    }
    return Array.from(ids);
  };

  const deleteSelectedItemsFromTree = async () => {
    const volumeIds = Array.from(selectedVolumeIds);
    const chapterIds = getSelectedChapterIds();
    if (volumeIds.length === 0 && chapterIds.length === 0) {
      window.alert("请先选择要删除的章节或卷");
      return;
    }
    const message =
      volumeIds.length > 0
        ? "确定删除选中的卷及其下所有章节吗？此操作不可恢复。"
        : `确定删除选中的 ${chapterIds.length} 个章节吗？此操作不可恢复。`;
    if (!window.confirm(message) || !(await flushSave())) {
      return;
    }
    try {
      const state = await deleteSelectedItems(projectId, volumeIds, chapterIds);
      const currentChapterStillExists = state.chapters.some((chapter) => chapter.id === selectedChapterId);
      applyEditorState(state, currentChapterStillExists ? selectedChapterId : undefined);
      setSelectedVolumeIds(new Set());
      setSelectedChapterIds(new Set());
      setIsSelectionMode(false);
      await refreshChapterTree(currentChapterStillExists ? selectedChapterId : undefined);
    } catch (error) {
      console.error(error);
      window.alert(`删除失败：${String(error)}`);
    }
  };

  if (loadError) {
    return (
      <main className="empty-state">
        <h1>本地数据库加载失败</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  if (!editorState) {
    return (
      <main className="empty-state">
        <h1>正在打开项目</h1>
        <p>正在读取本地 SQLite 数据...</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <SidebarVolumeTree
        activeWorkspace={activeWorkspace}
        chapters={chapters}
        editingId={renameTarget?.id}
        editingTitle={editingTitle}
        expandedVolumeIds={expandedVolumeIds}
        isSelectionMode={isSelectionMode}
        project={editorState.project}
        selectedChapterIds={selectedChapterIds}
        selectedChapterId={selectedChapterId}
        selectedCount={selectedCount}
        selectedVolumeId={selectedVolumeId}
        selectedVolumeIds={selectedVolumeIds}
        volumes={volumes}
        onBackToShelf={onBackToShelf}
        onCreateChapter={handleCreateChapter}
        onCreateVolume={handleCreateVolume}
        onDeleteSelected={deleteSelectedItemsFromTree}
        onEditTitleChange={setEditingTitle}
        onExport={exportCurrentOrSelected}
        onImport={importNovelFromFile}
        onOpenAISettings={() => setActiveWorkspace("aiSettings")}
        onOpenCorpusStyle={() => setActiveWorkspace("corpusStyle")}
        onOpenEditor={() => setActiveWorkspace("editor")}
        onOpenMemory={() => setActiveWorkspace("memory")}
        onOpenOutline={() => setActiveWorkspace("outline")}
        onRenameCommit={handleRenameCommit}
        onSelectChapter={selectChapter}
        onSelectVolume={setSelectedVolumeId}
        onStartRename={handleStartRename}
        onToggleChapterSelection={toggleChapterSelection}
        onToggleVolumeExpanded={toggleVolumeExpanded}
        onToggleSelectionMode={toggleSelectionMode}
        onToggleVolumeSelection={toggleVolumeSelection}
      />

      {activeWorkspace === "aiSettings" ? (
        <section className="outline-shell" aria-label="AI 设置">
          <AISettingsPage />
        </section>
      ) : activeWorkspace === "memory" ? (
        <section className="outline-shell" aria-label="记忆库管理">
          <MemoryLibraryPage project={editorState.project} onOutlineCleared={() => void refreshChapterTree(selectedChapterId)} />
        </section>
      ) : activeWorkspace === "corpusStyle" ? (
        <section className="outline-shell" aria-label="文风指纹库">
          <CorpusStylePage chapters={chapters} currentChapterId={selectedChapterId} project={editorState.project} volumes={volumes} />
        </section>
      ) : activeWorkspace === "outline" ? (
        <section className="outline-shell" aria-label="小说大纲">
          <OutlinePage chapters={chapters} currentChapterId={selectedChapterId} project={editorState.project} volumes={volumes} />
        </section>
      ) : (
        <>
          <section className="chapter-pane" aria-label="章节正文">
            {selectedChapter ? (
              <>
                <EditorToolbar
                  chapterTitle={selectedChapter.title}
                  isGeneratingSummary={isGeneratingSummary}
                  isLearningStyle={isLearningStyle}
                  isPolishing={isPolishing}
                  saveStatus={saveStatus}
                  wordCount={currentWordCount}
                  onFormatChapter={formatCurrentChapter}
                  onGenerateSummary={generateChapterSummary}
                  onLearnStyle={openStyleLearnDialog}
                  onPolish={openPolishDialog}
                  onStylePolish={openStylePolishDialog}
                />
                <ChapterEditor content={draftContent} onChange={handleDraftChange} onSelectionChange={setEditorSelection} />
              </>
            ) : (
              <div className="editor-empty">
                <h2>暂无章节</h2>
                <p>请先在左侧新建卷和章节。</p>
              </div>
            )}
          </section>

          <aside className="inspector" aria-label="大纲、人物和伏笔">
            <section className="panel floating-word-stats">
              <h2>字数统计</h2>
              <div className="word-stat-grid">
                <div>
                  <span>全书字数</span>
                  <strong>{totalWordCount.toLocaleString()}</strong>
                </div>
                <div>
                  <span>本章字数</span>
                  <strong>{currentWordCount.toLocaleString()}</strong>
                </div>
              </div>
            </section>
            <section className="panel">
              <h2>章节摘要</h2>
              <p>点击正文顶部“生成章节摘要”后，确认预览即可写入本地数据库。</p>
            </section>
            <section className="panel">
              <h2>AI 全文检测</h2>
              <p>检测全书剧情、设定、人物口吻和 AI 模板句，只给修改建议，不会自动改正文。</p>
              <button className="ai-summary-button inspector-action" disabled={isDetectingFullText} onClick={() => void detectFullTextIssues()} type="button">
                {isDetectingFullText ? "检测中..." : "开始全文检测"}
              </button>
            </section>
            <section className="panel">
              <h2>总大纲</h2>
              <p>本阶段 AI 不会自动更新全书大纲。</p>
            </section>
            <section className="panel">
              <h2>角色状态</h2>
              <div className="placeholder-row">
                <strong>待接入</strong>
                <span>角色状态抽取与维护将在后续阶段实现</span>
              </div>
            </section>
            <section className="panel">
              <h2>伏笔与剧情线</h2>
              <div className="placeholder-row">
                <strong>待接入</strong>
                <span>伏笔、回收与一致性检查暂不在本阶段实现</span>
              </div>
            </section>
          </aside>
        </>
      )}

      {styleDialog && (
        <StyleLearnModal
          chapters={chapters}
          dialog={styleDialog}
          isLearning={isLearningStyle}
          preview={stylePreview}
          onCancel={() => {
            setStyleDialog(undefined);
            setStylePreview(undefined);
          }}
          onChange={setStyleDialog}
          onSave={confirmSaveStyleProfile}
          onStart={startLearnWritingStyle}
        />
      )}

      {polishDialog && (
        <PolishModal
          dialog={polishDialog}
          isPolishing={isPolishing}
          preview={polishPreview}
          corpusProfiles={corpusStyleProfiles}
          profiles={styleProfiles}
          onCancel={() => {
            setPolishDialog(undefined);
            setPolishPreview(undefined);
          }}
          onChange={setPolishDialog}
          onCopy={() => polishPreview && navigator.clipboard?.writeText(polishPreview.polishedText)}
          onReplaceChapter={() => void replaceWithPolishedText("chapter")}
          onReplaceSelection={() => void replaceWithPolishedText("selection")}
          onRevise={revisePolishWithSelectedSuggestions}
          onSaveVersion={savePolishedAsVersion}
          onStart={startPolish}
          onUpdatePreview={setPolishPreview}
        />
      )}

      {stylePolishDialog && (
        <StylePolishModal
          dialog={stylePolishDialog}
          isPolishing={isPolishing}
          profiles={styleProfiles}
          onCancel={() => setStylePolishDialog(undefined)}
          onChange={setStylePolishDialog}
          onGenerateSuggestions={generateLiterarySuggestions}
          onRecommend={recommendCorpusForCurrentText}
          onSearch={searchCorpusForDialog}
          onStart={startStylePolish}
        />
      )}

      {summaryPreview && (
        <ChapterSummaryPreviewModal
          payload={summaryPreview}
          onCancel={() => setSummaryPreview(undefined)}
          onConfirm={confirmChapterSummary}
        />
      )}

      {fullTextDetectionPreview && (
        <FullTextDetectionModal
          payload={fullTextDetectionPreview}
          onClose={() => setFullTextDetectionPreview(undefined)}
        />
      )}
    </main>
  );
}

function replaceVolume(current: EditorState | undefined, volume: Volume) {
  if (!current) {
    return current;
  }
  return {
    ...current,
    volumes: current.volumes.map((item) => (item.id === volume.id ? volume : item))
  };
}

function pickStyleSourceChapters(dialog: StyleLearnDialogState, chapters: Chapter[], currentChapterId?: string) {
  const currentIndex = chapters.findIndex((chapter) => chapter.id === currentChapterId);
  if (dialog.scope === "current") return currentIndex >= 0 ? [chapters[currentIndex]] : [];
  if (dialog.scope === "recent3") return currentIndex >= 0 ? chapters.slice(Math.max(0, currentIndex - 2), currentIndex + 1) : chapters.slice(0, 3);
  if (dialog.scope === "manual") return chapters.filter((chapter) => dialog.selectedChapterIds.has(chapter.id));
  const step = Math.max(1, Math.floor(chapters.length / 5));
  return chapters.filter((_, index) => index % step === 0).slice(0, 6);
}

function resolvePolishRange(scope: PolishScope, content: string, selection: { end: number; start: number }) {
  if (scope === "selection" && selection.end > selection.start) return selection;
  if (scope === "paragraph") {
    const cursor = Math.max(0, Math.min(content.length, selection.start));
    const start = content.lastIndexOf("\n\n", cursor - 1);
    const end = content.indexOf("\n\n", cursor);
    return { start: start >= 0 ? start + 2 : 0, end: end >= 0 ? end : content.length };
  }
  return { start: 0, end: content.length };
}

function truncateText(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit)}\n……` : value;
}

function buildFullTextForDetection(volumes: Volume[], chapters: Chapter[], selectedChapterId: string | undefined, latestDraft: string) {
  const volumeOrder = new Map(volumes.map((volume, index) => [volume.id, index]));
  return [...chapters]
    .sort((left, right) => {
      const volumeDiff = (volumeOrder.get(left.volumeId) ?? 0) - (volumeOrder.get(right.volumeId) ?? 0);
      return volumeDiff || left.sortOrder - right.sortOrder;
    })
    .map((chapter) => `## ${chapter.title}\n${chapter.id === selectedChapterId ? latestDraft : chapter.content}`)
    .join("\n\n");
}

function createProviderForFeature(settings: AISettings, strategy?: AIProviderStrategy | RuntimeProviderName, override?: Partial<Pick<AISettings, "model" | "reasoningEffort" | "thinkingEnabled">>) {
  const providerName = resolveProviderName(settings, strategy);
  if (hasProviderKey(settings, providerName)) {
    const runtimeSettings = providerName === "deepseek" && override ? { ...settings, ...override } : settings;
    return { provider: createLLMProvider(runtimeSettings, providerName), providerName, model: providerName === "openai" ? settings.openaiModel || "gpt-5.5" : runtimeSettings.model || "deepseek-v4-flash" };
  }
  const hasAnyKey = hasProviderKey(settings, "deepseek") || hasProviderKey(settings, "openai");
  if (hasAnyKey) throw new Error(`请先在 AI 设置中配置 ${providerName === "openai" ? "OpenAI" : "DeepSeek"} API Key。`);
  return { provider: new MockProvider() as LLMProvider, providerName: "mock", model: "mock" };
}

function buildReasoningItems(settings: AISettings, items: Array<{ content?: string; title: string }>) {
  if (!settings.showReasoningContent) return undefined;
  const visible = items.filter((item): item is { content: string; title: string } => Boolean(item.content?.trim()));
  return visible.length > 0 ? visible : undefined;
}

function resolveProviderName(settings: AISettings, strategy?: AIProviderStrategy | RuntimeProviderName): RuntimeProviderName {
  if (strategy === "openai" || strategy === "deepseek") return strategy;
  if (strategy === "hybrid") return settings.primaryProvider === "openai" ? "openai" : "deepseek";
  return String(settings.provider).toLowerCase() === "openai" ? "openai" : "deepseek";
}

function hasProviderKey(settings: AISettings, providerName: RuntimeProviderName) {
  return providerName === "openai" ? Boolean(settings.openaiApiKey?.trim()) : Boolean(settings.apiKey?.trim());
}

async function buildPolishContext(projectId: string, selectedChapter: Chapter, chapters: Chapter[], profile: WritingStyleProfile | undefined, dialog: PolishDialogState) {
  const currentIndex = chapters.findIndex((chapter) => chapter.id === selectedChapter.id);
  const recent = dialog.includeRecent && currentIndex >= 0 ? chapters.slice(Math.max(0, currentIndex - 3), currentIndex).map((chapter) => `【${chapter.title}】\n${truncateText(chapter.content, 1200)}`).join("\n\n") : "";
  let outline = "";
  if (dialog.includeOutline || dialog.includeCharacters) {
    const state = await getOutlineState(projectId);
    const sections = Object.fromEntries(state.textSections.map((section) => [section.sectionType, section.content]));
    outline = [
      dialog.includeOutline ? `主线剧情：\n${truncateText(sections.main_plot ?? "", 1800)}\n\n支线剧情：\n${truncateText(sections.branch_plot ?? "", 1200)}` : "",
      dialog.includeCharacters ? `主角团：\n${truncateText(sections.main_characters ?? "", 1200)}\n\n配角：\n${truncateText(sections.roles ?? "", 1200)}` : "",
      dialog.includeOutline ? `矛盾冲突：\n${truncateText(sections.conflicts ?? "", 800)}` : ""
    ].filter(Boolean).join("\n\n");
  }
  const corpusStyleProfile = dialog.useCorpusStyleProfile && dialog.corpusStyleProfileId
    ? await getCorpusStyleProfileState(dialog.corpusStyleProfileId).catch(() => undefined)
    : undefined;
  const corpusStyleContext = corpusStyleProfile
    ? formatCorpusStyleProfileForPolish(corpusStyleProfile, dialog.corpusStyleDimensionTypes)
    : "";

  return {
    recent,
    outline,
    styleProfile: [corpusStyleContext, dialog.includeStyle && profile ? formatStyleProfile(profile) : ""].filter(Boolean).join("\n\n"),
    aiPatterns: formatAIPatternMemory(await listAIPatternMemory(projectId).catch(() => []))
  };
}

function formatStyleProfile(profile: WritingStyleProfile) {
  return [
    `Profile：${profile.profileName}`,
    `摘要：${profile.styleSummary}`,
    `对话：${profile.dialogueStyle}`,
    `景物：${profile.sceneDescriptionStyle}`,
    `句式：${profile.sentenceStructureStyle}`,
    `情绪：${profile.emotionStyle}`,
    `幽默：${profile.humorStyle}`,
    `雷区：${profile.tabooStyle}`,
    `特征：${profile.exampleFeaturesJson}`
  ].join("\n");
}

function formatCorpusStyleProfileForPolish(profileState: CorpusStyleProfileState, enabledDimensions: CorpusStyleDimensionType[]) {
  const enabled = new Set(enabledDimensions);
  const ruleLines: string[] = [];
  const exampleLines: string[] = [];
  let exampleBudget = 600;

  for (const dimension of profileState.dimensions) {
    if (!enabled.has(dimension.dimensionType)) continue;
    const label = corpusStyleDimensionLabel(dimension.dimensionType);
    safeJsonArray(dimension.rulesJson).forEach((rule) => {
      if (ruleLines.length < 10) {
        ruleLines.push(`- ${label}: ${rule}`);
      }
    });
    const dimensionExamples = profileState.examples
      .filter((example) => example.dimensionType === dimension.dimensionType)
      .slice(0, 3);
    for (const example of dimensionExamples) {
      if (exampleLines.length >= 3 || exampleBudget <= 0) break;
      const excerpt = truncateText(example.originalExcerpt, Math.min(200, exampleBudget));
      exampleBudget -= excerpt.length;
      exampleLines.push(`【${label}】${excerpt}\n用法：${example.usageRule || example.analysisNote}`);
    }
  }

  if (ruleLines.length === 0 && exampleLines.length === 0) return "";
  return [
    "【文风指纹库：优先遵循】",
    `Profile：${profileState.profile.profileName}`,
    profileState.profile.summary ? `摘要：${profileState.profile.summary}` : "",
    ruleLines.length > 0 ? `润色规则（最多10条）：\n${ruleLines.join("\n")}` : "",
    exampleLines.length > 0 ? `可模仿例句（最多3条，总长约600字）：\n${exampleLines.join("\n\n")}` : "",
    "注意：文风指纹只用于约束表达习惯，不允许改变剧情事实、人物关系或新增设定。"
  ].filter(Boolean).join("\n");
}

function corpusStyleDimensionLabel(dimension: CorpusStyleDimensionType) {
  return {
    appearance: "外貌描写",
    action: "动作描写",
    environment: "环境描写",
    dialogue: "对话风格",
    psychology: "心理描写",
    paragraph: "段落结构",
    rhetoric: "修辞习惯",
    pacing: "节奏控制",
    setting_delivery: "设定投放",
    vocabulary: "词汇习惯",
    polish_rules: "润色规则"
  }[dimension];
}

function formatAIPatternMemory(patterns: AIPatternMemory[]) {
  const active = patterns.filter((pattern) => pattern.isActive).slice(0, 24);
  if (active.length === 0) return "";
  return active
    .map((pattern) => {
      const badExamples = safeJsonArray(pattern.badExamples).slice(0, 3).join(" / ");
      const keywords = safeJsonArray(pattern.patternKeywords).slice(0, 6).join("、");
      return [
        `规则：${pattern.patternName}`,
        `类型：${pattern.patternType}；严重度：${pattern.severity}`,
        keywords ? `关键词：${keywords}` : "",
        pattern.patternDescription ? `说明：${pattern.patternDescription}` : "",
        badExamples ? `坏例：${badExamples}` : "",
        pattern.rewriteAdvice ? `规避建议：${pattern.rewriteAdvice}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function safeJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function extractPatternKeywords(text: string) {
  return Array.from(
    new Set(
      text
        .split(/[\s,，。！？、；;:"“”'‘’()[\]{}<>《》]+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2 && item.length <= 16)
    )
  ).slice(0, 8);
}

async function rememberReviewPatterns(projectId: string, review: PolishReviewResultPayload, sourceModel: string) {
  const patterns: ReviewPatternInput[] = review.suggestions
    .filter((suggestion) => suggestion.type === "ai_taste" || suggestion.type.includes("template") || suggestion.type === "metaphor_overuse" || suggestion.type === "ending_overextension" || suggestion.type === "ai_negation_pattern" || suggestion.type === "negation_pattern" || suggestion.type === "ai_wording_template")
    .map((suggestion) => ({
      patternType: mapSuggestionToPatternType(suggestion.type),
      patternName: polishSuggestionTypeLabel(suggestion.type),
      patternKeywords: extractPatternKeywords(`${suggestion.content} ${suggestion.original_quote ?? ""}`),
      patternDescription: suggestion.content,
      badExample: suggestion.original_quote ?? "",
      rewriteAdvice: suggestion.recommended_prompt_addition,
      severity: suggestion.severity,
      sourceModel
    }));
  if (patterns.length > 0) {
    await upsertAIPatternsFromReview(projectId, patterns).catch((error) => console.error("remember AI pattern failed", error));
  }
}

function mapSuggestionToPatternType(type: PolishReviewResultPayload["suggestions"][number]["type"]) {
  if (type === "ai_negation_pattern") return "negation_pattern";
  if (type === "negation_pattern") return "negation_pattern";
  if (type === "repeated_emphasis_template") return "repeated_emphasis";
  return type;
}

function buildPolishVersionNote(preview: PolishPreviewState, dialog: PolishDialogState | undefined) {
  return JSON.stringify({
    type: "ai_polished",
    analysis_result: preview.analysis,
    selected_issue_ids: Array.from(preview.selectedAnalysisIssueIds),
    diff_summary: preview.diffSummary,
    change_ratio: preview.diffSummary?.changeRatio ?? summarizeDiff(preview.originalText, preview.polishedText).changeRatio,
    word_count_before: countWords(preview.originalText),
    word_count_after: countWords(preview.polishedText),
    target_word_count: dialog?.targetWordCount ?? "",
    model_strategy: dialog?.strategy ?? "",
    review_summary: preview.review
      ? {
          overall_score: preview.review.overall_score,
          ai_taste_score: preview.review.ai_taste_score,
          analysis_follow_score: preview.review.analysis_follow_score,
          unnecessary_rewrite_score: preview.review.unnecessary_rewrite_score
        }
      : undefined
  });
}

function localHitId(index: number) {
  return `local-ai-hit-${index}`;
}

function precheckAiTastePatterns(polishedText: string): LocalAiPatternHit[] {
  const hits: LocalAiPatternHit[] = [];
  const pushHit = (quote: string, pattern_type: LocalAiPatternHit["pattern_type"], reason: string, rewrite_advice: string) => {
    const normalizedQuote = quote.trim().slice(0, 120);
    if (!normalizedQuote || hits.some((item) => item.quote === normalizedQuote && item.pattern_type === pattern_type)) return;
    hits.push({ quote: normalizedQuote, pattern_type, reason, rewrite_advice });
  };

  const compact = polishedText.replace(/\r\n/g, "\n").replace(/\n+/g, "\n");
  const sentenceEnd = "\\u3002\\uff01\\uff1f?!";

  for (const match of compact.matchAll(new RegExp("([^" + sentenceEnd + "\\n]{1,12})[" + sentenceEnd + "]\\s*(?:\\u53c8\\u662f|\\u592a|\\u975e\\u5e38|\\u5f88|\\u6781\\u5176)\\1[\\u4e86" + sentenceEnd + "]*", "g"))) {
    pushHit(match[0], "repeated_emphasis_template", "Repeated short-sentence emphasis looks template-like.", "Remove the repeated emphasis and use concrete action, reaction, or scene detail instead.");
  }

  for (const match of compact.matchAll(new RegExp("([^" + sentenceEnd + "\\n]{2,12})[" + sentenceEnd + "]\\s*\\u8fd9\\u6bd4[^" + sentenceEnd + "\\n]{2,50}[" + sentenceEnd + "]?", "g"))) {
    pushHit(match[0], "repeated_emphasis_template", "Short declarative fragment followed by 'this is harsher/stronger than...' can become a mechanical emphasis template.", "Keep it only when it preserves a joke; otherwise show the contrast through character reaction, timing, or scene detail.");
  }

  for (const match of compact.matchAll(new RegExp("\\u4e0d\\u662f(?:\\u5f62\\u5bb9|\\u6bd4\\u55bb|\\u5938\\u5f20|\\u9519\\u89c9|\\u73a9\\u7b11)[" + sentenceEnd + "\\s]+\\u662f\\u771f\\u7684[^" + sentenceEnd + "\\n]{0,30}[" + sentenceEnd + "]?", "g"))) {
    pushHit(match[0], "blunt_explanation_template", "Blunt split explanation like 'not a metaphor, it is real' reads mechanical.", "Show the confirmation through character reaction, pause, visual change, or dialogue rhythm.");
  }

  for (const match of compact.matchAll(new RegExp("(?:\\u4e0d\\u662f|\\u5e76\\u975e)[^" + sentenceEnd + "\\n]{1,40}(?:\\u800c\\u662f|\\u800c\\u662f\\u56e0\\u4e3a)[^" + sentenceEnd + "\\n]{1,80}[" + sentenceEnd + "]?", "g"))) {
    pushHit(match[0], "negation_pattern", "Negation-then-affirmation template can feel like AI summary prose.", "Use direct action, detail, or character judgment instead of abstract contrast.");
  }

  for (const match of compact.matchAll(new RegExp("\\u628a[^" + sentenceEnd + "\\n]{1,16}(?:\\u538b|\\u653e|\\u8bf4|\\u505a|\\u843d|\\u6536|\\u964d)\\u5f97(?:\\u5f88|\\u6781|\\u975e\\u5e38)?(?:\\u8f7b|\\u4f4e|\\u6162|\\u7a33)[^" + sentenceEnd + "\\n]{0,10}[" + sentenceEnd + "]?", "g"))) {
    pushHit(match[0], "light_action_template", "The 'make/press something very light' expression is formulaic.", "Use a specific action, sound change, or character reaction to show subtlety.");
  }

  for (const match of compact.matchAll(new RegExp("(?:\\u8ba4\\u771f)?\\u770b\\u4e86[^" + sentenceEnd + "\\n]{0,8}(?:\\u4e00\\u773c|\\u51e0\\u79d2)|\\u4f4e\\u5934\\u770b\\u4e86\\u770b\\u81ea\\u5df1\\u7684\\u624b|\\u5fae\\u5fae\\u4e00\\u6014|\\u76b1\\u4e86\\u76b1\\u7709|\\u6c89\\u9ed8\\u4e86?", "g"))) {
    pushHit(match[0], "body_language", "Generic body-language action is easy to reuse across all characters.", "Replace it with an action tied to this character's personality, status, relationship, and current emotion.");
  }

  for (const match of compact.matchAll(new RegExp("[\\u90a3\\u8fd9]\\u662f[\\u4e00\\u679a\\u53ea\\u5f20\\u4e2a\\u5757\\u6761\\u672c]?[^" + sentenceEnd + "\\n]{0,8}(?:\\u5706\\u5f62|\\u94f6\\u8272|\\u9ed1\\u8272|\\u7ec6\\u957f|\\u6cdb\\u9ec4|\\u6c34\\u6676|\\u5fbd\\u7ae0|\\u76d2\\u5b50|\\u7eb8\\u6761)[^" + sentenceEnd + "\\n]{0,50}(?:\\u8f7b\\u8f7b\\u6643\\u52a8|\\u5fae\\u5fae\\u53d1\\u5149|\\u5fae\\u5fae\\u98a4\\u52a8|\\u9759\\u9759\\u8eba\\u7740|\\u5b89\\u9759\\u5730\\u8eba)[^" + sentenceEnd + "\\n]{0,20}[" + sentenceEnd + "]?", "g"))) {
    pushHit(match[0], "object_description_template", "Object description follows a fixed shape/color/surface + slight movement template.", "Introduce the object through use, touch, weight, function, or plot effect.");
  }

  for (const match of compact.matchAll(new RegExp("(?:\\u5916\\u58f3|\\u6cd5\\u9635|\\u5bfc\\u7ba1|\\u6db2\\u4f53|\\u673a\\u68b0\\u81c2)[^" + sentenceEnd + "\\n]{0,80}(?:\\u5916\\u58f3|\\u6cd5\\u9635|\\u5bfc\\u7ba1|\\u6db2\\u4f53|\\u673a\\u68b0\\u81c2)[^" + sentenceEnd + "\\n]{0,80}[" + sentenceEnd + "]?", "g"))) {
    pushHit(match[0], "object_description_template", "Object details are being listed repeatedly instead of entering through use or reaction.", "Cut repeated exterior listing and let the object appear through touch, function, operation, or plot effect.");
  }

  for (const match of compact.matchAll(new RegExp("(?:\\u4f60\\u77e5\\u9053\\u5417|\\u4e5f\\u5c31\\u662f\\u8bf4|\\u6362\\u53e5\\u8bdd\\u8bf4|\\u8fd9\\u4e2a\\u4e16\\u754c|\\u7b49\\u7ea7\\u5206\\u4e3a|\\u539f\\u6765\\u5982\\u6b64)[^" + sentenceEnd + "\\n]{0,80}[" + sentenceEnd + "]?", "g"))) {
    pushHit(match[0], "dialogue_interaction", "Dialogue may be explaining setting like a manual.", "Use interruption, misunderstanding, pause, probing, joking, or reaction to carry the setting information.");
  }

  for (const match of compact.matchAll(new RegExp("(?:\\u8fd9\\u610f\\u5473\\u7740|\\u4ece\\u6b64\\u4e4b\\u540e|\\u547d\\u8fd0\\u5373\\u5c06|\\u6545\\u4e8b\\u624d\\u521a\\u521a\\u5f00\\u59cb|\\u672a\\u6765[^" + sentenceEnd + "\\n]{0,20}\\u7b49\\u5f85\\u7740)[^" + sentenceEnd + "\\n]{0,80}[" + sentenceEnd + "]?$", "gm"))) {
    pushHit(match[0], "ending_overextension", "Ending adds summary, elevation, or future preview beyond the supplied text.", "Do not add thematic closure, fate preview, or continuation beyond the user's text.");
  }

  const aiWords = ["\u6084\u7136", "\u5206\u660e", "\u4eff\u4f5b", "\u4f3c\u4e4e", "\u67d0\u79cd", "\u65e0\u58f0\u5730", "\u66f4\u6df1\u7684", "\u547d\u8fd0", "\u6d9f\u6f2a"];
  compact.split(new RegExp("(?<=[" + sentenceEnd + "])")).forEach((sentence) => {
    const hitCount = aiWords.filter((word) => sentence.includes(word)).length;
    if (hitCount >= 2) {
      pushHit(sentence, "ai_wording_template", "Multiple high-frequency AI-flavored words appear in one sentence.", "Reduce abstract words and use visible action, objects, sound, space, or reaction.");
    }
  });

  return hits;
}

function fillAnalysisPrompt(template: string, dialog: PolishDialogState, chapterTitle: string, sourceText: string, context: { outline: string; recent: string; styleProfile: string; aiPatterns: string }) {
  return template
    .replace("{{polish_goal}}", polishGoalLabel(dialog.goal))
    .replace("{{target_word_count}}", dialog.targetWordCount || "\u672a\u6307\u5b9a")
    .replace("{{chapter_title}}", chapterTitle)
    .replace("{{recent_context}}", context.recent || "?")
    .replace("{{outline_context}}", context.outline || "?")
    .replace("{{style_profile}}", context.styleProfile || "?")
    .replace("{{ai_pattern_memory}}", context.aiPatterns || "?")
    .replace("{{source_text}}", sourceText);
}

function fillPolishPrompt(template: string, dialog: PolishDialogState, chapterTitle: string, sourceText: string, context: { outline: string; recent: string; styleProfile: string; aiPatterns: string }, analysis?: PolishAnalysisPayload) {
  const preset = getPolishPreset(dialog.goal);
  return template
    .replace("{{polish_goal}}", preset.label)
    .replace("{{preset_instruction}}", preset.promptInstruction)
    .replace("{{preset_focus}}", preset.focus.join(" / "))
    .replace("{{preset_avoid}}", preset.avoid.join(" / "))
    .replace("{{custom_instruction}}", dialog.customInstruction)
    .replace("{{target_word_count}}", dialog.targetWordCount || "no limit")
    .replace("{{chapter_title}}", chapterTitle)
    .replace("{{recent_context}}", context.recent || "none")
    .replace("{{outline_context}}", context.outline || "none")
    .replace("{{style_profile}}", context.styleProfile || "none")
    .replace("{{ai_pattern_memory}}", context.aiPatterns || "none")
    .replace("{{analysis_result}}", analysis ? JSON.stringify(analysis, null, 2) : "none")
    .replace("{{source_text}}", sourceText);
}

function fillReviewPrompt(template: string, dialog: PolishDialogState, sourceText: string, polishedText: string, context: { outline: string; recent: string; styleProfile: string; aiPatterns: string }, providerName: RuntimeProviderName, analysis?: PolishAnalysisPayload, localHits: LocalAiPatternHit[] = []) {
  const preset = getPolishPreset(dialog.goal);
  return template
    .replace("{{provider_name}}", providerName)
    .replace("{{target_word_count}}", dialog.targetWordCount || "no limit")
    .replace("{{polish_goal}}", preset.label)
    .replace("{{preset_instruction}}", preset.promptInstruction)
    .replace("{{context}}", [context.recent, context.outline].filter(Boolean).join("\n\n") || "none")
    .replace("{{style_profile}}", context.styleProfile || "none")
    .replace("{{ai_pattern_memory}}", context.aiPatterns || "none")
    .replace("{{analysis_result}}", analysis ? JSON.stringify(analysis, null, 2) : "none")
    .replace("{{local_ai_pattern_hits}}", JSON.stringify(localHits, null, 2))
    .replace("{{source_text}}", sourceText)
    .replace("{{polished_text}}", polishedText);
}

function fillStylePolishPrompt(template: string, dialog: StylePolishDialogState, chapterTitle: string, sourceText: string, context: { outline: string; recent: string; styleProfile: string; aiPatterns: string }, analysis?: PolishAnalysisPayload) {
  const selectedQuotes = dialog.corpus.quotes.filter((quote) => dialog.selectedQuoteIds.has(quote.id));
  const selectedWorks = dialog.corpus.works.filter((work) => dialog.selectedWorkIds.has(work.id));
  return template
    .replace("{{scope}}", dialog.scope)
    .replace("{{target_word_count}}", dialog.targetWordCount || "no limit")
    .replace("{{style_intensity}}", styleIntensityLabel(dialog.intensity))
    .replace("{{style_tendency}}", styleTendencyLabel(dialog.tendency))
    .replace("{{custom_keywords}}", dialog.customKeywords)
    .replace("{{user_custom_prompt}}", dialog.customPrompt)
    .replace("{{current_chapter_title}}", chapterTitle)
    .replace("{{recent_three_chapters_context}}", context.recent || "none")
    .replace("{{protagonist_group}}", context.outline || "none")
    .replace("{{supporting_characters}}", context.outline || "none")
    .replace("{{main_plot}}", context.outline || "none")
    .replace("{{branch_plot}}", context.outline || "none")
    .replace("{{conflicts}}", context.outline || "none")
    .replace("{{writing_style_profile}}", dialog.useStyleProfile ? context.styleProfile || "none" : "disabled")
    .replace("{{selected_reference_quotes}}", selectedQuotes.map((quote) => `${quote.sourceTitle} / ${quote.author}: ${quote.originalText}\n${quote.modernExplanation}\n${quote.aiRewriteExample}`).join("\n\n") || "none")
    .replace("{{selected_corpus_works}}", selectedWorks.map((work) => `${work.title} / ${work.author}\n${work.copyrightStatus}\n${work.styleTags}\n${work.themeTags}\n${work.imageTags}\n${work.usageNote}`).join("\n\n") || "none")
    .replace("{{copyright_policy}}", "Use public-domain references only; do not quote or imitate copyrighted references.")
    .replace("{{ai_pattern_memory}}", context.aiPatterns || "none")
    .replace("{{analysis_result}}", analysis ? JSON.stringify(analysis, null, 2) : "none")
    .replace("{{original_text}}", sourceText);
}

function formatCorpusContext(dialog: StylePolishDialogState) {
  return [
    "可引用公版原句：",
    dialog.corpus.quotes.map((quote) => `- ${quote.sourceTitle} / ${quote.author}：${quote.originalText}；${quote.usageSuggestion}`).join("\n") || "无",
    "作品风格索引：",
    dialog.corpus.works.map((work) => `- ${work.title} / ${work.author}：${work.styleTags} ${work.themeTags} ${work.imageTags}；版权=${work.copyrightStatus}；${work.usageNote}`).join("\n") || "无"
  ].join("\n");
}

function extractLocalKeywords(value: string) {
  const dictionary = ["月", "红月", "雾", "钟声", "黄昏", "神明", "考试", "命运", "梦境", "血族", "夜晚", "孤独", "哥特", "宗教", "讽刺", "荒诞"];
  const found = dictionary.filter((item) => value.includes(item));
  return found.length > 0 ? found : value.split(/[\s,，。！？、]+/).filter((item) => item.length >= 2).slice(0, 8);
}

function styleIntensityLabel(value: StylePolishIntensity) {
  return { light: "轻度", medium: "中度", high: "高度" }[value];
}

function styleTendencyLabel(value: StylePolishTendency) {
  return {
    cold: "清冷",
    ornate: "华丽",
    poetic: "诗性",
    dark_humor: "黑色幽默",
    absurd: "荒诞",
    historical: "史诗感",
    gentle: "温柔",
    oppressive: "压抑",
    satirical: "讽刺",
    religious: "宗教感",
    gothic: "哥特感",
    custom: "自定义"
  }[value];
}

function polishGoalLabel(goal: PolishGoal) {
  return getPolishPreset(goal).label;
}

function defaultPolishStrategy(settings?: AISettings): PolishStrategy {
  const strategy = settings?.featureChapterPolish;
  if (strategy === "openai") return "openai";
  if (strategy === "deepseek") return "deepseek";
  const primary = settings?.primaryProvider ?? "deepseek";
  const review = settings?.reviewProvider ?? "openai";
  return primary === "openai" && review === "deepseek" ? "openai_deepseek" : "deepseek_openai";
}

function StylePolishModal({
  dialog,
  isPolishing,
  profiles,
  onCancel,
  onChange,
  onGenerateSuggestions,
  onRecommend,
  onSearch,
  onStart
}: {
  dialog: StylePolishDialogState;
  isPolishing: boolean;
  profiles: WritingStyleProfile[];
  onCancel: () => void;
  onChange: (next: StylePolishDialogState) => void;
  onGenerateSuggestions: () => void;
  onRecommend: () => void;
  onSearch: (query: string) => void;
  onStart: () => void;
}) {
  const toggleQuote = (id: string, checked: boolean) => {
    const selectedQuoteIds = new Set(dialog.selectedQuoteIds);
    if (checked) selectedQuoteIds.add(id); else selectedQuoteIds.delete(id);
    onChange({ ...dialog, selectedQuoteIds });
  };
  const toggleWork = (id: string, checked: boolean) => {
    const selectedWorkIds = new Set(dialog.selectedWorkIds);
    if (checked) selectedWorkIds.add(id); else selectedWorkIds.delete(id);
    onChange({ ...dialog, selectedWorkIds });
  };

  return (
    <div className="modal-backdrop">
      <section className="ai-polish-modal wide">
        <header><h2>风格化润色</h2><button onClick={onCancel} type="button">x</button></header>
        <p className="parse-limit-note">公共领域文本可作为原句参考；现代版权作品仅作风格、主题和意象参考。请勿直接复制受版权保护作品原文。</p>
        <div className="polish-grid">
          <label>润色范围<select value={dialog.scope} onChange={(event) => onChange({ ...dialog, scope: event.target.value as PolishScope })}><option value="selection">选中文本</option><option value="paragraph">当前段落</option><option value="chapter">当前章节全文</option></select></label>
          <label>目标字数<input value={dialog.targetWordCount} onChange={(event) => onChange({ ...dialog, targetWordCount: event.target.value })} placeholder="可为空" /></label>
          <label>风格化强度<select value={dialog.intensity} onChange={(event) => onChange({ ...dialog, intensity: event.target.value as StylePolishIntensity })}><option value="light">轻度</option><option value="medium">中度</option><option value="high">高度</option></select></label>
          <label>风格倾向<select value={dialog.tendency} onChange={(event) => onChange({ ...dialog, tendency: event.target.value as StylePolishTendency })}><option value="cold">清冷</option><option value="ornate">华丽</option><option value="poetic">诗性</option><option value="dark_humor">黑色幽默</option><option value="absurd">荒诞</option><option value="historical">史诗感</option><option value="gentle">温柔</option><option value="oppressive">压抑</option><option value="satirical">讽刺</option><option value="religious">宗教感</option><option value="gothic">哥特感</option><option value="custom">自定义</option></select></label>
          <label>模型策略<select value={dialog.strategy} onChange={(event) => onChange({ ...dialog, strategy: event.target.value as PolishStrategy })}><option value="deepseek">单 AI：DeepSeek</option><option value="openai">单 AI：OpenAI</option><option value="openai_deepseek">混合：OpenAI 写，DeepSeek 检</option><option value="deepseek_openai">混合：DeepSeek 写，OpenAI 检</option></select></label>
          <label>语言风格 Profile<select value={dialog.profileId} onChange={(event) => onChange({ ...dialog, profileId: event.target.value })}><option value="">不使用</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.profileName}</option>)}</select></label>
        </div>
        <label>自定义关键词<input value={dialog.customKeywords} onChange={(event) => onChange({ ...dialog, customKeywords: event.target.value })} placeholder="月亮、红月、雾、钟声、梦境..." /></label>
        <label>自定义要求<textarea value={dialog.customPrompt} onChange={(event) => onChange({ ...dialog, customPrompt: event.target.value })} /></label>
        <div className="context-options">
          <label><input checked={dialog.useCorpus} onChange={(event) => onChange({ ...dialog, useCorpus: event.target.checked })} type="checkbox" />使用文学参考库</label>
          <label><input checked={dialog.useStyleProfile} onChange={(event) => onChange({ ...dialog, useStyleProfile: event.target.checked })} type="checkbox" />使用语言风格 Profile</label>
        </div>
        <section className="review-box">
          <h3>文学参考库</h3>
          <div className="reference-search"><input value={dialog.corpusQuery} onChange={(event) => onChange({ ...dialog, corpusQuery: event.target.value })} placeholder="搜索作品、作者、风格标签、意象" /><button onClick={() => onSearch(dialog.corpusQuery)} type="button">搜索</button><button onClick={onRecommend} type="button">根据当前章节推荐</button><button onClick={onGenerateSuggestions} type="button">生成文学意象建议</button></div>
          <div className="corpus-columns">
            <div><h4>公版原句</h4>{dialog.corpus.quotes.map((quote) => <label key={quote.id}><input checked={dialog.selectedQuoteIds.has(quote.id)} onChange={(event) => toggleQuote(quote.id, event.target.checked)} type="checkbox" /><span><strong>{quote.originalText}</strong><small>{quote.sourceTitle} / {quote.author}：{quote.modernExplanation}</small><small>AI 原创化：{quote.aiRewriteExample}</small></span></label>)}</div>
            <div><h4>作品索引</h4>{dialog.corpus.works.map((work) => <label key={work.id}><input checked={dialog.selectedWorkIds.has(work.id)} onChange={(event) => toggleWork(work.id, event.target.checked)} type="checkbox" /><span><strong>{work.title}</strong><small>{work.author} | {work.copyrightStatus === "public_domain" ? "公版" : "仅风格参考，不提供原句"}</small><small>{work.styleTags} {work.themeTags} {work.imageTags}</small></span></label>)}</div>
          </div>
          {dialog.suggestions && <pre className="ai-preview-json">{JSON.stringify(dialog.suggestions, null, 2)}</pre>}
        </section>
        <footer><button className="ghost" onClick={onCancel} type="button">取消</button><button disabled={isPolishing} onClick={onStart} type="button">{isPolishing ? "生成中..." : "开始风格化润色"}</button></footer>
      </section>
    </div>
  );
}

function StyleLearnModal({
  chapters,
  dialog,
  isLearning,
  preview,
  onCancel,
  onChange,
  onSave,
  onStart
}: {
  chapters: Chapter[];
  dialog: StyleLearnDialogState;
  isLearning: boolean;
  preview?: WritingStyleProfilePayload;
  onCancel: () => void;
  onChange: (next: StyleLearnDialogState) => void;
  onSave: () => void;
  onStart: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="ai-polish-modal">
        <header><h2>学习本书语言风格</h2><button onClick={onCancel} type="button">x</button></header>
        <label>学习范围
          <select value={dialog.scope} onChange={(event) => onChange({ ...dialog, scope: event.target.value as StyleLearnScope })}>
            <option value="current">当前章节</option>
            <option value="recent3">最近 3 章</option>
            <option value="manual">手动选择章节</option>
            <option value="sample">全文抽样</option>
          </select>
        </label>
        <label>Profile 名称<input value={dialog.profileName} onChange={(event) => onChange({ ...dialog, profileName: event.target.value })} /></label>
        {dialog.scope === "manual" && (
          <div className="chapter-check-list">
            {chapters.map((chapter) => (
              <label key={chapter.id}><input checked={dialog.selectedChapterIds.has(chapter.id)} onChange={(event) => {
                const next = new Set(dialog.selectedChapterIds);
                if (event.target.checked) next.add(chapter.id); else next.delete(chapter.id);
                onChange({ ...dialog, selectedChapterIds: next });
              }} type="checkbox" />{chapter.title}</label>
            ))}
          </div>
        )}
        {preview && <pre className="ai-preview-json">{JSON.stringify(preview, null, 2)}</pre>}
        <footer>
          <button className="ghost" onClick={onCancel} type="button">取消</button>
          <button disabled={isLearning} onClick={onStart} type="button">{isLearning ? "学习中..." : "开始学习"}</button>
          {preview && <button onClick={onSave} type="button">保存 Profile</button>}
        </footer>
      </section>
    </div>
  );
}

function PolishModal({
  dialog,
  isPolishing,
  preview,
  corpusProfiles,
  profiles,
  onCancel,
  onChange,
  onCopy,
  onReplaceChapter,
  onReplaceSelection,
  onRevise,
  onSaveVersion,
  onStart,
  onUpdatePreview
}: {
  dialog: PolishDialogState;
  isPolishing: boolean;
  preview?: PolishPreviewState;
  corpusProfiles: CorpusStyleProfile[];
  profiles: WritingStyleProfile[];
  onCancel: () => void;
  onChange: (next: PolishDialogState) => void;
  onCopy: () => void;
  onReplaceChapter: () => void;
  onReplaceSelection: () => void;
  onRevise: () => void;
  onSaveVersion: () => void;
  onStart: () => void;
  onUpdatePreview: (next: PolishPreviewState) => void;
}) {
  const selectedPreset = getPolishPreset(dialog.goal);
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(false);
  const selectedSuggestionCount = preview?.selectedSuggestionIds.size ?? 0;
  const reviewSuggestionCount = (preview?.review?.suggestions.length ?? 0) + (preview?.localAiPatternHits.length ?? 0);
  return (
    <div className="modal-backdrop">
      <section className={`ai-polish-modal wide ${preview ? "polish-preview-dialog" : ""}`}>
        <header><h2>{"\u0041\u0049 \u6da6\u8272"}</h2><button onClick={onCancel} type="button">{"\u5173\u95ed"}</button></header>
        {!preview ? (
          <>
            <div className="polish-grid">
              <label>润色范围<select value={dialog.scope} onChange={(event) => onChange({ ...dialog, scope: event.target.value as PolishScope })}><option value="chapter">当前章节全文</option><option value="selection">选中文本</option><option value="paragraph">当前段落</option></select></label>
              <label>目标字数<input value={dialog.targetWordCount} onChange={(event) => onChange({ ...dialog, targetWordCount: event.target.value })} placeholder="可为空" /></label>
              <label>润色策略 preset<select value={dialog.goal} onChange={(event) => onChange({ ...dialog, goal: event.target.value as PolishGoal })}>{polishPresets.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></label>
              <label>模型策略<select value={dialog.strategy} onChange={(event) => onChange({ ...dialog, strategy: event.target.value as PolishStrategy })}><option value="deepseek">单 AI：DeepSeek</option><option value="openai">单 AI：OpenAI</option><option value="openai_deepseek">混合：OpenAI 写，DeepSeek 检</option><option value="deepseek_openai">混合：DeepSeek 写，OpenAI 检</option></select></label>
              <label>语言风格 Profile<select value={dialog.profileId} onChange={(event) => onChange({ ...dialog, profileId: event.target.value })}><option value="">不使用</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.profileName}</option>)}</select></label>
              <label>文风指纹库<select disabled={!dialog.useCorpusStyleProfile} value={dialog.corpusStyleProfileId} onChange={(event) => onChange({ ...dialog, corpusStyleProfileId: event.target.value })}><option value="">不使用</option>{corpusProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.profileName}</option>)}</select></label>
            </div>
            <section className="corpus-style-options">
              <label>
                <input
                  checked={dialog.useCorpusStyleProfile}
                  disabled={corpusProfiles.length === 0}
                  onChange={(event) =>
                    onChange({
                      ...dialog,
                      useCorpusStyleProfile: event.target.checked,
                      corpusStyleProfileId: event.target.checked ? dialog.corpusStyleProfileId || corpusProfiles[0]?.id || "" : ""
                    })
                  }
                  type="checkbox"
                />
                使用文风指纹库（优先于旧语言风格 Profile）
              </label>
              <div>
                {corpusStyleDefaultDimensions.map((dimension) => (
                  <label key={dimension}>
                    <input
                      checked={dialog.corpusStyleDimensionTypes.includes(dimension)}
                      disabled={!dialog.useCorpusStyleProfile}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? Array.from(new Set([...dialog.corpusStyleDimensionTypes, dimension]))
                          : dialog.corpusStyleDimensionTypes.filter((item) => item !== dimension);
                        onChange({ ...dialog, corpusStyleDimensionTypes: next });
                      }}
                      type="checkbox"
                    />
                    {corpusStyleDimensionLabel(dimension)}
                  </label>
                ))}
              </div>
            </section>
            <label>自定义要求<textarea value={dialog.customInstruction} onChange={(event) => onChange({ ...dialog, customInstruction: event.target.value })} /></label>
            <section className="polish-preset-card">
              <strong>当前选择：{selectedPreset.label}</strong>
              <p>{selectedPreset.description}</p>
              <div>
                <span>重点：{selectedPreset.focus.join(" / ")}</span>
                <span>避免：{selectedPreset.avoid.join(" / ")}</span>
              </div>
            </section>
            <div className="context-options">
              {(["includeChapter", "includeRecent", "includeCharacters", "includeOutline", "includeStyle"] as const).map((key) => <label key={key}><input checked={dialog[key]} onChange={(event) => onChange({ ...dialog, [key]: event.target.checked })} type="checkbox" />{contextLabel(key)}</label>)}
            </div>
            <p className="parse-limit-note">{dialog.strategy.includes("openai") ? "本次将使用 OpenAI / GPT API，成本高于 DeepSeek。" : "本次使用 DeepSeek。"} {dialog.strategy.includes("_") ? "混合 AI 会进行初稿和互检，可能产生 2-3 次调用。" : ""}</p>
            <footer><button className="ghost" onClick={onCancel} type="button">取消</button><button disabled={isPolishing} onClick={onStart} type="button">{isPolishing ? "润色中..." : "开始润色"}</button></footer>
          </>
        ) : (
          <>
            <div className="polish-preview-meta">
              <div className="preview-mode-tabs" aria-label="polish preview view mode">
                {(["side_by_side", "diff", "polished"] as const).map((mode) => (
                  <button
                    className={(preview.viewMode ?? "side_by_side") === mode ? "active" : ""}
                    key={mode}
                    onClick={() => onUpdatePreview({ ...preview, viewMode: mode })}
                    type="button"
                  >
                    {mode === "side_by_side" ? "\u5de6\u53f3\u5bf9\u7167" : mode === "diff" ? "\u5355\u680f\u5dee\u5f02" : "\u53ea\u770b\u6da6\u8272\u540e"}
                  </button>
                ))}
              </div>
              <div className="polish-stats">
                <span>{"\u539f\u6587\u5b57\u6570\uff1a"}{countWords(preview.originalText).toLocaleString()}</span>
                <span>{"\u6da6\u8272\u540e\uff1a"}{countWords(preview.polishedText).toLocaleString()}</span>
                <span>{"\u53d8\u5316\uff1a"}{(countWords(preview.polishedText) - countWords(preview.originalText)).toLocaleString()}</span>
                {dialog.targetWordCount && <span>{"\u76ee\u6807\uff1a"}{dialog.targetWordCount}</span>}
              </div>
              {preview.diffSummary && preview.diffSummary.changeRatio > 0.7 && (
                <p className="diff-warning">{"\u672c\u6b21\u6da6\u8272\u6539\u52a8\u8303\u56f4\u8fc7\u5927\uff0c\u53ef\u80fd\u662f AI \u91cd\u5199\u4e86\u5168\u6587\uff0c\u800c\u4e0d\u662f\u5c40\u90e8\u6da6\u8272\u3002\u5efa\u8bae\u6539\u7528\u8f7b\u5ea6\u6da6\u8272\u6216\u51cf\u5c11\u4fee\u6539\u76ee\u6807\u3002"}</p>
              )}
            </div>

            <div className="polish-preview-main">
              <section className="polish-text-area">
                {(preview.viewMode ?? "side_by_side") === "side_by_side" && (
                  <div className="text-compare">
                    <section className="compare-pane">
                      <div className="compare-pane-header">{"\u539f\u6587"}</div>
                      <pre className="compare-pane-body">{preview.originalText}</pre>
                    </section>
                    <section className="compare-pane">
                      <div className="compare-pane-header">{"\u6da6\u8272\u540e"}</div>
                      <pre className="compare-pane-body">{renderHighlightedText(preview.polishedText, preview.highlightQuote)}</pre>
                    </section>
                  </div>
                )}
                {preview.viewMode === "diff" && (
                  <div className="diff-view single-diff">{renderSimpleDiff(preview.originalText, preview.polishedText)}</div>
                )}
                {preview.viewMode === "polished" && (
                  <section className="polished-highlight-view">
                    <div className="compare-pane-header">{"\u6da6\u8272\u540e"}</div>
                    <pre>{renderHighlightedText(preview.polishedText, preview.highlightQuote)}</pre>
                  </section>
                )}
              </section>

              <section className={`polish-analysis-panel ${isAnalysisExpanded ? "expanded" : ""}`}>
                <header>
                  <h3>{"AI \u5206\u6790\u8fc7\u7a0b"}</h3>
                  <div className="analysis-header-actions">
                    {preview.review && (
                      <div className="analysis-score-badges">
                        <span>{"\u603b\u8bc4 "}{preview.review.overall_score}</span>
                        <span>{"AI \u5473 "}{preview.review.ai_taste_score}</span>
                        <span>{"\u5efa\u8bae "}{reviewSuggestionCount}{" \u6761"}</span>
                        <span>{"\u5df2\u9009 "}{selectedSuggestionCount}{" \u6761"}</span>
                      </div>
                    )}
                    <button className="ghost" onClick={() => setIsAnalysisExpanded((value) => !value)} type="button">
                      {isAnalysisExpanded ? "\u6536\u8d77\u5206\u6790" : "\u5c55\u5f00\u5206\u6790"}
                    </button>
                  </div>
                </header>
                {preview.analysis?.overall_assessment && <p className="analysis-summary">{preview.analysis.overall_assessment}</p>}
                {preview.reasoningItems && preview.reasoningItems.length > 0 && (
                  <details className="reasoning-panel">
                    <summary>{"\u6a21\u578b\u601d\u8003\u8fc7\u7a0b"}</summary>
                    <div>
                      {preview.reasoningItems.map((item) => (
                        <section key={item.title}>
                          <strong>{item.title}</strong>
                          <pre>{item.content}</pre>
                        </section>
                      ))}
                    </div>
                  </details>
                )}
                <div className="analysis-scroll">
                  {preview.analysis && (
                    <>
                      <h4 className="analysis-group-title">{"\u6587\u672c\u95ee\u9898\u5206\u6790"}</h4>
                      <div className="analysis-issue-list compact">
                        {preview.analysis.issues.map((issue) => (
                          <article className="analysis-card" key={issue.id}>
                            <label className="analysis-card-top">
                              <input
                                checked={preview.selectedAnalysisIssueIds.has(issue.id)}
                                onChange={(event) => {
                                  const next = new Set(preview.selectedAnalysisIssueIds);
                                  if (event.target.checked) next.add(issue.id); else next.delete(issue.id);
                                  onUpdatePreview({ ...preview, selectedAnalysisIssueIds: next });
                                }}
                                type="checkbox"
                              />
                              <strong>{issue.type} · {polishSeverityLabel(issue.severity)}</strong>
                            </label>
                            {issue.original_quote && <div className="analysis-field"><span>{"\u539f\u53e5"}</span><p>{issue.original_quote}</p></div>}
                            <div className="analysis-field"><span>{"\u95ee\u9898"}</span><p>{issue.problem}</p></div>
                            {issue.rewrite_direction && <div className="analysis-field"><span>{"\u4fee\u6539\u65b9\u5411"}</span><p>{issue.rewrite_direction}</p></div>}
                          </article>
                        ))}
                      </div>
                      <h4 className="analysis-group-title">{"\u6da6\u8272\u7b56\u7565"}</h4>
                      <div className="analysis-strategy compact">
                        <strong>{"\u6da6\u8272\u7b56\u7565\uff1a"}{preview.analysis.polish_strategy.main_goal}</strong>
                        <span>{"\u4fdd\u7559\uff1a"}{preview.analysis.polish_strategy.keep.join(" / ") || "\u65e0"}</span>
                        <span>{"\u907f\u514d\uff1a"}{preview.analysis.polish_strategy.avoid.join(" / ") || "\u65e0"}</span>
                        <span>{"\u91cd\u70b9\uff1a"}{preview.analysis.polish_strategy.focus.join(" / ") || "\u65e0"}</span>
                      </div>
                    </>
                  )}

                  {preview.review && (
                    <div className="review-box compact">
                      <h4 className="analysis-group-title">{"AI \u4e92\u68c0\u5efa\u8bae"}</h4>
                      {preview.review.suggestions.map((suggestion) => (
                        <article className="analysis-card" key={suggestion.id}>
                          <label className="analysis-card-top">
                            <input
                              checked={preview.selectedSuggestionIds.has(suggestion.id)}
                              onChange={(event) => {
                                const next = new Set(preview.selectedSuggestionIds);
                                if (event.target.checked) next.add(suggestion.id); else next.delete(suggestion.id);
                                onUpdatePreview({ ...preview, selectedSuggestionIds: next });
                              }}
                              type="checkbox"
                            />
                            <strong>{polishSuggestionTypeLabel(suggestion.type)} · {polishSeverityLabel(suggestion.severity)}</strong>
                          </label>
                          {suggestion.original_quote && <div className="analysis-field"><span>{"\u539f\u53e5"}</span><p>{suggestion.original_quote}</p></div>}
                          <div className="analysis-field"><span>{"\u95ee\u9898"}</span><p>{suggestion.content}</p></div>
                          {suggestion.recommended_prompt_addition && <div className="analysis-field compact-lines"><span>{"\u4fee\u6539\u65b9\u5411"}</span><p>{suggestion.recommended_prompt_addition}</p></div>}
                        </article>
                      ))}
                      {preview.localAiPatternHits.length > 0 && (
                        <div className="evidence-list">
                          <h4 className="analysis-group-title">{"\u672c\u5730\u89c4\u5219\u9884\u68c0\u547d\u4e2d"}</h4>
                          {preview.localAiPatternHits.map((hit, index) => (
                            <article className="analysis-card" key={localHitId(index)}>
                              <label className="analysis-card-top">
                                <input
                                  checked={preview.selectedSuggestionIds.has(localHitId(index))}
                                  onChange={(event) => {
                                    const next = new Set(preview.selectedSuggestionIds);
                                    if (event.target.checked) next.add(localHitId(index)); else next.delete(localHitId(index));
                                    onUpdatePreview({ ...preview, selectedSuggestionIds: next, highlightQuote: hit.quote, viewMode: "polished" });
                                  }}
                                  type="checkbox"
                                />
                                <strong>{aiPatternTypeLabel(hit.pattern_type)} · {"\u672c\u5730\u89c4\u5219"}</strong>
                              </label>
                              <div className="analysis-field"><span>{"\u539f\u53e5"}</span><p>{hit.quote}</p></div>
                              <div className="analysis-field"><span>{"\u95ee\u9898"}</span><p>{hit.reason}</p></div>
                              <div className="analysis-field compact-lines"><span>{"\u4fee\u6539\u65b9\u5411"}</span><p>{hit.rewrite_advice}</p></div>
                            </article>
                          ))}
                        </div>
                      )}
                      {preview.review.ai_taste_evidence && preview.review.ai_taste_evidence.length > 0 && (
                        <div className="evidence-list">
                          <h4>{"AI \u4e92\u68c0\u8865\u5145\u5224\u65ad"}</h4>
                          {preview.review.ai_taste_evidence.map((evidence, index) => (
                            <button
                              key={evidence.id || evidence.quote + "-" + index}
                              onClick={() => onUpdatePreview({ ...preview, highlightQuote: evidence.quote, viewMode: "polished" })}
                              type="button"
                            >
                              {evidence.quote} - {evidence.reason}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {preview.review && (
                  <div className="review-revision-box">
                    <textarea value={preview.manualRevisionInstruction} onChange={(event) => onUpdatePreview({ ...preview, manualRevisionInstruction: event.target.value })} placeholder={"\u989d\u5916\u4e8c\u6b21\u6da6\u8272\u8981\u6c42"} />
                    <button disabled={isPolishing} onClick={onRevise} type="button">{"\u6309\u6240\u9009\u5efa\u8bae\u4e8c\u6b21\u6da6\u8272"}</button>
                  </div>
                )}
              </section>
            </div>

            <footer className="polish-preview-footer">
              <button className="ghost" onClick={onCancel} type="button">{"\u53d6\u6d88"}</button>
              <div>
                <button onClick={onCopy} type="button">{"\u590d\u5236\u6da6\u8272\u7ed3\u679c"}</button>
                <button onClick={onReplaceSelection} type="button">{"\u66ff\u6362\u9009\u4e2d/\u8303\u56f4"}</button>
                <button onClick={onReplaceChapter} type="button">{"\u66ff\u6362\u5f53\u524d\u7ae0\u8282"}</button>
                <button onClick={onSaveVersion} type="button">{"\u4fdd\u5b58\u4e3a\u65b0\u7248\u672c"}</button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

function renderSimpleDiff(originalText: string, polishedText: string) {
  const parts = diffNovelText(originalText, polishedText);
  return (
    <pre>
      {parts.map((part, index) => {
        if (part.type === "equal") return <span key={index}>{part.value}</span>;
        if (part.type === "remove") return <del className="diff-deleted" key={index}>{part.value}</del>;
        return <ins className="diff-added" key={index}>{part.value}</ins>;
      })}
    </pre>
  );
}

function renderHighlightedText(text: string, quote?: string) {
  if (!quote) return text;
  const index = text.indexOf(quote);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="diff-highlight">{quote}</mark>
      {text.slice(index + quote.length)}
    </>
  );
}

function summarizeDiff(originalText: string, polishedText: string): DiffSummary {
  const parts = diffNovelText(originalText, polishedText);
  const summary = parts.reduce(
    (total, part) => {
      const length = countWords(part.value) || part.value.length;
      if (part.type === "equal") total.unchanged += length;
      if (part.type === "add") total.added += length;
      if (part.type === "remove") total.removed += length;
      return total;
    },
    { added: 0, removed: 0, unchanged: 0, changeRatio: 0 }
  );
  const base = Math.max(summary.unchanged + summary.removed, summary.unchanged + summary.added, 1);
  summary.changeRatio = Math.min(1, (summary.added + summary.removed) / base);
  return summary;
}

type DiffPart = { type: "equal" | "add" | "remove"; value: string };

function diffNovelText(originalText: string, polishedText: string): DiffPart[] {
  const original = normalizeForDiff(originalText);
  const polished = normalizeForDiff(polishedText);
  if (original === polished) return [{ type: "equal", value: polishedText }];
  if (original.length * polished.length > 3_000_000) {
    return paragraphMatchedDiff(originalText, polishedText);
  }
  return charLcsDiff(originalText, polishedText);
}

function normalizeForDiff(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
}

function charLcsDiff(a: string, b: string): DiffPart[] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint16Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] = a[i] === b[j] ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  const push = (type: DiffPart["type"], value: string) => {
    if (!value) return;
    const last = parts[parts.length - 1];
    if (last?.type === type) last.value += value;
    else parts.push({ type, value });
  };
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("equal", a[i]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      push("remove", a[i]);
      i += 1;
    } else {
      push("add", b[j]);
      j += 1;
    }
  }
  while (i < a.length) push("remove", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return parts;
}

function paragraphMatchedDiff(originalText: string, polishedText: string): DiffPart[] {
  const originalParagraphs = splitParagraphsForDiff(originalText);
  const polishedParagraphs = splitParagraphsForDiff(polishedText);
  const parts: DiffPart[] = [];
  const usedPolished = new Set<number>();
  let searchFrom = 0;

  const push = (type: DiffPart["type"], value: string) => {
    if (!value) return;
    const last = parts[parts.length - 1];
    if (last?.type === type) last.value += value;
    else parts.push({ type, value });
  };

  for (const original of originalParagraphs) {
    let bestIndex = -1;
    let bestScore = 0;
    const maxLookahead = Math.min(polishedParagraphs.length, searchFrom + 8);
    for (let index = searchFrom; index < maxLookahead; index += 1) {
      if (usedPolished.has(index)) continue;
      const score = paragraphSimilarity(original.text, polishedParagraphs[index].text);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex >= 0 && bestScore >= 0.18) {
      for (let index = searchFrom; index < bestIndex; index += 1) {
        if (!usedPolished.has(index)) push("add", polishedParagraphs[index].raw);
      }
      charLcsDiff(original.raw, polishedParagraphs[bestIndex].raw).forEach((part) => push(part.type, part.value));
      usedPolished.add(bestIndex);
      searchFrom = bestIndex + 1;
    } else {
      push("remove", original.raw);
    }
  }

  for (let index = searchFrom; index < polishedParagraphs.length; index += 1) {
    if (!usedPolished.has(index)) push("add", polishedParagraphs[index].raw);
  }

  return parts;
}

function splitParagraphsForDiff(text: string) {
  const normalized = text.replace(/\r\n/g, "\n");
  const matches = normalized.match(/[^\n]*(?:\n+|$)/g) ?? [];
  return matches
    .filter((item) => item.length > 0)
    .map((raw) => ({ raw, text: raw.trim() }));
}

function paragraphSimilarity(a: string, b: string) {
  const left = normalizeForDiff(a).replace(/\s+/g, "");
  const right = normalizeForDiff(b).replace(/\s+/g, "");
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftSet = new Set(Array.from(left));
  const rightSet = new Set(Array.from(right));
  let overlap = 0;
  leftSet.forEach((char) => {
    if (rightSet.has(char)) overlap += 1;
  });
  const charScore = overlap / Math.max(leftSet.size, rightSet.size, 1);
  const prefixLength = commonPrefixLength(left, right);
  const prefixScore = Math.min(prefixLength / Math.min(left.length, right.length, 1), 1);
  const lengthScore = Math.min(left.length, right.length) / Math.max(left.length, right.length);
  return charScore * 0.65 + prefixScore * 0.2 + lengthScore * 0.15;
}

function commonPrefixLength(a: string, b: string) {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index += 1;
  return index;
}

function FullTextDetectionModal({
  payload,
  onClose
}: {
  payload: FullTextDetectionResultPayload;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="summary-preview-modal full-text-detection-modal">
        <header>
          <h2>AI 全文检测报告</h2>
          <button className="ghost" onClick={onClose} type="button">
            关闭
          </button>
        </header>
        <section>
          <h3>总体风险：{detectionRiskLabel(payload.risk_level)}</h3>
          <p>{payload.overall_summary || "未发现明显整体问题。"}</p>
        </section>
        {payload.global_recommendations.length > 0 && (
          <section>
            <h3>整体建议</h3>
            <ul>
              {payload.global_recommendations.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3>问题列表</h3>
          {payload.suggestions.length === 0 ? (
            <p>没有检测到明显问题。</p>
          ) : (
            <div className="detection-list">
              {payload.suggestions.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.issue || item.type}</strong>
                    <span>{detectionSeverityLabel(item.severity)} · {item.chapter_title || "未标注章节"}</span>
                  </div>
                  {item.excerpt && <blockquote>{item.excerpt}</blockquote>}
                  {item.reason && <p>原因：{item.reason}</p>}
                  {item.suggestion && <p>建议：{item.suggestion}</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function detectionRiskLabel(value: FullTextDetectionResultPayload["risk_level"]) {
  return { low: "低", medium: "中", high: "高" }[value];
}

function detectionSeverityLabel(value: FullTextDetectionResultPayload["suggestions"][number]["severity"]) {
  return { low: "低风险", medium: "中风险", high: "高风险" }[value];
}

function contextLabel(key: keyof Pick<PolishDialogState, "includeChapter" | "includeRecent" | "includeCharacters" | "includeOutline" | "includeStyle">) {
  return {
    includeChapter: "读取当前章节信息",
    includeRecent: "读取最近前三章",
    includeCharacters: "读取人物性格",
    includeOutline: "读取主线/支线走向",
    includeStyle: "读取语言风格 Profile"
  }[key];
}

function polishSuggestionTypeLabel(type: PolishReviewResultPayload["suggestions"][number]["type"]) {
  const labels: Partial<Record<PolishReviewResultPayload["suggestions"][number]["type"], string>> = {
    style: "风格",
    character: "人物",
    plot: "剧情",
    wording: "用词",
    pacing: "节奏",
    ai_taste: "AI 味",
    length: "长度",
    structure: "结构",
    concrete_detail: "具体细节",
    plain_description: "白描不足"
  };
  return labels[type] ?? aiPatternTypeLabel(type);
}

function polishSeverityLabel(severity: PolishReviewResultPayload["suggestions"][number]["severity"]) {
  return { low: "低", medium: "中", high: "高" }[severity];
}
