export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ChatResult = {
  content: string;
  reasoningContent?: string;
  usage: ChatUsage;
};

export interface LLMProvider {
  chatText(messages: Message[]): Promise<ChatResult>;
  chatJson(messages: Message[]): Promise<ChatResult>;
}
