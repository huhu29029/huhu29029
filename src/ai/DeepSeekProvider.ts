import type { AISettings } from "../types/domain";
import type { ChatResult, LLMProvider, Message } from "./types";

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
      reasoningContent?: string;
    };
  }>;
  error?: { message?: string };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export class DeepSeekProvider implements LLMProvider {
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
    if (!this.settings.apiKey.trim()) {
      throw new Error("请先配置 DeepSeek API Key");
    }

    const baseUrl = this.settings.baseUrl.replace(/\/+$/, "");
    const body: Record<string, unknown> = {
      model: this.settings.model,
      messages,
      temperature: 0.2
    };

    if (this.supportsThinkingMode(this.settings.model)) {
      body.thinking = { type: this.settings.thinkingEnabled ? "enabled" : "disabled" };
      if (this.settings.thinkingEnabled) {
        body.reasoning_effort = this.settings.reasoningEffort ?? "high";
      }
    }

    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.settings.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = (await response.json().catch(() => ({}))) as DeepSeekResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `DeepSeek 请求失败：${response.status}`);
    }

    const message = payload.choices?.[0]?.message;
    const content = message?.content;
    if (!content) {
      throw new Error("DeepSeek 返回内容为空");
    }

    return {
      content,
      reasoningContent: message?.reasoning_content ?? message?.reasoningContent,
      usage: {
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
        totalTokens: payload.usage?.total_tokens ?? 0
      }
    };
  }

  private supportsThinkingMode(model: string) {
    return model === "deepseek-v4-flash" || model === "deepseek-v4-pro";
  }
}
