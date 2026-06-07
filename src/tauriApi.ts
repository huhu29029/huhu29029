import { invoke } from "@tauri-apps/api/core";
import type {
  Chapter,
  ChapterAICacheEntry,
  CorpusStyleProfile,
  CorpusStyleProfileState,
  AISettings,
  AIPatternMemory,
  AIUsageLogInput,
  AITask,
  CreateProjectInput,
  EditorState,
  ImportChapterDraft,
  MemoryLibraryStats,
  OutlineMindEdge,
  OutlineMindNode,
  OutlineNodeType,
  OutlineSectionType,
  OutlineTextSection,
  OutlineState,
  Project,
  ReviewPatternInput,
  SaveCorpusStyleProfileInput,
  SaveWritingStyleProfileInput,
  SaveAIPatternMemoryInput,
  StyleCorpusSearchResult,
  SaveStyleRetrievalSnippetInput,
  StyleRetrievalSnippet,
  UpdateProjectInput,
  Volume,
  WritingStyleProfile
} from "./types/domain";
import type { ExportVolumeDraft } from "./utils/novelText";

type SavedChapter = {
  id: string;
  wordCount: number;
  updatedAt: string;
};

export function listProjects() {
  return invoke<Project[]>("list_projects");
}

export function createProject(input: CreateProjectInput) {
  return invoke<Project>("create_project", { input });
}

export function updateProject(projectId: string, input: UpdateProjectInput) {
  return invoke<Project>("update_project", { projectId, input });
}

export function deleteProject(projectId: string) {
  return invoke<void>("delete_project", { projectId });
}

export function readImageDataUrl(path: string) {
  return invoke<string>("read_image_data_url", { path });
}

export function getAISettings() {
  return invoke<AISettings>("get_ai_settings");
}

export function saveAISettings(settings: AISettings) {
  return invoke<AISettings>("save_ai_settings", { settings });
}

export function readPromptFile(name: string) {
  return invoke<string>("read_prompt_file", { name });
}

export function saveAIDebugLog(content: string) {
  return invoke<string>("save_ai_debug_log", { content });
}

export function createAITask(projectId: string | undefined, taskType: string, inputText: string) {
  return invoke<AITask>("create_ai_task", { projectId, taskType, inputText });
}

export function finishAITask(taskId: string, status: string, outputText: string) {
  return invoke<AITask>("finish_ai_task", { taskId, status, outputText });
}

export function logAIUsage(input: AIUsageLogInput) {
  return invoke<void>("log_ai_usage", { input });
}

export function getChapterAICache(
  projectId: string,
  chapterId: string,
  contentHash: string,
  model: string,
  promptVersion: string,
  analysisMode: "simple" | "detailed"
) {
  return invoke<ChapterAICacheEntry | null>("get_chapter_ai_cache", { projectId, chapterId, contentHash, model, promptVersion, analysisMode });
}

export function saveChapterAICache(
  projectId: string,
  chapterId: string,
  contentHash: string,
  model: string,
  promptVersion: string,
  analysisMode: "simple" | "detailed",
  summaryJson: string
) {
  return invoke<ChapterAICacheEntry>("save_chapter_ai_cache", { projectId, chapterId, contentHash, model, promptVersion, analysisMode, summaryJson });
}

export function saveChapterSummary(chapterId: string, summaryText: string) {
  return invoke<void>("save_chapter_summary", { chapterId, summaryText });
}

export function listWritingStyleProfiles(projectId: string) {
  return invoke<WritingStyleProfile[]>("list_writing_style_profiles", { projectId });
}

export function saveWritingStyleProfile(input: SaveWritingStyleProfileInput) {
  return invoke<WritingStyleProfile>("save_writing_style_profile", { input });
}

export function listCorpusStyleProfiles(projectId: string) {
  return invoke<CorpusStyleProfile[]>("list_corpus_style_profiles", { projectId });
}

export function getCorpusStyleProfileState(profileId: string) {
  return invoke<CorpusStyleProfileState>("get_corpus_style_profile_state", { profileId });
}

export function deleteCorpusStyleProfile(profileId: string) {
  return invoke<void>("delete_corpus_style_profile", { profileId });
}

export function saveCorpusStyleProfile(input: SaveCorpusStyleProfileInput) {
  return invoke<CorpusStyleProfileState>("save_corpus_style_profile", { input });
}

export function replaceStyleRetrievalSnippets(projectId: string, snippets: SaveStyleRetrievalSnippetInput[]) {
  return invoke<StyleRetrievalSnippet[]>("replace_style_retrieval_snippets", { projectId, snippets });
}

export function listStyleRetrievalSnippets(projectId: string) {
  return invoke<StyleRetrievalSnippet[]>("list_style_retrieval_snippets", { projectId });
}

export function saveChapterVersion(chapterId: string, versionType: "original" | "ai_polished" | "manual_backup", content: string, note?: string) {
  return invoke<void>("save_chapter_version", { chapterId, versionType, content, note: note ?? null });
}

export function searchStyleCorpus(query: string) {
  return invoke<StyleCorpusSearchResult>("search_style_corpus", { query });
}

export function recommendStyleCorpus(keywords: string[]) {
  return invoke<StyleCorpusSearchResult>("recommend_style_corpus", { keywords });
}

export function getMemoryLibraryStats(projectId: string) {
  return invoke<MemoryLibraryStats>("get_memory_library_stats", { projectId });
}

export function clearOutlineMemory(projectId: string) {
  return invoke<void>("clear_outline_memory", { projectId });
}

export function clearWritingStyleMemory(projectId: string) {
  return invoke<void>("clear_writing_style_memory", { projectId });
}

export function listAIPatternMemory(projectId: string) {
  return invoke<AIPatternMemory[]>("list_ai_pattern_memory", { projectId });
}

export function saveAIPatternMemory(input: SaveAIPatternMemoryInput) {
  return invoke<AIPatternMemory>("save_ai_pattern_memory", { input });
}

export function setAIPatternActive(patternId: string, isActive: boolean) {
  return invoke<AIPatternMemory>("set_ai_pattern_active", { patternId, isActive });
}

export function deleteAIPatternMemory(patternId: string) {
  return invoke<void>("delete_ai_pattern_memory", { patternId });
}

export function clearAIPatternMemory(projectId: string, includeBuiltin: boolean) {
  return invoke<void>("clear_ai_pattern_memory", { projectId, includeBuiltin });
}

export function resetBuiltinAIPatterns(projectId: string) {
  return invoke<AIPatternMemory[]>("reset_builtin_ai_patterns", { projectId });
}

export function upsertAIPatternsFromReview(projectId: string, patterns: ReviewPatternInput[]) {
  return invoke<AIPatternMemory[]>("upsert_ai_patterns_from_review", { projectId, patterns });
}

export function getEditorState(projectId: string) {
  return invoke<EditorState>("get_editor_state", { projectId });
}

export function getOutlineState(projectId: string) {
  return invoke<OutlineState>("get_outline_state", { projectId });
}

export function saveOutlineTextSection(projectId: string, sectionType: OutlineSectionType, content: string) {
  return invoke<OutlineTextSection>("save_outline_text_section", { projectId, sectionType, content });
}

export function createOutlineMindNode(
  projectId: string,
  nodeType: OutlineNodeType,
  title: string,
  description: string,
  x: number,
  y: number
) {
  return invoke<OutlineMindNode>("create_outline_mind_node", { projectId, nodeType, title, description, x, y });
}

export function updateOutlineMindNode(node: OutlineMindNode) {
  return invoke<OutlineMindNode>("update_outline_mind_node", {
    nodeId: node.id,
    nodeType: node.nodeType,
    title: node.title,
    description: node.description,
    x: node.x,
    y: node.y
  });
}

export function createOutlineMindEdge(projectId: string, sourceNodeId: string, targetNodeId: string) {
  return invoke<OutlineMindEdge>("create_outline_mind_edge", { projectId, sourceNodeId, targetNodeId });
}

export function updateOutlineMindEdge(edge: OutlineMindEdge) {
  return invoke<OutlineMindEdge>("update_outline_mind_edge", {
    edgeId: edge.id,
    edgeType: edge.edgeType,
    label: edge.label ?? null
  });
}

export function deleteOutlineMindEdge(edgeId: string) {
  return invoke<void>("delete_outline_mind_edge", { edgeId });
}

export function deleteOutlineMindNode(nodeId: string) {
  return invoke<void>("delete_outline_mind_node", { nodeId });
}

export function clearOutlineMindMap(projectId: string) {
  return invoke<void>("clear_outline_mind_map", { projectId });
}

export function createVolume(projectId: string) {
  return invoke<Volume>("create_volume", { projectId });
}

export function createChapter(projectId: string, volumeId: string) {
  return invoke<Chapter>("create_chapter", { projectId, volumeId });
}

export function renameVolume(volumeId: string, title: string) {
  return invoke<Volume>("rename_volume", { volumeId, title });
}

export function renameChapter(chapterId: string, title: string) {
  return invoke<Chapter>("rename_chapter", { chapterId, title });
}

export function saveChapterContent(chapterId: string, content: string, wordCount: number) {
  return invoke<SavedChapter>("save_chapter_content", { chapterId, content, wordCount });
}

export function deleteSelectedItems(projectId: string, volumeIds: string[], chapterIds: string[]) {
  return invoke<EditorState>("delete_selected_items", { projectId, volumeIds, chapterIds });
}

export function readTextFile(path: string) {
  return invoke<string>("read_text_file", { path });
}

export function writeTextFile(path: string, content: string) {
  return invoke<void>("write_text_file", { path, content });
}

export function writeBinaryFile(path: string, bytes: number[]) {
  return invoke<void>("write_binary_file", { path, bytes });
}

export function readDocxFile(path: string) {
  return invoke<string[]>("read_docx_file", { path });
}

export function writeDocxFile(path: string, volumes: ExportVolumeDraft[]) {
  return invoke<void>("write_docx_file", { path, volumes });
}

export function importChapters(projectId: string, volumeId: string, chapters: ImportChapterDraft[]) {
  return invoke<EditorState>("import_chapters", { projectId, volumeId, chapters });
}

export function createImportVolume(projectId: string) {
  return invoke<Volume>("create_import_volume", { projectId });
}

export function createVolumeWithTitle(projectId: string, title: string) {
  return invoke<Volume>("create_volume_with_title", { projectId, title });
}
