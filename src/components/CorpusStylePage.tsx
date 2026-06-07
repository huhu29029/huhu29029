import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { MockProvider } from "../ai/MockProvider";
import { createLLMProvider } from "../ai/providerFactory";
import { parseCorpusStyleChunkJson, parseCorpusStyleProfileJson, type CorpusStyleProfilePayload } from "../ai/schemas";
import {
  createAITask,
  deleteCorpusStyleProfile,
  finishAITask,
  getAISettings,
  getCorpusStyleProfileState,
  listCorpusStyleProfiles,
  listStyleRetrievalSnippets,
  listWritingStyleProfiles,
  logAIUsage,
  readPromptFile,
  readTextFile,
  replaceStyleRetrievalSnippets,
  saveAIDebugLog,
  saveCorpusStyleProfile,
  writeTextFile
} from "../tauriApi";
import type {
  Chapter,
  CorpusStyleAnalysisMode,
  CorpusStyleDimensionType,
  CorpusStyleProfile,
  CorpusStyleProfileState,
  CorpusStyleSourceType,
  Project,
  SaveCorpusStyleDimensionInput,
  SaveCorpusStyleExampleInput,
  StyleRetrievalDimensionType,
  StyleRetrievalSnippet,
  StyleSnippetSearchResult,
  Volume
} from "../types/domain";
import { buildCorpusLocalMetrics, chaptersToCorpusPrompt, corpusDimensionLabels, corpusDimensionOrder, splitCorpusChunks } from "../utils/corpusStyle";
import {
  buildStyleSnippets,
  getSelectedStyleReferencesForPolish,
  searchStyleSnippets,
  styleRetrievalDimensionLabels,
  styleRetrievalDimensionOrder
} from "../utils/styleRetrieval";

type CorpusStylePageProps = {
  chapters: Chapter[];
  currentChapterId?: string;
  project: Project;
  volumes: Volume[];
};

type ProgressState = {
  stage: string;
  current: number;
  total: number;
  aiCalls: number;
  tokens: number;
  chapterRange: string;
};

type StylePackageDimension = {
  dimension_type: CorpusStyleDimensionType;
  summary: string;
  rules: string[];
  metrics: Record<string, unknown>;
  examples: Array<{
    original_excerpt: string;
    analysis_note: string;
    usage_rule: string;
  }>;
};

type StylePackage = {
  schema_version: "1.0";
  app: "Novel Memory Engine";
  exported_at: string;
  export_type: "corpus_style_profile";
  source: {
    project_title: string;
    profile_name: string;
    source_type: string;
    analysis_mode: string;
  };
  profile: {
    profile_name: string;
    summary: string;
    created_at: string;
    updated_at: string;
  };
  dimensions: StylePackageDimension[];
  usage_for_ai: {
    prompt_summary: string;
    must_keep: string[];
    should_avoid: string[];
    recommended_polish_rules: string[];
  };
};

const sourceOptions: Array<{ label: string; value: CorpusStyleSourceType }> = [
  { label: "\u5f53\u524d\u7ae0\u8282", value: "current_chapter" },
  { label: "\u6700\u8fd1 3 \u7ae0", value: "recent_3_chapters" },
  { label: "\u5f53\u524d\u5377", value: "volume" },
  { label: "\u5168\u4e66", value: "full_book" },
  { label: "\u624b\u52a8\u9009\u62e9\u7ae0\u8282", value: "manual_selection" }
];

export function CorpusStylePage({ chapters, currentChapterId, project, volumes }: CorpusStylePageProps) {
  const [profiles, setProfiles] = useState<CorpusStyleProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<CorpusStyleProfileState>();
  const [activeTab, setActiveTab] = useState<CorpusStyleDimensionType | "overview" | "examples" | "style_search">("overview");
  const [sourceType, setSourceType] = useState<CorpusStyleSourceType>("recent_3_chapters");
  const [analysisMode, setAnalysisMode] = useState<CorpusStyleAnalysisMode>("simple");
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [selectedVolumeId, setSelectedVolumeId] = useState("");
  const [progress, setProgress] = useState<ProgressState>();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [styleSnippets, setStyleSnippets] = useState<StyleRetrievalSnippet[]>([]);
  const [styleSearchQuery, setStyleSearchQuery] = useState("");
  const [styleSearchDimensions, setStyleSearchDimensions] = useState<Set<StyleRetrievalDimensionType>>(() => new Set(styleRetrievalDimensionOrder));
  const [styleSearchLimit, setStyleSearchLimit] = useState(10);
  const [styleSearchResults, setStyleSearchResults] = useState<StyleSnippetSearchResult[]>([]);
  const [selectedStyleReferences, setSelectedStyleReferences] = useState<StyleSnippetSearchResult[]>([]);
  const [rebuildStatus, setRebuildStatus] = useState("");

  const sortedChapters = useMemo(() => {
    const volumeOrder = new Map(volumes.map((volume, index) => [volume.id, index]));
    return [...chapters].sort((a, b) => {
      const volumeDiff = (volumeOrder.get(a.volumeId) ?? 0) - (volumeOrder.get(b.volumeId) ?? 0);
      return volumeDiff || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
    });
  }, [chapters, volumes]);

  const selectedChapters = useMemo(
    () => pickSourceChapters(sortedChapters, currentChapterId, sourceType, selectedVolumeId, selectedChapterIds),
    [sortedChapters, currentChapterId, sourceType, selectedVolumeId, selectedChapterIds]
  );
  const activeDimension = activeProfile?.dimensions.find((dimension) => dimension.dimensionType === activeTab);
  const activeExamples = activeProfile?.examples.filter((example) => activeTab === "examples" || example.dimensionType === activeTab) ?? [];

  useEffect(() => {
    void refreshProfiles();
    void refreshStyleSnippets();
  }, [project.id]);

  async function refreshProfiles(nextProfileId?: string) {
    const next = await listCorpusStyleProfiles(project.id);
    setProfiles(next);
    const profileId = nextProfileId ?? activeProfile?.profile.id ?? next[0]?.id;
    if (profileId) {
      const state = await getCorpusStyleProfileState(profileId);
      setActiveProfile(state);
    } else {
      setActiveProfile(undefined);
    }
  }

  async function refreshStyleSnippets() {
    const snippets = await listStyleRetrievalSnippets(project.id).catch(() => []);
    setStyleSnippets(snippets);
  }

  async function analyzeStyleProfile() {
    if (selectedChapters.length === 0) {
      window.alert("\u6ca1\u6709\u53ef\u5206\u6790\u7684\u7ae0\u8282");
      return;
    }
    setIsAnalyzing(true);
    let taskId: string | undefined;
    try {
      const settings = await getAISettings();
      const hasApiKey = Boolean(settings.apiKey.trim());
      const provider = hasApiKey
        ? createLLMProvider({ ...settings, model: settings.featurePatternMemoryModel ?? settings.model }, "deepseek")
        : new MockProvider();
      const chunkPromptTemplate = await readPromptFile("analyze_corpus_style_chunk.md");
      const reducePromptTemplate = await readPromptFile("reduce_corpus_style_profile.md");
      const metrics = buildCorpusLocalMetrics(selectedChapters);
      const chunks = splitCorpusChunks(selectedChapters);
      const task = await createAITask(project.id, "analyze_corpus_style_profile", JSON.stringify({ sourceType, chapterIds: selectedChapters.map((chapter) => chapter.id), analysisMode }));
      taskId = task.id;
      const chunkResults = [];
      let aiCalls = 0;
      let tokens = 0;

      setProgress({ stage: "\u672c\u5730\u7edf\u8ba1", current: 0, total: chunks.length, aiCalls, tokens, chapterRange: "" });
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        const chapterRange = `${chunk[0]?.title ?? ""} - ${chunk[chunk.length - 1]?.title ?? ""}`;
        setProgress({ stage: `\u5206\u6790\u7b2c ${index + 1} / ${chunks.length} \u4e2a chunk`, current: index + 1, total: chunks.length, aiCalls, tokens, chapterRange });
        const prompt = chunkPromptTemplate
          .replace("{{local_metrics}}", JSON.stringify(metrics, null, 2))
          .replace("{{dimensions}}", corpusDimensionOrder.join(", "))
          .replace("{{chunk_text}}", chaptersToCorpusPrompt(chunk));
        const result = await provider.chatJson([
          { role: "system", content: "\u4f60\u662f\u5c0f\u8bf4\u6587\u98ce\u5206\u6790\u52a9\u624b\u3002\u4f60\u5fc5\u987b\u8fd4\u56de\u5408\u6cd5 JSON\u3002" },
          { role: "user", content: prompt }
        ]);
        try {
          chunkResults.push(parseCorpusStyleChunkJson(result.content));
        } catch (parseError) {
          await saveAIDebugLog(JSON.stringify({
            feature: "analyze_corpus_style_chunk",
            chunkIndex: index + 1,
            totalChunks: chunks.length,
            chapterRange,
            rawResponse: result.content,
            error: String(parseError)
          }, null, 2)).catch(console.error);
          throw new Error(`\u7b2c ${index + 1} \u4e2a chunk \u8fd4\u56de\u7684 JSON \u4e0d\u5408\u6cd5\uff0c\u539f\u59cb\u8fd4\u56de\u5df2\u4fdd\u5b58\u5230 logs/last_ai_response.json\u3002${String(parseError)}`);
        }
        aiCalls += 1;
        tokens += result.usage.totalTokens;
        await logAIUsage({
          projectId: project.id,
          featureName: "analyze_corpus_style_chunk",
          provider: hasApiKey ? "deepseek" : "mock",
          model: hasApiKey ? settings.featurePatternMemoryModel ?? settings.model : "mock",
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          estimatedCost: 0
        });
      }

      setProgress({ stage: "\u5408\u5e76\u6587\u98ce Profile", current: chunks.length, total: chunks.length, aiCalls, tokens, chapterRange: "" });
      const existing = await listWritingStyleProfiles(project.id).catch(() => []);
      const reducePrompt = reducePromptTemplate
        .replace("{{local_metrics}}", JSON.stringify(metrics, null, 2))
        .replace("{{existing_writing_style_profile}}", JSON.stringify(existing[0] ?? null, null, 2))
        .replace("{{chunk_style_results}}", JSON.stringify(chunkResults, null, 2));
      const reduceResult = await provider.chatJson([
        { role: "system", content: "\u4f60\u662f\u5c0f\u8bf4\u6587\u98ce Profile \u6574\u7406\u52a9\u624b\u3002\u4f60\u5fc5\u987b\u8fd4\u56de\u5408\u6cd5 JSON\u3002" },
        { role: "user", content: reducePrompt }
      ]);
      aiCalls += 1;
      tokens += reduceResult.usage.totalTokens;
      let finalProfile: CorpusStyleProfilePayload;
      try {
        finalProfile = parseCorpusStyleProfileJson(reduceResult.content);
      } catch (parseError) {
        await saveAIDebugLog(JSON.stringify({
          feature: "reduce_corpus_style_profile",
          rawResponse: reduceResult.content,
          error: String(parseError)
        }, null, 2)).catch(console.error);
        throw new Error(`\u6587\u98ce Profile \u5408\u5e76\u8fd4\u56de\u7684 JSON \u4e0d\u5408\u6cd5\uff0c\u539f\u59cb\u8fd4\u56de\u5df2\u4fdd\u5b58\u5230 logs/last_ai_response.json\u3002${String(parseError)}`);
      }
      await logAIUsage({
        projectId: project.id,
        featureName: "reduce_corpus_style_profile",
        provider: hasApiKey ? "deepseek" : "mock",
        model: hasApiKey ? settings.featurePatternMemoryModel ?? settings.model : "mock",
        promptTokens: reduceResult.usage.promptTokens,
        completionTokens: reduceResult.usage.completionTokens,
        totalTokens: reduceResult.usage.totalTokens,
        estimatedCost: 0
      });

      setProgress({ stage: "\u4fdd\u5b58\u7ed3\u679c", current: chunks.length, total: chunks.length, aiCalls, tokens, chapterRange: "" });
      const saved = await saveCorpusStyleProfile(buildSaveInput(project.id, sourceType, analysisMode, selectedChapters, finalProfile, metrics));
      await finishAITask(task.id, "success", JSON.stringify(finalProfile, null, 2));
      await refreshProfiles(saved.profile.id);
      setProgress({ stage: "\u5b8c\u6210", current: chunks.length, total: chunks.length, aiCalls, tokens, chapterRange: "" });
      window.alert("\u6587\u98ce\u6307\u7eb9 Profile \u5df2\u751f\u6210");
    } catch (error) {
      if (taskId) await finishAITask(taskId, "failed", String(error)).catch(console.error);
      window.alert(`\u6587\u98ce\u5206\u6790\u5931\u8d25\uff1a${String(error)}`);
      setProgress((current) => current ? { ...current, stage: "\u5931\u8d25" } : undefined);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function rebuildStyleIndex() {
    setRebuildStatus("\u6b63\u5728\u91cd\u5efa\u98ce\u683c\u7d22\u5f15...");
    try {
      const profileStates: CorpusStyleProfileState[] = [];
      for (const profile of profiles) {
        const state = await getCorpusStyleProfileState(profile.id).catch(() => undefined);
        if (state) profileStates.push(state);
      }
      const snippets = buildStyleSnippets({ chapters: sortedChapters, corpusProfiles: profileStates });
      const saved = await replaceStyleRetrievalSnippets(project.id, snippets);
      setStyleSnippets(saved);
      setRebuildStatus(`\u5b8c\u6210\uff0c\u5171\u751f\u6210 ${saved.length} \u4e2a\u7247\u6bb5`);
      window.alert(`\u98ce\u683c\u7d22\u5f15\u5df2\u91cd\u5efa\uff0c\u5171\u751f\u6210 ${saved.length} \u4e2a\u7247\u6bb5\u3002`);
    } catch (error) {
      setRebuildStatus(`\u5931\u8d25\uff1a${String(error)}`);
      window.alert(`\u91cd\u5efa\u98ce\u683c\u7d22\u5f15\u5931\u8d25\uff1a${String(error)}`);
    }
  }

  function performStyleSearch() {
    const results = searchStyleSnippets(styleSnippets, {
      dimensions: styleSearchDimensions,
      limit: styleSearchLimit,
      minScore: 20,
      query: styleSearchQuery
    });
    setStyleSearchResults(results);
  }

  function addStyleReference(result: StyleSnippetSearchResult) {
    if (selectedStyleReferences.some((item) => item.snippetId === result.snippetId)) return;
    const next = [...selectedStyleReferences, result];
    const totalChars = next.reduce((total, item) => total + item.snippetText.length, 0);
    if (next.length > 5 || totalChars > 800) {
      window.alert("\u53c2\u8003\u7247\u6bb5\u8fc7\u591a\uff0c\u6700\u591a 5 \u6761\u3001\u603b\u5b57\u6570 800 \u5b57\u3002");
      return;
    }
    setSelectedStyleReferences(next);
  }

  async function exportStylePackage(targetProfile = activeProfile) {
    if (!targetProfile) {
      window.alert("\u8bf7\u5148\u9009\u62e9\u8981\u5bfc\u51fa\u7684\u6587\u98ce Profile");
      return;
    }
    const packageData = buildStylePackage(targetProfile);
    const outputPath = await save({
      defaultPath: `${safeFileName(targetProfile.profile.profileName)}.nm-style.json`,
      filters: [{ name: "Novel Memory Style Package", extensions: ["nm-style.json", "json"] }]
    });
    if (!outputPath) return;
    await writeTextFile(outputPath, JSON.stringify(packageData, null, 2));
    window.alert("\u98ce\u683c\u5305\u5df2\u5bfc\u51fa\u3002");
  }

  async function exportMarkdownReport() {
    if (!activeProfile) {
      window.alert("\u8bf7\u5148\u9009\u62e9\u8981\u5bfc\u51fa\u7684\u6587\u98ce Profile");
      return;
    }
    const packageData = buildStylePackage(activeProfile);
    const outputPath = await save({
      defaultPath: `${safeFileName(activeProfile.profile.profileName)}_\u6587\u98ce\u6307\u7eb9\u62a5\u544a.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }]
    });
    if (!outputPath) return;
    await writeTextFile(outputPath, renderStyleMarkdown(packageData));
    window.alert("Markdown \u62a5\u544a\u5df2\u5bfc\u51fa\u3002");
  }

  async function importStylePackage() {
    const selectedPath = await open({
      multiple: false,
      filters: [{ name: "Novel Memory Style Package", extensions: ["json", "nm-style.json"] }]
    });
    if (!selectedPath || Array.isArray(selectedPath)) return;
    const raw = await readTextFile(selectedPath);
    const packageData = parseStylePackage(raw);
    if (!packageData) {
      window.alert("\u5bfc\u5165\u5931\u8d25\uff1a\u98ce\u683c\u5305\u683c\u5f0f\u4e0d\u6b63\u786e\u3002");
      return;
    }
    const existing = profiles.find((profile) => profile.profileName === packageData.profile.profile_name);
    const shouldOverwrite = existing ? window.confirm("\u540c\u540d Profile \u5df2\u5b58\u5728\uff0c\u662f\u5426\u8986\u76d6\uff1f\u53d6\u6d88\u5c06\u65b0\u5efa\u4e00\u4e2a\u5bfc\u5165\u526f\u672c\u3002") : false;
    const imported = await saveCorpusStyleProfile({
      id: shouldOverwrite ? existing?.id : undefined,
      projectId: project.id,
      profileName: existing && !shouldOverwrite ? `${packageData.profile.profile_name}\uff08\u5bfc\u5165\uff09` : packageData.profile.profile_name,
      sourceType: "manual_selection",
      sourceChapterIds: [],
      analysisMode: packageData.source.analysis_mode === "detailed" ? "detailed" : "simple",
      summary: packageData.profile.summary,
      dimensions: packageData.dimensions.map(packageDimensionToSaveInput),
      examples: packageData.dimensions.flatMap(packageDimensionToExamples)
    });
    await refreshProfiles(imported.profile.id);
    window.alert("\u98ce\u683c\u5305\u5df2\u5bfc\u5165\u3002");
  }

  async function renameProfile(profile: CorpusStyleProfile) {
    const state = await getCorpusStyleProfileState(profile.id);
    const nextName = window.prompt("\u8bf7\u8f93\u5165\u65b0\u7684 Profile \u540d\u79f0", profile.profileName)?.trim();
    if (!nextName) return;
    const saved = await saveCorpusStyleProfile({
      id: profile.id,
      projectId: project.id,
      profileName: nextName,
      sourceType: profile.sourceType,
      sourceChapterIds: parseJsonArray(profile.sourceChapterIds),
      analysisMode: profile.analysisMode,
      summary: profile.summary,
      dimensions: state.dimensions.map((dimension) => ({
        dimensionType: dimension.dimensionType,
        summary: dimension.summary,
        rulesJson: dimension.rulesJson,
        metricsJson: dimension.metricsJson,
        examplesJson: dimension.examplesJson
      })),
      examples: state.examples.map((example) => ({
        dimensionType: example.dimensionType,
        originalExcerpt: example.originalExcerpt,
        analysisNote: example.analysisNote,
        usageRule: example.usageRule
      }))
    });
    await refreshProfiles(saved.profile.id);
  }

  async function deleteProfile(profile: CorpusStyleProfile) {
    if (!window.confirm(`\u786e\u5b9a\u5220\u9664\u6587\u98ce Profile\u300c${profile.profileName}\u300d\u5417\uff1f\u6b64\u64cd\u4f5c\u4e0d\u53ef\u6062\u590d\u3002`)) return;
    await deleteCorpusStyleProfile(profile.id);
    await refreshProfiles();
  }

  return (
    <section className="corpus-style-page">
      <header className="outline-topbar">
        <div>
          <h2>{"\u6587\u98ce\u6307\u7eb9\u5e93"}</h2>
          <p>{"\u5206\u6790\u5f53\u524d\u5c0f\u8bf4\u7684\u5199\u6cd5\u4e60\u60ef\uff0c\u4fdd\u5b58\u4e3a\u53ef\u590d\u7528\u7684\u6587\u98ce Profile\uff0c\u5e76\u652f\u6301\u672c\u5730\u98ce\u683c\u68c0\u7d22\u3002"}</p>
        </div>
        <div className="corpus-export-actions">
          <button disabled={!activeProfile} onClick={() => void exportStylePackage()} type="button">{"\u5bfc\u51fa\u98ce\u683c\u5305"}</button>
          <button disabled={!activeProfile} onClick={() => void exportMarkdownReport()} type="button">{"\u5bfc\u51fa Markdown"}</button>
          <button onClick={() => void importStylePackage()} type="button">{"\u5bfc\u5165\u98ce\u683c\u5305"}</button>
        </div>
      </header>

      <section className="corpus-style-toolbar">
        <label>
          {"\u5206\u6790\u8303\u56f4"}
          <select value={sourceType} onChange={(event) => setSourceType(event.target.value as CorpusStyleSourceType)}>
            {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          {"\u5206\u6790\u6a21\u5f0f"}
          <select value={analysisMode} onChange={(event) => setAnalysisMode(event.target.value as CorpusStyleAnalysisMode)}>
            <option value="simple">{"\u7b80\u5355"}</option>
            <option value="detailed">{"\u8be6\u7ec6"}</option>
          </select>
        </label>
        {sourceType === "volume" && (
          <label>
            {"\u5206\u5377"}
            <select value={selectedVolumeId} onChange={(event) => setSelectedVolumeId(event.target.value)}>
              <option value="">{"\u81ea\u52a8\u4f7f\u7528\u5f53\u524d\u5377"}</option>
              {volumes.map((volume) => <option key={volume.id} value={volume.id}>{volume.title}</option>)}
            </select>
          </label>
        )}
        <button disabled={isAnalyzing || selectedChapters.length === 0} onClick={() => void analyzeStyleProfile()} type="button">{"\u5f00\u59cb\u5206\u6790"}</button>
        <span>{"\u5c06\u5206\u6790"} {selectedChapters.length} {"\u7ae0"}</span>
      </section>

      {sourceType === "manual_selection" && (
        <section className="corpus-chapter-picker">
          {sortedChapters.map((chapter) => (
            <label key={chapter.id}>
              <input
                checked={selectedChapterIds.has(chapter.id)}
                onChange={(event) => {
                  const next = new Set(selectedChapterIds);
                  if (event.target.checked) next.add(chapter.id); else next.delete(chapter.id);
                  setSelectedChapterIds(next);
                }}
                type="checkbox"
              />
              {chapter.title}
            </label>
          ))}
        </section>
      )}

      {progress && (
        <section className="parse-progress-modal corpus-progress">
          <h3>{"\u6587\u98ce\u5206\u6790\u8fdb\u5ea6"}</h3>
          <p>{"\u5f53\u524d\u9636\u6bb5\uff1a"}{progress.stage}</p>
          <p>{"\u5f53\u524d chunk\uff1a"}{progress.current} / {progress.total}</p>
          <p>{"\u7ae0\u8282\u8303\u56f4\uff1a"}{progress.chapterRange || "\u65e0"}</p>
          <p>{"AI \u8c03\u7528\uff1a"}{progress.aiCalls}{"\uff0cToken\uff1a"}{progress.tokens}</p>
          <div className="parse-progress-bar"><span style={{ width: (progress.total ? Math.round((progress.current / progress.total) * 100) : 0) + "%" }} /></div>
        </section>
      )}

      <section className="corpus-profile-layout">
        <aside className="corpus-profile-list">
          <h3>Profile</h3>
          {profiles.map((profile) => (
            <article className={activeProfile?.profile.id === profile.id ? "corpus-profile-item active" : "corpus-profile-item"} key={profile.id}>
              <button onClick={() => void refreshProfiles(profile.id)} type="button">
                <strong>{profile.profileName}</strong>
                <span>{profile.analysisMode} / {profile.sourceType}</span>
              </button>
              <div>
                <button onClick={() => void getCorpusStyleProfileState(profile.id).then((state) => { setActiveProfile(state); return exportStylePackage(state); })} type="button">{"\u5bfc\u51fa"}</button>
                <button onClick={() => window.alert("\u5df2\u9009\u4e2d\u8be5 Profile\u3002\u6253\u5f00 AI \u6da6\u8272\u5f39\u7a97\u540e\u53ef\u5728\u6587\u98ce\u6307\u7eb9\u5e93\u4e0b\u62c9\u6846\u4e2d\u9009\u62e9\u4f7f\u7528\u3002")} type="button">{"\u5e94\u7528\u5230\u6da6\u8272"}</button>
                <button onClick={() => void renameProfile(profile)} type="button">{"\u91cd\u547d\u540d"}</button>
                <button onClick={() => void deleteProfile(profile)} type="button">{"\u5220\u9664"}</button>
              </div>
            </article>
          ))}
        </aside>

        <main className="corpus-profile-detail">
          {activeProfile ? (
            <>
              <div className="corpus-tabs">
                <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")} type="button">{"\u603b\u89c8"}</button>
                <button className={activeTab === "style_search" ? "active" : ""} onClick={() => setActiveTab("style_search")} type="button">{"\u98ce\u683c\u68c0\u7d22"}</button>
                {corpusDimensionOrder.map((dimension) => (
                  <button className={activeTab === dimension ? "active" : ""} key={dimension} onClick={() => setActiveTab(dimension)} type="button">{corpusDimensionLabels[dimension]}</button>
                ))}
                <button className={activeTab === "examples" ? "active" : ""} onClick={() => setActiveTab("examples")} type="button">{"\u793a\u4f8b\u5e93"}</button>
              </div>
              {activeTab === "style_search" ? (
                <StyleSearchPanel
                  dimensions={styleSearchDimensions}
                  limit={styleSearchLimit}
                  query={styleSearchQuery}
                  rebuildStatus={rebuildStatus}
                  results={styleSearchResults}
                  selectedReferences={selectedStyleReferences}
                  snippetCount={styleSnippets.length}
                  onAddReference={addStyleReference}
                  onClearReferences={() => setSelectedStyleReferences([])}
                  onCopyReferences={() => navigator.clipboard?.writeText(JSON.stringify(getSelectedStyleReferencesForPolish(selectedStyleReferences), null, 2))}
                  onDimensionChange={setStyleSearchDimensions}
                  onLimitChange={setStyleSearchLimit}
                  onQueryChange={setStyleSearchQuery}
                  onRebuild={() => void rebuildStyleIndex()}
                  onRemoveReference={(snippetId) => setSelectedStyleReferences((current) => current.filter((item) => item.snippetId !== snippetId))}
                  onSearch={performStyleSearch}
                />
              ) : activeTab === "overview" ? (
                <section className="corpus-card">
                  <h3>{activeProfile.profile.profileName}</h3>
                  <p>{activeProfile.profile.summary}</p>
                  <small>{"\u6765\u6e90\u7ae0\u8282\uff1a"}{parseJsonArray(activeProfile.profile.sourceChapterIds).length} {"\u7ae0"}</small>
                </section>
              ) : activeTab === "examples" ? (
                <ExampleList examples={activeExamples} />
              ) : (
                <section className="corpus-card">
                  <h3>{corpusDimensionLabels[activeTab]}</h3>
                  <p>{activeDimension?.summary || "\u6682\u65e0\u6458\u8981"}</p>
                  <h4>{"\u53ef\u7528\u4e8e\u6da6\u8272\u7684\u89c4\u5219"}</h4>
                  <ul>{parseJsonArray(activeDimension?.rulesJson).map((rule) => <li key={rule}>{rule}</li>)}</ul>
                  <h4>{"\u793a\u4f8b\u7247\u6bb5"}</h4>
                  <ExampleList examples={activeExamples} />
                </section>
              )}
            </>
          ) : (
            <section className="empty-state compact">
              <h3>{"\u6682\u65e0\u6587\u98ce\u6307\u7eb9 Profile"}</h3>
              <p>{"\u9009\u62e9\u8303\u56f4\u540e\u70b9\u51fb\u5f00\u59cb\u5206\u6790\u3002"}</p>
            </section>
          )}
        </main>
      </section>
    </section>
  );
}

function StyleSearchPanel({
  dimensions,
  limit,
  query,
  rebuildStatus,
  results,
  selectedReferences,
  snippetCount,
  onAddReference,
  onClearReferences,
  onCopyReferences,
  onDimensionChange,
  onLimitChange,
  onQueryChange,
  onRebuild,
  onRemoveReference,
  onSearch
}: {
  dimensions: Set<StyleRetrievalDimensionType>;
  limit: number;
  query: string;
  rebuildStatus: string;
  results: StyleSnippetSearchResult[];
  selectedReferences: StyleSnippetSearchResult[];
  snippetCount: number;
  onAddReference: (result: StyleSnippetSearchResult) => void;
  onClearReferences: () => void;
  onCopyReferences: () => void;
  onDimensionChange: (next: Set<StyleRetrievalDimensionType>) => void;
  onLimitChange: (next: number) => void;
  onQueryChange: (next: string) => void;
  onRebuild: () => void;
  onRemoveReference: (snippetId: string) => void;
  onSearch: () => void;
}) {
  const selectedChars = selectedReferences.reduce((total, item) => total + item.snippetText.length, 0);
  return (
    <section className="corpus-card style-search-panel">
      <div className="style-search-toolbar">
        <textarea
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={"\u8bf7\u8f93\u5165\u8981\u68c0\u7d22\u7684\u573a\u666f\u3001\u53e5\u5b50\u6216\u5173\u952e\u8bcd\uff0c\u4f8b\u5982\uff1a\n- \u4eba\u7269\u7d27\u5f20\u4f46\u5634\u786c\n- \u5b9e\u9a8c\u5ba4\u73af\u5883\u63cf\u5199\n- \u4e24\u4eba\u4e92\u76f8\u8bd5\u63a2\u7684\u5bf9\u8bdd\n- \u4e3b\u89d2\u5410\u69fd\u5b66\u9662\u5236\u5ea6"}
        />
        <div>
          <label>{"\u8fd4\u56de\u6570\u91cf"}<input min={1} max={30} type="number" value={limit} onChange={(event) => onLimitChange(Number(event.target.value) || 10)} /></label>
          <button onClick={onSearch} type="button">{"\u68c0\u7d22"}</button>
          <button onClick={onRebuild} type="button">{"\u91cd\u5efa\u98ce\u683c\u7d22\u5f15"}</button>
          <span>{"\u7d22\u5f15\u7247\u6bb5\uff1a"}{snippetCount}</span>
          {rebuildStatus && <small>{rebuildStatus}</small>}
        </div>
      </div>

      <div className="style-search-dimensions">
        {styleRetrievalDimensionOrder.map((dimension) => (
          <label key={dimension}>
            <input
              checked={dimensions.has(dimension)}
              onChange={(event) => {
                const next = new Set(dimensions);
                if (event.target.checked) next.add(dimension); else next.delete(dimension);
                onDimensionChange(next);
              }}
              type="checkbox"
            />
            {styleRetrievalDimensionLabels[dimension]}
          </label>
        ))}
      </div>

      <section className="selected-style-refs">
        <div>
          <strong>{"\u5df2\u9009\u53c2\u8003\u7247\u6bb5\uff1a"}{selectedReferences.length} {"\u6761"}</strong>
          <span>{"\u603b\u5b57\u6570\uff1a"}{selectedChars}</span>
          <button disabled={selectedReferences.length === 0} onClick={onCopyReferences} type="button">{"\u590d\u5236\u4e3a\u6da6\u8272\u53c2\u8003"}</button>
          <button disabled={selectedReferences.length === 0} onClick={onClearReferences} type="button">{"\u6e05\u7a7a"}</button>
        </div>
        {selectedReferences.map((item) => (
          <article key={item.snippetId}>
            <span>{styleRetrievalDimensionLabels[item.dimensionType]} / {Math.round(item.score)}</span>
            <button onClick={() => onRemoveReference(item.snippetId)} type="button">{"\u79fb\u9664"}</button>
          </article>
        ))}
      </section>

      <div className="style-search-results">
        {results.length === 0 ? (
          <p>{"\u6682\u65e0\u68c0\u7d22\u7ed3\u679c\u3002\u53ef\u4ee5\u5148\u70b9\u51fb\u201c\u91cd\u5efa\u98ce\u683c\u7d22\u5f15\u201d\uff0c\u518d\u8f93\u5165\u5173\u952e\u8bcd\u68c0\u7d22\u3002"}</p>
        ) : (
          results.map((result) => (
            <article className="style-result-card" key={result.snippetId}>
              <header>
                <strong>{Math.round(result.score)} {"\u5206"}</strong>
                <span>{sourceTypeLabel(result.sourceType)} / {styleRetrievalDimensionLabels[result.dimensionType]}</span>
                {result.chapterTitle && <span>{result.chapterTitle}</span>}
              </header>
              <blockquote>{result.snippetText}</blockquote>
              <p>{"\u5339\u914d\u539f\u56e0\uff1a"}{result.matchReason}</p>
              {result.tags.length > 0 && <div className="tag-row">{result.tags.slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)}</div>}
              <small>{"\u6da6\u8272\u89c4\u5219\uff1a"}{result.usageRule}</small>
              <footer>
                <button onClick={() => navigator.clipboard?.writeText(result.snippetText)} type="button">{"\u590d\u5236\u7247\u6bb5"}</button>
                <button onClick={() => navigator.clipboard?.writeText(result.usageRule)} type="button">{"\u590d\u5236\u89c4\u5219"}</button>
                <button onClick={() => onAddReference(result)} type="button">{"\u52a0\u5165\u6da6\u8272\u53c2\u8003"}</button>
              </footer>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function sourceTypeLabel(value: string) {
  return {
    chapter: "\u5f53\u524d\u5c0f\u8bf4\u6b63\u6587",
    corpus_example: "\u6587\u98ce\u6307\u7eb9\u793a\u4f8b",
    style_profile: "\u6587\u98ce\u89c4\u5219",
    literary_reference: "\u6587\u5b66\u53c2\u8003\u5e93",
    user_corpus: "\u7528\u6237\u79c1\u6709\u8bed\u6599"
  }[value] ?? value;
}

function pickSourceChapters(chapters: Chapter[], currentChapterId: string | undefined, sourceType: CorpusStyleSourceType, volumeId: string, manualIds: Set<string>) {
  const currentIndex = Math.max(0, chapters.findIndex((chapter) => chapter.id === currentChapterId));
  const current = chapters[currentIndex];
  if (sourceType === "current_chapter") return current ? [current] : [];
  if (sourceType === "recent_3_chapters") return chapters.slice(Math.max(0, currentIndex - 2), currentIndex + 1);
  if (sourceType === "volume") {
    const targetVolumeId = volumeId || current?.volumeId;
    return chapters.filter((chapter) => chapter.volumeId === targetVolumeId);
  }
  if (sourceType === "manual_selection") return chapters.filter((chapter) => manualIds.has(chapter.id));
  return chapters;
}

function buildSaveInput(projectId: string, sourceType: CorpusStyleSourceType, analysisMode: CorpusStyleAnalysisMode, chapters: Chapter[], profile: CorpusStyleProfilePayload, metrics: unknown) {
  const dimensions = corpusDimensionOrder.map((dimension) => {
    const data = profile.dimensions[dimension === "polish_rules" ? "polish_rules" : dimension];
    const rules = dimension === "polish_rules"
      ? [...profile.dimensions.polish_rules.must_keep, ...profile.dimensions.polish_rules.should_avoid, ...profile.dimensions.polish_rules.prompt_rules]
      : "rules_for_polish" in data ? data.rules_for_polish : [];
    const examples = "examples" in data ? data.examples : [];
    return {
      dimensionType: dimension,
      summary: data.summary,
      rulesJson: JSON.stringify(rules),
      metricsJson: JSON.stringify(dimension === "paragraph" || dimension === "vocabulary" ? metrics : {}),
      examplesJson: JSON.stringify(examples)
    };
  });
  const examples = dimensions.flatMap((dimension) => parseJsonArray(dimension.examplesJson).slice(0, 3).map((example) => ({
    dimensionType: dimension.dimensionType,
    originalExcerpt: example,
    analysisNote: `${corpusDimensionLabels[dimension.dimensionType]} \u793a\u4f8b`,
    usageRule: parseJsonArray(dimension.rulesJson)[0] ?? ""
  })));
  return {
    projectId,
    profileName: `\u6587\u98ce\u6307\u7eb9 ${new Date().toLocaleString()}`,
    sourceType,
    sourceChapterIds: chapters.map((chapter) => chapter.id),
    analysisMode,
    summary: profile.profile_summary,
    dimensions,
    examples
  };
}

function buildStylePackage(profileState: CorpusStyleProfileState): StylePackage {
  const dimensions: StylePackageDimension[] = profileState.dimensions.map((dimension) => {
    const examples = profileState.examples
      .filter((example) => example.dimensionType === dimension.dimensionType)
      .slice(0, 5)
      .map((example) => ({
        original_excerpt: truncateForExport(example.originalExcerpt, 200),
        analysis_note: example.analysisNote,
        usage_rule: example.usageRule
      }));
    return {
      dimension_type: dimension.dimensionType,
      summary: dimension.summary,
      rules: parseJsonArray(dimension.rulesJson),
      metrics: parseJsonObject(dimension.metricsJson),
      examples
    };
  });
  const allRules = uniqueStrings(dimensions.flatMap((dimension) => dimension.rules));
  const polishRules = dimensions.find((dimension) => dimension.dimension_type === "polish_rules")?.rules ?? [];
  return {
    schema_version: "1.0",
    app: "Novel Memory Engine",
    exported_at: new Date().toISOString(),
    export_type: "corpus_style_profile",
    source: {
      project_title: "",
      profile_name: profileState.profile.profileName,
      source_type: profileState.profile.sourceType,
      analysis_mode: profileState.profile.analysisMode
    },
    profile: {
      profile_name: profileState.profile.profileName,
      summary: profileState.profile.summary,
      created_at: profileState.profile.createdAt,
      updated_at: profileState.profile.updatedAt
    },
    dimensions,
    usage_for_ai: {
      prompt_summary: buildReusablePromptSummary(profileState.profile.summary, dimensions),
      must_keep: polishRules.filter((rule) => /\u4fdd\u7559|\u4fdd\u6301|\u5fc5\u987b|\u4e0d\u8981\u6539\u53d8/.test(rule)).slice(0, 10),
      should_avoid: polishRules.filter((rule) => /\u907f\u514d|\u4e0d\u8981|\u5c11\u7528|\u7981\u6b62/.test(rule)).slice(0, 10),
      recommended_polish_rules: allRules.slice(0, 16)
    }
  };
}

function parseStylePackage(raw: string): StylePackage | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<StylePackage>;
    if (parsed.schema_version !== "1.0") return undefined;
    if (parsed.export_type !== "corpus_style_profile") return undefined;
    if (!parsed.profile?.profile_name || !Array.isArray(parsed.dimensions)) return undefined;
    return {
      schema_version: "1.0",
      app: "Novel Memory Engine",
      exported_at: String(parsed.exported_at || new Date().toISOString()),
      export_type: "corpus_style_profile",
      source: {
        project_title: String(parsed.source?.project_title || ""),
        profile_name: String(parsed.source?.profile_name || parsed.profile.profile_name),
        source_type: String(parsed.source?.source_type || "manual_selection"),
        analysis_mode: String(parsed.source?.analysis_mode || "simple")
      },
      profile: {
        profile_name: String(parsed.profile.profile_name),
        summary: String(parsed.profile.summary || ""),
        created_at: String(parsed.profile.created_at || ""),
        updated_at: String(parsed.profile.updated_at || "")
      },
      dimensions: parsed.dimensions.map(normalizePackageDimension).filter(Boolean) as StylePackageDimension[],
      usage_for_ai: {
        prompt_summary: String(parsed.usage_for_ai?.prompt_summary || ""),
        must_keep: normalizeStringArray(parsed.usage_for_ai?.must_keep),
        should_avoid: normalizeStringArray(parsed.usage_for_ai?.should_avoid),
        recommended_polish_rules: normalizeStringArray(parsed.usage_for_ai?.recommended_polish_rules)
      }
    };
  } catch {
    return undefined;
  }
}

function normalizePackageDimension(value: unknown): StylePackageDimension | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const dimension = String(input.dimension_type || "") as CorpusStyleDimensionType;
  if (!corpusDimensionOrder.includes(dimension)) return undefined;
  const examples = Array.isArray(input.examples)
    ? input.examples.map((item) => {
        const example = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          original_excerpt: truncateForExport(String(example.original_excerpt || ""), 200),
          analysis_note: String(example.analysis_note || ""),
          usage_rule: String(example.usage_rule || "")
        };
      })
    : [];
  return {
    dimension_type: dimension,
    summary: String(input.summary || ""),
    rules: normalizeStringArray(input.rules),
    metrics: input.metrics && typeof input.metrics === "object" && !Array.isArray(input.metrics) ? input.metrics as Record<string, unknown> : {},
    examples
  };
}

function packageDimensionToSaveInput(dimension: StylePackageDimension): SaveCorpusStyleDimensionInput {
  return {
    dimensionType: dimension.dimension_type,
    summary: dimension.summary,
    rulesJson: JSON.stringify(uniqueStrings(dimension.rules)),
    metricsJson: JSON.stringify(dimension.metrics || {}),
    examplesJson: JSON.stringify(dimension.examples.map((example) => example.original_excerpt).filter(Boolean))
  };
}

function packageDimensionToExamples(dimension: StylePackageDimension): SaveCorpusStyleExampleInput[] {
  return dimension.examples.slice(0, 12).map((example) => ({
    dimensionType: dimension.dimension_type,
    originalExcerpt: truncateForExport(example.original_excerpt, 200),
    analysisNote: example.analysis_note,
    usageRule: example.usage_rule
  }));
}

function renderStyleMarkdown(packageData: StylePackage) {
  const lines = [
    "# \u6587\u98ce\u6307\u7eb9\u62a5\u544a",
    "",
    "## \u57fa\u672c\u4fe1\u606f",
    "",
    "\u4f5c\u54c1\uff1a" + packageData.source.project_title,
    "Profile\uff1a" + packageData.profile.profile_name,
    "\u5206\u6790\u8303\u56f4\uff1a" + packageData.source.source_type,
    "\u5206\u6790\u6a21\u5f0f\uff1a" + packageData.source.analysis_mode,
    "\u5bfc\u51fa\u65f6\u95f4\uff1a" + packageData.exported_at,
    "",
    "## \u603b\u4f53\u98ce\u683c\u6982\u8ff0",
    "",
    packageData.profile.summary || packageData.usage_for_ai.prompt_summary || "\u6682\u65e0\u6982\u8ff0\u3002",
    ""
  ];
  for (const dimension of packageData.dimensions) {
    lines.push("## " + corpusDimensionLabels[dimension.dimension_type], "", "### \u98ce\u683c\u6458\u8981", "", dimension.summary || "\u6682\u65e0\u6458\u8981", "", "### \u6da6\u8272\u89c4\u5219", "");
    if (dimension.rules.length === 0) lines.push("- \u6682\u65e0\u89c4\u5219");
    else dimension.rules.forEach((rule) => lines.push("- " + rule));
    if (dimension.examples.length > 0) {
      lines.push("", "### \u793a\u4f8b\u7247\u6bb5", "");
      dimension.examples.forEach((example) => {
        lines.push("> " + example.original_excerpt.replace(/\n/g, "\n> "), "", example.usage_rule ? "\u7528\u6cd5\uff1a" + example.usage_rule : "", "");
      });
    }
  }
  lines.push("## \u53ef\u76f4\u63a5\u7528\u4e8e AI \u6da6\u8272\u7684\u63d0\u793a\u8bcd", "", buildReusablePrompt(packageData));
  return lines.filter((line, index, array) => !(line === "" && array[index - 1] === "")).join("\n");
}

function buildReusablePrompt(packageData: StylePackage) {
  const dimensionRules = packageData.dimensions
    .filter((dimension) => dimension.rules.length > 0)
    .map((dimension) => corpusDimensionLabels[dimension.dimension_type] + "\u89c4\u5219\uff1a\n" + dimension.rules.slice(0, 5).map((rule) => "- " + rule).join("\n"))
    .join("\n\n");
  return [
    "\u8bf7\u53c2\u8003\u4ee5\u4e0b\u6587\u98ce\u6307\u7eb9\u8fdb\u884c\u6da6\u8272\uff0c\u4e0d\u8981\u6539\u53d8\u539f\u6587\u5267\u60c5\u548c\u4eba\u7269\u5173\u7cfb\u3002",
    "",
    "\u98ce\u683c\u6982\u8ff0\uff1a" + packageData.profile.summary,
    "",
    dimensionRules,
    "",
    "\u5fc5\u987b\u4fdd\u7559\uff1a",
    ...(packageData.usage_for_ai.must_keep.length ? packageData.usage_for_ai.must_keep.map((item) => "- " + item) : ["- \u4fdd\u7559\u539f\u6587\u6838\u5fc3\u5bf9\u767d\u3001\u559c\u5267\u8282\u594f\u548c\u4eba\u7269\u5173\u7cfb\u3002"]),
    "",
    "\u9700\u8981\u907f\u514d\uff1a",
    ...(packageData.usage_for_ai.should_avoid.length ? packageData.usage_for_ai.should_avoid.map((item) => "- " + item) : ["- \u4e0d\u8981\u5199\u6210\u901a\u7528 AI \u4f5c\u6587\u8154\uff0c\u4e0d\u8981\u64c5\u81ea\u7eed\u5199\u3002"]),
    "",
    "\u8bf7\u8f93\u51fa\u6da6\u8272\u540e\u7684\u6b63\u6587\uff0c\u4e0d\u8981\u8f93\u51fa\u89e3\u91ca\u3002"
  ].join("\n");
}

function buildReusablePromptSummary(summary: string, dimensions: StylePackageDimension[]) {
  const topRules = dimensions.flatMap((dimension) => dimension.rules.slice(0, 2)).slice(0, 12);
  return [summary, topRules.map((rule) => `- ${rule}`).join("\n")].filter(Boolean).join("\n");
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function parseJsonObject(value: string | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function truncateForExport(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "novel-style-profile";
}

function ExampleList({ examples }: { examples: Array<{ originalExcerpt: string; analysisNote: string; usageRule: string }> }) {
  if (examples.length === 0) return <p>{"\u6682\u65e0\u793a\u4f8b\u3002"}</p>;
  return (
    <div className="corpus-example-list">
      {examples.map((example, index) => (
        <article key={`${example.originalExcerpt}-${index}`}>
          <blockquote>{example.originalExcerpt}</blockquote>
          <p>{example.analysisNote}</p>
          <small>{example.usageRule}</small>
        </article>
      ))}
    </div>
  );
}

function parseJsonArray(value: string | undefined) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
