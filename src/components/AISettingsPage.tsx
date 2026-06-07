import { useEffect, useState } from "react";
import { createLLMProvider } from "../ai/providerFactory";
import { getAISettings, saveAISettings } from "../tauriApi";
import type { AIProviderStrategy, AISettings } from "../types/domain";

type ConnectionStatus = "untested" | "testing" | "success" | "failed";

const defaultSettings: AISettings = {
  provider: "DeepSeek",
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  thinkingEnabled: false,
  reasoningEffort: "high",
  showReasoningContent: false,
  openaiApiKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiModel: "gpt-5.5",
  enableHybridAI: false,
  primaryProvider: "deepseek",
  reviewProvider: "openai",
  primaryModel: "deepseek-v4-flash",
  reviewModel: "gpt-5.5",
  enableCrossReview: true,
  maxRevisionRounds: 1,
  featureChapterSummary: "deepseek",
  featureOutlineChunkAnalysis: "deepseek",
  featureOutlineReduceMerge: "deepseek",
  featureOutlineFinalMerge: "deepseek",
  featureMindmapGeneration: "deepseek",
  featureWritingStyleAnalysis: "openai",
  featureChapterPolish: "hybrid",
  defaultAnalysisMode: "simple",
  simpleChunkSize: 5,
  detailedChunkSize: 3,
  analysisConcurrency: 2,
  enableChapterCache: true,
  featureOutlineChunkModel: "deepseek-v4-flash",
  featureOutlineFinalModel: "deepseek-v4-pro",
  featureReviewModel: "deepseek-v4-pro",
  featurePatternMemoryModel: "deepseek-v4-pro",
  featurePolishModel: "deepseek-v4-flash"
};

const strategyOptions: Array<{ label: string; value: AIProviderStrategy }> = [
  { label: "DeepSeek", value: "deepseek" },
  { label: "OpenAI", value: "openai" },
  { label: "混合 AI", value: "hybrid" }
];

const deepSeekModelOptions = [
  { label: "deepseek-v4-flash", value: "deepseek-v4-flash" },
  { label: "deepseek-v4-pro", value: "deepseek-v4-pro" },
  { label: "deepseek-chat（旧兼容：非思考）", value: "deepseek-chat" },
  { label: "deepseek-reasoner（旧兼容：思考）", value: "deepseek-reasoner" }
];

export function AISettingsPage() {
  const [settings, setSettings] = useState<AISettings>(defaultSettings);
  const [deepSeekStatus, setDeepSeekStatus] = useState<ConnectionStatus>("untested");
  const [openAIStatus, setOpenAIStatus] = useState<ConnectionStatus>("untested");
  const [message, setMessage] = useState("未测试");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getAISettings()
      .then((saved) => setSettings({ ...defaultSettings, ...saved }))
      .catch((error) => {
        console.error(error);
        setMessage(String(error));
        setDeepSeekStatus("failed");
      });
  }, []);

  const patch = (next: Partial<AISettings>) => setSettings((current) => ({ ...current, ...next }));

  const testConnection = async (providerName: "deepseek" | "openai") => {
    if (providerName === "openai") setOpenAIStatus("testing");
    else setDeepSeekStatus("testing");
    setMessage("测试中...");
    try {
      const provider = createLLMProvider(settings, providerName);
      const content = providerName === "openai" ? "你好，请回复 OpenAI 连接成功。" : "你好，请回复 DeepSeek 连接成功。";
      await provider.chatText([{ role: "user", content }]);
      if (providerName === "openai") {
        setOpenAIStatus("success");
        setMessage("✓ OpenAI 连接成功");
      } else {
        setDeepSeekStatus("success");
        setMessage("✓ DeepSeek 连接成功");
      }
    } catch (error) {
      if (providerName === "openai") setOpenAIStatus("failed");
      else setDeepSeekStatus("failed");
      setMessage(`连接失败：${String(error)}`);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const saved = await saveAISettings(settings);
      setSettings({ ...defaultSettings, ...saved });
      setMessage("配置已保存");
      setDeepSeekStatus("untested");
      setOpenAIStatus("untested");
    } catch (error) {
      setMessage(`保存失败：${String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const sameProviderWarning = settings.enableHybridAI && settings.primaryProvider === settings.reviewProvider;
  const showCostWarning = settings.model === "deepseek-v4-pro" || settings.reasoningEffort === "max";

  return (
    <section className="ai-settings-page">
      <header className="outline-topbar">
        <div>
          <h2>AI 设置</h2>
          <p>本地保存 DeepSeek、OpenAI、思考模式和功能级模型策略。</p>
        </div>
      </header>

      <div className="ai-settings-card">
        <h3>DeepSeek 配置</h3>
        <label>
          API Key
          <input autoComplete="off" type="password" value={settings.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} />
        </label>
        <label>
          Base URL
          <input value={settings.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} />
        </label>
        <ModelSelect label="Model" value={settings.model} onChange={(model) => patch({ model })} />
        <label className="inline-setting">
          <input checked={settings.thinkingEnabled ?? false} onChange={(event) => patch({ thinkingEnabled: event.target.checked })} type="checkbox" />
          开启思考模式
        </label>
        <label>
          Reasoning Effort
          <select value={settings.reasoningEffort ?? "high"} onChange={(event) => patch({ reasoningEffort: event.target.value as "high" | "max" })}>
            <option value="high">high</option>
            <option value="max">max</option>
          </select>
        </label>
        <label className="inline-setting">
          <input checked={settings.showReasoningContent ?? false} onChange={(event) => patch({ showReasoningContent: event.target.checked })} type="checkbox" />
          显示模型思考过程
        </label>
        {showCostWarning && <p className="parse-limit-note">该模式会增加输出 token 和成本，适合最终整合、复杂分析和高质量互检。</p>}
        <button className="ghost" disabled={deepSeekStatus === "testing"} onClick={() => void testConnection("deepseek")} type="button">
          测试 DeepSeek 连接
        </button>
      </div>

      <div className="ai-settings-card">
        <h3>OpenAI 配置</h3>
        <label>
          API Key
          <input autoComplete="off" type="password" value={settings.openaiApiKey ?? ""} onChange={(event) => patch({ openaiApiKey: event.target.value })} />
        </label>
        <label>
          Base URL
          <input value={settings.openaiBaseUrl ?? "https://api.openai.com/v1"} onChange={(event) => patch({ openaiBaseUrl: event.target.value })} />
        </label>
        <label>
          Model
          <input value={settings.openaiModel ?? "gpt-5.5"} onChange={(event) => patch({ openaiModel: event.target.value })} />
        </label>
        <button className="ghost" disabled={openAIStatus === "testing"} onClick={() => void testConnection("openai")} type="button">
          测试 OpenAI 连接
        </button>
      </div>

      <div className="ai-settings-card">
        <h3>混合 AI 策略</h3>
        <label className="inline-setting">
          <input checked={settings.enableHybridAI ?? false} onChange={(event) => patch({ enableHybridAI: event.target.checked })} type="checkbox" />
          启用混合 AI
        </label>
        <label>
          主生成模型
          <select value={settings.primaryProvider ?? "deepseek"} onChange={(event) => patch({ primaryProvider: event.target.value as "deepseek" | "openai" })}>
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <label>
          审查模型
          <select value={settings.reviewProvider ?? "openai"} onChange={(event) => patch({ reviewProvider: event.target.value as "deepseek" | "openai" })}>
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <label>
          主生成模型名称
          <input value={settings.primaryModel ?? "deepseek-v4-flash"} onChange={(event) => patch({ primaryModel: event.target.value })} />
        </label>
        <label>
          审查模型名称
          <input value={settings.reviewModel ?? "gpt-5.5"} onChange={(event) => patch({ reviewModel: event.target.value })} />
        </label>
        <label className="inline-setting">
          <input checked={settings.enableCrossReview ?? true} onChange={(event) => patch({ enableCrossReview: event.target.checked })} type="checkbox" />
          启用 AI 互检
        </label>
        <label>
          最大互检轮数
          <select value={settings.maxRevisionRounds ?? 1} onChange={(event) => patch({ maxRevisionRounds: Number(event.target.value) })}>
            <option value={0}>0</option>
            <option value={1}>1</option>
          </select>
        </label>
        {sameProviderWarning && <p className="error-text">主模型和审查模型相同，互检效果可能有限。</p>}
      </div>

      <div className="ai-settings-card">
        <h3>功能模型策略</h3>
        <StrategySelect label="章节摘要" value={settings.featureChapterSummary ?? "deepseek"} onChange={(value) => patch({ featureChapterSummary: value })} />
        <StrategySelect label="大纲 Chunk 解析" value={settings.featureOutlineChunkAnalysis ?? "deepseek"} onChange={(value) => patch({ featureOutlineChunkAnalysis: value })} />
        <ModelSelect label="大纲 Chunk 解析模型" value={settings.featureOutlineChunkModel ?? "deepseek-v4-flash"} onChange={(value) => patch({ featureOutlineChunkModel: value })} />
        <StrategySelect label="分卷 / 阶段 Reduce 合并" value={settings.featureOutlineReduceMerge ?? "deepseek"} onChange={(value) => patch({ featureOutlineReduceMerge: value })} />
        <StrategySelect label="全书 Final Merge" value={settings.featureOutlineFinalMerge ?? "deepseek"} onChange={(value) => patch({ featureOutlineFinalMerge: value })} />
        <ModelSelect label="大纲 Final Merge 模型" value={settings.featureOutlineFinalModel ?? "deepseek-v4-pro"} onChange={(value) => patch({ featureOutlineFinalModel: value })} />
        <StrategySelect label="思维导图生成" value={settings.featureMindmapGeneration ?? "deepseek"} onChange={(value) => patch({ featureMindmapGeneration: value })} />
        <StrategySelect label="语言风格学习" value={settings.featureWritingStyleAnalysis ?? "openai"} onChange={(value) => patch({ featureWritingStyleAnalysis: value })} />
        <StrategySelect label="章节润色" value={settings.featureChapterPolish ?? "hybrid"} onChange={(value) => patch({ featureChapterPolish: value })} />
        <ModelSelect label="普通润色模型" value={settings.featurePolishModel ?? "deepseek-v4-flash"} onChange={(value) => patch({ featurePolishModel: value })} />
        <ModelSelect label="AI 互检模型" value={settings.featureReviewModel ?? "deepseek-v4-pro"} onChange={(value) => patch({ featureReviewModel: value })} />
        <ModelSelect label="AI 模式库总结模型" value={settings.featurePatternMemoryModel ?? "deepseek-v4-pro"} onChange={(value) => patch({ featurePatternMemoryModel: value })} />
        <p className="parse-limit-note">默认建议：Chunk 使用 deepseek-v4-flash；Final Merge、AI 互检和模式库总结使用 deepseek-v4-pro + 思考模式；普通润色使用 deepseek-v4-flash。</p>
      </div>

      <div className="ai-settings-card">
        <h3>解析性能</h3>
        <label>
          默认解析模式
          <select value={settings.defaultAnalysisMode ?? "simple"} onChange={(event) => patch({ defaultAnalysisMode: event.target.value as AISettings["defaultAnalysisMode"] })}>
            <option value="simple">简单解析</option>
            <option value="detailed">详细解析</option>
          </select>
        </label>
        <label>
          简单解析 chunk size
          <input min={1} max={10} type="number" value={settings.simpleChunkSize ?? 5} onChange={(event) => patch({ simpleChunkSize: Number(event.target.value) })} />
        </label>
        <label>
          详细解析 chunk size
          <input min={1} max={10} type="number" value={settings.detailedChunkSize ?? 3} onChange={(event) => patch({ detailedChunkSize: Number(event.target.value) })} />
        </label>
        <label>
          并发数
          <select value={settings.analysisConcurrency ?? 2} onChange={(event) => patch({ analysisConcurrency: Number(event.target.value) })}>
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="inline-setting">
          <input checked={settings.enableChapterCache ?? true} onChange={(event) => patch({ enableChapterCache: event.target.checked })} type="checkbox" />
          启用章节缓存
        </label>
      </div>

      <div className={`ai-connection-status ${deepSeekStatus === "failed" || openAIStatus === "failed" ? "failed" : deepSeekStatus === "success" || openAIStatus === "success" ? "success" : "untested"}`}>
        <strong>连接状态</strong>
        <span>{message}</span>
      </div>

      <footer className="ai-settings-footer">
        <button disabled={isSaving} onClick={saveSettings} type="button">
          保存配置
        </button>
      </footer>
    </section>
  );
}

function StrategySelect({ label, value, onChange }: { label: string; value: AIProviderStrategy; onChange: (value: AIProviderStrategy) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value as AIProviderStrategy)}>
        {strategyOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function ModelSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {deepSeekModelOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
