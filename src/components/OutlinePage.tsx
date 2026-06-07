import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { MockProvider } from "../ai/MockProvider";
import { createLLMProvider } from "../ai/providerFactory";
import {
  normalizeStage1Result,
  parseFinalKnowledgeBaseJson,
  parseMindmapGenerationJson,
  parseRefineOutlineSectionJson,
  parseSimpleChunkOutlineJson,
  parseStage1PlotJson,
  parseStage3CharacterDetailsJson,
  type FinalKnowledgeBasePayload,
  type MindmapGenerationPayload,
  type RefineOutlineSectionResultPayload,
  type SimpleChunkOutlinePayload,
  type Stage1PlotPayload,
  type Stage3CharacterDetailsPayload
} from "../ai/schemas";
import type { LLMProvider } from "../ai/types";
import {
  clearOutlineMindMap,
  createAITask,
  createOutlineMindEdge,
  createOutlineMindNode,
  deleteOutlineMindEdge,
  deleteOutlineMindNode,
  finishAITask,
  getChapterAICache,
  getAISettings,
  getOutlineState,
  logAIUsage,
  readPromptFile,
  saveAIDebugLog,
  saveChapterAICache,
  saveOutlineTextSection,
  updateOutlineMindEdge,
  updateOutlineMindNode,
  writeBinaryFile
} from "../tauriApi";
import type {
  Chapter,
  OutlineMindEdge,
  OutlineMindNode,
  OutlineNodeType,
  OutlineSectionType,
  OutlineState,
  AIProviderStrategy,
  AISettings,
  Project,
  Volume
} from "../types/domain";
import { MindMapPanel } from "./MindMapPanel";
import { OutlineTextPanel } from "./OutlineTextPanel";
import { outlineTabs } from "./OutlineTabs";
import { ParseSourceModal, type ParseStartPayload } from "./ParseSourceModal";

type OutlinePageProps = {
  chapters: Chapter[];
  currentChapterId?: string;
  project: Project;
  volumes: Volume[];
};

type ParseProgress = {
  status: "cache" | "chunk" | "reduce" | "final" | "writing" | "calling" | "validating" | "completed" | "failed";
  currentBatch: number;
  totalBatches: number;
  chapterTitles: string[];
  error?: string;
  analysisMode?: "simple" | "detailed";
  aiCallCount?: number;
  cacheHitCount?: number;
  completedChunks?: number;
  concurrency?: number;
  failedChunks?: number;
  stage?: string;
  tokenCount?: number;
};

type AIDebugResult = {
  normalized?: unknown;
  prompt: string;
  rawResponse: string;
  schemaResult: string;
  stageName: string;
};

type MindMapGenerateMode = "rough" | "detailed";
type MindMapGenerateMethod = "ai" | "local";
type MindMapGenerateSource = "world" | "main_characters" | "roles" | "main_plot" | "branch_plot" | "conflicts" | "foreshadowing";
type MindMapGenerateStrategy = "append" | "replace";

type MindMapGenerateOptions = {
  method: MindMapGenerateMethod;
  mode: MindMapGenerateMode;
  sources: MindMapGenerateSource[];
  strategy: MindMapGenerateStrategy;
};

type MindMapGenerateProgress = {
  method?: MindMapGenerateMethod;
  mode: MindMapGenerateMode;
  percent: number;
  step: string;
  detail: string;
  status: "running" | "completed" | "failed";
  createdNodes: number;
  createdEdges: number;
  warnings?: string[];
  error?: string;
};

type RefineScope = "all" | "volume" | "nearby" | "manual";
type RefineMode = "append" | "merge";

type RefineDialogState = {
  keyword: string;
  scope: RefineScope;
  mode: RefineMode;
  selectedChapterIds: Set<string>;
  matchedChapters: Chapter[];
  progress: string;
  error?: string;
  isSearching: boolean;
  isCallingAI: boolean;
};

type RefinePreviewState = {
  result: RefineOutlineSectionResultPayload;
  mode: RefineMode;
  keyword: string;
};

const BATCH_SIZE = 10;
const NODE_WIDTH = 160;
const NODE_HEIGHT = 84;

const FALLBACK_STAGE1_PROMPT = `你必须返回合法 JSON。不要返回 Markdown。不要返回代码块。不要返回解释文字。

当前阶段：Stage1 剧情粗解析。
只能基于输入章节正文和已有大纲，不允许补充原文没有出现的信息。
main_events 中每一项必须是对象，不要返回字符串。
作者后记、创作说明、存稿说明、读者交流内容不是小说剧情，不要放入 main_events。
chapter_range 必须写成“第X章-第Y章”，单章也要写成“第X章-第X章”。

输出 JSON：
{
  "main_events": [],
  "main_plot_progress": "",
  "branch_candidates": [],
  "important_characters": [],
  "faction_change_candidates": [],
  "key_event_markers": []
}

已有大纲：
{{existing_outline}}

章节正文：
{{selected_chapters}}`;

const FALLBACK_STAGE3_PROMPT = `你必须返回合法 JSON。不要返回 Markdown。不要返回代码块。不要返回解释文字。

阶段：角色细化。
只分析候选角色。没有出现的信息返回空字符串或空数组。
角色台词示例可以模仿该角色说一句话，但不要剧透未来，不要创造未出现设定；风格不明确则返回空字符串。

候选角色：
{{character_candidates}}

当前章节：
{{selected_chapters}}

Stage1 剧情解析结果：
{{stage_1_result}}

输出 JSON：
{
  "characters": []
}`;

export function OutlinePage({ chapters, currentChapterId, project, volumes }: OutlinePageProps) {
  const [outlineState, setOutlineState] = useState<OutlineState>();
  const [activeSection, setActiveSection] = useState<OutlineSectionType>("world");
  const [textDraft, setTextDraft] = useState("");
  const [saveState, setSaveState] = useState("已保存");
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [draftNode, setDraftNode] = useState<OutlineMindNode>();
  const [draftEdge, setDraftEdge] = useState<OutlineMindEdge>();
  const [showParseModal, setShowParseModal] = useState(false);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [parseProgress, setParseProgress] = useState<ParseProgress>();
  const [showMindMapGenerator, setShowMindMapGenerator] = useState(false);
  const [mindMapProgress, setMindMapProgress] = useState<MindMapGenerateProgress>();
  const [lastMindMapOptions, setLastMindMapOptions] = useState<MindMapGenerateOptions>();
  const [refineDialog, setRefineDialog] = useState<RefineDialogState>();
  const [refinePreview, setRefinePreview] = useState<RefinePreviewState>();

  const volumeOrder = useMemo(() => {
    const sortedVolumes = [...volumes].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    return new Map(sortedVolumes.map((volume, index) => [volume.id, index]));
  }, [volumes]);

  const sortedChapters = useMemo(() => sortChaptersByVolume(chapters, volumeOrder), [chapters, volumeOrder]);

  useEffect(() => {
    void refreshOutlineState();
  }, [project.id]);

  useEffect(() => {
    const current = outlineState?.textSections.find((section) => section.sectionType === activeSection);
    setTextDraft(current?.content ?? "");
    setSaveState("已保存");
  }, [activeSection, outlineState]);

  const selectedNode = outlineState?.mindNodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = outlineState?.mindEdges.find((edge) => edge.id === selectedEdgeId);

  async function refreshOutlineState() {
    const state = await getOutlineState(project.id);
    setOutlineState(state);
    const firstNode = state.mindNodes[0];
    setSelectedNodeId(firstNode?.id);
    setDraftNode(firstNode);
    setSelectedEdgeId(undefined);
    setDraftEdge(undefined);
  }

  async function saveTextSection(sectionType = activeSection, content = textDraft) {
    setSaveState("保存中");
    try {
      const saved = await saveOutlineTextSection(project.id, sectionType, content);
      setOutlineState((current) => ({
        textSections: upsert(current?.textSections ?? [], saved, (item) => item.sectionType === saved.sectionType),
        mindNodes: current?.mindNodes ?? [],
        mindEdges: current?.mindEdges ?? []
      }));
      setSaveState("已保存");
    } catch (error) {
      setSaveState("保存失败");
      window.alert(`保存失败：${String(error)}`);
    }
  }

  async function handleTabChange(sectionType: OutlineSectionType) {
    if (sectionType === activeSection) return;
    await saveTextSection();
    setActiveSection(sectionType);
  }

  async function handleAddNode() {
    const node = await createOutlineMindNode(project.id, "main_plot", "新节点", "", 160, 120);
    setOutlineState((current) => ({
      textSections: current?.textSections ?? [],
      mindNodes: [...(current?.mindNodes ?? []), node],
      mindEdges: current?.mindEdges ?? []
    }));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(undefined);
    setDraftNode(node);
    setDraftEdge(undefined);
  }

  async function handleApplyNode() {
    if (!draftNode) return;
    const saved = await updateOutlineMindNode(draftNode);
    setOutlineState((current) => ({
      textSections: current?.textSections ?? [],
      mindNodes: upsert(current?.mindNodes ?? [], saved, (item) => item.id === saved.id),
      mindEdges: current?.mindEdges ?? []
    }));
  }

  async function handleMoveNodeEnd(node: OutlineMindNode) {
    const saved = await updateOutlineMindNode(node);
    setOutlineState((current) => ({
      textSections: current?.textSections ?? [],
      mindNodes: upsert(current?.mindNodes ?? [], saved, (item) => item.id === saved.id),
      mindEdges: current?.mindEdges ?? []
    }));
  }

  async function handleCreateEdge(sourceNodeId: string, targetNodeId: string) {
    if (sourceNodeId === targetNodeId) return;
    if (outlineState?.mindEdges.some((edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId)) {
      window.alert("这两个节点已经有关联");
      return;
    }
    const edge = await createOutlineMindEdge(project.id, sourceNodeId, targetNodeId);
    setOutlineState((current) => ({
      textSections: current?.textSections ?? [],
      mindNodes: current?.mindNodes ?? [],
      mindEdges: [...(current?.mindEdges ?? []), edge]
    }));
  }

  async function handleApplyEdge() {
    if (!draftEdge) return;
    const saved = await updateOutlineMindEdge(draftEdge);
    setOutlineState((current) => ({
      textSections: current?.textSections ?? [],
      mindNodes: current?.mindNodes ?? [],
      mindEdges: upsert(current?.mindEdges ?? [], saved, (item) => item.id === saved.id)
    }));
  }

  async function handleDeleteEdge() {
    if (!selectedEdgeId) return;
    await deleteOutlineMindEdge(selectedEdgeId);
    setOutlineState((current) => ({
      textSections: current?.textSections ?? [],
      mindNodes: current?.mindNodes ?? [],
      mindEdges: (current?.mindEdges ?? []).filter((edge) => edge.id !== selectedEdgeId)
    }));
    setSelectedEdgeId(undefined);
    setDraftEdge(undefined);
  }

  async function handleDeleteNode() {
    if (!selectedNodeId) return;
    if (!window.confirm("确定删除该节点吗？与该节点相关的所有关联线也会被删除。")) return;
    await deleteOutlineMindNode(selectedNodeId);
    setOutlineState((current) => ({
      textSections: current?.textSections ?? [],
      mindNodes: (current?.mindNodes ?? []).filter((node) => node.id !== selectedNodeId),
      mindEdges: (current?.mindEdges ?? []).filter((edge) => edge.sourceNodeId !== selectedNodeId && edge.targetNodeId !== selectedNodeId)
    }));
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setDraftNode(undefined);
    setDraftEdge(undefined);
  }

  async function handleClearMindMap() {
    if (!window.confirm("确定清空当前项目的全部思维导图节点和关联线吗？此操作不可恢复。")) return;
    await clearOutlineMindMap(project.id);
    setOutlineState((current) => ({ textSections: current?.textSections ?? [], mindNodes: [], mindEdges: [] }));
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setDraftNode(undefined);
    setDraftEdge(undefined);
  }

  function handleGenerateMindMapFromOutline() {
    setShowMindMapGenerator(true);
  }

  async function handleStartMindMapGeneration(options: MindMapGenerateOptions) {
    if (!window.confirm("将根据当前文字大纲生成思维导图节点，是否继续？")) return;
    setLastMindMapOptions(options);
    setShowMindMapGenerator(false);
    setMindMapProgress({
      method: options.method,
      mode: options.mode,
      percent: 0,
      step: "读取文字大纲",
      detail: "正在读取文字大纲...",
      status: "running",
      createdNodes: 0,
      createdEdges: 0
    });

    try {
      const updateProgress = async (percent: number, step: string, detail: string) => {
        setMindMapProgress((current) => (current ? { ...current, percent, step, detail, status: "running" } : current));
        await delay(140);
      };

      await updateProgress(8, "读取文字大纲", "正在读取主线剧情、支线剧情、矛盾冲突与伏笔线索...");
      const sections = outlineState?.textSections ?? [];
      const mainText = sections.find((section) => section.sectionType === "main_plot")?.content ?? "";
      const branchText = sections.find((section) => section.sectionType === "branch_plot")?.content ?? "";
      const conflictText = sections.find((section) => section.sectionType === "conflicts")?.content ?? "";
      const allOutlineText = sections.map((section) => section.content).join("\n\n");

      if (options.method === "ai") {
        await updateProgress(18, "准备 AI 输入", "正在整理文字大纲、已有节点和关联线...");
        const settings = await getAISettings();
        const mindmapProviderContext = createProviderForFeature(settings, settings.featureMindmapGeneration);
        const provider = mindmapProviderContext.provider;
        const promptTemplate = await loadPromptTemplate("generate_mindmap_from_outline.md");
        const outlineByType = Object.fromEntries(sections.map((section) => [section.sectionType, section.content]));
        const prompt = fillMindmapPrompt(promptTemplate, pickMindmapOutlineSources(outlineByType, options.sources), outlineState, options);
        await updateProgress(34, "调用 AI 生成节点与关联", "正在请求 AI 生成思维导图结构...");
        const aiResult = await provider.chatJson([
          { role: "system", content: "你是小说思维导图结构生成助手。你必须返回合法 JSON。" },
          { role: "user", content: prompt }
        ]);
        await logAIUsage({
          projectId: project.id,
          featureName: "generate_mindmap_from_outline",
          provider: mindmapProviderContext.providerName,
          model: mindmapProviderContext.model,
          promptTokens: aiResult.usage.promptTokens,
          completionTokens: aiResult.usage.completionTokens,
          totalTokens: aiResult.usage.totalTokens,
          estimatedCost: 0
        });
        await updateProgress(50, "校验 AI 返回", "正在校验并标准化 AI 返回...");
        const parsed = parseMindmapGenerationJson(aiResult.content);
        const normalized = normalizeMindmapPayload(parsed, options.mode);
        const drafts = layoutMindmapNodes(dedupeDraftNodes(normalized.nodes, options.mode), normalized.edges, options.mode);
        if (drafts.length === 0) throw new Error("AI 没有返回可生成的节点");
        const result = await persistGeneratedMindMap(project.id, outlineState, options, drafts, normalized.edges, updateProgress);
        setOutlineState((current) => ({ textSections: current?.textSections ?? [], mindNodes: result.nodes, mindEdges: result.edges }));
        setSelectedNodeId(result.generatedNodes[0]?.id);
        setSelectedEdgeId(undefined);
        setDraftNode(result.generatedNodes[0]);
        setDraftEdge(undefined);
        await updateProgress(100, "完成", `已生成 ${result.createdNodes} 个节点，${result.createdEdges} 条关联线。`);
        setMindMapProgress((current) =>
          current ? { ...current, percent: 100, step: "完成", detail: `已生成 ${result.createdNodes} 个节点，${result.createdEdges} 条关联线。`, status: "completed", createdNodes: result.createdNodes, createdEdges: result.createdEdges, warnings: normalized.warnings } : current
        );
        return;
      }

      await updateProgress(18, "解析主线剧情", "正在解析主线剧情...");
      const mainDrafts =
        options.sources.includes("main_plot")
          ? parseOutlineTitles(mainText, "main_plot", 140, 130, options.mode === "rough" ? 8 : 12)
          : [];

      await updateProgress(30, "解析支线剧情", "正在解析支线剧情...");
      const branchDrafts =
        options.sources.includes("branch_plot")
          ? parseOutlineTitles(branchText, "branch_plot", 180, 340, options.mode === "rough" ? 6 : 16)
          : [];

      await updateProgress(42, "解析矛盾冲突", "正在解析矛盾冲突...");
      const conflictDrafts = options.sources.includes("conflicts")
        ? parseKeywordNodes(conflictText, "conflict", 280, 520, options.mode === "rough" ? 4 : 10)
        : [];

      await updateProgress(54, "解析伏笔与反转", "正在解析伏笔、反转与关键人物...");
      const foreshadowDrafts =
        options.mode === "detailed" ? parseKeywordNodes(allOutlineText, "foreshadowing", 220, 20, 12, ["伏笔", "线索"]) : [];
      const twistDrafts = options.mode === "detailed" ? parseKeywordNodes(allOutlineText, "twist", 720, 40, 8, ["反转", "真相"]) : [];
      const characterDrafts = options.mode === "detailed" ? parseCharacterNodes(allOutlineText, 80, 620, 12) : [];
      const drafts = layoutGeneratedDrafts([...mainDrafts, ...branchDrafts, ...conflictDrafts, ...foreshadowDrafts, ...twistDrafts, ...characterDrafts]);

      if (drafts.length === 0) throw new Error("当前文字大纲没有可生成导图的内容");

      let createdNodes = 0;
      let createdEdges = 0;
      let nextNodes = [...(outlineState?.mindNodes ?? [])];
      let nextEdges = [...(outlineState?.mindEdges ?? [])];

      if (options.strategy === "replace") {
        await updateProgress(66, "写入数据库", "正在清空旧导图...");
        await clearOutlineMindMap(project.id);
        nextNodes = [];
        nextEdges = [];
      }

      await updateProgress(70, "生成节点", `正在生成 ${drafts.length} 个候选节点...`);
      const nodesByKey = new Map(nextNodes.map((node) => [mindNodeKey(node.title, node.nodeType), node]));
      const generatedNodes: OutlineMindNode[] = [];
      for (const [index, draft] of drafts.entries()) {
        await updateProgress(70 + Math.round((index / drafts.length) * 12), "生成节点", `正在生成第 ${index + 1} / ${drafts.length} 个节点：${draft.title}`);
        const key = mindNodeKey(draft.title, draft.nodeType);
        const existing = nodesByKey.get(key);
        if (existing) {
          const updated = await updateOutlineMindNode({ ...existing, description: draft.description || existing.description, x: draft.x, y: draft.y });
          nodesByKey.set(key, updated);
          replaceById(nextNodes, updated);
          generatedNodes.push(updated);
          continue;
        }
        const created = await createOutlineMindNode(project.id, draft.nodeType, draft.title, draft.description, draft.x, draft.y);
        createdNodes += 1;
        nodesByKey.set(key, created);
        nextNodes.push(created);
        generatedNodes.push(created);
      }

      await updateProgress(86, "生成关联线", "正在生成节点关联线...");
      const mainNodes = generatedNodes.filter((node) => node.nodeType === "main_plot");
      const branchNodes = generatedNodes.filter((node) => node.nodeType === "branch_plot");
      const nearbyNodes = generatedNodes.filter((node) => ["conflict", "foreshadowing", "twist", "role"].includes(node.nodeType));
      for (let index = 0; index < mainNodes.length - 1; index += 1) {
        const result = await createMindEdgeIfMissing(project.id, mainNodes[index], mainNodes[index + 1], "related", "", nextEdges);
        if (result.created) createdEdges += 1;
      }
      for (const branch of branchNodes) {
        const anchor = findNearestMainNode(branch, mainNodes);
        if (!anchor) continue;
        const result = await createMindEdgeIfMissing(project.id, anchor, branch, "related", "", nextEdges);
        if (result.created) createdEdges += 1;
      }
      for (const node of nearbyNodes) {
        const anchor = findNearestMainNode(node, mainNodes) ?? mainNodes[0];
        if (!anchor) continue;
        const result = await createMindEdgeIfMissing(project.id, anchor, node, node.nodeType === "conflict" ? "conflicts" : "related", "", nextEdges);
        if (result.created) createdEdges += 1;
      }

      await updateProgress(94, "自动布局", "正在刷新画布布局...");
      setOutlineState((current) => ({ textSections: current?.textSections ?? [], mindNodes: nextNodes, mindEdges: nextEdges }));
      setSelectedNodeId(generatedNodes[0]?.id);
      setSelectedEdgeId(undefined);
      setDraftNode(generatedNodes[0]);
      setDraftEdge(undefined);

      await updateProgress(100, "完成", `已生成 ${createdNodes} 个节点，${createdEdges} 条关联线。`);
      setMindMapProgress((current) =>
        current ? { ...current, percent: 100, step: "完成", detail: `已生成 ${createdNodes} 个节点，${createdEdges} 条关联线。`, status: "completed", createdNodes, createdEdges } : current
      );
    } catch (error) {
      setMindMapProgress((current) =>
        current
          ? { ...current, status: "failed", step: "生成失败", detail: `生成失败：${String(error)}`, error: String(error) }
          : {
              mode: options.mode,
              percent: 0,
              step: "生成失败",
              detail: `生成失败：${String(error)}`,
              status: "failed",
              createdNodes: 0,
              createdEdges: 0,
              error: String(error)
            }
      );
    }
  }

  async function handleExportMindMapImage() {
    const nodes = outlineState?.mindNodes ?? [];
    const edges = outlineState?.mindEdges ?? [];
    if (nodes.length === 0) {
      window.alert("当前没有可导出的思维导图");
      return;
    }
    const outputPath = await save({
      defaultPath: `${sanitizeFileName(project.title)}_思维导图.png`,
      filters: [{ name: "PNG", extensions: ["png"] }]
    });
    if (!outputPath) return;
    const bytes = await renderMindMapPng(nodes, edges);
    await writeBinaryFile(outputPath, Array.from(bytes));
    window.alert("思维导图图片已导出");
  }

  async function handleStartParse(payload: ParseStartPayload) {
    await handleStartParseV2(payload);
    return;

    const selected = sortedChapters.filter((chapter) => payload.chapterIds.includes(chapter.id));
    if (selected.length === 0) {
      window.alert("没有可解析的章节");
      return;
    }

    setShowParseModal(false);
    setIsGeneratingOutline(true);
    const batches = chunk(selected, BATCH_SIZE);
    const task = await createAITask(
      project.id,
      "outline_stage_1",
      JSON.stringify({ mode: payload.mode, chapterIds: selected.map((chapter) => chapter.id), batchCount: batches.length })
    );

    try {
      const settings = await getAISettings();
      const chunkProviderContext = createProviderForFeature(settings, settings.featureOutlineChunkAnalysis, { model: settings.featureOutlineChunkModel ?? "deepseek-v4-flash" });
      const provider = chunkProviderContext.provider;
      const promptTemplate = await loadStage1Prompt();
      const characterDetailsPromptTemplate = await loadStage3Prompt();
      let lastParsed: Stage1PlotPayload | undefined;
      const parsedBatches: Stage1PlotPayload[] = [];
      const characterDetailBatches: Stage3CharacterDetailsPayload[] = [];

      for (const [index, batch] of batches.entries()) {
        const prompt = fillStage1Prompt(promptTemplate, batch, outlineState);
        setParseProgress({ status: "calling", currentBatch: index + 1, totalBatches: batches.length, chapterTitles: batch.map((chapter) => chapter.title) });
        const result = await provider.chatJson([
          { role: "system", content: "你是小说大纲解析助手。你必须返回合法 JSON。" },
          { role: "user", content: prompt }
        ]);

        setParseProgress((current) => (current ? { ...current, status: "validating" } : current));
        const normalized = normalizeStage1Result(JSON.parse(extractJsonText(result.content)));
        try {
          lastParsed = parseStage1PlotJson(result.content);
          parsedBatches.push(lastParsed!);
          await saveDebugResult({ normalized, prompt, rawResponse: result.content, schemaResult: "success", stageName: "Stage1 剧情解析" });
        } catch (error) {
          await saveDebugResult({ normalized, prompt, rawResponse: result.content, schemaResult: String(error), stageName: "Stage1 剧情解析" });
          throw error;
        }

        if (!lastParsed) throw new Error("Stage1 parse result missing");
        const parsedStage1 = lastParsed!;
        const candidates = pickProtagonistCandidates(parsedStage1.important_characters, parsedStage1.main_events);
        if (candidates.length > 0) {
          const characterPrompt = fillStage3Prompt(characterDetailsPromptTemplate, batch, parsedStage1, candidates);
          const characterResult = await provider.chatJson([
            { role: "system", content: "你是小说角色分析助手。你必须返回合法 JSON。" },
            { role: "user", content: characterPrompt }
          ]);
          try {
            const parsedCharacters = parseStage3CharacterDetailsJson(characterResult.content);
            characterDetailBatches.push(parsedCharacters);
            await saveDebugResult({ normalized: parsedCharacters, prompt: characterPrompt, rawResponse: characterResult.content, schemaResult: "success", stageName: "Stage3 角色细化" });
          } catch (error) {
            await saveDebugResult({ prompt: characterPrompt, rawResponse: characterResult.content, schemaResult: String(error), stageName: "Stage3 角色细化" });
            console.warn("[AI Outline Stage3] character detail parse failed", error);
          }

          await logAIUsage({
            projectId: project.id,
            featureName: "outline_stage_3_character_details",
            provider: settings.provider,
            model: settings.model,
            promptTokens: characterResult.usage.promptTokens,
            completionTokens: characterResult.usage.completionTokens,
            totalTokens: characterResult.usage.totalTokens,
            estimatedCost: 0
          });
        }

        await logAIUsage({
          projectId: project.id,
          featureName: "outline_stage_1_plot",
          provider: chunkProviderContext.providerName,
          model: chunkProviderContext.model,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          estimatedCost: 0
        });
      }

      const outlineUpdates = buildStage1OutlineUpdates(parsedBatches, characterDetailBatches);
      const savedSections = await Promise.all([
        saveOutlineTextSection(project.id, "world", outlineUpdates.world),
        saveOutlineTextSection(project.id, "main_characters", outlineUpdates.mainCharacters),
        saveOutlineTextSection(project.id, "main_plot", outlineUpdates.mainPlot),
        saveOutlineTextSection(project.id, "branch_plot", outlineUpdates.branchPlot),
        saveOutlineTextSection(project.id, "roles", outlineUpdates.roles),
        saveOutlineTextSection(project.id, "conflicts", outlineUpdates.conflicts)
      ]);
      setOutlineState((current) => ({
        textSections: savedSections.reduce(
          (sections, section) => upsert(sections, section, (item) => item.sectionType === section.sectionType),
          current?.textSections ?? []
        ),
        mindNodes: current?.mindNodes ?? [],
        mindEdges: current?.mindEdges ?? []
      }));
      setActiveSection("main_plot");
      setTextDraft(outlineUpdates.mainPlot);
      setSaveState("已保存");
      await finishAITask(task.id, "success", JSON.stringify(lastParsed ?? {}, null, 2));
      setParseProgress({ status: "completed", currentBatch: batches.length, totalBatches: batches.length, chapterTitles: selected.map((chapter) => chapter.title) });
      window.alert("解析完成，已写入大纲。");
    } catch (error) {
      await finishAITask(task.id, "failed", String(error));
      setParseProgress({ status: "failed", currentBatch: 0, totalBatches: batches.length, chapterTitles: [], error: String(error) });
      window.alert(`AI 大纲解析失败：${String(error)}`);
    } finally {
      setIsGeneratingOutline(false);
    }
  }

  async function saveDebugResult(result: AIDebugResult) {
    await saveAIDebugLog(JSON.stringify(result, null, 2));
  }

  async function handleStartParseV2(payload: ParseStartPayload) {
    const selected = sortedChapters.filter((chapter) => payload.chapterIds.includes(chapter.id));
    if (selected.length === 0) {
      window.alert("没有可解析的章节");
      return;
    }

    setShowParseModal(false);
    setIsGeneratingOutline(true);
    let aiCallCount = 0;
    let cacheHitCount = 0;
    let tokenCount = 0;
    const settings = await getAISettings();
    const analysisMode = payload.analysisMode ?? settings.defaultAnalysisMode ?? "simple";
    const chunkSize = analysisMode === "simple" ? settings.simpleChunkSize ?? 5 : settings.detailedChunkSize ?? 3;
    const concurrency = Math.max(1, Math.min(5, settings.analysisConcurrency ?? 2));
    const promptVersion = `outline-v2-${analysisMode}`;
    const chunks = chunk(selected, Math.max(1, chunkSize)).map((chaptersInChunk, index) => ({
      id: `chunk-${index + 1}`,
      index,
      chapters: chaptersInChunk,
      chapterRange: formatChapterRangeFromChapters(chaptersInChunk, selected)
    }));

    const task = await createAITask(
      project.id,
      "generate_outline_chunked",
      JSON.stringify({ mode: payload.mode, analysisMode, chapterIds: selected.map((chapter) => chapter.id), chunkCount: chunks.length })
    );

    try {
      const chunkProviderContext = createProviderForFeature(settings, settings.featureOutlineChunkAnalysis, { model: settings.featureOutlineChunkModel ?? "deepseek-v4-flash" });
      const provider = chunkProviderContext.provider;
      const chunkResults = new Array<unknown>(chunks.length);
      const existingOutline = Object.fromEntries((outlineState?.textSections ?? []).map((section) => [section.sectionType, section.content]));
      const promptNames =
        analysisMode === "simple"
          ? ["simple_chunk_outline.md"]
          : ["detail_stage_1_plot.md", "detail_stage_2_cast.md", "detail_stage_3_character_details.md", "detail_stage_4_world_conflicts.md"];
      const prompts = Object.fromEntries(await Promise.all(promptNames.map(async (name) => [name, await loadPromptTemplate(name)])));

      setParseProgress({
        status: "cache",
        currentBatch: 0,
        totalBatches: chunks.length,
        chapterTitles: [],
        analysisMode,
        aiCallCount,
        cacheHitCount,
        completedChunks: 0,
        concurrency,
        failedChunks: 0,
        stage: "检查缓存",
        tokenCount
      });

      await runParallel(chunks, concurrency, async (currentChunk) => {
        const contentHash = await hashChunk(currentChunk.chapters, settings.model, promptVersion, analysisMode);
        const cacheEntry =
          settings.enableChapterCache === false
            ? undefined
            : await getChapterAICache(project.id, currentChunk.chapters[0].id, contentHash, settings.model, promptVersion, analysisMode);

        if (cacheEntry?.summaryJson) {
          cacheHitCount += 1;
          chunkResults[currentChunk.index] = JSON.parse(cacheEntry.summaryJson);
          setParseProgress((current) =>
            current
              ? {
                  ...current,
                  cacheHitCount,
                  completedChunks: (current.completedChunks ?? 0) + 1,
                  currentBatch: currentChunk.index + 1,
                  chapterTitles: currentChunk.chapters.map((chapter) => chapter.title),
                  stage: "缓存命中"
                }
              : current
          );
          return;
        }

        setParseProgress((current) =>
          current
            ? {
                ...current,
                status: "chunk",
                currentBatch: currentChunk.index + 1,
                chapterTitles: currentChunk.chapters.map((chapter) => chapter.title),
                stage: `解析 Chunk：${currentChunk.chapterRange}`
              }
            : current
        );

        const result =
          analysisMode === "simple"
            ? await parseSimpleChunk(provider, prompts["simple_chunk_outline.md"], currentChunk.chapters, currentChunk.chapterRange, existingOutline)
            : await parseDetailedChunk(provider, prompts, currentChunk.chapters, currentChunk.chapterRange, existingOutline);
        aiCallCount += result.aiCalls;
        tokenCount += result.tokens;
        chunkResults[currentChunk.index] = result.data;

        if (settings.enableChapterCache !== false) {
          await Promise.all(
            currentChunk.chapters.map((chapter) =>
              saveChapterAICache(project.id, chapter.id, contentHash, settings.model, promptVersion, analysisMode, JSON.stringify(result.data))
            )
          );
        }

        await logAIUsage({
          projectId: project.id,
          featureName: analysisMode === "simple" ? "outline_simple_chunk" : "outline_detailed_chunk",
          provider: settings.provider,
          model: settings.model,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          estimatedCost: 0
        });
        setParseProgress((current) =>
          current
            ? {
                ...current,
                aiCallCount,
                completedChunks: (current.completedChunks ?? 0) + 1,
                tokenCount,
                stage: `完成 Chunk：${currentChunk.chapterRange}`
              }
            : current
        );
      });

      setParseProgress((current) => (current ? { ...current, status: "reduce", stage: "分卷/阶段合并", chapterTitles: [] } : current));
      const reduceProviderContext = createProviderForFeature(settings, settings.featureOutlineReduceMerge);
      const reducePrompt = await loadPromptTemplate("reduce_volume_outline.md");
      const stageSummaries = await reduceChunkResults(reduceProviderContext.provider, reducePrompt, chunkResults.filter(Boolean), analysisMode, existingOutline, {
        provider: reduceProviderContext.providerName,
        model: reduceProviderContext.model
      });
      aiCallCount += stageSummaries.aiCalls;
      tokenCount += stageSummaries.tokens;

      setParseProgress((current) => (current ? { ...current, status: "final", stage: "全书合并", aiCallCount, tokenCount } : current));
      const finalProviderContext = createProviderForFeature(settings, settings.featureOutlineFinalMerge, { model: settings.featureOutlineFinalModel ?? "deepseek-v4-pro", thinkingEnabled: true, reasoningEffort: "max" });
      const finalPrompt = await loadPromptTemplate("final_merge_outline.md");
      const finalResult = await finalMergeOutline(finalProviderContext.provider, finalPrompt, stageSummaries.data, analysisMode, existingOutline, {
        provider: finalProviderContext.providerName,
        model: finalProviderContext.model
      });
      aiCallCount += 1;
      tokenCount += finalResult.usage.totalTokens;

      const outlineUpdates = renderFinalKnowledgeBase(finalResult.data);
      setParseProgress((current) => (current ? { ...current, status: "writing", stage: "生成大纲文本", aiCallCount, tokenCount } : current));
      const confirmed = window.confirm("AI 全文解析完成。是否写入六个文字大纲分页？");
      if (!confirmed) {
        await finishAITask(task.id, "success", JSON.stringify({ skippedWrite: true, final: finalResult.data }, null, 2));
        setParseProgress((current) => (current ? { ...current, status: "completed", stage: "已生成预览，用户取消写入" } : current));
        return;
      }

      const savedSections = await Promise.all([
        saveOutlineTextSection(project.id, "world", outlineUpdates.world),
        saveOutlineTextSection(project.id, "main_characters", outlineUpdates.mainCharacters),
        saveOutlineTextSection(project.id, "roles", outlineUpdates.roles),
        saveOutlineTextSection(project.id, "main_plot", outlineUpdates.mainPlot),
        saveOutlineTextSection(project.id, "branch_plot", outlineUpdates.branchPlot),
        saveOutlineTextSection(project.id, "conflicts", outlineUpdates.conflicts)
      ]);
      setOutlineState((current) => ({
        textSections: savedSections.reduce(
          (sections, section) => upsert(sections, section, (item) => item.sectionType === section.sectionType),
          current?.textSections ?? []
        ),
        mindNodes: current?.mindNodes ?? [],
        mindEdges: current?.mindEdges ?? []
      }));
      setActiveSection("main_plot");
      setTextDraft(outlineUpdates.mainPlot);
      setSaveState("已保存");
      await finishAITask(task.id, "success", JSON.stringify(finalResult.data, null, 2));
      setParseProgress((current) =>
        current ? { ...current, status: "completed", currentBatch: chunks.length, totalBatches: chunks.length, stage: "完成", aiCallCount, tokenCount } : current
      );
      window.alert("解析完成，已写入大纲。");
    } catch (error) {
      await finishAITask(task.id, "failed", String(error));
      setParseProgress((current) =>
        current
          ? { ...current, status: "failed", error: String(error), stage: "解析失败" }
          : { status: "failed", currentBatch: 0, totalBatches: chunks.length, chapterTitles: [], error: String(error), analysisMode }
      );
      window.alert(`AI 大纲解析失败：${String(error)}`);
    } finally {
      setIsGeneratingOutline(false);
    }
  }

  function openRefineDialog() {
    setRefineDialog({
      keyword: "",
      scope: "all",
      mode: "merge",
      selectedChapterIds: new Set(),
      matchedChapters: [],
      progress: "",
      isSearching: false,
      isCallingAI: false
    });
  }

  function searchRefineChapters(state: RefineDialogState) {
    const keyword = state.keyword.trim();
    if (!keyword) return [];
    const source = getRefineScopeChapters(state);
    const lowerKeyword = keyword.toLowerCase();
    const scored = source
      .map((chapter) => {
        const titleScore = chapter.title.toLowerCase().includes(lowerKeyword) ? 5 : 0;
        const contentScore = chapter.content.toLowerCase().includes(lowerKeyword) ? 2 : 0;
        return { chapter, score: titleScore + contentScore };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.chapter.sortOrder - b.chapter.sortOrder)
      .map((item) => item.chapter);
    return scored.slice(0, state.scope === "manual" ? 30 : 15);
  }

  function getRefineScopeChapters(state: RefineDialogState) {
    if (state.scope === "manual") {
      return sortedChapters.filter((chapter) => state.selectedChapterIds.has(chapter.id));
    }
    if (state.scope === "volume") {
      const currentVolumeId = sortedChapters.find((chapter) => chapter.id === currentChapterId)?.volumeId ?? sortedChapters[0]?.volumeId;
      return currentVolumeId ? sortedChapters.filter((chapter) => chapter.volumeId === currentVolumeId) : sortedChapters;
    }
    if (state.scope === "nearby") {
      const foundIndex = sortedChapters.findIndex((chapter) => chapter.id === currentChapterId);
      const currentIndex = foundIndex >= 0 ? foundIndex : 0;
      return sortedChapters.slice(Math.max(0, currentIndex - 3), currentIndex + 4);
    }
    return sortedChapters;
  }

  async function handleSearchRefineChapters() {
    if (!refineDialog) return;
    const keyword = refineDialog.keyword.trim();
    if (!keyword) {
      setRefineDialog({ ...refineDialog, error: "请输入要补全的关键词" });
      return;
    }
    const next = { ...refineDialog, isSearching: true, progress: "搜索相关章节", error: undefined };
    setRefineDialog(next);
    const matchedChapters = searchRefineChapters(next);
    setRefineDialog({
      ...next,
      matchedChapters,
      selectedChapterIds: new Set(matchedChapters.map((chapter) => chapter.id)),
      isSearching: false,
      progress: matchedChapters.length > 0 ? `找到 ${matchedChapters.length} 个相关章节` : "未找到相关章节",
      error: matchedChapters.length > 0 ? undefined : "未找到包含该关键词的章节，可以尝试扩大范围或更换关键词。"
    });
  }

  async function handleStartRefine() {
    if (!refineDialog) return;
    const keyword = refineDialog.keyword.trim();
    const selected = refineDialog.matchedChapters.filter((chapter) => refineDialog.selectedChapterIds.has(chapter.id));
    if (!keyword) {
      setRefineDialog({ ...refineDialog, error: "请输入要补全的关键词" });
      return;
    }
    if (selected.length === 0) {
      setRefineDialog({ ...refineDialog, error: "请先选择用于补全的章节" });
      return;
    }

    const task = await createAITask(
      project.id,
      "refine_outline_section",
      JSON.stringify({ sectionType: activeSection, keyword, selectedChapterIds: selected.map((chapter) => chapter.id) })
    );
    try {
      setRefineDialog({ ...refineDialog, isCallingAI: true, progress: `正在分析 ${selected.length} 个相关章节`, error: undefined });
      const settings = await getAISettings();
      const provider = settings.apiKey ? createLLMProvider(settings) : new MockProvider();
      const promptTemplate = await readPromptFile("refine_outline_section.md");
      const prompt = fillRefinePrompt(promptTemplate, activeSection, keyword, textDraft, selected, outlineState);
      const result = await provider.chatJson([
        { role: "system", content: "你是小说大纲定向补全助手。你必须返回合法 JSON。" },
        { role: "user", content: prompt }
      ]);
      await logAIUsage({
        projectId: project.id,
        featureName: "refine_outline_section",
        provider: settings.provider,
        model: settings.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        estimatedCost: 0
      });
      const parsed = parseRefineOutlineSectionJson(result.content);
      await finishAITask(task.id, "success", result.content);
      setRefineDialog(undefined);
      setRefinePreview({ result: parsed, mode: refineDialog.mode, keyword });
    } catch (error) {
      await finishAITask(task.id, "failed", String(error));
      setRefineDialog({ ...refineDialog, isCallingAI: false, progress: "补全失败", error: String(error) });
    }
  }

  async function applyRefinePreview(mode: RefineMode) {
    if (!refinePreview) return;
    const refinedContent = refinePreview.result.refined_content.trim();
    if (!refinedContent) return;
    const nextContent = mergeRefinedSectionContent(textDraft, refinedContent, activeSection, refinePreview.keyword, mode);
    setTextDraft(nextContent);
    await saveTextSection(activeSection, nextContent);
    setRefinePreview(undefined);
  }

  async function handleSortOutlineByChapter() {
    if (activeSection !== "main_plot" && activeSection !== "branch_plot") return;
    const sorted = sortOutlineSectionByChapter(textDraft);
    if (sorted === textDraft) {
      window.alert("当前大纲顺序已经符合章节顺序。");
      return;
    }
    setTextDraft(sorted);
    await saveTextSection(activeSection, sorted);
  }

  return (
    <div className="outline-page">
      <header className="outline-topbar">
        <div>
          <h2>小说大纲</h2>
          <p>整理世界观、角色、剧情线和思维导图，作为长篇创作的本地知识库。</p>
        </div>
        <div>
          <button disabled={isGeneratingOutline} onClick={() => setShowParseModal(true)} type="button">
            解析正文
          </button>
        </div>
      </header>

      <div className="outline-workspace">
        <OutlineTextPanel
          activeSection={activeSection}
          content={textDraft}
          onChange={(content) => {
            setTextDraft(content);
            setSaveState("编辑中");
          }}
          onClear={() => {
            setTextDraft("");
            setSaveState("编辑中");
          }}
          onSave={() => void saveTextSection()}
          onRefine={openRefineDialog}
          onSortByChapter={() => void handleSortOutlineByChapter()}
          onTabChange={handleTabChange}
          saveState={saveState}
        />

        <MindMapPanel
          draftEdge={draftEdge}
          draftNode={draftNode}
          edges={outlineState?.mindEdges ?? []}
          nodes={outlineState?.mindNodes ?? []}
          onAddNode={handleAddNode}
          onApplyEdge={handleApplyEdge}
          onApplyNode={handleApplyNode}
          onClearMindMap={handleClearMindMap}
          onClearSelection={() => {
            setSelectedNodeId(undefined);
            setSelectedEdgeId(undefined);
            setDraftNode(undefined);
            setDraftEdge(undefined);
          }}
          onCreateEdge={handleCreateEdge}
          onDeleteEdge={handleDeleteEdge}
          onDeleteNode={handleDeleteNode}
          onDraftEdgeChange={setDraftEdge}
          onDraftNodeChange={setDraftNode}
          onExportImage={handleExportMindMapImage}
          onGenerateFromText={handleGenerateMindMapFromOutline}
          onMoveNode={(node) => {
            setOutlineState((current) => ({
              textSections: current?.textSections ?? [],
              mindNodes: upsert(current?.mindNodes ?? [], node, (item) => item.id === node.id),
              mindEdges: current?.mindEdges ?? []
            }));
          }}
          onMoveNodeEnd={handleMoveNodeEnd}
          onSelectEdge={(edge) => {
            setSelectedEdgeId(edge.id);
            setSelectedNodeId(undefined);
            setDraftEdge(edge);
            setDraftNode(undefined);
          }}
          onSelectNode={(node) => {
            setSelectedNodeId(node.id);
            setSelectedEdgeId(undefined);
            setDraftNode(node);
            setDraftEdge(undefined);
          }}
          selectedEdgeId={selectedEdge?.id}
          selectedNodeId={selectedNode?.id}
        />
      </div>

      {showParseModal && <ParseSourceModal chapters={sortedChapters} onClose={() => setShowParseModal(false)} onStart={handleStartParse} volumes={volumes} />}
      {refineDialog && (
        <RefineOutlineModal
          activeSection={activeSection}
          chapters={sortedChapters}
          state={refineDialog}
          onChange={setRefineDialog}
          onClose={() => setRefineDialog(undefined)}
          onSearch={handleSearchRefineChapters}
          onStart={handleStartRefine}
        />
      )}
      {refinePreview && (
        <RefinePreviewModal
          preview={refinePreview}
          onAppend={() => void applyRefinePreview("append")}
          onClose={() => setRefinePreview(undefined)}
          onMerge={() => void applyRefinePreview("merge")}
        />
      )}
      {showMindMapGenerator && (
        <MindMapGenerateModal
          edgeCount={outlineState?.mindEdges.length ?? 0}
          nodeCount={outlineState?.mindNodes.length ?? 0}
          onClose={() => setShowMindMapGenerator(false)}
          onStart={handleStartMindMapGeneration}
        />
      )}
      {mindMapProgress && (
        <MindMapProgressModal
          onClose={() => setMindMapProgress(undefined)}
          onFallbackToLocal={
            lastMindMapOptions
              ? () => {
                  setMindMapProgress(undefined);
                  void handleStartMindMapGeneration({ ...lastMindMapOptions, method: "local" });
                }
              : undefined
          }
          onRetry={lastMindMapOptions ? () => void handleStartMindMapGeneration(lastMindMapOptions) : undefined}
          progress={mindMapProgress}
        />
      )}
      {parseProgress && <ParseProgressModal progress={parseProgress} onClose={() => setParseProgress(undefined)} />}
    </div>
  );
}

function sortChaptersByVolume(chapters: Chapter[], volumeOrder: Map<string, number>) {
  return [...chapters].sort((a, b) => {
    const volumeA = volumeOrder.get(a.volumeId) ?? Number.MAX_SAFE_INTEGER;
    const volumeB = volumeOrder.get(b.volumeId) ?? Number.MAX_SAFE_INTEGER;
    return volumeA - volumeB || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
  });
}

function fillRefinePrompt(
  template: string,
  sectionType: OutlineSectionType,
  keyword: string,
  currentContent: string,
  relevantChapters: Chapter[],
  outlineState?: OutlineState
) {
  const outlineContext = Object.fromEntries((outlineState?.textSections ?? []).map((section) => [section.sectionType, section.content]));
  const chapterText = relevantChapters.map((chapter) => `【${chapter.title}】\n${chapter.content}`).join("\n\n");
  return template
    .split("{{section_type}}").join(sectionType)
    .split("{{keyword}}").join(keyword)
    .split("{{current_section_content}}").join(currentContent)
    .split("{{outline_context}}").join(JSON.stringify(outlineContext, null, 2))
    .split("{{relevant_chapters}}").join(chapterText);
}

function mergeRefinedSectionContent(currentContent: string, refinedContent: string, _sectionType: OutlineSectionType, keyword: string, mode: RefineMode) {
  const refined = refinedContent.trim();
  if (!refined) return currentContent;
  if (mode === "append") {
    return [currentContent.trim(), "", `【定向补全：${keyword}】`, "", refined].filter(Boolean).join("\n");
  }
  const currentBlocks = splitContentBlocks(currentContent);
  const refinedBlocks = splitContentBlocks(refined);
  const existingKeys = new Set(currentBlocks.map(blockKey));
  const additions = refinedBlocks.filter((block) => {
    const key = blockKey(block);
    return key && !existingKeys.has(key);
  });
  if (additions.length === 0) return currentContent;
  return [currentContent.trim(), "", ...additions].filter(Boolean).join("\n\n");
}

function splitContentBlocks(content: string) {
  const byHeading = content.split(/\n(?=##?\s+)/).map((item) => item.trim()).filter(Boolean);
  if (byHeading.length > 1) return byHeading;
  return content.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
}

function blockKey(block: string) {
  const firstLine = block.split("\n").find(Boolean) ?? block;
  return firstLine.replace(/^#+\s*/, "").replace(/[，。；：:;,.\s]/g, "").slice(0, 40);
}

function getSectionLabel(sectionType: OutlineSectionType) {
  return outlineTabs.find((tab) => tab.value === sectionType)?.label ?? "??";
}

function sortOutlineSectionByChapter(content: string) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return content;
  const firstBlockIndex = normalized.search(/\n##\s+|^##\s+/);
  if (firstBlockIndex < 0) return content;

  const prefix = normalized.slice(0, firstBlockIndex).trim();
  const blockSource = normalized.slice(firstBlockIndex).trim();
  const blocks = blockSource
    .split(/\n(?=##\s+)/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length <= 1) return content;

  const sortedBlocks = blocks
    .map((block, index) => ({ block, index, chapter: extractOutlineBlockChapterStart(block) }))
    .sort((a, b) => {
      const chapterA = a.chapter ?? Number.MAX_SAFE_INTEGER;
      const chapterB = b.chapter ?? Number.MAX_SAFE_INTEGER;
      return chapterA - chapterB || a.index - b.index;
    })
    .map((item) => item.block);

  return [prefix, ...sortedBlocks].filter(Boolean).join("\n\n").trim();
}

function extractOutlineBlockChapterStart(block: string) {
  const rangeLine = block.match(/\u7ae0\u8282\u8303\u56f4[:\uff1a]?\s*\n?([^\n]+)/);
  const source = rangeLine?.[1] || block;
  const arabic = source.match(/\d+/);
  if (arabic) return Number(arabic[0]);
  const chinese = source.match(/\u7b2c([\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u96f6\u3007\u4e24]+)\u7ae0/);
  return chinese ? chineseNumberToInt(chinese[1]) : undefined;
}

function chineseNumberToInt(value: string) {
  const digits: Record<string, number> = {
    "\u96f6": 0,
    "\u3007": 0,
    "\u4e00": 1,
    "\u4e8c": 2,
    "\u4e24": 2,
    "\u4e09": 3,
    "\u56db": 4,
    "\u4e94": 5,
    "\u516d": 6,
    "\u4e03": 7,
    "\u516b": 8,
    "\u4e5d": 9
  };
  if (value === "\u5341") return 10;
  const tenIndex = value.indexOf("\u5341");
  if (tenIndex >= 0) {
    const before = value.slice(0, tenIndex);
    const after = value.slice(tenIndex + 1);
    const tens = before ? digits[before] ?? 1 : 1;
    const ones = after ? digits[after] ?? 0 : 0;
    return tens * 10 + ones;
  }
  return value.split("").reduce((total, char) => total * 10 + (digits[char] ?? 0), 0);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

type RuntimeProviderName = "deepseek" | "openai";

function normalizeRuntimeProvider(value: unknown): RuntimeProviderName {
  return String(value ?? "").toLowerCase() === "openai" ? "openai" : "deepseek";
}

function resolveFeatureProvider(settings: AISettings, strategy?: AIProviderStrategy): RuntimeProviderName {
  if (strategy === "openai" || strategy === "deepseek") return strategy;
  if (strategy === "hybrid") return normalizeRuntimeProvider(settings.primaryProvider);
  return normalizeRuntimeProvider(settings.provider);
}

function hasProviderKey(settings: AISettings, providerName: RuntimeProviderName) {
  return providerName === "openai" ? Boolean(settings.openaiApiKey?.trim()) : Boolean(settings.apiKey?.trim());
}

function getProviderModel(settings: AISettings, providerName: RuntimeProviderName) {
  return providerName === "openai" ? settings.openaiModel || "gpt-5.5" : settings.model || "deepseek-v4-flash";
}

function createProviderForFeature(settings: AISettings, strategy?: AIProviderStrategy, override?: Partial<Pick<AISettings, "model" | "reasoningEffort" | "thinkingEnabled">>) {
  const providerName = resolveFeatureProvider(settings, strategy);
  if (hasProviderKey(settings, providerName)) {
    const runtimeSettings = providerName === "deepseek" && override ? { ...settings, ...override } : settings;
    return {
      provider: createLLMProvider(runtimeSettings, providerName),
      providerName,
      model: getProviderModel(runtimeSettings, providerName)
    };
  }

  const hasAnyKey = hasProviderKey(settings, "deepseek") || hasProviderKey(settings, "openai");
  if (hasAnyKey) {
    const label = providerName === "openai" ? "OpenAI" : "DeepSeek";
    throw new Error(`请先在 AI 设置中配置 ${label} API Key。`);
  }

  return {
    provider: new MockProvider(),
    providerName: "mock",
    model: "mock"
  };
}

async function loadStage1Prompt() {
  try {
    return (await readPromptFile("outline_stage_1_plot.md")) || FALLBACK_STAGE1_PROMPT;
  } catch {
    return FALLBACK_STAGE1_PROMPT;
  }
}

async function loadStage3Prompt() {
  try {
    return (await readPromptFile("outline_stage_3_character_details.md")) || FALLBACK_STAGE3_PROMPT;
  } catch {
    return FALLBACK_STAGE3_PROMPT;
  }
}

async function loadPromptTemplate(name: string) {
  try {
    return await readPromptFile(name);
  } catch (error) {
    console.warn(`[AI Outline] prompt fallback used for ${name}`, error);
    return "你必须返回合法 JSON。不要返回 Markdown。不要返回代码块。不要返回解释文字。\n输入：{{selected_chapters}}\n输出 JSON：{}";
  }
}

type OutlineChunkResult = {
  aiCalls: number;
  data: unknown;
  tokens: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
};

async function parseSimpleChunk(
  provider: LLMProvider,
  template: string,
  chapters: Chapter[],
  chapterRange: string,
  existingOutline: Record<string, string>
): Promise<OutlineChunkResult> {
  const prompt = fillChunkPrompt(template, chapters, chapterRange, existingOutline);
  const result = await provider.chatJson([
    { role: "system", content: "你是小说大纲解析助手。你必须返回合法 JSON。" },
    { role: "user", content: prompt }
  ]);
  const parsed = parseSimpleChunkOutlineJson(result.content);
  return { aiCalls: 1, data: parsed, tokens: result.usage.totalTokens, usage: result.usage };
}

async function parseDetailedChunk(
  provider: LLMProvider,
  prompts: Record<string, string>,
  chapters: Chapter[],
  chapterRange: string,
  existingOutline: Record<string, string>
): Promise<OutlineChunkResult> {
  const stage1Prompt = fillChunkPrompt(prompts["detail_stage_1_plot.md"], chapters, chapterRange, existingOutline);
  const stage1 = await provider.chatJson([
    { role: "system", content: "你是小说剧情解析助手。你必须返回合法 JSON。" },
    { role: "user", content: stage1Prompt }
  ]);
  const stage1Data = JSON.parse(extractJsonText(stage1.content));
  const selectedText = chaptersToPromptText(chapters);
  const stage2Prompt = prompts["detail_stage_2_cast.md"]
    .split("{{stage_1_result}}").join(JSON.stringify(stage1Data, null, 2))
    .split("{{selected_chapters}}").join(selectedText);
  const stage2 = await provider.chatJson([
    { role: "system", content: "你是小说角色关系解析助手。你必须返回合法 JSON。" },
    { role: "user", content: stage2Prompt }
  ]);
  const stage2Data = JSON.parse(extractJsonText(stage2.content));
  const candidates = [
    ...arrayFromUnknown(recordFromUnknown(stage2Data).protagonist_group).map((item) => textFromUnknown(recordFromUnknown(item).name)),
    ...arrayFromUnknown(recordFromUnknown(stage2Data).supporting_characters).map((item) => textFromUnknown(recordFromUnknown(item).name))
  ].filter(Boolean).slice(0, 16);
  const stage3Prompt = prompts["detail_stage_3_character_details.md"]
    .split("{{character_candidates}}").join(JSON.stringify(candidates, null, 2))
    .split("{{selected_chapters}}").join(selectedText);
  const stage3 = await provider.chatJson([
    { role: "system", content: "你是小说角色细化助手。你必须返回合法 JSON。" },
    { role: "user", content: stage3Prompt }
  ]);
  const stage3Data = JSON.parse(extractJsonText(stage3.content));
  const stage4Prompt = prompts["detail_stage_4_world_conflicts.md"]
    .split("{{stage_1_result}}").join(JSON.stringify(stage1Data, null, 2))
    .split("{{existing_outline}}").join(JSON.stringify(existingOutline, null, 2))
    .split("{{selected_chapters}}").join(selectedText);
  const stage4 = await provider.chatJson([
    { role: "system", content: "你是小说世界观与矛盾解析助手。你必须返回合法 JSON。" },
    { role: "user", content: stage4Prompt }
  ]);
  const stage4Data = JSON.parse(extractJsonText(stage4.content));
  const data = { chapter_range: chapterRange, stage1: stage1Data, stage2: stage2Data, stage3: stage3Data, stage4: stage4Data };
  const usage = addUsage(stage1.usage, stage2.usage, stage3.usage, stage4.usage);
  return { aiCalls: 4, data, tokens: usage.totalTokens, usage };
}

async function reduceChunkResults(
  _provider: LLMProvider,
  _template: string,
  chunkResults: unknown[],
  analysisMode: string,
  _existingOutline: Record<string, string>,
  _settings: { provider: string; model: string }
) {
  const groups = chunk(chunkResults, analysisMode === "simple" ? 6 : 4);
  const summaries = groups.map((group, index) => compactStageSummary(group, index + 1));
  return { data: summaries, aiCalls: 0, tokens: 0 };
}

async function finalMergeOutline(
  provider: LLMProvider,
  template: string,
  stageSummaries: unknown[],
  analysisMode: string,
  existingOutline: Record<string, string>,
  settings: { provider: string; model: string }
) {
  const prompt = template
    .split("{{analysis_mode}}").join(analysisMode)
    .split("{{existing_outline}}").join(JSON.stringify(existingOutline, null, 2))
    .split("{{stage_summaries}}").join(JSON.stringify(stageSummaries, null, 2));
  const result = await provider.chatJson([
    { role: "system", content: "你是小说最终知识库合并助手。你必须返回合法 JSON。" },
    { role: "user", content: prompt }
  ]);
  await logAIUsage({
    projectId: undefined,
    featureName: "outline_final_merge",
    provider: settings.provider,
    model: settings.model,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    totalTokens: result.usage.totalTokens,
    estimatedCost: 0
  });
  try {
    return { data: mergeFinalWithLocalCoverage(parseFinalKnowledgeBaseJson(result.content), stageSummaries), usage: result.usage };
  } catch (error) {
    console.warn("[AI Outline] final merge JSON parse failed, using local fallback", error, result.content);
    return { data: buildLocalFinalKnowledgeBase(stageSummaries), usage: result.usage };
  }
}

function mergeFinalWithLocalCoverage(finalResult: FinalKnowledgeBasePayload, stageSummaries: unknown[]): FinalKnowledgeBasePayload {
  const local = buildLocalFinalKnowledgeBase(stageSummaries);
  return {
    ...finalResult,
    main_events: mergeTimelineItems(finalResult.main_events, local.main_events, toMainEvent).slice(0, 24),
    branch_events: mergeTimelineItems(finalResult.branch_events, local.branch_events, toBranchEvent).filter(hasUsefulBranch).slice(0, 40)
  };
}

function mergeTimelineItems<T extends { title: string; chapter_range: string; summary?: string }>(primary: T[], coverage: T[], normalize: (item: Record<string, unknown>) => T) {
  const byKey = new Map<string, T>();
  for (const item of [...primary, ...coverage]) {
    const normalized = normalize(recordFromUnknown(item));
    const key = timelineKey(normalized);
    if (!key) continue;
    const previous = byKey.get(key);
    byKey.set(key, previous ? mergeTimelineItem(previous, normalized) : normalized);
  }
  return [...byKey.values()].sort((a, b) => chapterRangeStart(a.chapter_range) - chapterRangeStart(b.chapter_range));
}

function mergeTimelineItem<T extends { title: string; chapter_range: string; summary?: string }>(previous: T, next: T): T {
  return {
    ...previous,
    ...next,
    title: previous.title && !isPlaceholderTitle(previous.title) ? previous.title : next.title,
    chapter_range: mergeChapterRange(previous.chapter_range, next.chapter_range),
    summary: textFromUnknown(next.summary).length > textFromUnknown(previous.summary).length ? next.summary : previous.summary
  };
}

function timelineKey(item: { title: string; chapter_range: string; summary?: string }) {
  const title = normalizeTitleKey(item.title);
  if (title) return title;
  const summary = normalizeTitleKey(firstMeaningfulTitle(item.summary || "", item.chapter_range));
  return summary || item.chapter_range;
}

function normalizeTitleKey(value: string) {
  const text = value
    .replace(/\u672a\u547d\u540d\u652f\u7ebf|\u672a\u547d\u540d\u5927\u4e8b\u4ef6|\u672a\u547d\u540d\u4e8b\u4ef6/g, "")
    .replace(/[\u3002\uff0c\uff1a\uff1b\uff01\uff1f:;,.\s]/g, "")
    .trim();
  return text.slice(0, 30);
}

function isPlaceholderTitle(value: string) {
  return !value.trim() || /\u672a\u547d\u540d|unknown|untitled/i.test(value);
}

function hasUsefulBranch(branch: FinalKnowledgeBasePayload["branch_events"][number]) {
  return Boolean(branch.title.trim() || branch.summary.trim() || branch.chapter_range.trim());
}

function mergeChapterRange(a: string, b: string) {
  const start = Math.min(chapterRangeStart(a), chapterRangeStart(b));
  const end = Math.max(chapterRangeEnd(a), chapterRangeEnd(b));
  if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end > 0) return "\u7b2c" + start + "\u7ae0-\u7b2c" + end + "\u7ae0";
  return a || b;
}

function chapterRangeStart(value: string) {
  const numbers = chapterRangeNumbers(value);
  return numbers[0] ?? Number.MAX_SAFE_INTEGER;
}

function chapterRangeEnd(value: string) {
  const numbers = chapterRangeNumbers(value);
  return numbers[numbers.length - 1] ?? 0;
}

function chapterRangeNumbers(value: string) {
  return [...value.matchAll(/\d+/g)].map((match) => Number(match[0])).filter((item) => Number.isFinite(item));
}

function firstMeaningfulTitle(summary: string, chapterRange: string) {
  const cleaned = summary.replace(/\s+/g, " ").trim();
  if (cleaned) return cleaned.slice(0, 18);
  return chapterRange ? chapterRange + "??" : "";
}

function fillChunkPrompt(template: string, chapters: Chapter[], chapterRange: string, existingOutline: Record<string, string>) {
  return template
    .split("{{chapter_range}}").join(chapterRange)
    .split("{{selected_chapters}}").join(chaptersToPromptText(chapters))
    .split("{{existing_outline}}").join(JSON.stringify(existingOutline, null, 2));
}

function chaptersToPromptText(chapters: Chapter[]) {
  return chapters.map((chapter, index) => `第${index + 1}章：${chapter.title}\n${chapter.content}`).join("\n\n");
}

async function hashChunk(chapters: Chapter[], model: string, promptVersion: string, analysisMode: string) {
  const input = chapters.map((chapter) => `${chapter.id}\n${chapter.content}`).join("\n---chapter---\n") + model + promptVersion + analysisMode;
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function runParallel<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

function addUsage(...usages: Array<{ promptTokens: number; completionTokens: number; totalTokens: number }>) {
  return usages.reduce(
    (total, usage) => ({
      promptTokens: total.promptTokens + usage.promptTokens,
      completionTokens: total.completionTokens + usage.completionTokens,
      totalTokens: total.totalTokens + usage.totalTokens
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );
}

function compactStageSummary(group: unknown[], index: number) {
  const mainEvents: unknown[] = [];
  const protagonistGroup: unknown[] = [];
  const supportingCharacters: unknown[] = [];
  const worldFacts: unknown[] = [];
  const branchPlots: unknown[] = [];
  const conflicts: unknown[] = [];
  const foreshadowing: unknown[] = [];
  const twists: unknown[] = [];
  let chapterRange = "";

  for (const raw of group) {
    const item = recordFromUnknown(raw);
    chapterRange ||= textFromUnknown(item.chapter_range);

    if (item.stage1 || item.stage2 || item.stage3 || item.stage4) {
      const stage1 = recordFromUnknown(item.stage1);
      const stage2 = recordFromUnknown(item.stage2);
      const stage3 = recordFromUnknown(item.stage3);
      const stage4 = recordFromUnknown(item.stage4);
      chapterRange ||= textFromUnknown(stage1.chapter_range);
      mainEvents.push(...arrayFromUnknown(stage1.main_events));
      branchPlots.push(...arrayFromUnknown(stage1.branch_candidates));
      if (textFromUnknown(stage2.protagonist_name)) protagonistGroup.push({ name: textFromUnknown(stage2.protagonist_name), faction_relation: "主角本人", relationship_to_protagonist: "主角" });
      protagonistGroup.push(...arrayFromUnknown(stage2.protagonist_group));
      supportingCharacters.push(...arrayFromUnknown(stage2.supporting_characters));
      protagonistGroup.push(...arrayFromUnknown(stage3.characters));
      worldFacts.push(...worldbuildingToFacts(recordFromUnknown(stage4.worldbuilding)));
      worldFacts.push(...arrayFromUnknown(stage4.world_facts));
      conflicts.push(...arrayFromUnknown(stage4.conflicts));
      foreshadowing.push(...arrayFromUnknown(stage4.foreshadowing));
      twists.push(...arrayFromUnknown(stage4.twists));
    } else {
      mainEvents.push(...arrayFromUnknown(item.main_events));
      protagonistGroup.push(...arrayFromUnknown(item.protagonist_group_candidates));
      supportingCharacters.push(...arrayFromUnknown(item.supporting_characters));
      worldFacts.push(...arrayFromUnknown(item.world_facts));
      branchPlots.push(...arrayFromUnknown(item.branch_plots));
      conflicts.push(...arrayFromUnknown(item.conflicts));
    }
  }

  return {
    volume_or_stage_title: `阶段 ${index}`,
    chapter_range: chapterRange,
    main_events: dedupeObjectArray(mainEvents, ["title", "chapter_range"]).slice(0, 10),
    protagonist_group: mergeCharacters(protagonistGroup).slice(0, 16),
    supporting_characters: mergeCharacters(supportingCharacters).slice(0, 30),
    world_facts: dedupeObjectArray(worldFacts, ["title", "content"]).slice(0, 30),
    branch_plots: dedupeObjectArray(branchPlots, ["title", "chapter_range"]).slice(0, 24),
    conflicts: dedupeObjectArray(conflicts, ["type", "content"]).slice(0, 20),
    foreshadowing: dedupeText(arrayFromUnknown(foreshadowing).map(textFromUnknown)).slice(0, 12),
    twists: dedupeText(arrayFromUnknown(twists).map(textFromUnknown)).slice(0, 8)
  };
}

function worldbuildingToFacts(worldbuilding: Record<string, unknown>) {
  const facts: Record<string, unknown>[] = [];
  for (const item of splitKnowledgeText(textFromUnknown(worldbuilding.background))) facts.push({ title: item, content: item, category: "background" });
  for (const item of arrayFromUnknown(worldbuilding.social_structure).map(textFromUnknown).filter(Boolean)) facts.push({ title: item, content: item, category: "social_structure" });
  for (const item of arrayFromUnknown(worldbuilding.power_system).map(textFromUnknown).filter(Boolean)) facts.push({ title: item, content: item, category: "power_system" });
  for (const item of splitKnowledgeText(textFromUnknown(worldbuilding.protagonist_position))) facts.push({ title: item, content: item, category: "protagonist_position" });
  for (const item of arrayFromUnknown(worldbuilding.new_settings).map(textFromUnknown).filter(Boolean)) facts.push({ title: item, content: item, category: "new_setting" });
  return facts;
}

function buildLocalFinalKnowledgeBase(stageSummaries: unknown[]): FinalKnowledgeBasePayload {
  const mainEvents: unknown[] = [];
  const protagonistGroup: unknown[] = [];
  const supportingCharacters: unknown[] = [];
  const worldFacts: unknown[] = [];
  const branchEvents: unknown[] = [];
  const conflicts: unknown[] = [];
  const protagonistNames: string[] = [];

  for (const summary of stageSummaries) {
    const item = recordFromUnknown(summary);
    mainEvents.push(...arrayFromUnknown(item.main_events));
    protagonistGroup.push(...arrayFromUnknown(item.protagonist_group));
    supportingCharacters.push(...arrayFromUnknown(item.supporting_characters));
    worldFacts.push(...arrayFromUnknown(item.world_facts));
    branchEvents.push(...arrayFromUnknown(item.branch_plots || item.branch_events));
    conflicts.push(...arrayFromUnknown(item.conflicts));
    const protagonistName = textFromUnknown(item.protagonist_name);
    if (protagonistName) protagonistNames.push(protagonistName);
  }

  const mergedWorldFacts = dedupeObjectArray(worldFacts, ["title", "content"]);
  const classifiedWorld = classifyWorldFacts(mergedWorldFacts);
  const mergedMainEvents = dedupeObjectArray(mainEvents, ["title", "chapter_range"]).map(toMainEvent).slice(0, 12);
  const rawCoreCharacters = mergeCharacters(protagonistGroup);
  const rawSupportingCharacters = mergeCharacters(supportingCharacters);
  const protagonistName = inferProtagonistName(protagonistNames, rawCoreCharacters, rawSupportingCharacters, mergedMainEvents);
  const coreCharacters = buildProtagonistGroup(rawCoreCharacters, rawSupportingCharacters, protagonistName);
  const rejectedCoreNames = new Set(
    rawCoreCharacters
      .map((item) => textFromUnknown(item.name || item.character || item.title))
      .filter((name) => name && !coreCharacters.some((character) => character.name === name))
  );
  const supportingWithRejected = [
    ...rawSupportingCharacters,
    ...rawCoreCharacters.filter((item) => rejectedCoreNames.has(textFromUnknown(item.name || item.character || item.title)))
  ];

  return {
    worldbuilding: {
      background: classifiedWorld.background.join("\n"),
      social_structure: classifiedWorld.social_structure.slice(0, 8),
      power_system: classifiedWorld.power_system.slice(0, 8),
      protagonist_position: classifiedWorld.protagonist_position.slice(0, 8).join("\n"),
      new_settings: classifiedWorld.new_settings.slice(0, 8)
    },
    protagonist_group: coreCharacters.slice(0, 12),
    supporting_characters: mergeCharacters(supportingWithRejected).map(toSupportingCharacter).slice(0, 40),
    main_events: mergedMainEvents,
    branch_events: dedupeObjectArray(branchEvents, ["title", "chapter_range"]).map(toBranchEvent).slice(0, 30),
    conflicts: dedupeObjectArray(conflicts, ["type", "content"]).map(toConflictItem).filter((item) => item.status === "active" || item.status === "potential"),
    mindmap_suggestions: { nodes: [], edges: [] }
  };
}

function classifyWorldFacts(worldFacts: Record<string, unknown>[]) {
  const result = {
    background: [] as string[],
    social_structure: [] as string[],
    power_system: [] as string[],
    protagonist_position: [] as string[],
    new_settings: [] as string[]
  };

  for (const fact of worldFacts) {
    const title = textFromUnknown(fact.title || fact.name);
    const content = textFromUnknown(fact.content || fact.summary || fact.description || title);
    const value = compactOneLine(content || title);
    if (!value) continue;
    const category = normalizeWorldCategory(textFromUnknown(fact.category), `${title} ${content}`);
    result[category].push(value);
  }

  return {
    background: dedupeKnowledgeLines(result.background).slice(0, 8),
    social_structure: dedupeKnowledgeLines(result.social_structure).slice(0, 8),
    power_system: dedupeKnowledgeLines(result.power_system).slice(0, 8),
    protagonist_position: dedupeKnowledgeLines(result.protagonist_position).slice(0, 8),
    new_settings: dedupeKnowledgeLines(result.new_settings).slice(0, 8)
  };
}

function normalizeWorldCategory(category: string, text: string): "background" | "social_structure" | "power_system" | "protagonist_position" | "new_settings" {
  const raw = category.toLowerCase();
  if (["social_structure", "organization", "organisation", "rule", "hierarchy", "class", "society", "government", "church", "guild", "association"].includes(raw)) return "social_structure";
  if (["power_system", "magic", "artifact", "race", "supernatural", "ability", "ritual", "relic", "monster"].includes(raw)) return "power_system";
  if (["protagonist_position", "protagonist_identity", "protagonist_status", "economy", "rank", "identity"].includes(raw)) return "protagonist_position";
  if (["background", "history", "location", "era"].includes(raw)) return "background";
  if (/\u534f\u4f1a|\u6559\u4f1a|\u653f\u5e9c|\u5b66\u9662|\u8d35\u65cf|\u90aa\u6559|\u7ec4\u7ec7|\u5236\u5ea6|\u9636\u5c42|\u804c\u4e1a|\u76d1\u7ba1|\u6536\u5bb9|\u5bb6\u65cf|\u516c\u4f1a/.test(text)) return "social_structure";
  if (/\u9b54\u6cd5|\u9b54\u5973|\u5deb\u5e08|\u7b49\u7ea7|\u6536\u5bb9\u7269|\u795e\u660e|\u7737\u5c5e|\u8840\u65cf|\u79d8\u5883|\u4eea\u5f0f|\u6c61\u67d3|\u68a6\u5883|\u80fd\u529b|\u9053\u5177|\u9b54\u5bfc|\u8d85\u51e1/.test(text)) return "power_system";
  if (/\u4e3b\u89d2|\u8389\u5a1c|\u8eab\u4efd|\u9636\u5c42|\u5b66\u5f92|\u6b63\u5f0f\u9b54\u5973|\u8d2b\u56f0|\u7ecf\u6d4e|\u6536\u5165|\u59d4\u6258|\u9635\u8425|\u6240\u5c5e|\u8ba4\u8bc1|\u7b49\u7ea7/.test(text)) return "protagonist_position";
  if (/\u65b0\u5386|\u65f6\u4ee3|\u57ce\u5e02|\u5c0f\u9547|\u8fb9\u5883|\u738b\u56fd|\u5e1d\u56fd|\u5730\u533a|\u4e16\u754c/.test(text)) return "background";
  return "new_settings";
}

function inferProtagonistName(names: string[], coreItems: Record<string, unknown>[], supportingItems: Record<string, unknown>[], events: FinalKnowledgeBasePayload["main_events"]) {
  const explicit = names.find(Boolean);
  if (explicit) return explicit;
  const coreName = coreItems.map((item) => textFromUnknown(item.name || item.character || item.title)).find(Boolean);
  if (coreName) return coreName;
  const scores = new Map<string, number>();
  const knownNames = [...coreItems, ...supportingItems].map((item) => textFromUnknown(item.name || item.character || item.title)).filter(Boolean);
  for (const event of events) {
    for (const name of event.related_characters) scores.set(name, (scores.get(name) ?? 0) + 1);
    const actionText = `${event.summary} ${event.result} ${event.conflict_summary}`;
    for (const name of knownNames) {
      if (name && actionText.includes(name)) scores.set(name, (scores.get(name) ?? 0) + 2);
    }
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function buildProtagonistGroup(coreItems: Record<string, unknown>[], supportingItems: Record<string, unknown>[], protagonistName: string) {
  const result: FinalKnowledgeBasePayload["protagonist_group"] = [];
  for (const raw of coreItems) {
    const character = toCoreCharacter(raw);
    if (!character.name) continue;
    if (character.name === protagonistName || isAllowedCoreGroupMember(raw, character)) result.push(character);
  }
  if (protagonistName && !result.some((item) => item.name === protagonistName)) {
    const source = [...coreItems, ...supportingItems].find((item) => textFromUnknown(item.name || item.character || item.title) === protagonistName) ?? { name: protagonistName };
    result.unshift(toCoreCharacter({ ...source, name: protagonistName, faction_relation: textFromUnknown(source.faction_relation) || "\u4e3b\u89d2\u672c\u4eba", relationship_to_protagonist: "\u4e3b\u89d2" }));
  }
  return mergeCharacters(result).map(toCoreCharacter);
}

function isAllowedCoreGroupMember(raw: Record<string, unknown>, character: FinalKnowledgeBasePayload["protagonist_group"][number]) {
  if (boolFromUnknown(raw.is_hostile)) return false;
  const relationText = `${character.faction_relation} ${character.relationship_to_protagonist} ${textFromUnknown(raw.reason)} ${textFromUnknown(raw.camp_relation)} ${textFromUnknown(raw.faction)} ${textFromUnknown(raw.camp)}`;
  if (/\u654c\u5bf9|\u53cd\u6d3e|\u90aa\u6559|\u654c\u4eba|\u5bf9\u7acb|\u76d1\u7ba1\u8005|\u59d4\u6258\u4eba|\u65c1\u89c2|\u4e34\u65f6|\u4e0d\u7a33\u5b9a|\u5229\u7528|\u5a01\u80c1|\u5165\u4fb5/.test(relationText)) return false;
  return /\u540c\u9635\u8425|\u540c\u884c|\u957f\u671f|\u5408\u4f5c|\u540c\u76df|\u961f\u53cb|\u642d\u6863|\u4f19\u4f34|\u4e3b\u89d2\u56e2|\u6838\u5fc3|\u5171\u540c\u63a8\u8fdb|\u7a33\u5b9a|\u76df\u53cb|\u4e3b\u89d2\u672c\u4eba|\u4e3b\u89d2/.test(relationText);
}

function compactOneLine(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[-*?\s]+/, "").trim();
}

function dedupeKnowledgeLines(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items.map(compactOneLine).filter(Boolean)) {
    const key = item.replace(/[\u3002\uff0c\uff1a\uff1b\uff01\uff1f:;,.\s]/g, "").slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function toCoreCharacter(item: Record<string, unknown>): FinalKnowledgeBasePayload["protagonist_group"][number] {
  return {
    name: textFromUnknown(item.name),
    identity: textFromUnknown(item.identity || item.role),
    social_class: textFromUnknown(item.social_class || item.class),
    faction_relation: textFromUnknown(item.faction_relation || item.camp_relation || item.faction || item.camp),
    relationship_to_protagonist: textFromUnknown(item.relationship_to_protagonist || item.relationship),
    gender: textFromUnknown(item.gender || item.sex),
    hair_color: textFromUnknown(item.hair_color || item.hair),
    eye_color: textFromUnknown(item.eye_color || item.eyes),
    body_type: textFromUnknown(item.body_type || item.figure || item.body),
    clothing_style: textFromUnknown(item.clothing_style || item.clothing_habit || item.clothing),
    appearance: textFromUnknown(item.appearance || item.appearance_features || item.description),
    personality: arrayFromUnknown(item.personality).map(textFromUnknown).filter(Boolean),
    action_logic: arrayFromUnknown(item.action_logic).map(textFromUnknown).filter(Boolean),
    current_goal: textFromUnknown(item.current_goal || item.goal),
    current_state: textFromUnknown(item.current_state || item.current_status || item.status),
    speech_style: textFromUnknown(item.speech_style),
    quote_example: textFromUnknown(item.quote_example || item.sample_line || item.example_line || item.line)
  };
}

function toSupportingCharacter(item: Record<string, unknown>): FinalKnowledgeBasePayload["supporting_characters"][number] {
  return {
    name: textFromUnknown(item.name),
    identity: textFromUnknown(item.identity || item.role),
    relationship_to_protagonist: textFromUnknown(item.relationship_to_protagonist || item.relationship),
    faction: textFromUnknown(item.faction || item.camp),
    current_role: textFromUnknown(item.current_role || item.current_status || item.status),
    current_state: textFromUnknown(item.current_state || item.current_status || item.status),
    is_dead: boolFromUnknown(item.is_dead),
    death_info: textFromUnknown(item.death_info)
  };
}

function toMainEvent(item: Record<string, unknown>): FinalKnowledgeBasePayload["main_events"][number] {
  return {
    title: textFromUnknown(item.title || item.name || item.summary),
    chapter_range: textFromUnknown(item.chapter_range),
    summary: textFromUnknown(item.summary || item.content),
    result: textFromUnknown(item.result),
    related_characters: arrayFromUnknown(item.related_characters || item.characters || item.related_roles).map(textFromUnknown).filter(Boolean),
    conflict_summary: textFromUnknown(item.conflict_summary || item.conflict || item.conflicts)
  };
}

function toBranchEvent(item: Record<string, unknown>): FinalKnowledgeBasePayload["branch_events"][number] {
  const summary = textFromUnknown(item.summary || item.content);
  const chapterRange = textFromUnknown(item.chapter_range);
  const title = textFromUnknown(item.title || item.name) || firstMeaningfulTitle(summary, chapterRange);
  return {
    title,
    chapter_range: chapterRange,
    status: textFromUnknown(item.status) || "new",
    summary,
    related_characters: arrayFromUnknown(item.related_characters || item.characters).map(textFromUnknown).filter(Boolean)
  };
}

function toConflictItem(item: Record<string, unknown>): FinalKnowledgeBasePayload["conflicts"][number] {
  const type = textFromUnknown(item.type);
  const status = textFromUnknown(item.status);
  return {
    type: ["protagonist", "interpersonal", "social", "class", "system", "potential"].includes(type) ? (type as FinalKnowledgeBasePayload["conflicts"][number]["type"]) : "potential",
    content: textFromUnknown(item.content || item.summary),
    related_main_event: textFromUnknown(item.related_main_event),
    status: ["active", "resolved", "potential"].includes(status) ? (status as FinalKnowledgeBasePayload["conflicts"][number]["status"]) : "active"
  };
}

function dedupeObjectArray(items: unknown[], keys: string[]) {
  const seen = new Set<string>();
  const result: Record<string, unknown>[] = [];
  for (const item of items) {
    const record = recordFromUnknown(item);
    const key = keys.map((field) => textFromUnknown(record[field])).join("|").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(record);
  }
  return result;
}

function mergeCharacters(items: unknown[]) {
  const byName = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const record = recordFromUnknown(item);
    const name = textFromUnknown(record.name || record.character || record.title);
    if (!name) continue;
    const previous = byName.get(name) ?? {};
    byName.set(name, mergePreferFilled(previous, { ...record, name }));
  }
  return [...byName.values()];
}

function mergePreferFilled(previous: Record<string, unknown>, next: Record<string, unknown>) {
  const merged = { ...previous };
  for (const [key, value] of Object.entries(next)) {
    if (Array.isArray(value)) {
      const current = Array.isArray(merged[key]) ? (merged[key] as unknown[]) : [];
      merged[key] = dedupeText([...current.map(textFromUnknown), ...value.map(textFromUnknown)]);
      continue;
    }
    const nextText = textFromUnknown(value);
    const previousText = textFromUnknown(merged[key]);
    if (!previousText || nextText.length > previousText.length) merged[key] = value;
  }
  return merged;
}

function formatChapterRangeFromChapters(chapters: Chapter[], allSelected: Chapter[]) {
  if (chapters.length === 0) return "";
  const first = allSelected.findIndex((chapter) => chapter.id === chapters[0].id) + 1;
  const last = allSelected.findIndex((chapter) => chapter.id === chapters[chapters.length - 1].id) + 1;
  return `第${first}章-第${last}章`;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayFromUnknown(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function textFromUnknown(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function boolFromUnknown(value: unknown) {
  if (typeof value === "boolean") return value;
  return ["true", "yes", "是", "已死亡", "死亡"].includes(textFromUnknown(value).trim());
}

function fillStage1Prompt(template: string, chapters: Chapter[], outlineState?: OutlineState) {
  const selectedChapters = chapters.map((chapter, index) => `第${index + 1}章：${chapter.title}\n${chapter.content}`).join("\n\n");
  const existingOutline = Object.fromEntries((outlineState?.textSections ?? []).map((section) => [section.sectionType, section.content]));
  return template
    .split("{{selected_chapters}}")
    .join(selectedChapters)
    .split("{{existing_outline}}")
    .join(JSON.stringify(existingOutline, null, 2));
}

function fillStage3Prompt(template: string, chapters: Chapter[], stage1Result: Stage1PlotPayload, candidates: string[]) {
  const selectedChapters = chapters.map((chapter, index) => `第${index + 1}章：${chapter.title}\n${chapter.content}`).join("\n\n");
  return template
    .split("{{selected_chapters}}")
    .join(selectedChapters)
    .split("{{stage_1_result}}")
    .join(JSON.stringify(stage1Result, null, 2))
    .split("{{character_candidates}}")
    .join(JSON.stringify(candidates, null, 2));
}

function extractJsonText(raw: string) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end >= start ? raw.slice(start, end + 1) : raw;
}

function upsert<T>(items: T[], value: T, predicate: (item: T) => boolean) {
  const index = items.findIndex(predicate);
  if (index < 0) return [...items, value];
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function replaceById<T extends { id: string }>(items: T[], value: T) {
  const index = items.findIndex((item) => item.id === value.id);
  if (index >= 0) items[index] = value;
  else items.push(value);
}

type GeneratedMindNodeDraft = {
  description: string;
  nodeType: OutlineNodeType;
  title: string;
  x: number;
  y: number;
};

function parseOutlineTitles(content: string, nodeType: OutlineNodeType, startX: number, startY: number, limit = 99): GeneratedMindNodeDraft[] {
  return content
    .split(/\n(?=##\s+)/)
    .map((block) => block.trim())
    .map((block, index) => {
      const title = block.match(/^##\s+(.+)$/m)?.[1]?.trim();
      if (!title) return undefined;
      return {
        title: title.replace(/^事件\d+[：:]\s*/, ""),
        description: block,
        nodeType,
        x: startX + (nodeType === "main_plot" ? index * 230 : index * 190),
        y: startY + (nodeType === "branch_plot" ? Math.floor(index / 4) * 150 : 0)
      };
    })
    .filter((item): item is GeneratedMindNodeDraft => Boolean(item))
    .slice(0, limit);
}

function parseKeywordNodes(
  content: string,
  nodeType: OutlineNodeType,
  startX: number,
  startY: number,
  limit: number,
  keywords?: string[]
): GeneratedMindNodeDraft[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*#\s]+/, "").trim())
    .filter(Boolean);
  const picked = lines.filter((line) => !keywords || keywords.some((keyword) => line.includes(keyword)));
  const source = picked.length > 0 ? picked : lines;
  return dedupeText(source)
    .slice(0, limit)
    .map((line, index) => ({
      title: compactTitle(line),
      description: line,
      nodeType,
      x: startX + (index % 4) * 210,
      y: startY + Math.floor(index / 4) * 130
    }));
}

function parseCharacterNodes(content: string, startX: number, startY: number, limit: number, nodeType: OutlineNodeType = "role"): GeneratedMindNodeDraft[] {
  const names = [...content.matchAll(/^##\s+(.+)$/gm)]
    .map((match) => match[1]?.trim())
    .filter(Boolean)
    .filter((name) => !["主线剧情", "支线剧情", "矛盾冲突", "世界观", "角色线索"].includes(name));
  return dedupeText(names)
    .slice(0, limit)
    .map((name, index) => ({
      title: name,
      description: `关键人物：${name}`,
      nodeType,
      x: startX + (index % 6) * 190,
      y: startY + Math.floor(index / 6) * 130
    }));
}

function layoutGeneratedDrafts(drafts: GeneratedMindNodeDraft[]) {
  return layoutMindmapNodes(drafts, [], "detailed");
}

function layoutMindmapNodes(
  drafts: GeneratedMindNodeDraft[],
  _edges: Array<{ sourceTitle: string; targetTitle: string; edgeType: string; label: string }>,
  mode: MindMapGenerateMode
) {
  const counters = new Map<OutlineNodeType, number>();
  const limited = limitDraftsByMode(drafts, mode);
  const positioned = limited.map((draft) => {
    const index = counters.get(draft.nodeType) ?? 0;
    counters.set(draft.nodeType, index + 1);
    if (draft.nodeType === "main_plot") return { ...draft, x: 260 + index * 240, y: 320 };
    if (draft.nodeType === "branch_plot") return { ...draft, x: 260 + (index % 8) * 220, y: 520 + Math.floor(index / 8) * 150 };
    if (draft.nodeType === "world") return { ...draft, x: 260 + (index % 6) * 220, y: 100 + Math.floor(index / 6) * 130 };
    if (draft.nodeType === "conflict") return { ...draft, x: 300 + (index % 6) * 220, y: 700 + Math.floor(index / 6) * 140 };
    if (draft.nodeType === "foreshadowing" || draft.nodeType === "twist") return { ...draft, x: 420 + (index % 6) * 220, y: 180 + Math.floor(index / 6) * 130 };
    if (["protagonist_group", "protagonist", "main_character", "supporting_character", "role"].includes(draft.nodeType)) {
      return { ...draft, x: 80, y: 160 + index * 140 };
    }
    return { ...draft, x: 300 + (index % 6) * 220, y: 840 + Math.floor(index / 6) * 140 };
  });
  return resolveNodeOverlaps(positioned);
}

function limitDraftsByMode(drafts: GeneratedMindNodeDraft[], mode: MindMapGenerateMode) {
  const limits: Partial<Record<OutlineNodeType, number>> =
    mode === "rough"
      ? { main_plot: 8, branch_plot: 6, conflict: 5, world: 4, protagonist_group: 1, main_character: 1 }
      : { main_plot: 12, branch_plot: 16, conflict: 10, world: 8, protagonist_group: 12, protagonist: 12, supporting_character: 20, role: 20, foreshadowing: 12, twist: 8 };
  const counters = new Map<OutlineNodeType, number>();
  const totalLimit = mode === "rough" ? 20 : 60;
  const result: GeneratedMindNodeDraft[] = [];
  for (const draft of drafts) {
    const count = counters.get(draft.nodeType) ?? 0;
    const limit = limits[draft.nodeType] ?? totalLimit;
    if (count >= limit || result.length >= totalLimit) continue;
    counters.set(draft.nodeType, count + 1);
    result.push(draft);
  }
  return result;
}

function resolveNodeOverlaps(nodes: GeneratedMindNodeDraft[]) {
  const result = nodes.map((node) => ({ ...node, x: Math.max(0, node.x), y: Math.max(0, node.y) }));
  for (let pass = 0; pass < 24; pass += 1) {
    let changed = false;
    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        const a = result[i];
        const b = result[j];
        if (Math.abs(a.x - b.x) < 220 && Math.abs(a.y - b.y) < 130) {
          b.x += 220;
          b.y += 130;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return result;
}

function pickMindmapOutlineSources(outlineByType: Record<string, string>, sources: MindMapGenerateSource[]) {
  const result: Record<string, string> = {};
  for (const source of sources) {
    const value = outlineByType[source];
    if (value?.trim()) result[source] = value;
  }
  return result;
}

function fillMindmapPrompt(
  template: string,
  outlineText: Record<string, string>,
  outlineState: OutlineState | undefined,
  options: MindMapGenerateOptions
) {
  const existingMindmap = {
    nodes: (outlineState?.mindNodes ?? []).map((node) => ({ node_type: node.nodeType, title: node.title, description: node.description })),
    edges: (outlineState?.mindEdges ?? []).map((edge) => ({ source_node_id: edge.sourceNodeId, target_node_id: edge.targetNodeId, edge_type: edge.edgeType, label: edge.label ?? "" }))
  };
  return template
    .split("{{generation_mode}}").join(options.mode === "rough" ? "大致思维导图" : "详细思维导图")
    .split("{{source_names}}").join(options.sources.join(", "))
    .split("{{outline_text}}").join(JSON.stringify(outlineText, null, 2))
    .split("{{existing_mindmap}}").join(JSON.stringify(existingMindmap, null, 2));
}

function normalizeMindmapPayload(payload: MindmapGenerationPayload, mode: MindMapGenerateMode) {
  const warnings: string[] = [];
  const nodes = payload.nodes.map((node, index) => ({
    title: node.title || `未命名节点${index + 1}`,
    description: node.description,
    nodeType: toOutlineNodeType(node.node_type),
    x: 0,
    y: 0
  }));
  const edges = payload.edges
    .map((edge) => ({
      sourceTitle: edge.source_title,
      targetTitle: edge.target_title,
      edgeType: edge.edge_type,
      label: edge.label
    }))
    .filter((edge) => {
      const valid = Boolean(edge.sourceTitle && edge.targetTitle);
      if (!valid) warnings.push("跳过缺少 source_title/target_title 的关联线");
      return valid;
    });
  return { nodes: limitDraftsByMode(dedupeDraftNodes(nodes, mode), mode), edges, warnings };
}

function toOutlineNodeType(value: string): OutlineNodeType {
  if (value === "protagonist_group" || value === "protagonist" || value === "supporting_character") return value;
  if (value === "world" || value === "main_plot" || value === "branch_plot" || value === "foreshadowing" || value === "twist" || value === "conflict") return value;
  return "main_plot";
}

function dedupeDraftNodes(drafts: GeneratedMindNodeDraft[], mode: MindMapGenerateMode) {
  const seen = new Set<string>();
  const result: GeneratedMindNodeDraft[] = [];
  for (const draft of drafts) {
    const key = mindNodeKey(draft.title, draft.nodeType);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(draft);
  }
  return limitDraftsByMode(result, mode);
}

function compactTitle(value: string) {
  return value
    .replace(/^(名称|事件概述|结果|简介|当前状态|章节范围|涉及角色|主角个人矛盾|人际矛盾|社会矛盾|阶级\/阶层矛盾|制度矛盾|潜在矛盾)[:：]\s*/, "")
    .slice(0, 28)
    .trim() || "未命名节点";
}

function mindNodeKey(title: string, nodeType: OutlineNodeType) {
  return `${nodeType}:${title.trim().toLowerCase()}`;
}

function normalizeTitle(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, "");
}

function findNearestMainNode(node: OutlineMindNode, mainNodes: OutlineMindNode[]) {
  return [...mainNodes].sort((a, b) => Math.abs(a.x - node.x) - Math.abs(b.x - node.x))[0];
}

async function createMindEdgeIfMissing(
  projectId: string,
  source: OutlineMindNode,
  target: OutlineMindNode,
  edgeType: string,
  label: string,
  edges: OutlineMindEdge[]
) {
  const existing = edges.find((edge) => edge.sourceNodeId === source.id && edge.targetNodeId === target.id);
  if (existing) return { edge: existing, created: false };
  const created = await createOutlineMindEdge(projectId, source.id, target.id);
  const saved = edgeType === "related" && !label ? created : await updateOutlineMindEdge({ ...created, edgeType, label });
  edges.push(saved);
  return { edge: saved, created: true };
}

async function persistGeneratedMindMap(
  projectId: string,
  outlineState: OutlineState | undefined,
  options: MindMapGenerateOptions,
  drafts: GeneratedMindNodeDraft[],
  requestedEdges: Array<{ sourceTitle: string; targetTitle: string; edgeType: string; label: string }>,
  updateProgress: (percent: number, step: string, detail: string) => Promise<void>
) {
  let createdNodes = 0;
  let createdEdges = 0;
  let nextNodes = [...(outlineState?.mindNodes ?? [])];
  let nextEdges = [...(outlineState?.mindEdges ?? [])];
  const warnings: string[] = [];

  if (options.strategy === "replace") {
    await updateProgress(70, "写入数据库", "正在清空旧导图...");
    await clearOutlineMindMap(projectId);
    nextNodes = [];
    nextEdges = [];
  }

  await updateProgress(76, "去重节点", "正在检查同名节点...");
  const nodesByKey = new Map(nextNodes.map((node) => [mindNodeKey(node.title, node.nodeType), node]));
  const generatedNodes: OutlineMindNode[] = [];
  for (const [index, draft] of drafts.entries()) {
    await updateProgress(76 + Math.round((index / drafts.length) * 10), "写入数据库", `正在写入第 ${index + 1} / ${drafts.length} 个节点：${draft.title}`);
    const key = mindNodeKey(draft.title, draft.nodeType);
    const existing = nodesByKey.get(key);
    if (existing) {
      const description = existing.description.trim().length >= draft.description.trim().length ? existing.description : draft.description;
      const updated = await updateOutlineMindNode({ ...existing, description, x: draft.x, y: draft.y });
      nodesByKey.set(key, updated);
      replaceById(nextNodes, updated);
      generatedNodes.push(updated);
      continue;
    }
    const created = await createOutlineMindNode(projectId, draft.nodeType, draft.title, draft.description, draft.x, draft.y);
    createdNodes += 1;
    nodesByKey.set(key, created);
    nextNodes.push(created);
    generatedNodes.push(created);
  }

  await updateProgress(90, "生成关联线", "正在写入节点关联线...");
  const byTitle = new Map(nextNodes.map((node) => [normalizeTitle(node.title), node]));
  const mainNodes = generatedNodes.filter((node) => node.nodeType === "main_plot");
  for (let index = 0; index < mainNodes.length - 1; index += 1) {
    const result = await createMindEdgeIfMissing(projectId, mainNodes[index], mainNodes[index + 1], "leads_to", "", nextEdges);
    if (result.created) createdEdges += 1;
  }
  for (const requested of requestedEdges) {
    const source = byTitle.get(normalizeTitle(requested.sourceTitle));
    const target = byTitle.get(normalizeTitle(requested.targetTitle));
    if (!source || !target) {
      warnings.push(`跳过关联：${requested.sourceTitle} -> ${requested.targetTitle}`);
      continue;
    }
    const result = await createMindEdgeIfMissing(projectId, source, target, requested.edgeType, requested.label, nextEdges);
    if (result.created) createdEdges += 1;
  }
  return { createdNodes, createdEdges, nodes: nextNodes, edges: nextEdges, generatedNodes, warnings };
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "小说";
}

async function renderMindMapPng(nodes: OutlineMindNode[], edges: OutlineMindEdge[]) {
  const width = Math.ceil(Math.max(...nodes.map((node) => node.x + 240), 900));
  const height = Math.ceil(Math.max(...nodes.map((node) => node.y + 160), 600));
  const svg = renderMindMapSvg(nodes, edges, width, height);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建图片画布");
    context.fillStyle = "#fbf8f2";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0);
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => (nextBlob ? resolve(nextBlob) : reject(new Error("PNG 导出失败"))), "image/png");
    });
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片渲染失败"));
    image.src = url;
  });
}

function renderMindMapSvg(nodes: OutlineMindNode[], edges: OutlineMindEdge[], width: number, height: number) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edgeMarkup = edges
    .map((edge) => {
      const source = nodeMap.get(edge.sourceNodeId);
      const target = nodeMap.get(edge.targetNodeId);
      if (!source || !target) return "";
      const startX = source.x + NODE_WIDTH;
      const startY = source.y + NODE_HEIGHT / 2;
      const endX = target.x;
      const endY = target.y + NODE_HEIGHT / 2;
      const curve = Math.max(80, Math.abs(endX - startX) / 2);
      return `<path d="M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}" fill="none" stroke="#b98649" stroke-width="3" marker-end="url(#arrow)" />`;
    })
    .join("");
  const nodeMarkup = nodes
    .map(
      (node) => `<g transform="translate(${node.x}, ${node.y})">
        <rect width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="8" fill="#fffdf9" stroke="#79a89b" stroke-width="2" />
        <text x="12" y="22" font-size="12" fill="#5f8f83">${escapeXml(node.nodeType)}</text>
        <text x="12" y="45" font-size="16" font-weight="700" fill="#2f3437">${escapeXml(node.title)}</text>
        <text x="12" y="66" font-size="11" fill="#6f6a62">${escapeXml(node.description.slice(0, 22))}</text>
      </g>`
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#ece6dc" stroke-width="1"/></pattern>
      <marker id="arrow" markerHeight="10" markerWidth="10" orient="auto" refX="9" refY="5" viewBox="0 0 10 10"><path d="M 0 0 L 10 5 L 0 10 z" fill="#b98649" /></marker>
    </defs>
    <rect width="100%" height="100%" fill="#fbf8f2"/><rect width="100%" height="100%" fill="url(#grid)"/>${edgeMarkup}${nodeMarkup}
  </svg>`;
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" }[char] ?? char));
}

function buildStage1OutlineUpdates(batches: Stage1PlotPayload[], characterDetailBatches: Stage3CharacterDetailsPayload[] = []) {
  const events = dedupeBy(batches.flatMap((batch) => batch.main_events), (event) => `${event.title}|${event.chapter_range}`);
  const branches = dedupeBy(batches.flatMap((batch) => batch.branch_candidates), (branch) => branch.title);
  const characters = dedupeText(batches.flatMap((batch) => batch.important_characters));
  const factionChanges = dedupeText(batches.flatMap((batch) => batch.faction_change_candidates));
  const keyMarkers = dedupeText(batches.flatMap((batch) => batch.key_event_markers));
  const plotProgress = dedupeText(batches.map((batch) => batch.main_plot_progress).filter(Boolean));
  const conflicts = dedupeText(events.map((event) => event.conflict_summary).filter(Boolean));
  const worldClues = dedupeText([...events.flatMap((event) => [event.plot_progress, event.result, event.conflict_summary]), ...keyMarkers, ...branches.map((branch) => branch.summary)].filter(Boolean));
  const protagonistCandidates = pickProtagonistCandidates(characters, events);
  const detailedMainCharacters = dedupeBy(characterDetailBatches.flatMap((batch) => batch.characters).filter((character) => character.is_core_group), (character) => character.name);

  return {
    world: ["# 世界背景", "", ...worldClues.map((item) => `* ${item}`), "", "# 社会结构", "", "", "# 力量体系", "", "", "# 主角身份与阶层", "", "", "# 新增设定", "", ...keyMarkers.map((item) => `* ${item}`)].join("\n").trim(),
    mainCharacters: renderMainCharacters(detailedMainCharacters, protagonistCandidates),
    mainPlot: ["# 主线剧情", "", ...events.flatMap((event, index) => [`## 事件${index + 1}：${event.title || "未命名事件"}`, "", "章节范围：", event.chapter_range || "未明确", "", "事件概述：", event.summary || "未明确", "", "主角行动：", event.protagonist_action || "未明确", "", "剧情推进：", event.plot_progress || "未明确", "", "结果：", event.result || "未明确", "", "涉及角色：", event.related_characters.length > 0 ? event.related_characters.join("、") : "未明确", "", "---", ""]), "# 当前主线推进", "", ...plotProgress.map((item) => `* ${item}`), "", "# 关键事件标记", "", ...keyMarkers.map((item) => `* ${item}`)].join("\n").trim(),
    branchPlot: ["# 支线剧情", "", ...branches.flatMap((branch) => [`## ${branch.title || "未命名支线"}`, "", "章节范围：", formatChapterList(branch.chapters), "", "当前状态：", branch.status, "", "简介：", branch.summary || "未明确", "", "涉及角色：", branch.related_characters.length > 0 ? branch.related_characters.join("、") : "未明确", "", "需要后续回收：", branch.need_follow_up ? "是" : "否", "", "---", ""])].join("\n").trim(),
    roles: ["# 角色线索", "", "## 重要角色", "", ...characters.map((character) => `* ${character}`), "", "## 阵营或状态变化", "", ...factionChanges.map((change) => `* ${change}`)].join("\n").trim(),
    conflicts: ["# 矛盾冲突", "", "## 本次解析提取", "", ...conflicts.map((conflict) => `* ${conflict}`)].join("\n").trim()
  };
}

function renderFinalKnowledgeBase(result: FinalKnowledgeBasePayload) {
  const activeConflicts = result.conflicts.filter((item) => item.status === "active" || item.status === "potential");
  const conflictsByType = (type: string) =>
    activeConflicts
      .filter((item) => item.type === type)
      .map((item) => `* ${item.content}${item.related_main_event ? `（关联：${item.related_main_event}）` : ""}`);
  const bullets = (items: string[], limit = 8) => dedupeKnowledgeLines(items.flatMap(splitKnowledgeText)).slice(0, limit).map((item) => `* ${item}`);
  const protagonistPosition = splitKnowledgeText(result.worldbuilding.protagonist_position);

  return {
    world: [
      "# 世界背景",
      "",
      ...bullets([result.worldbuilding.background], 8),
      "",
      "# 社会结构",
      "",
      ...bullets(result.worldbuilding.social_structure, 8),
      "",
      "# 力量体系",
      "",
      ...bullets(result.worldbuilding.power_system, 8),
      "",
      "# 主角身份与阶层",
      "",
      ...bullets(protagonistPosition, 8),
      "",
      "# 新增设定",
      "",
      ...bullets(result.worldbuilding.new_settings, 8)
    ].join("\n").trim(),
    mainCharacters: [
      "# 主角团",
      "",
      ...result.protagonist_group.flatMap((character) => [
        `## ${character.name || "未命名角色"}`,
        "",
        `身份：${character.identity}`,
        `阶层：${character.social_class}`,
        `阵营关系：${character.faction_relation}`,
        `与主角关系：${character.relationship_to_protagonist}`,
        `性别：${character.gender}`,
        `发色：${character.hair_color}`,
        `瞳色：${character.eye_color}`,
        `身材：${character.body_type}`,
        `穿着习惯：${character.clothing_style}`,
        `外貌特征：${character.appearance}`,
        `性格：${character.personality.join("；")}`,
        `行动逻辑：${character.action_logic.join("；")}`,
        `当前目标：${character.current_goal}`,
        `当前状态：${character.current_state}`,
        `角色台词示例：${character.quote_example}`,
        "",
        "---",
        ""
      ])
    ].join("\n").trim(),
    roles: [
      "# 配角",
      "",
      ...result.supporting_characters.flatMap((character) => [
        `## ${character.name || "未命名角色"}`,
        "",
        `身份：${character.identity}`,
        `与主角关系：${character.relationship_to_protagonist}`,
        `阵营：${character.faction}`,
        `当前状态：${character.current_state || character.current_role}`,
        `是否死亡：${character.is_dead ? "是" : "否"}`,
        `死亡信息：${character.death_info}`,
        "",
        "---",
        ""
      ])
    ].join("\n").trim(),
    mainPlot: [
      "# 主线剧情概述",
      "",
      result.main_events.map((event) => event.summary).filter(Boolean).slice(0, 3).join("\n\n"),
      "",
      ...result.main_events.flatMap((event) => [
        `## ${event.title || "未命名大事件"}`,
        "",
        "章节范围：",
        event.chapter_range,
        "",
        "概述：",
        event.summary,
        "",
        "结果：",
        event.result,
        "",
        "相关角色：",
        event.related_characters.join("、"),
        "",
        "矛盾摘要：",
        event.conflict_summary,
        "",
        "---",
        ""
      ])
    ].join("\n").trim(),
    branchPlot: [
      "# 支线剧情",
      "",
      ...result.branch_events.flatMap((branch) => [
        `## ${branch.title || "未命名支线"}`,
        "",
        "章节范围：",
        branch.chapter_range,
        "",
        "当前状态：",
        branch.status,
        "",
        "涉及角色：",
        branch.related_characters.join("、"),
        "",
        "简介：",
        branch.summary,
        "",
        "后续是否需要回收：",
        branch.status === "resolved" ? "否" : "是",
        "",
        "---",
        ""
      ])
    ].join("\n").trim(),
    conflicts: [
      "# 主角个人矛盾",
      "",
      ...conflictsByType("protagonist"),
      "",
      "# 人际矛盾",
      "",
      ...conflictsByType("interpersonal"),
      "",
      "# 社会矛盾",
      "",
      ...conflictsByType("social"),
      "",
      "# 阶级/阶层矛盾",
      "",
      ...conflictsByType("class"),
      "",
      "# 制度矛盾",
      "",
      ...conflictsByType("system"),
      "",
      "# 潜在矛盾",
      "",
      ...conflictsByType("potential")
    ].join("\n").trim()
  };
}

function splitKnowledgeText(value: string) {
  return value
    .split(/\n|[；;]/)
    .map((item) => item.replace(/^[-*•\s]+/, "").trim())
    .filter(Boolean);
}

function dedupeBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = getKey(item).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function dedupeText(items: string[]) {
  return dedupeBy(items.map((item) => item.trim()).filter(Boolean), (item) => item);
}

function pickProtagonistCandidates(characters: string[], events: Stage1PlotPayload["main_events"]) {
  const scores = new Map<string, number>();
  for (const character of characters) scores.set(character, 1);
  for (const event of events) {
    for (const character of event.related_characters) {
      const actionHit = event.protagonist_action.includes(character) ? 3 : 0;
      const summaryHit = event.summary.includes(character) ? 1 : 0;
      scores.set(character, (scores.get(character) ?? 0) + 1 + actionHit + summaryHit);
    }
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name).filter(Boolean).slice(0, 6);
}

function renderMainCharacters(detailedCharacters: Stage3CharacterDetailsPayload["characters"], fallbackNames: string[]) {
  const characters = detailedCharacters.length > 0 ? detailedCharacters : fallbackNames.map((name, index) => ({
    name,
    identity: "",
    social_class: "",
    faction_relation: "",
    relationship_to_protagonist: index === 0 ? "主角" : "",
    gender: "",
    hair_color: "",
    eye_color: "",
    body_type: "",
    clothing_style: "",
    appearance: "",
    personality: [],
    action_logic: [],
    current_goal: "",
    current_state: "",
    speech_style: "",
    quote_example: "",
    is_core_group: true
  }));
  return ["# 主角团", "", ...characters.flatMap((character) => [`## ${character.name || "未命名角色"}`, "", `身份：${character.identity}`, `阵营关系：${character.faction_relation}`, `与主角关系：${character.relationship_to_protagonist}`, `性别：${character.gender}`, `发色：${character.hair_color}`, `瞳色：${character.eye_color}`, `身材：${character.body_type}`, `穿着习惯：${character.clothing_style}`, `外貌特征：${character.appearance}`, `性格：${character.personality.join("；")}`, `行动逻辑：${character.action_logic.join("；")}`, `当前目标：${character.current_goal}`, `当前状态：${character.current_state}`, `角色台词示例：${character.quote_example}`, "", "---", ""])].join("\n").trim();
}

function formatChapterList(chapters: Array<string | number>) {
  if (chapters.length === 0) return "未明确";
  const numbers = chapters.map((chapter) => Number(chapter)).filter((chapter) => Number.isFinite(chapter));
  if (numbers.length === chapters.length && numbers.length > 0) {
    const sorted = [...numbers].sort((a, b) => a - b);
    return `第${sorted[0]}章-第${sorted[sorted.length - 1]}章`;
  }
  return chapters.map((chapter) => String(chapter)).join("、");
}

function MindMapGenerateModal({
  edgeCount,
  nodeCount,
  onClose,
  onStart
}: {
  edgeCount: number;
  nodeCount: number;
  onClose: () => void;
  onStart: (options: MindMapGenerateOptions) => void;
}) {
  const [method, setMethod] = useState<MindMapGenerateMethod>("ai");
  const [mode, setMode] = useState<MindMapGenerateMode>("rough");
  const [sources, setSources] = useState<Set<MindMapGenerateSource>>(() => new Set(["main_plot", "branch_plot", "conflicts"]));
  const [strategy, setStrategy] = useState<MindMapGenerateStrategy>("append");
  const toggleSource = (source: MindMapGenerateSource) => {
    setSources((current) => {
      const next = new Set(current);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const sourceOptions: Array<{ label: string; value: MindMapGenerateSource }> = [
    { label: "主线剧情", value: "main_plot" },
    { label: "支线剧情", value: "branch_plot" },
    { label: "矛盾冲突", value: "conflicts" },
    { label: "世界观", value: "world" },
    { label: "主角团", value: "main_characters" },
    { label: "配角", value: "roles" },
    { label: "伏笔/反转", value: "foreshadowing" }
  ];

  return (
    <div className="modal-backdrop">
      <div className="mind-generate-modal">
        <header>
          <div>
            <h2>从大纲生成思维导图</h2>
            <p>可以使用本地规则，也可以让 AI 根据当前大纲生成更准确的节点和关联。</p>
          </div>
          <button aria-label="关闭" className="ghost" onClick={onClose} type="button">x</button>
        </header>

        <section>
          <h3>生成方式</h3>
          <label className={method === "ai" ? "mind-option selected" : "mind-option"}>
            <input checked={method === "ai"} onChange={() => setMethod("ai")} type="radio" />
            <span><strong>AI 生成</strong><small>根据文字大纲理解剧情关系，生成更合理的节点和关联。</small></span>
          </label>
          <label className={method === "local" ? "mind-option selected" : "mind-option"}>
            <input checked={method === "local"} onChange={() => setMethod("local")} type="radio" />
            <span><strong>本地规则生成</strong><small>不调用 AI，只按标题和关键词生成，速度最快。</small></span>
          </label>
        </section>

        <section>
          <h3>生成模式</h3>
          <label className={mode === "rough" ? "mind-option selected" : "mind-option"}>
            <input checked={mode === "rough"} onChange={() => setMode("rough")} type="radio" />
            <span><strong>大致思维导图</strong><small>核心节点更少，适合快速查看小说结构。</small></span>
          </label>
          <label className={mode === "detailed" ? "mind-option selected" : "mind-option"}>
            <input checked={mode === "detailed"} onChange={() => setMode("detailed")} type="radio" />
            <span><strong>详细思维导图</strong><small>提取更多角色、伏笔、反转和矛盾，适合详细梳理。</small></span>
          </label>
        </section>

        <section className="mind-generate-grid">
          <div>
            <h3>数据来源</h3>
            {sourceOptions.map((option) => (
              <label key={option.value}>
                <input checked={sources.has(option.value)} onChange={() => toggleSource(option.value)} type="checkbox" /> {option.label}
              </label>
            ))}
          </div>
          <div>
            <h3>当前导图</h3>
            <p>已有节点：{nodeCount}</p>
            <p>已有关联线：{edgeCount}</p>
            <label><input checked={strategy === "append"} onChange={() => setStrategy("append")} type="radio" /> 追加到当前导图</label>
            <label><input checked={strategy === "replace"} onChange={() => setStrategy("replace")} type="radio" /> 清空当前导图后重新生成</label>
          </div>
        </section>

        <footer>
          <button className="ghost" onClick={onClose} type="button">取消</button>
          <button disabled={sources.size === 0} onClick={() => onStart({ method, mode, sources: [...sources], strategy })} type="button">开始生成</button>
        </footer>
      </div>
    </div>
  );
}

function MindMapProgressModal({
  onClose,
  onFallbackToLocal,
  onRetry,
  progress
}: {
  onClose: () => void;
  onFallbackToLocal?: () => void;
  onRetry?: () => void;
  progress: MindMapGenerateProgress;
}) {
  return (
    <div className="modal-backdrop">
      <div className="mind-progress-modal">
        <header>
          <div>
            <h2>正在生成思维导图</h2>
            <p>当前生成方式：{progress.method === "local" ? "本地规则生成" : "AI 生成"}</p>
            <p>当前模式：{progress.mode === "rough" ? "大致思维导图" : "详细思维导图"}</p>
          </div>
          <button aria-label="关闭" className="ghost" disabled={progress.status === "running"} onClick={onClose} type="button">x</button>
        </header>
        <section>
          <strong>当前步骤：{progress.step}</strong>
          <p>{progress.detail}</p>
          <div className="parse-progress-bar"><span style={{ width: `${progress.percent}%` }} /></div>
          <p>{progress.percent}%</p>
          <p>已生成节点：{progress.createdNodes}，已生成关联线：{progress.createdEdges}，warning：{progress.warnings?.length ?? 0}</p>
          {progress.warnings && progress.warnings.length > 0 && <pre>{progress.warnings.join("\n")}</pre>}
          {progress.status === "failed" && <pre className="parse-progress-error">{progress.error}</pre>}
        </section>
        <footer>
          {progress.status === "completed" && <button onClick={onClose} type="button">查看导图</button>}
          {progress.status === "failed" && onRetry && <button onClick={onRetry} type="button">重试</button>}
          {progress.status === "failed" && onFallbackToLocal && <button onClick={onFallbackToLocal} type="button">改用本地规则生成</button>}
          {progress.status !== "running" && <button className="ghost" onClick={onClose} type="button">关闭</button>}
        </footer>
      </div>
    </div>
  );
}

function RefineOutlineModal({
  activeSection,
  chapters,
  state,
  onChange,
  onClose,
  onSearch,
  onStart
}: {
  activeSection: OutlineSectionType;
  chapters: Chapter[];
  state: RefineDialogState;
  onChange: (state: RefineDialogState) => void;
  onClose: () => void;
  onSearch: () => void;
  onStart: () => void;
}) {
  const update = (patch: Partial<RefineDialogState>) => onChange({ ...state, ...patch });
  const toggleChapter = (chapterId: string) => {
    const next = new Set(state.selectedChapterIds);
    if (next.has(chapterId)) next.delete(chapterId);
    else next.add(chapterId);
    update({ selectedChapterIds: next });
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="ai-preview-modal">
        <header>
          <h2>定向补全：{getSectionLabel(activeSection)}</h2>
          <button onClick={onClose} type="button">×</button>
        </header>
        <div className="modal-stack">
          <label>
            关键词
            <input
              value={state.keyword}
              onChange={(event) => update({ keyword: event.target.value, error: undefined })}
              placeholder="请输入要补充的关键词，例如：罗兰·赫本 / 闹鬼委托 / 血族 / 邪教"
            />
          </label>
          <label>
            解析范围
            <select value={state.scope} onChange={(event) => update({ scope: event.target.value as RefineScope, matchedChapters: [], selectedChapterIds: new Set() })}>
              <option value="all">全文搜索</option>
              <option value="volume">当前卷</option>
              <option value="nearby">当前章节附近</option>
              <option value="manual">手动选择章节</option>
            </select>
          </label>
          {state.scope === "manual" && (
            <div className="chapter-pick-list">
              {chapters.map((chapter) => (
                <label key={chapter.id}>
                  <input checked={state.selectedChapterIds.has(chapter.id)} onChange={() => toggleChapter(chapter.id)} type="checkbox" />
                  {chapter.title}
                </label>
              ))}
            </div>
          )}
          <label>
            补全方式
            <select value={state.mode} onChange={(event) => update({ mode: event.target.value as RefineMode })}>
              <option value="merge">合并到当前栏目</option>
              <option value="append">追加到当前栏目</option>
            </select>
          </label>
          <div className="modal-actions">
            <button onClick={onSearch} disabled={state.isSearching || state.isCallingAI} type="button">搜索相关章节</button>
            <button onClick={onStart} disabled={state.isCallingAI || state.selectedChapterIds.size === 0} type="button">开始补全</button>
          </div>
          {state.progress && <p>{state.progress}</p>}
          {state.error && <p className="error-text">{state.error}</p>}
          {state.matchedChapters.length > 0 && (
            <div className="chapter-pick-list">
              <strong>找到 {state.matchedChapters.length} 个相关章节</strong>
              {state.matchedChapters.map((chapter) => (
                <label key={chapter.id}>
                  <input checked={state.selectedChapterIds.has(chapter.id)} onChange={() => toggleChapter(chapter.id)} type="checkbox" />
                  {chapter.title}
                </label>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function RefinePreviewModal({
  preview,
  onAppend,
  onClose,
  onMerge
}: {
  preview: RefinePreviewState;
  onAppend: () => void;
  onClose: () => void;
  onMerge: () => void;
}) {
  const { result } = preview;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="ai-preview-modal">
        <header>
          <h2>定向补全结果预览</h2>
          <button onClick={onClose} type="button">×</button>
        </header>
        <div className="modal-stack">
          <p>关键词：{result.keyword}</p>
          <p>当前栏目：{getSectionLabel(result.section_type as OutlineSectionType)}</p>
          <p>置信度：{result.confidence}</p>
          <div>
            <strong>匹配章节</strong>
            <ul>
              {result.matched_chapters.map((chapter) => (
                <li key={`${chapter.chapter_id}-${chapter.chapter_title}`}>{chapter.chapter_title || chapter.chapter_id}</li>
              ))}
            </ul>
          </div>
          {result.warnings.length > 0 && (
            <div>
              <strong>提示</strong>
              <ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          )}
          {result.found ? <pre className="ai-preview-json">{result.refined_content}</pre> : <p>未从相关章节中找到可靠信息。</p>}
        </div>
        <footer>
          <button onClick={onClose} type="button">取消</button>
          {result.found && result.refined_content.trim() && (
            <>
              <button onClick={onAppend} type="button">追加到当前栏目</button>
              <button onClick={onMerge} type="button">合并到当前栏目</button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function ParseProgressModal({ onClose, progress }: { onClose: () => void; progress: ParseProgress }) {
  const completed = progress.completedChunks ?? progress.currentBatch;
  const percent = progress.totalBatches > 0 ? Math.round((completed / progress.totalBatches) * 100) : 0;
  return (
    <div className="modal-backdrop">
      <div className="parse-modal">
        <header>
          <h2>AI 解析进度</h2>
          <button aria-label="关闭" onClick={onClose} type="button">x</button>
        </header>
        <p>解析模式：{progress.analysisMode === "detailed" ? "详细解析" : "简单解析"}</p>
        <p>当前阶段：{progress.stage ?? progress.status}</p>
        <p>当前 chunk：{progress.currentBatch} / {progress.totalBatches}</p>
        <p>已完成 chunk：{progress.completedChunks ?? 0}，缓存命中：{progress.cacheHitCount ?? 0}，AI 调用：{progress.aiCallCount ?? 0}</p>
        <p>并发任务数：{progress.concurrency ?? 1}，失败任务数：{progress.failedChunks ?? 0}，Token：{progress.tokenCount ?? 0}</p>
        <div className="parse-progress-track"><span style={{ width: `${percent}%` }} /></div>
        <p>章节：{progress.chapterTitles.join("、") || "无"}</p>
        {progress.error && <pre>{progress.error}</pre>}
      </div>
    </div>
  );
}
