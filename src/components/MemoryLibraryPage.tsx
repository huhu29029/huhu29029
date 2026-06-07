import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MockProvider } from "../ai/MockProvider";
import { createLLMProvider } from "../ai/providerFactory";
import {
  clearAIPatternMemory,
  clearOutlineMemory,
  clearWritingStyleMemory,
  createAITask,
  deleteAIPatternMemory,
  finishAITask,
  getAISettings,
  getMemoryLibraryStats,
  listAIPatternMemory,
  logAIUsage,
  readPromptFile,
  resetBuiltinAIPatterns,
  saveAIPatternMemory,
  setAIPatternActive
} from "../tauriApi";
import { aiPatternTypeLabel } from "../data/aiPatternTypeLabels";
import type { AIPatternMemory, MemoryLibraryStats, Project, SaveAIPatternMemoryInput } from "../types/domain";

type MemoryLibraryPageProps = {
  project: Project;
  onOutlineCleared: () => void;
};

type PatternForm = {
  id?: string;
  patternName: string;
  patternType: string;
  keywords: string;
  description: string;
  badExamples: string;
  rewriteAdvice: string;
  severity: "low" | "medium" | "high";
  isActive: boolean;
};

const emptyForm: PatternForm = {
  patternName: "",
  patternType: "custom",
  keywords: "",
  description: "",
  badExamples: "",
  rewriteAdvice: "",
  severity: "medium",
  isActive: true
};

const patternTypeOptions = [
  "custom",
  "ai_taste",
  "structure_template",
  "wording_template",
  "dialogue_template",
  "object_description_template",
  "metaphor_overuse",
  "repeated_emphasis",
  "repeated_emphasis_template",
  "light_action_template",
  "ending_overextension",
  "negation_pattern",
  "blunt_explanation_template",
  "body_language",
  "description_specificity",
  "dialogue_interaction",
  "scene_camera",
  "ai_wording_template"
];

export function MemoryLibraryPage({ project, onOutlineCleared }: MemoryLibraryPageProps) {
  const [stats, setStats] = useState<MemoryLibraryStats>();
  const [patterns, setPatterns] = useState<AIPatternMemory[]>([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [form, setForm] = useState<PatternForm>(emptyForm);
  const [summary, setSummary] = useState("");
  const [summaryReasoning, setSummaryReasoning] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const refresh = async () => {
    const [nextStats, nextPatterns] = await Promise.all([
      getMemoryLibraryStats(project.id),
      listAIPatternMemory(project.id)
    ]);
    setStats(nextStats);
    setPatterns(nextPatterns);
  };

  useEffect(() => {
    void refresh().catch((error) => window.alert(`读取记忆库失败：${String(error)}`));
  }, [project.id]);

  const filteredPatterns = useMemo(
    () =>
      patterns.filter(
        (pattern) =>
          (typeFilter === "all" || pattern.patternType === typeFilter) &&
          (severityFilter === "all" || pattern.severity === severityFilter)
      ),
    [patterns, severityFilter, typeFilter]
  );
  const patternTypes = Array.from(new Set(patterns.map((pattern) => pattern.patternType))).sort();

  const clearOutline = async () => {
    if (
      !window.confirm(
        "确定清空当前书籍的大纲记忆库吗？这会清空世界观、主角团、配角、主线剧情、支线剧情、矛盾冲突、思维导图等大纲相关信息，但不会删除正文和章节。"
      )
    ) {
      return;
    }
    await clearOutlineMemory(project.id);
    onOutlineCleared();
    await refresh();
  };

  const clearStyle = async () => {
    if (!window.confirm("确定清空当前书籍的文字风格库吗？这会删除已学习的语言风格 Profile，但不会删除正文。")) {
      return;
    }
    await clearWritingStyleMemory(project.id);
    await refresh();
  };

  const clearPatterns = async () => {
    if (!window.confirm("确定清空当前书籍的 AI 模式库吗？默认只清空用户/AI 学习规则，保留内置规则。")) {
      return;
    }
    await clearAIPatternMemory(project.id, false);
    await refresh();
  };

  const resetBuiltins = async () => {
    await resetBuiltinAIPatterns(project.id);
    await refresh();
  };

  const savePattern = async () => {
    const input: SaveAIPatternMemoryInput = {
      id: form.id,
      projectId: project.id,
      patternType: form.patternType,
      patternName: form.patternName,
      patternKeywords: splitLines(form.keywords),
      patternDescription: form.description,
      badExamples: splitLines(form.badExamples),
      rewriteAdvice: form.rewriteAdvice,
      severity: form.severity,
      source: "user",
      isActive: form.isActive
    };
    await saveAIPatternMemory(input);
    setForm(emptyForm);
    await refresh();
  };

  const removePattern = async (pattern: AIPatternMemory) => {
    if (pattern.source === "builtin") return;
    if (!window.confirm(`确定删除规则“${pattern.patternName}”吗？`)) return;
    await deleteAIPatternMemory(pattern.id);
    await refresh();
  };

  const summarizePatterns = async () => {
    setIsBusy(true);
    let taskId: string | undefined;
    try {
      const settings = await getAISettings();
      const providerSettings = {
        ...settings,
        model: settings.featurePatternMemoryModel ?? "deepseek-v4-pro",
        thinkingEnabled: true
      };
      const provider =
        settings.apiKey.trim() || settings.openaiApiKey?.trim()
          ? createLLMProvider(providerSettings, settings.reviewProvider ?? "deepseek")
          : new MockProvider();
      const prompt = (await readPromptFile("summarize_ai_pattern_memory.md")).replace(
        "{{patterns}}",
        JSON.stringify(patterns.filter((pattern) => pattern.isActive), null, 2)
      );
      const task = await createAITask(project.id, "summarize_ai_pattern_memory", prompt);
      taskId = task.id;
      const result = await provider.chatJson([
        { role: "system", content: "你是 AI 写作模式记忆库整理助手。你必须返回合法 JSON。" },
        { role: "user", content: prompt }
      ]);
      await logAIUsage({
        projectId: project.id,
        featureName: "summarize_ai_pattern_memory",
        provider: settings.reviewProvider ?? settings.provider,
        model: settings.reviewProvider === "openai" ? settings.reviewModel ?? settings.openaiModel ?? settings.model : settings.featurePatternMemoryModel ?? settings.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        estimatedCost: 0
      });
      await finishAITask(task.id, "success", result.content);
      setSummary(result.content);
      setSummaryReasoning(settings.showReasoningContent ? result.reasoningContent ?? "" : "");
    } catch (error) {
      if (taskId) await finishAITask(taskId, "failed", String(error)).catch(console.error);
      window.alert(`总结 AI 模式库失败：${String(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="memory-library-page">
      <header className="outline-topbar">
        <div>
          <h2>Novel Memory Library</h2>
          <p>管理当前书籍的大纲记忆、文字风格记忆、AI 模式记忆和风格参考库。</p>
        </div>
      </header>

      <div className="memory-grid">
        <MemoryCard title="Outline Memory" description="大纲文字分页、思维导图、章节摘要和早期结构化表。">
          <StatLine label="大纲分页" value={stats?.outlineTextSections} />
          <StatLine label="导图节点 / 关系" value={`${stats?.outlineMindNodes ?? 0} / ${stats?.outlineMindEdges ?? 0}`} />
          <StatLine label="章节摘要" value={stats?.chapterSummaries} />
          <StatLine
            label="预留结构表"
            value={(stats?.globalOutlines ?? 0) + (stats?.characters ?? 0) + (stats?.plotThreads ?? 0) + (stats?.foreshadowing ?? 0) + (stats?.consistencyIssues ?? 0)}
          />
          <button className="danger" onClick={() => void clearOutline()} type="button">清空大纲记忆库</button>
        </MemoryCard>

        <MemoryCard title="Writing Style Memory" description="从正文学习出的语言风格 Profile。">
          <StatLine label="风格 Profile" value={stats?.writingStyleProfiles} />
          <button className="danger" onClick={() => void clearStyle()} type="button">清空文字风格库</button>
        </MemoryCard>

        <MemoryCard title="Style Reference Corpus" description="内置/参考文学语料，不等同于当前小说记忆。">
          <StatLine label="分类 / 作品 / 句子" value={`${stats?.styleCorpusCategories ?? 0} / ${stats?.styleCorpusWorks ?? 0} / ${stats?.styleCorpusQuotes ?? 0}`} />
          <p>Style Reference Corpus 保留为参考素材库，不参与清空当前书籍记忆。</p>
        </MemoryCard>

        <MemoryCard title="Logs & Cache" description="这些数据不属于记忆库主体。">
          <p>chapter_ai_cache 是性能缓存，ai_usage_logs 和 ai_tasks 是日志，不会被记忆库清空功能删除。</p>
        </MemoryCard>
      </div>

      <section className="memory-panel">
        <header>
          <div>
            <h3>AI Pattern Memory</h3>
            <p>保存 AI 润色/互检中发现的 AI 味模式和规避规则，后续润色会自动读取启用规则。</p>
          </div>
          <div className="memory-actions">
            <button onClick={() => void summarizePatterns()} disabled={isBusy} type="button">{isBusy ? "总结中..." : "总结 AI 模式库"}</button>
            <button onClick={() => void resetBuiltins()} type="button">重置内置规则</button>
            <button className="danger" onClick={() => void clearPatterns()} type="button">清空 AI 模式库</button>
          </div>
        </header>

        <div className="memory-filters">
          <label>类型<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">{aiPatternTypeLabel("all")}</option>{patternTypes.map((type) => <option key={type} value={type}>{aiPatternTypeLabel(type)}</option>)}</select></label>
          <label>严重度<select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}><option value="all">全部</option><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select></label>
        </div>

        <div className="pattern-list">
          {filteredPatterns.map((pattern) => (
            <article key={pattern.id}>
              <header>
                <strong>{displayPatternName(pattern)}</strong>
                <span>{aiPatternTypeLabel(pattern.patternType)} · {pattern.severity} · {pattern.source} · 命中 {pattern.hitCount}</span>
              </header>
              <p>{displayPatternAdvice(pattern)}</p>
              <small>{displayPatternKeywords(pattern).join(" / ")}</small>
              <footer>
                <label><input checked={pattern.isActive} onChange={(event) => void setAIPatternActive(pattern.id, event.target.checked).then(refresh)} type="checkbox" />启用</label>
                {pattern.source !== "builtin" && <button onClick={() => setForm(patternToForm(pattern))} type="button">编辑</button>}
                {pattern.source !== "builtin" && <button className="danger ghost" onClick={() => void removePattern(pattern)} type="button">删除</button>}
              </footer>
            </article>
          ))}
        </div>

        <div className="pattern-form">
          <h3>{form.id ? "编辑用户规则" : "新增用户规则"}</h3>
          <input value={form.patternName} onChange={(event) => setForm({ ...form, patternName: event.target.value })} placeholder="规则名称" />
          <select value={form.patternType} onChange={(event) => setForm({ ...form, patternType: event.target.value })}>
            {patternTypeOptions.map((type) => <option key={type} value={type}>{aiPatternTypeLabel(type)}</option>)}
          </select>
          <select value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value as PatternForm["severity"] })}>
            <option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
          </select>
          <textarea value={form.keywords} onChange={(event) => setForm({ ...form, keywords: event.target.value })} placeholder="关键词，每行一个" />
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="规则说明" />
          <textarea value={form.badExamples} onChange={(event) => setForm({ ...form, badExamples: event.target.value })} placeholder="坏例子，每行一个" />
          <textarea value={form.rewriteAdvice} onChange={(event) => setForm({ ...form, rewriteAdvice: event.target.value })} placeholder="改写建议" />
          <div className="pattern-form-actions">
            <button disabled={!form.patternName.trim()} onClick={() => void savePattern()} type="button">保存规则</button>
            {form.id && <button className="ghost" onClick={() => setForm(emptyForm)} type="button">取消编辑</button>}
          </div>
        </div>

        {summaryReasoning && (
          <details className="reasoning-panel">
            <summary>模型思考过程</summary>
            <pre>{summaryReasoning}</pre>
          </details>
        )}
        {summary && <pre className="ai-preview-json">{summary}</pre>}
      </section>
    </section>
  );
}

function MemoryCard({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return <section className="memory-card"><h3>{title}</h3><p>{description}</p>{children}</section>;
}

function StatLine({ label, value }: { label: string; value?: number | string }) {
  return <div className="memory-stat"><span>{label}</span><strong>{value ?? 0}</strong></div>;
}

function splitLines(value: string) {
  return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

function safeJsonList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function isCorruptQuestionText(value: string) {
  const compact = value.replace(/\s/g, "");
  if (!compact) return true;
  const questionCount = (compact.match(/\?/g) ?? []).length;
  return questionCount >= 4 && questionCount / compact.length > 0.5;
}

function displayPatternAdvice(pattern: AIPatternMemory) {
  const value = pattern.rewriteAdvice || pattern.patternDescription;
  if (!isCorruptQuestionText(value)) return value;
  return builtinPatternFallback(pattern.patternType).advice;
}

function displayPatternName(pattern: AIPatternMemory) {
  if (!isCorruptQuestionText(pattern.patternName)) return pattern.patternName;
  return builtinPatternFallback(pattern.patternType).name;
}

function displayPatternKeywords(pattern: AIPatternMemory) {
  const values = safeJsonList(pattern.patternKeywords);
  if (values.length > 0 && !values.every(isCorruptQuestionText)) return values;
  return builtinPatternFallback(pattern.patternType).keywords;
}

function builtinPatternFallback(patternType: string) {
  const fallbacks: Record<string, { name: string; advice: string; keywords: string[] }> = {
    negation_pattern: {
      name: "先否定再肯定",
      advice: "只保留真正有梗的少数“不是……而是……”句式，其余改成具体动作、场景或人物反应。",
      keywords: ["不是", "并非", "而是"]
    },
    repeated_emphasis: {
      name: "重复短句强调",
      advice: "避免重复短句强调和机械短句断言，改用人物动作、反应、停顿、视线、现场细节或吐槽节奏表达。",
      keywords: ["又是", "太", "非常", "重点班。又是重点班"]
    },
    blunt_explanation_template: {
      name: "断句式解释",
      advice: "避免“不是形容。是真的……”这类断句式解释，改用人物反应、动作停顿、视觉变化或对话节奏体现。",
      keywords: ["不是形容", "不是比喻", "是真的"]
    },
    body_language: {
      name: "通用人物动作",
      advice: "人物动作要符合性格、身份、关系和当前情绪，不要全员共用通用动作模板。",
      keywords: ["看了一眼", "看了几秒", "低头看手"]
    },
    dialogue_template: {
      name: "说明书式对话",
      advice: "不要让对话变成说明书式问答，用打断、误解、停顿、反应、玩笑或试探带出设定。",
      keywords: ["也就是说", "等级分为", "原来如此"]
    },
    light_action_template: {
      name: "轻动作模板",
      advice: "避免“把声音压得很轻”这类模板表达，改用具体动作、尾音、距离或人物反应体现轻微程度。",
      keywords: ["把声音压得很轻", "把语气放得很轻"]
    },
    object_description_template: {
      name: "物品描写模板",
      advice: "避免重复罗列物品外观，让物品通过人物反应、使用方式、触感、重量、功能或剧情作用进入文本。",
      keywords: ["外壳", "法阵", "导管", "液体", "机械臂"]
    },
    metaphor_overuse: {
      name: "过度比喻",
      advice: "尽量少用比喻，多用白描、动作、环境细节和人物反应。",
      keywords: ["像", "仿佛", "好似"]
    },
    ending_overextension: {
      name: "结尾擅自扩写",
      advice: "不要擅自扩写、总结、升华或预告故事末尾发展，只润色用户提供的文本。",
      keywords: ["命运", "这只是开始", "这意味着"]
    },
    wording_template: {
      name: "抽象用词",
      advice: "少用确定性形容词和抽象词，多用具体动作、五官、他人反应、物品细节和场景变化表现。",
      keywords: ["很漂亮", "很压抑", "某种"]
    }
  };
  return fallbacks[patternType] ?? { name: "规则内容异常", advice: "该规则内容疑似编码损坏，请重置内置规则或编辑后保存。", keywords: [] };
}

function patternToForm(pattern: AIPatternMemory): PatternForm {
  return {
    id: pattern.id,
    patternName: pattern.patternName,
    patternType: pattern.patternType,
    keywords: safeJsonList(pattern.patternKeywords).join("\n"),
    description: pattern.patternDescription,
    badExamples: safeJsonList(pattern.badExamples).join("\n"),
    rewriteAdvice: pattern.rewriteAdvice,
    severity: pattern.severity,
    isActive: pattern.isActive
  };
}
