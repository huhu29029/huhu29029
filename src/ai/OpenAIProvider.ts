import type { AISettings } from "../types/domain";
import type { ChatResult, LLMProvider, Message } from "./types";

type OpenAIResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string; type?: string; code?: string } | string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export class OpenAIProvider implements LLMProvider {
  constructor(private readonly settings: AISettings) {}

  chatText(messages: Message[]): Promise<ChatResult> {
    return this.request(messages, false);
  }

  chatJson(messages: Message[]): Promise<ChatResult> {
    const hasJsonInstruction = messages.some((message) => /json/i.test(message.content));
    if (!hasJsonInstruction) {
      throw new Error("JSON 模式请求必须在 messages 中明确包含 JSON 字样");
    }

    return this.request(messages, true);
  }

  private async request(messages: Message[], jsonMode: boolean): Promise<ChatResult> {
    const apiKey = this.settings.openaiApiKey?.trim();
    if (!apiKey) {
      throw new Error("请先在 AI 设置中配置 OpenAI API Key。");
    }

    const baseUrl = (this.settings.openaiBaseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    const body: Record<string, unknown> = {
      model: this.settings.openaiModel || "gpt-5.5",
      messages
    };

    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      throw new Error(`OpenAI 网络请求失败，请检查网络或 Base URL：${String(error)}`);
    }

    const payload = (await response.json().catch(() => ({}))) as OpenAIResponse;
    if (!response.ok) {
      throw new Error(formatOpenAIError(response.status, payload));
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI 返回内容为空");
    }

    return {
      content,
      usage: {
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
        totalTokens: payload.usage?.total_tokens ?? 0
      }
    };
  }
}

function formatOpenAIError(status: number, payload: OpenAIResponse) {
  const message = typeof payload.error === "string" ? payload.error : payload.error?.message;
  if (status === 401) return `OpenAI API Key 无效或认证失败：${message ?? "401 Unauthorized"}`;
  if (status === 429) return `OpenAI 请求过多或额度不足：${message ?? "429 Rate Limit"}`;
  return `OpenAI 请求失败（${status}）：${message ?? "Unknown error"}`;
}
